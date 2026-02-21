/**
 * EDGE FUNCTION: calculate-workload
 * 
 * SMART SERVER: Calculates workload scores for individual workouts server-side
 * 
 * Formulas:
 * - Strength: workload = volume_factor × intensity² × 100 (volume-based, uses RIR)
 * - Mobility: exercise-based, ~1 point per exercise, capped at 30 (no duration)
 * - Pilates/Yoga: duration (minutes) × RPE
 * - Other: workload = duration (hours) × intensity² × 100 (duration-based)
 * 
 * Input: { workout_id, workout_data? }
 *   - workout_id: Required
 *   - workout_data: Optional - if not provided, fetches from database (smart server)
 * 
 * Output: { workload_planned, workload_actual, intensity_factor }
 * 
 * Architecture: Smart Server, Dumb Client
 * - All calculations happen server-side
 * - Client only passes workout_id (or workout_data for efficiency)
 * - Server fetches data if needed and does all math
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getDefaultIntensityForType,
  getStepsIntensity,
  mapRPEToIntensity,
  getStrengthIntensity,
  calculateStrengthWorkload,
  getMobilityIntensity,
  calculateMobilityWorkload,
  calculatePilatesYogaWorkload,
  calculateTRIMPWorkload,
  calculateDurationWorkload,
} from '../_shared/workload.ts'

interface WorkoutData {
  type: 'run' | 'bike' | 'swim' | 'strength' | 'mobility';
  duration: number; // minutes (elapsed time)
  moving_time?: number; // minutes (moving time - prefer for run/bike/swim)
  steps_preset?: string[];
  strength_exercises?: Array<{
    name: string;
    sets: number;
    reps?: number | string;
    duration_seconds?: number; // For duration-based exercises like planks, holds, carries
    weight?: string;
  }>;
  mobility_exercises?: Array<{
    name: string;
    completed: boolean;
  }>;
  // Performance data for intensity inference
  avg_pace?: number; // seconds per km or seconds per mile
  avg_power?: number; // watts (cycling)
  avg_heart_rate?: number; // bpm
  functional_threshold_power?: number; // watts (for cycling intensity zones)
  threshold_heart_rate?: number; // bpm (for HR zones)
  max_heart_rate?: number; // bpm (for TRIMP calculation)
  resting_heart_rate?: number; // bpm (for TRIMP calculation)
  workout_metadata?: any; // Unified metadata: { session_rpe?, notes?, readiness? }
}

/**
 * Orchestrates workload calculation for a single workout.
 * Pure math lives in _shared/workload.ts; this function adds:
 *   - Performance inference (HR/power/pace → intensity) which needs full workout data
 *   - TRIMP routing for cardio with HR
 */
function calculateWorkload(workout: WorkoutData, sessionRPE?: number): number {
  if (workout.type === 'strength' && workout.strength_exercises && workout.strength_exercises.length > 0) {
    return calculateStrengthWorkload(workout.strength_exercises, sessionRPE);
  }

  if (workout.type === 'mobility') {
    return calculateMobilityWorkload(workout.mobility_exercises ?? []);
  }

  if (workout.type === 'pilates_yoga') {
    const metadata = workout.workout_metadata || {};
    const rpe = sessionRPE || metadata.session_rpe;
    return calculatePilatesYogaWorkload(workout.duration, typeof rpe === 'number' ? rpe : undefined);
  }

  const isCardio = workout.type === 'run' || workout.type === 'ride' || workout.type === 'bike' || workout.type === 'swim';

  if (isCardio && workout.avg_heart_rate && workout.max_heart_rate) {
    let durationMinutes = workout.duration;
    if (workout.moving_time && workout.moving_time > 0) durationMinutes = workout.moving_time;
    const trimpResult = calculateTRIMPWorkload({
      avgHR: workout.avg_heart_rate,
      maxHR: workout.max_heart_rate,
      restingHR: workout.resting_heart_rate,
      thresholdHR: workout.threshold_heart_rate,
      durationMinutes,
    });
    if (trimpResult !== null && trimpResult > 0) return trimpResult;
  }

  let effectiveDuration = workout.duration;
  if (isCardio && workout.moving_time && workout.moving_time > 0) {
    effectiveDuration = workout.moving_time;
  }
  if (!effectiveDuration) return 0;

  const intensity = getSessionIntensity(workout, sessionRPE);
  return calculateDurationWorkload(effectiveDuration, intensity);
}

/**
 * Resolve intensity for a workout.
 * Strength/mobility/pilates_yoga delegate to shared helpers.
 * Cardio adds performance-inference (HR, power, pace) that only this function has.
 */
function getSessionIntensity(workout: WorkoutData, sessionRPE?: number): number {
  if (workout.type === 'strength' && workout.strength_exercises) {
    return getStrengthIntensity(workout.strength_exercises, sessionRPE);
  }
  if (workout.type === 'pilates_yoga') {
    const metadata = workout.workout_metadata || {};
    const rpe = sessionRPE || metadata.session_rpe;
    return (typeof rpe === 'number' && rpe >= 1 && rpe <= 10) ? mapRPEToIntensity(rpe) : 0.75;
  }
  if (workout.type === 'mobility' && workout.mobility_exercises) {
    return getMobilityIntensity(workout.mobility_exercises);
  }
  if (workout.steps_preset && workout.steps_preset.length > 0) {
    return getStepsIntensity(workout.steps_preset, workout.type);
  }
  if (workout.type === 'run' || workout.type === 'ride' || workout.type === 'bike' || workout.type === 'swim') {
    const inferred = inferIntensityFromPerformance(workout);
    if (inferred > 0) return inferred;
  }
  return getDefaultIntensityForType(workout.type);
}

/**
 * Infer intensity from actual performance metrics (freeform workouts).
 * This is the only logic unique to calculate-workload (not shared)
 * because get-week doesn't have HR/power/pace data.
 */
function inferIntensityFromPerformance(workout: WorkoutData): number {
  if (workout.type === 'run') {
    if (workout.avg_heart_rate && workout.threshold_heart_rate) {
      const hrPercent = workout.avg_heart_rate / workout.threshold_heart_rate;
      if (hrPercent >= 1.05) return 1.10;
      if (hrPercent >= 0.95) return 1.00;
      if (hrPercent >= 0.88) return 0.88;
      if (hrPercent >= 0.80) return 0.80;
      if (hrPercent >= 0.70) return 0.70;
      return 0.60;
    }
    return 0;
  }

  if ((workout.type === 'ride' || workout.type === 'bike') && workout.avg_power && workout.functional_threshold_power) {
    const ifactor = workout.avg_power / workout.functional_threshold_power;
    if (ifactor >= 1.05) return 1.15;
    if (ifactor >= 0.95) return 1.00;
    if (ifactor >= 0.85) return 0.90;
    if (ifactor >= 0.75) return 0.80;
    if (ifactor >= 0.60) return 0.70;
    if (ifactor >= 0.55) return 0.65;
    return 0.55;
  }

  if ((workout.type === 'ride' || workout.type === 'bike') && workout.avg_heart_rate && workout.threshold_heart_rate) {
    const hrPercent = workout.avg_heart_rate / workout.threshold_heart_rate;
    if (hrPercent >= 0.95) return 1.00;
    if (hrPercent >= 0.90) return 0.90;
    if (hrPercent >= 0.85) return 0.80;
    if (hrPercent >= 0.75) return 0.70;
    return 0.60;
  }

  if (workout.type === 'ride' || workout.type === 'bike') return 0;

  if (workout.type === 'swim' && workout.avg_pace) {
    const paceMinPer100m = workout.avg_pace / 60;
    if (paceMinPer100m < 1.5) return 1.00;
    if (paceMinPer100m < 2.0) return 0.95;
    if (paceMinPer100m < 2.5) return 0.85;
    if (paceMinPer100m < 3.0) return 0.75;
    return 0.65;
  }

  return 0;
}

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { 
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        } 
      })
    }

    const { workout_id, workout_data } = await req.json()
    
    if (!workout_id) {
      return new Response(
        JSON.stringify({ error: 'workout_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // SMART SERVER: Always fetch workout_metadata from database (client doesn't pass it)
    // Also fetch full workout data if not provided
    let finalWorkoutData = workout_data;
    let workoutStatus = workout_data?.workout_status;
    let workoutMetadata: any = null;
    
    // Always fetch workout_metadata and user_id from database (even if workout_data is provided)
    // This ensures we get Session RPE for strength workouts and can fetch user's FTP
    let userId: string | null = null;
    
    const { data: dbWorkout, error: dbError } = await supabaseClient
      .from('workouts')
      .select('workout_status, workout_metadata, user_id')
      .eq('id', workout_id)
      .single()
    
    if (!dbError && dbWorkout) {
      workoutStatus = workoutStatus || dbWorkout.workout_status || 'completed';
      workoutMetadata = dbWorkout.workout_metadata;
      userId = dbWorkout.user_id;
    } else {
      // Try planned_workouts table
      const { data: plannedWorkout, error: plannedError } = await supabaseClient
        .from('planned_workouts')
        .select('workout_status, workout_metadata, user_id')
        .eq('id', workout_id)
        .single()
      
      if (!plannedError && plannedWorkout) {
        workoutStatus = workoutStatus || plannedWorkout.workout_status || 'planned';
        workoutMetadata = plannedWorkout.workout_metadata;
        userId = plannedWorkout.user_id;
      }
    }
    
    // Fetch user's FTP, threshold HR, max HR, resting HR from user_baselines (including learned_fitness)
    let userFtp: number | null = null;
    let userThresholdHr: number | null = null;
    let runThresholdHr: number | null = null;
    let rideThresholdHr: number | null = null;
    let runMaxHr: number | null = null;
    let rideMaxHr: number | null = null;
    let restingHr: number | null = null;
    if (userId) {
      try {
        const { data: baseline } = await supabaseClient
          .from('user_baselines')
          .select('performance_numbers, learned_fitness')
          .eq('user_id', userId)
          .maybeSingle();
        
        // Priority 1: Use learned_fitness thresholds (more accurate, data-driven)
        if (baseline?.learned_fitness) {
          const learned = typeof baseline.learned_fitness === 'string' 
            ? JSON.parse(baseline.learned_fitness) 
            : baseline.learned_fitness;
          
          // Run threshold HR from learned data
          if (learned?.run_threshold_hr?.value) {
            runThresholdHr = Number(learned.run_threshold_hr.value);
          }
          
          // Run max HR from learned data (for TRIMP)
          if (learned?.run_max_hr_observed?.value) {
            runMaxHr = Number(learned.run_max_hr_observed.value);
          }
          
          // Ride threshold HR from learned data
          if (learned?.ride_threshold_hr?.value) {
            rideThresholdHr = Number(learned.ride_threshold_hr.value);
          }
          
          // Ride max HR from learned data (for TRIMP)
          if (learned?.ride_max_hr_observed?.value) {
            rideMaxHr = Number(learned.ride_max_hr_observed.value);
          }
          
          // FTP from learned data (if available)
          if (learned?.ride_ftp_estimated?.value) {
            userFtp = Number(learned.ride_ftp_estimated.value);
          }
        }
        
        // Priority 2: Use manual performance_numbers (fallback)
        if (baseline?.performance_numbers) {
          const perfNumbers = typeof baseline.performance_numbers === 'string' 
            ? JSON.parse(baseline.performance_numbers) 
            : baseline.performance_numbers;
          
          // Only use manual FTP if we don't have learned FTP
          if (!userFtp && perfNumbers?.ftp) {
            userFtp = Number(perfNumbers.ftp);
          }
          
          // Manual threshold HR as fallback
          if (perfNumbers?.thresholdHeartRate || perfNumbers?.threshold_heart_rate) {
            userThresholdHr = Number(perfNumbers.thresholdHeartRate || perfNumbers.threshold_heart_rate);
          }
          
          // Manual max HR (fallback for TRIMP)
          if (!runMaxHr && (perfNumbers?.maxHeartRate || perfNumbers?.max_heart_rate)) {
            runMaxHr = Number(perfNumbers.maxHeartRate || perfNumbers.max_heart_rate);
            rideMaxHr = runMaxHr; // Use same for ride if not learned
          }
          
          // Resting HR (for TRIMP calculation)
          if (perfNumbers?.restingHeartRate || perfNumbers?.resting_heart_rate) {
            restingHr = Number(perfNumbers.restingHeartRate || perfNumbers.resting_heart_rate);
          }
        }
      } catch {}
    }
    
    // If workout_data not provided, fetch full workout data
    if (!finalWorkoutData) {
      const { data: workout, error: workoutError } = await supabaseClient
        .from('workouts')
        .select('type, duration, strength_exercises, mobility_exercises, workout_status, moving_time, avg_pace, avg_power, avg_heart_rate, max_heart_rate, functional_threshold_power, threshold_heart_rate')
        .eq('id', workout_id)
        .single()
      
      if (workoutError) {
        // Try planned_workouts table
        const { data: plannedWorkout, error: plannedError } = await supabaseClient
          .from('planned_workouts')
          .select('type, duration, strength_exercises, mobility_exercises, steps_preset, workout_status, moving_time')
          .eq('id', workout_id)
          .single()
        
        if (plannedError) {
          return new Response(
            JSON.stringify({ error: 'Workout not found and workout_data not provided' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          )
        }
        
        finalWorkoutData = plannedWorkout;
        workoutStatus = workoutStatus || plannedWorkout.workout_status || 'planned';
      } else {
        finalWorkoutData = workout;
        workoutStatus = workoutStatus || workout.workout_status || 'completed';
      }
    } else {
      workoutStatus = workoutStatus || workout_data.workout_status || 'completed';
    }
    
    // Parse strength_exercises if it's a string (JSONB from database can be stringified)
    // This MUST happen before any debug logging or calculation
    // Handle multiple cases: string, double-encoded string, or already an array
    if (finalWorkoutData.strength_exercises !== null && finalWorkoutData.strength_exercises !== undefined) {
      let exercises = finalWorkoutData.strength_exercises;
      
      // If it's a string, try to parse it (may need multiple passes for double-encoded JSONB)
      if (typeof exercises === 'string') {
        try {
          exercises = JSON.parse(exercises);
          
          if (typeof exercises === 'string') {
            exercises = JSON.parse(exercises);
          }
          
          if (Array.isArray(exercises)) {
            finalWorkoutData.strength_exercises = exercises;
          } else {
            finalWorkoutData.strength_exercises = [];
          }
        } catch (e) {
          finalWorkoutData.strength_exercises = [];
        }
      } else if (!Array.isArray(exercises)) {
        finalWorkoutData.strength_exercises = [];
      }
      // If it's already an array, leave it as-is
    }
    
    // Parse mobility_exercises if it's a string
    if (finalWorkoutData.mobility_exercises) {
      if (typeof finalWorkoutData.mobility_exercises === 'string') {
        try {
          const parsed = JSON.parse(finalWorkoutData.mobility_exercises);
          finalWorkoutData.mobility_exercises = parsed;
        } catch (e) {
          finalWorkoutData.mobility_exercises = [];
        }
      } else if (!Array.isArray(finalWorkoutData.mobility_exercises)) {
        finalWorkoutData.mobility_exercises = [];
      }
    }
    
    // Inject user's FTP and threshold HR into workout data if not already present
    // This allows power/HR-based intensity calculation for Strava/Garmin imports
    // Use sport-specific learned thresholds when available
    if (userFtp && !finalWorkoutData.functional_threshold_power) {
      finalWorkoutData.functional_threshold_power = userFtp;
    }
    
    // Inject sport-specific threshold HR
    const workoutType = finalWorkoutData.type?.toLowerCase() || '';
    if (!finalWorkoutData.threshold_heart_rate) {
      if ((workoutType === 'run') && runThresholdHr) {
        finalWorkoutData.threshold_heart_rate = runThresholdHr;
      } else if ((workoutType === 'ride' || workoutType === 'bike') && rideThresholdHr) {
        finalWorkoutData.threshold_heart_rate = rideThresholdHr;
      } else if (userThresholdHr) {
        finalWorkoutData.threshold_heart_rate = userThresholdHr;
      }
    }
    
    // Inject max HR for TRIMP calculation (sport-specific)
    if (!finalWorkoutData.max_heart_rate) {
      if ((workoutType === 'run') && runMaxHr) {
        finalWorkoutData.max_heart_rate = runMaxHr;
      } else if ((workoutType === 'ride' || workoutType === 'bike') && rideMaxHr) {
        finalWorkoutData.max_heart_rate = rideMaxHr;
      } else if (runMaxHr) {
        finalWorkoutData.max_heart_rate = runMaxHr;
      }
    }
    
    // Inject resting HR for TRIMP calculation
    if (!finalWorkoutData.resting_heart_rate && restingHr) {
      finalWorkoutData.resting_heart_rate = restingHr;
    }
    
    // Parse workout_metadata if it's a string (JSONB from database)
    let parsedMetadata: any = {};
    if (workoutMetadata) {
      try {
        if (typeof workoutMetadata === 'string') {
          parsedMetadata = JSON.parse(workoutMetadata);
        } else if (typeof workoutMetadata === 'object') {
          parsedMetadata = workoutMetadata;
        }
      } catch {}
    }
    
    // Add metadata to finalWorkoutData for use in calculations
    if (Object.keys(parsedMetadata).length > 0) {
      finalWorkoutData.workout_metadata = parsedMetadata;
    }

    // Ensure workout_status is set
    if (!workoutStatus) {
      workoutStatus = 'completed'; // Default
    }

    // Extract session RPE from metadata (for strength and pilates_yoga workouts)
    // Runs/rides/swims don't use RPE - they use performance-based intensity
    const sessionRPE = (finalWorkoutData.type === 'strength' || finalWorkoutData.type === 'pilates_yoga') && parsedMetadata?.session_rpe 
      ? parsedMetadata.session_rpe 
      : undefined;
    
    // Calculate workload (all math happens server-side)
    const workload = calculateWorkload(finalWorkoutData, sessionRPE)
    const intensity = getSessionIntensity(finalWorkoutData, sessionRPE)
    
    // If workout is attached to a planned workout, fetch planned workload for comparison
    let plannedWorkload = null;
    if (workoutStatus === 'completed') {
      const { data: completedWorkout } = await supabaseClient
        .from('workouts')
        .select('planned_id')
        .eq('id', workout_id)
        .single()
      
      if (completedWorkout?.planned_id) {
        const { data: planned } = await supabaseClient
          .from('planned_workouts')
          .select('workload_planned')
          .eq('id', completedWorkout.planned_id)
          .single()
        
        if (planned?.workload_planned) {
          plannedWorkload = planned.workload_planned;
        }
      }
    }

    // Determine which table to update based on workout status
    const tableName = workoutStatus === 'planned' ? 'planned_workouts' : 'workouts'
    
    // Update the workout in the database
    const { error } = await supabaseClient
      .from(tableName)
      .update({
        workload_planned: workoutStatus === 'planned' ? workload : null,
        workload_actual: workoutStatus === 'completed' ? workload : null,
        intensity_factor: intensity
      })
      .eq('id', workout_id)

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to update workout' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Determine which workload method was used for debug info
    let workloadMethod = 'duration_intensity';
    const wType = finalWorkoutData?.type?.toLowerCase() || '';
    const isCardio = wType === 'run' || wType === 'ride' || wType === 'bike' || wType === 'swim';
    
    // Check if TRIMP was used (cardio with HR + max HR)
    if (isCardio && finalWorkoutData?.avg_heart_rate && finalWorkoutData?.max_heart_rate) {
      workloadMethod = 'trimp_hr_based';
    } else if (wType === 'strength') {
      workloadMethod = 'volume_based';
    } else if ((wType === 'run') && finalWorkoutData?.avg_heart_rate && finalWorkoutData?.threshold_heart_rate) {
      workloadMethod = 'hr_intensity';
    } else if ((wType === 'ride' || wType === 'bike') && userFtp && finalWorkoutData?.avg_power) {
      workloadMethod = 'power_intensity';
    } else if (finalWorkoutData?.steps_preset?.length > 0) {
      workloadMethod = 'steps_preset';
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        workout_id,
        workload_planned: workoutStatus === 'planned' ? workload : null,
        workload_actual: workoutStatus === 'completed' ? workload : null,
        intensity_factor: intensity,
        planned_workload: plannedWorkload, // For comparison when attached
        workload_difference: plannedWorkload !== null ? workload - plannedWorkload : null,
        // Debug info for workload calculation
        user_ftp: userFtp,
        run_threshold_hr: runThresholdHr,
        ride_threshold_hr: rideThresholdHr,
        run_max_hr: runMaxHr,
        ride_max_hr: rideMaxHr,
        resting_hr: restingHr,
        avg_power: finalWorkoutData?.avg_power,
        avg_heart_rate: finalWorkoutData?.avg_heart_rate,
        threshold_heart_rate: finalWorkoutData?.threshold_heart_rate,
        max_heart_rate: finalWorkoutData?.max_heart_rate,
        workload_method: workloadMethod
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
