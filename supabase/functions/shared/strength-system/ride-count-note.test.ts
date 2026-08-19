// THE RIDE-SHORTFALL NOTE COUNTED THE HARD RIDE ON ONE SIDE OF THE COMPARISON AND NOT THE OTHER.
//
// ⛔ THE DEFECT (found 2026-08-19 on Michael's exported block). Week one built
// `Wed Easy Ride · Fri Threshold Ride · Sat Long Ride` — three ride days against an answer of three
// — and the plan description said *"You asked for 3 ride days; the week had room for 2 once the
// lifting and your fixed days were placed."* The week was right. The sentence about it was wrong.
//
// ⛔ THE CAUSE, at `strength-primary-plan.ts:4492`. `rideDays` holds the LONG ride and the EASY
// rides; the hard ride is placed separately as a hard-day anchor and is never in that list.
// `askedRideDays` DOES include it. Comparing the two is comparing different units, and the
// difference is exactly `hardRideCount`.
//
// ⚠️ EVERY OTHER COUNT IN THE FILE ALREADY SUBTRACTED — `runFreq` (`:3142`) and `ridesWanted`
// (`:3168`) both do. This was the one place that did not, which is why the run side never lied.
//
// ⛔ AND IT WAS NOT ONLY A NOTE. `wantDays` also caps the fill loop, so the inflated ask could let
// it take an extra day from the solver: long + easy + easy + hard = four sessions against three.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/ride-count-note.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };

const BASE = {
  durationWeeks: 12,
  oneRepMaxes: MAXES,
  fiveKPaceSecPerMi: 435,
  thresholdPaceSecPerMi: 455,
  ftpWatts: 240,
  easyPaceMinPerMile: 9,
};

const build = (extra: Record<string, unknown>): any =>
  composeStrengthPrimaryPlan({ ...BASE, ...extra } as never);

/** Distinct days in week one carrying a ride of any kind — easy, threshold or long. */
const rideDaysIn = (plan: any, week = 1): string[] => {
  const rows = (plan.sessions_by_week?.[String(week)] ?? []) as any[];
  const days = rows
    .filter((s) => s.type === 'ride' || s.type === 'bike')
    .map((s) => String(s.day).toLowerCase());
  return [...new Set(days)];
};

const notes = (plan: any): string[] =>
  ((plan.placement_compromises ?? []) as any[]).map((c) => String(c.text));

const shortfallNote = (plan: any): string | undefined =>
  notes(plan).find((t) => t.includes('ride days'));

// ── THE BUG, PINNED ──────────────────────────────────────────────────────────

/**
 * Michael's own shape: run-primary, 2 runs and 3 rides, long run Sunday, long ride Saturday,
 * hard run Tuesday and hard RIDE Friday.
 */
const HARD_RIDE = {
  enduranceSport: 'run',
  enduranceFrequency: 2,
  targetWeeklyMiles: 7,
  longRunDay: 'sunday',
  bike: { hours: 3, days: 3, longRideDay: 'saturday' },
  targetWeeklyRideHours: 3,
  hardDays: [
    { day: 'tuesday', discipline: 'run' },
    { day: 'friday', discipline: 'bike' },
  ],
};

Deno.test('⛔⛔ THE HARD RIDE IS ONE OF THE ASKED RIDE DAYS — three asked, three built, no note', () => {
  const plan = build(HARD_RIDE);
  const days = rideDaysIn(plan);
  assertEquals(
    days.length,
    3,
    `expected three ride days, got ${days.length}: ${days.join(', ')}`,
  );
  assertEquals(
    shortfallNote(plan),
    undefined,
    `the week held the full ask and still complained: ${shortfallNote(plan)}`,
  );
});

Deno.test('⛔ AND IT DOES NOT OVERSHOOT — the inflated ask could buy a FOURTH ride day', () => {
  // `wantDays` caps the fill loop as well as the note. Reading the raw ask let it take an extra
  // flexible day on top of the long ride and the hard ride.
  const plan = build(HARD_RIDE);
  assert(
    rideDaysIn(plan).length <= 3,
    `built more rides than were asked for: ${rideDaysIn(plan).join(', ')}`,
  );
});

// ── THE OTHER HALF: A REAL SHORTFALL MUST STILL SAY SO ───────────────────────

/**
 * ⛔⛔ THE HARD-RUN CASE BUILDS THE FULL ASK, AND THAT IS THE HONEST ASSERTION — NOT "THE NOTE
 * STILL FIRES", WHICH IS WHAT THIS TEST SAID FIRST AND COULD NOT PROVE.
 *
 * `hardRideCount` is 0 here, so the fix subtracts nothing and the arithmetic is untouched. The
 * point of the case is that silencing a TRUE note would be worse than printing a false one — the
 * athlete cannot see what they did not get.
 *
 * ⚠️ AND THE TRUE PATH IS CURRENTLY UNPROVEN, WHICH IS A FINDING RATHER THAN A GAP IN THIS FILE.
 * Across the 61-shape sweep and six hand-built over-subscribed weeks — 4 runs + 4 rides, two hard
 * runs, the long run and long ride pinned to the SAME day — **every shape builds every ride day
 * asked for**. Before the fix, 27 of 61 sweep shapes carried this note and all 27 were the hard-ride
 * miscount. So there is no known input that reaches the note honestly, and asserting that it fires
 * would be asserting a case nobody can construct.
 *
 * ⛔ THE NOTE IS NOT DELETED. `week-model` lays every free unit in somewhere, so a flexible ride
 * cannot currently go unplaced — but that is a property of today's solver, not a law, and the note
 * is the thing that would tell an athlete if it changed. The invariant below is what guards it:
 * whenever it DOES fire, the number it reports must match the calendar.
 */
Deno.test('⚠️ WITH THE HARD DAY ON THE RUN, THE FULL ASK IS BUILT AND NOTHING IS CLAIMED', () => {
  const plan = build({
    enduranceSport: 'run',
    enduranceFrequency: 4,
    targetWeeklyMiles: 20,
    longRunDay: 'sunday',
    bike: { hours: 4, days: 4, longRideDay: 'saturday' },
    targetWeeklyRideHours: 4,
    hardDays: [{ day: 'tuesday', discipline: 'run' }],
  });
  assertEquals(rideDaysIn(plan).length, 4, 'four ride days asked, four expected');
  assertEquals(shortfallNote(plan), undefined, 'the full ask was built, so there is nothing to report');
});

Deno.test('the note never claims a shortfall the calendar contradicts', () => {
  // The generalisable invariant, over every shape this file builds: if a note fires, the number it
  // reports must equal the ride days actually on the week.
  for (const [name, cfg] of [
    ['hard ride', HARD_RIDE],
    ['hard run', { ...HARD_RIDE, hardDays: [{ day: 'tuesday', discipline: 'run' }] }],
    ['two hard rides', {
      ...HARD_RIDE,
      hardDays: [
        { day: 'tuesday', discipline: 'bike' },
        { day: 'friday', discipline: 'bike' },
      ],
    }],
    ['no hard day', { ...HARD_RIDE, hardDays: [] }],
  ] as Array<[string, Record<string, unknown>]>) {
    const plan = build(cfg);
    const note = shortfallNote(plan);
    if (!note) continue;
    const built = rideDaysIn(plan).length;
    const claimed = Number(note.match(/room for (\d+)/)?.[1] ?? -1);
    assertEquals(
      claimed,
      built,
      `${name}: the note says ${claimed} ride days, the week has ${built} — ${note}`,
    );
  }
});
