// Q-212 — the COLLISION axis. Pins that push/pull collapse, that knee/hip do NOT, and that the two
// real collisions in Michael's own block are detected by pattern rather than by name.
// Run: ~/.deno/bin/deno test --no-check src/lib/exercise-config.movement-family.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/assert_equals.ts';
import { getExerciseConfig, getMovementFamily, movementFamilyOfPattern, sharesMovementFamily, getMovementGroup } from './exercise-config.ts';

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
  // ⚠️ THE JUNK NAME CHANGED ON 2026-08-03 AND THE REASON MATTERS. It used to be "Nonexistent Widget
  // Press", which stopped being a junk name the moment `press` became a config key — the fuzzy
  // fallback matches on substrings, so anything ending in "Press" now resolves. The rule under test
  // is unchanged ("a name the table has never heard of yields no family"); only the example had to
  // stop containing a real lift word. See the case below, which pins the new behaviour explicitly
  // rather than letting this rename hide it.
  assertEquals(getMovementFamily('Nonexistent Widget Contraption'), null);
  assertEquals(sharesMovementFamily('Nonexistent Widget Contraption', 'Bench Press'), false);
  assertEquals(sharesMovementFamily('Nonexistent Widget Contraption', 'Another Nonexistent Thing'), false);
});

Deno.test('⚠️ THE COST OF THE BARE `press` KEY, RECORDED RATHER THAN HIDDEN (2026-08-03)', () => {
  // ⛔ ADDING A SHORT KEY WIDENS THE FUZZY NET. `press` was added because without it, the previous program's own
  // name for the overhead press resolved to `leg press` at 1.5x SQUAT — a badly wrong prescription
  // on a main lift. The price is that an UNKNOWN "...Press" movement now resolves to `press`
  // (vertical push, overhead x 1.0) instead of to null, wherever no longer key matches.
  //
  // ⚠️ THIS IS A TRADE, NOT A FIX, AND IT IS MICHAEL'S CALL WHETHER IT IS THE RIGHT ONE. Recorded
  // here so the next session sees the behaviour instead of rediscovering it. Longer keys still win:
  // `bench press`, `leg press` and `overhead press` are all unaffected.
  assertEquals(getMovementFamily('Nonexistent Widget Press'), 'push');
  assertEquals(getMovementFamily('Bench Press'), 'push');
  assertEquals(getMovementFamily('Leg Press'), 'knee');
});

// ── Q-212 step 3: the balance pool ────────────────────────────────────────────
// Before these entries the push slot on a press day had NOTHING to substitute to — every option
// on that menu was itself pushing. These pin that the pool resolves and that it actually answers
// the query, which is the only reason it exists.

Deno.test('the balance pool resolves — including the hyphenated spellings (Q-210)', () => {
  for (const n of [
    'Face Pull', 'Face Pulls',
    'Band Pull Apart', 'Band Pull Aparts', 'Band Pull-Aparts',
    'Rear Delt Fly', 'Rear Delt Flyes',
    'Chest Supported Row', 'Chest-Supported Row',
  ]) {
    assertEquals(getMovementFamily(n), 'pull', `"${n}" should resolve to the pull family`);
  }
});

Deno.test('⛔ THE QUERY IS ANSWERABLE ON A PRESS DAY — the point of the pool', () => {
  // Both presses, against every pool option: none of them collides.
  for (const main of ['Bench Press', 'Overhead Press']) {
    for (const opt of ['Face Pull', 'Band Pull Apart', 'Rear Delt Fly', 'Chest Supported Row']) {
      assertEquals(sharesMovementFamily(main, opt), false, `${main} + ${opt} should NOT collide`);
    }
    // And the control: the pick that raised Q-212 still collides, or the rule proves nothing.
    assertEquals(sharesMovementFamily(main, 'Dips'), true, `${main} + Dips SHOULD collide`);
  }
});

Deno.test('the pool spans a load range rather than one movement three ways', () => {
  // Michael: "Face Pull variants aren't it — Chest Supported Row would be the one that adds range."
  // The light work prescribes no load; the row carries a real reference so a swap into it can be
  // priced (D-322). If this flips to ratio 0, the pool has collapsed back to three of the same.
  for (const light of ['Face Pull', 'Band Pull Apart', 'Rear Delt Fly']) {
    assertEquals(getExerciseConfig(light)?.ratio, 0.0, `${light} should prescribe no load`);
    assertEquals(getExerciseConfig(light)?.primaryRef, null, `${light} should have no load reference`);
  }
  assertEquals(getExerciseConfig('Chest Supported Row')?.primaryRef, 'bench');
  assertEquals(getExerciseConfig('Chest Supported Row')?.confidence, 'medium');
});
