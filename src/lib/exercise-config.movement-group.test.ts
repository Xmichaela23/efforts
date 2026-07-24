// D-315: movement-group classification — the signal that CONTAINS an added lift to matching-focus days
// (a hip-dominant add lands where lower work already is, never an upper-only day) and derives a
// session's own focus from the lifts it holds. If this drifts, adds land on the wrong days.
// Run: deno test src/lib/exercise-config.movement-group.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { getMovementGroup, movementGroupOfPattern } from './exercise-config.ts';

Deno.test('lower-body lifts classify LOWER (knee/hip-dominant + calf)', () => {
  for (const n of ['Hip Thrust', 'Back Squat', 'Barbell Back Squat', 'Romanian Deadlift', 'Conventional Deadlift', 'Leg Press', 'Front Squat']) {
    assertEquals(getMovementGroup(n), 'lower', `${n} should be lower`);
  }
});

Deno.test('upper-body lifts classify UPPER (horizontal/vertical push+pull)', () => {
  for (const n of ['Bench Press', 'Barbell Row', 'Overhead Press', 'Pull-up', 'Incline Bench Press']) {
    assertEquals(getMovementGroup(n), 'upper', `${n} should be upper`);
  }
});

Deno.test('the Michael add case: Hip Thrust is LOWER — lands on leg days, not upper', () => {
  assertEquals(getMovementGroup('Hip Thrust'), 'lower');
  assertEquals(getMovementGroup('Bench Press'), 'upper'); // ...and never a leg-day match for an upper add
});

Deno.test('pattern → group mapping is exhaustive over the known patterns', () => {
  assertEquals(movementGroupOfPattern('knee_dominant'), 'lower');
  assertEquals(movementGroupOfPattern('hip_dominant'), 'lower');
  assertEquals(movementGroupOfPattern('calf'), 'lower');
  assertEquals(movementGroupOfPattern('horizontal_push'), 'upper');
  assertEquals(movementGroupOfPattern('vertical_pull'), 'upper');
  assertEquals(movementGroupOfPattern('core'), 'core');
  assertEquals(movementGroupOfPattern('plyometric'), null); // not a strength-slot group
  assertEquals(movementGroupOfPattern(null), null);
});

Deno.test('an unknown exercise classifies null (no guess → an add with no group fits any strength day)', () => {
  assertEquals(getMovementGroup('Some Movement We Invented'), null);
});
