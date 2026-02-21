/**
 * Diagnostic script to analyze strength workout workload calculation
 * 
 * Run this to check a specific strength workout and diagnose workload calculation issues
 * 
 * Usage: deno run --allow-net --allow-env diagnose-strength-workload.ts <workout_id>
 * Or: deno run --allow-net --allow-env diagnose-strength-workload.ts <date> <type>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  Deno.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Intensity factors (matching calculate-workload)
const INTENSITY_FACTORS = {
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

function getStrengthIntensity(exercises: any[]): number {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return 0.75
  }
  
  const intensities = exercises.map(ex => {
    let base = 0.75
    
    // Duration-based exercises (planks, holds, carries)
    if (ex.duration_seconds && ex.duration_seconds > 0) {
      base = INTENSITY_FACTORS.strength.core_
      if (ex.duration_seconds > 90) base *= 1.05
      return base
    }
    
    // Rep-based exercises (traditional lifts)
    if (ex.weight && String(ex.weight).includes('% 1RM')) {
      const pct = parseInt(String(ex.weight))
      const roundedPct = Math.floor(pct / 5) * 5
      const key = `@pct${roundedPct}` as keyof typeof INTENSITY_FACTORS.strength
      base = INTENSITY_FACTORS.strength[key] || 0.75
    } else if (ex.weight && String(ex.weight).toLowerCase().includes('bodyweight')) {
      base = INTENSITY_FACTORS.strength.bodyweight
    }
    
    // Adjust by reps
    const reps = typeof ex.reps === 'number' ? ex.reps : 8
    if (reps <= 5) base *= 1.05
    else if (reps >= 13) base *= 0.90
    
    return base
  })
  
  return intensities.reduce((a, b) => a + b, 0) / intensities.length
}

function calculateWorkload(duration: number, intensity: number): number {
  if (!duration) return 0
  const durationHours = duration / 60
  return Math.round(durationHours * Math.pow(intensity, 2) * 100)
}

async function diagnoseWorkout(workoutId?: string, date?: string, type?: string) {
  try {
    let query = supabase
      .from('workouts')
      .select('id, name, type, date, duration, strength_exercises, workload_actual, workload_planned, intensity_factor, workout_status')
      .eq('type', type || 'strength')
    
    if (workoutId) {
      query = query.eq('id', workoutId)
    } else if (date) {
      query = query.eq('date', date)
    } else {
      // Default: Monday 11/24/2025
      query = query.eq('date', '2025-11-24')
    }
    
    const { data, error } = await query.order('date', { ascending: false }).limit(10)
    
    if (error) {
      console.error('❌ Error querying workouts:', error)
      return
    }
    
    if (!data || data.length === 0) {
      console.log('❌ No workouts found')
      return
    }
    
    console.log(`\n📊 Found ${data.length} workout(s)\n`)
    
    for (const workout of data) {
      console.log('='.repeat(80))
      console.log(`Workout ID: ${workout.id}`)
      console.log(`Name: ${workout.name || 'N/A'}`)
      console.log(`Type: ${workout.type}`)
      console.log(`Date: ${workout.date}`)
      console.log(`Status: ${workout.workout_status}`)
      console.log(`Duration: ${workout.duration} minutes`)
      console.log(`Current workload_actual: ${workout.workload_actual || 'NULL'}`)
      console.log(`Current workload_planned: ${workout.workload_planned || 'NULL'}`)
      console.log(`Current intensity_factor: ${workout.intensity_factor || 'NULL'}`)
      console.log('')
      
      // Parse strength_exercises
      let strengthExercises: any[] = []
      try {
        if (typeof workout.strength_exercises === 'string') {
          strengthExercises = JSON.parse(workout.strength_exercises)
        } else if (Array.isArray(workout.strength_exercises)) {
          strengthExercises = workout.strength_exercises
        }
      } catch (e) {
        console.error('⚠️ Error parsing strength_exercises:', e)
      }
      
      console.log(`📋 Strength Exercises (${strengthExercises.length}):`)
      if (strengthExercises.length === 0) {
        console.log('  ⚠️ NO EXERCISES FOUND - This is the problem!')
      } else {
        strengthExercises.forEach((ex, idx) => {
          console.log(`  ${idx + 1}. ${ex.name || 'Unnamed'}`)
          console.log(`     Sets: ${ex.sets || 'N/A'}`)
          console.log(`     Reps: ${ex.reps || 'N/A'}`)
          console.log(`     Weight: ${ex.weight || 'N/A'}`)
          console.log(`     Duration (seconds): ${ex.duration_seconds || 'N/A'}`)
          
          // Calculate intensity for this exercise
          let exIntensity = 0.75
          if (ex.duration_seconds && ex.duration_seconds > 0) {
            exIntensity = INTENSITY_FACTORS.strength.core_
            if (ex.duration_seconds > 90) exIntensity *= 1.05
          } else if (ex.weight && String(ex.weight).includes('% 1RM')) {
            const pct = parseInt(String(ex.weight))
            const roundedPct = Math.floor(pct / 5) * 5
            const key = `@pct${roundedPct}` as keyof typeof INTENSITY_FACTORS.strength
            exIntensity = INTENSITY_FACTORS.strength[key] || 0.75
          } else if (ex.weight && String(ex.weight).toLowerCase().includes('bodyweight')) {
            exIntensity = INTENSITY_FACTORS.strength.bodyweight
          }
          
          const reps = typeof ex.reps === 'number' ? ex.reps : 8
          if (reps <= 5) exIntensity *= 1.05
          else if (reps >= 13) exIntensity *= 0.90
          
          console.log(`     Calculated Intensity: ${exIntensity.toFixed(3)}`)
          console.log('')
        })
      }
      
      // Calculate intensity
      const calculatedIntensity = getStrengthIntensity(strengthExercises)
      console.log(`🎯 Calculated Session Intensity: ${calculatedIntensity.toFixed(3)}`)
      
      // Calculate workload
      const calculatedWorkload = calculateWorkload(workout.duration || 0, calculatedIntensity)
      console.log(`💪 Calculated Workload: ${calculatedWorkload}`)
      console.log(`   Formula: (${workout.duration || 0} / 60) × ${calculatedIntensity.toFixed(3)}² × 100`)
      console.log(`   = ${((workout.duration || 0) / 60).toFixed(2)} × ${(calculatedIntensity ** 2).toFixed(3)} × 100`)
      console.log(`   = ${calculatedWorkload}`)
      
      // Compare
      if (workout.workload_actual !== null) {
        const diff = calculatedWorkload - workout.workload_actual
        console.log(`\n📊 Comparison:`)
        console.log(`   Current workload_actual: ${workout.workload_actual}`)
        console.log(`   Calculated workload: ${calculatedWorkload}`)
        console.log(`   Difference: ${diff > 0 ? '+' : ''}${diff}`)
        
        if (Math.abs(diff) > 5) {
          console.log(`   ⚠️ SIGNIFICANT DIFFERENCE DETECTED!`)
        }
      }
      
      console.log('')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Parse command line arguments
const args = Deno.args
if (args.length === 0) {
  // Default: Use the specific workout ID
  console.log('🔍 Diagnosing workout ID: e77dba2c-c902-46bb-990d-ebe42a28151d\n')
  await diagnoseWorkout('e77dba2c-c902-46bb-990d-ebe42a28151d')
} else if (args.length === 1) {
  // Assume it's a workout ID
  console.log(`🔍 Diagnosing workout ID: ${args[0]}\n`)
  await diagnoseWorkout(args[0])
} else if (args.length === 2) {
  // Date and type
  console.log(`🔍 Diagnosing ${args[1]} workout on ${args[0]}\n`)
  await diagnoseWorkout(undefined, args[0], args[1])
} else {
  console.log('Usage:')
  console.log('  deno run --allow-net --allow-env diagnose-strength-workload.ts')
  console.log('  deno run --allow-net --allow-env diagnose-strength-workload.ts <workout_id>')
  console.log('  deno run --allow-net --allow-env diagnose-strength-workload.ts <date> <type>')
  console.log('\nExample:')
  console.log('  deno run --allow-net --allow-env diagnose-strength-workload.ts e77dba2c-c902-46bb-990d-ebe42a28151d')
}

