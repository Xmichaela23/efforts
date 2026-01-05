/**
 * Shared Types for Block Analysis Modules
 * 
 * All modules use pure TypeScript - no AI interpretation.
 * GPT only writes coaching prose at the end.
 */

// =============================================================================
// PERFORMANCE TRENDS
// =============================================================================

export interface TrendResult {
  current: string;
  previous: string;
  change_percent: number;
  reliable: boolean;
  reason?: 'insufficient_data' | 'no_power_data' | 'variance_too_high';
  message?: string;
  sample_sizes?: { current: number; previous: number };
}

export interface PerformanceTrends {
  run?: TrendResult;
  bike?: TrendResult;
  swim?: TrendResult;
  strength?: StrengthTrend;
}

export interface StrengthTrend {
  has_baselines: boolean;
  lifts: StrengthLiftProgress[];
}

export interface StrengthLiftProgress {
  name: string;
  baseline_1rm: number;
  current_working: number;
  percent_of_1rm: number;
  status: 'at_max' | 'near_max' | 'building' | 'no_data';
}

// =============================================================================
// PLAN ADHERENCE
// =============================================================================

export interface AdherenceItem {
  discipline: 'run' | 'bike' | 'swim' | 'strength' | 'mobility';
  completed: number;
  planned: number;
  percent: number;
  status: 'good' | 'warning' | 'critical' | 'over' | 'info';
  note: string;
  icon: '✅' | '⚠️' | '🔴' | 'ℹ️';
}

export interface PlanAdherence {
  overall: {
    completed: number;
    planned: number;
    percent: number;
    status: 'on_track' | 'needs_attention' | 'falling_behind';
  };
  by_discipline: AdherenceItem[];
  patterns: string[];  // e.g., "Strength skipped 3 weeks in a row"
}

// =============================================================================
// THIS WEEK SUMMARY
// =============================================================================

export interface WeekSummary {
  completed_count: number;
  planned_count: number;
  key_workouts: KeyWorkout[];
  missed: MissedWorkout[];
  workload: {
    actual: number;
    planned: number;
    percent: number;
  };
  patterns: string[];  // e.g., "Third consecutive week without strength"
}

export interface KeyWorkout {
  name: string;
  type: string;
  status: 'completed' | 'missed';
  is_key: boolean;  // Long run, intervals, threshold, etc.
}

export interface MissedWorkout {
  discipline: string;
  name: string;
  was_key: boolean;
}

// =============================================================================
// FOCUS AREAS
// =============================================================================

export interface FocusArea {
  action: string;
  reason: string;
  priority: 1 | 2 | 3;
  impact?: string;
}

export interface FocusAreasResult {
  areas: FocusArea[];
  goal_context?: string;  // e.g., "LA Marathon build phase starts in 3 weeks"
}

// =============================================================================
// DATA QUALITY
// =============================================================================

export interface DataQuality {
  bike: {
    count: number;
    has_power: boolean;
    can_trend: boolean;
    note?: string;
  };
  run: {
    count: number;
    has_pace: boolean;
    can_trend: boolean;
    note?: string;
  };
  strength: {
    count: number;
    has_baselines: boolean;
    can_trend: boolean;
    note?: string;
  };
  swim: {
    count: number;
    can_trend: boolean;
    note?: string;
  };
}

// =============================================================================
// OVERALL BLOCK ANALYSIS
// =============================================================================

export interface BlockAnalysis {
  performance_trends: PerformanceTrends;
  plan_adherence: PlanAdherence;
  this_week: WeekSummary;
  focus_areas: FocusAreasResult;
  data_quality: DataQuality;
  coaching_insight: string;  // GPT-generated prose
  generated_at: string;
}

// =============================================================================
// INPUT TYPES
// =============================================================================

export interface Workout {
  id: string;
  date: string;
  type: string;
  name: string;
  duration?: number;
  moving_time?: number;
  elapsed_time?: number;
  avg_power?: number;
  normalized_power?: number;
  avg_pace?: string;
  avg_pace_s?: number;
  avg_heart_rate?: number;
  workload_actual?: number;
  workout_status?: string;
  planned_id?: string;
  computed?: any;
  strength_exercises?: any;
}

export interface PlannedWorkout {
  id: string;
  date: string;
  type: string;
  name: string;
  target_duration?: number;
  is_key_workout?: boolean;
  completed?: Workout[];  // Attached completions
}

export interface UserBaselines {
  ftp?: number;
  fiveK_pace?: string;
  max_hr?: number;
  rest_hr?: number;
  bench?: number;
  squat?: number;
  deadlift?: number;
  overheadPress1RM?: number;
}

export interface Goal {
  name: string;
  date: string;
  type: string;
  current_phase?: string;
  weeks_remaining?: number;
}

