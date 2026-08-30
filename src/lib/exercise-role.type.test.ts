/**
 * Axis 2 — TYPE. Fixtures for the one type table (SPEC-strength-language.md, Step 1).
 *
 * Run from repo root:  deno test --allow-read src/lib/exercise-role.type.test.ts --no-check
 *
 * ⛔ WHAT THESE FIXTURES ARE FOR. Step 1 adds the table and changes NO behavior — nothing reads
 * `typeForExercise` yet. So the only thing that can be proved right now is the table itself:
 * every name the app actually emits resolves, it resolves to the RIGHT type, and the capability
 * flags say what the spec says they say. Steps 2-6 migrate readers onto it one at a time.
 *
 * ⛔ THE COVERAGE TEST IS THE LOAD-BEARING ONE. A type table that quietly defaults is the same
 * failure `roleForExercise`'s loud warning exists to catch — and worse here, because a default
 * that grants capability is how the bar-speed cue reached a Box Jump. This test asserts the whole
 * known vocabulary is explicitly mapped, so a protocol adding a name fails a test instead of
 * inheriting a profile nobody chose.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  capabilitiesForExercise,
  EXERCISE_TYPE_CAPABILITIES,
  ExerciseType,
  isMainBarbellLift,
  lookupExerciseType,
  typeForExercise,
} from './exercise-role.ts';
import { EXERCISE_CONFIG } from './exercise-config.ts';
// ⚠️ TEST-ONLY REACH INTO SERVER CODE, and it is the point of the band fixtures: the `band` row is
// a POINTER at `workload.ts`'s pricing, so the only way to prove it points at the right thing is to
// ask the real `bandMeansAssistance`. Production code keeps the existing direction — the server
// imports `src/lib`, never the reverse. (Precedent: `src/lib/bar-speed-copy.test.ts`.)
import { bandMeansAssistance, canonicalize } from '../../supabase/functions/_shared/canonicalize.ts';

/**
 * The known vocabulary, assembled from the three places that hold one.
 *
 * ⚠️ `ROLE_TABLE` and `MAIN_BARBELL_LIFTS` are module-private, so their keys are read out of the
 * source text rather than imported. That is deliberate: it keeps Step 1 purely additive (no new
 * exports of internals just to satisfy a test), and it means the fixture tracks the tables
 * automatically — add a role-table row without a type-table row and this test fails, which is
 * exactly the drift we are trying to make impossible.
 */
async function knownVocabulary(): Promise<string[]> {
  const src = await Deno.readTextFile(new URL('./exercise-role.ts', import.meta.url));
  const roleKeys = [...src.matchAll(/^ {2}'([^']+)':\s*'(?:primary|secondary|accessory)'/gm)].map((m) => m[1]);
  const mainBlock = src.split('MAIN_BARBELL_LIFTS')[1].split(']')[0];
  const mainKeys = [...mainBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const configKeys = Object.keys(EXERCISE_CONFIG);
  assert(roleKeys.length > 50, `expected the role table to parse, got ${roleKeys.length} keys`);
  assert(mainKeys.length > 10, `expected the main-lift set to parse, got ${mainKeys.length} keys`);
  assert(configKeys.length > 100, `expected the config vocabulary, got ${configKeys.length} keys`);
  return [...new Set([...roleKeys, ...mainKeys, ...configKeys])];
}

Deno.test('⛔ COVERAGE — every name the app emits has an explicit type, none fall to the default', async () => {
  const misses = (await knownVocabulary()).filter((n) => lookupExerciseType(n) === null);
  assertEquals(
    misses,
    [],
    `these names would silently default to 'loaded_accessory' — add them to TYPE_TABLE:\n  ${misses.join('\n  ')}`,
  );
});

Deno.test('⛔ COVERAGE, THE SERVER KEYING — every canonicalize() output resolves too', async () => {
  // ⛔ THIS IS THE TEST THAT WAS MISSING, AND THE HARNESS FOUND WHAT IT WOULD HAVE CAUGHT.
  // `per_lift.canonical_name` carries the SERVER's key (`_shared/canonicalize.ts`), not the display
  // name — `chinup`, `db_row`, `bench_press`. The first coverage test walked the raw display
  // vocabulary only, so `chinup` typed as `loaded_accessory` and a chin-up silently became a lift
  // with an external load. Two vocabularies, one table: it has to resolve both.
  const misses = (await knownVocabulary())
    .map((n) => canonicalize(n))
    .filter((k) => lookupExerciseType(k) === null);
  assertEquals(
    [...new Set(misses)],
    [],
    'these canonical keys reach the State row and do not resolve — add them to TYPE_TABLE',
  );
});

Deno.test('⛔ ONE SET, TWO READERS — barbell_main and isMainBarbellLift can never disagree', async () => {
  const vocab = await knownVocabulary();
  const names = [
    ...vocab,
    // ⚠️ AND THE SERVER KEYING TOO. `weekly.ts` gates coaching language on the type axis and is
    // handed `per_lift.canonical_name` — a `canonicalize()` key. If the two readers agreed on
    // display names but diverged on `bench_press`, the swap would silently change what is coached.
    ...vocab.map((n) => canonicalize(n)),
    // …and names the tables have never heard of, where the two could drift apart unnoticed.
    'Zercher Good Morning Complex', 'some exercise nobody has heard of', '',
  ];
  for (const n of names) {
    assertEquals(
      typeForExercise(n) === 'barbell_main',
      isMainBarbellLift(n),
      `${JSON.stringify(n)}: type says ${typeForExercise(n)}, isMainBarbellLift says ${isMainBarbellLift(n)}`,
    );
  }
});

Deno.test('the eight rows — one named exercise each, all four capabilities', () => {
  const expected: Array<[string, ExerciseType, string, boolean, boolean, string]> = [
    // name,                type,               load,         1RM,   coached, loggedAs
    ['Back Squat',          'barbell_main',     'external',   true,  true,    'weight_x_reps'],
    ['Hip Thrust',          'loaded_accessory', 'external',   false, false,   'weight_x_reps'],
    ['Push Ups',            'bodyweight',       'bodyweight', false, false,   'reps'],
    ['Box Jump',            'plyo',             'none',       false, false,   'reps'],
    ['Plank',               'isometric',        'none',       false, false,   'time'],
    ['Wall Angel',          'mobility',         'none',       false, false,   'done_or_time'],
    ['Farmers Carry',       'carry',            'external',   false, false,   'distance_or_time'],
    ['Band Pull Apart',     'band',             'band',       false, false,   'band_resistance_lb'],
  ];
  for (const [name, type, load, hasOneRepMax, coached, loggedAs] of expected) {
    assertEquals(typeForExercise(name), type, `${name} should be ${type}`);
    const cap = capabilitiesForExercise(name);
    assertEquals(cap.load, load, `${name}.load`);
    assertEquals(cap.hasOneRepMax, hasOneRepMax, `${name}.hasOneRepMax`);
    assertEquals(cap.coached, coached, `${name}.coached`);
    assertEquals(cap.loggedAs, loggedAs, `${name}.loggedAs`);
  }
});

Deno.test('⛔ COACHED IS TRUE ON EXACTLY ONE ROW — that is D-373, expressed as data', () => {
  const coached = Object.entries(EXERCISE_TYPE_CAPABILITIES).filter(([, c]) => c.coached).map(([t]) => t);
  assertEquals(coached, ['barbell_main']);
  // Same for the estimated max: you test a 1RM on a barbell lift, not on a hip thrust (D-374).
  const withMax = Object.entries(EXERCISE_TYPE_CAPABILITIES).filter(([, c]) => c.hasOneRepMax).map(([t]) => t);
  assertEquals(withMax, ['barbell_main']);
});

Deno.test('⛔ THE THREE MOVEMENTS THAT CAUSED THIS SPEC', () => {
  // 1. The Box Jump that was shown a bar, a plate calculator and a bar-speed cue (2026-08-01).
  const boxJump = capabilitiesForExercise('Box Jump');
  assertEquals(boxJump.load, 'none', 'a jump has no external load to record');
  assertEquals(boxJump.coached, false, 'a jump is maximal by definition — a speed cue is for a bar');

  // 2. The Hip Thrust that printed a red "back off weight" (D-373). Loaded, and silent.
  const hipThrust = capabilitiesForExercise('Hip Thrust');
  assertEquals(hipThrust.load, 'external', 'it is still real, loaded work — it must count');
  assertEquals(hipThrust.coached, false, 'and the app has nothing to say about it');
  assertEquals(hipThrust.hasOneRepMax, false, 'you do not test a max on a hip thrust (D-374)');

  // 3. The Farmers Carry that fell through to the barbell default and was priced as one bar (Q-180).
  assertEquals(typeForExercise('Farmers Carry'), 'carry');
  assertEquals(capabilitiesForExercise('Farmers Carry').loggedAs, 'distance_or_time');
});

Deno.test('a band movement resolves to the Band row', () => {
  for (const n of [
    'Band Pull Apart', 'Band Row', 'Band Face Pull', 'Band Pull Down', 'Band Overhead Press',
    'Band Lateral Raise', 'Band Lateral Walk', 'Lateral Band Walk', 'Resistance Band Row', 'Clamshells',
  ]) {
    assertEquals(typeForExercise(n), 'band', `${n} should be the band row`);
  }
  const cap = capabilitiesForExercise('Band Pull Apart');
  assertEquals(cap.load, 'band', 'load routes to workload.ts, it is not a poundage');
  assertEquals(cap.loggedAs, 'band_resistance_lb');
  assertEquals(cap.coached, false);
  assertEquals(cap.hasOneRepMax, false, 'there is no 1RM on a band');
});

Deno.test('⛔ THE BAND ROW IS THE *ADD* CASE ONLY — pinned against the real bandMeansAssistance', async () => {
  // The whole reason the row is a pointer: `resistance_level` is ONE field with opposite meanings,
  // and `bandMeansAssistance` is the only thing that gets to say which. If a movement where the
  // band is HELP were typed `band`, a future reader would price a chin-up as band-only work.
  const banded = (await knownVocabulary()).filter((n) => typeForExercise(n) === 'band');
  assert(banded.length > 0, 'expected some band-typed names');
  for (const n of banded) {
    assertEquals(
      bandMeansAssistance(canonicalize(n)),
      false,
      `${n} is typed 'band' (the band is the load) but bandMeansAssistance says it is assistance`,
    );
  }
});

Deno.test('⛔ ASSIST MOVEMENTS ARE BODYWEIGHT, NOT BAND — the body is still what moved', () => {
  // {pullup, chinup, dip} — the exact set `bandMeansAssistance` owns.
  for (const n of ['Pull Up', 'Chin Up', 'Dips']) {
    assert(bandMeansAssistance(canonicalize(n)), `${n} should be assist-capable — the set moved`);
    assertEquals(typeForExercise(n), 'bodyweight', `${n} must not be typed 'band'`);
  }
  // ⛔ THE DISCRIMINATING CASE. The word "Band" is in the name and it changes nothing: the band is
  // help here, so the row is bodyweight. Type is decided by what the band DOES.
  assertEquals(typeForExercise('Band Assisted Pull Up'), 'bodyweight');
});

Deno.test('⛔ containment is not identity, on this axis too', () => {
  // "Jump Squat" contains "squat"; "Barbell Hip Thrust" contains "barbell".
  assertEquals(typeForExercise('Jump Squat'), 'plyo');
  assertEquals(typeForExercise('Squat Jump'), 'plyo');
  assertEquals(typeForExercise('Goblet Squat'), 'loaded_accessory');
  assertEquals(typeForExercise('Barbell Hip Thrust'), 'loaded_accessory');
  // A dumbbell press is not the previous program press slot, and a DB bench is not the bench slot.
  assertEquals(typeForExercise('DB Shoulder Press'), 'loaded_accessory');
  assertEquals(typeForExercise('DB Bench Press'), 'loaded_accessory');
});

Deno.test('every plyometric in exercise-config types as plyo — the two vocabularies agree', () => {
  // The config's own `pattern: 'plyometric'` rows, and the logger's plyo regex, must not disagree
  // with this table — three readers of one idea is how the six classifiers happened.
  for (const [name, cfg] of Object.entries(EXERCISE_CONFIG)) {
    if ((cfg as { pattern?: string }).pattern !== 'plyometric') continue;
    assertEquals(typeForExercise(name), 'plyo', `${name} is plyometric in exercise-config`);
  }
});

Deno.test('⛔ AN UNMAPPED NAME COUNTS AS LOAD AND SAYS NOTHING — the safe direction', () => {
  const cap = capabilitiesForExercise('Zercher Good Morning Complex');
  assertEquals(cap.load, 'external', 'nothing is silently discounted from load');
  assertEquals(cap.coached, false, 'and nothing unrecognised is ever coached');
  assertEquals(cap.hasOneRepMax, false);
  // ⚠️ If this ever starts defaulting to `barbell_main`, every exercise the library gains inherits
  // a the previous program instruction — the exact failure mode `isMainBarbellLift`'s docblock warns about.
  assertEquals(typeForExercise('Zercher Good Morning Complex') === 'barbell_main', false);
});

Deno.test('the empty / junk name does not resolve to a coached type', () => {
  for (const n of ['', '   ', '(Light)']) {
    assertEquals(capabilitiesForExercise(n).coached, false, `${JSON.stringify(n)} must not be coached`);
  }
});
