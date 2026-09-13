import type { Hono } from "npm:hono";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from "npm:@simplewebauthn/server@13.3.2";
import { isoBase64URL, isoUint8Array } from "npm:@simplewebauthn/server@13.3.2/helpers";
import * as kv from "./kv_store.tsx";
import { supabaseAdmin, requireStaffPin } from "./shared.ts";

const PREFIX = "/make-server-3ba8d4df-2";

function webauthnContext(c: any) { const origin = c.req.header("origin") || ""; let rpID = "localhost"; try { rpID = new URL(origin).hostname; } catch { /* falls back to localhost */ } return { origin, rpID }; }
function webauthnErrorStatus(e: unknown) { return e instanceof Error && /pin/i.test(e.message) ? 401 : 500; }
const WEBAUTHN_CHALLENGE_TTL_MS = 3 * 60 * 1000;
async function stashChallenge(challenge: string) { const flowId = crypto.randomUUID(); await kv.set(`webauthn_challenge_${flowId}`, { challenge, createdAt: Date.now() }); return flowId; }
async function popChallenge(flowId: string | undefined | null): Promise<string> {
  if (!flowId) throw new Error("Missing flowId");
  const key = `webauthn_challenge_${flowId}`;
  const stored = await kv.get(key);
  await kv.del(key);
  if (!stored || Date.now() - stored.createdAt > WEBAUTHN_CHALLENGE_TTL_MS) throw new Error("This request has expired — please try again");
  return stored.challenge;
}

export function registerWebauthnRoutes(app: Hono) {
  app.post(`${PREFIX}/webauthn/register-options`, async (c) => {
    try {
      const { teamId, pin } = await c.req.json();
      const db = supabaseAdmin();
      const member = await requireStaffPin(db, Number(teamId), pin);
      const { data: existing, error } = await db.from("tt_webauthn_credentials").select("credential_id, transports").eq("team_id", member.id);
      if (error) throw new Error(error.message);
      const { rpID } = webauthnContext(c);
      const options = await generateRegistrationOptions({
        rpName: "Tropicool Treats", rpID, userID: isoUint8Array.fromUTF8String(String(member.id)), userName: member.name, userDisplayName: member.name, attestationType: "none",
        excludeCredentials: (existing ?? []).map((r: any) => ({ id: r.credential_id, transports: r.transports ?? undefined })),
        authenticatorSelection: { residentKey: "required", userVerification: "required", authenticatorAttachment: "platform" },
      });
      const flowId = await stashChallenge(options.challenge);
      return c.json({ flowId, options });
    } catch (e) { console.error("webauthn register-options failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, webauthnErrorStatus(e)); }
  });

  app.post(`${PREFIX}/webauthn/register-verify`, async (c) => {
    try {
      const { teamId, pin, flowId, response, deviceLabel } = await c.req.json();
      const db = supabaseAdmin();
      const member = await requireStaffPin(db, Number(teamId), pin);
      const expectedChallenge = await popChallenge(flowId);
      const { origin, rpID } = webauthnContext(c);
      const verification = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID });
      if (!verification.verified || !verification.registrationInfo) return c.json({ verified: false }, 400);
      const { credential } = verification.registrationInfo;
      const { error } = await db.from("tt_webauthn_credentials").insert({ team_id: member.id, credential_id: credential.id, public_key: isoBase64URL.fromBuffer(credential.publicKey), counter: credential.counter, device_label: (deviceLabel && String(deviceLabel).slice(0, 60)) || "This device", transports: credential.transports ?? null });
      if (error) throw new Error(error.message);
      return c.json({ verified: true });
    } catch (e) { console.error("webauthn register-verify failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, webauthnErrorStatus(e)); }
  });

  app.post(`${PREFIX}/webauthn/login-options`, async (c) => {
    try {
      const { rpID } = webauthnContext(c);
      const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
      const flowId = await stashChallenge(options.challenge);
      return c.json({ flowId, options });
    } catch (e) { console.error("webauthn login-options failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.post(`${PREFIX}/webauthn/login-verify`, async (c) => {
    try {
      const { flowId, response } = await c.req.json();
      const expectedChallenge = await popChallenge(flowId);
      const db = supabaseAdmin();
      const credentialId = response?.id;
      if (!credentialId) return c.json({ error: "Malformed passkey response" }, 400);
      const { data: row, error } = await db.from("tt_webauthn_credentials").select("id, team_id, public_key, counter, transports").eq("credential_id", credentialId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return c.json({ error: "This passkey isn't registered here anymore" }, 401);
      const { origin, rpID } = webauthnContext(c);
      const verification = await verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, credential: { id: credentialId, publicKey: isoBase64URL.toBuffer(row.public_key), counter: row.counter, transports: row.transports ?? undefined } });
      if (!verification.verified) return c.json({ verified: false }, 401);
      await db.from("tt_webauthn_credentials").update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", row.id);
      const { data: member, error: mErr } = await db.from("tt_team").select("id, name").eq("id", row.team_id).maybeSingle();
      if (mErr) throw new Error(mErr.message);
      if (!member) return c.json({ error: "Staff profile no longer exists" }, 401);
      return c.json({ verified: true, teamId: member.id, name: member.name });
    } catch (e) { console.error("webauthn login-verify failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.post(`${PREFIX}/webauthn/manager-pin`, async (c) => {
    try {
      const { flowId, response } = await c.req.json();
      const expectedChallenge = await popChallenge(flowId);
      const db = supabaseAdmin();
      const credentialId = response?.id;
      if (!credentialId) return c.json({ ok: false, error: "Malformed passkey response" }, 400);
      const { data: row, error } = await db.from("tt_webauthn_credentials").select("id, team_id, public_key, counter, transports").eq("credential_id", credentialId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return c.json({ ok: false, error: "This passkey isn't registered here anymore" }, 401);
      const { origin, rpID } = webauthnContext(c);
      const verification = await verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, credential: { id: credentialId, publicKey: isoBase64URL.toBuffer(row.public_key), counter: row.counter, transports: row.transports ?? undefined } });
      if (!verification.verified) return c.json({ ok: false }, 401);
      await db.from("tt_webauthn_credentials").update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", row.id);
      const { data: member, error: mErr } = await db.from("tt_team").select("id, name, role, avatar, pin, is_manager").eq("id", row.team_id).maybeSingle();
      if (mErr) throw new Error(mErr.message);
      if (!member) return c.json({ ok: false, error: "Staff profile no longer exists" }, 401);
      if (!member.is_manager) return c.json({ ok: false, error: "This passkey isn't linked to a manager profile" }, 403);
      return c.json({ ok: true, teamId: member.id, name: member.name, role: member.role, avatar: member.avatar, pin: member.pin ?? "1234" });
    } catch (e) { console.error("webauthn manager-pin failed", e); return c.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.get(`${PREFIX}/webauthn/credentials`, async (c) => {
    try {
      const teamId = Number(c.req.query("teamId"));
      const pin = c.req.query("pin");
      const db = supabaseAdmin();
      const member = await requireStaffPin(db, teamId, pin);
      const { data, error } = await db.from("tt_webauthn_credentials").select("id, device_label, created_at, last_used_at").eq("team_id", member.id).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return c.json({ credentials: data ?? [] });
    } catch (e) { console.error("webauthn credentials list failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, webauthnErrorStatus(e)); }
  });

  app.delete(`${PREFIX}/webauthn/credentials/:id`, async (c) => {
    try {
      const id = Number(c.req.param("id"));
      const teamId = Number(c.req.query("teamId"));
      const pin = c.req.query("pin");
      const db = supabaseAdmin();
      const member = await requireStaffPin(db, teamId, pin);
      const { error } = await db.from("tt_webauthn_credentials").delete().eq("id", id).eq("team_id", member.id);
      if (error) throw new Error(error.message);
      return c.json({ ok: true });
    } catch (e) { console.error("webauthn credential delete failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, webauthnErrorStatus(e)); }
  });
}
