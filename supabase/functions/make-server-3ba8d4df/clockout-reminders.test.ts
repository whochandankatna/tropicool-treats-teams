import { autoClockoutDue, dueReminderKinds, matchesOpenTimecard, validActualFinish, writableTimecard } from "./clockout-reminders.ts";
import { clockInGeofenceResult, distanceMetres } from "./geofence.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

Deno.test("reminders occur only in their five-minute windows", () => {
  const end = Date.parse("2026-09-12T08:00:00Z");
  const minute = 60_000;
  equal(dueReminderKinds(end - 10 * minute, end), ["before_10"]);
  equal(dueReminderKinds(end, end), ["at_end"]);
  equal(dueReminderKinds(end + 30 * minute, end), ["after_30"]);
  equal(dueReminderKinds(end + 35 * minute, end), []);
  equal(autoClockoutDue(end + 59 * minute, end), false);
  equal(autoClockoutDue(end + 60 * minute, end), true);
  equal(autoClockoutDue(end + 65 * minute, end), false);
});

Deno.test("an unrelated older timecard does not match a shift", () => {
  const start = Date.parse("2026-09-12T02:00:00Z");
  const end = Date.parse("2026-09-12T08:00:00Z");
  equal(matchesOpenTimecard(start - 3 * 60 * 60_000, start, end), false);
  equal(matchesOpenTimecard(start - 60 * 60_000, start, end), true);
  equal(matchesOpenTimecard(start + 3 * 60 * 60_000, start, end), false);
  equal(matchesOpenTimecard(end + 1, start, end), false);
});

Deno.test("automatic closure keeps wage and finishes an open break", () => {
  const result = writableTimecard({ id: "tc", location_id: "loc", team_member_id: "tm", start_at: "2026-09-12T02:00:00Z", version: 7, wage: { hourly_rate: { amount: 2500, currency: "AUD" } }, breaks: [{ id: "br", start_at: "2026-09-12T07:00:00Z", break_type_id: "bt", name: "Meal", expected_duration: "PT30M", is_paid: false }] }, "2026-09-12T09:00:00Z");
  equal(result.end_at, "2026-09-12T09:00:00Z");
  equal("status" in result, false);
  equal(result.version, 7);
  equal(result.breaks[0].end_at, "2026-09-12T09:00:00Z");
  equal(result.wage.hourly_rate.amount, 2500);
});

Deno.test("200 m geofence fails closed for missing or inaccurate location", async () => {
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { enabled: true, lat: -27.47, lng: 153.02 }, error: null }) }) }) }) };
  equal(await clockInGeofenceResult(db, undefined, undefined, undefined) !== null, true);
  equal(await clockInGeofenceResult(db, -27.47, 153.02, 201) !== null, true);
  equal(await clockInGeofenceResult(db, -27.47, 153.02, 10), null);
  equal(distanceMetres(-27.47, 153.02, -27.47, 153.02), 0);
});

Deno.test("a manager correction accepts verified work time but rejects future or pre-shift times", () => {
  const start = Date.parse("2026-09-12T02:00:00Z");
  const end = Date.parse("2026-09-12T08:00:00Z");
  const now = Date.parse("2026-09-12T10:00:00Z");
  equal(validActualFinish(end, start, end, now), true);
  equal(validActualFinish(end + 90 * 60_000, start, end, now), true);
  equal(validActualFinish(start - 1, start, end, now), false);
  equal(validActualFinish(now + 1, start, end, now), false);
});
