// Shared types for deterministic workout fact packets (v1).
// Keep this file dependency-free (no Supabase imports).

export type HeatStressLevel = 'none' | 'mild' | 'moderate' | 'severe';
export type TerrainType = 'flat' | 'rolling' | 'hilly';

export type FlagType = 'positive' | 'neutral' | 'concern';

export type FactPacketLimiter =
  | 'heat'
  | 'fatigue'
  | 'terrain'
  | 'pacing_error'
  | 'fitness_gap'
  | null;

export type StimulusConfidence = 'high' | 'medium' | 'low';

export type TrendDirection = 'improving' | 'stable' | 'declining' | 'insufficient_data';
export type SimilarAssessment = 'better_than_usual' | 'typical' | 'worse_than_usual' | 'insufficient_data';

export type HrZone = {
  label: string; // "Z1", "Z2", ...
  minBpm: number;
  maxBpm: number;
};

export type WorkoutSegmentV1 = {
  name: string;
  distance_mi: number;
  pace_sec_per_mi: number;
  target_pace_sec_per_mi: number | null;
  pace_deviation_sec: number | null; // positive = slower than target
  avg_hr: number | null;
  max_hr: number | null;
  hr_zone: string | null; // "Z1", "Z2", ...
  duration_s: number | null;
};

export type WeatherV1 = {
  /** Session-representative temp: avg over workout window when available, else point reading. */
  temperature_f: number;
  /** Open-Meteo hourly temps (°F) across workout window — null when unknown / device-only. */
  temp_start_f?: number | null;
  temp_end_f?: number | null;
  temp_peak_f?: number | null;
  temp_avg_f?: number | null;
  humidity_pct: number;
  dew_point_f: number;
  heat_stress_level: HeatStressLevel;
  wind_mph: number | null;
  conditions: string | null;
  source: 'device' | 'openmeteo';
};

export type PlanV1 = {
  name: string;
  week_number: number | null;
  phase: string | null; // "base" | "build" | ...
  week_focus_label?: string | null; // e.g. "Race-specific work" from plan weekly summaries
  workout_purpose: string | null;
  days_until_race: number | null;
  // Optional plan-week context (drives recovery integrity flags/limiter).
  week_intent?: string | null; // e.g. "recovery" | "build"
  is_recovery_week?: boolean | null;
};

export type TrainingLoadV1 = {
  previous_day_workload: number;
  previous_day_type: string | null;
  /** Consecutive calendar days (before workout day) that pass the training-day threshold; all modalities count. */
  consecutive_training_days: number;
  /** Sum of workload_actual across those streak days (same units as per-workout load). */
  streak_combined_workload: number;
  /** Session counts in the streak, e.g. "3× run, 1× strength, 1× ride" — use for nuanced fatigue copy. */
  streak_modality_summary: string | null;
  /** What dominated yesterday (before this workout): endurance | strength | mixed | other | null */
  previous_day_athletic_focus: 'endurance' | 'strength' | 'mixed' | 'other' | null;
  week_load_pct: number | null;
  acwr_ratio: number | null;
  acwr_status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk' | null;
  cumulative_fatigue: 'low' | 'moderate' | 'high';
  fatigue_evidence: string[];
};

export type VsSimilarV1 = {
  sample_size: number;
  pace_delta_sec: number | null; // current - avg past; negative=faster
  hr_delta_bpm: number | null; // current - avg past
  drift_delta_bpm: number | null; // current - avg past
  assessment: SimilarAssessment;
  /**
   * D-038 Piece 2 — diagnostic: did the pace-proximity filter actually fire?
   * Lets us inspect filter behavior on any session without re-running the
   * pool. Tune the 15% threshold via this field's aggregate after 2 weeks
   * of production observation.
   */
  pool_intensity_filter?: {
    applied: boolean;
    tolerance_pct: number;
    basis: 'gap' | 'raw';
    pool_size_before: number;
    pool_size_after: number;
  } | null;
  /**
   * D-038 Piece 3 — LLM-facing context: was the pool intensity comparable to
   * the current session? Always populated when sample_size > 0. Enables the
   * POOL INTENSITY CONTEXT prompt rule to suppress fatigue/recovery framing
   * when the HR delta is driven by current/pool pace mismatch. The
   * `intensity_match` enum is the primary LLM signal; numeric fields are
   * diagnostic and must not be quoted in narrative output.
   */
  pool_pace_context?: {
    current_avg_pace_sec: number;
    pool_avg_pace_sec: number;
    delta_sec: number;          // current - pool; negative = current faster
    delta_pct: number;           // delta / pool, signed percentage
    basis: 'gap' | 'raw';
    intensity_match: 'matched' | 'current_much_faster' | 'current_much_slower';
  } | null;
  /**
   * D-041 Fix D — true when the TREND pool includes points dated before a
   * recent (≤60d) completed goal race, AND the post-race-only filter would
   * have dropped the pool below the 3-point minimum. Tells the LLM (via the
   * TREND POOL RACE BOUNDARY prompt rule) to treat trend direction as a
   * limited-sample observation, not a fitness signal — pre-race points
   * reflect peak-taper fitness, not the current training phase.
   */
  trend_pool_crosses_race_boundary?: boolean;
};

export type TrendV1 = {
  data_points: number;
  direction: TrendDirection;
  magnitude: string | null;
};

export type AchievementV1 = {
  type: string;
  description: string;
  significance: 'minor' | 'moderate' | 'major';
};

export type StimulusAssessmentV1 = {
  achieved: boolean;
  confidence: StimulusConfidence;
  evidence: string[];
  partial_credit: string | null;
};

export type LimiterAssessmentV1 = {
  limiter: FactPacketLimiter;
  evidence: string[];
  confidence: number; // 0..1
};

export type ContributorV1 = {
  limiter: string;
  evidence: string[];
};

export type FlagV1 = {
  type: FlagType;
  category: string;
  message: string;
  priority: number; // 1 = most important
};

export type AthleteReportedV1 = {
  rpe: number | null; // 1-10
  feeling: 'great' | 'good' | 'ok' | 'tired' | 'exhausted' | null;
};

export type DriftExplanation = 'pace_driven' | 'cardiac_drift' | 'terrain_driven' | 'mixed';

export type FactPacketV1 = {
  version: 1;
  generated_at: string; // ISO
  inputs_present: string[];
  facts: {
    workout_type: string;
    total_distance_mi: number;
    total_duration_min: number;
    avg_pace_sec_per_mi: number | null;
    avg_hr: number | null;
    max_hr: number | null;
    elevation_gain_ft: number | null;
    terrain_type: TerrainType;
    segments: WorkoutSegmentV1[];
    weather: WeatherV1 | null;
    plan: PlanV1 | null;
    athlete_reported: AthleteReportedV1 | null;
  };
  derived: {
    execution?: {
      /** (actual - planned) / planned * 100; null when no planned distance. */
      distance_deviation_pct: number | null;
      /** True when abs(distance_deviation_pct) >= 30. */
      intentional_deviation: boolean;
      /** Whether we should assess strain vs plan-following. */
      assessed_against: 'plan' | 'actual';
      /** Optional short note for UI/LLM (no new computations required). */
      note?: string | null;
    };
    hr_drift_bpm: number | null;
    /** Raw drift before terrain adjustment; null when no terrain adjustment was applied. */
    raw_hr_drift_bpm: number | null;
    /** Estimated bpm of drift attributable to terrain (grade changes between early/late windows). */
    terrain_contribution_bpm: number | null;
    /** Drift after removing the expected HR increase from pace changes between halves.
     *  Near zero on a negative-split run where HR tracked pace proportionally. */
    pace_normalized_drift_bpm: number | null;
    /** What primarily explains the observed HR increase across the session. */
    drift_explanation: DriftExplanation | null;
    hr_drift_typical: number | null;
    cardiac_decoupling_pct: number | null;
    /**
     * D-036: which pace series fed cardiac_decoupling_pct.
     * 'gap' = grade-adjusted pace (terrain-neutral; treat the value as a real
     * cardiovascular efficiency signal).
     * 'raw' = raw pace (terrain confound present; treat as inconclusive).
     * null = decoupling not computed (interval workout, < 20 min, cycling).
     */
    decoupling_basis?: 'gap' | 'raw' | null;
    /** D-036: 'excellent' (<3%) | 'good' (<5%) | 'moderate' (<8%) | 'high' (≥8%) | null. */
    decoupling_assessment?: 'excellent' | 'good' | 'moderate' | 'high' | null;
    pace_fade_pct: number | null;
    pacing_pattern?: {
      speedups_note: string | null;
    };
    training_load: TrainingLoadV1 | null;
    comparisons: {
      vs_similar: VsSimilarV1;
      trend: TrendV1;
      achievements: AchievementV1[];
    };
    stimulus: StimulusAssessmentV1 | null;
    primary_limiter: LimiterAssessmentV1;
    contributing_limiters: ContributorV1[];
    terrain_context?: {
      terrain_class: string | null;
      segment_matches: number;
      segment_insight_eligible: boolean;
      segment_trend_eligible: boolean;
    } | null;
  };
};

