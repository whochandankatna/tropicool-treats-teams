import type { Hono } from "npm:hono";
import { supabaseAdmin, requireManagerPin, sendPushToTeamIds as pushToTeamIds } from "./shared.ts";

const PREFIX = "/make-server-3ba8d4df-2";

async function getWhatsAppConfig() {
  const db = supabaseAdmin();
  const { data, error } = await db.from("app_secrets").select("key, value").in("key", ["whatsapp_gateway_token", "whatsapp_gateway_group_id"]);
  if (error) throw new Error(`Failed to load WhatsApp config: ${error.message}`);
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  const token = map["whatsapp_gateway_token"]; const groupId = map["whatsapp_gateway_group_id"];
  if (!token || !groupId) throw new Error("WhatsApp gateway is not configured yet");
  return { token, groupId };
}

async function sendWhatsAppGroupMessage(token: string, groupId: string, message: string) {
  const res = await fetch("https://api.wassenger.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", Token: token }, body: JSON.stringify({ group: groupId, message }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp gateway error (${res.status}): ${body?.message || JSON.stringify(body)}`);
  return body;
}

async function computeStockAlert(db: any) {
  const { data, error } = await db.from("tt_items").select("name, category, unit, qty, par");
  if (error) throw new Error(error.message);
  const out: any[] = []; const low: any[] = [];
  for (const it of data ?? []) { const qty = Number(it.qty ?? 0); const par = Number(it.par ?? 0); if (par <= 0) continue; const ratio = qty / par; if (ratio === 0) out.push(it); else if (ratio < 0.3) low.push(it); }
  out.sort((a, b) => a.name.localeCompare(b.name)); low.sort((a, b) => a.name.localeCompare(b.name));
  return { out, low };
}

function formatStocktakeWhatsAppMessage(out: any[], low: any[]) {
  const lines = [`🌴 *Tropicool Treats — Stocktake Check*`, ``];
  if (out.length === 0 && low.length === 0) { lines.push(`✅ Everything's stocked. No low or out-of-stock items tonight.`); return lines.join("\n"); }
  if (out.length > 0) { lines.push(`🔴 *Out of stock (${out.length})*`); for (const it of out) lines.push(`• ${it.name}${it.unit ? ` (${it.unit})` : ""}`); lines.push(``); }
  if (low.length > 0) { lines.push(`🟡 *Low stock (${low.length})*`); for (const it of low) lines.push(`• ${it.name} — ${it.qty}/${it.par}${it.unit ? ` ${it.unit}` : ""}`); lines.push(``); }
  lines.push(`Open the app to update stocktake.`);
  return lines.join("\n");
}

function formatStocktakeAlertText(out: any[], low: any[]) {
  if (out.length === 0 && low.length === 0) return { title: "Stocktake check — all good", body: "No low or out-of-stock items tonight." };
  const parts: string[] = [];
  if (out.length > 0) parts.push(`${out.length} out of stock`);
  if (low.length > 0) parts.push(`${low.length} low stock`);
  const topNames = [...out, ...low].slice(0, 3).map((it) => it.name).join(", ");
  const more = out.length + low.length > 3 ? "…" : "";
  return { title: `Stocktake alert — ${parts.join(", ")}`, body: `${topNames}${more} — tap to review.` };
}

async function getManagerTeamIds(db: any): Promise<number[]> { const { data, error } = await db.from("tt_team").select("id").eq("is_manager", true); if (error) throw new Error(error.message); return (data ?? []).map((m: any) => m.id); }
// Reminder audience: whoever is actually still on shift right now, plus the
// manager(s) — not literally every staff profile that has ever signed in.
async function getClockedInOrManagerTeamIds(db: any): Promise<number[]> { const { data, error } = await db.from("tt_team").select("id").or("clocked_in.eq.true,is_manager.eq.true"); if (error) throw new Error(error.message); return (data ?? []).map((m: any) => m.id); }
async function broadcastNotification(db: any, title: string, body: string, kind = "reminder") { const { error } = await db.from("tt_notifications").insert({ title, body, kind }); if (error) throw new Error(error.message); }
const STOCKTAKE_REMINDER_PUSH = { title: "Stocktake reminder", body: "Please finish tonight's stocktake, money count, and closing checklist before you clock off.", tag: "tt-stocktake-reminder" }

export function registerWhatsappPushRoutes(app: Hono) {
  app.post(`${PREFIX}/whatsapp/stocktake-alert`, async (c) => {
    try {
      const db = supabaseAdmin();
      const { token, groupId } = await getWhatsAppConfig();
      const { out, low } = await computeStockAlert(db);
      const message = formatStocktakeWhatsAppMessage(out, low);
      await sendWhatsAppGroupMessage(token, groupId, message);
      return c.json({ sent: true, outCount: out.length, lowCount: low.length });
    } catch (e) { console.error("whatsapp stocktake alert failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.get(`${PREFIX}/manager/whatsapp/status`, async (c) => {
    try {
      const pin = c.req.query("pin");
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      let configured = true;
      try { await getWhatsAppConfig(); } catch { configured = false; }
      return c.json({ configured });
    } catch (e) { console.error("whatsapp status failed", e); const status = e instanceof Error && /PIN/i.test(e.message) ? 401 : 500; return c.json({ error: String(e instanceof Error ? e.message : e) }, status); }
  });

  app.post(`${PREFIX}/manager/whatsapp/test-send`, async (c) => {
    try {
      const { pin } = await c.req.json();
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      const { token, groupId } = await getWhatsAppConfig();
      const { out, low } = await computeStockAlert(db);
      const message = formatStocktakeWhatsAppMessage(out, low);
      await sendWhatsAppGroupMessage(token, groupId, message);
      return c.json({ sent: true, outCount: out.length, lowCount: low.length });
    } catch (e) { console.error("whatsapp test send failed", e); const status = e instanceof Error && /PIN/i.test(e.message) ? 401 : 500; return c.json({ error: String(e instanceof Error ? e.message : e) }, status); }
  });

  app.post(`${PREFIX}/push/stocktake-alert`, async (c) => {
    try {
      const db = supabaseAdmin();
      const { out, low } = await computeStockAlert(db);
      const managerIds = await getManagerTeamIds(db);
      const payload = { ...formatStocktakeAlertText(out, low), tag: "tt-stocktake-alert" };
      const sent = await pushToTeamIds(db, managerIds, payload);
      return c.json({ sent, outCount: out.length, lowCount: low.length });
    } catch (e) { console.error("push stocktake alert failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.get(`${PREFIX}/manager/push/stocktake-alert/status`, async (c) => {
    try {
      const pin = c.req.query("pin");
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      const managerIds = await getManagerTeamIds(db);
      let subscribedManagers = 0;
      if (managerIds.length > 0) { const { data, error } = await db.from("tt_push_subscriptions").select("team_id").in("team_id", managerIds); if (error) throw new Error(error.message); subscribedManagers = new Set((data ?? []).map((r: any) => r.team_id)).size; }
      return c.json({ subscribedManagers, totalManagers: managerIds.length });
    } catch (e) { console.error("push stocktake alert status failed", e); const status = e instanceof Error && /PIN/i.test(e.message) ? 401 : 500; return c.json({ error: String(e instanceof Error ? e.message : e) }, status); }
  });

  app.post(`${PREFIX}/manager/push/stocktake-alert/test-send`, async (c) => {
    try {
      const { pin } = await c.req.json();
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      const { out, low } = await computeStockAlert(db);
      const managerIds = await getManagerTeamIds(db);
      const payload = { ...formatStocktakeAlertText(out, low), tag: "tt-stocktake-alert" };
      const sent = await pushToTeamIds(db, managerIds, payload);
      return c.json({ sent, outCount: out.length, lowCount: low.length });
    } catch (e) { console.error("push stocktake alert test send failed", e); const status = e instanceof Error && /PIN/i.test(e.message) ? 401 : 500; return c.json({ error: String(e instanceof Error ? e.message : e) }, status); }
  });

  app.post(`${PREFIX}/notifications/stocktake-reminder`, async (c) => {
    try {
      const db = supabaseAdmin();
      await broadcastNotification(db, "Stocktake reminder", "Please make sure tonight's stocktake, money count, and closing checklist are done before you clock off.", "reminder");
      const targetIds = await getClockedInOrManagerTeamIds(db);
      const pushed = await pushToTeamIds(db, targetIds, STOCKTAKE_REMINDER_PUSH);
      return c.json({ sent: true, pushed, targeted: targetIds.length });
    } catch (e) { console.error("stocktake reminder broadcast failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.post(`${PREFIX}/manager/notifications/stocktake-reminder/test-send`, async (c) => {
    try {
      const { pin } = await c.req.json();
      const db = supabaseAdmin();
      await requireManagerPin(db, pin);
      await broadcastNotification(db, "Stocktake reminder", "Please make sure tonight's stocktake, money count, and closing checklist are done before you clock off.", "reminder");
      const targetIds = await getClockedInOrManagerTeamIds(db);
      const pushed = await pushToTeamIds(db, targetIds, STOCKTAKE_REMINDER_PUSH);
      return c.json({ sent: true, pushed, targeted: targetIds.length });
    } catch (e) { console.error("stocktake reminder test send failed", e); const status = e instanceof Error && /PIN/i.test(e.message) ? 401 : 500; return c.json({ error: String(e instanceof Error ? e.message : e) }, status); }
  });
}
