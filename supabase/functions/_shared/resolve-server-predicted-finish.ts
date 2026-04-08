/**
 * Canonical race finish projection for course pacing (same numbers State shows):
 * 1) goals.race_readiness_projection — written when coach runs
 * 2) coach_cache.payload — last coach response (what State tab SWR serves); use when goal_id matches primary_event
 * 3) Baseline-only computeRaceReadiness (no weekly reaction signals — last resort)
 *
 * Clients must not send predicted_finish_time_seconds; course-detail / course-strategy use this only.
 */
import { computeRaceReadiness } from './race-readiness/index.ts';
import { parseClientPredictedFinishSeconds } from './resolve-goal-target-time.ts';

export type GoalRowForPrediction = {
  name: string;
  distance: string | null;
  target_date: string | null;
  target_time: number | null;
  sport: string | null;
  /** Coach-persisted projection (optional). */
  race_readiness_projection?: unknown;
};

function parseGoalRaceReadinessProjection(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  return parseClientPredictedFinishSeconds(p.predicted_finish_time_seconds);
}

/**
 * State tab reads from coach_cache (stale-while-revalidate). Use the same payload so terrain pacing
 * matches the RACE block without relying on a goals column migration.
 */
async function readPredictedFinishFromCoachCache(
  supabase: any,
  userId: string,
  courseGoalId: string,
): Promise<number | null> {
  const { data: row } = await supabase
    .from('coach_cache')
    .select('payload')
    .eq('user_id', userId)
    .maybeSingle();
  const payload = row?.payload as Record<string, unknown> | null | undefined;
  if (!payload) return null;

  const gc = payload.goal_context as Record<string, unknown> | undefined;
  const primary = gc?.primary_event as { id?: string } | undefined;
  if (!primary?.id || String(primary.id) !== String(courseGoalId)) return null;

  const rr = payload.race_readiness as Record<string, unknown> | null | undefined;
  if (!rr) return null;
  return parseClientPredictedFinishSeconds(rr.predicted_finish_time_seconds);
}

/**
 * @param courseGoalId — goals.id for this race course (match coach primary_event).
 */
export async function resolveCanonicalPredictedFinishSeconds(
  supabase: any,
  userId: string,
  goal: GoalRowForPrediction,
  courseGoalId: string,
): Promise<number | null> {
  const fromGoalRow = parseGoalRaceReadinessProjection(goal.race_readiness_projection);
  if (fromGoalRow != null) return fromGoalRow;

  const fromCache = await readPredictedFinishFromCoachCache(supabase, userId, courseGoalId);
  if (fromCache != null) return fromCache;

  return resolveServerPredictedFinishSeconds(supabase, userId, goal);
}

function parseLearnedFitness(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

/** @param supabase — service-role Supabase client */
export async function resolveServerPredictedFinishSeconds(
  supabase: any,
  userId: string,
  goal: GoalRowForPrediction,
): Promise<number | null> {
  if (!goal.distance || !goal.target_date) return null;
  const sport = String(goal.sport || '').toLowerCase();
  if (sport && sport !== 'run' && sport !== 'running') return null;

  const { data: ub } = await supabase
    .from('user_baselines')
    .select('performance_numbers, effort_paces, learned_fitness')
    .eq('user_id', userId)
    .maybeSingle();

  const row = ub as Record<string, unknown> | null | undefined;
  const learnedFitness = parseLearnedFitness(row?.learned_fitness);

  let weeksOut = 0;
  try {
    const race = new Date(String(goal.target_date).slice(0, 10));
    if (!Number.isNaN(race.getTime())) {
      const now = new Date();
      weeksOut = Math.max(0, Math.round((race.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    }
  } catch {
    /* ignore */
  }

  const tt = goal.target_time != null ? Number(goal.target_time) : null;
  const rr = computeRaceReadiness({
    learnedFitness,
    effortPaces: (row?.effort_paces as Record<string, unknown>) || null,
    performanceNumbers: (row?.performance_numbers as Record<string, unknown>) || null,
    primaryEvent: {
      name: goal.name,
      distance: goal.distance,
      target_date: String(goal.target_date).slice(0, 10),
      target_time: tt != null && Number.isFinite(tt) && tt > 0 ? tt : null,
      sport: goal.sport,
    },
    weeksOut,
    weeklyReadinessLabel: null,
    readinessDrivers: [],
    hrDriftAvgBpm: null,
    hrDriftNorm28dBpm: null,
    easyRunDecouplingPct: null,
  });

  if (!rr) return null;
  return parseClientPredictedFinishSeconds(rr.predicted_finish_time_seconds);
}
