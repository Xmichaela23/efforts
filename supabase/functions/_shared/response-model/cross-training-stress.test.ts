/**
 * Fixture for the D-236 Part C RPE-signal dedup: crossTrainingStressReceipt.
 *
 * The State BODY "Cross-training" row was restating the same avg-RPE delta as the
 * "How hard it feels" row whenever RPE was the only real signal — because the ≥2
 * stress gate was met by `bodyConcerned` double-counting the same elevated RPE.
 * This pins: RPE-sole → suppressed; RPE + one other → fires with both; non-RPE
 * single → fires unchanged; and that bodyConcerned alone can no longer double-
 * count with rpeRising into a row.
 *
 * Run from repo root:
 *   deno test supabase/functions/_shared/response-model/cross-training-stress.test.ts --no-check
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { crossTrainingStressReceipt } from './readiness-receipts.ts';

const RPE = { current: 4.8, baseline: 4.3 };
const base = {
  rpeRising: false, driftWorsening: false, strengthFading: false,
  rirDropping: false, bodyConcerned: false, rpe: RPE,
};

Deno.test('RPE-sole (rpeRising + bodyConcerned, nothing else) → row SUPPRESSED', () => {
  // The exact screenshot case: ≥2 gate met only via the bodyConcerned double-count
  // of RPE. "How hard it feels" already carries "avg 4.8 vs your typical 4.3".
  const r = crossTrainingStressReceipt({ ...base, rpeRising: true, bodyConcerned: true });
  assertEquals(r, null);
});

Deno.test('bodyConcerned can no longer double-count with rpeRising into a row', () => {
  // Even though [rpeRising, bodyConcerned] = 2 signals, no distinct second signal
  // exists → no standalone "Effort up (4.8 vs 4.3)" row.
  assertEquals(crossTrainingStressReceipt({ ...base, rpeRising: true, bodyConcerned: true }), null);
  // And RPE with NO bodyConcerned is only 1 signal → below the gate → null anyway.
  assertEquals(crossTrainingStressReceipt({ ...base, rpeRising: true }), null);
});

Deno.test('RPE + one other distinct signal → row FIRES with both factors', () => {
  const r = crossTrainingStressReceipt({
    ...base, rpeRising: true, strengthFading: true, bodyConcerned: true,
  });
  assertEquals(r, { label: 'Effort up (4.8 vs 4.3) + strength fading', tone: 'warning' });
});

Deno.test('non-RPE single distinct signal (strength) → row FIRES unchanged, no false "effort up"', () => {
  // strengthFading + bodyConcerned = 2; rpeRising false → not the dedup case.
  const r = crossTrainingStressReceipt({
    ...base, strengthFading: true, bodyConcerned: true,
  });
  assertEquals(r, { label: 'Strength fading', tone: 'warning' });
});

Deno.test('two non-RPE distinct signals → fires with both, RPE untouched', () => {
  const r = crossTrainingStressReceipt({
    ...base, driftWorsening: true, rirDropping: true,
  });
  assertEquals(r, { label: 'HR drift rising + reps-in-reserve dropping', tone: 'warning' });
});

Deno.test('below the gate (< 2 signals) → null', () => {
  assertEquals(crossTrainingStressReceipt({ ...base, strengthFading: true }), null);
  assertEquals(crossTrainingStressReceipt({ ...base }), null);
});

Deno.test('RPE + drift (no bodyConcerned) → fires with both (multi-factor, not the dedup case)', () => {
  const r = crossTrainingStressReceipt({
    ...base, rpeRising: true, driftWorsening: true,
  });
  assertEquals(r, { label: 'Effort up (4.8 vs 4.3) + HR drift rising', tone: 'warning' });
});
