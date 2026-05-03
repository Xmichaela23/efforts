/**
 * Infer sport from plan row (matches Goals / calendar conflict logic).
 */
export function inferSportFromPlanConfig(config: unknown, planType?: string | null): string {
  const c = config && typeof config === 'object' ? (config as Record<string, unknown>) : {};
  if (c.sport) return String(c.sport).toLowerCase();
  const dist = String(c.distance ?? '').toLowerCase();
  if (['5k', '10k', 'half', 'marathon'].includes(dist)) return 'run';
  const pt = String(planType || '').toLowerCase();
  if (pt.includes('run')) return 'run';
  if (pt.includes('ride') || pt.includes('bike') || pt.includes('cycling')) return 'ride';
  if (pt.includes('swim')) return 'swim';
  if (pt.includes('tri')) return 'triathlon';
  return '';
}

/** Align `goals.sport` with `inferSportFromPlanConfig` (e.g. tri → triathlon). */
export function normalizeGoalSportForPlanMatch(sport: string | null | undefined): string {
  const s = String(sport ?? '').toLowerCase();
  if (s === 'tri') return 'triathlon';
  return s;
}

export type PlanRowLite = {
  id: string;
  goal_id: string | null;
  status: string;
  config?: unknown;
  plan_type?: string | null;
};

/**
 * Active plan with no `goal_id` whose sport matches the event goal — same as Goals `findConflictPlan`.
 * @returns plan id to pass as `replace_plan_id` to `create-goal-and-materialize-plan`, or null.
 */
export function findOrphanActivePlanConflictId(
  plans: PlanRowLite[] | null | undefined,
  goalSport: string | null | undefined,
): string | null {
  const sport = normalizeGoalSportForPlanMatch(goalSport);
  if (!sport) return null;
  const row = (plans || []).find(
    (p) =>
      !p.goal_id &&
      p.status === 'active' &&
      inferSportFromPlanConfig(p.config || {}, p.plan_type ?? undefined) === sport,
  );
  return row?.id ?? null;
}
