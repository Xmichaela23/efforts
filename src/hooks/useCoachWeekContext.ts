import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';

/** Same contract as coach + course-detail (terrain). */
export type RaceFinishProjectionV1 = {
  goal_id: string;
  anchor_seconds: number;
  anchor_display: string;
  source_kind: 'coach_readiness' | 'plan_target' | 'baseline_vdot' | 'fitness_floors_stated_goal';
  plan_goal_seconds: number | null;
  plan_goal_display: string | null;
  mismatch_blurb: string | null;
};

export type RaceReadinessV1 = {
  goal: {
    id?: string | null;
    name: string;
    distance: string;
    target_date: string;
    weeks_out: number;
  };
  predicted_finish_time_seconds: number;
  predicted_finish_display: string;
  predicted_race_pace_display: string;
  target_finish_time_seconds: number | null;
  target_finish_display: string | null;
  delta_seconds: number | null;
  delta_display: string | null;
  assessment: 'on_track' | 'ahead' | 'behind' | 'well_behind';
  assessment_message: string;
  current_vdot: number;
  plan_vdot: number | null;
  vdot_delta: number | null;
  vdot_direction: 'improved' | 'declined' | 'stable';
  training_signals: Array<{ label: string; value: string; tone: 'positive' | 'neutral' | 'warning' }>;
  pace_zones: { easy: string; threshold: string; race: string };
  data_source: 'observed' | 'plan_targets';
  durability_factor: number;
  confidence_adjustment_pct: number;
  drift_delta: number | null;
};

export type CoachWeekContextV1 = {
  version: 1;
  /** Present on fresh coach responses; old coach_cache rows omit this. */
  coach_payload_version?: number;
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
  readiness_state: 'fresh' | 'normal' | 'fatigued' | 'overreached' | 'detrained' | 'adapting';
  /** Server goal list + primary future event; used for State RACE labels when projection goal differs from primary_event. */
  goal_context?: {
    goals: Array<{
      id: string;
      name: string;
      sport?: string | null;
      distance?: string | null;
      target_time?: number | null;
      target_date?: string | null;
    }>;
    primary_event?: {
      id?: string;
      name: string;
      sport?: string | null;
      distance?: string | null;
      target_time?: number | null;
    } | null;
    upcoming_races?: Array<{ name: string; weeks_out: number }>;
  };
  race_readiness?: RaceReadinessV1 | null;
  race_finish_projection_v1?: RaceFinishProjectionV1 | null;
  /** State tab KEY RUN — most recent ≥12mi run with Performance race_readiness */
  primary_race_readiness?: {
    workout_id: string;
    workout_date: string;
    distance_miles: number;
    headline: string;
    tactical_instruction: string;
    projection: string;
  } | null;
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
      intent_summary: string | null;
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
      grounded_race_week_guidance_v1?: { title: string; bullets: string[] };
    };
    load: {
      wtd_planned_load: number | null;
      wtd_actual_load: number | null;
      acute7_actual_load: number | null;
      chronic28_actual_load: number | null;
      acwr: number | null;
      label: string | null;
      running_acwr: number | null;
      run_only_week_load: number | null;
      run_only_week_load_pct: number | null;
      running_weighted_week_load: number | null;
      running_weighted_week_load_pct: number | null;
      unplanned_summary: string | null;
      by_discipline: Array<{
        discipline: string;
        planned_load: number | null;
        actual_load: number;
        extra_load: number;
        session_count: number;
        maturity?: 'building' | 'learning' | 'established' | null;
        acwr?: number | null;
      }>;
      daily_load_7d: Array<{ date: string; load: number; dominant_type: string; by_type?: Array<{ type: string; load: number }> }>;
      hr_drift_series: Array<{ date: string; drift_bpm: number }>;
      cross_training_signal?: { label: string; tone: 'positive' | 'warning' | 'info' } | null;
    };
    trends: {
      fitness_direction: string;
      readiness_state: 'fresh' | 'normal' | 'fatigued' | 'overreached' | 'detrained' | 'adapting';
      readiness_label: string | null;
      signals: Array<{
        metric: string;
        direction: string;
        magnitude: string;
        delta: number | null;
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
    race_finish_projection_v1?: RaceFinishProjectionV1 | null;
  };
};

export function useCoachWeekContext(date?: string) {
  const focusDate = date || new Date().toLocaleDateString('en-CA');
  const [data, setData] = useState<CoachWeekContextV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCachedData = useRef(false);
  /** Avoid overlapping foreground coach+adapt calls (double-tap refresh). */
  const foregroundPipelineBusy = useRef(false);

  const runPipeline = useCallback(async (isBackground: boolean) => {
    if (!isBackground && foregroundPipelineBusy.current) return;
    if (!isBackground) foregroundPipelineBusy.current = true;
    try {
      if (isBackground) setRevalidating(true);
      else setLoading(true);
      setError(null);

      const userId = getStoredUserId();
      if (!userId) throw new Error('User not authenticated');

      const { data: resp, error: apiError } = await supabase.functions.invoke('coach', {
        body: {
          user_id: userId,
          date: focusDate,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          // Foreground refresh must bypass edge coach_cache or narrative stays frozen up to 24h.
          skip_cache: !isBackground,
        },
      });

      if (apiError) throw apiError;
      if (!resp) throw new Error('No response from server');
      if (!(resp as any)?.weekly_state_v1) throw new Error('Weekly data contract missing');

      let merged = resp as CoachWeekContextV1;

      // Only call adapt-plan suggest when there is an active plan (avoids extra latency for
      // athletes with no plan). Future: gate on fingerprint presence from coach if exposed.
      const hasActivePlan = Boolean(merged.weekly_state_v1?.plan?.has_active_plan);
      let adaptResult: { data: unknown; error: Error | null } = { data: null, error: null };
      if (hasActivePlan) {
        adaptResult = await supabase.functions.invoke('adapt-plan', {
          body: { user_id: userId, action: 'suggest' },
        });
      }

      // Merge strength relayout from adapt-plan suggest (same payload auto-adapt would persist).
      const adapt = adaptResult.data as {
        suggestions?: Array<{ id?: string; type?: string; title?: string; description?: string }>;
      } | null;
      const adaptErr = adaptResult.error;
      if (!adaptErr && adapt?.suggestions?.length) {
        const sr = adapt.suggestions.find(s => s.type === 'strength_relayout' || s.id === 'strength_relayout');
        if (sr) {
          const wsv = { ...(merged.weekly_state_v1 as CoachWeekContextV1['weekly_state_v1']) };
          const coach = { narrative: null, ...(wsv.coach || {}) };
          const base = [...(coach.plan_adaptation_suggestions ?? [])];
          if (!base.some(x => x.code === 'strength_relayout')) {
            coach.plan_adaptation_suggestions = [
              {
                code: 'strength_relayout',
                title: sr.title || 'Update strength to match this week',
                details: sr.description || '',
              },
              ...base,
            ];
            wsv.coach = coach;
            merged = {
              ...merged,
              weekly_state_v1: wsv,
              plan_adaptation_suggestions: coach.plan_adaptation_suggestions,
            };
          }
        }
      }

      setData(merged);
    } catch (e: any) {
      if (!isBackground) setError(e?.message || String(e));
    } finally {
      if (isBackground) setRevalidating(false);
      else setLoading(false);
      if (!isBackground) foregroundPipelineBusy.current = false;
    }
  }, [focusDate]);

  const fetchCoach = useCallback(() => runPipeline(false), [runPipeline]);

  useEffect(() => {
    hasCachedData.current = false;

    const userId = getStoredUserId();
    if (!userId) { runPipeline(false); return; }

    // 1. Read DB cache immediately — serve stale data with no spinner
    Promise.resolve(
      supabase
        .from('coach_cache')
        .select('payload')
        .eq('user_id', userId)
        .maybeSingle()
    ).then(({ data: row }) => {
      const p = row?.payload as CoachWeekContextV1 | undefined;
      const cacheVer = Number(p?.coach_payload_version ?? 0);
      // Must match coach/index COACH_PAYLOAD_VERSION — old DB rows skip hydrate until foreground coach runs.
      const MIN_CACHE_PAYLOAD_VERSION = 10;
      if (p && cacheVer >= MIN_CACHE_PAYLOAD_VERSION) {
        setData(p);
        hasCachedData.current = true;
        runPipeline(true);
      } else if (p) {
        // Stale schema: go straight to coach (edge will also miss cache until recomputed)
        runPipeline(false);
      } else {
        runPipeline(false);
      }
    }).catch(() => runPipeline(false));
  }, [focusDate]); // eslint-disable-line

  return { data, loading, revalidating, error, refresh: fetchCoach };
}

