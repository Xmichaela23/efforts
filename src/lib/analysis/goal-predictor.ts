/**
 * =============================================================================
 * GOAL PREDICTOR — Type contracts only (Smart Server, Dumb Client)
 * =============================================================================
 *
 * All verdict math runs server-side (supabase/functions/_shared/goal-predictor).
 * This file defines TypeScript interfaces for API response typing only.
 *
 * - generate-training-context returns weekly_verdict (WeeklyVerdictResult)
 * - generate-overall-context returns goal_prediction (GoalPredictionResult)
 */

// -----------------------------------------------------------------------------
// Input contracts (for reference; server consumes these)
// -----------------------------------------------------------------------------

export interface WeeklyReadinessInput {
  hr_drift_bpm: number | null;
  pace_adherence_pct: number | null;
}

export interface BlockTrajectoryInput {
  aerobic_efficiency_improvement_pct: number | null;
  long_run_improvement_pct: number | null;
  strength_overall_gain_pct: number | null;
}

export type GoalProfile = 'marathon' | 'strength' | 'speed' | 'power' | 'general';

export interface GoalPredictorPlanInput {
  target_finish_time_seconds: number | null;
  race_name?: string | null;
  goal_profile?: GoalProfile | null;
}

export interface GoalPredictorInput {
  weekly?: WeeklyReadinessInput | null;
  block?: BlockTrajectoryInput | null;
  plan?: GoalPredictorPlanInput | null;
  goal_profile?: GoalProfile | null;
}

// -----------------------------------------------------------------------------
// Result contracts (API response shapes)
// -----------------------------------------------------------------------------

export interface CurrentConfidenceResult {
  score: number;
  label: 'high' | 'medium' | 'low';
  message: string;
  drivers: string[];
}

export interface RaceDayForecastResult {
  projected_finish_time_seconds: number | null;
  improvement_seconds: number | null;
  projected_time_display: string | null;
  improvement_display: string | null;
  message: string;
  drivers: string[];
}

export interface DurabilityRiskResult {
  has_risk: boolean;
  label: string | null;
  message: string | null;
  drivers: string[];
}

export interface WeeklyVerdictResult {
  readiness_pct: number;
  message: string;
  drivers: string[];
  label: 'high' | 'medium' | 'low';
}

export interface BlockVerdictResult {
  goal_probability_pct: number;
  message: string;
  drivers: string[];
}

export interface InterferenceResult {
  strength_speed: string | null;
  power_aerobic: string | null;
  all: string[];
}

export interface GoalPredictionResult {
  goal_profile: GoalProfile;
  current_confidence: CurrentConfidenceResult | null;
  weekly_verdict: WeeklyVerdictResult | null;
  block_verdict: BlockVerdictResult | null;
  interference: InterferenceResult | null;
  race_day_forecast: RaceDayForecastResult | null;
  durability_risk: DurabilityRiskResult | null;
  coach_message_block: string | null;
}
