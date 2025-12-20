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
  start_date?: string; // ISO date string (YYYY-MM-DD)
  approach: 'simple_completion' | 'balanced_build';
  days_per_week: '3-4' | '4-5' | '5-6' | '6-7';
  strength_frequency?: 0 | 2 | 3;
  strength_tier?: 'injury_prevention' | 'strength_power';
  equipment_type?: 'home_gym' | 'commercial_gym';
  race_date?: string;
  // Effort Score (for Balanced Build / speed goal)
  effort_score?: number;
  effort_source_distance?: number; // meters
  effort_source_time?: number; // seconds
  effort_score_status?: 'verified' | 'estimated';
  effort_paces?: {
    base: number;    // seconds per mile
    race: number;    // seconds per mile  
    steady: number;  // seconds per mile
    power: number;   // seconds per mile
    speed: number;   // seconds per mile
  };
  effort_paces_source?: 'calculated' | 'manual';
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
  start_date?: string;  // ISO date string (YYYY-MM-DD) - plan start date
  race_date?: string;   // ISO date string (YYYY-MM-DD) - race day
  // Effort Score for pace calculations (Balanced Build only)
  effort_score?: number;
  effort_paces?: {
    base: number;    // seconds per mile
    race: number;    // seconds per mile
    steady: number;  // seconds per mile
    power: number;   // seconds per mile
    speed: number;   // seconds per mile
  };
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
  total_miles?: number;
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
// METHODOLOGY DEFINITIONS
// ============================================================================

export interface MethodologyDefinition {
  id: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  basedOn: string;
  availableForGoals: ('complete' | 'speed')[];
  requiredFitness: ('beginner' | 'intermediate' | 'advanced')[];
  supported_days: string[];
  characteristics: string[];
}

export const METHODOLOGIES: Record<string, MethodologyDefinition> = {
  'simple_completion': {
    id: 'simple_completion',
    name: 'Simple Completion',
    shortDescription: 'Easy-to-follow plan focused on finishing healthy',
    longDescription: 'Straightforward training using effort-based pacing (easy, moderate, hard) so you don\'t need complicated pace charts. Minimal speedwork keeps training enjoyable while building the endurance needed to cross the finish line.',
    basedOn: 'Adapted from Hal Higdon\'s progressive training principles',
    availableForGoals: ['complete'],
    requiredFitness: ['beginner', 'intermediate', 'advanced'],
    supported_days: ['3-4', '4-5', '5-6'],
    characteristics: [
      'Effort-based pacing (no pace charts needed)',
      'Optional speedwork (strides and light fartlek)',
      'Conservative volume progression',
      'Flexible schedule',
      'Completion-focused'
    ]
  },
  'balanced_build': {
    id: 'balanced_build',
    name: 'Balanced Build',
    shortDescription: 'Structured quality with VDOT-based pacing',
    longDescription: 'Science-based training with precise pace zones (Easy, Marathon, Threshold, Interval) calculated from your 5K time. Two quality days per week with structured intervals and tempo runs.',
    basedOn: 'Adapted from principles in Jack Daniels\' Running Formula',
    availableForGoals: ['speed'],
    requiredFitness: ['intermediate', 'advanced'],
    supported_days: ['4-5', '5-6', '6-7'],
    characteristics: [
      'VDOT-based pacing system',
      'Structured intervals (e.g., 6×800m)',
      'Two quality days per week',
      'Progressive 4-phase structure',
      'Performance-focused'
    ]
  }
};

// Legacy compatibility
export interface ApproachConstraints {
  min_days: string;
  max_days: string;
  supported_days: string[];
  description: string;
  philosophy: string;
}

export const APPROACH_CONSTRAINTS: Record<string, ApproachConstraints> = {
  'simple_completion': {
    min_days: '3-4',
    max_days: '5-6',
    supported_days: ['3-4', '4-5', '5-6'],
    description: 'Easy-to-follow plan focused on finishing healthy',
    philosophy: 'Effort-based pacing, minimal speedwork, conservative progression. Based on Hal Higdon\'s principles.'
  },
  'balanced_build': {
    min_days: '4-5',
    max_days: '6-7',
    supported_days: ['4-5', '5-6', '6-7'],
    description: 'Structured quality with VDOT-based pacing',
    philosophy: 'VDOT pacing, 2Q system, structured intervals. Based on Jack Daniels\' principles.'
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
// TOKEN PATTERNS - DISTANCE BASED
// ============================================================================

export const TOKEN_PATTERNS = {
  // Warmup/Cooldown (time-based is fine)
  warmup_easy_10min: 'warmup_run_easy_10min',
  warmup_quality_12min: 'warmup_run_quality_12min',
  warmup_1mi: 'warmup_run_easy_1mi',
  cooldown_easy_10min: 'cooldown_easy_10min',
  cooldown_1mi: 'cooldown_easy_1mi',
  
  // Strides
  strides_6x20s: 'strides_6x20s',
  strides_4x100m: 'strides_4x100m',
  
  // Easy Runs - DISTANCE BASED
  easy_run_miles: (miles: number) => `run_easy_${miles}mi`,
  easy_run: (minutes: number) => `run_easy_${minutes}min`, // Keep for backward compat
  
  // Long Runs - DISTANCE BASED
  long_run_miles: (miles: number) => `longrun_${miles}mi_easypace`,
  long_run: (minutes: number) => `longrun_${minutes}min_easypace`, // Keep for backward compat
  
  // Long Runs with MP Segments - DISTANCE BASED
  long_run_with_mp_miles: (totalMiles: number, mpMiles: number) => 
    `longrun_${totalMiles}mi_easypace_last${mpMiles}mi_MP`,
  long_run_with_mp: (totalMin: number, mpMin: number) => 
    `longrun_${totalMin}min_easypace_last${mpMin}min_MP`, // Keep for backward compat
  
  // Marathon Pace Runs - DISTANCE BASED
  mp_run_miles: (miles: number) => `run_mp_${miles}mi`,
  
  // Tempo Runs (keep time-based per Jack Daniels philosophy)
  tempo_minutes: (minutes: number) => `tempo_${minutes}min_threshold`,
  tempo_miles: (miles: number) => `tempo_${miles}mi_threshold`,
  
  // Intervals
  intervals_800: (reps: number, rest_sec: number) => 
    `interval_${reps}x800m_5kpace_r${rest_sec}s`,
  intervals_1000: (reps: number, rest_sec: number) => 
    `interval_${reps}x1000m_5kpace_r${rest_sec}s`,
  intervals_1200: (reps: number, rest_sec: number) => 
    `interval_${reps}x1200m_5kpace_r${rest_sec}s`,
  intervals_1mi: (reps: number, rest_min: number) => 
    `interval_${reps}x1mi_5kpace_R${rest_min}min`,
  
  // Cruise Intervals
  cruise_intervals: (reps: number, miles_each: number) => 
    `cruise_${reps}x${miles_each}mi_threshold_r60s`,
  
  // Fartlek
  fartlek: (pickups: number) => `fartlek_${pickups}x30-60s_moderate`
} as const;

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}
