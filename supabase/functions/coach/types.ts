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
};

export type CoachWeekContextResponseV1 = {
  version: 1;
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
    // Details for manual repair flows (IDs needed for explicit linking)
    key_session_gaps_details: Array<{
      planned_id: string;
      date: string; // YYYY-MM-DD
      type: string;
      name: string | null;
      category: KeySessionCategory;
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
  response: {
    // Baseline-relative interpretation (what's valuable to know)
    aerobic: {
      label: 'efficient' | 'stable' | 'stressed' | 'unknown';
      drift_avg_bpm: number | null;
      drift_norm_28d_bpm: number | null;
      drift_delta_bpm: number | null; // current - norm (positive = more drift)
      sample_size: number;
    };
    structural: {
      label: 'fresh' | 'stable' | 'fatigued' | 'unknown';
      strength_rir_7d: number | null;
      strength_rir_norm_28d: number | null;
      rir_delta: number | null; // current - norm (negative = more fatigue)
      sample_size: number;
    };
    subjective: {
      label: 'good' | 'stable' | 'strained' | 'unknown';
      rpe_7d: number | null;
      rpe_norm_28d: number | null;
      rpe_delta: number | null; // current - norm (positive = more strain)
      sample_size: number;
    };
    absorption: {
      label: 'good' | 'stable' | 'slipping' | 'unknown';
      execution_score: number | null;
      execution_norm_28d: number | null;
      execution_delta: number | null; // current - norm (negative = worse)
      sample_size: number;
    };
    overall: {
      label: 'absorbing_well' | 'mixed_signals' | 'fatigue_signs' | 'need_more_data';
      confidence: number; // 0..1
      drivers: string[]; // deterministic codes
    };
    run_session_types_7d: Array<{
      type: 'easy' | 'z2' | 'long' | 'tempo' | 'progressive' | 'fartlek' | 'intervals' | 'hills' | 'unknown';
      sample_size: number;
      // Common signals (when available)
      avg_execution_score: number | null; // 0..100
      avg_hr_drift_bpm: number | null;
      avg_z2_percent: number | null; // 0..100
      // Interval-specific
      avg_interval_hr_creep_bpm: number | null;
      // Steady-specific
      avg_decoupling_pct: number | null;
    }>;
  };
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
};

