// Q-212 — the COLLISION axis. Pins that push/pull collapse, that knee/hip do NOT, and that the two
// real collisions in Michael's own block are detected by pattern rather than by name.
// Run: ~/.deno/bin/deno test --no-check src/lib/exercise-config.movement-family.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { getMovementFamily, movementFamilyOfPattern, sharesMovementFamily, getMovementGroup } from './exercise-config.ts';

Deno.test('the two pushes answer as ONE family — the Overhead-Press-and-Dips case', () => {
  assertEquals(movementFamilyOfPattern('horizontal_push'), 'push');
  assertEquals(movementFamilyOfPattern('vertical_push'), 'push');
  // ⛔ The case that raised Q-212: Dips are a HORIZONTAL push, the day's main lift is a VERTICAL
  // push. Exact-pattern comparison would call that clean; it is four pushing exposures.
  assertEquals(sharesMovementFamily('Overhead Press', 'Dips'), true);
  assertEquals(sharesMovementFamily('Bench Press', 'Dips'), true);
});

Deno.test('the two pulls answer as ONE family', () => {
  assertEquals(movementFamilyOfPattern('horizontal_pull'), 'pull');
  assertEquals(movementFamilyOfPattern('vertical_pull'), 'pull');
  assertEquals(sharesMovementFamily('Barbell Row', 'Pull Up'), true);
});

Deno.test('⛔ KNEE AND HIP MUST NOT COLLAPSE — they are the complement pair the rule pairs on purpose', () => {
  assertEquals(movementFamilyOfPattern('knee_dominant'), 'knee');
  assertEquals(movementFamilyOfPattern('hip_dominant'), 'hip');
  // Folding these into one `legs` family would forbid exactly the pairing that is WANTED:
  // hip-dominant work on a knee-dominant day, and the reverse.
  assertEquals(sharesMovementFamily('Back Squat', 'Single Leg Hip Thrust'), false);
  assertEquals(sharesMovementFamily('Deadlift', 'Bulgarian Split Squat'), false);
});

Deno.test('⛔ THE TWO LIVE COLLISIONS IN THE BLOCK THAT RAISED THIS', () => {
  // Friday: Deadlift (hip_dominant) with Single Leg Hip Thrust (hip_dominant) in the slot.
  assertEquals(sharesMovementFamily('Deadlift', 'Single Leg Hip Thrust'), true);
  // Latent on the athlete's pick — Back Squat with Bulgarian Split Squat, both knee_dominant.
  assertEquals(sharesMovementFamily('Back Squat', 'Bulgarian Split Squat'), true);
});

Deno.test('this axis is NOT MovementGroup — the pair that proves they are orthogonal', () => {
  // MovementGroup calls both `upper`, which is right for placement and blind for collision.
  assertEquals(getMovementGroup('Bench Press'), 'upper');
  assertEquals(getMovementGroup('Pull Up'), 'upper');
  assertEquals(sharesMovementFamily('Bench Press', 'Pull Up'), false);
});

Deno.test('an absent pattern is not evidence of a clash (§0h)', () => {
  assertEquals(getMovementFamily('Nonexistent Widget Press'), null);
  assertEquals(sharesMovementFamily('Nonexistent Widget Press', 'Bench Press'), false);
  assertEquals(sharesMovementFamily('Nonexistent Widget Press', 'Another Nonexistent Thing'), false);
});
