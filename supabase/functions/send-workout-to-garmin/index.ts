// Edge function: send-workout-to-garmin
// Exports a planned workout to Garmin Connect
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { recordProviderResult } from '../_shared/connection-health.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { convertWorkoutToGarmin, type PlannedWorkout } from '../_shared/garmin/convert-workout.ts'
import { applyGarminBaselines } from '../_shared/garmin/prepare.ts'
import { ensureValidGarminAccessToken, sendToGarmin, scheduleWorkoutOnDate } from '../_shared/garmin/training-api.ts'

serve(async (req) => {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: corsHeaders()
      })
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const { workoutId, userId } = await req.json()
    if (!workoutId || !userId) {
      return json({ error: 'Missing workoutId or userId' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch planned workout (strictly the owner's)
    const { data: workout, error: workoutError } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('id', workoutId)
      .eq('user_id', userId)
      .single<PlannedWorkout>()

    if (workoutError || !workout) {
      return json({ error: 'Workout not found' }, 404)
    }

    // Do not early-return if intervals are missing; we can build from structured/computed below

    // Fetch user's Garmin tokens
    const { data: conn, error: connErr } = await supabase
      .from('user_connections')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .single()

    if (connErr || !conn?.access_token) {
      return json({ error: 'Garmin connection not found' }, 400)
    }

    // Ensure token is fresh (refresh if expired or near-expiry)
    const accessToken = await ensureValidGarminAccessToken(supabase, userId, conn.access_token, conn.refresh_token, conn.expires_at)

    // Units + FTP onto the row before conversion (shared with the automatic calendar sync).
    const { data: ub } = await supabase
      .from('user_baselines')
      .select('units, performance_numbers, learned_fitness')
      .eq('user_id', userId)
      .maybeSingle()
    applyGarminBaselines(workout, ub)

    const garminPayload = convertWorkoutToGarmin(workout)
    try {
      const firstSeg = (garminPayload as any)?.segments?.[0]
      const steps = Array.isArray(firstSeg?.steps) ? firstSeg.steps : []
      const speedSteps = steps.filter((s: any) => s?.targetType === 'SPEED' && s?.type === 'WorkoutStep')
      console.log('SPEED steps for test:', speedSteps.map((s: any) => ({ stepId: s.stepId, targetValueLow: s.targetValueLow, targetValueHigh: s.targetValueHigh })))
      if ((garminPayload as any)?.sport === 'RUNNING' && speedSteps.length === 0) {
        console.log('RUNNING workout has no SPEED targets in steps (diagnostic)')
      }
    } catch {}

    let sendResult = await sendToGarmin(garminPayload, accessToken)
    // Connection health (§4): the push's answer, on the athlete's Garmin row (401/403 → needs_reauth).
    if (typeof sendResult.status === 'number') await recordProviderResult(supabase, { provider: 'garmin', userId, status: sendResult.status, error: sendResult.success ? null : sendResult.error ?? null })
    if (!sendResult.success) {
      // If validation guard triggered in convertWorkoutToGarmin
      if (String(sendResult.error||'').includes('RUN_EXPORT_MISSING_TARGETS')) {
        return json({ error: 'Workout requires per-rep run pace targets (materialize computed or provide paceTarget)' }, 422)
      }
      return json({ error: 'Failed to send to Garmin', details: sendResult.error }, 502)
    }

    // Try to schedule to user's Garmin Calendar on the workout date (best-effort)
    let scheduleResult: { success: boolean; scheduleId?: string; error?: string } | null = null
    if (workout.date) {
      scheduleResult = await scheduleWorkoutOnDate({
        garminWorkoutId: sendResult.workoutId!,
        date: workout.date,
        accessToken
      })
    }

    // Mark as sent and persist Garmin IDs for linking completed activities
    await supabase
      .from('planned_workouts')
      .update({
        workout_status: 'sent_to_garmin',
        garmin_workout_id: sendResult.workoutId,
        garmin_schedule_id: scheduleResult?.scheduleId ?? null,
        updated_at: new Date().toISOString()
      })
      .eq('id', workoutId)

    const debugOut: any = {}
    try {
      const sportDbg = (garminPayload as any)?.sport
      const rootLen = (garminPayload as any)?.poolLength
      const rootUnit = (garminPayload as any)?.poolLengthUnit
      const seg0 = (garminPayload as any)?.segments?.[0] || {}
      debugOut.pool = { pool_unit: (workout as any)?.pool_unit ?? null, pool_length_m: (workout as any)?.pool_length_m ?? null }
      debugOut.mapped = { sport: sportDbg, poolLength: rootLen ?? seg0?.poolLength ?? null, poolLengthUnit: rootUnit ?? seg0?.poolLengthUnit ?? null }
    } catch {}

    return json({ success: true, garminWorkoutId: sendResult.workoutId, scheduled: scheduleResult?.success ?? false, scheduleError: scheduleResult?.error, debug: debugOut })
  } catch (err: any) {
    return json({ error: 'Internal error', details: err?.message ?? String(err) }, 500)
  }
})

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Allow headers used by supabase-js when invoking functions
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Client-Info, x-client-info, X-Supabase-Authorization'
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  })
}
