/**
 * D-264 step 0 (Item 3 prerequisite): the cardiac read-path fix — and, since 2026-09-26, THE ONE DRIFT.
 * buildActualSession reads heart-rate drift in beats from `hr_drift_v1` (the analysers' halves-by-time measure the
 * Performance screen prints: second half's average minus the first's), never the analysers' early-vs-late window
 * `heart_rate_analysis.hr_drift_bpm` nor the phantom top-level `decoupling_pct`.
 * Run: deno test supabase/functions/_shared/athlete-snapshot/hr-drift-readpath.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildActualSession } from './daily-ledger.ts';

const v1 = (first: number, second: number) => ({
  pct: Math.round(((second - first) / first) * 1000) / 10, first_avg_hr: first, second_avg_hr: second,
  seconds: 2400, basis: 'hr', method: 'halves_by_time',
});

Deno.test('ONE DRIFT: the ledger reads hr_drift_v1 in beats, not the early/late window beside it', () => {
  const row = {
    id: 'w1', type: 'run', date: '2026-07-05', workout_status: 'completed',
    workout_analysis: {
      hr_drift_v1: v1(140, 146),
      granular_analysis: { heart_rate_analysis: { hr_drift_bpm: 11 } }, // the second drift — must not be read
    },
  };
  const s = buildActualSession(row, false);
  assertEquals(s.hr_drift_bpm, 6);
  assertEquals(s.decoupling_pct, null); // decoupling % genuinely absent — not the source
});

Deno.test('ONE DRIFT: a real 0-beat drift is kept, not dropped as missing', () => {
  const row = { id: 'w2', type: 'run', date: 'x', workout_analysis: { decoupling_pct: null, hr_drift_v1: v1(150, 150) } };
  assertEquals(buildActualSession(row, false).hr_drift_bpm, 0);
});

Deno.test('ONE DRIFT: the old storage paths alone are not read', () => {
  assertEquals(buildActualSession({ id: 'a', type: 'run', date: 'x', workout_analysis: { granular_analysis: { heart_rate_analysis: { hr_drift_bpm: 1 } } } }, false).hr_drift_bpm, null);
  assertEquals(buildActualSession({ id: 'b', type: 'run', date: 'x', workout_analysis: { detailed_analysis: { workout_summary: { hr_drift: 11 } } } }, false).hr_drift_bpm, null);
  assertEquals(buildActualSession({ id: 'c', type: 'ride', date: 'x', workout_analysis: { heart_rate_summary: { drift_bpm: -8 } } }, false).hr_drift_bpm, null);
});

Deno.test('no cardiac data at all → null (strength / pool swim)', () => {
  assertEquals(buildActualSession({ id: 'c', type: 'strength', date: 'x', workout_analysis: {} }, false).hr_drift_bpm, null);
  assertEquals(buildActualSession({ id: 'd', type: 'swim', date: 'x', workout_analysis: null }, false).hr_drift_bpm, null);
});
