// ⛔ A MOVED SESSION STAYS MOVED (2026-09-21, docs/STAGE0-lost-day-2026-09-21.md §4-5). The note, and the three
// places that used to lose the move: the calendar load, the plan rebuild, and the weights update.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { MOVED_FROM_PREFIX, movedOrigin, planDateOf, tagsAfterMove } from './moved-from.ts';
import { buildExistsCounts, plannedKey } from '../get-week/planned-exists-key.ts';
import { preserveAthleteEdits } from '../activate-plan/preserve-athlete-edits.ts';
import { restateEndurance, restateFromTest } from './standing-plan/restate.ts';

const move = (row: { date: string; tags: string[] }, to: string) => ({ ...row, date: to, tags: tagsAfterMove(row, to) });

// ── The note ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test('a first move records the plan day it left; other tags are kept', () => {
  const r = move({ date: '2026-09-22', tags: ['standing_plan'] }, '2026-09-23');
  assertEquals(r.tags, ['standing_plan', `${MOVED_FROM_PREFIX}2026-09-22`]);
  assertEquals(planDateOf(r), '2026-09-22');
});

Deno.test('⛔ MOVED TWICE, IT KEEPS ITS FIRST DAY', () => {
  const once = move({ date: '2026-09-22', tags: ['standing_plan'] }, '2026-09-23');
  const twice = move(once, '2026-09-25');
  assertEquals(twice.date, '2026-09-25');
  assertEquals(movedOrigin(twice), '2026-09-22');
  assertEquals(twice.tags.filter((t) => t.startsWith(MOVED_FROM_PREFIX)).length, 1);
});

Deno.test('⛔ MOVED BACK ONTO ITS FIRST DAY, THE NOTE COMES OFF', () => {
  const once = move({ date: '2026-09-22', tags: ['standing_plan', 'sport:run'] }, '2026-09-24');
  const back = move(once, '2026-09-22');
  assertEquals(back.tags, ['standing_plan', 'sport:run']);
  assertEquals(movedOrigin(back), null);
  assertEquals(planDateOf(back), '2026-09-22');
});

Deno.test('a row never moved reads its own date as its plan day', () => {
  assertEquals(planDateOf({ date: '2026-09-22T00:00:00', tags: ['standing_plan'] }), '2026-09-22');
  assertEquals(movedOrigin({ date: '2026-09-22', tags: null }), null);
});

// ── The calendar load ────────────────────────────────────────────────────────────────────────────────

Deno.test('⛔ CALENDAR: a moved row fills its plan day, so that day is not re-added', () => {
  const rows = [{ training_plan_id: 'p', date: '2026-09-24', type: 'ride', tags: [`${MOVED_FROM_PREFIX}2026-09-22`] }];
  const counts = buildExistsCounts(rows);
  assertEquals(counts.get(plannedKey('p', '2026-09-22', 'ride')), 1);
});

Deno.test('⛔ CALENDAR: a moved row does NOT stand in for its new day\'s own session', () => {
  const rows = [{ training_plan_id: 'p', date: '2026-09-24', type: 'ride', tags: [`${MOVED_FROM_PREFIX}2026-09-22`] }];
  assertEquals(buildExistsCounts(rows).get(plannedKey('p', '2026-09-24', 'ride')), undefined);
});

Deno.test('CALENDAR: a moved and swapped row counts for both sports on its plan day', () => {
  const rows = [{ training_plan_id: 'p', date: '2026-09-24', type: 'ride', tags: ['swapped_from:run', `${MOVED_FROM_PREFIX}2026-09-22`] }];
  const counts = buildExistsCounts(rows);
  assertEquals(counts.get(plannedKey('p', '2026-09-22', 'ride')), 1);
  assertEquals(counts.get(plannedKey('p', '2026-09-22', 'run')), 1);
});

// ── The plan rebuild ─────────────────────────────────────────────────────────────────────────────────

const rebuilt = () => [
  { week_number: 2, day_number: 2, date: '2026-09-22', type: 'ride', day_seq: 0, tags: ['standing_plan'] },
  { week_number: 2, day_number: 3, date: '2026-09-23', type: 'run', day_seq: 0, tags: ['standing_plan'] },
];

Deno.test('⛔ REBUILD: a moved session goes back to the day it was moved to, with its note', () => {
  const prior = [
    { week_number: 2, day_number: 2, date: '2026-09-24', type: 'ride', day_seq: 0, tags: ['standing_plan', `${MOVED_FROM_PREFIX}2026-09-22`], workout_status: 'planned' },
    { week_number: 2, day_number: 3, date: '2026-09-23', type: 'run', day_seq: 0, tags: ['standing_plan'], workout_status: 'planned' },
  ];
  const { rows } = preserveAthleteEdits(rebuilt(), prior);
  assertEquals(rows[0].date, '2026-09-24');
  assertEquals(movedOrigin(rows[0]), '2026-09-22');
  assertEquals(rows[1].date, '2026-09-23');
  assertEquals(movedOrigin(rows[1]), null);
});

Deno.test('REBUILD: a completed moved session is not re-dated', () => {
  const prior = [
    { week_number: 2, day_number: 2, date: '2026-09-24', type: 'ride', day_seq: 0, tags: [`${MOVED_FROM_PREFIX}2026-09-22`], workout_status: 'completed' },
    { week_number: 2, day_number: 3, date: '2026-09-23', type: 'run', day_seq: 0, tags: [], workout_status: 'planned' },
  ];
  const { rows } = preserveAthleteEdits(rebuilt(), prior);
  assertEquals(rows[0].date, '2026-09-22');
  assertEquals(movedOrigin(rows[0]), null);
});

Deno.test('REBUILD: a moved AND swapped session keeps both', () => {
  const prior = [
    { week_number: 2, day_number: 2, date: '2026-09-24', type: 'run', day_seq: 0, name: 'Easy Run',
      tags: ['discipline_swapped', 'swapped_from:ride', `${MOVED_FROM_PREFIX}2026-09-22`], workout_status: 'planned' },
    { week_number: 2, day_number: 3, date: '2026-09-23', type: 'run', day_seq: 0, tags: [], workout_status: 'planned' },
  ];
  const { rows } = preserveAthleteEdits(rebuilt(), prior);
  assertEquals([rows[0].date, rows[0].type, movedOrigin(rows[0])], ['2026-09-24', 'run', '2026-09-22']);
});

// ── The weights update ───────────────────────────────────────────────────────────────────────────────

// Week 3 runs Monday 2026-09-14 … Sunday 2026-09-20; week 4 opens Monday 2026-09-21.
const composed = [
  { week: 3, sessions: [
    { day: 'Tuesday', type: 'strength', name: 'Lower body: Hinge', tags: ['standing_plan'], strength_exercises: [{ name: 'Deadlift', sets: 3, reps: '3', weight: 300, load_prescribed: true }] },
    { day: 'Thursday', type: 'strength', name: 'Upper body: Pull', tags: ['standing_plan'], strength_exercises: [{ name: 'Barbell Row', sets: 3, reps: '8', weight: 150, load_prescribed: true }] },
    { day: 'Sunday', type: 'strength', name: 'Lower body: Push', tags: ['standing_plan'], strength_exercises: [{ name: 'Back Squat', sets: 3, reps: '3', weight: 250, load_prescribed: true }] },
    { day: 'Tuesday', type: 'ride', name: 'Progressive Repeats', description: 'd', duration: 60, steps_preset: ['bike_new'], tags: ['standing_plan'] },
  ] },
  { week: 4, sessions: [
    { day: 'Monday', type: 'strength', name: 'Upper body: Push', tags: ['standing_plan'], strength_exercises: [{ name: 'Bench Press', sets: 3, reps: '3', weight: 180, load_prescribed: true }] },
  ] },
];
const lift = (id: string, week: number, date: string, name: string, weight: number, tags: string[] = []) =>
  ({ id, week_number: week, date, type: 'strength', workout_status: 'planned', tags: ['standing_plan', ...tags],
    strength_exercises: [{ name, sets: 3, reps: '3', weight: weight - 20, load_prescribed: true }] });

Deno.test('⛔ WEIGHTS: a lift moved to another day gets its own session\'s weights, not the new day\'s', () => {
  const planned = [
    lift('hinge', 3, '2026-09-17', 'Deadlift', 300, [`${MOVED_FROM_PREFIX}2026-09-15`]),  // Tue → Thu
    lift('pull', 3, '2026-09-17', 'Barbell Row', 150),
  ];
  const out = restateFromTest({ composed: composed as never, planned: planned as never, afterWeek: 1 });
  const byId = new Map(out.rows.map((r) => [r.id, (r.strength_exercises[0] as Record<string, unknown>)]));
  assertEquals(byId.get('hinge')?.name, 'Deadlift');
  assertEquals(byId.get('hinge')?.weight, 300);
  assertEquals(byId.get('pull')?.weight, 150);
  // Only the two plan days in this fixture: neither Tuesday nor Thursday is reported missing.
  assertEquals(out.unmatched.filter((u) => u.week === 3 && ['Tuesday', 'Thursday'].includes(u.day)), []);
});

Deno.test('⛔ WEIGHTS: a move across a week boundary still gets the right weights', () => {
  // Week 3's Sunday squat moved to Monday of week 4; week 4's own Monday bench stays.
  const planned = [
    lift('squat', 3, '2026-09-21', 'Back Squat', 250, [`${MOVED_FROM_PREFIX}2026-09-20`]),
    lift('bench', 4, '2026-09-21', 'Bench Press', 180),
  ];
  const out = restateFromTest({ composed: composed as never, planned: planned as never, afterWeek: 1 });
  const byId = new Map(out.rows.map((r) => [r.id, (r.strength_exercises[0] as Record<string, unknown>)]));
  assertEquals(byId.get('squat')?.name, 'Back Squat');
  assertEquals(byId.get('squat')?.weight, 250);
  assertEquals(byId.get('bench')?.name, 'Bench Press');
  assertEquals(byId.get('bench')?.weight, 180);
});

Deno.test('⛔ WEIGHTS: the before-today check reads the day the session is on now', () => {
  // Tuesday's lift moved forward to Thursday; today is Wednesday — it is upcoming, so it is rewritten.
  const planned = [lift('hinge', 3, '2026-09-17', 'Deadlift', 300, [`${MOVED_FROM_PREFIX}2026-09-15`])];
  const out = restateFromTest({ composed: composed as never, planned: planned as never, afterWeek: 1, fromDate: '2026-09-16' });
  assertEquals(out.rows.map((r) => r.id), ['hinge']);
});

Deno.test('⛔ RIDES: a moved ride is matched to its own plan day', () => {
  const planned = [{ id: 'ride', week_number: 3, date: '2026-09-18', type: 'ride', name: 'Progressive Repeats', description: 'd',
    duration: 60, steps_preset: ['bike_old'], tags: ['standing_plan', `${MOVED_FROM_PREFIX}2026-09-15`], workout_status: 'planned' }];
  const out = restateEndurance({ composed: composed as never, planned: planned as never, afterWeek: 1 });
  assertEquals(out.rows.map((r) => r.id), ['ride']);
  assertEquals(out.unmatched, []);
});

// ── Lift swaps ───────────────────────────────────────────────────────────────────────────────────────

import { resolveLiftSwap } from './session-swap/lift-swap.ts';

Deno.test('⛔ LIFT SWAP: a moved-then-swapped lift keeps its own swap, and the new day\'s session does not pick it up', () => {
  // Tuesday's lift moved to Thursday; Thursday's own lift has the same movement. The moved one is swapped "just today",
  // which `swap-session` now writes on the plan's day (Tuesday).
  const moved = { date: '2026-09-17', tags: ['standing_plan', `${MOVED_FROM_PREFIX}2026-09-15`] };
  const thursdayOwn = { date: '2026-09-17', tags: ['standing_plan'] };
  const swaps = [{ exercise_name: 'Hip Thrust', substitute_exercise_name: 'Glute Bridge', applies_from: planDateOf(moved),
    applies_until: planDateOf(moved), status: 'active' }];
  assertEquals(resolveLiftSwap('Hip Thrust', swaps, moved), 'Glute Bridge');
  assertEquals(resolveLiftSwap('Hip Thrust', swaps, thursdayOwn), null);
});

Deno.test('⛔ LIFT SWAP: the new day\'s own "just today" swap does not reach the session moved onto that day', () => {
  const moved = { date: '2026-09-17', tags: [`${MOVED_FROM_PREFIX}2026-09-15`] };
  const thursdayOwn = { date: '2026-09-17', tags: [] };
  const swaps = [{ exercise_name: 'Hip Thrust', substitute_exercise_name: 'Glute Bridge', applies_from: '2026-09-17',
    applies_until: '2026-09-17', status: 'active' }];
  assertEquals(resolveLiftSwap('Hip Thrust', swaps, thursdayOwn), 'Glute Bridge');
  assertEquals(resolveLiftSwap('Hip Thrust', swaps, moved), null);
});

Deno.test('LIFT SWAP: a "rest of plan" swap still reaches a session moved later in the block', () => {
  const moved = { date: '2026-09-24', tags: [`${MOVED_FROM_PREFIX}2026-09-22`] };
  const swaps = [{ exercise_name: 'Back Squat', substitute_exercise_name: 'Front Squat', applies_from: '2026-09-15', status: 'active' }];
  assertEquals(resolveLiftSwap('Back Squat', swaps, moved), 'Front Squat');
});
