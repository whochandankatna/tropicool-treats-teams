import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import webpush from "npm:web-push@3.6.7";

export const supabaseAdmin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export async function getSquareConfig(): Promise<{ token: string; locationId: string }> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("app_secrets").select("key, value").in("key", ["square_access_token", "square_location_id"]);
  if (error) throw new Error(`Failed to load Square config: ${error.message}`);
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  const token = map.square_access_token; const locationId = map.square_location_id;
  if (!token || !locationId) throw new Error("Square is not configured yet");
  return { token, locationId };
}

export async function squareFetch(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://connect.squareup.com/v2${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Square-Version": "2025-05-21", ...(init.headers ?? {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const msg = json?.errors?.map((e: any) => e.detail).join("; ") || res.statusText; throw new Error(`Square API error (${res.status}): ${msg}`); }
  return json;
}

export function initials(given?: string | null, family?: string | null): string { return `${(given?.[0] ?? "").toUpperCase()}${(family?.[0] ?? "").toUpperCase()}` || "??"; }
export function formatBrisbaneTime(iso: string, tz = "Australia/Brisbane"): string { return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date(iso)); }
export function brisbaneDateStr(d: Date = new Date()): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(d); }
export function dayRange(start: string, end: string): { startAt: string; endAt: string } { return { startAt: `${start}T00:00:00+10:00`, endAt: `${end}T23:59:59+10:00` }; }
export function moneyAmount(m: any): number { return Number(m?.amount ?? 0); }

export function chunkDateWindows(start: string, end: string, days: number): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  const endMs = new Date(end).getTime();
  let cursorMs = new Date(start).getTime();
  const stepMs = days * 86400000;
  while (cursorMs <= endMs) { const chunkEndMs = Math.min(cursorMs + stepMs - 1000, endMs); out.push({ start: new Date(cursorMs).toISOString(), end: new Date(chunkEndMs).toISOString() }); cursorMs = chunkEndMs + 1000; }
  return out;
}

export async function searchSquareOrders(token: string, locationId: string, startAt: string, endAt: string): Promise<any[]> {
  async function fetchWindow(winStart: string, winEnd: string): Promise<any[]> {
    const orders: any[] = []; let cursor: string | undefined; let guard = 0;
    do {
      const res = await squareFetch(token, "/orders/search", { method: "POST", body: JSON.stringify({ location_ids: [locationId], query: { filter: { date_time_filter: { created_at: { start_at: winStart, end_at: winEnd } }, state_filter: { states: ["COMPLETED"] } }, sort: { sort_field: "CREATED_AT", sort_order: "ASC" } }, limit: 500, cursor }) });
      orders.push(...(res.orders ?? [])); cursor = res.cursor; guard++;
    } while (cursor && guard < 200);
    return orders;
  }
  const windows = chunkDateWindows(startAt, endAt, 30);
  const results = await Promise.all(windows.map((w) => fetchWindow(w.start, w.end)));
  return results.flat();
}

export async function requireManagerPin(db: any, pin: string | undefined | null) {
  if (!pin) throw new Error("Manager PIN is required");
  const { data, error } = await db.from("tt_team").select("id, name, is_manager, pin").eq("is_manager", true);
  if (error) throw new Error(error.message);
  const match = (data ?? []).find((r: any) => (r.pin ?? "1234") === String(pin));
  if (!match) throw new Error("Invalid manager PIN");
  return match;
}

export async function requireStaffPin(db: any, teamId: number, pin: string | undefined | null) {
  if (!pin) throw new Error("PIN is required");
  const { data, error } = await db.from("tt_team").select("id, name, pin, is_manager").eq("id", teamId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Unknown team member");
  if ((data.pin ?? "1234") !== String(pin)) throw new Error("Incorrect PIN");
  return data;
}

export async function getTeamMember(db: any, teamId: number) {
  const { data, error } = await db.from("tt_team").select("id, name, pin, is_manager").eq("id", teamId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Unknown team member");
  return data;
}

export function pinErrorStatus(e: unknown): 401 | 500 { return e instanceof Error && /pin/i.test(e.message) ? 401 : 500; }

export async function sendPushToTeamIds(db: any, teamIds: number[], payload: { title: string; body: string; tag?: string }): Promise<number> {
  if (teamIds.length === 0) return 0;
  const { data: cfg } = await db.from("app_secrets").select("key, value").in("key", ["vapid_public_key", "vapid_private_key", "vapid_subject"]);
  const cfgMap = Object.fromEntries((cfg ?? []).map((r: any) => [r.key, r.value]));
  if (!cfgMap.vapid_private_key) return 0;
  webpush.setVapidDetails(cfgMap.vapid_subject, cfgMap.vapid_public_key, cfgMap.vapid_private_key);
  const { data: subs } = await db.from("tt_push_subscriptions").select("id, team_id, endpoint, p256dh, auth").in("team_id", teamIds);
  let sent = 0;
  for (const s of subs ?? []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload)); sent++; }
    catch (err: any) { if (err?.statusCode === 404 || err?.statusCode === 410) await db.from("tt_push_subscriptions").delete().eq("id", s.id); else console.error("push send failed", err); }
  }
  return sent;
}

export async function fetchManagerTeamIds(db: any): Promise<number[]> { const { data, error } = await db.from("tt_team").select("id").eq("is_manager", true); if (error) throw new Error(error.message); return (data ?? []).map((r: any) => r.id); }

export interface OverdueTraining { id: number; title: string; dueAt: string }
export async function findOverdueMandatoryTrainings(db: any, teamId: number): Promise<OverdueTraining[]> {
  const { data: trainings, error } = await db.from("tt_trainings").select("id, title, due_at, mandatory_since, grace_period_days").eq("mandatory", true);
  if (error) throw new Error(error.message);
  const nowMs = Date.now();
  const dueAtFor = (t: any) => t.due_at ?? (t.mandatory_since ? new Date(new Date(t.mandatory_since).getTime() + t.grace_period_days * 86400000).toISOString() : null);
  const overdueCandidates = (trainings ?? []).filter((t: any) => { const dueAt = dueAtFor(t); return !!dueAt && nowMs > new Date(dueAt).getTime(); });
  if (overdueCandidates.length === 0) return [];
  const ids = overdueCandidates.map((t: any) => t.id);
  const { data: completions, error: cErr } = await db.from("tt_training_completions").select("training_id, passed").eq("team_id", teamId).in("training_id", ids);
  if (cErr) throw new Error(cErr.message);
  const passedIds = new Set((completions ?? []).filter((c: any) => c.passed).map((c: any) => c.training_id));
  return overdueCandidates.filter((t: any) => !passedIds.has(t.id)).map((t: any) => ({ id: t.id, title: t.title, dueAt: dueAtFor(t)! }));
}
