/**
 * =============================================================================
 * EDGE FUNCTION: generate-training-context
 * =============================================================================
 * 
 * PURPOSE: Calculate training context for Context screen
 * 
 * WHAT IT DOES:
 * - Calculates ACWR (Acute:Chronic Workload Ratio) using rolling 7/28 day windows
 * - Aggregates sport breakdown (run/bike/swim/strength/mobility)
 * - Builds 14-day activity timeline
 * - Generates smart insights (ACWR warnings, consecutive hard days, etc.)
 * - Calculates week-over-week comparison
 * - Provides projected ACWR if planned workout exists
 * 
 * INPUT: { user_id: string, date: string, workout_id?: string }
 * OUTPUT: TrainingContextResponse (see interface below)
 * 
 * FORMULAS:
 * - Workload (cardio): duration (hours) × intensity² × 100
 * - Workload (strength): volume_factor × intensity² × 100
 * - ACWR: (7-day sum / 7) / (28-day sum / 28)
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
 * =============================================================================
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

interface TrainingContextResponse {
  acwr: ACWRData;
  sport_breakdown: SportBreakdown;
  timeline: TimelineDay[];
  week_comparison: WeekComparison;
  insights: Insight[];
}

interface WorkoutRecord {
  id: string;
  type: string;
  name: string;
  date: string;
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

    // Calculate date ranges
    const focusDate = new Date(date + 'T12:00:00');
    const sevenDaysAgo = new Date(focusDate);
    sevenDaysAgo.setDate(focusDate.getDate() - 6);
    const twentyEightDaysAgo = new Date(focusDate);
    twentyEightDaysAgo.setDate(focusDate.getDate() - 27);
    const fourteenDaysAgo = new Date(focusDate);
    fourteenDaysAgo.setDate(focusDate.getDate() - 13);
    const previousWeekStart = new Date(sevenDaysAgo);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const focusDateISO = date;
    const sevenDaysAgoISO = sevenDaysAgo.toLocaleDateString('en-CA');
    const twentyEightDaysAgoISO = twentyEightDaysAgo.toLocaleDateString('en-CA');
    const fourteenDaysAgoISO = fourteenDaysAgo.toLocaleDateString('en-CA');
    const previousWeekStartISO = previousWeekStart.toLocaleDateString('en-CA');

    console.log(`📅 Date ranges: acute=${sevenDaysAgoISO} to ${focusDateISO}, chronic=${twentyEightDaysAgoISO} to ${focusDateISO}`);

    // ==========================================================================
    // FETCH DATA
    // ==========================================================================

    // Fetch completed workouts for last 28 days
    const { data: completedWorkouts, error: completedError } = await supabase
      .from('workouts')
      .select('id, type, name, date, workload_actual, workload_planned, intensity_factor, duration, moving_time, workout_status')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .gte('date', twentyEightDaysAgoISO)
      .lte('date', focusDateISO)
      .order('date', { ascending: false });

    if (completedError) {
      console.error('❌ Error fetching completed workouts:', completedError);
      throw new Error(`Failed to fetch workouts: ${completedError.message}`);
    }

    // Fetch planned workout for focus date (if not yet completed)
    const { data: plannedWorkouts, error: plannedError } = await supabase
      .from('planned_workouts')
      .select('id, type, name, date, workload_planned, duration, workout_status')
      .eq('user_id', user_id)
      .eq('date', focusDateISO)
      .eq('workout_status', 'planned');

    if (plannedError) {
      console.error('❌ Error fetching planned workouts:', plannedError);
      // Non-fatal - continue without planned workout
    }

    const workouts: WorkoutRecord[] = completedWorkouts || [];
    const planned: PlannedWorkoutRecord[] = plannedWorkouts || [];

    console.log(`📊 Found ${workouts.length} completed workouts, ${planned.length} planned workouts`);

    // ==========================================================================
    // FETCH PLAN CONTEXT
    // ==========================================================================

    const planContext = await fetchPlanContext(supabase, user_id, focusDateISO, focusDate);

    // ==========================================================================
    // CALCULATE ACWR
    // ==========================================================================

    const acwr = calculateACWR(workouts, focusDate, sevenDaysAgo, twentyEightDaysAgo, planned, planContext);

    // ==========================================================================
    // CALCULATE SPORT BREAKDOWN (last 7 days)
    // ==========================================================================

    const sportBreakdown = calculateSportBreakdown(workouts, sevenDaysAgo, focusDate);

    // ==========================================================================
    // BUILD TIMELINE (last 14 days)
    // ==========================================================================

    const timeline = buildTimeline(workouts, planned, fourteenDaysAgo, focusDate, sevenDaysAgo);

    // ==========================================================================
    // CALCULATE WEEK COMPARISON
    // ==========================================================================

    const weekComparison = calculateWeekComparison(workouts, sevenDaysAgo, focusDate, previousWeekStart);

    // ==========================================================================
    // GENERATE SMART INSIGHTS
    // ==========================================================================

    const insights = generateInsights(acwr, sportBreakdown, weekComparison, timeline, planContext);

    // ==========================================================================
    // BUILD RESPONSE
    // ==========================================================================

    const response: TrainingContextResponse = {
      acwr,
      sport_breakdown: sportBreakdown,
      timeline,
      week_comparison: weekComparison,
      insights
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
    planName: null
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

    console.log(`📋 Plan context: week=${weekIndex}, intent=${weekIntent}, recovery=${isRecoveryWeek}, taper=${isTaperWeek}`);

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
      planName: plan.name
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
  sevenDaysAgo: Date,
  twentyEightDaysAgo: Date,
  plannedWorkouts: PlannedWorkoutRecord[],
  planContext: PlanContext | null
): ACWRData {
  
  // Filter to acute window (last 7 days)
  const acuteWorkouts = workouts.filter(w => {
    const workoutDate = new Date(w.date + 'T12:00:00');
    return workoutDate >= sevenDaysAgo && workoutDate <= focusDate;
  });

  // Filter to chronic window (last 28 days)
  const chronicWorkouts = workouts.filter(w => {
    const workoutDate = new Date(w.date + 'T12:00:00');
    return workoutDate >= twentyEightDaysAgo && workoutDate <= focusDate;
  });

  // Calculate totals
  const acuteTotal = acuteWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);
  const chronicTotal = chronicWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);

  // Calculate daily averages (rolling windows)
  const acuteDailyAvg = acuteTotal / 7;
  const chronicDailyAvg = chronicTotal / 28;

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
      const projectedAcuteDailyAvg = projectedAcuteTotal / 7;
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
  sevenDaysAgo: Date,
  focusDate: Date
): SportBreakdown {
  
  // Filter to last 7 days
  const recentWorkouts = workouts.filter(w => {
    const workoutDate = new Date(w.date + 'T12:00:00');
    return workoutDate >= sevenDaysAgo && workoutDate <= focusDate;
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

  console.log(`🏃 Sport breakdown: run=${breakdown.run.workload}, bike=${breakdown.bike.workload}, total=${breakdown.total_workload}`);

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
  sevenDaysAgo: Date,
  focusDate: Date,
  previousWeekStart: Date
): WeekComparison {
  
  // Current week (last 7 days ending on focus date)
  const currentWeekWorkouts = workouts.filter(w => {
    const workoutDate = new Date(w.date + 'T12:00:00');
    return workoutDate >= sevenDaysAgo && workoutDate <= focusDate;
  });
  const currentWeekTotal = currentWeekWorkouts.reduce((sum, w) => sum + (w.workload_actual || 0), 0);

  // Previous week (7 days before that)
  const previousWeekEnd = new Date(sevenDaysAgo);
  previousWeekEnd.setDate(previousWeekEnd.getDate() - 1);
  
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
// SMART INSIGHTS
// =============================================================================

function generateInsights(
  acwr: ACWRData,
  sportBreakdown: SportBreakdown,
  weekComparison: WeekComparison,
  timeline: TimelineDay[],
  planContext: PlanContext | null
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

  // 1. High ACWR Warning (skip for recovery weeks - low load is expected)
  if (!isRecoveryWeek && acwr.ratio > acwrWarningThreshold && acwr.data_days >= 7) {
    const severity = acwr.ratio > acwrCriticalThreshold ? 'critical' : 'warning';
    let message: string;
    
    if (hasActivePlan) {
      message = `ACWR at ${acwr.ratio.toFixed(2)} - elevated even for plan progression, consider extra recovery`;
    } else {
      message = `ACWR at ${acwr.ratio.toFixed(2)} - consider reducing load or adding recovery`;
    }
    
    insights.push({
      type: 'acwr_high',
      severity,
      message,
      data: { ratio: acwr.ratio, status: acwr.status }
    });
  }

  // 1b. Recovery week specific insight (low ACWR is good, but warn if too high)
  if (isRecoveryWeek) {
    if (acwr.ratio > 1.20 && acwr.data_days >= 7) {
      insights.push({
        type: 'acwr_high',
        severity: 'warning',
        message: `Recovery week: ACWR at ${acwr.ratio.toFixed(2)} is elevated. Lower load is intentional - focus on sleep, mobility, easy volume.`,
        data: { ratio: acwr.ratio, status: acwr.status }
      });
    } else if (acwr.ratio <= 1.05) {
      // Positive reinforcement for proper recovery
      insights.push({
        type: 'acwr_high', // Reuse type for now, could add 'recovery_optimal' type
        severity: 'info',
        message: `Recovery week: Lower load is intentional. Focus on sleep, mobility, and easy volume to maximize adaptation.`,
        data: { ratio: acwr.ratio, status: acwr.status }
      });
    }
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

  // 3. Large Weekly Jump (higher threshold and softer message when on plan, skip for recovery weeks)
  if (!isRecoveryWeek && weekComparison.change_direction === 'increase' && weekComparison.change_percent > weeklyJumpThreshold) {
    let message: string;
    if (hasActivePlan && weekIntent === 'build') {
      message = `Weekly load increased ${weekComparison.change_percent}% - normal for build phase, monitor recovery`;
    } else if (hasActivePlan) {
      message = `Weekly load increased ${weekComparison.change_percent}% - monitor recovery`;
    } else {
      message = `Weekly load increased ${weekComparison.change_percent}% - monitor for fatigue signals`;
    }
    
    insights.push({
      type: 'weekly_jump',
      severity: hasActivePlan ? 'info' : 'warning',
      message,
      data: { 
        change: weekComparison.change_percent,
        current: weekComparison.current_week_total,
        previous: weekComparison.previous_week_total
      }
    });
  }

  // 3b. Low load warning for build weeks (not recovery/taper)
  if (!isRecoveryWeek && !isTaperWeek && acwr.ratio < 0.80 && hasActivePlan && weekIntent === 'build') {
    insights.push({
      type: 'weekly_jump', // Reuse type
      severity: 'info',
      message: `Load is below target for a build week. Consider adding volume if feeling fresh.`,
      data: { ratio: acwr.ratio }
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

