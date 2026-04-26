// generate-combined-plan/types.ts
// All type definitions for the multi-sport combined plan engine.

export type Sport = 'run' | 'bike' | 'swim' | 'strength' | 'race';
export type Intensity = 'HARD' | 'MODERATE' | 'EASY';
export type Phase = 'base' | 'build' | 'race_specific' | 'taper' | 'recovery';
export type Priority = 'A' | 'B' | 'C';
export type LoadingPattern = '3:1' | '2:1';

// ── Request ──────────────────────────────────────────────────────────────────

export interface GoalInput {
  id: string;
  event_name: string;
  event_date: string;      // ISO 8601 "YYYY-MM-DD"
  distance: string;        // "sprint" | "olympic" | "70.3" | "ironman" | "marathon" | "half_marathon" | ...
  sport: string;           // "triathlon" | "run" | "cycling" | ...
  priority: Priority;
}

export interface AthleteState {
  current_ctl: number;
  ctl_by_sport?: { run?: number; bike?: number; swim?: number };
  run_threshold_pace?: string;  // "8:00" min/mi
  bike_ftp?: number;            // watts
  swim_threshold_pace?: string; // "2:00" per 100yd
  weekly_hours_available: number;
  loading_pattern: LoadingPattern;
  limiter_sport?: Sport;
  /** 0=Sunday … 6=Saturday (defaults to [] if omitted in API payload) */
  rest_days?: number[];
  long_run_day?: number;
  long_ride_day?: number;
  /** 0=Sunday … 6=Saturday. Default easy swim: Monday. */
  swim_easy_day?: number;
  /** Quality/CSS/threshold swim day. Default: Thursday. */
  swim_quality_day?: number;
  /** Mid-week run quality (tempo / threshold / intervals). Default: Wednesday. */
  run_quality_day?: number;
  /** Mid-week easy aerobic run. Default: Friday. */
  run_easy_day?: number;
  /** Mid-week bike quality (threshold / tempo / sweet spot). Default: Tuesday. */
  bike_quality_day?: number;
  /** Mid-week easy aerobic bike (second ride). Default: Wednesday. */
  bike_easy_day?: number;
  /** Strength system protocol id (e.g. triathlon, neural_speed, durability). */
  strength_protocol?: string;
  /** From Arc / goal: support = accessory loads for tri; performance = compound / %1RM progression. */
  strength_intent?: 'support' | 'performance';
  /** Preferred weekdays for strength (e.g. ["Monday","Wednesday"]) from preferred_days.strength. */
  strength_preferred_days?: string[];
  /** Whether the athlete has commercial gym access — drives strength exercise selection. */
  equipment_type?: 'home_gym' | 'commercial_gym';
  /**
   * Training methodology for triathlon goals. Derived from the primary goal's
   * `goal` field when absent: 'complete' → 'base_first', 'performance' → 'race_peak'.
   *
   * base_first  — Extended base phase, Z3 tempo quality, Z2 bricks, 2:1 loading.
   * race_peak   — Standard 8/8 split, threshold+VO2 quality, race-pace bricks, 3:1.
   */
  tri_approach?: 'base_first' | 'race_peak';
  /**
   * From goal flow / Arc post-race context. When `recovery_rebuild` (especially week 1),
   * combined plan caps run/bike endurance and drops strength intensity.
   */
  transition_mode?: 'peak_bridge' | 'recovery_rebuild' | 'fresh_build' | 'fitness_maintenance';
  /** Explicit low structural load (e.g. post-marathon). Week 1 honors hard caps even if phase is "build". */
  structural_load_hint?: 'low' | 'normal';
  /**
   * 0.42–1.0 from Arc swim history (`swim_training_from_workouts`). Scales swim minutes/yards
   * before session placement so returning swimmers are not dropped into full 70.3 swim share.
   */
  swim_volume_multiplier?: number;
}

export interface AthleteMemory {
  run_volume_ceiling?: number;   // max weekly run miles tolerated
  injury_hotspots?: string[];
  aerobic_floor_hr?: number;
  historical_peak_ctl?: number;
}

export interface CombinedPlanRequest {
  user_id: string;
  goals: GoalInput[];
  athlete_state: AthleteState;
  athlete_memory?: AthleteMemory;
  start_date?: string;
}

// ── Internal phase timeline ──────────────────────────────────────────────────

/**
 * Each entry describes one contiguous block of weeks with a fixed phase,
 * primary goal, and TSS target.
 */
export interface PhaseBlock {
  phase: Phase;
  startWeek: number;    // 1-indexed
  endWeek: number;
  primaryGoalId: string;
  isRecovery: boolean;
  tssMultiplier: number;  // 1.0 normal, 0.65 recovery, declining for taper
  sportDistribution: Partial<Record<Sport, number>>; // fractions summing ≤ 1
  weekInPhase?: number;  // current week within this phase (1-based), set by week-builder
}

export interface EventRelationship {
  type: 'sequential' | 'overlapping' | 'compressed' | 'single_peak';
  gapWeeks: number;
}

/** Calendar match for a goal’s event inside a 1-based plan week (combined multi-race). */
export interface RaceAnchor {
  goalId: string;
  eventName: string;
  eventDate: string; // YYYY-MM-DD
  planWeek: number; // 1-based
  dayName: string; // e.g. "Saturday" — matches `DAYS_OF_WEEK` in week-builder
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/** Serialized on plan rows for materialize-plan strength expansion. */
export interface PlannedStrengthExercise {
  name: string;
  sets?: number;
  reps?: number | string;
  weight?: string | number;
  percent_1rm?: number;
  load?: { percent_1rm?: number };
  target_rir?: number;
  notes?: string;
}

export interface PlannedSession {
  day: string;           // 'Monday' … 'Sunday'
  type: Sport;
  name: string;
  description: string;
  duration: number;      // minutes
  tss: number;           // raw sport TSS
  weighted_tss: number;  // tss × sport impact multiplier (§1.1)
  intensity_class: Intensity;
  steps_preset: string[];
  tags: string[];
  serves_goal: string;   // goal.id or 'shared'
  zone_targets: string;  // "Z2" | "Z4 intervals" | etc.
  timing?: 'AM' | 'PM';
  /** When set (e.g. neural_speed / triathlon protocol), activate-plan persists this and materialize uses it instead of token-derived exercises. */
  strength_exercises?: PlannedStrengthExercise[];
}

export interface GeneratedWeek {
  weekNum: number;
  phase: Phase;
  isRecovery: boolean;
  sessions: PlannedSession[];
  total_raw_tss: number;
  total_weighted_tss: number;
  sport_raw_tss: Record<Sport, number>;
  zone1_2_minutes: number;
  zone3_plus_minutes: number;
  eighty_twenty_ratio: number; // fraction of time at Z1-2
}

// ── Output ───────────────────────────────────────────────────────────────────

export interface PlanValidation {
  no_consecutive_hard_days: boolean;
  eighty_twenty_compliant: boolean;
  tss_within_budget: boolean;
  ramp_rate_safe: boolean;
  recovery_weeks_present: boolean;
  tapers_present: boolean;
  maintenance_floors_met: boolean;
  post_race_recovery_inserted: boolean;
  brick_placement_valid: boolean;
  run_impact_multiplier_applied: boolean;
  no_same_sport_hard_stacking: boolean;
  phase_progression_valid: boolean;
}

export interface CombinedPlanOutput {
  name: string;
  description: string;
  duration_weeks: number;
  sessions_by_week: Record<number, PlannedSession[]>;
  phase_blocks: PhaseBlock[];
  plan_contract: any;
  validation: PlanValidation;
}
