/**
 * ⛔ THE PRETEST RAMP MAY NEVER PRESCRIBE THE TEST WEIGHT TWICE.
 *
 * Michael's own export, 2026-08-31, the morning he started the block: `Overhead Press: 75x6, 85x5,
 * 85x1+`. Five reps at the test weight, then the test. The measured set is what every press weight
 * in the twelve-week block is derived from, so the pre-fatigue does not stay cosmetic.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { pretestSession, PRETEST_STEPS } from './working-number.ts';

Deno.test('the press that bit him: no warm-up sits at the test weight', () => {
  // A 100 lb seed gives A = 75; 1.10A = 82.5 and 1.15A = 86.25 both round to 85 at a 5 lb step.
  const steps = pretestSession('overheadPress', 100, 5)!;
  const measured = steps[steps.length - 1];
  assertEquals(measured.reps, 'max');
  assertEquals(measured.weight, 85, 'the tested weight is p215\'s own 1.15A and must not move');
  assertEquals(
    steps.filter((s) => s.weight === measured.weight).length,
    1,
    'the test weight appears exactly once',
  );
  assertEquals(steps.map((s) => [s.weight, s.reps]), [[75, 6], [85, 'max']]);
});

Deno.test('the lifts that were already correct are untouched', () => {
  // Bench/deadlift in the same export: 115, 125, 130. Squat: 85, 95, 100.
  assertEquals(
    pretestSession('bench', 153, 5)!.map((s) => s.weight),
    [115, 125, 130],
  );
  assertEquals(
    pretestSession('squat', 113, 5)!.map((s) => s.weight),
    [85, 95, 100],
  );
});

Deno.test('no seed at any weight or increment ever repeats a weight', () => {
  for (const roundTo of [1, 2.5, 5, 10]) {
    for (let seed = 45; seed <= 600; seed += 5) {
      const steps = pretestSession('bench', seed, roundTo);
      if (!steps) continue;
      const weights = steps.map((s) => s.weight);
      assertEquals(
        new Set(weights).size,
        weights.length,
        `seed ${seed} at step ${roundTo} prescribed ${weights.join(', ')}`,
      );
      // The measurement survives every drop, and it is always the last rung.
      assertEquals(steps[steps.length - 1].reps, 'max');
      assertEquals(
        steps[steps.length - 1].fractionOfPredicted,
        PRETEST_STEPS[PRETEST_STEPS.length - 1].fractionOfPredicted,
      );
      // A ramp climbs.
      for (let i = 1; i < weights.length; i++) {
        if (!(weights[i] > weights[i - 1])) {
          throw new Error(`seed ${seed} at step ${roundTo} did not climb: ${weights.join(', ')}`);
        }
      }
    }
  }
});
