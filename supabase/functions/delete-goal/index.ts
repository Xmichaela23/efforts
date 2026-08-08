// @ts-nocheck
//
// delete-goal: cascade-delete a goal and (when the deleted plan was a combined
// season plan) regenerate a new combined plan around the remaining event goals.
//
// Behavior matrix (sync; one HTTP roundtrip):
//
//   - Goal had no plan                          → just delete goal. (The "phantom"
//                                                 case: a goal whose plan was
//                                                 already deleted elsewhere. It
//                                                 must stay deletable — see the
//                                                 no_linked_plans reason below.)
//   - Goal had a STANDALONE plan only           → delete that plan, delete goal,
//                                                 leave any other plans alone.
//   - Goal was on a COMBINED plan w/ siblings   → delete combined plan; if ≥2
//                                                 active event goals remain,
//                                                 rebuild combined plan; if 1
//                                                 remains, build single-sport
//                                                 plan; if 0, no rebuild.
//
// A COMPLETED/ENDED plan is season history and is never torn down by a goal
// delete (except via the direct `goal_id` link, which has always behaved that
// way). The rebuild trigger is narrower still — live combined plans only. See
// `plan-goal-links.ts`.
//
// `training_prefs`, `target_time`, `name`, `target_date` on remaining goals are
// athlete intent and are NEVER touched here. The torn-down `delete-plan` edge
// function handles `goals.race_readiness_projection`, `goals.projection`, and
// the training caches (`coach_cache`, `block_adaptation_cache`) for the deleted plan(s).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  LIVE_PLAN_STATUSES,
  plansLinkedToGoal,
  rebuildSiblingGoalIds,
  type PlanRow,
} from './plan-goal-links.ts'

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

/**
 * Fresh-start cleanup when no active event goals remain.
 * Clears planning artifacts that should not survive a season reset.
 */
async function cleanupPlanningArtifactsForFreshStart(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ notes: string[]; errors: string[] }> {
  const notes: string[] = []
  const errors: string[] = []

  // 1) Remove uploaded race courses (segments/debug cascade from FK).
  try {
    const { error } = await supabase
      .from('race_courses')
      .delete()
      .eq('user_id', userId)
    if (error) errors.push(`race_courses: ${error.message}`)
    else notes.push('race_courses_cleared')
  } catch (e) {
    errors.push(`race_courses: ${String(e)}`)
  }

  // 2) Clear athlete identity JSON so Arc setup starts from a blank identity.
  // Keep performance metrics/baselines intact.
  try {
    const { error } = await supabase
      .from('user_baselines')
      .update({ athlete_identity: null, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (error) errors.push(`user_baselines.athlete_identity: ${error.message}`)
    else notes.push('athlete_identity_cleared')
  } catch (e) {
    errors.push(`user_baselines.athlete_identity: ${String(e)}`)
  }

  // 3) Clear accumulated athlete memory rules/notes so season guidance restarts cleanly.
  try {
    const { error } = await supabase
      .from('athlete_memory')
      .delete()
      .eq('user_id', userId)
    if (error) errors.push(`athlete_memory: ${error.message}`)
    else notes.push('athlete_memory_cleared')
  } catch (e) {
    errors.push(`athlete_memory: ${String(e)}`)
  }

  return { notes, errors }
}

/**
 * ⛔ NEVER THROWS. A transport-level failure has to come back as `_ok: false`, not as an exception.
 *
 * THE PHANTOM-GOAL BUG (2026-08-07): the `fetch` below was unguarded, so a cold-start timeout,
 * a DNS blip, or any network throw from `delete-plan` unwound straight past the goal delete at
 * step 5 into the outer catch — 500, and the goal row still there. The athlete sees "delete
 * failed", presses it again, and gets the same result forever, because the thing that fails is
 * the PLAN teardown while the thing they are trying to remove is the GOAL.
 *
 * The function already intends the opposite: step 5 deletes the goal before the rebuild, and the
 * `planErrors` message at the bottom exists precisely to report "goal gone, plan left behind".
 * That design only holds if a teardown failure is a value rather than an exception.
 */
async function invokeFunction(
  functionsBaseUrl: string,
  serviceKey: string,
  authHeader: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let r: Response
  try {
    r = await fetch(`${functionsBaseUrl}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Service-role for cross-function trust + Authorization for any per-user edge logic.
        apikey: serviceKey,
        Authorization: authHeader || `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.warn(`[delete-goal] ${name} transport failure:`, e)
    return { error: `transport: ${String(e)}`, _ok: false }
  }
  let text = ''
  try {
    text = await r.text()
  } catch (e) {
    return { error: `body_read: ${String(e)}`, _http_status: r.status, _ok: false }
  }
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
    // Idempotent on already-gone goals (2026-05-22): the wizard's
    // rollbackInsertedGoals (useArcSetupComplete.ts:74-98) races with the
    // create-goal-and-materialize-plan outer catch (index.ts:2890), which
    // already deletes the primary goal on failure. The wizard re-tries the
    // delete, and a 404 here gets read as `error` by supabase.functions.invoke
    // — false-failure that triggers the misleading "Some goals could not be
    // removed automatically — open Goals and delete any duplicates." message.
    // The desired post-condition for delete-goal is "goal is gone"; if it was
    // never there or already deleted, that's the desired state. Return success.
    if (!goalRow) {
      return json({
        success: true,
        noop: true,
        reason: 'goal_already_deleted',
        goal_id: goalId,
      }, 200)
    }
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
    // We over-fetch live plans (small N) and filter in code.
    //
    // The status filter is deliberate and asymmetric with the `goal_id` query
    // above, which has none. A COMPLETED/ENDED combined plan that lists this goal
    // in `goals_served` is NOT torn down: it is season history, and the reference
    // it keeps is inert (`GoalsScreen.plansByGoalId` keys by goal id, so an entry
    // for a deleted goal is never looked up). Widening this to every status would
    // delete a finished season's plan as a side effect of removing its race.
    const { data: candidatePlans, error: cpErr } = await supabase
      .from('plans')
      .select('id, goal_id, config, plan_type, status')
      .eq('user_id', userId)
      .in('status', [...LIVE_PLAN_STATUSES])
    if (cpErr) console.warn('[delete-goal] load candidate plans:', cpErr.message)

    const allPlans: PlanRow[] = plansLinkedToGoal(
      (directPlans ?? []) as PlanRow[],
      (candidatePlans ?? []) as PlanRow[],
      goalId,
    )

    // 3) Did the goal share a LIVE combined plan with other goals? Only that
    //    justifies a rebuild — a finished season's combined plan must not drag
    //    its old siblings into a new build.
    const combinedSiblingGoalIds = new Set<string>(rebuildSiblingGoalIds(allPlans, goalId))

    // 4) Tear down each linked plan via delete-plan (handles its own goal-projection
    //    + coach_cache / block_adaptation_cache cleanup for the served goals).
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
    //
    // ⛔ THIS RUNS EVEN WHEN EVERY PLAN TEARDOWN FAILED, and that is the point. The athlete asked
    // to remove a GOAL; a plan that would not tear down is reported separately in `planErrors` and
    // surfaced in the toast. Gating the goal delete on plan success is what left phantoms on Focus
    // that could never be cleared — the goal's own delete kept failing for a reason that had
    // nothing to do with the goal.
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
    let freshStartCleanup: { notes: string[]; errors: string[] } | null = null
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

    // 7) If no active event goals remain at all, clear planning artifacts so the
    // athlete can truly start fresh (courses + identity/planning memory).
    const { count: activeEventGoalCount } = await supabase
      .from('goals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('goal_type', 'event')
      .eq('status', 'active')

    if ((activeEventGoalCount ?? 0) === 0) {
      freshStartCleanup = await cleanupPlanningArtifactsForFreshStart(supabase, userId)
      if ((freshStartCleanup.errors?.length ?? 0) === 0) {
        toastMessage = `${goalName} removed. No active races remain — fresh start complete.`
      } else {
        toastMessage = `${goalName} removed. No active races remain — partial fresh-start cleanup; see logs.`
      }
    }

    // A plan that failed to tear down is now UNREACHABLE by goal (the FK on
    // plans.goal_id is ON DELETE SET NULL, so deleting the goal orphans it).
    // Say so in the message rather than reporting a clean removal.
    if (planErrors.length) {
      toastMessage = `${toastMessage} ${planErrors.length} linked plan${planErrors.length === 1 ? '' : 's'} could not be removed — open Plans and delete ${planErrors.length === 1 ? 'it' : 'them'}.`
    }

    return json({
      success: true,
      deleted_goal_id: goalId,
      deleted_plan_ids: deletedPlanIds,
      // Pins the phantom case: a goal whose plan was already gone is a normal,
      // successful delete, not an error.
      reason: allPlans.length === 0 ? 'no_linked_plans' : undefined,
      plan_errors: planErrors.length ? planErrors : null,
      rebuilt_plan_id: rebuiltPlanId,
      rebuild_error: rebuildError,
      fresh_start_cleanup: freshStartCleanup,
      message: toastMessage,
    })
  } catch (e) {
    console.error('[delete-goal] unhandled', e)
    return json({ error: String(e) }, 500)
  }
})
