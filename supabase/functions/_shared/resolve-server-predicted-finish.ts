/**
 * Pace anchor for terrain strategy (single server resolver):
 * 1) goals.race_readiness_projection — written when coach runs
 * 2) coach_cache.payload.race_finish_projection_v1 (goal_id match) — unified with State tab
 * 3) Legacy: coach_cache.payload.race_readiness when primary_event matched course goal (pre-v1 projection)
 * 4) User plan / goal race target (resolveGoalTargetTimeSeconds) — only if baseline fitness does not
 *    contradict a faster stated goal (if stated is faster than server fitness projection, anchor to fitness)
 * 5) Baseline VDOT computeRaceReadiness — when no usable plan target, or plan is slower/equal to fitness
 *
 * Clients must not send predicted_finish_time_seconds; course-detail / course-strategy use this only.
 */
import { computeRaceReadiness } from './race-readiness/index.ts';
import { parseLocalDate } from './parse-local-date.ts';
import { parseClientPredictedFinishSeconds } from './resolve-goal-target-time.ts';
import { fmtFinishClock } from './course-strategy-helpers.ts';

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

export type PaceAnchorKind =
  | 'coach_readiness'
  | 'plan_target'
  | 'baseline_vdot'
  /** Stated goal/plan time was faster than server fitness projection; anchor uses fitness. */
  | 'fitness_floors_stated_goal';

/** Unified finish-time block for coach payload + course-detail + State. */
export type RaceFinishProjectionV1 = {
  goal_id: string;
  anchor_seconds: number;
  anchor_display: string;
  source_kind: PaceAnchorKind;
  plan_goal_seconds: number | null;
  plan_goal_display: string | null;
  mismatch_blurb: string | null;
  /**
   * Conservative fitness clock from baselines + race readiness (VDOT path), independent of pacing anchor.
   * Omitted or null when distance/date/sport/baselines do not support a projection.
   */
  fitness_projection_seconds?: number | null;
  fitness_projection_display?: string | null;
};

function isUsableRfp(r: RaceFinishProjectionV1 | null | undefined): r is RaceFinishProjectionV1 {
  if (!r || typeof r !== 'object') return false;
  if (!r.goal_id || String(r.goal_id).trim() === '') return false;
  const s = Number(r.anchor_seconds);
  return Number.isFinite(s) && s > 0;
}

/** Root wins (fresh invoke); weekly_state_v1 is fallback for partial/old rows. */
export function pickRaceFinishProjectionV1FromCoachPayload(
  payload: Record<string, unknown> | null | undefined,
): RaceFinishProjectionV1 | null {
  if (!payload) return null;
  const root = payload.race_finish_projection_v1 as RaceFinishProjectionV1 | null | undefined;
  if (isUsableRfp(root)) return root;
  const wsv = payload.weekly_state_v1 as { race_finish_projection_v1?: RaceFinishProjectionV1 | null } | undefined;
  const nested = wsv?.race_finish_projection_v1;
  if (isUsableRfp(nested)) return nested;
  return null;
}

export function pickRaceFinishProjectionV1ForCourseGoal(
  payload: Record<string, unknown> | null | undefined,
  courseGoalId: string,
): RaceFinishProjectionV1 | null {
  const r = pickRaceFinishProjectionV1FromCoachPayload(payload);
  if (!r || String(r.goal_id) !== String(courseGoalId)) return null;
  return r;
}

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

  const rfp = pickRaceFinishProjectionV1ForCourseGoal(payload, courseGoalId);
  if (rfp != null) {
    const s = Number(rfp.anchor_seconds);
    if (Number.isFinite(s) && s > 0) return s;
  }

  // Legacy: pre-race_finish_projection_v1 rows only had race_readiness aligned to primary_event
  const gc = payload.goal_context as Record<string, unknown> | undefined;
  const primary = gc?.primary_event as { id?: string } | undefined;
  if (!primary?.id || String(primary.id) !== String(courseGoalId)) return null;

  const rr = payload.race_readiness as Record<string, unknown> | null | undefined;
  if (!rr) return null;
  return parseClientPredictedFinishSeconds(rr.predicted_finish_time_seconds);
}

export type PaceAnchorResult = {
  seconds: number;
  kind: PaceAnchorKind;
};

/**
 * @param planTargetSec — goal.target_time or linked plan config (already resolved).
 * @param courseGoalId — goals.id for this race course.
 */
export async function resolvePaceAnchorForCourse(
  supabase: any,
  userId: string,
  goal: GoalRowForPrediction,
  courseGoalId: string,
  planTargetSec: number | null,
  /** When set (including `null`), skips a second `resolveServerPredictedFinishSeconds` call. */
  precomputedFitnessSec?: number | null,
): Promise<PaceAnchorResult | null> {
  const fromGoalRow = parseGoalRaceReadinessProjection(goal.race_readiness_projection);
  if (fromGoalRow != null) return { seconds: fromGoalRow, kind: 'coach_readiness' };

  const fromCache = await readPredictedFinishFromCoachCache(supabase, userId, courseGoalId);
  if (fromCache != null) return { seconds: fromCache, kind: 'coach_readiness' };

  const pt =
    planTargetSec != null && Number.isFinite(planTargetSec) && planTargetSec > 0
      ? Math.round(planTargetSec)
      : null;

  const fitnessSec =
    precomputedFitnessSec !== undefined
      ? precomputedFitnessSec
      : await resolveServerPredictedFinishSeconds(supabase, userId, goal);

  if (pt != null && fitnessSec != null && pt < fitnessSec) {
    return { seconds: fitnessSec, kind: 'fitness_floors_stated_goal' };
  }

  if (pt != null) return { seconds: pt, kind: 'plan_target' };

  if (fitnessSec != null) return { seconds: fitnessSec, kind: 'baseline_vdot' };

  return null;
}

/**
 * Canonical race finish projection for coach payload + course-detail.
 * Mirrors course-detail header logic: anchor from resolvePaceAnchorForCourse, then plan-only fallback.
 */
export async function buildRaceFinishProjectionV1(
  supabase: any,
  userId: string,
  goal: GoalRowForPrediction,
  goalId: string,
  planGoalSec: number | null,
  /** When set (e.g. coach merged user_baselines + plans.config.effort_score), used for VDOT path. */
  effortPacesOverlay?: Record<string, unknown> | null,
): Promise<RaceFinishProjectionV1 | null> {
  const fitnessSec = await resolveServerPredictedFinishSeconds(supabase, userId, goal, effortPacesOverlay);
  const anchor = await resolvePaceAnchorForCourse(
    supabase,
    userId,
    goal,
    goalId,
    planGoalSec,
    fitnessSec,
  );
  let primarySec = anchor?.seconds ?? null;
  let sourceKind: PaceAnchorKind | null = anchor?.kind ?? null;

  if (primarySec == null && planGoalSec != null) {
    primarySec = planGoalSec;
    sourceKind = 'plan_target';
  }
  if (primarySec == null || sourceKind == null) return null;

  const planGoalDisplay = planGoalSec != null ? fmtFinishClock(planGoalSec) : null;

  const fitnessRounded =
    fitnessSec != null && Number.isFinite(fitnessSec) && fitnessSec > 0 ? Math.round(fitnessSec) : null;

  let mismatchBlurb: string | null = null;
  if (anchor && planGoalSec != null) {
    if (anchor.kind === 'coach_readiness' && planGoalSec !== anchor.seconds) {
      mismatchBlurb =
        'Projected time follows current training data; it can differ from the goal time you saved.';
    } else if (anchor.kind === 'fitness_floors_stated_goal') {
      mismatchBlurb =
        'Pacing uses the slower fitness-based time because your saved goal is faster than that estimate.';
    }
  }

  return {
    goal_id: goalId,
    anchor_seconds: primarySec,
    anchor_display: fmtFinishClock(primarySec),
    source_kind: sourceKind,
    plan_goal_seconds: planGoalSec,
    plan_goal_display: planGoalDisplay,
    mismatch_blurb: mismatchBlurb,
    fitness_projection_seconds: fitnessRounded,
    fitness_projection_display: fitnessRounded != null ? fmtFinishClock(fitnessRounded) : null,
  };
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
  /** Coach-only: merged baselines + plan `effort_score` paces when `user_baselines.effort_paces` is empty. */
  effortPacesOverlay?: Record<string, unknown> | null,
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
  const baseEp = (row?.effort_paces as Record<string, unknown>) || null;
  const effortPacesMerged = (() => {
    const steadyOk = (p: Record<string, unknown> | null) =>
      p != null && p.steady != null && Number(p.steady) > 0;
    if (steadyOk(baseEp)) return baseEp;
    if (effortPacesOverlay != null && steadyOk(effortPacesOverlay)) return effortPacesOverlay;
    return baseEp ?? effortPacesOverlay ?? null;
  })();

  let weeksOut = 0;
  try {
    const race = parseLocalDate(String(goal.target_date).slice(0, 10));
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
    effortPaces: effortPacesMerged,
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
