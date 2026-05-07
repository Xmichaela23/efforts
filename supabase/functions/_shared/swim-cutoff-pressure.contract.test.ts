/**
 * Swim cutoff pressure — deterministic thresholds for plan_contract_v1 / coach.
 *
 * Run: deno test supabase/functions/_shared/swim-cutoff-pressure.contract.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildSwimCutoffPressureV1, triSwimCutoffMinutes } from './swim-cutoff-pressure.ts';

Deno.test('triSwimCutoffMinutes: 70.3 → 70', () => {
  assertEquals(triSwimCutoffMinutes('70.3'), 70);
});

Deno.test('70.3 projected 60m vs 70m cutoff — elevated (≥85% of window)', () => {
  const p = buildSwimCutoffPressureV1({
    distance: '70.3',
    projected_swim_min: 60,
    projected_source: 'live_model',
  });
  assertEquals(p?.severity, 'elevated');
  assertEquals(p?.recommend_third_swim, true);
});

Deno.test('70.3 projected 67m — high (≥95% of window)', () => {
  const p = buildSwimCutoffPressureV1({
    distance: '70.3',
    projected_swim_min: 67,
    projected_source: 'live_model',
  });
  assertEquals(p?.severity, 'high');
});

Deno.test('70.3 projected 40m — none', () => {
  const p = buildSwimCutoffPressureV1({
    distance: '70.3',
    projected_swim_min: 40,
    projected_source: 'live_model',
  });
  assertEquals(p?.severity, 'none');
  assertEquals(p?.recommend_third_swim, false);
});
