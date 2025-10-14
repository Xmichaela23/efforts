/**
 * GENERATE-OVERALL-CONTEXT EDGE FUNCTION
 * 
 * Purpose: Generate AI-powered overall training analysis for the Context view
 * 
 * What it does:
 * - Receives user_id and weeks_back from frontend Context tab
 * - Queries last N weeks of completed workouts and planned workouts
 * - Aggregates data by week and discipline (runs, bikes, swims, strength)
 * - Calculates performance trends and plan adherence metrics
 * - Calls GPT-4 to generate three-section analysis:
 *   1. Performance Trends (pace/power progression over time)
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
 * - training_plans table: current training phase context
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

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (weeks_back * 7));

    const startDateISO = startDate.toISOString().split('T')[0];
    const endDateISO = endDate.toISOString().split('T')[0];

    console.log(`Generating overall context for user ${user_id}, ${weeks_back} weeks (${startDateISO} to ${endDateISO})`);

    // Step 2: Query database directly in parallel
    const [workoutsResult, plannedResult, trainingPhaseResult] = await Promise.all([
      supabase
        .from('workouts')
        .select('*, computed')
        .eq('user_id', user_id)
        .eq('workout_status', 'completed')
        .gte('date', startDateISO)
        .lte('date', endDateISO)
        .order('date', { ascending: true }),
      
      supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', user_id)
        .gte('date', startDateISO)
        .lte('date', endDateISO)
        .order('date', { ascending: true }),
      
      supabase
        .from('plans')
        .select('current_week, status')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .single()
    ]);

    if (workoutsResult.error) {
      console.error('Error fetching workouts:', workoutsResult.error);
      throw new Error(`Failed to fetch workouts: ${workoutsResult.error.message}`);
    }

    if (plannedResult.error) {
      console.error('Error fetching planned workouts:', plannedResult.error);
      throw new Error(`Failed to fetch planned workouts: ${plannedResult.error.message}`);
    }

    const workouts = workoutsResult.data || [];
    const planned = plannedResult.data || [];
    
    // Determine training phase from current week or default to 'base'
    let trainingPhase = 'base';
    if (trainingPhaseResult.data?.current_week) {
      const currentWeek = trainingPhaseResult.data.current_week;
      if (currentWeek <= 4) {
        trainingPhase = 'base';
      } else if (currentWeek <= 8) {
        trainingPhase = 'build';
      } else if (currentWeek <= 10) {
        trainingPhase = 'peak';
      } else {
        trainingPhase = 'taper';
      }
    }

    console.log(`Found ${workouts.length} completed workouts and ${planned.length} planned workouts`);

    // Step 3: Pre-processing - Aggregate by week and discipline
    const weeklyAggregates = aggregateByWeek(workouts, planned, weeks_back);

    // Step 4: Calculate trend metrics
    const trends = extractTrends(weeklyAggregates);

    // Step 5: Generate GPT-4 analysis
    const analysis = await generateOverallAnalysis(weeklyAggregates, trends, trainingPhase);

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
 * Aggregate workouts and planned sessions by week and discipline
 */
function aggregateByWeek(workouts: any[], planned: any[], weeksBack: number) {
  const weeklyData: any[] = [];
  
  // Generate week ranges
  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - (i * 7));
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    
    const weekStartISO = weekStart.toISOString().split('T')[0];
    const weekEndISO = weekEnd.toISOString().split('T')[0];
    
    // Filter workouts for this week
    const weekWorkouts = workouts.filter(w => {
      const workoutDate = new Date(w.date);
      return workoutDate >= weekStart && workoutDate <= weekEnd;
    });
    
    // Filter planned for this week
    const weekPlanned = planned.filter(p => {
      const plannedDate = new Date(p.date);
      return plannedDate >= weekStart && plannedDate <= weekEnd;
    });
    
    // Group by discipline
    const runs = weekWorkouts.filter(w => w.type === 'run' || w.type === 'running');
    const bikes = weekWorkouts.filter(w => w.type === 'ride' || w.type === 'cycling' || w.type === 'bike');
    const swims = weekWorkouts.filter(w => w.type === 'swim' || w.type === 'swimming');
    const strength = weekWorkouts.filter(w => w.type === 'strength');
    
    // Calculate averages and totals
    const weekData = {
      week_label: `Week ${weeksBack - i} (${weekStartISO} to ${weekEndISO})`,
      runs: {
        count: runs.length,
        avg_pace: runs.length > 0 ? calculateAveragePaceFromComputed(runs) : null,
        avg_speed: runs.length > 0 ? calculateAverageSpeed(runs) : null,
        avg_heart_rate: runs.length > 0 ? calculateAverageHeartRate(runs) : null,
        total_distance: runs.reduce((sum, r) => sum + (r.distance || 0), 0)
      },
      bikes: {
        count: bikes.length,
        avg_power: bikes.length > 0 ? calculateAveragePower(bikes) : null,
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
        count: strength.length
      },
      planned_count: weekPlanned.length,
      completed_count: weekWorkouts.length,
      completion_rate: weekPlanned.length > 0 ? Math.round((weekWorkouts.length / weekPlanned.length) * 100) : 0
    };
    
    weeklyData.push(weekData);
  }
  
  return weeklyData;
}

/**
 * Extract trend arrays for key metrics
 */
function extractTrends(weeklyAggregates: any[]) {
  return {
    run_pace: weeklyAggregates.map(w => w.runs.avg_pace).filter(p => p !== null),
    run_speed: weeklyAggregates.map(w => w.runs.avg_speed).filter(s => s !== null),
    run_heart_rate: weeklyAggregates.map(w => w.runs.avg_heart_rate).filter(hr => hr !== null),
    bike_power: weeklyAggregates.map(w => w.bikes.avg_power).filter(p => p !== null),
    bike_speed: weeklyAggregates.map(w => w.bikes.avg_speed).filter(s => s !== null),
    bike_heart_rate: weeklyAggregates.map(w => w.bikes.avg_heart_rate).filter(hr => hr !== null),
    swim_pace: weeklyAggregates.map(w => w.swims.avg_pace).filter(p => p !== null),
    swim_speed: weeklyAggregates.map(w => w.swims.avg_speed).filter(s => s !== null),
    swim_heart_rate: weeklyAggregates.map(w => w.swims.avg_heart_rate).filter(hr => hr !== null),
    completion_rate: weeklyAggregates.map(w => w.completion_rate)
  };
}

/**
 * Generate overall analysis using GPT-4
 */
async function generateOverallAnalysis(weeklyAggregates: any[], trends: any, trainingPhase: string) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    // Build compact prompt
    const weeklyDataText = weeklyAggregates.map(week => {
      const runs = week.runs.avg_pace ? `Runs: ${week.runs.count} completed, avg pace ${week.runs.avg_pace}, total ${week.runs.total_distance.toFixed(1)} miles` : `Runs: ${week.runs.count} completed`;
      const bikes = week.bikes.avg_power ? `Bikes: ${week.bikes.count} completed, avg power ${week.bikes.avg_power}W, total ${(week.bikes.total_duration / 60).toFixed(1)} hours` : `Bikes: ${week.bikes.count} completed`;
      const swims = week.swims.avg_pace ? `Swims: ${week.swims.count} completed, avg pace ${week.swims.avg_pace}, total ${week.swims.total_distance} yd` : `Swims: ${week.swims.count} completed`;
      const strength = `Strength: ${week.strength.count} completed`;
      const completion = `Planned: ${week.planned_count} sessions, Completed: ${week.completed_count} (${week.completion_rate}%)`;
      
      return `${week.week_label}: ${runs}. ${bikes}. ${swims}. ${strength}. ${completion}`;
    }).join('\n\n');

    const trendsText = [
      trends.run_pace.length > 0 ? `Run pace: ${trends.run_pace.join(' → ')}` : null,
      trends.bike_power.length > 0 ? `Bike power: ${trends.bike_power.join('W → ')}W` : null,
      trends.swim_pace.length > 0 ? `Swim pace: ${trends.swim_pace.join(' → ')}` : null,
      `Completion rate: ${trends.completion_rate.join('% → ')}%`
    ].filter(Boolean).join('\n');

    const prompt = `Analyze ${weeklyAggregates.length} weeks of training data.

Weekly Aggregates:
${weeklyDataText}

Key Metric Trends:
${trendsText}

Current training phase: ${trainingPhase}

Generate analysis with these three sections:
1. Performance Trends: How key metrics changed. Use specific numbers. 2-3 sentences.
2. Plan Adherence: Overall completion rate and consistency. 2-3 sentences.
3. This Week Summary: Most recent week performance vs planned. 2-3 sentences.

Return ONLY valid JSON in this exact format:
{
  "performance_trends": "your analysis here",
  "plan_adherence": "your analysis here",
  "weekly_summary": "your analysis here"
}

Be factual. Use specific numbers. No JSON markdown formatting.`;

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
    throw error; // Don't return fallback, re-throw
  }
}

/**
 * Helper functions for calculating averages
 */
function calculateAveragePaceFromComputed(runs: any[]): string {
  const paces = runs
    .map(r => {
      // Use server-computed pace first
      const computed = typeof r.computed === 'string' ? JSON.parse(r.computed) : r.computed;
      if (computed?.overall?.avg_pace_s_per_mi) {
        return computed.overall.avg_pace_s_per_mi;
      }
      
      // Fallback to distance/duration calculation
      const distanceM = r.distance || r.distance_meters || 0;
      const durationS = r.duration || r.duration_s || r.duration_s_moving || 0;
      
      if (distanceM > 0 && durationS > 0) {
        const miles = distanceM / 1609.34;
        if (miles > 0.05) { // minimum distance threshold
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

function calculateAverageSpeed(workouts: any[]): number {
  const speeds = workouts
    .map(w => w.avg_speed)
    .filter(s => s && s > 0);
  
  if (speeds.length === 0) return null;
  
  return Math.round((speeds.reduce((sum, s) => sum + s, 0) / speeds.length) * 100) / 100;
}

function calculateAverageHeartRate(workouts: any[]): number {
  const heartRates = workouts
    .map(w => w.avg_heart_rate)
    .filter(hr => hr && hr > 0);
  
  if (heartRates.length === 0) return null;
  
  return Math.round(heartRates.reduce((sum, hr) => sum + hr, 0) / heartRates.length);
}

function calculateAveragePower(bikes: any[]): number {
  const powers = bikes
    .map(b => b.avg_power)
    .filter(p => p && p > 0);
  
  if (powers.length === 0) return null;
  
  return Math.round(powers.reduce((sum, p) => sum + p, 0) / powers.length);
}

function calculateAverageSwimPaceFromComputed(swims: any[]): string {
  const paces = swims
    .map(s => {
      // Use server-computed pace first
      const computed = typeof s.computed === 'string' ? JSON.parse(s.computed) : s.computed;
      if (computed?.overall?.avg_pace_s_per_mi) {
        // Convert pace per mile to pace per 100 yards for swims
        const pacePerMile = computed.overall.avg_pace_s_per_mi;
        const pacePer100Yards = (pacePerMile / 1760) * 100; // 1760 yards per mile
        return pacePer100Yards;
      }
      
      // Fallback to distance/duration calculation
      const distanceM = s.distance || s.distance_meters || 0;
      const durationS = s.duration || s.duration_s || s.duration_s_moving || 0;
      
      if (distanceM > 0 && durationS > 0) {
        const yards = distanceM / 0.9144; // convert meters to yards
        if (yards > 50) { // minimum distance threshold
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

function paceToSeconds(pace: string | number): number {
  if (typeof pace === 'number') return pace;
  if (typeof pace === 'string') {
    const parts = pace.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
  }
  return 0;
}

function secondsToPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
