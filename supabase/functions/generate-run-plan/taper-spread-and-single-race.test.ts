/**
 * ⛔ TWO DEFECTS FROM ONE REAL MARATHON EXPORT (2026-08-07) — beginner, sustainable, 11 weeks,
 * long run pinned to Sunday, race on a THURSDAY.
 *
 *   1. **The race appeared four times.** Thursday, Friday, Saturday and Sunday of the final week
 *      each carried a full 26.2-mile row. `getRaceProximitySession` (`base-generator.ts:90`)
 *      returns `'race'` for `daysUntilRace <= 0` — every day ON OR AFTER the race — and
 *      `generateRaceWeekSessions` pushed `createCompletionRaceDay` on each of them. The week held
 *      SEVEN sessions in a plan built for four running days.
 *
 *   2. **The taper week clumped Mon-Tue-Wed-Thu with Friday and Saturday empty.** The filler loop
 *      walked Monday→Sunday and stopped when the day count ran out, so the budget was spent on the
 *      first four candidate days in calendar order — four consecutive running days, then a
 *      three-day hole, in the week before a marathon.
 *
 * ⚠️ NOT `assign-days.ts`, which is where this was first looked for. A race-proximity week never
 * reaches `assignDaysToSessions` at all: `generateWeekSessions:165` returns
 * `generateRaceWeekSessions`' output directly. That file's dispersed Mon/Wed/Fri ordering is fine
 * and was not touched.
 *
 * Run:
 *   ~/.deno/bin/deno test --allow-read --no-check \
 *     supabase/functions/generate-run-plan/taper-spread-and-single-race.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SustainableGenerator } from './generators/sustainable.ts';

type Sess = { day?: string; name?: string; tags?: string[] };
type Plan = { duration_weeks: number; sessions_by_week: Record<string, Sess[]> };

const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The athlete's actual build: 2026-08-10 is a Monday; 2026-10-22 is the Thursday of week 11. */
const EXPORT = {
  distance: 'marathon', fitness: 'beginner', goal: 'complete',
  duration_weeks: 11, days_per_week: '3-4', user_id: 'test',
  start_date: '2026-08-10', race_date: '2026-10-22', race_name: 'Test Marathon',
  current_weekly_miles: 20, recent_long_run_miles: 6, vdot: 30,
  preferred_days: { long_run: 'Sunday' },
} as const;

const build = (extra: Record<string, unknown> = {}): Plan =>
  (new SustainableGenerator({ ...EXPORT, ...extra } as never) as unknown as { generatePlan(): Plan })
    .generatePlan();

const week = (p: Plan, wk: number) => p.sessions_by_week[String(wk)] ?? [];
const races = (s: Sess[]) => s.filter((x) => (x.tags ?? []).includes('race_day'));
const dayIdx = (d?: string) => ORDER.indexOf(d ?? '');
/** Longest run of back-to-back training days in a week. */
const longestStreak = (s: Sess[]): number => {
  const on = ORDER.map((d) => s.some((x) => x.day === d));
  let best = 0, cur = 0;
  for (const v of on) { cur = v ? cur + 1 : 0; if (cur > best) best = cur; }
  return best;
};

// ── Defect 1 — the race, exactly once, on the actual race day ────────────────────────────────

Deno.test('⛔ ONE race row, not four — a Thursday race does not repeat Fri/Sat/Sun', () => {
  const w11 = week(build(), 11);
  const r = races(w11);
  assertEquals(r.length, 1, `the race is on the calendar ${r.length} times: ${r.map((x) => x.day).join(', ')}`);
  assertEquals(r[0].day, 'Thursday', '2026-10-22 is a Thursday');
});

Deno.test('⛔ NOTHING is scheduled after race day', () => {
  const w11 = week(build(), 11);
  const raceDay = dayIdx(races(w11)[0].day);
  const after = w11.filter((s) => dayIdx(s.day) > raceDay);
  assertEquals(after.length, 0, `${after.length} session(s) sit past the finish line: ${after.map((s) => `${s.day} ${s.name}`).join(' | ')}`);
});

Deno.test('⛔ race week still honours the athlete\'s day count', () => {
  // '3-4' → at most 4 running days. The race itself is exempt (not a day they chose to train).
  const w11 = week(build(), 11);
  const training = w11.filter((s) => !(s.tags ?? []).includes('race_day'));
  assert(training.length <= 4, `${training.length} training sessions in a 3-4 day week`);
});

Deno.test('⛔ the block ENDS on race day — no weeks built after it', () => {
  // Race on the Sunday of week 9 of an 11-week request: weeks 10 and 11 are past the finish line.
  const p = build({ race_date: '2026-10-11' });
  assertEquals(p.duration_weeks, 9, 'duration_weeks must report the weeks actually built');
  assertEquals(races(week(p, 9)).length, 1);
  assertEquals(week(p, 10).length, 0, 'week 10 is after the race and must not exist');
  assertEquals(week(p, 11).length, 0, 'week 11 is after the race and must not exist');
});

// ── Defect 2 — the taper week is spread, not stacked at the front ────────────────────────────

Deno.test('⛔ the taper week does NOT clump Mon-Tue-Wed-Thu with Fri/Sat empty', () => {
  const w10 = week(build(), 10);
  const days = w10.map((s) => s.day);
  assert(
    !(days.includes('Monday') && days.includes('Tuesday') && days.includes('Wednesday') && days.includes('Thursday')),
    `the reported clump is back: ${days.join(', ')}`,
  );
  assert(longestStreak(w10) <= 2, `${longestStreak(w10)} back-to-back running days in a taper week: ${days.join(', ')}`);
});

Deno.test('⛔ the back half of the taper week is not dead space', () => {
  const days = week(build(), 10).map((s) => s.day);
  assert(
    days.some((d) => d === 'Friday' || d === 'Saturday' || d === 'Sunday'),
    `Fri/Sat/Sun all empty — the day budget was spent on the front of the week: ${days.join(', ')}`,
  );
});

Deno.test('the spread still fills exactly the day count, never more', () => {
  const w10 = week(build(), 10);
  assert(w10.length <= 4, `${w10.length} sessions in a 3-4 day week — the spread must not grow the week`);
  assert(w10.length >= 3, `${w10.length} sessions — the spread must not shrink the week either`);
});

// ── Byte-identical guard: the case that already worked must not move ─────────────────────────

Deno.test('a race on the FINAL SUNDAY is unchanged — one row, Sunday, full block length', () => {
  // The Humboldt shape from race-week.test.ts: 9 weeks, race on the Sunday of week 9.
  const p = build({ duration_weeks: 9, race_date: '2026-10-11' });
  assertEquals(p.duration_weeks, 9, 'a race on the last day must not truncate the block');
  const r = races(week(p, 9));
  assertEquals(r.length, 1);
  assertEquals(r[0].day, 'Sunday');
});

Deno.test('a Saturday race lands on Saturday and leaves Sunday empty', () => {
  const p = build({ race_date: '2026-10-24' }); // Saturday of week 11
  const w = week(p, 11);
  const r = races(w);
  assertEquals(r.length, 1);
  assertEquals(r[0].day, 'Saturday');
  assertEquals(w.filter((s) => s.day === 'Sunday').length, 0, 'Sunday is after the race');
});
