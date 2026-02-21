/**
 * Script to recalculate workload for strength workouts that have workload_actual = 0 or null
 * 
 * Usage: 
 *   deno run --allow-net --allow-env recalculate-strength-workloads.ts [user_id]
 *   deno run --allow-net --allow-env recalculate-strength-workloads.ts [user_id] [workout_id1] [workout_id2] ...
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  Deno.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const userId = Deno.args[0]
const specificWorkoutIds = Deno.args.slice(1)

if (!userId) {
  console.error('❌ Usage: deno run --allow-net --allow-env recalculate-strength-workloads.ts <user_id> [workout_id1] [workout_id2] ...')
  Deno.exit(1)
}

let workouts: any[] = []

if (specificWorkoutIds.length > 0) {
  // Recalculate specific workouts
  console.log(`🔍 Fetching specific workouts: ${specificWorkoutIds.join(', ')}...`)
  const { data, error } = await supabase
    .from('workouts')
    .select('id, type, date, name, strength_exercises, workload_actual')
    .eq('user_id', userId)
    .in('id', specificWorkoutIds)
  
  if (error) {
    console.error('❌ Error fetching workouts:', error)
    Deno.exit(1)
  }
  
  workouts = data || []
} else {
  // Find all strength workouts with missing or zero workload
  console.log(`🔍 Finding strength workouts with workload_actual = 0 or null for user ${userId}...`)
  const { data, error } = await supabase
    .from('workouts')
    .select('id, type, date, name, strength_exercises, workload_actual')
    .eq('user_id', userId)
    .eq('type', 'strength')
    .eq('workout_status', 'completed')
    .or('workload_actual.is.null,workload_actual.eq.0')
    .order('date', { ascending: false })

  if (error) {
    console.error('❌ Error fetching workouts:', error)
    Deno.exit(1)
  }
  
  workouts = data || []
}

if (workouts.length === 0) {
  console.log('✅ No strength workouts found with missing workload')
  Deno.exit(0)
}

console.log(`📊 Found ${workouts.length} strength workouts to recalculate`)

let successCount = 0
let errorCount = 0

for (const workout of workouts) {
  console.log(`\n💪 Processing: ${workout.name || workout.id} (${workout.date})`)
  
  // Parse strength_exercises if it's a string
  let exercises = workout.strength_exercises
  if (typeof exercises === 'string') {
    try {
      exercises = JSON.parse(exercises)
      console.log(`   📝 Parsed strength_exercises from string`)
    } catch (e) {
      console.log(`   ⚠️  Failed to parse strength_exercises: ${e.message}`)
      exercises = []
    }
  }
  
  console.log(`   Exercises: ${Array.isArray(exercises) ? exercises.length : 0}`)
  
  try {
    // Call calculate-workload function - just pass workout_id, let it fetch from DB
    const response = await fetch(`${SUPABASE_URL}/functions/v1/calculate-workload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({
        workout_id: workout.id
        // Don't pass workout_data - let it fetch from DB so parsing happens
      })
    })

    const result = await response.json()
    
    if (response.ok && result.workload_actual !== undefined) {
      console.log(`   ✅ Recalculated: workload_actual = ${result.workload_actual}`)
      successCount++
    } else {
      console.log(`   ⚠️  Result: ${JSON.stringify(result)}`)
      errorCount++
    }
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`)
    errorCount++
  }
  
  // Small delay to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 500))
}

console.log(`\n📊 Summary:`)
console.log(`   ✅ Success: ${successCount}`)
console.log(`   ❌ Errors: ${errorCount}`)
console.log(`   📝 Total: ${workouts.length}`)
