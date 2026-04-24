// Coach Engine Contracts (Deterministic)
// V1 is intentionally small and stable so multiple screens can share it.

export type MethodologyId =
  | 'run:sustainable'
  | 'run:performance_build'
  | 'unknown';

export type WeekStartDow = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type WeekVerdictCode =
  | 'on_track'
  | 'caution_ramping_fast'
  | 'recover_overreaching'
  | 'undertraining'
  | 'insufficient_data';

export type NextActionCode =
  | 'proceed_as_planned'
  | 'swap_quality_for_easy'
  | 'take_rest_or_easy'
  | 'add_easy_volume'
  | 'insufficient_data';

export type KeySessionCategory =
  | 'run_long'
  | 'run_intervals'
  | 'run_tempo'
  | 'bike_long'
  | 'bike_vo2'
  | 'bike_threshold'
  | 'swim_endurance'
  | 'swim_technique'
  | 'strength'
  | 'other';

export type RunSessionType7d = {
  type: 'easy' | 'z2' | 'long' | 'tempo' | 'progressive' | 'fartlek' | 'intervals' | 'hills' | 'unknown';
  type_label: string;
  sample_size: number;
  avg_execution_score: number | null;
  avg_hr_drift_bpm: number | null;
  avg_z2_percent: number | null;
  avg_interval_hr_creep_bpm: number | null;
  avg_decoupling_pct: number | null;
  efficiency_label: string | null;
  efficiency_tone: 'positive' | 'warning' | 'danger' | 'neutral';
};

export type EvidenceItem = {
  code: string;
  label: string;
  value: number | string;
  unit?: string;
};

export type KeySessionItem = {
  date: string; // YYYY-MM-DD
  type: string;
  name: string | null;
  category: KeySessionCategory;
  workload_planned: number | null;
};

export type CoachWeekContextRequestV1 = {
  user_id: string;
  date?: string; // YYYY-MM-DD (defaults to today)
  timezone?: string;
  /** When true, bypass coach_cache read so narrative and metrics recompute (e.g. State refresh). */
  skip_cache?: boolean;
};

export type CoachWeekContextResponseV1 = {
  version: 1;
  /** Server-only cache invalidation: bump in coach/index when new top-level fields ship. */
  coach_payload_version?: number;
  as_of_date: string; // YYYY-MM-DD
  week_start_date: string; // YYYY-MM-DD
  week_end_date: string; // YYYY-MM-DD
  methodology_id: MethodologyId;
  plan: {
    has_active_plan: boolean;
    plan_id: string | null;
    plan_name: string | null;
    week_index: number | null;
    week_intent: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';
    week_focus_label: string | null;
    week_start_dow: WeekStartDow;
  };
  metrics: {
    // Workload points
    wtd_planned_load: number | null;
    wtd_actual_load: number | null;
    wtd_completion_ratio: number | null; // 0..1 (actual/planned)
    acute7_actual_load: number | null;
    chronic28_actual_load: number | null;
    acwr: number | null; // (acute/7)/(chronic/28)
  };
  week: {
    planned_total_load: number | null; // full week planned load (week window)
    planned_remaining_load: number | null; // planned load remaining from as_of_date (inclusive), excluding completed planned rows
    key_sessions_remaining: KeySessionItem[]; // from as_of_date (inclusive), excluding completed planned rows
  };
  reaction: {
    // How the athlete is responding to the plan's expectations this week.
    key_sessions_planned: number;
    key_sessions_completed: number;
    key_sessions_completion_ratio: number | null; // 0..1
    // Linking breakdown (WTD)
    key_sessions_linked: number; // planned key sessions that have a completed workout linked
    key_sessions_gaps: number; // planned key sessions without a linked completion
    extra_sessions: number; // completed sessions not linked to any planned workout
    key_quality_extras?: number; // extras that are key-quality (long/tempo/intervals); use for Key sessions display
    recovery_signaled_extras?: number; // extras where user signaled easy (RPE ≤4 or feeling great/good/ok)
    // Details for manual repair flows (IDs needed for explicit linking)
    key_session_gaps_details: Array<{
      planned_id: string;
      date: string; // YYYY-MM-DD
      type: string;
      name: string | null;
      category: KeySessionCategory;
      skip_reason: string | null;
      skip_note: string | null;
      workload_planned: number | null;
    }>;
    extra_sessions_details: Array<{
      workout_id: string;
      date: string; // YYYY-MM-DD
      type: string;
      name: string | null;
      workload_actual: number | null;
    }>;
    // A lightweight explanation for UI tooltips
    linking_confidence: {
      label: 'low' | 'medium' | 'high';
      score: number; // 0..1
      explain: string;
    };
    avg_execution_score: number | null; // 0..100 (from computed.overall.execution_score where available)
    execution_sample_size: number; // count of sessions contributing to avg_execution_score
    // Aerobic response (primarily running): cardiac drift and internal load markers
    hr_drift_avg_bpm: number | null;
    hr_drift_sample_size: number;
    // Subjective response: session RPE
    avg_session_rpe_7d: number | null; // 1..10
    rpe_sample_size_7d: number;
    // Structural response (primarily strength): RIR-based fatigue proxy
    avg_strength_rir_7d: number | null;
    rir_sample_size_7d: number;
  };
  baselines: {
    // Raw baselines (what we know about the athlete)
    performance_numbers: Record<string, any> | null;
    effort_paces: Record<string, any> | null;
    learned_fitness: Record<string, any> | null;
    learning_status: string | null;
    dismissed_suggestions?: Record<string, Record<string, string>> | null;
    // Personal norms (computed from last 28d)
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
  run_session_types_7d?: RunSessionType7d[];
  response_model?: import('../_shared/response-model/types.ts').WeeklyResponseState;
  goal_context?: import('../_shared/goal-context.ts').GoalContext;
  goal_prediction?: import('../_shared/goal-predictor/index.ts').GoalPredictionResult;
  race_readiness?: import('../_shared/race-readiness/index.ts').RaceReadinessV1 | null;
  /** Same resolver as terrain; State + Course Strategy read this (coach + coach_cache). */
  race_finish_projection_v1?: import('../_shared/resolve-server-predicted-finish.ts').RaceFinishProjectionV1 | null;
  /** Most recent ≥12mi run with session_detail_v1.race_readiness (State tab KEY RUN); null when gated or none. */
  primary_race_readiness?: {
    workout_id: string;
    workout_date: string;
    distance_miles: number;
    headline: string;
    tactical_instruction: string;
    projection: string;
  } | null;
  /**
   * Most recent completed event goal with an official result on `goals.current_value` (chip/elapsed seconds).
   * Used in State: actual time vs goal target; not shown when the athlete has no such completion yet.
   */
  last_completed_race?: {
    goal_id: string;
    name: string;
    target_date: string;
    /** Goal target clock at completion time (`goals.target_time`); null if unset. */
    goal_target_seconds: number | null;
    actual_seconds: number;
    /** When the result was recorded (ISO) or `target_date` if unknown. */
    completed_at: string;
  } | null;
  training_state: {
    // Deterministic, plan-aware topline (frontend should render this verbatim)
    code: 'strain_ok' | 'strained' | 'overstrained' | 'need_more_data';
    kicker: string; // e.g. "Build week • Response vs baseline"
    title: string; // e.g. "Strain looks right" | "Strained" | "Overstrained"
    subtitle: string; // one-line explanation, non-prescriptive
    confidence: number; // 0..1
    baseline_days: number; // typically 28
    load_ramp_acwr: number | null; // optional context (acute/chronic ratio)
    load_ramp: {
      // Explain "what was higher" using completed workouts only.
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
    code: WeekVerdictCode;
    label: string;
    confidence: number; // 0..1
    reason_codes: string[];
  };
  next_action: {
    code: NextActionCode;
    title: string;
    details: string;
  };
  evidence: EvidenceItem[];
  week_narrative: string | null;
  /** Phase 3: baseline drift suggestions (learned 1RM > baseline by 5%+) */
  baseline_drift_suggestions?: Array<{ lift: string; label: string; baseline: number; learned: number }>;
  /** Phase 3: plan adaptation (deload, add recovery when overreaching/fatigued) */
  plan_adaptation_suggestions?: Array<{ code: string; title: string; details: string }>;
  /** Phase 3.5: Marathon readiness checklist (assessment only, no suggestions) */
  marathon_readiness?: {
    applicable: boolean;
    items: Array<{ id: string; label: string; pass: boolean; detail: string; value?: string | number }>;
    summary: 'on_track' | 'needs_work' | 'insufficient_data';
    /** When athlete context mentions illness/injury and summary is needs_work */
    context_note?: string | null;
  };
  fitness_direction: 'improving' | 'stable' | 'declining' | 'mixed';
  readiness_state: 'fresh' | 'normal' | 'fatigued' | 'overreached' | 'detrained' | 'adapting';
  interference: {
    aerobic: string;
    structural: string;
    status: 'interference_detected' | 'balanced';
    dominated_by: string | null;
    detail: string | null;
  } | null;
  /**
   * Canonical weekly owner contract for smart-server / dumb-client migration.
   * Non-breaking: legacy fields above remain during rollout.
   */
  weekly_state_v1: {
    version: 1;
    owner: 'coach';
    generated_at: string;
    as_of_date: string;
    week: {
      start_date: string;
      end_date: string;
      week_start_dow: WeekStartDow;
      index: number | null;
      intent: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';
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
      training_state_code: 'strain_ok' | 'strained' | 'overstrained' | 'need_more_data';
      training_state_title: string;
      training_state_subtitle: string;
      verdict_code: WeekVerdictCode;
      verdict_label: string;
      next_action_code: NextActionCode;
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
      /** Deterministic taper/race-window cues from logged training + plan (not LLM). */
      grounded_race_week_guidance_v1?: { title: string; bullets: string[] };
    };
    /**
     * Server-authored State header copy when no plan is active. Arc-grounded.
     * Replaces hard-coded `aimlessHeadline` / `aimlessSubtext` / "No current goals — Create new goal" client strings.
     * Null when a plan is running — in that case the header uses `intent_summary` + `coach.narrative`.
     */
    empty_state?: {
      headline: string;
      subtitle: string;
      cta_label: string;
      cta_action: 'create_goal' | 'plan_season' | 'none';
    } | null;
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
      }>;
    };
    trends: {
      fitness_direction: 'improving' | 'stable' | 'declining' | 'mixed';
      readiness_state: 'fresh' | 'normal' | 'fatigued' | 'overreached' | 'detrained' | 'adapting';
      readiness_label: string | null;
      signals: Array<{
        metric: 'aerobic_efficiency' | 'strength_reserve' | 'effort_level' | 'execution_quality';
        direction: 'improving' | 'stable' | 'declining';
        magnitude: 'slight' | 'notable';
        delta: number | null;
      }>;
    };
    details: {
      evidence: EvidenceItem[];
      reaction: CoachWeekContextResponseV1['reaction'];
      training_state: CoachWeekContextResponseV1['training_state'];
      marathon_readiness?: CoachWeekContextResponseV1['marathon_readiness'];
      interference: CoachWeekContextResponseV1['interference'];
    };
    longitudinal_signals?: Array<{
      id: string;
      category: 'is_it_working' | 'adherence' | 'pattern';
      severity: 'info' | 'warning' | 'concern';
      headline: string;
      detail: string;
    }>;
    run_session_types_7d?: RunSessionType7d[];
    response_model?: import('../_shared/response-model/types.ts').WeeklyResponseState;
    race_finish_projection_v1?: import('../_shared/resolve-server-predicted-finish.ts').RaceFinishProjectionV1 | null;
  };
};

