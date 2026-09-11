// ⛔ THE BAR IN THE VOLUME LEDGER FOLLOWS THE BAR, NOT THE NAME REGEX (2026-09-10).
//
//   ~/.deno/bin/deno test --no-check --sloppy-imports supabase/functions/_shared/workload-bar-lb.test.ts
//
// `barLbForExercise` priced a blank-weight set on a Chest-Supported Row, a Tate Press, a curl or a
// machine with a 45 lb bar, because `equipmentForExercise` defaults to barbell for every name its
// patterns do not know. It now asks `barIsTheLoad`, the seam the logger's plate picker asks.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { barLbForExercise, strengthSetVolume } from './workload.ts';

Deno.test('the rows from the screen: no bar where there was none', () => {
  for (const n of ['Chest Supported Row', 'Tate Press', 'Preacher Curl', 'Spider Curl', 'Drag Curl', 'Dumbbell Curl', 'Hammer Curl',
    'Leg Press', 'Leg Extension', 'Leg Curl', 'Lat Pulldown', 'Cable Row', 'Smith Machine Press', 'Machine Chest Press', 'Pec Deck',
    'Kettlebell Swing', 'Kettlebell Swings', 'Hip Thrust', 'Hip Thrusts', 'Split Squat', 'Skull Crusher', 'Shoulder Press']) {
    assertEquals(barLbForExercise(n), null, `${n} was priced with a bar`);
  }
});

Deno.test('the bar stays where the bar is the load', () => {
  for (const n of ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Barbell Rows', 'Romanian Deadlift',
    'Good Morning', 'Barbell Curl', 'Front Squat', 'Close Grip Bench Press', 'Zercher Squat', 'Barbell Hip Thrust']) {
    assertEquals(barLbForExercise(n), 45, `${n} lost its bar`);
  }
});

Deno.test('a blank-weight set prices the bar only on a bar lift', () => {
  const blank = { weight: 0, reps: 10 };
  const price = (n: string) => strengthSetVolume(blank, { bodyIsLoad: false, barLb: barLbForExercise(n) });
  assertEquals(price('Chest Supported Row'), 0);
  assertEquals(price('Tate Press'), 0);
  assertEquals(price('Preacher Curl'), 0);
  assertEquals(price('Barbell Row'), 450);
  assertEquals(price('Barbell Curl'), 450);
});

Deno.test('a name the catalogue does not know is still no number', () => {
  assertEquals(barLbForExercise('Zercher Carry Thing'), null);
  assertEquals(barLbForExercise(''), null);
});
