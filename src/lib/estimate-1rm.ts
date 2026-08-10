/**
 * ESTIMATED 1RM — ONE FORMULA, ONE PLACE (D-339, 2026-07-30, Michael's call: *"use wendler"*).
 *
 * ⛔ WHY THIS FILE EXISTS: the app had THREE answers to "what is this set worth as a one-rep max."
 *
 *   1. `compute-facts/index.ts` — Brzycki, `w × 36/(37 − reps)`, reps capped at 30. Runs on EVERY
 *      logged session and writes `exercise_log.estimated_1rm`, which is the substrate for the State
 *      strength trend, the per-lift verdict and the learned max.
 *   2. `StrengthLogger.tsx` — a CLUSTER of Epley and Brzycki averaged together, reps capped at 10.
 *      Runs on the baseline test, and writes the number the whole block's working weights derive from.
 *   3. Wendler's own, page 32 of the 2nd edition — `weight × reps × 0.0333 + weight`.
 *
 * So the number that SET the working weights and the number that JUDGED the work against them came
 * from different equations. That is a Constitution Law 1 violation on the most load-bearing number in
 * the strength system, and it is invisible because each site looks reasonable on its own.
 *
 * ⛔ WENDLER'S FORMULA IS EPLEY, EXACTLY. `w × r × 0.0333 + w` is `w × (1 + r/30)` — his 0.0333 is
 * 1/30 to four figures. This is not an interpretation; the book states the arithmetic and works two
 * examples with it (p32: *"255 x 8 x .0333 + 255 = 322"*).
 *
 * ⛔ WHY THE SWITCH, GIVEN `compute-facts` CARRIED AN EXPLICIT "DO NOT SWITCH" NOTE.
 *
 * That note's reasoning was: *"Brzycki tends to UNDERESTIMATE and Epley to OVERESTIMATE, and for a
 * number that sets an athlete's next working load, erring low is the safe direction."* The reasoning
 * is sound and the premise is only HALF TRUE — it holds below ten reps and inverts above:
 *
 *   | reps | Brzycki | Epley/Wendler |            |
 *   |------|---------|---------------|------------|
 *   | 5    | ×1.125  | ×1.167        | Brzycki lower — the note's case holds |
 *   | 10   | ×1.333  | ×1.333        | ⛔ they are IDENTICAL here |
 *   | 15   | ×1.636  | ×1.500        | Brzycki HIGHER — the note's case reverses |
 *   | 20   | ×2.118  | ×1.666        | Brzycki runs away |
 *
 * Brzycki has `37 − reps` in a denominator, so it climbs toward a singularity; Epley is linear. The
 * all-out set is the one place reps are deliberately open-ended, so the high-rep range is exactly
 * where this number lives — and there Brzycki is the AGGRESSIVE one. Switching therefore serves the
 * note's own stated goal (err low where it matters) while ending the three-way split.
 *
 * ⚠️ WHAT IS NOT CLAIMED: that Epley is the more accurate equation. The literature conflicts by
 * population and lift, and LeSuer et al. (1997, JSCR 11(4):211-213) found EVERY tested equation
 * significantly underestimates a deadlift 1RM. This is a product decision about which way to be wrong
 * and whose arithmetic the athlete's own program is written in — not an accuracy claim.
 *
 * ⚠️ AND NO EQUATION IS RELIABLE FAR ABOVE TEN REPS. That is not solved here. It is carried as
 * PROVENANCE: `trustedMaxRepsFor` / `advance_untrusted` in `shared/strength-system/loading/wendler-531.ts`
 * already draw that line at 8 reps (5 on deadlift). The estimate is computed honestly and flagged,
 * never silently capped — a capped rep count would quietly report a 15-rep set as a 10-rep one, which
 * is a fabricated number wearing a measured number's clothes (Law 2).
 */

/**
 * Wendler's coefficient, p32. Identical to Epley's 1/30 (0.03333…) to four significant figures.
 * ⛔ Do not "clean this up" to 1/30 — the book prints 0.0333 and the athlete can check our arithmetic
 * against his own copy.
 */
export const WENDLER_EPLEY_COEFF = 0.0333;

/**
 * Estimated 1RM from a completed set.
 *
 * @param weight  load on the bar
 * @param reps    reps actually completed
 * @param rirOffset reps left in reserve, when the protocol collects it. Treats leftover capacity as
 *   completed work so a non-failure set still estimates. ⚠️ Zero on any protocol that does not collect
 *   RIR (5/3/1) — there, a phantom offset would inflate every sub-maximal week. See `protocolUsesRir`.
 * @returns the estimate, UNROUNDED. Callers round for their own surface; rounding is presentation,
 *   the formula is the claim.
 */
export function estimate1RM(weight: number, reps: number, rirOffset = 0): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const effectiveReps = Math.max(1, Math.round((Number(reps) || 0) + (Number(rirOffset) || 0)));
  // A true single IS the max — no equation needed, and every equation adds a few pounds to one rep.
  if (effectiveReps === 1) return weight;
  return weight * effectiveReps * WENDLER_EPLEY_COEFF + weight;
}

/**
 * ⛔ THE INVERSE — the weight that yields `reps` from a known 1RM. Lives HERE, beside the forward
 * direction, because it is the same claim read backwards: `estimate1RM` is `w × (1 + r × 0.0333)`,
 * so this is `e1RM ÷ (1 + r × 0.0333)`. Re-deriving that algebra at a call site would be a second
 * copy of Wendler's coefficient, and the next session would have two places to fix it.
 *
 * ⚠️ THIS IS NOT A PRESCRIPTION AND MUST NOT BECOME ONE. It exists so a SUGGESTION can be derived
 * without inventing a percentage — the alternative was picking a number like "65% of the accessory's
 * max", which is exactly the fabricated intensity `materialize-plan` strips on sight. Wendler's own
 * formula is the only anchor in the system that is not made up.
 *
 * @param oneRM   the max to work back from
 * @param reps    the target rep count
 * @param rir     reps left in reserve. ⚠️ Passing 2 asks "what could I lift for `reps` with two left
 *   in the tank", which is the assistance instruction ("a few reps left, never to failure") stated
 *   as arithmetic rather than as a percentage somebody chose.
 */
export function weightForReps(oneRM: number, reps: number, rir = 0): number {
  if (!Number.isFinite(oneRM) || oneRM <= 0) return 0;
  const effectiveReps = Math.max(1, Math.round((Number(reps) || 0) + (Number(rir) || 0)));
  if (effectiveReps === 1) return oneRM;
  return oneRM / (1 + effectiveReps * WENDLER_EPLEY_COEFF);
}

/** The stored/displayed form: nearest 5 lb, matching how plates actually load. */
export function estimate1RMRounded(weight: number, reps: number, rirOffset = 0): number {
  const raw = estimate1RM(weight, reps, rirOffset);
  if (raw <= 0) return 0;
  return Math.round(raw / 5) * 5;
}

/**
 * ⛔ THE OTHER HALF OF WENDLER'S POINT, AND THE ONE HE ACTUALLY CARES ABOUT (p10).
 *
 * *"If your squat goes from 225x6 to 225x9, you've gotten stronger. Don't get stuck just trying to
 * increase your one rep max. If you keep breaking your rep records, it'll go up."*
 *
 * The estimate exists to compare sets at DIFFERENT weights (p32's worked example is exactly that:
 * is 255x8 better than 270x3?). At the SAME weight it adds nothing a rep count does not already say,
 * and it adds an equation's error on top. So a surface comparing like for like should compare reps.
 */
export function isRepRecord(weight: number, reps: number, priorRepsAtSameWeight: number | null | undefined): boolean {
  if (!Number.isFinite(weight) || weight <= 0) return false;
  if (priorRepsAtSameWeight == null || !Number.isFinite(priorRepsAtSameWeight)) return false;
  return (Number(reps) || 0) > Number(priorRepsAtSameWeight);
}
