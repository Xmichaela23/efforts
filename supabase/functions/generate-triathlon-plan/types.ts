// Type definitions for triathlon plan generation

// ============================================================================
// REQUEST / RESPONSE
// ============================================================================

/**
 * Training methodology split for triathlon plans.
 *
 * base_first  (Completion) — Extended aerobic base, Z3 tempo quality, Z2 bricks.
 *             Phase ratio: 40% base / 35% build / 15% RS. Loading: 2:1.
 *             The 20% non-easy time favours Zone 3 (comfortably hard).
 *
 * race_peak   (Performance) — Standard 8/8 split, threshold + VO2 quality,
 *             race-pace bricks from mid-build. Loading: 3:1.
 *             The 20% non-easy time mixes Zone 4 threshold + strategic Zone 5.
 *
 * Derived from `goal` when not supplied: complete → base_first, performance → race_peak.
 */
export type TriApproach = 'base_first' | 'race_peak';

/** Mirrors `goals.training_prefs.training_intent` — shapes load and recovery when set. */
export type TrainingIntent = 'performance' | 'completion' | 'comeback' | 'first_race';

export interface GenerateTriPlanRequest {
  user_id: string;
  /** sprint | olympic | 70.3 | ironman */
  distance: TriDistance;
  fitness: 'beginner' | 'intermediate' | 'advanced';
  goal: 'complete' | 'performance';
  /** Training methodology. Derived from goal when absent. */
  approach?: TriApproach;
  duration_weeks: number;
  start_date?: string;
  race_date?: string;
  race_name?: string;

  // Scheduling
  /** e.g. "9-11" hours/week target. Derived from distance + fitness if omitted. */
  weekly_hours?: string;
  /** Number of key sessions per week (swim + bike + run each count separately) */
  days_per_week?: number; // 8–12 typical

  // Discipline fitness seeds (from user_baselines)
  current_weekly_run_miles?: number;
  current_weekly_bike_hours?: number;
  current_weekly_swim_yards?: number;
  recent_long_run_miles?: number;
  recent_long_ride_hours?: number;
  ftp?: number;                     // watts — for bike power targets
  swim_pace_per_100_sec?: number;   // seconds per 100 yd — for swim targets

  // Athlete state
  current_acwr?: number;
  volume_trend?: 'building' | 'holding' | 'declining';
  transition_mode?: 'peak_bridge' | 'recovery_rebuild' | 'fresh_build' | 'fitness_maintenance';

  // Strength
  strength_frequency?: 0 | 1 | 2;
  /** Whether the athlete has access to a commercial gym or is limited to home/bodyweight equipment. */
  equipment_type?: 'home_gym' | 'commercial_gym';
  /** Athlete's weakest triathlon discipline — shifts strength exercise emphasis. */
  limiter_sport?: 'swim' | 'bike' | 'run';
  /** From goal training_prefs; e.g. comeback → more frequent recovery weeks. */
  training_intent?: TrainingIntent;

  units?: 'imperial' | 'metric';

  /**
   * Days of the week that already have run sessions in another active plan
   * (e.g. ['Monday','Wednesday','Thursday','Sunday'] from a concurrent run plan).
   * The triathlon generator uses this to avoid stacking its own run sessions on
   * the same days — treating the run plan's sessions as satisfying that volume.
   */
  existing_run_days?: string[];
}

export type TriDistance = 'sprint' | 'olympic' | '70.3' | 'ironman';

export interface GenerateTriPlanResponse {
  success: boolean;
  plan_id?: string;
  preview?: TriPlanPreview;
  error?: string;
  validation_errors?: string[];
}

export interface TriPlanPreview {
  name: string;
  description: string;
  duration_weeks: number;
  peak_hours_per_week: string;
  avg_hours_per_week: string;
  phase_breakdown: { name: string; weeks: string; focus: string }[];
  disciplines: string[];
}

// ============================================================================
// INTERNAL GENERATION TYPES
// ============================================================================

export interface TriGeneratorParams {
  distance: TriDistance;
  fitness: 'beginner' | 'intermediate' | 'advanced';
  goal: 'complete' | 'performance';
  approach: TriApproach;  // always resolved before generator receives it
  duration_weeks: number;
  start_date?: string;
  race_date?: string;
  race_name?: string;
  units?: 'imperial' | 'metric';

  current_weekly_run_miles?: number;
  current_weekly_bike_hours?: number;
  current_weekly_swim_yards?: number;
  recent_long_run_miles?: number;
  recent_long_ride_hours?: number;
  ftp?: number;
  swim_pace_per_100_sec?: number;

  current_acwr?: number;
  volume_trend?: 'building' | 'holding' | 'declining';
  transition_mode?: string;
  training_intent?: TrainingIntent;

  strength_frequency?: number;

  /** Days already occupied by run sessions in a concurrent run plan */
  existing_run_days?: string[];
}

export interface TriSession {
  day: string;
  type: 'run' | 'bike' | 'swim' | 'strength' | 'brick';
  name: string;
  description: string;
  /** total duration in minutes (sum of all segments for brick) */
  duration: number;
  steps_preset?: string[];
  tags: string[];
  /** AM | PM for doubles (brick legs or same-day sessions) */
  timing?: string;
}

export interface TriTrainingPlan {
  name: string;
  description: string;
  duration_weeks: number;
  units: 'imperial' | 'metric';
  swim_unit: 'yd' | 'm';
  baselines_required: {
    run?: string[];
    bike?: string[];
    swim?: string[];
    strength?: string[];
  };
  weekly_summaries: Record<string, TriWeeklySummary>;
  sessions_by_week: Record<string, TriSession[]>;
}

export interface TriWeeklySummary {
  focus: string;
  key_workouts: string[];
  estimated_hours: number;
  hard_sessions: number;
  total_run_miles?: number;
  total_bike_hours?: number;
  total_swim_yards?: number;
  notes: string;
}

// ============================================================================
// PHASE STRUCTURES
// ============================================================================

export interface TriPhase {
  name: string;
  start_week: number;
  end_week: number;
  weeks_in_phase: number;
  focus: string;
  quality_density: 'low' | 'medium' | 'high';
  /** 0.0–1.0 scaling of peak volume applied this phase */
  volume_multiplier: number;
  /** Whether to include brick sessions this phase */
  bricks_per_week: number;
}

export interface TriPhaseStructure {
  phases: TriPhase[];
  recovery_weeks: number[];
}

// ============================================================================
// VOLUME PARAMETERS BY DISTANCE × FITNESS
// Each entry = peak weekly hours (total training time)
// ============================================================================

export interface TriVolumeParams {
  /** total hours/week at plan peak */
  peakHours: number;
  /** starting hours/week (week 1) */
  startHours: number;
  /** run miles at peak week */
  peakRunMiles: number;
  /** run miles week 1 */
  startRunMiles: number;
  /** long run miles at peak */
  longRunPeak: number;
  /** long run miles week 1 */
  longRunStart: number;
  /** long ride hours at peak */
  longRidePeak: number;
  /** long ride hours week 1 */
  longRideStart: number;
  /** taper weeks for this distance */
  taperWeeks: number;
  /** minimum plan weeks for this distance */
  minWeeks: number;
}

export const TRI_VOLUME: Record<TriDistance, Record<string, TriVolumeParams>> = {
  sprint: {
    beginner:     { peakHours: 7,  startHours: 4,  peakRunMiles: 20, startRunMiles: 12, longRunPeak: 6,  longRunStart: 3,  longRidePeak: 1.5, longRideStart: 0.75, taperWeeks: 1, minWeeks: 8  },
    intermediate: { peakHours: 9,  startHours: 6,  peakRunMiles: 28, startRunMiles: 18, longRunPeak: 8,  longRunStart: 5,  longRidePeak: 2.0, longRideStart: 1.0,  taperWeeks: 1, minWeeks: 8  },
    advanced:     { peakHours: 12, startHours: 8,  peakRunMiles: 38, startRunMiles: 26, longRunPeak: 10, longRunStart: 7,  longRidePeak: 2.5, longRideStart: 1.5,  taperWeeks: 1, minWeeks: 8  },
  },
  olympic: {
    beginner:     { peakHours: 9,  startHours: 5,  peakRunMiles: 22, startRunMiles: 14, longRunPeak: 8,  longRunStart: 4,  longRidePeak: 2.5, longRideStart: 1.25, taperWeeks: 2, minWeeks: 10 },
    intermediate: { peakHours: 11, startHours: 7,  peakRunMiles: 30, startRunMiles: 20, longRunPeak: 10, longRunStart: 6,  longRidePeak: 3.0, longRideStart: 1.5,  taperWeeks: 2, minWeeks: 10 },
    advanced:     { peakHours: 14, startHours: 9,  peakRunMiles: 40, startRunMiles: 28, longRunPeak: 12, longRunStart: 8,  longRidePeak: 3.5, longRideStart: 2.0,  taperWeeks: 2, minWeeks: 10 },
  },
  '70.3': {
    beginner:     { peakHours: 11, startHours: 6,  peakRunMiles: 25, startRunMiles: 15, longRunPeak: 10, longRunStart: 5,  longRidePeak: 3.5, longRideStart: 1.75, taperWeeks: 2, minWeeks: 14 },
    intermediate: { peakHours: 14, startHours: 8,  peakRunMiles: 32, startRunMiles: 20, longRunPeak: 13, longRunStart: 7,  longRidePeak: 4.5, longRideStart: 2.5,  taperWeeks: 2, minWeeks: 14 },
    advanced:     { peakHours: 17, startHours: 10, peakRunMiles: 40, startRunMiles: 26, longRunPeak: 16, longRunStart: 9,  longRidePeak: 5.5, longRideStart: 3.0,  taperWeeks: 3, minWeeks: 14 },
  },
  ironman: {
    beginner:     { peakHours: 14, startHours: 8,  peakRunMiles: 30, startRunMiles: 18, longRunPeak: 16, longRunStart: 8,  longRidePeak: 5.5, longRideStart: 2.75, taperWeeks: 3, minWeeks: 20 },
    intermediate: { peakHours: 18, startHours: 10, peakRunMiles: 38, startRunMiles: 22, longRunPeak: 20, longRunStart: 10, longRidePeak: 7.0, longRideStart: 3.5,  taperWeeks: 3, minWeeks: 20 },
    advanced:     { peakHours: 22, startHours: 13, peakRunMiles: 45, startRunMiles: 28, longRunPeak: 22, longRunStart: 12, longRidePeak: 8.5, longRideStart: 4.5,  taperWeeks: 3, minWeeks: 20 },
  },
};

// ============================================================================
// RACE DISTANCES (for event-day reference)
// ============================================================================

export const TRI_RACE_DISTANCES: Record<TriDistance, { swim_m: number; bike_km: number; run_km: number }> = {
  sprint:  { swim_m: 750,  bike_km: 20,  run_km: 5  },
  olympic: { swim_m: 1500, bike_km: 40,  run_km: 10 },
  '70.3':  { swim_m: 1900, bike_km: 90,  run_km: 21.1 },
  ironman: { swim_m: 3800, bike_km: 180, run_km: 42.2 },
};

// Min weeks by distance (floor for goal orchestration)
export const TRI_MIN_WEEKS: Record<TriDistance, Record<string, number>> = {
  sprint:  { beginner: 8,  intermediate: 6,  advanced: 6  },
  olympic: { beginner: 10, intermediate: 8,  advanced: 8  },
  '70.3':  { beginner: 14, intermediate: 12, advanced: 10 },
  ironman: { beginner: 20, intermediate: 18, advanced: 16 },
};
