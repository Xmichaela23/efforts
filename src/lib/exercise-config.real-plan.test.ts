/**
 * RECONCILED AGAINST THE ATHLETE'S REAL PLANS AND LOGS (2026-08-03, second pass).
 *
 *   ~/.deno/bin/deno test --allow-read src/lib/exercise-config.real-plan.test.ts --no-check
 *
 * ⛔ THE FIRST RECONCILIATION USED THE WRONG CORPUS. It diffed the config against the exercise
 * LIBRARY — TYPE_TABLE, ROLE_TABLE, the protocol vocabulary — and closed every gap it found, while
 * the movements actually sitting in `planned_workouts` and `workouts` went unchecked. A read-only
 * pull of the 68 distinct strength names the athlete has really planned or logged found six with no
 * key, each landing on a neighbour through `getExerciseConfig`'s longest-substring fuzzy fallback.
 *
 * ⚠️ EVERY CASE BELOW IS A NAME HE HAS ACTUALLY USED. That is the point of the file: a fixture built
 * from the library would have passed on all six.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { EXERCISE_CONFIG, getExerciseConfig, resolveExerciseConfig } from './exercise-config.ts';
import { getInSlotAlternatives } from './exercise-alternatives.ts';
import { isMain531Lift, lookupExerciseType } from './exercise-role.ts';
import { intensityTierForExercise } from './strength-intensity-tier.ts';
import { equipmentForExercise } from './strength-logging-mode.ts';

const FULL_GYM = ['Full commercial gym access'];
const keyOf = (cfg: unknown) => Object.entries(EXERCISE_CONFIG).find(([, v]) => v === cfg)?.[0] ?? null;
/** Every real name must land on ITSELF, not on a neighbour. */
const resolvesToItself = (name: string, key: string) => assertEquals(keyOf(getExerciseConfig(name)), key, `${name} should resolve to '${key}'`);

Deno.test('⛔ SINGLE LEG HIP THRUST no longer inherits the BILATERAL hip thrust', () => {
  // It had no key, so it matched `hip thrust`: deadlift × 0.9, a loaded barbell, isUnilateral false.
  // Both `assistance-menu.ts` and `strength-logging-mode.ts` have carried this bug in their headers
  // — one for the prescription, one for the screenshot where the logger drew a 45 lb bar over it.
  resolvesToItself('Single Leg Hip Thrust', 'single leg hip thrust');
  const c = EXERCISE_CONFIG['single leg hip thrust'];
  assertEquals(c.isUnilateral, true, 'it is a SINGLE leg movement');
  assertEquals(c.pattern, 'hip_dominant', 'a hip thrust is hip extension, single-legged or not');

  // ⛔ RATIO INHERITED, NOT HALVED-BY-EYE. `single leg romanian deadlift` is the structural twin:
  // same reference lift, same pattern, same displayFormat, same isUnilateral.
  const twin = EXERCISE_CONFIG['single leg romanian deadlift'];
  assertEquals(c.ratio, twin.ratio);
  assertEquals(c.primaryRef, twin.primaryRef);
  assertEquals(c.displayFormat, twin.displayFormat);

  // ⚠️ `total`, NOT `perHand` — ONE implement on the hip, which is why the logger already routes
  // this movement to `goblet` rather than `dumbbell`. A "lb/hand" label would be wrong the other way.
  assertEquals(c.displayFormat, 'total');
  assertEquals(equipmentForExercise('Single Leg Hip Thrust'), 'goblet');

  // And it is no longer priced off the two-legged 0.9.
  assert(c.ratio < EXERCISE_CONFIG['hip thrust'].ratio);
});

Deno.test('⛔ PLANKS resolved to a COPENHAGEN PLANK — the fuzzy fallback scores by length', () => {
  // `copenhagen planks` CONTAINS "planks" (score 6) and beat `plank`, a substring of it (score 5).
  // Both are core holds so nothing caught it; the visible cost was `isUnilateral: true` on a
  // bilateral hold, and the latent cost was inheriting any ratio Copenhagen Plank ever gains.
  resolvesToItself('Planks', 'planks');
  assertEquals(EXERCISE_CONFIG['planks'].isUnilateral, false, 'a plank is bilateral');
  // Copied from `plank` exactly — same movement, not a new opinion.
  assertEquals(JSON.stringify(EXERCISE_CONFIG['planks']), JSON.stringify(EXERCISE_CONFIG['plank']));
  // The Copenhagen entry is untouched and still unilateral.
  assertEquals(EXERCISE_CONFIG['copenhagen plank'].isUnilateral, true);
});

Deno.test('⛔ THE THREE THAT RESOLVED TO NOTHING AT ALL', () => {
  // A null config drops the movement onto the legacy weight path — the D-322 "Pull Up @ 110 lb" class.
  for (const [name, key] of [['Nordic Curls', 'nordic curls'], ['DB Thruster', 'db thruster'], ['ohp', 'ohp']] as const) {
    resolvesToItself(name, key);
  }
  // A thruster is a front squat into a press, and the PRESS is the limiting half.
  const th = EXERCISE_CONFIG['db thruster'];
  assertEquals(th.pattern, 'vertical_push');
  assertEquals(th.ratio, EXERCISE_CONFIG['db push press'].ratio, 'inherited from db push press');
  assertEquals(th.ratioIsTotal, true, 'the ratio is a TOTAL — without this the prescription doubles');
  // Nordic curls copy the movement the library already knew under a longer name.
  assertEquals(EXERCISE_CONFIG['nordic curls'].displayFormat, EXERCISE_CONFIG['nordic hamstring curl'].displayFormat);
});

Deno.test('⛔ `ohp` IS A MAIN LIFT, BECAUSE THE SERVER ALREADY SAYS SO', () => {
  // `canonicalize('ohp')` returns `overhead_press`, so the strength trend and the learned max have
  // folded his logged "ohp" sessions into the overhead press all along — while `isMain531Lift` said
  // no. One session, two vocabularies, two answers. Now one.
  assert(isMain531Lift('ohp'), 'the two readers must agree');
  assertEquals(lookupExerciseType('ohp'), 'barbell_main');
  assertEquals(EXERCISE_CONFIG['ohp'].primaryRef, 'overhead');
  assertEquals(EXERCISE_CONFIG['ohp'].ratio, EXERCISE_CONFIG['overhead press'].ratio);
});

Deno.test('TRICEP DIPS is pinned rather than left to fuzzy luck', () => {
  resolvesToItself('Tricep Dips', 'tricep dips');
  // Same movement as `dips`, so the values were already right — pinning keeps them right.
  const t = EXERCISE_CONFIG['tricep dips'], d = EXERCISE_CONFIG['dips'];
  assertEquals([t.pattern, t.primaryRef, t.ratio, t.displayFormat], [d.pattern, d.primaryRef, d.ratio, d.displayFormat]);
});

Deno.test('⛔ THE SWAP LIST FOR SINGLE LEG HIP THRUST IS CLEAN', () => {
  // One pattern, one tier, all the way down — the Band Face Pulls standard.
  const slot = 'Single Leg Hip Thrust';
  const alts = getInSlotAlternatives(slot, FULL_GYM);
  assert(alts.length > 0, 'it must still have options');
  for (const o of alts) {
    assertEquals(getExerciseConfig(o.name)?.pattern, 'hip_dominant', `${o.name} left the pattern`);
    assertEquals(intensityTierForExercise(o.name), intensityTierForExercise(slot), `${o.name} crossed the tier`);
  }
});

Deno.test('the plural / case variants all reach their prescription without guessing', () => {
  // They fold onto the right entry already. Keys for these would be noise, and this pins that the
  // folding actually does the job — the reason they were left out.
  // ⚠️ THIS TEST CHANGED ON 2026-08-03 AND THE CHANGE IS AN UPGRADE. It used to assert these
  // plurals FOLD onto their singular — true then, and it meant they were resolving through the
  // fuzzy fallback, which the vocabulary guard later flagged. Each now has its own key, so each
  // resolves to ITSELF. The rule under test is stronger, not weaker: no name in the athlete's
  // vocabulary reaches its prescription by guess.
  const ownKeys = [
    'Goblet Squats', 'Bulgarian Split Squats', 'Cable Face Pulls', 'Farmer Walks',
    'Leg Curls', 'chinups', 'Weighted Single-Leg Calf Raises',
  ];
  for (const real of ownKeys) {
    assertEquals(resolveExerciseConfig(real).via !== 'fuzzy', true, `${real} still resolves by guess`);
  }
});
