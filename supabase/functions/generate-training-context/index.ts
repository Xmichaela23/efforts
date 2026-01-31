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
  display_load_change_risk_label?: 'Below baseline' | 'Below baseline (planned)' | 'In range' | 'Ramping fast' | 'Overreaching';
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
      .select('id, type, name, date, workload_planned, duration, workout_status, training_plan_id')
      .eq('user_id', user_id)
      .eq('workout_status', 'planned')
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

    console.log(`📊 Found ${workouts.length} completed workouts, ${plannedWeek.length} planned workouts (week range)`);

    // ==========================================================================
    // CALCULATE ACWR (using smart date ranges)
    // ==========================================================================

    const acwr = calculateACWR(workouts, focusDate, dateRanges, plannedForFocusDate, planContext);

    // ==========================================================================
    // CALCULATE SPORT BREAKDOWN (using current plan week or last 7 days)
    // ==========================================================================

    const sportBreakdown = calculateSportBreakdown(workouts, dateRanges);

    // ==========================================================================
    // BUILD TIMELINE (last 14 days)
    // ==========================================================================

    const timeline = buildTimeline(workouts, plannedForFocusDate, dateRanges.fourteenDaysAgo, focusDate, dateRanges.acuteStart);

    // ==========================================================================
    // CALCULATE WEEK COMPARISON (using plan weeks when available)
    // ==========================================================================

    const weekComparison = calculateWeekComparison(workouts, dateRanges, planContext);

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
      }
    }

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
    let display_load_change_risk_label: 'Below baseline' | 'In range' | 'Ramping fast' | 'Overreaching' =
      acwr.status === 'undertrained' || acwr.status === 'recovery' || acwr.status === 'optimal_recovery'
        ? 'Below baseline'
        : acwr.status === 'optimal'
          ? 'In range'
          : acwr.status === 'elevated'
            ? 'Ramping fast'
            : 'Overreaching';
    // On plan + low ACWR: label as planned, optional helper for down-weeks (never scold).
    let display_load_change_risk_helper: string | null = null;
    if (planContext?.hasActivePlan && acwr.ratio < 0.8) {
      display_load_change_risk_label = 'Below baseline (planned)';
      if (planContext.isRecoveryWeek || planContext.isTaperWeek) {
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
              ? 'Proceed with caution.'
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
    // CONTEXT SUMMARY (one integrated story — resolves signals, no repetition)
    // Built from: plan phase + day type, adherence tier, limiter, projected load.
    // ==========================================================================
    const weekIntentForSummary = planContext?.weekIntent ?? 'build';
    const pacePct = weekly_readiness?.pace_adherence_pct ?? null;
    const adherenceTier: 'high' | 'moderate' | 'low' | null =
      pacePct == null ? null : pacePct >= 85 ? 'high' : pacePct >= 70 ? 'moderate' : 'low';
    const phaseLabel = !hasActivePlan ? 'OFF PLAN' : isRecoveryWeek ? 'RECOVERY WEEK' : isTaperWeek ? 'TAPER WEEK' : weekIntentForSummary === 'peak' ? 'PEAK WEEK' : weekIntentForSummary === 'baseline' ? 'BASELINE WEEK' : 'BUILD WEEK';
    const dayTypeLabel = todayIsRestDay ? 'REST' : 'TRAINING';
    const aerobicWord = display_aerobic_tier === 'Low' ? 'low' : display_aerobic_tier === 'Moderate' ? 'moderate' : 'elevated';
    const structuralWord = display_structural_tier === 'Low' ? 'fresh' : display_structural_tier === 'Moderate' ? 'moderate' : 'elevated';

    const context_summary: string[] = [];
    context_summary.push(`${phaseLabel} — ${dayTypeLabel}`);
    if (hasActivePlan) {
      if (adherenceTier !== null && pacePct != null) {
        if (adherenceTier === 'high') context_summary.push(`You're on plan and adhering well (${pacePct}%).`);
        else if (adherenceTier === 'moderate') context_summary.push(`Moderate adherence to pace (${pacePct}%) — some variability in signals.`);
        else context_summary.push(`Low adherence to pace (${pacePct}%) — treat readiness signals with caution.`);
      } else {
        context_summary.push("You're on plan.");
      }
    }
    if (todayIsRestDay && hasActivePlan) {
      context_summary.push('This is a planned rest day.');
    } else if (hasActivePlan) {
      context_summary.push(`This is a training day in a ${phaseLabel.toLowerCase().replace(' week', '')} week.`);
    } else {
      context_summary.push(todayIsRestDay ? 'Today is a rest day.' : 'Today is a training day.');
    }
    context_summary.push(`Your aerobic system is carrying ${aerobicWord} fatigue from recent sessions, while your structural system is ${structuralWord}.`);
    if (hasActivePlan && projected_week_load) {
      const label = projected_week_load.projected_label;
      const intentSuffix =
        isRecoveryWeek ? ' (recovery week)' : isTaperWeek ? ' (taper)' : label === 'below' && (weekIntentForSummary === 'build' || weekIntentForSummary === 'peak' || weekIntentForSummary === 'baseline') ? ' (lighter build week)' : '';
      if (label === 'below') {
        context_summary.push(`Planned week is lighter than your recent baseline${intentSuffix}.`);
      } else if (label === 'in range') {
        context_summary.push('Planned week is in line with your recent baseline.');
      } else {
        context_summary.push('Planned week is heavier than your recent baseline.');
      }
    }
    if (acwr.ratio > 1.3 && acwr.data_days >= 7) {
      context_summary.push(acwr.ratio > 1.5 ? 'Load change risk is overreaching — avoid adding volume.' : 'Load change risk is ramping fast — avoid adding volume.');
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
    context_summary.push(next_action);

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
      context_summary
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

    // Get weekly summaries
    let weeklySummaries = config.weekly_summaries || {};
    
    // Generate from sessions_by_week if missing (same logic as get-week)
    if (!weeklySummaries || Object.keys(weeklySummaries).length === 0) {
      const sessionsByWeek = plan.sessions_by_week || {};
      weeklySummaries = {};
      const weekKeys = Object.keys(sessionsByWeek).sort((a, b) => parseInt(a) - parseInt(b));
      
      for (const weekKey of weekKeys) {
        const sessions = Array.isArray(sessionsByWeek[weekKey]) ? sessionsByWeek[weekKey] : [];
        if (sessions.length === 0) continue;
        
        const hasIntervals = sessions.some((s: any) => {
          const tokens = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
          const tags = Array.isArray(s?.tags) ? s.tags : [];
          const desc = String(s?.description || s?.name || '').toLowerCase();
          return tokens.some((t: string) => /interval|vo2|5kpace|tempo|threshold/.test(String(t).toLowerCase())) ||
                 tags.some((t: string) => /interval|vo2|tempo|threshold|hard/.test(String(t).toLowerCase())) ||
                 /interval|vo2|tempo|threshold/.test(desc);
        });
        
        const hasLongRun = sessions.some((s: any) => {
          const tokens = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
          const tags = Array.isArray(s?.tags) ? s.tags : [];
          const desc = String(s?.description || s?.name || '').toLowerCase();
          return tokens.some((t: string) => /longrun|long_run/.test(String(t).toLowerCase())) ||
                 tags.some((t: string) => /longrun|long_run/.test(String(t).toLowerCase())) ||
                 /long run|longrun/.test(desc);
        });
        
        let focus = '';
        if (hasIntervals && hasLongRun) {
          focus = 'Build Phase';
        } else if (hasIntervals) {
          focus = 'Speed Development';
        } else if (hasLongRun) {
          focus = 'Endurance Building';
        } else {
          focus = 'Training Week';
        }
        
        weeklySummaries[weekKey] = { focus };
      }
    }

    const weekSummary = weeklySummaries[String(weekIndex)] || {};
    const weekFocusLabel = weekSummary.focus || null;

    // Determine recovery/taper status (explicit detection, ranked by trust)
    let isRecoveryWeek = false;
    let isTaperWeek = false;
    let weekIntent: PlanContext['weekIntent'] = 'build';
    let phaseKey: string | null = null;
    let phaseName: string | null = null;

    // PRIORITY 1: Explicit per-week tag in weekly_summaries
    if (weekFocusLabel) {
      const focusLower = weekFocusLabel.toLowerCase();
      if (focusLower.includes('recovery') || focusLower.includes('recovery week')) {
        isRecoveryWeek = true;
        weekIntent = 'recovery';
      } else if (focusLower.includes('taper') || focusLower.includes('taper week')) {
        isTaperWeek = true;
        weekIntent = 'taper';
      } else if (focusLower.includes('peak')) {
        weekIntent = 'peak';
      }
    }

    // PRIORITY 2: Explicit phase metadata (recovery_weeks array)
    if (!isRecoveryWeek && !isTaperWeek && config.phases) {
      for (const [phaseKeyName, phaseData] of Object.entries(config.phases)) {
        const phase = phaseData as any;
        if (phase.weeks && phase.weeks.includes(weekIndex)) {
          phaseKey = phaseKeyName;
          phaseName = phaseKeyName;
          
          // Check if phase has recovery_weeks array
          if (phase.recovery_weeks && Array.isArray(phase.recovery_weeks) && phase.recovery_weeks.includes(weekIndex)) {
            isRecoveryWeek = true;
            weekIntent = 'recovery';
          }
          
          // Check if it's a taper phase
          if (phaseKeyName.toLowerCase().includes('taper')) {
            isTaperWeek = true;
            weekIntent = 'taper';
          }
          
          // If we haven't set intent yet, infer from phase name
          if (weekIntent === 'build') {
            if (phaseKeyName.toLowerCase().includes('peak')) {
              weekIntent = 'peak';
            } else if (phaseKeyName.toLowerCase().includes('base')) {
              weekIntent = 'baseline';
            }
          }
          
          break;
        }
      }
    }

    // PRIORITY 3: Pattern-based (only if explicitly declared)
    if (!isRecoveryWeek && !isTaperWeek && config.recoveryPattern === 'every_4th') {
      // Every 4th week is recovery (but not in taper)
      const taperPhase = config.phases ? Object.values(config.phases).find((p: any) => 
        p.name && p.name.toLowerCase().includes('taper')
      ) : null;
      
      const isInTaper = taperPhase && (taperPhase as any).weeks && (taperPhase as any).weeks.includes(weekIndex);
      
      if (!isInTaper && weekIndex % 4 === 0) {
        isRecoveryWeek = true;
        weekIntent = 'recovery';
      }
    }

    // If we still don't know, default to 'build' (not 'unknown' - that's for no plan)
    if (weekIntent === 'unknown') {
      weekIntent = 'build';
    }

    // Next week's intent (what's coming up — plan design)
    let next_week_intent: PlanContext['next_week_intent'] = null;
    let next_week_focus_label: string | null = null;
    const nextWeekIndex = weekIndex + 1;
    if (durationWeeks == null || nextWeekIndex <= durationWeeks) {
      const nextWeekSummary = weeklySummaries[String(nextWeekIndex)] || {};
      next_week_focus_label = nextWeekSummary.focus || null;
      if (next_week_focus_label) {
        const nextLower = next_week_focus_label.toLowerCase();
        if (nextLower.includes('recovery') || nextLower.includes('recovery week')) next_week_intent = 'recovery';
        else if (nextLower.includes('taper') || nextLower.includes('taper week')) next_week_intent = 'taper';
        else if (nextLower.includes('peak')) next_week_intent = 'peak';
        else if (nextLower.includes('base')) next_week_intent = 'baseline';
        else next_week_intent = 'build';
      } else if (config.phases) {
        for (const [, phaseData] of Object.entries(config.phases)) {
          const phase = phaseData as any;
          if (phase.weeks && phase.weeks.includes(nextWeekIndex)) {
            const name = (phase as any).name || '';
            if (name.toLowerCase().includes('taper')) next_week_intent = 'taper';
            else if (name.toLowerCase().includes('peak')) next_week_intent = 'peak';
            else if (name.toLowerCase().includes('base')) next_week_intent = 'baseline';
            else if (phase.recovery_weeks && phase.recovery_weeks.includes(nextWeekIndex)) next_week_intent = 'recovery';
            else next_week_intent = 'build';
            break;
          }
        }
      }
      if (next_week_intent === null) next_week_intent = 'build';
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
// ACWR CALCULATION
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
// SPORT BREAKDOWN
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
  planContext: PlanContext | null
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

  // Previous week: use previous plan week if available, otherwise previous 7 days
  let previousWeekStart: Date;
  let previousWeekEnd: Date;
  
  if (planContext?.hasActivePlan && dateRanges.previousWeekStart && dateRanges.previousWeekEnd) {
    // Use plan-aligned previous week
    previousWeekStart = dateRanges.previousWeekStart;
    previousWeekEnd = dateRanges.previousWeekEnd;
  } else {
    // Use rolling previous 7-day window
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
  const previousWeekTotal = previousWeekWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);

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

