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
  normalizeRideDays,
  normalizeRideHours,
  resolveRideAsk,
  RIDE_DAYS_CHOICES,
  RIDE_DAYS_DEFAULT,
  RIDE_HOURS_DEFAULT,
  seatRideIntent,
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
