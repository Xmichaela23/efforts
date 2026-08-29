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
    { date: '2026-07-18', efficiency_index: 1.57, gap_efficiency_index: 1.55, hr_avg: 138, workout_type: 'easy',  duration_minutes: 50 }, // recent-2
  ];
  const r = recentEfficiencyPaceHr(rows, AS_OF);
  // raw uses efficiency_index; gap uses gap_efficiency_index — over the last two runs
  assertAlmostEquals(r.paceSecPerKm!, (100000 / (1.62 * 140) + 100000 / (1.57 * 138)) / 2, 0.01);
  assertAlmostEquals(r.gapPaceSecPerKm!, (100000 / (1.60 * 140) + 100000 / (1.55 * 138)) / 2, 0.01);
  assertEquals(r.hrAvg, 139); // round((140+138)/2)
  assertEquals(r.runs, 3);    // count is the whole in-window EASY-group pool
  // ⚠️ The third row said `long` until 2026-08-28, when `long` became its OWN comparison group
  // (work order item 2). It is `easy` here because this test is about the raw-vs-GAP toggle, and
  // leaving it in another group would have shrunk the pool for an unrelated reason.
});

Deno.test('⛔ READS ITS GROUP, NOT A DURATION BAND — the receipt matches the verdict', () => {
  /**
   * ⚠️ REWRITTEN 2026-08-28 (work order item 2). It pinned an interval EXCLUSION and a 30-70 minute
   * band; both are gone. What survives — and is the reason this function has a group argument at all
   * — is that the RECEIPT must read the same pool as the VERDICT. When they diverged, the shipped row
   * printed *"pace ~13:32/mi at 140 bpm"* under a verdict cleaned of exactly the 146 bpm hill session
   * that produced the 140. **The clean number vouching for the dirty one.**
   */
  const rows = [
    { date: '2026-07-05', efficiency_index: 1.60, hr_avg: 150, workout_type: 'interval', duration_minutes: 45 },
    { date: '2026-07-12', efficiency_index: 1.58, hr_avg: 139, workout_type: 'easy',     duration_minutes: 22 }, // was dropped: under the floor
    { date: '2026-07-16', efficiency_index: 1.56, hr_avg: 138, workout_type: 'easy',     duration_minutes: 48 },
  ];
  // ⛔ THE 22-MINUTE RUN IS IN. It was binned by the floor; his real week is mostly runs this length.
  const easy = recentEfficiencyPaceHr(rows, AS_OF);
  assertEquals(easy.runs, 2);
  assertAlmostEquals(easy.paceSecPerKm!, (100000 / (1.58 * 139) + 100000 / (1.56 * 138)) / 2, 0.01);
  // ⛔ AND THE INTERVAL IS NOT DELETED — it is read in its own group, where its 150 bpm belongs.
  const quality = recentEfficiencyPaceHr(rows, AS_OF, 42, 2, 'quality');
  assertEquals(quality.runs, 1);
  assertEquals(quality.hrAvg, 150);
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
