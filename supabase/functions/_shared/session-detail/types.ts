// =============================================================================
// SESSION_DETAIL_V1 — Server-computed session view for MobileSummary
// =============================================================================
// Built by workout-detail from AthleteSnapshot session slice + workout_analysis.
// Client renders this as-is. No local computation.
// =============================================================================

import type {
  BlockAlignmentV1,
  NarrativeCapsV1,
  NextSessionReadinessV1,
  PlanContextV1,
  ProtectedSessionRiskV1,
  WeekLoadStatusV1,
} from "../readiness-types.ts";
import type { ArcPerformanceBridgeV1 } from "./arc-performance-bridge.ts";

export type MuscularSummaryEntryV1 = {
  target: string;
  status: "fresh" | "manageable" | "compromised";
  residual_stress: number;
  top_sources?: Array<{
    workout_id: string;
    workout_date: string | null;
    workout_type: string | null;
    workout_name: string | null;
    share_pct: number;
  }>;
};

/** Trimmed readiness for clients (no per-target raw stress map). */
export type SessionDetailReadinessV1 = {
  degraded: boolean;
  degraded_reason: string | null;
  degraded_missing?: string[] | null;
  next_session_readiness: NextSessionReadinessV1 | null;
  muscular_summary: MuscularSummaryEntryV1[];
  plan_context: PlanContextV1 | null;
  week_load_status: WeekLoadStatusV1 | null;
  narrative_caps: NarrativeCapsV1 | null;
  protected_session_risks?: ProtectedSessionRiskV1[] | null;
  block_alignment?: BlockAlignmentV1 | null;
};

export type EnduranceMatchQuality =
  | 'followed' | 'shorter' | 'longer' | 'harder' | 'easier' | 'modified' | 'skipped' | 'unplanned';

export type StrengthMatchQuality =
  | 'on_target' | 'under_intensity' | 'over_intensity'
  | 'followed' | 'dialed_back' | 'pushed_hard' | 'modified' | 'skipped' | 'unplanned';

/** LLM output for Performance race-readiness block (strict JSON contract). */
export type SessionRaceReadinessLlmV1 = {
  headline: string;
  verdict: string;
  tactical_instruction: string;
  flag: string | null;
  projection: string;
  /** Taper execution guidance (not a volume prescription when plan already tapers). */
  taper_guidance: string;
};

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
    /** Pre-formatted week label for display, e.g. "Week 3 • Build". */
    week_label: string | null;
  };

  execution: {
    execution_score: number | null;
    pace_adherence: number | null;
    power_adherence: number | null;
    duration_adherence: number | null;
    performance_assessment: string | null;
    assessed_against: 'plan' | 'actual' | null;
    status_label: string | null;
    /** True when pace_adherence was scored on Grade-Adjusted Pace (Minetti model). */
    gap_adjusted?: boolean;
  };

  observations: string[];
  narrative_text: string | null;
  /**
   * Schedule-aware coaching note written at plan generation time. Surfaced in Today's Effort
   * and the planned workout screen. Informational only — does not gate anything.
   * Examples: "Intervals are 12-18h after your group ride", "Four hard sessions this week".
   */
  coaching_note?: string | null;
  /**
   * Compact Arc snapshot from `getArcContext` (workout date). Insights `narrative_text` is
   * athlete coaching copy only; `coaching_context` is tooling/LLM routing (not prefixed to narrative).
   */
  arc_performance?: ArcPerformanceBridgeV1 | null;
  /** LLM race debrief (goal race only); additive alongside adherence rows. */
  race_debrief_text: string | null;

  /** Populated for goal race sessions (from `session_state_v1.race` in analyze-running-workout). */
  race: {
    is_goal_race: boolean;
    goal_id: string | null;
    event_name: string;
    goal_time_seconds: number | null;
    fitness_projection_seconds: number | null;
    fitness_projection_display: string | null;
    /** Uniform target pace (sec/mi) from goal clock ÷ race distance. */
    goal_avg_pace_s_per_mi: number | null;
    /** Uniform pace (sec/mi) from model projected finish ÷ distance. */
    fitness_projection_avg_pace_s_per_mi: number | null;
    actual_seconds: number | null;
  } | null;

  // ── Summary (SessionNarrative) ────────────────────────────────────────────
  /** Pre-merged, deduped summary section. */
  summary: {
    title: string;
    /** session_state_v1.summary.bullets + observations, merged & deduped server-side. */
    bullets: string[];
  };

  // ── Completed & planned totals (AdherenceChips) ───────────────────────────
  completed_totals: {
    duration_s: number | null;
    distance_m: number | null;
    avg_pace_s_per_mi: number | null;
    avg_gap_s_per_mi: number | null;
    avg_hr: number | null;
    /** Swim: seconds per 100 (yd or m depending on swim_unit). */
    swim_pace_per_100_s: number | null;
    /** D-194: SWIM work:rest readout, preformatted (e.g. "Work 24:00 · Rest 11:00"). Null otherwise. */
    swim_work_rest: string | null;
  };
  planned_totals: {
    duration_s: number | null;
    distance_m: number | null;
    avg_pace_s_per_mi: number | null;
    swim_pace_per_100_s: number | null;
    swim_unit: 'yd' | 'm' | null;
  };
  /** Ride-start temperature from workouts.weather_data (temperature_start_f ??
   *  temperature). null when no weather data. Used by the cycling Performance
   *  stat line and the TERRAIN row. */
  weather: { temperature_f: number | null } | null;

  // ── Analysis details (SessionNarrative "Analysis Details" panel) ──────────
  /** Display-ready insight rows. Server picks + formats from fact_packet, flags, adherence_summary. */
  analysis_details: {
    rows: Array<{ label: string; value: string }>;
  };

  // ── Adherence narrative (SessionNarrative technical insights + plan impact) ─
  adherence: {
    technical_insights: Array<{ label: string; value: string }>;
    plan_impact_label: string | null;
    plan_impact_text: string | null;
  };

  // ── Interval display (EnduranceIntervalTable + MobileSummary) ─────────────
  /** Pre-resolved interval rows. Client renders, never resolves across sources. */
  intervals: IntervalRow[];
  intervals_display: {
    mode: 'interval_compare_ready' | 'overall_only' | 'awaiting_recompute' | 'none';
    reason: string | null;
  };

  // ── Classification flags (MobileSummary, EnduranceIntervalTable) ──────────
  classification: {
    is_structured_interval: boolean;
    is_easy_like: boolean;
    is_auto_lap_or_split: boolean;
    is_pool_swim: boolean;
    /**
     * D-041 Fix C: duration-derived workout_type from fact-packet facts
     * ("easy_run" | "long_run" | "tempo_run" | "interval_run" | "recovery_run"
     * | etc., or null). Soft descriptive label only — NEVER a target
     * (D-035 carryover). Client uses it as a label-only signal (e.g.
     * 'Steady' label override for single-segment long_run / easy_run).
     * Don't gate effort interpretation on this field downstream.
     */
    workout_type: string | null;
    /**
     * Variance gate (D-NNN). True when this session showed real effort variation —
     * intervals, fartlek, mixed-effort. Server-computed; client never derives.
     * When true, TREND/vs_similar comparisons exclude this row from steady pools,
     * and INSIGHTS interprets the intervals rather than comparing whole-workout
     * averages to easy history.
     */
    is_mixed_effort: boolean;
    /** Which predicate tripped is_mixed_effort. null when false. */
    variance_signal:
      | 'pace_cv' | 'pace_spread' | 'interval_execution' | 'detected_intervals'
      | 'power_cv' | 'variability_index' | 'plan_intent_intervals'
      | null;
    /**
     * True when plan intent said 'easy' (or similar) but the variance gate tripped.
     * Plan intent is preserved (never overwritten); this flag tells pool filters
     * to exclude the row from steady comparisons without mutating classified_type.
     */
    classified_type_variance_override: boolean;
    /**
     * D-035: true when the workout has no linked planned session. Server-computed;
     * client renders. When true: no adherence chips, no "missed target" narrative —
     * INSIGHTS interprets the workout on its own terms (HR-to-pace efficiency,
     * terrain via GAP, conditions, route history). Computed as
     * `!plan_context.planned_id` in build.ts.
     */
    is_unplanned: boolean;
    /**
     * D-036: within-workout aerobic decoupling — does HR climb while
     * grade-adjusted pace holds steady? Server-computed; client renders.
     *  • pct: decoupling percentage (sample-level, warmup-skipped).
     *  • basis: 'gap' = terrain-neutral, treat as fitness signal;
     *           'raw' = terrain-confounded, inconclusive;
     *           null  = not computed (interval workout, < 20 min, etc.).
     *  • assessment: 'excellent' (<3%) / 'good' (<5%) / 'moderate' (<8%) / 'high' (≥8%).
     */
    decoupling: {
      pct: number | null;
      basis: 'gap' | 'raw' | null;
      assessment: 'excellent' | 'good' | 'moderate' | 'high' | null;
    } | null;
  };

  // ── Splits (SessionNarrative Speed insight) ───────────────────────────────
  /** Computed mile splits for insights. Same source as splits tab. */
  splits_mi: Array<{
    n: number;
    pace_s_per_mi: number | null;
    gap_s_per_mi: number | null;
    grade_pct: number | null;
    hr: number | null;
  }>;

  // ── Pacing (EnduranceIntervalTable CV indicator) ──────────────────────────
  pacing: {
    coefficient_of_variation: number | null;
    /**
     * Which series fed the CV: 'gap' = grade-adjusted pace samples (preferred);
     * 'raw' = raw pace samples (used only when GAP is unavailable AND terrain
     * is flat, per the variance gate's conservative-on-non-flat-routes policy).
     * null when CV is null.
     */
    coefficient_of_variation_basis: 'gap' | 'raw' | null;
    /** Run: GAP-corrected pace spread across work segments (sec/mi). */
    pace_spread_s_per_mi: number | null;
    /** Cycling: NP/AP variability index. ≥1.05 indicates non-steady output. */
    variability_index: number | null;
    /** Cycling: coefficient of variation on power samples (percent). */
    power_cv_pct: number | null;
  };

  // ── Trend sparkline (Performance screen "Am I getting fitter?") ──────────
  trend: {
    metric_label: string;
    unit: string;
    points: Array<{
      date: string;
      value: number;
      avg_hr: number | null;
      /**
       * D-050 / Q-025 — pace-at-HR (sec/mi per 100bpm). Null when the
       * point's avg_hr is null. When present, the client can plot this as
       * the primary line (auto-normalized against per-athlete percentile
       * cutoffs from the classifier on `pace_at_hr_direction`).
       */
      pace_at_hr: number | null;
      is_current: boolean;
      label: string;
    }>;
    direction: 'improving' | 'declining' | 'stable';
    summary: string;
    /** True when lower values = better (pace). False when higher = better (power). */
    lower_is_better: boolean;
    /**
     * D-050 / Q-025 — pace-at-HR percentile classifier output. Client uses
     * this as the PRIMARY direction signal when non-null and not
     * `insufficient_data`; falls back to `direction` (raw-pace classifier)
     * otherwise. `pace_at_hr_basis` says which pace basis the classifier
     * used ('gap' = grade-adjusted; 'raw' = device pace).
     *
     * `null` when this trend block is for a non-pace metric (cycling power
     * trend) or when no trend window is available.
     */
    pace_at_hr_direction?: 'improving' | 'stable' | 'declining' | 'insufficient_data' | null;
    pace_at_hr_basis?: 'gap' | 'raw' | null;
  } | null;

  /**
   * Step 4b — this session's DISCIPLINE spine verdict, read from the cached
   * athlete_snapshot.state_trends_v1 (NOT re-derived in the builder). The same single source the
   * STATE screen and coach read; surfaced here so the per-session screen shows the discipline's
   * trend context without computing it a different way. `needs_data` when the discipline has no
   * real trend yet; null when no snapshot/cache is available.
   */
  discipline_trend?: {
    discipline: string;
    verdict: 'improving' | 'holding' | 'sliding' | 'needs_data';
    pct_change: number | null;
  } | null;

  // ── Next session (forward-looking context) ────────────────────────────────
  next_session: {
    name: string;
    date: string | null;
    type: string | null;
    prescription: string | null;
  } | null;

  /**
   * Forward-looking Arc context for the post-race debrief: what does this
   * result *mean* for the athlete's next race? Server-authored copy, dumb client.
   *
   * Populated only on goal-race sessions when ArcContext is available. Null otherwise.
   */
  forward_context?: ForwardContextV1 | null;

  display: {
    show_adherence_chips: boolean;
    interval_display_reason: string | null;
    has_measured_execution: boolean;
  };

  /** Strength only: per-exercise RIR verdict from analyzer. */
  strength_rir_summary?: Array<{
    name: string;
    target_rir: number;
    avg_rir: number | null;
    rir_verdict: 'too_easy' | 'on_target' | 'too_hard' | null;
  }> | null;

  /** Strength only: server-computed deviations. */
  strength_weight_deviation?: {
    direction: 'heavier' | 'lighter' | 'on_target';
    message: string;
    show_prompt: boolean;
  } | null;
  strength_volume_deviation?: {
    direction: 'over' | 'under' | 'on_target';
    message: string;
    show_prompt: boolean;
  } | null;

  /** Structured assessment for all screens. Deterministic, no LLM. */
  session_interpretation?: SessionInterpretation | null;

  /**
   * LLM race-readiness narrative for key long runs near plan race day.
   * Populated only when gated (run, plan id + race_date, window, long-run-like, ≥10 mi or ≥90 min).
   * Null if LLM unavailable or call fails.
   */
  race_readiness?: SessionRaceReadinessLlmV1 | null;

  /** Plan-aware load readiness at workout date (null if no session_load / unavailable). */
  readiness?: SessionDetailReadinessV1 | null;

  /** Route history for familiar routes — powers the ROUTE sparkline.
   * D-039 Fix 2: `name` removed. Route names were auto-generated server-side
   * ("Route 53" = the 53rd cluster), not athlete-named. The LLM was upgrading
   * them into asserted identities. Client renders "Same route · N×" generically;
   * the LLM input now describes the route by `comparable_runs` count only.
   * D-039 Fix 6: `chart_eligible` added. Server gates chart rendering at
   * ≥6 comparable history points (locked); below that, history is too thin
   * to be a meaningful trend ("Same route · 4 runs" is noise). Client renders
   * chart when true, text fallback when false.
   * D-039 Fix 6.1: `comparable_runs` field added (count of history points
   * actually being compared, post-intent-filter). `times_run` (raw cluster
   * sample_count) kept for back-compat but the gate + visible count both
   * key off `comparable_runs` so the user never sees "6 runs" while the
   * chart insists there's not enough history. */
  terrain?: {
    route: {
      times_run: number;
      comparable_runs: number;
      chart_eligible: boolean;
      /** D-105: `gap_pace_s_per_km` is the grade-adjusted pace from
       *  `route_progress_metrics.effort_adjusted_pace_sec_per_km`. Client
       *  prefers it when non-null (per-row fallback gate); raw `pace_s_per_km`
       *  is preserved for flat routes / pre-D-105 backfill rows / rows where
       *  GAP couldn't be computed. Additive — old clients reading only
       *  `pace_s_per_km` keep working. */
      history: Array<{ date: string; pace_s_per_km: number | null; gap_pace_s_per_km: number | null; hr: number | null; is_current: boolean }>;
    } | null;
  } | null;
}

// ── Forward context: "what this means for future races" ──────────────────
// Built from ArcContext (active_goals, current_phase, recent_completed_events)
// after a goal race so the debrief can speak to what comes next, not just what
// happened. All copy is server-authored — the client renders verbatim.
export type ForwardContextNextGoal = {
  id: string;
  name: string;
  target_date: string;
  sport: string | null;
  distance: string | null;
  days_until: number;
  weeks_until: number;
  /** True when next race is multi-sport (tri/duathlon) → run leg is a fraction. */
  is_multisport: boolean;
};

/** Bump when forward-context copy/voice changes. Drives one-time cache refresh. */
export const FORWARD_CONTEXT_COPY_VERSION = 2;

export type ForwardContextV1 = {
  /** Server-side copy version. Stale when < FORWARD_CONTEXT_COPY_VERSION. */
  copy_version: number;
  /** Eyebrow shown above the block, e.g. "What this means for future races". */
  eyebrow: string;
  /** Short bold lead, e.g. "Run fitness confirmed." */
  headline: string;
  /** Body paragraph, 1–3 sentences. */
  body: string;
  /**
   * Optional projection line, e.g. "Projected Santa Cruz run leg: ~2:18
   * based on this result." Null when no next race or insufficient data.
   */
  projection_line: string | null;
  /** The next race we're projecting onto (null when none). */
  next_goal: ForwardContextNextGoal | null;
  /** Athlete phase at debrief time (recovery/build/...). */
  current_phase: string | null;
};

// ── Interval row: fully resolved, ready to render ─────────────────────────
export type IntervalRow = {
  id: string;
  interval_type: 'warmup' | 'work' | 'recovery' | 'cooldown';
  interval_number?: number;
  recovery_number?: number;
  planned_label: string;
  planned_duration_s: number | null;
  planned_pace_range?: { lower_sec_per_mi: number; upper_sec_per_mi: number };
  /** Display-ready planned pace string, e.g. "10:30-11:00/mi". */
  planned_pace_display: string | null;
  executed: {
    duration_s: number | null;
    distance_m: number | null;
    avg_hr: number | null;
    actual_pace_sec_per_mi: number | null;
    actual_gap_sec_per_mi: number | null;
    power_watts: number | null;
  };
  pace_adherence_pct: number | null;
  duration_adherence_pct: number | null;
}

// -----------------------------------------------------------------------------
// SESSION_INTERPRETATION — One authoritative read per workout
// -----------------------------------------------------------------------------
// Every screen renders from this. Coach LLM consumes it instead of inferring.
// -----------------------------------------------------------------------------

export type DeviationDimension = 'weight' | 'volume' | 'intensity' | 'duration' | 'pace';
export type DeviationDirection = 'over' | 'under' | 'matched';

export type SessionInterpretation = {
  plan_adherence: {
    overall: 'followed' | 'modified' | 'deviated';
    deviations: Array<{
      dimension: DeviationDimension;
      direction: DeviationDirection;
      detail: string;
    }>;
  };
  training_effect: {
    intended_stimulus: string;
    actual_stimulus: string;
    alignment: 'on_target' | 'partial' | 'missed' | 'exceeded';
  };
  weekly_impact: {
    load_status: 'under' | 'on_track' | 'over';
    note: string;
  };
}
