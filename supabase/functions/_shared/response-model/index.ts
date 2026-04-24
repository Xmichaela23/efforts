// =============================================================================
// UNIFIED RESPONSE MODEL — Entry Point
// =============================================================================
// Single source of truth for how the athlete's body is responding to training.
// Both the week view (coach) and block view (generate-overall-context) import
// from this module to ensure one coherent story.
// =============================================================================

export { computeWeeklyResponse } from './weekly.ts';
export { computeBlockResponse } from './block.ts';
export { computeCrossDomain } from './cross-domain.ts';

export type {
  WeeklyResponseState,
  BlockResponseState,
  EnduranceResponse,
  StrengthResponse,
  CrossDomainResponse,
  CrossDomainPattern,
  LoadContext,
  Assessment,
  AssessmentLabel,
  AssessmentTone,
  SignalTrend,
  TrendDirection,
  ConfidenceLevel,
  LiftTrend,
  VisibleSignal,
  ContextPrompt,
  GoalSummary,
  WeekHeadline,
  OverallTrainingRead,
  EmptyState,
  ArcInputsForResponse,
  BlockHeadline,
  WeeklySignalInputs,
  BaselineNorms,
  StrengthLiftSnapshot,
  CrossDomainPair,
} from './types.ts';

export {
  MIN_SAMPLES_FOR_SIGNAL,
  MIN_SAMPLES_FOR_TREND,
  BASELINE_WINDOW_DAYS,
} from './types.ts';
