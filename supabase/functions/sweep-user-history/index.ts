/**
 * EDGE FUNCTION: sweep-user-history
 * 
 * Recalculates workload for all existing workouts in a user's history
 * Uses the calculate-workload edge function for TRIMP-based calculation
 * Processes workouts in batches with progress tracking
 * 
 * Input: { user_id, batch_size, dry_run }
 * Output: { processed, updated, errors, duration_ms }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    const { user_id, batch_size = 50, dry_run = false } = await req.json()
    
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Initialize Supabase client with service role key for database operations
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey)

    const startTime = Date.now()
    let processed = 0
    let updated = 0
    let errors = 0
    let skipped = 0

    console.log(`[sweep] Starting for user ${user_id}, batch_size: ${batch_size}, dry_run: ${dry_run}`)

    // Fetch ALL completed workouts for this user (not paginated - we need full history for ACWR)
    const { data: completedWorkouts, error: completedError } = await supabaseClient
      .from('workouts')
      .select('id, name, type, date, workout_status, workload_actual, avg_heart_rate')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .order('date', { ascending: false })

    if (completedError) {
      console.error('[sweep] Fetch error:', completedError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch workouts', details: completedError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const totalWorkouts = completedWorkouts?.length || 0
    console.log(`[sweep] Found ${totalWorkouts} completed workouts`)

    // Filter to workouts that need recalculation:
    // - NULL workload
    // - workload = 1 (broken calculation)
    // - Has HR data (should use TRIMP)
    const needsRecalc = completedWorkouts?.filter(w => 
      w.workload_actual === null || 
      w.workload_actual === 1 ||
      (w.avg_heart_rate && w.avg_heart_rate > 0)
    ) || []

    console.log(`[sweep] ${needsRecalc.length} workouts need recalculation`)

    if (dry_run) {
      // Dry run - just report what would be updated
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          total_workouts: totalWorkouts,
          would_process: needsRecalc.length,
          sample: needsRecalc.slice(0, 5).map(w => ({
            id: w.id,
            name: w.name,
            date: w.date,
            current_workload: w.workload_actual,
            has_hr: !!w.avg_heart_rate
          }))
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process in batches to avoid timeout
    const CONCURRENT_BATCH = 5 // Process 5 at a time within each batch
    
    for (let i = 0; i < needsRecalc.length; i += batch_size) {
      const batch = needsRecalc.slice(i, i + batch_size)
      console.log(`[sweep] Processing batch ${i / batch_size + 1}: ${batch.length} workouts`)

      // Process batch with limited concurrency
      for (let j = 0; j < batch.length; j += CONCURRENT_BATCH) {
        const concurrent = batch.slice(j, j + CONCURRENT_BATCH)
        
        const results = await Promise.allSettled(
          concurrent.map(async (workout) => {
            try {
              // Call calculate-workload edge function
              const response = await fetch(`${supabaseUrl}/functions/v1/calculate-workload`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({ workout_id: workout.id })
              })

              if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 100)}`)
              }

              return { success: true, workout_id: workout.id }
            } catch (error) {
              return { success: false, workout_id: workout.id, error: error.message }
            }
          })
        )

        // Tally results
        for (const result of results) {
          processed++
          if (result.status === 'fulfilled' && result.value.success) {
            updated++
          } else {
            errors++
            const err = result.status === 'fulfilled' ? result.value.error : result.reason
            console.error(`[sweep] Error processing workout:`, err)
          }
        }
      }

      // Log progress
      console.log(`[sweep] Progress: ${processed}/${needsRecalc.length} (${updated} ok, ${errors} failed)`)

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    const duration = Date.now() - startTime

    console.log(`[sweep] Complete: processed ${processed}, updated ${updated}, errors ${errors}, ${duration}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        total_workouts: totalWorkouts,
        needed_recalc: needsRecalc.length,
        processed,
        updated,
        errors,
        skipped,
        duration_ms: duration,
        dry_run: false
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[sweep] Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
