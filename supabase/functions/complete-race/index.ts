// @ts-nocheck
/**
 * complete-race — record a race result on its goal, from the workout that matched the race.
 *
 * POST { plan_id?: string, goal_id?: string, workout_id?: string, manual_elapsed_seconds?: number }
 * - One of plan_id / goal_id. ⛔ goal_id (2026-09-10): the Goals screen used to find the race workout
 *   itself and write the result straight to the goal when a goal had no plan or no run on race day. The
 *   phone no longer writes a result; it asks here.
 * - Verifies the plan / goal belongs to the authenticated user.
 * - Resolves race day from goal.target_date or plan.config.race_date.
 * - Picks workout: workout_id if valid, else the longest completed session of the GOAL'S SPORT on race day
 *   (run when the sport is unknown, as before).
 * - manual_elapsed_seconds: the finish time the athlete typed when no workout was logged. Saved as typed.
 * - actual_seconds: elapsed time first, then moving, then computed (see race-finish-seconds).
 * - goal: status=completed, current_value=actual_seconds (official result; target_time = goal clock unchanged).
 * - plan_id: ends that plan via shared end-plan core (tombstone end_reason: race_completed), as before.
 *   goal_id: ends the plan linked to this goal (plans.goal_id) only when it is still active or paused.
 *   ⛔ Never by name: the Goals screen matched plans by name and could end an unrelated one.
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

/** Which workout types count as the race for this goal's sport. Unknown sport → run, as before. */
function typeMatchesGoalSport(goalSport: unknown): (t: string) => boolean {
  const s = String(goalSport || '').toLowerCase()
  if (s === 'ride' || s.startsWith('bike') || s.includes('cycl')) {
    return (t) => ['ride', 'bike', 'cycling'].includes((t || '').toLowerCase())
  }
  if (s.startsWith('swim')) {
    return (t) => ['swim', 'swimming'].includes((t || '').toLowerCase())
  }
  return (t) => {
    const x = (t || '').toLowerCase()
    return x === 'run' || x === 'running' || !x
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  const bad = (error: string, status = 400) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return bad('Authorization required', 401)

    const supabaseAnon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: authErr } = await supabaseAnon.auth.getUser()
    if (authErr || !userData?.user?.id) return bad('Invalid session', 401)
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    const planId: string | null = body?.plan_id ? String(body.plan_id) : null
    const goalIdIn: string | null = body?.goal_id ? String(body.goal_id) : null
    const workoutIdOpt: string | null = body?.workout_id ? String(body.workout_id) : null
    const manualSecondsIn = Number(body?.manual_elapsed_seconds)
    const manualSeconds = Number.isFinite(manualSecondsIn) && manualSecondsIn > 0 ? Math.round(manualSecondsIn) : null

    if (!planId && !goalIdIn) return bad('plan_id or goal_id required')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // ── The plan (given, or the one linked to the goal) and the goal ─────────────────────────────
    let plan: any = null
    let goalId: string | null = goalIdIn
    if (planId) {
      const { data: p, error: planErr } = await supabase
        .from('plans')
        .select('id, user_id, status, goal_id, config, name, duration_weeks')
        .eq('id', planId)
        .maybeSingle()
      if (planErr) throw planErr
      if (!p || String(p.user_id) !== String(userId)) return bad('Plan not found', 404)
      if (!['active', 'paused', 'completed', 'ended'].includes(String(p.status))) {
        return bad(`Plan status ${p.status} cannot be completed as a race`)
      }
      if (!p.goal_id) return bad('Plan has no linked goal')
      plan = p
      goalId = String(p.goal_id)
    } else {
      const { data: linked, error: linkErr } = await supabase
        .from('plans')
        .select('id, user_id, status, goal_id, config, name, duration_weeks')
        .eq('user_id', userId)
        .eq('goal_id', goalIdIn)
        .in('status', ['active', 'paused', 'completed', 'ended'])
        .order('created_at', { ascending: false })
        .limit(1)
      if (linkErr) throw linkErr
      plan = Array.isArray(linked) && linked.length ? linked[0] : null
    }

    const { data: goal, error: gErr } = await supabase
      .from('goals')
      .select('id, name, user_id, status, goal_type, target_date, target_time, current_value, sport, training_prefs')
      .eq('id', goalId)
      .maybeSingle()
    if (gErr) throw gErr
    if (!goal || String(goal.user_id) !== String(userId)) return bad('Goal not found', 404)
    if (!['active', 'paused', 'cancelled', 'completed'].includes(String(goal.status))) {
      return bad(`Goal status ${goal.status} cannot be completed as a race`)
    }
    if (String(goal.goal_type) !== 'event') return bad('Only event goals can be completed as a race')

    const cfg: Record<string, unknown> = (plan?.config || {}) as Record<string, unknown>
    const raceDate =
      normDate(goal.target_date as string | null) ||
      normDate(cfg.race_date as string | null) ||
      normDate((cfg as { raceDate?: string }).raceDate)

    // ── The result: the athlete's typed time, or the workout that matched the race ───────────────
    let pick: any = null
    let actualSeconds: number | null = null
    if (manualSeconds != null) {
      actualSeconds = manualSeconds
    } else {
      if (!raceDate) return bad('No race date on goal or plan')
      const matches = typeMatchesGoalSport(goal.sport)

      const { data: wrows, error: wErr } = await supabase
        .from('workouts')
        .select('id, date, type, workout_status, moving_time, elapsed_time, duration, computed, name')
        .eq('user_id', userId)
        .eq('date', raceDate)
        .eq('workout_status', 'completed')
      if (wErr) throw wErr
      const rows = Array.isArray(wrows) ? wrows : []

      if (workoutIdOpt) {
        pick = rows.find((r) => String(r.id) === workoutIdOpt) || null
        if (!pick) {
          const { data: one, error: oneErr } = await supabase
            .from('workouts')
            .select('id, user_id, date, type, workout_status, moving_time, elapsed_time, duration, computed, name')
            .eq('user_id', userId)
            .eq('id', workoutIdOpt)
            .eq('workout_status', 'completed')
            .maybeSingle()
          if (oneErr) throw oneErr
          // If the client sent workout_id, use that activity (date on goal/plan can disagree with the log by a day or TZ).
          if (one && matches(String((one as { type?: string }).type || ''))) pick = one
        }
      }
      if (!pick) {
        const same = rows.filter((r) => matches(String((r as { type?: string }).type || '')))
        if (same.length === 1) {
          pick = same[0]
        } else if (same.length > 1) {
          // Prefer longest by distance in computed
          const dist = (r: any) => {
            const m = Number(r?.computed?.overall?.distance_m)
            return Number.isFinite(m) && m > 0 ? m : 0
          }
          pick = same.reduce((a, b) => (dist(a) >= dist(b) ? a : b))
        }
      }
      if (!pick) {
        const noun = String(goal.sport || '').toLowerCase().startsWith('swim') ? 'swim'
          : /ride|bike|cycl/.test(String(goal.sport || '').toLowerCase()) ? 'ride' : 'run'
        return bad(`No completed ${noun} found on ${raceDate}. Log your race, then try again (or pass workout_id).`)
      }
      actualSeconds = actualFinishSecondsPreferElapsed(pick)
      if (actualSeconds == null || !Number.isFinite(actualSeconds) || actualSeconds <= 0) {
        return bad('Could not read finish time (elapsed/moving) from workout')
      }
    }

    const trainingPrefs = (typeof goal.training_prefs === 'object' && goal.training_prefs) ? (goal.training_prefs as Record<string, unknown>) : {}

    // Snapshot the course-model projection at race time. Read BEFORE we invalidate
    // coach_cache below so the value reflects pre-race-result fitness, not the
    // recomputed projection that would include the race result itself.
    let projectedSecondsAtRace: number | null = null
    let projectedSource: string | null = null
    try {
      const { data: cacheRow } = await supabase
        .from('coach_cache')
        .select('payload')
        .eq('user_id', userId)
        .maybeSingle()
      const rfp = (cacheRow?.payload as { race_finish_projection_v1?: { goal_id?: string | null; fitness_projection_seconds?: number | null } } | null)?.race_finish_projection_v1
      const matchesGoal = rfp && (!rfp.goal_id || String(rfp.goal_id) === String(goal.id))
      const fps = matchesGoal ? Number(rfp?.fitness_projection_seconds) : NaN
      if (Number.isFinite(fps) && fps > 0) {
        projectedSecondsAtRace = Math.round(fps)
        projectedSource = 'coach_cache.race_finish_projection_v1'
      }
    } catch (e) {
      console.warn('[complete-race] projection snapshot read failed (non-fatal)', e)
    }

    const nextPrefs = {
      ...trainingPrefs,
      ...(manualSeconds != null ? { manual_athletic_record: true } : {}),
      race_result: {
        ...(pick ? { workout_id: String(pick.id) } : {}),
        actual_seconds: actualSeconds,
        time_source: manualSeconds != null ? 'manual_elapsed' : 'elapsed_preferred',
        completed_at: new Date().toISOString(),
        ...(plan ? { plan_id: String(plan.id) } : {}),
        // Course-model projection captured at race time. Coach surfaces this on
        // last_completed_race.projected_seconds so State can render actual / goal /
        // projection together. Survives later loss of race_courses or coach_cache.
        ...(projectedSecondsAtRace != null
          ? {
              projected_seconds: projectedSecondsAtRace,
              projected_seconds_source: projectedSource,
              projected_seconds_recorded_at: new Date().toISOString(),
            }
          : {}),
      },
    }

    const goalPatch: Record<string, unknown> = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_value: actualSeconds,
      training_prefs: nextPrefs,
      updated_at: new Date().toISOString(),
    }
    let { error: uErr } = await supabase.from('goals').update(goalPatch).eq('id', goal.id).eq('user_id', userId)
    /**
     * ⚠️ `goals.completed_at` IS NOT ON THE LIVE DATABASE (checked 2026-09-10 against the API schema):
     * `supabase/migrations/20260502183000_goals_completed_at.sql` was never applied, so this update was
     * rejected on every call and no race result was ever saved through here. Retry without the column;
     * the time stays in `training_prefs.race_result.completed_at`, which is what the coach reads.
     * Once the migration is applied the first attempt succeeds and this branch never runs.
     */
    if (uErr && /completed_at/.test(String(uErr.message || ''))) {
      const { completed_at: _missing, ...withoutCompletedAt } = goalPatch
      ;({ error: uErr } = await supabase.from('goals').update(withoutCompletedAt).eq('id', goal.id).eq('user_id', userId))
    }
    if (uErr) throw uErr

    let deleted_count = 0
    let tombstone = null
    const endThisPlan = plan && (planId ? true : ['active', 'paused'].includes(String(plan.status)))
    if (endThisPlan) {
      const ended = await executeEndPlan(supabase, String(plan.id), 'race_completed')
      deleted_count = ended.deleted_count
      tombstone = ended.tombstone
    }

    try {
      await supabase
        .from('coach_cache')
        .update({ invalidated_at: new Date().toISOString() })
        .eq('user_id', userId)
    } catch (e) {
      console.warn('[complete-race] coach_cache invalidate', e)
    }

    // Recompute Arc projections for all remaining active goals now that fitness
    // is confirmed by a race result. Non-fatal — best effort.
    try {
      const { recomputeRaceProjectionsForUser } = await import('../_shared/recompute-goal-race-projections.ts')
      await recomputeRaceProjectionsForUser(supabase, userId)
    } catch (e) {
      console.warn('[complete-race] recompute projections (non-fatal)', e)
    }

    return new Response(
      JSON.stringify({
        success: true,
        goal_id: goal.id,
        plan_id: plan ? String(plan.id) : null,
        plan_ended: !!endThisPlan,
        workout_id: pick ? String(pick.id) : null,
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
