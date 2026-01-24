// Stored in workouts.computed.adaptation (server-side)
export type AdaptationMetrics = {
  // Aerobic efficiency
  aerobic_efficiency?: number;
  avg_pace_at_z2?: number; // seconds per km
  avg_hr_in_z2?: number; // bpm
  workout_type?: 'easy_z2' | 'non_comparable';

  // Strength progression snapshot
  strength_exercises?: Array<{
    exercise: string;
    weight: number;
    avg_rir?: number | null;
    estimated_1rm: number;
  }>;

  // Metadata
  data_quality: 'excellent' | 'good' | 'fair' | 'poor';
  confidence: number; // 0..1
  computed_at: string;
};

export type BlockAdaptation = {
  aerobic_efficiency: {
    weekly_trend: Array<{
      week: number;
      avg_pace: number;
      avg_hr: number;
      avg_efficiency: number;
      sample_count: number;
    }>;
    improvement_pct: number | null;
    confidence: 'high' | 'medium' | 'low';
    sample_count: number;
    excluded_reasons?: Record<string, number>;
  };
  long_run_endurance?: {
    weekly_trend: Array<{
      week: number;
      avg_pace: number;
      avg_hr: number;
      avg_duration_min: number;
      sample_count: number;
    }>;
    sample_count: number;
    excluded_reasons?: Record<string, number>;
  };
  strength_progression: {
    by_exercise: Record<
      string,
      Array<{
        week: number;
        weight: number;
        avg_rir: number | null;
        estimated_1rm: number;
        sample_count: number;
      }>
    >;
    overall_gain_pct: number | null;
  };
  baseline_recommendations: Array<{
    type: string;
    current_value: number;
    recommended_value: number;
    confidence: number;
    evidence: string;
    impact: string;
  }>;
};

