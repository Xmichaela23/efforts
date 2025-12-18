// Type definitions for run plan generation

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface GeneratePlanRequest {
  user_id: string;
  distance: '5k' | '10k' | 'half' | 'marathon';
  fitness: 'beginner' | 'intermediate' | 'advanced';
  goal: 'complete' | 'speed';
  duration_weeks: number;
  approach: 'balanced_build' | 'time_efficient' | 'volume_progression' | 'cumulative_load' | 'hybrid_athlete';
  days_per_week: '3-4' | '4-5' | '5-6' | '6-7';
  strength_frequency?: 0 | 1 | 2 | 3;
  race_date?: string;
}

export interface GeneratePlanResponse {
  success: boolean;
  plan_id?: string;
  preview?: PlanPreview;
  error?: string;
  validation_errors?: string[];
}

export interface PlanPreview {
  name: string;
  description: string;
  duration_weeks: number;
  starting_volume_mpw: number;
  peak_volume_mpw: number;
  quality_sessions_per_week: number;
  long_run_peak_miles: number;
  estimated_hours_per_week: string;
  phase_breakdown: PhaseInfo[];
}

export interface PhaseInfo {
  name: string;
  weeks: string;
  focus: string;
}

// ============================================================================
// INTERNAL GENERATION TYPES
// ============================================================================

export interface GeneratorParams {
  distance: string;
  fitness: string;
  goal?: string;
  duration_weeks: number;
  days_per_week: string;
  user_id: string;
  race_date?: string;
}

export interface TrainingPlan {
  name: string;
  description: string;
  duration_weeks: number;
  swim_unit?: 'yd' | 'm';
  units: 'imperial' | 'metric';
  baselines_required: {
    run?: string[];
    bike?: string[];
    swim?: string[];
    strength?: string[];
  };
  weekly_summaries?: Record<string, WeeklySummary>;
  sessions_by_week: Record<string, Session[]>;
}

export interface Session {
  day: string;
  type: 'run' | 'bike' | 'swim' | 'strength';
  name: string;
  description: string;
  duration: number;
  steps_preset?: string[];
  strength_exercises?: StrengthExercise[];
  tags: string[];
  transition_s?: number;
}

export interface StrengthExercise {
  name: string;
  sets: number;
  reps: number | string;
  weight: string;
}

export interface WeeklySummary {
  focus: string;
  key_workouts: string[];
  estimated_hours: number;
  hard_sessions: number;
  notes: string;
}

// ============================================================================
// PHASE STRUCTURE
// ============================================================================

export interface PhaseStructure {
  phases: Phase[];
  recovery_weeks: number[];
}

export interface Phase {
  name: string;
  start_week: number;
  end_week: number;
  weeks_in_phase: number;
  focus: string;
  quality_density: 'low' | 'medium' | 'high';
  volume_multiplier: number;
}

// ============================================================================
// APPROACH CONSTRAINTS
// ============================================================================

export interface ApproachConstraints {
  min_days: string;
  max_days: string;
  supported_days: string[];
  description: string;
  philosophy: string;
}

export const APPROACH_CONSTRAINTS: Record<string, ApproachConstraints> = {
  'balanced_build': {
    min_days: '4-5',
    max_days: '6-7',
    supported_days: ['4-5', '5-6', '6-7'],
    description: 'Phase-based progression with quality limits',
    philosophy: 'Build aerobic base, add speed work, race-specific training, taper. Quality capped at 10K per session. 2Q system - two quality workouts per week.'
  },
  'time_efficient': {
    min_days: '3-4',
    max_days: '3-4',
    supported_days: ['3-4'],
    description: '3 focused runs plus cross-training',
    philosophy: 'Every run has purpose: speed, tempo, long. Cross-training fills gaps. Maximum efficiency with quality over quantity.'
  },
  'volume_progression': {
    min_days: '5-6',
    max_days: '6-7',
    supported_days: ['5-6', '6-7'],
    description: 'High mileage with progressive build',
    philosophy: 'Volume is king. Medium-long runs midweek, long runs with race pace segments. Progressive weekly increases with 10% rule.'
  },
  'cumulative_load': {
    min_days: '5-6',
    max_days: '6-7',
    supported_days: ['5-6', '6-7'],
    description: 'Frequent race-pace work, capped long runs',
    philosophy: 'Train to race on tired legs. Race pace work throughout week. Long runs capped at 16mi - simulate last 16 of marathon, not first 16.'
  },
  'hybrid_athlete': {
    min_days: '4-5',
    max_days: '5-6',
    supported_days: ['4-5', '5-6'],
    description: 'Run training plus strength integration',
    philosophy: 'Strength training from day one with interference management. Build complete athlete with proper recovery between modalities.'
  }
};

// ============================================================================
// VOLUME PARAMETERS
// ============================================================================

export interface VolumeParameters {
  startWeekly: number;
  peakWeekly: number;
  longRunCap: number;
  weeklyIncrease: number;
}

export const FITNESS_TO_VOLUME: Record<string, Record<string, VolumeParameters>> = {
  'marathon': {
    'beginner': { startWeekly: 15, peakWeekly: 35, longRunCap: 18, weeklyIncrease: 1.5 },
    'intermediate': { startWeekly: 35, peakWeekly: 55, longRunCap: 22, weeklyIncrease: 2.5 },
    'advanced': { startWeekly: 55, peakWeekly: 85, longRunCap: 24, weeklyIncrease: 3.5 }
  },
  'half': {
    'beginner': { startWeekly: 12, peakWeekly: 28, longRunCap: 12, weeklyIncrease: 1.2 },
    'intermediate': { startWeekly: 25, peakWeekly: 40, longRunCap: 14, weeklyIncrease: 2.0 },
    'advanced': { startWeekly: 40, peakWeekly: 60, longRunCap: 16, weeklyIncrease: 2.5 }
  },
  '10k': {
    'beginner': { startWeekly: 10, peakWeekly: 25, longRunCap: 10, weeklyIncrease: 1.0 },
    'intermediate': { startWeekly: 20, peakWeekly: 35, longRunCap: 12, weeklyIncrease: 1.5 },
    'advanced': { startWeekly: 35, peakWeekly: 55, longRunCap: 14, weeklyIncrease: 2.0 }
  },
  '5k': {
    'beginner': { startWeekly: 8, peakWeekly: 20, longRunCap: 8, weeklyIncrease: 0.8 },
    'intermediate': { startWeekly: 18, peakWeekly: 32, longRunCap: 10, weeklyIncrease: 1.2 },
    'advanced': { startWeekly: 30, peakWeekly: 50, longRunCap: 12, weeklyIncrease: 1.8 }
  }
};

// ============================================================================
// TOKEN PATTERNS
// ============================================================================

export const TOKEN_PATTERNS = {
  warmup_easy_10min: 'warmup_run_easy_10min',
  warmup_quality_12min: 'warmup_run_quality_12min',
  cooldown_easy_10min: 'cooldown_easy_10min',
  strides_6x20s: 'strides_6x20s',
  strides_4x100m: 'strides_4x100m',
  easy_run: (minutes: number) => `run_easy_${minutes}min`,
  long_run: (minutes: number) => `longrun_${minutes}min_easypace`,
  long_run_with_mp: (totalMin: number, mpMin: number) => 
    `longrun_${totalMin}min_easypace_last${mpMin}min_MP`,
  intervals_800: (reps: number, rest_sec: number) => 
    `interval_${reps}x800m_5kpace_r${rest_sec}s`,
  intervals_1000: (reps: number, rest_sec: number) => 
    `interval_${reps}x1000m_5kpace_r${rest_sec}s`,
  intervals_1200: (reps: number, rest_sec: number) => 
    `interval_${reps}x1200m_5kpace_r${rest_sec}s`,
  intervals_1mi: (reps: number, rest_min: number) => 
    `interval_${reps}x1mi_5kpace_R${rest_min}min`,
  tempo_miles: (miles: number) => `tempo_${miles}mi_5kpace_plus0:45`,
  tempo_minutes: (minutes: number) => `tempo_${minutes}min_5kpace_plus0:45`,
  cruise_intervals: (reps: number, miles_each: number) => 
    `cruise_${reps}x${miles_each}mi_T_pace_r60s`
} as const;

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}
