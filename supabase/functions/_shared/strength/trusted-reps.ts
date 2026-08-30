/**
 * ⛔ THE TRUSTED-REP CEILING — HOW FAR AN e1RM ESTIMATE IS BELIEVED. D-417.
 *
 * ⚠️ THIS IS NOT PROGRAMMING, AND IT NEVER WAS. It lived inside the previous program module for historical
 * reasons only; nothing in it is anybody's method. It is a measurement-accuracy limit sourced to
 * LeSuer et al. 1997, Reynolds et al. 2006 and Mayhew et al. 2008, plus two numbers that are OURS
 * and are labelled as ours below.
 *
 * ⛔ MOVED HERE 2026-08-30 so the live strength path imports nothing from the archived the previous program module
 * (Michael: strength is Viada's now, and the old module is archived rather than deleted). The old
 * file re-exports these names so archived code still resolves — this file is the single definition.
 */

/**
 * ⛔ THE REP COUNT ABOVE WHICH THE ESTIMATE IS NOT TRUSTED — and it does NOT withhold the advance.
 *
 * Two facts point in opposite directions on a big set, and collapsing them is the mistake this
 * constant exists to prevent:
 *
 * - **Physiologically the athlete is stronger than the training max says.** Twelve reps at 95% means
 *   the number is too conservative, and that is the standard read. Withholding the advance would
 *   punish an athlete for outperforming the prescription.
 * - **But the e1RM computed off that set is in the range where the equation degrades.** Brzycki's
 *   accuracy is best at 3-5 reps and falls away above ~10: LeSuer et al. 1997 found accuracy improved
 *   markedly when restricted to 2-10 rep sets; Reynolds et al. 2006 found 5RM the best predictor with
 *   substantial degradation higher; Mayhew et al. 2008 put the boundary under 10 reps.
 *
 * So the number ADVANCES and the estimate is MARKED. See `advance_untrusted`.
 *
 * ⚠️ 8 IS OURS. The literature gives a degradation zone, not a line — best accuracy 3-5, clear
 * degradation above 10. Eight sits inside the defensible band with a margin, and it must be stated
 * as a product decision wherever it is published rather than attributed to any of the papers above.
 */
export const ESTIMATE_TRUSTED_MAX_REPS = 8;

/**
 * ⛔ DEADLIFT GETS LESS ROPE, AND THE ERROR IS DIRECTIONAL NOT RANDOM.
 *
 * LeSuer et al. 1997 (*JSCR* 11(4):211-213) tested seven equations across bench, squat and deadlift.
 * Correlations were uniformly high (r > 0.95) — and **every equation significantly UNDERESTIMATED the
 * deadlift.** That is a bias with a direction, not scatter.
 *
 * ⚠️ AND IT COMPOUNDS WITH OURS. Brzycki already tends to underestimate. Both push the same way, so a
 * deadlift e1RM is systematically low rather than merely uncertain. Five reps is the range Reynolds
 * et al. 2006 found best (R² = 0.993 bench), so trusting the estimate only that far is where the
 * evidence is strongest — for the one lift that needs it most.
 *
 * ⚠️ 5 IS OURS, like the 8 above. The literature gives the direction and the degradation zone; it does
 * not name a line for any individual lift.
 */
export const ESTIMATE_TRUSTED_MAX_REPS_DEADLIFT = 5;

/**
 * The rep count above which this lift's estimate stops being trusted.
 *
 * ⚠️ MATCHED ON THE LIFT NAME, deliberately kept to a substring test so it survives "Deadlift",
 * "Conventional Deadlift" and "Trap Bar Deadlift" alike. A lift that does not match gets the general
 * ceiling, which is the safe direction: a new lift added later is trusted no MORE than the others.
 */
export function trustedMaxRepsFor(liftName?: string | null): number {
  return /deadlift/i.test(String(liftName ?? ''))
    ? ESTIMATE_TRUSTED_MAX_REPS_DEADLIFT
: ESTIMATE_TRUSTED_MAX_REPS;
}
