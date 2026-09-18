// ⛔ THE REBUILD REWRITES EVERY SESSION NOT DONE, FROM TODAY ON (2026-09-18) — the rest of the live week included;
// a session dated before today stays exactly as it is, done or not, and is still counted as matched.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { restateEndurance, restateFromTest } from './restate.ts';

const OLD = ['warmup_run_easy_10min', 'run_easy_20min'];
const NEW = ['warmup_run_easy_10min', 'run_easy_25min'];
// Week 3 runs Monday 2026-09-14 … Sunday 2026-09-20; "today" is Wednesday 2026-09-16.
const TODAY = '2026-09-16';

const composed = [{
  week: 3,
  sessions: [
    { day: 'Monday', type: 'run', name: 'Easy Run', description: 'd', duration: 35, steps_preset: NEW, tags: ['standing_plan'] },
    { day: 'Wednesday', type: 'run', name: 'Easy Run', description: 'd', duration: 35, steps_preset: NEW, tags: ['standing_plan'] },
    { day: 'Friday', type: 'run', name: 'Easy Run', description: 'd', duration: 35, steps_preset: NEW, tags: ['standing_plan'] },
    { day: 'Tuesday', type: 'strength', name: 'ME: Lower', tags: ['standing_plan'], strength_exercises: [{ name: 'Back Squat', sets: 3, reps: '3', weight: 200, load_prescribed: true }] },
    { day: 'Thursday', type: 'strength', name: 'DE: Upper', tags: ['standing_plan'], strength_exercises: [{ name: 'Bench Press', sets: 4, reps: '3', weight: 120, load_prescribed: true }] },
  ],
}];
const run = (id: string, date: string, extra: Record<string, unknown> = {}) =>
  ({ id, week_number: 3, date, type: 'run', name: 'Easy Run', description: 'd', duration: 30, steps_preset: OLD, tags: ['standing_plan'], workout_status: 'planned', ...extra });
const planned = [
  run('mon', '2026-09-14'),                                   // before today, not done
  run('wed', '2026-09-16'),                                   // today
  run('fri', '2026-09-18'),                                   // later this week
  { id: 'tue', week_number: 3, date: '2026-09-15', type: 'strength', workout_status: 'planned', strength_exercises: [{ name: 'Back Squat', sets: 3, reps: '3', weight: 190, load_prescribed: true }] },
  { id: 'thu', week_number: 3, date: '2026-09-17', type: 'strength', workout_status: 'planned', strength_exercises: [{ name: 'Bench Press', sets: 4, reps: '3', weight: 115, load_prescribed: true }] },
];

Deno.test('⛔ RUNS: today and later this week take the new shape; the day before today does not and is not reported missing', () => {
  const out = restateEndurance({ composed: composed as never, planned: planned as never, afterWeek: 1, fromDate: TODAY });
  assertEquals(out.rows.map((r) => r.id).sort(), ['fri', 'wed']);
  assertEquals(out.unmatched, []);
});

Deno.test('⛔ LIFTS: the session later this week takes the new weight; the one before today keeps its own', () => {
  const out = restateFromTest({ composed: composed as never, planned: planned as never, afterWeek: 1, fromDate: TODAY });
  assertEquals(out.rows.map((r) => r.id), ['thu']);
  assertEquals((out.rows[0].strength_exercises[0] as Record<string, unknown>).weight, 120);
  assertEquals(out.unmatched, []);
});

Deno.test('⚠️ NO fromDate = the old behaviour: every session not done moves, whatever its date', () => {
  const runs = restateEndurance({ composed: composed as never, planned: planned as never, afterWeek: 1 });
  assertEquals(runs.rows.map((r) => r.id).sort(), ['fri', 'mon', 'wed']);
  const lifts = restateFromTest({ composed: composed as never, planned: planned as never, afterWeek: 1 });
  assertEquals(lifts.rows.map((r) => r.id).sort(), ['thu', 'tue']);
});

Deno.test('⛔ A DONE SESSION TODAY IS STILL NEVER TOUCHED', () => {
  const done = planned.map((r) => (r.id === 'wed' ? { ...r, completed_workout_id: 'w1' } : r));
  const out = restateEndurance({ composed: composed as never, planned: done as never, afterWeek: 1, fromDate: TODAY });
  assertEquals(out.rows.map((r) => r.id), ['fri']);
});

Deno.test('⛔ A LIFTING DAY TAKES THE COMPOSER\'S WORDS; a test row the athlete scheduled keeps its own', () => {
  const composedW = [{ week: 3, sessions: [
    { day: 'Friday', type: 'strength', name: 'Lower body: Push', description: 'new words', tags: ['standing_plan'], strength_exercises: [{ name: 'Back Squat', sets: 3, reps: '3', weight: 200, load_prescribed: true }] },
  ] }];
  const lift = { id: 'fri', week_number: 3, date: '2026-09-18', type: 'strength', name: 'Lower body: Push', description: 'old words', workout_status: 'planned', tags: ['standing_plan'], strength_exercises: [{ name: 'Back Squat', sets: 3, reps: '3', weight: 200, load_prescribed: true }] };
  const out = restateFromTest({ composed: composedW as never, planned: [lift] as never, afterWeek: 1, fromDate: TODAY });
  assertEquals(out.rows.map((r) => [r.id, r.description, r.name]), [['fri', 'new words', undefined]]);
  const retest = { ...lift, id: 'rt', name: 'Retest: Lower', description: 'Work up in three steps.', tags: ['standing_plan', '1rm_test', 'retest'] };
  assertEquals(restateFromTest({ composed: composedW as never, planned: [retest] as never, afterWeek: 1, fromDate: TODAY }).rows, []);
});
