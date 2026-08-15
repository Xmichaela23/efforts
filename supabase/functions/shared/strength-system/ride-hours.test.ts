// THE WEEK'S RIDE HOURS ARE THE HOURS THE ATHLETE ASKED FOR.
//
// ⛔ THE DEFECTS, all three found 2026-07-29 by a combo sweep, all three the run side's own history
// repeating one discipline over:
//
//   1. TWO EMITTERS. For a bike-PRIMARY athlete the generic endurance fallback fired AND the bike
//      pass fired. The pass built the ask exactly; the fallback added two fixed 45-minute rides on
//      top. 6h asked → 7.5h. And it scaled with FREE DAYS, not with the ask — at three lifting days
//      the same 6h became 8.3h across six rides.
//   2. `targetWeeklyRideHours` HAD ZERO READERS. Its own doc comment said it was carried "so the
//      bike pass has it to consume" and the pass never did. 6h asked → 1.5h built, the fixed default.
//   3. THE HARD RIDE SAT OUTSIDE THE BUDGET. Exactly the hill-session defect fixed on the run side
//      2026-07-28: the interval session is a ride, it counted toward nothing, and the easy hours
//      were built to the full ask beside it. 6h asked → 6.8h.
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/ride-hours.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

// ⛔ WEEK 2, NOT WEEK 1 (2026-08-15, work order §1c). Week 1 of a Strong Focus block is now a
// standalone TM-TEST week — light band, no hard endurance session, trimmed easy volume — so it is
// no longer the representative working week these assertions want. Week 2 is cycle 1's first
// leader week and is the shape week 1 used to be.
const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };

const rideHoursBuilt = (args: Record<string, unknown>): number => {
  const p: any = composeStrengthPrimaryPlan({ durationWeeks: 12, oneRepMaxes: MAXES, ...args } as never);
  const mins = (p.sessions_by_week['2'] as any[])
    .filter((s) => s.type === 'ride').reduce((a, s) => a + s.duration, 0);
  return mins / 60;
};

Deno.test('⛔ THE RIDE HOURS ARE THE ASK — every shape, hard day or not, 3 or 4 lifting days', () => {
  for (const liftingDays of [4, 3] as const) {
    for (const hours of [4, 6, 8]) {
      const shapes: Array<[string, Record<string, unknown>]> = [
        ['bike primary + bike{} + hard ride', {
          enduranceSport: 'bike', enduranceFrequency: 3,
          bike: { hours, days: 3, longRideDay: 'saturday' }, targetWeeklyRideHours: hours,
          hardDay: { day: 'tuesday', discipline: 'bike' }, liftingDays }],
        ['bike primary + bike{}, no hard day', {
          enduranceSport: 'bike', enduranceFrequency: 3,
          bike: { hours, days: 3, longRideDay: 'saturday' }, liftingDays }],
        // ⛔ THE HOURS-ONLY PATH: no `bike{}` object at all. This is the one that built 1.5h.
        ['bike primary, hours only', {
          enduranceSport: 'bike', enduranceFrequency: 3, targetWeeklyRideHours: hours,
          hardDay: { day: 'tuesday', discipline: 'bike' }, liftingDays }],
        ['run primary + bike alongside', {
          enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 25,
          easyPaceMinPerMile: 9, longRunDay: 'sunday',
          bike: { hours, days: 2, longRideDay: 'thursday' },
          hardDay: { day: 'tuesday', discipline: 'run' }, liftingDays }],
      ];
      for (const [label, args] of shapes) {
        const built = rideHoursBuilt(args);
        // Half an hour of slack for rounding across the split; the defects were 0.8-1.5h.
        assertEquals(Math.abs(built - hours) <= 0.5, true,
          `${liftingDays}d · ${label}: asked ${hours}h, built ${Math.round(built * 10) / 10}h`);
      }
    }
  }
});

Deno.test('the hard ride does not shrink to fit — intensity is the protected variable', () => {
  const p: any = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES,
    enduranceSport: 'bike', enduranceFrequency: 3,
    bike: { hours: 4, days: 3, longRideDay: 'saturday' },
    hardDay: { day: 'tuesday', discipline: 'bike' },
  } as never);
  const hard = (p.sessions_by_week['2'] as any[]).find((s) => /Intervals/.test(s.name));
  assertEquals(hard.duration, 45, 'the intervals were trimmed to make the hours fit');
});

Deno.test('⛔ RIDE VOLUME DOES NOT MOVE WHEN THE LIFTING DOES', () => {
  const args = {
    enduranceSport: 'bike', enduranceFrequency: 3,
    bike: { hours: 6, days: 3, longRideDay: 'saturday' },
    hardDay: { day: 'tuesday', discipline: 'bike' },
  };
  const four = rideHoursBuilt({ ...args, liftingDays: 4 });
  const three = rideHoursBuilt({ ...args, liftingDays: 3 });
  assertEquals(Math.abs(four - three) <= 0.25, true,
    `dropping a lifting day changed the ride volume: ${four}h vs ${three}h`);
});
