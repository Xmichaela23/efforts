// STATE v2 per-discipline trend model — public surface.
// Step 1: shared primitive + strength & bike performance adapters.
// Step 2: adherence adapter (fallback axis, co-equal-ready) + the hybrid discipline resolver.
// Step 3: run & swim adapters (provisional thresholds) + two-part headline synthesis.

export * from './types';
export * from './thresholds';
export { classifyTrend } from './classify';
export type { ClassifyOpts } from './classify';
export { isDeloadWeek } from './deload';
export {
  computeStrengthState,
  PRIMARY_LIFTS,
  type LiftSeries,
  type LiftVerdict,
  type StrengthState,
} from './strength';
export { computeBikeState, pwr20ToSeries, type BikeState } from './bike';
export { computeRunState, routeMetricsToSeries, type RunState } from './run';
export { computeSwimState, swimPaceToSeries, type SwimState } from './swim';
export { synthesizeHeadline, type Headline } from './headline';
export {
  computeAdherenceState,
  type AdherenceInput,
  type AdherenceState,
  type SessionContextTag,
} from './adherence';
export {
  resolveDisciplineCard,
  performanceLeads,
  perfFromTrend,
  DISPLAY_MODE,
  type DisciplineCard,
  type AxisMode,
  type PerfSummary,
} from './discipline';
