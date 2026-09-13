import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";

import { registerAnalyticsRoutes } from "./analytics.ts";
import { registerExpensesRoutes } from "./expenses.ts";
import { registerWebauthnRoutes } from "./webauthn.ts";
import { registerWhatsappPushRoutes } from "./whatsapp-push.ts";
import { registerTrainingRoutes } from "./training.ts";

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

registerAnalyticsRoutes(app);
registerExpensesRoutes(app);
registerWebauthnRoutes(app);
registerWhatsappPushRoutes(app);
registerTrainingRoutes(app);

Deno.serve(app.fetch);
