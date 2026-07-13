/**
 * RUN EASY-HR BAND — the ONE definition of "is this heartbeat easy for this athlete".
 *
 * Spec: docs/DESIGN-run-easy-pace-truth.md · Q-169.
 *
 * WHY THIS EXISTS. Before it, "easy" was defined in FIVE places that did not agree:
 *   learn-fitness-profile:610  run easy HR    -> observedMaxHR * 0.75
 *   learn-fitness-profile:706  run easy PACE  -> observedMaxHR * 0.75
 *   learn-fitness-profile:870  BIKE easy HR   -> 65-75% max + power filter   (WORKS — untouched)
 *   compute-facts:1042         per-sample gate-> thresholdHR * 0.78
 *   coach:2086                 HR bins        -> run_threshold_hr.value      (already correct)
 *
 * The consequence, measured on real data (user 45d122e7): the 75%-of-max ceiling is 130.5 bpm; the
 * athlete's genuine easy runs (RPE 2-3) sit at 133-141 bpm. **0 of 77 runs qualified.** The easy-pace
 * learner could never fire, so `learned_fitness.run_easy_pace_sec_per_km` stayed null forever, so the
 * D-033 pace reconciler (which needs it) never ran, so the app could not notice the athlete had
 * detrained — and prescribed against a pace he had not run in 77 recorded runs.
 *
 * ⚠ THE BIKE IS NOT BROKEN AND IS NOT ROUTED THROUGH HERE. Its 65-75%-of-max band finds rides fine
 * (bike easy HR learned: 130 bpm = 74% of bike max, 6 rides, high confidence). Running HR sits 5-10 bpm
 * ABOVE cycling at the same perceived effort (upright posture, more active muscle mass, weight-bearing),
 * which is exactly why one %max band works for the bike and locks the run out. Do not "unify" them.
 *
 * ── THE ANCHOR (ruled by Michael 2026-07-12, grounded in the field, NOT in his numbers) ──
 * THRESHOLD-first, %max as the cold-start bootstrap. Best anchor available, always, and it declares
 * which one it used (Law 3 — confidence travels with the number).
 *
 *   · LTHR known  -> Friel run zones. Z1 <85% LTHR, Z2 85-89% LTHR. Easy = at or below the Z2 ceiling.
 *   · LTHR absent -> %max band 65-80%. NOT a 75% ceiling: MyProCoach and Garmin both top the aerobic
 *                    band at 80%. A day-one athlete is bootstrapped, not stranded (the Garmin model:
 *                    seed with the available anchor, upgrade the moment the good one is earned).
 *   · Neither     -> null. We do not know. Say so; do not invent (Law 2).
 *
 * Field receipts (researched + adversarially verified 2026-07-12; full citations in the design doc §9):
 *   · Friel, verbatim: "Do not use 220 minus your age to find max heart rate as this is as likely to be
 *     wrong as right." TrainingPeaks' largest and DEFAULT zone family is threshold-anchored.
 *   · NO shipped app uses an HR CEILING to qualify an easy run. COROS — the only vendor that publishes
 *     its gates — uses an intensity FLOOR (the run must be hard ENOUGH to count).
 *   · Where schemes do express aerobic in %max, the ceiling is 80%, not 75% (MyProCoach; Garmin).
 *   · Max HR is a one-way ratchet: a single strap artefact poisons every derived zone permanently.
 *     COROS documents this exact failure and tells users to fix the anchor by hand.
 *   · This app ALREADY chose threshold — the Baselines screen renders "Friel %LTHR". The learner simply
 *     never followed its own zones screen.
 */

/** Friel run Z2 ceiling — the top of easy/aerobic. Z1 <85% LTHR, Z2 85-89%; above 89% is Z3 (not easy). */
export const EASY_CEILING_PCT_LTHR = 0.89;
/** Floor: below this is a walk / a stop / a broken strap, not an easy run. */
export const EASY_FLOOR_PCT_LTHR = 0.70;
/** Cold-start bootstrap: the field's aerobic ceiling is 80% of max — NOT the 75% that starved this. */
export const EASY_CEILING_PCT_MAXHR = 0.80;
/** Cold-start floor: below 65% of max is recovery/commute territory (mirrors the working bike band). */
export const EASY_FLOOR_PCT_MAXHR = 0.65;

export type EasyHrAnchor = 'lthr' | 'max_hr' | 'none';

export interface EasyHrBand {
  /** inclusive upper bound, bpm. null when we cannot honestly judge. */
  ceiling: number | null;
  /** inclusive lower bound, bpm. null when we cannot honestly judge. */
  floor: number | null;
  anchor: EasyHrAnchor;
  /** Confidence of the ANCHOR we used — travels to the surface (Law 3). */
  confidence: 'high' | 'medium' | 'low' | null;
  /** Plain-English provenance for the receipt/glass box. */
  basis: string;
}

const UNKNOWN: EasyHrBand = {
  ceiling: null, floor: null, anchor: 'none', confidence: null,
  basis: 'no threshold HR and no observed max HR — easy cannot be judged',
};

function readMetric(lf: Record<string, unknown> | null | undefined, key: string): { value: number; confidence: 'high' | 'medium' | 'low' | null } | null {
  const raw = (lf as any)?.[key];
  if (raw == null) return null;
  const v = typeof raw === 'object' ? Number((raw as any).value) : Number(raw);
  if (!Number.isFinite(v) || !(v > 0)) return null;
  const c = typeof raw === 'object' ? String((raw as any).confidence ?? '') : '';
  return { value: v, confidence: (c === 'high' || c === 'medium' || c === 'low') ? c : null };
}

/**
 * The one definition. Threshold-first, %max bootstrap, honest null.
 *
 * @param learnedFitness `user_baselines.learned_fitness` (keys are TOP-LEVEL: `run_threshold_hr`,
 *   `run_max_hr_observed`). NOTE: `learned_fitness.running.threshold_hr` does NOT exist — reading that
 *   nested path is the dead lookup that starved `compute-facts.pace_at_easy_hr` on 147 of 147 runs.
 * @param manualThresholdHr optional override (`performance_numbers.threshold_heart_rate`).
 */
export function resolveRunEasyHrBand(
  learnedFitness: Record<string, unknown> | null | undefined,
  manualThresholdHr?: number | null,
): EasyHrBand {
  const lthr = readMetric(learnedFitness, 'run_threshold_hr')
    ?? (Number.isFinite(Number(manualThresholdHr)) && Number(manualThresholdHr) > 0
      ? { value: Number(manualThresholdHr), confidence: null as 'high' | 'medium' | 'low' | null }
      : null);

  if (lthr) {
    return {
      ceiling: Math.round(lthr.value * EASY_CEILING_PCT_LTHR),
      floor: Math.round(lthr.value * EASY_FLOOR_PCT_LTHR),
      anchor: 'lthr',
      confidence: lthr.confidence,
      basis: `Friel Z2 — at or below ${Math.round(EASY_CEILING_PCT_LTHR * 100)}% of your threshold HR (${Math.round(lthr.value)} bpm)`,
    };
  }

  // Bootstrap. Available on day one; upgraded the moment a threshold effort is logged.
  const max = readMetric(learnedFitness, 'run_max_hr_observed');
  if (max) {
    return {
      ceiling: Math.round(max.value * EASY_CEILING_PCT_MAXHR),
      floor: Math.round(max.value * EASY_FLOOR_PCT_MAXHR),
      anchor: 'max_hr',
      // Never better than 'low': an observed max is a ratchet, not a measurement (Law 3).
      confidence: 'low',
      basis: `estimated — ${Math.round(EASY_FLOOR_PCT_MAXHR * 100)}-${Math.round(EASY_CEILING_PCT_MAXHR * 100)}% of your observed max HR (${Math.round(max.value)} bpm); firms up once a threshold effort is logged`,
    };
  }

  return UNKNOWN;
}

/** Is this heart rate an EASY one for this athlete? `null` band -> null (unknown), never a guess. */
export function isEasyHr(hr: number | null | undefined, band: EasyHrBand): boolean | null {
  if (band.ceiling == null || band.floor == null) return null;
  const v = Number(hr);
  if (!Number.isFinite(v) || !(v > 0)) return null;
  return v >= band.floor && v <= band.ceiling;
}
