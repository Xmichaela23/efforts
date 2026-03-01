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
  approach: 'sustainable' | 'performance_build';
  days_per_week: '3-4' | '4-5' | '5-6' | '6-7';
  strength_frequency?: 0 | 2 | 3;
  strength_tier?: 'injury_prevention' | 'strength_power';
  equipment_type?: 'home_gym' | 'commercial_gym';
  strength_protocol?: string; // Optional protocol ID (canonical: 'durability' | 'neural_speed' | 'upper_aesthetics'). Legacy IDs accepted and normalized. Note: 'minimum_dose' is deferred until frontend support.
  no_doubles?: boolean; // If true, cannot stack strength on same day as quality runs (default: false, allows doubles)
  race_date?: string;
  race_name?: string;
  // User's current weekly mileage (for scaling starting volume)
  current_weekly_miles?: number;
  // Athlete current state — derived from recent snapshots & workout facts
  recent_long_run_miles?: number;              // peak long run from last 4 weeks
  current_acwr?: number;                       // acute:chronic workload ratio
  volume_trend?: 'building' | 'holding' | 'declining';
  // Effort Score (for Performance Build / speed goal)
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
  race_name?: string;   // Optional race name (e.g., "Boston Marathon")
  // User's current weekly mileage (for scaling starting volume)
  current_weekly_miles?: number;
  // Athlete current state — from recent snapshots
  recent_long_run_miles?: number;
  current_acwr?: number;
  volume_trend?: 'building' | 'holding' | 'declining';
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
  timing?: string; // e.g., 'AM (Priority)' or 'PM (6hr+ gap recommended)'
}

export interface StrengthExercise {
  name: string;
  sets: number;
  reps: number | string;
  weight: string;
  target_rir?: number; // Target Reps In Reserve (1-5). Lower = harder. Guides user effort.
}

export interface WeeklySummary {
  focus: string;
  key_workouts: string[];
  estimated_hours: number;
  hard_sessions: number;
  total_miles?: number;
  notes: string;
  timing_note?: string; // Note about AM/PM scheduling for double days
}

// ============================================================================
// PLAN CONTRACT V1 (Context handshake - single stored contract)
// Every generator writes the same shape; Context reads only this. No inference.
// ============================================================================

export type PlanContractPhase = 'base' | 'build' | 'peak' | 'taper' | 'recovery';

export type PlanContractKeySessionType =
  | 'run_intervals' | 'run_tempo' | 'run_long'
  | 'bike_vo2' | 'bike_threshold' | 'bike_long'
  | 'swim_tech' | 'swim_endurance'
  | 'strength' | 'mobility'
  | 'rest';

export interface PlanContractWeekIntent {
  week_index: number;
  focus_code: string;
  focus_label: string;
  disciplines?: string[];
  key_session_types: PlanContractKeySessionType[];
  hard_cap: number;
  taper_multiplier?: number;
}

export interface PlanContractV1 {
  version: 1;
  plan_type: 'run' | 'bike' | 'tri' | 'hybrid';
  start_date: string;
  duration_weeks: number;
  week_start: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  phase_by_week: PlanContractPhase[];
  week_intent_by_week: PlanContractWeekIntent[];
  policies: {
    max_hard_per_week: number;
    min_rest_gap_days: number;
    taper_multipliers?: Record<number, number>;
  };
  strength?: {
    enabled: boolean;
    protocol_id?: string;
    frequency_per_week?: number;
    intent?: 'neural' | 'durability' | 'upper' | 'maintenance';
    priority?: 'primary' | 'support';
  };
  goal?: {
    event_type?: string;
    event_date?: string;
    target?: string;
  };
  workload_model?: {
    unit: string;
    include_disciplines: string[];
    weights?: Record<string, number>;
  };
  schedule_preferences?: {
    long_run_day?: 'sat' | 'sun';
    long_ride_day?: 'sat' | 'sun';
    key_run_day?: 'tue' | 'wed' | 'thu';
    key_bike_day?: 'tue' | 'wed' | 'thu';
  };
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
  'sustainable': {
    id: 'sustainable',
    name: 'Simple Completion',
    shortDescription: 'Easy-to-follow plan focused on finishing healthy',
    longDescription: 'Straightforward training using effort-based pacing (easy, moderate, hard) so you don\'t need complicated pace charts. Minimal speedwork keeps training enjoyable while building the endurance needed to cross the finish line.',
    basedOn: 'Adapted from progressive training principles',
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
  'performance_build': {
    id: 'performance_build',
    name: 'Performance Build',
    shortDescription: 'Structured quality with personalized pace zones',
    longDescription: 'Science-based training with precise pace zones (Easy, Marathon, Threshold, Interval) calculated from your 5K time. Two quality days per week with structured intervals and tempo runs.',
    basedOn: 'Adapted from established running science principles',
    availableForGoals: ['speed'],
    requiredFitness: ['intermediate', 'advanced'],
    supported_days: ['4-5', '5-6', '6-7'],
    characteristics: [
      'Personalized pace zones',
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
  'sustainable': {
    min_days: '3-4',
    max_days: '5-6',
    supported_days: ['3-4', '4-5', '5-6'],
    description: 'Easy-to-follow plan focused on finishing healthy',
    philosophy: 'Effort-based pacing, minimal speedwork, conservative progression. Based on progressive training principles.'
  },
  'performance_build': {
    min_days: '4-5',
    max_days: '6-7',
    supported_days: ['4-5', '5-6', '6-7'],
    description: 'Structured quality with personalized pace zones',
    philosophy: 'Effort-based pacing, 2Q system, structured intervals. Based on established training science.'
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

// ============================================================================
// MARATHON DURATION REQUIREMENTS
// ============================================================================

export interface DurationRequirements {
  minWeeklyMiles: number;
  peakLongRun: number;
  taperWeeks: number;
  startingLongRun: number;
  warning: string | null;
  additionalPrereqs: string[];
}

/**
 * Marathon plan requirements based on duration
 * Shorter plans require more established base fitness
 */
export const MARATHON_DURATION_REQUIREMENTS: Record<number, DurationRequirements> = {
  16: {
    minWeeklyMiles: 0,
    peakLongRun: 20,
    taperWeeks: 3,
    startingLongRun: 10,
    warning: null,
    additionalPrereqs: []
  },
  15: {
    minWeeklyMiles: 0,
    peakLongRun: 20,
    taperWeeks: 3,
    startingLongRun: 10,
    warning: null,
    additionalPrereqs: []
  },
  14: {
    minWeeklyMiles: 15,
    peakLongRun: 20,
    taperWeeks: 3,
    startingLongRun: 10,
    warning: null,
    additionalPrereqs: ['Should be comfortable running 8-10 miles']
  },
  13: {
    minWeeklyMiles: 15,
    peakLongRun: 20,
    taperWeeks: 3,
    startingLongRun: 10,
    warning: null,
    additionalPrereqs: ['Should be comfortable running 8-10 miles']
  },
  12: {
    minWeeklyMiles: 20,
    peakLongRun: 20,
    taperWeeks: 3,
    startingLongRun: 12,
    warning: 'A 12-week marathon plan is compressed. Ensure you have a solid base.',
    additionalPrereqs: [
      'Recent long runs of 8-10 miles',
      'Comfortable with easy-paced running'
    ]
  },
  11: {
    minWeeklyMiles: 25,
    peakLongRun: 18,
    taperWeeks: 2,
    startingLongRun: 12,
    warning: 'An 11-week plan is aggressive and assumes significant running fitness. Consider a longer plan if this is your first marathon or returning from time off.',
    additionalPrereqs: [
      'Completed a half marathon or equivalent',
      'Recent long runs of 10-12 miles',
      'Comfortable with structured interval training'
    ]
  },
  10: {
    minWeeklyMiles: 25,
    peakLongRun: 18,
    taperWeeks: 2,
    startingLongRun: 12,
    warning: 'A 10-week plan is aggressive and assumes significant running fitness. Consider a longer plan if this is your first marathon or returning from time off.',
    additionalPrereqs: [
      'Completed a half marathon or equivalent',
      'Recent long runs of 10-12 miles',
      'Comfortable with structured interval training'
    ]
  }
};

/**
 * Get duration requirements for a marathon plan
 * Falls back to nearest defined duration if exact match not found
 */
export function getMarathonDurationRequirements(weeks: number): DurationRequirements {
  // Direct match
  if (MARATHON_DURATION_REQUIREMENTS[weeks]) {
    return MARATHON_DURATION_REQUIREMENTS[weeks];
  }
  
  // For durations > 16, use 16-week requirements
  if (weeks > 16) {
    return MARATHON_DURATION_REQUIREMENTS[16];
  }
  
  // For durations < 10, use 10-week requirements (strictest)
  if (weeks < 10) {
    return MARATHON_DURATION_REQUIREMENTS[10];
  }
  
  // Should not reach here, but fallback to 12
  return MARATHON_DURATION_REQUIREMENTS[12];
}
