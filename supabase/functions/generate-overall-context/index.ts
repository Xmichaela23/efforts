/**
 * GENERATE-OVERALL-CONTEXT EDGE FUNCTION
 * 
 * Purpose: Generate AI-powered overall training analysis for the Context view
 * 
 * What it does:
 * - Receives user_id and weeks_back from frontend Context tab
 * - Queries last N weeks of completed workouts and planned workouts
 * - Aggregates data by week and discipline (runs, bikes, swims, strength)
 * - Tracks strength lift progression and compares to 1RM baselines
 * - Calculates performance trends and plan adherence metrics
 * - Calls GPT-4 to generate three-section analysis:
 *   1. Performance Trends (pace/power/strength progression over time)
 *   2. Plan Adherence (completion rates and consistency)
 *   3. Weekly Summary (most recent week performance vs plan)
 * - Returns structured analysis for Context tab display
 * 
 * Input: { user_id: string, weeks_back?: number (default 4) }
 * Output: { 
 *   performance_trends: string,
 *   plan_adherence: string, 
 *   weekly_summary: string 
 * }
 * 
 * GPT-4 Settings: model=gpt-4, temperature=0.3, max_tokens=300
 * Tone: Factual, specific numbers, no fluff, direct language
 * 
 * Data Sources:
 * - workouts table: completed workout metrics and performance data
 * - planned_workouts table: planned sessions and targets
 * - user_baselines table: 1RM baselines for strength lifts
 * - plans table: current training phase context
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin'
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const payload = await req.json();
    const { user_id, weeks_back = 4 } = payload;

    if (!user_id) {
      return new Response(JSON.stringify({
        error: 'user_id is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Calculate date range using user's local timezone
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (weeks_back * 7));

    const startDateISO = startDate.toLocaleDateString('en-CA');
    const endDateISO = endDate.toLocaleDateString('en-CA');

    console.log(`Generating overall context for user ${user_id}, ${weeks_back} weeks (${startDateISO} to ${endDateISO})`);

    // Use yesterday in user's local timezone to avoid timezone issues
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = yesterday.toLocaleDateString('en-CA');
    console.log(`Using yesterday in user timezone (${yesterdayISO}) to avoid timezone issues`);
    
    const [plannedResult, workoutsResult, trainingPhaseResult, baselinesResult] = await Promise.all([
      // Get planned workouts (only up to yesterday)
      supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', user_id)
        .gte('date', startDateISO)
        .lte('date', yesterdayISO)
        .order('date', { ascending: true }),
      
      // Get ALL completed workouts in the date range
      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user_id)
        .eq('workout_status', 'completed')
        .gte('date', startDateISO)
        .lte('date', endDateISO)
        .order('date', { ascending: true }),
      
      supabase
        .from('plans')
        .select('current_week, status, config')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .not('config->weekly_summaries', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      
      // Get user's 1RM baselines
      supabase
        .from('user_baselines')
        .select('baselines')
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

    const planned = plannedResult.data || [];
    let completedWorkouts = workoutsResult.data || [];

    // Auto-trigger analysis for workouts that don't have it yet
    const workoutsNeedingAnalysis = completedWorkouts.filter(workout => !workout.workout_analysis);
    if (workoutsNeedingAnalysis.length > 0) {
      console.log(`Auto-triggering analysis for ${workoutsNeedingAnalysis.length} workouts without analysis`);
      
      // Trigger analysis for each workout (fire and forget)
      for (const workout of workoutsNeedingAnalysis) {
        try {
          await supabase.functions.invoke('analyze-workout', {
            body: { workout_id: workout.id }
          });
          console.log(`✅ Analysis triggered for ${workout.type} on ${workout.date}`);
        } catch (err) {
          console.warn(`❌ Failed to trigger analysis for ${workout.id}:`, err);
        }
      }
      
      // Wait a moment for analysis to complete, then refetch workouts
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Refetch workouts to get the new analysis data
      const { data: updatedWorkouts } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user_id)
        .eq('workout_status', 'completed')
        .gte('date', startDateISO)
        .lte('date', endDateISO)
        .order('date', { ascending: true });
      
      completedWorkouts = updatedWorkouts || completedWorkouts;
    }

    // ADD THIS ONE LINE:
    console.log('📊 ALL bikes from DB:', completedWorkouts
      .filter(w => w.type === 'ride' || w.type === 'bike' || w.type === 'cycling')
      .map(w => ({ date: w.date, power: w.avg_power, id: w.id }))
    );
    const userBaselines = baselinesResult.data?.baselines || {};
    const planConfig = trainingPhaseResult.data?.config;
    const currentWeek = trainingPhaseResult.data?.current_week || 1;
    
    console.log('Raw plan data:', JSON.stringify(trainingPhaseResult.data, null, 2));
    console.log('Plan config:', JSON.stringify(planConfig, null, 2));
    
    console.log(`📊 Planned workouts: ${planned.length} total`);
    console.log(`📊 User baselines:`, userBaselines);
    console.log(`📊 Current week: ${currentWeek}`);
    
    // Manually join planned workouts with their completions
    const plannedWithCompletions = planned.map(plannedWorkout => {
      // First, try to find by planned_id (exact match)
      let completed = completedWorkouts.filter(workout => 
        workout.planned_id === plannedWorkout.id
      );
      
      // If no exact match found, try to find by type and date proximity (for moved workouts)
      if (completed.length === 0) {
        const plannedDate = new Date(plannedWorkout.date);
        const plannedType = plannedWorkout.type.toLowerCase();
        
        completed = completedWorkouts.filter(workout => {
          const workoutType = workout.type.toLowerCase();
          const workoutDate = new Date(workout.date);
          
          // Match type and date within 7 days (for moved workouts)
          const daysDiff = Math.abs((workoutDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
          const isMatch = workoutType === plannedType && daysDiff <= 7 && !workout.planned_id;
          
          if (isMatch) {
            console.log(`🔗 Matched moved workout: planned ${plannedType} on ${plannedWorkout.date} with completed ${workoutType} on ${workout.date}`);
          }
          
          return isMatch;
        });
      }
      
      return {
        ...plannedWorkout,
        completed: completed
      };
    });
    
    // Identify recovery weeks from plan metadata
    const recoveryWeeks = identifyRecoveryWeeksFromPlan(planConfig, currentWeek);
    
    // Get training phase from plan metadata (more accurate)
    const trainingPhase = getCurrentPhaseFromPlan(planConfig, currentWeek);

    // Categorize planned workouts based on completion
    const completed = plannedWithCompletions.filter(p => p.completed && p.completed.length > 0);
    const missed = plannedWithCompletions.filter(p => !p.completed || p.completed.length === 0);
    
    console.log(`Found ${plannedWithCompletions.length} planned workouts: ${completed.length} completed, ${missed.length} missed`);

    // Aggregate by week and discipline
    const weeklyAggregates = aggregateByWeekWithAttachments(plannedWithCompletions, weeks_back, userBaselines, completedWorkouts);

    // Calculate trend metrics (excluding recovery weeks)
    const trends = extractTrends(weeklyAggregates, recoveryWeeks);

    // Generate GPT-4 analysis
    const analysis = await generateOverallAnalysis(
      weeklyAggregates, 
      trends, 
      trainingPhase, 
      completed, 
      missed,
      userBaselines,
      recoveryWeeks
    );

    return new Response(JSON.stringify(analysis), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Generate overall context error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

/**
 * Identify recovery/deload weeks from plan metadata
 */
function identifyRecoveryWeeksFromPlan(planConfig: any, currentWeek: number): Set<number> {
  const recoveryWeeks = new Set<number>();
  
  console.log('Plan config received:', JSON.stringify(planConfig, null, 2));
  
  if (!planConfig?.weekly_summaries) {
    console.log('No weekly summaries found in plan config');
    return recoveryWeeks;
  }
  
  // Check each week's metadata
  Object.entries(planConfig.weekly_summaries).forEach(([weekNum, summary]: [string, any]) => {
    const weekIndex = parseInt(weekNum) - 1; // Convert to 0-based index
    
    // Only analyze weeks we have data for
    if (weekIndex >= currentWeek - 4 && weekIndex < currentWeek) {
      // Check for recovery indicators in focus/notes
      const focusLower = (summary.focus || '').toLowerCase();
      const notesLower = (summary.notes || '').toLowerCase();
      
      const isRecoveryWeek = 
        focusLower.includes('recovery') ||
        focusLower.includes('deload') ||
        focusLower.includes('adaptation') ||
        notesLower.includes('volume reduction') ||
        notesLower.includes('reduced volume') ||
        notesLower.includes('recovery week');
      
      if (isRecoveryWeek) {
        recoveryWeeks.add(weekIndex);
        console.log(`Week ${weekNum} marked as recovery from plan metadata`);
      }
    }
  });
  
  return recoveryWeeks;
}

/**
 * Get current training phase from plan
 */
function getCurrentPhaseFromPlan(planConfig: any, currentWeek: number): string {
  if (!planConfig?.weekly_summaries?.[currentWeek]) {
    return 'base'; // default fallback
  }
  
  const weekSummary = planConfig.weekly_summaries[currentWeek];
  const focus = (weekSummary.focus || '').toLowerCase();
  
  // Extract phase from focus text
  if (focus.includes('taper')) return 'taper';
  if (focus.includes('peak')) return 'peak';
  if (focus.includes('build')) return 'build';
  if (focus.includes('base')) return 'base';
  
  // Fallback to week number heuristic
  if (currentWeek <= 4) return 'base';
  if (currentWeek <= 8) return 'build';
  if (currentWeek <= 10) return 'peak';
  return 'taper';
}

/**
 * Parse strength_exercises from database (handles both string and array formats)
 */
function parseStrengthExercises(raw: any): any[] {
  try {
    if (Array.isArray(raw)) {
      return raw;
    }
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (error) {
    console.debug('Failed to parse strength_exercises:', error);
  }
  return [];
}

/**
 * Extract max working weight for primary lifts from a strength workout
 */
function extractPrimaryLiftWeights(strengthWorkout: any): Record<string, number> {
  const exercises = parseStrengthExercises(strengthWorkout.strength_exercises);
  const liftWeights: Record<string, number> = {};
  
  // Primary lift patterns
  const liftPatterns: Record<string, string[]> = {
    'bench_press': ['bench press', 'bench', 'bp'],
    'back_squat': ['back squat', 'squat', 'bs'],
    'deadlift': ['deadlift', 'dl'],
    'overhead_press': ['overhead press', 'ohp', 'press']
  };
  
  exercises.forEach((ex: any) => {
    const nameLower = ex.name.toLowerCase().trim();
    
    // Match to primary lift
    let primaryLift: string | null = null;
    for (const [lift, patterns] of Object.entries(liftPatterns)) {
      if (patterns.some(pattern => nameLower.includes(pattern))) {
        primaryLift = lift;
        break;
      }
    }
    
    if (primaryLift && ex.sets) {
      // Get max weight from completed sets
      const completedSets = ex.sets.filter((s: any) => s.completed);
      if (completedSets.length > 0) {
        const maxWeight = Math.max(...completedSets.map((s: any) => s.weight || 0));
        if (maxWeight > 0) {
          liftWeights[primaryLift] = Math.max(liftWeights[primaryLift] || 0, maxWeight);
        }
      }
    }
  });
  
  return liftWeights;
}

/**
 * Aggregate primary lift max weights for a week
 */
function aggregateStrengthLifts(strengthWorkouts: any[]): Record<string, number> {
  const allLifts: Record<string, number[]> = {};
  
  strengthWorkouts.forEach(workout => {
    const liftWeights = extractPrimaryLiftWeights(workout);
    Object.entries(liftWeights).forEach(([lift, weight]) => {
      if (!allLifts[lift]) allLifts[lift] = [];
      allLifts[lift].push(weight);
    });
  });
  
  // Return max weight per lift for the week
  const weekMaxes: Record<string, number> = {};
  Object.entries(allLifts).forEach(([lift, weights]) => {
    weekMaxes[lift] = Math.max(...weights);
  });
  
  return weekMaxes;
}

/**
 * Compare run performance to 5K pace baseline
 */
function compareRunToBaseline(trends: any, userBaselines: any): string[] {
  const insights: string[] = [];
  
  if (!trends.run_pace || trends.run_pace.length === 0 || !userBaselines.fiveK_pace) {
    return insights;
  }
  
  // Parse baseline 5K pace (format: "6:45/mi" or "6:45")
  const baselinePace = userBaselines.fiveK_pace;
  const baselineSeconds = paceToSeconds(baselinePace);
  
  if (baselineSeconds === 0) return insights;
  
  // Get recent average pace
  const recentPaces = trends.run_pace.slice(-2); // Last 2 weeks
  const avgRecentSeconds = recentPaces.reduce((sum: number, p: string) => sum + paceToSeconds(p), 0) / recentPaces.length;
  
  const percentOfBaseline = (baselineSeconds / avgRecentSeconds) * 100;
  
  if (avgRecentSeconds <= baselineSeconds) {
    // Running at or faster than 5K baseline
    const recentPace = secondsToPace(avgRecentSeconds);
    insights.push(`Run pace: Recent average ${recentPace} equals or exceeds 5K baseline (${baselinePace}). Consider updating 5K baseline.`);
  } else if (percentOfBaseline >= 95) {
    // Within 5% of baseline (getting close)
    const recentPace = secondsToPace(avgRecentSeconds);
    const pctFaster = Math.round(percentOfBaseline);
    insights.push(`Run pace: Recent average ${recentPace} at ${pctFaster}% of 5K baseline. Approaching threshold.`);
  }
  
  return insights;
}

/**
 * Compare bike power to FTP baseline
 */
function compareBikeToBaseline(trends: any, userBaselines: any): string[] {
  const insights: string[] = [];
  
  if (!trends.bike_power || trends.bike_power.length === 0 || !userBaselines.ftp) {
    return insights;
  }
  
  const baselineFTP = userBaselines.ftp;
  
  if (baselineFTP === 0) return insights;
  
  // Get recent average power
  const recentPower = trends.bike_power.slice(-2); // Last 2 weeks
  const avgRecentPower = recentPower.reduce((sum: number, p: number) => sum + p, 0) / recentPower.length;
  
  const percentOfFTP = Math.round((avgRecentPower / baselineFTP) * 100);
  
  if (avgRecentPower >= baselineFTP) {
    // Averaging at or above FTP
    insights.push(`Bike power: Recent average ${Math.round(avgRecentPower)}W equals or exceeds FTP baseline (${baselineFTP}W). Consider FTP retest.`);
  } else if (percentOfFTP >= 95) {
    // Within 5% of FTP
    insights.push(`Bike power: Recent average ${Math.round(avgRecentPower)}W at ${percentOfFTP}% of FTP. Approaching threshold.`);
  }
  
  return insights;
}

/**
 * Generate baseline insights across all disciplines
 */
function generateBaselineInsights(trends: any, userBaselines: any): string[] {
  const insights: string[] = [];
  
  // Strength baselines
  if (trends.strength_lifts && userBaselines) {
    const baselineMap: Record<string, string> = {
      'bench_press': 'bench',
      'back_squat': 'squat',
      'deadlift': 'deadlift',
      'overhead_press': 'overheadPress1RM'
    };
    
    Object.entries(trends.strength_lifts).forEach(([lift, weights]: [string, any]) => {
      if (!Array.isArray(weights) || weights.length === 0) return;
      
      const baselineKey = baselineMap[lift];
      const baseline1RM = userBaselines[baselineKey];
      
      if (baseline1RM && baseline1RM > 0) {
        const currentMax = Math.max(...weights);
        const percentOf1RM = Math.round((currentMax / baseline1RM) * 100);
        
        const liftName = lift.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        
        if (currentMax >= baseline1RM) {
          insights.push(`${liftName}: Working at ${currentMax} lb (${percentOf1RM}% of ${baseline1RM} lb baseline). Consider retesting 1RM.`);
        } else if (percentOf1RM >= 90) {
          insights.push(`${liftName}: Working at ${currentMax} lb (${percentOf1RM}% of ${baseline1RM} lb baseline). Approaching max.`);
        }
      }
    });
  }
  
  // Run baseline
  insights.push(...compareRunToBaseline(trends, userBaselines));
  
  // Bike baseline
  insights.push(...compareBikeToBaseline(trends, userBaselines));
  
  return insights;
}

/**
 * Helper: Parse pace string to seconds
 */
function paceToSeconds(pace: string | number): number {
  if (typeof pace === 'number') return pace;
  if (typeof pace === 'string') {
    // Remove "/mi" or "/km" suffix if present
    const cleanPace = pace.replace(/\/mi|\/km/g, '').trim();
    const parts = cleanPace.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
  }
  return 0;
}

/**
 * Analyze workout intensity distribution from sample data
 */
function analyzeWorkoutIntensity(workout: any, userBaselines: any, allWorkouts: any[]): any {
  const type = workout.type.toLowerCase();
  const computed = typeof workout.computed === 'string' ? JSON.parse(workout.computed) : workout.computed;
  
  console.log(`📊 [ANALYZE] ${type.toUpperCase()} workout: ${workout.date}`);
  
  if (type === 'run' || type === 'running') {
    return analyzeRunIntensity(workout, computed, userBaselines);
  }
  
  if (type === 'ride' || type === 'cycling' || type === 'bike') {
    return analyzeBikeIntensity(workout, computed, userBaselines);
  }
  
  if (type === 'swim' || type === 'swimming') {
    return analyzeSwimIntensity(workout, computed, userBaselines);
  }
  
  return { intensity: 'unknown', analysis: 'Unsupported workout type' };
}

/**
 * Analyze run intensity from sample data
 */
function analyzeRunIntensity(workout: any, computed: any, userBaselines: any): any {
  const analysis = {
    intensity: 'unknown',
    pace_distribution: null,
    hr_distribution: null,
    intervals: [],
    zones: {},
    analysis: 'No data available'
  };
  
  console.log(`🏃 [RUN] Analyzing run intensity`);
  
  // Analyze pace distribution
  if (computed?.overall?.avg_pace_s_per_mi) {
    const avgPace = computed.overall.avg_pace_s_per_mi;
    analysis.pace_distribution = {
      avg_pace_s: avgPace,
      avg_pace_formatted: secondsToPace(avgPace)
    };
    console.log(`🏃 [PACE] Average: ${secondsToPace(avgPace)} (${avgPace}s)`);
  }
  
  // Analyze heart rate distribution
  if (workout.avg_heart_rate && workout.max_heart_rate) {
    analysis.hr_distribution = {
      avg_hr: workout.avg_heart_rate,
      max_hr: workout.max_heart_rate,
      hr_reserve: userBaselines.max_hr ? 
        ((workout.avg_heart_rate - userBaselines.rest_hr) / (userBaselines.max_hr - userBaselines.rest_hr)) * 100 : null
    };
    console.log(`🏃 [HR] Avg: ${workout.avg_heart_rate}, Max: ${workout.max_heart_rate}`);
  }
  
  // Analyze intervals if available
  if (computed?.intervals && computed.intervals.length > 0) {
    analysis.intervals = computed.intervals.map(interval => ({
      type: interval.kind,
      planned_pace: interval.planned?.target_pace_s_per_mi,
      executed_pace: interval.executed?.avg_pace_s_per_mi,
      duration_s: interval.executed?.duration_s,
      distance_m: interval.executed?.distance_m
    }));
    console.log(`🏃 [INTERVALS] Found ${computed.intervals.length} intervals`);
  }
  
  // Determine overall intensity based on analysis
  if (analysis.pace_distribution && userBaselines.fiveK_pace) {
    const baselineSeconds = paceToSeconds(userBaselines.fiveK_pace);
    const pacePercent = (analysis.pace_distribution.avg_pace_s / baselineSeconds) * 100;
    
    if (pacePercent <= 110) {
      analysis.intensity = 'high';
      analysis.analysis = `High intensity (${pacePercent.toFixed(1)}% of 5K pace)`;
    } else if (pacePercent <= 130) {
      analysis.intensity = 'moderate';
      analysis.analysis = `Moderate intensity (${pacePercent.toFixed(1)}% of 5K pace)`;
    } else {
      analysis.intensity = 'low';
      analysis.analysis = `Low intensity (${pacePercent.toFixed(1)}% of 5K pace)`;
    }
  }
  
  return analysis;
}

/**
 * Analyze bike intensity from sample data
 */
function analyzeBikeIntensity(workout: any, computed: any, userBaselines: any): any {
  const analysis = {
    intensity: 'unknown',
    power_distribution: null,
    hr_distribution: null,
    intervals: [],
    zones: {},
    analysis: 'No data available'
  };
  
  console.log(`🚴 [BIKE] Analyzing bike intensity`);
  
  // Analyze power distribution
  if (workout.avg_power && workout.max_power) {
    analysis.power_distribution = {
      avg_power: workout.avg_power,
      max_power: workout.max_power,
      power_variability: workout.max_power / workout.avg_power,
      normalized_power: computed?.overall?.normalized_power || null
    };
    console.log(`🚴 [POWER] Avg: ${workout.avg_power}W, Max: ${workout.max_power}W, Variability: ${(workout.max_power / workout.avg_power).toFixed(2)}`);
  }
  
  // Analyze heart rate distribution
  if (workout.avg_heart_rate && workout.max_heart_rate) {
    analysis.hr_distribution = {
      avg_hr: workout.avg_heart_rate,
      max_hr: workout.max_heart_rate,
      hr_reserve: userBaselines.max_hr ? 
        ((workout.avg_heart_rate - userBaselines.rest_hr) / (userBaselines.max_hr - userBaselines.rest_hr)) * 100 : null
    };
    console.log(`🚴 [HR] Avg: ${workout.avg_heart_rate}, Max: ${workout.max_heart_rate}`);
  }
  
  // Analyze intervals if available
  if (computed?.intervals && computed.intervals.length > 0) {
    analysis.intervals = computed.intervals.map(interval => ({
      type: interval.kind,
      planned_power_range: interval.planned?.power_range,
      executed_power: interval.executed?.avg_power_w,
      duration_s: interval.executed?.duration_s,
      distance_m: interval.executed?.distance_m,
      adherence: interval.executed?.adherence_percentage
    }));
    console.log(`🚴 [INTERVALS] Found ${computed.intervals.length} intervals`);
    
    // Analyze power zones from intervals
    const powerZones = { endurance: 0, tempo: 0, threshold: 0, vo2max: 0 };
    computed.intervals.forEach(interval => {
      if (interval.planned?.power_range) {
        const lower = interval.planned.power_range.lower;
        const upper = interval.planned.power_range.upper;
        const avg = (lower + upper) / 2;
        
        if (avg <= 120) powerZones.endurance++;
        else if (avg <= 160) powerZones.tempo++;
        else if (avg <= 200) powerZones.threshold++;
        else powerZones.vo2max++;
      }
    });
    analysis.zones = powerZones;
  }
  
  // Determine overall intensity based on analysis
  if (analysis.power_distribution && userBaselines.ftp) {
    const ftpPercent = (analysis.power_distribution.avg_power / userBaselines.ftp) * 100;
    
    if (ftpPercent >= 90) {
      analysis.intensity = 'high';
      analysis.analysis = `High intensity (${ftpPercent.toFixed(1)}% of FTP)`;
    } else if (ftpPercent >= 75) {
      analysis.intensity = 'moderate';
      analysis.analysis = `Moderate intensity (${ftpPercent.toFixed(1)}% of FTP)`;
    } else {
      analysis.intensity = 'low';
      analysis.analysis = `Low intensity (${ftpPercent.toFixed(1)}% of FTP)`;
    }
  } else if (analysis.power_distribution?.power_variability >= 2.0) {
    analysis.intensity = 'high';
    analysis.analysis = `High intensity (power variability ${analysis.power_distribution.power_variability.toFixed(2)})`;
  }
  
  return analysis;
}

/**
 * Analyze swim intensity from sample data
 */
function analyzeSwimIntensity(workout: any, computed: any, userBaselines: any): any {
  const analysis = {
    intensity: 'unknown',
    pace_distribution: null,
    hr_distribution: null,
    intervals: [],
    analysis: 'No data available'
  };
  
  console.log(`🏊 [SWIM] Analyzing swim intensity`);
  
  // Analyze pace distribution
  if (computed?.overall?.avg_pace_s_per_mi) {
    const avgPace = computed.overall.avg_pace_s_per_mi;
    analysis.pace_distribution = {
      avg_pace_s: avgPace,
      avg_pace_formatted: secondsToPace(avgPace)
    };
    console.log(`🏊 [PACE] Average: ${secondsToPace(avgPace)} (${avgPace}s)`);
  }
  
  // Analyze heart rate distribution
  if (workout.avg_heart_rate && workout.max_heart_rate) {
    analysis.hr_distribution = {
      avg_hr: workout.avg_heart_rate,
      max_hr: workout.max_heart_rate
    };
    console.log(`🏊 [HR] Avg: ${workout.avg_heart_rate}, Max: ${workout.max_heart_rate}`);
  }
  
  return analysis;
}

/**
 * Aggregate planned workouts with their completions by week and discipline
 */
function aggregateByWeekWithAttachments(plannedWithCompletions: any[], weeksBack: number, userBaselines: any, allCompletedWorkouts: any[]) {
  // allCompletedWorkouts is now passed in from the database query
  // This includes ALL workouts, not just ones matching planned workouts
  const weeklyData: any[] = [];
  
  // Generate week ranges
  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - (i * 7));
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    
    const weekStartISO = weekStart.toISOString().split('T')[0];
    const weekEndISO = weekEnd.toISOString().split('T')[0];
    
    // Filter planned workouts for this week
    const weekPlanned = plannedWithCompletions.filter(p => {
      const plannedDate = new Date(p.date);
      return plannedDate >= weekStart && plannedDate <= weekEnd;
    });
    
    // Separate completed vs missed based on attachment
    const completed = weekPlanned.filter(p => p.completed && p.completed.length > 0);
    const missed = weekPlanned.filter(p => !p.completed || p.completed.length === 0);
    
    // Get ALL workouts in this week's date range (including orphaned workouts)
    const completedWorkoutsThisWeek = allCompletedWorkouts.filter(w => {
      const workoutDate = new Date(w.date);
      return workoutDate >= weekStart && workoutDate <= weekEnd;
    });
    
    // Group completed workouts by discipline AND analyze intensity
    const runs = completedWorkoutsThisWeek.filter(w => w.type === 'run' || w.type === 'running');
    const runAnalyses = runs.map(r => analyzeWorkoutIntensity(r, userBaselines, allCompletedWorkouts));
    const hardRuns = runs.filter((r, i) => runAnalyses[i]?.intensity === 'high');
    const easyRuns = runs.filter((r, i) => runAnalyses[i]?.intensity === 'low');

    const bikes = completedWorkoutsThisWeek.filter(w => w.type === 'ride' || w.type === 'cycling' || w.type === 'bike');
    console.log(`🚴 Found ${bikes.length} bike workouts:`, bikes.map(b => ({ type: b.type, power: b.avg_power, id: b.id })));
    const bikeAnalyses = bikes.map(b => analyzeWorkoutIntensity(b, userBaselines, allCompletedWorkouts));
    const hardBikes = bikes.filter((b, i) => bikeAnalyses[i]?.intensity === 'high');
    const easyBikes = bikes.filter((b, i) => bikeAnalyses[i]?.intensity === 'low');

    const swims = completedWorkoutsThisWeek.filter(w => w.type === 'swim' || w.type === 'swimming');
    const strength = completedWorkoutsThisWeek.filter(w => w.type === 'strength');
    const mobility = completedWorkoutsThisWeek.filter(w => w.type === 'mobility');
    
    // Group planned by discipline for adherence analysis
    const plannedRuns = weekPlanned.filter(p => p.type === 'run' || p.type === 'running');
    const plannedBikes = weekPlanned.filter(p => p.type === 'ride' || p.type === 'cycling' || p.type === 'bike');
    const plannedSwims = weekPlanned.filter(p => p.type === 'swim' || p.type === 'swimming');
    const plannedStrength = weekPlanned.filter(p => p.type === 'strength');
    const plannedMobility = weekPlanned.filter(p => p.type === 'mobility');
    
    // Calculate averages and totals for HARD sessions only (key workouts)
    const weekData = {
      week_label: `Week ${weeksBack - i} (${weekStartISO} to ${weekEndISO})`,
      runs: {
        count: runs.length,
        hard_count: hardRuns.length,
        easy_count: easyRuns.length,
        avg_pace: runs.length > 0 ? calculateAveragePaceFromSamples(runs) : null,
        hard_avg_pace: hardRuns.length > 0 ? calculateAveragePaceFromComputed(hardRuns) : null,
        best_pace: runs.length > 0 ? calculateBestPaceFromComputed(runs) : null,
        avg_speed: runs.length > 0 ? calculateAverageSpeed(runs) : null,
        avg_heart_rate: runs.length > 0 ? calculateAverageHeartRate(runs) : null,
        total_distance: runs.reduce((sum, r) => sum + (r.distance || 0), 0)
      },
      bikes: {
        count: bikes.length,
        hard_count: hardBikes.length,
        easy_count: easyBikes.length,
        avg_power: bikes.length > 0 ? calculateAveragePowerFromSamples(bikes) : null,
        hard_avg_power: hardBikes.length > 0 ? calculateAveragePower(hardBikes) : null,
        best_power: bikes.length > 0 ? calculateBestPower(bikes) : null,
        avg_speed: bikes.length > 0 ? calculateAverageSpeed(bikes) : null,
        avg_heart_rate: bikes.length > 0 ? calculateAverageHeartRate(bikes) : null,
        total_duration: bikes.reduce((sum, b) => sum + (b.duration || 0), 0)
      },
      swims: {
        count: swims.length,
        avg_pace: swims.length > 0 ? calculateAverageSwimPaceFromComputed(swims) : null,
        avg_speed: swims.length > 0 ? calculateAverageSpeed(swims) : null,
        avg_heart_rate: swims.length > 0 ? calculateAverageHeartRate(swims) : null,
        total_distance: swims.reduce((sum, s) => sum + (s.distance || 0), 0)
      },
      strength: {
        count: strength.length,
        avg_duration: strength.length > 0 ? calculateAverageDuration(strength) : null,
        avg_heart_rate: strength.length > 0 ? calculateAverageHeartRate(strength) : null,
        total_calories: strength.reduce((sum, s) => sum + (s.calories || 0), 0),
        total_exercises: strength.reduce((sum, s) => {
          const exercises = parseStrengthExercises(s.strength_exercises);
          return sum + exercises.length;
        }, 0),
        total_sets: strength.reduce((sum, s) => {
          const exercises = parseStrengthExercises(s.strength_exercises);
          return sum + exercises.reduce((exerciseSum: number, ex: any) => exerciseSum + (ex.sets?.length || 0), 0);
        }, 0),
        lifts: aggregateStrengthLifts(strength)
      },
      mobility: {
        count: mobility.length,
        avg_duration: mobility.length > 0 ? calculateAverageDuration(mobility) : null,
        avg_heart_rate: mobility.length > 0 ? calculateAverageHeartRate(mobility) : null,
        total_calories: mobility.reduce((sum, m) => sum + (m.calories || 0), 0)
      },
      planned_count: weekPlanned.length,
      completed_count: completed.length,
      missed_count: missed.length,
      completion_rate: weekPlanned.length > 0 ? Math.round((completed.length / weekPlanned.length) * 100) : 0,
      // Detailed breakdown for adherence analysis
      planned_by_type: {
        runs: plannedRuns.length,
        bikes: plannedBikes.length,
        swims: plannedSwims.length,
        strength: plannedStrength.length,
        mobility: plannedMobility.length
      },
      completed_by_type: {
        runs: runs.length,
        bikes: bikes.length,
        swims: swims.length,
        strength: strength.length,
        mobility: mobility.length
      },
      missed_by_type: {
        runs: plannedRuns.filter(p => !p.completed || p.completed.length === 0).length,
        bikes: plannedBikes.filter(p => !p.completed || p.completed.length === 0).length,
        swims: plannedSwims.filter(p => !p.completed || p.completed.length === 0).length,
        strength: plannedStrength.filter(p => !p.completed || p.completed.length === 0).length,
        mobility: plannedMobility.filter(p => !p.completed || p.completed.length === 0).length
      }
    };
    
    console.log(`✅ Week ${weeksBack - i}: runs=${runs.length} (${hardRuns.length} hard), hard_pace=${weekData.runs.hard_avg_pace}, bikes=${bikes.length} (${hardBikes.length} hard), hard_power=${weekData.bikes.hard_avg_power}`);
    
    weeklyData.push(weekData);
  }
  
  return weeklyData;
}

/**
 * Extract trend arrays for key metrics
 */
function extractTrends(weeklyAggregates: any[], recoveryWeeks: Set<number> = new Set()) {
  // Build lift progression arrays, excluding recovery weeks
  const strengthLifts: Record<string, number[]> = {};
  
  weeklyAggregates.forEach((week, index) => {
    // Skip recovery weeks for performance trends
    if (recoveryWeeks.has(index)) {
      console.log(`Excluding week ${index + 1} from trends (recovery week)`);
      return;
    }
    
    if (week.strength.lifts) {
      Object.entries(week.strength.lifts).forEach(([lift, weight]) => {
        if (!strengthLifts[lift]) strengthLifts[lift] = [];
        strengthLifts[lift].push(weight as number);
      });
    }
  });
  
  const trends = {
    // Key workout progression (hard sessions only)
    run_hard_pace: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.runs.hard_avg_pace)
      .filter(p => p !== null),
    
    run_best_pace: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.runs.best_pace)
      .filter(p => p !== null),
    
    bike_hard_power: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.bikes.hard_avg_power)
      .filter(p => p !== null),
    
    bike_best_power: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.bikes.best_power)
      .filter(p => p !== null),
    
    // Keep overall averages for context
    run_pace: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.runs.avg_pace)
      .filter(p => p !== null),
    run_speed: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.runs.avg_speed)
      .filter(s => s !== null),
    run_heart_rate: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.runs.avg_heart_rate)
      .filter(hr => hr !== null),
    bike_power: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.bikes.avg_power)
      .filter(p => p !== null),
    bike_speed: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.bikes.avg_speed)
      .filter(s => s !== null),
    bike_heart_rate: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.bikes.avg_heart_rate)
      .filter(hr => hr !== null),
    swim_pace: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.swims.avg_pace)
      .filter(p => p !== null),
    swim_speed: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.swims.avg_speed)
      .filter(s => s !== null),
    swim_heart_rate: weeklyAggregates
      .filter((_, i) => !recoveryWeeks.has(i))
      .map(w => w.swims.avg_heart_rate)
      .filter(hr => hr !== null),
    completion_rate: weeklyAggregates.map(w => w.completion_rate), // Keep all weeks for adherence
    strength_lifts: strengthLifts
  };
  
  // DEBUG: Log to verify order
  console.log('📊 Run HARD pace trend (should be oldest→newest):', trends.run_hard_pace);
  console.log('📊 Bike HARD power trend (should be oldest→newest):', trends.bike_hard_power);
  console.log('📊 Weekly aggregates order:', weeklyAggregates.map((w, i) => `${i}: ${w.week_label}`));
  
  return trends;
}

/**
 * Generate discipline breakdown showing what athlete actually trains
 */
function generateDisciplineBreakdown(weeks: any[]): string {
  const totals: Record<string, { planned: number, completed: number }> = {};
  
  weeks.forEach(week => {
    ['runs', 'bikes', 'swims', 'strength'].forEach(discipline => {
      const planned = week.planned_by_type[discipline] || 0;
      const completed = week.completed_by_type[discipline] || 0;
      
      if (planned > 0) {
        if (!totals[discipline]) {
          totals[discipline] = { planned: 0, completed: 0 };
        }
        totals[discipline].planned += planned;
        totals[discipline].completed += completed;
      }
    });
  });
  
  return Object.entries(totals)
    .filter(([_, data]) => data.planned > 0)
    .map(([discipline, data]) => {
      const rate = Math.round((data.completed / data.planned) * 100);
      return `- ${discipline}: ${data.completed}/${data.planned} (${rate}%)`;
    })
    .join('\n');
}

/**
 * Generate performance summary for disciplines with data
 */
function generatePerformanceSummary(weeks: any[], trends: any): string {
  console.log('🏃 Run HARD pace array for GPT:', trends.run_hard_pace);
  console.log('🚴 Bike HARD power array for GPT:', trends.bike_hard_power);
  
  const lines: string[] = [];
  
  // Run metrics - prioritize hard workout progression
  if (trends.run_hard_pace && trends.run_hard_pace.length > 1) {
    lines.push(`Run intervals: ${trends.run_hard_pace[0]} → ${trends.run_hard_pace[trends.run_hard_pace.length - 1]} (hard sessions)`);
  }
  if (trends.run_best_pace && trends.run_best_pace.length > 1) {
    lines.push(`Run best effort: ${trends.run_best_pace[0]} → ${trends.run_best_pace[trends.run_best_pace.length - 1]}`);
  }
  if (trends.run_heart_rate && trends.run_heart_rate.length > 1) {
    lines.push(`Run HR: ${trends.run_heart_rate[0]} → ${trends.run_heart_rate[trends.run_heart_rate.length - 1]} bpm`);
  }
  
  // Bike metrics - prioritize hard workout progression
  if (trends.bike_hard_power && trends.bike_hard_power.length > 1) {
    lines.push(`Bike intervals: ${trends.bike_hard_power[0]}W → ${trends.bike_hard_power[trends.bike_hard_power.length - 1]}W (hard sessions)`);
  }
  if (trends.bike_best_power && trends.bike_best_power.length > 1) {
    lines.push(`Bike best effort: ${trends.bike_best_power[0]}W → ${trends.bike_best_power[trends.bike_best_power.length - 1]}W`);
  }
  if (trends.bike_heart_rate && trends.bike_heart_rate.length > 1) {
    lines.push(`Bike HR: ${trends.bike_heart_rate[0]} → ${trends.bike_heart_rate[trends.bike_heart_rate.length - 1]} bpm`);
  }
  
  // Swim metrics
  if (trends.swim_pace && trends.swim_pace.length > 1) {
    lines.push(`Swim pace: ${trends.swim_pace[0]} → ${trends.swim_pace[trends.swim_pace.length - 1]} per 100yd`);
  }
  
  // Strength lift progression
  if (trends.strength_lifts) {
    Object.entries(trends.strength_lifts).forEach(([lift, weights]: [string, any]) => {
      if (Array.isArray(weights) && weights.length > 0) {
        const first = weights[0];
        const last = weights[weights.length - 1];
        
        if (first > 0 && last > 0) {
          const liftName = lift
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          
          if (weights.length > 1) {
            lines.push(`${liftName}: ${first} lb → ${last} lb`);
          } else {
            lines.push(`${liftName}: ${first} lb`);
          }
        }
      }
    });
  }
  
  return lines.length > 0 ? lines.join('\n') : 'No performance data available';
}

/**
 * Format missed sessions by discipline
 */
function formatMissedByDiscipline(missed: any[]): string {
  const missedByType: Record<string, number> = {};
  missed.forEach(m => {
    missedByType[m.type] = (missedByType[m.type] || 0) + 1;
  });
  
  return Object.entries(missedByType)
    .filter(([discipline, count]) => discipline !== 'mobility' && count > 0)
    .map(([discipline, count]) => `${count} ${discipline}`)
    .join(', ') || 'none';
}

/**
 * Generate overall analysis using GPT-4
 */
async function generateOverallAnalysis(
  weeklyAggregates: any[], 
  trends: any, 
  trainingPhase: string, 
  completed: any[], 
  missed: any[],
  userBaselines: any,
  recoveryWeeks: Set<number>
) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    // Calculate overall completion rate
    const totalPlanned = weeklyAggregates.reduce((sum, week) => sum + week.planned_count, 0);
    const totalCompleted = weeklyAggregates.reduce((sum, week) => sum + week.completed_count, 0);
    const overallCompletionRate = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

    // Get most recent week data
    const mostRecentWeek = weeklyAggregates[weeklyAggregates.length - 1];
    const recentWeekMissed = missed.filter(m => {
      const missedDate = new Date(m.date);
      const weekStart = new Date(mostRecentWeek.week_label.split('(')[1].split(' to ')[0]);
      const weekEnd = new Date(mostRecentWeek.week_label.split(' to ')[1].split(')')[0]);
      return missedDate >= weekStart && missedDate <= weekEnd;
    });

    // Generate baseline insights
    const baselineInsights = generateBaselineInsights(trends, userBaselines);

    const prompt = `Analyze ${weeklyAggregates.length} weeks of training.

PLAN CONTEXT:
Current phase: ${trainingPhase}
${recoveryWeeks.size > 0 ? `Recovery weeks: ${Array.from(recoveryWeeks).map(i => i + 1).join(', ')}` : ''}

ADHERENCE SUMMARY:
Overall: ${totalCompleted}/${totalPlanned} sessions completed (${overallCompletionRate}%)

Discipline breakdown:
${generateDisciplineBreakdown(weeklyAggregates)}

Most recent week: ${mostRecentWeek.completed_count}/${mostRecentWeek.planned_count} completed
Missed in recent week: ${formatMissedByDiscipline(recentWeekMissed)}

PERFORMANCE DATA (chronological order, week 1 = OLDEST, week ${weeklyAggregates.length} = NEWEST):
${generatePerformanceSummary(weeklyAggregates, trends)}

${baselineInsights.length > 0 ? `\nSTRENGTH BASELINE ALERTS:\n${baselineInsights.join('\n')}` : ''}

IMPORTANT: Performance trends exclude recovery/deload weeks. Compare loading weeks only.
Week ${weeklyAggregates.length} ${recoveryWeeks.has(weeklyAggregates.length - 1) ? 'was a planned recovery week with intentionally reduced loads' : 'was a loading week'}.

Generate analysis with these DISTINCT sections. Only report on disciplines the athlete actually trains:

1. Performance Trends (4-week progression):
   - How metrics CHANGED from week 1 to week 4
   - Report ONLY on disciplines with data (run pace, bike power, swim pace, strength lifts, etc.)
   - For strength: mention lift progression if meaningful change occurred
   - Focus on direction of change, not final numbers
   - If baseline alerts exist, acknowledge approaching/exceeding 1RM
   - DO NOT mention current week specifics
   - 2-3 sentences maximum

   Example: "Run pace improved 16 seconds over 4 weeks. Bike power increased 14W. Bench Press: 110 lb → 125 lb (+15 lb)."

2. Plan Adherence (overall pattern):
   - Overall completion rate for all ${weeklyAggregates.length} weeks
   - List EACH discipline explicitly with its completion rate
   - DO NOT say "all other disciplines" - name them: run, bike, swim, strength
   - Identify patterns: "X discipline consistently skipped" or "All disciplines completed consistently"
   - DO NOT mention specific week numbers
   - 2-3 sentences maximum

   Example: "97% overall completion (41/42). Runs: 90% (9/10). Bikes: 100% (8/8). Swims: 100% (10/10). Strength: 100% (14/14)."

3. This Week (most recent week only):
   - Session count for THIS week: X of Y completed
   - Specifically which sessions were missed (by discipline)
   - DO NOT repeat pace/power/strength numbers from Performance Trends
   - 2 sentences maximum

   Example: "9 of 10 sessions completed. Missed: 1 run session."

CRITICAL RULES:
- Each section serves different purpose - NO overlap
- Performance Trends = progression over time
- Plan Adherence = completion patterns
- This Week = what happened this week
- Only report on disciplines with actual data
- Exclude mobility from analysis
- Use athlete's actual disciplines, don't assume triathlon
- Treat strength lifts like any other performance metric

Return ONLY valid JSON:
{
  "performance_trends": "your analysis",
  "plan_adherence": "your analysis",
  "weekly_summary": "your analysis"
}

No markdown formatting. Direct JSON only.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Generate overall training analysis. Factual. No emojis. No enthusiasm. Be concise. Direct language only. Use specific numbers.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // Parse JSON response
    const analysis = JSON.parse(content);

    // Validate structure
    if (!analysis.performance_trends || !analysis.plan_adherence || !analysis.weekly_summary) {
      throw new Error('Invalid GPT-4 response structure');
    }

    return analysis;

  } catch (error) {
    console.error('GPT-4 error:', error);
    throw error;
  }
}

/**
 * Helper functions for calculating averages from GRANULAR SAMPLE DATA
 */
function calculateAveragePaceFromSamples(runs: any[]): string | null {
  const paces = runs
    .map(r => {
      // FIRST: Try to get pace from sensor data samples
      const sensorData = r.sensor_data?.samples || [];
      if (sensorData.length > 0) {
        const paceSamples = sensorData
          .map(s => {
            if (s.speedMetersPerSecond && s.speedMetersPerSecond > 0) {
              return (1000 / s.speedMetersPerSecond) * 60; // Convert to seconds per mile
            }
            return null;
          })
          .filter(p => p !== null);
        
        if (paceSamples.length > 0) {
          const avgPace = paceSamples.reduce((sum, p) => sum + p, 0) / paceSamples.length;
          return avgPace;
        }
      }
      
      // FALLBACK: Use computed data
      const computed = typeof r.computed === 'string' ? JSON.parse(r.computed) : r.computed;
      if (computed?.overall?.avg_pace_s_per_mi) {
        return computed.overall.avg_pace_s_per_mi;
      }
      
      // FINAL FALLBACK: Calculate from distance/duration with correct units
      const distanceM = computed?.overall?.distance_m || (r.distance * 1000) || 0; // distance column is in KM!
      const durationS = r.moving_time || (r.duration * 60) || 0; // duration column is in MINUTES!
      
      if (distanceM > 0 && durationS > 0) {
        const miles = distanceM / 1609.34;
        if (miles > 0.05) {
          const paceSecondsPerMile = durationS / miles;
          return paceSecondsPerMile;
        }
      }
      return null;
    })
    .filter(p => p !== null);
  
  if (paces.length === 0) return null;
  
  const avgPaceSeconds = paces.reduce((sum, p) => sum + p, 0) / paces.length;
  return secondsToPace(avgPaceSeconds);
}

function calculateAveragePowerFromSamples(bikes: any[]): number | null {
  const powers = bikes
    .map(b => {
      // FIRST: Try to get power from sensor data samples
      const sensorData = b.sensor_data?.samples || [];
      if (sensorData.length > 0) {
        const powerSamples = sensorData
          .map(s => s.power || s.powerInWatts)
          .filter(p => p && p > 0);
        
        if (powerSamples.length > 0) {
          const avgPower = powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length;
          return avgPower;
        }
      }
      
      // FALLBACK: Use average power from workout record
      return b.avg_power;
    })
    .filter(p => p && p > 0);
  
  if (powers.length === 0) return null;
  
  return Math.round(powers.reduce((sum, p) => sum + p, 0) / powers.length);
}

function calculateAverageSpeed(workouts: any[]): number | null {
  const speeds = workouts
    .map(w => w.avg_speed)
    .filter(s => s && s > 0);
  
  if (speeds.length === 0) return null;
  
  return Math.round((speeds.reduce((sum, s) => sum + s, 0) / speeds.length) * 100) / 100;
}

function calculateAverageHeartRate(workouts: any[]): number | null {
  const heartRates = workouts
    .map(w => w.avg_heart_rate)
    .filter(hr => hr && hr > 0);
  
  if (heartRates.length === 0) return null;
  
  return Math.round(heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length);
}

function calculateAverageDuration(workouts: any[]): number | null {
  const durations = workouts
    .map(w => w.duration)
    .filter(d => d && d > 0);
  
  if (durations.length === 0) return null;
  
  return Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
}

function calculateAveragePower(bikes: any[]): number | null {
  const powers = bikes
    .map(b => b.avg_power)
    .filter(p => p && p > 0);
  
  if (powers.length === 0) return null;
  
  return Math.round(powers.reduce((sum, p) => sum + p, 0) / powers.length);
}

/**
 * Calculate best (fastest) pace from runs
 */
function calculateBestPaceFromComputed(runs: any[]): string | null {
  const paces = runs
    .map(r => {
      const computed = typeof r.computed === 'string' ? JSON.parse(r.computed) : r.computed;
      return computed?.overall?.avg_pace_s_per_mi || null;
    })
    .filter(p => p !== null);
  
  if (paces.length === 0) return null;
  
  const bestPaceSeconds = Math.min(...paces); // Fastest = lowest seconds
  return secondsToPace(bestPaceSeconds);
}

/**
 * Calculate best (highest) power from bikes
 */
function calculateBestPower(bikes: any[]): number | null {
  const powers = bikes
    .map(b => b.avg_power)
    .filter(p => p && p > 0);
  
  if (powers.length === 0) return null;
  
  return Math.max(...powers); // Best = highest power
}

function calculateAverageSwimPaceFromComputed(swims: any[]): string | null {
  const paces = swims
    .map(s => {
      const computed = typeof s.computed === 'string' ? JSON.parse(s.computed) : s.computed;
      
      if (computed?.overall?.avg_pace_s_per_mi) {
        const pacePerMile = computed.overall.avg_pace_s_per_mi;
        const pacePer100Yards = pacePerMile / 1760 * 100;
        return pacePer100Yards;
      }
      
      // FIXED FALLBACK: Use correct units
      const distanceM = computed?.overall?.distance_m || (s.distance * 1000) || 0; // distance column is in KM!
      const durationS = s.moving_time || (s.duration * 60) || 0; // duration column is in MINUTES!
      
      if (distanceM > 0 && durationS > 0) {
        const yards = distanceM / 0.9144;
        if (yards > 50) {
          const paceSecondsPer100Yards = (durationS / yards) * 100;
          return paceSecondsPer100Yards;
        }
      }
      return null;
    })
    .filter(p => p !== null);
  
  if (paces.length === 0) return null;
  
  const avgPaceSeconds = paces.reduce((sum, p) => sum + p, 0) / paces.length;
  return secondsToPace(avgPaceSeconds);
}

function secondsToPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}