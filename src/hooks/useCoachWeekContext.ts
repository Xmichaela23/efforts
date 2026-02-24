import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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
  readiness_state: 'fresh' | 'normal' | 'fatigued' | 'overreached' | 'detrained';
  interference: {
    aerobic: string;
    structural: string;
    status: 'interference_detected' | 'balanced';
    dominated_by: string | null;
    detail: string | null;
  } | null;
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

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) throw new Error('User not authenticated');

      const { data: resp, error: apiError } = await supabase.functions.invoke('coach', {
        body: {
          user_id: user.id,
          date: focusDate,
        },
      });

      if (apiError) throw apiError;
      if (!resp) throw new Error('No response from server');

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

