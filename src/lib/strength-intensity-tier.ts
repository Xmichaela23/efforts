/**
 * INTENSITY TIER — the axis the swap engine was blind to.
 * (docs/AUDIT-accessory-swaps-2026-08-03.md, 2026-08-03.)
 *
 * ⛔ WHAT THIS FIXES. `getInSlotAlternatives` filtered on movement PATTERN and equipment and nothing
 * else, so it would offer a **Barbell Hip Thrust as a substitute for a Clamshell** — same hip-dominant
 * pattern, same muscle, same equipment story, and about thirty times the load. The audit measured it
 * over the whole library: **97 of 764 swap offers were sound on every axis the engine could see and
 * wrong only on tier**, 32 of them handing an athlete a loaded barbell lift in place of a band or
 * mobility movement. No amount of tuning the pattern filter reaches those — there was no field to tune.
 *
 * ⛔ AND THE FILE THAT NEEDED THIS ARGUED AGAINST IT, IN WRITING. `exercise-alternatives.ts`'s header
 * said: *"AND WE DO NOT FILTER ON ROLE … Neither filters on load tier — that was MY judgment, not the
 * field's."* Two things changed, and only one of them is an opinion:
 *
 *   1. **The field does filter on it.** Fitbod's rule is "same muscles at *equivalent intensity*";
 *      Trainerize's substitution is same muscle / same equipment / same movement. The same file's
 *      main-lift gate already cites this — *"Trainerize and Fitbod substitute within muscle group AND
 *      equivalent intensity, never across load tiers"* — and then implemented that rule for exactly
 *      one case (main lifts) instead of generally. This is that rule, generalized.
 *   2. **The cost was measured, not guessed.** The old note was reasoning; the audit is a count.
 *
 * ⛔ IT IS NOT DERIVED FROM `role`, AND THAT IS DELIBERATE. The obvious input looks like
 * `roleForExercise` — and the alternatives file already documents why it cannot be used: *"`barbell
 * row` is 'primary' while `bent over row` is 'accessory' — THE SAME MOVEMENT. Filtering on it produced
 * EMPTY lists."* Role answers "what job does this do in the block", which is a different question from
 * "how heavy is this class of work". Tier reads the TYPE axis instead, which is the one built to say
 * what a movement can support.
 *
 * ⚠️ THE MUSCLE AXIS IS DELIBERATELY LEFT LOOSE. The audit also flagged 253 offers where the target
 * muscle differs (a Single Leg RDL offered a Hip Thrust — hamstrings vs glutes). Those are NOT gated
 * here, on Michael's ruling and on Wendler's: posterior-chain assistance is interchangeable, and
 * `pattern` stays the muscle proxy. Adding a same-muscle gate would empty half the swap lists.
 */
import { getExerciseConfig } from './exercise-config';
import { lookupExerciseType } from './exercise-role';

/**
 * ⚠️ THREE TIERS, NOT TWO, AND THE THIRD IS FROM THE AUDIT'S CORRECTED CLASSIFIER. A first pass used
 * light/loaded only; that put plyometrics somewhere they do not belong, because a Box Jump is neither
 * prehab nor a working hypertrophy set — it is maximal-intent power work with no external load, and
 * both of the other tiers are wrong answers for it.
 */
export type IntensityTier = 'light' | 'loaded' | 'power';

/**
 * ⛔ THE LINE BETWEEN LIGHT AND LOADED, WHERE AN IMPLEMENT IS INVOLVED. Read off the config's own
 * entries rather than chosen: every named prehab/postural movement sits at or below it (ytw raise
 * .15, external rotation .15, cable face pull .15) and every working accessory sits above it
 * (lateral raise .25, dumbbell row .45, lat pulldown .65, barbell row .80).
 */
export const PREHAB_RATIO_CEILING = 0.20;

/**
 * What class of work is this?
 *
 * ⚠️ RATIO 0 ON A LOADED FORMAT MEANS "NO DERIVABLE NUMBER", NOT "LIGHT" — and reading it as light
 * was a real bug in the first cut. `weighted single leg calf raise` carries `ratio: 0` because the
 * config has no loaded calf raise to inherit from; treating that as prehab split it from the very
 * calf movements it should swap with and left it with ZERO options. An implement in the display
 * format means loaded unless an explicit small ratio says otherwise. A false exclusion is worse than
 * a false offer (`exercise-alternatives.ts`) — the athlete can skip a bad option, but cannot pick one
 * the app never showed.
 */
export function intensityTierForExercise(name: string): IntensityTier {
  const type = lookupExerciseType(name);
  const cfg = getExerciseConfig(name);

  // POWER first — a jump is checked before anything else, the same precedence `equipmentForExercise`
  // uses for the same reason ("Jump Squat" contains "squat", and rule order is what keeps it a jump).
  if (type === 'plyo' || cfg?.pattern === 'plyometric') return 'power';

  // LIGHT: the band IS the load, or there is no load at all. `isometric` (a plank, a dead hang) and
  // `mobility` (a wall angel) are held or done, never a working set against a percentage.
  if (type === 'band' || type === 'isometric' || type === 'mobility') return 'light';
  if (cfg?.displayFormat === 'band') return 'light';

  // ⛔ A BODYWEIGHT COMPOUND IS A WORKING SET, NOT PREHAB. Pull-ups, chin-ups, push-ups, dips and
  // inverted rows all carry `primaryRef: null` / `ratio: 0` — the config simply has no barbell to
  // derive them from — so an earlier rule keying on `primaryRef` called every one of them prehab and
  // produced ~80 false "unsound" rows in the audit (pull up → Lat Pulldown flagged as a tier break).
  // The honest discriminator was already present: a bodyweight movement in the CORE bucket is prehab
  // (bird dog, dead bug, plank); one in a push / pull / leg bucket is a working set.
  if (cfg?.displayFormat === 'bodyweight') return cfg.pattern === 'core' ? 'light' : 'loaded';

  // An implement is involved. An explicit small ratio marks postural / cuff work; anything else,
  // including an absent ratio, is a working load.
  const ratio = typeof cfg?.ratio === 'number' ? cfg.ratio : 0;
  if (ratio > 0 && ratio <= PREHAB_RATIO_CEILING) return 'light';
  return 'loaded';
}

/**
 * May a swap be offered from `slot` to `candidate`?
 *
 * ⚠️ EXACT MATCH, NOT AN ORDERING. There is no "one tier lighter is fine" allowance: the whole point
 * is that a Clamshell and a Barbell Hip Thrust are not interchangeable in either direction. Offering
 * a band movement in place of a barbell lift under-loads the session; offering the barbell lift in
 * place of the band movement is how a prehab slot turns into a heavy one nobody programmed.
 */
export function sameIntensityTier(slot: string, candidate: string): boolean {
  return intensityTierForExercise(slot) === intensityTierForExercise(candidate);
}
