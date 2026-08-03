/**
 * `overheadPress1RM` resolves to the press slot — pinned across every reader the State strength
 * card and the plan gate depend on.
 *
 *   deno test --allow-read src/lib/ohp-baseline-alias.test.ts --no-check
 *
 * ⚠️ WHY THIS EXISTS WHEN NOTHING IS BROKEN. The overhead press is the ONLY one of the four barbell
 * maxes whose typed key is not the bare lift name: squat / bench / deadlift are stored bare, and the
 * press is stored as `overheadPress1RM` (that is what the Training Baselines input writes). Every
 * reader currently handles it — verified, not assumed — but there are SEVENTEEN files carrying an
 * alias list for this one question, so the odds that a future one is written bare-key-only are high,
 * and the failure is silent: the row simply shows no baseline.
 *
 * These assertions cover the three readers that decide what the athlete sees:
 *   • `capacity-resolver` → the `anchor_1rm` on the State card's per-lift row ("vs your 100 baseline")
 *   • `buildStrengthBaselines` → the frame for the strength DOT
 *   • `barbell-maxes` → the Get Stronger entry gate (refuses a plan when a lift is missing)
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  canonicalizeLiftKey,
  resolveStrengthCapacity,
} from '../../supabase/functions/_shared/state-trend/capacity-resolver.ts';
import { buildStrengthBaselines } from '../../supabase/functions/_shared/state-trend/strength.ts';
import { readMax, readBarbellMaxes, missingBarbellLifts } from '../../supabase/functions/shared/strength-system/barbell-maxes.ts';

/** The reported scenario: the press max on file under its camelCase key and nothing else. */
const ONLY_CAMEL = { overheadPress1RM: 100 };
const FULL = { squat: 315, bench: 150, deadlift: 405, overheadPress1RM: 100 };

Deno.test('⛔ every alias for the press slot canonicalizes to overheadPress1RM', () => {
  for (const alias of ['overhead_press', 'overhead', 'ohp', 'overheadPress1RM', 'OverheadPress1RM', 'OHP']) {
    assertEquals(canonicalizeLiftKey(alias), 'overheadPress1RM', `${alias} should be the press slot`);
  }
});

Deno.test('⛔ THE STATE CARD ROW — anchor_1rm resolves from overheadPress1RM alone', () => {
  // The exact call `coach/index.ts` makes when building `per_lift`: the key comes from
  // `learned_fitness.strength_1rms` (so `overhead_press`), the typed max from `performance_numbers`
  // (so `overheadPress1RM`). The two spellings must meet.
  const res = resolveStrengthCapacity({
    key: 'overhead_press',
    typed: ONLY_CAMEL,
    learnedStrength1rms: { overhead_press: { value: 92, sample_count: 4 } },
    asOf: '2026-08-03',
  });
  assertEquals(res?.key, 'overheadPress1RM');
  assertEquals(res?.value, 100);
  assertEquals(res?.source, 'typed', 'a typed baseline must win over the learned estimate');
  // …which is what becomes `anchor_1rm`, i.e. the "vs your 100 baseline" clause on the row.
});

Deno.test('⛔ THE STRENGTH DOT — buildStrengthBaselines maps it to the overhead_press canonical', () => {
  assertEquals(buildStrengthBaselines(ONLY_CAMEL, {}), { overhead_press: 100 });
  assertEquals(buildStrengthBaselines(FULL, {}), {
    squat: 315, bench_press: 150, deadlift: 405, trap_bar_deadlift: 405, overhead_press: 100,
  });
});

Deno.test('⛔ THE PLAN GATE — the press is not reported missing when only the camelCase key is on file', () => {
  assertEquals(readMax(ONLY_CAMEL, 'overheadPress'), 100);
  assertEquals(missingBarbellLifts(readBarbellMaxes(FULL)), [], 'a complete set must open the gate');
  // …and a genuinely absent press still refuses, so the alias is not swallowing a real gap.
  assertEquals(
    missingBarbellLifts(readBarbellMaxes({ squat: 315, bench: 150, deadlift: 405 })),
    ['overheadPress'],
  );
});

Deno.test('the other three lifts still read from their bare keys', () => {
  // Guard against a "fix" that aliases everything and quietly changes the other three.
  assertEquals(readMax(FULL, 'squat'), 315);
  assertEquals(readMax(FULL, 'bench'), 150);
  assertEquals(readMax(FULL, 'deadlift'), 405);
  assertEquals(canonicalizeLiftKey('bench'), 'bench');
  assertEquals(canonicalizeLiftKey('squat'), 'squat');
  assertEquals(canonicalizeLiftKey('deadlift'), 'deadlift');
});
