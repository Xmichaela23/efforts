// =============================================================================
// ATHLETE SNAPSHOT — The single source of truth
// =============================================================================
// Every screen reads from this. Nothing computes its own view of reality.
// Sections 1-4 are deterministic. Section 5 (coaching) is the only LLM layer.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Identity (slow-changing — weekly rebuild cadence)
// ---------------------------------------------------------------------------

export type LiftMax = {
  name: string;        // "Squat", "Bench Press"
  e1rm: number;        // estimated 1RM in user's preferred unit
  unit: 'lbs' | 'kg';
};

export type AthleteIdentity = {
  primary_event: {
    name: string;
    date: string;
    weeks_out: number;
    distance: string;
    sport: string;
    priority: 'A' | 'B' | 'C';
    target_time: string | null;
  } | null;
  other_events: Array<{
    name: string;
    date: string;
    weeks_out: number;
    distance: string;
    sport: string;
    has_plan: boolean;
  }>;
  key_numbers: {
    threshold_pace: string | null;   // "9:30/mi"
    ftp: number | null;              // watts
    max_hr: number | null;
    resting_hr: number | null;
    lift_maxes: LiftMax[];
  };
  unit_preference: 'imperial' | 'metric';
};

// ---------------------------------------------------------------------------
// 2. Plan Position (changes weekly)
// ---------------------------------------------------------------------------

export type PlanPosition = {
  has_plan: boolean;
  plan_name: string | null;
  plan_id: string | null;
  week_index: number | null;
  total_weeks: number | null;
  phase: string | null;              // "build", "base", "recovery", "taper", "race"
  methodology: string | null;        // "VO2max and speed development"
  week_intent: string | null;        // from plan_contract_v1
  week_total_load_planned: number;
  secondary_plans: Array<{
    name: string;
    week_index: number | null;
    phase: string | null;
  }>;
};

// ---------------------------------------------------------------------------
// 3. Daily Ledger (the factual spine — pure deterministic logic)
// ---------------------------------------------------------------------------

export type EnduranceMatchQuality =
  | 'followed'          // did what was planned (within ~80-120%)
  | 'shorter'           // significantly shorter duration or distance
  | 'longer'            // significantly longer
  | 'harder'            // right duration but higher intensity than prescribed
  | 'easier'            // right duration but lower intensity
  | 'modified'          // different type of session than planned
  | 'skipped'           // planned but not done (past days only)
  | 'unplanned';        // done but nothing was planned

export type StrengthMatchQuality =
  | 'on_target'         // actual RIR within ±0.5 of prescribed (plan-relative)
  | 'under_intensity'   // left more in reserve than prescribed (rir_delta > 1.0)
  | 'over_intensity'    // pushed harder than prescribed (rir_delta < -1.0)
  | 'followed'          // fallback when no target RIR: did exercises at reasonable intensity
  | 'dialed_back'       // fallback when no target RIR: absolute RIR > 3.5
  | 'pushed_hard'       // fallback when no target RIR: absolute RIR < 1.5
  | 'modified'          // swapped exercises or changed structure
  | 'skipped'
  | 'unplanned';

export type StrengthExerciseActual = {
  name: string;
  sets: number;
  best_weight: number;
  best_reps: number;
  avg_rir: number | null;
  target_rir: number | null;
  rir_delta: number | null;          // avg_rir - target_rir (positive = left more in reserve)
  unit: 'lbs' | 'kg';
};

export type StrengthExercisePrescription = {
  exercise: string;
  sets: number;
  reps: string;                      // "8-10" or "5"
  target_weight: number | null;
  target_rir: number | null;
  notes: string | null;
};

export type PlannedSession = {
  planned_id: string;
  type: string;                      // "run", "strength", "ride", "swim"
  name: string;                      // "Easy Run", "Upper Body Strength"
  prescription: string;              // human-readable: "50:00, 4.5mi, 10:55-11:21/mi"
  duration_seconds: number | null;
  distance_meters: number | null;
  load_planned: number | null;
  strength_prescription: StrengthExercisePrescription[] | null;
};

export type ActualSession = {
  workout_id: string;
  type: string;
  name: string;                      // "Lunch Run" (from Strava)
  source: 'strava' | 'garmin' | 'manual';
  duration_seconds: number | null;
  distance_meters: number | null;
  pace: string | null;               // "11:59/mi"
  avg_hr: number | null;
  load_actual: number | null;
  rpe: number | null;
  feeling: string | null;
  execution_score: number | null;
  decoupling_pct: number | null;
  strength_actual: StrengthExerciseActual[] | null;
};

export type SessionMatch = {
  planned_id: string | null;
  workout_id: string | null;
  endurance_quality: EnduranceMatchQuality | null;
  strength_quality: StrengthMatchQuality | null;
  summary: string;                   // "3.0 of 4.5 mi planned (67%)"
};

export type LedgerDay = {
  date: string;
  day_name: string;                  // "Monday"
  is_today: boolean;
  is_past: boolean;
  planned: PlannedSession[];
  actual: ActualSession[];
  matches: SessionMatch[];
};

// ---------------------------------------------------------------------------
// 4. Body Response (anchored to sessions, not floating)
// ---------------------------------------------------------------------------

export type SessionObservation = {
  date: string;
  workout_id: string;
  type: string;
  observations: string[];
  // e.g. ["HR 138 at 12:00/mi — 5 bpm above your easy pace norm",
  //        "Decoupling 2.1% — heart rate stayed stable throughout"]
};

export type TrendSummary = {
  trend: 'improving' | 'declining' | 'stable' | 'insufficient';
  detail: string;                    // "steadily improving over 3 sessions"
  based_on_sessions: number;
};

export type BodyResponse = {
  session_signals: SessionObservation[];
  weekly_trends: {
    run_quality: TrendSummary;
    effort_perception: TrendSummary;
    cardiac: TrendSummary;
    strength: TrendSummary;
    cross_training: {
      interference: boolean;
      detail: string;
    };
  };
  load_status: {
    actual_vs_planned_pct: number | null;
    acwr: number | null;
    running_acwr: number | null;
    running_weighted_week_load: number | null;
    running_weighted_week_load_pct: number | null;
    unplanned_summary: string | null;
    status: 'under' | 'on_target' | 'elevated' | 'high';
    interpretation: string;
  };
};

// ---------------------------------------------------------------------------
// 5. Coaching (LLM writes this — the only non-deterministic section)
// ---------------------------------------------------------------------------

export type Coaching = {
  headline: string;                  // "High load — protect recovery"
  narrative: string;                 // 2-3 sentences, specific, no jargon
  next_session_guidance: string | null;
  // e.g. "Tomorrow's intervals are your key session. Given today's elevated load,
  //        extend your warmup and use the first two reps to settle in."
};

// ---------------------------------------------------------------------------
// The Snapshot
// ---------------------------------------------------------------------------

export type AthleteSnapshot = {
  version: 1;
  generated_at: string;
  user_id: string;
  as_of_date: string;
  week_start_date: string;
  week_end_date: string;

  identity: AthleteIdentity;
  plan_position: PlanPosition;
  daily_ledger: LedgerDay[];
  body_response: BodyResponse;
  coaching: Coaching;

  // Upcoming sessions with full prescription detail
  upcoming: Array<{
    date: string;
    day_name: string;
    sessions: Array<PlannedSession & { is_key_session: boolean }>;
  }>;
};
