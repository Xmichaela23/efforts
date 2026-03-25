/** Versioned population defaults — adjust in one place. */

export const BASE_THRESHOLDS: Record<string, number> = {
  quadriceps: 2500,
  hamstrings: 2000,
  glutes: 2000,
  chest: 2000,
  upper_back: 1800,
  lats: 1800,
  anterior_deltoid: 1200,
  lateral_deltoid: 800,
  posterior_deltoid: 800,
  triceps: 1000,
  biceps: 800,
  core: 1500,
  obliques: 1200,
  lower_back: 1500,
  erector_spinae: 1500,
  hip_flexors: 1000,
  calves: 1000,
  adductors: 1000,
  abductors: 1000,
  aerobic: 150,
  glycolytic: 30,
  neuromuscular: 3,
  _default: 1500,
};

export const PHASE_MULTIPLIERS: Record<string, number> = {
  recovery: 0.6,
  base: 1.0,
  build: 1.0,
  peak: 1.2,
  taper: 0.4,
  race_week: 0.2,
};

export function thresholdForTarget(target: string): number {
  return BASE_THRESHOLDS[target] ?? BASE_THRESHOLDS._default;
}

export function adjustedThreshold(target: string, phaseMultiplier: number): number {
  return thresholdForTarget(target) * phaseMultiplier;
}
