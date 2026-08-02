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

/** Strength 1RM/baseline TEST result (Q-097/Q-102). A test is measurement, not training — the
 *  Performance screen renders this frame INSTEAD of the training table + execution/volume/adherence. */
export type StrengthTestLiftResult = {
  name: string;
  key: 'squat' | 'deadlift' | 'bench' | 'overheadPress1RM' | 'pullupMaxReps';
  reps: number | null;
  /** Working weight (lb) for 1RM lifts; null for bodyweight rep-max (pull-ups). */
  weight: number | null;
  unit: 'lb' | 'reps';
  /** Estimated 1RM (lb) for barbell lifts; the rep count for pull-ups. */
  e1rm: number | null;
  /** Prior TEST's value → drives the "160 → 150" delta line. Null if no prior test. */
  prior_e1rm: number | null;
  /** Stored baseline at analysis time (for the outcome). */
  stored: number | null;
  /** Baseline outcome vs stored. Null when zero_rep (no valid measurement). */
  outcome: 'new_baseline' | 'updated' | 'kept' | null;
  /** True → "test set logged 0 reps — retest for a number." Never narrated as success. */
  zero_rep: boolean;
  /** Optional per-lift note (e.g. the deadlift-conservative caveat). */
  note: string | null;
};

export type StrengthTestResultV1 = {
  headline: string; // "1RM Test"
  lifts: StrengthTestLiftResult[];
};

export type SessionDetailV1 = {
  version: 1;
  /**
   * ⛔ WHAT BLOCK THIS SESSION BELONGED TO (Q-230 / audit F9). Resolved once by
   * `_shared/block-identity.ts` — the same card the coach payload carries — so Performance and State
   * cannot give different answers about the same session.
   *
   * ⚠️ Every field is nullable and null MEANS SOMETHING: the plan did not say. Render nothing.
   * ⚠️ Present on sessions from FINISHED blocks too — this deliberately does not require an active
   * plan, so history keeps its framing (Q-208).
   */
  /** ⛔ Schema version of the block card. Bump in `workout-detail` when adding a field, or stored
   *  copies serve from cache forever and the new field never reaches a screen. */
  block_v?: number;
  block?: {
    plan_id: string | null;
    plan_name: string | null;
    protocol_id: string | null;
    protocol_known: boolean;
    effort_read: 'amrap' | 'rir' | 'none';
    goal_kind: 'race' | 'non_race' | 'unknown';
    goal_focus: string | null;
    week_index: number | null;
    block_weeks: number | null;
    phase: string | null;
    /**
     * ⛔ THE PHASE WORD A SCREEN MAY PRINT — 'base' | 'build' | 'peak' | 'taper' | 'recovery'.
     * `phase` above is the plan's own name ('Leader' / 'Anchor' / 'Deload' on a 5/3/1 block), which
     * is internal vocabulary. Null = the plan did not place this week; render the week number alone.
     */
    phase_word: string | null;
    cycle_kind: 'leader' | 'anchor' | null;
    week_in_cycle: number | null;
    is_deload_week: boolean | null;
    has_all_out_set: boolean | null;
    /** The 95% reading — the one that moves the working number. NOT every all-out set. */
    is_measurement_week: boolean | null;
    top_set_pct: number | null;
  };
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
    /** Share of ride time at or under the athlete's easy HR ceiling. The governor for a session
     *  prescribed as EASY, where no watts were given — heart rate is what "conversational" means.
     *  Null on any session that prescribed power, and on runs/swims. See `_shared/ride-easy-hr.ts`. */
    intensity_adherence?: number | null;
    /** Moving time as a plain ratio of planned time: under 100 short, over 100 long. NOT a grade — the
     *  `duration_adherence` percentage above is distance-from-100 via Math.abs(), so it cannot say
     *  WHICH side of plan the session fell on. This can. */
    volume_ratio_pct?: number | null;
    /** Seconds at or under the easy ceiling, and the seconds of USABLE heart rate they are out of.
     *  `easy_total_s` is HR coverage, not session duration — the surface prints "X of Y min", so the
     *  two numbers must come from the same population. */
    easy_under_s?: number | null;
    easy_total_s?: number | null;
    /** The ceiling it was judged against, so the screen can state the bar rather than a bare %. */
    easy_ceiling_bpm?: number | null;
    /** WHERE that ceiling came from — 'threshold' (measured) or 'max_hr' (estimated off observed max).
     *  The screen says which, because a bar built on an observed peak deserves the word "estimated". */
    easy_ceiling_anchor?: 'threshold' | 'max_hr' | 'none' | null;
    performance_assessment: string | null;
    assessed_against: 'plan' | 'actual' | null;
    status_label: string | null;
    /** True when pace_adherence was scored on Grade-Adjusted Pace (Minetti model). */
    gap_adjusted?: boolean;
    /**
     * Q-181 — DECLARED exercise substitutions (strength only; null for endurance).
     *
     * A swap is NEVER a dock — the slot was filled, and the slot is the unit of adherence
     * (docs/SPEC-exercise-substitution.md). This field is the RECEIPT, not the penalty.
     *
     * `note` is **null when the swap stayed IN-SLOT** — nothing was missed, so there is nothing to
     * say, and the client renders nothing. It carries ONE honest sentence only when the athlete
     * stepped OUT of the movement-pattern slot. That sentence is DETERMINISTIC (computed from
     * `primaryRef` in the exercise config) — it is not LLM prose, and it names the trade without
     * ever predicting its cost.
     */
    substitutions?: Array<{
      planned: string;
      executed: string;
      same_pattern: boolean;
      note: string | null;
    }> | null;
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
    /** SWIM pace equipment caveat, preformatted (e.g. "with fins — reads faster than unaided"). Fins/
     *  buoy/paddles read faster, kick/drill read slower, so pace isn't a clean unaided number. Null when
     *  no equipment was logged on this swim → nothing renders. Deterministic (detectSwimEquipment). */
    swim_pace_equipment_note: string | null;
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
  /** ⛔ WHAT THE SESSION COST, WITH SOMETHING TO READ IT AGAINST (2026-08-02).
   *
   *  `workload` is `workouts.workload_actual` — hours x intensity^2 x 100, the TSS formula, with the
   *  intensity taken from whatever signal the sport has (power vs FTP, HR vs threshold HR, swim pace,
   *  else the prescribed intensity). That is why it works on every sport where TSS needs a power meter
   *  or a threshold pace. Same anchor as TSS: 100 = one hour at threshold.
   *
   *  `typical_low` / `typical_high` are the athlete's OWN 25th-75th percentile over 90 days of the same
   *  sport — the middle half, so a single four-hour ride cannot stretch the band. Null below five
   *  sessions: a range drawn from a handful is a line through noise, and the chip then shows the
   *  number with no claim about where it sits. */
  load?: {
    workload: number | null;
    typical_low: number | null;
    typical_high: number | null;
    sample_count: number;
  } | null;
  weather: {
    temperature_f: number | null;
    /** What the screen shows: "74 → 78°F" when it moved, "76°F" when it did not. Composed ONCE by
     *  `formatSessionTemp` — the header and the Terrain row render this same string, so they cannot
     *  disagree the way they did on 2026-08-02 (header 74, terrain 76, same run). */
    display?: string | null;
  } | null;

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
     *  • assessment: the shared frielBand states (Q-161 — one science line at 5%) — 'good' (≤5%,
     *    aerobic base sound) / 'needs_work' (>5%, build base). Same band as State run row + coach.
     */
    decoupling: {
      pct: number | null;
      basis: 'gap' | 'raw' | null;
      assessment: 'excellent' | 'good' | 'moderate' | 'high' | null;
    } | null;
    /** D-264 step-0 receipt: HR drift (bpm) as it flows through the fixed pipeline
     *  (buildActualSession → session), proving the nested key reaches session_detail. */
    hr_drift_bpm: number | null;
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

  /** Strength 1RM/baseline TEST (Q-097/Q-102). When true, the Performance screen renders `test_result`
   *  instead of the training table + execution/volume/adherence — a measurement, not a session. */
  is_test?: boolean;
  test_result?: StrengthTestResultV1 | null;

  /**
   * ⛔ THE ALL-OUT SET, PER LIFT (2026-07-30). Present only on sessions that carried one — a leader
   * cycle and every deload week have none, and that absence is correct, not a gap.
   *
   * ⛔ THE REP RECORD IS THE FINDING; THE ESTIMATE IS CONTEXT. Wendler p10 — the rep count at a fixed
   * weight is what "stronger" means here, and it is EXACT. The estimated max is an equation's guess
   * about a number nobody measured, and it is labelled untrusted above the rep ceiling.
   */
  strength_all_out?: Array<{
    name: string;
    weight: number;
    reps: number;
    /** Most reps done at THIS weight inside the window. Null = never lifted it here before. */
    prior_best_reps_at_weight: number | null;
    /** ⚠️ A null prior is NOT a record — nothing to beat is not the same as beating something. */
    is_rep_record: boolean;
    /** ⛔ How far back "best" looked. NOT all-time; never narrate it as a lifetime PR. */
    rep_record_window_sessions: number;
    /** Wendler's own formula (D-339), rounded to plate granularity. */
    estimated_1rm: number;
    /** False above 8 reps (5 on deadlift) — no equation holds up there. Label it; never cap the reps. */
    estimate_trusted: boolean;
    estimate_trusted_max_reps: number;
  }> | null;

  /** Why `strength_all_out` is empty. Present only when it is — an empty panel must say why. */
  strength_all_out_reason?: 'no_planned_rows' | 'no_reps_on_all_out_set' | 'session_had_no_all_out_set';

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

  /**
   * ⛔ PER-EXERCISE VOLUME LOAD IN lb, PRICED BY THE ONE RULE (D-349, 2026-08-01).
   *
   * The compare table on Performance carried its OWN `calcVolume` — plain `weight × reps` — which is
   * the pre-D-348 rule. So after bodyweight started counting (D-348), a chin-up contributed to the
   * session's LOAD score and to `workout_facts.total_volume_lbs` while the lb column on the very same
   * screen still read it as nothing. Two numbers about one session, disagreeing, which is precisely
   * what D-348's "one set rule" was written to prevent — it just never reached this surface.
   *
   * ⛔ THE SHAPE IS DELIBERATE: TWO FLAT LISTS, NOT PRE-PAIRED ROWS.
   *
   * The obvious design — ship one row per exercise carrying both planned and completed lb — requires
   * the SERVER to decide which planned lift pairs with which completed one. This file's own matcher
   * (`matchPlannedToCompleted`, build.ts) is lowercase-exact, so "Barbell Back Squat" against a
   * logged "Back Squat" pairs NOTHING. The client's table already pairs correctly through
   * `canonicalize` plus declared swaps (audit F5, 2026-07-30). Pairing on the server would therefore
   * REPLACE a working matcher with a worse one and silently re-open F5.
   *
   * ⚠️ AND THE TWO SIDES DO NOT SHARE A VOCABULARY. `_shared/canonicalize.ts` carries a curated
   * synonym/plural/parenthetical ladder (Q-197 / Q-210); `src/lib/canonicalize.ts` is a small map plus
   * a slugify. They agree on plain names and diverge on decorated ones, so a server-canonical KEY is
   * not reliably a client-canonical key. Shipping the exercise's own `name` and letting the client
   * re-key it with the same function it already pairs with makes the mismatch structurally impossible.
   *
   * **So the split is: the server prices, the client pairs.** Neither re-derives the other's job.
   *
   * ⚠️ `planned` is priced off the AUTHORED RAMP (`setPlan`) when present, exactly as the client
   * renders it — D-338. Pricing the aggregate here instead would put a delta on screen that disagrees
   * with the set rows above it, which is the bug D-338 fixed.
   */
  strength_volume?: {
    /** One entry per PLANNED exercise, named as the prescription names it. */
    planned: Array<{ name: string; volume_lb: number }>;
    /** One entry per COMPLETED exercise, named as the log names it. Untouched prefills excluded (D-204). */
    completed: Array<{ name: string; volume_lb: number }>;
    planned_total_lb: number;
    completed_total_lb: number;
    /**
     * The body weight used to price calisthenics, or null when the athlete has never recorded one.
     * ⛔ NULL IS NOT ZERO AND IT IS NOT A GUESS — bodyweight sets then score exactly as they did
     * before D-348. Surfaced so a screen can say WHY a chin-up reads zero instead of looking broken.
     */
    bodyweight_lb: number | null;
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
      /** Total times this route has been run (cluster sample_count) — the honest "a lot over years"
       *  count, distinct from `comparable_runs` (the ≤10 metrics pool the efficiency read uses). */
      times_run: number;
      /** Earliest run on this route (YYYY-MM-DD) — anchors the "since …" time window. Null if unknown. */
      first_seen?: string | null;
      comparable_runs: number;
      chart_eligible: boolean;
      /** Two ADJUSTED paces. They answer different questions and must not be collapsed.
       *
       *  `gap_pace_s_per_km` — GRADE-adjusted (terrain removed). The real thing: `_shared/gap.ts`
       *    (Minetti metabolic cost — the model behind Strava GAP and TrainingPeaks NGP), read from
       *    `workouts.computed.overall.gap_pace_s_per_mi`. This is what the ROUTE sparkline plots:
       *    "same effort, different hills" must not read as fitness variation. Null when the run had
       *    no usable elevation — the client falls back to raw `pace_s_per_km` per row.
       *
       *  `effort_adjusted_pace_s_per_km` — EFFORT-adjusted (pace x avg_hr / threshold_hr), from
       *    `route_progress_metrics.effort_adjusted_pace_sec_per_km`. Pace at comparable cardiac
       *    effort. Nothing to do with terrain.
       *
       *  ⛔ Until 2026-07-14 `gap_pace_s_per_km` was fed from the EFFORT-adjusted column and
       *  documented here as grade-adjusted. The route chart claimed the hills were removed while
       *  actually tracking how hard the athlete's heart was working. Both now ship under true names.
       */
      history: Array<{ date: string; pace_s_per_km: number | null; gap_pace_s_per_km: number | null; effort_adjusted_pace_s_per_km?: number | null; hr: number | null; is_current: boolean }>;
      /** Same-route EFFICIENCY direction (pace-per-HR, State's canonical `efficiency_index` metric,
       *  restricted to this route). Replaces the removed raw-pace/power trend. `null` when there are
       *  too few usable same-route runs to honestly claim a direction (client shows "building history").
       *  This is a per-session ZOOM-IN on State's efficiency number, never a competing verdict. */
      efficiency?: {
        direction: 'improving' | 'holding' | 'declining';
        pct: number;    // signed % change in efficiency index, first half → second half
        points: number; // # of same-route runs with usable pace + HR
      } | null;
    } | null;
  } | null;

  /** Per-core segment fitness verdict(s) — "am I faster on this stretch." Read from core_verdicts
   *  (spine-authored, Law 5), rendered here (Law 4). PLURAL: a run can traverse >1 core; [] = none.
   *  Distinct from the SUPERSEDED terrain.route block above (Q-133). */
  segment_verdicts?: SegmentVerdictV1[];
}

/** One core's segment verdict — the render contract for "am I faster on this stretch," server-authored
 *  for verbatim display (Law 4). The verdict is born on the spine (core_verdicts / Law 5); this is NOT a
 *  recomputation. */
export interface SegmentVerdictV1 {
  /** Tier-1 copy, rendered verbatim. */
  copy: string;
  render_flags: { show_arrow: boolean; show_slope: boolean; show_pct: boolean };
  provenance: 'hr_aligned' | 'raw_pace_only';
  /** Raw verdict passthrough for the Step-6 chart. pct/ci present ONLY when show_pct — no hidden
   *  number reaches the client (rule D). */
  verdict: {
    direction: 'improving' | 'holding' | 'declining' | 'still_learning' | 'still_building';
    metric: 'same_effort_pace' | 'raw_pace' | null;
    n: number;
    n_hr_aligned: number;
    window_days: number;
    method: string | null;
    span_days: number | null;
    pct?: number;
    ci?: [number, number];
  };
  /** The per-effort chart points — SERVER-WINDOWED to the exact set the verdict used (never all-time;
   *  the client draws these verbatim, no filtering/windowing/query). `same_effort_pace` = pace
   *  normalized to typical HR over the window. PR flags are per-lens (gold dot). */
  chart_points: Array<{
    date: string; // YYYY-MM-DD
    pace_s_per_km: number;
    same_effort_pace_s_per_km: number;
    hr: number; // avg HR on the core for this effort (0 when unavailable) — shown in the tap detail
    provenance: 'hr_aligned' | 'raw_pace_only';
    is_best_same: boolean; // fastest same-effort pace → PR on the Same-effort lens
    is_best_pace: boolean; // fastest raw pace → PR on the Pace lens
  }>;
  /** All-time efforts on this core (NOT windowed) — the familiarity count. verdict.n is the in-window
   *  subset; the card shows "n of runs_all_time" so the anchor-drop never reads as a miscount. */
  runs_all_time: number;
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
