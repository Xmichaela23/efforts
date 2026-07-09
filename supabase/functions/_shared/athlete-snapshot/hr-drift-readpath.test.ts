/**
 * D-264 step 0 (Item 3 prerequisite): the cardiac read-path fix.
 * Proves buildActualSession reads the REAL HR-drift signal from where the analyzer
 * writes it (nested), not the phantom top-level `decoupling_pct` it read before —
 * grounded on the primary user's exact 7/5 run row shape (drift = 1).
 * Run: deno test supabase/functions/_shared/athlete-snapshot/hr-drift-readpath.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildActualSession } from './daily-ledger.ts';

Deno.test('reads hr_drift_bpm from granular_analysis (Michael 7/5 shape, drift=1)', () => {
  const row = {
    id: 'w1', type: 'run', date: '2026-07-05', workout_status: 'completed',
    workout_analysis: { granular_analysis: { heart_rate_analysis: { hr_drift_bpm: 1 } } },
  };
  const s = buildActualSession(row, false);
  assertEquals(s.hr_drift_bpm, 1);
  assertEquals(s.decoupling_pct, null); // decoupling % genuinely absent — not the source
});

Deno.test('phantom top-level decoupling_pct is NOT the source (nested drift still read)', () => {
  const row = { id: 'w2', type: 'run', date: 'x', workout_analysis: { decoupling_pct: null, granular_analysis: { heart_rate_analysis: { hr_drift_bpm: 6 } } } };
  assertEquals(buildActualSession(row, false).hr_drift_bpm, 6);
});

Deno.test('fallback keys: detailed_analysis.workout_summary.hr_drift / heart_rate_summary.drift_bpm', () => {
  assertEquals(buildActualSession({ id: 'a', type: 'run', date: 'x', workout_analysis: { detailed_analysis: { workout_summary: { hr_drift: 11 } } } }, false).hr_drift_bpm, 11);
  assertEquals(buildActualSession({ id: 'b', type: 'ride', date: 'x', workout_analysis: { heart_rate_summary: { drift_bpm: -8 } } }, false).hr_drift_bpm, -8);
});

Deno.test('no cardiac data at all → null (strength / pool swim)', () => {
  assertEquals(buildActualSession({ id: 'c', type: 'strength', date: 'x', workout_analysis: {} }, false).hr_drift_bpm, null);
  assertEquals(buildActualSession({ id: 'd', type: 'swim', date: 'x', workout_analysis: null }, false).hr_drift_bpm, null);
});
