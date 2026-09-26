/**
 * Garmin's own totals for one activity (2026-09-26). The numbers are the stored 2026-09-19 Edge 1040 ride's
 * (`garmin_activities.raw_data`): summary `durationInSeconds` 8,109, descent 580 m, ascent 622 m; last sample timer
 * 8,110, moving 8,083, clock 8,636.
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/garmin/activity-totals.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { garminActivityTotals } from './activity-totals.ts';

const summary = {
  durationInSeconds: 8109,
  distanceInMeters: 46316.15,
  totalElevationGainInMeters: 622,
  totalElevationLossInMeters: 580,
};
const rawSamples = [
  { startTimeInSeconds: 1789847269, timerDurationInSeconds: 0, movingDurationInSeconds: 0, clockDurationInSeconds: 0 },
  { startTimeInSeconds: 1789851000, timerDurationInSeconds: 3700, movingDurationInSeconds: 3690, clockDurationInSeconds: 3731 },
  { startTimeInSeconds: 1789855905, timerDurationInSeconds: 8110, movingDurationInSeconds: 8083, clockDurationInSeconds: 8636 },
];

Deno.test("Garmin's three times: the summary's timer total, the last sample's moving and clock", () => {
  const t = garminActivityTotals(summary, rawSamples);
  assertEquals(t.time_s, 8109);
  assertEquals(t.moving_s, 8083);
  assertEquals(t.elapsed_s, 8636);
});

Deno.test("Garmin's descent and ascent are the summary's, as sent", () => {
  const t = garminActivityTotals(summary, rawSamples);
  assertEquals(t.descent_m, 580);
  assertEquals(t.ascent_m, 622);
});

Deno.test("the webhook's stored copies of the samples read the same", () => {
  const stored = rawSamples.map((s) => ({ timerDuration: s.timerDurationInSeconds || null, movingDuration: s.movingDurationInSeconds || null, clockDuration: s.clockDurationInSeconds || null }));
  const t = garminActivityTotals(summary, stored);
  assertEquals([t.time_s, t.moving_s, t.elapsed_s], [8109, 8083, 8636]);
});

Deno.test('with no summary timer, the last sample carrying one gives it; a figure Garmin did not send stays empty', () => {
  const tail = [...rawSamples, { startTimeInSeconds: 1789855906, heartRate: 140 }];
  const t = garminActivityTotals({}, tail);
  assertEquals(t.time_s, 8110);
  assertEquals(t.moving_s, 8083);
  assertEquals(t.elapsed_s, 8636);
  assertEquals(t.descent_m, null);
  // No samples at all: only the summary's timer, nothing worked out for moving or elapsed.
  const bare = garminActivityTotals({ durationInSeconds: 3600 }, null);
  assertEquals(bare, { time_s: 3600, moving_s: null, elapsed_s: null, ascent_m: null, descent_m: null });
});

Deno.test('a flat ride reports a descent of 0, which is kept', () => {
  assertEquals(garminActivityTotals({ totalElevationLossInMeters: 0 }, []).descent_m, 0);
});
