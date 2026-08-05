/**
 * `assign-days` — the athlete's pins are read, and today's plans do not change shape.
 *
 * ⛔ THE SECOND HALF MATTERS AS MUCH AS THE FIRST. This function replaced a grid that six generators
 * inherit, so the risk is not "does the pin work" — it is "did every unpinned plan just move". The
 * unpinned cases below exist to prove the default output is the OLD output, day for day.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --no-check supabase/functions/generate-run-plan/assign-days.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Session } from './types.ts';
import { assignDays, dayBeforeLongRun, toWeekDay } from './generators/assign-days.ts';

const s = (name: string, tags: string[]): Session => ({
  day: '', type: 'run', name, description: '', duration: 60, tags,
});
const dayOf = (week: Session[], name: string) => week.find((x) => x.name === name)?.day;

// ── the pins are read ────────────────────────────────────────────────────────────────────────────

Deno.test('the club night takes the hard session — the exact case Michael screenshotted', () => {
  // Wednesday pinned as run club, and the plan put an Easy Run there while the copy under the
  // picker said "The plan puts its hard running there."
  const week = assignDays([
    s('Long Run', ['long_run']),
    s('Intervals', ['intervals']),
    s('Easy 1', ['easy']),
    s('Easy 2', ['easy']),
  ], { long_run: 'sunday', quality_run: 'wednesday' });
  assertEquals(dayOf(week, 'Intervals'), 'Wednesday', 'the pinned club night did not get the hard session');
  assertEquals(dayOf(week, 'Long Run'), 'Sunday');
  // and no easy run was allowed to squat on it
  assertEquals(week.filter((x) => x.day === 'Wednesday').length, 1);
});

Deno.test('an easy/social club run is pinned as easy and the hard session goes elsewhere', () => {
  // ArcSetupWizard's second option: "Easy / social long run — counts as aerobic. The planner adds a
  // separate quality session." The pin must NOT drag the hard day onto the club night.
  const week = assignDays([
    s('Long Run', ['long_run']),
    s('Tempo', ['tempo']),
    s('Easy 1', ['easy']),
  ], { long_run: 'sunday', easy_run: 'wednesday' });
  assertEquals(dayOf(week, 'Easy 1'), 'Wednesday');
  assertEquals(dayOf(week, 'Tempo'), 'Tuesday', 'a hard session landed on the social club run');
});

Deno.test('a Saturday long run moves the rest day to Friday, not the middle of the week', () => {
  // The old rest rule was `new Set(['Saturday'])` with the comment "prep for Sunday long run" — so
  // it was never about Saturday, it was about the day before. Deriving it keeps the intent.
  assertEquals(dayBeforeLongRun('Saturday'), 'Friday');
  assertEquals(dayBeforeLongRun('Sunday'), 'Saturday');
  assertEquals(dayBeforeLongRun('Monday'), 'Sunday');

  const week = assignDays([
    s('Long Run', ['long_run']),
    s('Intervals', ['intervals']),
    s('Easy 1', ['easy']),
    s('Easy 2', ['easy']),
    s('Easy 3', ['easy']),
  ], { long_run: 'saturday' });
  assertEquals(dayOf(week, 'Long Run'), 'Saturday');
  assertEquals(week.some((x) => x.day === 'Friday'), false, 'Friday should be the rest day before a Saturday long run');
  assertEquals(week.length, 5, 'a session went missing');
});

Deno.test('a pin onto the rest day is honoured — the athlete is stating a fact, not a preference', () => {
  // Club on Saturday with a Sunday long run is back-to-back hard days. The intake warns at entry;
  // if the athlete keeps it, the engine does not quietly overrule them.
  const week = assignDays([
    s('Long Run', ['long_run']),
    s('Intervals', ['intervals']),
  ], { long_run: 'sunday', quality_run: 'saturday' });
  assertEquals(dayOf(week, 'Intervals'), 'Saturday');
});

Deno.test('an unresolvable pin is ignored rather than guessed at', () => {
  assertEquals(toWeekDay('nonsense'), null);
  assertEquals(toWeekDay(''), null);
  assertEquals(toWeekDay(null), null);
  assertEquals(toWeekDay('wednesday'), 'Wednesday');
  assertEquals(toWeekDay('Wed'), 'Wednesday');
  const week = assignDays([s('Long Run', ['long_run'])], { long_run: 'someday' });
  assertEquals(dayOf(week, 'Long Run'), 'Sunday', 'a junk pin should fall back to the default, not blank the day');
});

// ── and nothing moved for anyone who did not pin ─────────────────────────────────────────────────

Deno.test('⛔ UNPINNED OUTPUT IS THE OLD GRID, DAY FOR DAY', () => {
  // Long run Sunday; quality Tuesday then Thursday; easy Monday, Wednesday, Friday; Saturday rest.
  const week = assignDays([
    s('Long Run', ['long_run']),
    s('Intervals', ['intervals']),
    s('Tempo', ['tempo']),
    s('Easy 1', ['easy']),
    s('Easy 2', ['easy']),
    s('Easy 3', ['easy']),
  ]);
  assertEquals(dayOf(week, 'Long Run'), 'Sunday');
  assertEquals(dayOf(week, 'Intervals'), 'Tuesday');
  assertEquals(dayOf(week, 'Tempo'), 'Thursday');
  assertEquals(dayOf(week, 'Easy 1'), 'Monday');
  assertEquals(dayOf(week, 'Easy 2'), 'Wednesday');
  assertEquals(dayOf(week, 'Easy 3'), 'Friday');
  assertEquals(week.some((x) => x.day === 'Saturday'), false, 'Saturday is rest when six sessions fit without it');
});

Deno.test('a session already carrying a day keeps it — recovery and taper weeks assign their own', () => {
  const pre = s('Shakeout', ['easy']);
  pre.day = 'Thursday';
  const week = assignDays([pre, s('Long Run', ['long_run'])], { long_run: 'sunday' });
  assertEquals(dayOf(week, 'Shakeout'), 'Thursday');
  assertEquals(dayOf(week, 'Long Run'), 'Sunday');
});

Deno.test('⛔ NO SESSION IS SILENTLY DROPPED — the old loop lost one and said nothing', () => {
  const input = [
    s('Long Run', ['long_run']),
    s('Intervals', ['intervals']),
    s('Tempo', ['tempo']),
    s('Easy 1', ['easy']),
    s('Easy 2', ['easy']),
    s('Easy 3', ['easy']),
    s('Easy 4', ['easy']),
  ];
  const week = assignDays(input);
  assertEquals(week.length, input.length, 'sessions in must equal sessions out');
  assertEquals(new Set(week.map((x) => x.day)).size, 7, 'seven sessions should occupy seven distinct days');
});
