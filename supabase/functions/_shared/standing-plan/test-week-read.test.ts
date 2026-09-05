/**
 * ⛔ THE TEST SET IS THE HEAVIEST COMPLETED SET, FLAG OR NO FLAG (Michael, 2026-09-04).
 *
 * The regression: his Sep 1 "Test: Lower" logged the deadlift top set with `amrap: true` and the
 * squat top set (105 x 6, completed) without it. The reader took the flag as the only signal, priced
 * the deadlift and dropped the squat, and every squat for the rest of the block read "By feel".
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { readTestWeek, TESTED_LIFT_NAME, WORKING_MAX_FRACTION } from './working-number.ts';

const week1 = (exercises: unknown[]) => [{ week_number: 1, strength_exercises: exercises }];

Deno.test('a top set without the amrap flag is still the test set — the heaviest completed set prices the lift', () => {
  const r = readTestWeek(week1([
    { name: 'Back Squat', sets: [
      { weight: 45, reps: 6, completed: true }, { weight: 55, reps: 5, completed: true },
      { weight: 80, reps: 9, completed: true }, { weight: 105, reps: 6, completed: true },
    ] },
    { name: 'Deadlift', sets: [
      { weight: 45, reps: 5, completed: true }, { weight: 145, reps: 9, completed: true },
      { weight: 170, reps: 3, completed: true, amrap: true },
    ] },
  ]), { squat: 'Back Squat', deadlift: 'Deadlift', bench: 'Bench Press', overheadPress: 'Overhead Press' });
  assertEquals(r.working.squat?.measured, { weight: 105, reps: 6 });
  assertEquals(r.working.deadlift?.measured, { weight: 170, reps: 3 });
  assert(r.working.squat!.workingNumber > 0);
  assertEquals(Math.round(r.working.squat!.workingNumber), Math.round(r.working.squat!.predicted1RM * WORKING_MAX_FRACTION));
  assert(!r.missing.some((m) => m.lift === 'squat'), 'the squat must not be reported missing');
});

Deno.test('an uncompleted heavier set does not outrank a completed lighter one', () => {
  const r = readTestWeek(week1([
    { name: 'Bench Press', sets: [
      { weight: 130, reps: 7, completed: true }, { weight: 150, reps: 1, completed: false },
    ] },
  ]), { bench: 'Bench Press' });
  assertEquals(r.working.bench?.measured, { weight: 130, reps: 7 });
});

Deno.test('no test_lift_names on the block → the reader falls back to the default names', () => {
  const r = readTestWeek(week1([
    { name: 'Back Squat', sets: [{ weight: 105, reps: 6, completed: true }] },
    { name: 'Overhead Press', sets: [{ weight: 85, reps: 8, completed: true, amrap: true }] },
  ]), {});
  assertEquals(TESTED_LIFT_NAME.squat, 'Back Squat');
  assertEquals(r.working.squat?.measured, { weight: 105, reps: 6 });
  assertEquals(r.working.overheadPress?.measured, { weight: 85, reps: 8 });
  assert(r.missing.some((m) => m.lift === 'bench' && /no completed test set/.test(m.reason)));
});

Deno.test('a row that is not provably week one is not the test', () => {
  const r = readTestWeek([{ week_number: 2, strength_exercises: [{ name: 'Back Squat', sets: [{ weight: 200, reps: 1, completed: true }] }] }], {});
  assert(!r.working.squat);
});
