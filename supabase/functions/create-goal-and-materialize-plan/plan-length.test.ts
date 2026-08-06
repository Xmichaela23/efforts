/**
 * ⛔ A PLAN MAY NOT OUTLIVE ITS RACE — the empty-week-10 bug (2026-08-06).
 *
 * `weeksOut` is counted from TODAY; the block opens on the NEXT MONDAY. Race Sunday 2026-10-11 asked
 * on Thursday 2026-08-06 is `ceil(66/7)` = 10 weeks out, but 62 days from the plan's own Monday
 * (2026-08-10) — race day is in plan week 9. The block was built ten weeks long, so week 10 started
 * the day after the race and every one of its seven days resolved to "race day or later": the
 * generator emitted nothing, and the athlete got a blank week on the calendar.
 *
 * ⚠️ `weeksOut` IS DELIBERATELY UNTOUCHED — it feeds the timeline refusal, which is asking a
 * different question (how long has this athlete got from now) and is a settled call
 * (STATE-race-builder §3). Only the plan's LENGTH is trimmed.
 *
 * Run from repo root:
 *   ~/.deno/bin/deno test --allow-read --no-check supabase/functions/create-goal-and-materialize-plan/plan-length.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { planWeekContaining } from '../_shared/planning-context.ts';

/** The trim as the handler applies it: the floor may raise, race week always caps. */
const durationFor = (raw: number, planStart: string | null, race: string) => {
  const week = planWeekContaining(planStart, race);
  return week != null ? Math.max(1, Math.min(raw, week)) : raw;
};

Deno.test('⛔ THE CASE: 10 weeks out, race lands in plan week 9 — the block is 9 weeks', () => {
  assertEquals(planWeekContaining('2026-08-10', '2026-10-11'), 9);
  assertEquals(durationFor(10, '2026-08-10', '2026-10-11'), 9);
});

Deno.test('the race day itself is always inside the block, never one week past its end', () => {
  // Every start-day/race-day combination across a quarter: the last week must CONTAIN race day.
  const start = new Date('2026-08-10T00:00:00');
  for (let offset = 7; offset <= 140; offset++) {
    const race = new Date(start.getTime() + offset * 86400000).toISOString().slice(0, 10);
    const week = planWeekContaining('2026-08-10', race)!;
    const weekOpens = (week - 1) * 7;
    const weekCloses = weekOpens + 6;
    assert(
      offset >= weekOpens && offset <= weekCloses,
      `race ${offset} days in was filed as week ${week} (days ${weekOpens}-${weekCloses})`,
    );
  }
});

Deno.test('a race on the plan\'s own Monday is week 1, and the Sunday after it is still week 1', () => {
  assertEquals(planWeekContaining('2026-08-10', '2026-08-10'), 1);
  assertEquals(planWeekContaining('2026-08-10', '2026-08-16'), 1);
  assertEquals(planWeekContaining('2026-08-10', '2026-08-17'), 2);
});

Deno.test('the trim never LENGTHENS a plan — it is a ceiling only', () => {
  // A 12-week block whose race is 20 weeks out stays 12. (The wizard caps at 20 elsewhere.)
  assertEquals(durationFor(12, '2026-08-10', '2026-12-27'), 12);
});

Deno.test('no plan start, or a race in the past → no opinion, the old length stands', () => {
  assertEquals(planWeekContaining(null, '2026-10-11'), null);
  assertEquals(planWeekContaining('2026-08-10', null), null);
  assertEquals(planWeekContaining('2026-08-10', '2026-08-03'), null);
  assertEquals(durationFor(10, null, '2026-10-11'), 10);
});
