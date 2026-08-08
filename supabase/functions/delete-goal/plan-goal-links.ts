// Pure link-resolution helpers for `delete-goal`.
//
// Extracted from `index.ts` (which calls `Deno.serve` at import time and so can
// never be imported by a test) so the two scoping questions the teardown turns
// on are pinned by `plan-goal-links.test.ts`:
//
//   1. WHICH PLANS reference this goal?  → `plansLinkedToGoal`
//      The caller decides the status scope of each input list. Today: the
//      `goal_id` query has no status filter (a directly-linked plan is torn down
//      whatever its status — long-standing behaviour), and the `goals_served`
//      over-fetch is limited to LIVE_PLAN_STATUSES so a finished season's
//      combined plan is not deleted as a side effect of removing its race.
//
//   2. WHICH SIBLING GOALS justify rebuilding a season plan? → `rebuildSiblingGoalIds`
//      LIVE plans only, so a directly-linked COMPLETED/ENDED combined plan
//      (which case 1 does sweep) cannot drag last season's goals into a rebuild.

export type PlanRow = {
  id: string
  goal_id: string | null
  config: Record<string, unknown> | null
  plan_type?: string | null
  status?: string | null
}

/** Statuses in which a plan is still the athlete's live plan (mirrors AppContext.loadPlans). */
export const LIVE_PLAN_STATUSES = ['active', 'paused', 'rolling'] as const

export function isLivePlan(plan: PlanRow | null | undefined): boolean {
  const s = String(plan?.status ?? '').trim().toLowerCase()
  return (LIVE_PLAN_STATUSES as readonly string[]).includes(s)
}

/** Combined plans store every served goal on `config.plan_contract_v1.goals_served`; standalone plans don't. */
export function goalsServedFromPlan(plan: PlanRow | null | undefined): string[] {
  if (!plan) return []
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

export function isCombinedPlan(plan: PlanRow | null | undefined): boolean {
  return goalsServedFromPlan(plan).length > 1
}

/**
 * Every plan that references `goalId`, de-duplicated by plan id.
 *
 * `directPlans` is the `goal_id = goalId` query; `candidatePlans` is the
 * over-fetch we filter in code (PostgREST has no direct equality on a jsonb
 * array element without a contains filter). Order is direct-first so the
 * primary link is torn down first.
 */
export function plansLinkedToGoal(
  directPlans: readonly PlanRow[] | null | undefined,
  candidatePlans: readonly PlanRow[] | null | undefined,
  goalId: string,
): PlanRow[] {
  const gid = String(goalId ?? '').trim()
  if (!gid) return []
  const seen = new Set<string>()
  const out: PlanRow[] = []
  for (const p of directPlans ?? []) {
    if (!p?.id || seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  for (const p of candidatePlans ?? []) {
    if (!p?.id || seen.has(p.id)) continue
    if (!goalsServedFromPlan(p).includes(gid)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out
}

/**
 * Goals other than `goalId` that were sharing a LIVE combined plan with it —
 * the only condition under which the season plan gets rebuilt.
 */
export function rebuildSiblingGoalIds(
  plans: readonly PlanRow[] | null | undefined,
  goalId: string,
): string[] {
  const gid = String(goalId ?? '').trim()
  const out = new Set<string>()
  for (const p of plans ?? []) {
    if (!isLivePlan(p)) continue
    if (!isCombinedPlan(p)) continue
    for (const sib of goalsServedFromPlan(p)) {
      if (sib && sib !== gid) out.add(sib)
    }
  }
  return [...out]
}
