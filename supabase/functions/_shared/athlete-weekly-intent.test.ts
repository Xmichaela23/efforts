// ONE SHAPE FOR WHAT THE ATHLETE ASKED FOR — the ride half (stage 4, 2026-08-21).
//
// ⛔ WHAT THIS PINS, AND WHY EACH CASE EXISTS. Every assertion below is a bug that shipped or a
// rule that was silently restated in a second file. None of them are hypotheticals.
//
//   1. THE 1-4 RANGE HAS ONE STATEMENT. It had five, and three were still capped at 3 after the
//      ceiling was raised on 2026-08-19 — so an athlete who tapped `4` got `3`, with nothing said.
//   2. `null` MEANS "NOT AN ANSWER", NOT ZERO. Three independent "default to 2" clauses sat on this
//      chain; the fix is not a better default, it is one default and a way to see it fired.
//   3. THE HARD RIDE IS ONE OF THE PICKED RIDE DAYS. Three sites subtracted it and one forgot,
//      which put *"the week had room for 2"* on a week that had built all three.
//   4. A LONG RIDE NEEDS A SESSION LEFT OVER. `!!longRideDay` alone gave an athlete who asked for
//      ONE ride the hard session PLUS a long ride.
//
// ⚠️ THE ARITHMETIC TABLE AT THE BOTTOM IS THE REAL GATE. It re-runs the composer's ORIGINAL
// expressions, verbatim, against the object's fields across the whole shape space. If a future edit
// changes what the object means, that table goes red — a byte-identical claim that is checked
// rather than asserted.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/_shared/athlete-weekly-intent.test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  buildRideIntent,
  buildRunIntent,
  normalizeRunDays,
  normalizeRunMiles,
  normalizeSwimDays,
  resolveRunAsk,
  resolveSwimAsk,
  RUN_DAYS_CHOICES,
  RUN_DAYS_DEFAULT,
  SWIM_DAYS_CHOICES,
  SWIM_DAYS_MAX,
  normalizeRideDays,
  normalizeRideHours,
  resolveRideAsk,
  RIDE_DAYS_CHOICES,
  RIDE_DAYS_DEFAULT,
  RIDE_HOURS_DEFAULT,
  FALLBACK_EASY_MIN_PER_MILE,
  seatRideIntent,
  seatRunIntent,
  suppliedDefaults,
} from './athlete-weekly-intent.ts';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const asDay = (v: unknown): string | null => {
  const s = String(v ?? '').trim().toLowerCase();
  return DAYS.find((d) => d === s) ?? null;
};

Deno.test('⛔ FOUR RIDES SURVIVES — the cap that silently rewrote it to 3 is gone', () => {
  assertEquals(normalizeRideDays(4), 4);
  assertEquals(RIDE_DAYS_CHOICES[RIDE_DAYS_CHOICES.length - 1], 4);
  // The whole offered range round-trips unchanged. A ceiling raised in one file and not another is
  // exactly how a 4 became a 3 for two days.
  for (const n of RIDE_DAYS_CHOICES) assertEquals(normalizeRideDays(n), n);
});

Deno.test('a count outside the range clamps INTO it rather than being dropped', () => {
  assertEquals(normalizeRideDays(9), 4);
  assertEquals(normalizeRideDays(-3), 1);
  // ⚠️ A FRACTIONAL COUNT LANDS INSIDE THE RANGE, never on 0. ⛔ The ORDER of the round and the
  // clamp does not matter — mutation-tested 2026-08-21, both bounds are integers so the two orders
  // agree on every input. What matters is that both happen.
  assertEquals(normalizeRideDays(0.4), 1);
  assertEquals(normalizeRideDays(3.6), 4);
});

Deno.test('⛔ "not an answer" is null, never zero — the default is applied ONCE, downstream', () => {
  for (const raw of [undefined, null, '', 0, NaN, 'three', {}]) {
    assertEquals(normalizeRideDays(raw), null, `expected no answer from ${JSON.stringify(raw)}`);
  }
});

Deno.test('hours: the nested value wins, the top-level one is the fallback, neither is null', () => {
  assertEquals(normalizeRideHours(6, 9), 6);
  assertEquals(normalizeRideHours(undefined, 9), 9);
  assertEquals(normalizeRideHours(0, 9), 9);
  assertEquals(normalizeRideHours(undefined, undefined), null);
  // ⚠️ NOT ZERO. `0` here would read as "they asked for no riding", which is a different answer
  // from "they never said" and reaches a different branch of the composer.
  assertEquals(normalizeRideHours(0, 0), null);
});

Deno.test('⛔ a default is stamped as OURS, and an answer as THEIRS', () => {
  const answered = resolveRideAsk({
    bike: { days: 3, hours: 6 }, primaryIsBike: false, resolveDay: asDay,
  });
  assertEquals(answered.askedDays, 3);
  assertEquals(answered.askedDaysSource, 'answered');
  assertEquals(answered.hoursSource, 'answered');
  assertEquals(suppliedDefaults(answered), []);

  const guessed = resolveRideAsk({ bike: {}, primaryIsBike: false, resolveDay: asDay });
  assertEquals(guessed.askedDays, RIDE_DAYS_DEFAULT);
  assertEquals(guessed.askedDaysSource, 'default');
  assertEquals(guessed.hoursOrDefault, RIDE_HOURS_DEFAULT);
  // ⛔ THIS IS THE FINDING §2.0 MEASURED: three "default to 2" clauses, one of which logged. The
  // object now answers "did the athlete choose this?" for anyone who asks.
  assertEquals(suppliedDefaults(guessed), ['ride_days', 'ride_hours']);
});

Deno.test('hours from EITHER source count as having a bike', () => {
  // ⚠️ 2026-07-29: a bike-primary athlete whose hours arrived top-level with no `bike{}` object
  // failed an object-presence test, the hours→rides pass never ran, and they got 2×45min on a 6h ask.
  const topLevelOnly = resolveRideAsk({ targetWeeklyRideHours: 6, primaryIsBike: true, resolveDay: asDay });
  assert(topLevelOnly.declared);
  assertEquals(topLevelOnly.hours, 6);
  // An empty object still counts — it is the intake saying "they kept a bike", with the numbers absent.
  assert(resolveRideAsk({ bike: {}, primaryIsBike: false, resolveDay: asDay }).declared);
  // No bike anywhere, and the bike is not the primary sport: no riding in this block.
  const none = resolveRideAsk({ primaryIsBike: false, resolveDay: asDay });
  assertEquals(none.declared, false);
  assertEquals(none.selected, false);
  assertEquals(none.askedDays, 0);
});

Deno.test('a long-ride day that is not a day is not a long-ride day', () => {
  const ask = resolveRideAsk({
    bike: { days: 2, longRideDay: 'someday' }, primaryIsBike: false, resolveDay: asDay,
  });
  assertEquals(ask.longDay, null);
  assertEquals(resolveRideAsk({
    bike: { days: 2, longRideDay: 'Saturday' }, primaryIsBike: false, resolveDay: asDay,
  }).longDay, 'saturday');
});

Deno.test('⛔ THE HARD RIDE IS ONE OF THE PICKED RIDE DAYS — subtracted once, here', () => {
  const ask = resolveRideAsk({
    bike: { days: 3, hours: 6, longRideDay: 'saturday' }, primaryIsBike: false, resolveDay: asDay,
  });
  const seated = seatRideIntent(ask, 1);
  assertEquals(seated.askedDays, 3);
  // ⛔ THIS IS THE NUMBER THE SHORTFALL NOTE COMPARES AGAINST. It said "you asked for 3" while the
  // list it compared held only the long and easy rides — the hard ride was never in it.
  assertEquals(seated.daysAfterHard, 2);
  assert(seated.hasLongDay);
  assertEquals(seated.easyWanted, 1);
});

Deno.test('⛔ A LONG RIDE NEEDS A SESSION LEFT OVER — one ride, one hard ride, no long ride', () => {
  const intent = buildRideIntent({
    bike: { days: 1, hours: 3, longRideDay: 'saturday' }, primaryIsBike: false, resolveDay: asDay,
  }, 1);
  // They pinned a day, so they WANT a long ride. There is no session left to be one.
  assertEquals(intent.longDay, 'saturday');
  assertEquals(intent.hasLongDay, false);
  assertEquals(intent.daysAfterHard, 0);
  assertEquals(intent.easyWanted, 0);
});

Deno.test('more hard rides than picked ride days never goes negative', () => {
  const intent = buildRideIntent({ bike: { days: 1 }, primaryIsBike: false, resolveDay: asDay }, 3);
  assertEquals(intent.daysAfterHard, 0);
  assertEquals(intent.easyWanted, 0);
  assertEquals(intent.hasLongDay, false);
});

/**
 * ⛔ THE BYTE-IDENTICAL GATE. Stage 4 was told to change no behaviour, and the honest way to make
 * that claim is to keep the code it replaced and run both.
 *
 * These four expressions are the composer's originals, copied verbatim from
 * `strength-primary-plan.ts` before the swap:
 *
 *   hasBike        = !!args.bike || Number(args.targetWeeklyRideHours) > 0
 *   bikeSelected   = hasBike || enduranceSport === 'bike'
 *   longRidePin    = hasBike ? asDay(args.bike?.longRideDay) : null
 *   askedRideDays  = bikeSelected ? Math.max(1, Math.min(4, Math.round(Number(args.bike?.days) || 2))) : 0
 *   rideHasLongDay = bikeSelected && !!longRidePin && askedRideDays > hardRideCount
 *   ridesWanted    = bikeSelected ? Math.max(0, askedRideDays - (rideHasLongDay ? 1 : 0) - hardRideCount) : 0
 *   wantDays       = Math.max(0, askedRideDays - hardRideCount)
 *   rideHours      = Number(args.bike?.hours) > 0 ? Number(args.bike!.hours)
 *                    : (Number(args.targetWeeklyRideHours) > 0 ? Number(args.targetWeeklyRideHours) : 2)
 *   weeklyRideHours = ...same, with `null` instead of `2`
 */
// deno-lint-ignore no-explicit-any
function composerOriginal(args: any, primaryIsBike: boolean, hardRideCount: number) {
  const hasBike = !!args.bike || Number(args.targetWeeklyRideHours) > 0;
  const bikeSelected = hasBike || primaryIsBike;
  const longRidePin = hasBike ? asDay(args.bike?.longRideDay) : null;
  const askedRideDays = bikeSelected
    ? Math.max(1, Math.min(4, Math.round(Number(args.bike?.days) || 2)))
    : 0;
  const rideHasLongDay = bikeSelected && !!longRidePin && askedRideDays > hardRideCount;
  const ridesWanted = bikeSelected
    ? Math.max(0, askedRideDays - (rideHasLongDay ? 1 : 0) - hardRideCount)
    : 0;
  const wantDays = Math.max(0, askedRideDays - hardRideCount);
  const rideHours = Number(args.bike?.hours) > 0
    ? Number(args.bike!.hours)
    : (Number(args.targetWeeklyRideHours) > 0 ? Number(args.targetWeeklyRideHours) : 2);
  const weeklyRideHours = Number(args.bike?.hours) > 0
    ? Number(args.bike!.hours)
    : (Number(args.targetWeeklyRideHours) > 0 ? Number(args.targetWeeklyRideHours) : null);
  return {
    hasBike, bikeSelected, longRidePin, askedRideDays,
    rideHasLongDay, ridesWanted, wantDays, rideHours, weeklyRideHours,
  };
}

Deno.test('⛔ BYTE-IDENTICAL: the object agrees with the code it replaced, on every shape', () => {
  const bikeShapes: unknown[] = [
    undefined, null, {},
    { days: 1 }, { days: 2 }, { days: 3 }, { days: 4 }, { days: 5 }, { days: 0 }, { days: 0.4 },
    { hours: 6 }, { hours: 0 }, { hours: 20, days: 4 },
    { longRideDay: 'saturday' }, { longRideDay: 'nonsense' },
    { days: 1, hours: 3, longRideDay: 'sunday' },
    { days: 3, hours: 6, longRideDay: 'saturday' },
    { days: 4, hours: 9, longRideDay: 'wednesday' },
  ];
  let checked = 0;
  for (const bike of bikeShapes) {
    for (const targetWeeklyRideHours of [undefined, 0, 4]) {
      for (const primaryIsBike of [false, true]) {
        for (const hardRideCount of [0, 1, 2, 3]) {
          const args = { bike, targetWeeklyRideHours };
          const was = composerOriginal(args, primaryIsBike, hardRideCount);
          const now = buildRideIntent(
            // deno-lint-ignore no-explicit-any
            { bike: bike as any, targetWeeklyRideHours, primaryIsBike, resolveDay: asDay },
            hardRideCount,
          );
          const where = `bike=${JSON.stringify(bike)} top=${targetWeeklyRideHours} ` +
            `primaryIsBike=${primaryIsBike} hard=${hardRideCount}`;
          assertEquals(now.declared, was.hasBike, `declared · ${where}`);
          assertEquals(now.selected, was.bikeSelected, `selected · ${where}`);
          assertEquals(now.longDay, was.longRidePin, `longDay · ${where}`);
          assertEquals(now.askedDays, was.askedRideDays, `askedDays · ${where}`);
          assertEquals(now.hasLongDay, was.rideHasLongDay, `hasLongDay · ${where}`);
          assertEquals(now.easyWanted, was.ridesWanted, `easyWanted · ${where}`);
          assertEquals(now.daysAfterHard, was.wantDays, `daysAfterHard · ${where}`);
          assertEquals(now.hoursOrDefault, was.rideHours, `hoursOrDefault · ${where}`);
          assertEquals(now.hours, was.weeklyRideHours, `hours · ${where}`);
          checked++;
        }
      }
    }
  }
  // ⚠️ The count is asserted so a future edit that silently empties the table fails rather than
  // passing vacuously — the exact way two of the three test files written on 2026-08-19 lied.
  assertEquals(checked, bikeShapes.length * 3 * 2 * 4);
  assertEquals(checked, 432);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE RUN (stage 4 run half, 2026-08-22) — same shape, same gate, same table.
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔ ONE RUN A WEEK IS A LEGAL ANSWER — the floor was a hard 2 and overrode it', () => {
  // Michael, 2026-08-19. The floor was `Math.max(DEFAULT_ENDURANCE_SESSIONS, …)`, so an athlete who
  // asked for ONE run got TWO built and the screen and the plan disagreed about the week the athlete
  // had described. 2 is Hickson's maintenance dose — an argument for what to RECOMMEND, never for
  // overwriting a stated answer.
  assertEquals(normalizeRunDays(1), 1);
  for (const n of RUN_DAYS_CHOICES) assertEquals(normalizeRunDays(n), n);
  assertEquals(normalizeRunDays(9), 4);
  assertEquals(normalizeRunDays(-3), 1);
});

Deno.test('⛔ RUN "not an answer" is null — 0 is malformed, not "no running"', () => {
  // ⚠️ ZERO RUNS IS `selected: false`, decided by the four positive signals — never by a 0 in the
  // count. The composer's own comment said exactly this before the function existed.
  for (const raw of [undefined, null, '', 0, NaN, 'three', {}]) {
    assertEquals(normalizeRunDays(raw), null, `expected no answer from ${JSON.stringify(raw)}`);
  }
});

Deno.test('⛔ SELECTION NEEDS A POSITIVE SIGNAL — never the defaulted frequency', () => {
  // `enduranceFrequency` arrives from `create-goal` with a default of 2 even for a bike-only
  // athlete, so reading THAT as selection invents a sport nobody asked for.
  const bikeOnly = resolveRunAsk({ enduranceFrequency: 2, primaryIsRun: false, hasHardRun: false, resolveDay: asDay });
  assertEquals(bikeOnly.selected, false, 'a defaulted frequency selected the run');
  assertEquals(bikeOnly.askedDays, 0);
  assertEquals(bikeOnly.longDay, null);
  // Each of the four signals selects on its own.
  assert(resolveRunAsk({ primaryIsRun: true, hasHardRun: false, resolveDay: asDay }).selected, 'primary sport');
  assert(resolveRunAsk({ targetWeeklyMiles: 18, primaryIsRun: false, hasHardRun: false, resolveDay: asDay }).selected, 'typed miles');
  assert(resolveRunAsk({ longRunDay: 'sunday', primaryIsRun: false, hasHardRun: false, resolveDay: asDay }).selected, 'a long-run day');
  assert(resolveRunAsk({ primaryIsRun: false, hasHardRun: true, resolveDay: asDay }).selected, 'a hard run');
});

Deno.test('⛔ THE LONG RUN IS A SESSION, NOT AN EXTRA — the 2026-08-19 table, row by row', () => {
  const ask = (days: number) =>
    resolveRunAsk({ enduranceFrequency: days, primaryIsRun: true, hasHardRun: true, resolveDay: asDay });
  const seat = (days: number, hard: number) => seatRunIntent(ask(days), hard);
  // asked 1, hard 0 -> 1 long
  assertEquals(seat(1, 0).daysAfterHard, 1); assert(seat(1, 0).hasLongDay); assertEquals(seat(1, 0).easyWanted, 0);
  // asked 1, hard 1 -> 1 hard, and the single session carries the role
  assertEquals(seat(1, 1).daysAfterHard, 0); assertEquals(seat(1, 1).hasLongDay, false); assertEquals(seat(1, 1).easyWanted, 0);
  // asked 2, hard 1 -> long + hard
  assertEquals(seat(2, 1).daysAfterHard, 1); assert(seat(2, 1).hasLongDay); assertEquals(seat(2, 1).easyWanted, 0);
  // asked 2, hard 2 -> 2 hard. ⛔ This built THREE before the fix.
  assertEquals(seat(2, 2).daysAfterHard, 0); assertEquals(seat(2, 2).hasLongDay, false); assertEquals(seat(2, 2).easyWanted, 0);
  // asked 3, hard 1 -> long + easy + hard
  assertEquals(seat(3, 1).daysAfterHard, 2); assert(seat(3, 1).hasLongDay); assertEquals(seat(3, 1).easyWanted, 1);
});

Deno.test('⛔ THE RUN AND THE RIDE DISAGREE ON `hasLongDay`, AND BOTH ARE RIGHT', () => {
  // A long RIDE exists only when the athlete PINNED a day — the engine never invents one. A long RUN
  // exists whenever a session is left over, pinned or not, because an unpinned long run falls to
  // `DEFAULT_LONG_DAY`. ⚠️ Making them agree would either invent a long ride nobody asked for or
  // delete the long run of every athlete who never answered that question.
  const runNoPin = buildRunIntent({ enduranceFrequency: 3, primaryIsRun: true, hasHardRun: false, resolveDay: asDay }, 0);
  assertEquals(runNoPin.longDay, null);
  assertEquals(runNoPin.hasLongDay, true, 'an unpinned long run stopped existing');
  const rideNoPin = buildRideIntent({ bike: { days: 3 }, primaryIsBike: false, resolveDay: asDay }, 0);
  assertEquals(rideNoPin.longDay, null);
  assertEquals(rideNoPin.hasLongDay, false, 'an unpinned long ride was invented');
});

Deno.test('⛔ MILES ARE MILES AND THE PACE FALLBACK IS NAMED AS OURS', () => {
  const typed = resolveRunAsk({
    targetWeeklyMiles: 18, easyPaceMinPerMile: 9, primaryIsRun: true, hasHardRun: false, resolveDay: asDay,
  });
  assertEquals(typed.miles, 18);
  assertEquals(typed.milesSource, 'answered');
  assertEquals(typed.easyPaceMinPerMile, 9);
  assertEquals(typed.paceSource, 'answered');
  assertEquals(typed.paceOrFallback, 9);
  const unlearned = resolveRunAsk({ targetWeeklyMiles: 18, primaryIsRun: true, hasHardRun: false, resolveDay: asDay });
  // ⚠️ `null` IS NOT SLOW. An unlearned pace is "we have not asked", and the two readings are named
  // separately so the copy the athlete sees and the arithmetic cannot drift.
  assertEquals(unlearned.easyPaceMinPerMile, null);
  assertEquals(unlearned.paceSource, 'default');
  assertEquals(unlearned.paceOrFallback, FALLBACK_EASY_MIN_PER_MILE);
  assertEquals(normalizeRunMiles(0), null);
  assertEquals(normalizeRunMiles(undefined), null);
});

// ── THE SWIM — consolidation only ───────────────────────────────────────────────────────────────

Deno.test('⛔ THE SWIM IS A COUNT AND NOTHING ELSE (D-323 §5 — booked, not coached)', () => {
  const two = resolveSwimAsk({ swimDays: 2 });
  assertEquals(two, { selected: true, askedDays: 2, askedDaysSource: 'answered' });
  // ⛔ NO DEFAULT IS SUPPLIED, and that is the standing decision: an unanswered swim is no swim, and
  // the app never books a session the athlete did not ask for.
  assertEquals(resolveSwimAsk({}).selected, false);
  assertEquals(resolveSwimAsk({}).askedDays, 0);
  assertEquals(resolveSwimAsk({ swimDays: 0 }).askedDays, 0);
  // ⚠️ The screen offers 1/2/3; the WIRE has always accepted 4, which is the safe direction — it is
  // how a goal row stored under an older picker still rebuilds.
  assertEquals(SWIM_DAYS_CHOICES[SWIM_DAYS_CHOICES.length - 1], 3);
  assertEquals(normalizeSwimDays(4), SWIM_DAYS_MAX);
  assertEquals(normalizeSwimDays(9), 4, 'the wire clamp is no longer SWIM_DAYS_MAX');
});

/**
 * ⛔ THE BYTE-IDENTICAL GATE FOR THE RUN. Same method as the ride's: keep the composer's originals
 * and run both. Copied verbatim from `strength-primary-plan.ts` before the swap:
 *
 *   askedRunMiles  = Number(args.targetWeeklyMiles) > 0 ? Number(args.targetWeeklyMiles) : 0
 *   runSelected    = enduranceSport === 'run' || askedRunMiles > 0 || !!asDay(args.longRunDay)
 *                    || hardRunCount > 0
 *   longRunPin     = runSelected ? asDay(args.longRunDay) : null
 *   askedRunDays   = runSelected ? Math.max(1, Math.min(4, Math.round(Number(args.enduranceFrequency) || 2))) : 0
 *   runFreq        = runSelected ? Math.max(0, askedRunDays - hardRunCount) : 0
 *   runHasLongDay  = runSelected && runFreq > 0
 *   easyRunsWanted = runSelected ? Math.max(0, runFreq - (runHasLongDay ? 1 : 0)) : 0
 *   weeklyRunHours = miles > 0 && pace > 0 ? (miles * pace) / 60 : null
 */
// deno-lint-ignore no-explicit-any
function composerRunOriginal(args: any, primaryIsRun: boolean, hardRunCount: number) {
  const askedRunMiles = Number(args.targetWeeklyMiles) > 0 ? Number(args.targetWeeklyMiles) : 0;
  const runSelected = primaryIsRun || askedRunMiles > 0 || !!asDay(args.longRunDay)
    || hardRunCount > 0;
  const longRunPin = runSelected ? asDay(args.longRunDay) : null;
  const askedRunDays = runSelected
    ? Math.max(1, Math.min(4, Math.round(Number(args.enduranceFrequency) || 2)))
    : 0;
  const runFreq = runSelected ? Math.max(0, askedRunDays - hardRunCount) : 0;
  const runHasLongDay = runSelected && runFreq > 0;
  const easyRunsWanted = runSelected ? Math.max(0, runFreq - (runHasLongDay ? 1 : 0)) : 0;
  const weeklyRunHours = Number(args.targetWeeklyMiles) > 0 && Number(args.easyPaceMinPerMile) > 0
    ? (Number(args.targetWeeklyMiles) * Number(args.easyPaceMinPerMile)) / 60
    : null;
  return { askedRunMiles, runSelected, longRunPin, askedRunDays, runFreq, runHasLongDay, easyRunsWanted, weeklyRunHours };
}

Deno.test('⛔ BYTE-IDENTICAL: the run object agrees with the code it replaced, on every shape', () => {
  let checked = 0;
  for (const targetWeeklyMiles of [undefined, 0, 7, 18, 30]) {
    for (const easyPaceMinPerMile of [undefined, 0, 9]) {
      for (const longRunDay of [undefined, 'sunday', 'Saturday', 'nonsense']) {
        for (const enduranceFrequency of [undefined, 0, 1, 2, 4, 9, 0.4]) {
          for (const primaryIsRun of [false, true]) {
            for (const hardRunCount of [0, 1, 2]) {
              const args = { targetWeeklyMiles, easyPaceMinPerMile, longRunDay, enduranceFrequency };
              const was = composerRunOriginal(args, primaryIsRun, hardRunCount);
              const now = buildRunIntent(
                { ...args, primaryIsRun, hasHardRun: hardRunCount > 0, resolveDay: asDay },
                hardRunCount,
              );
              const where = `miles=${targetWeeklyMiles} pace=${easyPaceMinPerMile} long=${longRunDay} `
                + `freq=${enduranceFrequency} primary=${primaryIsRun} hard=${hardRunCount}`;
              assertEquals(now.selected, was.runSelected, `selected · ${where}`);
              assertEquals(now.longDay, was.longRunPin, `longDay · ${where}`);
              assertEquals(now.askedDays, was.askedRunDays, `askedDays · ${where}`);
              assertEquals(now.daysAfterHard, was.runFreq, `daysAfterHard · ${where}`);
              assertEquals(now.hasLongDay, was.runHasLongDay, `hasLongDay · ${where}`);
              assertEquals(now.easyWanted, was.easyRunsWanted, `easyWanted · ${where}`);
              // The miles reading: `null` here is the old `0`, and both mean "never stated".
              assertEquals(now.miles ?? 0, was.askedRunMiles, `miles · ${where}`);
              const nowHours = now.miles != null && now.easyPaceMinPerMile != null
                ? (now.miles * now.easyPaceMinPerMile) / 60
                : null;
              assertEquals(nowHours, was.weeklyRunHours, `weeklyRunHours · ${where}`);
              checked++;
            }
          }
        }
      }
    }
  }
  // ⚠️ Asserted so a future edit that empties the table fails rather than passing vacuously.
  assertEquals(checked, 5 * 3 * 4 * 7 * 2 * 3);
  assertEquals(checked, 2520);
});
