/**
 * EDGE FUNCTION: calculate-workload
 * 
 * Calculates workload scores for individual workouts
 * Formula: workload = duration (hours) × intensity² × 100
 * 
 * Input: { workout_id, workout_data }
 * Output: { workload_planned, workload_actual, intensity_factor }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Intensity factors for workload calculation
const INTENSITY_FACTORS = {
  run: {
    easypace: 0.65,
    warmup_run_easy: 0.65,
    cooldown_easy: 0.65,
    longrun_easypace: 0.70,
    '5kpace_plus1:00': 0.85,
    '5kpace_plus0:50': 0.87,
    '5kpace_plus0:45': 0.88,
    '5kpace_plus0:35': 0.90,
    '5kpace': 0.95,
    '10kpace': 0.90,
    marathon_pace: 0.82,
    speed: 1.10,
    strides: 1.05,
    interval: 0.95,
    tempo: 0.88,
    cruise: 0.88
  },
  bike: {
    Z1: 0.55,
    recovery: 0.55,
    Z2: 0.70,
    endurance: 0.70,
    warmup_bike: 0.60,
    cooldown_bike: 0.60,
    tempo: 0.80,
    ss: 0.90,
    thr: 1.00,
    vo2: 1.15,
    anaerobic: 1.20,
    neuro: 1.10
  },
  swim: {
    warmup: 0.60,
    cooldown: 0.60,
    drill: 0.50,
    easy: 0.65,
    aerobic: 0.75,
    pull: 0.70,
    kick: 0.75,
    threshold: 0.95,
    interval: 1.00
  },
  strength: {
    '@pct60': 0.70,
    '@pct65': 0.75,
    '@pct70': 0.80,
    '@pct75': 0.85,
    '@pct80': 0.90,
    '@pct85': 0.95,
    '@pct90': 1.00,
    main_: 0.85,
    acc_: 0.70,
    core_: 0.60,
    bodyweight: 0.65
  }
}

interface WorkoutData {
  type: 'run' | 'bike' | 'swim' | 'strength' | 'mobility';
  duration: number; // minutes
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
}

/**
 * Calculate workload score for a workout
 * Formula: workload = duration (hours) × intensity² × 100
 */
function calculateWorkload(workout: WorkoutData): number {
  if (!workout.duration) return 0;
  
  const durationHours = workout.duration / 60;
  const intensity = getSessionIntensity(workout);
  
  return Math.round(durationHours * Math.pow(intensity, 2) * 100);
}

/**
 * Get average intensity for a workout session
 */
function getSessionIntensity(workout: WorkoutData): number {
  if (workout.type === 'strength' && workout.strength_exercises) {
    return getStrengthIntensity(workout.strength_exercises);
  }
  
  if (workout.type === 'mobility' && workout.mobility_exercises) {
    return getMobilityIntensity(workout.mobility_exercises);
  }
  
  if (workout.steps_preset && workout.steps_preset.length > 0) {
    return getStepsIntensity(workout.steps_preset, workout.type);
  }
  
  return 0.75; // default moderate intensity
}

/**
 * Get intensity from token steps
 */
function getStepsIntensity(steps: string[], type: string): number {
  const factors = INTENSITY_FACTORS[type as keyof typeof INTENSITY_FACTORS];
  if (!factors) return 0.75;
  
  const intensities: number[] = [];
  
  steps.forEach(token => {
    for (const [key, value] of Object.entries(factors)) {
      if (token.toLowerCase().includes(key.toLowerCase())) {
        intensities.push(value);
        break;
      }
    }
  });
  
  // Use max intensity - hard work dominates
  return intensities.length > 0 ? Math.max(...intensities) : 0.75;
}

/**
 * Get intensity for strength session
 */
function getStrengthIntensity(exercises: any[]): number {
  const intensities = exercises.map(ex => {
    let base = 0.75;
    
    // Duration-based exercises (planks, holds, carries) are moderate endurance work
    if (ex.duration_seconds && ex.duration_seconds > 0) {
      base = INTENSITY_FACTORS.strength.core_;
      // Longer holds are slightly more intense
      if (ex.duration_seconds > 90) base *= 1.05;
      return base;
    }
    
    // Rep-based exercises (traditional lifts)
    if (ex.weight && ex.weight.includes('% 1RM')) {
      const pct = parseInt(ex.weight);
      const roundedPct = Math.floor(pct / 5) * 5;
      const key = `@pct${roundedPct}` as keyof typeof INTENSITY_FACTORS.strength;
      base = INTENSITY_FACTORS.strength[key] || 0.75;
    } else if (ex.weight && ex.weight.toLowerCase().includes('bodyweight')) {
      base = INTENSITY_FACTORS.strength.bodyweight;
    }
    
    // Adjust by reps
    const reps = typeof ex.reps === 'number' ? ex.reps : 8;
    if (reps <= 5) base *= 1.05;
    else if (reps >= 13) base *= 0.90;
    
    return base;
  });
  
  return intensities.reduce((a, b) => a + b, 0) / intensities.length;
}

/**
 * Get intensity for mobility session
 */
function getMobilityIntensity(exercises: any[]): number {
  const completedCount = exercises.filter(ex => ex.completed).length;
  const totalCount = exercises.length;
  
  if (totalCount === 0) return 0.60;
  
  // Base mobility intensity
  const baseIntensity = 0.60;
  const completionRatio = completedCount / totalCount;
  
  // Slight increase based on completion rate
  return baseIntensity + (completionRatio * 0.1);
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

    if (!workout_data) {
      return new Response(
        JSON.stringify({ error: 'workout_data is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Calculate workload
    const workload = calculateWorkload(workout_data)
    const intensity = getSessionIntensity(workout_data)

    // Determine which table to update based on workout status
    const tableName = workout_data.workout_status === 'planned' ? 'planned_workouts' : 'workouts'
    
    // Update the workout in the database
    const { error } = await supabaseClient
      .from(tableName)
      .update({
        workload_planned: workout_data.workout_status === 'planned' ? workload : null,
        workload_actual: workout_data.workout_status === 'completed' ? workload : null,
        intensity_factor: intensity
      })
      .eq('id', workout_id)

    if (error) {
      console.error('Database update error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to update workout' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        workout_id,
        workload_planned: workout_data.workout_status === 'planned' ? workload : null,
        workload_actual: workout_data.workout_status === 'completed' ? workload : null,
        intensity_factor: intensity
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
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
