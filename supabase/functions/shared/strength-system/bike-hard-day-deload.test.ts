// THE HARD RIDE COMES OFF ON A LIGHT WEEK — BOTH LIGHT WEEK SHAPES.
//
// ⛔ THE DEFECT (found 2026-08-16). `strength-primary-plan.ts:3104` pushed `bikeQualitySession(hardPin)`
// with no `isStandalone` check, while the easy rides twelve lines above it on the same branch already
// took one. So a bike-primary athlete rode `4 × 4 min hard` through every light week in the block —
// including the TM-TEST week, whose entire job is arriving at the measured set rested. The run branch
// (:2931-2946) has handled both standalone shapes since 2026-08-15; the bike never got the change.
//
// ⛔ DOWNGRADED, NOT DELETED. Dropping the session hands back a blank day on a day the athlete pinned,
// which `place-week` already learned is worse than dropping the pin. Frequency holds (Hickson), the
// intensity that drives the interference comes off (Wilson 2012).
//
// Run: ~/.deno/bin/deno test --no-check supabase/functions/shared/strength-system/bike-hard-day-deload.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';
import { buildWeekMap } from './loading/wendler-531.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const HARD_DAY = 'tuesday';
const WEEKS = 12;

const BIKE_BLOCK = {
  durationWeeks: WEEKS,
  oneRepMaxes: MAXES,
  enduranceSport: 'bike',
  enduranceFrequency: 3,
  bike: { hours: 6, days: 3, longRideDay: 'saturday' },
  targetWeeklyRideHours: 6,
  hardDay: { day: HARD_DAY, discipline: 'bike' },
} as const;

const plan: any = composeStrengthPrimaryPlan(BIKE_BLOCK as never);
const weekMap = buildWeekMap(WEEKS);

/** Every session the plan put on the pinned hard day in a given week. */
const onHardDay = (week: number): any[] =>
  ((plan.sessions_by_week[String(week)] ?? []) as any[])
    .filter((s) => String(s.day).toLowerCase() === HARD_DAY);

const isIntervals = (s: any): boolean =>
  s.type === 'ride'
  && (Array.isArray(s.steps_preset) ? s.steps_preset.includes('bike_vo2_4x4min_R4min') : false);

Deno.test('the block under test actually has both light week shapes and some cycle weeks', () => {
  // A guard on the fixture itself: if the layout ever stops producing one of these, the assertions
  // below would pass by vacuum rather than by behaviour.
  for (const kind of ['tm_test', 'deload_single', 'cycle']) {
    assertEquals(weekMap.some((w) => w.kind === kind), true, `no ${kind} week in a ${WEEKS}-week block`);
  }
});

Deno.test('⛔ NO 4x4 INTERVALS ON ANY LIGHT WEEK — deload OR TM test', () => {
  for (const bw of weekMap) {
    if (bw.kind === 'cycle') continue;
    const sessions = onHardDay(bw.week);
    assertEquals(
      sessions.some(isIntervals), false,
      `week ${bw.week} (${bw.kind}): the hard ride is still on the pinned day`,
    );
  }
});

Deno.test('the pinned day is not left blank — it keeps an easy ride, at trimmed volume', () => {
  for (const bw of weekMap) {
    if (bw.kind === 'cycle') continue;
    const rides = onHardDay(bw.week).filter((s) => s.type === 'ride');
    assertEquals(rides.length >= 1, true, `week ${bw.week} (${bw.kind}): pinned day lost its session entirely`);
    const easy = rides.find((s) => !isIntervals(s));
    assertEquals(!!easy, true, `week ${bw.week} (${bw.kind}): no easy ride on the pinned day`);
    // Trimmed by the same 2/3 factor every other easy session on a light week takes: 45 -> 30.
    assertEquals(easy.duration < 45, true,
      `week ${bw.week} (${bw.kind}): ${easy.duration} min is the untrimmed hard-ride length`);
  }
});

Deno.test('the copy says WHICH light week it is, and why the intervals came off', () => {
  for (const bw of weekMap) {
    if (bw.kind === 'cycle') continue;
    const easy = onHardDay(bw.week).find((s) => s.type === 'ride' && !isIntervals(s));
    const d = String(easy?.description ?? '');
    // A test week and a deload are different weeks doing different jobs; an athlete reading "light
    // week" on the week they are being measured has not been told what is happening.
    assertEquals(
      d.includes(bw.kind === 'tm_test' ? 'measured rested' : 'Light week'), true,
      `week ${bw.week} (${bw.kind}) reads: ${d}`,
    );
    assertEquals(d.includes('conversational'), true, `week ${bw.week}: no effort ceiling stated`);
  }
});

Deno.test('a WORKING week is untouched — the intervals are still prescribed in full', () => {
  for (const bw of weekMap) {
    if (bw.kind !== 'cycle') continue;
    const sessions = onHardDay(bw.week);
    assertEquals(
      sessions.some(isIntervals), true,
      `week ${bw.week} (cycle): the hard ride went missing from a working week`,
    );
    const hard = sessions.find(isIntervals);
    assertEquals(hard.duration, 45, `week ${bw.week}: the hard ride shrank to ${hard.duration} min`);
    assertEquals(hard.name, 'Bike Intervals');
  }
});

Deno.test('the run branch is unchanged — a hard RUN block still deloads exactly as before', () => {
  // Regression fence: this change touched the bike branch only, and the two are mutually exclusive
  // at intake (D-327), so the run's behaviour must not have moved.
  const runPlan: any = composeStrengthPrimaryPlan({
    durationWeeks: WEEKS, oneRepMaxes: MAXES,
    enduranceSport: 'run', enduranceFrequency: 3, targetWeeklyMiles: 25,
    easyPaceMinPerMile: 9, longRunDay: 'sunday',
    hardDay: { day: HARD_DAY, discipline: 'run' },
  } as never);
  for (const bw of weekMap) {
    const runs = ((runPlan.sessions_by_week[String(bw.week)] ?? []) as any[])
      .filter((s) => String(s.day).toLowerCase() === HARD_DAY && s.type === 'run');
    assertEquals(runs.length >= 1, true, `week ${bw.week} (${bw.kind}): pinned run day is empty`);
    const hasHard = runs.some((s) => Array.isArray(s.tags) && s.tags.includes('quality'));
    assertEquals(hasHard, bw.kind === 'cycle', `week ${bw.week} (${bw.kind}): hard run presence is wrong`);
  }
});
