import type { Hono } from "npm:hono";
import { supabaseAdmin, getSquareConfig, squareFetch, formatBrisbaneTime, brisbaneDateStr, dayRange, requireManagerPin, getTeamMember, pinErrorStatus } from "./shared.ts";
import { CLASSIFICATIONS, CLASSIFICATION_KEYS, BAND_LABELS, ZERO_BANDS, computeShiftBands, recentCycles, cycleForDate, ageAt, estimateFortnightlyWithholdingCents } from "./payroll.ts";
import type { PublicHoliday, Classification, EmploymentType, Band } from "./payroll.ts";

const PREFIX = "/make-server-3ba8d4df";

async function fetchPublicHolidays(db: any, start: string, end: string): Promise<Map<string, PublicHoliday[]>> {
  const { data, error } = await db.from("tt_public_holidays").select("holiday_date, name, start_time, end_time").gte("holiday_date", start).lte("holiday_date", end);
  if (error) throw new Error(error.message);
  const map = new Map<string, PublicHoliday[]>();
  for (const row of data ?? []) { const list = map.get(row.holiday_date) ?? []; list.push({ date: row.holiday_date, name: row.name, startTime: row.start_time, endTime: row.end_time }); map.set(row.holiday_date, list); }
  return map;
}

async function fetchTimecardsFor(token: string, locationId: string, startAt: string, endAt: string): Promise<any[]> {
  const out: any[] = []; let cursor: string | undefined; let guard = 0;
  do { const res = await squareFetch(token, "/labor/timecards/search", { method: "POST", body: JSON.stringify({ query: { filter: { location_ids: [locationId], start: { start_at: startAt, end_at: endAt } } }, limit: 100, cursor }) }); out.push(...(res.timecards ?? [])); cursor = res.cursor; guard++; } while (cursor && guard < 150);
  return out;
}

async function fetchScheduledShiftsFor(token: string, locationId: string, start: string, end: string): Promise<any[]> {
  const out: any[] = []; let cursor: string | undefined; let guard = 0;
  do { const res = await squareFetch(token, "/labor/scheduled-shifts/search", { method: "POST", body: JSON.stringify({ query: { filter: { location_ids: [locationId], workday: { date_range: { start_date: start, end_date: end } }, scheduled_shift_statuses: ["PUBLISHED"] } }, limit: 50, cursor }) }); out.push(...(res.scheduled_shifts ?? [])); cursor = res.cursor; guard++; } while (cursor && guard < 150);
  return out;
}

export function registerPayrollRoutes(app: Hono) {
  app.get(`${PREFIX}/payroll/me`, async (c) => {
    try {
      const teamId = Number(c.req.query("teamId"));
      const cycles = Math.min(12, Math.max(1, Number(c.req.query("cycles")) || 4));
      if (!teamId) return c.json({ error: "teamId is required" }, 400);
      const db = supabaseAdmin();
      const member = await getTeamMember(db, teamId);
      const { data: profile, error } = await db.from("tt_payroll_profile").select("*").eq("team_id", teamId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!profile?.classification) return c.json({ configured: false, name: member.name });
      const classification: Classification = profile.classification;
      const employmentType: EmploymentType = profile.employment_type ?? "casual";
      const dob: string | null = profile.dob;
      const claimsTaxFreeThreshold: boolean = profile.claims_tax_free_threshold ?? true;
      const today = brisbaneDateStr();
      const cycleList = recentCycles(cycles, today);
      const overallStart = cycleList[cycleList.length - 1].start;
      const overallEnd = cycleList[0].end;
      const { startAt, endAt } = dayRange(overallStart, overallEnd);
      let token: string | null = null, locationId: string | null = null;
      try { ({ token, locationId } = await getSquareConfig()); } catch { /* not configured */ }
      const [holidays, manualShiftsRes, teamRow] = await Promise.all([
        fetchPublicHolidays(db, overallStart, overallEnd),
        db.from("tt_manual_shifts").select("*").eq("team_id", teamId).gte("shift_date", overallStart).lte("shift_date", overallEnd),
        db.from("tt_team").select("square_team_member_id").eq("id", teamId).maybeSingle(),
      ]);
      if (manualShiftsRes.error) throw new Error(manualShiftsRes.error.message);
      const squareMemberId: string | null = teamRow.data?.square_team_member_id ?? null;
      let timecards: any[] = []; let scheduledShifts: any[] = [];
      if (token && locationId && squareMemberId) {
        [timecards, scheduledShifts] = await Promise.all([fetchTimecardsFor(token, locationId, startAt, endAt), fetchScheduledShiftsFor(token, locationId, overallStart, overallEnd)]);
        timecards = timecards.filter((t: any) => t.team_member_id === squareMemberId && t.start_at && t.end_at);
        scheduledShifts = scheduledShifts.filter((s: any) => s.published_shift_details?.team_member_id === squareMemberId);
      }
      try {
        const { data: voided, error: voidErr } = await db.from("tt_payroll_voided_shifts").select("timecard_id").eq("team_id", teamId);
        if (voidErr) throw voidErr;
        const voidedIds = new Set((voided ?? []).map((v: any) => v.timecard_id));
        if (voidedIds.size > 0) timecards = timecards.filter((t: any) => !voidedIds.has(t.id));
      } catch (e) { console.warn("tt_payroll_voided_shifts lookup skipped (table may not exist yet)", e); }
      type DisplayShift = { dateStr: string; displayStart: string; displayEnd: string; source: string; segments: { startIso: string; endIso: string; hourlyRateCents: number | null; timecardId: string | null }[] };
      const shiftsByDate = new Map<string, DisplayShift[]>();
      const pushShift = (s: DisplayShift) => { const arr = shiftsByDate.get(s.dateStr) ?? []; arr.push(s); shiftsByDate.set(s.dateStr, arr); };
      const timecardsByDate = new Map<string, any[]>();
      for (const tc of timecards) { const dateKey = brisbaneDateStr(new Date(tc.start_at)); const arr = timecardsByDate.get(dateKey) ?? []; arr.push(tc); timecardsByDate.set(dateKey, arr); }
      const nowMs = Date.now();
      const scheduledDates = new Set<string>();
      for (const s of scheduledShifts) {
        const details = s.published_shift_details;
        if (!details?.start_at || !details?.end_at) continue;
        const dateKey = brisbaneDateStr(new Date(details.start_at));
        scheduledDates.add(dateKey);
        const matching = timecardsByDate.get(dateKey);
        if (matching && matching.length > 0) {
          const starts = matching.map((m: any) => m.start_at).sort();
          const ends = matching.map((m: any) => m.end_at).sort();
          pushShift({ dateStr: dateKey, displayStart: starts[0], displayEnd: ends[ends.length - 1], source: "square", segments: matching.map((m: any) => ({ startIso: m.start_at, endIso: m.end_at, hourlyRateCents: m.wage?.hourly_rate?.amount ?? null, timecardId: m.id ?? null })) });
        } else if (new Date(details.start_at).getTime() > nowMs) {
          pushShift({ dateStr: dateKey, displayStart: details.start_at, displayEnd: details.end_at, source: "square", segments: [{ startIso: details.start_at, endIso: details.end_at, hourlyRateCents: null, timecardId: null }] });
        }
      }
      for (const [dateKey, tcs] of timecardsByDate) {
        if (scheduledDates.has(dateKey)) continue;
        const starts = tcs.map((t: any) => t.start_at).sort();
        const ends = tcs.map((t: any) => t.end_at).sort();
        pushShift({ dateStr: dateKey, displayStart: starts[0], displayEnd: ends[ends.length - 1], source: "square", segments: tcs.map((t: any) => ({ startIso: t.start_at, endIso: t.end_at, hourlyRateCents: t.wage?.hourly_rate?.amount ?? null, timecardId: t.id ?? null })) });
      }
      const coveredDates = new Set(shiftsByDate.keys());
      for (const m of manualShiftsRes.data ?? []) {
        if (coveredDates.has(m.shift_date)) continue;
        let endIso = `${m.shift_date}T${m.end_time}+10:00`;
        if (m.end_time <= m.start_time) { const nextDay = new Date(new Date(`${m.shift_date}T00:00:00+10:00`).getTime() + 86400000).toISOString().slice(0, 10); endIso = `${nextDay}T${m.end_time}+10:00`; }
        const startIso = `${m.shift_date}T${m.start_time}+10:00`;
        pushShift({ dateStr: m.shift_date, displayStart: startIso, displayEnd: endIso, source: "manual", segments: [{ startIso, endIso, hourlyRateCents: null, timecardId: null }] });
      }
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const currentIndex = cycleForDate(today).index;
      const cyclesOut = cycleList.map((cyc) => {
        const isCurrent = cyc.index === currentIndex;
        const isFuture = cyc.start > today;
        const bandMinutesTotal = { ...ZERO_BANDS } as Record<Band, number>;
        const bandPayTotal = { ...ZERO_BANDS } as Record<Band, number>;
        const shiftsOut: any[] = [];
        for (const [dateKey, shifts] of shiftsByDate) {
          if (dateKey < cyc.start || dateKey > cyc.end) continue;
          for (const shift of shifts) {
            const bandMinutes = { ...ZERO_BANDS } as Record<Band, number>;
            const bandPayCents = { ...ZERO_BANDS } as Record<Band, number>;
            for (const seg of shift.segments) { const result = computeShiftBands(seg.startIso, seg.endIso, classification, employmentType, dob, holidays, seg.hourlyRateCents); for (const band of Object.keys(bandMinutes) as Band[]) { bandMinutes[band] += result.bandMinutes[band]; bandPayCents[band] += result.bandPayCents[band]; } }
            for (const band of Object.keys(bandMinutesTotal) as Band[]) { bandMinutesTotal[band] += bandMinutes[band]; bandPayTotal[band] += bandPayCents[band]; }
            const totalMin = Object.values(bandMinutes).reduce((a, b) => a + b, 0);
            const totalPay = Object.values(bandPayCents).reduce((a, b) => a + b, 0);
            shiftsOut.push({ date: dateKey, start: formatBrisbaneTime(shift.displayStart), end: formatBrisbaneTime(shift.displayEnd), source: shift.source, hours: round2(totalMin / 60), payCents: totalPay, bandHours: Object.fromEntries(Object.keys(bandMinutes).map((k) => [k, round2(bandMinutes[k as Band] / 60)])), segments: shift.segments.map((s: any) => ({ timecardId: s.timecardId, start: formatBrisbaneTime(s.startIso), end: formatBrisbaneTime(s.endIso) })) });
          }
        }
        shiftsOut.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
        const totalMinutesAll = Object.values(bandMinutesTotal).reduce((a, b) => a + b, 0);
        const totalPayCentsAll = Object.values(bandPayTotal).reduce((a, b) => a + b, 0);
        const estimatedTaxCents = estimateFortnightlyWithholdingCents(totalPayCentsAll, claimsTaxFreeThreshold);
        const estimatedNetPayCents = totalPayCentsAll - estimatedTaxCents;
        return { start: cyc.start, end: cyc.end, isCurrent, isFuture, label: isCurrent || isFuture ? "Estimate" : "Estimated gross pay", totalHours: round2(totalMinutesAll / 60), totalPayCents: totalPayCentsAll, estimatedTaxCents, estimatedNetPayCents, bandHours: Object.fromEntries(Object.keys(bandMinutesTotal).map((k) => [k, round2(bandMinutesTotal[k as Band] / 60)])), bandPayCents: bandPayTotal, shifts: shiftsOut };
      });
      return c.json({ configured: true, name: member.name, classification, classificationLabel: CLASSIFICATIONS[classification].label, employmentType, dobMissing: !dob, claimsTaxFreeThreshold, bandLabels: BAND_LABELS, cycles: cyclesOut });
    } catch (e) { console.error("payroll/me failed", e); const status = e instanceof Error && /PIN|Unknown/.test(e.message) ? 401 : 500; return c.json({ error: String(e instanceof Error ? e.message : e) }, status); }
  });

  app.post(`${PREFIX}/payroll/void-shift`, async (c) => { try { const { pin, teamId, timecardId, note } = await c.req.json(); if (!teamId || !timecardId) return c.json({ error: "teamId and timecardId are required" }, 400); const db = supabaseAdmin(); const manager = await requireManagerPin(db, pin); const { error } = await db.from("tt_payroll_voided_shifts").upsert({ team_id: Number(teamId), timecard_id: String(timecardId), note: note || null, voided_by: manager.id }, { onConflict: "team_id,timecard_id" }); if (error) throw new Error(error.message); return c.json({ ok: true }); } catch (e) { console.error("payroll void-shift failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, pinErrorStatus(e)); } });
  app.post(`${PREFIX}/payroll/unvoid-shift`, async (c) => { try { const { pin, teamId, timecardId } = await c.req.json(); if (!teamId || !timecardId) return c.json({ error: "teamId and timecardId are required" }, 400); const db = supabaseAdmin(); await requireManagerPin(db, pin); const { error } = await db.from("tt_payroll_voided_shifts").delete().eq("team_id", Number(teamId)).eq("timecard_id", String(timecardId)); if (error) throw new Error(error.message); return c.json({ ok: true }); } catch (e) { console.error("payroll unvoid-shift failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, pinErrorStatus(e)); } });
  app.get(`${PREFIX}/payroll/voided-shifts`, async (c) => { try { const pin = c.req.query("pin"); const teamId = Number(c.req.query("teamId")); if (!teamId) return c.json({ error: "teamId is required" }, 400); const db = supabaseAdmin(); await requireManagerPin(db, pin); const { data, error } = await db.from("tt_payroll_voided_shifts").select("timecard_id, note, voided_at").eq("team_id", teamId).order("voided_at", { ascending: false }); if (error) throw new Error(error.message); return c.json({ voided: data ?? [] }); } catch (e) { console.error("payroll voided-shifts failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, pinErrorStatus(e)); } });
  app.get(`${PREFIX}/payroll/manager/staff`, async (c) => { try { const pin = c.req.query("pin"); const db = supabaseAdmin(); await requireManagerPin(db, pin); const [teamRes, profileRes] = await Promise.all([db.from("tt_team").select("id, name, avatar, role"), db.from("tt_payroll_profile").select("*")]); if (teamRes.error) throw new Error(teamRes.error.message); if (profileRes.error) throw new Error(profileRes.error.message); const profileByTeam = new Map((profileRes.data ?? []).map((p: any) => [p.team_id, p])); const today = brisbaneDateStr(); const staff = (teamRes.data ?? []).map((t: any) => { const profile: any = profileByTeam.get(t.id); return { teamId: t.id, name: t.name, avatar: t.avatar, role: t.role, classification: profile?.classification ?? null, classificationLabel: profile?.classification ? CLASSIFICATIONS[profile.classification as Classification].label : null, classificationLocked: !!profile?.classification, employmentType: profile?.employment_type ?? "casual", dob: profile?.dob ?? null, age: profile?.dob ? ageAt(profile.dob, today) : null, claimsTaxFreeThreshold: profile?.claims_tax_free_threshold ?? true }; }); return c.json({ staff, classifications: CLASSIFICATION_KEYS.map((k) => ({ key: k, label: CLASSIFICATIONS[k].label, minHourly: CLASSIFICATIONS[k].minHourly })) }); } catch (e) { console.error("payroll manager staff failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 401); } });
  app.post(`${PREFIX}/payroll/manager/classification`, async (c) => { try { const { pin, teamId, classification } = await c.req.json(); const db = supabaseAdmin(); await requireManagerPin(db, pin); if (!CLASSIFICATION_KEYS.includes(classification)) return c.json({ error: "Invalid classification" }, 400); const { data: existing } = await db.from("tt_payroll_profile").select("classification").eq("team_id", teamId).maybeSingle(); if (existing?.classification) return c.json({ error: "Classification is permanently locked and cannot be changed once set." }, 409); const { error } = await db.from("tt_payroll_profile").upsert({ team_id: teamId, classification }, { onConflict: "team_id" }); if (error) throw new Error(error.message); return c.json({ ok: true }); } catch (e) { console.error("set classification failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 400); } });
  app.post(`${PREFIX}/payroll/manager/employment-type`, async (c) => { try { const { pin, teamId, employmentType } = await c.req.json(); const db = supabaseAdmin(); await requireManagerPin(db, pin); if (!["casual", "part_time", "full_time"].includes(employmentType)) return c.json({ error: "Invalid employment type" }, 400); const { error } = await db.from("tt_payroll_profile").upsert({ team_id: teamId, employment_type: employmentType }, { onConflict: "team_id" }); if (error) throw new Error(error.message); return c.json({ ok: true }); } catch (e) { console.error("set employment type failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 400); } });
  app.post(`${PREFIX}/payroll/manager/dob`, async (c) => { try { const { pin, teamId, dob } = await c.req.json(); const db = supabaseAdmin(); await requireManagerPin(db, pin); if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return c.json({ error: "dob must be YYYY-MM-DD" }, 400); const { error } = await db.from("tt_payroll_profile").upsert({ team_id: teamId, dob }, { onConflict: "team_id" }); if (error) throw new Error(error.message); return c.json({ ok: true }); } catch (e) { console.error("set dob failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 400); } });
  app.post(`${PREFIX}/payroll/manager/tax-free-threshold`, async (c) => { try { const { pin, teamId, claimsTaxFreeThreshold } = await c.req.json(); const db = supabaseAdmin(); await requireManagerPin(db, pin); if (typeof claimsTaxFreeThreshold !== "boolean") return c.json({ error: "claimsTaxFreeThreshold must be a boolean" }, 400); const { error } = await db.from("tt_payroll_profile").upsert({ team_id: teamId, claims_tax_free_threshold: claimsTaxFreeThreshold }, { onConflict: "team_id" }); if (error) throw new Error(error.message); return c.json({ ok: true }); } catch (e) { console.error("set tax-free threshold failed", e); return c.json({ error: String(e instanceof Error ? e.message : e) }, 400); } });
}
