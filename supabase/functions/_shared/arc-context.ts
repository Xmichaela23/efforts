// =============================================================================
// ARC CONTEXT — who / where / (later) state for Athlete Arc–aware features
// =============================================================================

import { resolvePlanWeekIndex } from './plan-week.ts';

/** JSON payload from `user_baselines.athlete_identity` */
export type AthleteIdentity = Record<string, unknown>;

/** JSON payload from `user_baselines.learned_fitness` */
export type LearnedFitness = Record<string, unknown>;

export interface Goal {
  id: string;
  name: string;
  goal_type: string;
  target_date: string | null;
  sport: string | null;
  distance: string | null;
  priority: string;
  status: string;
  target_metric: string | null;
  target_value: number | null;
  current_value: number | null;
}

export interface ActivePlanSummary {
  plan_id: string;
  week_number: number | null;
  /** Phase label from `plan_contract_v1.phase_by_week` when resolvable, else null */
  phase: string | null;
  /** Primary sport/discipline for the plan when inferable from config or plan type */
  discipline: string | null;
}

/** Full row shape when we load `athlete_snapshot` (TODO). */
export type AthleteSnapshot = Record<string, unknown>;

export interface AthleteMemorySummary {
  derived_rules: unknown;
  confidence_score: number | null;
}

export interface ArcContext {
  athlete_identity: AthleteIdentity | null;
  learned_fitness: LearnedFitness | null;
  /** `user_baselines.disciplines` */
  disciplines: string[] | null;
  /** `user_baselines.training_background` */
  training_background: string | null;

  active_goals: Goal[];
  active_plan: ActivePlanSummary | null;

  latest_snapshot: AthleteSnapshot | null;
  athlete_memory: AthleteMemorySummary | null;

  user_id: string;
  built_at: string;
}

function toGoalRow(r: Record<string, unknown>): Goal {
  return {
    id: String(r.id),
    name: String(r.name ?? 'Untitled'),
    goal_type: String(r.goal_type ?? 'event'),
    target_date: r.target_date != null ? String(r.target_date).slice(0, 10) : null,
    sport: r.sport != null ? String(r.sport) : null,
    distance: r.distance != null ? String(r.distance) : null,
    priority: String(r.priority ?? 'A'),
    status: String(r.status ?? 'active'),
    target_metric: r.target_metric != null ? String(r.target_metric) : null,
    target_value: r.target_value != null && Number.isFinite(Number(r.target_value)) ? Number(r.target_value) : null,
    current_value: r.current_value != null && Number.isFinite(Number(r.current_value)) ? Number(r.current_value) : null,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function buildActivePlanSummary(
  plan: { id: string; config: unknown; current_week: unknown; duration_weeks: unknown; plan_type?: unknown },
  focusDateISO: string
): ActivePlanSummary | null {
  const config = (plan.config && typeof plan.config === 'object' ? plan.config : {}) as Record<string, unknown>;
  const durationRaw = plan.duration_weeks ?? config.duration_weeks;
  const durationWeeks = durationRaw != null && Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : 0;

  let weekIndex: number | null = resolvePlanWeekIndex(config, focusDateISO, durationWeeks > 0 ? durationWeeks : null);
  if (weekIndex == null && plan.current_week != null) {
    const n = Number(plan.current_week);
    if (Number.isFinite(n)) weekIndex = n;
  }

  const contract = config.plan_contract_v1 as
    | { version?: number; phase_by_week?: string[] }
    | undefined;
  let phase: string | null = null;
  if (contract?.version === 1 && Array.isArray(contract.phase_by_week) && weekIndex != null) {
    const i = weekIndex - 1;
    if (i >= 0 && i < contract.phase_by_week.length) {
      phase = contract.phase_by_week[i] ?? null;
    }
  }

  const discipline =
    (typeof config.discipline === 'string' && config.discipline) ||
    (typeof config.sport === 'string' && config.sport) ||
    (typeof plan.plan_type === 'string' && plan.plan_type && plan.plan_type !== 'custom' ? plan.plan_type : null) ||
    null;

  return {
    plan_id: String(plan.id),
    week_number: weekIndex,
    phase,
    discipline,
  };
}

/**
 * Aggregates user_baselines, active goals, active plan, and (later) snapshot + memory
 * for Athlete Arc–aware prompts and planners.
 */
export async function getArcContext(
  supabase: { from: (t: string) => any },
  userId: string,
  focusDateISO: string
): Promise<ArcContext> {
  const built_at = new Date().toISOString();

  const [baselinesRes, goalsRes, plansRes] = await Promise.all([
    supabase
      .from('user_baselines')
      .select('athlete_identity, learned_fitness, disciplines, training_background')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('goals')
      .select('id, name, goal_type, target_date, sport, distance, priority, status, target_metric, target_value, current_value')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('target_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('plans')
      .select('id, name, config, current_week, duration_weeks, plan_type, status, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
  ]);

  const baseline = baselinesRes?.data as Record<string, unknown> | null;
  const athlete_identity = parseJsonObject(baseline?.athlete_identity);
  const learned_fitness = parseJsonObject(baseline?.learned_fitness);
  const rawDisc = baseline?.disciplines;
  const disciplines = Array.isArray(rawDisc) ? rawDisc.map((d) => String(d)) : null;
  const training_background =
    baseline?.training_background != null && typeof baseline.training_background === 'string'
      ? (baseline.training_background as string)
      : null;

  const active_goals: Goal[] = (Array.isArray(goalsRes?.data) ? goalsRes.data : []).map((r: Record<string, unknown>) =>
    toGoalRow(r)
  );

  let active_plan: ActivePlanSummary | null = null;
  const planRow = Array.isArray(plansRes?.data) && plansRes.data[0] ? plansRes.data[0] : null;
  if (planRow) {
    active_plan = buildActivePlanSummary(
      {
        id: planRow.id,
        config: planRow.config,
        current_week: planRow.current_week,
        duration_weeks: planRow.duration_weeks,
        plan_type: planRow.plan_type
      },
      focusDateISO
    );
  }

  // TODO: load most recent `athlete_snapshot` row for this user
  const latest_snapshot: AthleteSnapshot | null = null;
  // TODO: load most recent `athlete_memory` row; map to { derived_rules, confidence_score } only
  const athlete_memory: AthleteMemorySummary | null = null;

  return {
    athlete_identity,
    learned_fitness,
    disciplines,
    training_background,
    active_goals,
    active_plan,
    latest_snapshot,
    athlete_memory,
    user_id: userId,
    built_at
  };
}
