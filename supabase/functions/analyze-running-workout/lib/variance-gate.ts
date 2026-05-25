/**
 * Variance-gate predicate for run analyzer (D-034 / D-038).
 *
 * Computes per-session `is_mixed_effort` boolean + signal source + pace-CV
 * diagnostics from already-analyzed inputs (pacing_variability, fact-packet
 * facts/derived, plan link, intervals). Pure function — no DB / no env / no
 * side effects.
 *
 * Extracted from the inline `_varGate` IIFE in
 * `analyze-running-workout/index.ts:~2138` (D-044 item 7, 2026-05-25). The
 * extraction is verifiably no-op: callers pass the same closed-over values
 * the IIFE used to read; return shape matches one-for-one. The 5 pin tests
 * in `variance-gate.test.ts` lock that contract.
 *
 * Reasoning behind the predicate priority (first match wins):
 *   1. ieTripsLinked          — linked plan emitted ≥2 work steps → trust it
 *   2. planIntentTripsLinked  — linked plan whose classified_type is
 *                               interval-like (intervals/tempo/fartlek/etc.)
 *   3. detectedTripsUnplanned — unplanned session whose interval structure
 *                               looks non-easy
 *   4. cvTripsGap | cvTripsRawFlat — pace CV ≥ 8% at trustworthy basis.
 *                               GAP basis trusted always; raw basis only on
 *                               flat terrain (terrain confound is the safer
 *                               error to make).
 *
 * `classified_type_variance_override` is true when the gate trips on a
 * linked-plan easy-like session — pool filters use this flag (not
 * classified_type) so plan intent is never overwritten.
 */

export type VarianceSignal =
  | 'pace_cv'
  | 'interval_execution'
  | 'detected_intervals'
  | 'plan_intent_intervals'
  | null;

export interface VarianceGateResult {
  is_mixed_effort: boolean;
  variance_signal: VarianceSignal;
  /** Coefficient of variation on pace samples (percent), rounded to 0.1; null when not computable. */
  pace_cv_pct: number | null;
  /** Which series fed the CV ('gap' = grade-adjusted, 'raw' = device pace). */
  pace_cv_basis: 'gap' | 'raw' | null;
  /** True when a linked-plan easy-like session tripped the gate (pool filters use this without mutating classified_type). */
  classified_type_variance_override: boolean;
}

export interface VarianceGateInput {
  /** Pacing variability block from the analyzer: `coefficient_of_variation` (percent) + parent `gap_adjusted` boolean. */
  analysisPacingVariabilityCv: number | null | undefined;
  analysisGapAdjusted: boolean | null | undefined;
  /** From fact_packet_v1.facts.terrain_type (lowercased: 'flat' | 'rolling' | 'hilly' | ''). */
  factPacketTerrainType: string | null | undefined;
  /** From fact_packet_v1.derived.interval_execution.total_steps. */
  factPacketIntervalExecutionTotalSteps: number | null | undefined;
  /** True when a linked plannedWorkout exists with ≥1 work step. */
  isLinkedPlanSession: boolean;
  /** Intervals computed from sensor data, fed to detectWorkoutTypeFromIntervals. */
  intervalsToAnalyze: unknown[];
  /** Linked planned workout (may be null when unplanned). Passed through to detectWorkoutTypeFromIntervals. */
  plannedWorkout: unknown | null;
  /** Plan-intent classified type key (e.g. 'easy' / 'tempo' / 'intervals' / 'long_run' / 'recovery'). */
  classifiedTypeKey: string | null | undefined;
  /**
   * Pass through the analyzer's local `detectWorkoutTypeFromIntervals` to keep
   * this function pure (no module-graph dep on analyzer internals). Called
   * with `(intervalsToAnalyze, plannedWorkout)`; returns a workout-type string
   * or empty/null.
   */
  detectWorkoutTypeFromIntervals: (intervals: unknown[], planned: unknown | null) => string | null | undefined;
}

const INTERVAL_LIKE_PLAN_KEYS = new Set([
  'intervals', 'interval', 'interval_run',
  'tempo', 'tempo_run',
  'fartlek', 'threshold', 'vo2', 'vo2max', 'speed', 'track',
]);

const EASY_LIKE_PLAN_KEYS = new Set([
  'easy', 'easy_run', 'steady_state',
  'long', 'long_run',
  'recovery',
]);

/**
 * Pure variance-gate computation. See file header for the predicate priority
 * and reasoning. Returns identical shape to the inline IIFE this replaced.
 */
export function computeVarianceGate(input: VarianceGateInput): VarianceGateResult {
  const cvPct = Number(input.analysisPacingVariabilityCv);
  const cvValid = Number.isFinite(cvPct) && cvPct > 0;
  const gapAdj = Boolean(input.analysisGapAdjusted);
  const cvBasis: 'gap' | 'raw' | null = cvValid ? (gapAdj ? 'gap' : 'raw') : null;
  const terrainType = String(input.factPacketTerrainType || '').toLowerCase();
  const isFlat = terrainType === 'flat';

  const cvTripsGap = cvValid && cvBasis === 'gap' && cvPct >= 8;
  const cvTripsRawFlat = cvValid && cvBasis === 'raw' && isFlat && cvPct >= 8;
  // Spec §3.3 + user direction: "without grade data you can't separate
  // terrain from effort, and a missed detection is the safer error." Raw
  // CV on non-flat terrain is silently skipped.

  const ieTotalSteps = Number(input.factPacketIntervalExecutionTotalSteps);
  const ieTripsLinked = input.isLinkedPlanSession &&
    Number.isFinite(ieTotalSteps) && ieTotalSteps >= 2;

  const detectedKey = String(
    input.detectWorkoutTypeFromIntervals(input.intervalsToAnalyze, input.plannedWorkout) || ''
  ).toLowerCase().trim();
  const detectedTripsUnplanned = !input.isLinkedPlanSession && detectedKey !== '' &&
    detectedKey !== 'easy' && detectedKey !== 'steady_state' &&
    detectedKey !== 'long' && detectedKey !== 'long_run' &&
    detectedKey !== 'recovery';

  const planIntentTripsLinked = input.isLinkedPlanSession && (() => {
    const k = String(input.classifiedTypeKey || '').toLowerCase();
    return INTERVAL_LIKE_PLAN_KEYS.has(k);
  })();

  let signal: VarianceSignal = null;
  if (ieTripsLinked) signal = 'interval_execution';
  else if (planIntentTripsLinked) signal = 'plan_intent_intervals';
  else if (detectedTripsUnplanned) signal = 'detected_intervals';
  else if (cvTripsGap || cvTripsRawFlat) signal = 'pace_cv';

  const is_mixed_effort = signal !== null;

  const easyLikePlan = input.isLinkedPlanSession && (() => {
    const k = String(input.classifiedTypeKey || '').toLowerCase();
    return EASY_LIKE_PLAN_KEYS.has(k);
  })();
  const classified_type_variance_override = is_mixed_effort && easyLikePlan;

  return {
    is_mixed_effort,
    variance_signal: signal,
    pace_cv_pct: cvValid ? Math.round(cvPct * 10) / 10 : null,
    pace_cv_basis: cvBasis,
    classified_type_variance_override,
  };
}
