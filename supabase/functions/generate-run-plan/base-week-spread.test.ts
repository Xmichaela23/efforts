/**
 * ⛔ BASE WEEKS CLUMPED — Mon-Tue-Wed(-Thu) solid, the back half of the week empty (2026-08-07).
 *
 * `assignDays` walked a FIXED preference list (`Monday, Wednesday, Friday, …`) and took the first
 * free day each time. Dispersed in isolation, blind in practice: the quality session is already on
 * Tuesday (`createOptionalSpeedwork` hardcodes it), so "Monday, then Wednesday" placed two easy runs
 * either side of it — three consecutive running days and a four-day hole. At five running days it
 * became Mon-Tue-Wed-Fri; at six, Mon-to-Fri solid.
 *
 * The fix picks the easy-run DAYS as a set, scored against the week that already exists:
 * fewest back-to-back days, then the most even gaps, then the old preference list for ties.
 *
 * ⚠️ THIS FILE GUARDS SHARED CODE. `assign-days.ts` sits under `base-generator.assignDaysToSessions`,
 * which BOTH live generators inherit — a change here moves every run plan in the app. The matrix
 * below is deliberately wide (both approaches × 4/5/6 running days × pinned/unpinned) because the
 * risk is not "does it disperse", it is "what else did it move".
 *
 * ⚠️ SIX RUNNING DAYS CANNOT DISPERSE, AND THAT IS ARITHMETIC, NOT A BUG. Long run Sunday holds
 * Sunday, the derived rest day holds Saturday, and six sessions into the five days left is
 * Monday-to-Friday however they are chosen. The assertion for that case is that the REST DAY
 * SURVIVED — clumping must never be "fixed" by eating it.
 *
 * Run:
 *   ~/.deno/bin/deno test --allow-read --no-check \
 *     supabase/functions/generate-run-plan/base-week-spread.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Session } from './types.ts';
import { assignDays } from './generators/assign-days.ts';
import { SustainableGenerator } from './generators/sustainable.ts';
import { PerformanceBuildGenerator } from './generators/performance-build.ts';

type Sess = { day?: string; name?: string; tags?: string[] };
type Plan = { duration_weeks: number; sessions_by_week: Record<string, Sess[]> };
const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const s = (name: string, tags: string[]): Session => ({
  day: '', type: 'run', name, description: '', duration: 60, tags,
});
const dayOf = (week: Session[], name: string) => week.find((x) => x.name === name)?.day;

/** Longest run of back-to-back training days. */
/**
 * Longest run of back-to-back training days. ⛔ WRAPS — a training week repeats, so Sat+Sun+Mon is
 * three days back to back however the Monday-first array is indexed. `week-solver.weekShape` made the
 * same correction for the same reason; a non-wrapping count here would score a Saturday long run as
 * spread when it is adjacent to Sunday.
 */
const streak = (days: (string | undefined)[]): number => {
  const on = ORDER.map((d) => days.includes(d));
  const n = on.filter(Boolean).length;
  if (n === 0) return 0;
  let best = 0, cur = 0;
  for (let i = 0; i < 14; i++) { cur = on[i % 7] ? cur + 1 : 0; if (cur > best) best = Math.min(cur, n); }
  return best;
};

const BASE = {
  distance: 'marathon', fitness: 'intermediate', goal: 'complete',
  duration_weeks: 16, user_id: 'test',
  start_date: '2026-08-10', race_date: '2026-11-29', race_name: 'Test',
  current_weekly_miles: 30, recent_long_run_miles: 10, vdot: 40,
  effort_paces: { race: 480, threshold: 450, interval: 410, easy: 570 },
  effort_score: 40,
};

function plan(approach: 'sustainable' | 'performance_build', extra: Record<string, unknown>): Plan {
  const G = approach === 'sustainable' ? SustainableGenerator : PerformanceBuildGenerator;
  return (new G({ ...BASE, ...extra, approach } as never) as unknown as { generatePlan(): Plan })
    .generatePlan();
}
/** Week 5 of a 16-week block: a plain build week, no race proximity, no recovery. */
const baseWeek = (approach: 'sustainable' | 'performance_build', extra: Record<string, unknown>) =>
  plan(approach, extra).sessions_by_week['5'] ?? [];

const APPROACHES = ['sustainable', 'performance_build'] as const;
const PINS: Array<[string, Record<string, unknown> | undefined]> = [
  ['unpinned', undefined],
  ['long run Sunday', { long_run: 'Sunday' }],
  ['long run Saturday', { long_run: 'Saturday' }],
  ['long run Sunday + quality Thursday', { long_run: 'Sunday', quality_run: 'Thursday' }],
];

// ── the bug itself, across the whole matrix ──────────────────────────────────────────────────

for (const approach of APPROACHES) {
  for (const [dpw, label] of [['3-4', '4 days'], ['4-5', '5 days']] as const) {
    for (const [pinLabel, pins] of PINS) {
      Deno.test(`⛔ ${approach} · ${label} · ${pinLabel} — no Mon-to-Thu block`, () => {
        const w = baseWeek(approach, { days_per_week: dpw, ...(pins ? { preferred_days: pins } : {}) });
        const days = w.map((x) => x.day);
        assert(
          !(days.includes('Monday') && days.includes('Tuesday') && days.includes('Wednesday') && days.includes('Thursday')),
          `the reported clump: ${days.join(', ')}`,
        );
        /**
         * ⛔ THE BOUND IS ARITHMETIC, NOT A CONSTANT (corrected 2026-08-08). This asserted a flat
         * `<= 2`, which was right only while every long run was on a Sunday. Once the athlete's pin
         * reached the long run, a **Saturday** pin holds Friday for rest and leaves five sessions to
         * share six days — two free days split a seven-day circle into two blocks, and five sessions
         * across two blocks is a three-day block however they are arranged. The old constant called
         * that a regression when it is the best week that exists.
         *
         * So the test computes the floor — `ceil(occupied / free)` — and asserts the placer HITS it.
         * That is a strictly stronger check than `<= 2`: it binds on every shape, including the ones
         * where 2 was never achievable and the ones where 1 is.
         */
        const occupied = new Set(days).size;
        const free = 7 - occupied;
        const floor = free > 0 ? Math.ceil(occupied / free) : 7;
        assert(
          streak(days) <= floor,
          `${streak(days)} back-to-back running days, best possible is ${floor}: ${days.join(', ')}`,
        );
      });
    }
  }
}

Deno.test('⛔ six running days cannot disperse — but the REST DAY still survives', () => {
  for (const approach of APPROACHES) {
    const w = baseWeek(approach, { days_per_week: '5-6', preferred_days: { long_run: 'Sunday' } });
    const days = w.map((x) => x.day);
    assertEquals(
      days.filter((d) => d === 'Saturday').length, 0,
      `${approach}: Saturday is the day before the long run and must stay clear — got ${days.join(', ')}`,
    );
    assert(w.length <= 6, `${approach}: ${w.length} sessions in a 6-day week`);
  }
});

// ── the pins still lead ──────────────────────────────────────────────────────────────────────

Deno.test('a pinned quality day still takes the hard session, and no easy run squats on it', () => {
  const week = assignDays([
    s('Long Run', ['long_run']),
    s('Intervals', ['intervals']),
    s('Easy 1', ['easy']), s('Easy 2', ['easy']),
  ], { long_run: 'sunday', quality_run: 'wednesday' });
  assertEquals(dayOf(week, 'Intervals'), 'Wednesday');
  assertEquals(week.filter((x) => x.day === 'Wednesday').length, 1);
});

Deno.test('a pinned EASY day is taken before anything is scored against it', () => {
  const week = assignDays([
    s('Long Run', ['long_run']),
    s('Tempo', ['tempo']),
    s('Easy 1', ['easy']), s('Easy 2', ['easy']),
  ], { long_run: 'sunday', easy_run: 'wednesday' });
  assert(
    week.some((x) => x.day === 'Wednesday' && x.tags.includes('easy')),
    `the pinned easy day was scored away: ${week.map((x) => `${x.day}:${x.name}`).join(', ')}`,
  );
});

Deno.test('the day before the long run stays clear — Saturday pin moves it to Friday', () => {
  const week = assignDays([
    s('Long Run', ['long_run']), s('Intervals', ['intervals']),
    s('Easy 1', ['easy']), s('Easy 2', ['easy']), s('Easy 3', ['easy']),
  ], { long_run: 'saturday' });
  assertEquals(dayOf(week, 'Long Run'), 'Saturday');
  assertEquals(week.some((x) => x.day === 'Friday'), false, 'Friday must be the rest day');
});

Deno.test('the athlete\'s training days are still a wall the spread respects', () => {
  const week = assignDays([
    s('Long Run', ['long_run']),
    s('Easy 1', ['easy']), s('Easy 2', ['easy']),
  ], { long_run: 'sunday', training_days: ['monday', 'wednesday', 'sunday'] });
  const easyDays = week.filter((x) => x.tags.includes('easy')).map((x) => x.day).sort();
  assertEquals(easyDays, ['Monday', 'Wednesday'], `the spread walked outside the athlete's days: ${easyDays.join(', ')}`);
});

// ── nothing was lost, and the old default did not move ───────────────────────────────────────

Deno.test('⛔ sessions in === sessions out, on every shape in the matrix', () => {
  for (const approach of APPROACHES) {
    for (const dpw of ['3-4', '4-5', '5-6', '6-7']) {
      for (const [, pins] of PINS) {
        const p = plan(approach, { days_per_week: dpw, ...(pins ? { preferred_days: pins } : {}) });
        for (const [wk, w] of Object.entries(p.sessions_by_week)) {
          const days = w.map((x) => x.day);
          assertEquals(
            new Set(days).size, days.length,
            `${approach}/${dpw} week ${wk}: two sessions share a day — ${days.join(', ')}`,
          );
          assert(days.every((d) => d && ORDER.includes(d)), `${approach}/${dpw} week ${wk}: a session has no day`);
        }
      }
    }
  }
});

Deno.test('⛔ UNPINNED OUTPUT IS STILL THE OLD GRID when the days exactly fit', () => {
  // Long run Sunday; quality Tuesday then Thursday; easy Monday, Wednesday, Friday; Saturday rest.
  // Three easy runs into three free days is forced — the spread must not reshuffle WHICH session
  // lands where, because the volume fill gives the earlier ones the spare mile.
  const week = assignDays([
    s('Long Run', ['long_run']), s('Intervals', ['intervals']), s('Tempo', ['tempo']),
    s('Easy 1', ['easy']), s('Easy 2', ['easy']), s('Easy 3', ['easy']),
  ]);
  assertEquals(dayOf(week, 'Long Run'), 'Sunday');
  assertEquals(dayOf(week, 'Intervals'), 'Tuesday');
  assertEquals(dayOf(week, 'Tempo'), 'Thursday');
  assertEquals(dayOf(week, 'Easy 1'), 'Monday');
  assertEquals(dayOf(week, 'Easy 2'), 'Wednesday');
  assertEquals(dayOf(week, 'Easy 3'), 'Friday');
  assertEquals(week.some((x) => x.day === 'Saturday'), false);
});

Deno.test('⛔ a seven-session week still spends the rest day rather than dropping a run', () => {
  const input = [
    s('Long Run', ['long_run']), s('Intervals', ['intervals']), s('Tempo', ['tempo']),
    s('Easy 1', ['easy']), s('Easy 2', ['easy']), s('Easy 3', ['easy']), s('Easy 4', ['easy']),
  ];
  const week = assignDays(input);
  assertEquals(week.length, input.length);
  assertEquals(new Set(week.map((x) => x.day)).size, 7);
});

// ── and the race-week fix is untouched by any of this ────────────────────────────────────────

Deno.test('⛔ the race-week fix still holds — one race row, nothing after it', () => {
  for (const dpw of ['3-4', '4-5', '5-6']) {
    const p = plan('sustainable', {
      duration_weeks: 11, days_per_week: dpw,
      start_date: '2026-08-10', race_date: '2026-10-22',   // Thursday of week 11
      preferred_days: { long_run: 'Sunday' },
    });
    const w11 = p.sessions_by_week['11'] ?? [];
    const races = w11.filter((x) => (x.tags ?? []).includes('race_day'));
    assertEquals(races.length, 1, `${dpw}: ${races.length} race rows`);
    assertEquals(races[0].day, 'Thursday');
    const after = w11.filter((x) => ORDER.indexOf(x.day ?? '') > ORDER.indexOf('Thursday'));
    assertEquals(after.length, 0, `${dpw}: ${after.length} session(s) after race day`);
  }
});
