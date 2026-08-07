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
 *   1b. and REST IS ASKED, NOT INFERRED (2026-08-06). "The days you did not pick to run" and "the
 *      days you want off" are different answers: a strength session lands on one of the leftovers,
 *      so calling them all `R` promises a day off the plan then fills. A day that is neither run
 *      nor declared-rest stays blank.
 *   2. a standing day is `C` WHATEVER its intensity — the letter names the athlete's commitment,
 *      not our classification of it. (This assertion changed sides an hour after it was written:
 *      the first version branched `H`/`E` on the hard-or-easy answer. Michael: *"club night gets
 *      C."* The old reasoning — the letter must agree with what gets built — is satisfied better by
 *      a letter that makes no claim about intensity at all.)
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
    'E E E · E · E',
    'q1: five tapped; the other two are not yet anything',
  );
  assertEquals(
    read(weekDayRoles({ ...base, longRunDay: 'sunday' })),
    'E E E · E · LR',
    'q2: Sunday becomes the long run and nothing else moves',
  );
  assertEquals(
    read(weekDayRoles({ ...base, longRunDay: 'sunday', restDays: ['thursday', 'saturday'] })),
    'E E E R E R LR',
    'q3: rest is ASKED — Thursday and Saturday are off because they said so',
  );
  assertEquals(
    read(weekDayRoles({ ...base, longRunDay: 'sunday', restDays: ['thursday', 'saturday'], standingDay: 'tuesday' })),
    'E C E R E R LR',
    'q4: Tuesday becomes the club night, everything else holds',
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

Deno.test('⛔ THE CLUB NIGHT IS `C` WHATEVER ITS INTENSITY', () => {
  // ⚠️ THIS CHANGED SIDES (2026-08-06). It asserted `H` for a hard club night and `E` for an easy
  // one, on the rule that the letter must agree with what gets built. `C` satisfies that rule
  // better by making no claim about intensity: it names the fact the athlete gave us — this day is
  // spoken for — and the hard-or-easy question sits directly under the row, in words.
  const week = { trainingDays: FIVE, longRunDay: 'sunday', standingDay: 'tuesday', restDays: ['thursday', 'saturday'], days: DAYS };
  assertEquals(read(weekDayRoles({ ...week })), 'E C E R E R LR');
  // The intensity answer still decides everything downstream (`quality_run` vs `easy_run` in
  // `preferred_days`, and so where the week's hard session lands). It just no longer moves a letter.
  assertEquals(read(weekDayRoles({ ...week, standingIntensity: 'quality' } as never)), 'E C E R E R LR');
  assertEquals(read(weekDayRoles({ ...week, standingIntensity: 'easy' } as never)), 'E C E R E R LR');
});

Deno.test('the long run outranks the standing day when the athlete puts both on one day', () => {
  // The intake warns about this collision rather than refusing it (48-72h, 2026-08-05), so the row
  // has to render SOMETHING. It renders the long run: it is the anchor the rest is placed around.
  const roles = weekDayRoles({
    trainingDays: FIVE, longRunDay: 'sunday', standingDay: 'sunday', days: DAYS,
  });
  assertEquals(roles.sunday, 'LR');
});

Deno.test('⛔ A DAY YOU DO NOT RUN IS NOT AUTOMATICALLY REST', () => {
  // ⚠️ CHANGED SIDES 2026-08-06: this asserted `R` for any non-running day. Rest is its own question
  // now, because a strength session lands on one of the leftovers and an `R` there is a day off the
  // plan then fills.
  const roles = weekDayRoles({ trainingDays: ['monday', 'wednesday', 'friday', 'sunday'], days: DAYS });
  assertEquals(roles.monday, 'E');
  assertEquals(roles.tuesday, undefined, 'a day with nothing said about it must stay blank');
  const declared = weekDayRoles({ trainingDays: ['monday', 'wednesday', 'friday', 'sunday'], restDays: ['tuesday'], days: DAYS });
  assertEquals(declared.tuesday, 'R', 'and it reads R the moment they say so');
});

Deno.test('every letter has a word, and the vocabulary is the week module\'s own', () => {
  // The chip's tooltip reads these; a letter with no expansion is a puzzle, not a label.
  for (const role of ['R', 'E', 'LR', 'C'] as const) {
    assert(DAY_ROLE_TITLE[role]?.length > 0, `${role} has no title`);
  }
  // …and the day vocabulary defaults to this module's own week, so a caller that passes none still
  // gets seven answers rather than an empty object.
  const defaulted = weekDayRoles({ trainingDays: WEEK_DAYS.map((d) => d.toLowerCase()) });
  assertEquals(Object.keys(defaulted).length, 7);
});
