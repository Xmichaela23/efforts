/**
 * The plan line, one composer.
 *   ~/.deno/bin/deno test --no-check supabase/functions/_shared/plan-line.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { planLine, weekPosition } from './plan-line.ts';

Deno.test('the approved line', () => {
  assertEquals(planLine({ planName: 'Standard Focus', weekIndex: 2, blockWeeks: 12 }), 'Standard Focus · week 2 of 12');
  assertEquals(planLine({ planName: 'Standard Focus', weekIndex: 3, blockWeeks: 12 }), 'Standard Focus · week 3 of 12');
});

Deno.test('no length stated = no "of"', () => {
  assertEquals(planLine({ planName: 'Standard Focus', weekIndex: 2, blockWeeks: null }), 'Standard Focus · week 2');
  assertEquals(planLine({ planName: 'Standard Focus', weekIndex: 2, blockWeeks: 0 }), 'Standard Focus · week 2');
});

Deno.test('no plan name = the position alone, never an invented name', () => {
  assertEquals(planLine({ planName: null, weekIndex: 2, blockWeeks: 12 }), 'week 2 of 12');
  assertEquals(planLine({ planName: '   ', weekIndex: 2, blockWeeks: 12 }), 'week 2 of 12');
});

Deno.test('no week = no line at all, never "week 1"', () => {
  assertEquals(planLine({ planName: 'Standard Focus', weekIndex: null, blockWeeks: 12 }), null);
  assertEquals(planLine({ planName: 'Standard Focus', weekIndex: 0, blockWeeks: 12 }), null);
  assertEquals(weekPosition(undefined, 12), null);
});

Deno.test('the position alone is what Today joins to the date it owns', () => {
  assertEquals(weekPosition(3, 12), 'week 3 of 12');
  assertEquals(weekPosition(1, 12), 'week 1 of 12');
});

Deno.test('⛔ NO PHASE WORD REACHES THE LINE — there is no input for one', () => {
  const line = planLine({ planName: 'Standard Focus', weekIndex: 2, blockWeeks: 12 });
  for (const w of ['Build', 'Base', 'Peak', 'Taper', 'Leader', 'Anchor']) {
    assertEquals(String(line).includes(w), false, w);
  }
});
