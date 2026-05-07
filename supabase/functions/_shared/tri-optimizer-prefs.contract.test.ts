/**
 * PLAN-CONTRACT §2.3 / backlog item 1 & 5 — prefs scalars for deriveOptimalWeek inputs.
 *
 * Run: deno test supabase/functions/_shared/tri-optimizer-prefs.contract.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { readStrengthFrequencyForOptimizer, readSwimsPerWeekForOptimizer } from './tri-optimizer-prefs.ts';

Deno.test('strength_frequency: scalar 0 wins when preferred_days.strength omitted', () => {
  assertEquals(
    readStrengthFrequencyForOptimizer({ strength_frequency: 0 }, undefined),
    0,
  );
});

Deno.test('strength_frequency: strength_protocol none implies 0 when scalar absent', () => {
  assertEquals(
    readStrengthFrequencyForOptimizer({ strength_protocol: 'none' }, undefined),
    0,
  );
});

Deno.test('strength_frequency: falls back to strength array length when scalar absent', () => {
  assertEquals(readStrengthFrequencyForOptimizer({}, 2), 2);
  assertEquals(readStrengthFrequencyForOptimizer({}, 1), 1);
});

Deno.test('strength_frequency: scalar wins over longer strength array', () => {
  assertEquals(readStrengthFrequencyForOptimizer({ strength_frequency: 0 }, 2), 0);
});

Deno.test('swims_per_week: swim_intent focus → 3 when swim array missing', () => {
  assertEquals(readSwimsPerWeekForOptimizer({ swim_intent: 'focus' }, undefined), 3);
});

Deno.test('swims_per_week: swim_intent race → 2 when swim array missing', () => {
  assertEquals(readSwimsPerWeekForOptimizer({ swim_intent: 'race' }, undefined), 2);
});

Deno.test('swims_per_week: explicit swims_per_week wins', () => {
  assertEquals(readSwimsPerWeekForOptimizer({ swims_per_week: 1, swim_intent: 'focus' }, undefined), 1);
});

Deno.test('swims_per_week: array length when intent missing', () => {
  assertEquals(readSwimsPerWeekForOptimizer({}, 3), 3);
});
