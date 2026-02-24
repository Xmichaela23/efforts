/**
 * =============================================================================
 * EDGE FUNCTION: generate-training-context
 * =============================================================================
 * 
 * PURPOSE: Calculate training context for Context screen
 * 
 * WHAT IT DOES:
 * - Calculates ACWR (Acute:Chronic Workload Ratio) using plan-aligned week windows
 * - Aggregates sport breakdown (run/bike/swim/strength/mobility)
 * - Builds 14-day activity timeline
 * - Generates smart insights (ACWR warnings, consecutive hard days, etc.)
 * - Calculates week-over-week comparison using plan weeks when available
 * - Provides projected ACWR if planned workout exists
 * 
 * SMART DATE RANGES:
 * - When a plan is active: Uses plan week boundaries (Monday-Sunday)
 *   - Acute window: Current plan week (Monday to focus date)
 *   - Chronic window: Last 4 plan weeks
 *   - Week comparison: Current plan week vs previous plan week
 * - When no plan: Uses rolling windows (last 7/28 days)
 * 
 * This prevents the issue where a recovery week's "last 7 days" includes
 * days from the previous build week, making the analysis misleading.
 * 
 * INPUT: { user_id: string, date: string, workout_id?: string }
 * OUTPUT: TrainingContextResponse (see interface below)
 * 
 * FORMULAS:
 * - Workload (cardio): duration (hours) × intensity² × 100
 * - Workload (strength): volume_factor × intensity² × 100
 * - ACWR: (acute daily avg) / (chronic daily avg)
 * 
 * ACWR THRESHOLDS (plan-aware):
 * 
 * Without active plan:
 * - < 0.80: undertrained
 * - 0.80 - 1.30: optimal
 * - 1.30 - 1.50: elevated (warning)
 * - > 1.50: high_risk (critical)
 * 
 * With active plan (trust the plan's periodization):
 * - < 0.80: undertrained
 * - 0.80 - 1.50: optimal (plan progression)
 * - 1.50 - 1.70: elevated (warning)
 * - > 1.70: high_risk (critical)
 * 
 * Recovery/Taper weeks have adjusted thresholds (lower load is expected)
 * =============================================================================
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runGoalPredictor } from '../_shared/goal-predictor/index.ts';

// =============================================================================
// CORS HEADERS (matching existing edge functions)
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin'
};

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface PlanContext {
  hasActivePlan: boolean;
  planId: string | null;
  weekIndex: number | null; // 1-based week number
  phaseKey: string | null;
  phaseName: string | null;
  isRecoveryWeek: boolean;
  isTaperWeek: boolean;
  weekIntent: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';
  weekFocusLabel: string | null;
  planName: string | null;
  /** Plan length (weeks). Enables "Week X of Y". */
  duration_weeks?: number | null;
  /** Weeks left to plan end (or to race if race_date set). Enables "Z weeks to go". */
  weeks_remaining?: number | null;
  /** Race/goal date (ISO). Enables "Z weeks to race". */
  race_date?: string | null;
  /** Target finish time (seconds). Passed to goal predictor for marathon/speed plans. */
  target_finish_time_seconds?: number | null;
  /** Next week's intent (from plan design). Enables "what's coming up" in general state. */
  next_week_intent?: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown' | null;
  next_week_focus_label?: string | null;
}

interface PlanProgress {
  week_start: string; // ISO date (YYYY-MM-DD)
  week_end: string;   // ISO date (YYYY-MM-DD)
  focus_date: string; // ISO date (YYYY-MM-DD)

  // Planned totals (from planned_workouts)
  planned_week_total: number;
  planned_to_date_total: number;
  planned_sessions_week: number;
  planned_sessions_to_date: number;

  // Completed totals (from workouts)
  completed_to_date_total: number;
  completed_sessions_to_date: number;

  // Linking confidence (planned -> completed)
  matched_planned_sessions_to_date: number; // matched via planned_id or same-day discipline match
  match_confidence: number; // 0..1

  // Coarse status derived from planned vs completed (only when meaningful)
  status: 'on_track' | 'behind' | 'ahead' | 'unknown';
  percent_of_planned_to_date: number | null; // 0..100, null if unknown
}

interface ACWRData {
  ratio: number;
  status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk' | 'recovery' | 'optimal_recovery';
  acute_daily_avg: number;
  chronic_daily_avg: number;
  acute_total: number;
  chronic_total: number;
  data_days: number;
  plan_context?: PlanContext;
  projected?: {
    ratio: number;
    status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk' | 'recovery' | 'optimal_recovery';
    planned_workload: number;
  };
}

interface SportData {
  workload: number;
  percent: number;
  sessions: number;
}

interface SportBreakdown {
  run: SportData;
  bike: SportData;
  swim: SportData;
  strength: SportData;
  mobility: SportData;
  total_workload: number;
}

interface TimelineWorkout {
  id: string;
  type: string;
  name: string;
  workload_actual: number;
  intensity_factor: number | null;
  duration: number;
  status: 'completed' | 'planned' | 'skipped';
}

interface TimelineDay {
  date: string;
  workouts: TimelineWorkout[];
  daily_total: number;
  max_intensity_factor: number | null;
  is_acute_window: boolean;
}

interface WeekComparison {
  current_week_total: number;
  previous_week_total: number;
  change_percent: number;
  change_direction: 'increase' | 'decrease' | 'stable';
}

interface Insight {
  type: 'acwr_high' | 'consecutive_hard' | 'sport_imbalance' | 'weekly_jump';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  data?: any;
}

/** Weekly readiness for Goal Predictor (HR drift + pace adherence from most recent run with analysis) */
interface WeeklyReadiness {
  hr_drift_bpm: number | null;
  pace_adherence_pct: number | null;
  /** Date of the run we used (YYYY-MM-DD); may be outside acute window when we fall back to older runs */
  source_date?: string | null;
}

/** Weekly verdict from Goal Predictor (server-computed; no client-side math) */
interface WeeklyVerdict {
  readiness_pct: number;
  message: string;
  drivers: string[];
  label: 'high' | 'medium' | 'low';
}

/** Strength workload and RIR in acute window (last 7 days). Protocol: flags "heavy legs" / deep fatigue even when cardio is fresh. */
interface StructuralLoad {
  /** Total strength workload in acute window */
  acute: number;
  /** Average RIR across strength sessions in acute window (null if no RIR data). Low RIR = high-repair state. */
  avg_rir_acute?: number | null;
}

interface TrainingContextResponse {
  acwr: ACWRData;
  sport_breakdown: SportBreakdown;
  timeline: TimelineDay[];
  week_comparison: WeekComparison;
  insights: Insight[];
  plan_progress?: PlanProgress;
  weekly_readiness?: WeeklyReadiness;
  weekly_verdict?: WeeklyVerdict;
  /** Integrated Load: strength workload acute — for "heart ready, legs tired" narrative */
  structural_load?: StructuralLoad;
  /** When verdict is from trend: end date of window (most recent run). UI can show "Based on your last N runs". */
  readiness_source_date?: string | null;
  /** When verdict is from multi-run trend: start date of window (oldest run). With readiness_source_date = "Jan 15 – Jan 28". */
  readiness_source_start_date?: string | null;
  /** Display-only: human-centric state for dumb client. Protocol: state first, constraint second. */
  display_aerobic_tier?: 'Low' | 'Moderate' | 'Elevated';
  display_structural_tier?: 'Low' | 'Moderate' | 'Elevated';
  display_limiter_line?: string;
  /** Short label for Current Training State: "Aerobic (moderate fatigue)" | "Structural (elevated fatigue)" | "None" */
  display_limiter_label?: string;
  /** One-line next action (mirrors summary close); use in Training Guidance card. */
  next_action?: string;
  display_load_change_risk_label?: string; // e.g. 'Below baseline (planned — expected this week)' when on down-week
  /** When on plan and ratio < 0.8: optional helper e.g. "Often normal in down-weeks." */
  display_load_change_risk_helper?: string | null;
  /** Top banner: plan + limiter + guidance (never leads with ACWR). */
  context_banner?: {
    line1: string;
    line2: string;
    line3: string;
    acwr_clause?: string | null;
  };
  /** Plan-aware projected week load (completed + planned remaining) for reconciliation. */
  projected_week_load?: {
    completed_acute: number;
    planned_remaining: number;
    projected_acute: number;
    chronic_weekly: number;
    projected_ratio: number;
    projected_label: 'below' | 'in range' | 'ramping';
    message: string;
  };
  /** Single synthesized story — one integrated Context Summary (replaces scattered banner + plan lines). */
  context_summary?: string[];
  /** Plan day type for this date (from plan, not completed data). Gates score display on client. */
  day_type?: 'rest' | 'training';
  /** True when today has planned run/ride/strength/swim (not mobility-only). When false on training day, client shows Low-stress card without score. */
  has_planned_stimulus?: boolean;
  /** Plan-native check-in: week, today/next workouts, completion %. When present, client leads with Plan Check-in card. */
  plan_checkin?: {
    plan_name: string;
    plan_week_index: number;
    plan_week_total: number;
    plan_phase_label: string;
    today_planned_workout: { title: string; type: string; duration?: number; intensity_tag?: string } | null;
    next_planned_workout: { title: string; type: string; date: string; day_label: string } | null;
    week_completion_pct: number;
    week_adherence_tier: 'high' | 'moderate' | 'low';
    plan_is_active: boolean;
  };
  /** Coach dashboard: week narrative (execution + load + response + synthesis). Replaces verdict language with contextual narrative. */
  week_narrative?: {
    week_index: number;
    week_day_index: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    phase: 'build' | 'recovery' | 'peak' | 'taper' | 'off_plan';
    execution: {
      planned_to_date: number;
      completed_linked: number;
      completed_unlinked: number;
      moved: number;
      missed: number | null;
      quality_label: 'on_target' | 'mixed' | 'off_target' | 'unknown';
      quality_reason: string;
      key_sessions_audited: number;
      key_sessions_on_target: number;
      key_sessions_flags: Array<{
        planned_id: string;
        title: string;
        date: string;
        status: 'on_target' | 'slightly_off' | 'too_fast' | 'too_easy' | 'incomplete' | 'unavailable';
        delta?: { planned: string; actual: string; pct?: number };
        one_fix?: string;
      }>;
    };
    load: {
      acwr: number | null;
      load_vs_baseline: 'lighter' | 'similar' | 'heavier' | null;
      ramp_flag: 'stable' | 'fast' | null;
    };
    response: {
      aerobic_tier: 'low' | 'moderate' | 'elevated';
      structural_tier: 'low' | 'moderate' | 'elevated';
      limiter: 'aerobic' | 'structural' | 'none';
      trend: 'improving' | 'stable' | 'worsening' | 'unknown';
      /**
       * Evidence behind trend classification (auditable signals).
       * This is intentionally small and specific; UI can show 1-line summary with expandable details.
       */
      trend_evidence?: Array<{
        label: string;
        value: string;
        severity: 'info' | 'warning';
      }>;
      /**
       * LLM-translated explanation of the trend evidence (2-3 sentences).
       * Must stay grounded in the provided evidence and plan context.
       */
      trend_explanation?: string;
    };
    carryover?: {
      level: 'low' | 'moderate' | 'high';
      pct_of_baseline: number | null;
      interpretation: string | null;
    } | null;
    synthesis: {
      headline: string;
      bullets: string[];
      implication: string | null;
    };
    /** Plan goal line and week focus for display. */
    plan_goal_line?: string | null;
    week_focus_label?: string | null;
    next_key_session?: {
      planned_id: string | null;
      date: string | null;
      date_local: string | null;
      title: string | null;
      primary_target: string | null;
      sport?: string | null;
    };
    today_role?: 'recover' | 'easy' | 'key' | 'optional' | 'rest';
    today_role_label?: string | null;
    body_response_line?: string | null;
    debug_week_narrative?: {
      planned_to_date: Array<{ id: string; date: string; completed_workout_id: string | null }>;
      completed_unlinked_count: number;
      completed_unlinked_ids: string[];
      key_session_audits_source: Array<{ planned_id: string; workout_id: string }>;
    };
  };
  /** Week-to-date plan review: what changed, what you did vs plan, what it implies. Deterministic; no fake adherence. */
  week_review?: {
    week_index: number;
    week_total: number;
    week_day_index: number;
    phase: 'build' | 'recovery' | 'peak' | 'taper' | 'off_plan';
    /** What this week is designed for (from plan metadata). E.g. "Recovery week", "Volume build". */
    week_focus_label?: string | null;
    /** Holistic plan goal for display. E.g. "LA Marathon 2026 • 10 weeks to race". */
    plan_goal_line?: string | null;
    planned: {
      sessions_total: number;
      sessions_to_date: number;
      sessions_remaining: number;
      quality_sessions_to_date: number;
    };
    completed: {
      sessions_completed_total: number;
      sessions_matched_to_plan: number;
      sessions_missed: number | null;
      match_coverage_pct: number;
      sessions_moved: number;
    };
    execution: {
      pace_adherence_pct: number | null;
      overall_adherence_pct: number | null;
    };
    key_session_audits: Array<{
      planned_id: string;
      date: string;
      title: string;
      type: string;
      status: 'hit' | 'close' | 'miss' | 'too_hard' | 'too_easy' | 'partial' | 'unknown';
      reason_codes: string[];
      headline: string;
      detail?: string;
      delta?: {
        metric: string;
        planned: string;
        actual: string;
        pct: number;
        seconds_per_mile: number;
        direction: 'fast' | 'slow' | 'on_target';
      } | null;
    }>;
    next_key_session: {
      planned_id: string | null;
      date: string | null;
      date_local: string | null;
      title: string | null;
      primary_target: string | null;
      sport?: string | null;
    };
    moved_examples?: Array<{ title: string; planned_date: string; done_date: string }>;
    week_verdict?: {
      headline: string;
      detail?: string | null;
      reason_codes: string[];
    };
    match_coverage_note?: string | null;
    /** Workload to-date: matched completed vs planned (apples-to-apples). Use for On-plan progress % and raw numbers. */
    planned_to_date_workload?: number;
    completed_matched_workload?: number;
    workload_pct_of_planned_to_date?: number | null;
    /** Dev-only: raw planned/completed dates and matched pairs for truth debugging */
    debug_week_truth?: {
      focus_date: string;
      week_start: string;
      week_end: string;
      planned_dates: string[];
      completed_dates: string[];
      matched_pairs: Array<{ planned_date: string; completed_date: string; planned_id: string; workout_id: string }>;
    };
  };
}

/** Monday of week containing date, ISO (YYYY-MM-DD). Matches compute-snapshot week boundary. */
function weekMondayISO(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface WorkoutRecord {
  id: string;
  type: string;
  name: string;
  date: string;
  planned_id?: string | null;
  workload_actual: number;
  workload_planned: number;
  intensity_factor: number | null;
  duration: number;
  moving_time: number;
  workout_status: string;
}

interface PlannedWorkoutRecord {
  id: string;
  type: string;
  name: string;
  date: string;
  workload_planned: number;
  duration: number;
  workout_status: string;
  training_plan_id?: string | null;
  completed_workout_id?: string | null;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const payload = await req.json();
    const { user_id, date, workout_id } = payload;

    // Validate required fields
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!date) {
      return new Response(JSON.stringify({ error: 'date is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`📊 Generating training context for user ${user_id}, date ${date}`);

    const focusDate = new Date(date + 'T12:00:00');
    const focusDateISO = date;

    // ==========================================================================
    // FETCH PLAN CONTEXT FIRST (needed for smart date range calculation)
    // ==========================================================================

    const planContext = await fetchPlanContext(supabase, user_id, focusDateISO, focusDate);

    // ==========================================================================
    // CALCULATE SMART DATE RANGES (plan-aligned when plan is active)
    // ==========================================================================

    const dateRanges = calculateSmartDateRanges(focusDate, focusDateISO, planContext);

    console.log(`📅 Date ranges: acute=${dateRanges.acuteStartISO} to ${dateRanges.acuteEndISO}, chronic=${dateRanges.chronicStartISO} to ${dateRanges.chronicEndISO}`);
    if (planContext?.hasActivePlan) {
      console.log(`📋 Using plan-aligned windows: current week (${dateRanges.currentWeekStartISO} - ${dateRanges.currentWeekEndISO}), previous week (${dateRanges.previousWeekStartISO} - ${dateRanges.previousWeekEndISO})`);
    }

    // ==========================================================================
    // FETCH ATHLETE_SNAPSHOT (Deterministic Layer — use when available)
    // ==========================================================================
    const targetWeekMonday = dateRanges.currentWeekStartISO ?? weekMondayISO(focusDate);
    const priorWeekMonday = addDaysISO(targetWeekMonday, -7);
    const { data: currentSnap } = await supabase
      .from('athlete_snapshot')
      .select('workload_total, acwr, workload_by_discipline, adherence_pct, session_count')
      .eq('user_id', user_id)
      .eq('week_start', targetWeekMonday)
      .maybeSingle();
    const { data: priorSnap } = await supabase
      .from('athlete_snapshot')
      .select('workload_total')
      .eq('user_id', user_id)
      .eq('week_start', priorWeekMonday)
      .maybeSingle();
    if (!currentSnap) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const res = await fetch(`${supabaseUrl}/functions/v1/compute-snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${svcKey}`,
            'apikey': svcKey,
          },
          body: JSON.stringify({ user_id, week_start: targetWeekMonday }),
        });
        if (res.ok) {
          console.log(`📊 Computed athlete_snapshot for week ${targetWeekMonday}`);
        }
      } catch (e) {
        console.warn('⚠️ compute-snapshot invoke failed (non-fatal):', e?.message ?? e);
      }
    }

    // ==========================================================================
    // FETCH DATA
    // ==========================================================================

    // Fetch completed workouts for chronic window (28 days or 4 plan weeks)
    const { data: completedWorkouts, error: completedError } = await supabase
      .from('workouts')
      .select('id, type, name, date, planned_id, workload_actual, workload_planned, intensity_factor, duration, moving_time, workout_status')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .gte('date', dateRanges.chronicStartISO)
      .lte('date', dateRanges.chronicEndISO)
      .order('date', { ascending: false });

    if (completedError) {
      console.error('❌ Error fetching completed workouts:', completedError);
      throw new Error(`Failed to fetch workouts: ${completedError.message}`);
    }

    // Fetch planned workouts for current week (plan-aware) so context can be accurate on-plan
    const plannedRangeStartISO =
      planContext?.hasActivePlan && dateRanges.currentWeekStartISO
        ? dateRanges.currentWeekStartISO
        : dateRanges.acuteStartISO;
    const plannedRangeEndISO =
      planContext?.hasActivePlan && dateRanges.currentWeekEndISO
        ? dateRanges.currentWeekEndISO
        : dateRanges.acuteEndISO;

    let plannedWeekQuery = supabase
      .from('planned_workouts')
      .select('id, type, name, date, workload_planned, duration, workout_status, training_plan_id, completed_workout_id')
      .eq('user_id', user_id)
      .in('workout_status', ['planned', 'in_progress', 'completed'])
      .gte('date', plannedRangeStartISO)
      .lte('date', plannedRangeEndISO);

    // If we have an active plan ID, filter planned workouts to that plan
    if (planContext?.hasActivePlan && planContext.planId) {
      plannedWeekQuery = plannedWeekQuery.eq('training_plan_id', planContext.planId);
    }

    const { data: plannedWeekWorkouts, error: plannedError } = await plannedWeekQuery.order('date', { ascending: true });

    if (plannedError) {
      console.error('❌ Error fetching planned workouts:', plannedError);
      // Non-fatal - continue without planned workout
    }

    const workouts: WorkoutRecord[] = completedWorkouts || [];
    const plannedWeek: PlannedWorkoutRecord[] = plannedWeekWorkouts || [];
    // Planned workouts on the focus date (used for projected ACWR + timeline)
    const plannedForFocusDate: PlannedWorkoutRecord[] = plannedWeek.filter(p => p.date === focusDateISO);

    // Runs this week (to focus date) with workout_analysis + planned_id for week_review key_session_audits
    const weekStartISO = dateRanges.currentWeekStartISO || dateRanges.acuteStartISO;
    const weekEndISO = dateRanges.currentWeekEndISO || dateRanges.acuteEndISO;
    const { data: runsThisWeekWithAnalysis } = await supabase
      .from('workouts')
      .select('id, date, planned_id, name, type, workout_analysis')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .gte('date', weekStartISO)
      .lte('date', focusDateISO)
      .not('planned_id', 'is', null)
      .not('workout_analysis', 'is', null)
      .in('type', ['run', 'running'])
      .order('date', { ascending: false });

    console.log(`📊 Found ${workouts.length} completed workouts, ${plannedWeek.length} planned workouts (week range), ${runsThisWeekWithAnalysis?.length ?? 0} runs this week with analysis`);

    // Acute window = full week when focus date is Sunday (Mon–Sun in both plan and rolling)
    const focusDay = new Date(focusDateISO + 'T12:00:00').getDay();
    const isEndOfWeek = focusDay === 0;

    // ==========================================================================
    // CALCULATE ACWR (use athlete_snapshot when end-of-week and available)
    // ==========================================================================

    const acwr = (isEndOfWeek && currentSnap?.acwr != null && currentSnap?.workload_total != null)
      ? acwrFromSnapshot(currentSnap, plannedForFocusDate, planContext)
      : calculateACWR(workouts, focusDate, dateRanges, plannedForFocusDate, planContext);

    // ==========================================================================
    // CALCULATE SPORT BREAKDOWN (use athlete_snapshot when end-of-week and available)
    // ==========================================================================

    const sportBreakdown = (isEndOfWeek && currentSnap?.workload_by_discipline)
      ? sportBreakdownFromSnapshot(currentSnap.workload_by_discipline as Record<string, number>, workouts, dateRanges)
      : calculateSportBreakdown(workouts, dateRanges);

    // ==========================================================================
    // BUILD TIMELINE (last 14 days)
    // ==========================================================================

    const timeline = buildTimeline(workouts, plannedForFocusDate, dateRanges.fourteenDaysAgo, focusDate, dateRanges.acuteStart);

    // ==========================================================================
    // CALCULATE WEEK COMPARISON (use athlete_snapshot for prior week when available)
    // ==========================================================================

    const priorWeekWorkloadFromSnapshot = priorSnap?.workload_total != null
      ? Number(priorSnap.workload_total)
      : undefined;
    const weekComparison = calculateWeekComparison(
      workouts,
      dateRanges,
      planContext,
      priorWeekWorkloadFromSnapshot
    );

    // ==========================================================================
    // GENERATE SMART INSIGHTS
    // ==========================================================================

    const planProgress = calculatePlanProgress(plannedWeek, workouts, dateRanges, focusDateISO, planContext);
    const insights = generateInsights(acwr, sportBreakdown, weekComparison, timeline, planContext, planProgress);

    // ==========================================================================
    // AVG RIR ACUTE (strength sessions in acute window — "HR drift" for lifting)
    // ==========================================================================
    const { data: acuteStrengthWorkouts } = await supabase
      .from('workouts')
      .select('id, strength_exercises, computed')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .in('type', ['strength', 'strength_training'])
      .gte('date', dateRanges.acuteStartISO)
      .lte('date', dateRanges.acuteEndISO)
      .order('date', { ascending: false });
    const avg_rir_acute = computeAvgRirAcute(acuteStrengthWorkouts || []);
    // Previous-week RIR (for evidence: RIR compression = rising structural fatigue)
    const addDaysISO = (iso: string, days: number): string => {
      const d = new Date(iso + 'T12:00:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const prevWeekStartISO = addDaysISO(dateRanges.acuteStartISO, -7);
    const prevWeekEndISO = addDaysISO(dateRanges.acuteStartISO, -1);
    const { data: prevStrengthWorkouts } = await supabase
      .from('workouts')
      .select('id, strength_exercises, computed')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .in('type', ['strength', 'strength_training'])
      .gte('date', prevWeekStartISO)
      .lte('date', prevWeekEndISO)
      .order('date', { ascending: false });
    const avg_rir_prev_week = computeAvgRirAcute(prevStrengthWorkouts || []);

    // ==========================================================================
    // WEEKLY READINESS (3-run window within acute 7 days = "Recent Form")
    // Fetches last 3 runs within the acute window that have workout_analysis;
    // averages HR drift and pace adherence to filter daily noise; trend boosts when improving.
    // Aligns with ACWR and structural load (same 7-day acute window).
    // ==========================================================================
    const RECENT_FORM_WINDOW = 3;
    let weekly_readiness: WeeklyReadiness | undefined;
    let readiness_source_date: string | null = null;
    let readiness_source_start_date: string | null = null;

    const { data: recentRuns } = await supabase
      .from('workouts')
      .select('date, workout_analysis')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .gte('date', dateRanges.acuteStartISO)
      .lte('date', dateRanges.acuteEndISO)
      .in('type', ['run', 'running'])
      .not('workout_analysis', 'is', null)
      .order('date', { ascending: false })
      .limit(RECENT_FORM_WINDOW);

    if (recentRuns && recentRuns.length > 0) {
      const points: { date: string; hr_drift_bpm: number | null; pace_adherence_pct: number | null }[] = [];
      for (const run of recentRuns) {
        if (!run?.workout_analysis || typeof run.workout_analysis !== 'object') continue;
        const wa = run.workout_analysis as any;
        const hrDrift = wa.granular_analysis?.heart_rate_analysis?.hr_drift_bpm;
        const paceAdherence = wa.performance?.pace_adherence;
        const hasDrift = hrDrift != null && Number.isFinite(hrDrift);
        const hasPace = paceAdherence != null && Number.isFinite(paceAdherence);
        if (hasDrift || hasPace)
          points.push({
            date: run.date ?? '',
            hr_drift_bpm: hasDrift ? Number(hrDrift) : null,
            pace_adherence_pct: hasPace ? Math.round(Number(paceAdherence)) : null
          });
      }
      if (points.length > 0) {
        const sumDrift = points.reduce((s, p) => s + (p.hr_drift_bpm ?? 0), 0);
        const countDrift = points.filter(p => p.hr_drift_bpm != null).length;
        const sumPace = points.reduce((s, p) => s + (p.pace_adherence_pct ?? 0), 0);
        const countPace = points.filter(p => p.pace_adherence_pct != null).length;
        const avgDrift = countDrift > 0 ? sumDrift / countDrift : null;
        const avgPace = countPace > 0 ? Math.round(sumPace / countPace) : null;
        let recent_form_trend: 'improving' | 'stable' | 'worsening' | null = null;
        if (points.length >= 2 && countDrift >= 2) {
          const oldestFirst = [...points].reverse();
          const firstDrift = oldestFirst[0].hr_drift_bpm ?? 0;
          const lastDrift = oldestFirst[oldestFirst.length - 1].hr_drift_bpm ?? 0;
          if (lastDrift < firstDrift) recent_form_trend = 'improving';
          else if (lastDrift > firstDrift) recent_form_trend = 'worsening';
          else recent_form_trend = 'stable';
        }
        const firstDate = points[points.length - 1]?.date ?? points[0]?.date;
        const lastDate = points[0]?.date ?? firstDate;
        weekly_readiness = {
          hr_drift_bpm: avgDrift != null ? Math.round(avgDrift * 10) / 10 : null,
          pace_adherence_pct: avgPace,
          source_date: lastDate || undefined
        };
        readiness_source_date = lastDate || null;
        readiness_source_start_date = firstDate !== lastDate ? firstDate : null;
        (weekly_readiness as any).recent_runs_count = points.length;
        (weekly_readiness as any).recent_form_trend = recent_form_trend;
        // Add auditable evidence for the trend decision (kept small; UI can expand)
        const evidence: Array<{ label: string; value: string; severity: 'info' | 'warning' }> = [];
        if (points.length >= 2) {
          const oldestFirst = [...points].reverse();
          const first = oldestFirst[0];
          const last = oldestFirst[oldestFirst.length - 1];
          if (first.hr_drift_bpm != null && last.hr_drift_bpm != null) {
            const delta = Math.round((last.hr_drift_bpm - first.hr_drift_bpm) * 10) / 10;
            const sign = delta > 0 ? '+' : '';
            evidence.push({
              label: 'HR drift trend',
              value: `${first.hr_drift_bpm} → ${last.hr_drift_bpm} bpm (${sign}${delta} bpm)`,
              severity: delta >= 2 ? 'warning' : 'info'
            });
          }
          if (first.pace_adherence_pct != null && last.pace_adherence_pct != null) {
            const deltaPts = Math.round(last.pace_adherence_pct - first.pace_adherence_pct);
            const sign = deltaPts > 0 ? '+' : '';
            const suffix =
              deltaPts === 0 ? 'held steady' : deltaPts > 0 ? 'improved' : 'down';
            evidence.push({
              label: 'Pace adherence',
              value: `${first.pace_adherence_pct}% → ${last.pace_adherence_pct}% (${sign}${deltaPts} pts, ${suffix})`,
              severity: deltaPts <= -10 ? 'warning' : 'info'
            });
          }
        }
        if (avg_rir_prev_week != null && avg_rir_acute != null) {
          const delta = Math.round((avg_rir_acute - avg_rir_prev_week) * 10) / 10;
          // Lower RIR = more fatigue; negative delta is a warning
          evidence.push({
            label: 'Strength RIR (avg)',
            value: `${avg_rir_prev_week.toFixed(1)} → ${avg_rir_acute.toFixed(1)} (${delta > 0 ? '+' : ''}${delta.toFixed(1)})`,
            severity: delta <= -0.8 ? 'warning' : 'info'
          });
        }
        // Periodization context: make it explicit when fatigue is expected at block edges
        try {
          const intent = planContext?.weekIntent;
          const nextIntent = planContext?.next_week_intent;
          const endOfBuildBlock =
            (intent === 'build' || intent === 'peak' || intent === 'baseline') && nextIntent === 'recovery';
          if (endOfBuildBlock) {
            evidence.push({
              label: 'Block timing',
              value: 'end of build (recovery next week)',
              severity: 'info'
            });
          }
        } catch {
          // ignore evidence enrichment failures
        }
        (weekly_readiness as any).__trend_evidence = evidence;
      }
    }

    // ==========================================================================
    // TREND EXPLANATION (LLM translation only; metrics remain deterministic)
    // ==========================================================================
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const buildTrendExplanation = async (): Promise<string | null> => {
      try {
        if (!openaiKey) return null;
        const evidence = ((weekly_readiness as any)?.__trend_evidence as any[]) ?? [];
        if (!Array.isArray(evidence) || evidence.length === 0) return null;

        const intent = planContext?.weekIntent ?? 'unknown';
        const nextIntent = planContext?.next_week_intent ?? null;
        const weeksRemaining = planContext?.weeks_remaining ?? null;
        const weekFocus = planContext?.weekFocusLabel ?? null;
        const weekIndex = planContext?.weekIndex ?? null;
        const planName = planContext?.planName ?? null;

        // Provide both absolute + delta where available to avoid confusing "0%"
        const avgDrift = weekly_readiness?.hr_drift_bpm ?? null;
        const avgPaceAdh = weekly_readiness?.pace_adherence_pct ?? null;

        const prompt = [
          `You are a running coach. Translate weekly training metrics into clear, human language.`,
          `Constraints:`,
          `- Use ONLY the facts provided. Do not invent numbers or symptoms.`,
          `- Explain what each metric means in plain English. If a change is 0, say it held steady (not \"zero adherence\").`,
          `- Be concise: exactly 2 sentences. No bullets.`,
          `- Stay consistent: if pace held but HR cost rose, say \"pace held but cost increased\" (not a contradiction).`,
          ``,
          `Plan context:`,
          `- Plan: ${planName ?? 'unknown'}`,
          `- Week: ${weekIndex ?? 'unknown'}`,
          `- Phase: ${String(intent)}`,
          `- Next week: ${String(nextIntent ?? 'unknown')}`,
          `- Weeks to race/go: ${weeksRemaining ?? 'unknown'}`,
          weekFocus ? `- Focus: ${weekFocus}` : null,
          ``,
          `Metric meanings (do not contradict these):`,
          `- HR drift: higher drift usually means more fatigue / heat / pacing cost at steady effort.`,
          `- Pace adherence: closer to 100% means execution matched the prescribed pace ranges.`,
          `- Strength RIR: lower RIR means less reserve (strength work feels harder).`,
          ``,
          `Weekly readiness (averaged across recent runs):`,
          `- Avg HR drift: ${avgDrift != null ? `${avgDrift} bpm` : 'unknown'}`,
          `- Avg pace adherence: ${avgPaceAdh != null ? `${avgPaceAdh}%` : 'unknown'}`,
          ``,
          `Trend evidence (labels + values):`,
          ...evidence.map(e => `- ${e.label}: ${e.value}`),
          ``,
          `Write a 2–3 sentence explanation of what this suggests about fatigue/adaptation, and whether it is expected for this phase.`,
        ]
          .filter(Boolean)
          .join('\n');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0,
            max_tokens: 90,
            messages: [
              { role: 'system', content: 'You are precise, grounded, and coach-like. No fluff.' },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (!response.ok) {
          const txt = await response.text().catch(() => '');
          console.warn('⚠️ [TREND EXPLANATION] OpenAI non-OK:', response.status, txt?.slice?.(0, 200));
          return null;
        }

        const json = await response.json();
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content !== 'string') return null;
        const cleaned = content.trim().replace(/\s+/g, ' ');
        // Enforce exactly 2 sentences in case the model ignores instructions
        const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
        const two = sentences.slice(0, 2).join(' ').trim();
        return two.length ? two : null;
      } catch (e) {
        console.warn('⚠️ [TREND EXPLANATION] Failed:', e);
        return null;
      }
    };

    // ==========================================================================
    // WEEKLY VERDICT (Goal Predictor — server-side; no client-side math)
    // Pass structural_load_acute for structural-vs-cardio adaptive guidance.
    // ==========================================================================
    const weeklyInput =
      weekly_readiness != null
        ? {
            ...weekly_readiness,
            structural_load_acute: sportBreakdown.strength.workload > 0 ? sportBreakdown.strength.workload : null,
            avg_rir_acute: avg_rir_acute ?? undefined
          }
        : undefined;
    const goalPrediction = runGoalPredictor({
      weekly: weeklyInput,
      plan: planContext?.planName
        ? {
            target_finish_time_seconds: planContext.target_finish_time_seconds ?? null,
            race_name: planContext.planName,
            goal_profile: null
          }
        : null,
      weekly_plan_context: planContext?.hasActivePlan
        ? {
            week_intent: planContext.weekIntent,
            is_recovery_week: planContext.isRecoveryWeek,
            is_taper_week: planContext.isTaperWeek,
            next_week_intent: planContext.next_week_intent ?? null,
            weeks_remaining: planContext.weeks_remaining ?? null
          }
        : null
    });
    const weekly_verdict = goalPrediction.weekly_verdict ?? undefined;

    // ==========================================================================
    // DISPLAY-ONLY FIELDS (smart server, dumb client — no client-side derivation)
    // ==========================================================================
    type FatigueTier = 'Low' | 'Moderate' | 'Elevated';
    const heartLungsStatus: 'Fresh' | 'Stable' | 'Tired' = (() => {
      if (weekly_verdict) {
        if (weekly_verdict.label === 'high') return 'Fresh';
        if (weekly_verdict.label === 'medium') return 'Stable';
        return 'Tired';
      }
      const trend = (weekly_readiness as { recent_form_trend?: 'improving' | 'stable' | 'worsening' } | undefined)?.recent_form_trend;
      if (trend === 'worsening') return 'Tired';
      if (trend === 'improving') return 'Fresh';
      return 'Stable';
    })();
    const rir = avg_rir_acute ?? null;
    const muscleJointsStatus: 'Fresh' | 'Loaded' | 'Recovering' =
      rir == null ? 'Fresh' : rir >= 2 ? 'Fresh' : rir >= 1 ? 'Loaded' : 'Recovering';
    const display_aerobic_tier: FatigueTier = heartLungsStatus === 'Fresh' ? 'Low' : heartLungsStatus === 'Stable' ? 'Moderate' : 'Elevated';
    const display_structural_tier: FatigueTier = muscleJointsStatus === 'Fresh' ? 'Low' : muscleJointsStatus === 'Loaded' ? 'Moderate' : 'Elevated';
    const tierOrder: Record<FatigueTier, number> = { Low: 0, Moderate: 1, Elevated: 2 };
    const display_limiter_line =
      tierOrder[display_aerobic_tier] > tierOrder[display_structural_tier]
        ? 'Today is limited by aerobic fatigue.'
        : tierOrder[display_structural_tier] > tierOrder[display_aerobic_tier]
          ? 'Today is limited by structural fatigue.'
          : 'No clear limiter.';
    const tierWord = (t: FatigueTier) => (t === 'Low' ? 'low' : t === 'Moderate' ? 'moderate' : 'elevated');
    const display_limiter_label =
      tierOrder[display_aerobic_tier] > tierOrder[display_structural_tier]
        ? `Aerobic (${tierWord(display_aerobic_tier)} fatigue)`
        : tierOrder[display_structural_tier] > tierOrder[display_aerobic_tier]
          ? `Structural (${tierWord(display_structural_tier)} fatigue)`
          : 'None';
    let display_load_change_risk_label: string =
      acwr.status === 'undertrained' || acwr.status === 'recovery' || acwr.status === 'optimal_recovery'
        ? 'Below baseline'
        : acwr.status === 'optimal'
          ? 'In range'
          : acwr.status === 'elevated'
            ? 'Ramping fast'
            : 'Overreaching';
    // On plan + low ACWR: label as planned; if down-week, append "— expected this week" so it doesn't feel like a problem.
    let display_load_change_risk_helper: string | null = null;
    if (planContext?.hasActivePlan && acwr.ratio < 0.8) {
      const isDownWeek = planContext.isRecoveryWeek || planContext.isTaperWeek;
      display_load_change_risk_label = isDownWeek ? 'Below baseline (planned — expected this week)' : 'Below baseline (planned)';
      if (isDownWeek) {
        display_load_change_risk_helper = 'Often normal in down-weeks.';
      }
    }

    // ==========================================================================
    // CONTEXT BANNER (never lead with ACWR — plan + limiter + guidance first)
    // Sync with plan: on rest days (no planned workout today), say so.
    // ==========================================================================
    const hasActivePlan = planContext?.hasActivePlan ?? false;
    const isRecoveryWeek = planContext?.isRecoveryWeek ?? false;
    const isTaperWeek = planContext?.isTaperWeek ?? false;
    const todayIsRestDay = hasActivePlan && plannedForFocusDate.length === 0;
    let context_banner: TrainingContextResponse['context_banner'] | undefined;
    if (display_limiter_line) {
      const line1 =
        hasActivePlan && (isRecoveryWeek || isTaperWeek)
          ? 'This is a down-week by design.'
          : hasActivePlan
            ? 'On plan — stay the course.'
            : 'Off plan — adjust this week.';
      const line2 = todayIsRestDay ? 'Today is a rest day.' : display_limiter_line;
      const line3 = todayIsRestDay
        ? 'No planned work — prioritize recovery.'
        : weekly_verdict
          ? weekly_verdict.label === 'high'
            ? 'Proceed with planned sessions.'
            : weekly_verdict.label === 'medium'
              ? 'Hold target pace; keep the session controlled.'
              : 'Prioritize recovery.'
          : 'Follow your planned sessions.';
      const acwr_clause =
        acwr.ratio > 1.3
          ? acwr.ratio > 1.5
            ? 'Load Change Risk is overreaching — avoid adding volume.'
            : 'Load Change Risk is ramping fast — avoid adding volume.'
          : null;
      context_banner = { line1, line2, line3, acwr_clause: acwr_clause ?? undefined };
    }

    // ==========================================================================
    // PROJECTED WEEK LOAD (completed acute + planned remaining — plan-aware forecast)
    // ==========================================================================
    let projected_week_load: TrainingContextResponse['projected_week_load'] | undefined;
    const plannedRemaining = plannedWeek.filter(p => p.date > focusDateISO);
    const planned_remaining_sum = plannedRemaining.reduce((s, p) => s + (Number(p.workload_planned) || 0), 0);
    const completed_acute = acwr.acute_total;
    const projected_acute = completed_acute + planned_remaining_sum;
    const chronic_weekly = acwr.chronic_total / 4;
    if (chronic_weekly > 0 && (hasActivePlan || plannedRemaining.length > 0)) {
      const projected_acute_daily = projected_acute / 7;
      const chronic_daily = acwr.chronic_total / 28;
      const projected_ratio = chronic_daily > 0 ? projected_acute_daily / chronic_daily : 0;
      const projected_label: 'below' | 'in range' | 'ramping' =
        projected_ratio < 0.8 ? 'below' : projected_ratio <= 1.3 ? 'in range' : 'ramping';
      const isRecovery = planContext?.isRecoveryWeek ?? false;
      const isTaper = planContext?.isTaperWeek ?? false;
      const weekIntentMsg = planContext?.weekIntent ?? 'build';
      const intentSuffixMsg =
        isRecovery ? ' (recovery week)' : isTaper ? ' (taper)' : projected_label === 'below' && (weekIntentMsg === 'build' || weekIntentMsg === 'peak' || weekIntentMsg === 'baseline') ? ' (lighter build week)' : '';
      const neutralLine =
        projected_label === 'below'
          ? `Planned week is lighter than your recent baseline${intentSuffixMsg}.`
          : projected_label === 'in range'
            ? 'Planned week is in line with your recent baseline.'
            : 'Planned week is heavier than your recent baseline.';
      projected_week_load = {
        completed_acute,
        planned_remaining: planned_remaining_sum,
        projected_acute,
        chronic_weekly: Math.round(chronic_weekly),
        projected_ratio: Math.round(projected_ratio * 100) / 100,
        projected_label,
        message: `Projected week load: ${Math.round(projected_acute)} vs baseline ${Math.round(chronic_weekly)} — ${neutralLine}`
      };
    }

    // ==========================================================================
    // PLAN CHECK-IN (plan-native: week, today/next, completion — client leads with plan)
    // ==========================================================================
    const weekIntentForSummary = planContext?.weekIntent ?? 'build';
    const phaseLabel = !hasActivePlan ? 'OFF PLAN' : isRecoveryWeek ? 'RECOVERY' : isTaperWeek ? 'TAPER' : weekIntentForSummary === 'peak' ? 'PEAK' : weekIntentForSummary === 'baseline' ? 'BASELINE' : 'BUILD';
    const plannedSessionsWeek = planProgress?.planned_sessions_week ?? 0;
    const matchedSessions = planProgress?.matched_planned_sessions_to_date ?? 0;
    const weekCompletionPct = plannedSessionsWeek > 0 ? Math.min(100, Math.round((matchedSessions / plannedSessionsWeek) * 100)) : 0;
    const weekAdherenceTier: 'high' | 'moderate' | 'low' = weekCompletionPct >= 85 ? 'high' : weekCompletionPct >= 70 ? 'moderate' : 'low';

    const formatDayLabel = (iso: string): string => {
      const d = new Date(iso + 'T12:00:00');
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${days[d.getDay()]} ${d.getDate()}`;
    };

    let plan_checkin: TrainingContextResponse['plan_checkin'] | undefined;
    if (hasActivePlan && planContext?.planName && planContext.weekIndex != null) {
      const todayWorkout = plannedForFocusDate.length > 0 ? plannedForFocusDate[0] : null;
      const nextPlanned = plannedWeek.filter(p => p.date > focusDateISO)[0] ?? null;
      plan_checkin = {
        plan_name: planContext.planName,
        plan_week_index: planContext.weekIndex,
        plan_week_total: planContext.duration_weeks ?? 12,
        plan_phase_label: phaseLabel,
        today_planned_workout: todayWorkout ? { title: todayWorkout.name, type: todayWorkout.type, duration: todayWorkout.duration ?? undefined } : null,
        next_planned_workout: nextPlanned ? { title: nextPlanned.name, type: nextPlanned.type, date: nextPlanned.date, day_label: formatDayLabel(nextPlanned.date) } : null,
        week_completion_pct: weekCompletionPct,
        week_adherence_tier: weekAdherenceTier,
        plan_is_active: true
      };
    }

    // ==========================================================================
    // WEEK REVIEW (plan vs completed; key session audits; no fake adherence)
    // ==========================================================================
    /** Normalize to local training day (YYYY-MM-DD). No tz in edge fn: use date string as-is (plan/DB already store local date). */
    const toLocalDay = (dateIso: string): string => {
      if (!dateIso || typeof dateIso !== 'string') return '';
      const d = dateIso.split('T')[0];
      return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : dateIso;
    };

    /** Deterministic one-line target from planned workout JSON (computed.steps). */
    const summarizePlannedWorkoutTarget = (computed: any, fallbackName: string): string => {
      const steps = computed?.steps;
      if (!Array.isArray(steps) || steps.length === 0) return fallbackName || 'See plan';
      const formatPace = (s: number): string => {
        const m = Math.floor(s / 60);
        const sec = Math.round(s % 60);
        return `${m}:${String(sec).padStart(2, '0')}`;
      };
      const workSteps = steps.filter((s: any) => (s.kind === 'work' || s.role === 'work') && (s.pace_range || s.target_pace));
      const hasIntervals = workSteps.length > 1 || (workSteps.length === 1 && steps.some((s: any) => (s.kind === 'recovery' || s.role === 'recovery')));
      if (hasIntervals && workSteps.length > 0) {
        const w = workSteps[0];
        const workDur = w.duration_s ? `${Math.round(w.duration_s / 60)} min` : w.distance_m ? `${(w.distance_m / 1609.34).toFixed(1)} mi` : '';
        const target = w.pace_range ? `${formatPace(w.pace_range.lower)}–${formatPace(w.pace_range.upper)}/mi` : w.target_pace ? `${formatPace(w.target_pace)}/mi` : 'target';
        const restStep = steps.find((s: any) => s.kind === 'recovery' || s.role === 'recovery');
        const rest = restStep?.duration_s ? `${Math.round(restStep.duration_s)}s` : '';
        return `${workSteps.length}×${workDur || 'work'} @ ${target}${rest ? ` (rest ${rest})` : ''}`;
      }
      if (workSteps.length === 1) {
        const w = workSteps[0];
        const dur = w.duration_s ? `${Math.round(w.duration_s / 60)} min` : w.distance_m ? `${(w.distance_m / 1609.34).toFixed(1)} mi` : '';
        const target = w.pace_range ? `${formatPace(w.pace_range.lower)}–${formatPace(w.pace_range.upper)}/mi` : w.target_pace ? `${formatPace(w.target_pace)}/mi` : 'easy';
        if (/tempo|threshold/i.test(fallbackName)) return `Tempo ${dur} @ ${target}`;
        if (/long|easy/i.test(fallbackName)) return `Long run ${dur} @ easy`;
        return `${dur} @ ${target}`;
      }
      return fallbackName || 'See plan';
    };

    const isQualityType = (type: string, name: string): boolean => {
      const t = (type || '').toLowerCase();
      const n = (name || '').toLowerCase();
      return /interval|vo2|tempo|threshold|fartlek/.test(t) || /interval|tempo|threshold|long run|longrun/.test(n);
    };
    const deriveAuditStatus = (wa: any): { status: 'hit' | 'close' | 'miss' | 'too_hard' | 'too_easy' | 'partial' | 'unknown'; reason_codes: string[] } => {
      const pace = wa?.performance?.pace_adherence;
      const assessment = (wa?.performance_assessment || wa?.summary?.performance_assessment || '') as string;
      const issues = (wa?.primary_issues || []) as string[];
      const reason_codes: string[] = [];
      if (pace != null && Number.isFinite(pace)) {
        if (assessment && /too fast|faster than|over pace|bonus pace/i.test(assessment)) {
          reason_codes.push('PACE_TOO_FAST');
          return { status: 'too_hard', reason_codes };
        }
        if (assessment && /too slow|slower than|under pace/i.test(assessment)) {
          reason_codes.push('PACE_TOO_SLOW');
          return { status: 'too_easy', reason_codes };
        }
        if (pace >= 90) return { status: 'hit', reason_codes };
        if (pace >= 75) return { status: 'close', reason_codes };
        if (pace >= 60) {
          reason_codes.push('PACE_OFF_TARGET');
          return { status: 'partial', reason_codes };
        }
        reason_codes.push('PACE_OFF_TARGET');
        return { status: 'miss', reason_codes };
      }
      return { status: 'unknown', reason_codes };
    };

    let week_review: TrainingContextResponse['week_review'] | undefined;
    let week_narrative: TrainingContextResponse['week_narrative'] | undefined;
    if (hasActivePlan && planContext?.planName && planContext.weekIndex != null && weekStartISO && weekEndISO) {
      const plannedToDate = plannedWeek.filter(p => p.date <= focusDateISO);
      const plannedRemaining = plannedWeek.filter(p => p.date > focusDateISO);
      const sessionsToDate = plannedToDate.length;
      const sessionsRemaining = plannedRemaining.length;
      const qualityToDate = plannedToDate.filter(p => isQualityType(p.type, p.name)).length;

      const weekStartDate = new Date(weekStartISO + 'T12:00:00');
      const dayIndex = (dateIso: string): number =>
        Math.floor((new Date(toLocalDay(dateIso) + 'T12:00:00').getTime() - weekStartDate.getTime()) / (24 * 60 * 60 * 1000));

      // All types: completed workouts in week (to focus date) — for plan matching and workload
      const weekCompleted = (workouts || []).filter((w: WorkoutRecord) =>
        w.date >= weekStartISO! && w.date <= focusDateISO
      );
      const sessionsCompletedTotal = weekCompleted.length;
      const planned_dates = plannedToDate.map(p => toLocalDay(p.date));
      const completed_dates = weekCompleted.map((w: WorkoutRecord) => toLocalDay(w.date));

      // Run-only: for key_session_audits and any run-specific copy
      const weekRuns = weekCompleted.filter((w: WorkoutRecord) => {
        const t = (w.type || '').toLowerCase();
        return t === 'run' || t === 'running';
      });

      // Match (smart, deterministic):
      // 1) Hard links: planned_workouts.completed_workout_id or workouts.planned_id
      // 2) High-confidence inference: score-based matching (type + day proximity + duration/workload similarity)
      // 3) Persist high-confidence inferred links so the system improves over time (no manual linking needed)
      const matched_pairs: Array<{ planned_date: string; completed_date: string; planned_id: string; workout_id: string }> = [];
      const plannedIdsUsed = new Set<string>();
      const workoutIdsUsed = new Set<string>();
      const normalizeType = (t: string): string => {
        const s = (t || '').toLowerCase();
        if (s.includes('run') || s === 'running') return 'run';
        if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return 'ride';
        if (s.includes('swim')) return 'swim';
        if (s.includes('strength') || s.includes('weight')) return 'strength';
        if (s.includes('mobility') || s === 'pt') return 'mobility';
        return s || 'run';
      };

      const isOptionalPlanned = (p: PlannedWorkoutRecord): boolean => {
        const n = String(p?.name || '').toLowerCase();
        const t = String(p?.type || '').toLowerCase();
        return n.includes('optional') || /\bopt\b/.test(t) || t.includes('opt_') || t.includes('_opt');
      };

      const daysBetween = (aISO: string, bISO: string): number => {
        const a = new Date(toLocalDay(aISO) + 'T12:00:00').getTime();
        const b = new Date(toLocalDay(bISO) + 'T12:00:00').getTime();
        return Math.round(Math.abs(a - b) / (24 * 60 * 60 * 1000));
      };

      const scorePlannedToWorkout = (p: PlannedWorkoutRecord, w: WorkoutRecord): number => {
        const pType = normalizeType((p as any).type);
        const wType = normalizeType((w as any).type);
        if (pType !== wType) return -Infinity;

        const dayDelta = daysBetween(p.date, w.date);
        // Keep inference tight: most plan moves are within ±1–2 days. Allow optional to float slightly more.
        const maxDayDelta = isOptionalPlanned(p) ? 3 : 2;
        if (dayDelta > maxDayDelta) return -Infinity;

        let score = 100;
        score -= dayDelta * 15;
        if (dayDelta === 0) score += 15;

        // Duration similarity (minutes). Use moving_time when available.
        const plannedDur = Number((p as any).duration) || 0;
        const doneDur = Number((w as any).moving_time) || Number((w as any).duration) || 0;
        if (plannedDur > 0 && doneDur > 0) {
          const pct = Math.abs(doneDur - plannedDur) / plannedDur;
          if (pct <= 0.10) score += 20;
          else if (pct <= 0.25) score += 10;
          else if (pct >= 0.60) score -= 15;
        }

        // Workload similarity
        const plannedWL = Number((p as any).workload_planned) || 0;
        const doneWL = Number((w as any).workload_actual) || 0;
        if (plannedWL > 0 && doneWL > 0) {
          const pct = Math.abs(doneWL - plannedWL) / plannedWL;
          if (pct <= 0.20) score += 20;
          else if (pct <= 0.40) score += 10;
        }

        // Name/intent keyword overlap (small bonus)
        const pn = String(p?.name || '').toLowerCase();
        const wn = String((w as any)?.name || '').toLowerCase();
        const keywords = ['easy', 'recovery', 'long', 'interval', 'tempo', 'threshold', 'vo2', 'upper', 'lower', 'maintenance'];
        const overlap = keywords.some(k => pn.includes(k) && wn.includes(k));
        if (overlap) score += 8;

        return score;
      };

      const inferAndPersistLink = async (planned_id: string, workout_id: string): Promise<void> => {
        try {
          await supabase.from('planned_workouts').update({ completed_workout_id: workout_id }).eq('id', planned_id);
          await supabase.from('workouts').update({ planned_id }).eq('id', workout_id).eq('user_id', user_id);
        } catch (_) {
          /* ignore per-call errors */
        }
      };

      // -----------------------------------------------------------------------
      // 1) Hard links (completed_workout_id or workouts.planned_id)
      // -----------------------------------------------------------------------
      for (const p of plannedToDate) {
        const pId = String(p.id);
        let wid = (p as PlannedWorkoutRecord & { completed_workout_id?: string | null }).completed_workout_id;
        if (!wid) {
          const fromWorkout = weekCompleted.find((w: WorkoutRecord & { planned_id?: string | null }) => String(w.planned_id || '') === pId);
          if (fromWorkout) wid = fromWorkout.id;
        }
        if (!wid || plannedIdsUsed.has(pId)) continue;
        const completedWorkout = weekCompleted.find((w: WorkoutRecord) => w.id === wid);
        if (!completedWorkout) continue;
        plannedIdsUsed.add(pId);
        workoutIdsUsed.add(wid);
        matched_pairs.push({
          planned_date: toLocalDay(p.date),
          completed_date: toLocalDay(completedWorkout.date),
          planned_id: pId,
          workout_id: wid
        });
      }

      // -----------------------------------------------------------------------
      // 2) High-confidence inference (score-based matching)
      // -----------------------------------------------------------------------
      const remainingPlanned = plannedToDate.filter(p => !plannedIdsUsed.has(String(p.id)));
      const remainingWorkouts = weekCompleted.filter((w: WorkoutRecord) => !workoutIdsUsed.has(w.id));

      type Candidate = { workout: WorkoutRecord; score: number };
      const plannedCandidates = remainingPlanned.map(p => {
        const scored: Candidate[] = remainingWorkouts
          .map(w => ({ workout: w, score: scorePlannedToWorkout(p, w) }))
          .filter(c => Number.isFinite(c.score) && c.score > -Infinity)
          .sort((a, b) => b.score - a.score);
        const best = scored[0]?.score ?? -Infinity;
        const second = scored[1]?.score ?? -Infinity;
        return { planned: p, scored, best, margin: best - second };
      });

      // Greedy assign planned sessions with the most unambiguous best match first
      plannedCandidates
        .sort((a, b) => (b.margin - a.margin) || (b.best - a.best))
        .forEach(item => {
          const p = item.planned;
          const pId = String(p.id);
          if (plannedIdsUsed.has(pId)) return;

          const best = item.scored.find(c => !workoutIdsUsed.has(c.workout.id));
          if (!best) return;

          // Confidence gates: require a high score and a margin over the next-best alternative
          const MIN_SCORE = isOptionalPlanned(p) ? 70 : 78;
          const MIN_MARGIN = 15;
          if (best.score < MIN_SCORE) return;
          if (item.margin < MIN_MARGIN) return;

          plannedIdsUsed.add(pId);
          workoutIdsUsed.add(best.workout.id);
          matched_pairs.push({
            planned_date: toLocalDay(p.date),
            completed_date: toLocalDay(best.workout.date),
            planned_id: pId,
            workout_id: best.workout.id
          });
        });

      // Persist high-confidence inferred links (including same-day) so users don't have to manually link
      const persistedPairs = matched_pairs.filter(pair => {
        const plannedRow = plannedToDate.find((p: any) => String(p.id) === pair.planned_id) as any;
        const workoutRow = weekCompleted.find((w: WorkoutRecord) => w.id === pair.workout_id) as any;
        if (!plannedRow || !workoutRow) return false;
        // Only persist if neither side is already linked
        const already = (plannedRow.completed_workout_id ?? null) === pair.workout_id || (workoutRow.planned_id ?? null) === pair.planned_id;
        return !already;
      });
      for (const pair of persistedPairs) {
        // Only persist when the pair was inferred (not hard-linked) AND looks unambiguous.
        // We approximate by requiring the planned session still had no completed_workout_id.
        const plannedRow = plannedToDate.find((p: any) => String(p.id) === pair.planned_id) as any;
        if (!plannedRow || plannedRow.completed_workout_id) continue;
        await inferAndPersistLink(pair.planned_id, pair.workout_id);
      }

      const sessionsMatchedToPlan = matched_pairs.length;
      const matchCoveragePct = sessionsCompletedTotal > 0 ? matched_pairs.length / sessionsCompletedTotal : 0;
      const completed_unlinked_count = Math.max(0, sessionsCompletedTotal - sessionsMatchedToPlan);
      const sessionsMissedRaw = Math.max(0, sessionsToDate - sessionsMatchedToPlan);
      // Only show "missed" when linking is complete and math is trustworthy (planned>=3, unlinked=0, coverage>=0.75 so 6/8 counts)
      const coverageToDate = sessionsToDate > 0 ? sessionsMatchedToPlan / sessionsToDate : 0;
      const sessionsMissed =
        sessionsToDate >= 3 && completed_unlinked_count === 0 && coverageToDate >= 0.75
          ? sessionsMissedRaw
          : null;

      const matchCoverageNote =
        matchCoveragePct < 1 && sessionsCompletedTotal > 0
          ? 'Some sessions couldn\'t be matched to your plan. We\'re still learning your patterns.'
          : null;

      // Workload to-date: matched completed vs planned (apples-to-apples, all types)
      const planned_to_date_workload = plannedToDate.reduce((s, p) => s + (Number(p.workload_planned) || 0), 0);
      const completed_matched_workload = matched_pairs.reduce((s, pair) => {
        const w = weekCompleted.find((r: WorkoutRecord) => r.id === pair.workout_id);
        return s + (w ? Number(w.workload_actual) || 0 : 0);
      }, 0);
      const workload_pct_of_planned_to_date =
        planned_to_date_workload > 0 ? Math.round((completed_matched_workload / planned_to_date_workload) * 100) : null;

      // Moved: matched pair where planned_date !== completed_date (done on different day, within ±1)
      const movedExamples: Array<{ title: string; planned_date: string; done_date: string }> = [];
      let sessionsMoved = 0;
      for (const pair of matched_pairs) {
        if (pair.planned_date === pair.completed_date) continue;
        sessionsMoved += 1;
        if (movedExamples.length < 2) {
          const w = weekCompleted.find((x: WorkoutRecord) => x.id === pair.workout_id);
          const p = plannedToDate.find(pp => String(pp.id) === pair.planned_id);
          movedExamples.push({
            title: w?.name || p?.name || (p?.type || 'Session'),
            planned_date: pair.planned_date,
            done_date: pair.completed_date
          });
        }
      }

      const focusDateOnly = new Date(focusDateISO + 'T12:00:00');
      const weekDayIndex = Math.min(7, Math.max(1, Math.floor((focusDateOnly.getTime() - weekStartDate.getTime()) / (24 * 60 * 60 * 1000)) + 1));

      const runsWithAnalysis = (runsThisWeekWithAnalysis || []) as Array<{ id: string; date: string; planned_id: string; name: string; type: string; workout_analysis: any }>;
      const qualityRunsWithAnalysis = runsWithAnalysis.filter(r => {
        const planned = plannedWeek.find(p => String(p.id) === String(r.planned_id));
        return planned && isQualityType(planned.type, planned.name);
      });

      /** Build delta from workout_analysis (single source of truth). Runner-trustworthy: seconds/mi primary, pct in parens. */
      const buildAuditDelta = (wa: any): {
        metric: string;
        planned: string;
        actual: string;
        pct: number;
        seconds_per_mile: number;
        direction: 'fast' | 'slow' | 'on_target';
      } | null => {
        const intervals = wa?.detailed_analysis?.interval_breakdown?.intervals;
        if (!Array.isArray(intervals)) return null;
        const work = intervals.filter((i: any) => (i.interval_type || '').toLowerCase() === 'work');
        if (work.length === 0) return null;
        const withPace = work.filter((i: any) =>
          (i.planned_pace_range_lower != null && i.planned_pace_range_upper != null) || (i.planned_pace_range?.lower != null && i.planned_pace_range?.upper != null)
        );
        if (withPace.length === 0) return null;
        const formatPaceS = (s: number): string => {
          const m = Math.floor(s / 60);
          const sec = Math.round(s % 60);
          return `${m}:${String(sec).padStart(2, '0')}/mi`;
        };
        const lower = withPace[0].planned_pace_range_lower ?? withPace[0].planned_pace_range?.lower ?? 0;
        const upper = withPace[0].planned_pace_range_upper ?? withPace[0].planned_pace_range?.upper ?? 0;
        if (upper <= 0) return null;
        let actualSum = 0;
        let actualCount = 0;
        for (const i of withPace) {
          const ap = i.actual_pace_min_per_mi;
          if (ap != null && Number.isFinite(ap)) {
            actualSum += ap * 60; // min/mi -> s/mi
            actualCount += 1;
          }
        }
        if (actualCount === 0) return null;
        const actualS = actualSum / actualCount;
        const mid = (lower + upper) / 2;
        const pct = Math.round((actualS - mid) / mid * 100); // negative = faster
        const plannedStr = `${formatPaceS(lower)}–${formatPaceS(upper)}`;
        const actualStr = formatPaceS(actualS) + ' avg';
        const secFastVsUpper = actualS - upper; // negative = faster than upper
        const secSlowVsLower = actualS - lower; // positive = slower than lower
        let seconds_per_mile: number;
        let direction: 'fast' | 'slow' | 'on_target';
        if (actualS < upper && actualS > lower) {
          seconds_per_mile = 0;
          direction = 'on_target';
        } else if (actualS <= upper && actualS < lower) {
          seconds_per_mile = Math.round(actualS - lower); // negative
          direction = 'fast';
        } else if (actualS >= lower && actualS > upper) {
          seconds_per_mile = Math.round(actualS - upper); // positive
          direction = 'slow';
        } else if (secFastVsUpper < 0) {
          seconds_per_mile = Math.round(secFastVsUpper);
          direction = 'fast';
        } else {
          seconds_per_mile = Math.round(secSlowVsLower);
          direction = 'slow';
        }
        return { metric: 'pace', planned: plannedStr, actual: actualStr, pct, seconds_per_mile, direction };
      };

      type AuditItem = NonNullable<NonNullable<TrainingContextResponse['week_review']>['key_session_audits'][number]>;
      const key_session_audits: AuditItem[] = [];
      let paceSum = 0;
      let paceCount = 0;
      for (let i = 0; i < Math.min(2, qualityRunsWithAnalysis.length); i++) {
        const r = qualityRunsWithAnalysis[i];
        const wa = r.workout_analysis as any;
        const { status, reason_codes } = deriveAuditStatus(wa);
        const delta = buildAuditDelta(wa);
        const pace = wa?.performance?.pace_adherence;
        if (pace != null && Number.isFinite(pace)) {
          paceSum += Number(pace);
          paceCount += 1;
        }
        const planned = plannedWeek.find(p => String(p.id) === String(r.planned_id));
        const sessionType = (planned?.type || r.type || 'run').toLowerCase();
        let headline = '';
        let detail = '';
        if (status === 'too_hard') {
          if (delta != null) {
            headline = delta.direction === 'fast'
              ? `Intervals were ${Math.abs(delta.pct)}% faster than target.`
              : 'Intervals were faster than target.';
            detail = 'Next time: keep reps inside target band; don\'t "bonus pace".';
          } else {
            headline = 'Execution review unavailable.';
            detail = 'Missing plan targets or interval splits for this workout.';
          }
        } else if (status === 'too_easy') {
          if (delta != null) {
            headline = `Session ${delta.pct}% slower than target.`;
            detail = 'Next quality day: aim for target pace band.';
          } else {
            headline = 'Session slower than plan target.';
            detail = 'Next quality day: aim for target pace band.';
          }
        } else if (status === 'hit' || status === 'close') {
          headline = sessionType.includes('interval') ? 'Intervals on target.' : 'Session on target.';
        } else if (status === 'partial' || status === 'miss') {
          headline = pace != null ? `Pace adherence ${Math.round(pace)}% vs plan.` : 'Execution off plan target.';
          detail = 'Next quality day: hold target pace band.';
        } else {
          headline = 'Execution review unavailable.';
          detail = 'Missing plan targets or interval splits for this workout.';
        }
        key_session_audits.push({
          planned_id: String(r.planned_id),
          date: r.date,
          title: r.name || planned?.name || 'Run',
          type: sessionType,
          status,
          reason_codes,
          headline,
          detail: detail || undefined,
          delta: delta ?? undefined
        });
      }
      const overallPacePct = paceCount > 0 ? Math.round(paceSum / paceCount) : null;

      const nextQualityPlanned = plannedRemaining.find(p => isQualityType(p.type, p.name)) ?? null;
      let primaryTarget: string | null = null;
      const dateLocal = nextQualityPlanned ? toLocalDay(nextQualityPlanned.date) : null;
      if (nextQualityPlanned) {
        const { data: nextPlannedRow } = await supabase
          .from('planned_workouts')
          .select('computed, name')
          .eq('id', nextQualityPlanned.id)
          .single();
        const computed = (nextPlannedRow as any)?.computed;
        primaryTarget = summarizePlannedWorkoutTarget(computed, nextQualityPlanned.name || nextPlannedRow?.name || 'Run');
      }

      const latestAudit = key_session_audits[0];
      const latestIsHot = latestAudit?.status === 'too_hard';
      const mostlyHitClose = key_session_audits.length > 0 &&
        key_session_audits.filter(a => a.status === 'hit' || a.status === 'close').length >= Math.ceil(key_session_audits.length / 2);
      const reasonCodes: string[] = [];
      let weekVerdictHeadline: string;
      let weekVerdictDetail: string | null = null;
      if (sessionsMatchedToPlan === 0 && sessionsCompletedTotal > 0) {
        weekVerdictHeadline = 'Sessions not matched to plan.';
        weekVerdictDetail = 'We couldn\'t link your runs to planned sessions. Use "Link to plan" on a run to match it, or we\'ll keep learning.';
        reasonCodes.push('NO_MATCHES');
      } else if (sessionsMissed != null && sessionsMissed > 0) {
        weekVerdictHeadline = 'Week is behind plan.';
        weekVerdictDetail = `${sessionsMissed} session(s) missed to date.`;
        reasonCodes.push('MISSED_SESSIONS');
      } else if (latestIsHot) {
        weekVerdictHeadline = 'Execution is trending hot.';
        weekVerdictDetail = 'Your last quality session was faster than target. Tighten pacing on the next key day.';
        reasonCodes.push('KEY_SESSION_HOT');
      } else if (sessionsMoved > 0) {
        weekVerdictHeadline = 'Week is on track (adjusted).';
        weekVerdictDetail = `Schedule adjusted: ${sessionsMoved} moved.`;
        reasonCodes.push('MOVED_SESSIONS');
      } else {
        weekVerdictHeadline = 'Week is on track.';
        if (mostlyHitClose) reasonCodes.push('ON_TRACK');
      }
      const week_verdict = {
        headline: weekVerdictHeadline,
        detail: weekVerdictDetail ?? undefined,
        reason_codes: reasonCodes
      };

      const planGoalLine = planContext.planName && (planContext.race_date != null || planContext.weeks_remaining != null)
        ? `${planContext.planName}${planContext.weeks_remaining != null ? ` • ${planContext.weeks_remaining} week${planContext.weeks_remaining !== 1 ? 's' : ''} to ${planContext.race_date ? 'race' : 'go'}` : ''}`
        : null;
      week_review = {
        week_index: planContext.weekIndex,
        week_total: planContext.duration_weeks ?? 12,
        week_day_index: weekDayIndex,
        phase: (phaseLabel === 'OFF PLAN' ? 'off_plan' : phaseLabel === 'RECOVERY' ? 'recovery' : phaseLabel === 'TAPER' ? 'taper' : phaseLabel === 'PEAK' ? 'peak' : 'build') as 'build' | 'recovery' | 'peak' | 'taper' | 'off_plan',
        week_focus_label: planContext.weekFocusLabel ?? undefined,
        plan_goal_line: planGoalLine ?? undefined,
        planned: {
          sessions_total: plannedWeek.length,
          sessions_to_date: sessionsToDate,
          sessions_remaining: sessionsRemaining,
          quality_sessions_to_date: qualityToDate
        },
        completed: {
          sessions_completed_total: sessionsCompletedTotal,
          sessions_matched_to_plan: sessionsMatchedToPlan,
          sessions_missed: sessionsMissed,
          match_coverage_pct: Math.round(matchCoveragePct * 100) / 100,
          sessions_moved: sessionsMoved
        },
        execution: {
          pace_adherence_pct: overallPacePct,
          overall_adherence_pct: overallPacePct
        },
        key_session_audits,
        next_key_session: nextQualityPlanned
          ? {
              planned_id: nextQualityPlanned.id,
              date: nextQualityPlanned.date,
              date_local: dateLocal,
              title: nextQualityPlanned.name,
              primary_target: primaryTarget,
              sport: (nextQualityPlanned.type || 'run').toLowerCase()
            }
          : { planned_id: null, date: null, date_local: null, title: null, primary_target: null, sport: null },
        moved_examples: movedExamples.length > 0 ? movedExamples : undefined,
        week_verdict,
        match_coverage_note: matchCoverageNote ?? undefined,
        planned_to_date_workload: Math.round(planned_to_date_workload),
        completed_matched_workload: Math.round(completed_matched_workload),
        workload_pct_of_planned_to_date: workload_pct_of_planned_to_date,
        debug_week_truth: {
          focus_date: focusDateISO,
          week_start: weekStartISO!,
          week_end: weekEndISO!,
          planned_dates,
          completed_dates,
          matched_pairs
        }
      };

      // -----------------------------------------------------------------------
      // WEEK NARRATIVE (coach dashboard: execution + load + response + synthesis)
      // -----------------------------------------------------------------------
      const completed_unlinked = completed_unlinked_count;
      const mapAuditStatus = (s: string): 'on_target' | 'slightly_off' | 'too_fast' | 'too_easy' | 'incomplete' | 'unavailable' => {
        if (s === 'hit' || s === 'close') return 'on_target';
        if (s === 'partial' || s === 'miss') return 'slightly_off';
        if (s === 'too_hard') return 'too_fast';
        if (s === 'too_easy') return 'too_easy';
        if (s === 'unknown') return 'unavailable';
        return 'incomplete';
      };
      const key_sessions_flags = key_session_audits.map(a => ({
        planned_id: a.planned_id,
        title: a.title,
        date: a.date,
        status: mapAuditStatus(a.status),
        delta: a.delta ? { planned: a.delta.planned, actual: a.delta.actual, pct: a.delta.pct } : undefined,
        one_fix: a.detail ?? undefined
      }));
      // Execution quality label (from key session audits only; deterministic coach judgment)
      const key_sessions_audited = key_sessions_flags.length;
      const key_sessions_on_target_count = key_sessions_flags.filter(s => s.status === 'on_target').length;
      const on_target_rate = key_sessions_audited > 0 ? key_sessions_on_target_count / key_sessions_audited : 0;
      const has_too_fast_or_too_easy = key_sessions_flags.some(s => s.status === 'too_fast' || s.status === 'too_easy');
      let execution_quality_label: 'on_target' | 'mixed' | 'off_target' | 'unknown' = 'unknown';
      let execution_quality_reason = 'Key session execution not available yet.';
      if (key_sessions_audited === 0) {
        execution_quality_label = 'unknown';
        execution_quality_reason = 'Key session execution not available yet.';
      } else if (has_too_fast_or_too_easy) {
        execution_quality_label = 'off_target';
        execution_quality_reason = key_sessions_flags.some(s => s.status === 'too_fast')
          ? 'Key work is drifting faster than target.'
          : 'Key work is drifting slower than target.';
      } else if (on_target_rate >= 0.8) {
        execution_quality_label = 'on_target';
        execution_quality_reason = 'Key sessions are landing inside target.';
      } else {
        execution_quality_label = 'mixed';
        execution_quality_reason = 'One key session hit target; one drifted.';
      }
      const load_vs_baseline: 'lighter' | 'similar' | 'heavier' | null =
        acwr.status === 'undertrained' || acwr.status === 'recovery' || acwr.status === 'optimal_recovery' ? 'lighter'
          : acwr.status === 'optimal' ? 'similar'
          : acwr.status === 'elevated' || acwr.status === 'high_risk' ? 'heavier'
          : null;
      const ramp_flag: 'stable' | 'fast' | null = acwr.ratio > 1.3 ? 'fast' : 'stable';
      const aerobicTier = display_aerobic_tier === 'Low' ? 'low' : display_aerobic_tier === 'Moderate' ? 'moderate' : 'elevated';
      const structuralTier = display_structural_tier === 'Low' ? 'low' : display_structural_tier === 'Moderate' ? 'moderate' : 'elevated';
      const limiter: 'aerobic' | 'structural' | 'none' =
        display_limiter_label?.startsWith('Aerobic') ? 'aerobic' : display_limiter_label?.startsWith('Structural') ? 'structural' : 'none';
      const trend = ((weekly_readiness as { recent_form_trend?: 'improving' | 'stable' | 'worsening' } | undefined)?.recent_form_trend) ?? 'unknown';

      // Carryover: decayed load from previous week into current (physiological residue)
      const CARRYOVER_DECAY: Record<number, number> = { 1: 0.9, 2: 0.75, 3: 0.6, 4: 0.45, 5: 0.3, 6: 0.15, 7: 0 };
      let carryover_level: 'low' | 'moderate' | 'high' = 'low';
      let carryover_pct_of_baseline: number | null = null;
      if (dateRanges.previousWeekStartISO && dateRanges.previousWeekEndISO) {
        const prevWorkouts = (workouts || []).filter((w: WorkoutRecord) =>
          w.date >= dateRanges.previousWeekStartISO! && w.date <= dateRanges.previousWeekEndISO!
        );
        const loadByDay: Record<string, number> = {};
        for (const w of prevWorkouts) {
          const d = w.date.slice(0, 10);
          loadByDay[d] = (loadByDay[d] || 0) + (Number(w.workload_actual) || 0);
        }
        const focusDate = new Date(focusDateISO + 'T12:00:00');
        let carryoverSum = 0;
        for (const [day, load] of Object.entries(loadByDay)) {
          const dayDate = new Date(day + 'T12:00:00');
          const daysAgo = Math.round((focusDate.getTime() - dayDate.getTime()) / (24 * 60 * 60 * 1000));
          const weight = daysAgo >= 1 && daysAgo <= 7 ? CARRYOVER_DECAY[daysAgo] : 0;
          carryoverSum += load * weight;
        }
        const baseline = acwr.chronic_total > 0 ? acwr.chronic_total / 4 : 0; // one week typical
        if (baseline > 0) {
          carryover_pct_of_baseline = Math.round(100 * carryoverSum / baseline);
          if (carryoverSum < 0.25 * baseline) carryover_level = 'low';
          else if (carryoverSum <= 0.55 * baseline) carryover_level = 'moderate';
          else carryover_level = 'high';
        }
      }
      // Carryover interpretation (why previous week is impacting current)
      let carryover_interpretation: string | null = null;
      if (carryover_level !== 'low' && (carryover_level === 'moderate' || carryover_level === 'high')) {
        if (limiter === 'structural') carryover_interpretation = 'Carryover is likely showing up as structural fatigue.';
        else if (limiter === 'aerobic') carryover_interpretation = 'Carryover is likely showing up as aerobic fatigue.';
        else carryover_interpretation = 'Carryover is elevated; keep key work controlled.';
      }

      // Headline priority (commercial-grade): STATUS first (fatigue/response), then data integrity, then execution.
      // Goal: the headline should reflect "state of the athlete", not compliance bookkeeping.
      const coverageToDatePct = sessionsToDate > 0 ? sessionsMatchedToPlan / sessionsToDate : 0;
      const linkingIncomplete = completed_unlinked > 0 && (sessionsToDate === 0 || coverageToDatePct < 0.5);
      const keySessionProblem = key_sessions_flags.some(s => s.status === 'too_fast' || s.status === 'too_easy' || s.status === 'slightly_off');
      const responseSlipping = ramp_flag === 'fast' && trend === 'worsening';
      const carryoverHighFatigue = (carryover_level === 'high' || carryover_level === 'moderate') && (aerobicTier === 'elevated' || structuralTier === 'elevated');
      const intent = planContext?.weekIntent ?? 'unknown';
      const nextIntent = planContext?.next_week_intent ?? null;
      const endOfBuildBlock =
        (intent === 'build' || intent === 'peak' || intent === 'baseline') && nextIntent === 'recovery';
      const evidenceWarnings =
        Array.isArray((weekly_readiness as any)?.__trend_evidence)
          ? ((weekly_readiness as any).__trend_evidence as Array<{ severity?: string }>).filter(e => e?.severity === 'warning').length
          : 0;
      const fatigueBuilding =
        trend === 'worsening' &&
        (aerobicTier === 'elevated' || structuralTier === 'elevated' || ramp_flag === 'fast' || carryover_level === 'high' || carryover_level === 'moderate');
      const overreached =
        trend === 'worsening' &&
        (aerobicTier === 'elevated' && structuralTier === 'elevated') &&
        (execution_quality_label === 'off_target' || keySessionProblem);

      let headline = 'On track — keep the rhythm.';
      if (overreached) {
        headline = 'Overreaching — absorb before adding.';
      } else if (endOfBuildBlock && trend === 'worsening') {
        // Science: functional fatigue is expected at the end of a build block. Use consolidating language.
        headline = evidenceWarnings > 0
          ? 'End of build block — fatigue is showing. Consolidate this week.'
          : 'End of build block — consolidate this week.';
      } else if (fatigueBuilding) {
        // Build weeks tolerate more fatigue; recovery/taper treat it as higher priority.
        headline =
          intent === 'build' || intent === 'peak' || intent === 'baseline'
            ? 'Build fatigue rising — consolidate (hold targets).'
            : 'Fatigue building — absorb this week.';
      } else if (responseSlipping) {
        headline = 'Load is up; response is slipping.';
      } else if (carryoverHighFatigue) {
        headline = 'Carryover is showing — keep key work controlled.';
      } else if (linkingIncomplete) {
        headline = 'Week review incomplete — link sessions.';
      } else if (sessionsMissed != null && sessionsMissed > 0) {
        headline = 'Behind plan — protect the next key session.';
      } else if (keySessionProblem) {
        headline = execution_quality_label === 'off_target'
          ? 'Key work drifting — tighten the cap.'
          : 'Key session execution needs attention.';
      } else if (sessionsMoved > 0) {
        headline = 'On track (schedule adjusted).';
      } else if (ramp_flag === 'fast') {
        headline = 'Ramp is fast — keep the next session controlled.';
      } else if (load_vs_baseline === 'lighter' && (planContext.isRecoveryWeek || planContext.weekIntent === 'recovery')) {
        headline = 'Recovery week by design — keep it easy.';
      }

      // Bullets: keep this screen physiology-focused. Calendar owns compliance/accounting.
      // Only include bullets that help interpret training response (quality execution, trend, carryover, load).
      const bullets: string[] = [];
      // Execution quality line (from audits)
      if (execution_quality_label === 'off_target') {
        const hot = key_session_audits.find(a => a.status === 'too_hard' && a.delta);
        bullets.push(hot?.delta ? `Intervals: ${Math.abs(hot.delta.pct)}% fast vs target — tighten the cap next time.` : execution_quality_reason);
      } else if (execution_quality_label === 'mixed') {
        bullets.push(execution_quality_reason);
      } else if (execution_quality_label === 'on_target' && key_sessions_audited > 0) {
        bullets.push('Long run / intervals: on target — keep the rhythm.');
      } else if (execution_quality_label === 'unknown' && key_sessions_audited === 0) {
        bullets.push(execution_quality_reason);
      }
      // Carryover (only if moderate/high)
      if (carryover_interpretation) bullets.push(`Carryover (last week): ${carryover_level} — ${carryover_interpretation}`);
      // Load/ramp or response (cap total at 4; drop load first unless ramp fast, then response)
      if (ramp_flag === 'fast') bullets.push(`Ramp: ${trend !== 'unknown' ? trend : 'elevated'} — load is rising quickly.`);
      else if (trend !== 'unknown') bullets.push(`Trend: ${trend} — ${trend === 'worsening' ? 'fatigue signs rising; hold targets.' : trend === 'improving' ? 'absorbing well.' : 'stable.'}`);
      // Cap at 4 bullets: drop load line first (unless ramp fast), then response line
      if (bullets.length > 4) {
        if (ramp_flag !== 'fast') {
          const rampIdx = bullets.findIndex(b => b.startsWith('Ramp:'));
          if (rampIdx >= 0) bullets.splice(rampIdx, 1);
        }
        if (bullets.length > 4) {
          const trendIdx = bullets.findIndex(b => b.startsWith('Trend:'));
          if (trendIdx >= 0) bullets.splice(trendIdx, 1);
        }
        if (bullets.length > 4) bullets.splice(4);
      }

      // One primary action (deterministic). This is what the user should do next.
      // Keep it short. If there are unconfirmed required sessions, name the top priority.
      const pickUnconfirmedRequired = (): PlannedWorkoutRecord | null => {
        try {
          const isOptionalPlanned = (p: PlannedWorkoutRecord): boolean => {
            const n = String(p?.name || '').toLowerCase();
            const t = String(p?.type || '').toLowerCase();
            return n.includes('optional') || /\bopt\b/.test(t) || t.includes('opt_') || t.includes('_opt');
          };
          const isQuality = (p: PlannedWorkoutRecord): boolean => isQualityType(p.type, p.name);
          const unconfirmed = plannedToDate.filter(p => !plannedIdsUsed.has(String(p.id)));
          const required = unconfirmed.filter(p => !isOptionalPlanned(p));
          // Prefer missing easy/non-quality first (low cost, high compliance value)
          return required.find(p => !isQuality(p)) ?? required[0] ?? null;
        } catch {
          return null;
        }
      };

      let implication: string | null = null;
      if (todayIsRestDay) {
        implication = 'Action: Keep today as rest; hold targets and don’t add volume.';
      } else if (nextQualityPlanned && execution_quality_label === 'off_target') {
        implication = 'Action: Keep the next key session inside the target band.';
      } else if (nextQualityPlanned && latestIsHot) {
        implication = 'Action: Protect the long run — keep the next quality day inside target.';
      } else if (trend === 'worsening') {
        implication = 'Action: Hold targets. Don’t extend reps. Skip optionals.';
      } else if (nextQualityPlanned) {
        implication = 'Action: Next key session — stay inside the target band.';
      }

      // Today's role in the week (from planned workout for focus day — congruent with plan)
      type TodayRole = 'recover' | 'easy' | 'key' | 'optional' | 'rest';
      let today_role: TodayRole = 'rest';
      let today_role_label: string = 'Rest day';
      if (plannedForFocusDate.length > 0) {
        const first = plannedForFocusDate[0];
        const t = (first.type || '').toLowerCase();
        if (isQualityType(first.type, first.name)) {
          today_role = 'key';
          today_role_label = 'Key session';
        } else if (t === 'run' || t === 'running' || t === 'ride' || t === 'bike' || t === 'swim') {
          today_role = planContext.isRecoveryWeek || planContext.weekIntent === 'recovery' ? 'recover' : 'easy';
          today_role_label = today_role === 'recover' ? 'Recovery day (absorption)' : 'Easy day';
        } else if (t === 'mobility' || t === 'strength') {
          today_role = 'optional';
          today_role_label = 'Optional';
        } else {
          today_role = 'easy';
          today_role_label = 'Easy day';
        }
      }

      // Unlinked completed workout IDs (for dev debug)
      const completed_unlinked_ids = weekCompleted
        .filter((w: WorkoutRecord) => !matched_pairs.some(p => p.workout_id === w.id))
        .map((w: WorkoutRecord) => w.id);

      const trend_explanation = await buildTrendExplanation();
      week_narrative = {
        week_index: planContext.weekIndex,
        week_day_index: weekDayIndex as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        phase: (phaseLabel === 'OFF PLAN' ? 'off_plan' : phaseLabel === 'RECOVERY' ? 'recovery' : phaseLabel === 'TAPER' ? 'taper' : phaseLabel === 'PEAK' ? 'peak' : 'build') as 'build' | 'recovery' | 'peak' | 'taper' | 'off_plan',
        execution: {
          planned_to_date: sessionsToDate,
          completed_linked: sessionsMatchedToPlan,
          completed_unlinked,
          moved: sessionsMoved,
          missed: sessionsMissed,
          quality_label: execution_quality_label,
          quality_reason: execution_quality_reason,
          key_sessions_audited: key_session_audits.length,
          key_sessions_on_target: key_session_audits.filter(a => a.status === 'hit' || a.status === 'close').length,
          key_sessions_flags
        },
        load: {
          acwr: acwr.ratio,
          load_vs_baseline,
          ramp_flag
        },
        response: {
          aerobic_tier: aerobicTier,
          structural_tier: structuralTier,
          limiter,
          trend,
          trend_evidence: ((weekly_readiness as any)?.__trend_evidence as any) ?? [],
          trend_explanation: trend_explanation ?? undefined
        },
        carryover: dateRanges.previousWeekStartISO
          ? { level: carryover_level, pct_of_baseline: carryover_pct_of_baseline, interpretation: carryover_interpretation }
          : undefined,
        synthesis: { headline, bullets, implication },
        plan_goal_line: planGoalLine ?? undefined,
        week_focus_label: planContext.weekFocusLabel ?? undefined,
        next_key_session: nextQualityPlanned
          ? { planned_id: nextQualityPlanned.id, date: nextQualityPlanned.date, date_local: dateLocal, title: nextQualityPlanned.name, primary_target: primaryTarget, sport: (nextQualityPlanned.type || 'run').toLowerCase() }
          : undefined,
        today_role,
        today_role_label,
        body_response_line: 'Body response: last 7 days ending today',
        debug_week_narrative: {
          planned_to_date: plannedToDate.map((p: PlannedWorkoutRecord & { completed_workout_id?: string | null }) => ({
            id: String(p.id),
            date: p.date,
            completed_workout_id: p.completed_workout_id ?? null
          })),
          completed_unlinked_count,
          completed_unlinked_ids,
          key_session_audits_source: key_session_audits.map((_, i) => ({
            planned_id: key_sessions_flags[i]?.planned_id ?? '',
            workout_id: (qualityRunsWithAnalysis as Array<{ id: string }>)[i]?.id ?? ''
          }))
        }
      };
    }

    // ==========================================================================
    // CONTEXT SUMMARY (plan-driven when plan_checkin exists; max 5–6 lines)
    // On plan: (1) Week n/N — phase, (2) On plan (X% complete), (3) Today, (4) Next, (5) optional Note, (6) action.
    // ==========================================================================
    const aerobicShort = display_aerobic_tier === 'Low' ? 'low' : display_aerobic_tier === 'Moderate' ? 'moderate' : 'elevated';
    const structuralShort = display_structural_tier === 'Low' ? 'fresh' : display_structural_tier === 'Moderate' ? 'moderate' : 'elevated';

    const context_summary: string[] = [];
    if (plan_checkin) {
      context_summary.push(`Week ${plan_checkin.plan_week_index}/${plan_checkin.plan_week_total} — ${plan_checkin.plan_phase_label}`);
      context_summary.push(`On plan (${plan_checkin.week_completion_pct}% complete this week).`);
      if (todayIsRestDay) {
        // Omit rest line here so only the Today card shows "Rest day. Resume tomorrow." (no duplicate)
      } else if (plan_checkin.today_planned_workout) {
        context_summary.push(`Today: ${plan_checkin.today_planned_workout.title} (${(plan_checkin.today_planned_workout.type || 'planned').toLowerCase()}).`);
      } else {
        context_summary.push('Today: Training day.');
      }
      if (plan_checkin.next_planned_workout) {
        context_summary.push(`Next: ${plan_checkin.next_planned_workout.title} on ${plan_checkin.next_planned_workout.day_label}.`);
      }
      if ((display_aerobic_tier === 'Moderate' || display_aerobic_tier === 'Elevated') || (display_structural_tier === 'Moderate' || display_structural_tier === 'Elevated')) {
        const limiter = tierOrder[display_aerobic_tier] >= tierOrder[display_structural_tier] ? 'Aerobic' : 'Structural';
        const limiterWord = limiter === 'Aerobic' ? aerobicShort : structuralShort;
        context_summary.push(`Note: ${limiter} fatigue is ${limiterWord} — keep today controlled.`);
      }
      if (acwr.ratio > 1.3 && acwr.data_days >= 7) {
        context_summary.push(acwr.ratio > 1.5 ? 'Load is overreaching — avoid adding volume.' : 'Load is ramping fast — avoid adding volume.');
      }
    } else {
      context_summary.push(`${phaseLabel} — ${todayIsRestDay ? 'REST' : 'TRAINING'}`);
      context_summary.push(todayIsRestDay ? 'Rest day.' : 'Training day.');
      context_summary.push(`Aerobic: ${aerobicShort} fatigue. Structural: ${structuralShort}.`);
      if (acwr.ratio > 1.3 && acwr.data_days >= 7) {
        context_summary.push(acwr.ratio > 1.5 ? 'Load change risk is overreaching — avoid adding volume.' : 'Load change risk is ramping fast — avoid adding volume.');
      }
    }
    const next_action =
      acwr.ratio > 1.3 && acwr.data_days >= 7
        ? 'Do not add volume this week.'
        : todayIsRestDay
          ? (hasActivePlan ? 'Rest today. Resume tomorrow.' : 'Recover today. Resume when ready.')
          : weekly_verdict
            ? weekly_verdict.label === 'high'
              ? 'No changes needed today.'
              : weekly_verdict.label === 'medium'
                ? 'Proceed with planned session; keep intensity controlled.'
                : 'Reduce intensity today; stay within plan.'
            : hasActivePlan ? 'Follow the plan — no changes needed today.' : 'No changes needed today.';
    // On rest days, only the Today card shows the rest instruction — don't duplicate in context_summary
    if (!todayIsRestDay) {
      context_summary.push(next_action);
    }

    // ==========================================================================
    // BUILD RESPONSE
    // ==========================================================================

    const response: TrainingContextResponse = {
      acwr,
      sport_breakdown: sportBreakdown,
      timeline,
      week_comparison: weekComparison,
      insights,
      plan_progress: planProgress || undefined,
      weekly_readiness,
      weekly_verdict,
      structural_load: { acute: sportBreakdown.strength.workload, avg_rir_acute: avg_rir_acute ?? undefined },
      readiness_source_date: readiness_source_date ?? undefined,
      readiness_source_start_date: readiness_source_start_date ?? undefined,
      display_aerobic_tier,
      display_structural_tier,
      display_limiter_line,
      display_limiter_label,
      next_action,
      display_load_change_risk_label,
      display_load_change_risk_helper: display_load_change_risk_helper ?? undefined,
      context_banner,
      projected_week_load,
      context_summary,
      day_type: todayIsRestDay ? 'rest' : 'training',
      has_planned_stimulus: todayIsRestDay ? undefined : plannedForFocusDate.some(p => ['run', 'ride', 'strength', 'swim'].includes((p.type || '').toLowerCase())),
      plan_checkin,
      week_review,
      week_narrative
    };

    console.log(`✅ Training context generated: ACWR=${acwr.ratio}, insights=${insights.length}`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Generate training context error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// =============================================================================
// SMART DATE RANGE CALCULATION
// =============================================================================

interface SmartDateRanges {
  // Acute window (7 days or current plan week)
  acuteStart: Date;
  acuteEnd: Date;
  acuteStartISO: string;
  acuteEndISO: string;
  
  // Chronic window (28 days or 4 plan weeks)
  chronicStart: Date;
  chronicEnd: Date;
  chronicStartISO: string;
  chronicEndISO: string;
  
  // Current plan week boundaries (if plan is active)
  currentWeekStart: Date | null;
  currentWeekEnd: Date | null;
  currentWeekStartISO: string | null;
  currentWeekEndISO: string | null;
  
  // Previous plan week boundaries (if plan is active)
  previousWeekStart: Date | null;
  previousWeekEnd: Date | null;
  previousWeekStartISO: string | null;
  previousWeekEndISO: string | null;
  
  // For timeline (always 14 days)
  fourteenDaysAgo: Date;
  fourteenDaysAgoISO: string;
}

/**
 * Calculate smart date ranges that align with plan weeks when a plan is active.
 * Falls back to rolling windows when no plan is active.
 */
function calculateSmartDateRanges(
  focusDate: Date,
  focusDateISO: string,
  planContext: PlanContext | null
): SmartDateRanges {
  
  // Helper: Get Monday of a given date
  const mondayOf = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  
  // Helper: Get Sunday of a given date (end of week)
  const sundayOf = (date: Date): Date => {
    const monday = mondayOf(date);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  };
  
  // Helper: Format date to ISO string (YYYY-MM-DD)
  const toISO = (date: Date): string => {
    return date.toLocaleDateString('en-CA');
  };
  
  // If we have an active plan, use plan-aligned week boundaries
  if (planContext?.hasActivePlan && planContext.weekIndex !== null) {
    // Get plan start date to calculate week boundaries
    // We'll need to fetch this, but for now use a fallback approach
    // The plan context should ideally include the start date, but we'll calculate from focus date
    
    // Calculate current week Monday (plan weeks start on Monday)
    const currentWeekMonday = mondayOf(focusDate);
    const currentWeekSunday = sundayOf(focusDate);
    
    // Previous week boundaries
    const previousWeekMonday = new Date(currentWeekMonday);
    previousWeekMonday.setDate(currentWeekMonday.getDate() - 7);
    const previousWeekSunday = new Date(currentWeekMonday);
    previousWeekSunday.setDate(currentWeekMonday.getDate() - 1);
    previousWeekSunday.setHours(23, 59, 59, 999);
    
    // Use current plan week for acute window
    const acuteStart = currentWeekMonday;
    const acuteEnd = focusDate; // Up to focus date (may be mid-week)
    
    // Use last 4 plan weeks for chronic window (or from plan start if less than 4 weeks)
    const chronicStart = new Date(currentWeekMonday);
    chronicStart.setDate(currentWeekMonday.getDate() - (4 * 7) + 1); // 4 weeks back, starting from Monday
    
    // For timeline, still use 14 days back
    const fourteenDaysAgo = new Date(focusDate);
    fourteenDaysAgo.setDate(focusDate.getDate() - 13);
    
    return {
      acuteStart,
      acuteEnd,
      acuteStartISO: toISO(acuteStart),
      acuteEndISO: toISO(acuteEnd),
      
      chronicStart,
      chronicEnd: focusDate,
      chronicStartISO: toISO(chronicStart),
      chronicEndISO: focusDateISO,
      
      currentWeekStart: currentWeekMonday,
      currentWeekEnd: currentWeekSunday,
      currentWeekStartISO: toISO(currentWeekMonday),
      currentWeekEndISO: toISO(currentWeekSunday),
      
      previousWeekStart: previousWeekMonday,
      previousWeekEnd: previousWeekSunday,
      previousWeekStartISO: toISO(previousWeekMonday),
      previousWeekEndISO: toISO(previousWeekSunday),
      
      fourteenDaysAgo,
      fourteenDaysAgoISO: toISO(fourteenDaysAgo)
    };
  }
  
  // No plan: use rolling windows (original behavior)
  const sevenDaysAgo = new Date(focusDate);
  sevenDaysAgo.setDate(focusDate.getDate() - 6);
  const twentyEightDaysAgo = new Date(focusDate);
  twentyEightDaysAgo.setDate(focusDate.getDate() - 27);
  const fourteenDaysAgo = new Date(focusDate);
  fourteenDaysAgo.setDate(focusDate.getDate() - 13);
  
  return {
    acuteStart: sevenDaysAgo,
    acuteEnd: focusDate,
    acuteStartISO: toISO(sevenDaysAgo),
    acuteEndISO: focusDateISO,
    
    chronicStart: twentyEightDaysAgo,
    chronicEnd: focusDate,
    chronicStartISO: toISO(twentyEightDaysAgo),
    chronicEndISO: focusDateISO,
    
    currentWeekStart: null,
    currentWeekEnd: null,
    currentWeekStartISO: null,
    currentWeekEndISO: null,
    
    previousWeekStart: null,
    previousWeekEnd: null,
    previousWeekStartISO: null,
    previousWeekEndISO: null,
    
    fourteenDaysAgo,
    fourteenDaysAgoISO: toISO(fourteenDaysAgo)
  };
}

// =============================================================================
// AVG RIR ACUTE (from strength sessions in acute window)
// =============================================================================

/**
 * Compute average RIR across strength workouts in acute window.
 * RIR = "Reps in Reserve" — the "HR drift" for lifting; low RIR = high strain / deep fatigue.
 * Uses strength_exercises sets (rir/RIR/reps_in_reserve) or computed.adaptation.strength_exercises[].avg_rir.
 */
function computeAvgRirAcute(workouts: Array<{ strength_exercises?: any; computed?: any }>): number | null {
  const rirValues: number[] = [];
  for (const w of workouts) {
    const computed = w.computed && typeof w.computed === 'object' ? w.computed : {};
    const adaptation = computed.adaptation && typeof computed.adaptation === 'object' ? computed.adaptation : {};
    const adapStrength = Array.isArray(adaptation.strength_exercises) ? adaptation.strength_exercises : [];
    if (adapStrength.length) {
      for (const ex of adapStrength) {
        const r = ex?.avg_rir;
        if (typeof r === 'number' && r >= 0 && r <= 10) rirValues.push(r);
      }
      continue;
    }
    const raw = w.strength_exercises;
    const exercises = Array.isArray(raw) ? raw : [];
    for (const ex of exercises) {
      const sets = Array.isArray(ex?.sets) ? ex.sets : Array.isArray(ex?.working_sets) ? ex.working_sets : Array.isArray(ex?.performance?.sets) ? ex.performance.sets : [];
      for (const s of sets) {
        const r = s?.rir ?? s?.RIR ?? s?.reps_in_reserve ?? s?.repsInReserve;
        if (typeof r === 'number' && r >= 0 && r <= 10) rirValues.push(r);
      }
    }
  }
  if (rirValues.length === 0) return null;
  const sum = rirValues.reduce((a, b) => a + b, 0);
  return Math.round((sum / rirValues.length) * 10) / 10;
}

// =============================================================================
// PLAN CONTEXT FETCHING
// =============================================================================

/**
 * Fetch plan context for a given date
 * Returns null if no active plan or cannot determine context
 */
async function fetchPlanContext(
  supabase: any,
  userId: string,
  focusDateISO: string,
  focusDate: Date
): Promise<PlanContext | null> {
  const defaultContext: PlanContext = {
    hasActivePlan: false,
    planId: null,
    weekIndex: null,
    phaseKey: null,
    phaseName: null,
    isRecoveryWeek: false,
    isTaperWeek: false,
    weekIntent: 'unknown',
    weekFocusLabel: null,
    planName: null,
    duration_weeks: null,
    weeks_remaining: null,
    race_date: null,
    target_finish_time_seconds: null,
    next_week_intent: null,
    next_week_focus_label: null
  };

  try {
    // Find active plan - check plans table first (new system)
    const { data: activePlans } = await supabase
      .from('plans')
      .select('id, name, config, current_week, duration_weeks, sessions_by_week')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!activePlans || activePlans.length === 0) {
      return null; // No active plan
    }

    const plan = activePlans[0];
    const config = plan.config || {};
    
    // Calculate current week based on focus date
    const startDateStr = config.user_selected_start_date || config.start_date;
    if (!startDateStr) {
      console.log('⚠️ Plan exists but no start date - cannot determine week');
      return null;
    }

    // Normalize start date to Monday (matching get-week logic)
    const mondayOf = (iso: string): string => {
      const d = new Date(iso);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
      const monday = new Date(d.setDate(diff));
      return monday.toLocaleDateString('en-CA');
    };

    const startDateMonday = mondayOf(startDateStr);
    const startDate = new Date(startDateMonday);
    const viewedDate = new Date(focusDateISO);
    startDate.setHours(0, 0, 0, 0);
    viewedDate.setHours(0, 0, 0, 0);
    const diffMs = viewedDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let weekIndex = Math.max(1, Math.floor(diffDays / 7) + 1);
    
    const durationWeeks = plan.duration_weeks || config.duration_weeks || 0;
    if (durationWeeks > 0) {
      weekIndex = Math.min(weekIndex, durationWeeks);
    }

    // Plan contract v1 only — no inference, no fallback
    const contract = config.plan_contract_v1 as {
      version: number;
      phase_by_week?: string[];
      week_intent_by_week?: Array<{ week_index: number; focus_label: string }>;
    } | undefined;

    let weekFocusLabel: string | null = null;
    let isRecoveryWeek = false;
    let isTaperWeek = false;
    let weekIntent: PlanContext['weekIntent'] = 'build';
    const phaseKey: string | null = null;
    const phaseName: string | null = null;

    if (contract?.version === 1 && Array.isArray(contract.phase_by_week) && weekIndex >= 1 && weekIndex <= contract.phase_by_week.length) {
      const phase = contract.phase_by_week[weekIndex - 1];
      if (phase === 'recovery') {
        isRecoveryWeek = true;
        weekIntent = 'recovery';
      } else if (phase === 'taper') {
        isTaperWeek = true;
        weekIntent = 'taper';
      } else if (phase === 'peak') {
        weekIntent = 'peak';
      } else if (phase === 'base') {
        weekIntent = 'baseline';
      } else {
        weekIntent = 'build';
      }
      const weekIntentEntry = Array.isArray(contract.week_intent_by_week)
        ? contract.week_intent_by_week.find((w: { week_index: number }) => w.week_index === weekIndex)
        : null;
      if (weekIntentEntry?.focus_label) weekFocusLabel = weekIntentEntry.focus_label;
    }

    // Next week's intent from contract only
    let next_week_intent: PlanContext['next_week_intent'] = null;
    let next_week_focus_label: string | null = null;
    const nextWeekIndex = weekIndex + 1;
    if (durationWeeks != null && nextWeekIndex <= durationWeeks) {
      if (contract?.version === 1 && Array.isArray(contract.phase_by_week) && nextWeekIndex <= contract.phase_by_week.length) {
        const nextPhase = contract.phase_by_week[nextWeekIndex - 1];
        if (nextPhase === 'recovery') next_week_intent = 'recovery';
        else if (nextPhase === 'taper') next_week_intent = 'taper';
        else if (nextPhase === 'peak') next_week_intent = 'peak';
        else if (nextPhase === 'base') next_week_intent = 'baseline';
        else next_week_intent = 'build';
        const nextIntentEntry = Array.isArray(contract.week_intent_by_week)
          ? contract.week_intent_by_week.find((w: { week_index: number }) => w.week_index === nextWeekIndex)
          : null;
        if (nextIntentEntry?.focus_label) next_week_focus_label = nextIntentEntry.focus_label;
      } else {
        next_week_intent = 'build';
      }
    }

    // Plan length and goal (science of the plan)
    const durationWeeksNum = durationWeeks > 0 ? durationWeeks : null;
    const raceDateStr = config.race_date || config.goal_date || null;
    const targetSeconds =
      config.target_time != null && Number.isFinite(Number(config.target_time))
        ? Number(config.target_time)
        : config.marathon_target_seconds != null && Number.isFinite(Number(config.marathon_target_seconds))
          ? Number(config.marathon_target_seconds)
          : null;
    let weeksRemaining: number | null = null;
    if (raceDateStr) {
      const raceDate = new Date(raceDateStr);
      const now = new Date(focusDateISO);
      const diffMs = raceDate.getTime() - now.getTime();
      weeksRemaining = Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
    } else if (durationWeeksNum != null && weekIndex != null) {
      weeksRemaining = Math.max(0, durationWeeksNum - weekIndex);
    }

    console.log(`📋 Plan context: week=${weekIndex}, intent=${weekIntent}, recovery=${isRecoveryWeek}, taper=${isTaperWeek}, duration=${durationWeeksNum}, weeks_remaining=${weeksRemaining}, race_date=${raceDateStr ? 'set' : 'none'}`);

    return {
      hasActivePlan: true,
      planId: plan.id,
      weekIndex,
      phaseKey,
      phaseName,
      isRecoveryWeek,
      isTaperWeek,
      weekIntent,
      weekFocusLabel,
      planName: plan.name,
      duration_weeks: durationWeeksNum ?? undefined,
      weeks_remaining: weeksRemaining ?? undefined,
      race_date: raceDateStr ?? undefined,
      target_finish_time_seconds: targetSeconds ?? undefined,
      next_week_intent: next_week_intent ?? undefined,
      next_week_focus_label: next_week_focus_label ?? undefined
    };

  } catch (error) {
    console.error('⚠️ Error fetching plan context:', error);
    return null; // No plan context available
  }
}

// =============================================================================
// ACWR (from athlete_snapshot when acute = full week)
// =============================================================================

function acwrFromSnapshot(
  snap: { workload_total: number; acwr: number },
  plannedForFocusDate: PlannedWorkoutRecord[],
  planContext: PlanContext | null
): ACWRData {
  const acuteTotal = Number(snap.workload_total) || 0;
  const ratio = Number(snap.acwr) || 0;
  const acuteDays = 7;
  const chronicDays = 28;
  const acuteDailyAvg = acuteTotal / acuteDays;
  const chronicDailyAvg = ratio > 0 ? acuteDailyAvg / ratio : 0;
  const chronicTotal = chronicDailyAvg * chronicDays;

  let projected: ACWRData['projected'] | undefined;
  if (plannedForFocusDate.length > 0) {
    const plannedWorkload = plannedForFocusDate.reduce((sum, p) => sum + (p.workload_planned || 0), 0);
    if (plannedWorkload > 0) {
      const projectedAcuteTotal = acuteTotal + plannedWorkload;
      const projectedAcuteDailyAvg = projectedAcuteTotal / acuteDays;
      const projectedRatio = chronicDailyAvg > 0
        ? Math.round((projectedAcuteDailyAvg / chronicDailyAvg) * 100) / 100
        : 0;
      projected = {
        ratio: projectedRatio,
        status: getACWRStatus(projectedRatio, planContext),
        planned_workload: plannedWorkload
      };
    }
  }

  return {
    ratio,
    status: getACWRStatus(ratio, planContext),
    acute_daily_avg: Math.round(acuteDailyAvg * 10) / 10,
    chronic_daily_avg: Math.round(chronicDailyAvg * 10) / 10,
    acute_total: acuteTotal,
    chronic_total: Math.round(chronicTotal),
    data_days: chronicDays,
    plan_context: planContext || undefined,
    projected
  };
}

// =============================================================================
// ACWR CALCULATION (from workouts when mid-week or no snapshot)
// =============================================================================

function calculateACWR(
  workouts: WorkoutRecord[],
  focusDate: Date,
  dateRanges: SmartDateRanges,
  plannedWorkouts: PlannedWorkoutRecord[],
  planContext: PlanContext | null
): ACWRData {
  
  // Filter to acute window (current plan week or last 7 days)
  const acuteWorkouts = workouts.filter(w => {
    const workoutDate = new Date(w.date + 'T12:00:00');
    return workoutDate >= dateRanges.acuteStart && workoutDate <= dateRanges.acuteEnd;
  });

  // Filter to chronic window (last 4 plan weeks or 28 days)
  const chronicWorkouts = workouts.filter(w => {
    const workoutDate = new Date(w.date + 'T12:00:00');
    return workoutDate >= dateRanges.chronicStart && workoutDate <= dateRanges.chronicEnd;
  });

  // Calculate totals
  const acuteTotal = acuteWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);
  const chronicTotal = chronicWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);

  // Calculate daily averages
  // For plan-aligned: use actual days in current week (up to focus date)
  // For rolling: use 7 days
  const acuteDays = planContext?.hasActivePlan && dateRanges.currentWeekStart
    ? Math.max(1, Math.ceil((dateRanges.acuteEnd.getTime() - dateRanges.acuteStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 7;
  
  // Chronic window: use 28 days for rolling, or 4 weeks (28 days) for plan-aligned
  const chronicDays = 28;

  const acuteDailyAvg = acuteTotal / acuteDays;
  const chronicDailyAvg = chronicTotal / chronicDays;

  // Calculate ACWR ratio
  const ratio = chronicDailyAvg > 0 
    ? Math.round((acuteDailyAvg / chronicDailyAvg) * 100) / 100 
    : 0;

  // Determine status (plan-aware)
  const status = getACWRStatus(ratio, planContext);

  // Count days with data (for progressive disclosure)
  const uniqueDates = new Set(chronicWorkouts.map(w => w.date));
  const dataDays = uniqueDates.size;

  // Calculate projected ACWR if there's a planned workout for today
  let projected: ACWRData['projected'] | undefined;
  
  if (plannedWorkouts.length > 0) {
    const plannedWorkload = plannedWorkouts.reduce((sum, p) => sum + (p.workload_planned || 0), 0);
    
    if (plannedWorkload > 0) {
      const projectedAcuteTotal = acuteTotal + plannedWorkload;
      // Use the same acuteDays basis as the current ACWR calculation (plan-aware mid-week)
      const projectedAcuteDailyAvg = projectedAcuteTotal / acuteDays;
      const projectedRatio = chronicDailyAvg > 0 
        ? Math.round((projectedAcuteDailyAvg / chronicDailyAvg) * 100) / 100 
        : 0;

      projected = {
        ratio: projectedRatio,
        status: getACWRStatus(projectedRatio, planContext),
        planned_workload: plannedWorkload
      };
    }
  }

  console.log(`📈 ACWR: acute=${acuteTotal}, chronic=${chronicTotal}, ratio=${ratio}, status=${status}, dataDays=${dataDays}`);

  return {
    ratio,
    status,
    acute_daily_avg: Math.round(acuteDailyAvg * 10) / 10,
    chronic_daily_avg: Math.round(chronicDailyAvg * 10) / 10,
    acute_total: acuteTotal,
    chronic_total: chronicTotal,
    data_days: dataDays,
    plan_context: planContext || undefined,
    projected
  };
}

/**
 * Get ACWR status based on ratio and plan context
 * Plan-aware: recovery/taper weeks have different thresholds
 */
function getACWRStatus(
  ratio: number,
  planContext: PlanContext | null
): 'undertrained' | 'optimal' | 'elevated' | 'high_risk' | 'recovery' | 'optimal_recovery' {
  
  // No plan: use general ACWR principles
  if (!planContext || !planContext.hasActivePlan) {
    if (ratio < 0.80) return 'undertrained';
    if (ratio <= 1.30) return 'optimal';
    if (ratio <= 1.50) return 'elevated';
    return 'high_risk';
  }

  const { weekIntent, isRecoveryWeek, isTaperWeek } = planContext;

  // Recovery week: low load is EXPECTED and GOOD
  if (isRecoveryWeek || weekIntent === 'recovery') {
    if (ratio < 0.80) return 'optimal_recovery'; // Not "undertrained" - this is intentional!
    if (ratio <= 1.05) return 'optimal';
    if (ratio <= 1.20) return 'elevated'; // Even recovery weeks shouldn't spike too high
    return 'high_risk';
  }

  // Taper week: low load is expected
  if (isTaperWeek || weekIntent === 'taper') {
    if (ratio < 0.80) return 'optimal'; // Expected low load
    if (ratio <= 1.10) return 'optimal';
    if (ratio <= 1.25) return 'elevated';
    return 'high_risk';
  }

  // Build/Peak weeks: use plan-aware thresholds (trust the plan's periodization)
  if (weekIntent === 'build' || weekIntent === 'peak' || weekIntent === 'baseline') {
    if (ratio < 0.80) return 'undertrained';
    if (ratio <= 1.50) return 'optimal'; // Higher threshold when on plan (trust periodization)
    if (ratio <= 1.70) return 'elevated';
    return 'high_risk';
  }

  // Unknown intent: default to general principles (shouldn't happen, but safety fallback)
  if (ratio < 0.80) return 'undertrained';
  if (ratio <= 1.30) return 'optimal';
  if (ratio <= 1.50) return 'elevated';
  return 'high_risk';
}

// =============================================================================
// SPORT BREAKDOWN (from athlete_snapshot when end-of-week)
// =============================================================================

function sportBreakdownFromSnapshot(
  workloadByDisc: Record<string, number>,
  workouts: WorkoutRecord[],
  dateRanges: SmartDateRanges
): SportBreakdown {
  const map: Record<string, keyof Omit<SportBreakdown, 'total_workload'>> = {
    run: 'run',
    ride: 'bike',
    bike: 'bike',
    swim: 'swim',
    strength: 'strength',
    mobility: 'mobility',
    pilates_yoga: 'mobility'
  };
  const breakdown: SportBreakdown = {
    run: { workload: 0, percent: 0, sessions: 0 },
    bike: { workload: 0, percent: 0, sessions: 0 },
    swim: { workload: 0, percent: 0, sessions: 0 },
    strength: { workload: 0, percent: 0, sessions: 0 },
    mobility: { workload: 0, percent: 0, sessions: 0 },
    total_workload: 0
  };
  for (const [disc, load] of Object.entries(workloadByDisc || {})) {
    const key = map[disc] ?? null;
    if (key && typeof load === 'number') {
      breakdown[key].workload += load;
      breakdown.total_workload += load;
    }
  }
  const acuteWorkouts = workouts.filter(w => {
    const d = new Date(w.date + 'T12:00:00');
    return d >= dateRanges.acuteStart && d <= dateRanges.acuteEnd;
  });
  acuteWorkouts.forEach(w => {
    const type = normalizeSportType(w.type);
    if (type in breakdown && type !== 'total_workload') {
      (breakdown[type as keyof Omit<SportBreakdown, 'total_workload'>] as SportData).sessions += 1;
    }
  });
  if (breakdown.total_workload > 0) {
    breakdown.run.percent = Math.round((breakdown.run.workload / breakdown.total_workload) * 100);
    breakdown.bike.percent = Math.round((breakdown.bike.workload / breakdown.total_workload) * 100);
    breakdown.swim.percent = Math.round((breakdown.swim.workload / breakdown.total_workload) * 100);
    breakdown.strength.percent = Math.round((breakdown.strength.workload / breakdown.total_workload) * 100);
    breakdown.mobility.percent = Math.round((breakdown.mobility.workload / breakdown.total_workload) * 100);
  }
  return breakdown;
}

// =============================================================================
// SPORT BREAKDOWN (from workouts when mid-week or no snapshot)
// =============================================================================

function calculateSportBreakdown(
  workouts: WorkoutRecord[],
  dateRanges: SmartDateRanges
): SportBreakdown {
  
  // Filter to acute window (current plan week or last 7 days)
  const recentWorkouts = workouts.filter(w => {
    const workoutDate = new Date(w.date + 'T12:00:00');
    return workoutDate >= dateRanges.acuteStart && workoutDate <= dateRanges.acuteEnd;
  });

  // Initialize breakdown
  const breakdown: SportBreakdown = {
    run: { workload: 0, percent: 0, sessions: 0 },
    bike: { workload: 0, percent: 0, sessions: 0 },
    swim: { workload: 0, percent: 0, sessions: 0 },
    strength: { workload: 0, percent: 0, sessions: 0 },
    mobility: { workload: 0, percent: 0, sessions: 0 },
    total_workload: 0
  };

  // Aggregate by sport type
  recentWorkouts.forEach(w => {
    const type = normalizeSportType(w.type);
    const workload = w.workload_actual || 0;

    // Debug logging for strength workouts
    if (w.type && (w.type.toLowerCase().includes('strength') || w.type.toLowerCase().includes('weight'))) {
      console.log(`💪 Strength workout found: type="${w.type}" -> normalized="${type}", workload=${workload}, date=${w.date}, id=${w.id}`);
      if (workload === 0) {
        console.log(`⚠️  Strength workout has workload=0 - may need recalculation. Check if it has strength_exercises data.`);
      }
    }

    if (type in breakdown && type !== 'total_workload') {
      const sport = breakdown[type as keyof Omit<SportBreakdown, 'total_workload'>];
      sport.workload += workload;
      sport.sessions += 1;
    }

    breakdown.total_workload += workload;
  });

  // Calculate percentages
  if (breakdown.total_workload > 0) {
    breakdown.run.percent = Math.round((breakdown.run.workload / breakdown.total_workload) * 100);
    breakdown.bike.percent = Math.round((breakdown.bike.workload / breakdown.total_workload) * 100);
    breakdown.swim.percent = Math.round((breakdown.swim.workload / breakdown.total_workload) * 100);
    breakdown.strength.percent = Math.round((breakdown.strength.workload / breakdown.total_workload) * 100);
    breakdown.mobility.percent = Math.round((breakdown.mobility.workload / breakdown.total_workload) * 100);
  }

  console.log(`🏃 Sport breakdown: run=${breakdown.run.workload}, bike=${breakdown.bike.workload}, swim=${breakdown.swim.workload}, strength=${breakdown.strength.workload}, mobility=${breakdown.mobility.workload}, total=${breakdown.total_workload}`);

  return breakdown;
}

function normalizeSportType(type: string): string {
  const t = (type || '').toLowerCase();
  
  if (t === 'run' || t === 'running') return 'run';
  if (t === 'ride' || t === 'bike' || t === 'cycling') return 'bike';
  if (t === 'swim' || t === 'swimming') return 'swim';
  if (t === 'strength' || t === 'strength_training' || t === 'weight' || t === 'weights') return 'strength';
  if (t === 'mobility' || t === 'pilates' || t === 'yoga' || t === 'pilates_yoga' || t === 'stretch') return 'mobility';
  
  return 'other';
}

// =============================================================================
// TIMELINE BUILDING
// =============================================================================

function buildTimeline(
  completedWorkouts: WorkoutRecord[],
  plannedWorkouts: PlannedWorkoutRecord[],
  fourteenDaysAgo: Date,
  focusDate: Date,
  sevenDaysAgo: Date
): TimelineDay[] {
  
  const timeline: TimelineDay[] = [];
  
  // Build a map of date -> workouts for efficient lookup
  const workoutsByDate = new Map<string, TimelineWorkout[]>();
  
  // Add completed workouts
  completedWorkouts.forEach(w => {
    const dateKey = w.date;
    if (!workoutsByDate.has(dateKey)) {
      workoutsByDate.set(dateKey, []);
    }
    workoutsByDate.get(dateKey)!.push({
      id: w.id,
      type: w.type,
      name: w.name || getDefaultWorkoutName(w.type),
      workload_actual: w.workload_actual || 0,
      intensity_factor: w.intensity_factor,
      duration: w.moving_time || w.duration || 0,
      status: 'completed'
    });
  });

  // Add planned workouts (only for focus date)
  plannedWorkouts.forEach(p => {
    const dateKey = p.date;
    if (!workoutsByDate.has(dateKey)) {
      workoutsByDate.set(dateKey, []);
    }
    workoutsByDate.get(dateKey)!.push({
      id: p.id,
      type: p.type,
      name: p.name || getDefaultWorkoutName(p.type),
      workload_actual: p.workload_planned || 0, // Use planned workload
      intensity_factor: null, // Planned workouts don't have IF yet
      duration: p.duration || 0,
      status: 'planned'
    });
  });

  // Generate 14-day timeline (reverse chronological)
  for (let i = 0; i < 14; i++) {
    const dayDate = new Date(focusDate);
    dayDate.setDate(focusDate.getDate() - i);
    const dateKey = dayDate.toLocaleDateString('en-CA');
    
    const dayWorkouts = workoutsByDate.get(dateKey) || [];
    const completedWorkoutsForDay = dayWorkouts.filter(w => w.status === 'completed');
    const dailyTotal = completedWorkoutsForDay.reduce((sum, w) => sum + w.workload_actual, 0);
    
    // Get max intensity factor for the day (for quality day detection)
    const intensityFactors = completedWorkoutsForDay
      .map(w => w.intensity_factor)
      .filter((v): v is number => v !== null && v > 0);
    const maxIF = intensityFactors.length > 0 ? Math.max(...intensityFactors) : null;
    
    // Determine if this day is in the acute window (last 7 days)
    const isAcuteWindow = dayDate >= sevenDaysAgo;

    timeline.push({
      date: dateKey,
      workouts: dayWorkouts,
      daily_total: dailyTotal,
      max_intensity_factor: maxIF,
      is_acute_window: isAcuteWindow
    });
  }

  return timeline;
}

function getDefaultWorkoutName(type: string): string {
  const names: Record<string, string> = {
    run: 'Run',
    running: 'Run',
    ride: 'Ride',
    bike: 'Ride',
    cycling: 'Ride',
    swim: 'Swim',
    swimming: 'Swim',
    strength: 'Strength',
    strength_training: 'Strength',
    mobility: 'Mobility',
    pilates_yoga: 'Pilates/Yoga'
  };
  return names[(type || '').toLowerCase()] || 'Workout';
}

// =============================================================================
// WEEK COMPARISON
// =============================================================================

function calculateWeekComparison(
  workouts: WorkoutRecord[],
  dateRanges: SmartDateRanges,
  planContext: PlanContext | null,
  priorWeekWorkloadFromSnapshot?: number
): WeekComparison {
  
  // Current week: use current plan week if available, otherwise last 7 days
  let currentWeekStart: Date;
  let currentWeekEnd: Date;
  
  if (planContext?.hasActivePlan && dateRanges.currentWeekStart && dateRanges.currentWeekEnd) {
    // Use plan-aligned current week
    currentWeekStart = dateRanges.currentWeekStart;
    currentWeekEnd = dateRanges.acuteEnd; // Up to focus date (may be mid-week)
  } else {
    // Use rolling 7-day window
    currentWeekStart = dateRanges.acuteStart;
    currentWeekEnd = dateRanges.acuteEnd;
  }
  
  const currentWeekWorkouts = workouts.filter(w => {
    const workoutDate = new Date(w.date + 'T12:00:00');
    return workoutDate >= currentWeekStart && workoutDate <= currentWeekEnd;
  });
  const currentWeekTotal = currentWeekWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);

  // Previous week: use athlete_snapshot when available (avoids re-querying workouts)
  let previousWeekTotal: number;
  if (priorWeekWorkloadFromSnapshot != null && priorWeekWorkloadFromSnapshot >= 0) {
    previousWeekTotal = priorWeekWorkloadFromSnapshot;
  } else {
    let previousWeekStart: Date;
    let previousWeekEnd: Date;
    if (planContext?.hasActivePlan && dateRanges.previousWeekStart && dateRanges.previousWeekEnd) {
      previousWeekStart = dateRanges.previousWeekStart;
      previousWeekEnd = dateRanges.previousWeekEnd;
    } else {
      previousWeekStart = new Date(currentWeekStart);
      previousWeekStart.setDate(currentWeekStart.getDate() - 7);
      previousWeekEnd = new Date(currentWeekStart);
      previousWeekEnd.setDate(currentWeekStart.getDate() - 1);
      previousWeekEnd.setHours(23, 59, 59, 999);
    }
    const previousWeekWorkouts = workouts.filter(w => {
      const workoutDate = new Date(w.date + 'T12:00:00');
      return workoutDate >= previousWeekStart && workoutDate <= previousWeekEnd;
    });
    previousWeekTotal = previousWeekWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);
  }

  // Calculate change
  let changePercent = 0;
  let changeDirection: 'increase' | 'decrease' | 'stable' = 'stable';

  if (previousWeekTotal > 0) {
    changePercent = Math.round(((currentWeekTotal - previousWeekTotal) / previousWeekTotal) * 100);
    
    if (changePercent > 5) {
      changeDirection = 'increase';
    } else if (changePercent < -5) {
      changeDirection = 'decrease';
    }
  }

  console.log(`📊 Week comparison: current=${currentWeekTotal}, previous=${previousWeekTotal}, change=${changePercent}%`);

  return {
    current_week_total: currentWeekTotal,
    previous_week_total: previousWeekTotal,
    change_percent: Math.abs(changePercent),
    change_direction: changeDirection
  };
}

// =============================================================================
// PLAN PROGRESS (PLAN-AWARE TARGETS)
// =============================================================================
// Unit alignment: planned_workload (planned_workouts) and workload_actual (workouts)
// both come from the same calculate-workload function (duration×intensity²×100,
// TRIMP, or volume-based for strength). So 248 completed vs 52 planned to-date
// is apples-to-apples; "52" is the sum of planned workload for sessions due by
// focus_date (e.g. 2 easy sessions early in the week).

function calculatePlanProgress(
  plannedWeek: PlannedWorkoutRecord[],
  completed: WorkoutRecord[],
  dateRanges: SmartDateRanges,
  focusDateISO: string,
  planContext: PlanContext | null
): PlanProgress | null {
  if (!planContext?.hasActivePlan) return null;

  const weekStartISO = dateRanges.currentWeekStartISO || dateRanges.acuteStartISO;
  const weekEndISO = dateRanges.currentWeekEndISO || dateRanges.acuteEndISO;

  // Planned workouts for the week (already filtered by date range in query)
  const plannedWeekAll = plannedWeek || [];
  const plannedToDate = plannedWeekAll.filter(p => p.date <= focusDateISO);

  const plannedWeekTotal = plannedWeekAll.reduce((sum, p) => sum + (Number(p.workload_planned) || 0), 0);
  const plannedToDateTotal = plannedToDate.reduce((sum, p) => sum + (Number(p.workload_planned) || 0), 0);

  // Completed workouts to date for the week (use acute window start and focus date)
  const weekCompletedToDate = completed.filter(w => w.date >= weekStartISO && w.date <= focusDateISO);
  const completedToDateTotal = weekCompletedToDate.reduce((sum, w) => sum + (Number(w.workload_actual) || 0), 0);

  // Link planned -> completed conservatively:
  // - Primary: planned_id match (high confidence)
  // - Secondary: same-day discipline match (medium confidence)
  // Use "contains" normalization so planned names like "Long Run", "Easy Run", "Run — Tempo"
  // and completed types like "run", "running", "Run" all map to the same discipline.
  const normalizeSportTypeLocal = (type: string): string => {
    const t = (type || '').toLowerCase();
    if (t.includes('swim')) return 'swim';
    if (t.includes('ride') || t.includes('bike') || t.includes('cycl')) return 'bike';
    if (t.includes('run') || t.includes('jog')) return 'run';
    if (t.includes('walk') || t.includes('hike')) return 'run'; // treat walk as run for matching
    if (t.includes('strength') || t.includes('weight')) return 'strength';
    if (t.includes('mobility') || t.includes('pilates') || t.includes('yoga') || t.includes('stretch') || t === 'pt') return 'mobility';
    return 'other';
  };

  const completedByPlannedId = new Map<string, WorkoutRecord>();
  for (const w of weekCompletedToDate) {
    if (w.planned_id) {
      completedByPlannedId.set(String(w.planned_id), w);
    }
  }

  // Build a lookup by date+discipline for secondary matching
  const completedByDateDiscipline = new Map<string, WorkoutRecord[]>();
  for (const w of weekCompletedToDate) {
    const key = `${w.date}::${normalizeSportTypeLocal(w.type)}`;
    const arr = completedByDateDiscipline.get(key) || [];
    arr.push(w);
    completedByDateDiscipline.set(key, arr);
  }

  let matchedPlanned = 0;
  for (const p of plannedToDate) {
    const pid = String(p.id);
    if (completedByPlannedId.has(pid)) {
      matchedPlanned += 1;
      continue;
    }
    const key = `${p.date}::${normalizeSportTypeLocal(p.type)}`;
    if ((completedByDateDiscipline.get(key) || []).length > 0) {
      matchedPlanned += 1;
    }
  }

  const plannedSessionsToDate = plannedToDate.length;
  const plannedSessionsWeek = plannedWeekAll.length;
  const completedSessionsToDate = weekCompletedToDate.length;

  const matchConfidence = plannedSessionsToDate > 0 ? matchedPlanned / plannedSessionsToDate : 0;

  // Determine on-track/behind/ahead using workload ratio, but only when meaningful:
  // - Need planned_to_date_total > 0
  // - Need at least moderate matching confidence
  let status: PlanProgress['status'] = 'unknown';
  let pct: number | null = null;

  if (plannedToDateTotal > 0 && plannedSessionsToDate > 0) {
    const ratio = completedToDateTotal / plannedToDateTotal;
    pct = Math.round(ratio * 100);

    // Require some confidence before asserting behind/ahead.
    // If we can't reliably link plan->completed, we refuse to prescribe changes.
    const confidentEnough = matchConfidence >= 0.5;
    if (confidentEnough) {
      if (ratio < 0.85) status = 'behind';
      else if (ratio > 1.15) status = 'ahead';
      else status = 'on_track';
    } else {
      status = 'unknown';
    }
  }

  return {
    week_start: weekStartISO,
    week_end: weekEndISO,
    focus_date: focusDateISO,
    planned_week_total: Math.round(plannedWeekTotal),
    planned_to_date_total: Math.round(plannedToDateTotal),
    planned_sessions_week: plannedSessionsWeek,
    planned_sessions_to_date: plannedSessionsToDate,
    completed_to_date_total: Math.round(completedToDateTotal),
    completed_sessions_to_date: completedSessionsToDate,
    matched_planned_sessions_to_date: matchedPlanned,
    match_confidence: Math.round(matchConfidence * 100) / 100,
    status,
    percent_of_planned_to_date: pct
  };
}

// =============================================================================
// SMART INSIGHTS
// =============================================================================

function generateInsights(
  acwr: ACWRData,
  sportBreakdown: SportBreakdown,
  weekComparison: WeekComparison,
  timeline: TimelineDay[],
  planContext: PlanContext | null,
  planProgress: PlanProgress | null
): Insight[] {
  const insights: Insight[] = [];

  const hasActivePlan = planContext?.hasActivePlan || false;
  const isRecoveryWeek = planContext?.isRecoveryWeek || false;
  const isTaperWeek = planContext?.isTaperWeek || false;
  const weekIntent = planContext?.weekIntent || 'unknown';
  const weekFocusLabel = planContext?.weekFocusLabel;

  // ==========================================================================
  // PLAN-AWARE THRESHOLDS
  // When following a plan, we trust the plan's periodization
  // Only warn at higher thresholds, and use softer messaging
  // ==========================================================================
  
  // ACWR thresholds: higher when on a plan (trust the plan)
  const acwrWarningThreshold = hasActivePlan ? 1.50 : 1.30;
  const acwrCriticalThreshold = hasActivePlan ? 1.70 : 1.50;
  
  // Weekly jump threshold: higher when on a plan (planned progression)
  const weeklyJumpThreshold = hasActivePlan ? 50 : 30;

  // 1. High ACWR Warning (context-aware based on week intent)
  if (acwr.ratio > acwrWarningThreshold && acwr.data_days >= 7) {
    const severity = acwr.ratio > acwrCriticalThreshold ? 'critical' : 'warning';
    let message: string;
    
    if (isRecoveryWeek) {
      // Recovery week with high ACWR - this is concerning
      message = `Recovery week: ACWR at ${acwr.ratio.toFixed(2)} is elevated. This week should have lower load - consider reducing intensity or volume.`;
    } else if (isTaperWeek) {
      // Taper week with high ACWR - also concerning
      message = `Taper week: ACWR at ${acwr.ratio.toFixed(2)} is elevated. Taper weeks should have reduced load - prioritize rest.`;
    } else if (hasActivePlan && weekIntent === 'build') {
      // Build week with high ACWR - expected but monitor
      message = `Build week: ACWR at ${acwr.ratio.toFixed(2)} is elevated. Monitor recovery signals and ensure adequate sleep/nutrition.`;
    } else if (hasActivePlan) {
      // Other plan week with high ACWR
      message = `ACWR at ${acwr.ratio.toFixed(2)} - elevated even for plan progression, consider extra recovery`;
    } else {
      // No plan - general warning
      message = `ACWR at ${acwr.ratio.toFixed(2)} - consider reducing load or adding recovery`;
    }
    
    insights.push({
      type: 'acwr_high',
      severity,
      message,
      data: { ratio: acwr.ratio, status: acwr.status }
    });
  }

  // 1b. Recovery/Taper week specific insights (positive reinforcement for proper load)
  if ((isRecoveryWeek || isTaperWeek) && acwr.ratio <= 1.05 && acwr.data_days >= 7) {
    const weekType = isTaperWeek ? 'Taper' : 'Recovery';
    insights.push({
      type: 'acwr_high', // Reuse type for now, could add 'recovery_optimal' type
      severity: 'info',
      message: `${weekType} week: Lower load is intentional and appropriate. Focus on sleep, mobility, and easy volume to maximize adaptation.`,
      data: { ratio: acwr.ratio, status: acwr.status }
    });
  }

  // 2. Consecutive Hard Days (softened when on a plan, skip for recovery weeks)
  if (!isRecoveryWeek && !isTaperWeek) {
    const consecutiveHardDays = calculateConsecutiveHardDays(timeline);
    const consecutiveThreshold = hasActivePlan ? 4 : 3; // Allow more consecutive days when on plan
    if (consecutiveHardDays >= consecutiveThreshold) {
      const message = hasActivePlan
        ? `${consecutiveHardDays} consecutive quality days - ensure adequate sleep/nutrition`
        : `${consecutiveHardDays} consecutive quality days - prioritize recovery`;
      insights.push({
        type: 'consecutive_hard',
        severity: 'warning',
        message,
        data: { days: consecutiveHardDays }
      });
    }
  }

  // 3. Large Weekly Jump (context-aware based on week transitions)
  if (weekComparison.change_direction === 'increase' && weekComparison.change_percent > weeklyJumpThreshold) {
    let message: string;
    let severity: 'critical' | 'warning' | 'info' = 'info';
    
    // Check if we're transitioning from recovery to build (expected jump)
    const isRecoveryToBuild = isRecoveryWeek === false && hasActivePlan && weekIntent === 'build';
    
    if (isRecoveryWeek) {
      // Recovery week with large increase - concerning
      message = `Recovery week: Load increased ${weekComparison.change_percent}% from last week. Recovery weeks should have lower load - consider reducing.`;
      severity = 'warning';
    } else if (isTaperWeek) {
      // Taper week with large increase - very concerning
      message = `Taper week: Load increased ${weekComparison.change_percent}% from last week. Taper weeks should reduce load - prioritize rest.`;
      severity = 'warning';
    } else if (hasActivePlan && weekIntent === 'build') {
      // Build week with increase - expected but monitor
      message = `Build week: Load increased ${weekComparison.change_percent}% from last week. This is normal for build phase - monitor recovery signals.`;
      severity = 'info';
    } else if (hasActivePlan) {
      // Other plan week with increase
      message = `Weekly load increased ${weekComparison.change_percent}% - monitor recovery`;
      severity = 'info';
    } else {
      // No plan - general warning
      message = `Weekly load increased ${weekComparison.change_percent}% - monitor for fatigue signals`;
      severity = 'warning';
    }
    
    insights.push({
      type: 'weekly_jump',
      severity,
      message,
      data: { 
        change: weekComparison.change_percent,
        current: weekComparison.current_week_total,
        previous: weekComparison.previous_week_total
      }
    });
  }

  // 3b. Low load: only "behind plan" insight; never lead with ACWR. Banner (context_banner) replaces
  //     "on plan, stay the course, ACWR below base" messaging — see handler where context_banner is built.
  if (!isRecoveryWeek && !isTaperWeek && acwr.ratio < 0.80 && hasActivePlan && weekIntent === 'build') {
    if (planProgress && planProgress.planned_sessions_to_date > 0 && planProgress.planned_to_date_total > 0 && planProgress.status === 'behind') {
      insights.push({
        type: 'weekly_jump',
        severity: 'info',
        message: `On plan: you're behind this week's workload so far (${planProgress.percent_of_planned_to_date}% of planned to-date). Consider rescheduling a missed easy session—avoid adding intensity.`,
        data: { ratio: acwr.ratio, plan_progress: planProgress }
      });
    }
  }

  // 3c. Recovery week with too much load (compared to previous week)
  if (isRecoveryWeek && weekComparison.change_direction === 'increase' && weekComparison.change_percent > 10) {
    insights.push({
      type: 'weekly_jump',
      severity: 'warning',
      message: `Recovery week: Load increased ${weekComparison.change_percent}% from last week. Recovery weeks should reduce load - prioritize easy volume and rest.`,
      data: { 
        change: weekComparison.change_percent,
        current: weekComparison.current_week_total,
        previous: weekComparison.previous_week_total
      }
    });
  }

  // 4. Sport Imbalance (INFO priority) - Skip when on a plan (plan dictates sport mix)
  if (!hasActivePlan) {
    const imbalance = detectSportImbalance(sportBreakdown);
    if (imbalance) {
      insights.push({
        type: 'sport_imbalance',
        severity: 'info',
        message: `${imbalance.sport} volume at ${imbalance.percent}% - ensure adequate cross-training`,
        data: imbalance
      });
    }
  }

  // Sort by severity and limit to 3
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  return insights
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 3);
}

function calculateConsecutiveHardDays(timeline: TimelineDay[]): number {
  // A "quality" or "hard" day is determined by INTENSITY, not just workload
  // This distinguishes:
  //   - Easy long run (high workload from duration, low IF ~0.7) = NOT quality
  //   - Tempo/threshold run (IF >= 0.85) = quality
  //   - Hard intervals (IF > 1.0) = quality
  const QUALITY_IF_THRESHOLD = 0.85; // Threshold intensity or above
  const FALLBACK_WORKLOAD_THRESHOLD = 100; // Only used if IF not available
  
  let maxConsecutive = 0;
  let current = 0;

  // Timeline is reverse chronological (most recent first)
  // Iterate from oldest to newest for consecutive counting
  const chronological = [...timeline].reverse();
  
  for (const day of chronological) {
    // Skip days with no workouts
    if (day.daily_total === 0) {
      current = 0;
      continue;
    }
    
    // Determine if this is a quality day using IF (preferred) or workload (fallback)
    let isQualityDay = false;
    
    if (day.max_intensity_factor !== null) {
      // Use IF to determine quality - this is the accurate method
      isQualityDay = day.max_intensity_factor >= QUALITY_IF_THRESHOLD;
    } else {
      // Fallback for older data without IF: use workload threshold
      // This is less accurate but maintains backward compatibility
      isQualityDay = day.daily_total >= FALLBACK_WORKLOAD_THRESHOLD;
    }
    
    if (isQualityDay) {
      current++;
      maxConsecutive = Math.max(maxConsecutive, current);
    } else {
      current = 0;
    }
  }

  return maxConsecutive;
}

function detectSportImbalance(breakdown: SportBreakdown): { sport: string; percent: number } | null {
  const IMBALANCE_THRESHOLD = 65; // One sport >65% of total
  
  const sports = [
    { name: 'Run', percent: breakdown.run.percent },
    { name: 'Bike', percent: breakdown.bike.percent },
    { name: 'Swim', percent: breakdown.swim.percent },
    { name: 'Strength', percent: breakdown.strength.percent },
  ];

  for (const sport of sports) {
    if (sport.percent > IMBALANCE_THRESHOLD) {
      return { sport: sport.name, percent: sport.percent };
    }
  }

  return null;
}

