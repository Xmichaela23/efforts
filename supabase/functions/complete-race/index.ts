// @ts-nocheck
/**
 * complete-race — record official race time (elapsed / chip), mark goal completed, end plan.
 *
 * POST { plan_id: string, workout_id?: string }
 * - Verifies plan belongs to the authenticated user and is active.
 * - Resolves race day from goal.target_date or plan.config.race_date.
 * - Picks workout: workout_id if valid, else best matching completed run on race day.
 * - actual_seconds: elapsed time first, then moving, then computed (see race-finish-seconds).
 * - goal: status=completed, current_value=actual_seconds (official result; target_time = goal clock unchanged).
 * - Ends plan via shared end-plan core (tombstone end_reason: race_completed).
 * - Invalidates coach_cache.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { actualFinishSecondsPreferElapsed } from '../_shared/race-finish-seconds.ts'
import { executeEndPlan } from '../_shared/end-plan-core.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as Record<string, string>

function normDate(s: string | null | undefined): string | null {
  if (!s) return null
  return String(s).slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const supabaseAnon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: authErr } = await supabaseAnon.auth.getUser()
    if (authErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const planId: string | null = body?.plan_id ? String(body.plan_id) : null
    const workoutIdOpt: string | null = body?.workout_id ? String(body.workout_id) : null

    if (!planId) {
      return new Response(JSON.stringify({ error: 'plan_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('id, user_id, status, goal_id, config, name, duration_weeks')
      .eq('id', planId)
      .maybeSingle()
    if (planErr) throw planErr
    if (!plan || String(plan.user_id) !== String(userId)) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    if (String(plan.status) !== 'active') {
      return new Response(JSON.stringify({ error: 'Plan is not active' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    if (!plan.goal_id) {
      return new Response(JSON.stringify({ error: 'Plan has no linked goal' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const { data: goal, error: gErr } = await supabase
      .from('goals')
      .select('id, name, user_id, status, goal_type, target_date, target_time, sport, training_prefs')
      .eq('id', plan.goal_id)
      .maybeSingle()
    if (gErr) throw gErr
    if (!goal || String(goal.user_id) !== String(userId)) {
      return new Response(JSON.stringify({ error: 'Goal not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    if (String(goal.status) !== 'active') {
      return new Response(JSON.stringify({ error: 'Goal is not active' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    if (String(goal.goal_type) !== 'event') {
      return new Response(JSON.stringify({ error: 'Only event goals can be completed as a race' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const cfg: Record<string, unknown> = (plan.config || {}) as Record<string, unknown>
    const raceDate =
      normDate(goal.target_date as string | null) ||
      normDate(cfg.race_date as string | null) ||
      normDate((cfg as { raceDate?: string }).raceDate)

    if (!raceDate) {
      return new Response(JSON.stringify({ error: 'No race date on goal or plan' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const { data: wrows, error: wErr } = await supabase
      .from('workouts')
      .select('id, date, type, workout_status, moving_time, elapsed_time, duration, computed, name')
      .eq('user_id', userId)
      .eq('date', raceDate)
      .eq('workout_status', 'completed')
    if (wErr) throw wErr
    const rows = Array.isArray(wrows) ? wrows : []

    let pick: (typeof rows)[0] | null = null
    if (workoutIdOpt) {
      pick = rows.find((r) => String(r.id) === workoutIdOpt) || null
      if (!pick) {
        const { data: one } = await supabase
          .from('workouts')
          .select('id, date, type, workout_status, moving_time, elapsed_time, duration, computed, name')
          .eq('user_id', userId)
          .eq('id', workoutIdOpt)
          .eq('workout_status', 'completed')
          .maybeSingle()
        if (one && normDate((one as { date?: string }).date) === raceDate) pick = one as (typeof rows)[0]
      }
    }
    if (!pick) {
      const runish = (t: string) => {
        const x = (t || '').toLowerCase()
        return x === 'run' || x === 'running' || !x
      }
      const runs = rows.filter((r) => runish(String((r as { type?: string }).type || '')))
      if (runs.length === 1) {
        pick = runs[0]
      } else if (runs.length > 1) {
        // Prefer longest by distance in computed
        const dist = (r: (typeof rows)[0]) => {
          const m = Number((r as { computed?: { overall?: { distance_m?: number } } })?.computed?.overall?.distance_m)
          return Number.isFinite(m) && m > 0 ? m : 0
        }
        pick = runs.reduce((a, b) => (dist(a) >= dist(b) ? a : b))
      }
    }
    if (!pick) {
      return new Response(
        JSON.stringify({ error: `No completed run found on ${raceDate}. Log your race, then try again (or pass workout_id).` }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }

    const actualSeconds = actualFinishSecondsPreferElapsed(pick as any)
    if (actualSeconds == null || !Number.isFinite(actualSeconds) || actualSeconds <= 0) {
      return new Response(JSON.stringify({ error: 'Could not read finish time (elapsed/moving) from workout' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const trainingPrefs = (typeof goal.training_prefs === 'object' && goal.training_prefs) ? (goal.training_prefs as Record<string, unknown>) : {}
    const nextPrefs = {
      ...trainingPrefs,
      race_result: {
        workout_id: String(pick.id),
        actual_seconds: actualSeconds,
        time_source: 'elapsed_preferred',
        completed_at: new Date().toISOString(),
        plan_id: String(planId),
      },
    }

    const { error: uErr } = await supabase
      .from('goals')
      .update({
        status: 'completed',
        current_value: actualSeconds,
        training_prefs: nextPrefs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', goal.id)
      .eq('user_id', userId)
    if (uErr) throw uErr

    const { deleted_count, tombstone } = await executeEndPlan(supabase, planId, 'race_completed')

    try {
      await supabase
        .from('coach_cache')
        .update({ invalidated_at: new Date().toISOString() })
        .eq('user_id', userId)
    } catch (e) {
      console.warn('[complete-race] coach_cache invalidate', e)
    }

    return new Response(
      JSON.stringify({
        success: true,
        goal_id: goal.id,
        plan_id: planId,
        workout_id: String(pick.id),
        actual_seconds: actualSeconds,
        deleted_planned_future: deleted_count,
        tombstone,
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[complete-race]', e)
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
