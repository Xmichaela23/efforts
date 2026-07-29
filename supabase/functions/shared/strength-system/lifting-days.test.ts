// THE THREE-DAY BLOCK — four lifts on three days, and a four-day week when the number counts.
//
// ⛔ WHY THIS EXISTS. Lifting frequency was a HARD CONSTANT of 4 (`SPEC-week-solver.md` §0a #4:
// "a fixed count, lift frequency is not negotiable"). It is now a default. The constant was load-
// bearing in one specific way and this file pins that way: at four days every lift is trained FIRST,
// so every top set is a clean measurement. Three days buys the schedule and pays for it on the
// shared day — which is why week 3, Wendler's 95% set, splits back onto four.
//
// Sourced: frequency does not drive strength gain when weekly volume is equated (Grgic et al.,
// volume-equated meta). Exercise order does — the first movement adapts most. Fatigue status is a
// named standardisation variable in 1RM testing, and test-retest reliability holds only when the
// protocol is standardised, hence EVERY test week and not some of them.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/lifting-days.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const build = (liftingDays?: 3 | 4) => composeStrengthPrimaryPlan({
  durationWeeks: 12, oneRepMaxes: { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 },
  enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 20,
  longRunDay: 'sunday', hardDay: { day: 'tuesday', discipline: 'run' },
  easyPaceMinPerMile: 9, ...(liftingDays ? { liftingDays } : {}),
} as never);

const liftDaysIn = (plan: any, week: string): Set<string> =>
  new Set((plan.sessions_by_week[week] as any[]).filter((s) => s.type === 'strength').map((s) => s.day));

const liftNamesIn = (plan: any, week: string): string[] =>
  (plan.sessions_by_week[week] as any[]).filter((s) => s.type === 'strength').map((s) => s.name);

Deno.test('⛔ ABSENT liftingDays IS FOUR — every block built before this option is unchanged', () => {
  const a = JSON.stringify(build().sessions_by_week);
  const b = JSON.stringify(build(4).sessions_by_week);
  assertEquals(a, b, 'the default drifted from an explicit 4');
});

Deno.test('three days: four lifts, three days, every week that is not the test week', () => {
  const p = build(3);
  for (const wk of ['1', '2', '4', '5']) {
    assertEquals(liftDaysIn(p, wk).size, 3, `week ${wk} did not run on three days`);
    // ⛔ ALL FOUR LIFTS ARE STILL THERE. §5.2b — the engine never silently subtracts a session.
    assertEquals(liftNamesIn(p, wk).length, 4, `week ${wk} lost a lift`);
  }
});

Deno.test('⛔ THE TEST WEEK RUNS ON FOUR DAYS — every cycle, not some of them', () => {
  const p = build(3);
  // Week 3 of each four-week cycle across a 12-week block.
  for (const wk of ['3', '7', '11']) {
    assertEquals(liftDaysIn(p, wk).size, 4, `week ${wk} shared a day on the week the number counts`);
    assertEquals(liftNamesIn(p, wk).length, 4, `week ${wk} lost a lift`);
  }
});

Deno.test('the heavy lower lifts never share a day, at either shape', () => {
  for (const shape of [3, 4] as const) {
    const p = build(shape);
    const lower = (p.sessions_by_week['1'] as any[])
      .filter((s) => s.type === 'strength' && /Squat|Deadlift/.test(s.name));
    assertEquals(new Set(lower.map((s) => s.day)).size, lower.length,
      `${shape}-day: a squat and a deadlift shared a day`);
  }
});

Deno.test('the shared day states its order, and the test week does not', () => {
  const p = build(3);
  const bench = (p.sessions_by_week['1'] as any[]).find((s) => /Bench/.test(s.name));
  assertEquals(/goes first/.test(bench.description), true, 'the shared day never named its order');
  const benchTest = (p.sessions_by_week['3'] as any[]).find((s) => /Bench/.test(s.name));
  assertEquals(/goes first|Follows/.test(benchTest.description), false,
    'the test week claimed a pairing it does not have');
});
