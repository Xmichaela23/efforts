// UP TO TWO HARD ENDURANCE DAYS, ANY MIX — AND WHOSE SESSION EACH ONE IS (§1i, 2026-08-17).
//
// ⛔ WHAT THIS PINS, AND WHY IT IS A PERMANENT REGRESSION. Before §1i the whole path was single-day
// from the wire down: one `hardDay` object, one `hardPin`, MUTUALLY EXCLUSIVE `hardDayIsRun` /
// `hardDayIsRide` booleans, two volume budgets each keyed on the one discipline, and two emitters
// whose own comment read *"at most one of these two branches ever fires"*. Every one of those is a
// place a second hard day disappears silently — the pin absorbed, or the session never authored, or
// its minutes handed back as easy volume. None of them threw; they just built a smaller week.
//
// ⚠️ THE VOLUME ASSERTIONS ARE THE SHARP ONES. A hard day that is not subtracted from its
// discipline's budget reads as generosity, not as a bug — the athlete gets MORE than they asked for
// and nothing complains. That defect has shipped twice in this file's history (+27% on the run side,
// 6h→6.8h on the bike) and both times it was a subtraction, which is one careless edit from gone.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/two-hard-days.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const WEEK = '2';   // week 1 is a standalone TM-test week; week 2 is the representative working week

const build = (cfg: Record<string, unknown>): any =>
  composeStrengthPrimaryPlan({ durationWeeks: 12, oneRepMaxes: MAXES, fiveKPaceSecPerMi: 435, ftpWatts: 240, ...cfg } as never);

const week = (plan: any): any[] => (plan.sessions_by_week[WEEK] ?? []) as any[];
const minutesOf = (w: any[], type: string) => w.filter((s) => s.type === type).reduce((n, s) => n + s.duration, 0);
// ⚠️ WIDENED FOR §7 (2026-08-17): the SECOND prescribed hard day is a THRESHOLD session, not a
// second VO2 one — "never two VO2 days" is the rule. A matcher that only knew the interval names
// would report the second day as missing when it is in fact the session §7 asked for.
const isHardRun = (s: any) => s.type === 'run' && /Hill|Interval|Tempo|Repeat|Threshold/i.test(s.name);
const isHardRide = (s: any) => s.type === 'ride' && /Interval|Threshold/i.test(s.name);
const isClub = (s: any) => Array.isArray(s.tags) && s.tags.includes('club');

const RUN_BLOCK = {
  enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 25,
  easyPaceMinPerMile: 9, longRunDay: 'sunday',
};
const BIKE_BLOCK = {
  enduranceSport: 'bike', bike: { hours: 6, days: 3, longRideDay: 'saturday' }, targetWeeklyRideHours: 6,
};

// ── BOTH BRANCHES FIRE IN ONE WEEK ───────────────────────────────────────────────────────────────

Deno.test('⛔ TWO HARD RUNS both get built, on the days the athlete pinned', () => {
  const w = week(build({
    ...RUN_BLOCK,
    hardDays: [
      { day: 'tuesday', discipline: 'run', terrain: 'hill_3min' },
      { day: 'thursday', discipline: 'run', terrain: 'flat' },
    ],
  }));
  const hard = w.filter(isHardRun);
  assertEquals(hard.length, 2, `built ${hard.length} hard runs: ${hard.map((s) => s.name).join(', ')}`);
  assertEquals(hard.map((s) => String(s.day)).sort(), ['Thursday', 'Tuesday']);
  // ⛔ ONE VO2 AND ONE THRESHOLD, NEVER TWO VO2 (§7). Before §7 this asserted only that the two
  // sessions DIFFERED — which two hill variants also satisfy. The rule is sharper than that now.
  assertEquals(new Set(hard.map((s) => s.name)).size, 2, 'both hard runs are the same session');
  assertEquals(hard.filter((s) => /Threshold/i.test(s.name)).length, 1, 'no threshold run was built');
  assertEquals(hard.filter((s) => /Hill|Interval|Repeat/i.test(s.name)).length, 1, 'two VO2 runs were built');
});

Deno.test('⛔ TWO HARD RIDES both get built', () => {
  const w = week(build({
    ...BIKE_BLOCK,
    hardDays: [{ day: 'tuesday', discipline: 'bike' }, { day: 'thursday', discipline: 'bike' }],
  }));
  const hard = w.filter(isHardRide);
  assertEquals(hard.length, 2);
  // §7 — one of each, never two VO2.
  assertEquals(hard.filter((s) => /Threshold/i.test(s.name)).length, 1);
});

Deno.test('⛔ ONE OF EACH — the multisport week §1i calls the most common one', () => {
  const w = week(build({
    ...RUN_BLOCK, enduranceFrequency: 3, targetWeeklyMiles: 20,
    bike: { hours: 4, days: 2, longRideDay: 'saturday' },
    hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'bike' }],
  }));
  assertEquals(w.filter(isHardRun).length, 1, 'the hard run went missing');
  assertEquals(w.filter(isHardRide).length, 1, 'the hard ride went missing');
});

// ── THE VOLUME IS NOT GROWN BY THE SECOND DAY ────────────────────────────────────────────────────

Deno.test('⛔ A SECOND HARD RUN IS INSIDE THE TYPED MILES, NOT ON TOP OF THEM', () => {
  const asked = 25 * 9;   // minutes, at the typed pace
  for (const hardDays of [
    [{ day: 'thursday', discipline: 'run' }],
    [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run' }],
  ]) {
    const built = minutesOf(week(build({ ...RUN_BLOCK, hardDays })), 'run');
    assert(Math.abs(built - asked) <= 6,
      `${hardDays.length} hard run(s): asked ${asked} min, built ${built} — the second was added on top`);
  }
});

Deno.test('⛔ A SECOND HARD RIDE IS INSIDE THE TYPED HOURS', () => {
  for (const hardDays of [
    [{ day: 'tuesday', discipline: 'bike' }],
    [{ day: 'tuesday', discipline: 'bike' }, { day: 'thursday', discipline: 'bike' }],
  ]) {
    const built = minutesOf(week(build({ ...BIKE_BLOCK, hardDays })), 'ride');
    assert(Math.abs(built - 360) <= 6,
      `${hardDays.length} hard ride(s): asked 360 min, built ${built}`);
  }
});

// ── WHOSE SESSION IS IT ──────────────────────────────────────────────────────────────────────────

Deno.test('⛔ A CLUB DAY IS BOOKED, NOT COACHED — no template, no token, still a hard day', () => {
  const w = week(build({
    ...RUN_BLOCK, enduranceFrequency: 3, targetWeeklyMiles: 20,
    bike: { hours: 4, days: 2, longRideDay: 'saturday' },
    hardDays: [
      { day: 'tuesday', discipline: 'run' },
      { day: 'thursday', discipline: 'bike', ownership: 'club' },
    ],
  }));
  const club = w.find(isClub);
  assert(!!club, 'the club session was not built');
  assertEquals(club.day, 'Thursday');
  assertEquals(club.name, 'Club Ride');
  // ⛔ NO PRESCRIPTION. A `steps_preset` is a template the analysis path grades against, and grading
  // an athlete against intervals the app invented for a group ride is the score that lies.
  assertEquals(club.steps_preset, undefined, 'the club session carries a prescribed template');
  assert(!/4 ?× ?4|interval/i.test(String(club.description)), `the club copy prescribes a session: ${club.description}`);
  // ⚠️ AND IT IS STILL HARD. Everything downstream that reasons about recovery reads the tag.
  assert(club.tags.includes('quality'), 'a club day must still read as a hard day');
  // The prescribed run beside it is untouched — one club answer does not mute the other slot.
  assertEquals(w.filter(isHardRun).length, 1);
});

Deno.test('a club day still costs its discipline its volume — booked is not free', () => {
  const prescribed = minutesOf(week(build({
    ...BIKE_BLOCK, hardDays: [{ day: 'tuesday', discipline: 'bike' }],
  })), 'ride');
  const club = minutesOf(week(build({
    ...BIKE_BLOCK, hardDays: [{ day: 'tuesday', discipline: 'bike', ownership: 'club' }],
  })), 'ride');
  assertEquals(club, prescribed, 'the club ride was priced differently from the prescribed one');
});

// ── THE CAP, THE DEDUPE, AND THE UNCHANGED CASES ─────────────────────────────────────────────────

Deno.test('⛔ THREE HARD DAYS IS NOT A SHAPE — the third is dropped at the door', () => {
  const w = week(build({
    ...RUN_BLOCK,
    hardDays: [
      { day: 'tuesday', discipline: 'run' },
      { day: 'thursday', discipline: 'run' },
      { day: 'saturday', discipline: 'run' },
    ],
  }));
  assertEquals(w.filter(isHardRun).length, 2, 'a third hard day was built');
});

Deno.test('two hard sessions on ONE day is a double, not two hard days — deduped', () => {
  const w = week(build({
    ...RUN_BLOCK,
    hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'tuesday', discipline: 'bike' }],
  }));
  assertEquals(w.filter((s) => String(s.day) === 'Tuesday' && (isHardRun(s) || isHardRide(s))).length, 1);
});

Deno.test('⛔ ONE HARD DAY AND NONE ARE BYTE-IDENTICAL TO BEFORE §1i', () => {
  // The widening is additive or it is a regression. A one-day week and a no-day week are what every
  // block built before today ran, and they are the common case.
  const one = week(build({ ...RUN_BLOCK, hardDays: [{ day: 'thursday', discipline: 'run' }] }));
  assertEquals(one.filter(isHardRun).length, 1);
  assertEquals(one.find(isHardRun)!.day, 'Thursday');
  const none = week(build({ ...RUN_BLOCK }));
  assertEquals(none.filter(isHardRun).length, 0, 'a hard session was invented for a week that asked for none');
  assert(none.some((s) => s.type === 'run'), 'the easy running went missing too');
});

Deno.test('a malformed entry drops itself, not the athlete\'s other answer', () => {
  const w = week(build({
    ...RUN_BLOCK,
    hardDays: [
      { day: 'notaday', discipline: 'run' },
      { day: 'thursday', discipline: 'swim' },
      { day: 'tuesday', discipline: 'run' },
    ],
  }));
  assertEquals(w.filter(isHardRun).length, 1, 'one good entry did not survive two bad ones');
  assertEquals(w.find(isHardRun)!.day, 'Tuesday');
});

// ── PLACEMENT ────────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ TWO HARD DAYS STILL PLACE LEGALLY — the week builds and keeps its rest day', () => {
  for (const [label, cfg] of [
    ['two runs', { ...RUN_BLOCK, hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'run' }] }],
    ['two rides', { ...BIKE_BLOCK, hardDays: [{ day: 'tuesday', discipline: 'bike' }, { day: 'thursday', discipline: 'bike' }] }],
    ['one of each', {
      ...RUN_BLOCK, enduranceFrequency: 3, targetWeeklyMiles: 20,
      bike: { hours: 4, days: 2, longRideDay: 'saturday' },
      hardDays: [{ day: 'tuesday', discipline: 'run' }, { day: 'thursday', discipline: 'bike' }],
    }],
  ] as Array<[string, Record<string, unknown>]>) {
    const w = week(build(cfg));
    assert(w.length > 0, `${label}: the week did not build`);
    // ⛔ MAX_ACTIVE_DAYS = 6 — one full rest day survives every shape, two hard days included.
    const active = new Set(w.map((s) => String(s.day))).size;
    assert(active <= 6, `${label}: ${active} active days — no rest day left`);
    // ⛔ AND NO HEAVY LOWER LIFT LANDS ON A HARD DAY. The clearance rules are the reason the pins
    // exist; a second pin that the placer ignored would be worse than not offering it.
    const hardDaysUsed = new Set(w.filter((s) => isHardRun(s) || isHardRide(s) || isClub(s)).map((s) => String(s.day)));
    for (const s of w.filter((x) => x.type === 'strength' && /Back Squat|Deadlift/.test(x.name))) {
      assert(!hardDaysUsed.has(String(s.day)), `${label}: ${s.name} landed on a hard day`);
    }
  }
});
