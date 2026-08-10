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
    'E E E R E R E',
    'card 1: five tapped, two rest',
  );
  assertEquals(
    read(weekDayRoles({ ...base, longRunDay: 'sunday' })),
    'E E E R E R LR',
    'card 2: Sunday becomes the long run and nothing else moves',
  );
  assertEquals(
    read(weekDayRoles({ ...base, longRunDay: 'sunday', standingDay: 'tuesday' })),
    'E C E R E R LR',
    'card 3: Tuesday becomes the club night, the long run still reads LR',
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
  const week = { trainingDays: FIVE, longRunDay: 'sunday', standingDay: 'tuesday', days: DAYS };
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

Deno.test('a day dropped from the week reads R again', () => {
  const roles = weekDayRoles({ trainingDays: ['monday', 'wednesday', 'friday', 'sunday'], days: DAYS });
  assertEquals(roles.tuesday, 'R');
  assertEquals(roles.monday, 'E');
});

// ── THE STRONG FOCUS ANCHORS — `H` and `LB` (2026-08-09) ────────────────────────────────────────
//
// That scheduler asks three day questions where the race card asks two, and it had NO day row at
// all: three `<select>`s under an empty box reading "Pick your days and the week appears here".
// `WeekDayRow` already existed and was simply unreachable from that path. These two letters are what
// it was missing.

Deno.test('⛔ THE STRONG FOCUS ROW FILLS IN AS ANCHORS ARE PICKED, AND SAYS NOTHING ELSE', () => {
  // This path gives COUNTS, never a day list — the solver places the runs and rides. So every chip
  // starts blank and only the athlete's own three anchors ever light up.
  const base = { trainingDays: [], days: DAYS };
  assertEquals(read(weekDayRoles({ ...base })), '· · · · · · ·', 'nothing picked, nothing claimed');
  assertEquals(
    read(weekDayRoles({ ...base, hardDay: 'tuesday' })),
    '· H · · · · ·',
    'the one hard day',
  );
  assertEquals(
    read(weekDayRoles({ ...base, hardDay: 'tuesday', longRunDay: 'sunday' })),
    '· H · · · · LR',
    'and the long run — the rest of the week is still unanswered',
  );
  assertEquals(
    read(weekDayRoles({ ...base, hardDay: 'tuesday', longRunDay: 'sunday', longRideDay: 'saturday' })),
    '· H · · · LB LR',
    'all three anchors, five chips still blank',
  );
});

Deno.test('⛔ `H` HERE IS NOT THE `H` THAT WAS REVERTED — the difference is who asked', () => {
  // The reverted `H` classified a STANDING day the athlete merely told us about; `C` replaced it
  // because the letter was our label on their calendar entry. This `H` is the ANSWER to a question
  // the app asked outright — "which day is your one hard session" — so hard is what the slot IS.
  // Both letters therefore coexist, and a week can legitimately carry each.
  const roles = weekDayRoles({
    trainingDays: FIVE, days: DAYS, standingDay: 'tuesday', hardDay: 'thursday',
  });
  assertEquals(roles.tuesday, 'C', 'a day they already train on stays theirs');
  assertEquals(roles.thursday, 'H', 'a day the app asked them to nominate reads as the hard one');
});

Deno.test('the new anchors do not disturb the race card', () => {
  // The race flow passes neither `hardDay` nor `longRideDay`. Adding the parameters must leave every
  // week that path renders byte-identical — this is the assertion that catches a precedence edit.
  const base = { trainingDays: FIVE, days: DAYS, longRunDay: 'sunday', standingDay: 'tuesday' };
  assertEquals(read(weekDayRoles({ ...base })), 'E C E R E R LR');
  assertEquals(
    read(weekDayRoles({ ...base, hardDay: undefined, longRideDay: undefined })),
    'E C E R E R LR',
    'explicitly-absent anchors read the same as never-passed ones',
  );
});

Deno.test('anchor precedence is declared, so a bypassed lock still renders one stable answer', () => {
  // `anchor-days.ts` prevents two anchors on one day at INPUT, so this should be unreachable. It is
  // pinned anyway: an order that exists only by accident is one a refactor reshuffles silently.
  const all = { trainingDays: [], days: DAYS, longRunDay: 'sunday', longRideDay: 'sunday', hardDay: 'sunday' };
  assertEquals(weekDayRoles(all).sunday, 'LR', 'the long run outranks the long ride outranks the hard day');
  assertEquals(
    weekDayRoles({ trainingDays: [], days: DAYS, longRideDay: 'sunday', hardDay: 'sunday' }).sunday,
    'LB',
  );
});

Deno.test('every letter has a word, and the vocabulary is the week module\'s own', () => {
  // The chip's tooltip reads these; a letter with no expansion is a puzzle, not a label.
  for (const role of ['R', 'E', 'LR', 'C', 'H', 'LB'] as const) {
    assert(DAY_ROLE_TITLE[role]?.length > 0, `${role} has no title`);
  }
  // ⚠️ AND EVERY LETTER IS DISTINGUISHABLE FROM EVERY OTHER, which `LR`/`LB` put at risk — they are
  // one character apart on a 9px chip, so the WORDS behind them have to be unmistakable.
  const titles = Object.values(DAY_ROLE_TITLE);
  assertEquals(new Set(titles).size, titles.length, 'two roles share a title');
  // …and the day vocabulary defaults to this module's own week, so a caller that passes none still
  // gets seven answers rather than an empty object.
  const defaulted = weekDayRoles({ trainingDays: WEEK_DAYS.map((d) => d.toLowerCase()) });
  assertEquals(Object.keys(defaulted).length, 7);
});
