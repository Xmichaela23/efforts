/**
 * EDGE FUNCTION: sweep-user-history
 * 
 * Calculates workload for all existing workouts in a user's history
 * Processes workouts in batches with progress tracking
 * 
 * Input: { user_id, batch_size, dry_run }
 * Output: { processed, updated, errors, duration_ms }
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
  id: string;
  type: string;
  duration: number;
  workout_status?: string;
  strength_exercises?: any[];
  mobility_exercises?: any[];
  steps_preset?: any[];
  source?: string;
}

/**
 * Calculate workload score for a workout
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
  // Handle strength exercises from both tables
  if (workout.type === 'strength' && workout.strength_exercises) {
    return getStrengthIntensity(workout.strength_exercises);
  }
  
  // Handle mobility exercises (only in planned_workouts)
  if (workout.type === 'mobility' && workout.mobility_exercises) {
    return getMobilityIntensity(workout.mobility_exercises);
  }
  
  // Handle steps preset (only in planned_workouts)
  if (workout.steps_preset && workout.steps_preset.length > 0) {
    return getStepsIntensity(workout.steps_preset, workout.type);
  }
  
  // Fallback to basic intensity based on workout type
  const typeIntensities: { [key: string]: number } = {
    'run': 0.75,
    'ride': 0.70,
    'bike': 0.70,
    'swim': 0.80,
    'strength': 0.85,
    'mobility': 0.50,
    'walk': 0.40
  };
  
  return typeIntensities[workout.type] || 0.75;
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
  
  return intensities.length > 0 ? Math.max(...intensities) : 0.75;
}

/**
 * Get intensity for strength session
 */
function getStrengthIntensity(exercises: any[]): number {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return 0.75; // Default intensity if no exercises
  }
  
  const intensities = exercises.map(ex => {
    let base = 0.75;
    
    if (ex.weight && String(ex.weight).includes('% 1RM')) {
      const pct = parseInt(String(ex.weight));
      const roundedPct = Math.floor(pct / 5) * 5;
      const key = `@pct${roundedPct}` as keyof typeof INTENSITY_FACTORS.strength;
      base = INTENSITY_FACTORS.strength[key] || 0.75;
    } else if (ex.weight && String(ex.weight).toLowerCase().includes('bodyweight')) {
      base = INTENSITY_FACTORS.strength.bodyweight;
    }
    
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
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return 0.60; // Default intensity if no exercises
  }
  
  const completedCount = exercises.filter(ex => ex.completed).length;
  const totalCount = exercises.length;
  
  if (totalCount === 0) return 0.60;
  
  const baseIntensity = 0.60;
  const completionRatio = completedCount / totalCount;
  
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

    const { user_id, batch_size = 100, dry_run = false } = await req.json()
    
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          } 
        }
      )
    }

    // Initialize Supabase client with service role key for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const startTime = Date.now()
    let processed = 0
    let updated = 0
    let errors = 0
    let offset = 0

    console.log(`Starting workload sweep for user ${user_id}, batch_size: ${batch_size}, dry_run: ${dry_run}`)

    while (true) {
      // Fetch batch of workouts from both tables
      const { data: completedWorkouts, error: completedError } = await supabaseClient
        .from('workouts')
        .select('id, type, duration, workout_status, strength_exercises')
        .eq('user_id', user_id)
        .range(offset, offset + batch_size - 1)
        .order('created_at', { ascending: true })

      if (completedError) {
        console.error('Fetch error for completed workouts:', completedError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to fetch completed workouts', 
            details: completedError.message,
            user_id: user_id,
            offset: offset
          }),
          { 
            status: 500, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            } 
          }
        )
      }

      const { data: plannedWorkouts, error: plannedError } = await supabaseClient
        .from('planned_workouts')
        .select('id, type, duration, workout_status, strength_exercises, steps_preset, mobility_exercises')
        .eq('user_id', user_id)
        .range(offset, offset + batch_size - 1)
        .order('created_at', { ascending: true })

      if (plannedError) {
        console.error('Fetch error for planned workouts:', plannedError)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to fetch planned workouts', 
            details: plannedError.message,
            user_id: user_id,
            offset: offset
          }),
          { 
            status: 500, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            } 
          }
        )
      }

      // Combine both datasets
      const workouts = [
        ...(completedWorkouts || []).map(w => ({ ...w, source: 'completed' })),
        ...(plannedWorkouts || []).map(w => ({ ...w, source: 'planned' }))
      ]


      if (!workouts || workouts.length === 0) {
        break // No more workouts to process
      }

      console.log(`Processing batch: ${workouts.length} workouts (offset: ${offset})`)

      // Process each workout in the batch
      for (const workout of workouts) {
        try {
          processed++
          
          const workload = calculateWorkload(workout)
          const intensity = getSessionIntensity(workout)
          
          if (!dry_run) {
            // Update the appropriate table based on source
            const tableName = workout.source === 'completed' ? 'workouts' : 'planned_workouts';
            const { error: updateError } = await supabaseClient
              .from(tableName)
              .update({
                workload_planned: workout.workout_status === 'planned' ? workload : null,
                workload_actual: workout.workout_status === 'completed' ? workload : null,
                intensity_factor: intensity
              })
              .eq('id', workout.id)

            if (updateError) {
              console.error(`Update error for workout ${workout.id}:`, updateError)
              errors++
            } else {
              updated++
            }
          } else {
            // Dry run - just count what would be updated
            updated++
          }

          // Log progress every 50 workouts
          if (processed % 50 === 0) {
            console.log(`Processed ${processed} workouts, updated ${updated}, errors ${errors}`)
          }

        } catch (error) {
          console.error(`Error processing workout ${workout.id}:`, error)
          errors++
        }
      }

      offset += batch_size

      // Add a small delay between batches to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const duration = Date.now() - startTime

    console.log(`Sweep completed: processed ${processed}, updated ${updated}, errors ${errors}, duration ${duration}ms`)


    return new Response(
      JSON.stringify({
        success: true,
        processed,
        updated,
        errors,
        duration_ms: duration,
        dry_run
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
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        } 
      }
    )
  }
})
