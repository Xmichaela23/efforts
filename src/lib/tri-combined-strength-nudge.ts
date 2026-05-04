/**
 * Stale combined-plan detection for tri strength routing.
 *
 * **Maintenance:** Keep `RUN_CENTRIC_STRENGTH_PROTOCOL_IDS` in sync with
 * `supabase/functions/shared/strength-system/protocols/selector.ts`.
 * If a new run-centric strength_protocol id is added there but not here,
 * athletes with old `plans.config.strength_protocol` rows won’t see the rebuild hint
 * when they should.
 */
export const RUN_CENTRIC_STRENGTH_PROTOCOL_IDS = new Set<string>([
  'neural_speed',
  'durability',
  'upper_aesthetics',
  'minimum_dose',
  'upper_priority_hybrid',
  'foundation_durability',
  'performance_neural',
]);

export function isRunCentricStrengthProtocolId(id: string | undefined | null): boolean {
  const p = String(id ?? '').trim();
  return p !== '' && RUN_CENTRIC_STRENGTH_PROTOCOL_IDS.has(p);
}

function isMultiSportPlanConfig(cfg: Record<string, unknown> | undefined): boolean {
  if (!cfg || typeof cfg !== 'object') return false;
  const pt = String((cfg as { plan_type?: string }).plan_type || '').toLowerCase();
  const sport = String((cfg as { sport?: string }).sport || '').toLowerCase();
  return pt === 'multi_sport' || sport === 'multi_sport';
}

export type TriStrengthNudgeGoal = {
  id: string;
  sport?: string | null;
  training_prefs?: Record<string, unknown> | null;
};

export type TriStrengthNudgePlan = {
  id?: string;
  goal_id?: string | null;
  status?: string;
  config?: Record<string, unknown> | null;
};

/**
 * True when an **active** combined (multi-sport) plan still has a run-centric
 * `strength_protocol` on disk while the athlete (or plan contract) indicates
 * **performance** / co-equal tri strength — the case that used to misroute to
 * foundation-durability until rebuild.
 */
export function shouldNudgeTriCombinedStrengthRebuild(
  plan: TriStrengthNudgePlan | null | undefined,
  goals: TriStrengthNudgeGoal[],
): boolean {
  if (!plan) return false;
  if (String(plan.status || '').toLowerCase() !== 'active') return false;
  const cfg = (plan.config ?? undefined) as Record<string, unknown> | undefined;
  if (!isMultiSportPlanConfig(cfg)) return false;
  const rawSp = (cfg as { strength_protocol?: string }).strength_protocol;
  if (!isRunCentricStrengthProtocolId(rawSp)) return false;

  const intentFromPlan =
    String((cfg as { strength_intent?: string }).strength_intent || '').toLowerCase() ===
    'performance';

  const served = (cfg as { goals_served?: string[] }).goals_served;
  const servedIds = new Set<string>(
    Array.isArray(served) ? served.filter((id): id is string => typeof id === 'string') : [],
  );
  if (plan.goal_id && typeof plan.goal_id === 'string') servedIds.add(plan.goal_id);

  const relevantGoals =
    servedIds.size > 0 ? goals.filter((g) => servedIds.has(g.id)) : goals;

  const triPerformance = relevantGoals.some(
    (g) =>
      String(g.sport || '').toLowerCase() === 'triathlon' &&
      String(g.training_prefs?.strength_intent || '').toLowerCase() === 'performance',
  );

  return intentFromPlan || triPerformance;
}

export const TRI_STRENGTH_REBUILD_NUDGE_DISMISS_KEY = 'efforts.triStrengthRebuildNudge.dismissed_v1';

export function isTriStrengthRebuildNudgeDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(TRI_STRENGTH_REBUILD_NUDGE_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissTriStrengthRebuildNudge(): void {
  try {
    globalThis.localStorage?.setItem(TRI_STRENGTH_REBUILD_NUDGE_DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}
