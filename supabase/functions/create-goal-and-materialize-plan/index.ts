import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  getLatestAthleteMemory,
  resolveAdaptiveMarathonDecisionFromMemory,
  resolveMarathonMinWeeksFromMemory,
} from '../_shared/athlete-memory.ts';
import { getArcContext, type ArcContext } from '../_shared/arc-context.ts';
import {
  computeRunPlanningSignals,
  findPostRaceRecoveryContext,
  swimVolumeMultiplierFromArcWorkouts,
  type TrainingTransition,
} from '../_shared/planning-context.ts';
import { recomputeRaceProjectionsForUser } from '../_shared/recompute-goal-race-projections.ts';
import { normalizeTrainingIntent, trainingIntentToPrefsGoalType } from '../_shared/training-intent.ts';
import {
  deriveRestDaysForBudget,
  mergeCombinedSchedulePrefs,
  readDaysPerWeekFromPrefs,
} from '../_shared/combined-schedule-prefs.ts';
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
  hasBarbellCapability,
  resolveStrengthEquipmentTypeForPlan,
} from '../_shared/strength-equipment-tier.ts';
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

function currentWeekMondayISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
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
 * Mutates `trainingPrefs` in place. Returns human-readable notes for logging.
 */
function backfillTriTrainingPrefsDefenseInDepth(
  trainingPrefs: Record<string, unknown>,
  arc: ArcContext,
): string[] {
  const notes: string[] = [];
  const si = trainingPrefs.strength_intent ?? trainingPrefs.strengthIntent;
  if (si !== 'support' && si !== 'performance') {
    trainingPrefs.strength_intent = inferStrengthIntentFromAthleteIdentity(arc);
    notes.push(`strength_intent→${trainingPrefs.strength_intent}`);
  }

  const pdRaw = trainingPrefs.preferred_days ?? trainingPrefs.preferredDays;
  const pd = pdRaw && typeof pdRaw === 'object' && !Array.isArray(pdRaw)
    ? (pdRaw as Record<string, unknown>)
    : null;

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
  const swimsPerWeek = (() => {
    const n = Math.max(0, Math.min(3, swimDays?.length ?? 2));
    return n as 0 | 1 | 2 | 3;
  })();
  const strengthFreq = (() => {
    const n = Math.max(0, Math.min(3, strengthDaysIn?.length ?? 2));
    return n as 0 | 1 | 2 | 3;
  })();
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
    ? validatePreferredDays(candidate, inputs.athlete)
    : ['incomplete preferred_days'];

  if (validationErrors.length === 0) {
    // User-provided week is matrix-clean; nothing to do.
    delete trainingPrefs.co_equal_strength_provisional_1x;
    return notes;
  }

  // Derive a fresh, matrix-valid week (with 1× co-equal recovery if 2× cannot be placed).
  const { week: optimal, used_co_equal_1x_fallback } = deriveOptimalWeekWithCoEqualRecovery(inputs);
  const merged: Record<string, unknown> = { ...optimal.preferred_days };

  // Restore user-specified swim days: the optimizer only honors one swim anchor
  // (masters_swim). If the athlete set explicit swim days (e.g. ["tuesday","friday"]),
  // put them back so we don't clobber their calendar with algorithmic defaults.
  if (swimDays && swimDays.length > 0) {
    merged.swim = swimDays;
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
  return notes;
}

/**
 * For combined tri plans: keep explicit non-tri strength protocols (neural_speed, …);
 * otherwise map `strength_intent` → triathlon vs triathlon_performance.
 */
function resolveCombinedTriStrengthProtocol(
  rawProtocol: string | undefined,
  strengthIntent: string | undefined,
): string {
  const p = String(rawProtocol ?? '').trim();
  const nonTri = new Set([
    'neural_speed',
    'durability',
    'upper_aesthetics',
    'minimum_dose',
    'upper_priority_hybrid',
    'foundation_durability',
    'performance_neural',
  ]);
  if (p && nonTri.has(p)) return p;
  if (p === 'triathlon_performance') return 'triathlon_performance';
  if (p === 'triathlon') return 'triathlon';
  if (strengthIntent === 'performance') return 'triathlon_performance';
  return 'triathlon';
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
    if (/\bhammer\s+ride\b/.test(notes)) return 'Hammer Ride';
    if (/\bgroup\s+ride\b/.test(notes)) return 'Group Ride';
  }
  return null;
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
    structural_load_hint?: 'low' | 'normal';
  },
): Promise<{ plan_id: string } | null> {

  // Gather all active event goals (including the just-created one)
  const { data: allEventGoals } = await supabase
    .from('goals')
    .select('id, name, sport, distance, target_date, priority, training_prefs, status')
    .eq('user_id', user_id)
    .eq('goal_type', 'event')
    .eq('status', 'active');

  if (!allEventGoals || allEventGoals.length < 2) return null; // No sibling goals; fall through

  // Get athlete snapshots for CTL + volume estimates, and baselines for equipment
  const [{ data: snapshots }, { data: combinedBaseline }] = await Promise.all([
    supabase
      .from('athlete_snapshot')
      .select('week_start, workload_total, workload_by_discipline, acwr')
      .eq('user_id', user_id)
      .order('week_start', { ascending: false })
      .limit(6),
    supabase.from('user_baselines').select('equipment').eq('user_id', user_id).maybeSingle(),
  ]);

  // Derive CTL from recent weekly workload. workload_total is in load points;
  // we scale to approximate TSS/day for the combined plan engine.
  const recentLoads = (snapshots || []).map(s => Number(s.workload_total || 0)).filter(v => v > 0);
  const avgWeeklyLoad = recentLoads.length > 0
    ? recentLoads.reduce((a, b) => a + b, 0) / recentLoads.length
    : 0;
  // Convert load points to approximate CTL (daily TSS equivalent)
  const currentCTL = avgWeeklyLoad > 0
    ? Math.round(Math.min(120, Math.max(15, avgWeeklyLoad / 7)))
    : ({ beginner: 20, intermediate: 40, advanced: 65 }[fitness] ?? 35);

  // Weekly hours estimate from fitness level (can be overridden by actual data later)
  const weeklyHours = { beginner: 6, intermediate: 10, advanced: 14 }[fitness] ?? 10;

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
  const goalsForCombined = allEventGoals.map(g => {
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
  // The primary event goal drives the approach; defaults to the same logic as standalone.
  const primaryGoal = goalsForCombined.find(g => g.priority === 'A') ?? goalsForCombined[0];
  const primaryGoalPrefs = (allEventGoals.find(g => g.id === primaryGoal?.id)?.training_prefs as Record<string, any>) ?? {};
  const primaryGoalType  = String(primaryGoalPrefs?.goal_type || '').toLowerCase();
  const triApproach = (newGoal.training_prefs?.tri_approach as string | undefined)
    ?? primaryGoalPrefs?.tri_approach
    ?? (primaryGoalType === 'speed' ? 'race_peak' : 'base_first');

  const combinedSchedulePrefs = mergeCombinedSchedulePrefs(
    primaryGoalPrefs as Record<string, unknown>,
    newGoal.training_prefs as Record<string, unknown>,
  );
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

  // base_first always defaults to 2:1 loading (completion-focused, slower recovery).
  // race_peak defers to fitness level (beginner→2:1, intermediate/advanced→3:1).
  const loadingPattern = triApproach === 'base_first'
    ? '2:1'
    : (fitness === 'beginner' ? '2:1' : '3:1');

  const focusForCombined = new Date().toISOString().slice(0, 10);
  const arcForCombined = await getArcContext(supabase, user_id, focusForCombined);

  for (const g of allEventGoals || []) {
    const sp = String(g.sport || '').toLowerCase();
    if (sp !== 'triathlon' && sp !== 'tri') continue;
    const prev = g.training_prefs;
    const base =
      prev && typeof prev === 'object' && !Array.isArray(prev)
        ? { ...(prev as Record<string, unknown>) }
        : {};
    const notes = backfillTriTrainingPrefsDefenseInDepth(base, arcForCombined);
    if (notes.length > 0) {
      console.log(`[create-goal] combined plan training_prefs backfill goal ${g.id}:`, notes.join(', '));
      console.log('[build] training_prefs after backfill:', base);
      const { error: upErr } = await supabase
        .from('goals')
        .update({ training_prefs: base, updated_at: new Date().toISOString() })
        .eq('id', g.id)
        .eq('user_id', user_id);
      if (upErr) console.warn('[buildCombinedPlan] goals training_prefs backfill update', upErr.message);
      (g as { training_prefs: Record<string, unknown> }).training_prefs = base;
    }
  }

  const swim_volume_multiplier = swimVolumeMultiplierFromArcWorkouts(arcForCombined.swim_training_from_workouts);

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
    (allEventGoals.find((g) => g.id === primaryGoal?.id)?.training_prefs as Record<string, any>) ?? {};
  const coEqualProvisional1x = Boolean(backfilledPrimaryPrefs?.co_equal_strength_provisional_1x);
  const freshCombinedPrefs = mergeCombinedSchedulePrefs(
    backfilledPrimaryPrefs as Record<string, unknown>,
    newGoal.training_prefs as Record<string, unknown>,
  );
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
    bike_easy_day: freshCombinedPrefs.bike_easy_day,
    run_quality_day: freshCombinedPrefs.run_quality_day,
    run_easy_day: freshCombinedPrefs.run_easy_day,
    long_ride_day: freshCombinedPrefs.long_ride_day,
    long_run_day: freshCombinedPrefs.long_run_day,
    swim_easy_day: freshCombinedPrefs.swim_easy_day,
    swim_quality_day: freshCombinedPrefs.swim_quality_day,
    strength_preferred_days: freshCombinedPrefs.strength_preferred_days,
  }));

  // Anchor the combined plan to the current week's Monday so planWeek
  // calculations in generate-combined-plan are stable regardless of time-of-day.
  const combinedPlanStartDate = currentWeekMondayISO();

  // Call the combined plan engine
  const combined = await invokeFunction(functionsBaseUrl, serviceKey, 'generate-combined-plan', {
    user_id,
    goals: goalsForCombined,
    start_date: combinedPlanStartDate,
    athlete_state: {
      current_ctl: currentCTL,
      weekly_hours_available: weeklyHours,
      loading_pattern: loadingPattern,
      equipment_type: resolvedEquipmentType,
      tri_approach: triApproach,
      swim_volume_multiplier,
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
      ...(freshCombinedPrefs.run_quality_day !== undefined
        ? { run_quality_day: freshCombinedPrefs.run_quality_day }
        : {}),
      ...(freshCombinedPrefs.run_easy_day !== undefined
        ? { run_easy_day: freshCombinedPrefs.run_easy_day }
        : {}),
      ...(freshCombinedPrefs.bike_quality_day !== undefined
        ? { bike_quality_day: freshCombinedPrefs.bike_quality_day }
        : {}),
      ...(freshCombinedPrefs.bike_easy_day !== undefined
        ? { bike_easy_day: freshCombinedPrefs.bike_easy_day }
        : {}),
      ...(deriveBikeQualityLabel(allEventGoals)
        ? { bike_quality_label: deriveBikeQualityLabel(allEventGoals) as string }
        : {}),
      strength_protocol: resolvedCombinedStrengthProtocol,
      ...(freshCombinedPrefs.strength_intent
        ? { strength_intent: freshCombinedPrefs.strength_intent }
        : {}),
      ...(freshCombinedPrefs.strength_preferred_days?.length
        ? { strength_preferred_days: freshCombinedPrefs.strength_preferred_days }
        : {}),
      ...(coEqualProvisional1x ? { strength_sessions_cap: 1 } : {}),
      ...(combinedTransition?.transition_mode ? { transition_mode: combinedTransition.transition_mode } : {}),
      ...(combinedTransition?.structural_load_hint
        ? { structural_load_hint: combinedTransition.structural_load_hint }
        : {}),
    },
  });

  if (!combined?.plan_id) {
    console.error('[buildCombinedPlan] generate-combined-plan failed:', combined?.error);
    return null; // Fall through to individual plan generation
  }

  const combinedPlanId = combined.plan_id;

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
  return { plan_id: combinedPlanId };
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

  try {
    const raw = ((await req.json()) as CreateGoalRequest) || ({} as CreateGoalRequest);
    const user_id = requireUserIdFromRequest(req, raw.user_id);
    const mode = String(raw.mode ?? 'create').trim() as RequestMode;
    const action = raw.action;
    const existing_goal_id = trimId(raw.existing_goal_id);
    const replace_goal_id = trimId(raw.replace_goal_id);
    const replace_plan_id = trimId(raw.replace_plan_id);
    const plan_id = trimId(raw.plan_id);
    const goal = raw.goal;
    const plan_start_date = raw.plan_start_date;

    if (!user_id) throw new AppError('missing_user_id', 'user_id required');
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

    let resolvedGoal = goal || null;
    if (mode === 'build_existing') {
      const { data: existingGoal, error: existingGoalErr } = await supabase
        .from('goals')
        .select('*')
        .eq('id', existing_goal_id)
        .eq('user_id', user_id)
        .maybeSingle();
      if (existingGoalErr || !existingGoal) throw new AppError('goal_not_found', existingGoalErr?.message || 'Goal not found', 404);
      if (existingGoal.goal_type !== 'event') throw new AppError('invalid_goal_type', 'Only event goals can auto-build');
      if ((existingGoal.status || 'active') !== 'active') throw new AppError('goal_not_active', 'Goal must be active to build a plan');
      if (String(existingGoal.sport || '').toLowerCase() === 'run' && !existingGoal.distance) {
        throw new AppError('missing_distance', 'Set a race distance on this goal before building a plan.');
      }
      resolvedGoal = {
        name: existingGoal.name,
        target_date: existingGoal.target_date,
        sport: existingGoal.sport,
        distance: existingGoal.distance,
        training_prefs: existingGoal.training_prefs || {},
        notes: existingGoal.notes || null,
      };
    }

    const focusDateStr = new Date().toISOString().slice(0, 10);
    const arcForPlanning = await getArcContext(supabase, user_id, focusDateStr);

    if (resolvedGoal) {
      const mergedPrefs = mergeTrainingPrefsWithArcDefaults(
        resolvedGoal.training_prefs as Record<string, unknown>,
        resolvedGoal.sport,
        arcForPlanning,
      );
      const sportForBackfill = String(resolvedGoal.sport || '').toLowerCase();
      if (sportForBackfill === 'triathlon' || sportForBackfill === 'tri') {
        const backfillNotes = backfillTriTrainingPrefsDefenseInDepth(mergedPrefs, arcForPlanning);
        if (backfillNotes.length > 0) {
          console.log('[create-goal] training_prefs server backfill:', backfillNotes.join(', '));
        }
      }
      resolvedGoal = { ...resolvedGoal, training_prefs: mergedPrefs };
      if (sportForBackfill === 'triathlon' || sportForBackfill === 'tri') {
        console.log('[build] training_prefs after backfill:', mergedPrefs);
      }
      if (mode === 'build_existing' && existing_goal_id) {
        await supabase
          .from('goals')
          .update({ training_prefs: mergedPrefs, updated_at: new Date().toISOString() })
          .eq('id', existing_goal_id)
          .eq('user_id', user_id);
      }
    }

    const sport = String(resolvedGoal?.sport || '').toLowerCase();
    const isTri = sport === 'triathlon' || sport === 'tri';

    if (!['run', 'triathlon', 'tri'].includes(sport)) {
      throw new AppError('unsupported_sport', `Auto-build is not yet supported for "${sport}" goals. Supported: run, triathlon.`);
    }

    const fitness = String(resolvedGoal?.training_prefs?.fitness || 'intermediate').toLowerCase();
    const tPrefs = resolvedGoal?.training_prefs as { training_intent?: unknown; goal_type?: unknown } | undefined;
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
      const weeksOutTri   = weeksUntilRace(new Date(), new Date(String(resolvedGoal?.target_date || '') + 'T12:00:00'));
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
        createdGoalId = existing_goal_id || null;
      }

      // ── Combined plan routing ────────────────────────────────────────────
      // When the user explicitly chose "Build combined plan" (combine=true),
      // or when a second active event goal exists and action='keep', route
      // through generate-combined-plan for unified physiological optimization.
      console.log('[create-goal] postRaceRecovery:', JSON.stringify({
        apply: postRaceRecovery.apply,
        ...(postRaceRecovery.apply
          ? {
              event: (postRaceRecovery as { event: { name: string; days_ago: number } }).event?.name,
              days_ago: (postRaceRecovery as { event: { name: string; days_ago: number } }).event?.days_ago,
            }
          : {}),
      }));
      if (combine && createdGoalId) {
        const combinedResult = await buildCombinedPlan(
          supabase, functionsBaseUrl, serviceKey,
          user_id, createdGoalId, resolvedGoal!, fitness,
          postRaceRecovery.apply
            ? { transition_mode: 'recovery_rebuild', structural_load_hint: 'low' }
            : undefined,
        );
        if (combinedResult) {
          createdPlanId = combinedResult.plan_id;
          return new Response(
            JSON.stringify({ success: true, mode, goal_id: createdGoalId, plan_id: combinedResult.plan_id, sport: 'multi_sport', combined: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
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
        ...(plan_start_date ? { start_date: plan_start_date } : {}),
        // Days already covered by a concurrent run plan — tri generator defers to those sessions
        ...(existingRunDaySet.size > 0 ? { existing_run_days: [...existingRunDaySet] } : {}),
        ...(postRaceRecovery.apply ? { transition_mode: 'recovery_rebuild' as const } : {}),
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

      return new Response(
        JSON.stringify({ success: true, mode, goal_id: createdGoalId, plan_id: triPlanId, sport: 'triathlon', distance: triDistanceApi }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    // ── End triathlon path ────────────────────────────────────────────────

    const distanceApi = distanceToApiValue(resolvedGoal?.distance || null);
    if (!distanceApi) throw new AppError('missing_distance', 'Select a race distance to build a plan.');
    const floorWeeks = MIN_WEEKS[distanceApi]?.[fitness] ?? 4;
    const weeksOut = weeksUntilRace(new Date(), new Date(String(resolvedGoal?.target_date || '') + 'T12:00:00'));
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
    if (postRaceRecovery.apply) {
      trainingTransition = {
        mode: 'recovery_rebuild',
        reasoning: postRaceRecovery.reasoning,
        peak_long_run_miles: postRaceRecovery.recentLongRunMilesHint,
      };
      weeks_since_peak_long_run = 0;
      const hint = postRaceRecovery.recentLongRunMilesHint;
      recent_long_run_miles = recent_long_run_miles != null ? Math.max(recent_long_run_miles, hint) : hint;
      console.log(`[create-goal] post-race recovery from Arc: ${postRaceRecovery.event.name}, days_ago=${postRaceRecovery.event.days_ago}, longRunHint=${hint} mi`);
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
          spacingWeeks = Math.abs(weeksBetween(new Date(existingGoal.target_date), new Date(resolvedGoal.target_date)));
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
        postRaceRecovery.apply
          ? { transition_mode: 'recovery_rebuild', structural_load_hint: 'low' }
          : undefined,
      );
      if (combinedResult) {
        createdPlanId = combinedResult.plan_id;
        return new Response(
          JSON.stringify({ success: true, mode, goal_id: createdGoalId, plan_id: combinedResult.plan_id, sport: 'multi_sport', combined: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
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
      generateBody.structural_load_hint = 'low';
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
