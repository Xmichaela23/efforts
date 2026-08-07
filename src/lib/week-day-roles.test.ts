/**
 * ⛔ WHAT EACH DAY IS — pinned, because three screens render it and they may not disagree.
 *
 * The marathon intake asks its week across three cards (which days you run → which is long → which
 * is a standing hard day) and all three draw the same seven chips. The letter under each chip is
 * what makes them tellable apart — Michael, on the split: *"one week laid out, how does the user
 * distinguish?"* and then *"R rest, E easy, LR over the days that get chosen so it's clear."*
 *
 * A rule rendered in three places has to BE one rule. This is that rule, and these are the two
 * judgement calls inside it that a future edit will be tempted to "simplify":
 *   1. an unpinned week carries NO letters — silence, not seven E's it has not been told;
 *   2. a standing day declared EASY is `E`, not `H` — pinned is not hard.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --no-check src/lib/week-day-roles.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { weekDayRoles, DAY_ROLE_TITLE, WEEK_DAYS } from './week-budget.ts';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const FIVE = ['monday', 'tuesday', 'wednesday', 'friday', 'sunday'];
/** The row as the athlete reads it, left to right. `·` is a chip with no letter. */
const read = (roles: Record<string, string | undefined>) => DAYS.map((d) => roles[d] ?? '·').join(' ');

Deno.test('⛔ THE THREE CARDS, IN ORDER — the same week gaining marks', () => {
  const base = { trainingDays: FIVE, days: DAYS };
  assertEquals(
    read(weekDayRoles({ ...base })),
    'E E E R E R E',
    'card 1: five tapped, two rest',
  );
  assertEquals(
    read(weekDayRoles({ ...base, longRunDay: 'sunday' })),
    'E E E R E R LR',
    'card 2: Sunday becomes the long run and nothing else moves',
  );
  assertEquals(
    read(weekDayRoles({ ...base, longRunDay: 'sunday', standingDay: 'tuesday', standingIntensity: 'quality' })),
    'E H E R E R LR',
    'card 3: Tuesday becomes the hard day, the long run still reads LR',
  );
});

Deno.test('⛔ AN UNPINNED WEEK SAYS NOTHING — it does not invent seven easy days', () => {
  // With no training days chosen the engine picks them. Labelling every day "E" would be an answer
  // the athlete never gave, on the screen where they are still giving it.
  assertEquals(read(weekDayRoles({ trainingDays: [], days: DAYS })), '· · · · · · ·');
  // …except what they HAVE said explicitly, which still shows.
  assertEquals(
    read(weekDayRoles({ trainingDays: [], longRunDay: 'saturday', days: DAYS })),
    '· · · · · LR ·',
  );
});

Deno.test('⛔ A STANDING DAY DECLARED EASY IS `E`, NOT `H` — pinned is not hard', () => {
  const week = { trainingDays: FIVE, longRunDay: 'sunday', standingDay: 'tuesday', days: DAYS };
  assertEquals(read(weekDayRoles({ ...week, standingIntensity: 'quality' })), 'E H E R E R LR');
  assertEquals(read(weekDayRoles({ ...week, standingIntensity: 'easy' })), 'E E E R E R LR');
  // The letter must agree with what gets built: an easy club night means the engine puts the week's
  // quality session somewhere else, so calling that day `H` would be the screen contradicting the plan.
  assertEquals(read(weekDayRoles({ ...week })), 'E E E R E R LR', 'an unstated intensity is not hard');
});

Deno.test('the long run outranks the standing day when the athlete puts both on one day', () => {
  // The intake warns about this collision rather than refusing it (48-72h, 2026-08-05), so the row
  // has to render SOMETHING. It renders the long run: it is the anchor the rest is placed around.
  const roles = weekDayRoles({
    trainingDays: FIVE, longRunDay: 'sunday', standingDay: 'sunday', standingIntensity: 'quality', days: DAYS,
  });
  assertEquals(roles.sunday, 'LR');
});

Deno.test('a day dropped from the week reads R again', () => {
  const roles = weekDayRoles({ trainingDays: ['monday', 'wednesday', 'friday', 'sunday'], days: DAYS });
  assertEquals(roles.tuesday, 'R');
  assertEquals(roles.monday, 'E');
});

Deno.test('every letter has a word, and the vocabulary is the week module\'s own', () => {
  // The chip's tooltip reads these; a letter with no expansion is a puzzle, not a label.
  for (const role of ['R', 'E', 'LR', 'H'] as const) {
    assert(DAY_ROLE_TITLE[role]?.length > 0, `${role} has no title`);
  }
  // …and the day vocabulary defaults to this module's own week, so a caller that passes none still
  // gets seven answers rather than an empty object.
  const defaulted = weekDayRoles({ trainingDays: WEEK_DAYS.map((d) => d.toLowerCase()) });
  assertEquals(Object.keys(defaulted).length, 7);
});
