import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
const SEGMENT_CONFIG: Record<SegmentType, SegmentConfig> = {
  warmup: { tolerance: 10, weight: 0.5 },
  cooldown: { tolerance: 10, weight: 0.3 },
  work_interval: { tolerance: 5, weight: 1.0 },
  tempo: { tolerance: 4, weight: 1.0 },
  cruise_interval: { tolerance: 5, weight: 0.9 },
  recovery_jog: { tolerance: 15, weight: 0.7 },
  easy_run: { tolerance: 8, weight: 0.6 }
};

/**
 * Infer segment type from interval data and planned step
 */
function inferSegmentType(segment: any, plannedStep: any): SegmentType {
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
    
    // Fallback: infer from duration
    const durationMin = segment.executed?.duration_s ? segment.executed.duration_s / 60 : 0;
    if (durationMin <= 8) {
      return 'work_interval'; // Short = interval
    } else {
      return 'tempo'; // Long = tempo
    }
  }
  
  return 'easy_run'; // Default fallback
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
    const segmentType = inferSegmentType(segment, plannedStep);
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

  try {
    const { workout_id } = await req.json();
    
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
        total_timer_time
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

    if (workout.type !== 'run' && workout.type !== 'running') {
      throw new Error(`Workout type ${workout.type} is not supported for running analysis`);
    }

    if (!workout.sensor_data && !workout.computed) {
      throw new Error('No sensor data or computed data available. Workout may not have been processed yet.');
    }

    // Get user baselines first (needed for both planned and unplanned workouts)
    let baselines = {};
    try {
      const { data: userBaselines } = await supabase
        .from('user_baselines')
        .select('performance_numbers')
        .eq('user_id', workout.user_id)
        .single();
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
        .select('id, intervals, steps_preset, computed, total_duration_seconds')
        .eq('id', workout.planned_id)
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
    // Enhance with granular analysis
    const computedIntervals = workout?.computed?.intervals || [];
    console.log(`🔍 Using ${computedIntervals.length} computed intervals as base`);
    
    let intervalsToAnalyze = computedIntervals;
    console.log('🔍 [CRITICAL DEBUG] intervalsToAnalyze structure:', JSON.stringify(intervalsToAnalyze, null, 2));
    
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
      
      // Calculate Garmin-style execution score using penalty system
      const executionAnalysis = calculateGarminExecutionScore(computedIntervals, plannedWorkout);
      
      performance.execution_adherence = executionAnalysis.overall_execution;
      performance.pace_adherence = executionAnalysis.pace_execution;
      performance.duration_adherence = executionAnalysis.duration_adherence;
      
      console.log(`🎯 Garmin execution score: ${performance.execution_adherence}% (was duration-weighted average)`);
      console.log(`🎯 Pace execution: ${performance.pace_adherence}%`);
      console.log(`🎯 Duration adherence: ${performance.duration_adherence}%`);
      console.log(`🎯 Total penalties: ${executionAnalysis.penalties.total.toFixed(1)}`);
    }

    console.log('✅ Performance calculated:', performance);

    // 🚀 ENHANCED DETAILED ANALYSIS - Chart-like insights
    console.log('🚀 Starting detailed analysis generation...');
    console.log('🔍 Sensor data length:', sensorData.length);
    console.log('🔍 Computed intervals length:', computedIntervals.length);
    console.log('🔍 Enhanced analysis keys:', Object.keys(enhancedAnalysis));
    
    let detailedAnalysis = null;
    try {
      detailedAnalysis = generateDetailedChartAnalysis(sensorData, computedIntervals, enhancedAnalysis);
      console.log('📊 Detailed analysis generated successfully:', JSON.stringify(detailedAnalysis, null, 2));
    } catch (error) {
      console.error('❌ Detailed analysis generation failed:', error);
      detailedAnalysis = { error: 'Failed to generate detailed analysis', message: error.message };
    }

    // 🤖 GENERATE AI NARRATIVE INSIGHTS
    let narrativeInsights = null;
    try {
      console.log('🤖 [CRITICAL] Starting AI narrative generation...');
      console.log('🤖 [CRITICAL] Checking for OPENAI_API_KEY...');
      const hasKey = !!Deno.env.get('OPENAI_API_KEY');
      console.log('🤖 [CRITICAL] OPENAI_API_KEY present:', hasKey);
      
      narrativeInsights = await generateAINarrativeInsights(
        sensorData,
        workout,
        plannedWorkout,
        enhancedAnalysis,
        performance,
        detailedAnalysis
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
        narrative_insights: narrativeInsights  // AI-generated human-readable insights
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
 * Extract sensor data from sensor_data column
 * This reads the raw sensor data from the workouts table
 */
function extractSensorData(data: any): any[] {
  console.log('🔍 Data type:', typeof data);
  console.log('🔍 Data is array:', Array.isArray(data));
  console.log('🔍 Data keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
  
  if (!data) {
    console.log('⚠️ Data is null or undefined.');
    return [];
  }

  // Handle different data structures
  let dataArray = [];
  
  if (Array.isArray(data)) {
    // Direct array
    dataArray = data;
  } else if (typeof data === 'string') {
    // JSON string - try to parse it
    console.log('🔍 Parsing JSON string...');
    try {
      const parsed = JSON.parse(data);
      console.log('🔍 Parsed JSON type:', typeof parsed);
      console.log('🔍 Parsed JSON is array:', Array.isArray(parsed));
      
      if (Array.isArray(parsed)) {
        dataArray = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Check if it's an object with array properties
        if (parsed.samples && Array.isArray(parsed.samples)) {
          dataArray = parsed.samples;
        } else if (parsed.data && Array.isArray(parsed.data)) {
          dataArray = parsed.data;
        } else if (parsed.series && Array.isArray(parsed.series)) {
          dataArray = parsed.series;
        } else {
          console.log('⚠️ Parsed JSON is an object but no array property found.');
          console.log('🔍 Available properties:', Object.keys(parsed));
          return [];
        }
      } else {
        console.log('⚠️ Parsed JSON is not an array or object.');
        return [];
      }
    } catch (error) {
      console.log('⚠️ Failed to parse JSON string:', error.message);
      return [];
    }
  } else if (data && typeof data === 'object') {
    // Check if it's an object with array properties
    if (data.samples && Array.isArray(data.samples)) {
      dataArray = data.samples;
    } else if (data.data && Array.isArray(data.data)) {
      dataArray = data.data;
    } else if (data.series && Array.isArray(data.series)) {
      dataArray = data.series;
    } else if (data.intervals && Array.isArray(data.intervals)) {
      // Check if it's already processed analysis data
      console.log('🔍 Found intervals in computed data, checking for sensor data...');
      console.log('🔍 Intervals structure:', JSON.stringify(data.intervals[0], null, 2));
      // This might be processed analysis, not raw sensor data
      return [];
    } else {
      console.log('⚠️ Data is an object but no array property found.');
      console.log('🔍 Available properties:', Object.keys(data));
      console.log('🔍 Full data structure:', JSON.stringify(data, null, 2));
      return [];
    }
  } else {
    console.log('⚠️ Data is not an array, object, or string.');
    return [];
  }

  console.log(`📊 Raw sensor data length: ${dataArray.length}`);

  if (dataArray.length === 0) {
    console.log('⚠️ Sensor data array is empty.');
    return [];
  }

  // Log first few samples to understand structure
  console.log('🔍 First sample structure:', JSON.stringify(dataArray[0], null, 2));

  // Filter out samples where pace is null or undefined, as pace is critical for running analysis
  const filteredSamples = dataArray.map((sample: any, index: number) => {
    // Check if sample has the required structure
    if (!sample || typeof sample !== 'object') {
      return null;
    }

    // Skip first sample as we need previous sample for calculations
    if (index === 0) return null;
    
    const prevSample = dataArray[index - 1];
    if (!prevSample) return null;

    // Extract pace using Garmin API priority order
    let pace_s_per_mi: number | null = null;
    let dataSource = 'unknown';
    
    // Priority 1: Direct speed from device (Best)
    if (sample.speedMetersPerSecond != null && sample.speedMetersPerSecond > 0) {
      pace_s_per_mi = 26.8224 / sample.speedMetersPerSecond; // Convert m/s to min/mi, then to s/mi
      pace_s_per_mi = pace_s_per_mi * 60; // Convert min/mi to s/mi
      dataSource = 'device_speed';
      if (index % 100 === 0) console.log(`🔍 Device speed: ${(pace_s_per_mi/60).toFixed(1)} min/mi`);
    }
    
    // Priority 2: Calculate from cumulative distance (Good)
    else if (sample.totalDistanceInMeters != null && prevSample.totalDistanceInMeters != null) {
      const distanceDelta = sample.totalDistanceInMeters - prevSample.totalDistanceInMeters;
      const timeDelta = sample.timestamp - prevSample.timestamp;
      
      if (distanceDelta > 0 && timeDelta > 0) {
        const speedMPS = distanceDelta / timeDelta;
        if (speedMPS > 0.5 && speedMPS < 10) { // Realistic running speeds (1.8-36 km/h)
          pace_s_per_mi = 26.8224 / speedMPS; // Convert m/s to min/mi
          pace_s_per_mi = pace_s_per_mi * 60; // Convert min/mi to s/mi
          dataSource = 'cumulative_distance';
          if (index % 100 === 0) console.log(`🔍 Cumulative distance: ${(pace_s_per_mi/60).toFixed(1)} min/mi`);
        }
      }
    }
    
    // Priority 3: Calculate from GPS coordinates (Fallback)
    else if (sample.latitude != null && sample.longitude != null && 
             prevSample.latitude != null && prevSample.longitude != null) {
      pace_s_per_mi = calculatePaceFromGPS(sample, prevSample);
      if (pace_s_per_mi != null) {
        dataSource = 'gps_calculation';
        if (index % 100 === 0) console.log(`🔍 GPS pace calculated: ${(pace_s_per_mi/60).toFixed(1)} min/mi`);
      }
    }

    if (pace_s_per_mi == null) {
      return null; // Filter out samples with no pace data
    }

    return {
      timestamp: sample.timestamp || index,
      pace_s_per_mi: pace_s_per_mi,
      power_w: sample.power || null,
      heart_rate: sample.heartRate || sample.heart_rate || null,
      duration_s: 1,
      data_source: dataSource // Track which method was used
    };
  }).filter(Boolean); // Remove null entries

  // Log data source distribution
  const dataSourceCounts = filteredSamples.reduce((acc: any, sample: any) => {
    const source = sample.data_source || 'unknown';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  
  console.log(`✅ Extracted ${filteredSamples.length} valid sensor samples.`);
  console.log('📊 Data source distribution:', dataSourceCounts);
  
  // Add data quality metadata
  const totalSamples = filteredSamples.length;
  const deviceSpeedPct = totalSamples > 0 ? (dataSourceCounts.device_speed || 0) / totalSamples : 0;
  const cumulativeDistancePct = totalSamples > 0 ? (dataSourceCounts.cumulative_distance || 0) / totalSamples : 0;
  const gpsCalculationPct = totalSamples > 0 ? (dataSourceCounts.gps_calculation || 0) / totalSamples : 0;
  
  // Calculate confidence level based on data source quality
  let confidenceLevel = 'low';
  if (deviceSpeedPct > 0.8) {
    confidenceLevel = 'high';
  } else if (deviceSpeedPct > 0.3 || cumulativeDistancePct > 0.5) {
    confidenceLevel = 'medium';
  }
  
  console.log(`📊 Data quality: ${(deviceSpeedPct * 100).toFixed(1)}% device speed, ${(cumulativeDistancePct * 100).toFixed(1)}% cumulative distance, ${(gpsCalculationPct * 100).toFixed(1)}% GPS calculation`);
  console.log(`🎯 Confidence level: ${confidenceLevel}`);
  
  // Add data quality metadata to each sample for later use
  const samplesWithQuality = filteredSamples.map(sample => ({
    ...sample,
    data_quality: {
      device_speed_coverage: deviceSpeedPct,
      cumulative_distance_coverage: cumulativeDistancePct,
      gps_calculation_coverage: gpsCalculationPct,
      confidence_level: confidenceLevel
    }
  }));
  
  return samplesWithQuality;
}

/**
 * Calculate duration adherence using computed data (workout-level metric)
 * This is the correct approach for duration - use pre-computed, validated data
 */
function calculateDurationAdherenceFromComputed(workout: any, plannedWorkout: any, intervals: any[]): any {
  try {
    console.log('🔍 [DURATION COMPUTED] Using computed data for duration adherence');
    console.log('🔍 [DURATION COMPUTED] workout structure:', {
      hasComputed: !!workout?.computed,
      computedKeys: workout?.computed ? Object.keys(workout.computed) : [],
      hasOverall: !!workout?.computed?.overall,
      overallKeys: workout?.computed?.overall ? Object.keys(workout.computed.overall) : []
    });
    console.log('🔍 [DURATION COMPUTED] plannedWorkout structure:', {
      hasComputed: !!plannedWorkout?.computed,
      computedKeys: plannedWorkout?.computed ? Object.keys(plannedWorkout.computed) : []
    });
    
    // Get planned duration from parsed intervals (more reliable than computed)
    const plannedDurationSeconds = intervals.reduce((sum, segment) => sum + (segment.duration || segment.duration_s || 0), 0);
    console.log('🔍 [DURATION COMPUTED] Planned duration (from intervals):', plannedDurationSeconds);
    console.log('🔍 [DURATION COMPUTED] Raw plannedWorkout.computed.total_duration_seconds:', plannedWorkout?.computed?.total_duration_seconds);

    // Get actual duration from completed workout computed data
    const actualDurationSeconds = workout?.computed?.overall?.duration_s_moving || 0;
    console.log('🔍 [DURATION COMPUTED] Actual duration (computed):', actualDurationSeconds);
    console.log('🔍 [DURATION COMPUTED] Raw workout.computed.overall.duration_s_moving:', workout?.computed?.overall?.duration_s_moving);

    if (plannedDurationSeconds === 0 || actualDurationSeconds === 0) {
      console.log('⚠️ Duration adherence: missing computed data (planned:', plannedDurationSeconds, 'actual:', actualDurationSeconds, ')');
      return {
        planned_duration_s: plannedDurationSeconds,
        actual_duration_s: actualDurationSeconds,
        adherence_percentage: null,
        delta_seconds: null
      };
    }
    
    // Calculate adherence percentage
    let adherencePercentage;
    if (actualDurationSeconds <= plannedDurationSeconds) {
      // Completed on time or early - good adherence
      adherencePercentage = (actualDurationSeconds / plannedDurationSeconds) * 100;
    } else {
      // Took longer than planned - show how much over target
      adherencePercentage = Math.min(100, (plannedDurationSeconds / actualDurationSeconds) * 100);
    }
    
    const deltaSeconds = actualDurationSeconds - plannedDurationSeconds;
    
    console.log(`✅ Duration adherence (computed): ${adherencePercentage.toFixed(1)}% (delta: ${deltaSeconds}s)`);
    
    return {
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      adherence_percentage: parseFloat(adherencePercentage.toFixed(1)),
      delta_seconds: deltaSeconds
    };
  } catch (error) {
    console.error('❌ Duration adherence calculation error:', error);
    return {
      planned_duration_s: 0,
      actual_duration_s: 0,
      adherence_percentage: null,
      delta_seconds: null
    };
  }
}

/**
 * Calculate duration adherence for running workouts (DEPRECATED - use computed data instead)
 * Compares planned vs actual duration
 */
function calculateDurationAdherence(sensorData: any[], intervals: any[], workout: any, plannedWorkout: any): any {
  try {
    console.log('🔍 [DURATION CALC DEBUG] workout.moving_time:', workout.moving_time);
    console.log('🔍 [DURATION CALC DEBUG] sensorData.length:', sensorData.length);
    console.log('🔍 [DURATION CALC DEBUG] intervals (for planned duration):', intervals);
    console.log('🔍 [DURATION CALC DEBUG] intervals structure:', intervals.map(i => ({ type: i.type, duration_s: i.duration_s, distance: i.distance })));
    
    // Add comprehensive logging to track which data source is used
    console.log('🔍 [DURATION DEBUG] Data sources available:', {
      hasPlannedComputed: !!plannedWorkout?.computed?.total_duration_seconds,
      hasWorkoutComputedIntervals: !!workout?.computed?.intervals?.length,
      hasParsedIntervals: intervals.length,
      plannedComputedValue: plannedWorkout?.computed?.total_duration_seconds,
      computedIntervalsSum: workout?.computed?.intervals?.reduce((s, i) => s + (i.planned?.duration_s || 0), 0),
      parsedIntervalsSum: intervals.reduce((s, i) => s + (i.duration_s || 0), 0)
    });
    
    // Priority 1: Use planned workout's computed total duration (most accurate)
    let plannedDurationSeconds = 0;
    if (plannedWorkout?.computed?.total_duration_seconds) {
      plannedDurationSeconds = plannedWorkout.computed.total_duration_seconds;
      console.log('✅ Using planned workout computed duration:', plannedDurationSeconds);
    }
    // Priority 2: Sum computed intervals from completed workout (has planned snapshot)
    else if (workout?.computed?.intervals?.length > 0) {
      plannedDurationSeconds = workout.computed.intervals.reduce((sum, int) => 
        sum + (int.planned?.duration_s || 0), 0);
      console.log('✅ Using computed intervals planned duration:', plannedDurationSeconds);
    }
    // Priority 3: Fallback to parsing intervals (current approach)
    else {
      plannedDurationSeconds = intervals.reduce((total, interval) => 
        total + (interval.duration_s || 0), 0);
      console.log('⚠️ Using parsed intervals duration (may be incomplete):', plannedDurationSeconds);
    }
    
    console.log('🔍 [DURATION CALC DEBUG] plannedDurationSeconds (final):', plannedDurationSeconds);
    
    // Calculate actual duration from total elapsed time
    let actualDurationSeconds = 0;
    if (sensorData.length > 0) {
      try {
        // Use total elapsed time from sensor data (includes rests)
        const firstSample = sensorData[0];
        const lastSample = sensorData[sensorData.length - 1];
        console.log('🔍 [DURATION CALC DEBUG] First sample:', firstSample);
        console.log('🔍 [DURATION CALC DEBUG] Last sample:', lastSample);
        
        if (firstSample && lastSample && firstSample.timestamp && lastSample.timestamp) {
          actualDurationSeconds = lastSample.timestamp - firstSample.timestamp;
          console.log('🔍 [DURATION CALC DEBUG] Using sensor data - firstSample timestamp:', firstSample.timestamp, 'lastSample timestamp:', lastSample.timestamp);
          console.log('🔍 [DURATION CALC DEBUG] Calculated duration from sensor data:', actualDurationSeconds);
        } else {
          console.log('🔍 [DURATION CALC DEBUG] Invalid sensor data timestamps, falling back to moving_time');
          if (workout.moving_time) {
            actualDurationSeconds = workout.moving_time; // moving_time is already in seconds
            console.log('🔍 [DURATION CALC DEBUG] Using moving_time fallback:', actualDurationSeconds);
          }
        }
      } catch (error) {
        console.log('🔍 [DURATION CALC DEBUG] Error calculating from sensor data:', error);
        if (workout.moving_time) {
          actualDurationSeconds = workout.moving_time; // moving_time is already in seconds
          console.log('🔍 [DURATION CALC DEBUG] Using moving_time fallback after error:', actualDurationSeconds);
        }
      }
    } else if (workout.moving_time) {
      // Fallback to moving_time if no sensor data
      actualDurationSeconds = workout.moving_time; // moving_time is already in seconds
      console.log('🔍 [DURATION CALC DEBUG] Using moving_time - workout.moving_time:', workout.moving_time, 'in seconds:', actualDurationSeconds);
    }
    
    console.log('🔍 [DURATION CALC DEBUG] actualDurationSeconds (calculated):', actualDurationSeconds);
    console.log(`📊 Duration adherence calculation: planned=${plannedDurationSeconds}s, actual=${actualDurationSeconds}s`);
    
    if (plannedDurationSeconds === 0 || actualDurationSeconds === 0) {
      console.log(`⚠️ Duration adherence: missing data (planned=${plannedDurationSeconds}s, actual=${actualDurationSeconds}s)`);
      return {
        planned_duration_s: plannedDurationSeconds,
        actual_duration_s: actualDurationSeconds,
        adherence_percentage: null,
        delta_seconds: null
      };
    }
    
    // Calculate adherence percentage (closer to 100% = better adherence)
    let adherencePercentage;
    
    // For interval workouts, use a more lenient calculation
    const isIntervalWorkout = intervals.some(interval => interval.type === 'work');
    
    if (isIntervalWorkout) {
      // For intervals, use a more lenient tolerance (±10%)
      const tolerance = 0.10; // 10% tolerance
      const minAcceptable = plannedDurationSeconds * (1 - tolerance);
      const maxAcceptable = plannedDurationSeconds * (1 + tolerance);
      
      if (actualDurationSeconds >= minAcceptable && actualDurationSeconds <= maxAcceptable) {
        // Within acceptable range - give high score
        adherencePercentage = 95 + Math.random() * 5; // 95-100%
      } else {
        // Outside acceptable range - calculate penalty
        const deviation = Math.abs(actualDurationSeconds - plannedDurationSeconds) / plannedDurationSeconds;
        adherencePercentage = Math.max(0, 100 - (deviation * 100));
      }
    } else {
      // For non-interval workouts, use strict calculation
      if (actualDurationSeconds <= plannedDurationSeconds) {
        // Completed on time or early - good adherence
        adherencePercentage = (actualDurationSeconds / plannedDurationSeconds) * 100;
      } else {
        // Took longer than planned - show how much over target
        adherencePercentage = Math.min(100, (plannedDurationSeconds / actualDurationSeconds) * 100);
      }
    }
    const deltaSeconds = actualDurationSeconds - plannedDurationSeconds;
    
    console.log(`✅ Duration adherence: ${adherencePercentage.toFixed(1)}% (delta: ${deltaSeconds}s)`);
    
    return {
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      adherence_percentage: adherencePercentage,
      delta_seconds: deltaSeconds
    };
  } catch (error) {
    console.error('❌ Duration adherence calculation error:', error);
    return {
      planned_duration_s: 0,
      actual_duration_s: 0,
      adherence_percentage: null,
      delta_seconds: null
    };
  }
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
  
  // Check if this is an interval workout (has work segments with pace targets)
  // Look for intervals with 'work' role or 'interval' kind, and check for pace targets
  const workIntervals = intervals.filter(interval => {
    const isWorkRole = interval.role === 'work' || interval.kind === 'work';
    // Check for pace target in multiple possible locations
    const hasPaceTarget = interval.target_pace?.lower || 
                         interval.pace_range?.lower || 
                         interval.planned?.target_pace_s_per_mi ||
                         interval.planned?.pace_range;
    console.log(`🔍 Checking interval: role=${interval.role}, kind=${interval.kind}, hasPaceTarget=${!!hasPaceTarget}`);
    return isWorkRole && hasPaceTarget;
  });
  
  const isIntervalWorkout = workIntervals.length > 0;
  console.log(`🔍 Workout type: ${isIntervalWorkout ? 'Intervals' : 'Steady-state'} (${workIntervals.length} work segments)`);
  
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
  
  // Filter to work segments only
  const workIntervals = intervals.filter(interval => {
    const isWorkRole = interval.role === 'work' || interval.kind === 'work';
    const hasPaceTarget = interval.target_pace?.lower || interval.planned?.target_pace_s_per_mi;
    return isWorkRole && hasPaceTarget;
  });
  
  console.log(`📊 Analyzing ${workIntervals.length} work intervals`);
  
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
    const intervalResult = analyzeIntervalPace(intervalSamples, interval);
    
    // Attach granular metrics to the interval
    if (intervalResult.granular_metrics) {
      interval.granular_metrics = intervalResult.granular_metrics;
    }
    
    totalTimeInRange += intervalResult.timeInRange;
    totalTimeOutsideRange += intervalResult.timeOutsideRange;
    totalSamples += intervalResult.totalSamples;
  }
  
  const totalTime = totalTimeInRange + totalTimeOutsideRange;
  const timeInRangeScore = totalTime > 0 ? totalTimeInRange / totalTime : 0;
  
  console.log(`✅ Interval analysis complete: ${(timeInRangeScore * 100).toFixed(1)}% time in range`);
  
  // Calculate duration adherence
  const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
  const actualDurationSeconds = workout?.computed?.overall?.duration_s_moving || 
    intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
  
  // Use the time-in-range score we already calculated above
  const avgPaceAdherence = timeInRangeScore * 100;
  
  return {
    overall_adherence: avgPaceAdherence / 100, // Convert percentage to decimal for consistency
    time_in_range_score: timeInRangeScore,
    variability_score: 0, // Would calculate from interval-to-interval consistency
    smoothness_score: 0, // Would calculate from pace transitions
    pacing_variability: {
      coefficient_of_variation: 0,
      avg_pace_change_per_min: 0,
      num_surges: 0,
      num_crashes: 0,
      steadiness_score: 0,
      avg_pace_change_seconds: 0
    },
    time_in_range_s: totalTimeInRange,
    time_outside_range_s: totalTimeOutsideRange,
    total_time_s: totalTime,
    samples_in_range: totalSamples,
    samples_outside_range: 0,
    heart_rate_analysis: null,
    pacing_analysis: {
      time_in_range_score: avgPaceAdherence,
      variability_score: 0,
      smoothness_score: 0,
      pacing_variability: 0
    },
    duration_adherence: {
      adherence_percentage: plannedDurationSeconds > 0 ? (actualDurationSeconds / plannedDurationSeconds) * 100 : 0,
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      delta_seconds: actualDurationSeconds - plannedDurationSeconds
    }
  };
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
    console.log('⚠️ No main segments found for steady-state analysis');
    return createEmptyAdherence();
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
    console.log('⚠️ No valid segments found');
    return createEmptyAdherence();
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
    heart_rate_analysis: null,
    pacing_analysis: {
      time_in_range_score: paceAdherence * 100, // Convert decimal to percentage
      variability_score: cv,
      smoothness_score: 1 - cv,
      pacing_variability: cv * 100
    },
    duration_adherence: {
      adherence_percentage: plannedDurationSeconds > 0 ? (actualDurationSeconds / plannedDurationSeconds) * 100 : 0,
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
 * Analyze interval pace (simplified version)
 */
function analyzeIntervalPace(samples: any[], interval: any): any {
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
  
  const avgPace = validSamples.reduce((sum, s) => sum + s.pace_s_per_mi, 0) / validSamples.length;
  
  // ✅ Clean structure - use planned target pace
  const targetPace = interval.target_pace?.lower || 0;
  const actualPace = interval.executed?.avg_pace_s_per_mi || avgPace;
  
  const adherence = targetPace > 0 ? targetPace / actualPace : 1;
  
  // 🎯 Garmin-style adherence check (no context-aware fancy logic, just raw percentages)
  // Simple thresholds - being close to target = good, anything else = bad
  const lowerThreshold = 0.95;  // 95% - too slow
  const upperThreshold = 1.05;  // 105% - too fast
  
  // Calculate granular metrics
  const paceValues = validSamples.map(s => s.pace_s_per_mi);
  const hrValues = samples.filter(s => s.heart_rate && s.heart_rate > 0).map(s => s.heart_rate);
  const cadenceValues = samples.filter(s => s.cadence && s.cadence > 0).map(s => s.cadence);
  
  // Pace variation (coefficient of variation)
  const paceStdDev = Math.sqrt(paceValues.reduce((sum, v) => sum + Math.pow(v - avgPace, 2), 0) / paceValues.length);
  const paceVariation = avgPace > 0 ? (paceStdDev / avgPace) * 100 : 0;
  
  // HR drift
  const hrDrift = hrValues.length >= 10 
    ? calculateHeartRateDrift(hrValues)
    : 0;
  
  // Cadence consistency (coefficient of variation)
  const avgCadence = cadenceValues.length > 0 
    ? cadenceValues.reduce((sum, v) => sum + v, 0) / cadenceValues.length 
    : 0;
  const cadenceStdDev = cadenceValues.length > 0
    ? Math.sqrt(cadenceValues.reduce((sum, v) => sum + Math.pow(v - avgCadence, 2), 0) / cadenceValues.length)
    : 0;
  const cadenceConsistency = avgCadence > 0 ? (cadenceStdDev / avgCadence) * 100 : 0;
  
  // Time in target zones
  const targetLower = interval.target_pace?.lower || 0;
  const targetUpper = interval.target_pace?.upper || targetLower;
  const samplesInTarget = paceValues.filter(p => p >= targetLower && p <= targetUpper).length;
  const timeInTarget = (samplesInTarget / paceValues.length) * 100;
  
  return {
    timeInRange: adherence >= lowerThreshold && adherence <= upperThreshold ? validSamples.length : 0,
    timeOutsideRange: adherence < lowerThreshold || adherence > upperThreshold ? validSamples.length : 0,
    totalSamples: validSamples.length,
    filteredOutliers: 0,
    handledGaps: 0,
    adherence: adherence,
    granular_metrics: {
      pace_variation_pct: Math.round(paceVariation * 10) / 10,
      hr_drift_bpm: Math.round(hrDrift * 10) / 10,
      cadence_consistency_pct: Math.round(cadenceConsistency * 10) / 10,
      time_in_target_pct: Math.round(timeInTarget)
    }
  };
}

/**
 * Calculate prescribed range adherence for running workouts (DEPRECATED - use granular analysis)
 * This is the core analysis function that measures time-in-range
 */
function calculatePrescribedRangeAdherence(sensorData: any[], intervals: any[], workout: any): PrescribedRangeAdherence {
  console.log(`📊 Starting prescribed range analysis for ${intervals.length} intervals`);
  
  let totalTimeInRange = 0;
  let totalTimeOutsideRange = 0;
  let totalSamples = 0;
  let filteredOutliers = 0;
  let handledGaps = 0;
  
  const intervalAnalysis: IntervalAnalysis[] = [];
  
  for (const interval of intervals) {
    console.log(`🔍 Analyzing interval: ${interval.type} (${interval.duration_s}s)`);
    console.log('🔍 Interval structure:', JSON.stringify(interval, null, 2));
    
    // Get samples for this interval
    const intervalSamples = getSamplesForInterval(sensorData, interval);
    console.log(`📈 Found ${intervalSamples.length} samples for interval`);
    
    if (intervalSamples.length === 0) {
      console.log(`⚠️ No samples found for interval, skipping`);
      continue;
    }
    
    // Filter outliers and handle gaps
    const { cleanSamples, outliers, gaps } = filterOutliersAndGaps(intervalSamples);
    filteredOutliers += outliers;
    handledGaps += gaps;
    
    console.log(`🧹 Filtered ${outliers} outliers, handled ${gaps} gaps`);
    
    if (cleanSamples.length === 0) {
      console.log(`⚠️ No clean samples after filtering, skipping interval`);
      continue;
    }
    
    // Calculate adherence for this interval
    const intervalResult = calculateIntervalAdherence(cleanSamples, interval);
    intervalAnalysis.push(intervalResult);
    
    totalTimeInRange += intervalResult.time_in_range;
    totalTimeOutsideRange += intervalResult.time_outside_range;
    totalSamples += cleanSamples.length;
    
    console.log(`✅ Interval adherence: ${(intervalResult.adherence_percentage * 100).toFixed(1)}%`);
  }
  
  // Calculate enhanced adherence with pacing quality metrics
  const enhancedAdherence = calculateEnhancedAdherence(sensorData, {
    lower: intervals[0]?.pace_range?.lower || 0,
    upper: intervals[0]?.pace_range?.upper || 1000
  });
  
  console.log('🔍 Enhanced adherence result:', enhancedAdherence);
  
  const overallAdherence = enhancedAdherence.overall_adherence;
  const performanceAssessment = getOverallPerformanceAssessment(overallAdherence, intervalAnalysis);
  
  // Calculate heart rate analysis
  const heartRateAnalysis = calculateOverallHeartRateAnalysis(sensorData);
  
  // ✅ Fix Duration - Use proper data sources
  console.log('🔍 [DURATION DEBUG] Calculating duration adherence with proper data sources');
  
  // For duration adherence (workout-level metric)
  console.log('🔍 [DURATION DEBUG] intervals.length:', intervals.length);
  console.log('🔍 [DURATION DEBUG] intervals[0] planned duration:', intervals[0]?.duration_s);
  console.log('🔍 [DURATION DEBUG] intervals[0] executed duration:', intervals[0]?.executed?.duration_s);
  
  const plannedDurationSeconds = 
    intervals.reduce((sum, i) => sum + (i.duration_s || 0), 0);

  const actualDurationSeconds = 
    workout?.computed?.overall?.duration_s_moving ||
    intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
  
  console.log('🔍 [DURATION DEBUG] Planned duration:', plannedDurationSeconds);
  console.log('🔍 [DURATION DEBUG] Actual duration:', actualDurationSeconds);
  
  const durationAdherence = plannedDurationSeconds > 0 ? {
    planned_duration_s: plannedDurationSeconds,
    actual_duration_s: actualDurationSeconds,
    adherence_percentage: Math.round((actualDurationSeconds / plannedDurationSeconds) * 100),
    deviation_s: actualDurationSeconds - plannedDurationSeconds
  } : null;
  
  console.log('🔍 [DURATION DEBUG] Duration adherence result:', durationAdherence);
  
  // Identify primary issues and strengths
  const primaryIssues = identifyPrimaryIssues(intervalAnalysis);
  const strengths = identifyStrengths(intervalAnalysis);
  
  console.log(`🎯 Overall adherence: ${(overallAdherence * 100).toFixed(1)}%`);
  console.log(`📊 Performance: ${performanceAssessment}`);
  console.log(`🚨 Issues: ${primaryIssues.length}`);
  console.log(`💪 Strengths: ${strengths.length}`);
  
  console.log('🔍 Pre-return debug:', {
    plannedDurationSeconds,
    actualDurationSeconds,
    durationAdherence,
    enhancedAdherence,
    workIntervalsCount: intervals?.filter(i => i.role === 'work').length
  });
  
  // Calculate work intervals for pacing analysis
  const workIntervals = intervals?.filter(i => i.role === 'work' && i.hasExecuted) || [];
  
  return {
    overall_adherence: overallAdherence,
    time_in_range_s: enhancedAdherence.time_in_range_s,
    time_outside_range_s: enhancedAdherence.time_outside_range_s,
    total_time_s: enhancedAdherence.total_time_s,
    interval_breakdown: intervalAnalysis,
    performance_assessment: performanceAssessment,
    primary_issues: primaryIssues,
    strengths: strengths,
    heart_rate_analysis: heartRateAnalysis,
    pacing_analysis: {
      time_in_range_score: workIntervals.length > 0 ? 
        workIntervals.reduce((sum, i) => sum + (i.pace_adherence || 0), 0) / workIntervals.length : 
        enhancedAdherence.time_in_range_score,
      variability_score: enhancedAdherence.variability_score,
      smoothness_score: enhancedAdherence.smoothness_score,
      pacing_variability: enhancedAdherence.pacing_variability
    },
    duration_adherence: {
      adherence_percentage: plannedDurationSeconds > 0 ? (actualDurationSeconds / plannedDurationSeconds) * 100 : 0,
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      delta_seconds: actualDurationSeconds - plannedDurationSeconds
    },
    analysis_metadata: {
      total_intervals: intervals.length,
      intervals_analyzed: intervalAnalysis.length,
      samples_processed: totalSamples,
      outliers_filtered: filteredOutliers,
      gaps_handled: handledGaps
    }
  };
}

/**
 * Get samples that fall within an interval's time range
 * Uses fuzzy matching to handle timing discrepancies
 */
function getSamplesForInterval(sensorData: any[], interval: any): any[] {
  // For long runs or single intervals, use all samples
  if (!interval.start_time || !interval.end_time) {
    console.log('🔍 No start/end time for interval, using all samples for long run');
    return sensorData;
  }
  
  const startTime = new Date(interval.start_time).getTime() / 1000;
  const endTime = new Date(interval.end_time).getTime() / 1000;
  
  // Add tolerance for manual lap button presses
  const startTolerance = 10; // 10 seconds before
  const endTolerance = 5;    // 5 seconds after
  
  return sensorData.filter(sample => {
    const sampleTime = sample.timestamp;
    return sampleTime >= (startTime - startTolerance) && 
           sampleTime <= (endTime + endTolerance);
  });
}

/**
 * Filter out GPS spikes and unrealistic values
 * Handle gaps in sensor data with interpolation
 */
function filterOutliersAndGaps(samples: any[]): { cleanSamples: any[], outliers: number, gaps: number } {
  if (samples.length === 0) return { cleanSamples: [], outliers: 0, gaps: 0 };
  
  let outliers = 0;
  let gaps = 0;
  const cleanSamples: any[] = [];
  
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const nextSample = samples[i + 1];
    
    // Check for outliers (GPS spikes, unrealistic pace/power)
    if (isOutlier(sample)) {
      outliers++;
      continue;
    }
    
    // Handle gaps in sensor data
    if (nextSample) {
      const timeDiff = nextSample.timestamp - sample.timestamp;
      
      if (timeDiff > 60) {
        // Large gap - skip this sample entirely
        gaps++;
        continue;
      } else if (timeDiff > 10) {
        // Medium gap - interpolate
        const interpolatedSamples = interpolateGap(sample, nextSample);
        cleanSamples.push(...interpolatedSamples);
        gaps++;
      }
    }
    
    cleanSamples.push(sample);
  }
  
  return { cleanSamples, outliers, gaps };
}

/**
 * Check if a sample is an outlier (GPS spike, unrealistic value)
 */
function isOutlier(sample: any): boolean {
  // Check for unrealistic pace values (faster than 4:00/mi or slower than 15:00/mi)
  if (sample.pace_s_per_mi && (sample.pace_s_per_mi < 240 || sample.pace_s_per_mi > 900)) {
    return true;
  }
  
  // Check for unrealistic power values (negative or > 1000W)
  if (sample.power_w && (sample.power_w < 0 || sample.power_w > 1000)) {
    return true;
  }
  
  // Check for unrealistic heart rate (below 30 or above 220)
  if (sample.heart_rate && (sample.heart_rate < 30 || sample.heart_rate > 220)) {
    return true;
  }
  
  return false;
}

/**
 * Interpolate between two samples for medium gaps
 */
function interpolateGap(sample1: any, sample2: any): any[] {
  const timeDiff = sample2.timestamp - sample1.timestamp;
  const steps = Math.floor(timeDiff / 5); // 5-second steps
  const interpolated: any[] = [];
  
  for (let i = 1; i < steps; i++) {
    const ratio = i / steps;
    const interpolatedSample = {
      timestamp: sample1.timestamp + (timeDiff * ratio),
      pace_s_per_mi: interpolateValue(sample1.pace_s_per_mi, sample2.pace_s_per_mi, ratio),
      power_w: interpolateValue(sample1.power_w, sample2.power_w, ratio),
      heart_rate: interpolateValue(sample1.heart_rate, sample2.heart_rate, ratio),
      duration_s: 5
    };
    interpolated.push(interpolatedSample);
  }
  
  return interpolated;
}

/**
 * Linear interpolation between two values
 */
function interpolateValue(value1: number, value2: number, ratio: number): number {
  if (value1 == null || value2 == null) return value1 || value2 || 0;
  return value1 + (value2 - value1) * ratio;
}

/**
 * Calculate adherence for a single interval
 */
function calculateIntervalAdherence(samples: any[], interval: any): IntervalAnalysis {
  const prescribedRange = getPrescribedRange(interval);
  let timeInRange = 0;
  let timeOutsideRange = 0;
  let samplesInRange = 0;
  let samplesOutsideRange = 0;
  let totalValue = 0;
  
  for (const sample of samples) {
    const value = getSampleValue(sample, interval);
    const duration = sample.duration_s || 1;
    
    if (value == null) continue;
    
    totalValue += value;
    
    if (isInPrescribedRange(value, prescribedRange)) {
      timeInRange += duration;
      samplesInRange++;
    } else {
      timeOutsideRange += duration;
      samplesOutsideRange++;
    }
  }
  
  const totalTime = timeInRange + timeOutsideRange;
  const adherencePercentage = totalTime > 0 ? timeInRange / totalTime : 0;
  const averageValue = samples.length > 0 ? totalValue / samples.length : 0;
  
  // Calculate range consistency (coefficient of variation)
  const rangeConsistency = calculateRangeConsistency(samples, interval);
  
  // Identify issues for this interval
  const issues = identifyIntervalIssues(adherencePercentage, averageValue, prescribedRange, interval);
  
  // Calculate performance assessment for this interval
  const performanceAssessment = getPerformanceAssessment(adherencePercentage, interval.type);
  
  return {
    interval_id: interval.id || `interval_${Date.now()}`,
    interval_type: interval.type || 'unknown',
    prescribed_range: prescribedRange,
    time_in_range: timeInRange,
    time_outside_range: timeOutsideRange,
    adherence_percentage: adherencePercentage,
    samples_in_range: samplesInRange,
    samples_outside_range: samplesOutsideRange,
    average_value: averageValue,
    range_consistency: rangeConsistency,
    issues: issues,
    performance_assessment: performanceAssessment
  };
}

/**
 * Get the prescribed range for an interval (pace or power)
 */
function getPrescribedRange(interval: any): { lower: number, upper: number, unit: string } {
  if (interval.pace_range) {
    return {
      lower: interval.pace_range.lower,
      upper: interval.pace_range.upper,
      unit: 's_per_mi'
    };
  }
  
  if (interval.power_range) {
    return {
      lower: interval.power_range.lower,
      upper: interval.power_range.upper,
      unit: 'watts'
    };
  }
  
  // Default fallback
  return {
    lower: 0,
    upper: 1000,
    unit: 'unknown'
  };
}

/**
 * Calculate pace from GPS coordinates
 */
function calculatePaceFromGPS(sample: any, prevSample: any): number | null {
  if (!prevSample || !prevSample.latitude || !prevSample.longitude || !prevSample.timestamp) {
    return null;
  }
  
  // Calculate distance between GPS points using Haversine formula
  const distance = calculateDistance(
    prevSample.latitude, prevSample.longitude,
    sample.latitude, sample.longitude
  );
  
  // Calculate time difference
  const timeDiff = sample.timestamp - prevSample.timestamp;
  
  // Skip if time difference is too small or too large (GPS errors)
  if (timeDiff <= 0 || timeDiff > 60) return null;
  
  // Calculate speed in m/s
  const speedMps = distance / timeDiff;
  
  // Skip unrealistic speeds (faster than 20 mph or slower than 2 mph)
  if (speedMps < 0.9 || speedMps > 8.9) return null;
  
  // Convert to pace in seconds per mile using Garmin API formula
  const paceMinPerMile = 26.8224 / speedMps; // Convert m/s to min/mi
  return paceMinPerMile * 60; // Convert min/mi to s/mi
}

/**
 * Calculate distance between two GPS points using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in meters
}

/**
 * Calculate heart rate zones based on max heart rate
 */
function calculateHeartRateZones(maxHR: number): HeartRateZones {
  return {
    zone1: { lower: 0.5 * maxHR, upper: 0.6 * maxHR, name: 'Recovery' },
    zone2: { lower: 0.6 * maxHR, upper: 0.7 * maxHR, name: 'Aerobic Base' },
    zone3: { lower: 0.7 * maxHR, upper: 0.8 * maxHR, name: 'Aerobic Threshold' },
    zone4: { lower: 0.8 * maxHR, upper: 0.9 * maxHR, name: 'Lactate Threshold' },
    zone5: { lower: 0.9 * maxHR, upper: 1.0 * maxHR, name: 'VO2 Max' }
  };
}

/**
 * Calculate heart rate zone adherence for samples
 */
function calculateHeartRateAdherence(samples: any[], targetZone: HeartRateZone): HeartRateAdherence {
  let timeInZone = 0;
  let totalTime = 0;
  let samplesInZone = 0;
  let totalSamples = 0;
  let hrValues: number[] = [];
  
  for (const sample of samples) {
    if (sample.heart_rate != null && sample.heart_rate > 0) {
      const duration = sample.duration_s || 1;
      totalTime += duration;
      totalSamples++;
      hrValues.push(sample.heart_rate);
      
      if (sample.heart_rate >= targetZone.lower && sample.heart_rate <= targetZone.upper) {
        timeInZone += duration;
        samplesInZone++;
      }
    }
  }
  
  const adherence = totalTime > 0 ? timeInZone / totalTime : 0;
  const avgHR = hrValues.length > 0 ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : 0;
  const hrDrift = calculateHeartRateDrift(hrValues);
  
  return {
    adherence_percentage: adherence,
    time_in_zone_s: timeInZone,
    time_outside_zone_s: totalTime - timeInZone,
    total_time_s: totalTime,
    samples_in_zone: samplesInZone,
    samples_outside_zone: totalSamples - samplesInZone,
    average_heart_rate: avgHR,
    target_zone: targetZone,
    hr_drift_bpm: hrDrift,
    hr_consistency: calculateHRConsistency(hrValues)
  };
}

/**
 * Calculate heart rate drift (increase over time)
 */
function calculateHeartRateDrift(hrValues: number[]): number {
  if (hrValues.length < 10) return 0;
  
  const firstThird = hrValues.slice(0, Math.floor(hrValues.length / 3));
  const lastThird = hrValues.slice(-Math.floor(hrValues.length / 3));
  
  const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
  const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
  
  return lastAvg - firstAvg;
}

/**
 * Calculate heart rate consistency (coefficient of variation)
 */
function calculateHRConsistency(hrValues: number[]): number {
  if (hrValues.length < 2) return 0;
  
  const mean = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
  const variance = hrValues.reduce((sum, hr) => sum + Math.pow(hr - mean, 2), 0) / hrValues.length;
  const stdDev = Math.sqrt(variance);
  
  return (stdDev / mean) * 100; // Coefficient of variation as percentage
}

/**
 * Calculate overall heart rate analysis for the entire workout
 */
function calculateOverallHeartRateAnalysis(sensorData: any[]): any {
  // Extract heart rate values
  const hrValues = sensorData
    .filter(sample => sample.heart_rate != null && sample.heart_rate > 0)
    .map(sample => sample.heart_rate);
  
  if (hrValues.length === 0) {
    return {
      available: false,
      message: 'No heart rate data available'
    };
  }
  
  // Calculate basic HR metrics
  const avgHR = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
  const maxHR = Math.max(...hrValues);
  const minHR = Math.min(...hrValues);
  const hrDrift = calculateHeartRateDrift(hrValues);
  const hrConsistency = calculateHRConsistency(hrValues);
  
  // Estimate max HR if not available (220 - age approximation)
  // For now, use 190 as default (typical for 30-year-old)
  const estimatedMaxHR = 190;
  const hrZones = calculateHeartRateZones(estimatedMaxHR);
  
  // Calculate time in each zone
  const zoneAnalysis = calculateTimeInZones(sensorData, hrZones);
  
  return {
    available: true,
    average_heart_rate: Math.round(avgHR),
    max_heart_rate: maxHR,
    min_heart_rate: minHR,
    hr_drift_bpm: Math.round(hrDrift * 10) / 10,
    hr_consistency_percent: Math.round(hrConsistency * 10) / 10,
    estimated_max_hr: estimatedMaxHR,
    zones: hrZones,
    zone_analysis: zoneAnalysis,
    recommendations: generateHRRecommendations(hrDrift, hrConsistency, zoneAnalysis)
  };
}

/**
 * Calculate time spent in each heart rate zone
 */
function calculateTimeInZones(sensorData: any[], zones: HeartRateZones): any {
  const zoneTimes: any = {};
  
  for (const [zoneName, zone] of Object.entries(zones)) {
    const adherence = calculateHeartRateAdherence(sensorData, zone);
    zoneTimes[zoneName] = {
      name: zone.name,
      time_s: adherence.time_in_zone_s,
      percentage: adherence.adherence_percentage,
      samples: adherence.samples_in_zone
    };
  }
  
  return zoneTimes;
}

/**
 * Generate heart rate recommendations based on analysis
 */
function generateHRRecommendations(hrDrift: number, hrConsistency: number, zoneAnalysis: any): string[] {
  const recommendations: string[] = [];
  
  // HR Drift recommendations
  if (hrDrift > 10) {
    recommendations.push('High HR drift detected - consider easier pace or better fitness base');
  } else if (hrDrift > 5) {
    recommendations.push('Moderate HR drift - monitor effort level');
  } else if (hrDrift < -5) {
    recommendations.push('Negative HR drift - excellent fitness or conservative pacing');
  }
  
  // HR Consistency recommendations
  if (hrConsistency > 15) {
    recommendations.push('High HR variability - focus on steady effort');
  } else if (hrConsistency < 5) {
    recommendations.push('Excellent HR consistency - very steady effort');
  }
  
  // Zone distribution recommendations
  const zone2Time = zoneAnalysis.zone2?.percentage || 0;
  const zone3Time = zoneAnalysis.zone3?.percentage || 0;
  const zone4Time = zoneAnalysis.zone4?.percentage || 0;
  
  if (zone2Time > 0.8) {
    recommendations.push('Excellent aerobic base training - mostly Zone 2');
  } else if (zone3Time > 0.6) {
    recommendations.push('Good threshold training - significant Zone 3 time');
  } else if (zone4Time > 0.3) {
    recommendations.push('High intensity workout - substantial Zone 4 time');
  }
  
  return recommendations;
}

/**
 * Calculate pacing variability metrics (CV, surges, crashes, smoothness)
 */
function calculatePacingVariability(samples: any[]): PacingVariability {
  const paces = samples
    .map(s => s.pace_s_per_mi)
    .filter(p => p != null && p > 0);
  
  if (paces.length < 2) {
    return {
      coefficient_of_variation: 0,
      avg_pace_change_per_min: 0,
      num_surges: 0,
      num_crashes: 0,
      steadiness_score: 0,
      avg_pace_change_seconds: 0
    };
  }
  
  // Calculate coefficient of variation
  const mean = paces.reduce((a, b) => a + b, 0) / paces.length;
  const variance = paces.reduce((sum, pace) => sum + Math.pow(pace - mean, 2), 0) / paces.length;
  const stdDev = Math.sqrt(variance);
  const cv = (stdDev / mean) * 100;
  
  // Calculate sequential changes
  let surges = 0;
  let crashes = 0;
  let totalChange = 0;
  let significantChanges = 0;
  
  for (let i = 1; i < paces.length; i++) {
    const delta = paces[i] - paces[i-1];
    totalChange += Math.abs(delta);
    
    // Count significant pace changes (>10s/mi)
    if (delta < -10) {
      surges++; // Pace dropped >10s/mi (surge)
      significantChanges++;
    }
    if (delta > 10) {
      crashes++; // Pace increased >10s/mi (crash)
      significantChanges++;
    }
  }
  
  const avgChange = totalChange / (paces.length - 1);
  const avgChangePerMin = avgChange; // Assuming 1 sample per minute
  
  // Calculate steadiness score (0-100)
  let steadinessScore = 100;
  
  // Penalize high CV
  if (cv > 10) steadinessScore -= 40;
  else if (cv > 7) steadinessScore -= 30;
  else if (cv > 5) steadinessScore -= 20;
  else if (cv > 3) steadinessScore -= 10;
  
  // Penalize surges and crashes
  const surgeRate = surges / paces.length;
  const crashRate = crashes / paces.length;
  
  if (surgeRate > 0.1) steadinessScore -= 20; // >10% of samples are surges
  if (crashRate > 0.1) steadinessScore -= 20; // >10% of samples are crashes
  
  // Penalize high average change
  if (avgChange > 15) steadinessScore -= 20;
  else if (avgChange > 10) steadinessScore -= 15;
  else if (avgChange > 5) steadinessScore -= 10;
  
  steadinessScore = Math.max(0, steadinessScore);
  
  return {
    coefficient_of_variation: Math.round(cv * 10) / 10,
    avg_pace_change_per_min: Math.round(avgChangePerMin * 10) / 10,
    num_surges: surges,
    num_crashes: crashes,
    steadiness_score: Math.round(steadinessScore),
    avg_pace_change_seconds: Math.round(avgChange * 10) / 10
  };
}

/**
 * Calculate enhanced adherence with pacing quality metrics
 */
function calculateEnhancedAdherence(samples: any[], targetRange: { lower: number, upper: number }): EnhancedAdherence {
  // 1. Time in range (current metric - 40% weight)
  let timeInRange = 0;
  let totalTime = 0;
  let samplesInRange = 0;
  
  for (const sample of samples) {
    if (sample.pace_s_per_mi != null && sample.pace_s_per_mi > 0) {
      const duration = sample.duration_s || 1;
      totalTime += duration;
      
      if (sample.pace_s_per_mi >= targetRange.lower && sample.pace_s_per_mi <= targetRange.upper) {
        timeInRange += duration;
        samplesInRange++;
      }
    }
  }
  
  const timeInRangeScore = totalTime > 0 ? timeInRange / totalTime : 0;
  
  // 2. Pacing variability (30% weight)
  const variability = calculatePacingVariability(samples);
  const variabilityScore = variability.steadiness_score / 100;
  
  // 3. Sequential smoothness (30% weight)
  const smoothnessScore = calculatePacingSmoothness(samples);
  
  // Weighted overall adherence
  const overallAdherence = (
    timeInRangeScore * 0.4 +
    variabilityScore * 0.3 +
    smoothnessScore * 0.3
  );
  
  return {
    overall_adherence: overallAdherence,
    time_in_range_score: timeInRangeScore,
    variability_score: variabilityScore,
    smoothness_score: smoothnessScore,
    pacing_variability: variability,
    time_in_range_s: timeInRange,
    time_outside_range_s: totalTime - timeInRange,
    total_time_s: totalTime,
    samples_in_range: samplesInRange,
    samples_outside_range: samples.length - samplesInRange
  };
}

/**
 * Calculate pacing smoothness based on sequential changes
 */
function calculatePacingSmoothness(samples: any[]): number {
  const paces = samples
    .map(s => s.pace_s_per_mi)
    .filter(p => p != null && p > 0);
  
  if (paces.length < 2) return 0;
  
  let totalChange = 0;
  let smoothChanges = 0;
  let roughChanges = 0;
  
  for (let i = 1; i < paces.length; i++) {
    const delta = Math.abs(paces[i] - paces[i-1]);
    totalChange += delta;
    
    if (delta < 2) smoothChanges++;
    else if (delta > 10) roughChanges++;
  }
  
  const avgChange = totalChange / (paces.length - 1);
  const smoothnessRatio = smoothChanges / (paces.length - 1);
  const roughnessRatio = roughChanges / (paces.length - 1);
  
  // Score based on smoothness
  let score = 100;
  
  // Penalize high average change
  if (avgChange > 15) score -= 40;
  else if (avgChange > 10) score -= 30;
  else if (avgChange > 5) score -= 20;
  else if (avgChange > 2) score -= 10;
  
  // Penalize rough changes
  if (roughnessRatio > 0.2) score -= 30; // >20% rough changes
  else if (roughnessRatio > 0.1) score -= 20; // >10% rough changes
  else if (roughnessRatio > 0.05) score -= 10; // >5% rough changes
  
  // Reward smooth changes
  if (smoothnessRatio > 0.8) score += 10; // >80% smooth changes
  else if (smoothnessRatio > 0.6) score += 5; // >60% smooth changes
  
  return Math.max(0, Math.min(100, score)) / 100; // Return as 0-1
}

/**
 * Get the relevant value from a sample based on interval type
 */
function getSampleValue(sample: any, interval: any): number | null {
  if (interval.pace_range && sample.pace_s_per_mi != null) {
    return sample.pace_s_per_mi;
  }
  
  if (interval.power_range && sample.power_w != null) {
    return sample.power_w;
  }
  
  if (interval.heart_rate_range && sample.heart_rate != null) {
    return sample.heart_rate;
  }
  
  return null;
}

/**
 * Check if a value is within the prescribed range
 */
function isInPrescribedRange(value: number, range: { lower: number, upper: number }): boolean {
  return value >= range.lower && value <= range.upper;
}

/**
 * Calculate range consistency (coefficient of variation)
 */
function calculateRangeConsistency(samples: any[], interval: any): number {
  const values = samples
    .map(s => getSampleValue(s, interval))
    .filter(v => v != null) as number[];
  
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return mean > 0 ? stdDev / mean : 0;
}

/**
 * Identify issues for a specific interval
 */
function identifyIntervalIssues(adherence: number, averageValue: number, range: { lower: number, upper: number, unit: string }, interval: any): string[] {
  const issues: string[] = [];
  
  if (adherence < 0.5) {
    issues.push('Poor adherence to prescribed range');
  }
  
  if (averageValue < range.lower) {
    issues.push('Consistently too fast');
  } else if (averageValue > range.upper) {
    issues.push('Consistently too slow');
  }
  
  if (interval.type === 'work' && adherence < 0.7) {
    issues.push('Work interval not executed as prescribed');
  }
  
  return issues;
}

/**
 * Get performance assessment for a specific interval based on adherence percentage
 */
function getPerformanceAssessment(adherence: number, intervalType: string): string {
  const percentage = Math.round(adherence * 100);
  
  if (intervalType === 'warmup' || intervalType === 'cooldown') {
    // More lenient for warmup/cooldown
    if (adherence >= 0.80) return 'Excellent';
    if (adherence >= 0.70) return 'Good';
    if (adherence >= 0.60) return 'Fair';
    if (adherence >= 0.45) return 'Poor';
    return 'Very Poor';
  }
  
  if (intervalType === 'interval' || intervalType === 'work') {
    // Stricter for intervals
    if (adherence >= 0.90) return 'Excellent';
    if (adherence >= 0.80) return 'Good';
    if (adherence >= 0.70) return 'Fair';
    if (adherence >= 0.55) return 'Poor';
    return 'Very Poor';
  }
  
  // Default thresholds
  if (adherence >= 0.85) return 'Excellent';
  if (adherence >= 0.75) return 'Good';
  if (adherence >= 0.65) return 'Fair';
  if (adherence >= 0.50) return 'Poor';
  return 'Very Poor';
}

/**
 * Get overall performance assessment based on adherence and patterns
 */
function getOverallPerformanceAssessment(overallAdherence: number, intervalAnalysis: IntervalAnalysis[]): string {
  // Base assessment on overall adherence
  let assessment = getPerformanceAssessment(overallAdherence, 'overall');
  
  // Adjust based on patterns
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work' || i.interval_type === 'interval');
  const workAdherence = workIntervals.length > 0 
    ? workIntervals.reduce((sum, i) => sum + i.adherence_percentage, 0) / workIntervals.length
    : overallAdherence;
  
  // Stricter assessment for work intervals
  if (workIntervals.length > 0 && workAdherence < 0.6) {
    assessment = 'Very Poor';
  } else if (workIntervals.length > 0 && workAdherence < 0.7) {
    assessment = 'Poor';
  }
  
  return assessment;
}

/**
 * Identify primary issues across all intervals
 */
function identifyPrimaryIssues(intervalAnalysis: IntervalAnalysis[]): string[] {
  const issues: string[] = [];
  
  if (intervalAnalysis.length === 0) {
    return ['No intervals analyzed'];
  }
  
  // Check for consistently too fast
  const tooFastIntervals = intervalAnalysis.filter(i => 
    i.average_value < i.prescribed_range.lower && i.adherence_percentage < 0.5
  );
  if (tooFastIntervals.length > intervalAnalysis.length / 2) {
    issues.push('Consistently too fast - adjust target pace');
  }
  
  // Check for consistently too slow
  const tooSlowIntervals = intervalAnalysis.filter(i => 
    i.average_value > i.prescribed_range.upper && i.adherence_percentage < 0.5
  );
  if (tooSlowIntervals.length > intervalAnalysis.length / 2) {
    issues.push('Consistently too slow - increase target pace');
  }
  
  // Check for fading in final intervals
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work' || i.interval_type === 'interval');
  if (workIntervals.length >= 3) {
    const lastThird = workIntervals.slice(-Math.floor(workIntervals.length / 3));
    const fadingCount = lastThird.filter(i => i.adherence_percentage < 0.6).length;
    if (fadingCount > lastThird.length / 2) {
      issues.push('Fading in final intervals - consider reducing target pace');
    }
  }
  
  // Check for poor recovery
  const recoveryIntervals = intervalAnalysis.filter(i => i.interval_type === 'recovery');
  if (recoveryIntervals.length > 0) {
    const avgRecoveryAdherence = recoveryIntervals.reduce((sum, i) => sum + i.adherence_percentage, 0) / recoveryIntervals.length;
    if (avgRecoveryAdherence < 0.5) {
      issues.push('Poor recovery discipline - slow down during recovery periods');
    }
  }
  
  return issues;
}

/**
 * Identify strengths in execution
 */
function identifyStrengths(intervalAnalysis: IntervalAnalysis[]): string[] {
  const strengths: string[] = [];
  
  if (intervalAnalysis.length === 0) {
    return [];
  }
  
  // Check for excellent overall adherence
  const excellentIntervals = intervalAnalysis.filter(i => i.adherence_percentage >= 0.9);
  if (excellentIntervals.length > intervalAnalysis.length / 2) {
    strengths.push('Excellent adherence to prescribed ranges');
  }
  
  // Check for strong finish
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work' || i.interval_type === 'interval');
  if (workIntervals.length >= 3) {
    const lastThird = workIntervals.slice(-Math.floor(workIntervals.length / 3));
    const strongFinishCount = lastThird.filter(i => i.adherence_percentage >= 0.8).length;
    if (strongFinishCount > lastThird.length / 2) {
      strengths.push('Strong finish - maintained pace through final intervals');
    }
  }
  
  // Check for consistent pacing
  const consistentIntervals = intervalAnalysis.filter(i => i.range_consistency < 0.1);
  if (consistentIntervals.length > intervalAnalysis.length / 2) {
    strengths.push('Consistent pacing within intervals');
  }
  
  return strengths;
}

/**
 * Generate detailed, chart-like analysis with specific metrics
 * Provides actionable insights similar to Garmin Connect analysis
 */
function generateDetailedChartAnalysis(sensorData: any[], intervals: any[], granularAnalysis: any): any {
  console.log('📊 Generating detailed chart analysis...');
  
  // Extract work intervals for detailed analysis
  const workIntervals = intervals.filter(i => i.role === 'work' && i.executed);
  const recoveryIntervals = intervals.filter(i => i.role === 'recovery' && i.executed);
  
  // Speed fluctuation analysis
  const speedAnalysis = analyzeSpeedFluctuations(sensorData, workIntervals);
  
  // Heart rate recovery analysis
  const hrRecoveryAnalysis = analyzeHeartRateRecovery(sensorData, workIntervals, recoveryIntervals);
  
  // Interval-by-interval breakdown
  const intervalBreakdown = generateIntervalBreakdown(workIntervals);
  
  // Pacing consistency analysis
  const pacingConsistency = analyzePacingConsistency(sensorData, workIntervals);
  
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
    }
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
 * Generate detailed interval-by-interval breakdown
 */
function generateIntervalBreakdown(workIntervals: any[]): any {
  if (workIntervals.length === 0) {
    return { available: false, message: 'No work intervals to analyze' };
  }
  
  const breakdown = workIntervals.map((interval, index) => {
    const plannedDuration = interval.planned?.duration_s || 0;
    const actualDuration = interval.duration_s || 0;
    const durationAdherence = plannedDuration > 0 ? (actualDuration / plannedDuration) * 100 : 0;
    
    // Calculate pace adherence
    const plannedPace = interval.planned?.target_pace_s_per_mi || 0;
    const actualPace = interval.executed?.avg_pace_s_per_mi || 0;
    const paceAdherence = plannedPace > 0 ? Math.max(0, 100 - Math.abs(actualPace - plannedPace) / plannedPace * 100) : 0;
    
    // Calculate overall performance score (percentage only)
    const overallScore = (durationAdherence + paceAdherence) / 2;
    
    return {
      interval_number: index + 1,
      planned_duration_s: plannedDuration,
      actual_duration_s: actualDuration,
      duration_adherence_percent: Math.round(durationAdherence),
      planned_pace_min_per_mi: plannedPace > 0 ? Math.round(plannedPace / 60 * 100) / 100 : 0,
      actual_pace_min_per_mi: actualPace > 0 ? Math.round(actualPace / 60 * 100) / 100 : 0,
      pace_adherence_percent: Math.round(paceAdherence),
      performance_score: Math.round(overallScore)
    };
  });
  
  return {
    available: true,
    intervals: breakdown,
    summary: {
      average_performance_score: Math.round(breakdown.reduce((sum, i) => sum + i.performance_score, 0) / breakdown.length),
      total_intervals: breakdown.length,
      high_performance_intervals: breakdown.filter(i => i.performance_score >= 90).length,
      good_performance_intervals: breakdown.filter(i => i.performance_score >= 80 && i.performance_score < 90).length,
      fair_performance_intervals: breakdown.filter(i => i.performance_score >= 70 && i.performance_score < 80).length,
      poor_performance_intervals: breakdown.filter(i => i.performance_score < 70).length
    }
  };
}

/**
 * Analyze pacing consistency across intervals
 */
function analyzePacingConsistency(sensorData: any[], workIntervals: any[]): any {
  if (workIntervals.length < 2) {
    return { available: false, message: 'Need at least 2 intervals for consistency analysis' };
  }
  
  // Calculate average pace for each interval
  const intervalPaces = workIntervals.map(interval => {
    const intervalSamples = sensorData.filter(s => 
      s.timestamp >= interval.start_time_s && s.timestamp <= interval.end_time_s
    );
    
    const paces = intervalSamples
      .filter(s => s.pace_s_per_mi && s.pace_s_per_mi > 0)
      .map(s => s.pace_s_per_mi / 60); // Convert to min/mi
    
    return paces.length > 0 ? paces.reduce((a, b) => a + b, 0) / paces.length : 0;
  }).filter(pace => pace > 0);
  
  if (intervalPaces.length < 2) {
    return { available: false, message: 'Insufficient pace data for consistency analysis' };
  }
  
  // Calculate consistency metrics
  const avgPace = intervalPaces.reduce((a, b) => a + b, 0) / intervalPaces.length;
  const variance = intervalPaces.reduce((sum, pace) => sum + Math.pow(pace - avgPace, 2), 0) / intervalPaces.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = (stdDev / avgPace) * 100;
  
  // Determine consistency level
  const consistencyLevel = coefficientOfVariation < 2 ? 'Excellent' :
                          coefficientOfVariation < 4 ? 'Good' :
                          coefficientOfVariation < 6 ? 'Fair' : 'Poor';
  
  return {
    available: true,
    average_pace_min_per_mi: Math.round(avgPace * 100) / 100,
    pace_std_dev_min_per_mi: Math.round(stdDev * 100) / 100,
    coefficient_of_variation_percent: Math.round(coefficientOfVariation * 10) / 10,
    consistency_level: consistencyLevel,
    consistency_score: Math.max(0, 100 - coefficientOfVariation * 10), // Higher is better
    interval_paces: intervalPaces.map(pace => Math.round(pace * 100) / 100)
  };
}

/**
 * Identify pace patterns (fading, surging, consistent)
 */
function identifyPacePatterns(paceData: any[], workIntervals: any[]): any {
  if (paceData.length === 0 || workIntervals.length < 2) {
    return { patterns: [], summary: 'Insufficient data for pattern analysis' };
  }
  
  const patterns = [];
  
  // Analyze pace trend across intervals
  const intervalAverages = workIntervals.map(interval => {
    const intervalSamples = paceData.filter(d => 
      d.time_s >= interval.start_time_s && d.time_s <= interval.end_time_s
    );
    return intervalSamples.length > 0 ? 
      intervalSamples.reduce((sum, d) => sum + d.pace_min_per_mi, 0) / intervalSamples.length : 0;
  }).filter(avg => avg > 0);
  
  if (intervalAverages.length >= 2) {
    // Check for fading pattern (getting slower)
    const firstHalf = intervalAverages.slice(0, Math.floor(intervalAverages.length / 2));
    const secondHalf = intervalAverages.slice(Math.floor(intervalAverages.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const paceDifference = secondHalfAvg - firstHalfAvg;
    
    if (paceDifference > 0.1) {
      patterns.push({
        type: 'fading',
        description: `Pace slowed by ${Math.round(paceDifference * 100) / 100} min/mi in later intervals`,
        severity: paceDifference > 0.3 ? 'high' : paceDifference > 0.2 ? 'medium' : 'low'
      });
    } else if (paceDifference < -0.1) {
      patterns.push({
        type: 'surging',
        description: `Pace improved by ${Math.round(Math.abs(paceDifference) * 100) / 100} min/mi in later intervals`,
        severity: Math.abs(paceDifference) > 0.3 ? 'high' : Math.abs(paceDifference) > 0.2 ? 'medium' : 'low'
      });
    } else {
      patterns.push({
        type: 'consistent',
        description: 'Pace remained consistent throughout workout',
        severity: 'low'
      });
    }
  }
  
  return {
    patterns: patterns,
    summary: patterns.length > 0 ? patterns[0].description : 'No clear patterns detected'
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
  detailedAnalysis: any
): Promise<string[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiKey) {
    console.warn('⚠️ OPENAI_API_KEY not set, skipping AI narrative generation');
    return null;
  }

  // Build context for AI
  const workoutContext = {
    type: workout.type,
    duration_minutes: Math.round((workout.moving_time || workout.duration) / 60),
    distance_miles: workout.computed?.overall?.distance_mi || 0,
    avg_pace_min_per_mi: workout.computed?.overall?.avg_pace_min_per_mi || 0,
    avg_heart_rate: workout.computed?.overall?.avg_heart_rate_bpm || 0,
    max_heart_rate: workout.computed?.overall?.max_heart_rate_bpm || 0,
    aerobic_training_effect: workout.garmin_data?.trainingEffect || null,
    anaerobic_training_effect: workout.garmin_data?.anaerobicTrainingEffect || null,
    performance_condition_start: workout.garmin_data?.performanceCondition || null,
    performance_condition_end: workout.garmin_data?.performanceConditionEnd || null,
    stamina_start: workout.garmin_data?.staminaStart || null,
    stamina_end: workout.garmin_data?.staminaEnd || null,
    exercise_load: workout.garmin_data?.activityTrainingLoad || null
  };

  const adherenceContext = {
    execution_adherence_pct: Math.round(performance.execution_adherence),
    pace_adherence_pct: Math.round(performance.pace_adherence),
    duration_adherence_pct: Math.round(performance.duration_adherence),
    hr_drift_bpm: granularAnalysis.heart_rate_analysis?.hr_drift_bpm || 0,
    pace_variability_pct: detailedAnalysis?.pacing_consistency?.pace_variability_percent || 0
  };

  const prompt = `You are analyzing a running workout. Generate 4-6 concise, data-driven observations based on the metrics below.

CRITICAL RULES:
- Write like "a chart in words" - factual observations only
- NO motivational language ("great job", "keep it up")
- NO subjective judgments ("slow", "bad", "should have")
- NO generic advice ("run more", "push harder")
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and time references
- Describe patterns visible in the data

Workout Profile:
- Type: ${workoutContext.type}
- Duration: ${workoutContext.duration_minutes} minutes
- Distance: ${workoutContext.distance_miles.toFixed(2)} miles
- Avg Pace: ${workoutContext.avg_pace_min_per_mi.toFixed(2)} min/mi
- Avg HR: ${workoutContext.avg_heart_rate} bpm (Max: ${workoutContext.max_heart_rate} bpm)
${workoutContext.aerobic_training_effect ? `- Aerobic TE: ${workoutContext.aerobic_training_effect} (Anaerobic: ${workoutContext.anaerobic_training_effect})` : ''}
${workoutContext.performance_condition_start !== null ? `- Performance Condition: ${workoutContext.performance_condition_start} → ${workoutContext.performance_condition_end} (${workoutContext.performance_condition_end - workoutContext.performance_condition_start} point change)` : ''}
${workoutContext.stamina_start !== null ? `- Stamina: ${workoutContext.stamina_start}% → ${workoutContext.stamina_end}% (${workoutContext.stamina_start - workoutContext.stamina_end}% depletion)` : ''}
${workoutContext.exercise_load ? `- Exercise Load: ${workoutContext.exercise_load}` : ''}

Adherence Metrics:
- Execution: ${adherenceContext.execution_adherence_pct}%
- Pace: ${adherenceContext.pace_adherence_pct}%
- Duration: ${adherenceContext.duration_adherence_pct}%
- HR Drift: ${adherenceContext.hr_drift_bpm} bpm
- Pace Variability: ${adherenceContext.pace_variability_pct}%

Generate 4-6 observations in this style:
"Maintained consistent pace averaging X:XX/mi throughout the Y-mile effort. Pace remained within X:XX-X:XX/mi range for Z% of the run."
"Heart rate averaged X bpm with gradual upward drift in the final Y minutes. HR peaked at Z bpm, suggesting accumulated fatigue."
"Performance Condition declined from +X to -Y, a Z-point drop over N minutes, consistent with tempo-intensity efforts."

Return ONLY a JSON array of strings, no other text:
["observation 1", "observation 2", ...]`;

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
    
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse JSON array from response
    const insights = JSON.parse(content);
    
    if (!Array.isArray(insights)) {
      throw new Error('AI response was not an array');
    }

    console.log(`✅ Generated ${insights.length} AI narrative insights`);
    return insights;

  } catch (error) {
    console.error('❌ AI narrative generation failed:', error);
    throw error;
  }
}
