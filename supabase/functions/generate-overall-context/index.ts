/**
 * GENERATE-OVERALL-CONTEXT EDGE FUNCTION (v2)
 * 
 * Smart Server, Dumb Client Architecture
 * 
 * - All calculations done in TypeScript (no AI interpretation)
 * - GPT only writes a brief coaching insight at the end
 * - Returns structured JSON for frontend to render
 * 
 * Input: { user_id: string, weeks_back?: number (default 4) }
 * Output: BlockAnalysis (structured data)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  BlockAnalysis,
  Workout,
  PlannedWorkout,
  UserBaselines,
  Goal,
  calculatePerformanceTrends,
  calculatePlanAdherence,
  calculateWeekSummary,
  generateFocusAreas,
  assessDataQuality,
  formatTrendForDisplay,
  formatAdherenceForDisplay,
  formatWeekSummaryForDisplay,
  formatFocusAreasForDisplay
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

    // Fetch all data in parallel
    const [plannedResult, workoutsResult, plansResult, baselinesResult] = await Promise.all([
      // Planned workouts (up to yesterday to avoid timezone issues)
      supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', user_id)
        .gte('date', startDateISO)
        .lte('date', yesterdayISO)
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
      
      // Active plans (for goal context)
      supabase
        .from('plans')
        .select('name, status, config, current_week')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      
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
    const activePlan = plansResult.data;

    console.log(`📊 Data: ${planned.length} planned, ${completedWorkouts.length} completed`);

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

    // ==========================================================================
    // GPT WRITES COACHING INSIGHT ONLY
    // ==========================================================================

    const coachingInsight = await generateCoachingInsight({
      performanceTrends,
      planAdherence,
      thisWeek,
      focusAreas,
      goal
    });

    // ==========================================================================
    // BUILD STRUCTURED RESPONSE
    // ==========================================================================

    const analysis: BlockAnalysis = {
      performance_trends: performanceTrends,
      plan_adherence: planAdherence,
      this_week: thisWeek,
      focus_areas: focusAreas,
      data_quality: dataQuality,
      coaching_insight: coachingInsight,
      generated_at: new Date().toISOString()
    };

    // Also include legacy fields for backward compatibility during migration
    const legacyResponse = {
      ...analysis,
      // Legacy text fields (will be removed after frontend migration)
      performance_trends_text: formatPerformanceTrendsText(performanceTrends),
      plan_adherence_text: formatPlanAdherenceText(planAdherence),
      weekly_summary: formatWeekSummaryText(thisWeek)
    };

    return new Response(JSON.stringify(legacyResponse), {
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
  if (nameLower.includes('marathon')) type = 'marathon';
  else if (nameLower.includes('triathlon') || nameLower.includes('tri')) type = 'triathlon';
  else if (nameLower.includes('cycling') || nameLower.includes('bike')) type = 'cycling';
  
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
// GPT: Generate coaching insight ONLY
// =============================================================================

async function generateCoachingInsight(context: {
  performanceTrends: any;
  planAdherence: any;
  thisWeek: any;
  focusAreas: any;
  goal?: Goal;
}): Promise<string> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiKey) {
    console.log('⚠️ OpenAI key not configured, using fallback');
    return generateFallbackInsight(context);
  }
  
  try {
    // Summarize the key facts for GPT
    const facts = buildFactsSummary(context);
    
    const prompt = `You are a coach giving brief, direct feedback. Based on these FACTS (already calculated):

${facts}

Write 2-3 sentences of coaching insight. Be:
- Direct, not generic ("your strength gap is hurting durability" not "keep it up")
- Specific about what matters most
- Honest about problems
- Brief

Do NOT repeat the numbers - just give the insight. No emoji.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.4
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();

  } catch (error) {
    console.error('GPT error:', error);
    return generateFallbackInsight(context);
  }
}

function buildFactsSummary(context: any): string {
  const lines: string[] = [];
  
  // Adherence
  const adh = context.planAdherence;
  lines.push(`Adherence: ${adh.overall.percent}% (${adh.overall.status})`);
  
  for (const item of adh.by_discipline) {
    if (item.status === 'critical' || item.status === 'warning') {
      lines.push(`- ${item.discipline}: ${item.percent}% (${item.note})`);
    }
  }
  
  // Patterns
  if (adh.patterns.length > 0) {
    lines.push(`Patterns: ${adh.patterns.join('; ')}`);
  }
  
  // Trends
  const trends = context.performanceTrends;
  if (trends.run?.reliable) {
    lines.push(`Run: ${formatTrendForDisplay(trends.run)}`);
  }
  if (trends.bike?.reliable) {
    lines.push(`Bike: ${formatTrendForDisplay(trends.bike)}`);
  }
  
  // Focus areas
  if (context.focusAreas.areas.length > 0) {
    lines.push(`Top priorities: ${context.focusAreas.areas.map(a => a.action).join('; ')}`);
  }
  
  // Goal
  if (context.goal) {
    lines.push(`Goal: ${context.goal.name} (${context.goal.current_phase}, ${context.goal.weeks_remaining || '?'} weeks)`);
  }
  
  return lines.join('\n');
}

function generateFallbackInsight(context: any): string {
  const adh = context.planAdherence;
  const focus = context.focusAreas.areas[0];
  
  if (adh.overall.status === 'falling_behind') {
    return `Training consistency needs attention. ${focus?.action || 'Focus on completing key workouts.'} Adherence has dropped to ${adh.overall.percent}%.`;
  }
  
  if (adh.overall.status === 'needs_attention') {
    const warning = adh.by_discipline.find(d => d.status === 'warning' || d.status === 'critical');
    if (warning) {
      return `Overall adherence is ${adh.overall.percent}%, but ${warning.discipline} is a gap (${warning.note}). ${focus?.action || 'Address this to avoid setbacks.'}`;
    }
    return `Training is mostly on track at ${adh.overall.percent}% adherence. ${focus?.action || 'Stay consistent.'}`;
  }
  
  return `Training is on track at ${adh.overall.percent}% adherence. ${focus?.action || 'Keep the momentum going.'}`;
}

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
