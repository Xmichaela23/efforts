/**
 * ⛔⛔ THE LIFTING CARD READS THE PLAN'S WEEK, NOT A ROLLING SEVEN DAYS (2026-09-01, approved by
 * Michael — "is this a rolling week?").
 *
 *   deno test --allow-read supabase/functions/_shared/state-trend/plan-week-window.test.ts --no-check
 *
 * The window is cut on `weekStartOf` + the plan's start-day — the SAME boundary the planned-vs-actual
 * bar uses — so the two blocks describe one week. These pin the boundary in both directions, that it
 * follows the plan's start-day rather than assuming Monday, that the test-week intersection is
 * unchanged, and that the change line never speaks about an open week.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assembleStateTrends } from './assemble.ts';

const AS_OF = '2026-09-01'; // a Tuesday

const session = (date: string, name = 'Deadlift') => ({
  date,
  label: 'ME: Lower',
  exercises: [{ name, slot_intent: 'ME', sets: [{ weight: 300, reps: 5, completed: true }] }],
});

const inputs = (loggedSessions: unknown[], extra: Record<string, unknown> = {}) => ({
  asOf: AS_OF,
  exerciseRows: [],
  bikeRows: [], bikeLoad: [], runJoined: [], runEffHistory: [], swimRows: [],
  strengthVolumeRows: [],
  plannedBy: {}, doneBy: {}, cadenceCounts: {},
  posture: null, declaredSessionsPerWeek: 3,
  strengthBaselines: { deadlift: 400 },
  loggedSessions,
  ...extra,
} as any);

const cardOf = (logged: unknown[], extra?: Record<string, unknown>) => (assembleStateTrends(inputs(logged, extra)) as any).viadaWeek;

Deno.test('⛔ MONDAY-START PLAN: the week\'s first day is IN, the day before is OUT', () => {
  // Sun 08-30 is the last day of LAST week; Mon 08-31 opens THIS week.
  const vw = cardOf([session('2026-08-30'), session('2026-08-31')]);
  assert(vw != null);
  assertEquals(vw.since, '2026-08-31');
  assertEquals(vw.perSession.length, 1, 'only Monday\'s session is this week');
});

Deno.test('⛔ THE START-DAY IS THE PLAN\'S, NOT ASSUMED — a Sunday-start plan opens the week on 08-30', () => {
  const vw = cardOf([session('2026-08-29'), session('2026-08-30'), session('2026-08-31')], { weekStartDow: 'sun' });
  assert(vw != null);
  assertEquals(vw.since, '2026-08-30');
  assertEquals(vw.perSession.length, 2, 'Sunday and Monday are in; Saturday is out');
});

Deno.test('⚠️ THE ROLLING WINDOW IS GONE — a session six days ago that falls in last plan week is not "this week"', () => {
  // Rolling as-of-minus-six would have included Wed 08-26. The plan's week does not.
  const vw = cardOf([session('2026-08-26'), session('2026-09-01')]);
  assertEquals(vw.since, '2026-08-31');
  assertEquals(vw.perSession.length, 1);
});

Deno.test('⚠️ NOTHING LIFTED YET THIS PLAN WEEK → no card (the existing null rule, now per plan week)', () => {
  const vw = cardOf([session('2026-08-27')]);
  assertEquals(vw, null);
});

Deno.test('⛔ THE TEST-WEEK INTERSECTION IS UNCHANGED — asked of the window the card describes', () => {
  assertEquals(cardOf([session('2026-08-31')], { testWeekDates: ['2026-08-31'] }).patternBandApplies, false);
  assertEquals(cardOf([session('2026-08-31')], { testWeekDates: ['2026-08-30'] }).patternBandApplies, true,
    'a test day in LAST plan week does not suppress THIS week\'s band');
});

Deno.test('⛔⛔ AN OPEN WEEK IS NEVER THE SUBJECT OF THE CHANGE LINE; the final day is', () => {
  const open = cardOf([session('2026-08-20'), session('2026-08-27'), session('2026-09-01')]);
  assertEquals(open.weekChange.basis, 'last_week');
  assertEquals(open.weekChange.to, { since: '2026-08-24', until: '2026-08-30' });
  const closed = (assembleStateTrends(inputs([session('2026-08-27'), session('2026-09-04')], { asOf: '2026-09-06' })) as any).viadaWeek;
  assertEquals(closed.weekChange.basis, 'this_week');
  assertEquals(closed.weekChange.to, { since: '2026-08-31', until: '2026-09-06' });
});
