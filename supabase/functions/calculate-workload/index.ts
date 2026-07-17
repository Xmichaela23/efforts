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
import { resolveUser } from '../_shared/require-user.ts'
import {
  getDefaultIntensityForType,
  getStepsIntensity,
  mapRPEToIntensity,
  getStrengthIntensity,
  calculateStrengthWorkload,
  getMobilityIntensity,
  calculateMobilityWorkload,
  calculatePilatesYogaWorkload,
  inferIntensityFromPerformance,
  calculateDurationWorkload,
  classifyWorkloadMethod,
} from '../_shared/workload.ts'
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts'
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts'

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
  threshold_heart_rate?: number; // bpm (LTHR, for HR-vs-threshold intensity + zones)
  max_heart_rate?: number; // bpm (sensor max; zones)
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

  // D-238: no TRIMP/resting-HR path. Cardio load flows through getSessionIntensity, which is
  // output-first (power/pace → HR%LTHR → sRPE → duration default) via inferIntensityFromPerformance.
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
    const inferred = inferIntensityFromPerformance({
      type: workout.type,
      avgHr: workout.avg_heart_rate,
      thresholdHr: workout.threshold_heart_rate,
      avgPower: workout.avg_power,
      ftp: workout.functional_threshold_power,
      avgPace: workout.avg_pace,
    });
    if (inferred > 0) return inferred;
    // sRPE (D-237): no HR/power/pace, but a logged RPE → RPE-derived intensity (session-RPE
    // is a field-standard load proxy, r≈0.68–0.74) instead of the flat default. Kept on the
    // same intensity² scale via mapRPEToIntensity so ACWR stays comparable. The flat default
    // is reserved for the double-missing (no HR AND no RPE) case.
    const rpe = sessionRPE ?? (workout.workout_metadata || {}).session_rpe;
    if (typeof rpe === 'number' && rpe >= 1 && rpe <= 10) return mapRPEToIntensity(rpe);
  }
  return getDefaultIntensityForType(workout.type);
}

// (D-238) The cardio performance-inference logic now lives in the shared
// inferIntensityFromPerformance (_shared/workload.ts), output-first and resting-HR-free.

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

    // B1: caller identity — a human's JWT or an internal caller's service key (ingest/sweep). Identity only;
    // the DB client below stays pure service-role, so the internal (robot) path is unchanged. The human path
    // gains an ownership check after the workout is loaded.
    const { userId: callerUserId, isService } = await resolveUser(req)

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
    
    // B1 ownership guard: a human caller may only compute their OWN workout (internal service callers are
    // trusted — they legitimately act on any user during ingest/sweep). userId here is the workout's owner.
    if (!isService && userId && String(userId) !== String(callerUserId)) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    // Fetch user's FTP, threshold HR, max HR, resting HR from user_baselines (including learned_fitness)
    let userFtp: number | null = null;
    let userThresholdHr: number | null = null;
    let runThresholdHr: number | null = null;
    // D-lthr-one-anchor (audit 2026-07-17): captured to resolve the RUN threshold through the ONE resolver
    // after both baseline blocks (learned + manual live in sibling blocks below).
    let lthrLearnedObj: any = null;
    let lthrPerfObj: any = null;
    let rideThresholdHr: number | null = null;
    let runMaxHr: number | null = null;
    let rideMaxHr: number | null = null;
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
          
          lthrLearnedObj = learned;
          // Run threshold HR from learned data (superseded by the resolver after both blocks — kept so
          // ride/max reads below are unaffected).
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
          
        }

        // Priority 2: Use manual performance_numbers (fallback)
        if (baseline?.performance_numbers) {
          const perfNumbers = typeof baseline.performance_numbers === 'string'
            ? JSON.parse(baseline.performance_numbers)
            : baseline.performance_numbers;
          // FTP resolved via shared precedence helper: learned (≥medium confidence) wins,
          // else manual, else learned-low. Permissive — workload computation benefits
          // from any non-null FTP. See src/lib/resolve-current-ftp.ts for full semantics.
          const ftpResolved = resolveCurrentFtp({
            learned_fitness: learned,
            performance_numbers: perfNumbers,
          });
          if (ftpResolved.value) {
            userFtp = ftpResolved.value;
          }
          
          lthrPerfObj = perfNumbers;
          // Manual threshold HR as fallback
          if (perfNumbers?.thresholdHeartRate || perfNumbers?.threshold_heart_rate) {
            userThresholdHr = Number(perfNumbers.thresholdHeartRate || perfNumbers.threshold_heart_rate);
          }
          
          // Manual max HR (fallback for TRIMP)
          if (!runMaxHr && (perfNumbers?.maxHeartRate || perfNumbers?.max_heart_rate)) {
            runMaxHr = Number(perfNumbers.maxHeartRate || perfNumbers.max_heart_rate);
            rideMaxHr = runMaxHr; // Use same for ride if not learned
          }
        }
      } catch {}
    }

    // D-lthr-one-anchor (audit 2026-07-17): resolve the RUN threshold HR through the ONE resolver
    // (learned-first, sample_count-gated, honours the athlete's choice) — the SAME bpm the zone bins,
    // easy band and coach use. Unconditional: it must also NULL OUT a zero-sample learned LTHR the old
    // ungated read would have accepted. The device-first reconciliation below still wins with the
    // workout's own threshold_heart_rate column. Byte-identical for a learned athlete with >0 samples.
    runThresholdHr = resolveCurrentLthr({ learned_fitness: lthrLearnedObj, performance_numbers: lthrPerfObj }).bpm;

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

    // D-237: classify HOW this workload was derived so an ESTIMATED load (default
    // intensity / assumed resting HR) is distinguishable from a MEASURED one. Persisted
    // below into workout_metadata; the ACWR receipt discloses when a window is meaningfully
    // estimated. noPerformanceInference = cardio had no output/threshold signal (D-238:
    // output-first ladder, no resting-HR TRIMP), so it fell to sRPE or the duration default.
    const _wt = String(finalWorkoutData.type || '').toLowerCase()
    const _isCardio = _wt === 'run' || _wt === 'ride' || _wt === 'bike' || _wt === 'swim'
    const _rpeVal = sessionRPE ?? (finalWorkoutData.workout_metadata || {}).session_rpe
    const noPerformanceInference = _isCardio && inferIntensityFromPerformance({
      type: _wt,
      avgHr: finalWorkoutData.avg_heart_rate,
      thresholdHr: finalWorkoutData.threshold_heart_rate,
      avgPower: finalWorkoutData.avg_power,
      ftp: finalWorkoutData.functional_threshold_power,
      avgPace: finalWorkoutData.avg_pace,
    }) === 0
    const rpeAvailable = typeof _rpeVal === 'number' && _rpeVal >= 1 && _rpeVal <= 10
    const { method: workloadMethodClassified, estimated: workloadEstimated } = classifyWorkloadMethod({
      type: _wt,
      hasAvgHr: Boolean(finalWorkoutData.avg_heart_rate),
      hasThresholdHr: Boolean(finalWorkoutData.threshold_heart_rate),
      hasFtp: Boolean(finalWorkoutData.functional_threshold_power),
      hasAvgPower: Boolean(finalWorkoutData.avg_power),
      hasStepsPreset: Boolean(finalWorkoutData.steps_preset?.length),
      noPerformanceInference,
      rpeAvailable,
    })
    
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
    
    // Update the workout in the database. For completed workouts, co-locate the load
    // provenance in workout_metadata (D-237) — merged, never clobbering existing keys —
    // so the value that feeds ACWR (workload_actual) carries whether it was estimated.
    const updatePayload: Record<string, any> = {
      workload_planned: workoutStatus === 'planned' ? workload : null,
      workload_actual: workoutStatus === 'completed' ? workload : null,
      intensity_factor: intensity,
    }
    if (workoutStatus === 'completed') {
      // Merge into the SAFELY-PARSED metadata (workoutMetadata may be a raw JSON string).
      updatePayload.workout_metadata = {
        ...parsedMetadata,
        workload_method: workloadMethodClassified,
        workload_estimated: workloadEstimated,
      }
    }
    const { error } = await supabaseClient
      .from(tableName)
      .update(updatePayload)
      .eq('id', workout_id)

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to update workout' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // (Old inline debug workload-method block removed — superseded by the persisted
    //  classifyWorkloadMethod result above, which also distinguishes estimated cases.)
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
        avg_power: finalWorkoutData?.avg_power,
        avg_heart_rate: finalWorkoutData?.avg_heart_rate,
        threshold_heart_rate: finalWorkoutData?.threshold_heart_rate,
        max_heart_rate: finalWorkoutData?.max_heart_rate,
        workload_method: workloadMethodClassified,
        workload_estimated: workloadEstimated
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
    const status = (error as any)?.status ?? 500
    return new Response(
      JSON.stringify({ error: status === 401 ? 'unauthorized' : 'Internal server error' }),
      { status, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
