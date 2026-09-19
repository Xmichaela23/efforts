// ⛔ FEWEST PLATES PER SIDE, BIGGEST INSIDE; THE ONE CARRY-OVER IS "THE SAME PLATES PLUS ONE ON THE OUTSIDE" (2026-09-18).
//
//   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/plate-plan.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { platePlanForSets, platesPerSideText, type PlatePlanSet } from './plate-plan.ts';

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
const text = (plan: ReturnType<typeof platePlanForSets>) => plan.map((s) => platesPerSideText(s!.plates));

Deno.test('the squat day, pounds (Michael, 2026-09-18)', () => {
  const plan = platePlanForSets([45, 60, 85, 100, 110].map(bar), LB);
  assertEquals(text(plan), [
    'bar only', '5 + 2.5 per side', '2 × 10 per side', '25 + 2.5 per side', '25 + 5 + 2.5 per side',
  ]);
  for (const s of plan) assertEquals(s!.possible, true);
});

Deno.test('the carry-over: the same plates plus one on the outside', () => {
  // 95 → 25 per side; 115 → 35 per side is one 35 from scratch, but it is the 25 plus a 10 on the outside.
  assertEquals(text(platePlanForSets([95, 115].map(bar), LB)), ['25 per side', '25 + 10 per side']);
});

Deno.test('no carry-over when the extra plate is bigger than the outermost', () => {
  // 25 + 2.5 on, then 32.5 per side: adding a 5 outside the 2.5 would put a small plate inside a bigger one.
  assertEquals(text(platePlanForSets([100, 110].map(bar), LB)), ['25 + 2.5 per side', '25 + 5 + 2.5 per side']);
});

Deno.test('a heavy ramp, pounds', () => {
  assertEquals(text(platePlanForSets([135, 185, 225, 245, 205].map(bar), LB)), [
    '45 per side', '45 + 25 per side', '2 × 45 per side', '2 × 45 + 10 per side', '45 + 35 per side',
  ]);
  assertEquals(text(platePlanForSets([bar(155)], LB)), ['45 + 10 per side']);
  assertEquals(text(platePlanForSets([bar(175)], LB)), ['45 + 2 × 10 per side']);
});

Deno.test('the squat day, kilograms', () => {
  assertEquals(text(platePlanForSets([20, 60, 80, 100, 110, 90].map(kg), KG)), [
    // 80 and 100 carry the 20 and add a 10 outside each time; 110 adds a 5 outside those; 90 starts fresh.
    'bar only', '20 per side', '20 + 10 per side', '20 + 2 × 10 per side', '20 + 2 × 10 + 5 per side',
    '25 + 10 per side',
  ]);
  assertEquals(text(platePlanForSets([kg(52.5)], KG)), ['15 + 1.25 per side']);
});

Deno.test('a set with no weight is passed over; the plates carry on', () => {
  const plan = platePlanForSets([bar(95), null, { weight: 0, barLoad: 45, bar: 'standard' }, bar(115)], LB);
  assertEquals(plan[1], null);
  assertEquals(plan[2], null);
  assertEquals(plan[3]!.plates, [25, 10]);
});

Deno.test('a different bar starts from empty', () => {
  const plan = platePlanForSets([bar(95), { weight: 115, barLoad: 45, bar: 'safety' }], LB);
  assertEquals(plan[1]!.plates, [35]);
});

Deno.test('a weight the rack cannot make shows the closest load under it', () => {
  const plan = platePlanForSets([bar(137)], LB);
  assertEquals(plan[0]!.possible, false);
  assertEquals(plan[0]!.plates, [45]);
});

Deno.test('35 per side on, 45 per side next: the 35 stays and a 10 goes outside it', () => {
  assertEquals(text(platePlanForSets([115, 135].map(bar), LB)), ['35 per side', '35 + 10 per side']);
});

Deno.test('a fresh load never repeats a plate where one bigger plate would do', () => {
  assertEquals(text(platePlanForSets([bar(55)], LB)), ['5 per side']);
  assertEquals(text(platePlanForSets([kg(25)], KG)), ['2.5 per side']);
  // Every weight from an empty bar: no run of the same plate adds up to one plate the rack has.
  const check = (weights: number[], set: (w: number) => PlatePlanSet, rack: typeof LB) => {
    for (const w of weights) {
      const p = platePlanForSets([set(w)], rack)[0]!.plates;
      for (let i = 0; i < p.length;) {
        let n = 1;
        while (p[i + n] === p[i]) n++;
        if (n > 1) assertEquals(rack.some((r) => r.weight === n * p[i]), false, `${w}: ${p.join(' ')}`);
        i += n;
      }
    }
  };
  check(Array.from({ length: 183 }, (_, i) => 45 + i * 2.5), bar, LB);
  check(Array.from({ length: 200 }, (_, i) => 20 + i * 1.25), kg, KG);
});
