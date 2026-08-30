/**
 * `isMainBarbellLift` — the gate that keeps the bar-speed cue on the four lifts it describes.
 *
 * Run from repo root:  deno test src/lib/exercise-role.main-lift.test.ts --no-check
 *
 * ⛔ WHY A SEPARATE PREDICATE FROM `roleForExercise`. `primary` answers "does skipping this cost
 * full completion weight" and is deliberately wide — goblet squat, RDL, trap-bar deadlift and DB
 * bench are all primary. The bar-speed cue describes something narrower: the lift the block
 * prescribes a percentage of a training max for. Gating the cue on `primary` put "Every rep at the
 * same speed as the first" on Michael's Box Jump.
 *
 * ⛔ AND THE DEFAULTS RUN OPPOSITE WAYS ON PURPOSE. `roleForExercise` defaults an unmapped name to
 * `primary` (loudly) so nothing is silently discounted in scoring. `isMainBarbellLift` MISSES TO FALSE,
 * so an unmapped lift gets no cue rather than the wrong one. If this ever starts defaulting true,
 * every exercise the library gains inherits a the previous program instruction.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isMainBarbellLift, roleForExercise } from './exercise-role.ts';

Deno.test('the four lifts, and the variants that genuinely fill their slot', () => {
  for (const n of [
    'Back Squat', 'Barbell Back Squat', 'Front Squat',
    'Bench Press', 'Close Grip Bench Press',
    'Deadlift', 'Conventional Deadlift', 'Trap Bar Deadlift',
    'Overhead Press', 'Standing Barbell Overhead Press', 'Push Press',
  ]) {
    assertEquals(isMainBarbellLift(n), true, `${n} should be a main lift`);
  }
});

Deno.test('⛔ containment is not identity — a Jump Squat is not a squat here', () => {
  // The same trap canonicalize.ts warns about for 1RM purposes. "Jump Squat" contains "squat".
  assertEquals(isMainBarbellLift('Jump Squat'), false);
  assertEquals(isMainBarbellLift('Squat Jump'), false);
  assertEquals(isMainBarbellLift('Bulgarian Split Squat'), false);
  assertEquals(isMainBarbellLift('Goblet Squat'), false);
});

Deno.test('⛔ THE ACTUAL BUG: a Box Jump gets no main-lift cue', () => {
  assertEquals(isMainBarbellLift('Box Jump'), false);
  // ...while still being a real, fully-weighted exercise for scoring. The two questions differ.
  assertEquals(roleForExercise('Box Jump') !== 'accessory', true);
});

Deno.test('assistance and accessory movements are not main lifts', () => {
  for (const n of ['Chin Up', 'Dips', 'Single Leg Hip Thrust', 'Romanian Deadlift', 'Barbell Row']) {
    assertEquals(isMainBarbellLift(n), false, `${n} should not be a main lift`);
  }
});

Deno.test('⛔ an UNMAPPED name misses to FALSE — no cue beats the wrong cue', () => {
  assert(!isMainBarbellLift('Zercher Good Morning Complex'));
  assert(!isMainBarbellLift(''));
  assert(!isMainBarbellLift('some exercise nobody has heard of'));
});
