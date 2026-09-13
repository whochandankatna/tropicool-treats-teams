import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";

import { registerSquareClockRoutes } from "./square-clock.ts";
import { registerRosterManagerRoutes } from "./roster-manager.ts";
import { registerFinancialsRoutes } from "./financials.ts";
import { registerPayrollRoutes } from "./payroll-routes.ts";
import { registerSpotifyRoutes } from "./spotify.ts";
import { registerMicrosoftRoutes } from "./microsoft.ts";
import { registerReviewsRoutes } from "./reviews.ts";
import { registerGeofenceRoutes, clockInGeofenceResult } from "./geofence.ts";
import { registerClockoutRoutes } from "./clockout-reminders.ts";
import { requireManagerPin, supabaseAdmin } from "./shared.ts";

const app = new Hono();

app.use('*', logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "X-Client-Info"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// The older clock-in handler does not inspect coordinates. Enforce the gate
// before it reaches Square, including calls made outside this web interface.
app.use("/make-server-3ba8d4df/square/clock-in", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const body = await c.req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const { data: member, error } = await db.from("tt_team").select("is_manager").eq("id", body.teamId).maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!member) return c.json({ error: "Unknown team member" }, 404);
  if (!member.is_manager) {
    const blocked = await clockInGeofenceResult(db, body.lat, body.lng, body.accuracy);
    if (blocked) {
      if (!body.geofenceOverridePin) return c.json(blocked, 403);
      try { await requireManagerPin(db, body.geofenceOverridePin); }
      catch { return c.json({ error: "Manager PIN is incorrect" }, 401); }
    }
  }
  await next();
});

app.use("/make-server-3ba8d4df/square/push/subscribe", async (c, next) => {
  if (c.req.method !== "POST") return next();
  const { teamId, subscription, managerPin } = await c.req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const { data: member, error } = await db.from("tt_team").select("id, is_manager").eq("id", teamId).maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!member) return c.json({ error: "Unknown team member" }, 404);
  if (member.is_manager) {
    try {
      const verified = await requireManagerPin(db, managerPin);
      if (verified.id !== member.id) return c.json({ error: "Use your own manager PIN to enable manager notifications" }, 401);
    } catch { return c.json({ error: "Manager PIN is required for manager notifications" }, 401); }
  }
  await next();
  if (c.res.status < 300 && subscription?.endpoint) {
    const { error: updateError } = await db.from("tt_push_subscriptions").update({
      verified_manager: !!member.is_manager,
      manager_verified_at: member.is_manager ? new Date().toISOString() : null,
    }).eq("endpoint", subscription.endpoint).eq("team_id", teamId);
    if (updateError) console.error("push verification save failed", updateError);
  }
});

registerSquareClockRoutes(app);
registerGeofenceRoutes(app);
registerClockoutRoutes(app);
registerRosterManagerRoutes(app);
registerFinancialsRoutes(app);
registerPayrollRoutes(app);
registerSpotifyRoutes(app);
registerMicrosoftRoutes(app);
registerReviewsRoutes(app);

Deno.serve(app.fetch);
