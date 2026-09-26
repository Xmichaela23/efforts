/**
 * A session's times as its source recorded them, under Garmin Connect's names (2026-09-26). The Garmin numbers are
 * the stored 2026-09-19 Edge 1040 ride's: timer total 8,109 s, and at its last sample timer 8,110, moving 8,083,
 * clock 8,636.
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/session-detail/session-times.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { sessionTimeRows, wantsStoredStreamTail } from './session-times.ts';
import { garminActivityTotals, garminTimeMetrics } from '../garmin/activity-totals.ts';

const pairs = (rows: ReturnType<typeof sessionTimeRows>) => (rows ?? []).map((r) => [r.label, r.display]);
const THREE = [['Time', '2:15:09'], ['Moving Time', '2:14:43'], ['Elapsed Time', '2:23:56']];

Deno.test('a Garmin ride saved today prints Time, Moving Time and Elapsed Time, in that order', () => {
  const row = {
    type: 'ride', source: 'garmin', garmin_activity_id: '24425049254-detail',
    metrics: { total_timer_time_seconds: 8109, moving_time_seconds: 8083, total_elapsed_time_seconds: 8636 },
  };
  assertEquals(pairs(sessionTimeRows(row)), THREE);
  assertEquals(sessionTimeRows(row)?.map((r) => r.seconds), [8109, 8083, 8636]);
  assertEquals(wantsStoredStreamTail(row), false);
});

Deno.test("from Garmin's payload to the screen: what ingest-activity saves is what both tabs print", () => {
  const summary = { durationInSeconds: 8109, totalElevationLossInMeters: 580 };
  const samples = [
    { timerDurationInSeconds: 0, movingDurationInSeconds: 0, clockDurationInSeconds: 0 },
    { timerDurationInSeconds: 8110, movingDurationInSeconds: 8083, clockDurationInSeconds: 8636 },
  ];
  const metrics = garminTimeMetrics(garminActivityTotals(summary, samples));
  assertEquals(metrics, {
    total_timer_time_seconds: 8109, total_timer_time: 135,
    moving_time_seconds: 8083, moving_time: 134,
    total_elapsed_time_seconds: 8636, total_elapsed_time: 143,
  });
  assertEquals(pairs(sessionTimeRows({ type: 'ride', source: 'garmin', metrics })), THREE);
});

Deno.test("a Garmin ride saved before today: Time from its stored key, Moving and Elapsed from Garmin's counters at the last stored sample", () => {
  // The old ingest filed the summary's durationInSeconds under the elapsed key; the minute columns are not read.
  const row = {
    type: 'ride', source: 'garmin', moving_time: 134, elapsed_time: 143,
    metrics: JSON.stringify({ total_elapsed_time: 135, total_elapsed_time_seconds: 8109 }),
  };
  assertEquals(wantsStoredStreamTail(row), true);
  // The webhook's stored copy of the last sample.
  const tail = { timestamp: 1789855905, timerDuration: 8110, movingDuration: 8083, clockDuration: 8636, bikeCadence: 91 };
  assertEquals(pairs(sessionTimeRows(row, tail)), THREE);
  // Garmin's own keys, when the stream was stored as Garmin sent it.
  const rawTail = { timerDurationInSeconds: 8110, movingDurationInSeconds: 8083, clockDurationInSeconds: 8636 };
  assertEquals(pairs(sessionTimeRows(row, rawTail)), THREE);
  // No stored sample: only the one number the row holds.
  assertEquals(pairs(sessionTimeRows(row, null)), [['Time', '2:15:09']]);
});

Deno.test('a Garmin run reads the same way, saved today or before', () => {
  const today = { type: 'run', source: 'garmin', metrics: { total_timer_time_seconds: 2712, moving_time_seconds: 2650, total_elapsed_time_seconds: 2790 } };
  assertEquals(pairs(sessionTimeRows(today)), [['Time', '45:12'], ['Moving Time', '44:10'], ['Elapsed Time', '46:30']]);
  const before = { type: 'run', source: 'garmin', metrics: { total_elapsed_time_seconds: 2712 } };
  assertEquals(pairs(sessionTimeRows(before, { timerDuration: 2712, movingDuration: 2650, clockDuration: 2790 })),
    [['Time', '45:12'], ['Moving Time', '44:10'], ['Elapsed Time', '46:30']]);
  assertEquals(wantsStoredStreamTail({ ...before, type: 'walk' }), true);
});

Deno.test('Strava sends Moving Time and Elapsed Time, no timer — rides and runs alike', () => {
  const ride = { type: 'ride', source: 'strava', strava_activity_id: 123, metrics: { moving_time_seconds: 3757, elapsed_time_seconds: 4102 } };
  assertEquals(pairs(sessionTimeRows(ride)), [['Moving Time', '1:02:37'], ['Elapsed Time', '1:08:22']]);
  const run = { ...ride, type: 'run' };
  assertEquals(pairs(sessionTimeRows(run)), [['Moving Time', '1:02:37'], ['Elapsed Time', '1:08:22']]);
  assertEquals(wantsStoredStreamTail(run), false);
});

Deno.test("a FIT file prints the file's timer and elapsed totals, and never its timer as a moving time", () => {
  const row = {
    type: 'run', source: null, total_timer_time: 2700, total_elapsed_time: 2855,
    metrics: { moving_time_seconds: 2700, elapsed_time_seconds: 2855 },
  };
  assertEquals(pairs(sessionTimeRows(row)), [['Time', '45:00'], ['Elapsed Time', '47:35']]);
});

Deno.test('a missing time is left out, never worked out; typed by hand has no rows; a swim or a lift is not these rows', () => {
  const garminNoClock = sessionTimeRows({ type: 'ride', source: 'garmin', metrics: { total_timer_time_seconds: 3600 } });
  assertEquals(pairs(garminNoClock), [['Time', '1:00:00']]);
  const strava = sessionTimeRows({ type: 'run', source: 'strava', metrics: { moving_time_seconds: 3600 } });
  assertEquals(pairs(strava), [['Moving Time', '1:00:00']]);
  assertEquals(sessionTimeRows({ type: 'ride', source: 'manual', moving_time: 60, duration: 60 }), []);
  assertEquals(sessionTimeRows({ type: 'swim', source: 'garmin', metrics: { total_timer_time_seconds: 1800 } }), null);
  assertEquals(sessionTimeRows({ type: 'strength', source: 'garmin' }), null);
  assertEquals(wantsStoredStreamTail({ type: 'swim', source: 'garmin', metrics: {} }), false);
});
