/**
 * GENERATE-OVERALL-CONTEXT EDGE FUNCTION (v2)
 * 
 * Smart Server, Dumb Client Architecture
 * 
 * - All calculations done in TypeScript (no AI interpretation)
 * - NO GPT - structured data speaks for itself
 * - Returns structured JSON for frontend to render
 * 
 * Input: { user_id: string, weeks_back?: number (default 4) }
 * Output: Structured block analysis data
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  Workout,
  PlannedWorkout,
  UserBaselines,
  Goal,
  calculatePerformanceTrends,
  calculatePlanAdherence,
  calculateWeekSummary,
  generateFocusAreas,
  assessDataQuality,
  calculateWorkoutQuality
} from '../_shared/block-analysis/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin'
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { user_id, weeks_back = 4 } = payload;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (weeks_back * 7));
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const startDateISO = startDate.toLocaleDateString('en-CA');
    const endDateISO = endDate.toLocaleDateString('en-CA');
    const yesterdayISO = yesterday.toLocaleDateString('en-CA');

    console.log(`📊 Generating block analysis for user ${user_id}, ${weeks_back} weeks`);

    // First, get the active plan to filter planned_workouts
    const { data: activePlan } = await supabase
      .from('plans')
      .select('id, name, status, config, current_week')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    const activePlanId = activePlan?.id;
    console.log(`📊 Active plan: ${activePlan?.name || 'none'} (${activePlanId || 'no id'})`);

    // Fetch remaining data in parallel
    const [plannedResult, workoutsResult, baselinesResult] = await Promise.all([
      // Planned workouts - ONLY from the active plan
      supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', user_id)
        .gte('date', startDateISO)
        .lte('date', yesterdayISO)
        .eq('training_plan_id', activePlanId || 'no-plan') // Filter by active plan
        .order('date', { ascending: true }),
      
      // Completed workouts
      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user_id)
        .eq('workout_status', 'completed')
        .gte('date', startDateISO)
        .lte('date', endDateISO)
        .order('date', { ascending: true }),
      
      // User baselines
      supabase
        .from('user_baselines')
        .select('performance_numbers')
        .eq('user_id', user_id)
        .single()
    ]);

    if (plannedResult.error) {
      console.error('Error fetching planned workouts:', plannedResult.error);
      throw new Error(`Failed to fetch planned workouts: ${plannedResult.error.message}`);
    }

    if (workoutsResult.error) {
      console.error('Error fetching workouts:', workoutsResult.error);
      throw new Error(`Failed to fetch workouts: ${workoutsResult.error.message}`);
    }

    const planned = (plannedResult.data || []) as PlannedWorkout[];
    const completedWorkouts = (workoutsResult.data || []) as Workout[];
    const userBaselines = (baselinesResult.data?.performance_numbers || {}) as UserBaselines;
    // activePlan already defined above

    console.log(`📊 Data: ${planned.length} planned, ${completedWorkouts.length} completed`);
    console.log(`📊 Date range: ${startDateISO} to ${endDateISO} (planned up to ${yesterdayISO})`);
    
    // Debug: Show this week's planned workouts
    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - 6);
    const thisWeekPlanned = planned.filter(p => new Date(p.date) >= thisWeekStart);
    console.log(`📊 This week planned (${thisWeekStart.toLocaleDateString('en-CA')} to today):`);
    thisWeekPlanned.forEach(p => {
      console.log(`   - ${p.date}: ${p.type} "${p.name}"`);
    });
    
    // Debug: Show this week's completed workouts
    const thisWeekCompleted = completedWorkouts.filter(w => new Date(w.date) >= thisWeekStart);
    console.log(`📊 This week completed:`);
    thisWeekCompleted.forEach(w => {
      console.log(`   - ${w.date}: ${w.type} "${w.name}" (planned_id: ${w.planned_id || 'none'})`);
    });

    // Attach completions to planned workouts
    const plannedWithCompletions = attachCompletions(planned, completedWorkouts);

    // Extract goal context
    const goal = extractGoalContext(activePlan);

    // ==========================================================================
    // CALCULATE EVERYTHING IN TYPESCRIPT (No AI)
    // ==========================================================================

    const performanceTrends = calculatePerformanceTrends(
      completedWorkouts, 
      userBaselines, 
      weeks_back
    );

    const planAdherence = calculatePlanAdherence(
      plannedWithCompletions, 
      goal, 
      weeks_back
    );

    const thisWeek = calculateWeekSummary(
      plannedWithCompletions, 
      completedWorkouts, 
      weeks_back
    );

    const focusAreas = generateFocusAreas(
      planAdherence, 
      performanceTrends, 
      goal
    );

    const dataQuality = assessDataQuality(
      completedWorkouts, 
      userBaselines, 
      weeks_back
    );

    const workoutQuality = calculateWorkoutQuality(
      completedWorkouts,
      weeks_back
    );

    // ==========================================================================
    // BUILD STRUCTURED RESPONSE (No GPT - structured data speaks for itself)
    // ==========================================================================

    // Filter adherence to only show relevant disciplines for the goal
    const relevantAdherence = filterRelevantDisciplines(planAdherence, goal);
    
    // Return BOTH structured data AND legacy text fields
    // Legacy fields use the same keys so old frontend still works
    const response = {
      // New structured data (for new frontend)
      performance_trends_structured: performanceTrends,
      plan_adherence_structured: relevantAdherence,
      workout_quality: workoutQuality,
      this_week: thisWeek,
      focus_areas: focusAreas,
      data_quality: dataQuality,
      goal: goal, // Include goal so frontend knows context
      generated_at: new Date().toISOString(),
      
      // Legacy text fields (for old frontend - same keys it expects)
      performance_trends: formatPerformanceTrendsText(performanceTrends),
      plan_adherence: formatPlanAdherenceText(relevantAdherence),
      weekly_summary: formatWeekSummaryText(thisWeek)
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Generate overall context error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// =============================================================================
// HELPER: Attach completions to planned workouts
// =============================================================================

function attachCompletions(
  planned: PlannedWorkout[], 
  completed: Workout[]
): PlannedWorkout[] {
  return planned.map(plannedWorkout => {
    // First, try exact match by planned_id
    let matches = completed.filter(w => w.planned_id === plannedWorkout.id);
    
    // If no exact match, try type + date proximity (for moved workouts)
    if (matches.length === 0) {
      const plannedDate = new Date(plannedWorkout.date);
      const plannedType = plannedWorkout.type.toLowerCase();
      
      matches = completed.filter(workout => {
        const workoutType = workout.type.toLowerCase();
        const workoutDate = new Date(workout.date);
        const daysDiff = Math.abs((workoutDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Match type and date within 7 days
        return normalizeDiscipline(workoutType) === normalizeDiscipline(plannedType) && 
               daysDiff <= 7 && 
               !workout.planned_id;
      });
    }
    
    return {
      ...plannedWorkout,
      completed: matches
    };
  });
}

// =============================================================================
// HELPER: Extract goal context from active plan
// =============================================================================

function extractGoalContext(plan: any): Goal | undefined {
  if (!plan) return undefined;
  
  const planName = plan.name || '';
  const config = plan.config || {};
  const currentWeek = plan.current_week || 1;
  
  // Try to determine goal type from name
  let type = 'general';
  const nameLower = planName.toLowerCase();
  if (nameLower.includes('marathon') || nameLower.includes('half marathon')) type = 'marathon';
  else if (nameLower.includes('triathlon') || nameLower.includes('ironman') || nameLower.includes('70.3')) type = 'triathlon';
  else if (nameLower.includes('cycling') || nameLower.includes('bike') || nameLower.includes('gran fondo')) type = 'cycling';
  else if (nameLower.includes('5k') || nameLower.includes('10k') || nameLower.includes('run')) type = 'running';
  
  console.log(`📊 Goal extraction: "${planName}" → type: ${type}`);
  
  // Try to get current phase from config
  const weekSummary = config?.weekly_summaries?.[currentWeek];
  const focus = (weekSummary?.focus || '').toLowerCase();
  let currentPhase = 'base';
  if (focus.includes('taper')) currentPhase = 'taper';
  else if (focus.includes('peak')) currentPhase = 'peak';
  else if (focus.includes('build')) currentPhase = 'build';
  
  // Calculate weeks remaining (if goal date is in config)
  let weeksRemaining: number | undefined;
  if (config?.goal_date) {
    const goalDate = new Date(config.goal_date);
    const now = new Date();
    weeksRemaining = Math.ceil((goalDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksRemaining < 0) weeksRemaining = 0;
  }
  
  return {
    name: planName,
    date: config?.goal_date || '',
    type,
    current_phase: currentPhase,
    weeks_remaining: weeksRemaining
  };
}

// =============================================================================
// =============================================================================
// LEGACY FORMATTERS (for backward compatibility)
// =============================================================================

function formatPerformanceTrendsText(trends: any): string {
  const parts: string[] = [];
  
  if (trends.run?.reliable) {
    const sign = trends.run.change_percent > 0 ? '+' : '';
    parts.push(`Run pace ${trends.run.previous} → ${trends.run.current} (${sign}${trends.run.change_percent}%)`);
  } else if (trends.run?.message) {
    parts.push(`Run: ${trends.run.message}`);
  }
  
  if (trends.bike?.reliable) {
    const sign = trends.bike.change_percent > 0 ? '+' : '';
    parts.push(`Bike power ${trends.bike.previous} → ${trends.bike.current} (${sign}${trends.bike.change_percent}%)`);
  } else if (trends.bike?.message) {
    parts.push(`Bike: ${trends.bike.message}`);
  }
  
  return parts.join('. ') || 'Insufficient data for performance trends.';
}

// =============================================================================
// HELPER: Filter disciplines relevant to goal
// =============================================================================

function filterRelevantDisciplines(adherence: any, goal?: Goal): any {
  if (!goal) return adherence;
  
  // Define which disciplines matter for each goal type
  const relevantDisciplines: Record<string, string[]> = {
    marathon: ['run', 'strength'],
    running: ['run', 'strength'],
    triathlon: ['run', 'bike', 'swim', 'strength'],
    cycling: ['bike', 'strength'],
    general: ['run', 'bike', 'swim', 'strength']
  };
  
  const relevant = relevantDisciplines[goal.type || 'general'] || relevantDisciplines.general;
  
  console.log(`📊 Filtering disciplines for ${goal.type}: keeping ${relevant.join(', ')}`);
  
  // Filter by_discipline to only include relevant ones
  const filteredDisciplines = adherence.by_discipline.filter((d: any) => 
    relevant.includes(d.discipline)
  );
  
  // Recalculate overall from filtered disciplines
  const totalPlanned = filteredDisciplines.reduce((sum: number, d: any) => sum + d.planned, 0);
  const totalCompleted = filteredDisciplines.reduce((sum: number, d: any) => sum + d.completed, 0);
  const overallPercent = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;
  
  return {
    ...adherence,
    overall: {
      ...adherence.overall,
      completed: totalCompleted,
      planned: totalPlanned,
      percent: overallPercent
    },
    by_discipline: filteredDisciplines
  };
}

function formatPlanAdherenceText(adherence: any): string {
  const overall = `${adherence.overall.percent}% overall completion (${adherence.overall.completed}/${adherence.overall.planned}).`;
  
  const disciplines = adherence.by_discipline
    .filter(d => d.planned > 0)
    .map(d => `${capitalize(d.discipline)}: ${d.percent}% (${d.completed}/${d.planned})`)
    .join('. ');
  
  const patterns = adherence.patterns.length > 0 
    ? ` ${adherence.patterns.join('. ')}.`
    : '';
  
  return `${overall} ${disciplines}.${patterns}`;
}

function formatWeekSummaryText(week: any): string {
  const completion = `${week.completed_count} of ${week.planned_count} sessions completed.`;
  
  const missed = week.missed.length > 0
    ? ` Missed: ${groupMissedByDiscipline(week.missed)}.`
    : '';
  
  return `${completion}${missed}`;
}

function groupMissedByDiscipline(missed: any[]): string {
  const byDiscipline: Record<string, number> = {};
  for (const m of missed) {
    byDiscipline[m.discipline] = (byDiscipline[m.discipline] || 0) + 1;
  }
  return Object.entries(byDiscipline)
    .map(([d, count]) => `${count} ${d}`)
    .join(', ');
}

function normalizeDiscipline(type: string): string {
  const t = type.toLowerCase();
  if (t === 'run' || t === 'running') return 'run';
  if (t === 'ride' || t === 'cycling' || t === 'bike') return 'bike';
  if (t === 'swim' || t === 'swimming') return 'swim';
  if (t === 'strength') return 'strength';
  if (t === 'mobility') return 'mobility';
  return t;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
