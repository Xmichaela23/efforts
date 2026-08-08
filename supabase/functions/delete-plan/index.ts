// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { invalidateUserTrainingCache } from '../_shared/invalidate-user-training-cache.ts'
import { recomputeRaceProjectionsForUser } from '../_shared/recompute-goal-race-projections.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Combined plans store every served goal on `config.plan_contract_v1.goals_served`; `plans.goal_id` is only the primary. */
function goalIdsToClearFromPlanRow(planRow: { goal_id?: string | null; config?: unknown } | null): string[] {
  if (!planRow) return []
  const cfg = planRow.config as Record<string, unknown> | null | undefined
  const pc = cfg?.plan_contract_v1 as Record<string, unknown> | undefined
  const served = pc?.goals_served
  if (Array.isArray(served) && served.length > 0) {
    const ids = new Set(
      served.map((x) => (x != null ? String(x).trim() : '')).filter((s) => s.length > 0),
    )
    return [...ids]
  }
  const gid = planRow.goal_id
  if (gid != null && String(gid).trim()) return [String(gid).trim()]
  return []
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string,string>

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  try {
    const body = await req.json().catch(()=>({}))
    const planId: string | null = body?.plan_id || null
    if (!planId) return new Response(JSON.stringify({ error: 'plan_id required' }), { status: 400, headers: { ...cors, 'Content-Type':'application/json' } })

    // ⛔ VALIDATE BEFORE THE `.or()` BELOW. That filter is built by string interpolation, so a
    // `plan_id` that is not a plain UUID is either a PostgREST syntax error (500 — which
    // `delete-goal` then reports as a failed teardown, one of the ways a goal delete looked broken)
    // or, with a crafted value, an injected filter clause. A UUID can be neither.
    if (!UUID_RE.test(String(planId))) {
      return new Response(JSON.stringify({ error: 'plan_id must be a uuid' }), { status: 400, headers: { ...cors, 'Content-Type':'application/json' } })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: planBefore } = await supabase
      .from('plans')
      .select('goal_id, user_id, config')
      .eq('id', planId)
      .maybeSingle()

    // Already gone → the desired post-condition already holds. Report success rather than doing
    // the teardown again; `delete-goal` retries this path, and a dangling plan reference (the row
    // deleted by some other route while the goal still points at it) is exactly the phantom case.
    if (!planBefore) {
      return new Response(
        JSON.stringify({ success: true, noop: true, reason: 'plan_already_deleted', deleted_plan_id: planId }),
        { headers: { ...cors, 'Content-Type':'application/json' } },
      )
    }

    // Delete planned rows first to avoid FK blocks and UI ghosts
    const { error: pErr } = await supabase
      .from('planned_workouts')
      .delete()
      .or(`training_plan_id.eq.${planId},template_id.eq.${planId}`)
    if (pErr) throw pErr

    // Delete the plan itself
    const { error: dErr } = await supabase
      .from('plans')
      .delete()
      .eq('id', planId)
    if (dErr) throw dErr

    const userId = planBefore?.user_id as string | undefined
    const goalIds = userId ? goalIdsToClearFromPlanRow(planBefore) : []
    if (userId && goalIds.length) {
      const now = new Date().toISOString()
      const { error: gErr } = await supabase
        .from('goals')
        .update({ race_readiness_projection: null, updated_at: now })
        .in('id', goalIds)
        .eq('user_id', userId)
      if (gErr) console.warn('[delete-plan] clear goal race_readiness_projection:', gErr.message)
      try {
        await recomputeRaceProjectionsForUser(supabase, userId, { goalIds })
      } catch (e) {
        console.warn('[delete-plan] recompute projections:', e)
      }
    }

    // Same invalidation as ingest-activity: plan deletion changes training context.
    // Best-effort: the plan and its planned_workouts are already gone by this point, so throwing
    // here would report a failed teardown for work that actually succeeded — and `delete-goal`
    // turns that into "linked plan could not be removed" on a plan that no longer exists. A stale
    // cache is self-healing; a false failure is not.
    if (userId) {
      try {
        await invalidateUserTrainingCache(supabase, userId, 'delete-plan')
      } catch (e) {
        console.warn('[delete-plan] cache invalidation (non-fatal):', e)
      }
    }

    return new Response(JSON.stringify({ success: true, deleted_plan_id: planId }), { headers: { ...cors, 'Content-Type':'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type':'application/json' } })
  }
})


