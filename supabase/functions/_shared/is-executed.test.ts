/**
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/_shared/is-executed.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isExecutedWorkout } from './is-executed.ts';

Deno.test('a completed row with any receipt is executed', () => {
  assertEquals(isExecutedWorkout({ workout_status: 'completed', computed: { overall: { distance_m: 5000 } } }), true);
  assertEquals(isExecutedWorkout({ workout_status: 'completed', computed: JSON.stringify({ intervals: [{}] }) }), true);
  assertEquals(isExecutedWorkout({ workout_status: 'completed', completedmanually: true }), true);
  assertEquals(isExecutedWorkout({ workout_status: 'completed', moving_time: 45 }), true);
  assertEquals(isExecutedWorkout({ workout_status: 'completed', workout_analysis: { x: 1 } }), true);
  assertEquals(isExecutedWorkout({ workout_status: 'completed', strength_exercises: [{ name: 'Squat', sets: [{ reps: 5 }] }] }), true);
  assertEquals(isExecutedWorkout({ workout_status: 'completed', mobility_exercises: JSON.stringify([{ name: 'Plank', sets: [{ duration_seconds: 30 }] }]) }), true);
});

Deno.test('a prescription is not a receipt', () => {
  assertEquals(isExecutedWorkout({ workout_status: 'completed', strength_exercises: [{ name: 'Squat', sets: [{ reps: 0, weight: 0 }] }] }), false);
  assertEquals(isExecutedWorkout({ workout_status: 'completed' }), false);
});

Deno.test('a row not marked completed is never executed', () => {
  assertEquals(isExecutedWorkout({ workout_status: 'planned', moving_time: 45 }), false);
  assertEquals(isExecutedWorkout(null), false);
});
