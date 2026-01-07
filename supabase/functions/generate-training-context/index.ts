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

interface ACWRData {
  ratio: number;
  status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
  acute_daily_avg: number;
  chronic_daily_avg: number;
  acute_total: number;
  chronic_total: number;
  data_days: number;
  projected?: {
    ratio: number;
    status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
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
    // CALCULATE ACWR
    // ==========================================================================

    const acwr = calculateACWR(workouts, focusDate, sevenDaysAgo, twentyEightDaysAgo, planned);

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
    // CHECK FOR ACTIVE TRAINING PLAN
    // ==========================================================================
    
    let hasActivePlan = false;
    try {
      // Method 1: Check training_plans table for is_active = true
      const { data: activePlans } = await supabase
        .from('training_plans')
        .select('id, name')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .limit(1);
      
      if (activePlans && activePlans.length > 0) {
        hasActivePlan = true;
        console.log(`📋 User has active plan: ${activePlans[0].name}`);
      }
      
      // Method 2: Check for upcoming planned workouts (indicates following a plan)
      if (!hasActivePlan) {
        const tomorrow = new Date(focusDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(focusDate);
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        const { data: upcomingPlanned, count } = await supabase
          .from('planned_workouts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user_id)
          .gte('date', tomorrow.toLocaleDateString('en-CA'))
          .lte('date', nextWeek.toLocaleDateString('en-CA'));
        
        if (count && count >= 2) {
          hasActivePlan = true;
          console.log(`📋 User has ${count} planned workouts in next 7 days - treating as active plan`);
        }
      }
    } catch (e) {
      console.log('⚠️ Could not check for active plan:', e);
    }

    // ==========================================================================
    // GENERATE SMART INSIGHTS
    // ==========================================================================

    const insights = generateInsights(acwr, sportBreakdown, weekComparison, timeline, hasActivePlan);

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
// ACWR CALCULATION
// =============================================================================

function calculateACWR(
  workouts: WorkoutRecord[],
  focusDate: Date,
  sevenDaysAgo: Date,
  twentyEightDaysAgo: Date,
  plannedWorkouts: PlannedWorkoutRecord[]
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

  // Determine status
  const status = getACWRStatus(ratio);

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
        status: getACWRStatus(projectedRatio),
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
    projected
  };
}

function getACWRStatus(ratio: number): 'undertrained' | 'optimal' | 'elevated' | 'high_risk' {
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
  hasActivePlan: boolean = false
): Insight[] {
  const insights: Insight[] = [];

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

  // 1. High ACWR Warning
  if (acwr.ratio > acwrWarningThreshold && acwr.data_days >= 7) {
    const severity = acwr.ratio > acwrCriticalThreshold ? 'critical' : 'warning';
    const message = hasActivePlan
      ? `ACWR at ${acwr.ratio.toFixed(2)} - elevated even for plan progression, consider extra recovery`
      : `ACWR at ${acwr.ratio.toFixed(2)} - consider reducing load or adding recovery`;
    insights.push({
      type: 'acwr_high',
      severity,
      message,
      data: { ratio: acwr.ratio, status: acwr.status }
    });
  }

  // 2. Consecutive Hard Days (softened when on a plan)
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

  // 3. Large Weekly Jump (higher threshold and softer message when on plan)
  if (weekComparison.change_direction === 'increase' && weekComparison.change_percent > weeklyJumpThreshold) {
    const message = hasActivePlan
      ? `Weekly load increased ${weekComparison.change_percent}% - normal for build phase, monitor recovery`
      : `Weekly load increased ${weekComparison.change_percent}% - monitor for fatigue signals`;
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

