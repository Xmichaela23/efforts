/**
 * Pace-at-HR companion line (Michael 2026-07-22, "another line for pace"). The RUN row's efficiency index
 * is a fitness signal but "1.55" means nothing to a human — so the row also shows the recent steady-run
 * pace + HR behind it. recentEfficiencyPaceHr DERIVES the pace from the SAME index the verdict reads
 * (gap_efficiency_index ?? efficiency_index) and hr_avg, so the two lines can never disagree:
 *   index = (1000/pace)/hr × 100   ⇒   pace_s_per_km = 100000 / (index × hr)
 *
 * These pin: the exact derivation, the endpoint (last-2) averaging that matches classifyTrend's recentAvg,
 * the steady/duration gate (intervals + out-of-band durations excluded), and the raw fallback.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/state-trend/run-efficiency-pace.test.ts --no-check
 */
import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { recentEfficiencyPaceHr } from './run.ts';

const AS_OF = '2026-07-22';

Deno.test('shows RAW pace by default, carries the grade-adjusted twin for the toggle', () => {
  const rows = [
    { date: '2026-06-20', efficiency_index: 1.68, gap_efficiency_index: 1.70, hr_avg: 142, workout_type: 'easy', duration_minutes: 45 },
    { date: '2026-07-10', efficiency_index: 1.62, gap_efficiency_index: 1.60, hr_avg: 140, workout_type: 'easy', duration_minutes: 45 }, // recent-2
    { date: '2026-07-18', efficiency_index: 1.57, gap_efficiency_index: 1.55, hr_avg: 138, workout_type: 'long',  duration_minutes: 50 }, // recent-2
  ];
  const r = recentEfficiencyPaceHr(rows, AS_OF);
  // raw uses efficiency_index; gap uses gap_efficiency_index — over the last two runs
  assertAlmostEquals(r.paceSecPerKm!, (100000 / (1.62 * 140) + 100000 / (1.57 * 138)) / 2, 0.01);
  assertAlmostEquals(r.gapPaceSecPerKm!, (100000 / (1.60 * 140) + 100000 / (1.55 * 138)) / 2, 0.01);
  assertEquals(r.hrAvg, 139); // round((140+138)/2)
  assertEquals(r.runs, 3);    // count is the whole in-window steady pool
});

Deno.test('excludes interval + out-of-band-duration runs (same gate as the efficiency trend)', () => {
  const rows = [
    { date: '2026-07-05', efficiency_index: 1.60, hr_avg: 140, workout_type: 'interval', duration_minutes: 45 }, // interval → out
    { date: '2026-07-12', efficiency_index: 1.58, hr_avg: 139, workout_type: 'easy',     duration_minutes: 22 }, // too short → out
    { date: '2026-07-16', efficiency_index: 1.56, hr_avg: 138, workout_type: 'easy',     duration_minutes: 48 }, // counts
  ];
  const r = recentEfficiencyPaceHr(rows, AS_OF);
  assertEquals(r.runs, 1);
  assertAlmostEquals(r.paceSecPerKm!, 100000 / (1.56 * 138), 0.01);
  assertEquals(r.hrAvg, 138);
});

Deno.test('no GAP on a recent run → gapPaceSecPerKm null (no toggle, never a half-adjusted average)', () => {
  const rows = [
    { date: '2026-07-14', efficiency_index: 1.50, hr_avg: 135, workout_type: 'easy', duration_minutes: 40 }, // no gap index
  ];
  const r = recentEfficiencyPaceHr(rows, AS_OF);
  assertAlmostEquals(r.paceSecPerKm!, 100000 / (1.50 * 135), 0.01);
  assertEquals(r.gapPaceSecPerKm, null); // raw shows; toggle suppressed
  assertEquals(r.hrAvg, 135);
});

Deno.test('no usable steady runs → nulls, never a crash', () => {
  const r = recentEfficiencyPaceHr([], AS_OF);
  assertEquals(r, { paceSecPerKm: null, gapPaceSecPerKm: null, hrAvg: null, runs: 0 });
  const r2 = recentEfficiencyPaceHr([{ date: '2026-07-14', efficiency_index: 1.5, hr_avg: 0, workout_type: 'easy', duration_minutes: 45 }], AS_OF);
  assertEquals(r2.runs, 0); // hr_avg 0 → dropped
});
