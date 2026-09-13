export const CLASSIFICATIONS = {
  level_1: { label: "Fast Food Employee Level 1", minHourly: 26.55 },
  level_2: { label: "Fast Food Employee Level 2", minHourly: 28.12 },
  level_3_solo: { label: "Fast Food Employee Level 3 — in charge of 0–1 people", minHourly: 28.55 },
  level_3_responsible: { label: "Fast Food Employee Level 3 — in charge of 2+ people", minHourly: 28.90 },
} as const;
export type Classification = keyof typeof CLASSIFICATIONS;
export const CLASSIFICATION_KEYS = Object.keys(CLASSIFICATIONS) as Classification[];
export type EmploymentType = "casual" | "part_time" | "full_time";
const JUNIOR_BRACKETS: [maxAge: number, pct: number][] = [[15, 40], [16, 50], [17, 60], [18, 70], [19, 80], [20, 90]];
function juniorPct(age: number): number { for (const [maxAge, pct] of JUNIOR_BRACKETS) if (age <= maxAge) return pct; return 100; }
export type Band = "ordinary" | "eveningEarly" | "eveningLate" | "saturday" | "sundayL1" | "sundayL23" | "publicHoliday";
export const BAND_LABELS: Record<Band, string> = { ordinary: "Ordinary", eveningEarly: "Evening", eveningLate: "Evening", saturday: "Saturday", sundayL1: "Sunday", sundayL23: "Sunday", publicHoliday: "Public holiday" };
const FTPT_PCT: Record<Band, number> = { ordinary: 100, eveningEarly: 110, eveningLate: 115, saturday: 125, sundayL1: 125, sundayL23: 150, publicHoliday: 225 };
const CASUAL_LOADING_PCT = 25;
function bandPct(band: Band, employmentType: EmploymentType): number { const base = FTPT_PCT[band]; return employmentType === "casual" ? base + CASUAL_LOADING_PCT : base; }
function sundayBand(classification: Classification): Band { return classification === "level_1" ? "sundayL1" : "sundayL23"; }
export function minHourlyRate(classification: Classification, age: number): number { return CLASSIFICATIONS[classification].minHourly * (juniorPct(age) / 100); }
export function ageAt(dob: string, atDateStr: string): number { const [by, bm, bd] = dob.split("-").map(Number); const [ay, am, ad] = atDateStr.split("-").map(Number); let age = ay - by; if (am < bm || (am === bm && ad < bd)) age--; return age; }
const BRIS_OFFSET_MIN = 10 * 60;
function brisbaneParts(iso: string): { dateStr: string; minutesOfDay: number } { const brisMs = new Date(iso).getTime() + BRIS_OFFSET_MIN * 60000; const d = new Date(brisMs); return { dateStr: d.toISOString().slice(0, 10), minutesOfDay: d.getUTCHours() * 60 + d.getUTCMinutes() }; }
function dayOfWeek(dateStr: string): number { return new Date(`${dateStr}T00:00:00Z`).getUTCDay(); }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function timeToMin(t: string): number { const [hh, mm] = t.split(":").map(Number); return hh * 60 + mm; }
export interface PublicHoliday { date: string; name: string; startTime: string | null; endTime: string | null }
function splitAtBrisbaneMidnight(startIso: string, endIso: string) { const segments: { dateStr: string; startMin: number; endMin: number }[] = []; let cursor = new Date(startIso).getTime(); const endMs = new Date(endIso).getTime(); while (cursor < endMs) { const { dateStr, minutesOfDay } = brisbaneParts(new Date(cursor).toISOString()); const minutesLeftInDay = 24 * 60 - minutesOfDay; const segEndMs = Math.min(cursor + minutesLeftInDay * 60000, endMs); const segEndMin = minutesOfDay + (segEndMs - cursor) / 60000; segments.push({ dateStr, startMin: minutesOfDay, endMin: segEndMin }); cursor = segEndMs; } return segments; }
function phWindowsForDate(dateStr: string, holidays: Map<string, PublicHoliday[]>) { const list = holidays.get(dateStr); if (!list || list.length === 0) return [] as { startMin: number; endMin: number }[]; return list.map((h) => ({ startMin: h.startTime ? timeToMin(h.startTime) : 0, endMin: h.endTime ? timeToMin(h.endTime) : 1440 })); }
function splitDaySegment(dateStr: string, startMin: number, endMin: number, classification: Classification, holidays: Map<string, PublicHoliday[]>): { band: Band; minutes: number }[] { const phWindows = phWindowsForDate(dateStr, holidays); const dow = dayOfWeek(dateStr); const cuts = new Set<number>([startMin, endMin]); for (const w of phWindows) { cuts.add(clamp(w.startMin, startMin, endMin)); cuts.add(clamp(w.endMin, startMin, endMin)); } const points = [...cuts].sort((a, b) => a - b); const chunks: { band: Band; minutes: number }[] = []; for (let i = 0; i < points.length - 1; i++) { const a = points[i], b = points[i + 1]; if (b <= a) continue; const mid = (a + b) / 2; const isPH = phWindows.some((w) => mid >= w.startMin && mid < w.endMin); let band: Band; if (isPH) band = "publicHoliday"; else if (dow === 6) band = "saturday"; else if (dow === 0) band = sundayBand(classification); else band = "ordinary"; chunks.push({ band, minutes: b - a }); } return chunks; }
export const ZERO_BANDS: Record<Band, number> = { ordinary: 0, eveningEarly: 0, eveningLate: 0, saturday: 0, sundayL1: 0, sundayL23: 0, publicHoliday: 0 };
export interface ShiftBandResult { bandMinutes: Record<Band, number>; bandPayCents: Record<Band, number>; totalMinutes: number; totalPayCents: number }
export function computeShiftBands(startIso: string, endIso: string, classification: Classification, employmentType: EmploymentType, dob: string | null, holidays: Map<string, PublicHoliday[]>, squareHourlyRateCents?: number | null): ShiftBandResult {
  const segments = splitAtBrisbaneMidnight(startIso, endIso);
  const bandMinutes: Record<Band, number> = { ...ZERO_BANDS };
  const bandPay: Record<Band, number> = { ...ZERO_BANDS };
  for (const seg of segments) {
    const age = dob ? ageAt(dob, seg.dateStr) : 21;
    const minRate = minHourlyRate(classification, age);
    const floorRate = squareHourlyRateCents != null ? Math.max(minRate, squareHourlyRateCents / 100) : minRate;
    const chunks = splitDaySegment(seg.dateStr, seg.startMin, seg.endMin, classification, holidays);
    for (const { band, minutes } of chunks) { const rate = floorRate * (bandPct(band, employmentType) / 100); bandMinutes[band] += minutes; bandPay[band] += rate * (minutes / 60); }
  }
  const totalMinutes = Object.values(bandMinutes).reduce((a, b) => a + b, 0);
  const bandPayCents: Record<Band, number> = { ...ZERO_BANDS };
  for (const band of Object.keys(bandPay) as Band[]) bandPayCents[band] = Math.round(bandPay[band] * 100);
  const totalPayCents = Object.values(bandPayCents).reduce((a, b) => a + b, 0);
  return { bandMinutes, bandPayCents, totalMinutes, totalPayCents };
}
const CYCLE_ANCHOR = "2026-08-03";
const CYCLE_DAYS = 14;
function daysBetween(aDateStr: string, bDateStr: string): number { const a = new Date(`${aDateStr}T00:00:00Z`).getTime(); const b = new Date(`${bDateStr}T00:00:00Z`).getTime(); return Math.round((b - a) / 86400000); }
function cycleByIndex(index: number): { start: string; end: string; index: number } { const startMs = new Date(`${CYCLE_ANCHOR}T00:00:00Z`).getTime() + index * CYCLE_DAYS * 86400000; const start = new Date(startMs).toISOString().slice(0, 10); const end = new Date(startMs + (CYCLE_DAYS - 1) * 86400000).toISOString().slice(0, 10); return { start, end, index }; }
export function cycleForDate(dateStr: string): { start: string; end: string; index: number } { const index = Math.floor(daysBetween(CYCLE_ANCHOR, dateStr) / CYCLE_DAYS); return cycleByIndex(index); }
export function recentCycles(count: number, fromDateStr: string) { const current = cycleForDate(fromDateStr); const list: { start: string; end: string; index: number }[] = []; for (let i = 0; i < count; i++) list.push(cycleByIndex(current.index - i)); return list; }
interface TaxBracket { upperExclusive: number; a: number | null; b: number }
const SCALE_1_NO_THRESHOLD: TaxBracket[] = [ { upperExclusive: 150, a: 0.1600, b: 0.1600 }, { upperExclusive: 371, a: 0.2117, b: 7.7550 }, { upperExclusive: 515, a: 0.1890, b: -0.6702 }, { upperExclusive: 932, a: 0.3227, b: 68.2367 }, { upperExclusive: 2246, a: 0.3200, b: 65.7202 }, { upperExclusive: 3303, a: 0.3900, b: 222.9510 }, { upperExclusive: Infinity, a: 0.4700, b: 487.2587 } ];
const SCALE_2_WITH_THRESHOLD: TaxBracket[] = [ { upperExclusive: 361, a: null, b: 0 }, { upperExclusive: 500, a: 0.1600, b: 57.8462 }, { upperExclusive: 625, a: 0.2600, b: 107.8462 }, { upperExclusive: 721, a: 0.1800, b: 57.8462 }, { upperExclusive: 865, a: 0.1890, b: 64.3365 }, { upperExclusive: 1282, a: 0.3227, b: 180.0385 }, { upperExclusive: 2596, a: 0.3200, b: 176.5769 }, { upperExclusive: 3653, a: 0.3900, b: 358.3077 }, { upperExclusive: Infinity, a: 0.4700, b: 650.6154 } ];
function atoRoundToDollar(y: number): number { return Math.floor(y + 0.5); }
function weeklyWithholding(x: number, claimsTaxFreeThreshold: boolean): number { const table = claimsTaxFreeThreshold ? SCALE_2_WITH_THRESHOLD : SCALE_1_NO_THRESHOLD; const bracket = table.find((br) => x < br.upperExclusive) ?? table[table.length - 1]; if (bracket.a == null) return 0; return atoRoundToDollar(bracket.a * x - bracket.b); }
export function estimateFortnightlyWithholdingCents(fortnightlyGrossCents: number, claimsTaxFreeThreshold: boolean): number { if (fortnightlyGrossCents <= 0) return 0; const fortnightlyGross = fortnightlyGrossCents / 100; const weeklyEquivalentWhole = Math.floor(fortnightlyGross / 2); const x = weeklyEquivalentWhole + 0.99; const weeklyY = weeklyWithholding(x, claimsTaxFreeThreshold); const fortnightlyWithholding = weeklyY * 2; return Math.round(fortnightlyWithholding * 100); }
