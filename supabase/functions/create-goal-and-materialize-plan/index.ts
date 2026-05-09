import { createClient } from 'jsr:@supabase/supabase-js@2';
import { invalidateUserTrainingCache } from '../_shared/invalidate-user-training-cache.ts';
import {
  getLatestAthleteMemory,
  resolveAdaptiveMarathonDecisionFromMemory,
  resolveMarathonMinWeeksFromMemory,
} from '../_shared/athlete-memory.ts';
import { getArcContext, type ArcContext } from '../_shared/arc-context.ts';
import { inferTrainingFitnessLevel } from '../_shared/infer-training-fitness.ts';
import {
  computeRunPlanningSignals,
  findPostRaceRecoveryContext,
  type PostRaceRecoveryResult,
  swimSecPer100YdFromArcSwimInputs,
  swimVolumeMultiplierFromArcWorkouts,
  type TrainingTransition,
} from '../_shared/planning-context.ts';
import { normalizeGoalDistanceKey, projectRaceSplits } from '../_shared/race-projections.ts';
import { buildSwimCutoffPressureV1, type SwimCutoffPressureV1 } from '../_shared/swim-cutoff-pressure.ts';
import { recomputeRaceProjectionsForUser } from '../_shared/recompute-goal-race-projections.ts';
import { normalizeTrainingIntent, trainingIntentToPrefsGoalType } from '../_shared/training-intent.ts';
import {
  anchoredSwimSlotsForFocusPromotion,
  deriveRestDaysForBudget,
  mergeCombinedSchedulePrefs,
  parsePreferredDaysPatch,
  readDaysPerWeekFromPrefs,
} from '../_shared/combined-schedule-prefs.ts';
import { fixTransposedEasyBikeRunAgainstSwimOrder } from '../_shared/tri-preferred-days-sanity.ts';
import {
  aggregateOptimizerScheduleSignals,
  buildCombinedPlanGenerationTradeOffs,
  enrichScheduleSignalsWithCombinedPlanTradeOffs,
  stripStaleQualityRunUnplacedFromScheduleSignals,
  type BackfillOptimizerSnapshot,
  type PlanOptimizerSnapshotInput,
  type ScheduleSignals,
} from '../_shared/plan-generation-trade-offs.ts';
import {
  readStrengthFrequencyForOptimizer,
  readSwimsPerWeekForOptimizer,
} from '../_shared/tri-optimizer-prefs.ts';
import {
  deriveOptimalWeekWithCoEqualRecovery,
  normalizeDayName,
  validatePreferredDays,
  type AnchorWithIntensity,
  type DayName,
  type PreferredDaysOut,
  type WeekOptimizerInputs,
} from '../_shared/week-optimizer.ts';
import {
  validateCombinedSchedulePrefsCollision,
  validateTrainingPrefsScheduleCollision,
} from '../_shared/prefs-to-collision-model.ts';
import { normalizeGoalDistanceToTriCollisionDistance } from '../_shared/resolve-schedule-collisions.ts';
import {
  hasBarbellCapability,
  hasCableMachine,
  hasGHD,
  resolveStrengthEquipmentTypeForPlan,
} from '../_shared/strength-equipment-tier.ts';
import { resolveProtocolIdForCombinedTriPlan } from '../shared/strength-system/protocols/selector.ts';
import {
  calculateEffortScore,
  estimateVdotFromBasePace,
  estimateVdotFromPace,
  getPacesFromScore,
  type TrainingPaces,
} from '../generate-run-plan/effort-score.ts';

type GoalAction = 'keep' | 'replace';
type RequestMode = 'create' | 'build_existing' | 'link_existing';

interface CreateGoalRequest {
  user_id: string;
  mode?: RequestMode;
  action?: GoalAction;
  existing_goal_id?: string | null;
  replace_goal_id?: string | null;
  replace_plan_id?: string | null;
  plan_id?: string | null;
  goal?: {
    name: string;
    target_date: string;
    sport: string;
    distance: string | null;
    training_prefs: Record<string, any>;
    notes?: string | null;
  };
  /** When set, combined-plan + run/tri generators use this anchor instead of guessing. */
  plan_start_date?: string | null;
  /**
   * When true, `generate-combined-plan` runs in preview mode (no plan row, no activate).
   * `build_existing` skips persisting the merged `training_prefs` until a non-preview call.
   */
  preview?: boolean;
  /**
   * Ephemeral conflict preferences accumulated by the conflict-resolution UI loop.
   * Merged into `training_prefs.conflict_preferences` in memory so week-builder can honour
   * them without a DB write during preview iterations. On the final non-preview call they
   * are persisted via the normal `training_prefs` update.
   */
  ephemeral_conflict_preferences?: Record<string, string>;
  /**
   * When true on triathlon saves/builds: reject with `error_code` from coarse schedule collision
   * resolver (`SCHEDULE_GRIDLOCK_*`) if anchors cannot satisfy invariants — opt-in for Arc/wizard hard saves.
   */
  strict_schedule_prefs?: boolean;
}

class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `sub` from a user access JWT, or null if not an authenticated caller token. */
function authenticatedSubFromBearer(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? '';
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = JSON.parse(atob(b64 + pad)) as { role?: string; sub?: string; aud?: string | string[] };
    const role = typeof json?.role === 'string' ? json.role : '';
    const audRaw = json.aud;
    const aud = Array.isArray(audRaw) ? audRaw[0] : typeof audRaw === 'string' ? audRaw : '';
    const sub = typeof json?.sub === 'string' ? json.sub.trim() : '';
    const isAuthed = role === 'authenticated' || aud === 'authenticated';
    const isAnon = role === 'anon' || aud === 'anon';
    if (isAuthed && !isAnon && UUID_RE.test(sub)) return sub;
  } catch {
    /* invalid JWT */
  }
  return null;
}

/**
 * User id for all DB work = JWT `sub`. Body `user_id` is legacy; if sent, it must
 * equal `sub` or we fail fast (no silent override).
 */
function requireUserIdFromRequest(req: Request, bodyUserId: unknown): string {
  const sub = authenticatedSubFromBearer(req);
  if (!sub) {
    throw new AppError(
      'invalid_auth',
      'Sign in required: call this function with your user access token (Authorization: Bearer …).',
      401,
    );
  }
  const fromBody = typeof bodyUserId === 'string' ? bodyUserId.trim() : '';
  if (fromBody && fromBody !== sub) {
    throw new AppError('user_id_mismatch', 'user_id must match the signed-in user', 400);
  }
  return sub;
}

function trimId(id: unknown): string | undefined {
  if (id == null) return undefined;
  const s = String(id).trim();
  return s.length > 0 ? s : undefined;
}

const DISTANCE_TO_API: Record<string, string> = {
  '5K': '5k',
  '10K': '10k',
  'Half Marathon': 'half',
  Marathon: 'marathon',
  Ultra: 'marathon',
};

// Triathlon distance label → generate-triathlon-plan distance key
const TRI_DISTANCE_TO_API: Record<string, string> = {
  'Sprint': 'sprint',
  'sprint': 'sprint',
  'Olympic': 'olympic',
  'olympic': 'olympic',
  '70.3': '70.3',
  'Half-Iron': '70.3',
  'Half Iron': '70.3',
  'half-iron': '70.3',
  'Ironman': 'ironman',
  'ironman': 'ironman',
  'Full': 'ironman',
  'full': 'ironman',
};

const TRI_MIN_WEEKS: Record<string, Record<string, number>> = {
  sprint:  { beginner: 8,  intermediate: 6,  advanced: 6  },
  olympic: { beginner: 10, intermediate: 8,  advanced: 8  },
  '70.3':  { beginner: 14, intermediate: 12, advanced: 10 },
  ironman: { beginner: 20, intermediate: 18, advanced: 16 },
};

const MIN_WEEKS: Record<string, Record<string, number>> = {
  marathon: { beginner: 14, intermediate: 10, advanced: 8 },
  half: { beginner: 8, intermediate: 4, advanced: 4 },
  '10k': { beginner: 4, intermediate: 4, advanced: 4 },
  '5k': { beginner: 4, intermediate: 4, advanced: 4 },
};
const ADAPTIVE_MARATHON_DECISIONS_ENABLED = (Deno.env.get('ADAPTIVE_MARATHON_DECISIONS_ENABLED') ?? 'true') !== 'false';

function weeksBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

// How many weeks of plan do we need to cover a future race date?
// Uses ceil so a race on day 48 (6.857 weeks) counts as 7 plan weeks,
// placing the race correctly in the final week rather than one week past it.
function weeksUntilRace(today: Date, raceDate: Date): number {
  const ms = raceDate.getTime() - today.getTime();
  return Math.ceil(ms / (7 * 24 * 60 * 60 * 1000));
}

function distanceToApiValue(distance: string | null): string {
  if (!distance) return '';
  return DISTANCE_TO_API[distance] || String(distance).toLowerCase();
}

function parseLearnedFitnessForSeed(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return typeof o === 'object' && o && !Array.isArray(o) ? o as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

/** Prefer learned_fitness for seeding when confidence is `medium` or `high` (not `low` or missing). */
function learnedPaceUsable(
  m: unknown,
): m is { value: number; confidence: string } {
  if (!m || typeof m !== 'object') return false;
  const c = String((m as { confidence?: string }).confidence || '').toLowerCase();
  if (c !== 'medium' && c !== 'high') return false;
  const v = Number((m as { value?: number }).value);
  return Number.isFinite(v) && v > 0;
}

function secPerKmToSecPerMi(secKm: number): number {
  return secKm * 1.60934;
}

/**
 * Merges `user_baselines.learned_fitness` run paces (medium/high confidence) over
 * performance / race-derived paces, and provides `effort_score` when the plan must be
 * anchored only on learned data (generate-run requires score or source).
 */
type RunMergeResult =
  & {
    effort_paces: TrainingPaces;
    base_pace_field: 'learned_fitness' | 'performance_numbers';
    steady_pace_field: 'learned_fitness' | 'performance_numbers';
  }
  & (
    | { effort_bearer: 'source'; effort_source_distance: number; effort_source_time: number }
    | { effort_bearer: 'score'; effort_score: number }
  );

function mergeRunPerformanceSeeds(
  baseline: Record<string, unknown> | null | undefined,
): RunMergeResult | null {
  if (!baseline) return null;
  const learned = parseLearnedFitnessForSeed(baseline.learned_fitness);
  const th = learned?.run_threshold_pace_sec_per_km;
  const easy = learned?.run_easy_pace_sec_per_km;
  const hasLearnedTh = learnedPaceUsable(th);
  const hasLearnedEasy = learnedPaceUsable(easy);

  let foundation: TrainingPaces | null = null;
  let anchorVdot: number | undefined;
  const rawPaces = baseline.effort_paces as Record<string, unknown> | null | undefined;
  const hasBaselineRacePace = rawPaces && Number.isFinite(Number(rawPaces.race));

  if (hasBaselineRacePace) {
    foundation = { ...rawPaces } as TrainingPaces;
  } else if (baseline.effort_source_distance && baseline.effort_source_time) {
    const s = calculateEffortScore(
      Number(baseline.effort_source_distance),
      Number(baseline.effort_source_time),
    );
    foundation = getPacesFromScore(s);
    anchorVdot = s;
  } else if (baseline.effort_score != null && Number.isFinite(Number(baseline.effort_score))) {
    const s = Number(baseline.effort_score);
    foundation = getPacesFromScore(s);
    anchorVdot = s;
  } else if (hasLearnedTh) {
    const tMi = secPerKmToSecPerMi(Number((th as { value: number }).value));
    const v = estimateVdotFromPace(tMi);
    if (v != null) {
      foundation = getPacesFromScore(v);
      anchorVdot = v;
    }
  } else if (hasLearnedEasy) {
    const bMi = secPerKmToSecPerMi(Number((easy as { value: number }).value));
    const v = estimateVdotFromBasePace(bMi);
    if (v != null) {
      foundation = getPacesFromScore(v);
      anchorVdot = v;
    }
  }
  if (!foundation) return null;

  const paces: TrainingPaces = { ...foundation };
  let baseField: 'learned_fitness' | 'performance_numbers' = 'performance_numbers';
  let steadyField: 'learned_fitness' | 'performance_numbers' = 'performance_numbers';

  if (hasLearnedTh) {
    paces.steady = Math.round(secPerKmToSecPerMi(Number((th as { value: number }).value)));
    steadyField = 'learned_fitness';
  }
  if (hasLearnedEasy) {
    paces.base = Math.round(secPerKmToSecPerMi(Number((easy as { value: number }).value)));
    baseField = 'learned_fitness';
  }
  if (!paces.race || !Number.isFinite(paces.race)) return null;

  if (baseline.effort_source_distance && baseline.effort_source_time) {
    return {
      effort_bearer: 'source',
      effort_source_distance: Number(baseline.effort_source_distance),
      effort_source_time: Number(baseline.effort_source_time),
      effort_paces: paces,
      base_pace_field: baseField,
      steady_pace_field: steadyField,
    };
  }
  if (baseline.effort_score != null && Number.isFinite(Number(baseline.effort_score))) {
    return {
      effort_bearer: 'score',
      effort_score: Number(baseline.effort_score),
      effort_paces: paces,
      base_pace_field: baseField,
      steady_pace_field: steadyField,
    };
  }
  if (anchorVdot != null) {
    return {
      effort_bearer: 'score',
      effort_score: anchorVdot,
      effort_paces: paces,
      base_pace_field: baseField,
      steady_pace_field: steadyField,
    };
  }
  return null;
}

function isMarathonDistance(distance: string | null | undefined): boolean {
  return String(distance || '').trim().toLowerCase() === 'marathon';
}

/** YYYY-MM-DD when valid; avoids UTC drift from Date.toISOString(). */
function normalizeDateOnlyYmd(raw: unknown): string | null {
  const t = String(raw ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Monday of the server's *local calendar* week — use local getters, not toISOString() (UTC). */
function currentWeekMondayISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * After a new plan is generated, linked to a goal, and activate-plan has run, retire any
 * competing active plans that would double-book the calendar. The run path had this;
 * the tri path returned early and skipped it, duplicating every workout. Both paths use this.
 */
async function retireCompetingActivePlans(
  supabase: ReturnType<typeof createClient>,
  user_id: string,
  newPlanId: string,
  params: { mode: RequestMode; existing_goal_id?: string | null; replace_plan_id?: string | null },
): Promise<void> {
  const { mode, existing_goal_id, replace_plan_id } = params;
  if (replace_plan_id) {
    const weekStart = currentWeekMondayISO();
    await supabase.from('planned_workouts').delete().eq('training_plan_id', replace_plan_id).gte('date', weekStart);
    await supabase.from('plans').update({ status: 'ended' }).eq('id', replace_plan_id).eq('user_id', user_id);
  }
  if (mode === 'build_existing' && existing_goal_id) {
    const { data: priorLinkedPlans } = await supabase
      .from('plans')
      .select('id,status')
      .eq('user_id', user_id)
      .eq('goal_id', existing_goal_id)
      .eq('status', 'active');
    const weekStart = currentWeekMondayISO();
    for (const p of priorLinkedPlans || []) {
      if (p.id === newPlanId) continue;
      await supabase.from('planned_workouts').delete().eq('training_plan_id', p.id).gte('date', weekStart);
      await supabase.from('plans').update({ status: 'ended' }).eq('id', p.id).eq('user_id', user_id);
    }
  }
  const { data: unlinkedPlans } = await supabase
    .from('plans')
    .select('id, config, plan_type, status')
    .eq('user_id', user_id)
    .is('goal_id', null)
    .in('status', ['active', 'paused']);
  for (const p of unlinkedPlans || []) {
    const planType = String(p.plan_type || '').toLowerCase();
    const planSport = String(p.config?.sport || '').toLowerCase();
    const looksRun = planSport === 'run' || planType.includes('run');
    if (!looksRun || p.id === newPlanId) continue;
    const weekStart = currentWeekMondayISO();
    await supabase.from('planned_workouts').delete().eq('training_plan_id', p.id).gte('date', weekStart);
    await supabase.from('plans').update({ status: 'ended' }).eq('id', p.id).eq('user_id', user_id);
  }
}

async function invokeFunction(functionsBaseUrl: string, serviceKey: string, name: string, body: Record<string, any>) {
  const resp = await fetch(`${functionsBaseUrl}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });

  let payload: any = null;
  try {
    payload = await resp.json();
  } catch {
    payload = null;
  }

  if (!resp.ok) {
    const detail = payload?.error || payload?.message || `${name} failed (${resp.status})`;
    throw new AppError('downstream_function_failed', detail, 400);
  }
  return payload;
}

/** Swim rows from generate-combined-plan — log here so they appear on create-goal-and-materialize-plan (the HTTP caller). Downstream buildWeek logs only appear under function `generate-combined-plan`. */
function logSwimSessionsMirrorFromCombined(
  combined: Record<string, unknown> | null | undefined,
  invokeKind: 'preview' | 'full',
): void {
  try {
    if (!combined || typeof combined !== 'object') return;
    const sbw = combined.sessions_by_week as Record<string, unknown> | undefined;
    if (!sbw || typeof sbw !== 'object') return;
    let swim_sessions_logged = 0;
    for (const [wk, sess] of Object.entries(sbw)) {
      if (!Array.isArray(sess)) continue;
      for (const raw of sess) {
        if (!raw || typeof raw !== 'object') continue;
        const s = raw as Record<string, unknown>;
        const type = String(s.type ?? s.discipline ?? '').toLowerCase();
        if (type !== 'swim') continue;
        swim_sessions_logged += 1;
        console.log('[SWIM-DEBUG] creating session', {
          invokeKind,
          week_key: wk,
          day: s.day,
          name: s.name,
          session_kind: s.session_kind ?? null,
        });
      }
    }
    console.log('[SWIM-DEBUG] swim session mirror summary', { invokeKind, swim_sessions_logged });
  } catch (e) {
    console.warn('[SWIM-DEBUG] mirror failed', e);
  }
}

function inferLimiterSportFromArc(arc: ArcContext): 'swim' | 'bike' | 'run' {
  const swim = arc.swim_training_from_workouts;
  if (swim && swim.completed_swim_sessions_last_90_days === 0) return 'swim';
  const lf = arc.learned_fitness as Record<string, unknown> | null | undefined;
  const ftp = lf?.ride_ftp_estimated as { confidence?: string } | undefined;
  if (ftp && typeof ftp === 'object' && String(ftp.confidence || '').toLowerCase() === 'low') {
    return 'bike';
  }
  return 'run';
}

/**
 * Arc-created goals may omit tri training_prefs; never fail "Missing fitness" — fill from ArcContext.
 * Matches persist-side enrichment in ArcSetupChat.
 */
function mergeTrainingPrefsWithArcDefaults(
  trainingPrefs: Record<string, unknown> | null | undefined,
  sportRaw: string | null | undefined,
  arc: ArcContext,
): Record<string, unknown> {
  const tp: Record<string, unknown> = {
    ...(trainingPrefs && typeof trainingPrefs === 'object' && !Array.isArray(trainingPrefs) ? trainingPrefs : {}),
  };
  const sport = String(sportRaw || '').toLowerCase();
  const isTri = sport === 'triathlon' || sport === 'tri';
  const isRun = sport === 'run';

  if (isTri || isRun) {
    if (!String(tp.fitness ?? '').trim()) tp.fitness = 'intermediate';
    if (!String(tp.goal_type ?? '').trim()) tp.goal_type = 'complete';
  }

  if (isTri || isRun) {
    const arcDef =
      arc.athlete_identity && typeof arc.athlete_identity === 'object' && arc.athlete_identity !== null
        ? (arc.athlete_identity as Record<string, unknown>)['default_intent']
        : null;
    const sp = String(tp.goal_type ?? 'complete').toLowerCase() === 'speed' ? 'performance' : 'completion';
    const tid = (tp as { training_intent?: unknown }).training_intent;
    if (!String(tid ?? '').trim() && arcDef != null) {
      const ni = normalizeTrainingIntent(arcDef, sp);
      (tp as { training_intent: string }).training_intent = ni;
      tp.goal_type = trainingIntentToPrefsGoalType(ni);
    } else if (String(tid ?? '').trim()) {
      const ni = normalizeTrainingIntent(tid, sp);
      (tp as { training_intent: string }).training_intent = ni;
      tp.goal_type = trainingIntentToPrefsGoalType(ni);
    } else {
      (tp as { training_intent: string }).training_intent = sp;
    }
  }

  if (isTri) {
    if (tp.strength_frequency == null || Number.isNaN(Number(tp.strength_frequency))) {
      tp.strength_frequency = 2;
    }
    if (!String(tp.equipment_type ?? '').trim()) {
      const raw = arc.equipment as { strength?: string[] } | null | undefined;
      const arr = Array.isArray(raw?.strength) ? raw.strength : [];
      tp.equipment_type = hasBarbellCapability(arr) ? 'commercial_gym' : 'home_gym';
    } else if (String(tp.equipment_type).trim().toLowerCase() === 'home_gym') {
      const raw = arc.equipment as { strength?: string[] } | null | undefined;
      const arr = Array.isArray(raw?.strength) ? raw.strength : [];
      if (hasBarbellCapability(arr)) tp.equipment_type = 'commercial_gym';
    }
    if (!String(tp.limiter_sport ?? '').trim()) {
      tp.limiter_sport = inferLimiterSportFromArc(arc);
    }
    if (!String(tp.tri_approach ?? '').trim()) {
      const intent = normalizeTrainingIntent((tp as { training_intent?: unknown }).training_intent, 'completion');
      tp.tri_approach = intent === 'performance' ? 'race_peak' : 'base_first';
    }
    if (!String(tp.strength_protocol ?? '').trim()) {
      const focus = String(tp.strength_focus ?? '').toLowerCase();
      if (focus === 'power') tp.strength_protocol = 'neural_speed';
      else if (focus === 'maintenance') tp.strength_protocol = 'durability';
    }
    if (tp.strength_intent !== 'support' && tp.strength_intent !== 'performance') {
      const focus = String(tp.strength_focus ?? '').toLowerCase();
      if (focus === 'power') tp.strength_intent = 'performance';
      else if (focus === 'maintenance') tp.strength_intent = 'support';
    }
  }
  return tp;
}

function inferStrengthIntentFromAthleteIdentity(arc: ArcContext): 'support' | 'performance' {
  const id = arc.athlete_identity;
  if (!id || typeof id !== 'object') return 'support';
  const rawSp = (id as Record<string, unknown>).season_priorities;
  if (rawSp && typeof rawSp === 'object' && !Array.isArray(rawSp)) {
    const st = String((rawSp as Record<string, unknown>).strength ?? '').toLowerCase().trim();
    if (st === 'performance') return 'performance';
  }
  return 'support';
}

function inferTrainingIntentFromPrefs(
  trainingPrefs: Record<string, unknown>,
): 'performance' | 'completion' | 'first_race' | 'comeback' | undefined {
  const raw = trainingPrefs.training_intent ?? trainingPrefs.trainingIntent;
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'performance' || s === 'completion' || s === 'first_race' || s === 'comeback') return s;
  return undefined;
}

/** Pull a normalized day name from preferred_days under any of the accepted aliases. */
function pdDay(pd: Record<string, unknown> | null, ...keys: string[]): DayName | undefined {
  if (!pd) return undefined;
  for (const k of keys) {
    const v = normalizeDayName(pd[k]);
    if (v) return v;
  }
  return undefined;
}

/** Pull a day-name array under any alias. */
function pdDays(pd: Record<string, unknown> | null, ...keys: string[]): DayName[] | undefined {
  if (!pd) return undefined;
  for (const k of keys) {
    const v = pd[k];
    if (Array.isArray(v)) {
      const out = v.map((x) => normalizeDayName(x)).filter((x): x is DayName => !!x);
      if (out.length) return out;
    }
  }
  return undefined;
}

/**
 * Scan one serialized week from `sessions_by_week` (post–generate-combined-plan).
 * Used only for `[buildCombinedPlan] anchors_honored` — confirms the emitted plan, not inputs.
 *
 * Prefers **`session_kind`** (generate-combined-plan contract) so recovery weeks that rename
 * mid-week bike to "Easy Ride" still report `quality_bike: null` only when the slot truly
 * is not `quality_bike`. Falls back to display-name regex for legacy rows without `session_kind`.
 */
function summarizeAnchorsHonoredFromWeekSessions(sessions: unknown): {
  quality_bike: string | null;
  strength_days: string[];
  group_run_day: string | null;
} {
  const arr = Array.isArray(sessions) ? sessions : [];
  const strengthDays: string[] = [];
  let qualityBike: string | null = null;
  let groupRun: string | null = null;
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const day = typeof s.day === 'string' ? s.day : null;
    if (!day) continue;
    const name = String(s.name ?? '');
    const type = String(s.type ?? s.discipline ?? '').toLowerCase();
    const skRaw = s.session_kind;
    const sk = typeof skRaw === 'string' && skRaw.length > 0 ? skRaw : '';

    const isStrength =
      type === 'strength' ||
      sk === 'upper_body_strength' ||
      sk === 'lower_body_strength';
    if (isStrength && !strengthDays.includes(day)) strengthDays.push(day);

    if (type === 'ride' || type === 'bike') {
      const legacyQualityBikeName =
        /\bgroup\s*ride\b/i.test(name) ||
        /\bsweet\s*spot\b/i.test(name) ||
        (/\bthreshold\b/i.test(name) && !/\brun\b/i.test(name));
      if (sk === 'quality_bike' || (!sk && legacyQualityBikeName)) {
        qualityBike ??= day;
      }
    }
    if (type === 'run') {
      const legacyQualityRunName =
        /\bintervals?\b|\bthreshold\b|\btempo\b|\btrack\b|\bvo2\b|\bhmp\b|\bhalf-?marathon\s+pace\b/i.test(
          name,
        );
      if (sk === 'quality_run' || (!sk && legacyQualityRunName)) {
        groupRun ??= day;
      }
    }
  }
  strengthDays.sort();
  return { quality_bike: qualityBike, strength_days: strengthDays, group_run_day: groupRun };
}

function pickCanonicalWeekSessions(
  sessionsByWeek: Record<string, unknown> | null | undefined,
  assessmentFirst: boolean,
): { weekKey: string; sessions: unknown[] } {
  if (!sessionsByWeek || typeof sessionsByWeek !== 'object') {
    return { weekKey: '', sessions: [] };
  }
  const tryKeys = assessmentFirst ? ['2', '3', '1'] : ['1', '2', '3'];
  for (const k of tryKeys) {
    const w = sessionsByWeek[k];
    if (Array.isArray(w) && w.length > 0) return { weekKey: k, sessions: w };
  }
  const sorted = Object.keys(sessionsByWeek).sort((a, b) => Number(a) - Number(b));
  const first = sorted[0];
  const w = first != null ? sessionsByWeek[first] : undefined;
  return { weekKey: first ?? '', sessions: Array.isArray(w) ? w : [] };
}

/**
 * Defense in depth: ensure tri goals have `strength_intent` and a matrix-valid
 * `preferred_days` before any generator runs. Replaces the legacy static
 * DEFAULT_TRI_PREFERRED_DAYS fallback (which produced sequential conflicts) with
 * the executable matrix-as-code derivation in `_shared/week-optimizer.ts`.
 *
 * Behavior:
 *  - If `preferred_days` is missing → derive a complete week from anchors + prefs.
 *  - If `preferred_days` is present and validates clean → leave it alone.
 *  - If `preferred_days` is present but fails the matrix → re-derive, treating the
 *    user's existing slots as anchors (so we honor the athlete's intent).
 *
 * Mutates `trainingPrefs` in place. Returns human-readable notes for logging
 * and an optional optimizer snapshot for persisting `plans.generation_trade_offs`.
 */
function backfillTriTrainingPrefsDefenseInDepth(
  trainingPrefs: Record<string, unknown>,
  arc: ArcContext,
): { notes: string[]; optimizer_snapshot: BackfillOptimizerSnapshot | null } {
  const notes: string[] = [];
  const si = trainingPrefs.strength_intent ?? trainingPrefs.strengthIntent;
  if (si !== 'support' && si !== 'performance') {
    trainingPrefs.strength_intent = inferStrengthIntentFromAthleteIdentity(arc);
    notes.push(`strength_intent→${trainingPrefs.strength_intent}`);
  }

  const pdRaw = trainingPrefs.preferred_days ?? trainingPrefs.preferredDays;
  let pd = pdRaw && typeof pdRaw === 'object' && !Array.isArray(pdRaw)
    ? (pdRaw as Record<string, unknown>)
    : null;

  if (pd) {
    const fixedPd = fixTransposedEasyBikeRunAgainstSwimOrder(pd);
    const changed = JSON.stringify(fixedPd) !== JSON.stringify(pd);
    if (changed) {
      pd = fixedPd;
      trainingPrefs.preferred_days = fixedPd;
      delete trainingPrefs.preferredDays;
      notes.push('preferred_days: corrected easy_bike/easy_run transpose vs swim[0]/swim[1]');
    }
  }

  // ── Pull existing slots as anchors / preferences for the optimizer ───────
  const longRide = pdDay(pd, 'long_ride', 'longRide');
  const longRun = pdDay(pd, 'long_run', 'longRun');
  const qualityBike = pdDay(pd, 'quality_bike', 'qualityBike', 'bike_quality');
  const qualityRunDay = pdDay(pd, 'quality_run', 'qualityRun', 'run_quality');
  const easyBikeDay = pdDay(pd, 'easy_bike', 'easyBike', 'bike_easy');
  const easyRunDay = pdDay(pd, 'easy_run', 'easyRun', 'run_easy');
  const swimDays = pdDays(pd, 'swim');
  const strengthDaysIn = pdDays(pd, 'strength', 'strength_days');

  const dpw = readDaysPerWeekFromPrefs(trainingPrefs) ?? 7;
  const trainingDays = (Math.max(4, Math.min(7, Math.round(dpw))) as 4 | 5 | 6 | 7);
  const swimsPerWeek = readSwimsPerWeekForOptimizer(trainingPrefs, swimDays?.length);
  const strengthFreq = readStrengthFrequencyForOptimizer(trainingPrefs, strengthDaysIn?.length);
  const restDaysIn = pdDays(trainingPrefs as Record<string, unknown>, 'rest_days', 'restDays');
  const rawHardBikeAvoid =
    trainingPrefs.hard_bike_avoid_days ?? trainingPrefs.hardBikeAvoidDays;
  const hardBikeAvoidDays: DayName[] = Array.isArray(rawHardBikeAvoid)
    ? rawHardBikeAvoid
        .map((x) => normalizeDayName(x))
        .filter((d): d is DayName => d != null)
    : [];

  const trainingIntent = inferTrainingIntentFromPrefs(trainingPrefs);
  const strengthIntent = trainingPrefs.strength_intent === 'performance' ? 'performance' : 'support';

  // Swim anchors: if the athlete already has explicit swim days, pass the first
  // (easy) day as a masters_swim anchor so the optimizer preserves the day even
  // when re-deriving the rest of preferred_days due to other conflicts.
  // The optimizer only accepts ONE swim anchor; the quality day is preserved
  // by the post-optimizer swim-days restoration below.
  const swimEasyAnchorDay = swimDays?.[0];
  const inputs: WeekOptimizerInputs = {
    anchors: {
      ...(longRide ? { long_ride: longRide } : {}),
      ...(longRun ? { long_run: longRun } : {}),
      ...(qualityBike ? { quality_bike: qualityBike } : {}),
      ...(swimEasyAnchorDay ? { masters_swim: { day: swimEasyAnchorDay as any, intensity: 'easy' } } : {}),
    },
    preferences: {
      swims_per_week: swimsPerWeek,
      strength_frequency: strengthFreq,
      training_days: trainingDays,
      ...(restDaysIn?.length ? { rest_days: restDaysIn } : {}),
      ...(hardBikeAvoidDays.length ? { hard_bike_avoid_days: hardBikeAvoidDays } : {}),
      ...(qualityRunDay ? { quality_run: qualityRunDay } : {}),
    },
    athlete: {
      ...(trainingIntent ? { training_intent: trainingIntent } : {}),
      strength_intent: strengthIntent as 'performance' | 'support',
    },
  };

  // ── Decide whether to derive ─────────────────────────────────────────────
  const hasFullPreferred =
    pd != null &&
    longRide && longRun &&
    qualityBike && easyBikeDay && qualityRunDay && easyRunDay &&
    Array.isArray(strengthDaysIn) && strengthDaysIn.length > 0 &&
    Array.isArray(swimDays) && swimDays.length > 0;

  // Build a candidate normalized PreferredDaysOut from existing fields for validation.
  const candidate: PreferredDaysOut = {
    ...(longRide ? { long_ride: longRide } : {}),
    ...(longRun ? { long_run: longRun } : {}),
    ...(qualityBike ? { quality_bike: qualityBike } : {}),
    ...(easyBikeDay ? { easy_bike: easyBikeDay } : {}),
    ...(qualityRunDay ? { quality_run: qualityRunDay } : {}),
    ...(easyRunDay ? { easy_run: easyRunDay } : {}),
    ...(swimDays?.length ? { swim: swimDays } : {}),
    ...(strengthDaysIn?.length ? { strength: strengthDaysIn } : {}),
  };

  const validationErrors = hasFullPreferred
    ? validatePreferredDays(candidate, inputs.athlete, inputs.preferences)
    : ['incomplete preferred_days'];

  if (validationErrors.length === 0) {
    // User-provided week is matrix-clean; nothing to do.
    delete trainingPrefs.co_equal_strength_provisional_1x;
    return { notes, optimizer_snapshot: null };
  }

  // Derive a fresh, matrix-valid week (with 1× co-equal recovery if 2× cannot be placed).
  const { week: optimal, used_co_equal_1x_fallback } = deriveOptimalWeekWithCoEqualRecovery(inputs);
  const merged: Record<string, unknown> = { ...optimal.preferred_days };
  const pinRestoreSkipped: string[] = [];

  // Restore user-specified swim days: the optimizer only honors one swim anchor
  // (masters_swim). If the athlete set explicit swim days (e.g. ["tuesday","friday"]),
  // put them back so we don't clobber their calendar with algorithmic defaults.
  if (swimDays && swimDays.length > 0) {
    merged.swim = swimDays;
  }

  // Re-apply explicit bike/run/long pins from the incoming preferred_days when the matrix
  // still accepts them. Defense-in-depth: never silently drop wizard anchors when the
  // optimizer output differs (e.g. prior quality_bike anchor edge cases).
  const pinRestore: Partial<PreferredDaysOut> = {};
  if (candidate.long_ride) pinRestore.long_ride = candidate.long_ride;
  if (candidate.long_run) pinRestore.long_run = candidate.long_run;
  if (candidate.quality_bike) pinRestore.quality_bike = candidate.quality_bike;
  if (candidate.easy_bike) pinRestore.easy_bike = candidate.easy_bike;
  if (candidate.quality_run) pinRestore.quality_run = candidate.quality_run;
  if (candidate.easy_run) pinRestore.easy_run = candidate.easy_run;
  if (Object.keys(pinRestore).length > 0) {
    const withPins = { ...merged, ...pinRestore } as PreferredDaysOut;
    const pinErrs = validatePreferredDays(withPins, inputs.athlete, inputs.preferences);
    if (pinErrs.length === 0) {
      Object.assign(merged, pinRestore);
      console.log('[preferred_days pin-restore] restored', { keys: Object.keys(pinRestore) });
    } else {
      const skipMsg = pinErrs.join(' | ');
      pinRestoreSkipped.push(skipMsg);
      notes.push(`preferred_days pin-restore skipped: ${skipMsg}`);
      console.log('[preferred_days pin-restore] skipped:', skipMsg);
    }
  }

  trainingPrefs.preferred_days = merged;
  if (used_co_equal_1x_fallback) {
    trainingPrefs.co_equal_strength_provisional_1x = true;
    notes.push('co_equal_strength_provisional_1x=true (optimizer 1× recovery week)');
  } else {
    delete trainingPrefs.co_equal_strength_provisional_1x;
  }
  notes.push(`preferred_days→optimizer (${hasFullPreferred ? 'invalid input' : 'incomplete input'})`);
  if (optimal.trade_offs.length) {
    notes.push(`trade_offs: ${optimal.trade_offs.join(' | ')}`);
  }
  if (optimal.conflicts.length) {
    notes.push(`conflicts: ${optimal.conflicts.join(' | ')}`);
  }
  return {
    notes,
    optimizer_snapshot: {
      trade_offs: [...optimal.trade_offs],
      conflicts: [...optimal.conflicts],
      used_co_equal_1x_fallback,
      pin_restore_skipped: pinRestoreSkipped,
    },
  };
}

/**
 * For combined tri plans: always map to triathlon or triathlon_performance.
 * Run-centric wizard ids (durability, neural_speed, …) + performance intent → performance tri track.
 */
function resolveCombinedTriStrengthProtocol(
  rawProtocol: string | undefined,
  strengthIntent: string | undefined,
): string {
  return resolveProtocolIdForCombinedTriPlan(rawProtocol, strengthIntent);
}

/**
 * Scan all event goals' training_prefs.notes for a recurring group/hammer ride
 * mention. The mid-week quality bike is the athlete's group ride if they have one,
 * so the session name should reflect that ("Group Ride — Threshold" not just
 * "Bike Threshold"). Returns the matched label or null.
 */
function deriveBikeQualityLabel(goals: ReadonlyArray<{ training_prefs?: Record<string, unknown> | null }>): string | null {
  for (const g of goals) {
    const notes = String(g.training_prefs?.notes ?? '').toLowerCase();
    if (!notes) continue;
    if (/\bgroup\s+ride\b/.test(notes)) return 'Group Ride';
    if (/\bhammer\s+ride\b/.test(notes)) return 'Group Ride';
    if (/\b(recurring|weekly)\s+(ride|bike)\b/.test(notes)) return 'Group Ride';
    if (/\b(ride|bike)\s+anchor\b/.test(notes)) return 'Group Ride';
    if (/\bmore\s+ponies\b/.test(notes)) return 'Group Ride';
  }
  return null;
}

function combinedTransitionFromPostRace(
  pr: PostRaceRecoveryResult,
):
  | { transition_mode: 'recovery_rebuild'; structural_load_hint: 'low' }
  | { structural_load_hint: 'moderate' }
  | undefined {
  if (!pr.apply) return undefined;
  if (pr.severity === 'full') {
    return { transition_mode: 'recovery_rebuild', structural_load_hint: 'low' };
  }
  return { structural_load_hint: 'moderate' };
}

type CombinedPlanGoalMeta = { id: string; priority: 'A' | 'B' | 'C'; event_date: string | null | undefined };

/**
 * Exactly one goal owns merged skeleton anchors. When multiple rows share priority A (wizard defaults),
 * the naive `find(A)` followed `workingGoals` order (newest-first) and picked the wrong race —
 * stale Tuesday QB while the earliest A race had Wednesday pin-restored group ride.
 */
function resolveCombinedPlanPrimaryGoalMeta(
  goals: CombinedPlanGoalMeta[],
): CombinedPlanGoalMeta | undefined {
  if (goals.length === 0) return undefined;
  const aGoals = goals.filter((g) => g.priority === 'A');
  const pool = aGoals.length > 0 ? aGoals : goals;
  const dayMs = (d: string | null | undefined) => {
    if (!d || typeof d !== 'string') return NaN;
    const t = Date.parse(d.slice(0, 10));
    return Number.isFinite(t) ? t : NaN;
  };
  const sorted = [...pool].sort((x, y) => {
    const tx = dayMs(x.event_date);
    const ty = dayMs(y.event_date);
    if (Number.isFinite(tx) && Number.isFinite(ty) && tx !== ty) return tx - ty;
    if (Number.isFinite(tx) && !Number.isFinite(ty)) return -1;
    if (!Number.isFinite(tx) && Number.isFinite(ty)) return 1;
    return x.id.localeCompare(y.id);
  });
  return sorted[0];
}

// ── Combined plan orchestration ───────────────────────────────────────────────
//
// Called when the user clicks "Build combined plan". Gathers all active event
// goals, derives athlete state from snapshots, calls generate-combined-plan,
// then activates it and retires the old standalone plans.
//
// Returns { plan_id } on success, or null if no other active goals found
// (caller falls through to single-sport generation).

async function buildCombinedPlan(
  supabase: ReturnType<typeof createClient>,
  functionsBaseUrl: string,
  serviceKey: string,
  user_id: string,
  newGoalId: string,
  newGoal: { name: string; target_date: string; sport: string; distance: string | null; training_prefs: Record<string, any> },
  fitness: string,
  /** Propagate Arc post-marathon / recent-race recovery into generate-combined-plan. */
  combinedTransition?: {
    transition_mode?: 'peak_bridge' | 'recovery_rebuild' | 'fresh_build' | 'fitness_maintenance';
    structural_load_hint?: 'low' | 'moderate' | 'normal';
  },
  /** From goal flow (`plan_start_date`). When omitted, combined plan still used server's current Monday (legacy). */
  explicit_plan_start_date?: string | null,
  /** Dry-run combined generation: no DB plan, no prefs writes, no activate-plan. */
  planPreview?: boolean,
  /** Reject merged combined skeleton before plan gen when coarse collision rules fail. */
  strictSchedulePrefs?: boolean,
): Promise<
  | { plan_id: string; preview: false; schedule_signals: ScheduleSignals }
  | { preview: true; combined_preview: Record<string, unknown>; schedule_signals: ScheduleSignals }
  | null
> {

  // Gather all active event goals, newest first. Repeated confirm attempts can leave
  // duplicate orphan goals in the DB; limit to the 2 most recent and always include
  // the goal we just created so it is never crowded out by stale rows.
  const { data: rawEventGoals } = await supabase
    .from('goals')
    .select('id, name, sport, distance, target_date, priority, training_prefs, status, projection, created_at')
    .eq('user_id', user_id)
    .eq('goal_type', 'event')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10); // fetch a small window, dedupe below

  // Always include newGoalId; take the first non-newGoalId sibling as the partner.
  const allEventGoals = (() => {
    if (!rawEventGoals || rawEventGoals.length === 0) return rawEventGoals;
    const primary = rawEventGoals.find(g => g.id === newGoalId);
    const siblings = rawEventGoals.filter(g => g.id !== newGoalId);
    // Partner: the sibling with the earliest created_at among the top-10 recents
    // (most likely the other goal from the same confirm flow, not an old orphan).
    const partner = siblings[0] ?? null;
    if (!primary) return rawEventGoals.slice(0, 2); // fallback
    return partner ? [primary, partner] : [primary];
  })();

  if (!allEventGoals || allEventGoals.length < 2) return null; // No sibling goals; fall through

  const workingGoals = planPreview
    ? allEventGoals.map((g) => (g.id === newGoalId ? { ...g, training_prefs: newGoal.training_prefs } : g))
    : allEventGoals;

  // Get athlete snapshots for CTL + volume estimates, and baselines for equipment
  const [{ data: snapshots }, { data: combinedBaseline }] = await Promise.all([
    supabase
      .from('athlete_snapshot')
      .select('week_start, workload_total, workload_by_discipline, acwr')
      .eq('user_id', user_id)
      .order('week_start', { ascending: false })
      .limit(6),
    supabase.from('user_baselines').select('equipment, units, birthday, gender').eq('user_id', user_id).maybeSingle(),
  ]);

  const planUnitsForCombined: 'imperial' | 'metric' =
    String(combinedBaseline?.units ?? '').toLowerCase() === 'metric' ? 'metric' : 'imperial';

  // Derive CTL from recent weekly workload. workload_total is in load points;
  // we scale to approximate TSS/day for the combined plan engine.
  const recentLoads = (snapshots || []).map(s => Number(s.workload_total || 0)).filter(v => v > 0);
  const avgWeeklyLoad = recentLoads.length > 0
    ? recentLoads.reduce((a, b) => a + b, 0) / recentLoads.length
    : 0;
  // Convert load points to approximate CTL (daily TSS equivalent)
  let currentCTL = avgWeeklyLoad > 0
    ? Math.round(Math.min(120, Math.max(15, avgWeeklyLoad / 7)))
    : ({ beginner: 20, intermediate: 40, advanced: 65 }[fitness] ?? 35);

  // Normalize distance for the combined plan engine
  function normalizeDistance(sport: string, dist: string | null): string {
    if (!dist) return 'marathon';
    const d = String(dist).toLowerCase().trim();
    const map: Record<string, string> = {
      'marathon': 'marathon', '26.2': 'marathon',
      'half marathon': 'half_marathon', 'half': 'half_marathon', '13.1': 'half_marathon',
      '10k': '10k', '5k': '5k',
      'ironman': 'ironman', '140.6': 'ironman',
      '70.3': '70.3', 'half iron': '70.3', 'half-iron': '70.3',
      'olympic': 'olympic', 'sprint': 'sprint',
    };
    return map[d] ?? d;
  }

  // Build GoalInput array for the combined engine
  const goalsForCombined = workingGoals.map(g => {
    const isNew = g.id === newGoalId;
    const rawPriority = String((isNew ? (newGoal.training_prefs as any)?.priority : g.priority) || g.priority || 'A');
    return {
      id: g.id,
      event_name: g.name,
      event_date: g.target_date,
      distance: normalizeDistance(g.sport || '', isNew ? newGoal.distance : g.distance),
      sport: (g.sport || 'run').toLowerCase(),
      priority: (['A', 'B', 'C'].includes(rawPriority) ? rawPriority : 'A') as 'A' | 'B' | 'C',
    };
  });

  const combinedStrengthEquipment: string[] = combinedBaseline?.equipment?.strength ?? [];

  // Resolve approach for the combined plan.
  // The primary event goal drives the approach; among ties on priority A, earliest race date wins.
  const primaryGoal =
    resolveCombinedPlanPrimaryGoalMeta(goalsForCombined) ?? goalsForCombined[0];
  const primaryGoalPrefs = (workingGoals.find(g => g.id === primaryGoal?.id)?.training_prefs as Record<string, any>) ?? {};
  // Extract per-athlete bike split from stored projection (computed by recomputeRaceProjectionsForUser
  // on prior plan saves). Falls back to hardcoded distance estimate when not yet available.
  const primaryGoalProjection = (workingGoals.find(g => g.id === primaryGoal?.id) as any)?.projection as Record<string, unknown> | null | undefined;
  const projectedBikeMin = typeof primaryGoalProjection?.bike_min === 'number' && primaryGoalProjection.bike_min > 0
    ? primaryGoalProjection.bike_min
    : null;
  const projectedBikeHours = projectedBikeMin != null ? Math.round((projectedBikeMin / 60) * 4) / 4 : null;
  const primaryGoalType  = String(primaryGoalPrefs?.goal_type || '').toLowerCase();
  const triApproach = (newGoal.training_prefs?.tri_approach as string | undefined)
    ?? primaryGoalPrefs?.tri_approach
    ?? (primaryGoalType === 'speed' ? 'race_peak' : 'base_first');

  // mergeCombinedSchedulePrefs: later sources override earlier. The A-priority goal
  // owns the weekly skeleton; the newly created goal must not overwrite its
  // easy_bike / easy_run (and other preferred_days) with a duplicate B-goal payload.
  const combinedSchedulePrefs = mergeCombinedSchedulePrefs(
    newGoal.training_prefs as Record<string, unknown>,
    primaryGoalPrefs as Record<string, unknown>,
  );
  if (strictSchedulePrefs) {
    const vc = validateCombinedSchedulePrefsCollision(
      combinedSchedulePrefs,
      normalizeGoalDistanceToTriCollisionDistance(newGoal.distance),
    );
    if (!vc.ok) {
      throw new AppError(vc.code, vc.message, 409);
    }
  }
  const dpwCombined =
    readDaysPerWeekFromPrefs(newGoal.training_prefs as Record<string, unknown>) ??
    readDaysPerWeekFromPrefs(primaryGoalPrefs as Record<string, unknown>);
  const resolvedRestDays = deriveRestDaysForBudget(
    dpwCombined,
    combinedSchedulePrefs.rest_days,
    combinedSchedulePrefs.long_run_day,
    combinedSchedulePrefs.long_ride_day,
  );
  combinedSchedulePrefs.rest_days = resolvedRestDays;
  const explicitEquipmentType =
    (newGoal.training_prefs as Record<string, unknown>)?.equipment_type
    ?? (primaryGoalPrefs as Record<string, unknown>)?.equipment_type;
  const resolvedEquipmentType = resolveStrengthEquipmentTypeForPlan(
    explicitEquipmentType,
    combinedStrengthEquipment,
    combinedBaseline?.performance_numbers,
  );
  const hasCableForPlan = hasCableMachine(combinedStrengthEquipment);
  const hasGHDForPlan = hasGHD(combinedStrengthEquipment);

  const focusForCombined = new Date().toISOString().slice(0, 10);
  const arcForCombined = await getArcContext(supabase, user_id, focusForCombined);

  const weekOptimizerDerivedGoalIds: string[] = [];
  const optimizerSnapshotsForTradeOffs: PlanOptimizerSnapshotInput[] = [];
  for (const g of workingGoals) {
    const sp = String(g.sport || '').toLowerCase();
    if (sp !== 'triathlon' && sp !== 'tri') continue;
    const prev = g.training_prefs;
    const base =
      prev && typeof prev === 'object' && !Array.isArray(prev)
        ? { ...(prev as Record<string, unknown>) }
        : {};
    const { notes, optimizer_snapshot } = backfillTriTrainingPrefsDefenseInDepth(base, arcForCombined);
    if (optimizer_snapshot) {
      optimizerSnapshotsForTradeOffs.push({ goal_id: g.id, ...optimizer_snapshot });
    }
    if (notes.some((n) => n.includes('preferred_days→optimizer'))) {
      weekOptimizerDerivedGoalIds.push(g.id);
    }
    if (notes.length > 0) {
      console.log(`[create-goal] combined plan training_prefs backfill goal ${g.id}:`, notes.join(', '));
      console.log('[build] training_prefs after backfill:', base);
      if (!planPreview) {
        const { error: upErr } = await supabase
          .from('goals')
          .update({ training_prefs: base, updated_at: new Date().toISOString() })
          .eq('id', g.id)
          .eq('user_id', user_id);
        if (upErr) console.warn('[buildCombinedPlan] goals training_prefs backfill update', upErr.message);
      }
      (g as { training_prefs: Record<string, unknown> }).training_prefs = base;
    }
  }

  const schedule_signals = aggregateOptimizerScheduleSignals(optimizerSnapshotsForTradeOffs);

  console.log(
    '[buildCombinedPlan] week_optimizer_derived_for_goal_ids:',
    weekOptimizerDerivedGoalIds.length > 0 ? weekOptimizerDerivedGoalIds.join(',') : '(none)',
  );

  const swimSecPer100Yd = swimSecPer100YdFromArcSwimInputs({
    performance_numbers: arcForCombined.performance_numbers,
    learned_fitness: arcForCombined.learned_fitness,
    units: arcForCombined.units,
  });
  const triPrimaryWithSwimLeg = goalsForCombined.some(
    (g) => (g.sport === 'triathlon' || g.sport === 'tri') && g.priority === 'A',
  );
  const swim_volume_multiplier = swimVolumeMultiplierFromArcWorkouts(
    arcForCombined.swim_training_from_workouts,
    {
      swimSecPer100Yd,
      triPrimaryWithSwimLeg,
    },
  );
  if (triPrimaryWithSwimLeg && swimSecPer100Yd != null) {
    console.log(
      '[buildCombinedPlan] swim volume mult:',
      swim_volume_multiplier,
      'sec/100yd:',
      Math.round(swimSecPer100Yd * 10) / 10,
    );
  }

  const resolvedCombinedStrengthProtocol = resolveCombinedTriStrengthProtocol(
    combinedSchedulePrefs.strength_protocol != null
      ? String(combinedSchedulePrefs.strength_protocol)
      : undefined,
    combinedSchedulePrefs.strength_intent != null
      ? String(combinedSchedulePrefs.strength_intent)
      : undefined,
  );

  // Re-derive combinedSchedulePrefs from the backfilled training_prefs so that
  // optimizer-derived preferred_days (quality_bike, quality_run, etc.) actually
  // flow into the athlete_state we send to generate-combined-plan.
  const backfilledPrimaryPrefs =
    (workingGoals.find((g) => g.id === primaryGoal?.id)?.training_prefs as Record<string, any>) ?? {};
  const assessmentWeekFirst =
    backfilledPrimaryPrefs?.assessment_week_preference === 'assessment_first' ||
    (newGoal.training_prefs as Record<string, unknown>)?.assessment_week_preference === 'assessment_first';
  const coEqualProvisional1x = Boolean(backfilledPrimaryPrefs?.co_equal_strength_provisional_1x);
  const freshCombinedPrefs = mergeCombinedSchedulePrefs(
    newGoal.training_prefs as Record<string, unknown>,
    backfilledPrimaryPrefs as Record<string, unknown>,
  );
  // Merge order above lets A-priority backfilled prefs win over the partner goal payload.
  // Only re-apply wizard bike anchors when this request is for the A skeleton owner: stale DB
  // primary would otherwise drop group-ride day. If newGoalId is a B/C partner, partner
  // training_prefs often duplicate anchors badly (e.g. Tuesday QB) — overwriting merged prefs
  // produced quality_run_unplaced + wrong athlete_state vs pin-restored optimizer output.
  const newGoalBikePatch = parsePreferredDaysPatch(newGoal.training_prefs as Record<string, unknown>);
  const newGoalIsPrimarySkeletonOwner = primaryGoal?.id != null && newGoalId === primaryGoal.id;
  if (newGoalIsPrimarySkeletonOwner) {
    if (newGoalBikePatch.bike_quality_day !== undefined) {
      freshCombinedPrefs.bike_quality_day = newGoalBikePatch.bike_quality_day;
    }
    if (newGoalBikePatch.bike_easy_day !== undefined) {
      freshCombinedPrefs.bike_easy_day = newGoalBikePatch.bike_easy_day;
    }
  }
  // Two active goals keep separate `preferred_days`; merge + wizard payload can disagree with the
  // A-priority row (e.g. partner still has Tuesday QB while A has Wednesday group ride after
  // pin-restore). athlete_state must follow A's quality_bike anchor only for this field.
  const aPriorityQualityBikePatch = parsePreferredDaysPatch(
    backfilledPrimaryPrefs as Record<string, unknown>,
  );
  if (aPriorityQualityBikePatch.bike_quality_day !== undefined) {
    freshCombinedPrefs.bike_quality_day = aPriorityQualityBikePatch.bike_quality_day;
  }
  const freshDpw =
    readDaysPerWeekFromPrefs(newGoal.training_prefs as Record<string, unknown>) ??
    readDaysPerWeekFromPrefs(backfilledPrimaryPrefs as Record<string, unknown>);
  freshCombinedPrefs.rest_days = deriveRestDaysForBudget(
    freshDpw,
    freshCombinedPrefs.rest_days,
    freshCombinedPrefs.long_run_day,
    freshCombinedPrefs.long_ride_day,
  );
  console.log('[buildCombinedPlan] freshCombinedPrefs after backfill:', JSON.stringify({
    bike_quality_day: freshCombinedPrefs.bike_quality_day,
    bike_quality_label: freshCombinedPrefs.bike_quality_label,
    bike_easy_day: freshCombinedPrefs.bike_easy_day,
    run_quality_day: freshCombinedPrefs.run_quality_day,
    run_easy_day: freshCombinedPrefs.run_easy_day,
    long_ride_day: freshCombinedPrefs.long_ride_day,
    long_run_day: freshCombinedPrefs.long_run_day,
    swim_easy_day: freshCombinedPrefs.swim_easy_day,
    swim_quality_day: freshCombinedPrefs.swim_quality_day,
    swim_third_day: freshCombinedPrefs.swim_third_day,
    strength_preferred_days: freshCombinedPrefs.strength_preferred_days,
    run_quality_placement: freshCombinedPrefs.run_quality_placement,
    bike_quality_placement: freshCombinedPrefs.bike_quality_placement,
  }));

  const combinedPlanStartDate =
    normalizeDateOnlyYmd(explicit_plan_start_date) ?? currentWeekMondayISO();

  let swim_cutoff_pressure_v1: SwimCutoffPressureV1 | null = null;
  const primarySportLc = String(primaryGoal?.sport || '').toLowerCase();
  const primaryIsTriA =
    Boolean(primaryGoal?.priority === 'A') &&
    (primarySportLc === 'triathlon' || primarySportLc === 'tri');
  if (primaryIsTriA && primaryGoal) {
    const raceYmd = String(primaryGoal.event_date || '').slice(0, 10);
    const weeksRem =
      /^\d{4}-\d{2}-\d{2}$/.test(combinedPlanStartDate) && /^\d{4}-\d{2}-\d{2}$/.test(raceYmd)
        ? Math.max(
          1,
          Math.ceil(
            (new Date(raceYmd + 'T12:00:00Z').getTime() -
              new Date(combinedPlanStartDate + 'T12:00:00Z').getTime()) /
              (7 * 24 * 60 * 60 * 1000),
          ),
        )
        : 12;

    let swimMin: number | null =
      typeof primaryGoalProjection?.swim_min === 'number' && Number(primaryGoalProjection.swim_min) > 0
        ? Number(primaryGoalProjection.swim_min)
        : null;
    let projectedSource: 'goal_projection' | 'live_model' = 'goal_projection';

    if (swimMin == null) {
      const lastSwim = arcForCombined.swim_training_from_workouts?.last_swim_date ?? null;
      const pbDay =
        combinedBaseline?.birthday != null ? String(combinedBaseline.birthday).slice(0, 10) : null;
      const gen =
        typeof combinedBaseline?.gender === 'string' ? String(combinedBaseline.gender) : null;
      const proj = projectRaceSplits({
        learned_fitness: arcForCombined.learned_fitness,
        athlete_identity: arcForCombined.athlete_identity,
        performance_numbers: arcForCombined.performance_numbers,
        profile_birthday: pbDay,
        profile_gender: gen,
        goal: {
          distance: primaryGoal.distance,
          target_date: primaryGoal.event_date,
          sport: primaryGoal.sport,
        },
        weeks_remaining: weeksRem,
        last_swim_date: lastSwim,
        course_data: null,
      });
      swimMin = proj.swim_min;
      projectedSource = 'live_model';
    }

    const basePressure =
      swimMin != null
        ? buildSwimCutoffPressureV1({
          distance: primaryGoal.distance,
          projected_swim_min: swimMin,
          projected_source: projectedSource,
        })
        : null;

    const paceSlow = swimSecPer100Yd != null && swimSecPer100Yd >= 150;
    const cutoffTight = basePressure != null && basePressure.severity !== 'none';
    const currentIntent = String(freshCombinedPrefs.swim_intent ?? '').toLowerCase();
    const cutoffEligible = currentIntent !== 'focus' && (paceSlow || cutoffTight);
    const swimAnchorSlots = anchoredSwimSlotsForFocusPromotion(
      freshCombinedPrefs,
      backfilledPrimaryPrefs as Record<string, unknown>,
      newGoal.training_prefs as Record<string, unknown>,
      primaryGoal?.training_prefs as Record<string, unknown> | undefined,
    );
    const promote = cutoffEligible && swimAnchorSlots >= 3;

    const intent_promotion_reasons: string[] = [];
    if (paceSlow) intent_promotion_reasons.push('pool_pace_ge_2_30_per_100yd');
    if (cutoffTight) intent_promotion_reasons.push(`swim_cutoff_${basePressure?.severity ?? 'unknown'}`);
    if (cutoffEligible && swimAnchorSlots < 3) {
      intent_promotion_reasons.push(`focus_promotion_blocked_swim_anchor_slots_${swimAnchorSlots}`);
    }
    if (promote) {
      freshCombinedPrefs.swim_intent = 'focus';
      if (!freshCombinedPrefs.swim_load_source) freshCombinedPrefs.swim_load_source = 'split';
      console.log('[buildCombinedPlan] swim_intent promoted to focus:', intent_promotion_reasons.join(', '));
    } else if (cutoffEligible && swimAnchorSlots < 3) {
      console.log(
        '[buildCombinedPlan] swim_intent focus promotion skipped (need ≥3 swim anchor slots):',
        swimAnchorSlots,
      );
    }

    if (basePressure) {
      swim_cutoff_pressure_v1 = {
        ...basePressure,
        intent_promoted_to_focus: promote,
        intent_promotion_reasons,
      };
    } else if (promote && paceSlow && swimMin != null) {
      const dk = normalizeGoalDistanceKey(primaryGoal.distance) || primaryGoal.distance;
      swim_cutoff_pressure_v1 = {
        version: 1,
        distance_key: dk,
        projected_swim_min: swimMin,
        projected_source: projectedSource,
        swim_cutoff_min: null,
        margin_vs_cutoff: null,
        projected_pct_of_cutoff: null,
        severity: 'none',
        recommend_third_swim: true,
        narrative_hints: [
          'Slow baseline swim pace on file (≥2:30/100 yd) — add a third weekly swim when schedule allows.',
        ],
        intent_promoted_to_focus: promote,
        intent_promotion_reasons,
      };
    }
  }

  const resolvedBikeQualityLabelForCombined = (() => {
    const fromPrefs = freshCombinedPrefs.bike_quality_label?.trim();
    if (fromPrefs) return fromPrefs;
    const inferredLabel = deriveBikeQualityLabel(workingGoals);
    const hasRouteEstimate =
      freshCombinedPrefs.bike_quality_route_estimated_hours !== undefined ||
      freshCombinedPrefs.bike_quality_route_estimated_minutes !== undefined ||
      freshCombinedPrefs.bike_quality_group_ride_hours !== undefined ||
      freshCombinedPrefs.bike_quality_group_ride_minutes !== undefined ||
      Boolean(String(freshCombinedPrefs.group_ride_route_url ?? '').trim());
    if (inferredLabel) return inferredLabel as string;
    if (hasRouteEstimate && freshCombinedPrefs.bike_quality_day !== undefined) {
      return 'Group Ride';
    }
    return undefined;
  })();

  console.log('[buildCombinedPlan] athlete_state schedule fields:', JSON.stringify({
    long_run_day: freshCombinedPrefs.long_run_day,
    long_ride_day: freshCombinedPrefs.long_ride_day,
    bike_quality_day: freshCombinedPrefs.bike_quality_day,
    bike_easy_day: freshCombinedPrefs.bike_easy_day,
    run_quality_day: freshCombinedPrefs.run_quality_day,
    run_easy_day: freshCombinedPrefs.run_easy_day,
    swim_easy_day: freshCombinedPrefs.swim_easy_day,
    swim_quality_day: freshCombinedPrefs.swim_quality_day,
    swim_third_day: freshCombinedPrefs.swim_third_day,
    strength_preferred_days: freshCombinedPrefs.strength_preferred_days,
    bike_quality_label: resolvedBikeQualityLabelForCombined,
    strength_sessions_cap: coEqualProvisional1x ? 1 : undefined,
    run_quality_placement: freshCombinedPrefs.run_quality_placement,
    bike_quality_placement: freshCombinedPrefs.bike_quality_placement,
  }));

  const postRaceForTradeOffs = findPostRaceRecoveryContext(
    arcForCombined.recent_completed_events,
    String(newGoal.sport || 'triathlon'),
  );
  const generation_trade_offs = buildCombinedPlanGenerationTradeOffs({
    postRace: postRaceForTradeOffs,
    optimizerSnapshots: optimizerSnapshotsForTradeOffs,
  });
  console.log('[buildCombinedPlan] generation_trade_offs:', JSON.stringify(generation_trade_offs));

  const trainingFitnessResolution = inferTrainingFitnessLevel({
    wizardFitnessRaw: fitness,
    currentCtl: currentCTL,
    arc: arcForCombined,
    structuralLoadHint: combinedTransition?.structural_load_hint,
    trainingIntent:
      freshCombinedPrefs.training_intent != null ? String(freshCombinedPrefs.training_intent) : undefined,
  });

  if (recentLoads.length === 0) {
    currentCTL =
      { beginner: 20, intermediate: 40, advanced: 65 }[trainingFitnessResolution.level] ?? currentCTL;
  }

  const weeklyHours =
    { beginner: 6, intermediate: 10, advanced: 14 }[trainingFitnessResolution.level] ?? 10;

  const loadingPattern =
    triApproach === 'base_first'
      ? '2:1'
      : trainingFitnessResolution.level === 'beginner'
        ? '2:1'
        : '3:1';

  console.log(
    '[buildCombinedPlan] training_fitness:',
    trainingFitnessResolution.level,
    trainingFitnessResolution.source,
    trainingFitnessResolution.reasons.join(', '),
  );

  console.log(
    '[buildCombinedPlan] invoking HTTP edge function generate-combined-plan — filter Supabase logs by function name **generate-combined-plan** to see [buildWeek] / [session-factory] lines from that separate execution.',
  );
  // Call the combined plan engine
  const combined = await invokeFunction(functionsBaseUrl, serviceKey, 'generate-combined-plan', {
    user_id,
    goals: goalsForCombined,
    start_date: combinedPlanStartDate,
    generation_trade_offs,
    athlete_state: {
      current_ctl: currentCTL,
      weekly_hours_available: weeklyHours,
      loading_pattern: loadingPattern,
      plan_units: planUnitsForCombined,
      equipment_type: resolvedEquipmentType,
      has_cable_machine: hasCableForPlan,
      has_ghd: hasGHDForPlan,
      ...(projectedBikeHours != null ? { projected_bike_hours: projectedBikeHours } : {}),
      tri_approach: triApproach,
      swim_volume_multiplier,
      ...((): { swim_threshold_pace?: string } => {
        const sec = swimSecPer100YdFromArcSwimInputs({
          performance_numbers: arcForCombined.performance_numbers,
          learned_fitness: arcForCombined.learned_fitness,
          units: arcForCombined.units,
        });
        if (sec == null || !Number.isFinite(sec) || sec <= 0) return {};
        const m = Math.floor(sec / 60);
        const r = Math.round(sec % 60);
        return { swim_threshold_pace: `${m}:${String(r).padStart(2, '0')}` };
      })(),
      ...(swim_cutoff_pressure_v1 ? { swim_cutoff_pressure_v1 } : {}),
      ...((): { swim_equipment?: string[] } => {
        const sw = arcForCombined.equipment?.swimming;
        if (!Array.isArray(sw) || !sw.length) return {};
        const labels = sw.map((x) => String(x).trim()).filter(Boolean);
        return labels.length ? { swim_equipment: labels } : {};
      })(),
      rest_days: freshCombinedPrefs.rest_days ?? [],
      ...(freshCombinedPrefs.long_run_day !== undefined
        ? { long_run_day: freshCombinedPrefs.long_run_day }
        : {}),
      ...(freshCombinedPrefs.long_ride_day !== undefined
        ? { long_ride_day: freshCombinedPrefs.long_ride_day }
        : {}),
      ...(freshCombinedPrefs.swim_easy_day !== undefined
        ? { swim_easy_day: freshCombinedPrefs.swim_easy_day }
        : {}),
      ...(freshCombinedPrefs.swim_quality_day !== undefined
        ? { swim_quality_day: freshCombinedPrefs.swim_quality_day }
        : {}),
      ...(freshCombinedPrefs.swim_third_day !== undefined
        ? { swim_third_day: freshCombinedPrefs.swim_third_day }
        : {}),
      ...(freshCombinedPrefs.run_quality_day !== undefined
        ? { run_quality_day: freshCombinedPrefs.run_quality_day }
        : {}),
      ...(freshCombinedPrefs.run_easy_day !== undefined
        ? { run_easy_day: freshCombinedPrefs.run_easy_day }
        : {}),
      ...(freshCombinedPrefs.bike_quality_day !== undefined
        ? { bike_quality_day: freshCombinedPrefs.bike_quality_day }
        : {}),
      ...(freshCombinedPrefs.bike_quality_group_ride_hours !== undefined
        ? { bike_quality_group_ride_hours: freshCombinedPrefs.bike_quality_group_ride_hours }
        : {}),
      ...(freshCombinedPrefs.bike_quality_group_ride_minutes !== undefined
        ? { bike_quality_group_ride_minutes: freshCombinedPrefs.bike_quality_group_ride_minutes }
        : {}),
      ...(freshCombinedPrefs.bike_quality_route_estimated_hours !== undefined
        ? { bike_quality_route_estimated_hours: freshCombinedPrefs.bike_quality_route_estimated_hours }
        : {}),
      ...(freshCombinedPrefs.bike_quality_route_estimated_minutes !== undefined
        ? {
            bike_quality_route_estimated_minutes:
              freshCombinedPrefs.bike_quality_route_estimated_minutes,
          }
        : {}),
      ...(freshCombinedPrefs.bike_easy_day !== undefined
        ? { bike_easy_day: freshCombinedPrefs.bike_easy_day }
        : {}),
      training_fitness: trainingFitnessResolution.level,
      ...(freshCombinedPrefs.training_intent !== undefined
        ? { training_intent: freshCombinedPrefs.training_intent }
        : {}),
      ...(resolvedBikeQualityLabelForCombined
        ? { bike_quality_label: resolvedBikeQualityLabelForCombined }
        : {}),
      ...(freshCombinedPrefs.group_ride_route_url
        ? { group_ride_route_url: freshCombinedPrefs.group_ride_route_url }
        : {}),
      ...(freshCombinedPrefs.group_ride_route_snapshot
        ? { group_ride_route_snapshot: freshCombinedPrefs.group_ride_route_snapshot }
        : {}),
      strength_protocol: resolvedCombinedStrengthProtocol,
      ...(freshCombinedPrefs.strength_intent
        ? { strength_intent: freshCombinedPrefs.strength_intent }
        : {}),
      ...(freshCombinedPrefs.swim_intent ? { swim_intent: freshCombinedPrefs.swim_intent } : {}),
      ...(freshCombinedPrefs.swim_load_source ? { swim_load_source: freshCombinedPrefs.swim_load_source } : {}),
      ...((): { swim_experience?: string } => {
        const raw =
          (newGoal.training_prefs as Record<string, unknown> | undefined)?.swim_experience ??
          primaryGoalPrefs?.swim_experience;
        if (raw == null) return {};
        const s = String(raw).trim();
        return s ? { swim_experience: s } : {};
      })(),
      ...(freshCombinedPrefs.strength_preferred_days?.length
        ? { strength_preferred_days: freshCombinedPrefs.strength_preferred_days }
        : {}),
      ...(coEqualProvisional1x ? { strength_sessions_cap: 1 } : {}),
      ...(combinedTransition?.transition_mode ? { transition_mode: combinedTransition.transition_mode } : {}),
      ...(combinedTransition?.structural_load_hint
        ? { structural_load_hint: combinedTransition.structural_load_hint }
        : {}),
      ...(freshDpw != null ? { days_per_week: freshDpw } : {}),
      ...(freshCombinedPrefs.conflict_preferences && Object.keys(freshCombinedPrefs.conflict_preferences).length > 0
        ? { conflict_preferences: freshCombinedPrefs.conflict_preferences }
        : {}),
      ...(freshCombinedPrefs.run_quality_placement
        ? { run_quality_placement: freshCombinedPrefs.run_quality_placement }
        : {}),
      ...(freshCombinedPrefs.bike_quality_placement
        ? { bike_quality_placement: freshCombinedPrefs.bike_quality_placement }
        : {}),
      // assessment_week_preference is not parsed by mergeCombinedSchedulePrefs —
      // read from the raw goal training_prefs that the arc-setup chat emitted.
      ...(() => {
        const awp =
          (newGoal.training_prefs as Record<string, unknown>)?.assessment_week_preference ??
          (backfilledPrimaryPrefs as Record<string, unknown>)?.assessment_week_preference;
        return awp === 'assessment_first' || awp === 'jump_in'
          ? { assessment_week_preference: awp }
          : {};
      })(),
      ...(planPreview ? { preview: true } : {}),
    },
  });

  logSwimSessionsMirrorFromCombined(combined as Record<string, unknown>, planPreview ? 'preview' : 'full');

  if (planPreview) {
    if (!combined?.success || combined.preview_mode !== true) {
      console.error('[buildCombinedPlan] generate-combined-plan preview failed:', combined?.error);
      return null;
    }
    const sbwPrev = combined?.sessions_by_week as Record<string, unknown> | undefined;
    const { weekKey: wkP, sessions: sessP } = pickCanonicalWeekSessions(sbwPrev, Boolean(assessmentWeekFirst));
    const honoredP = summarizeAnchorsHonoredFromWeekSessions(sessP);
    console.log(
      '[buildCombinedPlan] anchors_honored:',
      JSON.stringify({ ...honoredP, source_week_key: wkP, source: 'preview_response' }),
    );
    const wtoPrev =
      (combined as { week_trade_offs?: Record<string, unknown> })?.week_trade_offs ??
      ((combined?.plan_contract_v1 as Record<string, unknown> | undefined)?.week_trade_offs as
        | Record<string, unknown>
        | undefined);
    const schedule_signals_mid = enrichScheduleSignalsWithCombinedPlanTradeOffs(schedule_signals, {
      week_trade_offs: wtoPrev,
      sessions_by_week: sbwPrev,
    });
    const schedule_signals_out = stripStaleQualityRunUnplacedFromScheduleSignals(
      schedule_signals_mid,
      sbwPrev,
    );
    return { preview: true as const, combined_preview: combined as Record<string, unknown>, schedule_signals: schedule_signals_out };
  }

  if (!combined?.plan_id) {
    console.error('[buildCombinedPlan] generate-combined-plan failed:', combined?.error);
    return null; // Fall through to individual plan generation
  }

  const combinedPlanId = combined.plan_id;

  if (swim_cutoff_pressure_v1?.intent_promoted_to_focus && primaryGoal?.id) {
    const wgRow = workingGoals.find((g) => g.id === primaryGoal.id);
    const prevTp =
      wgRow?.training_prefs && typeof wgRow.training_prefs === 'object' && !Array.isArray(wgRow.training_prefs)
        ? (wgRow.training_prefs as Record<string, unknown>)
        : {};
    const mergedTp = {
      ...prevTp,
      swim_intent: 'focus',
      swim_load_source: freshCombinedPrefs.swim_load_source ?? 'split',
    };
    const { error: swimPromoErr } = await supabase
      .from('goals')
      .update({ training_prefs: mergedTp, updated_at: new Date().toISOString() })
      .eq('id', primaryGoal.id)
      .eq('user_id', user_id);
    if (swimPromoErr) console.warn('[buildCombinedPlan] swim intent promo prefs update', swimPromoErr.message);
    else if (wgRow) (wgRow as { training_prefs: Record<string, unknown> }).training_prefs = mergedTp;
  }

  // Link ALL goals to the combined plan
  for (const g of goalsForCombined) {
    await supabase.from('goals').update({ status: 'active' }).eq('id', g.id).eq('user_id', user_id);
  }
  await supabase.from('plans').update({ goal_id: newGoalId }).eq('id', combinedPlanId).eq('user_id', user_id);

  // Activate the combined plan (inserts planned_workouts + materializes steps)
  await invokeFunction(functionsBaseUrl, serviceKey, 'activate-plan', { plan_id: combinedPlanId });

  // Retire only standalone plans that are linked to the goals now handled by
  // the combined plan. Plans with no goal_id (catalog, strength, habit) are
  // left untouched — they are not event plans and belong to a separate rhythm.
  const goalIds = goalsForCombined.map(g => g.id);
  const { data: oldPlans } = await supabase
    .from('plans')
    .select('id, status, goal_id')
    .eq('user_id', user_id)
    .in('status', ['active', 'paused'])
    .in('goal_id', goalIds)       // only plans tied to the goals we merged
    .neq('id', combinedPlanId);

  const weekStart = currentWeekMondayISO();
  for (const op of oldPlans || []) {
    await supabase.from('planned_workouts').delete().eq('training_plan_id', op.id).gte('date', weekStart);
    await supabase.from('plans').update({ status: 'ended' }).eq('id', op.id).eq('user_id', user_id);
  }

  console.log(`[buildCombinedPlan] Created combined plan ${combinedPlanId} for ${goalIds.length} goals, retired ${(oldPlans || []).length} standalone plans`);

  const { data: planAnchorsRow } = await supabase
    .from('plans')
    .select('sessions_by_week')
    .eq('id', combinedPlanId)
    .eq('user_id', user_id)
    .maybeSingle();
  const sbwDb = planAnchorsRow?.sessions_by_week as Record<string, unknown> | undefined;
  const { weekKey: wkDb, sessions: sessDb } = pickCanonicalWeekSessions(sbwDb, Boolean(assessmentWeekFirst));
  const honoredDb = summarizeAnchorsHonoredFromWeekSessions(sessDb);
  console.log(
    '[buildCombinedPlan] anchors_honored:',
    JSON.stringify({ ...honoredDb, source_week_key: wkDb, source: 'plan_row_sessions_by_week' }),
  );

  const wtoDb =
    (combined as { week_trade_offs?: Record<string, unknown> })?.week_trade_offs ?? undefined;
  const schedule_signals_mid = enrichScheduleSignalsWithCombinedPlanTradeOffs(schedule_signals, {
    week_trade_offs: wtoDb,
    sessions_by_week: sbwDb,
  });
  const schedule_signals_out = stripStaleQualityRunUnplacedFromScheduleSignals(
    schedule_signals_mid,
    sbwDb,
  );

  return { plan_id: combinedPlanId, preview: false as const, schedule_signals: schedule_signals_out };
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const functionsBaseUrl = `${supabaseUrl}/functions/v1`;
  const supabase = createClient(supabaseUrl, serviceKey);

  let createdGoalId: string | null = null;
  let createdPlanId: string | null = null;
  /** Set once auth resolves; used in catch for cache invalidation after rollback (plan deleted mid-build). */
  let resolvedUserId: string | null = null;

  try {
    const raw = ((await req.json()) as CreateGoalRequest) || ({} as CreateGoalRequest);
    const user_id = requireUserIdFromRequest(req, raw.user_id);
    resolvedUserId = user_id;
    const mode = String(raw.mode ?? 'create').trim() as RequestMode;
    const action = raw.action;
    const existing_goal_id = trimId(raw.existing_goal_id);
    const replace_goal_id = trimId(raw.replace_goal_id);
    const replace_plan_id = trimId(raw.replace_plan_id);
    const plan_id = trimId(raw.plan_id);
    const goal = raw.goal;
    const plan_start_date = raw.plan_start_date;
    const bodyPreview = raw.preview === true;
    const ephemeralConflictPrefs =
      raw.ephemeral_conflict_preferences &&
      typeof raw.ephemeral_conflict_preferences === 'object' &&
      !Array.isArray(raw.ephemeral_conflict_preferences)
        ? (raw.ephemeral_conflict_preferences as Record<string, string>)
        : null;
    const strictSchedulePrefs = raw.strict_schedule_prefs === true;

    if (!user_id) throw new AppError('missing_user_id', 'user_id required');

    /** Align with ingest/delete-plan: coach + block caches must refresh after persisted plan changes. */
    const bustTrainingCachesAfterPlanChange = async (reason: string) => {
      try {
        await invalidateUserTrainingCache(supabase, user_id, `create-goal-and-materialize-plan:${reason}`);
      } catch (e) {
        console.warn('[create-goal-and-materialize-plan] training cache bust failed:', e);
      }
    };

    /** Combined engine declined (e.g. need two goals): response returns without throwing — catch{} rollback never runs. */
    const rollbackCombinedPlanUnavailable = async (): Promise<void> => {
      try {
        await invalidateUserTrainingCache(supabase, user_id, 'create-goal-and-materialize-plan:combined_unavailable');
      } catch (e) {
        console.warn('[create-goal-and-materialize-plan] combined unavailable cache bust:', e);
      }
      if (mode === 'create' && createdGoalId) {
        try {
          const { error: delErr } = await supabase.from('goals').delete().eq('id', createdGoalId).eq('user_id', user_id);
          if (delErr) console.warn('[create-goal-and-materialize-plan] combined unavailable goal delete:', delErr.message);
        } catch (e) {
          console.warn('[create-goal-and-materialize-plan] combined unavailable goal rollback', e);
        }
      }
    };

    if (!['create', 'build_existing', 'link_existing'].includes(mode)) throw new AppError('invalid_mode', 'mode must be create, build_existing, or link_existing');
    if (mode === 'link_existing') {
      if (!existing_goal_id || !plan_id) throw new AppError('missing_link_params', 'existing_goal_id and plan_id are required');
      const { data: goalRow, error: goalErr } = await supabase
        .from('goals')
        .select('id,user_id,goal_type,status')
        .eq('id', existing_goal_id)
        .eq('user_id', user_id)
        .maybeSingle();
      if (goalErr || !goalRow) throw new AppError('goal_not_found', goalErr?.message || 'Goal not found', 404);
      if (goalRow.goal_type !== 'event') throw new AppError('invalid_goal_type', 'Only event goals can be linked to generated plans');

      const { error: planLinkErr } = await supabase
        .from('plans')
        .update({ goal_id: existing_goal_id })
        .eq('id', plan_id)
        .eq('user_id', user_id);
      if (planLinkErr) throw new AppError('plan_link_failed', planLinkErr.message);

      await bustTrainingCachesAfterPlanChange('link_existing');

      return new Response(
        JSON.stringify({ success: true, mode: 'link_existing', goal_id: existing_goal_id, plan_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    // Extract combine flag from body (set by UI "Build combined plan" / season build)
    const combine = !!(raw as CreateGoalRequest & { combine?: boolean }).combine;

    if (mode === 'create') {
      if (!goal?.name || !goal?.target_date || !goal?.sport) throw new AppError('missing_goal_fields', 'goal name, target_date, and sport are required');
      if (!action || !['keep', 'replace'].includes(action)) throw new AppError('invalid_action', 'action must be keep or replace');
      if (String(goal.sport || '').toLowerCase() === 'run' && !goal.distance) {
        throw new AppError('missing_distance', 'Select a race distance to build a plan.');
      }

      // Keep-mode marathon spacing is now adaptive and memory-driven later in flow.
    } else if (!existing_goal_id) {
      throw new AppError('missing_goal_id', 'existing_goal_id required for build_existing mode');
    }

    // When the client forwards the goal it just inserted, use it directly —
    // eliminates the read-after-write DB lookup that was the root cause of goal_not_found.
    let resolvedGoal = goal || null;
    let resolvedBuildId: string | undefined;
    if (mode === 'build_existing') {
      if (resolvedGoal) {
        // Goal data was forwarded by the client (from the insert return value).
        // No DB read needed — we already have the authoritative data.
        resolvedBuildId = existing_goal_id ?? undefined;
        // Validate fields that the plan engine requires.
        if (String(resolvedGoal.sport || '').toLowerCase() === 'run' && !resolvedGoal.distance) {
          throw new AppError('missing_distance', 'Set a race distance on this goal before building a plan.');
        }
      } else {
        // No goal data forwarded — fall back to a DB lookup (covers calls from other clients,
        // webhooks, or the Goals screen "Build Plan" button which doesn't forward goal data).
        if (!existing_goal_id) throw new AppError('missing_goal_id', 'existing_goal_id required for build_existing mode');
        const { data: existingGoal, error: existingGoalErr } = await supabase
          .from('goals')
          .select('*')
          .eq('id', existing_goal_id)
          .eq('user_id', user_id)
          .maybeSingle();
        if (existingGoalErr || !existingGoal) {
          console.error('[create-goal] goal_not_found', { existing_goal_id, user_id, err: existingGoalErr?.message });
          throw new AppError('goal_not_found', existingGoalErr?.message || 'Goal not found', 404);
        }
        if (existingGoal.goal_type !== 'event') throw new AppError('invalid_goal_type', 'Only event goals can auto-build');
        if ((existingGoal.status || 'active') !== 'active') throw new AppError('goal_not_active', 'Goal must be active to build a plan');
        if (String(existingGoal.sport || '').toLowerCase() === 'run' && !existingGoal.distance) {
          throw new AppError('missing_distance', 'Set a race distance on this goal before building a plan.');
        }
        resolvedBuildId = String(existing_goal_id);
        resolvedGoal = {
          name: existingGoal.name,
          target_date: existingGoal.target_date,
          sport: existingGoal.sport,
          distance: existingGoal.distance,
          training_prefs: existingGoal.training_prefs || {},
          notes: existingGoal.notes || null,
        };
      }
    }

    const focusDateStr = new Date().toISOString().slice(0, 10);
    const arcForPlanning = await getArcContext(supabase, user_id, focusDateStr);

    /** Week-optimizer snapshot for standalone tri — combined path uses `buildCombinedPlan` snapshots. */
    let standaloneTriOptimizerSnapshot: BackfillOptimizerSnapshot | null = null;

    if (resolvedGoal) {
      const mergedPrefs = mergeTrainingPrefsWithArcDefaults(
        resolvedGoal.training_prefs as Record<string, unknown>,
        resolvedGoal.sport,
        arcForPlanning,
      );
      const sportForBackfill = String(resolvedGoal.sport || '').toLowerCase();
      if (sportForBackfill === 'triathlon' || sportForBackfill === 'tri') {
        if (strictSchedulePrefs) {
          const vc = validateTrainingPrefsScheduleCollision(
            mergedPrefs,
            normalizeGoalDistanceToTriCollisionDistance(resolvedGoal?.distance),
          );
          if (!vc.ok) {
            throw new AppError(vc.code, vc.message, 409);
          }
        }
        const { notes, optimizer_snapshot } = backfillTriTrainingPrefsDefenseInDepth(mergedPrefs, arcForPlanning);
        standaloneTriOptimizerSnapshot = optimizer_snapshot;
        if (notes.length > 0) {
          console.log('[create-goal] training_prefs server backfill:', notes.join(', '));
        }
      }
      resolvedGoal = { ...resolvedGoal, training_prefs: mergedPrefs };
      if (sportForBackfill === 'triathlon' || sportForBackfill === 'tri') {
        console.log('[build] training_prefs after backfill:', mergedPrefs);
      }
      if (ephemeralConflictPrefs) {
        const existingCp =
          typeof mergedPrefs.conflict_preferences === 'object' &&
          mergedPrefs.conflict_preferences !== null &&
          !Array.isArray(mergedPrefs.conflict_preferences)
            ? (mergedPrefs.conflict_preferences as Record<string, string>)
            : {};
        resolvedGoal = {
          ...resolvedGoal,
          training_prefs: {
            ...mergedPrefs,
            conflict_preferences: { ...existingCp, ...ephemeralConflictPrefs },
          },
        };
      }
      if (mode === 'build_existing' && !bodyPreview) {
        const updateGoalId = resolvedBuildId || existing_goal_id;
        if (updateGoalId) {
          await supabase
            .from('goals')
            .update({ training_prefs: resolvedGoal.training_prefs, updated_at: new Date().toISOString() })
            .eq('id', updateGoalId)
            .eq('user_id', user_id);
        }
      }
    }

    if (!resolvedGoal) {
      throw new AppError('missing_goal', 'Goal required to build a plan.');
    }
    if (resolvedGoal.target_date == null || String(resolvedGoal.target_date).trim() === '') {
      throw new AppError('missing_race_date', 'A race date is required to build a plan.');
    }
    const raceYmd = normalizeDateOnlyYmd(resolvedGoal.target_date);
    if (!raceYmd) {
      throw new AppError('invalid_race_date', 'Race date must be a valid calendar day (YYYY-MM-DD).');
    }
    // Postgres `date` is usually YYYY-MM-DD, but clients may send ISO datetimes — normalize so
    // weeksUntilRace / downstream generators never see `...ZT12:00:00` (Invalid Date → NaN weeks).
    resolvedGoal = { ...resolvedGoal, target_date: raceYmd };

    const sport = String(resolvedGoal.sport || '').toLowerCase();
    const isTri = sport === 'triathlon' || sport === 'tri';

    if (!['run', 'triathlon', 'tri'].includes(sport)) {
      throw new AppError('unsupported_sport', `Auto-build is not yet supported for "${sport}" goals. Supported: run, triathlon.`);
    }

    const fitness = String(resolvedGoal.training_prefs?.fitness || 'intermediate').toLowerCase();
    const tPrefs = resolvedGoal.training_prefs as { training_intent?: unknown; goal_type?: unknown } | undefined;
    const goalType = (() => {
      if (tPrefs && tPrefs.training_intent != null && String(tPrefs.training_intent).trim()) {
        return trainingIntentToPrefsGoalType(
          normalizeTrainingIntent(tPrefs.training_intent, 'completion'),
        );
      }
      return String(tPrefs?.goal_type || 'complete').toLowerCase();
    })();
    const postRaceRecovery = findPostRaceRecoveryContext(arcForPlanning.recent_completed_events, sport);

    // ── Triathlon path ────────────────────────────────────────────────────
    if (isTri) {
      const triDistanceApi = TRI_DISTANCE_TO_API[String(resolvedGoal?.distance || '')] ?? null;
      if (!triDistanceApi) {
        throw new AppError('missing_distance', 'Select a triathlon distance (Sprint, Olympic, 70.3, Ironman) to build a plan.');
      }
      const triFloorWeeks = TRI_MIN_WEEKS[triDistanceApi]?.[fitness] ?? 8;
      const weeksOutTri = weeksUntilRace(new Date(), new Date(`${resolvedGoal.target_date}T12:00:00`));
      if (weeksOutTri < 1)  throw new AppError('race_date_in_past', 'Race date must be in the future.');
      if (weeksOutTri < triFloorWeeks) {
        throw new AppError('race_too_close',
          `A ${triDistanceApi} triathlon for a ${fitness} athlete needs at least ${triFloorWeeks} weeks. Your race is ${weeksOutTri} weeks out.`);
      }
      const triDurationWeeks = Math.max(triFloorWeeks, Math.min(weeksOutTri, 32));

      if (mode === 'create') {
        const newGoalPriority = action === 'keep' && existing_goal_id ? 'B' : 'A';
        const { data: createdGoal, error: goalInsertErr } = await supabase
          .from('goals')
          .insert({
            user_id,
            name: String(resolvedGoal?.name || '').trim(),
            goal_type: 'event',
            target_date: resolvedGoal?.target_date,
            sport: 'triathlon',
            distance: resolvedGoal?.distance || null,
            course_profile: {},
            target_metric: null,
            target_value: null,
            current_value: null,
            priority: newGoalPriority,
            status: 'active',
            training_prefs: resolvedGoal?.training_prefs || {},
            notes: resolvedGoal?.notes || null,
          })
          .select('*')
          .single();
        if (goalInsertErr || !createdGoal) throw new AppError('goal_create_failed', goalInsertErr?.message || 'Failed to create goal');
        createdGoalId = createdGoal.id;
      } else {
        createdGoalId = resolvedBuildId || existing_goal_id || null;
      }

      // ── Combined plan routing ────────────────────────────────────────────
      // When the user explicitly chose "Build combined plan" (combine=true),
      // or when a second active event goal exists and action='keep', route
      // through generate-combined-plan for unified physiological optimization.
      console.log('[create-goal] postRaceRecovery:', JSON.stringify({
        apply: postRaceRecovery.apply,
        ...(postRaceRecovery.apply
          ? {
              severity: postRaceRecovery.severity,
              event: postRaceRecovery.event.name,
              days_ago: postRaceRecovery.event.days_ago,
            }
          : {}),
      }));
      if (combine && createdGoalId) {
        const combinedResult = await buildCombinedPlan(
          supabase, functionsBaseUrl, serviceKey,
          user_id, createdGoalId, resolvedGoal!, fitness,
          combinedTransitionFromPostRace(postRaceRecovery),
          plan_start_date ?? null,
          bodyPreview,
          strictSchedulePrefs,
        );
        if (combinedResult) {
          if (combinedResult.preview) {
            return new Response(
              JSON.stringify({
                success: true,
                mode,
                goal_id: createdGoalId,
                preview: true,
                combined_preview: combinedResult.combined_preview,
                schedule_signals: combinedResult.schedule_signals,
                sport: 'multi_sport',
                combined: true,
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          createdPlanId = combinedResult.plan_id;
          await bustTrainingCachesAfterPlanChange('combined_plan');
          return new Response(
            JSON.stringify({
              success: true,
              mode,
              goal_id: createdGoalId,
              plan_id: combinedResult.plan_id,
              schedule_signals: combinedResult.schedule_signals,
              sport: 'multi_sport',
              combined: true,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        await rollbackCombinedPlanUnavailable();
        const combinedUnavailableMsg =
          'Combined plan could not be built (needs two active event goals on file). Standalone generation was not run — retry shortly or adjust your races.';
        if (bodyPreview) {
          return new Response(
            JSON.stringify({
              success: false,
              preview: true,
              combined: true,
              error_code: 'combined_plan_unavailable',
              error: combinedUnavailableMsg,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            success: false,
            combined: true,
            error_code: 'combined_plan_unavailable',
            error: combinedUnavailableMsg,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      // ── End combined plan routing ─────────────────────────────────────────

      // Detect concurrent run plans to avoid stacking duplicate run sessions.
      // Extract which days of the week the existing run plan places runs on,
      // then pass those to the tri generator so it defers to that plan's runs.
      const { data: otherActivePlans } = await supabase
        .from('plans')
        .select('id, config, sessions_by_week')
        .eq('user_id', user_id)
        .eq('status', 'active');

      const existingRunDaySet = new Set<string>();
      for (const op of otherActivePlans || []) {
        const opSport = String(op.config?.sport || op.config?.plan_type || '').toLowerCase();
        if (!['run', 'running'].includes(opSport)) continue;
        const sbw = op.sessions_by_week;
        if (!sbw || typeof sbw !== 'object') continue;
        for (const weekSessions of Object.values(sbw)) {
          if (!Array.isArray(weekSessions)) continue;
          for (const s of weekSessions) {
            const sType = String(s?.discipline || s?.type || '').toLowerCase();
            if (sType === 'run' && s?.day) {
              existingRunDaySet.add(String(s.day));
            }
          }
        }
      }

      // Read athlete baselines for discipline seeding
      const { data: triBaseline } = await supabase.from('user_baselines').select('*').eq('user_id', user_id).maybeSingle();
      const { data: triSnapshots } = await supabase
        .from('athlete_snapshot')
        .select('week_start, workload_by_discipline, acwr, workload_total')
        .eq('user_id', user_id)
        .order('week_start', { ascending: false })
        .limit(8);

      const latestSnap = triSnapshots?.[0] ?? null;
      const triPreferredDays = (() => {
        const pd = resolvedGoal?.training_prefs?.preferred_days;
        if (!pd || typeof pd !== 'object' || Array.isArray(pd)) return undefined;
        return pd as Record<string, unknown>;
      })();

      const triGenerateBody: Record<string, any> = {
        user_id,
        distance:         triDistanceApi,
        fitness,
        goal:             goalType === 'speed' ? 'performance' : 'complete',
        duration_weeks:   triDurationWeeks,
        race_date:        resolvedGoal?.target_date,
        race_name:        resolvedGoal?.name,
        ftp:              triBaseline?.performance_numbers?.ftp ?? undefined,
        swim_pace_per_100_sec: triBaseline?.performance_numbers?.swimPacePer100 ?? triBaseline?.swim_pace_per_100_sec ?? undefined,
        days_per_week:    resolvedGoal?.training_prefs?.days_per_week ?? undefined,
        // Triathlon plans support 0/1/2 strength days — cap UI value of 3 to 2
        strength_frequency: Math.min(2, Number(resolvedGoal?.training_prefs?.strength_frequency ?? 0)),
        equipment_type: resolveStrengthEquipmentTypeForPlan(
          resolvedGoal?.training_prefs?.equipment_type,
          triBaseline?.equipment?.strength ?? [],
          triBaseline?.performance_numbers,
        ),
        // Limiter sport from training prefs (used to shift strength emphasis)
        limiter_sport: resolvedGoal?.training_prefs?.limiter_sport ?? undefined,
        training_intent: normalizeTrainingIntent(
          (resolvedGoal?.training_prefs as { training_intent?: unknown } | undefined)?.training_intent,
          goalType === 'speed' ? 'performance' : 'completion',
        ),
        // Approach: 'base_first' for completion athletes, 'race_peak' for performance.
        // Derived from goal type if not explicitly set in training_prefs.
        approach: resolvedGoal?.training_prefs?.tri_approach
          ?? (goalType === 'speed' ? 'race_peak' : 'base_first'),
        // Athlete-preferred days from the setup wizard — session placement honors these.
        ...(triPreferredDays ? { preferred_days: triPreferredDays } : {}),
        // Fine-grained equipment flags — drive exercise substitution in the protocol.
        has_cable: hasCableMachine(triBaseline?.equipment?.strength ?? []),
        has_ghd:   hasGHD(triBaseline?.equipment?.strength ?? []),
        ...(plan_start_date ? { start_date: plan_start_date } : {}),
        // Days already covered by a concurrent run plan — tri generator defers to those sessions
        ...(existingRunDaySet.size > 0 ? { existing_run_days: [...existingRunDaySet] } : {}),
        ...(postRaceRecovery.apply && postRaceRecovery.severity === 'full'
          ? { transition_mode: 'recovery_rebuild' as const }
          : {}),
      };

      const triLearned = parseLearnedFitnessForSeed(triBaseline?.learned_fitness);
      if (learnedPaceUsable(triLearned?.ride_ftp_estimated)) {
        triGenerateBody.ftp = Number((triLearned.ride_ftp_estimated as { value: number }).value);
        console.log('[create-goal] tri ftp source: learned_fitness vs performance_numbers (using learned_fitness)');
      } else {
        console.log('[create-goal] tri ftp source: learned_fitness vs performance_numbers (using performance_numbers)');
      }

      // Seed current discipline volumes from snapshot
      if (latestSnap?.workload_by_discipline) {
        const wd = latestSnap.workload_by_discipline;
        if (wd.run)   triGenerateBody.current_weekly_run_miles   = Math.round(wd.run / 10);
        if (wd.bike)  triGenerateBody.current_weekly_bike_hours  = Math.round(wd.bike / 60 * 10) / 10;
        if (wd.swim)  triGenerateBody.current_weekly_swim_yards  = Math.round(wd.swim / 2);
      }
      if (latestSnap?.acwr != null) triGenerateBody.current_acwr = Number(latestSnap.acwr);

      const triTradeOffGoalId = String(createdGoalId || resolvedBuildId || '');
      const standalone_generation_trade_offs = buildCombinedPlanGenerationTradeOffs({
        postRace: postRaceRecovery,
        optimizerSnapshots: standaloneTriOptimizerSnapshot
          ? [{ goal_id: triTradeOffGoalId || 'tri', ...standaloneTriOptimizerSnapshot }]
          : [],
      });
      triGenerateBody.generation_trade_offs = standalone_generation_trade_offs;
      console.log('[create-goal] standalone tri generation_trade_offs:', JSON.stringify(standalone_generation_trade_offs));

      const triScheduleSignals = aggregateOptimizerScheduleSignals(
        standaloneTriOptimizerSnapshot
          ? [{ goal_id: triTradeOffGoalId || 'tri', ...standaloneTriOptimizerSnapshot }]
          : [],
      );

      const triGenerated = await invokeFunction(functionsBaseUrl, serviceKey, 'generate-triathlon-plan', triGenerateBody);
      const triPlanId = triGenerated?.plan_id;
      if (!triPlanId) throw new AppError('plan_generation_failed', triGenerated?.error || 'Triathlon plan generation returned no plan_id');
      createdPlanId = triPlanId;

      await supabase.from('plans').update({ goal_id: createdGoalId, plan_mode: 'rolling' }).eq('id', triPlanId).eq('user_id', user_id);
      await invokeFunction(functionsBaseUrl, serviceKey, 'activate-plan', { plan_id: triPlanId });
      await retireCompetingActivePlans(supabase, user_id, triPlanId, { mode, existing_goal_id, replace_plan_id });

      // Cancel the replaced triathlon goal and end its linked plans (mirrors run-path replace logic)
      if (mode === 'create' && action === 'replace' && replace_goal_id) {
        await supabase
          .from('goals')
          .update({ status: 'cancelled' })
          .eq('id', replace_goal_id)
          .eq('user_id', user_id);

        const { data: linkedPlans } = await supabase
          .from('plans')
          .select('id, status')
          .eq('user_id', user_id)
          .eq('goal_id', replace_goal_id)
          .eq('status', 'active');

        for (const lp of linkedPlans || []) {
          const weekStart = currentWeekMondayISO();
          await supabase.from('planned_workouts').delete().eq('training_plan_id', lp.id).gte('date', weekStart);
          await supabase.from('plans').update({ status: 'ended' }).eq('id', lp.id).eq('user_id', user_id);
        }
      }

      if (createdGoalId) {
        try {
          await recomputeRaceProjectionsForUser(supabase, user_id, { goalIds: [createdGoalId] });
        } catch (e) {
          console.warn('[create-goal-and-materialize-plan] recompute projection', e);
        }
      }

      await bustTrainingCachesAfterPlanChange('triathlon_plan');

      return new Response(
        JSON.stringify({
          success: true,
          mode,
          goal_id: createdGoalId,
          plan_id: triPlanId,
          sport: 'triathlon',
          distance: triDistanceApi,
          schedule_signals: triScheduleSignals,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    // ── End triathlon path ────────────────────────────────────────────────

    const distanceApi = distanceToApiValue(resolvedGoal?.distance || null);
    if (!distanceApi) throw new AppError('missing_distance', 'Select a race distance to build a plan.');
    const floorWeeks = MIN_WEEKS[distanceApi]?.[fitness] ?? 4;
    const weeksOut = weeksUntilRace(new Date(), new Date(`${resolvedGoal.target_date}T12:00:00`));
    if (weeksOut < 1) {
      throw new AppError('race_date_in_past', 'Race date must be in the future.');
    }
    let adaptiveMarathonDecision: any = null;

    const [{ data: baseline }, { data: recentSnapshots }, { data: recentEndedPlans }] = await Promise.all([
      supabase.from('user_baselines').select('*').eq('user_id', user_id).maybeSingle(),
      supabase
        .from('athlete_snapshot')
        .select('week_start, run_long_run_duration, acwr, workload_total, workload_by_discipline')
        .eq('user_id', user_id)
        .order('week_start', { ascending: false })
        .limit(8),
      // Read recent ended plans for tombstone-based transition classification
      supabase
        .from('plans')
        .select('id, config, duration_weeks, created_at')
        .eq('user_id', user_id)
        .in('status', ['ended', 'completed'])
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    const planningCtx = computeRunPlanningSignals(baseline, recentSnapshots, recentEndedPlans, {
      newDiscipline: String(resolvedGoal?.sport || 'run'),
      weeksOut,
    });
    let trainingTransition: TrainingTransition = planningCtx.transition;
    const weeklyMiles = planningCtx.current_weekly_miles;
    let recent_long_run_miles = planningCtx.recent_long_run_miles;
    let weeks_since_peak_long_run = planningCtx.weeks_since_peak_long_run;
    const current_acwr = planningCtx.current_acwr;
    const volume_trend = planningCtx.volume_trend;
    if (postRaceRecovery.apply && postRaceRecovery.severity === 'full') {
      trainingTransition = {
        mode: 'recovery_rebuild',
        reasoning: postRaceRecovery.reasoning,
        peak_long_run_miles: postRaceRecovery.recentLongRunMilesHint,
      };
      weeks_since_peak_long_run = 0;
      const hint = postRaceRecovery.recentLongRunMilesHint;
      recent_long_run_miles = recent_long_run_miles != null ? Math.max(recent_long_run_miles, hint) : hint;
      console.log(`[create-goal] post-race recovery (full) from Arc: ${postRaceRecovery.event.name}, days_ago=${postRaceRecovery.event.days_ago}, longRunHint=${hint} mi`);
    } else if (postRaceRecovery.apply && postRaceRecovery.severity === 'moderate') {
      console.log(
        `[create-goal] post-race (moderate structural only): ${postRaceRecovery.event.name}, days_ago=${postRaceRecovery.event.days_ago}`,
      );
    }
    if (recent_long_run_miles != null && weeks_since_peak_long_run != null) {
      console.log(`[AthleteState] Peak long run: ${recent_long_run_miles} mi, ${weeks_since_peak_long_run} weeks ago (planning context)`);
    }

    let personalizedFloorWeeks = floorWeeks;
    if (distanceApi === 'marathon') {
      // Recompute memory immediately so marathon gating reads fresh longitudinal state.
      await invokeFunction(functionsBaseUrl, serviceKey, 'recompute-athlete-memory', { user_id });

      const latestMemory = await getLatestAthleteMemory(supabase, user_id);

      let spacingWeeks: number | null = null;
      if (mode === 'create' && action === 'keep' && existing_goal_id) {
        const { data: existingGoal } = await supabase
          .from('goals')
          .select('id, target_date, distance, goal_type, status')
          .eq('id', existing_goal_id)
          .eq('user_id', user_id)
          .maybeSingle();
        if (
          existingGoal &&
          existingGoal.goal_type === 'event' &&
          (existingGoal.status || 'active') === 'active' &&
          isMarathonDistance(existingGoal.distance) &&
          existingGoal.target_date &&
          resolvedGoal?.target_date
        ) {
          const exY = normalizeDateOnlyYmd(existingGoal.target_date);
          const curY = normalizeDateOnlyYmd(resolvedGoal.target_date);
          if (exY && curY) {
            spacingWeeks = Math.abs(weeksBetween(new Date(`${exY}T12:00:00`), new Date(`${curY}T12:00:00`)));
          }
      }
      }

      const adaptive = resolveAdaptiveMarathonDecisionFromMemory(latestMemory, {
        weeksOut,
        spacingWeeks,
        fitness,
      });
      adaptiveMarathonDecision = adaptive;
      console.log('[adaptive-marathon-decision]', {
        user_id,
        weeksOut,
        spacingWeeks,
        readiness_state: adaptive.readiness_state,
        recommended_mode: adaptive.recommended_mode,
        risk_tier: adaptive.risk_tier,
        decision_source: adaptive.decision_source,
      });

      if (ADAPTIVE_MARATHON_DECISIONS_ENABLED) {
        personalizedFloorWeeks = Math.max(1, adaptive.minimum_feasible_weeks);
      } else {
        const resolved = resolveMarathonMinWeeksFromMemory(latestMemory, fitness, floorWeeks);
        const confidence = resolved.confidence;
        const sufficiencyWeeks = resolved.sufficiencyWeeks;
        if (!Number.isFinite(confidence) || confidence < 0.35 || sufficiencyWeeks < 4) {
          throw new AppError(
            'insufficient_evidence_memory',
            'Marathon timeline needs at least 4 weeks of quality history before we can personalize safely.',
          );
        }
        if (!resolved.minWeeks) {
          throw new AppError(
            'memory_rule_missing',
            'Athlete memory is missing marathon readiness rules. Recompute memory and try again.',
          );
        }
        personalizedFloorWeeks = resolved.minWeeks;
      }
    }

    let allowRaceWeekSupportMode = false;
    if (distanceApi === 'marathon' && weeksOut <= 2) {
      const { data: activeRunPlan } = await supabase
        .from('plans')
        .select('id, plan_type, config, status')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const planType = String(activeRunPlan?.plan_type || '').toLowerCase();
      const planSport = String(activeRunPlan?.config?.sport || '').toLowerCase();
      const hasActiveRunContext = !!activeRunPlan && (planType.includes('run') || planSport === 'run');
      allowRaceWeekSupportMode = hasActiveRunContext;
    }

    if (!ADAPTIVE_MARATHON_DECISIONS_ENABLED && !allowRaceWeekSupportMode && weeksOut < personalizedFloorWeeks) {
      const msg = distanceApi === 'marathon'
        ? `Based on your recent training history, this marathon needs about ${personalizedFloorWeeks}+ weeks. Your selected race is ${weeksOut} weeks out. Choose Replace with a later date or pick a shorter race.`
        : `Your race is ${weeksOut} weeks away. ${distanceApi} needs at least ${personalizedFloorWeeks} weeks.`;
      throw new AppError(
        distanceApi === 'marathon' ? 'race_too_close_personalized' : 'race_too_close',
        msg,
      );
    }
    const adaptiveMode = adaptiveMarathonDecision?.recommended_mode as string | undefined;
    const adaptiveSupportMode = distanceApi === 'marathon' && ADAPTIVE_MARATHON_DECISIONS_ENABLED
      ? adaptiveMode === 'race_support' || adaptiveMode === 'bridge_peak'
      : false;
    const durationWeeks = adaptiveSupportMode
      ? Math.max(1, Math.min(weeksOut, adaptiveMode === 'race_support' ? 2 : 6))
      : allowRaceWeekSupportMode
        ? Math.max(1, Math.min(weeksOut, 2))
        : Math.max(personalizedFloorWeeks, Math.min(weeksOut, 20));

    if (goalType === 'speed') {
      const hasRaceTime = baseline?.effort_source_distance && baseline?.effort_source_time;
      const hasEffortScore = !!baseline?.effort_score;
      const hasThresholdPace = !!baseline?.effort_paces?.race;
      const learnedForGate = parseLearnedFitnessForSeed(baseline?.learned_fitness);
      const hasLearnedRunPace = learnedPaceUsable(learnedForGate?.run_threshold_pace_sec_per_km)
        || learnedPaceUsable(learnedForGate?.run_easy_pace_sec_per_km);
      if (!hasRaceTime && !hasEffortScore && !hasThresholdPace && !hasLearnedRunPace) {
        throw new AppError('missing_pace_benchmark', 'Pace benchmark required: enter a recent race result or run quick calibration first.');
      }
    }

    if (mode === 'create') {
      const newGoalPriority = action === 'keep' && existing_goal_id ? 'B' : 'A';
      const { data: createdGoal, error: goalInsertErr } = await supabase
        .from('goals')
        .insert({
          user_id,
          name: String(resolvedGoal?.name || '').trim(),
          goal_type: 'event',
          target_date: resolvedGoal?.target_date,
          sport,
          distance: resolvedGoal?.distance || null,
          course_profile: {},
          target_metric: null,
          target_value: null,
          current_value: null,
          priority: newGoalPriority,
          status: 'active',
          training_prefs: resolvedGoal?.training_prefs || {},
          notes: resolvedGoal?.notes || null,
        })
        .select('*')
        .single();
      if (goalInsertErr || !createdGoal) throw new AppError('goal_create_failed', goalInsertErr?.message || 'Failed to create goal');
      createdGoalId = createdGoal.id;
    } else {
      createdGoalId = existing_goal_id || null;
    }

    // ── Combined plan routing (run path) ─────────────────────────────────
    if (combine && createdGoalId) {
      const combinedResult = await buildCombinedPlan(
        supabase, functionsBaseUrl, serviceKey,
        user_id, createdGoalId, resolvedGoal!, fitness,
        combinedTransitionFromPostRace(postRaceRecovery),
        plan_start_date ?? null,
        bodyPreview,
        strictSchedulePrefs,
      );
      if (combinedResult) {
        if (combinedResult.preview) {
          return new Response(
            JSON.stringify({
              success: true,
              mode,
              goal_id: createdGoalId,
              preview: true,
              combined_preview: combinedResult.combined_preview,
              schedule_signals: combinedResult.schedule_signals,
              sport: 'multi_sport',
              combined: true,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        createdPlanId = combinedResult.plan_id;
        await bustTrainingCachesAfterPlanChange('combined_plan');
        return new Response(
          JSON.stringify({
            success: true,
            mode,
            goal_id: createdGoalId,
            plan_id: combinedResult.plan_id,
            schedule_signals: combinedResult.schedule_signals,
            sport: 'multi_sport',
            combined: true,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      await rollbackCombinedPlanUnavailable();
      const combinedUnavailableMsg =
        'Combined plan could not be built (needs two active event goals on file). Standalone generation was not run — retry shortly or adjust your races.';
      if (bodyPreview) {
        return new Response(
          JSON.stringify({
            success: false,
            preview: true,
            combined: true,
            error_code: 'combined_plan_unavailable',
            error: combinedUnavailableMsg,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          combined: true,
          error_code: 'combined_plan_unavailable',
          error: combinedUnavailableMsg,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    // ── End combined plan routing ─────────────────────────────────────────

    const generateBody: Record<string, any> = {
      user_id,
      distance: distanceApi,
      fitness,
      goal: goalType,
      duration_weeks: durationWeeks,
      approach: (allowRaceWeekSupportMode || adaptiveSupportMode) ? 'sustainable' : (goalType === 'complete' ? 'sustainable' : 'performance_build'),
      days_per_week: resolvedGoal?.training_prefs?.days_per_week
        ? `${resolvedGoal.training_prefs.days_per_week}-${Math.min(7, Number(resolvedGoal.training_prefs.days_per_week) + 1)}`
        : '4-5',
      race_date: resolvedGoal?.target_date,
      race_name: resolvedGoal?.name,
      current_weekly_miles: weeklyMiles,
      ...(recent_long_run_miles != null ? { recent_long_run_miles } : {}),
      ...(weeks_since_peak_long_run != null ? { weeks_since_peak_long_run } : {}),
      ...(current_acwr != null ? { current_acwr } : {}),
      ...(volume_trend ? { volume_trend } : {}),
      transition_mode: trainingTransition.mode,
      ...(plan_start_date ? { start_date: plan_start_date } : {}),
    };
    if (allowRaceWeekSupportMode || adaptiveSupportMode) {
      generateBody.race_week_mode = true;
    }

    if (generateBody.approach === 'performance_build') {
      const merged = mergeRunPerformanceSeeds(
        baseline as unknown as Record<string, unknown> | null | undefined,
      );
      if (merged) {
        if (merged.effort_bearer === 'source') {
          generateBody.effort_source_distance = merged.effort_source_distance;
          generateBody.effort_source_time = merged.effort_source_time;
        } else {
          generateBody.effort_score = merged.effort_score;
        }
        generateBody.effort_paces = merged.effort_paces;
        const effSrc =
          (merged.base_pace_field === 'learned_fitness' && merged.steady_pace_field === 'learned_fitness')
            ? 'learned_fitness (base + threshold)'
            : (merged.base_pace_field === 'learned_fitness' || merged.steady_pace_field === 'learned_fitness'
              ? 'learned_fitness (partial) vs performance_numbers'
              : 'performance_numbers');
        console.log(
          `[create-goal] effort_paces source: ${effSrc} — base=${merged.base_pace_field}, threshold(steady)=${merged.steady_pace_field}`,
        );
      } else {
        if (baseline?.effort_source_distance && baseline?.effort_source_time) {
          generateBody.effort_source_distance = baseline.effort_source_distance;
          generateBody.effort_source_time = baseline.effort_source_time;
        } else if (baseline?.effort_score) {
          generateBody.effort_score = baseline.effort_score;
        }
        if (baseline?.effort_paces) generateBody.effort_paces = baseline.effort_paces;
        console.log('[create-goal] effort_paces source: learned_fitness vs performance_numbers (using performance_numbers — merge skipped)');
      }
    }

    if (resolvedGoal?.training_prefs?.strength_protocol && resolvedGoal.training_prefs.strength_protocol !== 'none') {
      generateBody.strength_protocol = resolvedGoal.training_prefs.strength_protocol;
      generateBody.strength_frequency = resolvedGoal.training_prefs.strength_frequency || 2;
      const runEquipmentType = resolveStrengthEquipmentTypeForPlan(
        resolvedGoal?.training_prefs?.equipment_type,
        baseline?.equipment?.strength ?? [],
        baseline?.performance_numbers,
      );
      generateBody.strength_tier = runEquipmentType === 'commercial_gym' ? 'strength_power' : 'injury_prevention';
      generateBody.equipment_type = runEquipmentType;
    }

    // Structural load hint: tell the generator whether heavy lower-body
    // lifting will be overlaid so it can govern long-run volume in early weeks.
    // "heavy_lower" = neural_speed protocol with ≥2 sessions (85%+ 1RM squats/DLs).
    // "moderate"    = durability or any strength_power tier with ≥2 sessions.
    // "none"        = no strength, or bodyweight-only / upper-only protocols.
    const strengthFreq = Number(generateBody.strength_frequency ?? 0);
    const strengthProto = String(generateBody.strength_protocol ?? '');
    const strengthTier = String(generateBody.strength_tier ?? '');
    if (strengthFreq >= 2 && (strengthProto === 'neural_speed' || strengthTier === 'strength_power')) {
      generateBody.structural_load_hint = strengthProto === 'neural_speed' ? 'heavy_lower' : 'moderate';
    }
    if (postRaceRecovery.apply) {
      generateBody.structural_load_hint = postRaceRecovery.severity === 'full' ? 'low' : 'moderate';
    }

    const generated = await invokeFunction(functionsBaseUrl, serviceKey, 'generate-run-plan', generateBody);
    const generatedPlanId = generated?.plan_id;
    if (!generatedPlanId) throw new AppError('plan_generation_failed', generated?.error || 'Plan generation returned no plan_id');
    createdPlanId = generatedPlanId;

    const { error: linkErr } = await supabase
      .from('plans')
      .update({ goal_id: createdGoalId, plan_mode: 'rolling' })
      .eq('id', generatedPlanId)
      .eq('user_id', user_id);
    if (linkErr) throw new AppError('plan_link_failed', linkErr.message);

    await invokeFunction(functionsBaseUrl, serviceKey, 'activate-plan', { plan_id: generatedPlanId });
    await retireCompetingActivePlans(supabase, user_id, generatedPlanId, { mode, existing_goal_id, replace_plan_id });

    if (mode === 'create' && action === 'replace' && replace_goal_id) {
      await supabase
        .from('goals')
        .update({ status: 'cancelled' })
        .eq('id', replace_goal_id)
        .eq('user_id', user_id);

      const { data: linkedPlans } = await supabase
        .from('plans')
        .select('id,status')
        .eq('user_id', user_id)
        .eq('goal_id', replace_goal_id)
        .eq('status', 'active');

      for (const lp of linkedPlans || []) {
        const weekStart = currentWeekMondayISO();
        await supabase.from('planned_workouts').delete().eq('training_plan_id', lp.id).gte('date', weekStart);
        await supabase.from('plans').update({ status: 'ended' }).eq('id', lp.id).eq('user_id', user_id);
      }
    }

    if (createdGoalId) {
      try {
        await recomputeRaceProjectionsForUser(supabase, user_id, { goalIds: [createdGoalId] });
      } catch (e) {
        console.warn('[create-goal-and-materialize-plan] recompute projection', e);
      }
    }

    await bustTrainingCachesAfterPlanChange('run_plan');

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        goal_id: createdGoalId,
        plan_id: generatedPlanId,
        // Training transition context — tells the UI how the plan was shaped
        transition_mode: trainingTransition.mode,
        transition_reasoning: trainingTransition.reasoning,
        readiness_state: adaptiveMarathonDecision?.readiness_state,
        recommended_mode: adaptiveMarathonDecision?.recommended_mode,
        risk_tier: adaptiveMarathonDecision?.risk_tier,
        spacing_assessment: adaptiveMarathonDecision?.spacing_assessment,
        decision_source: adaptiveMarathonDecision?.decision_source,
        why: adaptiveMarathonDecision?.why,
        constraints: adaptiveMarathonDecision?.constraints,
        next_actions: adaptiveMarathonDecision?.next_actions,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    // Best-effort rollback to avoid dangling entities.
    if (createdPlanId) {
      try {
        await supabase.from('planned_workouts').delete().eq('training_plan_id', createdPlanId);
        await supabase.from('plans').delete().eq('id', createdPlanId);
      } catch {
        // no-op
      }
    }
    if (createdGoalId) {
      try {
        await supabase.from('goals').delete().eq('id', createdGoalId);
      } catch {
        // no-op
      }
    }
    if (resolvedUserId && (createdPlanId || createdGoalId)) {
      try {
        await invalidateUserTrainingCache(supabase, resolvedUserId, 'create-goal-and-materialize-plan rollback');
      } catch {
        // best-effort — same caches as ingest after partial plan/goal teardown
      }
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Unknown error',
        error_code: err?.code || 'unknown_error',
        http_status: err?.status || 400,
      }),
      // Return 200 with structured error payload so clients consistently display
      // business-rule failures instead of generic transport errors.
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
