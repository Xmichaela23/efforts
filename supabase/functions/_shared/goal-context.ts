// =============================================================================
// GOAL CONTEXT — shared loader for active goals across all server functions
// =============================================================================

export type GoalLite = {
  id: string;
  name: string;
  goal_type: 'event' | 'capacity' | 'maintenance';
  target_date: string | null;
  sport: string | null;
  distance: string | null;
  priority: 'A' | 'B' | 'C';
  target_metric: string | null;
  target_value: number | null;
  current_value: number | null;
  target_time: number | null;
  training_prefs: Record<string, any> | null;
  plan_id: string | null;
};

export type GoalContext = {
  goals: GoalLite[];
  primary_event: GoalLite | null;
  upcoming_races: Array<{
    name: string;
    date: string;
    sport: string;
    distance: string;
    weeks_out: number;
    has_plan: boolean;
    priority: 'A' | 'B' | 'C';
  }>;
  has_goals: boolean;
  has_plan_for_all_events: boolean;
};

export async function loadGoalContext(
  supabase: any,
  userId: string,
  asOfDate: string,
  activePlanIds: string[],
): Promise<GoalContext> {
  const { data: rows } = await supabase
    .from('goals')
    .select('id, name, goal_type, target_date, sport, distance, priority, target_metric, target_value, current_value, target_time, training_prefs')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('target_date', { ascending: true, nullsFirst: false });

  const goals: GoalLite[] = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id,
    name: r.name || 'Untitled',
    goal_type: r.goal_type || 'event',
    target_date: r.target_date ? String(r.target_date).slice(0, 10) : null,
    sport: r.sport || null,
    distance: r.distance || null,
    priority: r.priority || 'A',
    target_metric: r.target_metric || null,
    target_value: r.target_value != null ? Number(r.target_value) : null,
    current_value: r.current_value != null ? Number(r.current_value) : null,
    target_time: r.target_time != null ? Number(r.target_time) : null, // column added by 20260312 migration
    training_prefs: r.training_prefs || null,
    plan_id: null,
  }));

  // Link goals to plans via the plans.goal_id column
  if (activePlanIds.length > 0) {
    try {
      const { data: planGoalLinks } = await supabase
        .from('plans')
        .select('id, goal_id')
        .in('id', activePlanIds);
      if (Array.isArray(planGoalLinks)) {
        for (const link of planGoalLinks) {
          const goal = goals.find(g => g.id === link.goal_id);
          if (goal) goal.plan_id = link.id;
        }
      }
    } catch {}
  }

  const todayMs = new Date(asOfDate + 'T12:00:00Z').getTime();

  const upcoming_races = goals
    .filter(g => g.goal_type === 'event' && g.target_date)
    .filter(g => new Date(g.target_date! + 'T12:00:00Z').getTime() >= todayMs)
    .map(g => {
      const raceMs = new Date(g.target_date! + 'T12:00:00Z').getTime();
      const weeksOut = Math.max(0, Math.round((raceMs - todayMs) / (7 * 86400000)));
      return {
        name: g.name,
        date: g.target_date!,
        sport: g.sport || 'unknown',
        distance: g.distance || 'unknown',
        weeks_out: weeksOut,
        has_plan: g.plan_id != null,
        priority: g.priority,
      };
    });

  const eventGoals = goals.filter(g => g.goal_type === 'event' && g.target_date);
  const futureEvents = eventGoals.filter(g => new Date(g.target_date! + 'T12:00:00Z').getTime() >= todayMs);

  const primary_event = futureEvents.find(g => g.priority === 'A')
    ?? futureEvents[0]
    ?? null;

  return {
    goals,
    primary_event,
    upcoming_races,
    has_goals: goals.length > 0,
    has_plan_for_all_events: futureEvents.length > 0 && futureEvents.every(g => g.plan_id != null),
  };
}

function isRunGoalLite(g: GoalLite | null | undefined): boolean {
  if (!g) return false;
  const sport = String(g.sport || '').toLowerCase();
  return sport === 'run' || sport === 'running' || !g.sport;
}

/**
 * Goal id for unified finish projection (State + Course Strategy / terrain).
 *
 * course-detail anchors to `race_courses.goal_id`. Coach must prefer the same goal or State diverges from terrain.
 *
 * Priority:
 * 1) Unique goal_id across user's race_courses (single uploaded course)
 * 2) activePlan.goal_id when present in race_courses (multi-course)
 * 3) primary_event (run)
 * 4) active plan linked goal + plan_id on goal rows
 * 5) active plan with missing plan.goal_id: single run event goal, or match plan.config.race_name to goal name
 */
export function resolveRunGoalIdForRaceProjection(
  goalContext: GoalContext,
  activePlan: { id: string; goal_id?: string | null; config?: unknown } | null | undefined,
  raceCourseGoalIds?: string[] | null,
): string | null {
  const uniq = [...new Set((raceCourseGoalIds || []).filter(Boolean).map(String))];

  if (uniq.length === 1) {
    const g = goalContext.goals.find(x => x.id === uniq[0]);
    if (isRunGoalLite(g ?? null)) return uniq[0];
  }
  if (uniq.length > 1) {
    const ag = typeof activePlan?.goal_id === 'string' ? activePlan.goal_id.trim() : '';
    if (ag && uniq.includes(ag)) {
      const g = goalContext.goals.find(x => x.id === ag);
      if (isRunGoalLite(g ?? null)) return ag;
    }
  }

  const pe = goalContext.primary_event;
  if (pe) {
    const sport = String(pe.sport || '').toLowerCase();
    const runish = sport === 'run' || sport === 'running' || !pe.sport;
    if (runish) return pe.id;
  }
  const gid = typeof activePlan?.goal_id === 'string' ? activePlan.goal_id.trim() : '';
  if (gid) {
    const g = goalContext.goals.find(x => x.id === gid);
    if (g) {
      const sport = String(g.sport || '').toLowerCase();
      const runish = sport === 'run' || sport === 'running' || !g.sport;
      if (runish) return g.id;
    }
  }
  const planId = typeof activePlan?.id === 'string' ? activePlan.id.trim() : '';
  if (planId) {
    const linked = goalContext.goals.find(g => g.plan_id === planId);
    if (linked) {
      const sport = String(linked.sport || '').toLowerCase();
      const runish = sport === 'run' || sport === 'running' || !linked.sport;
      if (runish) return linked.id;
    }
  }

  // Data drift: plan row active but plans.goal_id never set — goals never get plan_id; still show State projection.
  const planGoalUnset = !gid && activePlan && planId;
  if (planGoalUnset) {
    const runEvents = goalContext.goals.filter(
      g => isRunGoalLite(g) && g.goal_type === 'event',
    );
    if (runEvents.length === 1) return runEvents[0].id;
    const cfg = activePlan?.config as Record<string, unknown> | null | undefined;
    const raceName = cfg?.race_name != null ? String(cfg.race_name).trim().toLowerCase() : '';
    if (raceName && runEvents.length > 0) {
      const byName = runEvents.find(
        g => String(g.name || '').toLowerCase().includes(raceName) || raceName.includes(String(g.name || '').toLowerCase()),
      );
      if (byName && isRunGoalLite(byName)) return byName.id;
    }
    const priorityA = runEvents.find(g => g.priority === 'A');
    if (priorityA && isRunGoalLite(priorityA)) return priorityA.id;
  }

  return null;
}
