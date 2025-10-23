/**
 * =============================================================================
 * GENERATE-WEEKLY-SUMMARY EDGE FUNCTION
 * =============================================================================
 * 
 * PURPOSE: Generate AI-powered analysis for a SINGLE training week using granular sample data
 * 
 * WHAT IT DOES:
 * - Analyzes one week of training data using raw sensor samples (not averages)
 * - Compares current week to previous week for trend analysis
 * - Generates AI insights using GPT-4 for actionable feedback
 * - Provides next week preview from training plan
 * - Calculates week grade based on execution quality and completion
 * 
 * INPUT: { user_id: string, week_start_date: string }
 * 
 * OUTPUT: {
 *   week_overview: {
 *     completion_rate: string,        // "5/7 sessions (71%)"
 *     total_tss: number,             // Total training stress score
 *     intensity_distribution: string, // "60% easy / 40% hard"
 *     disciplines: {...}             // Detailed breakdown by sport
 *   },
 *   performance_snapshot: string,    // AI-generated 2-3 sentence summary
 *   week_performance: string,         // "85%" or "Excellent"
 *   key_insights: string[],          // 3-4 actionable bullet points
 *   next_week_preview: {
 *     focus: string,                 // Training focus for next week
 *     key_workouts: string[],        // Important sessions to prioritize
 *     preparation: string            // Readiness assessment
 *   },
 *   comparison_to_last_week: {
 *     runs_pace_change: string,      // "+5s slower" or "10s faster"
 *     bikes_power_change: string,    // "+15W" or "-8W"
 *     completion_rate_change: string // "+10%" or "-5%"
 *   }
 * }
 * 
 * KEY FEATURES:
 * - Uses sensor_data.samples for accurate intensity analysis
 * - Analyzes hard vs easy workouts separately
 * - Caches results for 24 hours to reduce API calls
 * - Provides week-over-week comparison
 * - Integrates with training plan for next week preview
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
    const { user_id, week_start_date } = payload;

    if (!user_id || !week_start_date) {
      return new Response(JSON.stringify({
        error: 'user_id and week_start_date are required'
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

    // Calculate date ranges
    const weekStart = new Date(week_start_date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(prevWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);

    const weekStartISO = weekStart.toISOString().split('T')[0];
    const weekEndISO = weekEnd.toISOString().split('T')[0];
    const prevWeekStartISO = prevWeekStart.toISOString().split('T')[0];
    const prevWeekEndISO = prevWeekEnd.toISOString().split('T')[0];

    console.log(`Analyzing week ${weekStartISO} to ${weekEndISO} for user ${user_id}`);

    // Query database for both weeks
    const [currentWeekResult, previousWeekResult, plannedResult, baselinesResult, planResult] = await Promise.all([
      // Current week workouts with sensor data
      supabase
        .from('workouts')
        .select('*, sensor_data, computed')
        .eq('user_id', user_id)
        .gte('date', weekStartISO)
        .lte('date', weekEndISO),
      
      // Previous week workouts with sensor data
      supabase
        .from('workouts')
        .select('*, sensor_data, computed')
        .eq('user_id', user_id)
        .gte('date', prevWeekStartISO)
        .lte('date', prevWeekEndISO),
      
      // Planned workouts for current week
      supabase
        .from('planned_workouts')
        .select('*')
        .eq('user_id', user_id)
        .gte('date', weekStartISO)
        .lte('date', weekEndISO),
      
      // User baselines
      supabase
        .from('user_baselines')
        .select('baselines')
        .eq('user_id', user_id)
        .single(),
      
      // Active plan for next week preview
      supabase
        .from('plans')
        .select('config, current_week')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .single()
    ]);

    const currentWeekWorkouts = currentWeekResult.data || [];
    const previousWeekWorkouts = previousWeekResult.data || [];
    const plannedWorkouts = plannedResult.data || [];
    const userBaselines = baselinesResult.data?.baselines || {};
    const planData = planResult.data;

    console.log(`Found ${currentWeekWorkouts.length} current week workouts, ${previousWeekWorkouts.length} previous week workouts`);

    // Analyze current week using granular sample data
    const weekSummary = analyzeWeekWithSamples(currentWeekWorkouts, plannedWorkouts, userBaselines);
    const prevWeekSummary = analyzeWeekWithSamples(previousWeekWorkouts, [], userBaselines);

    // Calculate week-over-week changes
    const changes = calculateWeekOverWeekChanges(weekSummary, prevWeekSummary);

    // Get next week preview from plan
    const nextWeekPreview = getNextWeekPreview(planData, weekStart);

    // Generate GPT analysis
    const analysis = await generateWeeklyAnalysis(
      weekSummary,
      prevWeekSummary,
      changes,
      nextWeekPreview,
      weekStart,
      weekEnd
    );

    return new Response(JSON.stringify(analysis), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Generate weekly summary error:', error);
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
 * =============================================================================
 * ANALYZE WEEK WITH SAMPLES
 * =============================================================================
 * 
 * PURPOSE: Analyze a complete training week using granular sensor data samples
 * 
 * WHAT IT DOES:
 * - Groups workouts by discipline (runs, bikes, swims, strength)
 * - Analyzes each workout using raw sensor samples (not averages)
 * - Calculates hard vs easy workout counts and averages
 * - Determines intensity distribution across the week
 * - Returns comprehensive week summary for AI analysis
 * 
 * INPUT: 
 * - workouts: Array of completed workouts with sensor_data
 * - plannedWorkouts: Array of planned workouts for completion rate
 * - userBaselines: User's fitness baselines (FTP, 5K pace, etc.)
 * 
 * OUTPUT: Week summary object with discipline breakdowns and metrics
 */
function analyzeWeekWithSamples(workouts: any[], plannedWorkouts: any[], userBaselines: any): any {
  const summary = {
    completed: workouts.length,
    planned: plannedWorkouts.length,
    completion_rate: plannedWorkouts.length > 0 ? Math.round((workouts.length / plannedWorkouts.length) * 100) : 0,
    total_tss: workouts.reduce((sum, w) => sum + (w.tss || 0), 0),
    intensity_distribution: { easy: 0, hard: 0 },
    disciplines: {
      runs: { count: 0, hard_count: 0, avg_pace: null, hard_avg_pace: null, best_pace: null, avg_hr: null },
      bikes: { count: 0, hard_count: 0, avg_power: null, hard_avg_power: null, best_power: null, avg_hr: null },
      swims: { count: 0, hard_count: 0, avg_pace: null, hard_avg_pace: null, best_pace: null, avg_hr: null },
      strength: { count: 0, lifts: [] }
    }
  };

  // Group workouts by discipline
  const runs = workouts.filter(w => w.type === 'run' || w.type === 'running');
  const bikes = workouts.filter(w => w.type === 'ride' || w.type === 'cycling' || w.type === 'bike');
  const swims = workouts.filter(w => w.type === 'swim' || w.type === 'swimming');
  const strength = workouts.filter(w => w.type === 'strength');

  // Analyze runs using sample data
  if (runs.length > 0) {
    const runAnalysis = analyzeRunsWithSamples(runs, userBaselines);
    summary.disciplines.runs = {
      count: runs.length,
      hard_count: runAnalysis.hard_count,
      avg_pace: runAnalysis.avg_pace,
      hard_avg_pace: runAnalysis.hard_avg_pace,
      best_pace: runAnalysis.best_pace,
      avg_hr: runAnalysis.avg_hr
    };
    summary.intensity_distribution.hard += runAnalysis.hard_count;
    summary.intensity_distribution.easy += runs.length - runAnalysis.hard_count;
  }

  // Analyze bikes using sample data
  if (bikes.length > 0) {
    const bikeAnalysis = analyzeBikesWithSamples(bikes, userBaselines);
    summary.disciplines.bikes = {
      count: bikes.length,
      hard_count: bikeAnalysis.hard_count,
      avg_power: bikeAnalysis.avg_power,
      hard_avg_power: bikeAnalysis.hard_avg_power,
      best_power: bikeAnalysis.best_power,
      avg_hr: bikeAnalysis.avg_hr
    };
    summary.intensity_distribution.hard += bikeAnalysis.hard_count;
    summary.intensity_distribution.easy += bikes.length - bikeAnalysis.hard_count;
  }

  // Analyze swims using sample data
  if (swims.length > 0) {
    const swimAnalysis = analyzeSwimsWithSamples(swims, userBaselines);
    summary.disciplines.swims = {
      count: swims.length,
      hard_count: swimAnalysis.hard_count,
      avg_pace: swimAnalysis.avg_pace,
      hard_avg_pace: swimAnalysis.hard_avg_pace,
      best_pace: swimAnalysis.best_pace,
      avg_hr: swimAnalysis.avg_hr
    };
    summary.intensity_distribution.hard += swimAnalysis.hard_count;
    summary.intensity_distribution.easy += swims.length - swimAnalysis.hard_count;
  }

  // Analyze strength
  if (strength.length > 0) {
    const strengthAnalysis = analyzeStrengthWithSamples(strength, userBaselines);
    summary.disciplines.strength = {
      count: strength.length,
      lifts: strengthAnalysis.lifts
    };
  }

  return summary;
}

/**
 * =============================================================================
 * ANALYZE RUNS WITH SAMPLES
 * =============================================================================
 * 
 * PURPOSE: Analyze run workouts using granular pace and HR samples
 * 
 * WHAT IT DOES:
 * - Extracts pace samples from sensor_data.samples (speedMetersPerSecond)
 * - Extracts HR samples from sensor_data.samples (heartRate)
 * - Classifies each run as hard/easy based on pace relative to 5K pace
 * - Calculates averages for all runs vs hard runs only
 * - Returns best pace and hard workout counts
 * 
 * INPUT: 
 * - runs: Array of run workouts with sensor_data
 * - userBaselines: User's 5K pace and max HR baselines
 * 
 * OUTPUT: Object with hard_count, avg_pace, hard_avg_pace, best_pace, avg_hr
 */
function analyzeRunsWithSamples(runs: any[], userBaselines: any): any {
  let hard_count = 0;
  const allPaces: number[] = [];
  const hardPaces: number[] = [];
  const allHRs: number[] = [];

  runs.forEach(run => {
    const analysis = analyzeRunIntensityFromSamples(run, userBaselines);
    
    if (analysis.intensity === 'high') {
      hard_count++;
      if (analysis.pace_distribution?.avg_pace_s) {
        hardPaces.push(analysis.pace_distribution.avg_pace_s);
      }
    }
    
    if (analysis.pace_distribution?.avg_pace_s) {
      allPaces.push(analysis.pace_distribution.avg_pace_s);
    }
    
    if (analysis.hr_distribution?.avg_hr) {
      allHRs.push(analysis.hr_distribution.avg_hr);
    }
  });

  return {
    hard_count,
    avg_pace: allPaces.length > 0 ? secondsToPace(allPaces.reduce((sum, p) => sum + p, 0) / allPaces.length) : null,
    hard_avg_pace: hardPaces.length > 0 ? secondsToPace(hardPaces.reduce((sum, p) => sum + p, 0) / hardPaces.length) : null,
    best_pace: allPaces.length > 0 ? secondsToPace(Math.min(...allPaces)) : null,
    avg_hr: allHRs.length > 0 ? Math.round(allHRs.reduce((sum, hr) => sum + hr, 0) / allHRs.length) : null
  };
}

/**
 * =============================================================================
 * ANALYZE BIKES WITH SAMPLES
 * =============================================================================
 * 
 * PURPOSE: Analyze bike workouts using granular power and HR samples
 * 
 * WHAT IT DOES:
 * - Extracts power samples from sensor_data.samples (power/powerInWatts)
 * - Extracts HR samples from sensor_data.samples (heartRate)
 * - Classifies each bike as hard/easy based on power relative to FTP
 * - Calculates averages for all bikes vs hard bikes only
 * - Returns best power and hard workout counts
 * 
 * INPUT: 
 * - bikes: Array of bike workouts with sensor_data
 * - userBaselines: User's FTP and max HR baselines
 * 
 * OUTPUT: Object with hard_count, avg_power, hard_avg_power, best_power, avg_hr
 */
function analyzeBikesWithSamples(bikes: any[], userBaselines: any): any {
  let hard_count = 0;
  const allPowers: number[] = [];
  const hardPowers: number[] = [];
  const allHRs: number[] = [];

  bikes.forEach(bike => {
    const analysis = analyzeBikeIntensityFromSamples(bike, userBaselines);
    
    if (analysis.intensity === 'high') {
      hard_count++;
      if (analysis.power_distribution?.avg_power) {
        hardPowers.push(analysis.power_distribution.avg_power);
      }
    }
    
    if (analysis.power_distribution?.avg_power) {
      allPowers.push(analysis.power_distribution.avg_power);
    }
    
    if (analysis.hr_distribution?.avg_hr) {
      allHRs.push(analysis.hr_distribution.avg_hr);
    }
  });

  return {
    hard_count,
    avg_power: allPowers.length > 0 ? Math.round(allPowers.reduce((sum, p) => sum + p, 0) / allPowers.length) : null,
    hard_avg_power: hardPowers.length > 0 ? Math.round(hardPowers.reduce((sum, p) => sum + p, 0) / hardPowers.length) : null,
    best_power: allPowers.length > 0 ? Math.max(...allPowers) : null,
    avg_hr: allHRs.length > 0 ? Math.round(allHRs.reduce((sum, hr) => sum + hr, 0) / allHRs.length) : null
  };
}

/**
 * Analyze swims using granular sample data
 */
function analyzeSwimsWithSamples(swims: any[], userBaselines: any): any {
  let hard_count = 0;
  const allPaces: number[] = [];
  const hardPaces: number[] = [];
  const allHRs: number[] = [];

  swims.forEach(swim => {
    const analysis = analyzeSwimIntensityFromSamples(swim, userBaselines);
    
    if (analysis.intensity === 'high') {
      hard_count++;
      if (analysis.pace_distribution?.avg_pace_s) {
        hardPaces.push(analysis.pace_distribution.avg_pace_s);
      }
    }
    
    if (analysis.pace_distribution?.avg_pace_s) {
      allPaces.push(analysis.pace_distribution.avg_pace_s);
    }
    
    if (analysis.hr_distribution?.avg_hr) {
      allHRs.push(analysis.hr_distribution.avg_hr);
    }
  });

  return {
    hard_count,
    avg_pace: allPaces.length > 0 ? secondsToPace(allPaces.reduce((sum, p) => sum + p, 0) / allPaces.length) : null,
    hard_avg_pace: hardPaces.length > 0 ? secondsToPace(hardPaces.reduce((sum, p) => sum + p, 0) / hardPaces.length) : null,
    best_pace: allPaces.length > 0 ? secondsToPace(Math.min(...allPaces)) : null,
    avg_hr: allHRs.length > 0 ? Math.round(allHRs.reduce((sum, hr) => sum + hr, 0) / allHRs.length) : null
  };
}

/**
 * Analyze strength workouts
 */
function analyzeStrengthWithSamples(strength: any[], userBaselines: any): any {
  const lifts: any[] = [];
  
  strength.forEach(workout => {
    if (workout.strength_exercises && Array.isArray(workout.strength_exercises)) {
      workout.strength_exercises.forEach((exercise: any) => {
        lifts.push({
          name: exercise.name,
          weight: exercise.weight,
          reps: exercise.reps,
          sets: exercise.sets
        });
      });
    }
  });

  return { lifts };
}

/**
 * =============================================================================
 * ANALYZE RUN INTENSITY FROM SAMPLES
 * =============================================================================
 * 
 * PURPOSE: Analyze individual run workout intensity using granular sensor data
 * 
 * WHAT IT DOES:
 * - Extracts pace samples from sensor_data.samples (speedMetersPerSecond)
 * - Extracts HR samples from sensor_data.samples (heartRate)
 * - Calculates pace distribution (avg, max, min, variability)
 * - Calculates HR distribution (avg, max, drift)
 * - Classifies intensity as high/moderate/low based on pace or HR zones
 * - Falls back to computed data if no sensor samples available
 * 
 * INPUT: 
 * - workout: Single run workout with sensor_data and computed fields
 * - userBaselines: User's 5K pace and max HR baselines
 * 
 * OUTPUT: Object with intensity classification and detailed distributions
 */
function analyzeRunIntensityFromSamples(workout: any, userBaselines: any): any {
  const sensorData = workout.sensor_data?.samples || [];
  const computed = typeof workout.computed === 'string' ? JSON.parse(workout.computed) : workout.computed;
  
  if (sensorData.length === 0) {
    // Fallback to computed data if no samples
    return {
      intensity: 'unknown',
      pace_distribution: computed?.overall?.avg_pace_s_per_mi ? {
        avg_pace_s: computed.overall.avg_pace_s_per_mi,
        avg_pace_formatted: secondsToPace(computed.overall.avg_pace_s_per_mi)
      } : null,
      hr_distribution: workout.avg_heart_rate ? {
        avg_hr: workout.avg_heart_rate,
        max_hr: workout.max_heart_rate
      } : null
    };
  }

  // Extract pace samples from sensor data
  const paceSamples = sensorData
    .map(s => {
      if (s.speedMetersPerSecond && s.speedMetersPerSecond > 0) {
        return (1000 / s.speedMetersPerSecond) * 60; // Convert to seconds per mile
      }
      return null;
    })
    .filter(p => p !== null);

  // Extract HR samples
  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  // Calculate pace distribution
  const avgPace = paceSamples.length > 0 ? paceSamples.reduce((sum, p) => sum + p, 0) / paceSamples.length : null;
  const maxPace = paceSamples.length > 0 ? Math.min(...paceSamples) : null; // Fastest pace
  const minPace = paceSamples.length > 0 ? Math.max(...paceSamples) : null; // Slowest pace

  // Calculate HR distribution
  const avgHR = hrSamples.length > 0 ? hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length : null;
  const maxHR = hrSamples.length > 0 ? Math.max(...hrSamples) : null;

  // Determine intensity based on pace and HR
  let intensity = 'unknown';
  if (avgPace && userBaselines.fiveK_pace) {
    const baselineSeconds = paceToSeconds(userBaselines.fiveK_pace);
    const pacePercent = (avgPace / baselineSeconds) * 100;
    
    if (pacePercent <= 110) {
      intensity = 'high';
    } else if (pacePercent <= 130) {
      intensity = 'moderate';
    } else {
      intensity = 'low';
    }
  } else if (avgHR && userBaselines.max_hr) {
    const hrPercent = (avgHR / userBaselines.max_hr) * 100;
    if (hrPercent >= 85) {
      intensity = 'high';
    } else if (hrPercent >= 75) {
      intensity = 'moderate';
    } else {
      intensity = 'low';
    }
  }

  return {
    intensity,
    pace_distribution: avgPace ? {
      avg_pace_s: avgPace,
      avg_pace_formatted: secondsToPace(avgPace),
      max_pace_s: maxPace,
      min_pace_s: minPace,
      variability: paceSamples.length > 1 ? calculateVariability(paceSamples) : null
    } : null,
    hr_distribution: avgHR ? {
      avg_hr: Math.round(avgHR),
      max_hr: maxHR,
      drift: hrSamples.length > 10 ? calculateHRDrift(hrSamples) : null
    } : null
  };
}

/**
 * =============================================================================
 * ANALYZE BIKE INTENSITY FROM SAMPLES
 * =============================================================================
 * 
 * PURPOSE: Analyze individual bike workout intensity using granular sensor data
 * 
 * WHAT IT DOES:
 * - Extracts power samples from sensor_data.samples (power/powerInWatts)
 * - Extracts HR samples from sensor_data.samples (heartRate)
 * - Calculates power distribution (avg, max, min, variability)
 * - Calculates HR distribution (avg, max, drift)
 * - Classifies intensity as high/moderate/low based on FTP zones or HR zones
 * - Falls back to computed data if no sensor samples available
 * 
 * INPUT: 
 * - workout: Single bike workout with sensor_data and computed fields
 * - userBaselines: User's FTP and max HR baselines
 * 
 * OUTPUT: Object with intensity classification and detailed distributions
 */
function analyzeBikeIntensityFromSamples(workout: any, userBaselines: any): any {
  const sensorData = workout.sensor_data?.samples || [];
  const computed = typeof workout.computed === 'string' ? JSON.parse(workout.computed) : workout.computed;
  
  if (sensorData.length === 0) {
    // Fallback to computed data if no samples
    return {
      intensity: 'unknown',
      power_distribution: workout.avg_power ? {
        avg_power: workout.avg_power,
        max_power: workout.max_power,
        power_variability: workout.max_power && workout.avg_power ? workout.max_power / workout.avg_power : null
      } : null,
      hr_distribution: workout.avg_heart_rate ? {
        avg_hr: workout.avg_heart_rate,
        max_hr: workout.max_heart_rate
      } : null
    };
  }

  // Extract power samples from sensor data
  const powerSamples = sensorData
    .map(s => s.power || s.powerInWatts)
    .filter(p => p && p > 0);

  // Extract HR samples
  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  // Calculate power distribution
  const avgPower = powerSamples.length > 0 ? powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length : null;
  const maxPower = powerSamples.length > 0 ? Math.max(...powerSamples) : null;
  const minPower = powerSamples.length > 0 ? Math.min(...powerSamples) : null;

  // Calculate HR distribution
  const avgHR = hrSamples.length > 0 ? hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length : null;
  const maxHR = hrSamples.length > 0 ? Math.max(...hrSamples) : null;

  // Determine intensity based on power and HR
  let intensity = 'unknown';
  if (avgPower && userBaselines.ftp) {
    const ftpPercent = (avgPower / userBaselines.ftp) * 100;
    if (ftpPercent >= 90) {
      intensity = 'high';
    } else if (ftpPercent >= 75) {
      intensity = 'moderate';
    } else {
      intensity = 'low';
    }
  } else if (avgHR && userBaselines.max_hr) {
    const hrPercent = (avgHR / userBaselines.max_hr) * 100;
    if (hrPercent >= 85) {
      intensity = 'high';
    } else if (hrPercent >= 75) {
      intensity = 'moderate';
    } else {
      intensity = 'low';
    }
  }

  return {
    intensity,
    power_distribution: avgPower ? {
      avg_power: Math.round(avgPower),
      max_power: maxPower,
      min_power: minPower,
      power_variability: maxPower && avgPower ? maxPower / avgPower : null,
      normalized_power: computed?.overall?.normalized_power || null
    } : null,
    hr_distribution: avgHR ? {
      avg_hr: Math.round(avgHR),
      max_hr: maxHR,
      drift: hrSamples.length > 10 ? calculateHRDrift(hrSamples) : null
    } : null
  };
}

/**
 * Analyze swim intensity from granular sample data
 */
function analyzeSwimIntensityFromSamples(workout: any, userBaselines: any): any {
  const sensorData = workout.sensor_data?.samples || [];
  const computed = typeof workout.computed === 'string' ? JSON.parse(workout.computed) : workout.computed;
  
  if (sensorData.length === 0) {
    // Fallback to computed data if no samples
    return {
      intensity: 'unknown',
      pace_distribution: computed?.overall?.avg_pace_s_per_mi ? {
        avg_pace_s: computed.overall.avg_pace_s_per_mi,
        avg_pace_formatted: secondsToPace(computed.overall.avg_pace_s_per_mi)
      } : null,
      hr_distribution: workout.avg_heart_rate ? {
        avg_hr: workout.avg_heart_rate,
        max_hr: workout.max_heart_rate
      } : null
    };
  }

  // For swims, we might not have speed data in sensor_data
  // Use computed data as primary source
  const avgPace = computed?.overall?.avg_pace_s_per_mi;
  const avgHR = workout.avg_heart_rate;

  // Determine intensity (simplified for swims)
  let intensity = 'unknown';
  if (avgHR && userBaselines.max_hr) {
    const hrPercent = (avgHR / userBaselines.max_hr) * 100;
    if (hrPercent >= 85) {
      intensity = 'high';
    } else if (hrPercent >= 75) {
      intensity = 'moderate';
    } else {
      intensity = 'low';
    }
  }

  return {
    intensity,
    pace_distribution: avgPace ? {
      avg_pace_s: avgPace,
      avg_pace_formatted: secondsToPace(avgPace)
    } : null,
    hr_distribution: avgHR ? {
      avg_hr: avgHR,
      max_hr: workout.max_heart_rate
    } : null
  };
}

/**
 * Calculate week-over-week changes
 */
function calculateWeekOverWeekChanges(current: any, previous: any): any {
  return {
    run_pace_change: calculatePaceChange(current.disciplines.runs, previous.disciplines.runs),
    bike_power_change: calculatePowerChange(current.disciplines.bikes, previous.disciplines.bikes),
    completion_rate_change: current.completion_rate - previous.completion_rate
  };
}

function calculatePaceChange(current: any, previous: any): string {
  if (!current.avg_pace || !previous.avg_pace) return 'N/A';
  
  const currentSeconds = paceToSeconds(current.avg_pace);
  const previousSeconds = paceToSeconds(previous.avg_pace);
  const change = currentSeconds - previousSeconds;
  
  if (change > 0) {
    return `+${secondsToPace(change)} slower`;
  } else {
    return `${secondsToPace(Math.abs(change))} faster`;
  }
}

function calculatePowerChange(current: any, previous: any): string {
  if (!current.avg_power || !previous.avg_power) return 'N/A';
  
  const change = current.avg_power - previous.avg_power;
  if (change > 0) {
    return `+${change}W`;
  } else {
    return `${change}W`;
  }
}

/**
 * Get next week preview from plan data
 */
function getNextWeekPreview(planData: any, currentWeekStart: Date): any {
  if (!planData?.config?.weekly_summaries) {
    return {
      focus: 'Continue current training',
      key_workouts: ['Maintain consistency'],
      preparation: 'Stay consistent with current plan'
    };
  }

  const nextWeekStart = new Date(currentWeekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  
  // Find next week in plan
  const nextWeekNumber = planData.current_week + 1;
  const nextWeekConfig = planData.config.weekly_summaries[nextWeekNumber];
  
  if (nextWeekConfig) {
    return {
      focus: nextWeekConfig.focus || 'Build on current progress',
      key_workouts: nextWeekConfig.key_workouts || ['Maintain consistency'],
      preparation: nextWeekConfig.notes || 'Ready for next phase'
    };
  }

  return {
    focus: 'Continue current training',
    key_workouts: ['Maintain consistency'],
    preparation: 'Stay consistent with current plan'
  };
}

/**
 * Generate GPT analysis for the week
 */
async function generateWeeklyAnalysis(
  weekSummary: any,
  prevWeekSummary: any,
  changes: any,
  nextWeekPreview: any,
  weekStart: Date,
  weekEnd: Date
): Promise<any> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const prompt = `Analyze this training week:

WEEK SUMMARY:
Date: ${weekStart.toLocaleDateString()} to ${weekEnd.toLocaleDateString()}
Completion: ${weekSummary.completed}/${weekSummary.planned} sessions (${weekSummary.completion_rate}%)
Total TSS: ${weekSummary.total_tss}
Intensity: ${weekSummary.intensity_distribution.easy}% easy / ${weekSummary.intensity_distribution.hard}% hard

PERFORMANCE BY DISCIPLINE:
Runs (${weekSummary.disciplines.runs.count} completed):
- Avg pace: ${weekSummary.disciplines.runs.avg_pace || 'N/A'}
- Hard workouts: ${weekSummary.disciplines.runs.hard_count}
- Best pace: ${weekSummary.disciplines.runs.best_pace || 'N/A'}

Bikes (${weekSummary.disciplines.bikes.count} completed):
- Avg power: ${weekSummary.disciplines.bikes.avg_power || 'N/A'}W
- Hard workouts: ${weekSummary.disciplines.bikes.hard_count}
- Best power: ${weekSummary.disciplines.bikes.best_power || 'N/A'}W

Swims (${weekSummary.disciplines.swims.count} completed):
- Avg pace: ${weekSummary.disciplines.swims.avg_pace || 'N/A'}
- Hard workouts: ${weekSummary.disciplines.swims.hard_count}

Strength (${weekSummary.disciplines.strength.count} completed):
${weekSummary.disciplines.strength.lifts.length > 0 ? 
  weekSummary.disciplines.strength.lifts.map(l => `- ${l.name}: ${l.weight}lb x ${l.reps}`).join('\n') : 
  'No strength data'}

COMPARISON TO LAST WEEK:
Run pace: ${changes.run_pace_change}
Bike power: ${changes.bike_power_change}
Completion rate: ${changes.completion_rate_change > 0 ? '+' : ''}${changes.completion_rate_change}%

NEXT WEEK PREVIEW:
Focus: ${nextWeekPreview.focus}
Key workouts: ${nextWeekPreview.key_workouts.join(', ')}

Generate analysis with:

1. Week Grade (A-F based on execution quality and completion)

2. Performance Snapshot (2-3 sentences):
   - Highlight standout performances
   - Note week-over-week changes
   - Specific numbers (pace, power, lifts)

3. Key Insights (3-4 bullets):
   - What went well
   - What needs attention
   - Fitness trends observed
   - Recovery quality

4. Next Week Preview:
   - Training focus
   - Key workouts to prioritize
   - Readiness assessment

Keep it actionable and specific. Use numbers.

Return ONLY valid JSON:
{
  "week_performance": "85%",
  "performance_snapshot": "your analysis",
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "next_week_preview": "your preview"
}`;

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
            content: 'Generate weekly training analysis. Factual. No emojis. Be concise. Direct language only. Use specific numbers.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const analysis = JSON.parse(content);

    return {
      week_overview: {
        completion_rate: `${weekSummary.completed}/${weekSummary.planned} sessions (${weekSummary.completion_rate}%)`,
        total_tss: weekSummary.total_tss,
        intensity_distribution: `${weekSummary.intensity_distribution.easy}% easy / ${weekSummary.intensity_distribution.hard}% hard`,
        disciplines: weekSummary.disciplines
      },
      performance_snapshot: analysis.performance_snapshot,
      week_grade: analysis.week_grade,
      key_insights: analysis.key_insights,
      next_week_preview: {
        focus: nextWeekPreview.focus,
        key_workouts: nextWeekPreview.key_workouts,
        preparation: analysis.next_week_preview
      },
      comparison_to_last_week: changes
    };

  } catch (error) {
    console.error('GPT-4 error:', error);
    throw error;
  }
}

// Helper functions
function calculateVariability(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateHRDrift(hrSamples: number[]): number {
  if (hrSamples.length < 10) return 0;
  const firstHalf = hrSamples.slice(0, Math.floor(hrSamples.length / 2));
  const secondHalf = hrSamples.slice(Math.floor(hrSamples.length / 2));
  const firstAvg = firstHalf.reduce((sum, hr) => sum + hr, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, hr) => sum + hr, 0) / secondHalf.length;
  return ((secondAvg - firstAvg) / firstAvg) * 100;
}

function paceToSeconds(pace: string): number {
  const [minutes, seconds] = pace.split(':').map(Number);
  return minutes * 60 + seconds;
}

function secondsToPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
