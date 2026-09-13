import type { Hono } from "npm:hono";
import { fetchManagerTeamIds, getSquareConfig, requireManagerPin, sendPushToTeamIds, squareFetch, supabaseAdmin } from "./shared.ts";

const PREFIX = "/make-server-3ba8d4df";
const MINUTE = 60_000;
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
const REMINDERS = [
  { kind: "before_10", offset: -10, title: "Clock-out reminder", body: "Your shift ends in 10 minutes. Please clock out when you finish." },
  { kind: "at_end", offset: 0, title: "Shift finished", body: "Your rostered shift has ended. Please clock out if you have finished work." },
  { kind: "after_30", offset: 30, title: "Please clock out", body: "Your rostered shift ended 30 minutes ago. Please clock out when you finish." },
] as const;

export function dueReminderKinds(now: number, shiftEnd: number) {
  return REMINDERS.filter(reminder => {
    const due = shiftEnd + reminder.offset * MINUTE;
    return now >= due && now < due + 5 * MINUTE;
  }).map(reminder => reminder.kind);
}

export function autoClockoutDue(now: number, shiftEnd: number) {
  const cutoff = shiftEnd + 60 * MINUTE;
  return now >= cutoff && now < cutoff + 5 * MINUTE;
}

export function matchesOpenTimecard(timecardStart: number, shiftStart: number, shiftEnd: number) {
  return Number.isFinite(timecardStart) && timecardStart >= shiftStart - 2 * 60 * MINUTE &&
    timecardStart <= Math.min(shiftStart + 2 * 60 * MINUTE, shiftEnd);
}

export function validActualFinish(actual: number, shiftStart: number, shiftEnd: number, now: number) {
  return Number.isFinite(actual) && actual >= shiftStart && actual <= now && actual <= shiftEnd + 24 * 60 * MINUTE;
}

function dateInBrisbane(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

async function squareSearchAll(token: string, path: string, body: Record<string, unknown>, key: string): Promise<any[]> {
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const result = await squareFetch(token, path, { method: "POST", body: JSON.stringify({ ...body, cursor, limit: 50 }) });
    rows.push(...(result[key] ?? []));
    cursor = result.cursor;
  } while (cursor && rows.length < 1000);
  return rows;
}

export function writableTimecard(timecard: any, endAt: string) {
  return {
    location_id: timecard.location_id,
    team_member_id: timecard.team_member_id,
    start_at: timecard.start_at,
    end_at: endAt,
    version: timecard.version,
    ...(timecard.wage ? { wage: timecard.wage } : {}),
    ...(timecard.declared_cash_tip_money ? { declared_cash_tip_money: timecard.declared_cash_tip_money } : {}),
    ...(timecard.breaks ? { breaks: timecard.breaks.map((b: any) => ({
      id: b.id, start_at: b.start_at, end_at: b.end_at ?? endAt,
      break_type_id: b.break_type_id, name: b.name,
      expected_duration: b.expected_duration, is_paid: b.is_paid,
    })) } : {}),
  };
}

async function sendManagerReviewPush(db: any, review: any, name: string) {
  if (review.manager_pushed_at) return 0;
  const ids = await fetchManagerTeamIds(db);
  const sent = await sendPushToTeamIds(db, ids, {
    title: "Clock-out needs review",
    body: review.status === "failed"
      ? `${name}'s timecard could not be closed automatically. Check Square and review their actual finish time.`
      : `${name} was automatically clocked out one hour after their rostered shift. Review their actual finish time.`,
    tag: `tt-auto-clockout-${review.id}`,
  }, true, { TTL: 86400, urgency: "high" });
  if (sent > 0) await db.from("tt_auto_clockout_reviews").update({ manager_pushed_at: new Date().toISOString() }).eq("id", review.id);
  return sent;
}

async function completeAutoClockout(db: any, token: string, review: any, member: any) {
  const result = await squareFetch(token, `/labor/timecards/${review.square_timecard_id}`);
  const latest = result.timecard;
  if (!latest) throw new Error("Square timecard not found");
  if (latest.status === "OPEN") {
    await squareFetch(token, `/labor/timecards/${latest.id}`, {
      method: "PUT", body: JSON.stringify({ timecard: writableTimecard(latest, review.auto_end_at) }),
    });
  } else if (latest.status !== "CLOSED" || Math.abs(new Date(latest.end_at).getTime() - new Date(review.auto_end_at).getTime()) > MINUTE) {
    // Someone else closed or changed it; never overwrite a human correction.
    await db.from("tt_auto_clockout_reviews").update({ status: "failed", error_message: "Square timecard changed outside this app; review manually.", updated_at: new Date().toISOString() }).eq("id", review.id);
    await sendManagerReviewPush(db, { ...review, status: "failed" }, member.name);
    return false;
  }
  const { error } = await db.from("tt_auto_clockout_reviews").update({ status: "pending", error_message: null, updated_at: new Date().toISOString() }).eq("id", review.id);
  if (error) throw new Error(error.message);
  await db.from("tt_team").update({ clocked_in: false, clock_in: null }).eq("id", member.id);
  await sendManagerReviewPush(db, { ...review, status: "pending" }, member.name);
  return true;
}

export function registerClockoutRoutes(app: Hono) {
  app.post(`${PREFIX}/square/push/check-clockouts`, async c => {
    // This route can read payroll-related records and mutate Square. Only a
    // server-side cron job holding the service-role key can call it.
    const db = supabaseAdmin();
    const { data: secret, error: secretError } = await db.from("app_secrets").select("value").eq("key", "clockout_cron_secret").maybeSingle();
    if (secretError || !secret?.value || !safeEqual(c.req.header("x-clockout-cron-key") ?? "", secret.value)) return c.json({ error: "Unauthorised" }, 401);
    try {
      const { mode = "dry-run" } = await c.req.json().catch(() => ({}));
      if (mode !== "dry-run" && mode !== "apply") return c.json({ error: "Invalid mode" }, 400);
      const apply = mode === "apply";
      const now = Date.now();
      const { token, locationId } = await getSquareConfig();
      if (apply) {
        const { data: staleReviews, error: staleError } = await db.from("tt_auto_clockout_reviews")
          .select("*").in("status", ["processing", "failed"]).gte("created_at", new Date(now - 24 * 60 * MINUTE).toISOString()).limit(50);
        if (staleError) throw new Error(staleError.message);
        for (const review of staleReviews ?? []) {
          const { data: member } = await db.from("tt_team").select("id, name").eq("id", review.team_id).maybeSingle();
          if (!member) continue;
          try {
            const latest = (await squareFetch(token, `/labor/timecards/${review.square_timecard_id}`)).timecard;
            if (latest?.status === "CLOSED" && Math.abs(new Date(latest.end_at).getTime() - new Date(review.auto_end_at).getTime()) <= MINUTE) {
              await completeAutoClockout(db, token, review, member);
            } else if (latest?.status === "OPEN" && now < new Date(review.auto_end_at).getTime() + 5 * MINUTE) {
              await completeAutoClockout(db, token, review, member);
            } else if (review.status === "failed") {
              await sendManagerReviewPush(db, review, member.name);
            }
          } catch (e) { console.error("auto clock-out recovery failed", e); }
        }
      }
      const startDate = dateInBrisbane(now - 24 * 60 * MINUTE);
      const endDate = dateInBrisbane(now + 24 * 60 * MINUTE);
      const [shifts, timecards] = await Promise.all([
        squareSearchAll(token, "/labor/scheduled-shifts/search", { query: { filter: { location_ids: [locationId], workday: { date_range: { start_date: startDate, end_date: endDate }, match_shifts_by: "START_AT" }, scheduled_shift_statuses: ["PUBLISHED"] } } }, "scheduled_shifts"),
        squareSearchAll(token, "/labor/timecards/search", { query: { filter: { location_ids: [locationId], status: "OPEN" } } }, "timecards"),
      ]);
      const ids = [...new Set(shifts.map(s => s.published_shift_details?.team_member_id).filter(Boolean))];
      const { data: staff, error: staffError } = ids.length
        ? await db.from("tt_team").select("id, name, square_team_member_id").in("square_team_member_id", ids)
        : { data: [], error: null };
      if (staffError) throw new Error(staffError.message);
      const bySquareId = new Map((staff ?? []).map((m: any) => [m.square_team_member_id, m]));
      // Assign each open timecard to its nearest roster start. This avoids
      // mistaking a later same-day shift for the earlier shift's overtime.
      const shiftForTimecard = new Map<string, string>();
      for (const timecard of timecards) {
        const started = new Date(timecard.start_at).getTime();
        const eligible = shifts.filter(shift => {
          const d = shift.published_shift_details;
          return d?.team_member_id === timecard.team_member_id && d.start_at && d.end_at &&
            matchesOpenTimecard(started, new Date(d.start_at).getTime(), new Date(d.end_at).getTime());
        });
        eligible.sort((a, b) => Math.abs(started - new Date(a.published_shift_details.start_at).getTime()) - Math.abs(started - new Date(b.published_shift_details.start_at).getTime()));
        if (eligible[0]) shiftForTimecard.set(timecard.id, eligible[0].id);
      }
      const candidates: any[] = [];
      let pushes = 0;
      let closed = 0;
      for (const shift of shifts) {
        const d = shift.published_shift_details;
        if (!d?.team_member_id || !d.start_at || !d.end_at) continue;
        const member: any = bySquareId.get(d.team_member_id);
        if (!member) continue;
        const shiftStart = new Date(d.start_at).getTime();
        const shiftEnd = new Date(d.end_at).getTime();
        if (!Number.isFinite(shiftEnd) || shiftEnd <= shiftStart) continue;
        const open = timecards.find(t => t.team_member_id === d.team_member_id && shiftForTimecard.get(t.id) === shift.id);
        if (!open) continue;

        for (const reminder of REMINDERS) {
          const due = shiftEnd + reminder.offset * MINUTE;
          if (!dueReminderKinds(now, shiftEnd).includes(reminder.kind)) continue;
          candidates.push({ type: reminder.kind, shiftId: shift.id, timecardId: open.id, teamId: member.id, dueAt: new Date(due).toISOString() });
          if (!apply) continue;
          const { data: event, error } = await db.from("tt_clockout_reminder_events").insert({
            square_shift_id: shift.id, square_timecard_id: open.id, team_id: member.id,
            reminder_kind: reminder.kind, due_at: new Date(due).toISOString(),
          }).select("id").maybeSingle();
          if (error?.code === "23505") continue;
          if (error) throw new Error(error.message);
          const sent = await sendPushToTeamIds(db, [member.id], { title: reminder.title, body: reminder.body, tag: `tt-clockout-${shift.id}-${reminder.kind}` }, false, { TTL: 300, urgency: "high" });
          pushes += sent;
          if (sent > 0 && event) await db.from("tt_clockout_reminder_events").update({ pushed_at: new Date().toISOString() }).eq("id", event.id);
        }

        const cutoff = shiftEnd + 60 * MINUTE;
        // Do not act on historic open records or a late run beyond five
        // minutes: a manager must review those manually.
        if (!autoClockoutDue(now, shiftEnd)) continue;
        candidates.push({ type: "auto_clockout", shiftId: shift.id, timecardId: open.id, teamId: member.id, endAt: new Date(cutoff).toISOString() });
        if (!apply) continue;
        const { data: newReview, error: createError } = await db.from("tt_auto_clockout_reviews").insert({
          square_shift_id: shift.id, square_timecard_id: open.id, team_id: member.id,
          scheduled_start_at: d.start_at, scheduled_end_at: d.end_at,
          auto_end_at: new Date(cutoff).toISOString(), status: "processing",
        }).select().maybeSingle();
        if (createError?.code === "23505") continue;
        if (createError) throw new Error(createError.message);
        try { if (await completeAutoClockout(db, token, newReview, member)) closed++; }
        catch (e) {
          await db.from("tt_auto_clockout_reviews").update({ status: "failed", error_message: String(e instanceof Error ? e.message : e), updated_at: new Date().toISOString() }).eq("id", newReview.id);
          await sendManagerReviewPush(db, { ...newReview, status: "failed" }, member.name).catch(err => console.error("manager alert failed", err));
          console.error("auto clock-out failed", e);
        }
      }
      return c.json({ mode, scheduledShifts: shifts.length, openTimecards: timecards.length, candidates, pushes, closed });
    } catch (e) { console.error("check-clockouts failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });

  app.post(`${PREFIX}/manager/clockout-reviews/list`, async c => {
    try {
      const db = supabaseAdmin();
      const { pin, view } = await c.req.json();
      await requireManagerPin(db, pin);
      const statuses = view === "history" ? ["approved", "adjusted", "resolved"] : ["pending", "failed"];
      const { data, error } = await db.from("tt_auto_clockout_reviews")
        .select("id, team_id, square_shift_id, square_timecard_id, scheduled_start_at, scheduled_end_at, auto_end_at, status, actual_end_at, reviewed_at, review_note, created_at, tt_team!tt_auto_clockout_reviews_team_id_fkey(name)")
        .in("status", statuses).order(view === "history" ? "reviewed_at" : "created_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return c.json({ reviews: (data ?? []).map((r: any) => ({ ...r, staffName: r.tt_team?.name ?? "Staff", tt_team: undefined })) });
    } catch (e) { return c.json({ error: String(e instanceof Error ? e.message : e) }, 401); }
  });

  app.post(`${PREFIX}/manager/clockout-reviews/:id`, async c => {
    try {
      const db = supabaseAdmin();
      const { pin, decision, actualEndAt, note } = await c.req.json();
      const manager = await requireManagerPin(db, pin);
      if (decision !== "approve" && decision !== "adjust" && decision !== "resolve") return c.json({ error: "Invalid decision" }, 400);
      const { data: review, error } = await db.from("tt_auto_clockout_reviews").select("*").eq("id", Number(c.req.param("id"))).maybeSingle();
      if (error) throw new Error(error.message);
      if (decision === "resolve") {
        if (!review || review.status !== "failed") return c.json({ error: "Review is no longer awaiting manual resolution" }, 409);
        if (!String(note ?? "").trim()) return c.json({ error: "Record how the Square timecard was resolved." }, 400);
        const { token } = await getSquareConfig();
        const latest = (await squareFetch(token, `/labor/timecards/${review.square_timecard_id}`)).timecard;
        if (!latest || latest.status !== "CLOSED" || !latest.end_at) return c.json({ error: "Close or correct the Square timecard before marking this resolved." }, 409);
        const { data: saved, error: updateError } = await db.from("tt_auto_clockout_reviews").update({
          status: "resolved", actual_end_at: latest.end_at, reviewed_by: manager.id,
          reviewed_at: new Date().toISOString(), review_note: String(note).trim(), updated_at: new Date().toISOString(),
        }).eq("id", review.id).eq("status", "failed").select().maybeSingle();
        if (updateError) throw new Error(updateError.message);
        return saved ? c.json({ review: saved }) : c.json({ error: "Review was already handled" }, 409);
      }
      if (!review || review.status !== "pending") return c.json({ error: "Review is no longer pending" }, 409);
      let verifiedEnd = review.auto_end_at;
      if (decision === "adjust") {
        const end = new Date(actualEndAt).getTime();
        if (!validActualFinish(end, new Date(review.scheduled_start_at).getTime(), new Date(review.scheduled_end_at).getTime(), Date.now())) return c.json({ error: "Actual finish must be after shift start, not in the future, and within 24 hours of rostered finish." }, 400);
        verifiedEnd = new Date(end).toISOString();
        if (!String(note ?? "").trim()) return c.json({ error: "A reason is required when correcting worked hours." }, 400);
        const { token } = await getSquareConfig();
        const latest = (await squareFetch(token, `/labor/timecards/${review.square_timecard_id}`)).timecard;
        if (!latest || latest.status !== "CLOSED" || Math.abs(new Date(latest.end_at).getTime() - new Date(review.auto_end_at).getTime()) > MINUTE) return c.json({ error: "Square timecard has changed. Refresh and review it manually." }, 409);
        await squareFetch(token, `/labor/timecards/${latest.id}`, { method: "PUT", body: JSON.stringify({ timecard: writableTimecard(latest, verifiedEnd) }) });
      }
      const { data: saved, error: updateError } = await db.from("tt_auto_clockout_reviews").update({
        status: decision === "approve" ? "approved" : "adjusted", actual_end_at: verifiedEnd,
        reviewed_by: manager.id, reviewed_at: new Date().toISOString(), review_note: String(note ?? "").trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", review.id).eq("status", "pending").select().maybeSingle();
      if (updateError) throw new Error(updateError.message);
      if (!saved) return c.json({ error: "Review was already handled" }, 409);
      return c.json({ review: saved });
    } catch (e) { return c.json({ error: String(e instanceof Error ? e.message : e) }, 500); }
  });
}
