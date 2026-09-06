import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { restateEndurance } from './restate.ts';

const OLD = ['warmup_run_easy_10min', 'round_2x_45s125-53s115-r90svt1_R120s', 'cooldown_run_easy_8min'];
const NEW = ['warmup_run_easy_10min', 'round_2x_45s125-45s115-30s100-r90svt1_R120s', 'cooldown_run_easy_8min'];

const COMPOSED = [{
  week: 2,
  sessions: [
    { day: 'Monday', type: 'run', name: 'Hard Run', description: 'the page', duration: 45, steps_preset: NEW, tags: ['standing_plan', 'family:run_mlss'] },
    { day: 'Tuesday', type: 'strength', name: 'Lower', tags: ['standing_plan'], strength_exercises: [] },
    { day: 'Saturday', type: 'run', name: 'Long Run', description: 'long', duration: 79, steps_preset: ['run_easy_79min'], tags: ['standing_plan'] },
  ],
}];

const PLANNED = [
  { id: 'mon', week_number: 2, date: '2026-09-07', type: 'run', name: 'Hard Run', description: 'old', duration: 42, steps_preset: OLD, tags: ['standing_plan'], workout_status: 'planned' },
  { id: 'test', week_number: 2, date: '2026-09-07', type: 'run', name: 'Run test', duration: 40, steps_preset: ['run_test'], tags: ['assessment', 'run_test'], workout_status: 'planned' },
  { id: 'sat', week_number: 2, date: '2026-09-12', type: 'run', name: 'Long Run', description: 'long', duration: 79, steps_preset: ['run_easy_79min'], tags: ['standing_plan'], workout_status: 'planned' },
];

Deno.test('⛔ THE RUN TAKES THE COMPOSER\'S SHAPE, a scheduled test on the same day is never touched, an unchanged row is not rewritten', () => {
  const out = restateEndurance({ composed: COMPOSED as never, planned: PLANNED as never, afterWeek: 1 });
  assertEquals(out.rows.map((r) => r.id), ['mon']);
  assertEquals(out.rows[0].steps_preset, NEW);
  assertEquals(out.rows[0].duration, 45);
  assertEquals(out.changes, [{ week: 2, day: 'Monday', type: 'run', name: 'Hard Run', from_minutes: 42, to_minutes: 45, shape_moved: true }]);
  assertEquals(out.unmatched, []);
});

Deno.test('⛔ A DONE SESSION KEEPS THE PRESCRIPTION IT WAS JUDGED AGAINST', () => {
  const done = PLANNED.map((r) => (r.id === 'mon' ? { ...r, completed_workout_id: 'w1' } : r));
  const out = restateEndurance({ composed: COMPOSED as never, planned: done as never, afterWeek: 1 });
  assertEquals(out.rows, []);
});

Deno.test('⛔ WEEKS BEFORE THE CUT ARE LEFT ALONE', () => {
  const out = restateEndurance({ composed: COMPOSED as never, planned: PLANNED as never, afterWeek: 3 });
  assertEquals(out.rows, []);
});
