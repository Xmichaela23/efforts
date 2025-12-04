import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractSensorData } from '../../lib/analysis/sensor-data/extractor.ts';
import { generateIntervalBreakdown } from './lib/intervals/interval-breakdown.ts';
import { calculatePaceRangeAdherence } from './lib/adherence/pace-adherence.ts';
import { calculateIntervalHeartRate } from './lib/analysis/heart-rate.ts';
import { calculateIntervalElevation } from './lib/analysis/elevation.ts';
import { calculateHeartRateDrift } from './lib/analysis/heart-rate-drift.ts';

// =============================================================================
// ANALYZE-RUNNING-WORKOUT - RUNNING ANALYSIS EDGE FUNCTION
// =============================================================================
// 
// FUNCTION NAME: analyze-running-workout
// PURPOSE: Granular adherence analysis for running workouts
// 
// WHAT IT DOES:
// - Analyzes running workouts with prescribed pace/power ranges
// - Calculates time-in-prescribed-range (not just averages)
// - Provides interval-by-interval execution breakdown
// - Detects patterns: too fast, fading, inconsistent pacing
// - Provides descriptive performance assessment
// - Identifies specific issues and strengths
// 
// KEY FEATURES:
// - Uses prescribed ranges from planned_workouts.intervals
// - Time-based analysis (how much TIME spent in range)
// - Context-aware grading (stricter for intervals, lenient for warmup)
// - GPS spike and outlier detection
// - Gap handling and interpolation for sensor data
// - Fuzzy interval boundary matching
// 
// DATA SOURCES:
// - workouts.computed (from compute-workout-summary)
// - planned_workouts.intervals (prescribed pace/power ranges)
// 
// ANALYSIS OUTPUT:
// - adherence_percentage: % of time spent in prescribed ranges
// - interval_breakdown: per-interval execution quality
// - performance_assessment: descriptive text based on percentage
// - primary_issues: specific problems identified
// - strengths: positive execution patterns
// 
// INPUT: { workout_id: string }
// OUTPUT: { success: boolean, analysis: PrescribedRangeAdherence }
// =============================================================================

// Heart Rate Analysis Types
interface HeartRateZone {
  lower: number;
  upper: number;
  name: string;
}

interface HeartRateZones {
  zone1: HeartRateZone;
  zone2: HeartRateZone;
  zone3: HeartRateZone;
  zone4: HeartRateZone;
  zone5: HeartRateZone;
}

interface HeartRateAdherence {
  adherence_percentage: number;
  time_in_zone_s: number;
  time_outside_zone_s: number;
  total_time_s: number;
  samples_in_zone: number;
  samples_outside_zone: number;
  average_heart_rate: number;
  target_zone: HeartRateZone;
  hr_drift_bpm: number;
  hr_consistency: number;
}

// Pacing Variability Types
interface PacingVariability {
  coefficient_of_variation: number;
  avg_pace_change_per_min: number;
  num_surges: number;
  num_crashes: number;
  steadiness_score: number;
  avg_pace_change_seconds: number;
}

interface EnhancedAdherence {
  overall_adherence: number;
  time_in_range_score: number;
  variability_score: number;
  smoothness_score: number;
  pacing_variability: PacingVariability;
  time_in_range_s: number;
  time_outside_range_s: number;
  total_time_s: number;
  samples_in_range: number;
  samples_outside_range: number;
}

// Garmin-style execution scoring interfaces
type SegmentType = 'warmup' | 'cooldown' | 'work_interval' | 'tempo' | 'cruise_interval' | 'recovery_jog' | 'easy_run';

interface SegmentConfig {
  tolerance: number;
  weight: number;
}

interface SegmentPenalty {
  segment_idx: number;
  type: SegmentType;
  adherence: number;
  deviation: number;
  tolerance: number;
  base_penalty: number;
  direction_penalty: number;
  total_penalty: number;
  reason: string;
}

interface WorkoutExecutionAnalysis {
  overall_execution: number;
  pace_execution: number;
  duration_adherence: number;
  segment_summary: {
    work_intervals: {
      completed: number;
      total: number;
      avg_adherence: number;
      within_tolerance: number;
    };
    recovery_jogs: {
      completed: number;
      total: number;
      avg_adherence: number;
      below_target: number;
    };
    warmup: {
      adherence: number;
      status: 'good' | 'acceptable' | 'poor';
    };
    cooldown: {
      adherence: number;
      duration_pct: number;
      status: 'good' | 'acceptable' | 'poor';
    };
  };
  penalties: {
    total: number;
    by_segment: SegmentPenalty[];
  };
}

// Garmin-style execution scoring configuration
// Tolerance guidelines:
// - Quality/intervals: ±4-5% (tighter) - work_interval uses 5%
// - Easy/tempo: ±6-8% (looser) - tempo uses 7%, easy_run uses 8%
const SEGMENT_CONFIG: Record<SegmentType, SegmentConfig> = {
  warmup: { tolerance: 10, weight: 0.5 },
  cooldown: { tolerance: 10, weight: 0.3 },
  work_interval: { tolerance: 5, weight: 1.0 },
  tempo: { tolerance: 7, weight: 1.0 }, // ±7% for tempo (looser than intervals)
  cruise_interval: { tolerance: 5, weight: 0.9 },
  recovery_jog: { tolerance: 15, weight: 0.7 },
  easy_run: { tolerance: 8, weight: 0.6 }
};

/**
 * Infer segment type from interval data and planned step
 */
function inferSegmentType(segment: any, plannedStep: any, plannedWorkout?: any): SegmentType {
  const role = segment.role;
  const token = plannedStep?.token || '';
  
  if (role === 'warmup') return 'warmup';
  if (role === 'cooldown') return 'cooldown';
  if (role === 'recovery') return 'recovery_jog';
  
  if (role === 'work') {
    // Distinguish interval vs tempo vs cruise based on token patterns
    if (token.includes('interval_')) {
      return 'work_interval'; // Short, high intensity
    }
    if (token.includes('tempo_')) {
      return 'tempo'; // Sustained threshold effort
    }
    if (token.includes('cruise_')) {
      return 'cruise_interval'; // Between interval and tempo
    }
    
    // Check workout description for tempo keywords
    const workoutDesc = (plannedWorkout?.description || plannedWorkout?.name || '').toLowerCase();
    if (workoutDesc.includes('tempo') || workoutDesc.includes('threshold') || workoutDesc.includes('marathon pace')) {
      return 'tempo';
    }
    
    // Check planned step description
    const stepDesc = (plannedStep?.description || plannedStep?.label || '').toLowerCase();
    if (stepDesc.includes('tempo') || stepDesc.includes('threshold')) {
      return 'tempo';
    }
    
    // Infer from duration and distance
    const durationMin = segment.executed?.duration_s 
      ? segment.executed.duration_s / 60 
      : (segment.planned?.duration_s ? segment.planned.duration_s / 60 : 0);
    const distanceMi = segment.executed?.distance_m 
      ? segment.executed.distance_m / 1609.34
      : (segment.planned?.distance_m ? segment.planned.distance_m / 1609.34 : 0);
    
    // Tempo characteristics: long continuous effort
    // - Duration > 20 minutes OR
    // - Distance > 3 miles OR  
    // - Single long work segment (not multiple intervals)
    if (durationMin > 20 || distanceMi > 3) {
      return 'tempo'; // Long sustained effort = tempo
    }
    
    if (durationMin <= 8) {
      return 'work_interval'; // Short = interval
    }
    
    // Default for medium-length work: check if it's part of intervals (multiple work segments)
    // If this is the only work segment or one of few, likely tempo
    // Otherwise, default to interval
    return 'tempo'; // Default to tempo for ambiguous cases (safer - wider tolerance)
  }
  
  return 'easy_run'; // Default fallback
}

/**
 * Get appropriate pace tolerance based on segment type
 * Quality/intervals: ±4-5% (tighter)
 * Easy/tempo: ±6-8% (looser)
 */
function getPaceToleranceForSegment(interval: any, plannedStep: any, plannedWorkout?: any): number {
  const segmentType = inferSegmentType(interval, plannedStep, plannedWorkout);
  const config = SEGMENT_CONFIG[segmentType];
  
  // Convert tolerance percentage to decimal (e.g., 5% -> 0.05)
  // SEGMENT_CONFIG has tolerance as percentage, but we need decimal for multiplication
  const tolerancePercent = config?.tolerance || 5; // Default to 5% if unknown
  
  // Debug logging for tempo detection
  if (interval.role === 'work') {
    const workoutName = plannedWorkout?.name || plannedWorkout?.description || 'unknown';
    const distanceMi = interval.executed?.distance_m 
      ? interval.executed.distance_m / 1609.34
      : (interval.planned?.distance_m ? interval.planned.distance_m / 1609.34 : 0);
    const durationMin = interval.executed?.duration_s 
      ? interval.executed.duration_s / 60 
      : (interval.planned?.duration_s ? interval.planned.duration_s / 60 : 0);
    console.log(`🔍 [TEMPO DETECT] Work segment: type=${segmentType}, tolerance=${tolerancePercent}%, workout="${workoutName}", distance=${distanceMi.toFixed(1)}mi, duration=${durationMin.toFixed(1)}min`);
  }
  
  return tolerancePercent / 100; // Convert to decimal
}

/**
 * Calculate directional penalty for wrong stimulus direction
 */
function getDirectionalPenalty(segment: any, adherence: number): number {
  const type = segment.type;
  
  // Too slow on work = missed training stimulus
  if (['work_interval', 'tempo', 'cruise_interval'].includes(type)) {
    if (adherence < 95) return 5;  // Significantly too slow
    if (adherence > 110) return 3; // Significantly too fast
  }
  
  // Too slow on recovery = poor execution/fatigue
  if (type === 'recovery_jog') {
    if (adherence < 85) return 3; // Way too slow (walking)
    if (adherence > 110) return 2; // Too fast (not recovering)
  }
  
  // Too slow on easy runs = okay, too fast = not easy enough
  if (type === 'easy_run') {
    if (adherence > 115) return 2; // Way too fast for easy
  }
  
  return 0; // No directional penalty
}

/**
 * Calculate penalty for a single segment
 */
function calculateSegmentPenalty(segment: any, config: SegmentConfig, segmentIdx: number): SegmentPenalty {
  const adherence = segment.executed?.adherence_percentage || 100;
  const { tolerance, weight } = config;
  
  // Absolute deviation from target
  const deviation = Math.abs(adherence - 100);
  
  // Within tolerance = no penalty
  if (deviation <= tolerance) {
    return {
      segment_idx: segmentIdx,
      type: segment.type,
      adherence,
      deviation,
      tolerance,
      base_penalty: 0,
      direction_penalty: 0,
      total_penalty: 0,
      reason: `Within ${tolerance}% tolerance`
    };
  }
  
  // Base penalty for excess deviation
  const excessDeviation = deviation - tolerance;
  const basePenalty = excessDeviation * weight;
  
  // Directional penalty for wrong stimulus
  const directionPenalty = getDirectionalPenalty(segment, adherence);
  
  const totalPenalty = basePenalty + directionPenalty;
  
  return {
    segment_idx: segmentIdx,
    type: segment.type,
    adherence,
    deviation,
    tolerance,
    base_penalty: basePenalty,
    direction_penalty: directionPenalty,
    total_penalty: totalPenalty,
    reason: generatePenaltyReason(segment, adherence, config, excessDeviation, directionPenalty)
  };
}

/**
 * Generate human-readable penalty reason
 */
function generatePenaltyReason(segment: any, adherence: number, config: SegmentConfig, excessDeviation: number, directionPenalty: number): string {
  const type = segment.type;
  const plannedLabel = segment.planned_label || `Segment ${segment.segment_idx + 1}`;
  
  let reason = `${plannedLabel}: ${adherence}% adherence (${excessDeviation.toFixed(1)}% beyond ${config.tolerance}% tolerance)`;
  
  if (directionPenalty > 0) {
    if (adherence < 95 && ['work_interval', 'tempo', 'cruise_interval'].includes(type)) {
      reason += ' + too slow penalty';
    } else if (adherence > 110 && ['work_interval', 'tempo', 'cruise_interval'].includes(type)) {
      reason += ' + too fast penalty';
    } else if (adherence < 85 && type === 'recovery_jog') {
      reason += ' + poor recovery penalty';
    } else if (adherence > 110 && type === 'recovery_jog') {
      reason += ' + not recovering penalty';
    }
  }
  
  return reason;
}

/**
 * Calculate Garmin-style execution score using penalty-based system
 */
function calculateGarminExecutionScore(segments: any[], plannedWorkout: any): WorkoutExecutionAnalysis {
  console.log('🏃‍♂️ Calculating Garmin-style execution score for', segments.length, 'segments');
  
  const penalties: SegmentPenalty[] = [];
  let totalPenalty = 0;
  
  // Add segment type inference to each segment
  const segmentsWithTypes = segments.map((segment, idx) => {
    const plannedStep = plannedWorkout?.computed?.steps?.[idx] || {};
    const segmentType = inferSegmentType(segment, plannedStep, plannedWorkout);
    return {
      ...segment,
      type: segmentType,
      segment_idx: idx
    };
  });
  
  // Calculate penalties for each segment
  segmentsWithTypes.forEach((segment, idx) => {
    const config = SEGMENT_CONFIG[segment.type];
    const penalty = calculateSegmentPenalty(segment, config, idx);
    
    if (penalty.total_penalty > 0) {
      penalties.push(penalty);
      totalPenalty += penalty.total_penalty;
      console.log(`⚠️ Penalty for ${segment.planned_label || `Segment ${idx + 1}`}: ${penalty.total_penalty.toFixed(1)} (${penalty.reason})`);
    }
  });
  
  // Execution score: 100 minus penalties, floor at 0
  const executionScore = Math.max(0, Math.round(100 - totalPenalty));
  
  // Calculate duration adherence (keep existing logic)
  const withDuration = segments.filter((i: any) => 
    i.executed && i.planned && i.planned.duration_s
  );
  
  let durationAdherence = 100;
  if (withDuration.length > 0) {
    const plannedTotal = withDuration.reduce((sum: number, i: any) => 
      sum + i.planned.duration_s, 0
    );
    const actualTotal = withDuration.reduce((sum: number, i: any) => 
      sum + i.executed.duration_s, 0
    );
    
    durationAdherence = Math.round(Math.min(100, (actualTotal / plannedTotal) * 100));
  }
  
  // Generate segment summaries
  const workIntervals = segmentsWithTypes.filter(s => s.type === 'work_interval');
  const recoveryJogs = segmentsWithTypes.filter(s => s.type === 'recovery_jog');
  const warmup = segmentsWithTypes.find(s => s.type === 'warmup');
  const cooldown = segmentsWithTypes.find(s => s.type === 'cooldown');
  
  const segmentSummary = {
    work_intervals: {
      completed: workIntervals.filter(s => s.executed).length,
      total: workIntervals.length,
      avg_adherence: workIntervals.length > 0 ? 
        Math.round(workIntervals.reduce((sum, s) => sum + (s.executed?.adherence_percentage || 100), 0) / workIntervals.length) : 100,
      within_tolerance: workIntervals.filter(s => {
        const adherence = s.executed?.adherence_percentage || 100;
        const deviation = Math.abs(adherence - 100);
        return deviation <= SEGMENT_CONFIG.work_interval.tolerance;
      }).length
    },
    recovery_jogs: {
      completed: recoveryJogs.filter(s => s.executed).length,
      total: recoveryJogs.length,
      avg_adherence: recoveryJogs.length > 0 ? 
        Math.round(recoveryJogs.reduce((sum, s) => sum + (s.executed?.adherence_percentage || 100), 0) / recoveryJogs.length) : 100,
      below_target: recoveryJogs.filter(s => {
        const adherence = s.executed?.adherence_percentage || 100;
        return adherence < 85; // Significantly below target
      }).length
    },
    warmup: {
      adherence: warmup?.executed?.adherence_percentage || 100,
      status: (warmup && warmup.executed?.adherence_percentage > 90 && warmup.executed?.adherence_percentage < 110 ? 'good' : 'acceptable') as 'good' | 'acceptable' | 'poor'
    },
    cooldown: {
      adherence: cooldown?.executed?.adherence_percentage || 100,
      duration_pct: cooldown ? (cooldown.executed?.duration_s / cooldown.planned?.duration_s) * 100 : 100,
      status: (cooldown && cooldown.executed?.adherence_percentage > 90 && cooldown.executed?.adherence_percentage < 110 ? 'good' : 'acceptable') as 'good' | 'acceptable' | 'poor'
    }
  };
  
  console.log(`✅ Garmin execution analysis complete: ${executionScore}% execution, ${penalties.length} penalties`);
  
  return {
    overall_execution: executionScore,
    pace_execution: executionScore, // Same as overall since pace is main factor
    duration_adherence: durationAdherence,
    segment_summary: segmentSummary,
    penalties: {
      total: totalPenalty,
      by_segment: penalties
    }
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Declare workout_id outside try block so it's accessible in catch
  let workout_id: string | undefined;
  
  try {
    const body = await req.json();
    workout_id = body.workout_id;
    
    if (!workout_id) {
      return new Response(JSON.stringify({
        error: 'workout_id is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    console.log(`🏃‍♂️ Analyzing running workout: ${workout_id}`);
    console.log('🆕 NEW VERSION: Checking time_series_data and garmin_data for pace data');
    console.log('🔍 [MAIN DEBUG] Starting analysis for workout:', workout_id);

    // Set analysis status to 'analyzing' at start
    const { error: statusError } = await supabase
      .from('workouts')
      .update({ 
        analysis_status: 'analyzing',
        analysis_error: null 
      })
      .eq('id', workout_id);

    if (statusError) {
      console.warn('⚠️ Failed to set analyzing status:', statusError.message);
    }

    // Get workout data
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select(`
        id,
        type,
        sensor_data,
        computed,
        time_series_data,
        garmin_data,
        planned_id,
        user_id,
        moving_time,
        duration,
        elapsed_time,
        total_timer_time,
        distance,
        weather_data,
        avg_temperature
      `)
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message}`);
    }

    console.log('🔍 Available data sources:', {
      time_series_data: !!workout.time_series_data,
      garmin_data: !!workout.garmin_data,
      computed: !!workout.computed,
      sensor_data: !!workout.sensor_data
    });
    
    console.log('🔍 Workout summary fields:', {
      distance: workout.distance,
      moving_time: workout.moving_time,
      duration: workout.duration,
      type: workout.type
    });

    if (workout.type !== 'run' && workout.type !== 'running') {
      throw new Error(`Workout type ${workout.type} is not supported for running analysis`);
    }

    if (!workout.sensor_data && !workout.computed) {
      throw new Error('No sensor data or computed data available. Workout may not have been processed yet.');
    }

    // Get user baselines first (needed for both planned and unplanned workouts)
    let baselines = {};
    let userUnits = 'imperial'; // default
    try {
      const { data: userBaselines } = await supabase
        .from('user_baselines')
        .select('performance_numbers, units')
        .eq('user_id', workout.user_id)
        .single();
      
      if (userBaselines?.units === 'metric' || userBaselines?.units === 'imperial') {
        userUnits = userBaselines.units;
      }
      baselines = userBaselines?.performance_numbers || {};
      console.log('📊 User baselines found:', baselines);
    } catch (error) {
      console.log('⚠️ No user baselines found, using defaults');
      // Use default baselines for analysis
      baselines = {
        fiveK_pace: 450, // 7:30/mi
        easyPace: 540,   // 9:00/mi
        tenK_pace: 480,  // 8:00/mi
        marathon_pace: 600 // 10:00/mi
      };
    }

    // Get planned workout data with token parsing support
    let plannedWorkout = null;
    let intervals = [];
    
    if (workout.planned_id) {
      const { data: planned, error: plannedError } = await supabase
        .from('planned_workouts')
        .select('id, intervals, steps_preset, computed, total_duration_seconds, description, tags, training_plan_id, user_id')
        .eq('id', workout.planned_id)
        .eq('user_id', workout.user_id) // Authorization: verify planned workout belongs to user
        .single();

      if (plannedError) {
        console.warn('⚠️ Could not load planned workout:', plannedError.message);
      } else {
        plannedWorkout = planned;

        // ✅ FIRST: Try to use planned_steps_light snapshot (taken when workout completed)
        // This is critical because the planned workout may have been regenerated with new IDs
        if (workout?.computed?.planned_steps_light && Array.isArray(workout.computed.planned_steps_light)) {
          console.log('🏃 Using planned_steps_light snapshot from completed workout...');
          
          // Use snapshot directly - it's the source of truth
          // But enrich with pace_range from the full planned workout
          const plannedSteps = workout.computed.planned_steps_light.map((snap: any) => {
            // Find the full step data from the planned workout to get pace_range
            const fullStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === snap.planned_step_id);
            
            return {
              id: snap.planned_step_id,      // ✅ Matches completed intervals
              kind: snap.kind,
              seconds: snap.seconds,
              distanceMeters: snap.meters,
              planned_index: snap.planned_index,
              pace_range: fullStep?.pace_range || snap.pace_range || null
            };
          });
          
          intervals = plannedSteps.map((step: any, idx: number) => ({
            id: step.id,
            type: step.kind,
            kind: step.kind,
            role: step.kind,
            duration_s: step.seconds,
            duration: step.seconds,
            distance_m: step.distanceMeters,
            distance: step.distanceMeters,
            target_pace: step.pace_range ? {
              lower: step.pace_range.lower,
              upper: step.pace_range.upper
            } : null,
            pace_range: step.pace_range ? {
              lower: step.pace_range.lower,
              upper: step.pace_range.upper
            } : null,
            step_index: step.planned_index !== undefined ? step.planned_index : idx,
            planned_index: step.planned_index !== undefined ? step.planned_index : idx
          }));
          
          // ✅ Enrich with execution data from computed intervals - match by snapshot ID
          intervals = intervals.map(planned => {
            const computedInterval = workout?.computed?.intervals?.find(exec => 
              exec.planned_step_id === planned.id
            );
            
            console.log(`🔍 Matching snapshot id=${planned.id}:`, {
              foundMatch: !!computedInterval,
              hasExecuted: !!computedInterval?.executed
            });
            
            return {
              ...planned,
              executed: computedInterval?.executed || null,
              sample_idx_start: computedInterval?.sample_idx_start,
              sample_idx_end: computedInterval?.sample_idx_end,
              hasExecuted: !!computedInterval?.executed
            };
          });
        } else if (plannedWorkout.computed?.steps && Array.isArray(plannedWorkout.computed.steps)) {
          console.log('🏃 Using computed.steps from materialization...');
          
          // Convert materialized steps to intervals format
          const materializedSteps = plannedWorkout.computed.steps.map((step: any, idx: number) => ({
            id: step.id, // ✅ CRITICAL: Include the UUID for matching
            type: step.kind || step.type,
            kind: step.kind || step.type,
            role: step.kind || step.type,
            duration_s: step.seconds,
            duration: step.seconds,
            distance_m: step.distanceMeters,
            distance: step.distanceMeters,
            target_pace: step.pace_range ? {
              lower: step.pace_range.lower,
              upper: step.pace_range.upper
            } : null,
            pace_range: step.pace_range ? {
              lower: step.pace_range.lower,
              upper: step.pace_range.upper
            } : null,
            step_index: step.planned_index !== undefined ? step.planned_index : idx,
            planned_index: step.planned_index !== undefined ? step.planned_index : idx
          }));
          
          intervals = materializedSteps;
          
          // ✅ Enrich with execution data from computed intervals
          // Match by UUID (planned_step_id) instead of step_index
          intervals = materializedSteps.map(planned => {
            // Find matching executed interval by UUID
            const computedInterval = workout?.computed?.intervals?.find(exec => 
              exec.planned_step_id === planned.id
            );
            
            console.log(`🔍 Matching planned.id=${planned.id} with intervals:`, {
              foundMatch: !!computedInterval,
              planned_step_id: computedInterval?.planned_step_id,
              hasExecuted: !!computedInterval?.executed
            });
            
            return {
              ...planned,
              executed: computedInterval?.executed || null,
              sample_idx_start: computedInterval?.sample_idx_start,
              sample_idx_end: computedInterval?.sample_idx_end,
              hasExecuted: !!computedInterval?.executed
            };
          });
        } else if (plannedWorkout.intervals && Array.isArray(plannedWorkout.intervals)) {
          console.log('🏃 Using actual planned intervals from database...');
          
          // Use the actual planned intervals with their real ranges
          const actualPlannedIntervals = plannedWorkout.intervals.map((interval: any) => ({
            type: interval.type || interval.kind,
            kind: interval.kind || interval.type,
            role: interval.role || interval.kind || interval.type,
            duration: interval.duration_s,
            duration_s: interval.duration_s,
            distance: interval.distance_m,
            distance_m: interval.distance_m,
            target_pace: interval.pace_range ? {
              lower: interval.pace_range.lower,
              upper: interval.pace_range.upper
            } : null,
            pace_range: interval.pace_range ? {
              lower: interval.pace_range.lower,
              upper: interval.pace_range.upper
            } : null,
            step_index: interval.step_index || null
          }));
          
          intervals = actualPlannedIntervals;
          
          // ✅ Enrich with execution data from computed intervals
          intervals = actualPlannedIntervals.map(planned => {
            // Find matching executed interval
            const computedInterval = workout?.computed?.intervals?.find(exec => 
              exec.step_index === planned.step_index ||
              (exec.role === planned.role && exec.kind === planned.kind)
            );
            
            return {
              ...planned,
              executed: computedInterval?.executed || null,
              sample_idx_start: computedInterval?.sample_idx_start,
              sample_idx_end: computedInterval?.sample_idx_end,
              hasExecuted: !!computedInterval?.executed
            };
          });
        } else if (plannedWorkout.steps_preset && plannedWorkout.steps_preset.length > 0) {
          console.log('🏃 Fallback: Parsing steps_preset tokens...');
          try {
            // Import the token parser
            const { parseRunningTokens } = await import('./token-parser.ts');
            const parsedStructure = parseRunningTokens(plannedWorkout.steps_preset, baselines);
            
            // Convert parsed segments to clean planned intervals format
            const parsedIntervals = parsedStructure.segments.map((segment: any) => ({
              type: segment.type,
              kind: segment.type,
              role: segment.type === 'work' ? 'work' : segment.type,
              duration: segment.duration,
              duration_s: segment.duration,
              distance: segment.distance,
              distance_m: segment.distance,
              target_pace: segment.target_pace,
              pace_range: segment.target_pace ? {
                lower: segment.target_pace.lower,
                upper: segment.target_pace.upper
              } : null,
              step_index: segment.step_index || null
            }));
            
            intervals = parsedIntervals;
            
            // ✅ Then enrich with execution data from computed intervals
            intervals = parsedIntervals.map(planned => {
              // Find matching executed interval
              const computedInterval = workout?.computed?.intervals?.find(exec => 
                exec.step_index === planned.step_index ||
                (exec.role === planned.role && exec.kind === planned.kind)
              );
              
              return {
                ...planned,
                executed: computedInterval?.executed || null,
                sample_idx_start: computedInterval?.sample_idx_start,  // ✅ ADD
                sample_idx_end: computedInterval?.sample_idx_end,      // ✅ ADD
                hasExecuted: !!computedInterval?.executed
              };
            });
            
            console.log(`✅ Parsed ${intervals.length} intervals from tokens`);
            console.log(`✅ Enriched with execution data from computed`);
            console.log(`🔍 DEBUG: Intervals after enrichment:`, intervals.map(i => ({
              role: i.role,
              hasPlanned: !!i.target_pace,
              hasExecuted: i.hasExecuted,
              plannedPace: i.target_pace?.lower ? `${i.target_pace.lower}-${i.target_pace.upper}` : 'N/A',
              executedPace: i.executed?.avg_pace_s_per_mi || 'N/A',
              plannedDuration: i.duration_s,
              executedDuration: i.executed?.duration_s
            })));
          } catch (error) {
            console.warn('⚠️ Token parsing failed, using computed intervals:', error);
            // Fallback to computed intervals
            intervals = workout.computed?.intervals || plannedWorkout.intervals || [];
            console.log(`🔍 Using computed intervals: ${intervals.length} intervals found`);
            console.log(`🔍 [DEBUG] First interval structure:`, JSON.stringify(intervals[0], null, 2));
          }
        } else {
          // Use computed intervals from the completed workout if no planned workout
          intervals = workout.computed?.intervals || plannedWorkout.intervals || [];
          console.log(`🔍 No tokens found, using computed intervals: ${intervals.length} intervals found`);
          console.log(`🔍 [DEBUG] First interval structure:`, JSON.stringify(intervals[0], null, 2));
        }
      }
    }

    if (!intervals || intervals.length === 0) {
      // Create reasonable pace targets for unplanned workouts using user baselines
      console.log('🏃 No planned workout found, creating pace targets from baselines');
      
      // Determine workout type based on duration and pace
      const workoutDuration = workout.moving_time || workout.duration || 0;
      const avgPace = workout.computed?.overall?.avg_pace_s_per_mi || 0;
      
      let targetPace = baselines.easyPace || 540; // Default to easy pace
      let workoutType = 'easy_run';
      
      if (workoutDuration > 3600) { // > 1 hour
        workoutType = 'long_run';
        targetPace = baselines.marathon_pace || 600;
      } else if (workoutDuration > 1800) { // 30-60 minutes
        workoutType = 'tempo_run';
        targetPace = baselines.tenK_pace || 480;
      } else if (workoutDuration < 900) { // < 15 minutes
        workoutType = 'interval_run';
        targetPace = baselines.fiveK_pace || 450;
      }
      
      // Create a single interval for the entire workout
      intervals = [{
        id: 'unplanned_interval',
        type: workoutType,
        duration_s: workoutDuration,
        pace_range: {
          lower: targetPace * 0.95, // 5% below target
          upper: targetPace * 1.05  // 5% above target
        }
      }];
      
      console.log(`🎯 Created pace target for ${workoutType}: ${targetPace}s/mi (${Math.floor(targetPace/60)}:${String(targetPace%60).padStart(2,'0')}/mi)`);
    }

    // Extract sensor data - try different data sources
    let sensorData = [];
    
    // Try time_series_data first (most likely to have pace data)
    if (workout.time_series_data) {
      console.log('🔍 Trying time_series_data first...');
      sensorData = extractSensorData(workout.time_series_data);
      console.log(`📊 time_series_data yielded ${sensorData.length} samples`);
    }
    
    // Try garmin_data if time_series_data doesn't work
    if (sensorData.length === 0 && workout.garmin_data) {
      console.log('🔍 Trying garmin_data...');
      sensorData = extractSensorData(workout.garmin_data);
      console.log(`📊 garmin_data yielded ${sensorData.length} samples`);
    }
    
    // Try computed data
    if (sensorData.length === 0 && workout.computed) {
      console.log('🔍 Trying computed data...');
      sensorData = extractSensorData(workout.computed);
      console.log(`📊 computed data yielded ${sensorData.length} samples`);
    }
    
    // Try sensor_data as last resort
    if (sensorData.length === 0 && workout.sensor_data) {
      console.log('🔍 Trying sensor_data as fallback...');
      sensorData = extractSensorData(workout.sensor_data);
      console.log(`📊 sensor_data yielded ${sensorData.length} samples`);
    }
    
    if (!sensorData || sensorData.length === 0) {
      // Return a meaningful response instead of crashing
      return new Response(JSON.stringify({
        success: true,
        analysis: {
          adherence_percentage: 0,
          performance_assessment: 'Unable to assess',
          primary_issues: ['No sensor data available - workout may not have been processed yet'],
          strengths: [],
          workout_type: 'long_run',
          time_in_range_s: 0,
          time_outside_range_s: 0
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Use computed.intervals as the base (already has matched executed data)
    // Enhance with pace ranges from planned workout
    const computedIntervals = workout?.computed?.intervals || [];
    console.log(`🔍 Using ${computedIntervals.length} computed intervals as base`);
    
    // Enrich intervals with pace ranges from planned workout
    const intervalsToAnalyze = computedIntervals.map(interval => {
      // Find matching step in planned workout to get pace_range
      const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
      
      // Add pace_range to interval if not already present
      if (plannedStep?.pace_range && !interval.pace_range && !interval.target_pace) {
        // ✅ FIX: Check for zero-width range
        if (plannedStep.pace_range.lower === plannedStep.pace_range.upper && plannedStep.pace_range.lower > 0) {
          const singlePace = plannedStep.pace_range.lower;
          const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
          const lower = Math.round(singlePace * (1 - tolerance));
          const upper = Math.round(singlePace * (1 + tolerance));
          console.log(`⚠️ [FIX] Expanded zero-width range ${singlePace}-${singlePace} to ${lower}-${upper}s/mi`);
          return {
            ...interval,
            pace_range: { lower, upper },
            target_pace: { lower, upper }
          };
        }
        
        // ✅ FIX: Check for asymmetric/too-tight ranges (e.g., 2% tolerance when should be 6-8%)
        // Detect if range is too tight by checking if it's less than expected tolerance
        const rangeWidth = plannedStep.pace_range.upper - plannedStep.pace_range.lower;
        const midpoint = (plannedStep.pace_range.lower + plannedStep.pace_range.upper) / 2;
        const actualTolerance = rangeWidth / midpoint;
        const expectedTolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
        
        // If actual tolerance is less than 60% of expected, recalculate with proper tolerance
        // This catches cases where materialize-plan used 2% but should have used 6-8% for tempo
        // ✅ CRITICAL: Use planned.target_pace_s_per_mi as center (workout-specific pace) instead of midpoint (baseline)
        if (actualTolerance < expectedTolerance * 0.6 && midpoint > 0) {
          const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
          // Priority: Use planned target pace (workout-specific) over range midpoint (baseline)
          // Check multiple possible locations for the planned pace
          const plannedPaceFromInterval = interval.planned?.target_pace_s_per_mi;
          const plannedPaceFromStep = plannedStep?.pace_sec_per_mi;
          const centerPace = plannedPaceFromInterval || 
                             plannedPaceFromStep || 
                             midpoint;
          
          console.log(`🔍 [CENTER DEBUG] Recalculating range - interval.planned.target_pace_s_per_mi=${plannedPaceFromInterval}, plannedStep.pace_sec_per_mi=${plannedPaceFromStep}, midpoint=${midpoint}, using centerPace=${centerPace}`);
          
          const lower = Math.round(centerPace * (1 - tolerance));
          const upper = Math.round(centerPace * (1 + tolerance));
          console.log(`⚠️ [FIX] Recalculated too-tight range ${plannedStep.pace_range.lower}-${plannedStep.pace_range.upper}s/mi (${(actualTolerance*100).toFixed(1)}% tolerance) to ${lower}-${upper}s/mi (${(tolerance*100).toFixed(1)}% tolerance) centered on ${centerPace}s/mi`);
          return {
            ...interval,
            pace_range: { lower, upper },
            target_pace: { lower, upper }
          };
        }
        
        return {
          ...interval,
          pace_range: plannedStep.pace_range,
          target_pace: {
            lower: plannedStep.pace_range.lower,
            upper: plannedStep.pace_range.upper
          }
        };
      }
      
      // ✅ FIX: If interval has planned.target_pace_s_per_mi but no range, create range with appropriate tolerance
      const singlePace = interval.planned?.target_pace_s_per_mi;
      if (singlePace && !interval.pace_range?.lower && !interval.target_pace?.lower) {
        const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
        const lower = Math.round(singlePace * (1 - tolerance));
        const upper = Math.round(singlePace * (1 + tolerance));
        return {
          ...interval,
          pace_range: { lower, upper },
          target_pace: { lower, upper }
        };
      }
      
      // ✅ FIX: Check if pace_range exists but has zero width (lower === upper)
      if (interval.pace_range?.lower === interval.pace_range?.upper && interval.pace_range?.lower > 0) {
        const singlePace = interval.pace_range.lower;
        const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
        const lower = Math.round(singlePace * (1 - tolerance));
        const upper = Math.round(singlePace * (1 + tolerance));
        console.log(`⚠️ [FIX] Expanded zero-width pace_range ${singlePace}-${singlePace} to ${lower}-${upper}s/mi`);
        return {
          ...interval,
          pace_range: { lower, upper },
          target_pace: { lower, upper }
        };
      }
      
      // ✅ FIX: Check for asymmetric/too-tight ranges in existing pace_range
      if (interval.pace_range?.lower && interval.pace_range?.upper && interval.pace_range.lower < interval.pace_range.upper) {
        const rangeWidth = interval.pace_range.upper - interval.pace_range.lower;
        const midpoint = (interval.pace_range.lower + interval.pace_range.upper) / 2;
        const actualTolerance = rangeWidth / midpoint;
        const expectedTolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
        
        // If actual tolerance is less than 60% of expected, recalculate with proper tolerance
        // ✅ CRITICAL: Use planned.target_pace_s_per_mi as center (workout-specific pace) instead of midpoint (baseline)
        if (actualTolerance < expectedTolerance * 0.6 && midpoint > 0) {
          const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
          // Priority: Use planned target pace (workout-specific) over range midpoint (baseline)
          // Check multiple possible locations for the planned pace
          const plannedPaceFromInterval = interval.planned?.target_pace_s_per_mi;
          const plannedPaceFromStep = plannedStep?.pace_sec_per_mi;
          const centerPace = plannedPaceFromInterval || 
                             plannedPaceFromStep || 
                             midpoint;
          
          console.log(`🔍 [CENTER DEBUG] Recalculating pace_range - interval.planned.target_pace_s_per_mi=${plannedPaceFromInterval}, plannedStep.pace_sec_per_mi=${plannedPaceFromStep}, midpoint=${midpoint}, using centerPace=${centerPace}`);
          
          const lower = Math.round(centerPace * (1 - tolerance));
          const upper = Math.round(centerPace * (1 + tolerance));
          console.log(`⚠️ [FIX] Recalculated too-tight pace_range ${interval.pace_range.lower}-${interval.pace_range.upper}s/mi (${(actualTolerance*100).toFixed(1)}% tolerance) to ${lower}-${upper}s/mi (${(tolerance*100).toFixed(1)}% tolerance) centered on ${centerPace}s/mi`);
          return {
            ...interval,
            pace_range: { lower, upper },
            target_pace: { lower, upper }
          };
        }
      }
      
      // ✅ FIX: Check target_pace object for zero width
      if (interval.target_pace?.lower === interval.target_pace?.upper && interval.target_pace?.lower > 0) {
        const singlePace = interval.target_pace.lower;
        const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
        const lower = Math.round(singlePace * (1 - tolerance));
        const upper = Math.round(singlePace * (1 + tolerance));
        console.log(`⚠️ [FIX] Expanded zero-width target_pace ${singlePace}-${singlePace} to ${lower}-${upper}s/mi`);
        return {
          ...interval,
          pace_range: { lower, upper },
          target_pace: { lower, upper }
        };
      }
      
      return interval;
    });
    
    console.log('🔍 [CRITICAL DEBUG] intervalsToAnalyze structure:', intervalsToAnalyze.map(i => ({
      role: i.role,
      hasTargetPace: !!i.target_pace,
      hasPaceRange: !!i.pace_range,
      hasPlannedPaceRange: !!i.planned?.pace_range,
      targetPace: i.target_pace,
      paceRange: i.pace_range
    })));
    
    // Perform granular adherence analysis
    console.log('🚀 [TIMING] Starting calculatePrescribedRangeAdherenceGranular...');
    const analysis = calculatePrescribedRangeAdherenceGranular(sensorData, intervalsToAnalyze, workout, plannedWorkout);
    console.log('✅ [TIMING] Granular analysis completed!');

    // Add data quality information to analysis
    const enhancedAnalysis = {
      ...analysis,
      data_quality: {
        confidence_level: sensorData.length > 0 ? sensorData[0].data_quality?.confidence_level || 'unknown' : 'unknown',
        data_source_breakdown: {
          device_speed_samples: sensorData.filter(s => s.data_source === 'device_speed').length,
          cumulative_distance_samples: sensorData.filter(s => s.data_source === 'cumulative_distance').length,
          gps_calculation_samples: sensorData.filter(s => s.data_source === 'gps_calculation').length
        },
        total_samples: sensorData.length,
        quality_warning: sensorData.length > 0 && sensorData[0].data_quality?.confidence_level === 'low' 
          ? 'Adherence calculated from GPS data only. Precision may be affected by GPS accuracy.' 
          : null
      }
    };

    // Store analysis in database with correct nested structure
    console.log('💾 Storing analysis in database...');
    console.log('🔍 Enhanced analysis structure:', JSON.stringify(enhancedAnalysis, null, 2));
    
    // Get existing workout_analysis to preserve other fields
    const { data: existingWorkout } = await supabase
      .from('workouts')
      .select('id')
      .eq('id', workout_id)
      .single();
    
    // No need to fetch existing analysis - we're replacing it entirely with new structure
    console.log('🔍 Generating fresh workout_analysis with new structure');
    
    // 🎯 GARMIN-STYLE PERFORMANCE CALCULATION
    // Penalty-based execution scoring (honest assessment of workout compliance)
    
    let performance = {
      execution_adherence: 0,  // Overall score (100 - penalties)
      pace_adherence: 0,       // Same as overall (pace is main factor)
      duration_adherence: 0,   // Total time adherence (capped at 100%)
      completed_steps: 0,
      total_steps: computedIntervals.length
    };

    if (computedIntervals.length > 0) {
      const completedCount = computedIntervals.filter((i: any) => i.executed).length;
      performance.completed_steps = completedCount;
      
      // Calculate Garmin-style execution score using penalty system (for execution score only)
      const executionAnalysis = calculateGarminExecutionScore(computedIntervals, plannedWorkout);
      
      // ✅ USE GRANULAR ANALYSIS FOR TRUE ADHERENCE SCORES
      // Granular analysis uses time-in-range calculation (sample-by-sample), which is more accurate
      
      // Pace adherence: Use granular time-in-range score (converted to percentage)
      // We have all the data - use granular analysis directly, no fallbacks
      const granularPaceAdherence = enhancedAnalysis.overall_adherence != null 
        ? Math.round(enhancedAnalysis.overall_adherence * 100)
        : 0;
      
      // Duration adherence: Use granular duration adherence percentage
      // We have all the data - use granular analysis directly, no fallbacks
      const granularDurationAdherence = enhancedAnalysis.duration_adherence?.adherence_percentage != null
        ? Math.round(enhancedAnalysis.duration_adherence.adherence_percentage)
        : 0;
      
      console.log(`🔍 [GRANULAR CHECK] enhancedAnalysis.overall_adherence: ${enhancedAnalysis.overall_adherence}`);
      console.log(`🔍 [GRANULAR CHECK] enhancedAnalysis.duration_adherence:`, enhancedAnalysis.duration_adherence);
      console.log(`🔍 [GRANULAR CHECK] granularPaceAdherence calculated: ${granularPaceAdherence}`);
      console.log(`🔍 [GRANULAR CHECK] granularDurationAdherence calculated: ${granularDurationAdherence}`);
      
      // Use granular values directly - we have all the data
      performance.pace_adherence = granularPaceAdherence;
      performance.duration_adherence = granularDurationAdherence;
      
      // Execution adherence = combination of pace + duration (equal weight: 50% pace, 50% duration)
      // Will be recalculated after plannedPaceInfo is extracted to include average pace adherence
      performance.execution_adherence = Math.round(
        (performance.pace_adherence * 0.5) + (performance.duration_adherence * 0.5)
      );
      
      console.log(`🎯 Using granular analysis for adherence scores`);
      console.log(`🎯 Granular pace adherence: ${granularPaceAdherence}% (from time-in-range)`);
      console.log(`🎯 Granular duration adherence: ${granularDurationAdherence}%`);
      console.log(`🎯 Initial execution score: ${performance.execution_adherence}% (pace: ${performance.pace_adherence}%, duration: ${performance.duration_adherence}%)`);
      console.log(`🎯 Fallback execution analysis: pace=${executionAnalysis.pace_execution}%, duration=${executionAnalysis.duration_adherence}%`);
    }

    console.log('✅ Performance calculated:', performance);

    // Extract planned pace info early so it can be passed to detailed analysis
    let plannedPaceInfo: {
      type: 'range' | 'single';
      range?: string;
      lower?: number;
      upper?: number;
      target?: string;
      targetSeconds?: number;
      workoutType: string;
    } | null = null;
    
    if (plannedWorkout?.computed?.steps) {
      const workSteps = plannedWorkout.computed.steps.filter((step: any) =>
        (step.kind === 'work' || step.role === 'work') && step.pace_range
      );

      if (workSteps.length > 0) {
        const paceRanges = workSteps.map((step: any) => ({
          lower: step.pace_range.lower,
          upper: step.pace_range.upper
        }));

        const firstRange = paceRanges[0];
        const isRangeWorkout = firstRange.lower !== firstRange.upper;

        const formatPace = (seconds: number): string => {
          const minutes = Math.floor(seconds / 60);
          const secs = Math.round(seconds % 60);
          return `${minutes}:${String(secs).padStart(2, '0')}`;
        };

        const paceUnit = userUnits === 'metric' ? 'min/km' : 'min/mi';

        if (isRangeWorkout) {
          plannedPaceInfo = {
            type: 'range',
            range: `${formatPace(firstRange.lower)}-${formatPace(firstRange.upper)} ${paceUnit}`,
            lower: firstRange.lower,
            upper: firstRange.upper,
            workoutType: 'easy/aerobic run (variability expected)'
          };
        } else {
          plannedPaceInfo = {
            type: 'single',
            target: `${formatPace(firstRange.lower)} ${paceUnit}`,
            targetSeconds: firstRange.lower,
            workoutType: 'tempo/interval run (consistency critical)'
          };
        }
        
        console.log('🎯 [PLANNED PACE] Extracted pace info:', JSON.stringify(plannedPaceInfo));
        console.log('🎯 [PLANNED PACE] Lower:', plannedPaceInfo?.lower, 'Upper:', plannedPaceInfo?.upper);
        
        // Recalculate execution score with average pace adherence weighting
        if (plannedPaceInfo && plannedPaceInfo.type === 'range' && plannedPaceInfo.lower && plannedPaceInfo.upper) {
          // Get workout-level average pace
          const workoutMovingTimeSeconds = workout?.computed?.overall?.duration_s_moving 
            || (workout.moving_time ? workout.moving_time * 60 : null)
            || (workout.duration ? workout.duration * 60 : 0);
          const workoutDistanceKm = workout.distance || 0;
          const workoutDistanceMi = workoutDistanceKm * 0.621371;
          const workoutAvgPaceSeconds = (workoutMovingTimeSeconds > 0 && workoutDistanceMi > 0) 
            ? workoutMovingTimeSeconds / workoutDistanceMi 
            : null;
          
          if (workoutAvgPaceSeconds && workoutAvgPaceSeconds > 0) {
            const targetLower = plannedPaceInfo.lower;
            const targetUpper = plannedPaceInfo.upper;
            
            // Calculate average pace adherence score
            let avgPaceAdherenceScore = performance.pace_adherence; // Default to time-in-range score
            
            // Check if average pace is within range
            if (workoutAvgPaceSeconds >= targetLower && workoutAvgPaceSeconds <= targetUpper) {
              avgPaceAdherenceScore = 100; // Perfect - within range
            } else {
              // Calculate how close to range (within 5s = 95%, within 10s = 90%, etc.)
              let distanceFromRange = 0;
              if (workoutAvgPaceSeconds < targetLower) {
                distanceFromRange = targetLower - workoutAvgPaceSeconds;
              } else {
                distanceFromRange = workoutAvgPaceSeconds - targetUpper;
              }
              
              // Score decreases by 1% per second away from range, but caps at 70% minimum
              avgPaceAdherenceScore = Math.max(70, 100 - distanceFromRange);
            }
            
            // Weighted execution score:
            // - Average pace adherence: 40% (most important - did they hit the overall target?)
            // - Time-in-range (mile-by-mile consistency): 30% (important but less than average)
            // - Duration adherence: 30% (completing the workout)
            performance.execution_adherence = Math.round(
              (avgPaceAdherenceScore * 0.4) + 
              (performance.pace_adherence * 0.3) + 
              (performance.duration_adherence * 0.3)
            );
            
            console.log(`🎯 [EXECUTION SCORE] Recalculated with average pace weighting:`);
            console.log(`   - Average pace: ${(workoutAvgPaceSeconds / 60).toFixed(2)} min/mi, adherence: ${avgPaceAdherenceScore}%`);
            console.log(`   - Time-in-range: ${performance.pace_adherence}%`);
            console.log(`   - Duration: ${performance.duration_adherence}%`);
            console.log(`   - Final execution score: ${performance.execution_adherence}%`);
          }
        }
      }
    }

    // 🚀 ENHANCED DETAILED ANALYSIS - Chart-like insights
    console.log('🚀 Starting detailed analysis generation...');
    console.log('🔍 Sensor data length:', sensorData.length);
    console.log('🔍 Computed intervals length:', computedIntervals.length);
    console.log('🔍 Enhanced analysis keys:', Object.keys(enhancedAnalysis));
    
    let detailedAnalysis = null;
    try {
      detailedAnalysis = generateDetailedChartAnalysis(sensorData, computedIntervals, enhancedAnalysis, plannedPaceInfo, workout, userUnits, plannedWorkout);
      console.log('📊 Detailed analysis generated successfully:', JSON.stringify(detailedAnalysis, null, 2));
    } catch (error) {
      console.error('❌ Detailed analysis generation failed:', error);
      detailedAnalysis = { error: 'Failed to generate detailed analysis', message: error.message };
    }

    // ✅ RECALCULATE EXECUTION SCORE FROM detailed_analysis.interval_breakdown (same source as segment scores)
    // ✅ RECALCULATE EXECUTION SCORE FROM detailed_analysis.interval_breakdown (same source as segment scores)
    // Weighted average: Warmup 15%, Work intervals 60%, Recoveries 10%, Cooldown 15%
    console.log(`🔍 [EXECUTION SCORE DEBUG] Checking conditions:`);
    console.log(`   - detailedAnalysis exists: ${!!detailedAnalysis}`);
    console.log(`   - interval_breakdown exists: ${!!detailedAnalysis?.interval_breakdown}`);
    console.log(`   - interval_breakdown.available: ${detailedAnalysis?.interval_breakdown?.available}`);
    console.log(`   - interval_breakdown.intervals: ${Array.isArray(detailedAnalysis?.interval_breakdown?.intervals) ? detailedAnalysis.interval_breakdown.intervals.length : 'not array'}`);
    if (detailedAnalysis && detailedAnalysis.interval_breakdown && detailedAnalysis.interval_breakdown.available) {
      // interval_breakdown is an object with .intervals array (not .summary)
      const breakdownData = detailedAnalysis.interval_breakdown;
      const intervalBreakdown = Array.isArray(breakdownData.intervals) ? breakdownData.intervals : [];      
      console.log(`🔍 [EXECUTION SCORE DEBUG] Entered calculation block, intervalBreakdown.length: ${intervalBreakdown.length}`);
      if (intervalBreakdown.length > 0) {
        // First pass: count intervals by type to calculate per-interval weights
        const warmupIntervals = intervalBreakdown.filter(i => String(i.interval_type || '').toLowerCase() === 'warmup');
        const workIntervals = intervalBreakdown.filter(i => String(i.interval_type || '').toLowerCase() === 'work');
        const recoveryIntervals = intervalBreakdown.filter(i => String(i.interval_type || '').toLowerCase() === 'recovery');
        const cooldownIntervals = intervalBreakdown.filter(i => String(i.interval_type || '').toLowerCase() === 'cooldown');
        
        // Calculate per-interval weights (divide total segment weight by count)
        const warmupWeightPerInterval = warmupIntervals.length > 0 ? 0.15 / warmupIntervals.length : 0;
        const workWeightPerInterval = workIntervals.length > 0 ? 0.60 / workIntervals.length : 0;
        const recoveryWeightPerInterval = recoveryIntervals.length > 0 ? 0.10 / recoveryIntervals.length : 0;
        const cooldownWeightPerInterval = cooldownIntervals.length > 0 ? 0.15 / cooldownIntervals.length : 0;
        
        let weightedSum = 0;
        let totalWeight = 0;
        const segmentScores: any[] = [];
        
        for (const interval of intervalBreakdown) {
          const intervalType = String(interval.interval_type || '').toLowerCase();
          let weight = 0;
          
          // Assign per-interval weights based on interval type
          if (intervalType === 'warmup') {
            weight = warmupWeightPerInterval;
          } else if (intervalType === 'work') {
            weight = workWeightPerInterval;
          } else if (intervalType === 'recovery') {
            weight = recoveryWeightPerInterval;
          } else if (intervalType === 'cooldown') {
            weight = cooldownWeightPerInterval;
          }
          
          if (weight > 0) {
            // Use performance_score if available, otherwise calculate from pace and duration adherence
            let segmentScore = interval.performance_score;
            const paceAdherence = interval.pace_adherence_percent || 0;
            const durationAdherence = interval.duration_adherence_percent || 0;
            
            if (segmentScore === undefined || segmentScore === null) {
              // Calculate segment score: average of pace and duration adherence
              segmentScore = (paceAdherence + durationAdherence) / 2;
            }
            
            const weightedContribution = segmentScore * weight;
            weightedSum += weightedContribution;
            totalWeight += weight;
            
            segmentScores.push({
              type: intervalType,
              interval_number: interval.interval_number || interval.recovery_number || '',
              performance_score: segmentScore,
              pace_adherence: paceAdherence,
              duration_adherence: durationAdherence,
              weight: weight,
              weighted_contribution: weightedContribution
            });
          }
        }
        
        if (totalWeight > 0) {
          const calculatedExecutionScore = Math.round(weightedSum / totalWeight);
          performance.execution_adherence = calculatedExecutionScore;
          
          console.log(`🎯 [EXECUTION SCORE] Recalculated from detailed_analysis.interval_breakdown:`);
          console.log(`   - Interval counts: Warmup=${warmupIntervals.length}, Work=${workIntervals.length}, Recovery=${recoveryIntervals.length}, Cooldown=${cooldownIntervals.length}`);
          console.log(`   - Per-interval weights: Warmup=${(warmupWeightPerInterval*100).toFixed(1)}%, Work=${(workWeightPerInterval*100).toFixed(1)}%, Recovery=${(recoveryWeightPerInterval*100).toFixed(1)}%, Cooldown=${(cooldownWeightPerInterval*100).toFixed(1)}%`);
          console.log(`   - Segment breakdown:`);
          segmentScores.forEach(seg => {
            console.log(`     ${seg.type} ${seg.interval_number || ''}: score=${seg.performance_score.toFixed(1)}%, pace=${seg.pace_adherence.toFixed(1)}%, duration=${seg.duration_adherence.toFixed(1)}%, weight=${(seg.weight*100).toFixed(2)}%, contribution=${seg.weighted_contribution.toFixed(2)}`);
          });
          console.log(`   - Weighted sum: ${weightedSum.toFixed(2)}`);
          console.log(`   - Total weight: ${totalWeight.toFixed(2)}`);
          console.log(`   - Weighted average: ${(weightedSum / totalWeight).toFixed(2)}%`);
          console.log(`   - Final execution score (rounded): ${calculatedExecutionScore}%`);
        }
        }

    }    // 🤖 GENERATE AI NARRATIVE INSIGHTS
    let narrativeInsights = null;
    try {
      console.log('🤖 [CRITICAL] Starting AI narrative generation...');
      console.log('🤖 [CRITICAL] Checking for OPENAI_API_KEY...');
      const hasKey = !!Deno.env.get('OPENAI_API_KEY');
      console.log('🤖 [CRITICAL] OPENAI_API_KEY present:', hasKey);
      console.log('🤖 [CRITICAL] User units preference:', userUnits);
      
      narrativeInsights = await generateAINarrativeInsights(
        sensorData,
        workout,
        plannedWorkout,
        enhancedAnalysis,
        performance,
        detailedAnalysis,
        userUnits,
        supabase
      );
      console.log('✅ [CRITICAL] AI narrative generated:', JSON.stringify(narrativeInsights));
      console.log('✅ [CRITICAL] AI narrative is array:', Array.isArray(narrativeInsights));
      console.log('✅ [CRITICAL] AI narrative length:', narrativeInsights?.length);
    } catch (error) {
      console.error('❌ [CRITICAL] AI narrative generation failed:', error);
      console.error('❌ [CRITICAL] Error message:', error.message);
      console.error('❌ [CRITICAL] Error stack:', error.stack);
      narrativeInsights = null; // Continue without narrative if AI fails
    }

    // Store enhanced intervals back to computed.intervals (single source of truth)
    // Store summary analysis in workout_analysis
    console.log('💾 [TIMING] Starting database update...');
    console.log('💾 [TIMING] Updating computed.intervals with', computedIntervals.length, 'intervals');
    
    // Build minimal computed object - DON'T spread (avoids sending thousands of sensor samples)
    const minimalComputed = {
      version: workout.computed?.version || '1.0',
      overall: workout.computed?.overall || {},
      intervals: computedIntervals,  // Enhanced with granular_metrics
      planned_steps_light: workout.computed?.planned_steps_light || null
    };
    
    // Create analysis_v2 with version metadata
    const analysisV2 = {
      _meta: {
        version: "2.0",
        source: "analyze-running-workout",
        generated_at: new Date().toISOString(),
        generator_version: "2.0.1"
      },
      granular_analysis: enhancedAnalysis,
      performance: performance,
      detailed_analysis: detailedAnalysis
    };

    // Log what we're about to write
    console.log('🔍 [PRE-UPDATE DEBUG] About to write to database:');
    console.log('  - detailedAnalysis type:', typeof detailedAnalysis);
    console.log('  - detailedAnalysis is null?:', detailedAnalysis === null);
    console.log('  - detailedAnalysis keys:', detailedAnalysis ? Object.keys(detailedAnalysis) : 'N/A');
    console.log('  - detailedAnalysis value:', JSON.stringify(detailedAnalysis, null, 2));
    
    const updatePayload = {
      computed: minimalComputed,  // Lightweight update (no sensor data)
      workout_analysis: {
        // DON'T spread existingAnalysis - replace entirely with new structure
        granular_analysis: enhancedAnalysis,
        performance: performance,
        detailed_analysis: detailedAnalysis,
        narrative_insights: narrativeInsights,  // AI-generated human-readable insights
        mile_by_mile_terrain: detailedAnalysis?.mile_by_mile_terrain || null  // Include terrain breakdown
      },
      analysis_status: 'complete',
      analyzed_at: new Date().toISOString()
    };
    
    console.log('🔍 [PRE-UPDATE DEBUG] Full update payload workout_analysis keys:', 
      Object.keys(updatePayload.workout_analysis));
    
    // Single update with computed, workout_analysis, and status
    const { error: updateError } = await supabase
      .from('workouts')
      .update(updatePayload)
      .eq('id', workout_id);

    console.log('✅ [TIMING] Database update completed!');
    
    if (updateError) {
      console.error('❌ Database update FAILED:', updateError);
      console.error('❌ Update payload:', JSON.stringify({
        computed: minimalComputed,
        workout_analysis: {
          ...existingAnalysis,
          granular_analysis: enhancedAnalysis,
          performance: performance
        }
      }, null, 2));
    } else {
      console.log('✅ Analysis stored successfully in database');
      console.log('🔍 Stored performance:', JSON.stringify(performance, null, 2));
      console.log('🔍 Stored granular_analysis keys:', Object.keys(enhancedAnalysis));
      
      // Verify the update actually worked by reading it back
      const { data: verifyData, error: verifyError } = await supabase
        .from('workouts')
        .select('workout_analysis')
        .eq('id', workout_id)
        .single();
      
      if (verifyError) {
        console.error('❌ Verification read failed:', verifyError);
      } else {
        console.log('✅ [POST-UPDATE VERIFY] workout_analysis keys in DB:', verifyData?.workout_analysis ? Object.keys(verifyData.workout_analysis) : 'NULL');
        console.log('✅ [POST-UPDATE VERIFY] Has performance?:', !!verifyData?.workout_analysis?.performance);
        console.log('✅ [POST-UPDATE VERIFY] Has granular_analysis?:', !!verifyData?.workout_analysis?.granular_analysis);
        console.log('✅ [POST-UPDATE VERIFY] Has detailed_analysis?:', !!verifyData?.workout_analysis?.detailed_analysis);
        
        if (verifyData?.workout_analysis?.detailed_analysis) {
          console.log('✅ [POST-UPDATE VERIFY] detailed_analysis keys:', Object.keys(verifyData.workout_analysis.detailed_analysis));
        } else {
          console.error('❌ [POST-UPDATE VERIFY] detailed_analysis is MISSING from database after write!');
          console.error('❌ [POST-UPDATE VERIFY] This means either:');
          console.error('   1. The update payload did not include it');
          console.error('   2. A database trigger/constraint removed it');
          console.error('   3. Supabase client serialization issue');
        }
      }
    }

    console.log(`✅ Running analysis complete for workout ${workout_id}`);
    console.log(`📊 Overall adherence: ${(analysis.overall_adherence * 100).toFixed(1)}%`);
    console.log(`🎯 Performance: ${analysis.performance_assessment}`);

    return new Response(JSON.stringify({
      success: true,
      analysis: enhancedAnalysis,
      intervals: computedIntervals,
      performance: performance,
      detailed_analysis: detailedAnalysis  // Include in response to avoid extra DB reload
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
      }
    });

  } catch (error) {
    console.error('❌ Analyze running workout error:', error);
    
    // Set analysis status to 'failed' and capture error message
    try {
      await supabase
        .from('workouts')
        .update({ 
          analysis_status: 'failed',
          analysis_error: error.message || 'Internal server error'
        })
        .eq('id', workout_id);
    } catch (statusError) {
      console.error('❌ Failed to set error status:', statusError);
    }
    
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
      }
    });
  }
});

// Types
interface PrescribedRangeAdherence {
  overall_adherence: number;
  time_in_range_s: number;
  time_outside_range_s: number;
  total_time_s: number;
  interval_breakdown: IntervalAnalysis[];
  performance_assessment: string;
  primary_issues: string[];
  strengths: string[];
  heart_rate_analysis: any;
  pacing_analysis: {
    time_in_range_score: number;
    variability_score: number;
    smoothness_score: number;
    pacing_variability: number;
  };
  duration_adherence: any;
  analysis_metadata: {
    total_intervals: number;
    intervals_analyzed: number;
    samples_processed: number;
    outliers_filtered: number;
    gaps_handled: number;
  };
}

interface IntervalAnalysis {
  interval_id: string;
  interval_type: string;
  prescribed_range: {
    lower: number;
    upper: number;
    unit: string;
  };
  time_in_range: number;
  time_outside_range: number;
  adherence_percentage: number;
  samples_in_range: number;
  samples_outside_range: number;
  average_value: number;
  range_consistency: number;
  issues: string[];
  performance_assessment: string;
}

interface SampleTiming {
  timestamp: number;
  duration_s: number;
  value: number;
  isInterpolated: boolean;
}


/**
 * Calculate prescribed range adherence using proper granular analysis
 * Handles both intervals and steady-state workouts with consistency analysis
 */
function calculatePrescribedRangeAdherenceGranular(sensorData: any[], intervals: any[], workout: any, plannedWorkout: any): PrescribedRangeAdherence {
  console.log(`📊 Starting granular prescribed range analysis for ${intervals.length} intervals`);
  console.log(`🔍 Interval structure debug:`, intervals.map(i => ({
    kind: i.kind,
    role: i.role,
    hasPlanned: !!i.planned,
    hasExecuted: !!i.executed,
    plannedKeys: i.planned ? Object.keys(i.planned) : [],
    executedKeys: i.executed ? Object.keys(i.executed) : []
  })));
  
  // Check if this is an interval workout (has ANY segments with pace targets, not just work)
  // Look for intervals with pace targets (warmup, work, cooldown all count)
  const intervalsWithPaceTargets = intervals.filter(interval => {
    // Check for pace target in multiple possible locations
    const hasPaceTarget = interval.target_pace?.lower || 
                         interval.pace_range?.lower || 
                         interval.planned?.target_pace_s_per_mi ||
                         interval.planned?.pace_range;
    return hasPaceTarget && interval.executed;
  });
  
  // Check if there are work intervals specifically (for workout type detection)
  const workIntervals = intervals.filter(interval => {
    const isWorkRole = interval.role === 'work' || interval.kind === 'work';
    const hasPaceTarget = interval.target_pace?.lower || 
                         interval.pace_range?.lower || 
                         interval.planned?.target_pace_s_per_mi ||
                         interval.planned?.pace_range;
    return isWorkRole && hasPaceTarget;
  });
  
  const isIntervalWorkout = intervalsWithPaceTargets.length > 0;
  console.log(`🔍 Workout type: ${isIntervalWorkout ? 'Intervals' : 'Steady-state'} (${intervalsWithPaceTargets.length} intervals with pace targets, ${workIntervals.length} work segments)`);
  
  if (isIntervalWorkout) {
    return calculateIntervalPaceAdherence(sensorData, intervals, workout, plannedWorkout);
  } else {
    return calculateSteadyStatePaceAdherence(sensorData, intervals, workout, plannedWorkout);
  }
}

/**
 * Calculate pace adherence for interval workouts - SIMPLIFIED VERSION
 * Uses pre-computed slice indices, no complex fallback logic
 */
function calculateIntervalPaceAdherence(sensorData: any[], intervals: any[], workout: any, plannedWorkout: any): PrescribedRangeAdherence {
  console.log('🏃‍♂️ Analyzing interval workout pace adherence');
  
  // Filter to intervals with pace targets (include warmup, work, cooldown - all should count for pace adherence)
  const workIntervals = intervals.filter(interval => {
    // Check for pace target in multiple possible locations
    const hasPaceTarget = interval.target_pace?.lower || 
                         interval.target_pace?.upper ||
                         interval.planned?.target_pace_s_per_mi ||
                         interval.pace_range?.lower ||
                         interval.planned?.pace_range?.lower;
    
    // Only include intervals that have both pace target AND executed data
    return hasPaceTarget && interval.executed && (interval.sample_idx_start !== undefined);
  });
  
  console.log(`📊 Analyzing ${workIntervals.length} intervals with pace targets`);
  console.log(`🔍 Interval roles: ${workIntervals.map(i => i.role || i.kind).join(', ')}`);
  
  let totalTimeInRange = 0;
  let totalTimeOutsideRange = 0;
  let totalSamples = 0;
  
  // Analyze each work interval - FAST AND SIMPLE
  for (const interval of workIntervals) {
    // Use pre-computed slice indices (already done by compute-workout-summary!)
    if (interval.sample_idx_start === undefined || interval.sample_idx_end === undefined) {
      console.warn(`⚠️ Interval missing slice indices, skipping`);
      continue;
    }
    
    // Slice the sensor data (instant operation)
    const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);
    
    if (intervalSamples.length === 0) {
      console.warn(`⚠️ No samples for interval, skipping`);
      continue;
    }
    
    // Calculate adherence for this interval (fast, simple calculations)
    const intervalResult = analyzeIntervalPace(intervalSamples, interval, plannedWorkout);
    
    // Attach granular metrics to the interval
    if (intervalResult.granular_metrics) {
      interval.granular_metrics = intervalResult.granular_metrics;
    }
    
    totalTimeInRange += intervalResult.timeInRange;
    totalTimeOutsideRange += intervalResult.timeOutsideRange;
    totalSamples += intervalResult.totalSamples;
    
    console.log(`🔍 [GRANULAR] Interval ${interval.role || interval.kind}: ${intervalResult.timeInRange} in range, ${intervalResult.timeOutsideRange} outside, ${intervalResult.totalSamples} total samples`);
  }
  
  const totalTime = totalTimeInRange + totalTimeOutsideRange;
  const timeInRangeScore = totalTime > 0 ? totalTimeInRange / totalTime : 0;
  
  console.log(`✅ Interval analysis complete: ${totalTimeInRange}/${totalTime} samples in range = ${(timeInRangeScore * 100).toFixed(1)}%`);
  console.log(`🔍 [GRANULAR DEBUG] Total samples: ${totalSamples}, In range: ${totalTimeInRange}, Outside: ${totalTimeOutsideRange}`);
  
  // Calculate pacing variability from all work interval samples
  const allPaceSamples: number[] = [];
  for (const interval of workIntervals) {
    if (interval.sample_idx_start !== undefined && interval.sample_idx_end !== undefined) {
      const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);
      const validPaces = intervalSamples
        .map(s => s.pace_s_per_mi)
        .filter(p => p != null && p > 0);
      allPaceSamples.push(...validPaces);
    }
  }
  
  // Calculate pacing variability metrics
  let pacingVariability = {
    coefficient_of_variation: 0,
    avg_pace_change_per_min: 0,
    num_surges: 0,
    num_crashes: 0,
    steadiness_score: 100,
    avg_pace_change_seconds: 0
  };
  
  if (allPaceSamples.length >= 2) {
    const mean = allPaceSamples.reduce((a, b) => a + b, 0) / allPaceSamples.length;
    const variance = allPaceSamples.reduce((sum, pace) => sum + Math.pow(pace - mean, 2), 0) / allPaceSamples.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / mean) * 100;
    
    // Calculate surges and crashes
    let surges = 0;
    let crashes = 0;
    let totalChange = 0;
    
    for (let i = 1; i < allPaceSamples.length; i++) {
      const delta = allPaceSamples[i] - allPaceSamples[i-1];
      totalChange += Math.abs(delta);
      
      if (delta < -10) surges++; // Pace dropped >10s/mi (surge)
      if (delta > 10) crashes++; // Pace increased >10s/mi (crash)
    }
    
    const avgChange = totalChange / (allPaceSamples.length - 1);
    
    // Calculate steadiness score
    let steadinessScore = 100;
    if (cv > 10) steadinessScore -= 40;
    else if (cv > 7) steadinessScore -= 30;
    else if (cv > 5) steadinessScore -= 20;
    else if (cv > 3) steadinessScore -= 10;
    
    const surgeRate = surges / allPaceSamples.length;
    const crashRate = crashes / allPaceSamples.length;
    if (surgeRate > 0.1) steadinessScore -= 20;
    if (crashRate > 0.1) steadinessScore -= 20;
    
    if (avgChange > 15) steadinessScore -= 20;
    else if (avgChange > 10) steadinessScore -= 15;
    else if (avgChange > 5) steadinessScore -= 10;
    
    steadinessScore = Math.max(0, steadinessScore);
    
    pacingVariability = {
      coefficient_of_variation: Math.round(cv * 10) / 10,
      avg_pace_change_per_min: Math.round(avgChange * 10) / 10,
      num_surges: surges,
      num_crashes: crashes,
      steadiness_score: Math.round(steadinessScore),
      avg_pace_change_seconds: Math.round(avgChange * 10) / 10
    };
  }
  
  // Calculate duration adherence with proper penalty for both over and under
  const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
  const actualDurationSeconds = workout?.computed?.overall?.duration_s_moving || 
    intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
  
  // Calculate duration adherence: penalize both going over and under
  let durationAdherencePct = 0;
  if (plannedDurationSeconds > 0 && actualDurationSeconds > 0) {
    const ratio = actualDurationSeconds / plannedDurationSeconds;
    if (ratio >= 0.9 && ratio <= 1.1) {
      // Within 10% tolerance - high score (90-100%)
      durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
    } else if (ratio < 0.9) {
      // Too short - penalize proportionally
      durationAdherencePct = ratio * 100;
    } else {
      // Too long - penalize (inverse ratio)
      durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
    }
    durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct)); // Clamp 0-100
  }
  
  // Separate intervals by role from the workIntervals set (all have pace targets)
  const warmupIntervals = workIntervals.filter(i => (i.role === 'warmup' || i.kind === 'warmup' || i.type === 'warmup'));
  const workIntervalsOnly = workIntervals.filter(i => (i.role === 'work' || i.kind === 'work' || i.type === 'work'));
  const recoveryIntervals = workIntervals.filter(i => (i.role === 'recovery' || i.kind === 'recovery' || i.type === 'recovery' || i.type === 'rest'));
  const cooldownIntervals = workIntervals.filter(i => (i.role === 'cooldown' || i.kind === 'cooldown' || i.type === 'cooldown'));
  
  console.log(`🔍 [SEGMENT BREAKDOWN] Found segments: warmup=${warmupIntervals.length}, work=${workIntervalsOnly.length}, recovery=${recoveryIntervals.length}, cooldown=${cooldownIntervals.length}`);
  
  // Calculate pace adherence using interval averages (industry standard)
  const intervalAvgAdherence = calculateIntervalAveragePaceAdherence(
    workIntervalsOnly
      .filter(iv => {
        // Must have slice indices and pace range
        if (iv.sample_idx_start === undefined || iv.sample_idx_end === undefined) return false;
        // Check for pace range in multiple possible locations
        const hasPaceRange = iv.pace_range?.lower || 
                            iv.target_pace?.lower || 
                            iv.planned?.pace_range?.lower;
        return !!hasPaceRange;
      })
      .map(iv => {
        // Extract pace range from multiple possible locations
        const lower = iv.pace_range?.lower || 
                     iv.target_pace?.lower || 
                     iv.planned?.pace_range?.lower || 
                     0;
        const upper = iv.pace_range?.upper || 
                     iv.target_pace?.upper || 
                     iv.planned?.pace_range?.upper || 
                     999;
        return {
          sample_idx_start: iv.sample_idx_start!,
          sample_idx_end: iv.sample_idx_end!,
          pace_range: [lower, upper] as [number, number]
        };
      }),
    sensorData
  );
  
  // Keep time-in-range as secondary metric for granular analysis
  const avgPaceAdherence = intervalAvgAdherence; // Use interval averages as primary metric
  const timeInRangePct = timeInRangeScore; // Keep old metric for reference
  
  // Calculate segment-by-segment pace adherence for transparent breakdown
  const segmentAdherence: any = {
    warmup: null,
    work_intervals: null,
    recovery: null,
    cooldown: null
  };
  
  // Calculate adherence for each segment type
  const calculateSegmentAdherence = (segmentIntervals: any[]): { adherence: number; timeInRange: number; totalTime: number } | null => {
    if (segmentIntervals.length === 0) return null;
    
    let segmentTimeInRange = 0;
    let segmentTimeOutsideRange = 0;
    
    for (const interval of segmentIntervals) {
      if (interval.sample_idx_start === undefined || interval.sample_idx_end === undefined) {
        console.warn(`⚠️ [SEGMENT] Interval missing slice indices, skipping`);
        continue;
      }
      const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);
      if (intervalSamples.length === 0) {
        console.warn(`⚠️ [SEGMENT] No samples for interval, skipping`);
        continue;
      }
      const intervalResult = analyzeIntervalPace(intervalSamples, interval, plannedWorkout);
      segmentTimeInRange += intervalResult.timeInRange;
      segmentTimeOutsideRange += intervalResult.timeOutsideRange;
    }
    
    const segmentTotalTime = segmentTimeInRange + segmentTimeOutsideRange;
    const segmentAdherencePct = segmentTotalTime > 0 ? (segmentTimeInRange / segmentTotalTime) * 100 : 0;
    
    console.log(`🔍 [SEGMENT] Calculated adherence: ${segmentIntervals.length} intervals, ${segmentTimeInRange}/${segmentTotalTime} in range = ${segmentAdherencePct.toFixed(1)}%`);
    
    return {
      adherence: Math.round(segmentAdherencePct),
      timeInRange: segmentTimeInRange,
      totalTime: segmentTotalTime
    };
  };
  
  if (warmupIntervals.length > 0) {
    segmentAdherence.warmup = calculateSegmentAdherence(warmupIntervals);
  }
  if (workIntervalsOnly.length > 0) {
    segmentAdherence.work_intervals = calculateSegmentAdherence(workIntervalsOnly);
  }
  if (recoveryIntervals.length > 0) {
    segmentAdherence.recovery = calculateSegmentAdherence(recoveryIntervals);
  }
  if (cooldownIntervals.length > 0) {
    segmentAdherence.cooldown = calculateSegmentAdherence(cooldownIntervals);
  }
  
  console.log(`✅ [SEGMENT BREAKDOWN] Final segment adherence:`, JSON.stringify(segmentAdherence, null, 2));
  
  // Calculate HR drift for the entire workout (across all work intervals)
  // Collect all samples from work intervals for HR drift calculation
  const allWorkSamples: any[] = [];
  for (const interval of workIntervals) {
    if (interval.sample_idx_start !== undefined && interval.sample_idx_end !== undefined) {
      const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);
      allWorkSamples.push(...intervalSamples);
    }
  }
  
  // Calculate HR drift using the entire work period
  let heartRateAnalysis = null;
  if (allWorkSamples.length > 0) {
    // Determine work period timestamps
    const workStartTimestamp = allWorkSamples.length > 0 
      ? (allWorkSamples[0].timestamp || allWorkSamples[0].elapsed_time_s || 0)
      : undefined;
    const workEndTimestamp = allWorkSamples.length > 0
      ? (allWorkSamples[allWorkSamples.length - 1].timestamp || allWorkSamples[allWorkSamples.length - 1].elapsed_time_s || 0)
      : undefined;
    
    const hrDriftResult = calculateHeartRateDrift(allWorkSamples, workStartTimestamp, workEndTimestamp);
    
    if (hrDriftResult.valid) {
      // Calculate average HR from all work samples
      const validHRSamples = allWorkSamples.filter(s => s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250);
      const avgHR = validHRSamples.length > 0
        ? Math.round(validHRSamples.reduce((sum, s) => sum + s.heart_rate, 0) / validHRSamples.length)
        : 0;
      const maxHR = validHRSamples.length > 0 ? Math.max(...validHRSamples.map(s => s.heart_rate)) : 0;
      
      heartRateAnalysis = {
        adherence_percentage: 100, // Not applicable for interval workouts
        time_in_zone_s: totalTime,
        time_outside_zone_s: 0,
        total_time_s: totalTime,
        samples_in_zone: validHRSamples.length,
        samples_outside_zone: 0,
        average_heart_rate: avgHR,
        target_zone: null,
        hr_drift_bpm: hrDriftResult.drift_bpm,
        early_avg_hr: hrDriftResult.early_avg_hr,
        late_avg_hr: hrDriftResult.late_avg_hr,
        hr_drift_interpretation: hrDriftResult.interpretation,
        hr_consistency: 1 - (pacingVariability.coefficient_of_variation / 100) // Use pace variability as proxy
      };
    }
  }
  
  return {
    overall_adherence: avgPaceAdherence / 100, // NEW: interval averages (industry standard)
    time_in_range_score: timeInRangeScore,
    time_in_range_pct: timeInRangePct, // OLD: keep for reference (includes transitions/GPS noise)
    variability_score: pacingVariability.coefficient_of_variation / 100, // Convert CV% to decimal
    smoothness_score: pacingVariability.steadiness_score / 100, // Convert to 0-1 range
    pacing_variability: pacingVariability,
    time_in_range_s: totalTimeInRange,
    time_outside_range_s: totalTimeOutsideRange,
    total_time_s: totalTime,
    samples_in_range: totalSamples,
    samples_outside_range: 0,
    heart_rate_analysis: heartRateAnalysis,
    pacing_analysis: {
      time_in_range_score: avgPaceAdherence,
      variability_score: 0,
      smoothness_score: 0,
      pacing_variability: 0
    },
    duration_adherence: {
      adherence_percentage: durationAdherencePct,
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      delta_seconds: actualDurationSeconds - plannedDurationSeconds
    },
    segment_adherence: segmentAdherence // Add segment-by-segment breakdown
  };
}

/**
 * Calculate pace adherence based on interval averages (not time-in-range)
 * Industry standard: evaluate each interval by its average pace, not second-by-second
 */
function calculateIntervalAveragePaceAdherence(
  workIntervals: Array<{
    sample_idx_start: number;
    sample_idx_end: number;
    pace_range: [number, number];
  }>,
  sensorData: Array<{ pace_s_per_mi: number }>
): number {
  if (!workIntervals.length) return 0;

  const intervalScores = workIntervals.map(interval => {
    const samples = sensorData.slice(
      interval.sample_idx_start,
      interval.sample_idx_end + 1
    );

    if (samples.length === 0) return 0;

    const avgPace = samples.reduce((sum, s) => sum + s.pace_s_per_mi, 0) / samples.length;
    const [targetLower, targetUpper] = interval.pace_range;

    if (avgPace >= targetLower && avgPace <= targetUpper) {
      return 100;
    }

    const deviation = avgPace < targetLower 
      ? (targetLower - avgPace) 
      : (avgPace - targetUpper);
    const rangeWidth = (targetUpper - targetLower) / 2;
    return Math.max(0, 100 - (deviation / rangeWidth) * 100);
  });

  return intervalScores.reduce((a, b) => a + b) / intervalScores.length;
}

/**
 * Calculate pace adherence for steady-state workouts
 * Evaluates both average pace and consistency (CV penalty)
 */
function calculateSteadyStatePaceAdherence(sensorData: any[], intervals: any[], workout: any, plannedWorkout: any): PrescribedRangeAdherence {
  console.log('🏃‍♂️ Analyzing steady-state workout pace adherence');
  
  // For steady-state, analyze the main workout segments (excluding warmup/cooldown)
  const mainSegments = intervals.filter(interval => 
    interval.type !== 'warmup' && 
    interval.type !== 'cooldown' &&
    interval.pace_range &&
    interval.pace_range.lower &&
    interval.pace_range.upper
  );
  
  if (mainSegments.length === 0) {
    console.log('⚠️ No main segments found - analyzing as freeform run using actual workout data');
    
    // Analyze the entire workout as a single segment using actual data
    // Calculate total time from sensor data or workout fields
    const totalTimeSeconds = sensorData.length > 0 
      ? (sensorData[sensorData.length - 1].elapsed_time_s || sensorData.length)
      : (workout.moving_time * 60 || workout.duration * 60 || 0);
    
    // Calculate average pace and HR from sensor data
    const validPaceSamples = sensorData.filter(s => s.pace_s_per_mi > 0 && s.pace_s_per_mi < 1200);
    const avgPace = validPaceSamples.length > 0
      ? validPaceSamples.reduce((sum, s) => sum + s.pace_s_per_mi, 0) / validPaceSamples.length
      : 0;
    
    const validHRSamples = sensorData.filter(s => s.heart_rate > 0);
    const avgHR = validHRSamples.length > 0
      ? Math.round(validHRSamples.reduce((sum, s) => sum + s.heart_rate, 0) / validHRSamples.length)
      : 0;
    const maxHR = validHRSamples.length > 0 ? Math.max(...validHRSamples.map(s => s.heart_rate)) : 0;
    
    // Calculate HR drift using proper time-window method
    // Determine work period timestamps from sensor data
    const workStartTimestamp = sensorData.length > 0 
      ? (sensorData[0].timestamp || sensorData[0].elapsed_time_s || 0)
      : undefined;
    const workEndTimestamp = sensorData.length > 0
      ? (sensorData[sensorData.length - 1].timestamp || sensorData[sensorData.length - 1].elapsed_time_s || 0)
      : undefined;
    
    const hrDriftResult = calculateHeartRateDrift(sensorData, workStartTimestamp, workEndTimestamp);
    const hrDrift = hrDriftResult.valid ? hrDriftResult.drift_bpm : 0;
    
    // Calculate pace variability from all valid pace samples (not segment averages)
    // This captures true variability including walk breaks and surges
    const allPaces = validPaceSamples.map(s => s.pace_s_per_mi);
    const stdDev = allPaces.length > 1 ? calculateStandardDeviation(allPaces) : 0;
    const cv = avgPace > 0 ? stdDev / avgPace : 0;
    
    // Calculate duration adherence even for freeform runs (we have the data)
    const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
    const actualDurationSeconds = 
      workout?.computed?.overall?.duration_s_moving ||
      totalTimeSeconds ||
      intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
    
    let durationAdherencePct = 0;
    if (plannedDurationSeconds > 0 && actualDurationSeconds > 0) {
      const ratio = actualDurationSeconds / plannedDurationSeconds;
      if (ratio >= 0.9 && ratio <= 1.1) {
        durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
      } else if (ratio < 0.9) {
        durationAdherencePct = ratio * 100;
      } else {
        durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
      }
      durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct));
    }
    
    console.log('📊 Freeform run analysis:', {
      totalTimeSeconds,
      avgPace: avgPace.toFixed(1),
      avgHR,
      maxHR,
      hrDrift,
      cv: (cv * 100).toFixed(1) + '%',
      sensorSamples: sensorData.length,
      durationAdherencePct
    });
    
    return {
      overall_adherence: 1.0, // No target to compare against
      time_in_range_score: 1.0,
      variability_score: cv,
      smoothness_score: Math.max(0, 1 - cv),
      pacing_variability: {
        coefficient_of_variation: cv * 100,
        avg_pace_change_per_min: stdDev,
        num_surges: 0,
        num_crashes: 0,
        steadiness_score: Math.max(0, 100 - (cv * 100)),
        avg_pace_change_seconds: stdDev
      },
      time_in_range_s: totalTimeSeconds,
      time_outside_range_s: 0,
      total_time_s: totalTimeSeconds,
      samples_in_range: sensorData.length,
      samples_outside_range: 0,
      heart_rate_analysis: avgHR > 0 ? {
        adherence_percentage: 100,
        time_in_zone_s: totalTimeSeconds,
        time_outside_zone_s: 0,
        total_time_s: totalTimeSeconds,
        samples_in_zone: validHRSamples.length,
        samples_outside_zone: 0,
        average_heart_rate: avgHR,
        target_zone: null,
        hr_drift_bpm: hrDriftResult.valid ? hrDriftResult.drift_bpm : hrDrift,
        early_avg_hr: hrDriftResult.valid ? hrDriftResult.early_avg_hr : null,
        late_avg_hr: hrDriftResult.valid ? hrDriftResult.late_avg_hr : null,
        hr_drift_interpretation: hrDriftResult.valid ? hrDriftResult.interpretation : null,
        hr_consistency: 1 - cv
      } : null,
      pacing_analysis: {
        time_in_range_score: 100,
        variability_score: cv,
        avg_pace_s_per_mi: avgPace
      },
      duration_adherence: {
        adherence_percentage: durationAdherencePct,
        planned_duration_s: plannedDurationSeconds,
        actual_duration_s: actualDurationSeconds,
        delta_seconds: actualDurationSeconds - plannedDurationSeconds
      }
    };
  }
  
  // Break workout into ~1-2 minute segments for consistency analysis
  const segmentDuration = 120; // 2 minutes
  const segments = [];
  
  for (let i = 0; i < sensorData.length; i += segmentDuration) {
    const segmentSamples = sensorData.slice(i, i + segmentDuration);
    if (segmentSamples.length > 0) {
      const avgPace = calculateAveragePace(segmentSamples);
      if (avgPace > 0) {
        segments.push(avgPace);
      }
    }
  }
  
  if (segments.length === 0) {
    console.log('⚠️ No valid segments found - calculating duration adherence from available data');
    // Even with no segments, we can still calculate duration adherence if we have planned/actual data
    const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
    const actualDurationSeconds = 
      workout?.computed?.overall?.duration_s_moving ||
      intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
    
    let durationAdherencePct = 0;
    if (plannedDurationSeconds > 0 && actualDurationSeconds > 0) {
      const ratio = actualDurationSeconds / plannedDurationSeconds;
      if (ratio >= 0.9 && ratio <= 1.1) {
        durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
      } else if (ratio < 0.9) {
        durationAdherencePct = ratio * 100;
      } else {
        durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
      }
      durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct));
    }
    
    const empty = createEmptyAdherence();
    empty.duration_adherence = {
      adherence_percentage: durationAdherencePct,
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      delta_seconds: actualDurationSeconds - plannedDurationSeconds
    };
    return empty;
  }
  
  // Calculate pace statistics
  const avgPace = segments.reduce((sum, pace) => sum + pace, 0) / segments.length;
  const stdDev = calculateStandardDeviation(segments);
  const cv = stdDev / avgPace;
  
  // Get target pace from the main segment
  const targetPace = mainSegments[0].pace_range.lower + 
    (mainSegments[0].pace_range.upper - mainSegments[0].pace_range.lower) / 2;
  
  // Calculate base adherence
  const paceAdherence = targetPace / avgPace; // Closer to 1.0 is better
  
  // Apply consistency penalty
  let consistencyMultiplier = 1.0;
  if (cv > 0.06) { // > 6% variability
    consistencyMultiplier = 0.85; // Major penalty
  } else if (cv > 0.04) { // 4-6% variability
    consistencyMultiplier = 0.90; // Moderate penalty
  } else if (cv > 0.02) { // 2-4% variability
    consistencyMultiplier = 0.95; // Minor penalty
  }
  
  const finalScore = paceAdherence * consistencyMultiplier;
  
  console.log('🔍 Steady-state pace adherence debug:', {
    targetPace,
    avgPace,
    paceAdherence,
    cv,
    consistencyMultiplier,
    finalScore
  });
  
  console.log(`✅ Steady-state analysis: pace=${avgPace.toFixed(1)}s/mi, target=${targetPace.toFixed(1)}s/mi, CV=${(cv*100).toFixed(1)}%, score=${(finalScore*100).toFixed(1)}%`);
  
  // Calculate duration adherence - use computed total duration (most reliable)
  const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;

  const actualDurationSeconds = 
    workout?.computed?.overall?.duration_s_moving ||
    intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
  
  // Calculate duration adherence: penalize both going over and under
  let durationAdherencePct = 0;
  if (plannedDurationSeconds > 0 && actualDurationSeconds > 0) {
    const ratio = actualDurationSeconds / plannedDurationSeconds;
    if (ratio >= 0.9 && ratio <= 1.1) {
      // Within 10% tolerance - high score (90-100%)
      durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
    } else if (ratio < 0.9) {
      // Too short - penalize proportionally
      durationAdherencePct = ratio * 100;
    } else {
      // Too long - penalize (inverse ratio)
      durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
    }
    durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct)); // Clamp 0-100
  }
  
  // Calculate HR drift for steady-state workouts with segments
  // Collect all samples from main segments
  const allSegmentSamples: any[] = [];
  for (const segment of mainSegments) {
    if (segment.sample_idx_start !== undefined && segment.sample_idx_end !== undefined) {
      const segmentSamples = sensorData.slice(segment.sample_idx_start, segment.sample_idx_end + 1);
      allSegmentSamples.push(...segmentSamples);
    }
  }
  
  // If no segment indices, use all sensor data
  const samplesForHR = allSegmentSamples.length > 0 ? allSegmentSamples : sensorData;
  
  let heartRateAnalysis = null;
  if (samplesForHR.length > 0) {
    // Determine work period timestamps
    const workStartTimestamp = samplesForHR.length > 0 
      ? (samplesForHR[0].timestamp || samplesForHR[0].elapsed_time_s || 0)
      : undefined;
    const workEndTimestamp = samplesForHR.length > 0
      ? (samplesForHR[samplesForHR.length - 1].timestamp || samplesForHR[samplesForHR.length - 1].elapsed_time_s || 0)
      : undefined;
    
    const hrDriftResult = calculateHeartRateDrift(samplesForHR, workStartTimestamp, workEndTimestamp);
    
    if (hrDriftResult.valid) {
      // Calculate average HR from all samples
      const validHRSamples = samplesForHR.filter(s => s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250);
      const avgHR = validHRSamples.length > 0
        ? Math.round(validHRSamples.reduce((sum, s) => sum + s.heart_rate, 0) / validHRSamples.length)
        : 0;
      const maxHR = validHRSamples.length > 0 ? Math.max(...validHRSamples.map(s => s.heart_rate)) : 0;
      
      heartRateAnalysis = {
        adherence_percentage: 100, // Not applicable for steady-state
        time_in_zone_s: actualDurationSeconds,
        time_outside_zone_s: 0,
        total_time_s: actualDurationSeconds,
        samples_in_zone: validHRSamples.length,
        samples_outside_zone: 0,
        average_heart_rate: avgHR,
        target_zone: null,
        hr_drift_bpm: hrDriftResult.drift_bpm,
        early_avg_hr: hrDriftResult.early_avg_hr,
        late_avg_hr: hrDriftResult.late_avg_hr,
        hr_drift_interpretation: hrDriftResult.interpretation,
        hr_consistency: 1 - cv // Use pace variability as proxy
      };
    }
  }
  
  return {
    overall_adherence: finalScore,
    time_in_range_score: paceAdherence,
    variability_score: cv,
    smoothness_score: 1 - cv, // Higher CV = lower smoothness
    pacing_variability: {
      coefficient_of_variation: cv * 100,
      avg_pace_change_per_min: stdDev,
      num_surges: 0, // Would calculate from pace changes
      num_crashes: 0, // Would calculate from pace changes
      steadiness_score: Math.max(0, 100 - (cv * 100)),
      avg_pace_change_seconds: stdDev
    },
    time_in_range_s: 0, // Not applicable for steady-state
    time_outside_range_s: 0,
    total_time_s: 0,
    samples_in_range: 0,
    samples_outside_range: 0,
    heart_rate_analysis: heartRateAnalysis,
    pacing_analysis: {
      time_in_range_score: paceAdherence * 100, // Convert decimal to percentage
      variability_score: cv,
      smoothness_score: 1 - cv,
      pacing_variability: cv * 100
    },
    duration_adherence: {
      adherence_percentage: durationAdherencePct,
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      delta_seconds: actualDurationSeconds - plannedDurationSeconds
    }
  };
}

/**
 * Helper function to create empty adherence result
 */
function createEmptyAdherence(): PrescribedRangeAdherence {
  return {
    overall_adherence: 0,
    time_in_range_score: 0,
    variability_score: 0,
    smoothness_score: 0,
    pacing_variability: {
      coefficient_of_variation: 0,
      avg_pace_change_per_min: 0,
      num_surges: 0,
      num_crashes: 0,
      steadiness_score: 0,
      avg_pace_change_seconds: 0
    },
    time_in_range_s: 0,
    time_outside_range_s: 0,
    total_time_s: 0,
    samples_in_range: 0,
    samples_outside_range: 0,
    heart_rate_analysis: null,
    pacing_analysis: null,
    duration_adherence: null
  };
}

/**
 * Calculate average pace from sensor samples
 */
function calculateAveragePace(samples: any[]): number {
  if (samples.length === 0) return 0;
  
  const validPaces = samples
    .map(sample => sample.pace_s_per_mi)
    .filter(pace => pace && pace > 0);
  
  if (validPaces.length === 0) return 0;
  
  return validPaces.reduce((sum, pace) => sum + pace, 0) / validPaces.length;
}

/**
 * Calculate standard deviation
 */
function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  
  return Math.sqrt(variance);
}

/**
 * Calculate pace from GPS coordinates using Haversine formula
 * Returns pace in seconds per mile, or null if calculation fails
 */
function calculatePaceFromGPS(sample: any, prevSample: any): number | null {
  if (!sample || !prevSample) return null;
  
  const lat1 = sample.latitude;
  const lon1 = sample.longitude;
  const lat2 = prevSample.latitude;
  const lon2 = prevSample.longitude;
  const timestamp1 = sample.timestamp;
  const timestamp2 = prevSample.timestamp;
  
  // Validate inputs
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  if (timestamp1 == null || timestamp2 == null) return null;
  
  // Check for valid coordinate ranges
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) return null;
  if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) return null;
  
  // Calculate time delta
  const timeDelta = Math.abs(timestamp1 - timestamp2);
  if (timeDelta <= 0 || timeDelta > 300) return null; // Max 5 minutes between samples
  
  // Haversine formula to calculate distance in meters
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceMeters = R * c;
  
  // Calculate speed in m/s first to validate
  const speedMps = distanceMeters / timeDelta;
  
  // Validate speed (realistic running: 0.5-10 m/s = 1.8-36 km/h)
  // This also validates distance indirectly (distance = speed * time)
  if (speedMps < 0.5 || speedMps > 10) return null;
  
  // Convert to pace in seconds per mile
  // 1 mile = 1609.34 meters
  // pace = time / distance = timeDelta / (distanceMeters / 1609.34)
  const paceSecondsPerMile = (timeDelta * 1609.34) / distanceMeters;
  
  // Validate pace (reasonable running: 3-20 min/mi = 180-1200 s/mi)
  if (paceSecondsPerMile < 180 || paceSecondsPerMile > 1200) return null;
  
  return paceSecondsPerMile;
}

/**
 * Calculate time-in-range adherence for a single interval
 * This is the CORRECT way to calculate adherence - measures what percentage of time was spent in prescribed range
 */
function calculateTimeInRangeAdherence(samples: any[], interval: any): number | null {
  if (!interval.target_pace?.lower || !interval.target_pace?.upper) {
    return null;
  }
  
  const validSamples = samples.filter(s => s.pace_s_per_mi && s.pace_s_per_mi > 0);
  
  if (validSamples.length === 0) {
    return null;
  }
  
  const lowerBound = interval.target_pace.lower;
  const upperBound = interval.target_pace.upper;
  
  let samplesInRange = 0;
  let totalSamples = 0;
  
  for (const sample of validSamples) {
    totalSamples++;
    if (sample.pace_s_per_mi >= lowerBound && sample.pace_s_per_mi <= upperBound) {
      samplesInRange++;
    }
  }
  
  const adherencePercentage = totalSamples > 0 ? (samplesInRange / totalSamples) * 100 : 0;
  
  console.log(`🔍 Time-in-range for ${interval.role}: ${samplesInRange}/${totalSamples} samples (${adherencePercentage.toFixed(1)}%)`);
  
  return adherencePercentage;
}

/**
 * Calculate heart rate drift (increase over time) using proper time windows
 * HR drift measures cardiovascular fatigue during sustained efforts by comparing
 * early-run HR to late-run HR at the same effort level.
 * 
 * Algorithm:
 * 1. Identify work period (exclude warmup/cooldown - skip first 3-5 min, last 3-5 min)
 * 2. Early window: Minutes 5-15 of sustained work (10 min average)
 * 3. Late window: Last 10 minutes of sustained work
 * 4. Calculate drift = lateAvgHR - earlyAvgHR
 * 
 * @param sensorData Array of sensor samples with timestamp and heart_rate
 * @param workStartTimestamp Start timestamp of work period (seconds)
 * @param workEndTimestamp End timestamp of work period (seconds)
 * @returns Object with drift_bpm, early_avg_hr, late_avg_hr, and interpretation

function analyzeIntervalPace(samples: any[], interval: any, plannedWorkout?: any): any {
  const validSamples = samples.filter(s => s.pace_s_per_mi && s.pace_s_per_mi > 0);
  
  if (validSamples.length === 0) {
    return {
      timeInRange: 0,
      timeOutsideRange: 0,
      totalSamples: 0,
      filteredOutliers: 0,
      handledGaps: 0,
      adherence: 0,
      granular_metrics: null
    };
  }
  
  // ✅ TRUE GRANULAR ANALYSIS: Check each sample against prescribed range
  // ✅ FIX: Always ensure we have a valid range (never allow lower === upper)
  
  // Helper to expand single pace to range with appropriate tolerance
  const expandSinglePaceToRange = (singlePace: number): { lower: number; upper: number } => {
    // Find planned step to determine tolerance
    const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
    const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
    return {
      lower: Math.round(singlePace * (1 - tolerance)),
      upper: Math.round(singlePace * (1 + tolerance))
    };
  };

  // Extract pace range from multiple possible locations
  let targetLower: number | null = null;
  let targetUpper: number | null = null;
  let singlePaceValue: number | null = null;

  // Try to get range from various locations
  targetLower = interval.target_pace?.lower || 
                interval.pace_range?.lower ||
                interval.planned?.pace_range?.lower ||
                null;

  targetUpper = interval.target_pace?.upper || 
                interval.pace_range?.upper ||
                interval.planned?.pace_range?.upper ||
                null;

  // If we have a single pace value but no range, capture it
  if (!targetLower && !targetUpper) {
    singlePaceValue = interval.planned?.target_pace_s_per_mi || null;
  }

  // ✅ FIX: Check for zero-width range (lower === upper)
  if (targetLower !== null && targetUpper !== null && targetLower === targetUpper && targetLower > 0) {
    // Zero-width range detected - expand it
    const expanded = expandSinglePaceToRange(targetLower);
    targetLower = expanded.lower;
    targetUpper = expanded.upper;
    console.log(`⚠️ [FIX] Expanded zero-width range ${targetLower}-${targetLower} to ${targetLower}-${targetUpper}s/mi`);
  }

  // ✅ FIX: If we only have a single pace value, expand it to a range
  if (singlePaceValue && targetLower === null && targetUpper === null) {
    const expanded = expandSinglePaceToRange(singlePaceValue);
    targetLower = expanded.lower;
    targetUpper = expanded.upper;
    console.log(`⚠️ [FIX] Expanded single pace ${singlePaceValue}s/mi to range ${targetLower}-${targetUpper}s/mi`);
  }

  // Final validation - ensure we have valid bounds
  if (targetLower === null || targetUpper === null || targetLower === 0 || targetUpper === 0) {
    console.warn(`⚠️ No valid target pace range found for interval ${interval.role || interval.kind}. Available:`, {
      hasTargetPace: !!interval.target_pace,
      hasPaceRange: !!interval.pace_range,
      hasPlannedPaceRange: !!interval.planned?.pace_range,
      hasPlannedTargetPace: !!interval.planned?.target_pace_s_per_mi,
      targetPace: interval.target_pace,
      paceRange: interval.pace_range,
      planned: interval.planned,
      extractedLower: targetLower,
      extractedUpper: targetUpper
    });
    return {
      timeInRange: 0,
      timeOutsideRange: 0,
      totalSamples: validSamples.length,
      filteredOutliers: 0,
      handledGaps: 0,
      adherence: 0,
      granular_metrics: null
    };
  }

  // ✅ FIX: Final safety check - ensure lower < upper
  if (targetLower >= targetUpper) {
    console.warn(`⚠️ [FIX] Invalid range detected: ${targetLower}-${targetUpper}, expanding...`);
    const center = targetLower; // Use lower as center
    const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
    const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
    targetLower = Math.round(center * (1 - tolerance));
    targetUpper = Math.round(center * (1 + tolerance));
  }
  
  console.log(`🔍 [ANALYZE] Interval ${interval.role || interval.kind}: target pace range ${targetLower.toFixed(0)}-${targetUpper.toFixed(0)}s/mi`);
  
  // Sample-by-sample time-in-range calculation (TRUE granular analysis)
  let samplesInRange = 0;
  let samplesOutsideRange = 0;
  const paceValues = validSamples.map(s => s.pace_s_per_mi);
  
  for (const pace of paceValues) {
    if (pace >= targetLower && pace <= targetUpper) {
      samplesInRange++;
    } else {
      samplesOutsideRange++;
    }
  }
  
  const totalSamples = validSamples.length;
  const timeInRangeScore = totalSamples > 0 ? samplesInRange / totalSamples : 0;
  
  // Calculate average pace for metrics
  const avgPace = paceValues.reduce((sum, v) => sum + v, 0) / paceValues.length;
  
  // Calculate granular metrics
  const hrValues = samples.filter(s => s.heart_rate && s.heart_rate > 0).map(s => s.heart_rate);
  const cadenceValues = samples.filter(s => s.cadence && s.cadence > 0).map(s => s.cadence);
  
  // Pace variation (coefficient of variation)
  const paceStdDev = Math.sqrt(paceValues.reduce((sum, v) => sum + Math.pow(v - avgPace, 2), 0) / paceValues.length);
  const paceVariation = avgPace > 0 ? (paceStdDev / avgPace) * 100 : 0;
  
  // HR drift - Calculate for this interval's samples
  // Note: For interval workouts, HR drift should ideally be calculated across the entire work period,
  // not per-interval. This per-interval calculation is a fallback.
  const intervalStartTimestamp = samples.length > 0 
    ? (samples[0].timestamp || samples[0].elapsed_time_s || 0)
    : undefined;
  const intervalEndTimestamp = samples.length > 0
    ? (samples[samples.length - 1].timestamp || samples[samples.length - 1].elapsed_time_s || 0)
    : undefined;
  
  const hrDriftResult = calculateHeartRateDrift(samples, intervalStartTimestamp, intervalEndTimestamp);
  const hrDrift = hrDriftResult.valid ? hrDriftResult.drift_bpm : 0;
  
  // Cadence consistency (coefficient of variation)
  const avgCadence = cadenceValues.length > 0 
    ? cadenceValues.reduce((sum, v) => sum + v, 0) / cadenceValues.length 
    : 0;
  const cadenceStdDev = cadenceValues.length > 0
    ? Math.sqrt(cadenceValues.reduce((sum, v) => sum + Math.pow(v - avgCadence, 2), 0) / cadenceValues.length)
    : 0;
  const cadenceConsistency = avgCadence > 0 ? (cadenceStdDev / avgCadence) * 100 : 0;
  
  console.log(`🔍 [GRANULAR] Interval ${interval.role}: ${samplesInRange}/${totalSamples} samples in range (${(timeInRangeScore * 100).toFixed(1)}%), target: ${targetLower.toFixed(0)}-${targetUpper.toFixed(0)}s/mi`);
  
  return {
    timeInRange: samplesInRange,  // Actual count of samples in range
    timeOutsideRange: samplesOutsideRange,  // Actual count of samples outside range
    totalSamples: totalSamples,
    filteredOutliers: 0,
    handledGaps: 0,
    adherence: timeInRangeScore,  // Use time-in-range score as adherence
    granular_metrics: {
      pace_variation_pct: Math.round(paceVariation * 10) / 10,
      hr_drift_bpm: Math.round(hrDrift * 10) / 10,
      cadence_consistency_pct: Math.round(cadenceConsistency * 10) / 10,
      time_in_target_pct: Math.round(timeInRangeScore * 100)
    }
  };
}

/**
 * REMOVED: calculatePrescribedRangeAdherence - Dead code, never called
 * Replaced by calculatePrescribedRangeAdherenceGranular
 * 
 * Removed ~960 lines of dead code including:
 * - calculatePrescribedRangeAdherence
 * - calculateEnhancedAdherence  
 * - All helper functions only used by dead code
 */

/**
 * Generate detailed, chart-like analysis with specific metrics
 * Provides actionable insights similar to Garmin Connect analysis
 */
function generateDetailedChartAnalysis(sensorData: any[], intervals: any[], granularAnalysis: any, plannedPaceInfo: any, workout?: any, userUnits: 'metric' | 'imperial' = 'imperial', plannedWorkout?: any): any {
  console.log('📊 Generating detailed chart analysis...');
  
  // Extract work intervals for detailed analysis
  const workIntervals = intervals.filter(i => i.role === 'work' && i.executed);
  const recoveryIntervals = intervals.filter(i => i.role === 'recovery' && i.executed);
  
  // Speed fluctuation analysis
  const speedAnalysis = analyzeSpeedFluctuations(sensorData, workIntervals);
  
  // Heart rate recovery analysis
  const hrRecoveryAnalysis = analyzeHeartRateRecovery(sensorData, workIntervals, recoveryIntervals);
  
  // Get overall pace adherence from granular analysis for comparison
  const overallPaceAdherence = granularAnalysis?.overall_adherence 
    ? Math.round(granularAnalysis.overall_adherence * 100)
    : undefined;
  
  // Interval-by-interval breakdown (pass all intervals for warmup/recovery/cooldown analysis)
  const intervalBreakdown = generateIntervalBreakdown(workIntervals, intervals, overallPaceAdherence, granularAnalysis, sensorData, userUnits, plannedWorkout, workout);
  
  // Pacing consistency analysis
  const pacingConsistency = analyzePacingConsistency(sensorData, workIntervals);
  
  // Calculate workout-level average pace (from moving_time/distance) to pass to mile breakdown
  // This ensures consistency between AI narrative and pattern analysis
  const workoutMovingTimeSeconds = workout?.computed?.overall?.duration_s_moving 
    || (workout?.moving_time ? workout.moving_time * 60 : null)
    || (workout?.duration ? workout.duration * 60 : 0);
  const workoutDistanceKm = workout?.distance || 0;
  const workoutDistanceMi = workoutDistanceKm * 0.621371;
  const workoutAvgPaceSeconds = (workoutMovingTimeSeconds > 0 && workoutDistanceMi > 0) 
    ? workoutMovingTimeSeconds / workoutDistanceMi 
    : null;
  
  // Detect if this is an interval workout (multiple work segments or alternating work/recovery)
  // Interval workouts should NOT have mile-by-mile breakdown - use interval breakdown instead
  const isIntervalWorkout = workIntervals.length > 1 || 
    (workIntervals.length >= 1 && recoveryIntervals.length >= 1 && intervals.length > 2);
  
  // Generate mile-by-mile terrain breakdown ONLY for continuous runs (not interval workouts)
  const mileByMileTerrain = isIntervalWorkout ? null : generateMileByMileTerrainBreakdown(
    sensorData, 
    intervals, 
    granularAnalysis, 
    plannedPaceInfo,
    workoutAvgPaceSeconds
  );
  
  return {
    speed_fluctuations: speedAnalysis,
    heart_rate_recovery: hrRecoveryAnalysis,
    interval_breakdown: intervalBreakdown,
    pacing_consistency: pacingConsistency,
    workout_summary: {
      total_intervals: workIntervals.length,
      completed_intervals: workIntervals.filter(i => i.executed).length,
      average_pace_adherence: workIntervals.length > 0 ? 
        workIntervals.reduce((sum, i) => sum + (i.pace_adherence || 0), 0) / workIntervals.length : 0,
      pace_variability: granularAnalysis.pacing_analysis?.pacing_variability || 0,
      hr_drift: granularAnalysis.heart_rate_analysis?.hr_drift_bpm || 0
    },
    mile_by_mile_terrain: mileByMileTerrain
  };
}

/**
 * Analyze speed fluctuations throughout the workout
 */
function analyzeSpeedFluctuations(sensorData: any[], workIntervals: any[]): any {
  if (workIntervals.length === 0) {
    return { available: false, message: 'No work intervals to analyze' };
  }
  
  // Extract pace data from work intervals
  const paceData = [];
  let currentTime = 0;
  
  for (const interval of workIntervals) {
    const intervalSamples = sensorData.filter(s => 
      s.timestamp >= interval.start_time_s && s.timestamp <= interval.end_time_s
    );
    
    for (const sample of intervalSamples) {
      if (sample.pace_s_per_mi && sample.pace_s_per_mi > 0) {
        paceData.push({
          time_s: currentTime + (sample.timestamp - interval.start_time_s),
          pace_min_per_mi: sample.pace_s_per_mi / 60,
          interval_type: interval.role
        });
      }
    }
    currentTime += interval.duration_s;
  }
  
  if (paceData.length === 0) {
    return { available: false, message: 'No pace data available' };
  }
  
  // Calculate pace statistics
  const paces = paceData.map(d => d.pace_min_per_mi);
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const paceRange = maxPace - minPace;
  
  // Calculate pace variability (coefficient of variation)
  const variance = paces.reduce((sum, pace) => sum + Math.pow(pace - avgPace, 2), 0) / paces.length;
  const stdDev = Math.sqrt(variance);
  const paceVariability = (stdDev / avgPace) * 100;
  
  // Identify pace patterns
  const patterns = identifyPacePatterns(paceData, workIntervals);
  
  return {
    available: true,
    average_pace_min_per_mi: Math.round(avgPace * 100) / 100,
    pace_range_min_per_mi: Math.round(paceRange * 100) / 100,
    fastest_pace_min_per_mi: Math.round(minPace * 100) / 100,
    slowest_pace_min_per_mi: Math.round(maxPace * 100) / 100,
    pace_variability_percent: Math.round(paceVariability * 10) / 10,
    pace_consistency_score: Math.max(0, 100 - paceVariability), // Higher is better
    patterns: patterns,
    data_points: paceData.length
  };
}

/**
 * Analyze heart rate recovery between intervals
 */
function analyzeHeartRateRecovery(sensorData: any[], workIntervals: any[], recoveryIntervals: any[]): any {
  if (workIntervals.length === 0 || recoveryIntervals.length === 0) {
    return { available: false, message: 'Need both work and recovery intervals for HR analysis' };
  }
  
  const hrRecoveryData = [];
  
  // Analyze HR recovery for each work-recovery pair
  for (let i = 0; i < Math.min(workIntervals.length, recoveryIntervals.length); i++) {
    const workInterval = workIntervals[i];
    const recoveryInterval = recoveryIntervals[i];
    
    // Get HR at end of work interval
    const workEndSamples = sensorData.filter(s => 
      s.timestamp >= workInterval.end_time_s - 10 && s.timestamp <= workInterval.end_time_s
    );
    const workEndHR = workEndSamples
      .filter(s => s.heart_rate && s.heart_rate > 0)
      .map(s => s.heart_rate);
    
    // Get HR at end of recovery interval
    const recoveryEndSamples = sensorData.filter(s => 
      s.timestamp >= recoveryInterval.end_time_s - 10 && s.timestamp <= recoveryInterval.end_time_s
    );
    const recoveryEndHR = recoveryEndSamples
      .filter(s => s.heart_rate && s.heart_rate > 0)
      .map(s => s.heart_rate);
    
    if (workEndHR.length > 0 && recoveryEndHR.length > 0) {
      const avgWorkEndHR = workEndHR.reduce((a, b) => a + b, 0) / workEndHR.length;
      const avgRecoveryEndHR = recoveryEndHR.reduce((a, b) => a + b, 0) / recoveryEndHR.length;
      const hrDrop = avgWorkEndHR - avgRecoveryEndHR;
      
      hrRecoveryData.push({
        interval_number: i + 1,
        work_end_hr: Math.round(avgWorkEndHR),
        recovery_end_hr: Math.round(avgRecoveryEndHR),
        hr_drop_bpm: Math.round(hrDrop),
        recovery_time_s: recoveryInterval.duration_s,
        recovery_efficiency: hrDrop / recoveryInterval.duration_s // BPM drop per second
      });
    }
  }
  
  if (hrRecoveryData.length === 0) {
    return { available: false, message: 'No heart rate recovery data available' };
  }
  
  // Calculate recovery statistics
  const avgHRDrop = hrRecoveryData.reduce((sum, d) => sum + d.hr_drop_bpm, 0) / hrRecoveryData.length;
  const avgRecoveryEfficiency = hrRecoveryData.reduce((sum, d) => sum + d.recovery_efficiency, 0) / hrRecoveryData.length;
  
  // Assess recovery quality
  const recoveryQuality = avgHRDrop > 20 ? 'Excellent' : 
                         avgHRDrop > 15 ? 'Good' : 
                         avgHRDrop > 10 ? 'Fair' : 'Poor';
  
  return {
    available: true,
    average_hr_drop_bpm: Math.round(avgHRDrop),
    average_recovery_efficiency: Math.round(avgRecoveryEfficiency * 100) / 100,
    recovery_quality: recoveryQuality,
    intervals_analyzed: hrRecoveryData.length,
    recovery_data: hrRecoveryData
  };
}



/**
 * Generate detailed mile-by-mile breakdown with pace analysis and comparison to target range
 */
function generateMileByMileTerrainBreakdown(
  sensorData: any[], 
  intervals: any[], 
  granularAnalysis: any, 
  plannedPaceInfo: any,
  workoutAvgPaceSeconds?: number | null
): any {
  console.log(`🔍 [MILE BREAKDOWN] Starting function. Sensor data: ${sensorData.length} samples, Intervals: ${intervals.length}`);
  
  if (sensorData.length === 0) {
    console.log('⚠️ [MILE BREAKDOWN] No sensor data');
    return null;
  }
  
  // Extract work intervals
  const workIntervals = intervals.filter(i => i.role === 'work' && i.executed);
  console.log(`🔍 [MILE BREAKDOWN] Work intervals: ${workIntervals.length}`);
  
  if (workIntervals.length === 0) {
    console.log('⚠️ [MILE BREAKDOWN] No work intervals found');
    return null;
  }
  
  // Get target pace range from plannedPaceInfo (passed from main function)
  // Fallback to extracting from intervals if not provided
  let targetLower: number | null = null;
  let targetUpper: number | null = null;
  let targetPaceS: number | null = null;
  let isRangeWorkout = false;
  
  console.log(`🔍 [MILE BREAKDOWN] plannedPaceInfo received:`, plannedPaceInfo ? JSON.stringify(plannedPaceInfo) : 'null');
  
  if (plannedPaceInfo) {
    console.log(`🔍 [MILE BREAKDOWN] plannedPaceInfo.type: ${plannedPaceInfo.type}`);
    if (plannedPaceInfo.type === 'range') {
      targetLower = plannedPaceInfo.lower || null;
      targetUpper = plannedPaceInfo.upper || null;
      isRangeWorkout = !!(targetLower && targetUpper && targetLower !== targetUpper);
      console.log(`🔍 [MILE BREAKDOWN] Extracted from plannedPaceInfo: lower=${targetLower}, upper=${targetUpper}, isRange=${isRangeWorkout}`);
    } else if (plannedPaceInfo.type === 'single') {
      targetPaceS = plannedPaceInfo.targetSeconds || null;
      console.log(`🔍 [MILE BREAKDOWN] Single target: ${targetPaceS}`);
    }
  }
  
  // Fallback: try to extract from intervals if plannedPaceInfo not available
  if (!targetLower && !targetPaceS) {
    console.log(`🔍 [MILE BREAKDOWN] Falling back to interval extraction`);
    const paceRange = workIntervals[0]?.pace_range || workIntervals[0]?.target_pace || null;
    console.log(`🔍 [MILE BREAKDOWN] paceRange from interval:`, paceRange);
    targetLower = paceRange?.lower || null;
    targetUpper = paceRange?.upper || null;
    targetPaceS = paceRange?.lower && paceRange?.lower === paceRange?.upper ? paceRange.lower : null;
    isRangeWorkout = !!(targetLower && targetUpper && targetLower !== targetUpper);
    console.log(`🔍 [MILE BREAKDOWN] Extracted from interval: lower=${targetLower}, upper=${targetUpper}, isRange=${isRangeWorkout}`);
  }
  
  // Get total distance from work intervals (distance is in executed object)
  const totalDistanceM = workIntervals.reduce((sum, i) => sum + (i.executed?.distance_m || 0), 0);
  const totalDistanceMi = totalDistanceM / 1609.34;
  
  console.log(`🔍 [MILE BREAKDOWN] Total distance: ${totalDistanceM.toFixed(2)}m (${totalDistanceMi.toFixed(2)} miles)`);
  
  if (totalDistanceMi < 0.5) {
    console.log(`⚠️ [MILE BREAKDOWN] Distance too short: ${totalDistanceMi.toFixed(2)} miles`);
    return null; // Too short for mile breakdown
  }
  
  // Calculate cumulative distance from sensor samples
  // Since extractSensorData doesn't preserve distance fields, calculate from pace and time
  let cumulativeDistanceM = 0;
  const samplesWithDistance = sensorData.map((sample, index) => {
    // Calculate distance from pace and time (each sample is 1 second)
    if (sample.pace_s_per_mi && sample.pace_s_per_mi > 0) {
      const speedMps = 1609.34 / sample.pace_s_per_mi; // Convert pace (s/mi) to speed (m/s)
      cumulativeDistanceM += speedMps * (sample.duration_s || 1); // Usually 1 second per sample
    }
    
    return {
      ...sample,
      distance_m: cumulativeDistanceM
    };
  });
  
  console.log(`🔍 [MILE BREAKDOWN] Calculated cumulative distance: ${cumulativeDistanceM.toFixed(2)}m (${(cumulativeDistanceM / 1609.34).toFixed(2)} miles) from ${samplesWithDistance.length} samples`);
  console.log(`🔍 [MILE BREAKDOWN] Total distance from intervals: ${totalDistanceM.toFixed(2)}m (${totalDistanceMi.toFixed(2)} miles)`);
  
  // Calculate mile splits
  const mileSplits: any[] = [];
  const miles = Math.floor(totalDistanceMi);
  
  for (let mile = 1; mile <= miles; mile++) {
    const mileStartM = (mile - 1) * 1609.34;
    const mileEndM = mile * 1609.34;
    
    // Find samples in this mile
    const mileSamples = samplesWithDistance.filter(s => 
      s.distance_m >= mileStartM && s.distance_m < mileEndM
    );
    
    if (mileSamples.length === 0) continue;
    
    // Calculate average pace for this mile
    const paces = mileSamples.map(s => s.pace_s_per_mi).filter(p => p && p > 0);
    if (paces.length === 0) continue;
    
    const avgPaceS = paces.reduce((a, b) => a + b, 0) / paces.length;
    
    // Try to get elevation if available (check multiple field names)
    const elevations = mileSamples
      .map(s => s.elevation_m || s.elevation || s.elevationInMeters)
      .filter(e => e != null && Number.isFinite(e));
    
    // Use first and last elevation values for the mile
    const startElev = elevations.length > 0 ? elevations[0] : null;
    const endElev = elevations.length > 0 ? elevations[elevations.length - 1] : null;
    const elevGain = endElev != null && startElev != null ? Math.max(0, endElev - startElev) : null;
    
    // Calculate grade if elevation available
    const distanceM = mileEndM - mileStartM;
    const gradePercent = distanceM > 0 && startElev != null && endElev != null 
      ? ((endElev - startElev) / distanceM) * 100 
      : null;
    
    // Determine terrain type
    let terrainType = 'flat';
    if (gradePercent != null) {
      if (Math.abs(gradePercent) > 0.5) {
        terrainType = gradePercent > 0 ? 'uphill' : 'downhill';
      }
    }
    
    mileSplits.push({
      mile: mile,
      pace_s_per_mi: avgPaceS,
      elevation_gain_m: elevGain,
      grade_percent: gradePercent,
      terrain_type: terrainType,
      start_elevation_m: startElev,
      end_elevation_m: endElev
    });
  }
  
  if (mileSplits.length === 0) {
    console.log('⚠️ [MILE BREAKDOWN] No mile splits generated.');
    console.log(`   - Total distance from intervals: ${totalDistanceMi.toFixed(2)} miles`);
    console.log(`   - Calculated cumulative distance: ${cumulativeDistanceM.toFixed(2)}m (${(cumulativeDistanceM / 1609.34).toFixed(2)} miles)`);
    console.log(`   - Samples: ${samplesWithDistance.length}`);
    console.log(`   - First sample distance_m: ${samplesWithDistance[0]?.distance_m}`);
    console.log(`   - Last sample distance_m: ${samplesWithDistance[samplesWithDistance.length - 1]?.distance_m}`);
    return null;
  }
  
  console.log(`✅ [MILE BREAKDOWN] Generated ${mileSplits.length} mile splits from ${samplesWithDistance.length} samples`);
  
  // Format as text section for UI display
  const formatPace = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };
  
  let sectionText = 'MILE-BY-MILE TERRAIN BREAKDOWN (Work Portion):\n\n';
  
  // Display target range or single target once at the top
  if (isRangeWorkout && targetLower && targetUpper) {
    sectionText += `Target range: ${formatPace(targetLower)}-${formatPace(targetUpper)}/mi\n\n`;
  } else if (targetPaceS) {
    sectionText += `Target pace: ${formatPace(targetPaceS)}/mi\n\n`;
  } else if (targetLower) {
    sectionText += `Target pace: ${formatPace(targetLower)}/mi\n\n`;
  }
  
  // Calculate target pace for single-target comparisons (use midpoint for range workouts if no single target)
  if (!targetPaceS && isRangeWorkout && targetLower && targetUpper) {
    targetPaceS = (targetLower + targetUpper) / 2; // Use midpoint for range workouts when comparing
  } else if (!targetPaceS && targetLower) {
    targetPaceS = targetLower; // Use lower bound if no single target set
  }
  
  // Analyze each mile
  let milesInRange = 0;
  const mileDetails: string[] = [];
  const terrainStats: { [key: string]: { count: number; totalDelta: number } } = {};
  
  // Debug: Log range values
  if (targetLower && targetUpper) {
    console.log(`🔍 [MILE BREAKDOWN] Range: ${targetLower}s (${formatPace(targetLower)}) to ${targetUpper}s (${formatPace(targetUpper)})`);
  } else if (targetPaceS) {
    console.log(`🔍 [MILE BREAKDOWN] Target pace: ${targetPaceS}s (${formatPace(targetPaceS)})`);
  } else {
    console.log(`🔍 [MILE BREAKDOWN] No target pace range available`);
  }
  
  mileSplits.forEach(split => {
    const paceStr = formatPace(split.pace_s_per_mi);
    const milePaceSeconds = split.pace_s_per_mi;
    
    // Compare to target
    let comparison = '';
    let deltaS = 0;
    let inRange = false;
    
    if (isRangeWorkout && targetLower && targetUpper) {
      // DEBUG: Log comparison for each mile
      console.log(`🔍 [MILE ${split.mile}] Pace: ${paceStr} (${milePaceSeconds}s), Range: ${targetLower}-${targetUpper}s`);
      console.log(`   Within? ${milePaceSeconds >= targetLower && milePaceSeconds <= targetUpper}`);
      
      // Compare to actual range bounds (both in seconds)
      if (milePaceSeconds >= targetLower && milePaceSeconds <= targetUpper) {
        comparison = '✓ Within range';
        inRange = true;
        milesInRange++;
        deltaS = 0; // In range, no delta
        console.log(`   ✅ Mile ${split.mile} WITHIN RANGE`);
      } else if (milePaceSeconds < targetLower) {
        // Faster than range start (lower bound) - lower seconds = faster pace
        deltaS = targetLower - milePaceSeconds;
        const deltaMin = Math.floor(deltaS / 60);
        const deltaSec = Math.round(deltaS % 60);
        comparison = `${deltaMin}:${String(deltaSec).padStart(2, '0')} faster than range start`;
        console.log(`   ⚡ Mile ${split.mile} FASTER by ${deltaS}s`);
      } else {
        // Slower than range end (upper bound) - higher seconds = slower pace
        deltaS = milePaceSeconds - targetUpper;
        const deltaMin = Math.floor(deltaS / 60);
        const deltaSec = Math.round(deltaS % 60);
        comparison = `${deltaMin}:${String(deltaSec).padStart(2, '0')} slower than range end`;
        console.log(`   🐌 Mile ${split.mile} SLOWER by ${deltaS}s`);
      }
    } else if (targetPaceS) {
      // Single target workout
      deltaS = milePaceSeconds - targetPaceS;
      const deltaAbs = Math.abs(deltaS);
      const deltaMin = Math.floor(deltaAbs / 60);
      const deltaSec = Math.round(deltaAbs % 60);
      const sign = deltaS > 0 ? '+' : '-';
      
      if (deltaAbs < 5) {
        comparison = '✓ On target';
        inRange = true;
        milesInRange++;
      } else {
        comparison = `${sign}${deltaMin}:${String(deltaSec).padStart(2, '0')} ${deltaS > 0 ? 'slower' : 'faster'} than target`;
      }
    }
    
    // Build terrain info if available
    let terrainInfo = '';
    if (split.grade_percent != null && split.elevation_gain_m != null) {
      const gradeStr = split.grade_percent.toFixed(1);
      const elevStr = Math.round(split.elevation_gain_m * 3.28084); // Convert to feet
      terrainInfo = ` on ${split.terrain_type} (${gradeStr}% grade, +${elevStr}ft)`;
    }
    
    // Format comparison with arrow and checkmark for within range
    let statusLine = '';
    if (inRange) {
      statusLine = `→ ✓ Within range`;
    } else {
      statusLine = `→ ${comparison}`;
    }
    
    mileDetails.push(`Mile ${split.mile}: ${paceStr}/mi${terrainInfo}\n${statusLine}`);
  });
  
  console.log(`✅ [MILE BREAKDOWN] Final count: ${milesInRange} of ${mileSplits.length} miles within range`);
  
  sectionText += mileDetails.join('\n\n') + '\n\n';
  
  // Add pattern analysis
  sectionText += 'PATTERN ANALYSIS:\n';
  
  // Calculate average pace - use workout-level pace if available (consistent with AI narrative)
  // Otherwise fall back to averaging mile splits
  const avgPaceS = workoutAvgPaceSeconds != null && workoutAvgPaceSeconds > 0
    ? workoutAvgPaceSeconds
    : (mileSplits.length > 0 
        ? mileSplits.reduce((sum, s) => sum + s.pace_s_per_mi, 0) / mileSplits.length 
        : 0);
  
  // Time-based adherence (from granular analysis)
  const timeBasedAdherence = granularAnalysis?.overall_adherence != null
    ? Math.round(granularAnalysis.overall_adherence * 100)
    : null;
  
  // Miles in range percentage
  const inRangePct = Math.round((milesInRange / mileSplits.length) * 100);
  
  // Add both metrics
  if (timeBasedAdherence != null) {
    sectionText += `- Time spent in range: ${timeBasedAdherence}% (${timeBasedAdherence >= 50 ? 'good' : timeBasedAdherence >= 30 ? 'moderate' : 'poor'} overall pace judgment)\n`;
  }
  sectionText += `- Complete miles in range: ${milesInRange} of ${mileSplits.length} (${inRangePct}%${inRangePct >= 50 ? ' - good consistency' : inRangePct >= 30 ? ' - moderate consistency' : ' - poor consistency'})\n`;
  
  // Average pace vs range - check if within 5 seconds for "essentially within range"
  if (isRangeWorkout && targetLower && targetUpper) {
    if (avgPaceS >= targetLower && avgPaceS <= targetUpper) {
      sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (within range ✓)\n`;
    } else if (avgPaceS < targetLower) {
      const delta = targetLower - avgPaceS;
      const deltaMin = Math.floor(delta / 60);
      const deltaSec = Math.round(delta % 60);
      if (delta <= 5) {
        sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (essentially within range, just ${deltaSec}s faster than range start)\n`;
      } else {
        sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (${deltaMin}:${String(deltaSec).padStart(2, '0')} faster than range start)\n`;
      }
    } else {
      const delta = avgPaceS - targetUpper;
      const deltaMin = Math.floor(delta / 60);
      const deltaSec = Math.round(delta % 60);
      if (delta <= 5) {
        sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (essentially within range, just ${deltaSec}s slower than range end)\n`;
      } else {
        sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (${deltaMin}:${String(deltaSec).padStart(2, '0')} slower than range end)\n`;
      }
    }
  } else if (targetPaceS) {
    const delta = avgPaceS - targetPaceS;
    const deltaAbs = Math.abs(delta);
    const deltaMin = Math.floor(deltaAbs / 60);
    const deltaSec = Math.round(deltaAbs % 60);
    const sign = delta > 0 ? '+' : '-';
    sectionText += `- Average pace: ${formatPace(avgPaceS)}/mi (${sign}${deltaMin}:${String(deltaSec).padStart(2, '0')} vs target)\n`;
  }
  
  // Identify patterns - recalculate to ensure accuracy
  const fastMiles = isRangeWorkout && targetLower 
    ? mileSplits.filter(s => s.pace_s_per_mi < targetLower)
    : [];
  const slowMiles = isRangeWorkout && targetUpper 
    ? mileSplits.filter(s => s.pace_s_per_mi > targetUpper)
    : [];
  const inRangeMiles = isRangeWorkout && targetLower && targetUpper
    ? mileSplits.filter(s => s.pace_s_per_mi >= targetLower && s.pace_s_per_mi <= targetUpper)
    : [];
  
  // Summary breakdown
  if (isRangeWorkout) {
    if (inRangeMiles.length > 0) {
      const inRangeNumbers = inRangeMiles.map(s => s.mile).join(', ');
      sectionText += `- Within range: Miles ${inRangeNumbers} (${inRangeMiles.length} of ${mileSplits.length})\n`;
    }
    if (fastMiles.length > 0) {
      const fastMileNumbers = fastMiles.map(s => s.mile).join(', ');
      sectionText += `- Faster than range: Miles ${fastMileNumbers} (${fastMiles.length} of ${mileSplits.length})\n`;
    }
    if (slowMiles.length > 0) {
      const slowMileNumbers = slowMiles.map(s => s.mile).join(', ');
      sectionText += `- Slower than range: Miles ${slowMileNumbers} (${slowMiles.length} of ${mileSplits.length})\n`;
    }
  }
  
  // Overall assessment - lead with strengths, frame weaknesses as opportunities
  const avgPaceFormatted = formatPace(avgPaceS);
  const avgPaceInRange = isRangeWorkout && targetLower && targetUpper 
    ? (avgPaceS >= targetLower && avgPaceS <= targetUpper)
    : false;
  const avgPaceNearRange = isRangeWorkout && targetLower && targetUpper
    ? (avgPaceS < targetLower && (targetLower - avgPaceS) <= 5) || (avgPaceS > targetUpper && (avgPaceS - targetUpper) <= 5)
    : false;
  
  // Build overall assessment referencing both metrics with polished phrasing
  if (inRangePct >= 75) {
    sectionText += `- Overall: Excellent pace discipline for easy run${timeBasedAdherence != null ? `. The ${timeBasedAdherence}% time-in-range demonstrates consistent execution.` : '.'}\n`;
  } else if (inRangePct >= 50) {
    if (avgPaceInRange || avgPaceNearRange) {
      const paceStatus = avgPaceInRange ? 'within range' : 'essentially within range';
      sectionText += `- Overall: Good average pace control (${avgPaceFormatted}/mi ${paceStatus}). Primary opportunity: improve mile-to-mile consistency—only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) suggests pacing instability.${timeBasedAdherence != null ? ` The ${timeBasedAdherence}% time-in-range shows good pace judgment.` : ''}\n`;
    } else {
      sectionText += `- Overall: Good pace discipline for easy run${timeBasedAdherence != null ? `. The ${timeBasedAdherence}% time-in-range demonstrates good pace judgment, but only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) reveals inconsistent execution.` : '.'}\n`;
    }
  } else {
    // Low in-range percentage - acknowledge strengths first, then explain the discrepancy
    if (avgPaceInRange || avgPaceNearRange) {
      const paceStatus = avgPaceInRange ? 'within range' : 'essentially within range';
      const delta = avgPaceS < targetLower! ? targetLower! - avgPaceS : (avgPaceS > targetUpper! ? avgPaceS - targetUpper! : 0);
      const deltaSec = Math.round(delta);
      const paceNote = avgPaceInRange 
        ? `${avgPaceFormatted}, within range`
        : `${avgPaceFormatted}, essentially within target`;
      
      if (timeBasedAdherence != null && timeBasedAdherence > inRangePct) {
        // Explain the discrepancy: high time-based but low mile-based indicates surge-and-fade
        sectionText += `- Overall: Excellent average pace control (${paceNote}). The ${timeBasedAdherence}% time-in-range demonstrates good pace judgment, but only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) reveals inconsistent execution within individual miles. This discrepancy indicates a surge-and-fade pattern—hitting the correct pace intermittently throughout each mile rather than maintaining steady effort. Primary opportunity: develop more consistent rhythm within each mile, not just achieving the right average pace.\n`;
      } else {
        sectionText += `- Overall: Excellent average pace control (${paceNote}). Primary opportunity: improve mile-to-mile consistency—only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) indicates pacing instability across the run.${timeBasedAdherence != null ? ` The ${timeBasedAdherence}% time-in-range shows good pace judgment.` : ''}\n`;
      }
    } else {
      sectionText += `- Overall: Needs improvement - focus on staying within range${timeBasedAdherence != null ? `. The ${timeBasedAdherence}% time-in-range shows some pace judgment, but only ${milesInRange} of ${mileSplits.length} complete miles within range (${inRangePct}%) reveals inconsistent execution.` : '.'}\n`;
    }
  }
  
  return {
    available: true,
    section: sectionText,
    splits: mileSplits,
    total_miles: mileSplits.length,
    miles_in_range: milesInRange,
    average_pace_s_per_mi: avgPaceS
  };
}

/**
 * Generate AI-powered narrative insights from structured analysis data
 * Converts metrics and patterns into human-readable observations
 */
async function generateAINarrativeInsights(
  sensorData: any[],
  workout: any,
  plannedWorkout: any,
  granularAnalysis: any,
  performance: any,
  detailedAnalysis: any,
  userUnits: 'metric' | 'imperial' = 'imperial',
  supabase: any = null
): Promise<string[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiKey) {
    console.warn('⚠️ OPENAI_API_KEY not set, skipping AI narrative generation');
    return null;
  }

  // Build context for AI - Calculate from sensor data directly
  console.log('🤖 [DEBUG] Building workout context for AI from sensor data...');
  
  // Calculate metrics from sensor data
  // Use workout-level fields for duration and distance
  // NOTE: Database stores distance in KM and moving_time in MINUTES (not meters/seconds!)
  // ✅ FIX: Use moving time (not elapsed time) for pace calculations
  // Priority: computed.overall.duration_s_moving (seconds) > moving_time (minutes) > duration (minutes, elapsed)
  const movingTimeSeconds = workout.computed?.overall?.duration_s_moving 
    || (workout.moving_time ? workout.moving_time * 60 : null)
    || (workout.duration ? workout.duration * 60 : 0); // Last resort (elapsed time)
  const totalDurationMinutes = movingTimeSeconds / 60;
  const totalDurationSeconds = movingTimeSeconds;
  const totalDistanceKm = workout.distance || 0;
  
  // Convert distance based on user preference
  const distanceValue = userUnits === 'metric' ? totalDistanceKm : totalDistanceKm * 0.621371;
  const distanceUnit = userUnits === 'metric' ? 'km' : 'miles';
  const paceUnit = userUnits === 'metric' ? 'min/km' : 'min/mi';
  
  // Calculate average pace from sensor data (matching chart calculation)
  // IMPORTANT: Chart averages SPEED then converts to pace (not average of paces!)
  // This is mathematically different and produces slightly different results
  
  // Extract valid speed samples from raw sensor data
  const rawSensorData = workout.sensor_data?.samples || [];
  const validSpeedSamples = rawSensorData.filter(s => 
    s.speedMetersPerSecond && 
    Number.isFinite(s.speedMetersPerSecond) && 
    s.speedMetersPerSecond > 0.5 &&  // Filter out stationary/unrealistic speeds
    s.speedMetersPerSecond < 10  // < 36 km/h (reasonable running speed)
  );
  
  let avgPaceSeconds = 0;
  let paceCalculationMethod = 'unknown';
  
  // ✅ CRITICAL FIX: Always calculate from moving time and distance (never use computed_avg_pace_s_per_mi)
  // We have the data - moving_time_seconds and distance - so use it directly
  if (distanceValue > 0 && movingTimeSeconds > 0) {
    // Calculate pace from moving time (CORRECT - uses moving time, not elapsed)
    avgPaceSeconds = movingTimeSeconds / distanceValue;
    
    // Convert to metric if needed
    if (userUnits === 'metric' && avgPaceSeconds > 0) {
      avgPaceSeconds = avgPaceSeconds / 1.609344;  // Convert s/mi to s/km
    }
    paceCalculationMethod = 'from_moving_time';
  } else if (validSpeedSamples.length > 0) {
    // Fallback only if we don't have moving time/distance: Calculate from sensor speed samples
    const avgSpeedMps = validSpeedSamples.reduce((sum, s) => sum + s.speedMetersPerSecond, 0) / validSpeedSamples.length;
    
    // Convert average speed to pace
    if (userUnits === 'imperial') {
      // Convert m/s to mph, then to min/mi
      const speedMph = avgSpeedMps * 2.23694;
      const paceMinPerMile = 60 / speedMph;
      avgPaceSeconds = paceMinPerMile * 60;  // Convert to seconds
    } else {
      // Convert m/s to km/h, then to min/km
      const speedKph = avgSpeedMps * 3.6;
      const paceMinPerKm = 60 / speedKph;
      avgPaceSeconds = paceMinPerKm * 60;  // Convert to seconds
    }
    paceCalculationMethod = 'from_sensor_speed';
  } else {
    // Should never happen - we should always have moving time and distance
    console.error('❌ [PACE CALC ERROR] No moving time or distance available - cannot calculate pace');
    avgPaceSeconds = 0;
    paceCalculationMethod = 'error_no_data';
  }
  
  // Convert to minutes per unit (km or mile)
  const avgPace = avgPaceSeconds / 60;
  
  const heartRates = sensorData.filter(s => s.heart_rate && s.heart_rate > 0).map(s => s.heart_rate);
  const avgHeartRate = heartRates.length > 0 ? 
    Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : 0;
  const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : 0;
  
  console.log('🤖 [DEBUG] RAW workout fields:', {
    workout_distance_km: workout.distance,
    workout_moving_time_min: workout.moving_time,
    workout_duration_min: workout.duration,
    workout_type: workout.type,
    computed_duration_s_moving: workout.computed?.overall?.duration_s_moving,
    moving_time_seconds_used: movingTimeSeconds,
    moving_time_source: workout.computed?.overall?.duration_s_moving 
      ? 'computed.overall.duration_s_moving' 
      : (workout.moving_time ? 'moving_time (minutes * 60)' : 'duration (elapsed, minutes * 60)')
  });
  
  console.log('🔍 [PACE CALCULATION] Pace source for AI:', {
    raw_sensor_samples: rawSensorData.length,
    valid_speed_samples: validSpeedSamples.length,
    avg_speed_mps: validSpeedSamples.length > 0 ? 
      (validSpeedSamples.reduce((sum, s) => sum + s.speedMetersPerSecond, 0) / validSpeedSamples.length) : null,
    avg_speed_mph: validSpeedSamples.length > 0 ? 
      ((validSpeedSamples.reduce((sum, s) => sum + s.speedMetersPerSecond, 0) / validSpeedSamples.length) * 2.23694) : null,
    computed_avg_pace_s_per_mi: workout.computed?.overall?.avg_pace_s_per_mi,
    moving_time_seconds: movingTimeSeconds,
    distance_miles: distanceValue,
    calculated_pace_seconds: avgPaceSeconds,
    final_pace_minutes: avgPace,
    user_units: userUnits,
    pace_unit: paceUnit,
    calculation_method: paceCalculationMethod,
    ai_will_report: `${Math.floor(avgPace)}:${String(Math.round((avgPace - Math.floor(avgPace)) * 60)).padStart(2, '0')} ${paceUnit}`,
    note: validSpeedSamples.length > 0 ? 'Chart averages SPEED then converts to pace' : 'Calculated from moving_time / distance'
  });
  
  console.log('🤖 [DEBUG] Calculated metrics:', {
    duration_minutes: totalDurationMinutes,
    distance: distanceValue,
    distance_unit: distanceUnit,
    avg_pace: avgPace,
    pace_unit: paceUnit,
    avg_hr: avgHeartRate,
    max_hr: maxHeartRate,
    user_units: userUnits,
    sensor_data_count: sensorData?.length || 0,
    hr_samples: heartRates.length
  });
  
  // Format pace as MM:SS for AI (not decimal minutes)
  const paceMinutes = Math.floor(avgPace);
  const paceSeconds = Math.round((avgPace - paceMinutes) * 60);
  const paceFormatted = `${paceMinutes}:${String(paceSeconds).padStart(2, '0')}`;
  
  // Extract weather data if available
  const weatherData = workout.weather_data || null;
  const weatherInfo = weatherData ? {
    temperature: weatherData.temperature || null,
    condition: weatherData.condition || null,
    humidity: weatherData.humidity || null,
    windSpeed: weatherData.windSpeed || null,
    windDirection: weatherData.windDirection || null
  } : null;
  
  // Also check for temperature from Garmin data as fallback
  const temperature = weatherInfo?.temperature || workout.avg_temperature || null;
  
  // Extract terrain data - USE EXACT SAME SOURCE AS DETAILS SCREEN (single source of truth)
  // Details screen uses: workout.elevation_gain ?? workout.metrics.elevation_gain (NO FALLBACKS)
  let terrainData: any = null;
  const elevationGainM = workout.elevation_gain ?? workout.metrics?.elevation_gain;
  
  if (elevationGainM != null && Number.isFinite(elevationGainM)) {
        terrainData = {
      total_elevation_gain_m: Number(elevationGainM),
      total_elevation_gain_ft: Math.round(Number(elevationGainM) * 3.28084)
    };
  }
  
  // Calculate average grade if we have elevation and distance
  if (terrainData && distanceValue > 0) {
    const elevationGainM = terrainData.total_elevation_gain_m;
    const distanceM = distanceValue * (userUnits === 'metric' ? 1000 : 1609.34);
    const avgGrade = distanceM > 0 ? (elevationGainM / distanceM) * 100 : 0;
    terrainData.avg_grade_percent = Math.round(avgGrade * 10) / 10;
  }
  
  const workoutContext = {
    type: workout.type,
    duration_minutes: totalDurationMinutes,
    distance: distanceValue,
    distance_unit: distanceUnit,
    avg_pace: paceFormatted,  // Use MM:SS format, not decimal
    pace_unit: paceUnit,
    avg_heart_rate: avgHeartRate,
    max_heart_rate: maxHeartRate,
    temperature: temperature,
    weather: weatherInfo,
    terrain: terrainData,
    aerobic_training_effect: workout.garmin_data?.trainingEffect || null,
    anaerobic_training_effect: workout.garmin_data?.anaerobicTrainingEffect || null,
    performance_condition_start: workout.garmin_data?.performanceCondition || null,
    performance_condition_end: workout.garmin_data?.performanceConditionEnd || null,
    stamina_start: workout.garmin_data?.staminaStart || null,
    stamina_end: workout.garmin_data?.staminaEnd || null,
    exercise_load: workout.garmin_data?.activityTrainingLoad || null
  };
  
  console.log('🤖 [DEBUG] Final workoutContext for AI:', JSON.stringify(workoutContext, null, 2));

  const adherenceContext = {
    execution_adherence_pct: Math.round(performance.execution_adherence),
    pace_adherence_pct: Math.round(performance.pace_adherence),
    duration_adherence_pct: Math.round(performance.duration_adherence),
    hr_drift_bpm: granularAnalysis.heart_rate_analysis?.hr_drift_bpm || 0,
    pace_variability_pct: granularAnalysis.pacing_variability?.coefficient_of_variation || 0
  };

  // Determine if this is a planned workout or freeform run
  const isPlannedWorkout = !!plannedWorkout;
  
  // Extract plan-aware context if planned workout exists
  let planContext: any = null;
  if (plannedWorkout && plannedWorkout.training_plan_id) {
    try {
      // Get week number from tags or default to 1
      const weekTag = plannedWorkout.tags?.find((t: string) => t.startsWith('week:'));
      const weekNumber = weekTag ? parseInt(weekTag.split(':')[1].split('_of_')[0]) : 1;
      
      // Fetch training plan with authorization check
      // NOTE: planned_workouts.training_plan_id references the 'plans' table, not 'training_plans'
      let trainingPlan = null;
      const { data: planData, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('id', plannedWorkout.training_plan_id)
        .eq('user_id', workout.user_id) // Authorization: verify plan belongs to user
        .single();
      
      if (!planError && planData) {
        trainingPlan = planData;
      } else if (planError) {
        // Fallback: try 'training_plans' table (legacy)
        console.log('⚠️ Plan not found in plans table, trying training_plans...');
        const { data: legacyPlanData } = await supabase
          .from('training_plans')
          .select('*')
          .eq('id', plannedWorkout.training_plan_id)
          .eq('user_id', workout.user_id)
          .single();
        
        if (legacyPlanData) {
          trainingPlan = legacyPlanData;
        }
      }
      
      if (trainingPlan) {
        // Double-check user ownership (defense in depth)
        if (trainingPlan.user_id === workout.user_id) {
          // Parse phase from tags
          const phaseTag = plannedWorkout.tags?.find((t: string) => t.startsWith('phase:'));
          const phase = phaseTag ? phaseTag.split(':')[1].replace(/_/g, ' ') : null;
          
          // Get weekly summary
          const weeklySummary = trainingPlan.config?.weekly_summaries?.[weekNumber] || 
                                trainingPlan.weekly_summaries?.[weekNumber] || null;
          
          // Parse progression history from structured tags or description
          let progressionHistory: string[] | null = null;
          const tags = plannedWorkout.tags || [];
          
          // Try structured tags first (most reliable)
          const intensityProgressionTag = tags.find((t: string) => t.startsWith('intensity_progression:'));
          const volumeProgressionTag = tags.find((t: string) => t.startsWith('volume_progression:'));
          
          if (intensityProgressionTag) {
            // Format: "5x800_5x800_6x800_none_6x800_none_4x1mi_none"
            const progression = intensityProgressionTag.split(':')[1];
            progressionHistory = progression.split('_').filter(p => p !== 'none').map(p => p.replace(/x/g, '×'));
          } else if (volumeProgressionTag) {
            // Format: "90_100_110_80_120_130_140_150" -> ["90min", "100min", ...]
            const progression = volumeProgressionTag.split(':')[1];
            progressionHistory = progression.split('_').map(p => `${p}min`);
          } else {
            // Fallback to description parsing (e.g., "5×800m → 6×800m → 4×1mi")
            const progressionMatch = plannedWorkout.description?.match(/(\d+×\d+[a-z]+.*?→.*?\d+×\d+[a-z]+)/i);
            if (progressionMatch) {
              progressionHistory = progressionMatch[0].split('→').map(p => p.trim());
            }
          }
          
          planContext = {
            plan_name: trainingPlan.name || 'Training Plan',
            week: weekNumber,
            total_weeks: trainingPlan.duration_weeks || 0,
            phase: phase || 'unknown',
            weekly_summary: weeklySummary,
            progression_history: progressionHistory,
            intensity_progression: intensityProgressionTag ? intensityProgressionTag.split(':')[1] : null,
            volume_progression: volumeProgressionTag ? volumeProgressionTag.split(':')[1] : null,
            session_description: plannedWorkout.description || '',
            session_tags: plannedWorkout.tags || [],
            plan_description: trainingPlan.description || ''
          };
          
          console.log('📋 PLAN CONTEXT EXTRACTED:', planContext);
        } else {
          console.warn('⚠️ Training plan does not belong to user - skipping plan context');
        }
      }
    } catch (error) {
      console.log('⚠️ Failed to extract plan context:', error);
    }
  }
  
  // ✅ FIX BUG #2: Extract planned pace ranges from work segments
  let plannedPaceInfo: {
    type: 'range' | 'single';
    range?: string;
    lower?: number;
    upper?: number;
    target?: string;
    targetSeconds?: number;
    workoutType: string;
  } | null = null;
  
  // Check if workout has intervals (for conditional AI prompt)
  // An interval workout has:
  // 1. Multiple work segments with pace targets, OR
  // 2. Alternating work/recovery pattern, OR
  // 3. Explicit step_type === 'interval' || 'repeat'
  const steps = plannedWorkout?.computed?.steps || [];
  const workSteps = steps.filter((step: any) => 
    (step.kind === 'work' || step.role === 'work' || step.step_type === 'interval') && 
    (step.pace_range || step.target_pace)
  );
  const recoverySteps = steps.filter((step: any) => 
    step.kind === 'recovery' || step.role === 'recovery'
  );
  
  // Multiple work segments = interval workout
  // OR explicit interval/repeat step_type
  // OR alternating work/recovery pattern (at least 2 work segments)
  const hasIntervals = workSteps.length > 1 || 
    steps.some((step: any) => step.step_type === 'interval' || step.step_type === 'repeat') ||
    (workSteps.length >= 1 && recoverySteps.length >= 1 && steps.length > 2);
  
  console.log(`🔍 [INTERVAL DETECTION] Work steps: ${workSteps.length}, Recovery steps: ${recoverySteps.length}, Total steps: ${steps.length}, hasIntervals: ${hasIntervals}`);
  
  if (isPlannedWorkout && plannedWorkout?.computed?.steps) {
    // Find all work segments with pace ranges
    const workSteps = plannedWorkout.computed.steps.filter((step: any) => 
      (step.kind === 'work' || step.role === 'work') && step.pace_range
    );
    
    if (workSteps.length > 0) {
      // Extract unique pace ranges (in case of repeated intervals)
      const paceRanges = workSteps.map((step: any) => ({
        lower: step.pace_range.lower,
        upper: step.pace_range.upper
      }));
      
      // Use the first work segment's pace range (most workouts have consistent pace targets)
      const firstRange = paceRanges[0];
      const isRangeWorkout = firstRange.lower !== firstRange.upper;
      
      // Helper to format seconds to MM:SS
      const formatPace = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${minutes}:${String(secs).padStart(2, '0')}`;
      };
      
      if (isRangeWorkout) {
        // Range workout (e.g., easy run: 10:17-10:43/mi)
        plannedPaceInfo = {
          type: 'range',
          range: `${formatPace(firstRange.lower)}-${formatPace(firstRange.upper)} ${paceUnit}`,
          lower: firstRange.lower,
          upper: firstRange.upper,
          workoutType: 'easy/aerobic run (variability expected)'
        };
      } else {
        // Single target workout (e.g., tempo: 10:30/mi)
        plannedPaceInfo = {
          type: 'single',
          target: `${formatPace(firstRange.lower)} ${paceUnit}`,
          targetSeconds: firstRange.lower,
          workoutType: 'tempo/interval run (consistency critical)'
        };
      }
      
      console.log('🎯 [PLANNED PACE] Extracted pace info:', plannedPaceInfo);
    }
  }
  
  // Build prompt based on workout type
  let prompt = `You are analyzing a running workout. Generate 3-4 concise, data-driven observations based on the metrics below.

CRITICAL RULES:
- Write like "a chart in words" - factual observations only
- NO motivational language ("great job", "keep it up")
- NO subjective judgments ("slow", "bad", "should have")
- NO generic advice ("run more", "push harder")
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and time references
- Describe patterns visible in the data
- Each observation should provide UNIQUE information - avoid repeating the same insight
- Combine related metrics into single observations (e.g., HR average + drift + peak in one paragraph)
${planContext ? `
- CRITICAL: Reference plan context when available - explain WHY workout was programmed, whether performance matches plan expectations, and what's coming next week
- Contextualize adherence relative to phase goals (e.g., Foundation Build vs Peak Strength)
` : ''}

Workout Profile:
- Type: ${workoutContext.type}
- Duration: ${workoutContext.duration_minutes} minutes
- Distance: ${workoutContext.distance.toFixed(2)} ${workoutContext.distance_unit}
- Avg Pace: ${workoutContext.avg_pace} ${workoutContext.pace_unit}
- Avg HR: ${workoutContext.avg_heart_rate} bpm (Max: ${workoutContext.max_heart_rate} bpm)
${workoutContext.aerobic_training_effect ? `- Aerobic TE: ${workoutContext.aerobic_training_effect} (Anaerobic: ${workoutContext.anaerobic_training_effect})` : ''}
${workoutContext.performance_condition_start !== null ? `- Performance Condition: ${workoutContext.performance_condition_start} → ${workoutContext.performance_condition_end} (${workoutContext.performance_condition_end - workoutContext.performance_condition_start} point change)` : ''}
${workoutContext.stamina_start !== null ? `- Stamina: ${workoutContext.stamina_start}% → ${workoutContext.stamina_end}% (${workoutContext.stamina_start - workoutContext.stamina_end}% depletion)` : ''}
${workoutContext.exercise_load ? `- Exercise Load: ${workoutContext.exercise_load}` : ''}
${workoutContext.terrain ? `
TERRAIN & ELEVATION:
- Total Elevation Gain: ${workoutContext.terrain.total_elevation_gain_ft}ft (${workoutContext.terrain.total_elevation_gain_m.toFixed(0)}m)
${workoutContext.terrain.avg_grade_percent ? `- Average Grade: ${workoutContext.terrain.avg_grade_percent}%` : ''}
` : ''}
${workoutContext.weather || workoutContext.temperature ? `
WEATHER & CONDITIONS:
${workoutContext.temperature ? `- Temperature: ${workoutContext.temperature}°F` : ''}
${workoutContext.weather?.condition ? `- Condition: ${workoutContext.weather.condition}` : ''}
${workoutContext.weather?.humidity ? `- Humidity: ${workoutContext.weather.humidity}%` : ''}
${workoutContext.weather?.windSpeed ? `- Wind Speed: ${workoutContext.weather.windSpeed} mph${workoutContext.weather.windDirection ? ` (${workoutContext.weather.windDirection})` : ''}` : ''}
` : ''}
`;

  if (isPlannedWorkout) {
    // COMPARATIVE MODE: Include adherence metrics for planned workouts
    prompt += `
Adherence Metrics (vs. Planned Workout):
- Execution: ${adherenceContext.execution_adherence_pct}%
- Pace: ${adherenceContext.pace_adherence_pct}%
- Duration: ${adherenceContext.duration_adherence_pct}%
- HR Drift: ${adherenceContext.hr_drift_bpm} bpm
- Pace Variability: ${adherenceContext.pace_variability_pct}%
${plannedPaceInfo ? `
Planned Workout Details:
- Target Pace: ${plannedPaceInfo.type === 'range' ? plannedPaceInfo.range : plannedPaceInfo.target}
- Workout Type: ${plannedPaceInfo.workoutType}
` : ''}
${planContext ? `

═══════════════════════════════════════════════════════════════
📋 PLAN CONTEXT
═══════════════════════════════════════════════════════════════

Plan: ${planContext.plan_name}
Week: ${planContext.week} of ${planContext.total_weeks}
Phase: ${planContext.phase}
${planContext.weekly_summary?.focus ? `
WEEK ${planContext.week} FOCUS:
"${planContext.weekly_summary.focus}"
` : ''}
${planContext.weekly_summary?.key_workouts && planContext.weekly_summary.key_workouts.length > 0 ? `
KEY WORKOUTS THIS WEEK:${planContext.weekly_summary.key_workouts.map((w: string) => `\n• ${w}`).join('')}
` : ''}
${planContext.weekly_summary?.notes ? `
WEEK NOTES:
${planContext.weekly_summary.notes}
` : ''}
${planContext.progression_history ? `
PROGRESSION HISTORY:
${planContext.progression_history.join(' → ')}
` : ''}
${planContext.session_description && planContext.session_description.length > 50 ? `
SESSION DESCRIPTION:
${planContext.session_description}
` : ''}

CRITICAL: Reference plan context in your analysis:
- Explain WHY this workout was programmed (phase, week focus)
- Compare performance to plan expectations
- Reference what's coming next week if mentioned in plan
- Contextualize adherence relative to phase goals
` : ''}

CRITICAL ANALYSIS RULES:
${hasIntervals ? `
- This is an INTERVAL workout with work intervals and recovery periods
- Focus on work interval performance (pace adherence, consistency across intervals)
- Do NOT compare overall average pace to work interval pace (overall includes warmup/recovery/cooldown)
- Report interval completion (X of Y intervals completed)
- Report pace adherence range across work intervals
- Note any fading pattern (pace getting slower) or consistency across intervals
- Do NOT analyze mile-by-mile breakdown for interval workouts
` : plannedPaceInfo?.type === 'range' ? `
- This is a RANGE workout (${plannedPaceInfo.workoutType})
- Compare each mile/segment to the RANGE (${plannedPaceInfo.range})
- Miles within range are acceptable (not "too fast" or "too slow")
- Miles faster than range start are "faster than range start" (not "faster than target")
- Miles slower than range end are "slower than range end" (not "slower than target")
- Average pace within range is GOOD execution (not a miss)
- Variability is NORMAL for range workouts (not a problem)
` : plannedPaceInfo?.type === 'single' ? `
- This is a SINGLE-TARGET workout (${plannedPaceInfo.workoutType})
- Compare each mile/segment to the EXACT TARGET (${plannedPaceInfo.target})
- Consistency is CRITICAL - variability indicates pacing issues
- Miles faster than target are "too fast"
- Miles slower than target are "too slow"
- Average pace should match target closely
` : `
- Compare actual performance to planned targets
`}

${hasIntervals ? (() => {
  // For interval workouts, include planned workout structure and interval breakdown data
  const steps = plannedWorkout?.computed?.steps || [];
  const plannedWorkSteps = steps.filter((step: any) => 
    (step.kind === 'work' || step.role === 'work' || step.step_type === 'interval') && 
    (step.pace_range || step.target_pace)
  );
  
  // Helper function to format pace from seconds
  const formatPace = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };
  
  const paceUnit = userUnits === 'metric' ? 'min/km' : 'min/mi';
  
  // Build planned workout description
  let plannedWorkoutDesc = '';
  if (plannedWorkSteps.length > 0) {
    const firstWorkStep = plannedWorkSteps[0];
    const plannedPace = firstWorkStep.pace_range 
      ? `${formatPace(firstWorkStep.pace_range.lower)}-${formatPace(firstWorkStep.pace_range.upper)} ${paceUnit}`
      : firstWorkStep.target_pace 
        ? `${formatPace(firstWorkStep.target_pace)} ${paceUnit}`
        : 'target pace';
    const plannedDuration = firstWorkStep.duration_s ? `${Math.round(firstWorkStep.duration_s / 60)} min` : '';
    const plannedDistance = firstWorkStep.distance_m ? `${(firstWorkStep.distance_m / 1609.34).toFixed(2)} mi` : '';
    
    plannedWorkoutDesc = `Planned: ${plannedWorkSteps.length} work intervals`;
    if (plannedDistance) plannedWorkoutDesc += ` of ${plannedDistance} each`;
    if (plannedDuration) plannedWorkoutDesc += ` (${plannedDuration} each)`;
    plannedWorkoutDesc += ` at ${plannedPace}`;
  }
  
  const intervalBreakdown = detailedAnalysis?.interval_breakdown;
  if (intervalBreakdown && intervalBreakdown.available && intervalBreakdown.intervals && intervalBreakdown.intervals.length > 0) {
    const intervals = intervalBreakdown.intervals;
    // ✅ FIX: Only count work intervals, not warmup/recovery/cooldown
    const workIntervalsOnly = intervals.filter((i: any) => i.interval_type === 'work');
    const completedWorkIntervals = workIntervalsOnly.filter((i: any) => i.actual_duration_s > 0 || i.actual_pace_min_per_mi > 0);
    
    // Calculate pace adherence only from work intervals
    const paceAdherences = workIntervalsOnly.map((i: any) => i.pace_adherence_percent || 0).filter((p: number) => p > 0);
    const avgPaceAdherence = paceAdherences.length > 0 
      ? Math.round(paceAdherences.reduce((sum: number, p: number) => sum + p, 0) / paceAdherences.length)
      : 0;
    
    return `
PLANNED WORKOUT STRUCTURE:
${plannedWorkoutDesc || 'Interval workout with work and recovery segments'}

INTERVAL BREAKDOWN (PRE-CALCULATED - USE EXACTLY AS SHOWN):
- Completed ${completedWorkIntervals.length} of ${plannedWorkSteps.length} planned work intervals
- Average pace adherence: ${avgPaceAdherence}%
- Pace adherence range: ${paceAdherences.length > 0 ? `${Math.min(...paceAdherences)}% to ${Math.max(...paceAdherences)}%` : 'N/A'}

CRITICAL INSTRUCTION: For interval workouts, focus on work interval performance compared to the planned workout structure above. Do NOT analyze overall pace or mile-by-mile breakdown. Report interval completion and pace adherence as shown above.

`;
  }
  return plannedWorkoutDesc ? `
PLANNED WORKOUT STRUCTURE:
${plannedWorkoutDesc}
` : '';
})() : (() => {
  // For continuous runs, include mile-by-mile categorization
  const mileByMile = detailedAnalysis?.mile_by_mile_terrain;
  if (mileByMile && mileByMile.available && mileByMile.splits && mileByMile.splits.length > 0) {
    const milesInRange = mileByMile.miles_in_range || 0;
    const totalMiles = mileByMile.total_miles || mileByMile.splits.length;
    const inRangePct = totalMiles > 0 ? Math.round((milesInRange / totalMiles) * 100) : 0;
    
    // Extract mile categorizations from the section text (more reliable than parsing splits)
    const sectionText = mileByMile.section || '';
    const withinRangeMatch = sectionText.match(/Within range: Miles? ([^\n]+)/i);
    const fasterMatch = sectionText.match(/Faster than range: Miles? ([^\n]+)/i);
    const slowerMatch = sectionText.match(/Slower than range: Miles? ([^\n]+)/i);
    
    const withinRangeMiles = withinRangeMatch ? withinRangeMatch[1].trim() : 'None';
    const fasterMiles = fasterMatch ? fasterMatch[1].trim() : 'None';
    const slowerMiles = slowerMatch ? slowerMatch[1].trim() : 'None';
    
    return `
MILE-BY-MILE CATEGORIZATION (PRE-CALCULATED - USE EXACTLY AS SHOWN):
- ${milesInRange} of ${totalMiles} miles within range (${inRangePct}%)
- Within range: ${withinRangeMiles}
- Faster than range: ${fasterMiles}
- Slower than range: ${slowerMiles}

CRITICAL INSTRUCTION: When summarizing the mile-by-mile breakdown, use EXACTLY these pre-calculated categorizations. Do NOT recalculate which miles are in/out of range. Simply report these findings as-is. 

When you write "Mile-by-mile breakdown:", you MUST use the exact mile numbers shown above:
- If "Within range: Miles 4" is shown, say "Mile 4 was within range"
- If "Faster than range: Miles 1, 2, 3, 6" is shown, say "Miles 1, 2, 3, 6 were faster than range start"
- If "Slower than range: Miles 5, 7, 8" is shown, say "Miles 5, 7, 8 were slower than range end"

Do NOT make up different mile numbers. Do NOT recalculate. Use the numbers provided above.

`;
  }
  return '';
})()}
${(() => {
  // For interval workouts, include terrain info for each segment type
  if (hasIntervals && detailedAnalysis?.interval_breakdown) {
    const terrainInfo: string[] = [];
    
    // Check if we have terrain data from sensor data
    const hasElevationData = sensorData.some(s => s.elevation != null || s.altitude != null);
    if (hasElevationData) {
      terrainInfo.push('- Terrain data available from GPS track');
    }
    
    if (terrainInfo.length > 0) {
      return `\nTERRAIN & CONDITIONS:\n${terrainInfo.join('\n')}\n\n`;
    }
  }
  return '';
})()}

Generate 3-4 observations comparing actual vs. planned performance:
${hasIntervals ? `
${(() => {
  // For interval workouts, analyze work intervals separately
  // Don't compare overall average pace to work interval pace (overall includes warmup/recovery/cooldown)
  const intervalBreakdown = detailedAnalysis?.interval_breakdown;
  // generateIntervalBreakdown only includes work intervals, so all intervals in breakdown are work intervals
  const workIntervals = intervalBreakdown?.intervals || [];
  const completedIntervals = workIntervals.filter((i: any) => i.actual_duration_s > 0 || i.actual_pace_min_per_mi > 0);
  // Use workSteps from outer scope (defined above)
  const steps = plannedWorkout?.computed?.steps || [];
  const plannedWorkSteps = steps.filter((step: any) => 
    (step.kind === 'work' || step.role === 'work' || step.step_type === 'interval') && 
    (step.pace_range || step.target_pace)
  );
  const totalPlannedIntervals = plannedWorkSteps.length;
  
  // Calculate average pace adherence across work intervals
  const paceAdherences = workIntervals.map((i: any) => i.pace_adherence_percent || 0).filter((p: number) => p > 0);
  const avgPaceAdherence = paceAdherences.length > 0 
    ? Math.round(paceAdherences.reduce((sum: number, p: number) => sum + p, 0) / paceAdherences.length)
    : 0;
  const minPaceAdherence = paceAdherences.length > 0 ? Math.min(...paceAdherences) : 0;
  const maxPaceAdherence = paceAdherences.length > 0 ? Math.max(...paceAdherences) : 0;
  
  // Check for fading pattern (pace getting slower)
  const paces = workIntervals.map((i: any) => i.actual_pace_min_per_mi).filter((p: number) => p > 0);
  const isFading = paces.length >= 3 && paces[0] < paces[paces.length - 1];
  const isConsistent = paces.length > 0 && (Math.max(...paces) - Math.min(...paces)) < 0.1; // Less than 6 seconds difference
  
  let patternNote = '';
  if (isFading) {
    patternNote = 'Pace faded across intervals, with later intervals slower than early ones.';
  } else if (isConsistent) {
    patternNote = 'Pace remained consistent across all intervals.';
  } else {
    patternNote = 'Pace varied across intervals.';
  }
  
  if (workIntervals.length === 0) {
    // Fallback if interval breakdown not available
    return `"Completed ${completedIntervals.length} of ${totalPlannedIntervals} prescribed work intervals."`;
  }
  
    const weatherNote = workoutContext.weather || workoutContext.temperature 
      ? ` Conditions: ${workoutContext.temperature ? `${workoutContext.temperature}°F` : ''}${workoutContext.weather?.condition ? `, ${workoutContext.weather.condition}` : ''}${workoutContext.weather?.humidity ? `, ${workoutContext.weather.humidity}% humidity` : ''}${workoutContext.weather?.windSpeed ? `, ${workoutContext.weather.windSpeed} mph wind` : ''}.`
      : '';
    
    return `"Completed ${completedIntervals.length} of ${totalPlannedIntervals} prescribed work intervals. Work interval pace adherence ranged from ${minPaceAdherence}% to ${maxPaceAdherence}% (average ${avgPaceAdherence}%). ${patternNote}${weatherNote}"`;
})()}
` : plannedPaceInfo?.type === 'range' && plannedPaceInfo.range ? `
${(() => {
  // Parse average pace from MM:SS format to seconds
  // workoutContext.avg_pace is formatted as "10:15" (MM:SS)
  const paceStr = workoutContext.avg_pace || '0:00';
  const paceParts = paceStr.split(':');
  const paceMinutes = parseInt(paceParts[0] || '0', 10);
  const paceSeconds = parseInt(paceParts[1] || '0', 10);
  const avgPaceSeconds = (paceMinutes * 60) + paceSeconds;
  
  const targetLower = plannedPaceInfo.lower || 0;
  const targetUpper = plannedPaceInfo.upper || 0;
  const inRange = avgPaceSeconds >= targetLower && avgPaceSeconds <= targetUpper;
  const deltaFromLower = targetLower > 0 ? Math.abs(avgPaceSeconds - targetLower) : 999;
  const deltaFromUpper = targetUpper > 0 ? Math.abs(avgPaceSeconds - targetUpper) : 999;
  const minDelta = Math.min(deltaFromLower, deltaFromUpper);
  const essentiallyInRange = !inRange && minDelta <= 5;
  
  let paceStatus = '';
  if (inRange) {
    paceStatus = 'within';
  } else if (essentiallyInRange) {
    const deltaSec = Math.round(minDelta);
    const direction = avgPaceSeconds < targetLower ? 'faster' : 'slower';
    paceStatus = `essentially within (just ${deltaSec}s ${direction} than range ${avgPaceSeconds < targetLower ? 'start' : 'end'})`;
  } else {
    paceStatus = 'outside';
  }
  
  // Calculate time-based and mile-based adherence for display
  const timeBasedAdherence = adherenceContext.pace_adherence_pct || 0;
  const mileByMile = detailedAnalysis?.mile_by_mile_terrain;
  const milesInRange = mileByMile?.miles_in_range || 0;
  const totalMiles = mileByMile?.total_miles || mileByMile?.splits?.length || 0;
  const mileBasedAdherence = totalMiles > 0 ? Math.round((milesInRange / totalMiles) * 100) : 0;
  const cv = adherenceContext.pace_variability_pct || 0;
  const workoutType = plannedPaceInfo?.workoutType || '';
  const isEasyRun = workoutType.toLowerCase().includes('easy') || workoutType.toLowerCase().includes('aerobic');
  
  const variabilityContext = (() => {
    if (isEasyRun) {
      if (cv < 15) {
        return ' (excellent consistency for easy run)';
      } else if (cv < 25) {
        return ' (normal variability for easy run)';
      } else {
        return ' (high variability for easy run, suggests pacing inconsistency rather than terrain influence)';
      }
    } else {
      if (cv < 10) {
        return ' (excellent consistency)';
      } else if (cv < 20) {
        return ' (moderate variability)';
      } else {
        return ' (high variability, indicates pacing issues)';
      }
    }
  })();
  
  return `"Maintained pace averaging X:XX ${workoutContext.pace_unit}, ${paceStatus} the prescribed range of ${plannedPaceInfo.range}.

Pace control varied significantly mile-to-mile, with only ${milesInRange} of ${totalMiles} miles falling within the target range, though average pace remained excellent."`;
})()}
${hasIntervals ? `` : `"Mile-by-mile breakdown: [CRITICAL: Use the PRE-CALCULATED mile categorization data from the MILE-BY-MILE CATEGORIZATION section above. Report EXACTLY which miles were within range, faster than range start, or slower than range end as shown in that section. Do NOT recalculate - copy the mile numbers directly from the pre-calculated data.]"`}
` : plannedPaceInfo?.type === 'single' && plannedPaceInfo.target && plannedPaceInfo.targetSeconds ? `
"Maintained pace averaging X:XX ${workoutContext.pace_unit}, ${Math.abs(parseFloat(workoutContext.avg_pace) - (plannedPaceInfo.targetSeconds / 60)) < 0.1 ? 'matching' : 'deviating from'} the prescribed target of ${plannedPaceInfo.target}. Pace varied by A%, indicating [consistent/inconsistent] pacing."
` : `
"Maintained pace averaging X:XX ${workoutContext.pace_unit}, achieving Y% adherence to prescribed pace target. Pace varied by A%, with most intervals between B:BB-C:CC ${workoutContext.pace_unit}."
`}
${hasIntervals ? `` : `"Pace control varied significantly mile-to-mile, with only ${(() => {
    const mileByMile = detailedAnalysis?.mile_by_mile_terrain;
    if (mileByMile && mileByMile.miles_in_range !== undefined) {
      return `${mileByMile.miles_in_range} of ${mileByMile.total_miles || mileByMile.splits?.length || 'Y'}`;
    }
    return 'X of Y';
  })()} miles falling within the target range, though average pace remained excellent."`}
${(() => {
  const hrAnalysis = granularAnalysis?.heart_rate_analysis;
  const hrDrift = hrAnalysis?.hr_drift_bpm || 0;
  const earlyHR = hrAnalysis?.early_avg_hr;
  const lateHR = hrAnalysis?.late_avg_hr;
  const interpretation = hrAnalysis?.hr_drift_interpretation;
  
  if (earlyHR && lateHR) {
    return `"Heart rate averaged X bpm with ${hrDrift > 0 ? '+' : ''}${hrDrift} bpm drift (${earlyHR} bpm early → ${lateHR} bpm late), ${interpretation ? interpretation.toLowerCase() : 'indicating normal cardiovascular response'}. Peaked at Z bpm."`;
  } else {
    const driftContext = hrDrift === 0 ? 'Indicates remarkably stable cardiovascular response' : 
                        hrDrift < 5 ? 'Indicates excellent pacing and cardiovascular stability' : 
                        hrDrift < 10 ? 'Indicates normal cardiovascular response for sustained effort' : 
                        hrDrift < 20 ? 'Indicates moderate cardiovascular drift, possibly due to environmental factors or accumulated fatigue' : 
                        'Indicates significant cardiovascular drift, suggesting overpacing or environmental stress';
    return `"Heart rate averaged X bpm with ${hrDrift > 0 ? '+' : ''}${hrDrift} bpm drift, peaking at Z bpm. ${driftContext}."`;
  }
})()}
${(() => {
  // Calculate planned duration in minutes for display (same approach as duration adherence calculation)
  let plannedDurationS = 0;
  if (plannedWorkout?.computed?.total_duration_seconds) {
    plannedDurationS = plannedWorkout.computed.total_duration_seconds;
  } else if (plannedWorkout?.computed?.steps?.length > 0) {
    plannedDurationS = plannedWorkout.computed.steps.reduce((sum: number, step: any) => {
      return sum + (step.duration_s || step.duration || 0);
    }, 0);
  }
  const plannedDurationMin = plannedDurationS > 0 ? Math.round(plannedDurationS / 60) : 0;
  const actualDurationMin = Math.round(workoutContext.duration_minutes);
  
  if (plannedDurationMin > 0) {
    return `"Duration: ${actualDurationMin} of ${plannedDurationMin} minutes completed (${adherenceContext.duration_adherence_pct}% adherence)."`;
  }
  return '';
})()}
${(() => {
  // Execution adherence summary (only if we have planned workout data)
  if (plannedWorkout) {
    // Get intervals from computed data (same source as Summary/Details screens)
    const computedIntervals = workout?.computed?.intervals || [];
    // Calculate segment breakdown for explanation
    const warmupInterval = computedIntervals.find((i: any) => (i.role === 'warmup' || i.kind === 'warmup') && i.executed);
    const workIntervalsOnly = computedIntervals.filter((i: any) => (i.role === 'work' || i.kind === 'work') && i.executed) || [];
    const recoveryIntervals = computedIntervals.filter((i: any) => (i.role === 'recovery' || i.kind === 'recovery') && i.executed) || [];
    const cooldownInterval = computedIntervals.find((i: any) => (i.role === 'cooldown' || i.kind === 'cooldown') && i.executed);
    
    // Calculate warmup execution if available
    let warmupBreakdown = '';
    if (warmupInterval) {
      const warmupPaceRange = warmupInterval.planned?.pace_range || warmupInterval.pace_range;
      const warmupRangeLower = warmupPaceRange?.lower || 0;
      const warmupRangeUpper = warmupPaceRange?.upper || 0;
      const warmupActualPace = warmupInterval.executed?.avg_pace_s_per_mi || 0;
      const warmupPlannedDuration = warmupInterval.planned?.duration_s || 0;
      const warmupActualDuration = warmupInterval.executed?.duration_s || 0;
      
      const warmupPaceAdherence = warmupRangeLower > 0 && warmupRangeUpper > 0 && warmupActualPace > 0
        ? calculatePaceRangeAdherence(warmupActualPace, warmupRangeLower, warmupRangeUpper)
        : 0;
      const warmupDurationAdherence = warmupPlannedDuration > 0 && warmupActualDuration > 0
        ? Math.max(0, 100 - (Math.abs(warmupActualDuration - warmupPlannedDuration) / warmupPlannedDuration) * 100)
        : 0;
      
      if (warmupPaceAdherence < 90 || warmupDurationAdherence < 90) {
        const formatPace = (sec: number) => {
          const mins = Math.floor(sec / 60);
          const secs = Math.round(sec % 60);
          return `${mins}:${String(secs).padStart(2, '0')}`;
        };
        const formatDuration = (sec: number) => {
          const mins = Math.floor(sec / 60);
          const secs = Math.round(sec % 60);
          return `${mins}:${String(secs).padStart(2, '0')}`;
        };
        const warmupPlannedRange = warmupRangeLower > 0 && warmupRangeUpper > 0
          ? `${formatPace(warmupRangeLower)}-${formatPace(warmupRangeUpper)}/mi`
          : 'prescribed pace';
        const warmupActualFormatted = warmupActualPace > 0 ? formatPace(warmupActualPace) + '/mi' : 'N/A';
        const warmupPlannedFormatted = formatDuration(warmupPlannedDuration);
        const warmupActualFormattedDur = formatDuration(warmupActualDuration);
        
        warmupBreakdown = `\n\nOVERALL EXECUTION BREAKDOWN (${adherenceContext.execution_adherence_pct}%):\n` +
          `✅ Work intervals: ${adherenceContext.pace_adherence_pct}% pace, ${adherenceContext.duration_adherence_pct}% duration (perfect)\n` +
          (recoveryIntervals.length > 0 ? `✅ Recoveries: Well controlled\n` : '') +
          (cooldownInterval ? `✅ Cooldown: Good execution\n` : '') +
          `⚠️ Warmup: ${Math.round(warmupPaceAdherence)}% pace, ${Math.round(warmupDurationAdherence)}% duration (penalty source)\n` +
          `\nWARMUP ISSUE (-${100 - adherenceContext.execution_adherence_pct}% penalty):\n` +
          `Planned: ${warmupPlannedFormatted} @ ${warmupPlannedRange}\n` +
          `Actual: ${warmupActualFormattedDur} @ ${warmupActualFormatted}\n` +
          `Problems:\n` +
          (warmupActualDuration < warmupPlannedDuration 
            ? `• ${formatDuration(warmupPlannedDuration - warmupActualDuration)} too short (${Math.round(warmupDurationAdherence)}% duration)\n`
            : '') +
          (warmupPaceAdherence < 90
            ? `• Pace outside prescribed range (${Math.round(warmupPaceAdherence)}% adherence)\n`
            : '') +
          `Fix: Complete full warmup at prescribed easy pace to maximize workout benefit.`;
      }
    }
    
    return `"Overall execution: ${adherenceContext.execution_adherence_pct}% (${adherenceContext.pace_adherence_pct}% pace adherence, ${adherenceContext.duration_adherence_pct}% duration adherence).${warmupBreakdown}"`;
  }
  return '';
})()}

REQUIRED OBSERVATIONS (MUST INCLUDE):
${(() => {
  let plannedDurationS = 0;
  if (plannedWorkout?.computed?.total_duration_seconds) {
    plannedDurationS = plannedWorkout.computed.total_duration_seconds;
  } else if (plannedWorkout?.computed?.steps?.length > 0) {
    plannedDurationS = plannedWorkout.computed.steps.reduce((sum: number, step: any) => {
      return sum + (step.duration_s || step.duration || 0);
    }, 0);
  }
  const plannedDurationMin = plannedDurationS > 0 ? Math.round(plannedDurationS / 60) : 0;
  const actualDurationMin = Math.round(workoutContext.duration_minutes);
  
  let required = '';
  if (plannedWorkout && plannedDurationMin > 0) {
    required += `- You MUST include this exact line: "Duration: ${actualDurationMin} of ${plannedDurationMin} minutes completed (${adherenceContext.duration_adherence_pct}% adherence)."
- You MUST include this exact line: "Overall execution: ${adherenceContext.execution_adherence_pct}% (${adherenceContext.pace_adherence_pct}% pace adherence, ${adherenceContext.duration_adherence_pct}% duration adherence)."`;
  }
  
  // REQUIRE terrain, weather, and plan context if available
  if (workoutContext.terrain) {
    required += `
- You MUST include terrain context: Mention elevation gain (${workoutContext.terrain.total_elevation_gain_ft}ft)${workoutContext.terrain.avg_grade_percent ? ` and average grade (${workoutContext.terrain.avg_grade_percent}%)` : ''} and how it may have affected pace/effort.`;
  }
  
  if (workoutContext.weather || workoutContext.temperature) {
    const weatherParts: string[] = [];
    if (workoutContext.temperature) weatherParts.push(`${workoutContext.temperature}°F`);
    if (workoutContext.weather?.condition) weatherParts.push(workoutContext.weather.condition);
    if (workoutContext.weather?.humidity) weatherParts.push(`${workoutContext.weather.humidity}% humidity`);
    if (workoutContext.weather?.windSpeed) weatherParts.push(`${workoutContext.weather.windSpeed} mph wind`);
    required += `
- You MUST include weather context: Mention conditions (${weatherParts.join(', ')}) and how they may have affected performance.`;
  }
  
  if (planContext) {
    required += `
- You MUST include plan context: Reference the plan phase (${planContext.phase}), week focus (${planContext.weekly_summary?.focus || 'N/A'}), and explain WHY this workout was programmed and whether performance matches plan expectations.`;
  }
  
  return required;
})()}
`;
  } else {
    // DESCRIPTIVE MODE: Pattern analysis for freeform runs
    prompt += `
Pattern Analysis (Freeform Run):
- HR Drift: ${adherenceContext.hr_drift_bpm} bpm
- Pace Variability: ${adherenceContext.pace_variability_pct.toFixed(1)}%

Generate 3-4 observations describing patterns and stimulus:
"Maintained pace averaging X:XX ${workoutContext.pace_unit} throughout the Y ${workoutContext.distance_unit} effort. Pace varied by Z%, with most segments between A:AA-B:BB ${workoutContext.pace_unit}."
${(() => {
  const hrAnalysis = granularAnalysis?.heart_rate_analysis;
  const hrDrift = hrAnalysis?.hr_drift_bpm || 0;
  const earlyHR = hrAnalysis?.early_avg_hr;
  const lateHR = hrAnalysis?.late_avg_hr;
  const interpretation = hrAnalysis?.hr_drift_interpretation;
  
  if (earlyHR && lateHR) {
    return `"Heart rate averaged X bpm with ${hrDrift > 0 ? '+' : ''}${hrDrift} bpm drift (${earlyHR} bpm early → ${lateHR} bpm late) over Z minutes, ${interpretation ? interpretation.toLowerCase() : 'indicating normal cardiovascular response'}. Peaked at A bpm."`;
  } else {
    const driftContext = hrDrift === 0 ? 'Indicates remarkably stable cardiovascular response' : 
                        hrDrift < 5 ? 'Indicates excellent pacing and cardiovascular stability' : 
                        hrDrift < 10 ? 'Indicates normal cardiovascular response for sustained effort' : 
                        hrDrift < 20 ? 'Indicates moderate cardiovascular drift, possibly due to environmental factors or accumulated fatigue' : 
                        'Indicates significant cardiovascular drift, suggesting overpacing or environmental stress';
    return `"Heart rate averaged X bpm with ${hrDrift > 0 ? '+' : ''}${hrDrift} bpm drift over Z minutes, peaking at A bpm. ${driftContext}."`;
  }
})()}
"Performance Condition declined from +X to -Y over Z minutes, reflecting accumulated fatigue from the sustained effort."
`;
  }

  prompt += `
Return ONLY a JSON array of strings, no other text:
["observation 1", "observation 2", ...]`;

  console.log('🤖 [DEBUG] Sending prompt to OpenAI with context:', {
    duration: workoutContext.duration_minutes,
    distance: workoutContext.distance,
    distance_unit: workoutContext.distance_unit,
    avg_pace: workoutContext.avg_pace,
    pace_unit: workoutContext.pace_unit,
    avg_hr: workoutContext.avg_heart_rate,
    max_hr: workoutContext.max_heart_rate
  });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a data analyst converting workout metrics into factual observations. Never use motivational language or subjective judgments.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();
    
    console.log('🤖 [DEBUG] Raw AI response:', content);
    
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse JSON array from response
    const insights = JSON.parse(content);
    
    if (!Array.isArray(insights)) {
      throw new Error('AI response was not an array');
    }

    console.log(`✅ Generated ${insights.length} AI narrative insights`);
    console.log('✅ First insight preview:', insights[0]?.substring(0, 100));
    return insights;

  } catch (error) {
    console.error('❌ AI narrative generation failed:', error);
    throw error;
  }
}

