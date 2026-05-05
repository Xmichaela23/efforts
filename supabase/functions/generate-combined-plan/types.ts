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
  /** Third swim from Arc `preferred_days.swim[2]`; week-builder places only when `swim_intent === 'focus'`. */
  swim_third_day?: number;
  /** Mid-week run quality (tempo / threshold / intervals). Default: Wednesday. */
  run_quality_day?: number;
  /** Mid-week easy aerobic run. Default: Friday. */
  run_easy_day?: number;
  /** Mid-week bike quality (threshold / tempo / sweet spot). Default: Tuesday. */
  bike_quality_day?: number;
  /** Mid-week easy aerobic bike (second ride). Default: Wednesday. */
  bike_easy_day?: number;
  /** Arc-level athlete intent; used to gate performance-only scheduling exceptions. */
  training_intent?: 'completion' | 'performance' | 'first_race' | 'comeback';
  /**
   * Optional group-ride anchor duration override (hours). When present, this
   * takes precedence over phase defaults for anchored group-ride sessions.
   */
  bike_quality_group_ride_hours?: number;
  /**
   * Optional group-ride anchor duration override (minutes). Converted to hours
   * when `bike_quality_group_ride_hours` is not provided.
   */
  bike_quality_group_ride_minutes?: number;
  /** Optional GPX/route-estimated group-ride duration (hours). */
  bike_quality_route_estimated_hours?: number;
  /** Optional GPX/route-estimated group-ride duration (minutes). */
  bike_quality_route_estimated_minutes?: number;
  /**
   * Optional label appended to the mid-week quality bike when the athlete rides with a
   * recurring group ("Group Ride", "Hammer Ride"). Derived from training_prefs.notes.
   * When set, the session name surfaces it so the calendar matches the athlete's reality.
   */
  bike_quality_label?: string;
  /** Strength system protocol id (e.g. triathlon, neural_speed, durability). */
  strength_protocol?: string;
  /** From Arc / goal: support = accessory loads for tri; performance = compound / %1RM progression. */
  strength_intent?: 'support' | 'performance';
  /** Tri swim program from goal training_prefs: focus vs race-support (placement/volume in later steps). */
  swim_intent?: 'focus' | 'race';
  /**
   * Where the swim-focus load increase is funded from.
   * Only meaningful when `swim_intent === 'focus'`.
   * - `split`        — default 2:1 ratio (bike -4%, run -2%)
   * - `protect_run`  — all reduction from bike (bike -6%, run unchanged)
   * - `protect_bike` — all reduction from run (run -6%, bike unchanged)
   */
  swim_load_source?: 'split' | 'protect_run' | 'protect_bike';
  /** Preferred weekdays for strength (e.g. ["Monday","Wednesday"]) from preferred_days.strength. */
  strength_preferred_days?: string[];
  /**
   * When set (e.g. `co_equal_strength_provisional_1x` after optimizer recovery), caps
   * how many strength sessions `buildWeek` places per week (applied after phase default).
   */
  strength_sessions_cap?: number;
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
  /**
   * `low` = full post-race week-1 caps (marathon / IM / 70.3 / HM ≤14d).
   * `moderate` = shorter race or HM 15–20d — easy week-1 volume, no empty-week pattern.
   * `normal` = default.
   */
  structural_load_hint?: 'low' | 'moderate' | 'normal';
  /** Echo of training_prefs days_per_week (4–7) for diagnostics; optional. */
  days_per_week?: number;
  /**
   * 0.42–1.0 from Arc swim history (`swim_training_from_workouts`). Scales swim minutes/yards
   * before session placement so returning swimmers are not dropped into full 70.3 swim share.
   */
  swim_volume_multiplier?: number;
  /**
   * Athlete-recorded choices from the conflict resolution UI, keyed by `conflict_id`
   * (e.g. `"w3-quality-run-after-bike": "shift_quality_to_long_run"`).
   * `week-builder` reads this at each placement decision so recorded preferences are
   * honoured on regeneration without re-emitting the same conflict event.
   */
  conflict_preferences?: Record<string, string>;
  /** True when athlete has explicit cable machine access. Barbell-capable home gyms may lack one. */
  has_cable_machine?: boolean;
  /** True when athlete has a GHD, Nordic bench, or fixed floor anchor. Required before prescribing Nordic Hamstring Curls. */
  has_ghd?: boolean;
  /**
   * Per-athlete projected bike leg duration (hours) from goals.projection.bike_min.
   * When present, used instead of the hardcoded expectedBikeDurationHours() distance estimate
   * to set the long ride cap. Falls back to the hardcoded value when not yet computed.
   */
  projected_bike_hours?: number;
  /**
   * Athlete's response to the assessment week question in Arc setup chat.
   * - `assessment_first` → prepend a week-0 assessment block; all training weeks shift +1.
   * - `jump_in` → skip assessment; plan uses RPE-based intensity early, sharpens via adapt-plan.
   * - `undefined` / not set → treat as `jump_in` (no gate in chat or data was already sufficient).
   */
  assessment_week_preference?: 'assessment_first' | 'jump_in';
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
  /**
   * When true, build the same plan contract and sessions but do not insert a `plans` row.
   * Response includes `plan_contract_v1`, `sessions_by_week`, and `preview_mode: true`.
   */
  preview?: boolean;
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

/** Typed scheduling conflicts for downstream resolver (Arc); additive to week_trade_offs prose. */
export type ConflictType =
  | 'quality_run_blocked'
  | 'quality_swim_blocked'
  | 'quality_bike_blocked'
  | 'heavy_lower_blocked'
  | 'brick_blocked'
  | 'third_swim_blocked';

export type WeekStateReason =
  | 'consecutive_same_discipline'
  | 'consecutive_cross_discipline'
  | 'pre_long_run_48h'
  | 'pre_brick_48h'
  | 'no_clean_day'
  | 'recovery_week'
  | 'taper_week'
  | 'race_week'
  | 'post_race_rebuild'
  | 'anchor_conflict';

export type ConflictEvent = {
  conflict_id: string;
  conflict_type: ConflictType;
  blocked_intent: {
    session_kind: string;
    preferred_day?: string;
    intensity_class?: string;
  };
  blocking_reasons: WeekStateReason[];
  anchors_involved: string[];
  applied_resolution?: {
    type: 'moved' | 'consolidated' | 'dropped' | 'none';
    to_day?: string;
    note: string;
  };
};

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
  /** Athlete/coach-facing notes when 80/20 enforcement replaced a session (see enforce8020). */
  week_trade_offs?: string[];
  /** Structured conflicts / resolutions for resolver + Arc (week-builder only today). */
  conflict_events?: ConflictEvent[];
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
