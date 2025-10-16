/**
 * =============================================================================
 * ANALYZE-WORKOUT EDGE FUNCTION
 * =============================================================================
 * 
 * PURPOSE: Generate immediate post-workout analysis using granular sample data
 * 
 * WHAT IT DOES:
 * - Analyzes a single completed workout using raw sensor samples
 * - Calculates execution grade based on pace/power consistency and HR drift
 * - Generates quick AI insights (3 bullets, max 60 words)
 * - Identifies red flags (poor recovery, extreme variability, etc.)
 * - Stores analysis in workout record for future reference
 * 
 * INPUT: { workout_id: string }
 * 
 * OUTPUT: {
 *   execution_grade: string,           // "A+", "A", "B+", "C", "F"
 *   quick_insights: string[],          // 3 actionable bullet points
 *   key_metrics: {
 *     power_distribution: {...},       // Power zones, variability, NP
 *     hr_responsiveness: {...},        // HR drift, recovery rate
 *     pace_variability: {...},         // Consistency score, pace range
 *     normalized_metrics: {...},       // TSS, intensity factor
 *     intensity_analysis: {...}        // High/moderate/low classification
 *   },
 *   red_flags: string[]                // Warning signs to address
 * }
 * 
 * KEY FEATURES:
 * - Uses sensor_data.samples for granular analysis (not workout averages)
 * - Calculates pace/power variability from actual samples
 * - Analyzes HR drift and recovery patterns
 * - Determines intensity from power zones or HR zones
 * - Provides immediate feedback after workout completion
 * - Stores results in database for historical tracking
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
};

/**
 * =============================================================================
 * TIMEZONE-AWARE DATE HANDLING
 * =============================================================================
 * 
 * PURPOSE: Handle dates consistently using user's location and timezone context
 * 
 * WHAT IT DOES:
 * - Uses user's stored location to determine timezone context
 * - Normalizes all dates to user's local timezone
 * - Handles Garmin offset calculations consistently
 * - Provides timezone-agnostic date comparison functions
 */

/**
 * Get user's timezone from their stored location data
 */
async function getUserTimezone(supabase: any, userId: string): Promise<string | null> {
  try {
    // Get user's most recent location
    const { data: location } = await supabase
      .from('user_locations')
      .select('lat, lng, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!location) return null;
    
    // Use a timezone API to get timezone from coordinates
    // For now, we'll use a simple approach based on longitude
    // In production, you might want to use a service like Google Timezone API
    const timezoneOffset = Math.round(location.lng / 15); // Rough timezone calculation
    return `UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset}`;
  } catch (error) {
    console.warn('Error getting user timezone:', error);
    return null;
  }
}

/**
 * Get user's local date in YYYY-MM-DD format
 * Uses user's timezone context when available
 */
function getUserLocalDate(dateInput?: Date | string, userTimezone?: string): string {
  if (!dateInput) {
    return new Date().toLocaleDateString('en-CA');
  }
  
  const date = new Date(dateInput);
  
  // If we have user timezone, use it for more accurate local date
  if (userTimezone) {
    try {
      // Convert to user's timezone
      const localDate = new Date(date.toLocaleString('en-US', { timeZone: userTimezone }));
      return localDate.toLocaleDateString('en-CA');
    } catch (error) {
      console.warn('Error using user timezone, falling back to browser timezone:', error);
    }
  }
  
  // Fallback to browser's local timezone
  return date.toLocaleDateString('en-CA');
}

/**
 * Normalize workout date to user's local timezone
 * Handles Garmin offset calculations consistently
 */
function normalizeWorkoutDate(workout: any, garminActivity?: any, userTimezone?: string): string {
  // If we have Garmin activity data, use the offset calculation
  if (garminActivity) {
    try {
      const raw = typeof garminActivity.raw_data === 'string' ? 
        JSON.parse(garminActivity.raw_data) : garminActivity.raw_data;
      const gSummary = raw?.summary || raw;
      
      const gIn = Number(gSummary?.startTimeInSeconds ?? garminActivity.start_time);
      const gOff = Number(gSummary?.startTimeOffsetInSeconds ?? garminActivity.start_time_offset_seconds);
      
      if (Number.isFinite(gIn) && Number.isFinite(gOff)) {
        // Calculate local time: UTC time + offset
        const localTime = new Date((gIn + gOff) * 1000);
        return getUserLocalDate(localTime, userTimezone);
      }
    } catch (error) {
      console.warn('Error calculating Garmin local date:', error);
    }
  }
  
  // Fallback to workout's stored date or timestamp
  if (workout.date) {
    return getUserLocalDate(workout.date, userTimezone);
  }
  
  if (workout.timestamp) {
    return getUserLocalDate(workout.timestamp, userTimezone);
  }
  
  return getUserLocalDate(undefined, userTimezone);
}

/**
 * Compare dates in a timezone-agnostic way
 * Returns true if dates are the same day in user's local timezone
 */
function isSameDay(date1: string, date2: string, userTimezone?: string): boolean {
  return getUserLocalDate(date1, userTimezone) === getUserLocalDate(date2, userTimezone);
}

/**
 * Get date range for analysis (e.g., last 7 days)
 * All dates returned in user's local timezone
 */
function getAnalysisDateRange(daysBack: number = 7, userTimezone?: string): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  
  return {
    start: getUserLocalDate(start, userTimezone),
    end: getUserLocalDate(end, userTimezone)
  };
}

/**
 * Get user's location for timezone context
 */
async function getUserLocation(supabase: any, userId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data: location } = await supabase
      .from('user_locations')
      .select('lat, lng')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    return location ? { lat: location.lat, lng: location.lng } : null;
  } catch (error) {
    console.warn('Error getting user location:', error);
    return null;
  }
}

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
    const { workout_id } = payload;

    if (!workout_id) {
      return new Response(JSON.stringify({
        error: 'workout_id is required'
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

    console.log(`Analyzing workout ${workout_id}`);

    // Get workout with full sensor data
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select('*, sensor_data, computed')
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message}`);
    }

    console.log(`Workout user_id: ${workout.user_id}`);
    console.log(`Workout type: ${workout.type}`);
    console.log(`Workout date: ${workout.date}`);

    // Get user baselines and timezone context
    console.log(`Looking for baselines for user_id: ${workout.user_id}`);
    const [baselinesResult, userTimezone] = await Promise.all([
      supabase
        .from('user_baselines')
        .select('performance_numbers')
        .eq('user_id', workout.user_id)
        .single(),
      getUserTimezone(supabase, workout.user_id)
    ]);

    console.log(`Baselines query result:`, JSON.stringify(baselinesResult, null, 2));
    
    if (baselinesResult.error) {
      console.log(`Baselines query error: ${baselinesResult.error.message}`);
    }

    const rawBaselines = baselinesResult.data?.performance_numbers || {};
    
    // Normalize field names to match expected format
    const userBaselines = {
      ftp: rawBaselines.ftp,
      max_hr: rawBaselines.max_hr || rawBaselines.maxHR,
      rest_hr: rawBaselines.rest_hr || rawBaselines.restHR,
      five_k: rawBaselines.fiveK || rawBaselines.five_k,
      swim: rawBaselines.swim
    };
    
    console.log('Raw baselines data:', JSON.stringify(baselinesResult.data, null, 2));
    console.log('Parsed userBaselines:', JSON.stringify(userBaselines, null, 2));
    
    // Check for required baselines - NO FALLBACKS
    if (!userBaselines.ftp) {
      console.log('FTP missing from baselines');
      return new Response(JSON.stringify({
        error: 'FTP baseline required for analysis. Please update your profile with your FTP.',
        missing_baseline: 'ftp',
        available_baselines: Object.keys(userBaselines)
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Max HR is not required - system works without it
    userBaselines.max_hr = null;
    console.log('Max HR not required - using HR analysis without Max HR baselines');
    
    // Normalize workout date using user's timezone
    const normalizedWorkoutDate = normalizeWorkoutDate(workout, null, userTimezone);
    console.log(`Workout date normalized to user timezone: ${normalizedWorkoutDate}`);

    console.log(`Analyzing ${workout.type} workout with ${workout.sensor_data?.samples?.length || 0} samples`);
    console.log(`Workout computed data:`, JSON.stringify(workout.computed, null, 2));
    console.log(`User baselines:`, JSON.stringify(userBaselines, null, 2));

    // Analyze using granular sample data
    const analysis = await analyzeWorkoutWithSamples(workout, userBaselines, supabase);
    console.log(`Analysis result:`, JSON.stringify(analysis, null, 2));

    // Calculate execution grade
    const grade = calculateExecutionGrade(workout, analysis);

    // Generate comprehensive insights using all analysis components
    const insights = await generateWorkoutInsights({
      workout: workout,
      planned_vs_executed: analysis.planned_vs_executed,
      bursts: analysis.speed_bursts,
      consistency: analysis.pace_consistency,
      fatigue: analysis.fatigue_pattern,
      power_distribution: analysis.power_distribution,
      hr_dynamics: analysis.hr_responsiveness,
      intensity_analysis: analysis.intensity_analysis,
      userBaselines: userBaselines
    });

    // Identify red flags
    const redFlags = identifyRedFlags(analysis);

    const result = {
      execution_grade: grade,
      insights: insights,
      key_metrics: {
        planned_vs_executed: analysis.planned_vs_executed,
        speed_bursts: analysis.speed_bursts,
        pace_consistency: analysis.pace_consistency,
        fatigue_pattern: analysis.fatigue_pattern,
        power_distribution: analysis.power_distribution,
        hr_dynamics: analysis.hr_responsiveness
      },
      red_flags: redFlags
    };

    // Store analysis in workout record for future reference
    await supabase
      .from('workouts')
      .update({ 
        workout_analysis: result,
        updated_at: new Date().toISOString()
      })
      .eq('id', workout_id);

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Analyze workout error:', error);
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
 * ANALYZE WORKOUT WITH SAMPLES
 * =============================================================================
 * 
 * PURPOSE: Analyze a single workout using granular sensor data samples
 * 
 * WHAT IT DOES:
 * - Extracts sensor_data.samples from the workout
 * - Delegates to specific analysis functions based on workout type
 * - Analyzes pace variability, power distribution, HR responsiveness
 * - Calculates normalized power and intensity analysis
 * - Falls back to computed data if no sensor samples available
 * 
 * INPUT: 
 * - workout: Single workout with sensor_data and computed fields
 * - userBaselines: User's fitness baselines (FTP, 5K pace, max HR)
 * 
 * OUTPUT: Comprehensive analysis object with all metrics and distributions
 */
async function analyzeWorkoutWithSamples(workout: any, userBaselines: any, supabase: any): Promise<any> {
  const sensorData = workout.sensor_data?.samples || [];
  const computed = typeof workout.computed === 'string' ? JSON.parse(workout.computed) : workout.computed;
  
  console.log(`Sensor data length: ${sensorData.length}`);
  if (sensorData.length > 0) {
    console.log('First sensor sample:', JSON.stringify(sensorData[0], null, 2));
  }
  const intervals = computed?.intervals || [];
  
  console.log(`Processing ${sensorData.length} sensor samples for ${workout.type} workout`);

  if (sensorData.length === 0) {
    console.log('No sensor data available, using computed data with historical trends');
    const basicAnalysis = analyzeWorkoutFromComputed(workout, computed, userBaselines);
    
    // Add historical trend analysis even without sensor data
    try {
      console.log('Running HR trend analysis for computed data...');
      const hrTrends = await analyzeHRTrends([], computed, workout, supabase);
      basicAnalysis.hr_responsiveness = hrTrends;
      console.log('HR trend analysis completed for computed data:', JSON.stringify(hrTrends, null, 2));
    } catch (error) {
      console.error('HR trend analysis failed for computed data:', error);
    }
    
    return basicAnalysis;
  }

  console.log('Running enhanced analysis with sensor data...');

  // Only analyze runs and rides - skip everything else
  let plannedVsExecuted: any = null;
  let burstAnalysis: any = null;
  let consistencyAnalysis: any = null;
  let fatigueAnalysis: any = null;

  if (workout.type === 'run' || workout.type === 'running' || workout.type === 'ride' || workout.type === 'cycling' || workout.type === 'bike') {
    // 1. Compare planned vs executed (adherence)
    plannedVsExecuted = comparePlannedVsExecuted(sensorData, intervals);

    // 2. Detect bursts relative to plan
    burstAnalysis = analyzeSpeedBursts(sensorData, intervals);

    // 3. Measure consistency within intervals
    consistencyAnalysis = analyzePaceConsistency(sensorData, intervals);

    // 4. Track fatigue across intervals
    fatigueAnalysis = analyzeFatiguePattern(sensorData, intervals);
  }

  // 5. Run enhanced analysis with historical context
  const analysis = {
    // New enhanced analysis (always generated)
    planned_vs_executed: plannedVsExecuted,
    speed_bursts: burstAnalysis,
    pace_consistency: consistencyAnalysis,
    fatigue_pattern: fatigueAnalysis,
    
    // Type-specific analysis
    power_distribution: null,
    hr_responsiveness: null,
    pace_variability: null,
    normalized_metrics: null,
    intensity_analysis: null
  };

  // Always run HR trend analysis regardless of workout type
  console.log('Running HR trend analysis...');
  try {
    analysis.hr_responsiveness = await analyzeHRTrends(sensorData, computed, workout, supabase);
    console.log('HR trend analysis completed:', JSON.stringify(analysis.hr_responsiveness, null, 2));
  } catch (error) {
    console.error('HR trend analysis failed:', error);
    // No fallback - return error state
    analysis.hr_responsiveness = null;
  }

  // Analyze based on workout type
  if (workout.type === 'run' || workout.type === 'running') {
    analysis.pace_variability = analyzePaceVariability(sensorData, computed);
    analysis.intensity_analysis = analyzeRunIntensity(sensorData, computed, userBaselines);
  } else if (workout.type === 'ride' || workout.type === 'cycling' || workout.type === 'bike') {
    analysis.power_distribution = analyzePowerDistribution(sensorData, computed, userBaselines);
    analysis.normalized_metrics = calculateNormalizedPower(sensorData, userBaselines);
    analysis.intensity_analysis = analyzeBikeIntensity(sensorData, computed, userBaselines);
  } else if (workout.type === 'swim' || workout.type === 'swimming') {
    analysis.intensity_analysis = analyzeSwimIntensity(sensorData, computed, userBaselines);
  } else if (workout.type === 'strength' || workout.type === 'strength_training') {
    analysis.intensity_analysis = analyzeStrengthIntensity(sensorData, computed, userBaselines);
  } else if (workout.type === 'mobility' || workout.type === 'mobility_session') {
    // Mobility workouts don't need analysis - no meaningful data
    analysis.intensity_analysis = null;
  }

  console.log('Final analysis structure:', JSON.stringify(analysis, null, 2));
  return analysis;
}

/**
 * =============================================================================
 * COMPARE PLANNED VS EXECUTED
 * =============================================================================
 * 
 * PURPOSE: Compare actual execution to planned workout structure
 * 
 * WHAT IT DOES:
 * - Extracts planned targets from intervals
 * - Calculates executed metrics from sensor samples
 * - Computes adherence percentages
 * - Identifies where execution deviated from plan
 */
function comparePlannedVsExecuted(samples: any[], intervals: any[]) {
  const workIntervals = intervals.filter(i => i.kind === 'work');
  
  const comparison = workIntervals.map((interval, idx) => {
    // Get executed data from samples
    const intervalSamples = samples.slice(
      interval.sample_idx_start,
      interval.sample_idx_end
    );
    
    // Extract executed metrics
    const executedPower = intervalSamples
      .map(s => s.powerInWatts || s.power || s.power_watts || s.powerInWatts)
      .filter(p => p && p > 0);
    const executedHR = intervalSamples
      .map(s => s.heartRate || s.heart_rate || s.hr)
      .filter(hr => hr && hr > 0);
    
    const avgExecutedPower = executedPower.length > 0 ? 
      executedPower.reduce((sum, p) => sum + p, 0) / executedPower.length : null;
    const avgExecutedHR = executedHR.length > 0 ? 
      executedHR.reduce((sum, hr) => sum + hr, 0) / executedHR.length : null;
    const maxExecutedHR = executedHR.length > 0 ? Math.max(...executedHR) : null;
    
    // Calculate HR response pattern within interval
    let hrResponse: any = null;
    if (executedHR.length > 10) {
      const firstThird = executedHR.slice(0, Math.floor(executedHR.length / 3));
      const lastThird = executedHR.slice(-Math.floor(executedHR.length / 3));
      
      const startHR = firstThird.reduce((sum, hr) => sum + hr, 0) / firstThird.length;
      const endHR = lastThird.reduce((sum, hr) => sum + hr, 0) / lastThird.length;
      const hrClimb = Math.round(endHR - startHR);
      
      hrResponse = {
        start_hr: Math.round(startHR),
        end_hr: Math.round(endHR),
        hr_climb: hrClimb,
        response_type: hrClimb > 5 ? 'rising' : hrClimb < -2 ? 'dropping' : 'stable'
      };
    }
    
    // Get planned targets
    const plannedPower = interval.planned?.target_power_w || 
                        interval.planned?.power_range?.upper;
    const plannedDuration = interval.planned?.duration_s;
    const actualDuration = interval.sample_idx_end - interval.sample_idx_start;
    
    // Calculate adherence
    const powerAdherence = (plannedPower && avgExecutedPower) ? 
      ((avgExecutedPower / plannedPower) * 100).toFixed(1) : null;
    const durationAdherence = plannedDuration ? 
      ((actualDuration / plannedDuration) * 100).toFixed(1) : null;
    
    return {
      interval_number: idx + 1,
      planned: {
        target_power: plannedPower ? Math.round(plannedPower) : null,
        duration_s: plannedDuration,
        power_range: interval.planned?.power_range
      },
      executed: {
        avg_power: avgExecutedPower ? Math.round(avgExecutedPower) : null,
        avg_hr: avgExecutedHR ? Math.round(avgExecutedHR) : null,
        max_hr: maxExecutedHR,
        duration_s: actualDuration,
        hr_response: hrResponse
      },
      adherence: {
        power_percent: powerAdherence,
        duration_percent: durationAdherence
      }
    };
  });
  
  return comparison;
}

/**
 * =============================================================================
 * ANALYZE SPEED BURSTS
 * =============================================================================
 * 
 * PURPOSE: Detect power surges relative to planned targets
 * 
 * WHAT IT DOES:
 * - Identifies bursts >10% above planned target
 * - Counts burst frequency and duration
 * - Provides interval-by-interval burst analysis
 */
function analyzeSpeedBursts(samples: any[], intervals: any[]) {
  const workIntervals = intervals.filter(i => i.kind === 'work');
  
  const intervalBursts = workIntervals.map((interval, idx) => {
    const intervalSamples = samples.slice(
      interval.sample_idx_start,
      interval.sample_idx_end
    );
    
    // Get planned target (prioritize specific target over range)
    const plannedTarget = interval.planned?.target_power_w || 
                         interval.planned?.power_range?.upper ||
                         interval.planned?.power_range?.lower;
    
    if (!plannedTarget) {
      return {
        interval_number: idx + 1,
        error: 'No planned target available'
      };
    }
    
    // Burst = >10% above planned target
    const burstThreshold = plannedTarget * 1.10;
    
    const powerSamples = intervalSamples
      .map(s => s.powerInWatts || s.power || s.power_watts || s.powerInWatts)
      .filter(p => p && p > 0);
    
    // Count burst seconds
    let burstCount = 0;
    let totalBurstSeconds = 0;
    let inBurst = false;
    
    powerSamples.forEach((power, i) => {
      if (power > burstThreshold) {
        totalBurstSeconds++;
        if (!inBurst) {
          burstCount++;
          inBurst = true;
        }
      } else {
        inBurst = false;
      }
    });
    
    const percentBursting = (totalBurstSeconds / powerSamples.length) * 100;
    
    return {
      interval_number: idx + 1,
      planned_target: Math.round(plannedTarget),
      burst_threshold: Math.round(burstThreshold),
      burst_count: burstCount,
      burst_seconds: totalBurstSeconds,
      percent_bursting: percentBursting.toFixed(1),
      interpretation: percentBursting < 5 ? 'Excellent control - stayed within target' :
                     percentBursting < 10 ? 'Good - minor surges above target' :
                     percentBursting < 15 ? 'Moderate - work on staying in target zone' :
                     'High variability - focus on pacing discipline'
    };
  });
  
  return intervalBursts;
}

/**
 * =============================================================================
 * ANALYZE PACE CONSISTENCY
 * =============================================================================
 * 
 * PURPOSE: Measure consistency within intervals
 * 
 * WHAT IT DOES:
 * - Calculates coefficient of variation for each interval
 * - Measures how steady effort was within target zones
 * - Provides interval-by-interval consistency grades
 */
function analyzePaceConsistency(samples: any[], intervals: any[]) {
  const workIntervals = intervals.filter(i => i.kind === 'work');
  
  const intervalConsistency = workIntervals.map((interval, idx) => {
    const intervalSamples = samples.slice(
      interval.sample_idx_start,
      interval.sample_idx_end
    );
    
    // Extract power or pace values
    const values = intervalSamples
      .map(s => {
        // For bike: use power
        if (s.powerInWatts || s.power || s.power_watts) {
          return s.powerInWatts || s.power || s.power_watts;
        }
        // For run: calculate pace from speed
        if (s.speedMetersPerSecond && s.speedMetersPerSecond > 0) {
          return 1609.34 / s.speedMetersPerSecond; // Convert to s/mile
        }
        return null;
      })
      .filter(v => v && v > 0);
    
    if (values.length === 0) return null;
    
    // Calculate statistics
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientVariation = (stdDev / mean) * 100;
    
    // Target from planned
    const target = interval.planned?.target_power_w || 
                   interval.planned?.power_range?.upper ||
                   interval.planned?.target_pace_s_per_mi;
    
    return {
      interval_number: idx + 1,
      target: target ? Math.round(target) : null,
      mean: Math.round(mean),
      std_dev: stdDev.toFixed(1),
      coefficient_variation: coefficientVariation.toFixed(1),
      adherence_percent: target ? ((mean / target) * 100).toFixed(1) : null,
      consistency_grade: coefficientVariation < 2 ? 'Excellent' :
                        coefficientVariation < 4 ? 'Good' :
                        coefficientVariation < 6 ? 'Fair' :
                        'Poor'
    };
  }).filter(i => i !== null);
  
  // Overall consistency
  const avgCV = intervalConsistency.reduce((sum, i) => 
    sum + parseFloat(i.coefficient_variation), 0
  ) / intervalConsistency.length;
  
  return {
    interval_consistency: intervalConsistency,
    overall_cv: avgCV.toFixed(1),
    consistency_grade: avgCV < 2 ? 'Excellent' :
                      avgCV < 4 ? 'Good' :
                      avgCV < 6 ? 'Fair' :
                      'Poor',
    interpretation: avgCV < 2 ? 'Very consistent - maintained steady effort' :
                   avgCV < 4 ? 'Good consistency with minor variations' :
                   avgCV < 6 ? 'Moderate variability - work on pacing' :
                   'High variability - focus on maintaining steady effort'
  };
}

/**
 * =============================================================================
 * ANALYZE FATIGUE PATTERN
 * =============================================================================
 * 
 * PURPOSE: Track fatigue across intervals
 * 
 * WHAT IT DOES:
 * - Measures power fade from first to last interval
 * - Tracks HR progression across intervals
 * - Analyzes adherence fade over time
 */
function analyzeFatiguePattern(samples: any[], intervals: any[]) {
  const workIntervals = intervals.filter(i => i.kind === 'work');
  
  if (workIntervals.length < 2) return null;
  
  const intervalAnalysis = workIntervals.map((interval, idx) => {
    const intervalSamples = samples.slice(
      interval.sample_idx_start,
      interval.sample_idx_end
    );
    
    const executedPower = intervalSamples
      .map(s => s.powerInWatts || s.power || s.power_watts || s.powerInWatts)
      .filter(p => p && p > 0);
    const executedHR = intervalSamples
      .map(s => s.heartRate || s.heart_rate || s.hr)
      .filter(hr => hr && hr > 0);
    
    const avgExecutedPower = executedPower.length > 0 ? 
      executedPower.reduce((sum, p) => sum + p, 0) / executedPower.length : null;
    const avgExecutedHR = executedHR.length > 0 ? 
      executedHR.reduce((sum, hr) => sum + hr, 0) / executedHR.length : null;
    
    // Get planned target
    const plannedTarget = interval.planned?.target_power_w || 
                         interval.planned?.power_range?.upper;
    
    return {
      interval_number: idx + 1,
      planned_target: plannedTarget ? Math.round(plannedTarget) : null,
      executed_power: avgExecutedPower ? Math.round(avgExecutedPower) : null,
      executed_hr: avgExecutedHR ? Math.round(avgExecutedHR) : null,
      target_adherence: (plannedTarget && avgExecutedPower) ? 
        ((avgExecutedPower / plannedTarget) * 100).toFixed(1) : null
    };
  });
  
  // Calculate fade relative to planned targets
  const firstInterval = intervalAnalysis[0];
  const lastInterval = intervalAnalysis[intervalAnalysis.length - 1];
  
  const powerFade = (firstInterval.executed_power && lastInterval.executed_power) ?
    ((firstInterval.executed_power - lastInterval.executed_power) / firstInterval.executed_power) * 100 : null;
  
  // Adherence fade (are they hitting targets less well over time?)
  const adherenceFade = (firstInterval.target_adherence && lastInterval.target_adherence) ?
    parseFloat(firstInterval.target_adherence) - parseFloat(lastInterval.target_adherence) : null;
  
  return {
    intervals: intervalAnalysis,
    power_fade_percent: powerFade ? powerFade.toFixed(1) : null,
    adherence_fade_percent: adherenceFade ? adherenceFade.toFixed(1) : null,
    interpretation: !powerFade ? 'Insufficient data for fade analysis' :
                   powerFade < -2 ? 'Negative split - finished stronger than planned!' :
                   Math.abs(powerFade) < 3 ? 'Maintained power relative to plan - excellent execution' :
                   powerFade < 5 ? 'Slight fade from plan - normal for this intensity' :
                   powerFade < 8 ? 'Moderate fade from plan - consider starting easier' :
                   'Significant fade from plan - pacing strategy needs adjustment'
  };
}

/**
 * =============================================================================
 * GENERATE WORKOUT INSIGHTS
 * =============================================================================
 * 
 * PURPOSE: Generate comprehensive AI insights using all analysis components
 * 
 * WHAT IT DOES:
 * - Combines planned vs executed, bursts, consistency, and fatigue analysis
 * - Generates specific, actionable insights using GPT-4
 * - Provides detailed feedback on execution quality
 */
async function generateWorkoutInsights(data: {
  workout: any;
  planned_vs_executed: any;
  bursts: any;
  consistency: any;
  fatigue: any;
  power_distribution: any;
  hr_dynamics: any;
  intensity_analysis: any;
  userBaselines: any;
}): Promise<string[]> {
  const { workout, planned_vs_executed, bursts, consistency, fatigue, power_distribution, hr_dynamics, intensity_analysis, userBaselines } = data;
  
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return ['AI analysis not available - please set up OpenAI API key'];
  }

  try {
    let prompt = `You're analyzing a ${workout.type} workout to have a conversation with the athlete about their training.

WORKOUT OVERVIEW:
Duration: ${Math.round(workout.duration)}min | Adherence: ${workout.computed?.overall?.execution_score}%
Grade: ${workout.execution_grade}`;

    // Add power distribution analysis
    if (power_distribution) {
      prompt += `
POWER DISTRIBUTION:
- Normalized Power: ${power_distribution.normalized_power}W
- Variability: ${power_distribution.variability_index} (${parseFloat(power_distribution.variability_index) < 1.05 ? 'very steady' : 'variable'})
- Dominant Zone: ${power_distribution.dominant_zone}`;
    }

    // Add HR as physiological response indicator
    if (hr_dynamics) {
      prompt += `
PHYSIOLOGICAL RESPONSE:
- Avg HR: ${hr_dynamics.avg_hr} bpm, Peak: ${hr_dynamics.max_hr} bpm
- HR Drift: ${hr_dynamics.hr_drift_percent}% (${hr_dynamics.drift_interpretation})`;
      
      if (hr_dynamics.trend_analysis) {
        prompt += `
- HR Context: ${hr_dynamics.trend_analysis.current_avg_hr_percentile}th percentile vs recent workouts`;
      }
    }

    // Add strength-specific analysis
    if (workout.type === 'strength' || workout.type === 'strength_training') {
      const intensityAnalysis = intensity_analysis;
      if (intensityAnalysis && intensityAnalysis.intensity) {
        const intensity = intensityAnalysis.intensity;
        
        if (intensity.rir_analysis) {
          prompt += `
STRENGTH TRAINING ANALYSIS (RIR-based):
- RIR Average: ${intensity.rir_analysis.avg_rir} (range: ${intensity.rir_analysis.min_rir}-${intensity.rir_analysis.max_rir})
- RIR Consistency: ${intensity.rir_analysis.rir_consistency}% variation
- Fatigue Pattern: ${intensity.rir_analysis.intensity_progression} (${intensity.rir_analysis.rir_fade} RIR change)
- Total Sets: ${intensity.rir_analysis.total_sets}`;
        }
        
        if (intensity.hr_analysis) {
          prompt += `
- HR Response: ${intensity.hr_analysis.avg_hr} bpm avg, ${intensity.hr_analysis.hr_range} bpm range
- HR Variability: ${intensity.hr_analysis.hr_variability}%`;
        }
        
        if (!intensity.rir_analysis && !intensity.hr_analysis) {
          prompt += `
STRENGTH TRAINING ANALYSIS:
- No RIR or HR data available for analysis
- Consider logging RIR for each set to enable detailed analysis`;
        }
      }
    }

    // Only analyze runs and rides - skip everything else
    if (workout.type !== 'run' && workout.type !== 'running' && workout.type !== 'ride' && workout.type !== 'cycling' && workout.type !== 'bike') {
      prompt += `
WORKOUT TYPE: ${workout.type.toUpperCase()}
- No performance analysis available for this workout type
- Focus on runs and rides for detailed performance metrics`;
    }

    // Add interval-by-interval performance analysis
    if (planned_vs_executed && planned_vs_executed.length > 0) {
      prompt += `
INTERVAL PERFORMANCE:
${planned_vs_executed.map((interval: any, idx: number) => {
  const power = interval.executed.avg_power;
  const target = interval.planned.target_power;
  const adherence = interval.adherence.power_percent;
  const hr = interval.executed.avg_hr;
  const hrResponse = interval.executed.hr_response;
  
  let hrContext = '';
  if (hrResponse) {
    if (hrResponse.response_type === 'rising') {
      hrContext = ` - HR climbed ${hrResponse.hr_climb} bpm`;
    } else if (hrResponse.response_type === 'dropping') {
      hrContext = ` - HR dropped ${Math.abs(hrResponse.hr_climb)} bpm`;
    } else {
      hrContext = ` - HR stable`;
    }
  }
  
  return `Interval ${interval.interval_number}: ${power}W (${adherence}% of ${target}W) - HR: ${hr} bpm${hrContext}`;
}).join('\n')}`;
    }

    // Add workout context
    prompt += `
WORKOUT CONTEXT:
- Type: ${workout.type}
- Date: ${workout.date}
- Duration: ${Math.round(workout.duration || 0)}min`;

    // Add burst analysis per interval
    if (bursts && bursts.interval_bursts && bursts.interval_bursts.length > 0) {
      prompt += `
POWER CONTROL:
${bursts.interval_bursts.map((burst: any) => 
  `Interval ${burst.interval_number}: ${burst.burst_count} surges (${burst.percent_bursting}% above target)`
).join('\n')}`;
    }

    // Add consistency analysis per interval
    if (consistency && consistency.interval_consistency && consistency.interval_consistency.length > 0) {
      prompt += `
PACING CONSISTENCY:
${consistency.interval_consistency.map((interval: any) => 
  `Interval ${interval.interval_number}: ${interval.consistency_grade} (${interval.coefficient_variation}% variation)`
).join('\n')}`;
    }

    // Add consistency analysis
    if (consistency) {
      prompt += `
PACE CONSISTENCY:
Overall: ${consistency.overall_cv}% variation (${consistency.consistency_grade})
${consistency.interval_consistency ? consistency.interval_consistency.map((interval: any) => 
  `Interval ${interval.interval_number}: ${interval.coefficient_variation}% variation (${interval.consistency_grade})`
).join('\n') : ''}`;
    }

    // Add fatigue analysis
    if (fatigue) {
      prompt += `
FATIGUE PATTERN:
Power fade: ${fatigue.power_fade_percent}% (first → last interval)
${fatigue.intervals ? fatigue.intervals.map((interval: any) => 
  `Interval ${interval.interval_number}: ${interval.executed_power}W`
).join(' | ') : ''}`;
    }

    // Add burst analysis
    if (bursts && bursts.length > 0) {
      prompt += `
POWER SURGES:
${bursts.map((burst: any) => 
  `Interval ${burst.interval_number}: ${burst.burst_count} bursts, ${burst.percent_bursting}% above target`
).join('\n')}`;
    }

    prompt += `
BASELINE CONTEXT:
FTP: ${userBaselines.ftp}W

Analyze this workout and provide 3-4 performance observations:

1. Overall performance summary (1 sentence, specific metrics)
2. Key data observation (1 sentence, data-driven)  
3. Performance pattern (1 sentence, factual)
4. Notable physiological response (only if significant)

ANALYSIS STYLE:
- Factual, data-driven tone
- Use specific numbers and metrics
- For RUNS/RIDES: Focus on power distribution, pacing consistency, execution adherence
- For STRENGTH: Focus on RIR progression, fatigue patterns, set consistency
- For MOBILITY: Focus on movement quality, HR recovery response, session completion
- Use HR as physiological response indicator
- Be direct and factual, not motivational or coaching
- Avoid advice, suggestions, or coaching language
- Focus on what the data actually shows
- Keep observations under 20 words each
- Sound like a performance data analyst

Example tone: "Power consistency was 2.1% variation" not "Focus on smoother transitions next time"`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'Generate workout analysis. Be specific, use numbers, no fluff. Max 100 words total.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.3
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content;
    return content.split('\n').filter(line => line.trim().length > 0);
    
  } catch (error) {
    console.error('GPT insights error:', error);
    return ['AI analysis temporarily unavailable'];
  }
}

/**
 * =============================================================================
 * ANALYZE PACE VARIABILITY
 * =============================================================================
 * 
 * PURPOSE: Calculate pace consistency and variability from sensor samples
 * 
 * WHAT IT DOES:
 * - Extracts pace samples from sensor_data.samples (speedMetersPerSecond)
 * - Converts speed to seconds per mile for pace analysis
 * - Calculates average, fastest, and slowest paces
 * - Computes variability percentage and consistency score
 * - Returns pace range and consistency metrics
 * 
 * INPUT: 
 * - sensorData: Array of sensor samples with speed data
 * - computed: Computed workout data (fallback)
 * 
 * OUTPUT: Object with consistency_score, variability_percent, pace_range
 */
function analyzePaceVariability(sensorData: any[], computed: any): any {
  const paceSamples = sensorData
    .map(s => {
      if (s.speedMetersPerSecond && s.speedMetersPerSecond > 0) {
        return (1000 / s.speedMetersPerSecond) * 60; // Convert to seconds per mile
      }
      return null;
    })
    .filter(p => p !== null);

  if (paceSamples.length === 0) {
    return {
      consistency_score: null,
      variability_percent: null,
      pace_range: null
    };
  }

  const avgPace = paceSamples.reduce((sum, p) => sum + p, 0) / paceSamples.length;
  const maxPace = Math.min(...paceSamples); // Fastest pace
  const minPace = Math.max(...paceSamples); // Slowest pace
  const variability = calculateVariability(paceSamples);
  const variabilityPercent = (variability / avgPace) * 100;

  return {
    consistency_score: Math.max(0, 100 - variabilityPercent),
    variability_percent: Math.round(variabilityPercent * 10) / 10,
    pace_range: {
      avg: secondsToPace(avgPace),
      fastest: secondsToPace(maxPace),
      slowest: secondsToPace(minPace)
    }
  };
}

/**
 * =============================================================================
 * ANALYZE POWER DISTRIBUTION
 * =============================================================================
 * 
 * PURPOSE: Calculate power zones and distribution from sensor samples
 * 
 * WHAT IT DOES:
 * - Extracts power samples from sensor_data.samples (power/powerInWatts)
 * - Calculates average, maximum, and minimum power values
 * - Computes power variability (max/avg ratio)
 * - Calculates time spent in each power zone (1-5) based on FTP
 * - Returns comprehensive power analysis for bike workouts
 * 
 * INPUT: 
 * - sensorData: Array of sensor samples with power data
 * - computed: Computed workout data (fallback)
 * - userBaselines: User's FTP baseline for zone calculations
 * 
 * OUTPUT: Object with avg_power, max_power, power_variability, time_in_zones
 */
function analyzePowerDistribution(sensorData: any[], computed: any, userBaselines: any): any {
  const powerSamples = sensorData
    .map(s => s.power || s.powerInWatts)
    .filter(p => p && p > 0);

  if (powerSamples.length === 0) {
    return {
      avg_power: null,
      max_power: null,
      power_variability: null,
      time_in_zones: null
    };
  }

  const avgPower = powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length;
  const maxPower = Math.max(...powerSamples);
  const minPower = Math.min(...powerSamples);
  const powerVariability = maxPower / avgPower;

  // Calculate time in power zones
  const timeInZones = calculatePowerZones(powerSamples, userBaselines.ftp);

  return {
    avg_power: Math.round(avgPower),
    max_power: maxPower,
    min_power: minPower,
    power_variability: Math.round(powerVariability * 100) / 100,
    time_in_zones: timeInZones
  };
}

/**
 * Analyze HR responsiveness from sensor data
 */
async function analyzeHRTrends(sensorData: any[], computed: any, workout: any, supabase: any): Promise<any> {
  console.log(`Analyzing HR trends with ${sensorData.length} sensor samples`);
  
  // Debug: Log sensor data structure
  if (sensorData.length > 0) {
    console.log('Sample sensor data structure:', JSON.stringify(sensorData[0], null, 2));
  }
  
  const hrSamples = sensorData
    .map(s => s.heartRate || s.heart_rate || s.hr)
    .filter(hr => hr && hr > 0);

  // If no sensor data, use computed data for basic HR metrics
  let avgHR, maxHR, hrDrift, recoveryRate;
  
  if (hrSamples.length === 0) {
    // Use computed data for basic HR metrics
    avgHR = workout.avg_heart_rate;
    maxHR = workout.max_heart_rate;
    hrDrift = null;
    recoveryRate = null;
    
    // Even with limited data, we can still provide basic analysis
    if (!avgHR && !maxHR) {
      return {
        avg_hr: null,
        max_hr: null,
        hr_drift_percent: null,
        recovery_rate: null,
        trend_analysis: null,
        data_quality: 'insufficient'
      };
    }
  } else {
    avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
    maxHR = Math.max(...hrSamples);
    hrDrift = calculateHRDrift(hrSamples);

    // Calculate recovery rate (if we have enough data)
    if (hrSamples.length > 30) {
      const last30Seconds = hrSamples.slice(-30);
      const first30Seconds = hrSamples.slice(0, 30);
      const endAvg = last30Seconds.reduce((sum, hr) => sum + hr, 0) / last30Seconds.length;
      const startAvg = first30Seconds.reduce((sum, hr) => sum + hr, 0) / first30Seconds.length;
      recoveryRate = Math.round(startAvg - endAvg);
    }
  }

  // Get historical HR data for trend analysis
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  console.log(`Looking for historical workouts for user ${workout.user_id} from ${thirtyDaysAgo.toISOString().split('T')[0]} to ${workout.date}`);
  
  const { data: historicalWorkouts, error: historicalError } = await supabase
    .from('workouts')
    .select('id, date, type, avg_heart_rate, max_heart_rate, workout_analysis')
    .eq('user_id', workout.user_id)
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
    .lt('date', workout.date)
    .not('avg_heart_rate', 'is', null)
    .order('date', { ascending: false })
    .limit(20);
  
  if (historicalError) {
    console.error('Historical data query failed:', historicalError);
  } else {
    console.log(`Found ${historicalWorkouts?.length || 0} historical workouts`);
  }

  // Analyze HR trends - system learns from your patterns
  let trendAnalysis: any = null;
  if (historicalWorkouts && historicalWorkouts.length >= 2) {
    const recentHRs = historicalWorkouts
      .map(w => ({ 
        avg_hr: w.avg_heart_rate, 
        max_hr: w.max_heart_rate,
        date: w.date,
        type: w.type,
        analysis: w.workout_analysis
      }))
      .filter(w => w.avg_hr && w.max_hr);

    if (recentHRs.length >= 3) {
      // Calculate trend patterns
      const avgHRs = recentHRs.map(w => w.avg_hr);
      const maxHRs = recentHRs.map(w => w.max_hr);
      
      const avgHRTrend = calculateTrend(avgHRs);
      const maxHRTrend = calculateTrend(maxHRs);
      
      // Check for concerning patterns
      const avgHRVariability = calculateVariability(avgHRs);
      const maxHRVariability = calculateVariability(maxHRs);
      
      // Determine if current workout is within normal range
      const avgHRPercentile = calculatePercentile(avgHR, avgHRs);
      const maxHRPercentile = calculatePercentile(maxHR, maxHRs);
      
      trendAnalysis = {
        recent_avg_hr_trend: avgHRTrend,
        recent_max_hr_trend: maxHRTrend,
        avg_hr_variability: avgHRVariability,
        max_hr_variability: maxHRVariability,
        current_avg_hr_percentile: avgHRPercentile,
        current_max_hr_percentile: maxHRPercentile,
        data_points: recentHRs.length,
        trend_interpretation: interpretHRTrends(avgHR, maxHR, avgHRs, maxHRs, avgHRPercentile, maxHRPercentile)
      };
    }
  }

  // Assess data quality with historical context
  const historicalAvgHRs = historicalWorkouts?.map(w => w.avg_heart_rate).filter(hr => hr) || [];
  const dataQuality = assessHRDataQuality(hrSamples, hrDrift, historicalAvgHRs);

  return {
    avg_hr: Math.round(avgHR),
    max_hr: maxHR,
    hr_drift_percent: Math.round(hrDrift * 10) / 10,
    recovery_rate: recoveryRate,
    trend_analysis: trendAnalysis,
    data_quality: dataQuality
  };
}

function analyzeHRResponsiveness(sensorData: any[], computed: any): any {
  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  if (hrSamples.length === 0) {
    return {
      avg_hr: null,
      max_hr: null,
      hr_drift_percent: null,
      recovery_rate: null
    };
  }

  const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
  const maxHR = Math.max(...hrSamples);
  const hrDrift = calculateHRDrift(hrSamples);

  // Calculate recovery rate (if we have enough data)
  let recoveryRate: number | null = null;
  if (hrSamples.length > 30) {
    const last30Seconds = hrSamples.slice(-30);
    const first30Seconds = hrSamples.slice(0, 30);
    const endAvg = last30Seconds.reduce((sum, hr) => sum + hr, 0) / last30Seconds.length;
    const startAvg = first30Seconds.reduce((sum, hr) => sum + hr, 0) / first30Seconds.length;
    recoveryRate = Math.round(startAvg - endAvg);
  }

  return {
    avg_hr: Math.round(avgHR),
    max_hr: maxHR,
    hr_drift_percent: Math.round(hrDrift * 10) / 10,
    recovery_rate: recoveryRate
  };
}

/**
 * Calculate trend direction from array of values
 */
function calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
  if (values.length < 2) return 'stable';
  
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  
  const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;
  
  const change = ((secondAvg - firstAvg) / firstAvg) * 100;
  
  if (change > 5) return 'increasing';
  if (change < -5) return 'decreasing';
  return 'stable';
}

/**
 * Calculate variability (coefficient of variation)
 */
function calculateVariability(values: number[]): number {
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return (stdDev / mean) * 100;
}

/**
 * Calculate percentile rank
 */
function calculatePercentile(value: number, values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = sorted.findIndex(v => v >= value);
  
  if (index === -1) return 100;
  if (index === 0) return 0;
  
  return Math.round((index / sorted.length) * 100);
}

/**
 * Interpret HR trends and provide context with anomaly detection
 */
function interpretHRTrends(
  currentAvgHR: number, 
  currentMaxHR: number, 
  historicalAvgHRs: number[], 
  historicalMaxHRs: number[],
  avgHRPercentile: number,
  maxHRPercentile: number
): string {
  const avgHRMean = historicalAvgHRs.reduce((sum, v) => sum + v, 0) / historicalAvgHRs.length;
  const maxHRMean = historicalMaxHRs.reduce((sum, v) => sum + v, 0) / historicalMaxHRs.length;
  
  // Calculate standard deviations for anomaly detection
  const avgHRStdDev = Math.sqrt(historicalAvgHRs.reduce((sum, v) => sum + Math.pow(v - avgHRMean, 2), 0) / historicalAvgHRs.length);
  const maxHRStdDev = Math.sqrt(historicalMaxHRs.reduce((sum, v) => sum + Math.pow(v - maxHRMean, 2), 0) / historicalMaxHRs.length);
  
  // Detect anomalies (more than 2 standard deviations from mean)
  const avgHRAnomaly = Math.abs(currentAvgHR - avgHRMean) > (2 * avgHRStdDev);
  const maxHRAnomaly = Math.abs(currentMaxHR - maxHRMean) > (2 * maxHRStdDev);
  
  // Check for concerning patterns
  if (avgHRPercentile > 95) {
    if (avgHRAnomaly) {
      return `Anomalously high average HR (${avgHRPercentile}th percentile, ${Math.round(currentAvgHR)} vs ${Math.round(avgHRMean)} avg) - possible sensor issue or illness`;
    }
    return `High average HR (${avgHRPercentile}th percentile) - monitor for overreaching or illness`;
  }
  
  if (maxHRPercentile > 95) {
    if (maxHRAnomaly) {
      return `Anomalously high max HR (${maxHRPercentile}th percentile, ${Math.round(currentMaxHR)} vs ${Math.round(maxHRMean)} avg) - check sensor or intensity`;
    }
    return `High max HR (${maxHRPercentile}th percentile) - check intensity and recovery`;
  }
  
  if (avgHRPercentile < 5) {
    if (avgHRAnomaly) {
      return `Anomalously low average HR (${avgHRPercentile}th percentile, ${Math.round(currentAvgHR)} vs ${Math.round(avgHRMean)} avg) - possible sensor issue or undertraining`;
    }
    return `Low average HR (${avgHRPercentile}th percentile) - may indicate good fitness or undertraining`;
  }
  
  if (maxHRPercentile < 5) {
    if (maxHRAnomaly) {
      return `Anomalously low max HR (${maxHRPercentile}th percentile, ${Math.round(currentMaxHR)} vs ${Math.round(maxHRMean)} avg) - check sensor or intensity`;
    }
    return `Low max HR (${maxHRPercentile}th percentile) - check if intensity was appropriate`;
  }
  
  // Check for trends
  const avgHRTrend = calculateTrend(historicalAvgHRs);
  const maxHRTrend = calculateTrend(historicalMaxHRs);
  
  if (avgHRTrend === 'increasing' && avgHRPercentile > 75) {
    return `Rising average HR trend - monitor for fatigue or overtraining`;
  }
  
  if (maxHRTrend === 'increasing' && maxHRPercentile > 75) {
    return `Rising max HR trend - check recovery and training load`;
  }
  
  if (avgHRTrend === 'decreasing' && avgHRPercentile < 25) {
    return `Improving HR efficiency - fitness gains evident`;
  }
  
  return `HR patterns normal for your training (${avgHRPercentile}th percentile avg, ${maxHRPercentile}th percentile max) - system learning your baseline`;
}

/**
 * Assess HR data quality with historical context
 */
function assessHRDataQuality(hrSamples: number[], hrDrift: number, historicalHRs?: number[]): 'excellent' | 'good' | 'poor' | 'insufficient' {
  if (hrSamples.length < 10) return 'insufficient';
  
  // Check for gaps in data
  const gaps = hrSamples.filter(hr => hr === 0).length;
  const gapPercent = (gaps / hrSamples.length) * 100;
  
  // Check for unrealistic values
  const unrealistic = hrSamples.filter(hr => hr < 40 || hr > 220).length;
  const unrealisticPercent = (unrealistic / hrSamples.length) * 100;
  
  // Check for excessive drift (might indicate poor data)
  const excessiveDrift = Math.abs(hrDrift) > 20;
  
  // Check for suspiciously low HR (possible sensor issue)
  const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
  const suspiciouslyLow = avgHR < 60 && hrSamples.length > 100; // Very low for a workout
  
  // Check against historical context if available
  let historicalAnomaly = false;
  if (historicalHRs && historicalHRs.length >= 3) {
    const historicalMean = historicalHRs.reduce((sum, hr) => sum + hr, 0) / historicalHRs.length;
    const historicalStdDev = Math.sqrt(historicalHRs.reduce((sum, hr) => sum + Math.pow(hr - historicalMean, 2), 0) / historicalHRs.length);
    
    // If current HR is more than 3 standard deviations from historical mean
    historicalAnomaly = Math.abs(avgHR - historicalMean) > (3 * historicalStdDev);
  }
  
  // Determine quality based on all factors
  if (gapPercent > 30 || unrealisticPercent > 15 || excessiveDrift || suspiciouslyLow || historicalAnomaly) {
    return 'poor';
  }
  
  if (gapPercent > 15 || unrealisticPercent > 8 || Math.abs(hrDrift) > 15) {
    return 'good';
  }
  
  return 'excellent';
}

/**
 * Calculate normalized power from sensor data
 */
function calculateNormalizedPower(sensorData: any[], userBaselines: any): any {
  const powerSamples = sensorData
    .map(s => s.power || s.powerInWatts)
    .filter(p => p && p > 0);

  if (powerSamples.length === 0) {
    return {
      normalized_power: null,
      intensity_factor: null,
      training_stress_score: null
    };
  }

  // Calculate 30-second rolling average
  const rollingAverages: number[] = [];
  for (let i = 0; i < powerSamples.length - 29; i++) {
    const window = powerSamples.slice(i, i + 30);
    const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
    rollingAverages.push(avg);
  }

  // Calculate 4th power average (normalized power approximation)
  const fourthPowerSum = rollingAverages.reduce((sum, p) => sum + Math.pow(p, 4), 0);
  const normalizedPower = Math.pow(fourthPowerSum / rollingAverages.length, 0.25);

  // Calculate intensity factor and TSS
  const intensityFactor = userBaselines.ftp ? normalizedPower / userBaselines.ftp : null;
  const durationHours = powerSamples.length / 3600; // Assuming 1 sample per second
  const trainingStressScore = intensityFactor ? Math.round(intensityFactor * intensityFactor * durationHours * 100) : null;

  return {
    normalized_power: Math.round(normalizedPower),
    intensity_factor: intensityFactor ? Math.round(intensityFactor * 1000) / 1000 : null,
    training_stress_score: trainingStressScore
  };
}

/**
 * Analyze run intensity from sensor data
 */
function analyzeRunIntensity(sensorData: any[], computed: any, userBaselines: any): any {
  const paceSamples = sensorData
    .map(s => {
      if (s.speedMetersPerSecond && s.speedMetersPerSecond > 0) {
        return (1000 / s.speedMetersPerSecond) * 60;
      }
      return null;
    })
    .filter(p => p !== null);

  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  if (paceSamples.length === 0 && hrSamples.length === 0) {
    return { intensity: 'unknown', analysis: 'No data available' };
  }

  let intensity: string | null = null;
  let analysis: string | null = null;

  if (paceSamples.length > 0) {
    const avgPace = paceSamples.reduce((sum, p) => sum + p, 0) / paceSamples.length;
    
    if (userBaselines.fiveK_pace) {
      const baselineSeconds = paceToSeconds(userBaselines.fiveK_pace);
      const pacePercent = (avgPace / baselineSeconds) * 100;
      
      if (pacePercent <= 110) {
        intensity = 'high';
        analysis = `High intensity (${pacePercent.toFixed(1)}% of 5K pace)`;
      } else if (pacePercent <= 130) {
        intensity = 'moderate';
        analysis = `Moderate intensity (${pacePercent.toFixed(1)}% of 5K pace)`;
      } else {
        intensity = 'low';
        analysis = `Low intensity (${pacePercent.toFixed(1)}% of 5K pace)`;
      }
    }
  } else if (hrSamples.length > 0) {
    const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
    
    if (userBaselines.max_hr) {
      const hrPercent = (avgHR / userBaselines.max_hr) * 100;
      
      if (hrPercent >= 85) {
        intensity = 'high';
        analysis = `High intensity (${hrPercent.toFixed(1)}% max HR)`;
      } else if (hrPercent >= 75) {
        intensity = 'moderate';
        analysis = `Moderate intensity (${hrPercent.toFixed(1)}% max HR)`;
      } else {
        intensity = 'low';
        analysis = `Low intensity (${hrPercent.toFixed(1)}% max HR)`;
      }
    }
  }

  return { intensity, analysis };
}

/**
 * Analyze bike intensity from sensor data
 */
function analyzeBikeIntensity(sensorData: any[], computed: any, userBaselines: any): any {
  const powerSamples = sensorData
    .map(s => s.power || s.powerInWatts)
    .filter(p => p && p > 0);

  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  if (powerSamples.length === 0 && hrSamples.length === 0) {
    return { intensity: 'unknown', analysis: 'No data available' };
  }

  let intensity: string | null = null;
  let analysis: string | null = null;

  if (powerSamples.length > 0) {
    const avgPower = powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length;
    const maxPower = Math.max(...powerSamples);
    const powerVariability = maxPower / avgPower;
    
    if (userBaselines.ftp) {
      const ftpPercent = (avgPower / userBaselines.ftp) * 100;
      
      if (ftpPercent >= 90) {
        intensity = 'high';
        analysis = `High intensity (${ftpPercent.toFixed(1)}% of FTP)`;
      } else if (ftpPercent >= 75) {
        intensity = 'moderate';
        analysis = `Moderate intensity (${ftpPercent.toFixed(1)}% of FTP)`;
      } else {
        intensity = 'low';
        analysis = `Low intensity (${ftpPercent.toFixed(1)}% of FTP)`;
      }
    } else if (powerVariability >= 2.0) {
      intensity = 'high';
      analysis = `High intensity (power variability ${powerVariability.toFixed(2)})`;
    }
  } else if (hrSamples.length > 0) {
    const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
    
    if (userBaselines.max_hr) {
      const hrPercent = (avgHR / userBaselines.max_hr) * 100;
      
      if (hrPercent >= 85) {
        intensity = 'high';
        analysis = `High intensity (${hrPercent.toFixed(1)}% max HR)`;
      } else if (hrPercent >= 75) {
        intensity = 'moderate';
        analysis = `Moderate intensity (${hrPercent.toFixed(1)}% max HR)`;
      } else {
        intensity = 'low';
        analysis = `Low intensity (${hrPercent.toFixed(1)}% max HR)`;
      }
    }
  }

  return { intensity, analysis };
}

/**
 * Analyze strength training intensity from RIR data and sensor data
 */
function analyzeStrengthIntensity(sensorData: any[], computed: any, userBaselines: any): any {
  // Look for RIR data in computed or sensor data
  const rirData = computed?.rir_data || computed?.sets || [];
  const hrSamples = sensorData
    .map(s => s.heartRate || s.heart_rate || s.hr)
    .filter(hr => hr && hr > 0);

  // Primary analysis based on RIR data
  let rirAnalysis: any = null;
  if (rirData && rirData.length > 0) {
    const rirValues = rirData.map(set => set.rir || set.reps_in_reserve).filter(rir => rir !== null && rir !== undefined);
    
    if (rirValues.length > 0) {
      const avgRIR = rirValues.reduce((sum, rir) => sum + rir, 0) / rirValues.length;
      const minRIR = Math.min(...rirValues);
      const maxRIR = Math.max(...rirValues);
      const rirConsistency = calculateVariability(rirValues);
      
      // Analyze RIR progression (fatigue pattern)
      const firstHalf = rirValues.slice(0, Math.floor(rirValues.length / 2));
      const secondHalf = rirValues.slice(Math.floor(rirValues.length / 2));
      const firstHalfAvg = firstHalf.reduce((sum, rir) => sum + rir, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, rir) => sum + rir, 0) / secondHalf.length;
      const rirFade = firstHalfAvg - secondHalfAvg;
      
      rirAnalysis = {
        avg_rir: avgRIR.toFixed(1),
        min_rir: minRIR,
        max_rir: maxRIR,
        rir_consistency: rirConsistency.toFixed(1),
        rir_fade: rirFade.toFixed(1),
        total_sets: rirValues.length,
        intensity_progression: rirFade > 1 ? 'increasing fatigue' : rirFade < -0.5 ? 'maintaining intensity' : 'slight fatigue'
      };
    }
  }

  // Secondary analysis from HR data (if available)
  let hrAnalysis: any = null;
  if (hrSamples.length > 0) {
    const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
    const maxHR = Math.max(...hrSamples);
    const minHR = Math.min(...hrSamples);
    const hrRange = maxHR - minHR;
    const hrVariability = calculateVariability(hrSamples);
    
    hrAnalysis = {
      avg_hr: Math.round(avgHR),
      max_hr: maxHR,
      min_hr: minHR,
      hr_range: hrRange,
      hr_variability: hrVariability.toFixed(2)
    };
  }

  // Determine data quality and focus
  const hasRIRData = rirAnalysis !== null;
  const hasHRData = hrAnalysis !== null;
  
  let dataQuality = 'insufficient';
  let focus = 'No data available';
  
  if (hasRIRData && hasHRData) {
    dataQuality = 'excellent';
    focus = 'RIR progression with HR response';
  } else if (hasRIRData) {
    dataQuality = 'good';
    focus = 'RIR progression analysis';
  } else if (hasHRData) {
    dataQuality = 'limited';
    focus = 'HR patterns only';
  }

  return {
    intensity: {
      rir_analysis: rirAnalysis,
      hr_analysis: hrAnalysis,
      data_quality: dataQuality,
      focus: focus
    },
    analysis: {
      workout_type: 'strength',
      primary_metric: hasRIRData ? 'RIR' : hasHRData ? 'HR' : 'none',
      data_quality: dataQuality,
      insights: generateStrengthInsights(rirAnalysis, hrAnalysis, hasRIRData, hasHRData)
    }
  };
}

/**
 * Generate strength-specific insights based on available data
 */
function generateStrengthInsights(rirAnalysis: any, hrAnalysis: any, hasRIR: boolean, hasHR: boolean): string[] {
  const insights: string[] = [];
  
  if (hasRIR) {
    insights.push(`RIR average: ${rirAnalysis.avg_rir} (range: ${rirAnalysis.min_rir}-${rirAnalysis.max_rir})`);
    insights.push(`RIR consistency: ${rirAnalysis.rir_consistency}% variation - ${rirAnalysis.rir_consistency < 20 ? 'very consistent' : 'some variation'}`);
    insights.push(`Fatigue pattern: ${rirAnalysis.intensity_progression} (${rirAnalysis.rir_fade} RIR change)`);
  }
  
  if (hasHR) {
    insights.push(`HR response: ${hrAnalysis.avg_hr} bpm avg, ${hrAnalysis.hr_range} bpm range`);
    insights.push(`HR variability: ${hrAnalysis.hr_variability}% - ${hrAnalysis.hr_variability < 15 ? 'steady' : 'variable'}`);
  }
  
  if (!hasRIR && !hasHR) {
    insights.push('No RIR or HR data available for analysis');
    insights.push('Consider logging RIR for each set to enable detailed analysis');
  }
  
  return insights;
}


/**
 * Analyze swim intensity from sensor data
 */
function analyzeSwimIntensity(sensorData: any[], computed: any, userBaselines: any): any {
  const hrSamples = sensorData
    .map(s => s.heartRate)
    .filter(hr => hr && hr > 0);

  if (hrSamples.length === 0) {
    return { intensity: 'unknown', analysis: 'No data available' };
  }

  const avgHR = hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length;
  
  let intensity: string | null = null;
  let analysis: string | null = null;

  if (userBaselines.max_hr) {
    const hrPercent = (avgHR / userBaselines.max_hr) * 100;
    
    if (hrPercent >= 85) {
      intensity = 'high';
      analysis = `High intensity (${hrPercent.toFixed(1)}% max HR)`;
    } else if (hrPercent >= 75) {
      intensity = 'moderate';
      analysis = `Moderate intensity (${hrPercent.toFixed(1)}% max HR)`;
    } else {
      intensity = 'low';
      analysis = `Low intensity (${hrPercent.toFixed(1)}% max HR)`;
    }
  }

  return { intensity, analysis };
}

/**
 * Basic analysis using computed data only - NO FALLBACKS
 */
function analyzeWorkoutFromComputed(workout: any, computed: any, userBaselines: any): any {
  // Return minimal structure - no fallbacks
  return {
    power_distribution: null,
    hr_responsiveness: null,
    pace_variability: null,
    normalized_metrics: null,
    intensity_analysis: null
  };
}

/**
 * =============================================================================
 * CALCULATE EXECUTION GRADE
 * =============================================================================
 * 
 * PURPOSE: Calculate overall workout execution grade based on analysis metrics
 * 
 * WHAT IT DOES:
 * - Starts with base score of 100 points
 * - Deducts points for poor adherence to planned workout
 * - Deducts points for poor pace/power consistency
 * - Deducts points for high HR drift (poor pacing)
 * - Deducts points for extreme power variability
 * - Converts final score to letter grade (A+ to F)
 * 
 * INPUT: 
 * - workout: Workout with computed execution data
 * - analysis: Comprehensive analysis object with all metrics
 * 
 * OUTPUT: Letter grade string ("A+", "A", "B+", "C", "F", etc.)
 */
function calculateExecutionGrade(workout: any, analysis: any): string {
  let score = 100;

  // Check adherence to planned workout
  if (workout.computed?.execution_score) {
    const adherence = workout.computed.execution_score;
    if (adherence < 80) score -= 20;
    else if (adherence < 90) score -= 10;
    else if (adherence >= 95) score += 5;
  }

  // Check consistency
  if (analysis.pace_variability?.consistency_score) {
    const consistency = analysis.pace_variability.consistency_score;
    if (consistency < 70) score -= 15;
    else if (consistency < 80) score -= 10;
    else if (consistency >= 90) score += 5;
  }

  // Check HR drift
  if (analysis.hr_responsiveness?.hr_drift_percent) {
    const drift = analysis.hr_responsiveness.hr_drift_percent;
    if (drift > 10) score -= 15;
    else if (drift > 5) score -= 10;
    else if (drift < 2) score += 5;
  }

  // Check power variability for bikes
  if (analysis.power_distribution?.power_variability) {
    const variability = analysis.power_distribution.power_variability;
    if (variability > 3.0) score -= 10; // Too much variability
    else if (variability < 1.5 && workout.type !== 'ride') score -= 5; // Too steady for intervals
  }

  // Convert score to grade
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D+';
  if (score >= 45) return 'D';
  return 'F';
}

/**
 * Generate quick insights using GPT-4
 */
async function generateQuickInsights(workout: any, analysis: any, userBaselines: any): Promise<string[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return ['Analysis completed', 'Check metrics below', 'No AI insights available'];
  }

  try {
    const prompt = `Analyze this ${workout.type} workout:

EXECUTION:
- Adherence: ${workout.computed?.execution_score || 'N/A'}%
- Duration: ${workout.duration || 'N/A'} minutes
- Distance: ${workout.distance || 'N/A'} km

QUALITY:
${analysis.pace_variability ? `- Pace consistency: ${analysis.pace_variability.consistency_score || 'N/A'}%` : ''}
${analysis.power_distribution ? `- Power variability: ${analysis.power_distribution.power_variability || 'N/A'}` : ''}
${analysis.hr_responsiveness ? `- HR drift: ${analysis.hr_responsiveness.hr_drift_percent || 'N/A'}%` : ''}

INTENSITY:
- Analysis: ${analysis.intensity_analysis?.analysis || 'Unknown'}

Provide 3 bullets:
1. Overall execution quality
2. Key strength
3. One thing to watch

Max 60 words total.`;

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
            content: 'Generate quick workout insights. Be concise. No emojis. Direct language only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Parse bullets from response
    const bullets = content.split('\n')
      .map(line => line.replace(/^[-•*]\s*/, '').trim())
      .filter(line => line.length > 0)
      .slice(0, 3);

    return bullets.length > 0 ? bullets : ['Analysis completed', 'Check metrics below', 'Review performance data'];

  } catch (error) {
    console.error('GPT-4 error:', error);
    return ['Analysis completed', 'Check metrics below', 'AI insights unavailable'];
  }
}

/**
 * Identify red flags in the analysis
 */
function identifyRedFlags(analysis: any): string[] {
  const flags: string[] = [];

  // HR drift red flags
  if (analysis.hr_responsiveness?.hr_drift_percent && analysis.hr_responsiveness.hr_drift_percent > 15) {
    flags.push('High HR drift (>15%) - possible dehydration or overexertion');
  }

  // Power variability red flags
  if (analysis.power_distribution?.power_variability && analysis.power_distribution.power_variability > 4.0) {
    flags.push('Extreme power variability (>4.0) - check pacing strategy');
  }

  // Pace consistency red flags
  if (analysis.pace_variability?.consistency_score && analysis.pace_variability.consistency_score < 60) {
    flags.push('Poor pace consistency (<60%) - focus on pacing');
  }

  // Recovery rate red flags
  if (analysis.hr_responsiveness?.recovery_rate && analysis.hr_responsiveness.recovery_rate < 10) {
    flags.push('Poor HR recovery (<10 bpm) - may need more rest');
  }

  return flags;
}

/**
 * Extract key metrics for display
 */
function extractKeyMetrics(analysis: any): any {
  return {
    power_distribution: analysis.power_distribution,
    hr_responsiveness: analysis.hr_responsiveness,
    pace_variability: analysis.pace_variability,
    normalized_metrics: analysis.normalized_metrics,
    intensity_analysis: analysis.intensity_analysis
  };
}

/**
 * Calculate power zones from samples
 */
function calculatePowerZones(powerSamples: number[], ftp: number): any {
  if (!ftp || powerSamples.length === 0) {
    return null;
  }

  const zones = {
    zone1: 0, // < 55% FTP
    zone2: 0, // 55-75% FTP
    zone3: 0, // 75-90% FTP
    zone4: 0, // 90-105% FTP
    zone5: 0  // > 105% FTP
  };

  powerSamples.forEach((power: number) => {
    const percent = (power / ftp) * 100;
    if (percent < 55) zones.zone1++;
    else if (percent < 75) zones.zone2++;
    else if (percent < 90) zones.zone3++;
    else if (percent < 105) zones.zone4++;
    else zones.zone5++;
  });

  // Convert to percentages
  const total = powerSamples.length;
  return {
    zone1: Math.round((zones.zone1 / total) * 100),
    zone2: Math.round((zones.zone2 / total) * 100),
    zone3: Math.round((zones.zone3 / total) * 100),
    zone4: Math.round((zones.zone4 / total) * 100),
    zone5: Math.round((zones.zone5 / total) * 100)
  };
}

// Helper functions

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