// Q-215 — where the OVERFLOW easy run lands when it has to share a lift day.
//
// Free days are consumed first and one is reserved for rest (`strength-primary-plan.ts:874`).
// When the athlete's run frequency needs more days than that leaves, the run stacks onto a lift —
// and the day it picks is what this file pins.
//
// ⛔ THE DEFECT: the ranking used `easyRunAnchorAdjacencyPenalty`, whose three arguments are all
// RUNS. It priced distance from the quality run and the long run and knew nothing about lifts, so
// in a Sun-long / Thu-hard week it chose the SQUAT day (score 0) over the bench day (score 4, for
// sitting beside the long run). An easy run went onto the developing lift to buy run spacing.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/run-placement.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const block = () => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: MAXES,
  enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 13,
  longRunDay: 'sunday', hardDay: { day: 'thursday', discipline: 'run' },
  easyPaceMinPerMile: 10,
} as never);

const week1 = () => (block().sessions_by_week['1'] as any[]);
const dayOf = (pred: (s: any) => boolean) => week1().filter(pred).map((s) => String(s.day));
const liftDays = (lower: boolean) =>
  week1().filter((s) => s.type === 'strength'
    && (lower ? /Back Squat|Deadlift/ : /Bench Press|Overhead Press/).test(s.name)).map((s) => String(s.day));

Deno.test('⛔ THE EASY RUN DOES NOT STACK ON HEAVY LEGS WHILE AN UPPER LIFT DAY IS FREE', () => {
  const easyRunDays = dayOf((s) => s.type === 'run' && /Easy Run/.test(s.name));
  const heavy = liftDays(true);
  for (const d of easyRunDays) {
    assertEquals(heavy.includes(d), false,
      `easy run landed on ${d}, a heavy-leg day, while upper days ${liftDays(false).join('/')} existed`);
  }
});

Deno.test('the run still gets placed — the rule reorders, it does not drop a session', () => {
  const runs = week1().filter((s) => s.type === 'run');
  assertEquals(runs.length, 3, 'long run + hard run + one easy run');
});

Deno.test('⛔ THE REST DAY IS STILL RESERVED — the fix must not spend it', () => {
  // An earlier version of the composer filled every free day and produced seven active days.
  const active = new Set(week1().map((s) => String(s.day)));
  assertEquals(active.size <= 6, true, `no rest day left: ${[...active].join(', ')}`);
});
