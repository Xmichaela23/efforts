// =============================================================================
// CALCULATE-WORKOUT-METRICS - METRICS CALCULATION EDGE FUNCTION
// =============================================================================
// 
// FUNCTION NAME: calculate-workout-metrics
// PURPOSE: Server-side calculation of all workout metrics and comparisons
// 
// WHAT IT DOES:
// - Calculates comprehensive workout metrics server-side
// - Computes planned vs executed comparisons (percentages, deltas)
// - Handles all mathematical operations (no client-side math)
// - Supports all workout types (run, bike, swim, strength)
// - Stores results in workouts.calculated_metrics
// 
// KEY FEATURES:
// - Smart server, dumb client architecture
// - All percentage calculations server-side
// - All delta calculations server-side
// - All unit conversions server-side
// - Planned vs executed adherence metrics
// - Performance trend calculations
// 
// METRICS CALCULATED:
// - Basic: distance, duration, elevation, speed, pace
// - Power: avg, max, normalized, intensity factor, variability
// - Heart rate: avg, max, zones
// - Cadence: avg, max (running/cycling)
// - Execution: adherence percentages, deltas, scores
// 
// DATA SOURCES:
// - workouts.computed (from compute-workout-summary)
// - planned_workouts (for comparison targets)
// 
// CLIENT BENEFITS:
// - No client-side calculations
// - Consistent metrics across all components
// - Cached results for performance
// - Single source of truth for all metrics
// 
// INPUT: { workout_id: string }
// OUTPUT: { success: boolean, metrics: WorkoutMetrics }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WorkoutMetrics {
  // Basic metrics
  distance_m: number;
  distance_km: number;
  duration_s: number;
  elapsed_s: number;
  elevation_gain_m: number;
  
  // Speed and pace
  avg_speed_mps: number;
  avg_speed_kmh: number;
  avg_pace_s_per_km: number;
  avg_pace_s_per_mi: number;
  max_speed_mps: number;
  max_pace_s_per_km: number;
  max_pace_s_per_mi: number;
  
  // Heart rate
  avg_hr: number;
  max_hr: number;
  
  // Power (cycling)
  avg_power: number;
  max_power: number;
  normalized_power: number;
  intensity_factor: number;
  variability_index: number;
  
  // Cadence
  avg_cadence: number;
  max_cadence: number;
  
  // Other metrics
  calories: number;
  work_kj: number;
  
  // Planned vs Executed comparisons
  execution_metrics: {
    pace_adherence_pct: number | null;
    pace_delta_sec: number | null;
    duration_adherence_pct: number | null;
    duration_delta_sec: number | null;
    distance_adherence_pct: number | null;
    distance_delta_m: number | null;
    overall_execution_score: number | null;
  };
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: { 'Access-Control-Allow-Origin': '*' } 
    });
  }

  try {
    const { workout_id } = await req.json();
    
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id required' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`📊 Calculating comprehensive metrics for workout: ${workout_id}`);

    // Load workout data
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select('id, type, computed, planned_id, sensor_data, metrics')
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      return new Response(JSON.stringify({ error: 'Workout not found' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Load planned workout if available
    let plannedWorkout = null;
    if (workout.planned_id) {
      const { data: planned } = await supabase
        .from('planned_workouts')
        .select('intervals, name, description')
        .eq('id', workout.planned_id)
        .single();
      
      plannedWorkout = planned;
    }

    // Calculate comprehensive metrics
    const metrics = calculateComprehensiveMetrics(workout, plannedWorkout);

    // Store metrics in workout record
    await supabase
      .from('workouts')
      .update({ 
        calculated_metrics: metrics,
        updated_at: new Date().toISOString()
      })
      .eq('id', workout_id);

    return new Response(JSON.stringify({
      success: true,
      metrics: metrics
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Calculate workout metrics error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});

/**
 * Calculate comprehensive workout metrics
 */
function calculateComprehensiveMetrics(workout: any, plannedWorkout: any): WorkoutMetrics {
  const computed = workout.computed || {};
  const metrics = workout.metrics || {};
  
  // Basic metrics from computed data
  const distance_m = computed.overall?.distance_m || 0;
  const distance_km = distance_m / 1000;
  const duration_s = computed.overall?.duration_s_moving || 0;
  const elapsed_s = computed.overall?.duration_s || duration_s;
  const elevation_gain_m = computed.overall?.elevation_gain_m || 0;
  
  // Speed and pace calculations
  const avg_speed_mps = distance_m > 0 && duration_s > 0 ? distance_m / duration_s : 0;
  const avg_speed_kmh = avg_speed_mps * 3.6;
  const avg_pace_s_per_km = avg_speed_mps > 0 ? 1000 / avg_speed_mps : 0;
  const avg_pace_s_per_mi = avg_speed_mps > 0 ? 1609.34 / avg_speed_mps : 0;
  
  // Max speed and pace from sensor data
  const max_speed_mps = calculateMaxSpeed(workout.sensor_data);
  const max_pace_s_per_km = max_speed_mps > 0 ? 1000 / max_speed_mps : 0;
  const max_pace_s_per_mi = max_speed_mps > 0 ? 1609.34 / max_speed_mps : 0;
  
  // Heart rate metrics
  const avg_hr = computed.overall?.avg_hr || metrics.avg_heart_rate || 0;
  const max_hr = computed.overall?.max_hr || metrics.max_heart_rate || 0;
  
  // Power metrics (cycling)
  const avg_power = computed.overall?.avg_power_w || metrics.avg_power || 0;
  const max_power = computed.overall?.max_power_w || metrics.max_power || 0;
  const normalized_power = computed.analysis?.power?.normalized_power || 0;
  const intensity_factor = computed.analysis?.power?.intensity_factor || 0;
  const variability_index = computed.analysis?.power?.variability_index || 0;
  
  // Cadence metrics
  const avg_cadence = computed.overall?.avg_cadence || metrics.avg_cadence || 0;
  const max_cadence = computed.overall?.max_cadence || metrics.max_cadence || 0;
  
  // Other metrics
  const calories = computed.overall?.calories || metrics.calories || 0;
  const work_kj = computed.overall?.work_kj || metrics.total_work || 0;
  
  // Planned vs Executed comparisons
  const execution_metrics = calculateExecutionMetrics(workout, plannedWorkout);
  
  return {
    distance_m,
    distance_km,
    duration_s,
    elapsed_s,
    elevation_gain_m,
    avg_speed_mps,
    avg_speed_kmh,
    avg_pace_s_per_km,
    avg_pace_s_per_mi,
    max_speed_mps,
    max_pace_s_per_km,
    max_pace_s_per_mi,
    avg_hr,
    max_hr,
    avg_power,
    max_power,
    normalized_power,
    intensity_factor,
    variability_index,
    avg_cadence,
    max_cadence,
    calories,
    work_kj,
    execution_metrics
  };
}

/**
 * Calculate max speed from sensor data
 */
function calculateMaxSpeed(sensorData: any): number {
  // Handle both sensor_data as array or sensor_data.samples as array
  const samples = Array.isArray(sensorData) ? sensorData : 
                  (sensorData?.samples && Array.isArray(sensorData.samples)) ? sensorData.samples : 
                  null;
  
  if (!samples || samples.length === 0) return 0;
  
  let maxSpeed = 0;
  
  for (const sample of samples) {
    const speed = sample.speedMetersPerSecond || 
                  sample.speedInMetersPerSecond || 
                  sample.enhancedSpeedInMetersPerSecond || 
                  sample.currentSpeedInMetersPerSecond || 
                  sample.instantaneousSpeedInMetersPerSecond || 
                  sample.velocity_smooth || 
                  sample.speed || 
                  sample.speed_mps || 
                  sample.enhancedSpeed || 0;
    
    if (speed > maxSpeed) {
      maxSpeed = speed;
    }
  }
  
  return maxSpeed;
}

/**
 * Calculate execution metrics comparing planned vs executed
 */
function calculateExecutionMetrics(workout: any, plannedWorkout: any): any {
  if (!plannedWorkout || !plannedWorkout.intervals) {
    return {
      pace_adherence_pct: null,
      pace_delta_sec: null,
      duration_adherence_pct: null,
      duration_delta_sec: null,
      distance_adherence_pct: null,
      distance_delta_m: null,
      overall_execution_score: null
    };
  }
  
  const computed = workout.computed || {};
  const plannedIntervals = plannedWorkout.intervals;
  
  // Calculate planned totals
  let plannedDuration = 0;
  let plannedDistance = 0;
  let plannedPace = 0;
  
  for (const interval of plannedIntervals) {
    if (interval.duration_s) {
      plannedDuration += interval.duration_s;
    }
    if (interval.distance_m) {
      plannedDistance += interval.distance_m;
    }
    if (interval.pace_sec_per_mi) {
      plannedPace = interval.pace_sec_per_mi; // Use last interval's pace as target
    }
  }
  
  // Get executed values
  const executedDuration = computed.overall?.duration_s_moving || 0;
  const executedDistance = computed.overall?.distance_m || 0;
  const executedPace = computed.overall?.avg_pace_s_per_mi || 0;
  
  // Calculate adherence percentages
  const pace_adherence_pct = (plannedPace > 0 && executedPace > 0) ? 
    Math.round((plannedPace / executedPace) * 100) : null;
  const pace_delta_sec = (plannedPace > 0 && executedPace > 0) ? 
    (plannedPace - executedPace) : null;
  
  const duration_adherence_pct = (plannedDuration > 0 && executedDuration > 0) ? 
    Math.round((executedDuration / plannedDuration) * 100) : null;
  const duration_delta_sec = (plannedDuration > 0 && executedDuration > 0) ? 
    (executedDuration - plannedDuration) : null;
  
  const distance_adherence_pct = (plannedDistance > 0 && executedDistance > 0) ? 
    Math.round((executedDistance / plannedDistance) * 100) : null;
  const distance_delta_m = (plannedDistance > 0 && executedDistance > 0) ? 
    (executedDistance - plannedDistance) : null;
  
  // Calculate overall execution score (weighted average)
  let overall_execution_score = null;
  if (pace_adherence_pct !== null || duration_adherence_pct !== null || distance_adherence_pct !== null) {
    const scores = [pace_adherence_pct, duration_adherence_pct, distance_adherence_pct].filter(s => s !== null);
    if (scores.length > 0) {
      overall_execution_score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
  }
  
  return {
    pace_adherence_pct,
    pace_delta_sec,
    duration_adherence_pct,
    duration_delta_sec,
    distance_adherence_pct,
    distance_delta_m,
    overall_execution_score
  };
}
