// @ts-nocheck
//
// delete-goal: cascade-delete a goal and (when the deleted plan was a combined
// season plan) regenerate a new combined plan around the remaining event goals.
//
// Behavior matrix (sync; one HTTP roundtrip):
//
//   - Goal had no plan                          → just delete goal.
//   - Goal had a STANDALONE plan only           → delete that plan, delete goal,
//                                                 leave any other plans alone.
//   - Goal was on a COMBINED plan w/ siblings   → delete combined plan; if ≥2
//                                                 active event goals remain,
//                                                 rebuild combined plan; if 1
//                                                 remains, build single-sport
//                                                 plan; if 0, no rebuild.
//
// `training_prefs`, `target_time`, `name`, `target_date` on remaining goals are
// athlete intent and are NEVER touched here. The torn-down `delete-plan` edge
// function handles `goals.race_readiness_projection`, `goals.projection`, and
// the `coach_cache` invalidation for the deleted plan(s).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as Record<string, string>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** `sub` from a user access JWT, or null if not an authenticated caller token. */
function authenticatedSubFromBearer(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? ''
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = JSON.parse(atob(b64 + pad)) as { role?: string; sub?: string; aud?: string | string[] }
    const role = typeof json?.role === 'string' ? json.role : ''
    const audRaw = json.aud
    const aud = Array.isArray(audRaw) ? audRaw[0] : typeof audRaw === 'string' ? audRaw : ''
    const sub = typeof json?.sub === 'string' ? json.sub.trim() : ''
    const isAuthed = role === 'authenticated' || aud === 'authenticated'
    if (isAuthed && UUID_RE.test(sub)) return sub
  } catch {
    /* invalid JWT */
  }
  return null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type PlanRow = {
  id: string
  goal_id: string | null
  config: Record<string, unknown> | null
  plan_type?: string | null
  status?: string | null
}

/** Combined plans store every served goal on `config.plan_contract_v1.goals_served`; standalone plans don't. */
function goalsServedFromPlan(plan: PlanRow): string[] {
  const cfg = (plan.config ?? {}) as Record<string, unknown>
  const pc = cfg?.plan_contract_v1 as Record<string, unknown> | undefined
  const served = pc?.goals_served
  if (Array.isArray(served) && served.length > 0) {
    return [
      ...new Set(
        served.map((x) => (x != null ? String(x).trim() : '')).filter((s) => s.length > 0),
      ),
    ]
  }
  if (plan.goal_id != null && String(plan.goal_id).trim()) return [String(plan.goal_id).trim()]
  return []
}

function isCombinedPlan(plan: PlanRow): boolean {
  return goalsServedFromPlan(plan).length > 1
}

async function invokeFunction(
  functionsBaseUrl: string,
  serviceKey: string,
  authHeader: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const r = await fetch(`${functionsBaseUrl}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Service-role for cross-function trust + Authorization for any per-user edge logic.
      apikey: serviceKey,
      Authorization: authHeader || `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  })
  const text = await r.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = { raw: text }
  }
  if (!r.ok) {
    return { ...parsed, _http_status: r.status, _ok: false }
  }
  return { ...parsed, _ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const functionsBaseUrl = `${supabaseUrl}/functions/v1`
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = (await req.json().catch(() => ({}))) as { goal_id?: unknown; user_id?: unknown }
    const goalId = typeof body.goal_id === 'string' ? body.goal_id.trim() : ''
    if (!goalId || !UUID_RE.test(goalId)) {
      return json({ error: 'goal_id required' }, 400)
    }

    const userId = authenticatedSubFromBearer(req)
    if (!userId) return json({ error: 'invalid_auth: sign in required' }, 401)
    const fromBody = typeof body.user_id === 'string' ? body.user_id.trim() : ''
    if (fromBody && fromBody !== userId) {
      return json({ error: 'user_id_mismatch' }, 400)
    }
    const authHeader = req.headers.get('Authorization') ?? ''

    // 1) Load the goal we are deleting (also the toast label)
    const { data: goalRow, error: goalErr } = await supabase
      .from('goals')
      .select('id, name, sport, goal_type, status, target_date')
      .eq('id', goalId)
      .eq('user_id', userId)
      .maybeSingle()
    if (goalErr) return json({ error: goalErr.message }, 500)
    if (!goalRow) return json({ error: 'goal_not_found' }, 404)
    const goalName = String(goalRow.name || 'Race')

    // 2) Find every plan that mentions this goal — either as `goal_id` or inside
    //    `config.plan_contract_v1.goals_served`.
    const { data: directPlans, error: dpErr } = await supabase
      .from('plans')
      .select('id, goal_id, config, plan_type, status')
      .eq('user_id', userId)
      .eq('goal_id', goalId)
    if (dpErr) console.warn('[delete-goal] load direct plans:', dpErr.message)

    // No direct equality on jsonb arrays in PostgREST without a contains filter.
    // We over-fetch active+rolling plans (small N) and filter in code.
    const { data: candidatePlans, error: cpErr } = await supabase
      .from('plans')
      .select('id, goal_id, config, plan_type, status')
      .eq('user_id', userId)
      .in('status', ['active', 'paused', 'rolling'])
    if (cpErr) console.warn('[delete-goal] load candidate plans:', cpErr.message)

    const seenPlanIds = new Set<string>()
    const allPlans: PlanRow[] = []
    for (const p of (directPlans ?? []) as PlanRow[]) {
      if (!seenPlanIds.has(p.id)) {
        seenPlanIds.add(p.id)
        allPlans.push(p)
      }
    }
    for (const p of (candidatePlans ?? []) as PlanRow[]) {
      if (seenPlanIds.has(p.id)) continue
      const served = goalsServedFromPlan(p)
      if (served.includes(goalId)) {
        seenPlanIds.add(p.id)
        allPlans.push(p)
      }
    }

    // 3) Did the goal participate in any COMBINED plan that still has siblings?
    let combinedSiblingGoalIds = new Set<string>()
    for (const p of allPlans) {
      if (!isCombinedPlan(p)) continue
      for (const gid of goalsServedFromPlan(p)) {
        if (gid && gid !== goalId) combinedSiblingGoalIds.add(gid)
      }
    }

    // 4) Tear down each linked plan via delete-plan (handles its own goal-projection
    //    + coach_cache cleanup for the served goals).
    const deletedPlanIds: string[] = []
    const planErrors: string[] = []
    for (const p of allPlans) {
      const r = await invokeFunction(functionsBaseUrl, serviceKey, authHeader, 'delete-plan', {
        plan_id: p.id,
      })
      if (r._ok) {
        deletedPlanIds.push(p.id)
      } else {
        planErrors.push(`${p.id}: ${String(r.error ?? r.raw ?? 'unknown')}`)
      }
    }

    // 5) Delete the goal row itself.
    const { error: delErr } = await supabase
      .from('goals')
      .delete()
      .eq('id', goalId)
      .eq('user_id', userId)
    if (delErr) return json({ error: `delete_goal_failed: ${delErr.message}` }, 500)

    // 6) Decide whether to rebuild. Only when this goal was on a combined plan
    //    that still has at least one other active event goal.
    let rebuiltPlanId: string | null = null
    let rebuildError: string | null = null
    let toastMessage = `${goalName} removed.`

    if (combinedSiblingGoalIds.size > 0) {
      const today = new Date().toISOString().slice(0, 10)
      // Reload remaining active event goals (some siblings could have been deleted
      // earlier, statuses changed, target dates passed, etc.).
      const { data: remainingGoals } = await supabase
        .from('goals')
        .select('id, priority, target_date, status, goal_type')
        .eq('user_id', userId)
        .eq('goal_type', 'event')
        .eq('status', 'active')
        .in('id', [...combinedSiblingGoalIds])

      const futureRemaining = (remainingGoals ?? []).filter(
        (g) => typeof g.target_date === 'string' && g.target_date.slice(0, 10) >= today,
      )

      if (futureRemaining.length === 0) {
        toastMessage = `${goalName} removed. No active races remain — plan ended.`
      } else {
        // Pick the highest-priority (A > B > C), earliest target_date as the anchor.
        const priorityRank: Record<string, number> = { A: 0, B: 1, C: 2 }
        futureRemaining.sort((a, b) => {
          const pa = priorityRank[String(a.priority || 'C').toUpperCase()] ?? 3
          const pb = priorityRank[String(b.priority || 'C').toUpperCase()] ?? 3
          if (pa !== pb) return pa - pb
          const da = String(a.target_date).slice(0, 10)
          const db = String(b.target_date).slice(0, 10)
          return da.localeCompare(db)
        })
        const anchor = futureRemaining[0]

        // ≥2 remaining → combined; else fall through to standalone build.
        const wantCombine = futureRemaining.length >= 2
        const r = await invokeFunction(
          functionsBaseUrl,
          serviceKey,
          authHeader,
          'create-goal-and-materialize-plan',
          {
            mode: 'build_existing',
            existing_goal_id: anchor.id,
            combine: wantCombine,
            user_id: userId,
          },
        )
        if (r._ok && (r.plan_id || (r.created && (r as Record<string, unknown>).plan_id))) {
          rebuiltPlanId = String((r as Record<string, unknown>).plan_id ?? '') || null
          // Look up the anchor's name so the toast reads naturally ("around Santa Cruz").
          const { data: anchorRow } = await supabase
            .from('goals')
            .select('name')
            .eq('id', anchor.id)
            .eq('user_id', userId)
            .maybeSingle()
          const anchorName = String(anchorRow?.name || 'remaining race')
          toastMessage = `${goalName} removed. Plan rebuilt around ${anchorName}.`
        } else {
          rebuildError = String(r.error ?? r.raw ?? 'rebuild failed')
          toastMessage = `${goalName} removed. Auto-rebuild failed — open Plans to start a new one.`
        }
      }
    }

    return json({
      success: true,
      deleted_goal_id: goalId,
      deleted_plan_ids: deletedPlanIds,
      plan_errors: planErrors.length ? planErrors : null,
      rebuilt_plan_id: rebuiltPlanId,
      rebuild_error: rebuildError,
      message: toastMessage,
    })
  } catch (e) {
    console.error('[delete-goal] unhandled', e)
    return json({ error: String(e) }, 500)
  }
})
