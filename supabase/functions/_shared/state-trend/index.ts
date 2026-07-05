// STATE v2 per-discipline trend model — public surface.
// Step 1: shared primitive + strength & bike performance adapters.
// Step 2: adherence adapter (fallback axis, co-equal-ready) + the hybrid discipline resolver.
// Step 3: run & swim adapters (provisional thresholds) + two-part headline synthesis.

export * from './types.ts';
export * from './thresholds.ts';
export { classifyTrend } from './classify.ts';
export type { ClassifyOpts } from './classify.ts';
export { isDeloadWeek } from './deload.ts';
export {
  computeStrengthState,
  PRIMARY_LIFTS,
  type LiftSeries,
  type LiftVerdict,
  type StrengthState,
} from './strength.ts';
export { computeBikeState, pwr20ToSeries, pickBestPwr20, type BikeState, type Pwr20Series } from './bike.ts';
export { resolveZoneBand, type AthleteZoneInputs, type ZoneBand } from './zones.ts';
export {
  computeBikeFitness,
  computeTerrainBinnedPower,
  computeEfficiencyTrend,
  isProvisionalTrend,
  POWER_BINS,
  type BikeEffortRide,
  type BikeSignal,
  type BikeFitness,
} from './bike-fitness.ts';
export {
  computeRunState, routeMetricsToSeries, isComparableRunEffort, COMPARABLE_RUN_EFFORT,
  efficiencyIndexToSeries, computeRunEfficiencyState,
  decouplingToSeries, computeRunDecouplingState, frielBand, isSteadyAerobic,
  type RunState, type RunFitness, type DecouplingBand, type DecouplingState,
} from './run.ts';
export { computeSwimState, swimPaceToSeries, type SwimState } from './swim.ts';
export { synthesizeHeadline, type Headline } from './headline.ts';
export {
  suggestBaselineUpdate,
  SUGGEST_MIN_SAMPLES,
  SUGGEST_MIN_DIVERGENCE_PCT,
  SUGGEST_FRESHNESS_DAYS,
  type LearnedAggregate,
  type BaselineSuggestion,
} from './reconcile.ts';
export {
  resolveStrengthCapacity,
  canonicalizeLiftKey,
  type CanonicalLiftKey,
  type CapacitySource,
  type CapacityResolution,
} from './capacity-resolver.ts';
export {
  computeAdherenceState,
  type AdherenceInput,
  type AdherenceState,
  type SessionContextTag,
} from './adherence.ts';
export {
  assembleStateTrends,
  liftSeriesFromExerciseLog,
  toStateTrendsV1,
  rollupFitnessDirection,
  type FitnessDirection,
  disciplineOf,
  todayISO,
  isoMinus,
  ORDER,
  STATE_TREND_WINDOWS,
  type StateTrendInputs,
  type StateTrendResult,
  type StateTrendsV1,
  type DisciplineTrendCache,
  type ExerciseLogLite,
} from './assemble.ts';
export {
  resolveDisciplineCard,
  performanceLeads,
  perfFromTrend,
  DISPLAY_MODE,
  type DisciplineCard,
  type AxisMode,
  type PerfSummary,
} from './discipline.ts';
