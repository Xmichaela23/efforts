// =============================================================================
// SESSION_DETAIL_V1 — Server-computed session view for MobileSummary
// =============================================================================
// Built by workout-detail from AthleteSnapshot session slice + workout_analysis.
// Client renders this as-is. No local computation.
// =============================================================================

export type EnduranceMatchQuality =
  | 'followed' | 'shorter' | 'longer' | 'harder' | 'easier' | 'modified' | 'skipped' | 'unplanned';

export type StrengthMatchQuality =
  | 'followed' | 'dialed_back' | 'pushed_hard' | 'modified' | 'skipped' | 'unplanned';

export type SessionDetailV1 = {
  version: 1;
  generated_at: string;
  workout_id: string;
  date: string;
  type: 'run' | 'ride' | 'swim' | 'strength' | 'mobility';
  name: string;

  plan_context: {
    planned_id: string | null;
    planned: {
      planned_id: string;
      type: string;
      name: string;
      prescription: string;
      duration_seconds: number | null;
      distance_meters: number | null;
      load_planned: number | null;
      strength_prescription: Array<{ exercise: string; sets: number; reps: string; notes: string | null }> | null;
    } | null;
    match: {
      endurance_quality: EnduranceMatchQuality | null;
      strength_quality: StrengthMatchQuality | null;
      summary: string;
    } | null;
  };

  execution: {
    execution_score: number | null;
    pace_adherence: number | null;
    power_adherence: number | null;
    duration_adherence: number | null;
    performance_assessment: string | null;
    assessed_against: 'plan' | 'actual' | null;
    status_label: string | null;
  };

  observations: string[];
  narrative_text: string | null;

  intervals: Array<{
    id: string;
    interval_type: 'warmup' | 'work' | 'recovery' | 'cooldown';
    interval_number?: number;
    recovery_number?: number;
    planned_label: string;
    planned_duration_s: number | null;
    planned_pace_range?: { lower_sec_per_mi: number; upper_sec_per_mi: number };
    executed: {
      duration_s: number | null;
      distance_m: number | null;
      avg_hr: number | null;
      actual_pace_sec_per_mi?: number | null;
    };
    pace_adherence_pct?: number | null;
    duration_adherence_pct?: number | null;
  }>;

  display: {
    show_adherence_chips: boolean;
    interval_display_reason: string | null;
    has_measured_execution: boolean;
  };
};
