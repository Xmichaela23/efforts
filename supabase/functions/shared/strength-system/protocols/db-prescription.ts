// ============================================================================
// DB-tier prescription helper (docs/STRENGTH-PROTOCOL.md §8.2)
//
// When `equipment_tier === 'dumbbell_based'`, the protocol writes DB versions
// of barbell exercises and computes working weight per hand. If the athlete's
// DB max forces a load below the prescribed target, reps scale up
// proportionally to maintain stimulus.
//
//   target_combined = pct_of_barbell_1RM × 1RM × 0.7   (DB ≈ 70% barbell, spec §8.2)
//   target_per_hand = target_combined / 2
//   working_per_hand = min(target_per_hand, db_max_lb)
//   reps_scaled = base_reps × (target_per_hand / working_per_hand)   when capped
//
// When `oneRMLb` is missing, the helper returns the % string unchanged — the
// spec §5 missing-1RM trade-off (surfaced elsewhere) covers that case.
// ============================================================================

export type DbPrescriptionResult = {
  /** Display string for `StrengthExercise.weight`. */
  weight: string;
  /** Reps as number when known, range string ("8-10") when fractional bounds matter. */
  reps: number | string;
  /** True when the athlete's DB max forced a cap (caller surfaces session trade-off). */
  capped: boolean;
};

export type DbPrescriptionInput = {
  /** Percentage of the corresponding barbell 1RM, e.g. 0.65 for hypertrophy, 0.78 for build. */
  pctOfBarbell1RM: number;
  /** Barbell 1RM in pounds. When undefined, weight returns as "% 1RM" string. */
  oneRMLb?: number;
  /** Base rep prescription for this set — number or "8-10" range. */
  baseReps: number | string;
  /** Heaviest DB the athlete owns, per hand (lb). Default 50 when caller passes nothing. */
  dbMaxLb: number;
  /** DB-vs-barbell ratio (spec §8.2 default = 0.7). */
  dbToBarbellRatio?: number;
};

/** Round per-hand load to the nearest 5 lb (most adjustable DB sets jump in 5-lb increments). */
function roundToFive(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

/** Resolve a base-reps spec to a numeric upper bound for proportional scaling. */
function repsUpperBound(baseReps: number | string): number {
  if (typeof baseReps === 'number' && Number.isFinite(baseReps) && baseReps > 0) return baseReps;
  const s = String(baseReps ?? '').trim();
  const range = s.match(/^(\d+)\s*-\s*(\d+)/);
  if (range) return Number(range[2]);
  const single = s.match(/^(\d+)/);
  if (single) return Number(single[1]);
  return 8; // safe fallback
}

export function dbPrescription(input: DbPrescriptionInput): DbPrescriptionResult {
  const ratio = input.dbToBarbellRatio ?? 0.7;
  const dbMax = Math.max(5, Math.round(Number(input.dbMaxLb) || 50));

  // No 1RM → emit % string with DB-equivalent note. The §5 missing-1RM trade-off elsewhere
  // already explains the conservative-defaults fallback; here we just keep prescription readable.
  if (!input.oneRMLb || input.oneRMLb <= 0) {
    return {
      weight: `${Math.round(input.pctOfBarbell1RM * 100)}% 1RM (DB ≈ 70% barbell load)`,
      reps: input.baseReps,
      capped: false,
    };
  }

  const targetCombined = input.pctOfBarbell1RM * input.oneRMLb * ratio;
  const targetPerHand = targetCombined / 2;

  if (targetPerHand <= dbMax) {
    return { weight: `${roundToFive(targetPerHand)} lb each`, reps: input.baseReps, capped: false };
  }

  // Capped — scale reps proportionally so total work (reps × load) stays ≈ constant.
  const capRatio = targetPerHand / dbMax;
  const baseRepsNum = repsUpperBound(input.baseReps);
  const scaledReps = Math.max(baseRepsNum, Math.round(baseRepsNum * capRatio));
  return {
    weight: `${dbMax} lb each (DB max — capped)`,
    reps: scaledReps,
    capped: true,
  };
}

/**
 * Athlete-facing trade-off line surfaced once per session when any exercise's load was
 * capped by the athlete's DB max. Keep wording stable — UX surfaces match the string verbatim.
 */
export const DB_MAX_LOAD_CAP_TRADEOFF =
  'Working weight capped by your DB max — extra reps prescribed to maintain stimulus. ' +
  'Add heavier DBs or barbell access to unlock full performance loading.';

/** Session-level tag emitted alongside the trade-off message for downstream UX surfacing. */
export const DB_MAX_LOAD_CAP_TAG = 'gate:db_max_load_cap';
