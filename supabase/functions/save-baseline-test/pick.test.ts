/**
 * Which logged set becomes the saved max (2026-09-10, audit H-S08).
 *
 * Run: ~/.deno/bin/deno test --no-check supabase/functions/save-baseline-test/pick.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pickTestLifts } from './pick.ts';

const retest = { name: 'Test: Lower', tags: ['1rm_test'] };
const namedLower = { name: 'Baseline Test: Lower', tags: [] };
const w = (weight: number, reps: number, extra: Record<string, unknown> = {}) =>
  ({ weight, reps, completed: true, setType: 'working', ...extra });

Deno.test('retest: the heaviest completed working set is the test, not the last one ticked', () => {
  const picked = pickTestLifts([{ name: 'Back Squat', sets: [w(95, 8), w(115, 5), w(105, 6)] }], retest);
  assertEquals(picked, [{ baselineKey: 'squat', weight: 115, reps: 5, exercise: 'Back Squat' }]);
});

Deno.test('a row with a scored set: only the scored set counts, even with a heavier set after it', () => {
  const picked = pickTestLifts([{ name: 'Deadlift', sets: [w(135, 5), w(185, 4, { amrap: true }), w(195, 2)] }], retest);
  assertEquals(picked[0], { baselineKey: 'deadlift', weight: 185, reps: 4, exercise: 'Deadlift' });
});

Deno.test('warm-ups, unticked sets and part reps never count', () => {
  const picked = pickTestLifts([{ name: 'Bench Press', sets: [
    { weight: 200, reps: 3, completed: true, setType: 'warmup' },
    { weight: 190, reps: 3, completed: false, setType: 'working' },
    w(180, 2.5),
    w(150, 5),
  ] }], retest);
  assertEquals(picked[0], { baselineKey: 'bench', weight: 150, reps: 5, exercise: 'Bench Press' });
});

Deno.test('equal weight on a retest: the later set wins', () => {
  const picked = pickTestLifts([{ name: 'Overhead Press', sets: [w(95, 5), w(95, 6)] }], retest);
  assertEquals(picked[0], { baselineKey: 'overheadPress1RM', weight: 95, reps: 6, exercise: 'Overhead Press' });
});

Deno.test('named baseline session: an unscored set needs a confirmed RIR of 2-3', () => {
  const picked = pickTestLifts([{ name: 'Back Squat', sets: [
    w(155, 5, { rir: 1 }),
    w(150, 5, { rir: 2, rir_autofilled: true }),
    w(145, 5, { rir: 3 }),
    w(140, 5, { rir: 2 }),
  ] }], namedLower);
  assertEquals(picked[0], { baselineKey: 'squat', weight: 145, reps: 5, exercise: 'Back Squat' });
});

Deno.test('pull-ups: the rep-max count is the result, 0 counts, "Pull-ups" maps, a banded count never does', () => {
  assertEquals(pickTestLifts([{ name: 'Pull-ups', sets: [w(0, 0, { repMaxTest: true })] }], retest),
    [{ baselineKey: 'pullupMaxReps', weight: 0, reps: 0, exercise: 'Pull-ups' }]);
  assertEquals(pickTestLifts([{ name: 'Pull-ups', sets: [w(0, 9, { repMaxTest: true, resistance_level: 20 })] }], retest), []);
});

Deno.test('two exercises on one saved max compete by the same rule', () => {
  const picked = pickTestLifts([
    { name: 'Back Squat', sets: [w(185, 3)] },
    { name: 'Front Squat', sets: [w(155, 3)] },
  ], retest);
  assertEquals(picked, [{ baselineKey: 'squat', weight: 185, reps: 3, exercise: 'Back Squat' }]);
});

Deno.test('lifts with no saved max are ignored', () => {
  assertEquals(pickTestLifts([{ name: 'Calf Raise', sets: [w(90, 12)] }], retest), []);
});
