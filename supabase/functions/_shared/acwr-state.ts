export type AcwrStatus =
  | 'undertrained'
  | 'optimal'
  | 'elevated'
  | 'high_risk'
  | 'recovery'
  | 'optimal_recovery';

export type AcwrWeekIntent = 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';

export interface AcwrPlanContext {
  hasActivePlan?: boolean;
  weekIntent?: AcwrWeekIntent | null;
  isRecoveryWeek?: boolean | null;
  isTaperWeek?: boolean | null;
}

export const ACWR_RATIO_THRESHOLDS = {
  detrained: 0.7,
  undertrained: 0.8,
  ramp_fast: 1.3,
  overreaching: 1.5,
  build_optimal_max: 1.5,
  build_elevated_max: 1.7,
  recovery_optimal_max: 1.05,
  recovery_elevated_max: 1.2,
  taper_optimal_max: 1.1,
  taper_elevated_max: 1.25,
} as const;

export function getAcwrStatus(
  ratio: number,
  planContext: AcwrPlanContext | null,
): AcwrStatus {
  const hasPlan = Boolean(planContext?.hasActivePlan);
  const weekIntent = planContext?.weekIntent ?? 'unknown';
  const isRecoveryWeek = planContext?.isRecoveryWeek === true || weekIntent === 'recovery';
  const isTaperWeek = planContext?.isTaperWeek === true || weekIntent === 'taper';

  if (!hasPlan) {
    if (ratio < ACWR_RATIO_THRESHOLDS.undertrained) return 'undertrained';
    if (ratio <= ACWR_RATIO_THRESHOLDS.ramp_fast) return 'optimal';
    if (ratio <= ACWR_RATIO_THRESHOLDS.overreaching) return 'elevated';
    return 'high_risk';
  }

  if (isRecoveryWeek) {
    if (ratio < ACWR_RATIO_THRESHOLDS.undertrained) return 'optimal_recovery';
    if (ratio <= ACWR_RATIO_THRESHOLDS.recovery_optimal_max) return 'optimal';
    if (ratio <= ACWR_RATIO_THRESHOLDS.recovery_elevated_max) return 'elevated';
    return 'high_risk';
  }

  if (isTaperWeek) {
    if (ratio < ACWR_RATIO_THRESHOLDS.undertrained) return 'optimal';
    if (ratio <= ACWR_RATIO_THRESHOLDS.taper_optimal_max) return 'optimal';
    if (ratio <= ACWR_RATIO_THRESHOLDS.taper_elevated_max) return 'elevated';
    return 'high_risk';
  }

  if (weekIntent === 'build' || weekIntent === 'peak' || weekIntent === 'baseline') {
    if (ratio < ACWR_RATIO_THRESHOLDS.undertrained) return 'undertrained';
    if (ratio <= ACWR_RATIO_THRESHOLDS.build_optimal_max) return 'optimal';
    if (ratio <= ACWR_RATIO_THRESHOLDS.build_elevated_max) return 'elevated';
    return 'high_risk';
  }

  if (ratio < ACWR_RATIO_THRESHOLDS.undertrained) return 'undertrained';
  if (ratio <= ACWR_RATIO_THRESHOLDS.ramp_fast) return 'optimal';
  if (ratio <= ACWR_RATIO_THRESHOLDS.overreaching) return 'elevated';
  return 'high_risk';
}

export function getAcwrRiskFlag(
  ratio: number | null | undefined,
  isTransitionWindow: boolean = false,
): 'stable' | 'fast' | 'overreaching' {
  const v = Number(ratio);
  if (!Number.isFinite(v) || isTransitionWindow) return 'stable';
  if (v > ACWR_RATIO_THRESHOLDS.overreaching) return 'overreaching';
  if (v > ACWR_RATIO_THRESHOLDS.ramp_fast) return 'fast';
  return 'stable';
}

export function isAcwrFatiguedSignal(
  ratio: number | null | undefined,
  isTransitionWindow: boolean = false,
): boolean {
  const risk = getAcwrRiskFlag(ratio, isTransitionWindow);
  return risk === 'fast' || risk === 'overreaching';
}

export function isAcwrDetrainedSignal(ratio: number | null | undefined): boolean {
  const v = Number(ratio);
  return Number.isFinite(v) && v < ACWR_RATIO_THRESHOLDS.detrained;
}
