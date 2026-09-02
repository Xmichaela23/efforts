/**
 * ⛔⛔ §B5's CHANGE RULE ON THE SPINE — CLOSED PLAN WEEKS ONLY (2026-09-01; item 4 approved by
 * Michael, the closed-week basis ruled by the PM under his move to the plan's week).
 *
 *   deno test --allow-read supabase/functions/_shared/state-trend/week-change.test.ts --no-check
 *
 * *"Change any bucket by less than 10% per week — ideally ≤5%."* Two CLOSED plan weeks are compared
 * and only buckets over `WEEK_CHANGE_FLAG_PCT` are listed. While the current plan week is open the
 * comparison is last week vs the week before (`basis: 'last_week'`); on the week's final day it is
 * this week vs last (`basis: 'this_week'`). ⛔ An open week is never compared to a closed one — a
 * partial week reads −40% on a Wednesday for no reason but the calendar. Pinned here, both
 * directions, with the plan's default Monday start.
 *
 * ⚠️ Deadlift at 300 against a 400 max is 0.75 — inside p084's velocity band, so every set here is
 * a speed rep and the pattern bucket has something to move.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends } from './assemble.ts';

// Plan weeks, Monday start: BEFORE = 08-17…08-23 · LAST = 08-24…08-30 · THIS = 08-31…09-06.
const CLOSED_AS_OF = '2026-09-06';   // Sunday — THIS week's final day → closed
const OPEN_AS_OF = '2026-09-01';     // Tuesday — THIS week open
const IN_THIS = '2026-09-02';
const IN_LAST = '2026-08-27';
const IN_BEFORE = '2026-08-20';

const session = (date: string, sets: number, weight = 300) => ({
  date,
  label: 'ME: Lower',
  exercises: [{
    name: 'Deadlift',
    slot_intent: 'ME',
    sets: Array.from({ length: sets }, () => ({ weight, reps: 5, completed: true })),
  }],
});

const inputs = (asOf: string, loggedSessions: unknown[], extra: Record<string, unknown> = {}) => ({
  asOf,
  exerciseRows: [],
  bikeRows: [], bikeLoad: [], runJoined: [], runEffHistory: [], swimRows: [],
  strengthVolumeRows: [],
  plannedBy: {}, doneBy: {}, cadenceCounts: {},
  posture: null, declaredSessionsPerWeek: 3,
  strengthBaselines: { deadlift: 400 },
  loggedSessions,
  ...extra,
} as any);

const changeOf = (asOf: string, logged: unknown[], extra?: Record<string, unknown>) =>
  (assembleStateTrends(inputs(asOf, logged, extra)) as any).viadaWeek?.weekChange;

Deno.test('⛔ CLOSED WEEK → this week against last; a bucket over the line lists with its percentage (2 → 4 sets = +100)', () => {
  const c = changeOf(CLOSED_AS_OF, [session(IN_LAST, 2), session(IN_THIS, 4)]);
  assert(c != null, 'the field is on the payload');
  assertEquals(c.basis, 'this_week');
  assertEquals(c.from, { since: '2026-08-24', until: '2026-08-30' });
  assertEquals(c.to, { since: '2026-08-31', until: '2026-09-06' });
  assertEquals(c.priorSince, '2026-08-24');
  assertEquals(c.comparable, true);
  assertEquals(c.moved.find((m: any) => m.kind === 'work_sets'), { kind: 'work_sets', key: '', from: 2, to: 4, pctChange: 100 });
  assert(c.moved.some((m: any) => m.kind === 'muscle_sets' && m.from === 2 && m.to === 4 && m.pctChange === 100));
  assertEquals(c.moved.find((m: any) => m.kind === 'pattern_speed' && m.key === 'hip_dominant'),
    { kind: 'pattern_speed', key: 'hip_dominant', from: 10, to: 20, pctChange: 100 });
});

Deno.test('⛔⛔ OPEN WEEK → last week against the week before; THIS week\'s partial numbers play no part', () => {
  const c = changeOf(OPEN_AS_OF, [session(IN_BEFORE, 2), session(IN_LAST, 4), session(OPEN_AS_OF, 1)]);
  assertEquals(c.basis, 'last_week');
  assertEquals(c.from, { since: '2026-08-17', until: '2026-08-23' });
  assertEquals(c.to, { since: '2026-08-24', until: '2026-08-30' });
  assertEquals(c.moved.find((m: any) => m.kind === 'work_sets'), { kind: 'work_sets', key: '', from: 2, to: 4, pctChange: 100 },
    'the one set logged this week is not in the comparison');
});

Deno.test('⛔⛔ THE MID-WEEK PIN — an open week with only last week behind it draws NO line (not comparable, empty)', () => {
  const c = changeOf(OPEN_AS_OF, [session(IN_LAST, 4), session(OPEN_AS_OF, 1)]);
  assertEquals(c.basis, 'last_week');
  assertEquals(c.comparable, false, 'no week before last → nothing to compare; the open week is never used');
  assertEquals(c.moved, []);
});

Deno.test('⛔ NOTHING MOVED → comparable, EMPTY LIST — the card prints nothing', () => {
  const c = changeOf(CLOSED_AS_OF, [session(IN_LAST, 3), session(IN_THIS, 3)]);
  assertEquals(c.comparable, true);
  assertEquals(c.moved, []);
});

Deno.test('⛔ NO PRIOR WORK → NOT COMPARABLE, empty list — a first week has no base', () => {
  const c = changeOf(CLOSED_AS_OF, [session(IN_THIS, 3)]);
  assertEquals(c.comparable, false);
  assertEquals(c.moved, []);
});

Deno.test('⛔ STRICTLY OVER THE LINE — 10 → 11 sets (+10%) is NOT flagged; 10 → 12 (+20%) is', () => {
  const ten = changeOf(CLOSED_AS_OF, [session(IN_LAST, 10), session(IN_THIS, 11)]);
  assertEquals(ten.comparable, true);
  assertEquals(ten.moved.filter((m: any) => m.kind === 'work_sets' || m.kind === 'muscle_sets'), []);
  const twenty = changeOf(CLOSED_AS_OF, [session(IN_LAST, 10), session(IN_THIS, 12)]);
  assertEquals(twenty.moved.find((m: any) => m.kind === 'work_sets')?.pctChange, 20);
});

Deno.test('a bucket dropped to nothing is listed at −100 — a muscle that had work and now has none', () => {
  const c = changeOf(CLOSED_AS_OF, [session(IN_LAST, 3), {
    date: IN_THIS, label: 'Upper',
    exercises: [{ name: 'Bench Press', slot_intent: 'ME', sets: [{ weight: 100, reps: 5, completed: true }] }],
  }]);
  assertEquals(c.comparable, true);
  assert(c.moved.some((m: any) => m.kind === 'muscle_sets' && m.from === 3 && m.to === 0 && m.pctChange === -100));
});

Deno.test('⛔ A TEST DAY IN EITHER WEEK DROPS THE PATTERN BUCKETS, keeps the muscle buckets', () => {
  const lastTest = changeOf(CLOSED_AS_OF, [session(IN_LAST, 2), session(IN_THIS, 4)], { testWeekDates: [IN_LAST] });
  assertEquals(lastTest.moved.filter((m: any) => m.kind.startsWith('pattern_')), []);
  assert(lastTest.moved.some((m: any) => m.kind === 'muscle_sets'));
  const thisTest = changeOf(CLOSED_AS_OF, [session(IN_LAST, 2), session(IN_THIS, 4)], { testWeekDates: [IN_THIS] });
  assertEquals(thisTest.moved.filter((m: any) => m.kind.startsWith('pattern_')), []);
  assert(thisTest.moved.some((m: any) => m.kind === 'work_sets'));
});

Deno.test('⛔ THE CURRENT WEEK\'S NUMBERS ARE UNTOUCHED — earlier weeks add a field, they change no count', () => {
  const alone = (assembleStateTrends(inputs(CLOSED_AS_OF, [session(IN_THIS, 3)])) as any).viadaWeek;
  const withLast = (assembleStateTrends(inputs(CLOSED_AS_OF, [session(IN_LAST, 5), session(IN_THIS, 3)])) as any).viadaWeek;
  for (const k of ['since', 'perMuscle', 'belowFloor', 'perSession', 'perPattern', 'unpriced', 'patternBandApplies', 'offPlan']) {
    assertEquals(JSON.stringify(withLast[k]), JSON.stringify(alone[k]), `${k} must be byte-identical`);
  }
});
