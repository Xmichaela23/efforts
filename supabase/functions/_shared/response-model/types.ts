// =============================================================================
// UNIFIED RESPONSE MODEL — Types
// =============================================================================
// Single source of truth for how the athlete's body is responding to training.
// Consumed by both week (7d) and block (28d) views.
// =============================================================================

export const MIN_SAMPLES_FOR_SIGNAL = 3;
export const MIN_SAMPLES_FOR_TREND = 2; // per-lift minimum for strength trends
export const BASELINE_WINDOW_DAYS = 28;

// ---------------------------------------------------------------------------
// Signal trend labels
// ---------------------------------------------------------------------------

export type TrendDirection = 'improving' | 'stable' | 'declining';
export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type SignalTrend = {
  trend: TrendDirection;
  delta: number | null;
  delta_display: string;
  samples: number;
  sufficient: boolean; // true when samples >= MIN_SAMPLES_FOR_SIGNAL
};

// ---------------------------------------------------------------------------
// Endurance response
// ---------------------------------------------------------------------------

export type EnduranceResponse = {
  cardiac_efficiency: SignalTrend & {
    current_pace_at_hr: number | null;     // sec/mi at Z2 HR
    baseline_pace_at_hr: number | null;
  };
  hr_drift: SignalTrend & {
    current_avg_bpm: number | null;
    baseline_avg_bpm: number | null;
  };
  execution: SignalTrend & {
    current_score: number | null;          // 0..100
    baseline_score: number | null;
  };
  rpe: SignalTrend & {
    current_avg: number | null;            // 1..10
    baseline_avg: number | null;
  };
};

// ---------------------------------------------------------------------------
// Strength response
// ---------------------------------------------------------------------------

export type LiftVerdictTone = 'action' | 'caution' | 'positive' | 'neutral' | 'muted';

export type LiftTrend = {
  canonical_name: string;
  display_name: string;
  e1rm_trend: TrendDirection;
  e1rm_current: number | null;
  e1rm_previous: number | null;
  e1rm_delta_pct: number | null;
  rir_trend: TrendDirection;
  rir_current: number | null;
  rir_baseline: number | null;
  rir_delta: number | null;
  /** Protocol-derived target RIR. Null when no protocol context. */
  rir_target: number | null;
  samples: number;
  sufficient: boolean;
  /** Server-computed plan-intent-aware action label. Client renders verbatim. */
  verdict_label: string;
  verdict_tone: LiftVerdictTone;
  /** Most recent top working weight logged (lbs/kg). */
  best_weight: number | null;
  /** Server-computed next weight when verdict is actionable. Null when no change needed. */
  suggested_weight: number | null;
};

export type StrengthResponse = {
  per_lift: LiftTrend[];
  overall: {
    trend: 'gaining' | 'maintaining' | 'declining' | 'insufficient_data';
    headline_delta: string;
    lifts_gaining: number;
    lifts_declining: number;
    lifts_maintaining: number;
  };
};

// ---------------------------------------------------------------------------
// Cross-domain (strength ↔ endurance interference)
// ---------------------------------------------------------------------------

export type CrossDomainResponse = {
  interference_detected: boolean;
  patterns: CrossDomainPattern[];
};

export type CrossDomainPattern = {
  code: 'post_strength_hr_elevated' | 'post_strength_pace_reduced' |
        'endurance_volume_strength_decline' | 'concurrent_gains';
  description: string;
  magnitude: 'slight' | 'notable';
  data: {
    avg_delta: number;
    sample_pairs: number;
  };
};

// ---------------------------------------------------------------------------
// Load context
// ---------------------------------------------------------------------------

export type LoadContext = {
  acwr: number | null;
  acwr_status: 'detrained' | 'undertrained' | 'optimal' | 'elevated' | 'high_risk' | 'unknown';
  week_vs_plan_pct: number | null;
  consecutive_training_days: number;
  acute7_load: number | null;
  chronic28_load: number | null;
};

// ---------------------------------------------------------------------------
// Overall assessment
// ---------------------------------------------------------------------------

export type AssessmentLabel = 'responding' | 'stagnating' | 'overreaching' | 'insufficient_data';
export type AssessmentTone = 'positive' | 'warning' | 'danger' | 'neutral';

export type Assessment = {
  label: AssessmentLabel;
  title: string;        // pre-computed display title for the client
  tone: AssessmentTone;  // client maps to color — no logic needed
  primary_driver: string | null;
  confidence: ConfidenceLevel;
  explain: string;
  signals_available: number;
  signals_concerning: number;
};

// ---------------------------------------------------------------------------
// Server-computed presentation (dumb client renders verbatim)
// ---------------------------------------------------------------------------

export type VisibleSignal = {
  label: string;
  category: 'endurance' | 'strength';
  trend: TrendDirection;
  trend_icon: '↑' | '↓' | '—';
  trend_tone: 'positive' | 'warning' | 'danger' | 'neutral';
  detail: string;
  samples: number;
  samples_label: string; // "3 runs", "4 sessions", "2 weeks"
  value_display?: string;
};

export type ContextPrompt = {
  show: boolean;
  question: string | null;
  tags: Array<{ id: string; label: string; emoji: string }>;
};

export type GoalSummary = {
  primary_race: { name: string; date: string; weeks_out: number; distance: string; sport: string } | null;
  race_count: number;
  has_plan: boolean;
};

export type WeekHeadline = {
  text: string;
  subtext: string;
};

/** Holistic week read when granular run signals are missing — runs, rides, strength, load, plan intent. */
export type OverallTrainingRead = {
  summary: string;
  tone: 'positive' | 'warning' | 'neutral' | 'info';
};

/**
 * Server-authored copy for the State header when the athlete has no active plan, no upcoming
 * event, and no recent race result. Replaces hard-coded client strings (`aimlessHeadline`,
 * `aimlessSubtext`, "No current goals — Create new goal").
 *
 * Arc-grounded: phase, recent races, and goal stack drive the wording so the client just renders.
 */
export type EmptyState = {
  headline: string;
  subtitle: string;
  cta_label: string;
  cta_action: 'create_goal' | 'plan_season' | 'none';
};

/**
 * Subset of ArcContext that the response model needs. Defined here (not imported from
 * arc-context.ts) to keep `_shared/response-model` independent of edge-function types.
 */
export type ArcInputsForResponse = {
  current_phase: 'recovery' | 'build' | 'maintenance' | 'taper' | 'unknown' | null;
  active_goals: Array<{
    id: string;
    name: string;
    target_date: string | null;
    sport: string | null;
    distance: string | null;
    goal_type?: string | null;
  }>;
  recent_completed_events: Array<{
    id: string;
    name: string;
    sport: string;
    distance: string;
    target_date: string;
    days_ago: number;
    finish_time_seconds: number | null;
  }>;
  active_plan: {
    plan_id: string;
    week_number: number | null;
    phase: string | null;
    discipline: string | null;
  } | null;
};

export type BlockHeadline = {
  text: string;       // "Your aerobic fitness is improving and strength is progressing."
  subtext: string;
};

// ---------------------------------------------------------------------------
// Weekly ResponseState (7d window, compared to 28d baseline)
// ---------------------------------------------------------------------------

export type WeeklyResponseState = {
  window: '7d';
  as_of_date: string;
  endurance: EnduranceResponse;
  strength: StrengthResponse;
  cross_domain: CrossDomainResponse;
  load: LoadContext;
  assessment: Assessment;
  // Server-computed presentation — client renders verbatim
  headline: WeekHeadline;
  visible_signals: VisibleSignal[];
  /** Holistic week line; clients show only when they render no endurance visible_signals. */
  overall_training_read: OverallTrainingRead;
  /** Server-authored State header copy when no plan/goal/event is active. Null when a plan or event drives the screen. */
  empty_state: EmptyState | null;
  context_prompt: ContextPrompt;
  goal_summary: GoalSummary | null;
  plan_context: {
    week_index: number | null;
    week_intent: string;
    total_weeks: number | null;
    plan_name: string | null;
    is_transition_period: boolean;
  } | null;
};

// ---------------------------------------------------------------------------
// Block ResponseState (28d window, 4-week trends)
// ---------------------------------------------------------------------------

export type BlockResponseState = {
  window: '28d';
  block_start_date: string;
  block_end_date: string;
  endurance: EnduranceResponse & {
    weekly_efficiency_trend: Array<{
      week: number;
      avg_pace: number;
      avg_hr: number;
      efficiency: number;
      samples: number;
    }>;
  };
  strength: StrengthResponse & {
    weekly_1rm_trend: Record<string, Array<{
      week: number;
      estimated_1rm: number;
      avg_rir: number | null;
      samples: number;
    }>>;
  };
  cross_domain: CrossDomainResponse;
  assessment: Assessment;
  // Server-computed presentation — client renders verbatim
  headline: BlockHeadline;
  visible_signals: VisibleSignal[];
  plan_context: {
    weeks_in_block: number;
    intents: string[];
    plan_name: string | null;
  } | null;
};

// ---------------------------------------------------------------------------
// Inputs to the response model (pre-fetched by caller)
// ---------------------------------------------------------------------------

export type WeeklySignalInputs = {
  hr_drift_avg_bpm: number | null;
  hr_drift_sample_size: number;
  avg_execution_score: number | null;
  execution_sample_size: number;
  avg_session_rpe_7d: number | null;
  rpe_sample_size_7d: number;
  avg_strength_rir_7d: number | null;
  rir_sample_size_7d: number;
  cardiac_efficiency_current: number | null;
  cardiac_efficiency_sample_size: number;
};

export type BaselineNorms = {
  hr_drift_avg_bpm: number | null;
  hr_drift_sample_size: number;
  session_rpe_avg: number | null;
  session_rpe_sample_size: number;
  strength_rir_avg: number | null;
  strength_rir_sample_size: number;
  execution_score_avg: number | null;
  execution_score_sample_size: number;
  cardiac_efficiency_avg: number | null;
  cardiac_efficiency_sample_size: number;
};

export type StrengthLiftSnapshot = {
  canonical_name: string;
  display_name: string;
  current_e1rm: number | null;
  previous_e1rm: number | null;     // from 4 weeks ago or earliest available
  current_avg_rir: number | null;
  baseline_avg_rir: number | null;
  /** Protocol-derived target RIR for this lift. Null when protocol is unknown. */
  target_rir: number | null;
  sessions_in_window: number;
  best_weight: number | null;       // most recent top working weight logged
};

export type CrossDomainPair = {
  strength_date: string;
  strength_workload: number;
  strength_focus: 'upper' | 'lower' | 'full' | 'unknown';
  next_endurance_date: string;
  next_endurance_hr_at_pace: number | null;
  next_endurance_execution: number | null;
  baseline_hr_at_pace: number | null;
  baseline_execution: number | null;
};
