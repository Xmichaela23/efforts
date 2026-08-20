/**
 * THE INVARIANT: a threshold effort is faster than an easy effort, by a ratio this app already
 * knows. One rule, one constant, one place — the run twin of the guard `learn-fitness-profile`
 * applies to its own candidates (2026-08-19).
 *
 * ⛔ WHY THIS EXISTS. A threshold pace slower than the athlete's own easy pace reached a real
 * screen (easy 12:35/mi, threshold 14:44/mi). The learner was fixed at the measurement site — it
 * now drops contaminated candidates and abstains rather than publish. But abstention hands the
 * question DOWN, and what waits below is a 5K time the athlete typed once, with nothing measuring
 * it and nothing dating it. A 5K goes stale as fitness changes, and a stale 5K prescribes a
 * threshold that is too FAST — in a strength-led block the more expensive error, because the
 * session stops being threshold and starts eating the lifting.
 *
 * ⛔ THIS IS NOT A GUARD PER CONTAMINATION SOURCE. Detecting a stale 5K, then a swapped field, then
 * a mistyped unit is four detectors and a fifth next month. **Threshold is faster than easy** is
 * true of every athlete in every sport, so it is stated ONCE as a bound and applied wherever a
 * threshold pace is inferred. It cannot know WHY a number is wrong, and does not need to.
 *
 * ⚠️ IT BOUNDS INFERENCES, NEVER ASSERTIONS. A number the athlete typed and a number the app
 * measured are both stronger evidence than a ratio; clamping either would be the app quietly
 * disagreeing with a person while showing them their own value, which is the lie D-285 exists to
 * kill. When an ASSERTED number crosses this bound the answer is to SAY SO — see the 5K retest
 * flag in `_shared/arc-context.ts` — not to edit it behind their back.
 *
 * ⚠️ THE WEAKNESS, AND IT MUST BE SAID ON SCREEN. The ratio assumes easy runs are run at genuine
 * easy pace. An athlete running extra-easy — heat, hills, discipline, coming back from illness —
 * derives a threshold that is too slow. Easy pace is partly a CHOICE; a race time is not. That is
 * why a derived threshold is labelled "worked out from your easy pace" everywhere it surfaces and
 * never presented as measured.
 *
 * No I/O. Pure functions. Importable from the React client AND Deno edge functions (the
 * `src/lib/session-frequency-defaults.ts` precedent), like the resolvers it serves.
 */

/**
 * ⛔ THE RATIO IS THE APP'S OWN, NOT A FOLK NUMBER. Measured off `PACE_TABLE` in
 * `generate-run-plan/effort-score.ts` — the Daniels/VDOT table the plan generator, the coach and
 * `_shared/endurance/pace-zones.ts` are all already parity-locked to — as `base ÷ steady` (easy
 * pace ÷ threshold pace) across all 21 rows:
 *
 *     vdot 30  1.1961      vdot 44  1.1911      vdot 58  1.1895
 *     vdot 32  1.1959      vdot 45  1.1905      vdot 60  1.1903
 *     vdot 34  1.1915      vdot 46  1.1898      vdot 65  1.1908
 *     vdot 36  1.1933      vdot 48  1.1904      vdot 70  1.1929
 *     vdot 38  1.1907      vdot 50  1.1880      vdot 75  1.1885
 *     vdot 40  1.1914      vdot 52  1.1906      vdot 80  1.1909
 *     vdot 42  1.1915      vdot 54  1.1897
 *
 * Range 1.1880 … 1.1961 — a spread of **0.69%** from a 30-vdot beginner to an 80-vdot elite. That
 * is the whole reason a single constant is defensible here rather than a table lookup: the error a
 * flat 1.19 introduces is under a third of the ±4% the app ALREADY treats as noise
 * (`RUN_PACE_DIVERGENCE_THRESHOLD`, `generate-combined-plan/science.ts:34`). A lookup would add a
 * VDOT dependency — and therefore a 5K dependency — to the one derivation whose entire purpose is
 * to not need the 5K.
 *
 * ⛔ DO NOT TUNE THIS. It is a property of the pace table, not of any athlete. If the pace table
 * changes, re-measure it from the table; do not adjust it because a number looked wrong on one
 * person's screen.
 */
export const EASY_TO_THRESHOLD_PACE_RATIO = 1.19;

/**
 * ⛔ THE BOUND CARRIES THE APP'S EXISTING ±4% TOLERANCE, AND IT IS NOT A SECOND CONSTANT — it is
 * `RUN_PACE_DIVERGENCE_THRESHOLD` from `generate-combined-plan/science.ts`, imported. That number
 * was chosen deliberately, at spec level (D-033), for exactly this question: how far two readings of
 * an athlete's pace may differ before the difference is signal rather than noise.
 *
 * ⛔ AND IT IS LOAD-BEARING, NOT DECORATION — a fixture sweep across four athletes caught it. Without
 * the tolerance the bound compares against a flat 1.19 while the pace table's own ratio runs
 * 1.188..1.196, so an athlete at the SLOW end of the table (true ratio 1.196) had their perfectly
 * fresh, perfectly coherent 5K judged implausible by three seconds per mile — replaced, and then
 * told on screen that the number was "worked out from your easy pace" when their 5K had been right
 * all along. A bound tighter than the table it was measured from will always do that.
 *
 * The 0.69% table spread sits well inside 4%, so the tolerance absorbs it with room over.
 */
const BOUND_TOLERANCE = RUN_PACE_DIVERGENCE_THRESHOLD;

import { RUN_PACE_DIVERGENCE_THRESHOLD } from '../../supabase/functions/generate-combined-plan/science.ts';

/**
 * Sanity band for a derived threshold pace, sec/MILE. Deliberately the SAME band the 5K resolver
 * uses for a pace (`resolve-current-5k-pace.ts:PACE_SANE_SEC_PER_MI`) so the app holds one opinion
 * about what a running pace can be: 3:00/mi is below any human, 20:00/mi is not running.
 *
 * A derivation that lands outside it is not clamped INTO it — it is refused. A number we would not
 * accept from a reader is not a number we may invent as a writer.
 */
const DERIVED_SANE_SEC_PER_MI = { min: 180, max: 1200 };

/**
 * The threshold pace implied by a MEASURED easy pace, in the same unit it was given.
 *
 * Unit-agnostic on purpose: the ratio is dimensionless, so sec/mi in gives sec/mi out and sec/km in
 * gives sec/km out. The band check is sec/MILE, so it is applied by the sec/mi entry point only —
 * `deriveThresholdFromEasySecPerKm` converts and defers to it rather than carrying a second band.
 *
 * Returns null when the input is absent or unusable. Never 0, never a literal (D-285).
 */
export function deriveThresholdFromEasySecPerMi(easySecPerMi: number | null | undefined): number | null {
  if (easySecPerMi == null || !Number.isFinite(easySecPerMi) || easySecPerMi <= 0) return null;
  const derived = Math.round(easySecPerMi / EASY_TO_THRESHOLD_PACE_RATIO);
  if (derived < DERIVED_SANE_SEC_PER_MI.min || derived > DERIVED_SANE_SEC_PER_MI.max) return null;
  return derived;
}

/**
 * THE BOUND. The fastest a threshold pace may plausibly be for an athlete whose easy pace we have
 * MEASURED, in sec/MILE — so a LARGER number, because pace-seconds run backwards from speed.
 *
 * ⚠️ IT IS A FLOOR IN SECONDS AND A CEILING IN SPEED, and this codebase has been bitten by that
 * inversion before. `thresholdFloorSecPerMi` returns the MINIMUM number of seconds per mile a
 * threshold prescription may carry. A candidate BELOW it is too fast.
 *
 * Identical arithmetic to `deriveThresholdFromEasySecPerMi` — same number, different job, and named
 * for the job so a caller reading `Math.max(candidate, floor)` can see what it is doing. There is
 * no second constant and no second rounding.
 */
export function thresholdFloorSecPerMi(easySecPerMi: number | null | undefined): number | null {
  return deriveThresholdFromEasySecPerMi(easySecPerMi);
}

/**
 * Hold an INFERRED threshold pace to the band a measured easy pace implies, sec/MILE. Returns the
 * candidate unchanged when it is plausible, the derivation when it is not, and the candidate
 * untouched when there is no measured easy pace to judge it against.
 *
 * ⛔ ONE PREDICATE, ONE BAND, TWO EDGES — NOT TWO GUARDS. The question asked here is a single one:
 * *is this a plausible threshold pace for someone whose easy pace we have measured?* It has two
 * edges because a band does, and neither edge is a detector for a particular way of being wrong:
 *
 *   · **slower than `easy` itself** — not a threshold reading at all. A threshold effort is faster
 *     than an easy effort for every athlete in every sport. This is the SAME comparison
 *     `learn-fitness-profile` applies to its own candidates (STEP 5b), applied at the second site
 *     where a threshold pace is chosen rather than measured. Same invariant, not a second one.
 *   · **faster than `easy ÷ 1.19`** — faster than the pace table says that easy pace can support.
 *     Bounded rather than trusted because this direction is genuinely AMBIGUOUS: it is what a stale
 *     5K looks like, and it is equally what an athlete running deliberately extra-easy looks like.
 *     The conservative reading is the safe one — a threshold prescribed too fast in a strength-led
 *     block stops being threshold and starts eating the lifting.
 *
 * ⚠️ BETWEEN THE EDGES, THE CANDIDATE STANDS. A 5K coherent with the athlete's own easy running is
 * the sharper anchor and is not touched — a race time is a PERFORMANCE, and easy pace is partly a
 * choice. The band only fires on a 5K the recent running contradicts.
 *
 * ⛔ NO FABRICATION WHEN EASY IS UNKNOWN. With no measured easy pace there is no reference, and
 * inventing one — a fraction of threshold HR pace, a percentage of the 5K — would be exactly the
 * fabrication LAW 2 deleted from `learn-fitness-profile`. The candidate passes through unjudged and
 * the caller's own honesty about its source is the only guard. That is the honest position, not a
 * gap.
 *
 * ⛔ INFERENCES ONLY. Do not route a learned/measured value or an athlete's typed value through
 * this. See the file header.
 */
export function boundInferredThresholdSecPerMi(
  candidateSecPerMi: number | null | undefined,
  easySecPerMi: number | null | undefined,
): { sec_per_mi: number | null; replaced: boolean } {
  const candidate =
    candidateSecPerMi != null && Number.isFinite(candidateSecPerMi) && candidateSecPerMi > 0
      ? Math.round(candidateSecPerMi)
      : null;
  if (candidate == null) return { sec_per_mi: null, replaced: false };

  const derived = deriveThresholdFromEasySecPerMi(easySecPerMi);
  if (derived == null) return { sec_per_mi: candidate, replaced: false };

  // Pace-seconds run backwards from speed: LARGER is slower. The plausible band is
  // `derived <= candidate < easy` — at least as slow as the ratio allows, and still faster than easy.
  const easy = Math.round(easySecPerMi as number);
  // The fast edge carries the ±4% tolerance because the ratio behind it is an approximation of a
  // table with its own spread. The SLOW edge does not: "a threshold effort is faster than an easy
  // effort" is not an approximation of anything, and a tolerance on it would re-admit exactly the
  // reading this whole invariant exists to refuse.
  const fastEdge = derived * (1 - BOUND_TOLERANCE);
  const plausible = candidate >= fastEdge && candidate < easy;
  return plausible ? { sec_per_mi: candidate, replaced: false } : { sec_per_mi: derived, replaced: true };
}
