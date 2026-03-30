import { useEffect, useState, useCallback } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';

export type CoachWeekContextV1 = {
  version: 1;
  as_of_date: string;
  week_start_date: string;
  week_end_date: string;
  methodology_id: string;
  plan: {
    has_active_plan: boolean;
    plan_id: string | null;
    plan_name: string | null;
    week_index: number | null;
    week_intent: string;
    week_focus_label: string | null;
    week_start_dow: string;
    athlete_context_for_week: string | null;
  };
  metrics: {
    wtd_planned_load: number | null;
    wtd_actual_load: number | null;
    wtd_completion_ratio: number | null;
    acute7_actual_load: number | null;
    chronic28_actual_load: number | null;
    acwr: number | null;
  };
  week: {
    planned_total_load: number | null;
    planned_remaining_load: number | null;
    key_sessions_remaining: Array<{
      date: string;
      type: string;
      name: string | null;
      category: string;
      workload_planned: number | null;
    }>;
  };
  reaction: {
    key_sessions_planned: number;
    key_sessions_completed: number;
    key_sessions_completion_ratio: number | null;
    key_sessions_linked: number;
    key_sessions_gaps: number;
    extra_sessions: number;
    key_quality_extras?: number;
    recovery_signaled_extras?: number;
    key_session_gaps_details: Array<{
      planned_id: string;
      date: string;
      type: string;
      name: string | null;
      category: string;
      workload_planned: number | null;
      skip_reason: string | null;
      skip_note: string | null;
    }>;
    extra_sessions_details: Array<{
      workout_id: string;
      date: string;
      type: string;
      name: string | null;
      workload_actual: number | null;
    }>;
    linking_confidence: {
      label: 'low' | 'medium' | 'high';
      score: number;
      explain: string;
    };
    avg_execution_score: number | null;
    execution_sample_size: number;
    hr_drift_avg_bpm: number | null;
    hr_drift_sample_size: number;
    avg_session_rpe_7d: number | null;
    rpe_sample_size_7d: number;
    avg_strength_rir_7d: number | null;
    rir_sample_size_7d: number;
  };
  baselines: {
    performance_numbers: Record<string, any> | null;
    effort_paces: Record<string, any> | null;
    learned_fitness: Record<string, any> | null;
    dismissed_suggestions?: Record<string, Record<string, string>> | null;
    learning_status: string | null;
    norms_28d: {
      hr_drift_avg_bpm: number | null;
      hr_drift_sample_size: number;
      session_rpe_avg: number | null;
      session_rpe_sample_size: number;
      strength_rir_avg: number | null;
      strength_rir_sample_size: number;
      execution_score_avg: number | null;
      execution_score_sample_size: number;
    };
  };
  response: {
    aerobic: {
      label: string;
      drift_avg_bpm: number | null;
      drift_norm_28d_bpm: number | null;
      drift_delta_bpm: number | null;
      sample_size: number;
    };
    structural: {
      label: string;
      strength_rir_7d: number | null;
      strength_rir_norm_28d: number | null;
      rir_delta: number | null;
      sample_size: number;
    };
    subjective: {
      label: string;
      rpe_7d: number | null;
      rpe_norm_28d: number | null;
      rpe_delta: number | null;
      sample_size: number;
    };
    absorption: {
      label: string;
      execution_score: number | null;
      execution_norm_28d: number | null;
      execution_delta: number | null;
      sample_size: number;
    };
    overall: {
      label: string;
      confidence: number;
      drivers: string[];
    };
    run_session_types_7d: Array<{
      type: string;
      sample_size: number;
      avg_execution_score: number | null;
      avg_hr_drift_bpm: number | null;
      avg_z2_percent: number | null;
      avg_interval_hr_creep_bpm: number | null;
      avg_decoupling_pct: number | null;
    }>;
  };
  training_state: {
    code: string;
    kicker: string;
    title: string;
    subtitle: string;
    confidence: number;
    baseline_days: number;
    load_ramp_acwr: number | null;
    load_ramp: {
      acute7_total_load: number | null;
      chronic28_total_load: number | null;
      acute7_by_type: Array<{
        type: string;
        total_sessions: number;
        total_load: number;
        linked_sessions: number;
        linked_load: number;
        extra_sessions: number;
        extra_load: number;
      }>;
      chronic28_by_type: Array<{
        type: string;
        total_sessions: number;
        total_load: number;
        linked_sessions: number;
        linked_load: number;
        extra_sessions: number;
        extra_load: number;
      }>;
      top_sessions_acute7: Array<{ date: string; type: string; name: string | null; workload_actual: number; linked: boolean }>;
    };
  };
  verdict: {
    code: string;
    label: string;
    confidence: number;
    reason_codes: string[];
  };
  next_action: {
    code: string;
    title: string;
    details: string;
  };
  evidence: Array<{ code: string; label: string; value: number | string; unit?: string }>;
  week_narrative: string | null;
  fitness_direction: 'improving' | 'stable' | 'declining' | 'mixed';
  baseline_drift_suggestions?: Array<{ lift: string; label: string; baseline: number; learned: number }>;
  plan_adaptation_suggestions?: Array<{ code: string; title: string; details: string }>;
  marathon_readiness?: {
    applicable: boolean;
    items: Array<{ id: string; label: string; pass: boolean; detail: string; value?: string | number }>;
    summary: 'on_track' | 'needs_work' | 'insufficient_data';
    summary_line?: string;
    context_note?: string | null;
  };
  readiness_state: 'fresh' | 'normal' | 'fatigued' | 'overreached' | 'detrained';
  interference: {
    aerobic: string;
    structural: string;
    status: 'interference_detected' | 'balanced';
    dominated_by: string | null;
    detail: string | null;
  } | null;
  weekly_state_v1: {
    version: 1;
    owner: 'coach';
    generated_at: string;
    as_of_date: string;
    week: {
      start_date: string;
      end_date: string;
      week_start_dow: string;
      index: number | null;
      intent: string;
      focus_label: string | null;
    };
    plan: {
      has_active_plan: boolean;
      plan_id: string | null;
      plan_name: string | null;
      athlete_context_for_week: string | null;
    };
    guards: {
      is_transition_window: boolean;
      suppress_deviation_language: boolean;
      suppress_baseline_deltas: boolean;
      show_trends: boolean;
      show_readiness: boolean;
    };
    glance: {
      training_state_code: string;
      training_state_title: string;
      training_state_subtitle: string;
      verdict_code: string;
      verdict_label: string;
      next_action_code: string;
      next_action_title: string;
      next_action_details: string;
      completion_ratio: number | null;
      key_sessions_linked: number;
      key_sessions_planned: number;
    };
    coach: {
      narrative: string | null;
      baseline_drift_suggestions?: Array<{ lift: string; label: string; baseline: number; learned: number }>;
      plan_adaptation_suggestions?: Array<{ code: string; title: string; details: string }>;
    };
    load: {
      wtd_planned_load: number | null;
      wtd_actual_load: number | null;
      acute7_actual_load: number | null;
      chronic28_actual_load: number | null;
      acwr: number | null;
      running_acwr: number | null;
      running_weighted_week_load: number | null;
      running_weighted_week_load_pct: number | null;
      unplanned_summary: string | null;
      by_discipline: Array<{
        discipline: string;
        planned_load: number | null;
        actual_load: number;
        extra_load: number;
        session_count: number;
      }>;
    };
    details: {
      reaction: CoachWeekContextV1['reaction'];
      response: CoachWeekContextV1['response'];
      marathon_readiness?: CoachWeekContextV1['marathon_readiness'];
      training_state: {
        code: string;
        kicker: string;
        title: string;
        subtitle: string;
        confidence: number;
        baseline_days: number;
        load_ramp_acwr: number | null;
        load_ramp: {
          acute7_total_load: number | null;
          chronic28_total_load: number | null;
          acute7_by_type: Array<{
            type: string;
            total_sessions: number;
            total_load: number;
            linked_sessions: number;
            linked_load: number;
            extra_sessions: number;
            extra_load: number;
          }>;
          chronic28_by_type: Array<{
            type: string;
            total_sessions: number;
            total_load: number;
            linked_sessions: number;
            linked_load: number;
            extra_sessions: number;
            extra_load: number;
          }>;
          top_sessions_acute7: Array<{ date: string; type: string; name: string | null; workload_actual: number; linked: boolean }>;
        };
      };
    };
  };
};

export function useCoachWeekContext(date?: string) {
  const focusDate = date || new Date().toLocaleDateString('en-CA');
  const [data, setData] = useState<CoachWeekContextV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCoach = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const userId = getStoredUserId();
      if (!userId) throw new Error('User not authenticated');

      const { data: resp, error: apiError } = await supabase.functions.invoke('coach', {
        body: {
          user_id: userId,
          date: focusDate,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

      if (apiError) throw apiError;
      if (!resp) throw new Error('No response from server');
      if (!(resp as any)?.weekly_state_v1) throw new Error('Weekly data contract missing');

      setData(resp as CoachWeekContextV1);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [focusDate]);

  useEffect(() => {
    fetchCoach();
  }, [fetchCoach]);

  return { data, loading, error, refresh: fetchCoach };
}

