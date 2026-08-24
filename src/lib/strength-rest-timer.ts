/**
 * HOW LONG THE REST TIMER RUNS, per movement and rep count.
 *
 *   Extracted from `StrengthLogger.tsx` (2026-08-03) for the reason every other extraction in this
 *   app happened: a function living inside a 6,000-line component cannot be unit-run, so the rest
 *   length was never asserted anywhere. Same move as `strength-row-text.ts` and
 *   `strength-logging-mode.ts` — see their headers for the precedent (D-259).
 *
 * ⛔ THE MAIN-LIFT TEST IS THE SHARED ONE NOW, AND KILLING THE PRIVATE COPY IS THE POINT.
 * `StrengthLogger` carried its own `isMainCompound`:
 *
 *     /squat|deadlift|bench|overhead|ohp/.test(n) && !/goblet|bulgarian|split|romanian|sumo|stiff|jump/.test(n)
 *
 * — the SEVENTH private exercise classifier in the codebase (audit F5 counted six). It disagreed with
 * `MAIN_531_LIFTS` at the edges, and the disagreements were not cosmetic: **Push Press and Military
 * Press matched none of those words**, so two of the app's own main lifts rested like accessories —
 * 90 seconds instead of three minutes. It also excluded `sumo` outright, so a Sumo Deadlift, which
 * IS in the main-lift set, took accessory rest.
 *
 * ⚠️ AND IT CUTS THE OTHER WAY TOO. `/bench/` matched DB, incline and decline bench presses, which
 * are assistance in 5/3/1 and now take assistance rest. That is the classifier being right, not a
 * regression — but it is a visible change and it is listed in the fixtures.
 *
 * ⚠️ THE PLYO TEST IS STILL A PRIVATE REGEX and is transcribed here BYTE-FOR-BYTE rather than moved
 * onto the type axis. Deliberate scope line: `typeForExercise` would answer `loaded_accessory` for
 * "Explosive Step Up", which the regex currently calls plyometric, and changing that is a second
 * behaviour change nobody asked for. It is the eighth private list and it is still open — but it now
 * has ONE home instead of two, since the component imports it from here.
 */
import { isMain531Lift } from './exercise-role.ts';

/**
 * Plyometric / explosive movement — needs full neural recovery between sets.
 * ⚠️ Transcribed unchanged from `StrengthLogger.tsx`. See the header for why it is not the type axis.
 */
export const isPlyometricMovement = (exerciseName: string): boolean => {
  const name = String(exerciseName || '').toLowerCase();
  // ⛔ `skip|shuffle|ladder drill|stiff legged run` ADDED 2026-08-24 for Viada's named drills (p227).
  // His own rule for them is *"ample rest"* and stopping on movement quality, so a skip that routed
  // to the 90-second default was being rested like an accessory. Mirrors `equipmentForExercise` and
  // `isBodyweightMove`, extended in the same change.
  // ⚠️ THIS ONE ONLY LOWERCASES — hyphens survive, so the stems are spelt with them.
  return /jump|bound|hop|box jump|bench jump|broad jump|depth jump|squat jump|tuck jump|split jump|plyo|skip|shuffle|ladder drill|stiff-legged|explosive/.test(name);
};

/**
 * ⛔ THE HEAVY MAIN-LIFT REST IS 3 MINUTES (2026-08-03, raised from 150s).
 *
 * Three minutes is the strength standard for near-maximal work: the NSCA prescribes 2-5 min between
 * sets for strength/power, and the phosphagen system — which fuels a set of 3-5 — is only ~85%
 * resynthesised at two minutes and effectively complete around three. 150s sat below the band's
 * midpoint for the heaviest sets in the block, which is the one place under-resting costs reps on the
 * NEXT set, and in 5/3/1 the next set is the one being measured.
 *
 * ⚠️ ONLY THE 3-5 REP MAIN CASE MOVES. The 6-8 band stays 120s (a rep range that is not near-maximal),
 * plyometrics stay 150s, and every accessory band is untouched.
 */
export const HEAVY_MAIN_REST_SEC = 180;

/** Rest in SECONDS. Driven by the movement and the reps actually logged, not by the plan. */
export function calculateRestTime(exerciseName: string, reps: number | undefined): number {
  if (!reps || reps === 0) return 90; // Default 90 seconds

  // Plyometrics need full recovery between sets (2-3 min)
  if (isPlyometricMovement(exerciseName)) {
    return 150; // 2:30 for neural recovery
  }

  // ⛔ THE SHARED CLASSIFIER. One set, two readers — the same one the State row, the bar-speed cue and
  // the AMRAP verdict all gate on.
  if (isMain531Lift(exerciseName)) {
    // Main lifts:
    // 3-5 reps: 180 sec (3:00) — near-maximal, see HEAVY_MAIN_REST_SEC
    // 6-8 reps: 120 sec (2:00)
    if (reps >= 3 && reps <= 5) return HEAVY_MAIN_REST_SEC;
    if (reps >= 6 && reps <= 8) return 120;
    // Default for main lifts outside range
    return 120;
  }

  // Accessories:
  // 6-10 reps: 90 sec (1:30)
  // 10-15 reps: 75 sec (1:15)
  // 15+ reps or time-based: 60 sec (1:00)
  if (reps >= 6 && reps < 10) return 90;
  if (reps >= 10 && reps < 15) return 75;
  if (reps >= 15) return 60;
  // Default for accessories outside range
  return 90;
}
