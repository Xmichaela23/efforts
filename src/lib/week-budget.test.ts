// Run: ~/.deno/bin/deno test --no-check src/lib/week-budget.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { cleanEnduranceSlots, cleanSlotsForLiftingDays, heavyLegCollisionDay, type WeekSession } from './week-budget.ts';

const lift = (day: string, name: string): WeekSession => ({ day, name, type: 'strength' });
const run = (day: string): WeekSession => ({ day, name: 'Easy Run', type: 'run' });

const FOUR = [
  lift('Monday', 'Strength — Bench Press'), lift('Tuesday', 'Strength — Overhead Press'),
  lift('Wednesday', 'Strength — Back Squat'), lift('Friday', 'Strength — Deadlift'),
];

Deno.test('four lifts leave four clean slots — two free days plus two upper days', () => {
  assertEquals(cleanEnduranceSlots(FOUR), 4);
});

Deno.test('⛔ FEWER LIFTING DAYS BUY SLOTS — derived, not hardcoded', () => {
  const three = [
    lift('Monday', 'Strength — Bench Press'), lift('Wednesday', 'Strength — Back Squat'),
    lift('Friday', 'Strength — Overhead Press'),
  ];
  assertEquals(cleanEnduranceSlots(three), 5);
});

Deno.test('heavy-leg days are not clean ground; upper days are', () => {
  const heavyOnly = [lift('Monday', 'Strength — Back Squat'), lift('Thursday', 'Strength — Deadlift')];
  assertEquals(cleanEnduranceSlots(heavyOnly), 4);          // 4 free, 0 upper
  const mixed = [lift('Monday', 'Strength — Bench Press'), lift('Thursday', 'Strength — Deadlift')];
  assertEquals(cleanEnduranceSlots(mixed), 5);              // 4 free, 1 upper
});

Deno.test('the collision names the day it actually lands on', () => {
  assertEquals(heavyLegCollisionDay([...FOUR, run('Monday')]), null, 'bench day is free ground');
  assertEquals(heavyLegCollisionDay([...FOUR, run('Wednesday')]), 'Wednesday', 'squat day is not');
});

Deno.test('⛔ THE INTAKE COUNT AND THE RENDERED COUNT MUST AGREE', () => {
  // The card computes the budget before a week exists; the grid computes it from a real one. Two
  // numbers for one claim is how surfaces start disagreeing.
  assertEquals(cleanSlotsForLiftingDays(4), cleanEnduranceSlots(FOUR));
  assertEquals(cleanSlotsForLiftingDays(4), 4);
  assertEquals(cleanSlotsForLiftingDays(3), 5);
  assertEquals(cleanSlotsForLiftingDays(2), 5);
});
