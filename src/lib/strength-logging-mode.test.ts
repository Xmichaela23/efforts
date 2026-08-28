/**
 * Step 3 fixtures — the logger's two axes.
 *
 *   deno test --allow-read src/lib/strength-logging-mode.test.ts --no-check
 *
 * ⛔ FINAL PROOF OF STEP 3 IS A DEVICE CHECK, NOT THIS FILE. These fixtures prove the classifiers
 * return the right answers. They do NOT prove the logger DRAWS the right row — the render path runs
 * a chain of guards (`isDurationBased` per-set → `isBodyweightMove` → equipment) across ~2,000 lines
 * of JSX that no unit test reaches. Log one of each on a phone: a squat asks weight × reps, a plank
 * asks time, a box jump asks reps, a carry asks distance, a band row asks for its resistance.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { equipmentForExercise, isBodyweightLogged, isDurationLogged, loggingModeForExercise } from './strength-logging-mode.ts';
import { EXERCISE_CONFIG } from './exercise-config.ts';

/**
 * `getExerciseType` EXACTLY as it stood in `StrengthLogger.tsx` before Step 3 — a function that no
 * longer exists (Step 6 deleted it once every caller had moved). It is kept here, and ONLY here, as
 * the independent yardstick: the migration is proved equivalent rather than asserted to be. If this
 * and the shipped classifier ever disagree on any known name, the test fails and names the movement.
 *
 * ⚠️ DO NOT "TIDY" THIS INTO A CALL TO THE REAL CLASSIFIER. The moment it delegates, it stops being
 * a second opinion and the equivalence check becomes a tautology.
 */
function legacyGetExerciseType(exerciseName: string): string {
  const name = String(exerciseName || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  // ⚠️ THE FOUR 2026-08-24 DRILL WORDS ARE HERE TOO, AND THAT IS NOT A TIDY-UP. This function
  // reproduces the routing of a classifier that was deleted before Viada's drill names existed, so
  // there is no legacy answer for `A-Skip` to be faithful to. Left un-extended it would assert that
  // a movement added this week MUST be misrouted to `barbell`, which is the opposite of what the
  // yardstick is for. It is still an independent implementation — do not make it call the real one.
  if (/\b(jump|hop|bound|plyo|skater|shuffle|ladder|[ab]?skip|stifflegged)\w*/.test(name)) return 'plyo';
  if (name.includes('core circuit') || name.includes('core work') || name.includes('calf raise')) return 'bodyweight';
  if (name.includes('band') || name.includes('banded') || name.includes('clamshell')) return 'band';
  if (name.includes('lateral lunge') || name.includes('goblet squat')) return 'goblet';
  if (/(single leg|singleleg|one leg|1 leg|unilateral)/.test(name) && name.includes('thrust')) return 'goblet';
  if (name.includes('dumbbell') || name.includes('db ')) return 'dumbbell';
  const dbPatterns = [
    'bicep curl', 'biceps curl', 'hammer curl', 'concentration curl',
    'lateral raise', 'front raise', 'chest fly', 'chest flye',
    'arnold press', 'bulgarian split squat',
    'farmer walk', 'farmer walks', 'farmers carry', 'farmer carry', 'farmers walk', 'suitcase carry',
    'walking lunge', 'reverse lunge', 'forward lunge', 'lunge',
    'single leg rdl', 'single leg rdl',
    'step up', 'step up',
  ];
  if (dbPatterns.some((p) => name.includes(p))) return 'dumbbell';
  return 'barbell';
}

/** The legacy name-regex for "log this against the clock" (`StrengthLogger.tsx:1001`). */
function legacyIsDurationBased(name: string): boolean {
  return /plank|hold|carry|farmer|suitcase|wall sit|iso|isometric|time|seconds?|sec|core circuit|core work|circuit/
    .test(String(name || '').toLowerCase());
}

async function knownVocabulary(): Promise<string[]> {
  const src = await Deno.readTextFile(new URL('./exercise-role.ts', import.meta.url));
  const roleKeys = [...src.matchAll(/^ {2}'([^']+)':\s*'(?:primary|secondary|accessory)'/gm)].map((m) => m[1]);
  const mainBlock = src.split('MAIN_531_LIFTS')[1].split(']')[0];
  const mainKeys = [...mainBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return [...new Set([...roleKeys, ...mainKeys, ...Object.keys(EXERCISE_CONFIG)])];
}

Deno.test('⛔ EQUIPMENT IS BYTE-IDENTICAL TO THE CLASSIFIER IT REPLACED — every known name', async () => {
  // The instruction for this step was "reproduce the exact routing the logger has today". This is
  // that claim, checked rather than asserted. The equipment axis is a TRANSCRIPTION precisely
  // because the shared type table cannot express it (goblet and dumbbell both collapse into
  // `loaded_accessory` there) — so it must not drift by a single name.
  const drift: string[] = [];
  for (const n of await knownVocabulary()) {
    const legacy = legacyGetExerciseType(n);
    const now = equipmentForExercise(n);
    if (legacy !== now) drift.push(`${n}: was '${legacy}', now '${now}'`);
  }
  assertEquals(drift, [], `the equipment axis changed routing:\n  ${drift.join('\n  ')}`);
});

Deno.test('⛔ CLAMSHELL → BAND, and it has no "band" in its name', () => {
  // Called out explicitly in the step instruction. It is a mini-band movement, the logger has always
  // drawn it that way, and the shared type table's band row carries it for the same reason.
  assertEquals(equipmentForExercise('Clamshell'), 'band');
  assertEquals(equipmentForExercise('Clamshells'), 'band');
  assertEquals(legacyGetExerciseType('Clamshell'), 'band', 'legacy must agree, or this is not a reproduction');
});

Deno.test('⛔ THE ORDER OF THE EQUIPMENT RULES IS LOAD-BEARING', () => {
  // "Jump Squat" contains "squat"; a Box Jump fell through every rule to the barbell default until
  // the plyo test was moved to the top. If these regress, the bar comes back on a jump.
  assertEquals(equipmentForExercise('Jump Squat'), 'plyo');
  assertEquals(equipmentForExercise('Box Jump'), 'plyo');
  assertEquals(equipmentForExercise('Skater Hops'), 'plyo');
  // A single implement on the hip, not a loaded bar, and not a per-hand pair.
  assertEquals(equipmentForExercise('Single Leg Hip Thrust'), 'goblet');
  assertEquals(equipmentForExercise('Barbell Hip Thrust'), 'barbell');
  // Q-180, the apostrophe: normalization happens before any substring match.
  assertEquals(equipmentForExercise("Farmer's Carry"), 'dumbbell');
  assertEquals(equipmentForExercise('Farmers Carry'), 'dumbbell');
});

Deno.test('each movement asks the right question — the logging mode per type', () => {
  const expected: Array<[string, string]> = [
    ['Back Squat', 'weight_x_reps'],       // a squat asks weight × reps
    ['Bench Press', 'weight_x_reps'],
    ['Hip Thrust', 'weight_x_reps'],       // loaded accessory — same question, no coaching
    ['Push Ups', 'reps'],                  // bodyweight asks reps
    ['Pull Up', 'reps'],
    ['Box Jump', 'reps'],                  // a box jump asks reps, never a weight
    ['Plank', 'time'],                     // a plank asks time
    ['Side Plank', 'time'],
    ['Dead Hang', 'time'],
    ['Farmers Carry', 'distance_or_time'], // a carry asks distance (or time), never reps
    ['Sled Push', 'distance_or_time'],
    ['Wall Angel', 'done_or_time'],
    ['Band Pull Apart', 'band_resistance_lb'], // a band asks for its resistance box
    ['Clamshell', 'band_resistance_lb'],
  ];
  for (const [name, mode] of expected) {
    assertEquals(loggingModeForExercise(name), mode, `${name} should be logged as ${mode}`);
  }
});

Deno.test('⛔ THE FIVE MOVEMENTS THE OLD REGEX MISSED — and only those five', async () => {
  // The logging mode is the one axis that genuinely MOVED onto the shared table, so the behaviour
  // delta has to be exactly known and exactly this. Anything else appearing here is a regression.
  const changed: string[] = [];
  for (const n of await knownVocabulary()) {
    if (legacyIsDurationBased(n) !== isDurationLogged(n)) changed.push(n);
  }
  // ⚠️ THE REVIEWED SET GREW FROM FIVE TO EIGHT ON 2026-08-03, and the three additions are the same
  // fix, not a regression. `l sit` / `l sits` / `stir the pot` entered the vocabulary in that day's
  // pass (the vocabulary guard's backlog) and are typed `isometric` — they are HELD, exactly like a
  // plank or a dead hang. The legacy regex matched `plank|hold|carry|farmer|…` and none of those
  // words appear in "L Sit" or "Stir the Pot", which is the identical blind spot that made it miss
  // a sled push and a dead hang. Every one still changes TOWARD being timed, which the loop below
  // asserts — the direction is what makes it a fix rather than a drift.
  assertEquals(
    changed.sort(),
    ['dead hang', 'foot doming', 'l sit', 'l sits', 'sled pull', 'sled push', 'stir the pot', 'wall angel'],
    'the set of movements whose logging mode changed is not the reviewed set',
  );
  // …and every one of them changed toward being timed, never away from it.
  for (const n of changed) {
    assertEquals(legacyIsDurationBased(n), false, `${n} was already timed — that is not a fix`);
    assertEquals(isDurationLogged(n), true, `${n} should now be timed`);
  }
});

Deno.test('a plank is still timed and a squat is still not — the 184 unchanged names hold', () => {
  for (const n of ['Plank', 'Plank Hold', 'Side Plank', 'Copenhagen Plank', 'Farmers Carry', 'Core Circuit']) {
    assert(isDurationLogged(n), `${n} must stay timed`);
    assertEquals(legacyIsDurationBased(n), true, `${n} was timed before too`);
  }
  for (const n of ['Back Squat', 'Bench Press', 'Deadlift', 'Box Jump', 'Push Ups', 'Hip Thrust']) {
    assertEquals(isDurationLogged(n), false, `${n} must not be timed`);
    assertEquals(legacyIsDurationBased(n), false, `${n} was not timed before either`);
  }
});

Deno.test('an unrecognised movement gets the safe logging mode', () => {
  // Unknown → `loaded_accessory` → weight × reps, which is what the logger has always defaulted to.
  assertEquals(loggingModeForExercise('Zercher Good Morning Complex'), 'weight_x_reps');
  assertEquals(isDurationLogged('Zercher Good Morning Complex'), false);
  assertEquals(equipmentForExercise('Zercher Good Morning Complex'), 'barbell');
});


// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AXIS 2b — IS THE BODY THE LOAD? (2026-08-27)
//
// Michael's live session drew an **Ab Wheel Rollout** a weight box, a plate calculator and a 45 lb
// bar. The logger was asking its own substring regex — the fifth private classifier for a question
// the shared type table already answers — and that regex has no `rollout` stem.
//
// ⚠️ THESE ARE NOT EQUIVALENCE FIXTURES. Every other test above proves a migration changed nothing;
// this one exists because the migration changes 57 answers ON PURPOSE, and the whole list is named
// below so nobody has to diff two classifiers to find out what moved.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** The logger's old private regex, verbatim. ⚠️ Its normalizer strips spaces AND hyphens. */
function legacyIsBodyweightMove(raw: string): boolean {
  const n = String(raw || '').toLowerCase().replace(/[\s-]/g, '');
  return /dip|chinup|pullup|pushup|plank|nordic|nordiccurl|nordiccurls|swissballwalk|swissball|walkout|jump|bound|hop|plyo|skip|shuffle|ladderdrill|stiffleggedrun|calfraise|corecircuit|corework/.test(n);
}

Deno.test('⛔ THE ROW ON THE SCREENSHOT — an ab wheel rollout is bodyweight, and was not', () => {
  // ⛔ THE DEFECT ITSELF, PINNED. The old regex said no; the type table, the exercise config and
  // Viada p223 (ab wheel rollouts, filed under CORE) all say yes.
  assertEquals(legacyIsBodyweightMove('Ab Wheel Rollout'), false, 'the legacy regex changed — this fixture is stale');
  assertEquals(isBodyweightLogged('Ab Wheel Rollout'), true);
  // The same defect wore three other names in the same table.
  for (const n of ['Ab Rollout', 'Stability Ball Rollout', 'TRX Fallout']) {
    assertEquals(isBodyweightLogged(n), true, `${n} still asks for a weight`);
  }
});

Deno.test('⛔ THE TWO IT GOT BACKWARDS — a loaded movement denied its weight box', () => {
  /**
   * ⛔ `woodc`**`hop`**`per`. The `hop` stem exists for plyometrics and it matched the middle of
   * "woodchopper", so a loaded cable movement answered "bodyweight" and lost its load column. This
   * is the exact failure mode a substring classifier has and a lookup table does not.
   */
  assertEquals(legacyIsBodyweightMove('Cable Woodchopper'), true, 'the legacy collision is gone — this fixture is stale');
  assertEquals(isBodyweightLogged('Cable Woodchopper'), false);
  // ⛔ AND THE `calfraise` STEM MATCHED REGARDLESS OF THE WORD "WEIGHTED" IN FRONT OF IT.
  assertEquals(legacyIsBodyweightMove('Weighted Single Leg Calf Raise'), true, 'the legacy stem is gone — this fixture is stale');
  assertEquals(isBodyweightLogged('Weighted Single Leg Calf Raise'), false);
  // ⚠️ AND THE TABLE ITSELF HAD ONE WRONG, CORRECTED IN THE SAME CHANGE. `weighted sit up` was filed
  // as `bodyweight`; the name says weighted and the row has to offer somewhere to put the plate.
  assertEquals(isBodyweightLogged('Weighted Sit Up'), false);
  // The unweighted one is still bodyweight, which is what makes the pair worth asserting together.
  assertEquals(isBodyweightLogged('Sit Up'), true);
});

Deno.test('⛔ AN UNKNOWN NAME STILL FALLS BACK TO THE REGEX, and that is deliberate', () => {
  /**
   * ⛔ THE TABLE IS AN EXACT-KEY LOOKUP. A name it has never heard of resolves to
   * `loaded_accessory` — correct for the load system, wrong here — and the freestyle logger lets an
   * athlete type anything. Switching cold would have ADDED a weight box to every unrecognised
   * bodyweight movement someone typed by hand, which is the same class of defect pointing the other
   * way. The table answers where it knows; the regex covers only what it has never seen.
   */
  assertEquals(isBodyweightLogged('Archer Push Up Iso Hold Variation'), true, 'an unknown bodyweight name lost its fallback');
  assertEquals(isBodyweightLogged('Zercher Good Morning Complex'), false, 'an unknown loaded name gained a bodyweight answer');
});

Deno.test('⛔ EVERY DIFFERENCE FROM THE OLD REGEX IS NAMED HERE — no silent third case', async () => {
  /**
   * ⚠️ THE GATE THAT MAKES THE OTHERS MEAN SOMETHING. It walks the whole known vocabulary, collects
   * every name where the shared answer differs from the old regex, and asserts the set is exactly
   * the one below. A movement that starts or stops being bodyweight without anyone deciding fails
   * here and is named by the failure.
   */
  const gained: string[] = []; // regex said loaded, the table says bodyweight — the 55.
  const lost: string[] = [];   // regex said bodyweight, the table says loaded — the collisions.
  // ⚠️ THE FULL VOCABULARY, NOT JUST `EXERCISE_CONFIG` — the same seam the equivalence tests above
  // use. The type table holds names the config does not (`weighted sit up` is one), and a fixture
  // that walked only one of the two would have missed the row this change corrected.
  for (const name of await knownVocabulary()) {
    const now = isBodyweightLogged(name);
    const before = legacyIsBodyweightMove(name);
    if (now === before) continue;
    (now ? gained : lost).push(name.toLowerCase());
  }
  // ⛔ THE COLLISIONS ARE THE SHORT LIST AND THE ONE WORTH READING. Anything new here means a stem
  // is eating a loaded movement, which is exactly how the woodchopper broke.
  // ⚠️ SPELT AS THE VOCABULARY SPELLS THEM. The type table says `weighted single leg calf raise`;
  // `EXERCISE_CONFIG` says `Weighted Single-Leg Calf Raises`. Both resolve to the same row and both
  // appear here, which is a fact about the vocabulary rather than about this change.
  // ⚠️ `weighted sit up` IS DELIBERATELY ABSENT, AND ITS ABSENCE IS THE PROOF THE TABLE FIX LANDED.
  // The old regex never matched it either (no stem fires on `weightedsitup`), so it is not a
  // DIFFERENCE — it was a row the table itself had filed as bodyweight, corrected in this change.
  // Had it been left wrong it would have shown up in `gained`, silently taking the plate box off a
  // weighted movement. It is asserted directly in the fixture above.
  assertEquals(lost.sort(), [
    'cable woodchopper',
    'weighted single leg calf raise',
    'weighted single-leg calf raises',
  ].sort(), 'a loaded movement changed sides — a stem is matching something it should not');
  // ⛔ AND THE OTHER DIRECTION IS A COUNT PLUS ITS SPOT CHECKS, because the list is long and the
  // point is the SIZE of it: one screenshot, fifty-plus rows drawing a bar they have no use for.
  assert(gained.length >= 50, `expected the regex to have missed ~55 movements, found ${gained.length}`);
  for (const n of ['ab wheel rollout', 'pistol squat', 'hanging leg raise', 'dead hang', 'wall sit', 'burpee']) {
    assert(gained.includes(n), `${n} is missing from the movements this fixes`);
  }
});
