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
 * ⛔ WHERE BRZYCKI STOPS BEING ARITHMETIC. `36/(37 − reps)` climbs toward a singularity at 37 and is
 * negative beyond it. 30 is the last rep count at which it still returns a finite, positive, sane
 * multiplier (×6), so the average falls back to Epley alone above it.
 */
export const BRZYCKI_MAX_REPS = 30;

/**
 * Estimated 1RM from a completed set — PURE: weight and the reps that go into the estimate, nothing else.
 *
 * ⛔ NO RIR HERE, EVER. Reps-in-reserve is a property of the PROTOCOL, not of this formula. A protocol
 * that stops short of failure converts its reserve to an effective rep count with `effectiveRepsForReserve`
 * and passes THAT in. The estimator never sees a reserve, so it can never silently inflate a set that was
 * taken to failure — which is 5/3/1's whole shape, and it no longer depends on a suppression flag to be
 * safe: there is simply no argument through which a reserve could reach the formula. See that helper.
 *
 * @param weight  load on the bar
 * @param reps    reps that go into the estimate — actual reps, or effective reps for an auto-regulated set
 * @returns the estimate, UNROUNDED. Callers round for their own surface; rounding is presentation,
 *   the formula is the claim.
 */
export function estimate1RM(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const r = Math.max(1, Math.round(Number(reps) || 0));
  // A true single IS the max — no equation needed, and every equation adds a few pounds to one rep.
  if (r === 1) return weight;

  /**
   * ⛔⛔ VIADA'S OWN METHOD, p215 (2026-08-29, Michael: *"wendler is a ghost in the machine, use
   * viada's math"*). The final set's load and reps go through BOTH Epley and Brzycki and the two are
   * AVERAGED — his stated reason is that **the formulas diverge as the rep count changes**, so
   * neither alone is trustworthy across the range his pretest produces.
   *
   * ⚠️ THIS REPLACES EPLEY-ALONE, which was here as WENDLER's arithmetic (his p32 coefficient) so a
   * 5/3/1 athlete could check the app against his own copy. That reason stands only while Wendler is
   * the source; this app's programme is composed from Viada.
   * ⚠️ ON THIS ATHLETE'S OWN SETS THE MOVE IS SMALL AND THAT IS EXPECTED: 135×10 is 180 either way
   * (the two equations cross near ten reps); 105×5 goes 122.5 → 120.3. The divergence Viada is
   * guarding against opens up further out, which is exactly where an average beats a pick.
   *
   * ⛔ BRZYCKI HAS A SINGULARITY AT 37 REPS — `36/(37−r)` runs to infinity and then goes NEGATIVE.
   * Past 30 reps it is not a large estimate, it is not an estimate, so the average falls back to
   * Epley alone there. ⚠️ This is a guard on arithmetic, NOT a judgement about long sets: that is
   * `trustedMaxReps`'s job and it is unchanged.
   */
  const epley = weight * r * WENDLER_EPLEY_COEFF + weight;
  if (r > BRZYCKI_MAX_REPS) return epley;
  const brzycki = weight * 36 / (37 - r);
  return (epley + brzycki) / 2;
}

/**
 * ⛔ VIADA'S WORKING MAX — p215: *"roughly 96% of that predicted true 1RM."*
 *
 * ⚠️ IT IS NOT WENDLER'S TRAINING MAX AND THE TWO MUST NEVER CONVERT INTO EACH OTHER. Wendler's is
 * 85% of a true 1RM and has its own live readers (`plans.config.training_max`); Viada's is 96% of a
 * freshly tested predicted max. Same English word, two different numbers, two different programmes.
 * No function may accept both — see Part H of the source record.
 */
export const VIADA_WORKING_MAX_FRACTION = 0.96;

export function viadaWorkingMax(predicted1RM: number): number {
  const v = Number(predicted1RM);
  return Number.isFinite(v) && v > 0 ? v * VIADA_WORKING_MAX_FRACTION : 0;
}

/**
 * Effective rep count for a set stopped SHORT of failure — the ONLY place reps-in-reserve touches the
 * 1RM path, and it lives OUTSIDE the estimator on purpose. A set of `reps` with `rir` left in the tank
 * estimates like a set of `reps + rir` taken to failure, so its e1RM is
 * `estimate1RM(weight, effectiveRepsForReserve(reps, rir))`.
 *
 * ⛔ THIS IS FOR THE AUTO-REGULATED PROTOCOLS THAT WILL EXIST, NOT FOR 5/3/1. 5/3/1 and any protocol
 * whose measuring set is taken to failure pass ACTUAL reps straight to `estimate1RM` and never call this.
 * A protocol opts IN by calling it — gate on `protocolUsesRir` / `protocolEffortRead` first. Because the
 * estimator is pure, forgetting to call this can only ever UNDERSTATE a reserve set, never inflate a
 * failure set — the safe direction, and the reverse of the old default.
 */
export function effectiveRepsForReserve(reps: number, rir: number): number {
  return Math.max(1, Math.round((Number(reps) || 0) + (Number(rir) || 0)));
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
export function estimate1RMRounded(weight: number, reps: number): number {
  const raw = estimate1RM(weight, reps);
  if (raw <= 0) return 0;
  return Math.round(raw / 5) * 5;
}

/**
 * The rep ceiling under which a set's estimated 1RM is trustworthy. Above it the estimate inflates with
 * reps (the formulas are validated to ~10 reps, best 2–6; a 25-rep set does not describe a 1RM), so any
 * RECORD or TREND built on it is really a rep count in disguise — which is why "best"/summary/sparkline
 * read only sets AT OR UNDER this ceiling. The estimate is still COMPUTED and shown per set (D-339, never
 * capped); this only decides what counts as a strength reading.
 *
 * ⚠️ SINGLE-VALUE SOURCE, MIRRORED: `wendler-531.ts`'s `trustedMaxRepsFor` carries the science provenance
 * (LeSuer et al. 1997 — deadlift estimates run systematically low, so its ceiling is tighter). Same
 * numbers (deadlift 5, else 8); keep the two in sync, or unify by having wendler delegate here.
 */
export function trustedMaxReps(liftName?: string | null): number {
  return /deadlift/i.test(String(liftName ?? '')) ? 5 : 8;
}

/** Is this set's estimated 1RM trustworthy for a record/trend (reps within the ceiling for the lift)? */
export function estimateIsTrusted(liftName: string | null | undefined, reps: number | null | undefined): boolean {
  const r = Number(reps);
  return Number.isFinite(r) && r > 0 && r <= trustedMaxReps(liftName);
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
