/**
 * REST LENGTHS — fixtured for the first time (2026-08-03).
 *
 *   ~/.deno/bin/deno test src/lib/strength-rest-timer.test.ts --no-check
 *
 * This function lived inside `StrengthLogger.tsx` and therefore had no test at all, which is how a
 * private classifier could disagree with the app's own main-lift set for months without anything
 * failing. Extracting it is half the fix; this file is the other half.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { calculateRestTime, HEAVY_MAIN_REST_SEC, isPlyometricMovement } from './strength-rest-timer.ts';
import { isMain531Lift } from './exercise-role.ts';

Deno.test('⛔ PUSH PRESS AND MILITARY PRESS REST AS MAIN LIFTS', () => {
  // The named bug. The old regex tested /squat|deadlift|bench|overhead|ohp/ — neither of these
  // matches a single one of those words, so two of the app's own main lifts took ACCESSORY rest:
  // 90s on a heavy triple, 60s at 15 reps.
  for (const n of ['Push Press', 'Military Press']) {
    assertEquals(isMain531Lift(n), true, `${n} is in MAIN_531_LIFTS`);
    assertEquals(calculateRestTime(n, 5), 180, `${n} at 5 reps was 90s`);
    assertEquals(calculateRestTime(n, 8), 120, `${n} at 8 reps was 90s`);
  }
});

Deno.test('⛔ A HEAVY MAIN SET RESTS 3:00', () => {
  assertEquals(HEAVY_MAIN_REST_SEC, 180);
  for (const n of ['Bench Press', 'Back Squat', 'Deadlift', 'Overhead Press', 'Front Squat',
                   'Trap Bar Deadlift', 'Close Grip Bench Press', 'Sumo Deadlift', 'ohp']) {
    assertEquals(calculateRestTime(n, 3), 180, `${n} at 3 reps`);
    assertEquals(calculateRestTime(n, 5), 180, `${n} at 5 reps`);
  }
});

Deno.test('only the 3-5 band moved — the 6-8 main band is unchanged at 2:00', () => {
  for (const n of ['Bench Press', 'Back Squat', 'Deadlift']) {
    assertEquals(calculateRestTime(n, 6), 120);
    assertEquals(calculateRestTime(n, 8), 120);
    assertEquals(calculateRestTime(n, 12), 120, 'main lifts outside the bands still take 120');
  }
});

Deno.test('⛔ ACCESSORIES ARE UNTOUCHED', () => {
  // Every accessory band is byte-identical to what shipped. If one of these moves, the change has
  // overreached — the brief was main lifts only.
  for (const n of ['Band Face Pulls', 'Chin Up', 'Goblet Squat', 'Romanian Deadlift',
                   'Bulgarian Split Squat', 'Dumbbell Row', 'Hip Thrust']) {
    assertEquals(calculateRestTime(n, 8), 90, `${n} at 8 reps`);
    assertEquals(calculateRestTime(n, 12), 75, `${n} at 12 reps`);
    assertEquals(calculateRestTime(n, 20), 60, `${n} at 20 reps`);
  }
});

Deno.test('⚠️ THE OTHER DIRECTION — DB / incline / decline bench now rest as assistance', () => {
  // The old `/bench/` test called these main lifts. They are assistance in 5/3/1 and are NOT in
  // MAIN_531_LIFTS, so they now take assistance rest. This is the classifier being right, and it is
  // a VISIBLE change — pinned here so it is a decision on the record rather than a surprise.
  for (const n of ['Dumbbell Bench Press', 'Incline Bench Press', 'Decline Bench Press']) {
    assertEquals(isMain531Lift(n), false, `${n} is not a main lift`);
    assertEquals(calculateRestTime(n, 5), 90, `${n} at 5 reps (was 150)`);
    assertEquals(calculateRestTime(n, 8), 90, `${n} at 8 reps (was 120)`);
  }
});

Deno.test('plyometrics still get full neural recovery, and are checked FIRST', () => {
  // Rule order is load-bearing: "Squat Jump" contains "squat" and "Bench Jump" contains "bench".
  for (const n of ['Box Jump', 'Broad Jump', 'Squat Jump', 'Bench Jump', 'Skater Hop', 'Bounding']) {
    assertEquals(isPlyometricMovement(n), true, `${n} is plyometric`);
    assertEquals(calculateRestTime(n, 5), 150, `${n} must not take the main-lift branch`);
  }
});

Deno.test('no reps logged still defaults to 90', () => {
  assertEquals(calculateRestTime('Bench Press', 0), 90);
  assertEquals(calculateRestTime('Bench Press', undefined), 90);
});

Deno.test('⛔ THE PRIVATE CLASSIFIER IS GONE FROM THE COMPONENT', async () => {
  // The seventh private exercise list. If it comes back, this fails.
  const src = await Deno.readTextFile(new URL('../components/StrengthLogger.tsx', import.meta.url));
  assertEquals(/const isMainCompound\s*=/.test(src), false, 'isMainCompound was re-added');
  assertEquals(/const isPlyometric\s*=\s*\(/.test(src), false, 'isPlyometric was re-added — import it instead');
  assertEquals(/const calculateRestTime\s*=/.test(src), false, 'calculateRestTime was re-inlined');
});
