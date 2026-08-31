// ============================================================================
// MUSCLE GROUPS — the unit the accessory model was missing.
//
// ⛔ THE VOCABULARY IS NOT NEW. `_shared/readiness-thresholds.ts` has carried twenty muscle names
// since the soreness ledger shipped, and `_shared/demand-mapping.ts` emits them. **This file uses
// those exact spellings** — `quadriceps`, not `quads`; `calves`, not `calf` — so the app has one
// spelling of a muscle rather than two.
//
// ⚠️ WHAT IS NEW IS THE QUESTION, WHICH IS THE `MovementGroup` / `MovementFamily` shape again:
//
//   `demand-mapping.deriveDemands`   "which muscles did this WORKOUT stress?"    — per session, for
//                                                                                  the soreness ledger
//   THIS FILE                        "which muscle does this MOVEMENT train,     — per movement, for
//                                     for volume accounting?"                      weekly set counting
//
// One asks what the athlete just did; the other asks what a prescription will buy. Same words,
// different granularity, different purpose.
//
// ── ⛔ THE GROUPS ARE VIADA'S, WITH ONE ADDITION THAT IS OURS AND SAYS SO ────────────────────────
//
// p222 names the single-joint targets outright: *"Single-joint emphasis (chest/deltoid/lat/
// hamstring/quad/calf/biceps/triceps)"*. p223 adds CORE as its own heading. That is nine.
// `glutes` is the tenth and it is OURS — see {@link GLUTES_IS_OURS}.
// ============================================================================

import { foldExerciseName, getExerciseConfig } from '../../../../src/lib/exercise-config.ts';

/**
 * ⛔ TEN GROUPS. Nine are the ones Viada names; `glutes` is ours.
 *
 * ⚠️ SPELLINGS MATCH `readiness-thresholds.ts` EXACTLY. A crosswalk that only nearly matches is a
 * second vocabulary with extra steps.
 */
export type MuscleGroup =
  | 'chest'
  | 'deltoids'
  | 'lats'
  | 'biceps'
  | 'triceps'
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'deltoids', 'lats', 'biceps', 'triceps',
  'quadriceps', 'hamstrings', 'glutes', 'calves', 'core',
];

/**
 * ⛔ GLUTES ARE NOT ONE OF HIS NINE, AND THAT IS SAID HERE RATHER THAN BURIED.
 *
 * p222's single-joint list has no glute entry — his FOCUSED HINGE LOWER heading reads
 * *"/HAMSTRINGS"* and files hip thrusts and cable kickbacks, both glute movements, underneath it.
 * So in his taxonomy the glutes ride with the posterior chain.
 *
 * **They are split out here because the app already has the word** (`readiness-thresholds.ts`,
 * `demand-mapping.ts`) and because a floor that cannot say "your glutes got three sets" cannot
 * answer the question this stage exists to answer. ⚠️ **It is a grouping decision, not a number** —
 * no dose, floor or ceiling in this module is invented, and every one of those traces to a page.
 */
export const GLUTES_IS_OURS =
  'Viada files hip thrusts and kickbacks under his hamstring heading; the glutes are not a separate '
  + 'single-joint target on p222. Splitting them out is ours, and it uses the muscle name the app '
  + 'already carries in readiness-thresholds.ts.';

/**
 * ⛔ HIS OWN CAVEAT ON PER-MUSCLE COUNTING, AND IT TRAVELS WITH EVERY LEDGER THIS MODULE PRODUCES.
 *
 * p084, read off the page:
 *
 * > *"Complicating this: it's difficult to precisely determine which muscles are getting worked in
 * > a given movement. Most compound exercises involve multiple muscles and joints being heavily
 * > engaged, and even if a muscle isn't the 'prime mover' or primary target, it can still be
 * > experiencing quite a bit of fatigue."*
 *
 * **So a per-muscle set count is an approximation by the author's own statement.** This module
 * reports the prime mover's count as the number and lists secondary engagement beside it WITHOUT
 * counting it — because he gives no fraction to count it at, and inventing one is forbidden.
 */
export const ATTRIBUTION_IS_APPROXIMATE =
  'Attributing a set to one muscle is approximate. Most movements load several muscles, and a muscle '
  + 'that is not the prime mover can still take real fatigue — so secondary engagement is listed but '
  + 'not counted. The source gives no fraction to count it at.';

/** What one movement trains: the muscle a set is counted to, and the ones it also loads. */
export type MuscleWork = {
  primary: MuscleGroup;
  /** ⛔ LISTED, NEVER COUNTED. See {@link ATTRIBUTION_IS_APPROXIMATE}. */
  secondary: MuscleGroup[];
};

// ── THE CLASSIFIER ──────────────────────────────────────────────────────────────────────────────
//
// ⛔ NAME-FIRST, THEN THE PATTERN THE APP ALREADY KEEPS. The specific tests below run in order and
// the first hit wins; anything that falls through is answered from `MovementPattern`, which is the
// existing vocabulary and is never re-derived here.

type Rule = { re: RegExp; primary: MuscleGroup; secondary: MuscleGroup[] };

/**
 * ⛔ ORDER IS THE ALGORITHM, AND TWO OF THE RULES ARE ONLY CORRECT BECAUSE OF WHERE THEY SIT.
 * SPECIFIC FAMILIES FIRST, GENERAL ONES AFTER: a trunk movement before anything that says `dip`, a
 * hamstring curl before anything that says `curl`, `triceps pushdown` before the pressing rule
 * claims it for the chest, `hip thrust` before the hinge rule claims it for the hamstrings.
 *
 * ⚠️ TWO BUGS LIVED HERE UNTIL 2026-08-22 AND BOTH WERE ORDERING, NOT VOCABULARY — see the comments
 * on the first two entries. Every entry names a movement family, not one movement, so the table
 * stays short.
 */
const RULES: Rule[] = [
  // ── ⛔ TRUNK FIRST, AND THAT ORDER IS A BUG FIX. `side plank with hip dip` was resolving to CHEST,
  //    because the pressing rule's `dip` matched before anything looked for `plank`. A trunk movement
  //    names itself unambiguously — plank, crunch, rollout — so it is tested before any rule whose
  //    vocabulary it can collide with. ⚠️ `tricep dips` and `dips` carry no trunk word and fall
  //    through to their own rules, which is what keeps this reorder safe.
  { re: /\b(plank|crunch|sit up|sit-up|situp|v up|v-up|ab wheel|rollout|leg raise|knee raise|woodchopper|pallof|russian twist|dead bug|bird dog|hollow|flutter|scissor|toes to bar|windshield)\b/, primary: 'core', secondary: [] },

  // ── ⛔ THE HAMSTRING CURL FAMILY BEFORE THE BICEPS CURL, AND THAT IS THE SECOND BUG FIX.
  //    `leg curl`, `nordic hamstring curl` and `band leg curl` all resolved to BICEPS. The biceps
  //    rule carried negative lookaheads for `leg` / `nordic` / `ham` and they could never fire: a
  //    lookahead only scans FORWARD from the match, and in "leg curl" the word `leg` sits BEHIND it.
  //    ⚠️ A guard that cannot see the thing it guards against is worse than no guard, because it
  //    reads as covered. The lookaheads are gone; ORDER does the work now.
  { re: /\b(leg curl|leg curls|hamstring curl|nordic|glute ham|glute-ham)\b/, primary: 'hamstrings', secondary: ['glutes'] },

  // ── arms: unambiguous words, several of which sit inside pressing names ───────────────────────
  { re: /\b(tricep|triceps|skull crusher|tate press|pushdown|pressdown|kickback)\b/, primary: 'triceps', secondary: [] },
  { re: /\b(curl|curls)\b/, primary: 'biceps', secondary: ['lats'] },

  // ── legs ──────────────────────────────────────────────────────────────────────────────────────
  { re: /\b(calf|calves|soleus|tibialis)\b/, primary: 'calves', secondary: [] },
  { re: /\b(hip thrust|glute bridge|clamshell|abduction|adduction)\b/, primary: 'glutes', secondary: ['hamstrings'] },
  /**
   * ⛔⛔ THE REVERSE HYPER IS GLUTE-DOMINANT, AND IT SITS ABOVE THE FAMILY SWEEP FOR THAT REASON
   * (Michael, ruled from field sources 2026-08-30; unblocked and applied 2026-08-31).
   *
   * The rule below claims the whole `hyper` family for the hamstrings, which is right for a good
   * morning, an RDL and a stiff-leg — a hinge with the feet planted and the hamstrings lengthening
   * under load. **The reverse hyper is the opposite arrangement:** the torso is fixed and the LEGS
   * swing, so it is hip extension from a hanging start and the glutes do the work, hamstrings
   * assisting. Filed under the family sweep it was reported as a hamstring movement, and the muscle
   * floor filled its glute slot with something else.
   *
   * ⚠️ ORDER IS THE WHOLE MECHANISM — this table is FIRST-MATCH. Placed after the sweep, this rule
   * is unreachable; placed here it takes the reverse hypers and leaves every other hinge alone.
   * That is the same reason `hip thrust` sits above the hinge rule two lines up.
   * ⚠️ IT COVERS THE LOADED TWIN TOO. `weighted reverse hyper` and the machine `reverse
   * hyperextension` are the same movement pattern with a different implement.
   */
  { re: /\breverse hyper/, primary: 'glutes', secondary: ['hamstrings'] },
  { re: /\b(back extension|hyperextension|hyper|good morning|romanian|rdl|stiff leg|stiff-leg)\b/, primary: 'hamstrings', secondary: ['glutes'] },
  { re: /\b(deadlift|swing|snatch|clean)\b/, primary: 'hamstrings', secondary: ['glutes', 'quadriceps'] },
  { re: /\b(leg extension|leg extensions|sissy)\b/, primary: 'quadriceps', secondary: [] },
  { re: /\b(squat|lunge|step up|leg press|hack|split squat|pistol)\b/, primary: 'quadriceps', secondary: ['glutes'] },

  // ── shoulders, before the pressing rule ───────────────────────────────────────────────────────
  { re: /\b(lateral raise|front raise|scaption|upright row|rear delt|reverse fly|reverse flye|ytw|y t w)\b/, primary: 'deltoids', secondary: [] },
  { re: /\b(overhead press|shoulder press|military|push press|arnold|handstand|pike push)\b/, primary: 'deltoids', secondary: ['triceps'] },

  // ── chest and back ────────────────────────────────────────────────────────────────────────────
  { re: /\b(fly|flye|flyes|flies|pec deck|crossover|chest press|bench press|push up|push-up|pushup|dip|dips)\b/, primary: 'chest', secondary: ['triceps', 'deltoids'] },
  { re: /\b(pull up|pull-up|pullup|chin up|chin-up|chinup|pulldown|pull down|pullover)\b/, primary: 'lats', secondary: ['biceps'] },
  { re: /\b(row|rows|face pull|pull apart)\b/, primary: 'lats', secondary: ['biceps'] },
];

/** The fall-through, from the pattern the app already keeps. Never a guess at a muscle name. */
const BY_PATTERN: Record<string, MuscleWork> = {
  horizontal_push: { primary: 'chest', secondary: ['triceps', 'deltoids'] },
  vertical_push: { primary: 'deltoids', secondary: ['triceps'] },
  horizontal_pull: { primary: 'lats', secondary: ['biceps'] },
  vertical_pull: { primary: 'lats', secondary: ['biceps'] },
  knee_dominant: { primary: 'quadriceps', secondary: ['glutes'] },
  hip_dominant: { primary: 'hamstrings', secondary: ['glutes'] },
  calf: { primary: 'calves', secondary: [] },
  core: { primary: 'core', secondary: [] },
};

/**
 * ⛔ WHICH MUSCLE A SET ON THIS MOVEMENT COUNTS TO.
 *
 * Returns `null` for a movement the catalogue does not hold — a set that cannot be attributed must
 * not be silently counted against a muscle it may not train.
 */
export function musclesWorkedBy(movementName: string): MuscleWork | null {
  const raw = String(movementName ?? '').trim();
  if (!raw) return null;
  if (!getExerciseConfig(raw)) return null;
  const key = foldExerciseName(raw);

  for (const rule of RULES) {
    if (rule.re.test(key)) return { primary: rule.primary, secondary: [...rule.secondary] };
  }
  const pattern = getExerciseConfig(raw)?.pattern;
  const fallback = pattern ? BY_PATTERN[pattern] : undefined;
  return fallback ? { primary: fallback.primary, secondary: [...fallback.secondary] } : null;
}

/**
 * The readiness ledger's spelling(s) for a group — the crosswalk, declared rather than assumed.
 *
 * ⚠️ `deltoids` IS THE ONE THAT IS NOT 1:1. `readiness-thresholds.ts` splits the deltoid into
 * anterior, lateral and posterior because a soreness ledger cares which head is sore. A weekly
 * volume count does not — *"8 to 12 sets per week per muscle group"* means the deltoid, not its
 * front third. Both readings are right for their own question; the map is where they meet.
 */
export const READINESS_KEYS: Record<MuscleGroup, string[]> = {
  chest: ['chest'],
  deltoids: ['anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid'],
  lats: ['lats', 'upper_back'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  quadriceps: ['quadriceps'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  calves: ['calves'],
  core: ['core', 'obliques'],
};
