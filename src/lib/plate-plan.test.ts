// ⛔ PLATES CARRY OVER; EACH SET IS THE FEWEST PLATE CHANGES FROM THE LAST, THEN THE FEWEST PLATES (2026-09-18).
//
//   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/plate-plan.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { platePlanForSets } from './plate-plan.ts';

const LB = [
  { weight: 45, count: 4 }, { weight: 35, count: 2 }, { weight: 25, count: 2 },
  { weight: 10, count: 2 }, { weight: 5, count: 2 }, { weight: 2.5, count: 2 },
];
const KG = [
  { weight: 25, count: 4 }, { weight: 20, count: 2 }, { weight: 15, count: 2 }, { weight: 10, count: 2 },
  { weight: 5, count: 2 }, { weight: 2.5, count: 2 }, { weight: 1.25, count: 2 },
];
const bar = (weight: number) => ({ weight, barLoad: 45, bar: 'standard' });
const kg = (weight: number) => ({ weight, barLoad: 20, bar: 'standard_kg' });
const plates = (plan: ReturnType<typeof platePlanForSets>) => plan.map((s) => s!.plates.join(' '));

Deno.test('the squat day, pounds', () => {
  const plan = platePlanForSets([45, 135, 185, 225, 245, 245, 245, 205].map(bar), LB);
  // 225: add 10 10 or swap the 25 for a 45 are two changes each; the swap leaves fewer plates on.
  assertEquals(plates(plan), ['', '45', '45 25', '45 45', '45 45 10', '45 45 10', '45 45 10', '45 35']);
  for (const s of plan) assertEquals(s!.possible, true);
});

Deno.test('the squat day, kilograms', () => {
  const plan = platePlanForSets([20, 60, 80, 100, 110, 110, 90].map(kg), KG);
  assertEquals(plates(plan), ['', '20', '20 10', '20 10 10', '20 10 10 5', '20 10 10 5', '20 10 5']);
});

Deno.test('a set with no weight is passed over; the plates carry on', () => {
  const plan = platePlanForSets([bar(135), null, { weight: 0, barLoad: 45, bar: 'standard' }, bar(185)], LB);
  assertEquals(plan[1], null);
  assertEquals(plan[2], null);
  assertEquals(plan[3]!.plates, [45, 25]);
});

Deno.test('a different bar starts from empty', () => {
  const plan = platePlanForSets([bar(225), { weight: 185, barLoad: 45, bar: 'safety' }], LB);
  assertEquals(plan[1]!.plates, [45, 25]);
});

Deno.test('a weight the rack cannot make shows the closest load under it', () => {
  const plan = platePlanForSets([bar(137)], LB);
  assertEquals(plan[0]!.possible, false);
  assertEquals(plan[0]!.plates, [45]);
});
