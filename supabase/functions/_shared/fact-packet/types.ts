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
  temperature_f: number;
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
  consecutive_training_days: number;
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
    hr_drift_typical: number | null;
    cardiac_decoupling_pct: number | null;
    pace_fade_pct: number | null;
    pacing_pattern?: {
      // Deterministic explanation for why pace may be faster/slower (e.g. downhill miles).
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
  };
};

