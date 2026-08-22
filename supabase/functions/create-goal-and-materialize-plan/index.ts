import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
// D-326 layer 2 — the verdict supplier. Pure grouping + selection; the query in the strength branch
// is the only database part.
import {
  cyclesFromStoredPhases,
  groupSessionsByCycle,
  nextBlockTrainingMax,
  testWeeksFromStoredPhases,
  tmTestResultFor,
  verdictsForBlock,
} from '../shared/strength-system/loading/cycle-verdicts.ts';
import { workingNumberForCycles } from '../shared/strength-system/loading/wendler-531.ts';
import { invalidateUserTrainingCache } from '../_shared/invalidate-user-training-cache.ts';
import {
  getLatestAthleteMemory,
  resolveAdaptiveMarathonDecisionFromMemory,
  resolveMarathonMinWeeksFromMemory,
} from '../_shared/athlete-memory.ts';
import { getArcContext, type ArcContext } from '../_shared/arc-context.ts';
import { inferTrainingFitnessLevel, deriveSwimFitness } from '../_shared/infer-training-fitness.ts';
import {
  computeRunPlanningSignals,
  findPostRaceRecoveryContext,
  type PostRaceRecoveryResult,
  swimSecPer100YdFromArcSwimInputs,
  swimVolumeMultiplierFromArcWorkouts,
  planWeekContaining,
  type TrainingTransition,
} from '../_shared/planning-context.ts';
import { normalizeGoalDistanceKey, projectRaceSplits } from '../_shared/race-projections.ts';
import { LIFT_LABEL, liftsBelowEntryMinimum, missingBarbellLifts, readBarbellMaxes, STRENGTH_ENTRY_MIN_1RM_LB, type BarbellLift } from '../shared/strength-system/barbell-maxes.ts';
import { resolveCurrentRunEasyPace, resolveCurrentRunThresholdPace } from '../../../src/lib/resolve-current-run-pace.ts';
// ⛔ THE INTAKE'S OWN SEED TABLE, read here to tell an ANSWER from a PREFILL. See the precedence
// note on `current_weekly_miles` below. Same file the run generator's tables live in, so the two
// cannot drift; `create-goal-and-materialize-plan` must be redeployed when it changes.
import { TIER_SEEDS, type IntakeTier } from '../../../src/lib/run-volume-tables.ts';
import { buildSwimCutoffPressureV1, type SwimCutoffPressureV1 } from '../_shared/swim-cutoff-pressure.ts';
import { recomputeRaceProjectionsForUser } from '../_shared/recompute-goal-race-projections.ts';
import { normalizeTrainingIntent, trainingIntentToPrefsGoalType } from '../_shared/training-intent.ts';
/**
 * ⛔ ONE STATEMENT OF THE RIDE-COUNT RANGE (stage 4, 2026-08-21). The inline `>= 1 && <= 4` that
 * stood at the `gsRideDays` line below was the third of five copies of that rule; two of the five
 * were still capped at 3. See `_shared/athlete-weekly-intent.ts`.
 */
import { normalizeRideDays, normalizeRideHours } from '../_shared/athlete-weekly-intent.ts';
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
  hasAthletePinsFromPrefs,
  stripStaleQualityRunUnplacedFromScheduleSignals,
  type BackfillOptimizerSnapshot,
  type PlanOptimizerSnapshotInput,
  type ScheduleSignals,
} from '../_shared/plan-generation-trade-offs.ts';
import {
  readStrengthFrequencyForOptimizer,
  readSwimsPerWeekForOptimizer,
} from '../_shared/tri-optimizer-prefs.ts';
// D-214: non-race routing helpers (extracted + unit-tested; the wrapper itself can't run locally).
import { selectGoalsForCombined, isNonRaceGoalType, proxyDistanceForNonRaceGoal, sanitizePerDisciplinePosture, resolveNonRaceStrengthProtocol, resolveStrengthFocusMode, buildExistingGuardError, resolveMarathonFloorWeeks, marathonTimelineAdvisory, resolveRunDaysPerWeek } from './non-race-routing.ts';
import {
  deriveOptimalWeekWithCoEqualRecovery,
  normalizeDayName,
  validatePreferredDays,
  type AnchorWithIntensity,
  type DayName,
  type PreferredDaysOut,
  type WeekOptimizerInputs,
} from '../_shared/week-optimizer.ts';
// ⛔ The schedule-collision validators were DELETED 2026-07-27. Both gates below were behind
// `strict_schedule_prefs`, a request flag nothing has ever set — no client, no function, no script.
// So the validation never ran. See the deletion commit for the three sweeps.
import {
  hasCableMachine,
  hasGHD,
  resolveStrengthEquipmentTier3,
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
// ⛔ THE GENERATOR'S OWN DAY-COUNT VOCABULARY, not a copy of it. `days_per_week` is one of four
// legal strings per approach and `validateRequest` rejects anything else — a second list here is
// how this wrapper starts sending bands the engine 400s on (it sent two of them until 2026-08-06).
// Same cross-function import precedent as `effort-score` above and `adapt-plan:25`.
import { APPROACH_CONSTRAINTS } from '../generate-run-plan/types.ts';

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
    target_date: string | null;  // D-214: null for non-race goals (they anchor on target_weeks)
    sport: string;
    distance: string | null;
    training_prefs: Record<string, any>;
    notes?: string | null;
    /** D-214: ROW goal_type — 'event' | 'capacity' | 'maintenance'. NOT training_prefs.goal_type. */
    goal_type?: string;
    /** D-214: non-race plan length in weeks (the length source when goal_type is non-race). */
    target_weeks?: number | null;
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
  /**
   * ⛔ THROUGH THE RESOLVERS (2026-08-19, TRUTH-MAP §5) — with ONE tier deliberately refused.
   *
   * This read the learned columns raw at a medium/high bar, which is the resolvers' own tier 1 minus
   * the athlete's Q-174 choice and minus any pace they had TYPED. An athlete who said "use my number"
   * had it ignored while seeding the very table their plan is built from.
   *
   * ⛔ `effort_paces` IS REFUSED AS A SOURCE HERE, AND THAT IS THE WHOLE CARE OF THIS BLOCK. This
   * function WRITES `effort_paces`. The resolvers' wizard tier READS `effort_paces`. Accepting it
   * would seed the table from itself — last week's derived number laundered into this week's input,
   * with nothing new measured. So only a MEASURED or ASSERTED pace may seed: `learned`, `learned-low`,
   * `manual`, `manual-chosen`, and the easy-pace derivation (which rests on measured easy runs, not on
   * this table).
   */
  const SEEDABLE = new Set(['learned', 'learned-low', 'manual', 'manual-chosen', 'derived-from-easy']);
  const seedBaselines = {
    learned_fitness: baseline.learned_fitness,
    performance_numbers: baseline.performance_numbers,
  } as never;
  const rThr = resolveCurrentRunThresholdPace(seedBaselines);
  const rEasy = resolveCurrentRunEasyPace(seedBaselines);
  const hasLearnedTh = rThr.sec_per_mi != null && SEEDABLE.has(String(rThr.source));
  const hasLearnedEasy = rEasy.sec_per_mi != null && SEEDABLE.has(String(rEasy.source));
  // Kept in sec/KM shape so the arithmetic below is untouched — one conversion, at the boundary.
  const th = hasLearnedTh ? { value: rThr.sec_per_km as number } : null;
  const easy = hasLearnedEasy ? { value: (rEasy.sec_per_mi as number) / 1.609344 } : null;

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
/** The composer's four lifts, keyed the way `OneRepMaxes` is. Names must match the LOGGED row names. */
const STRENGTH_LIFT_NAMES = {
  bench: 'Bench Press',
  squat: 'Back Squat',
  deadlift: 'Deadlift',
  overheadPress: 'Overhead Press',
} as const;

function normalizeDateOnlyYmd(raw: unknown): string | null {
  const t = String(raw ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Monday of the server's *local calendar* week — use local getters, not toISOString() (UTC). */
/**
 * ⛔ SNAP ANY DATE TO THE MONDAY OF ITS WEEK. Added 2026-07-27, after a real plan came back starting
 * on a FRIDAY.
 *
 * The builder's field is labelled **"Start the week of"** and its helper says **"plans run Monday to
 * Sunday"** — but it is a free `<input type="date">`, and the server took whatever came through
 * verbatim. So a non-Monday pick produced a plan whose week 1 began mid-week and contained only the
 * days from that pick onward. `NonRaceBuilder.tsx:174` even says *"plans are Monday-based so this
 * snaps to that week server-side"* — the comment described a snap that did not exist.
 *
 * ⚠️ SNAPPING BACK, NOT FORWARD. "The week of Aug 28" is the week CONTAINING Aug 28, which starts
 * Monday Aug 24. Rounding forward would silently delay the block by up to six days, which is the
 * same silent-shift class the plan-start bug already is.
 */
function mondayOfWeekISO(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const day = dt.getUTCDay();                  // 0=Sun … 6=Sat
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dt.toISOString().slice(0, 10);
}

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
    const detail = coerceErrorDetailToString(payload, `${name} failed (${resp.status})`);
    // Issue 2: propagate an actionable downstream classification (e.g.
    // race_week_infeasible) instead of flattening every failure to a generic
    // 400/downstream_function_failed, and preserve the real downstream status so
    // the response body's http_status is truthful. The top-level catch still
    // emits HTTP 200 with this code/message (load-bearing client contract).
    const downstreamCode = (payload as { error_code?: unknown } | null)?.error_code;
    const code = typeof downstreamCode === 'string' && downstreamCode.trim()
      ? downstreamCode
      : 'downstream_function_failed';
    throw new AppError(code, detail, resp.status);
  }
  return payload;
}

/**
 * Coerce a downstream `payload.error` / `payload.message` to a string. AppError's `super(message)`
 * stringifies via `String(value)`, which produces `"[object Object]"` when a downstream returns
 * a structured error (e.g. `{ error: { message: ..., code: ... } }`). Walking known shapes here
 * keeps the wizard-facing error readable instead of leaking the bracket-object literal.
 */
function coerceErrorDetailToString(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) {
    return typeof payload === 'string' && payload.trim() ? payload : fallback;
  }
  const p = payload as Record<string, unknown>;
  const errField = p.error;
  if (typeof errField === 'string' && errField.trim()) return errField;
  if (errField && typeof errField === 'object') {
    const nested = (errField as Record<string, unknown>).message ?? (errField as Record<string, unknown>).error;
    if (typeof nested === 'string' && nested.trim()) return nested;
    try { return JSON.stringify(errField); } catch { /* fall through */ }
  }
  if (typeof p.message === 'string' && (p.message as string).trim()) return p.message as string;
  return fallback;
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

/**
 * D-033 / Phase 1 (2026-05-22) — build the `RunObservedFitness` slice for the
 * Arc channel. Reads the last 4 athlete_snapshot rows (newest first) and emits
 * the curated shape consumed by `generate-combined-plan` → `resolveRunEasyPace`.
 *
 * - Returns `null` if fewer than 3 weekly samples have `run_easy_pace_at_hr` set
 *   (the reconciler's minimum-data gate; spec §4.2 confidence gating).
 * - Weekly arrays are ordered newest → oldest, length up to 4.
 * - `efficiency_index`: not stored on `athlete_snapshot` today; reserved as null
 *   for future compute-snapshot extension. The reconciler does not depend on it.
 * - `longest_run_minutes`: max of `run_long_run_duration` across window (minutes).
 * - `interval_adherence_pct`: median of non-null values across window (percent).
 *
 * Failure-tolerant: any DB error or unexpected shape returns `null`. Caller
 * propagates `null` into `arc.run_observed_fitness`; the reconciler short-
 * circuits to baseline. Plan generation never blocks on this telemetry.
 */
async function buildRunObservedFitness(
  supabase: ReturnType<typeof createClient>,
  user_id: string,
): Promise<{
  median_easy_pace_sec_per_km: number | null;
  weekly_easy_paces_sec_per_km: (number | null)[];
  weekly_acwr: (number | null)[];
  window_weeks: 4;
  efficiency_index: number | null;
  interval_adherence_pct: number | null;
  longest_run_minutes: number | null;
} | null> {
  try {
    const { data, error } = await supabase
      .from('athlete_snapshot')
      .select('week_start, run_easy_pace_at_hr, run_long_run_duration, run_interval_adherence, acwr')
      .eq('user_id', user_id)
      .order('week_start', { ascending: false })
      .limit(4);
    if (error) {
      console.warn('[create-goal] buildRunObservedFitness DB read failed:', error.message);
      return null;
    }
    if (!Array.isArray(data) || data.length === 0) return null;

    const rows = data.slice(0, 4) as Array<{
      week_start: string;
      run_easy_pace_at_hr: number | null;
      run_long_run_duration: number | null;
      run_interval_adherence: number | null;
      acwr: number | null;
    }>;

    const weeklyEasy: (number | null)[] = rows.map((r) => {
      const v = r.run_easy_pace_at_hr;
      return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
    });
    const weeklyAcwr: (number | null)[] = rows.map((r) => {
      const v = r.acwr;
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    });

    const nonNullEasy = weeklyEasy.filter((v): v is number => v != null);
    if (nonNullEasy.length < 3) return null; // confidence gate; reconciler also enforces

    const sortedEasy = [...nonNullEasy].sort((a, b) => a - b);
    const mid = Math.floor(sortedEasy.length / 2);
    const medianEasy =
      sortedEasy.length % 2 === 0
        ? (sortedEasy[mid - 1]! + sortedEasy[mid]!) / 2
        : sortedEasy[mid]!;

    const adherenceVals = rows
      .map((r) => r.run_interval_adherence)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    let medianAdherence: number | null = null;
    if (adherenceVals.length) {
      const s = [...adherenceVals].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      medianAdherence = s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
    }

    const longestRunMinutes = rows.reduce<number | null>((acc, r) => {
      const v = r.run_long_run_duration;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        return acc == null || v > acc ? v : acc;
      }
      return acc;
    }, null);

    return {
      median_easy_pace_sec_per_km: medianEasy,
      weekly_easy_paces_sec_per_km: weeklyEasy,
      weekly_acwr: weeklyAcwr,
      window_weeks: 4,
      efficiency_index: null,
      interval_adherence_pct: medianAdherence,
      longest_run_minutes: longestRunMinutes,
    };
  } catch (e) {
    console.warn('[create-goal] buildRunObservedFitness exception:', e);
    return null;
  }
}

function inferLimiterSportFromArc(arc: ArcContext): 'swim' | 'bike' | 'run' {
  const swim = arc.swim_training_from_workouts;
  if (swim && swim.completed_swim_sessions_last_90_days === 0) return 'swim';
  /**
   * ⛔ THROUGH THE FTP RESOLVER (2026-08-19, TRUTH-MAP §5). This read the learned estimate's
   * `confidence` raw and called the bike the limiter whenever it was `low` — including for an athlete
   * who had TYPED an FTP. A number the athlete asserted is not a data gap, so the bike was being named
   * as the weak discipline on the strength of an estimate the app was not even using.
   *
   * The resolver reports `low` only when a low-confidence learned value is genuinely what it landed on
   * (its `learned-low` tier) — i.e. exactly when there is nothing better.
   */
  const resolvedFtp = resolveCurrentFtp({
    learned_fitness: arc.learned_fitness, performance_numbers: arc.performance_numbers,
  } as never);
  if (resolvedFtp.source === 'learned-low' || (resolvedFtp.value == null && arc.learned_fitness)) {
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
    // Preserve the athlete's literal location choice on `equipment_location`. Capability lives
    // separately on `equipment_tier` (3-tier per spec §8). The legacy `equipment_type` overwrite
    // (which conflated location with capability and silently flipped home_gym → commercial_gym)
    // is gone — `equipment_type` now mirrors `equipment_location` for backward compat with
    // downstream consumers that haven't been updated yet.
    {
      const literal = String(tp.equipment_type ?? (tp as { equipment_location?: unknown }).equipment_location ?? '').trim().toLowerCase();
      const resolvedLocation: 'home_gym' | 'commercial_gym' =
        literal === 'commercial_gym' ? 'commercial_gym' : 'home_gym';
      (tp as { equipment_location?: string }).equipment_location = resolvedLocation;
      tp.equipment_type = resolvedLocation;
    }
    // Three-tier capability classification per docs/STRENGTH-PROTOCOL.md §8. Drives the
    // performance-without-loadable-resistance gate — bodyweight_bands tier downgrades
    // performance intent to durability with a trade-off (§2). Independent of location.
    {
      const raw = arc.equipment as { strength?: string[] } | null | undefined;
      const arr = Array.isArray(raw?.strength) ? raw.strength : [];
      tp.equipment_tier = resolveStrengthEquipmentTier3(
        tp.equipment_type,
        arr,
        arc.performance_numbers,
      );
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

  // #131 / Bugs 1&2: `optimal.preferred_days.strength` is ALWAYS engine-chosen
  // placement (the wizard pin enters the optimizer as an INPUT preference, not
  // as this output key; pinRestore above never touches strength). Persisting it
  // in `preferred_days` made engine defaults surface as "Athlete preference".
  // Engine strength now travels only via `strength_optimizer_slots` (labeled
  // "scheduled by app" in the export). A genuine wizard pin lives separately in
  // `trainingPrefs.strength_preferred_days` and is unaffected.
  const engineStrengthSlots = (merged as Record<string, unknown>).strength;
  delete (merged as Record<string, unknown>).strength;
  trainingPrefs.preferred_days = merged;
  if (Array.isArray(engineStrengthSlots) && engineStrengthSlots.length > 0) {
    trainingPrefs.strength_optimizer_slots = engineStrengthSlots;
  } else {
    delete (trainingPrefs as Record<string, unknown>).strength_optimizer_slots;
  }
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
  newGoal: { name: string; target_date: string | null; sport: string; distance: string | null; training_prefs: Record<string, any>; goal_type?: string; target_weeks?: number | null }, // D-214: goal_type is the ROW column
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

  // D-214: the non-race predicate — computed ONCE from the ROW goal_type passed in (newGoal.goal_type),
  // NEVER from training_prefs.goal_type. This single value is the only thing that gates E1/E2 below.
  const newGoalIsNonRace = isNonRaceGoalType(newGoal.goal_type);

  // E1 (D-214): the events query above is UNCHANGED (still .eq('goal_type','event')). A non-race new
  // goal is therefore NOT in rawEventGoals, so fetch its ROW separately (selecting the ROW goal_type +
  // target_weeks). Events: newGoalRow comes straight from rawEventGoals → no extra read, no change.
  let newGoalRow = rawEventGoals?.find(g => g.id === newGoalId) ?? null;
  if (newGoalIsNonRace && !newGoalRow) {
    const { data: nrRow } = await supabase
      .from('goals')
      .select('id, name, sport, distance, target_date, priority, training_prefs, status, projection, created_at, goal_type, target_weeks')
      .eq('id', newGoalId)
      .eq('user_id', user_id)
      .maybeSingle();
    // Fallback (e.g. preview before the row is persisted): synthesize from the newGoal param.
    newGoalRow = (nrRow ?? {
      id: newGoalId, name: newGoal.name, sport: newGoal.sport, distance: newGoal.distance,
      target_date: newGoal.target_date, priority: 'A', training_prefs: newGoal.training_prefs,
      status: 'active', projection: null, created_at: null,
      goal_type: newGoal.goal_type, target_weeks: newGoal.target_weeks,
    }) as any;
  }

  // E2 (D-214): the <2-goal gate is relaxed EXCLUSIVELY for the non-race new goal, inside the extracted
  // + unit-tested helper (non-race-routing.test.ts proves the EVENT path is byte-identical). Event
  // inputs return the identical goal set + identical null-at-<2 decision as today.
  const allEventGoals = selectGoalsForCombined(rawEventGoals as any[], newGoalRow as any, newGoalIsNonRace);
  if (!allEventGoals) return null; // events: <2 → null (unchanged); non-race: only if no row at all

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
    const isNonRaceNew = isNew && newGoalIsNonRace; // D-214: ROW goal_type, via the single predicate
    const rawPriority = String((isNew ? (newGoal.training_prefs as any)?.priority : g.priority) || g.priority || 'A');
    return {
      id: g.id,
      event_name: g.name,
      // E3 (D-214) + Cut 5 (A): non-race has no event_date and no race distance. Keep event_date null
      // (the generator's Cut 3 branch reads target_weeks), and derive a PROXY distance from the goal's
      // shape (sport + target_weeks + fitness tier). The proxy only sets the tri long-session ceiling —
      // the real, fitness-appropriate volume is CTL/hours via scaledWeeklyTSS (NOT a capacity target;
      // none is collected today — Q-082). 12wk cases resolve to the Cut 4 values, so the timeline is unchanged.
      event_date: g.target_date ?? null,
      distance: isNonRaceNew
        ? proxyDistanceForNonRaceGoal(g.sport, (g as any).target_weeks, fitness)
        : normalizeDistance(g.sport || '', isNew ? newGoal.distance : g.distance),
      sport: (g.sport || 'run').toLowerCase(),
      priority: (['A', 'B', 'C'].includes(rawPriority) ? rawPriority : 'A') as 'A' | 'B' | 'C',
      // E7 (D-214): carry the ROW goal_type + target_weeks onto the engine payload. Undefined for event
      // goals (rawEventGoals never selects them; generator treats undefined goal_type as 'event'); set
      // for the non-race new goal (its row was fetched with both columns).
      goal_type: (g as any).goal_type,
      target_weeks: (g as any).target_weeks,
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
  // Athlete's literal location choice — preserved exactly as the wizard saved it. Never
  // overwritten by capability inference (which lives on equipment_tier).
  const explicitEquipmentType =
    (newGoal.training_prefs as Record<string, unknown>)?.equipment_type
    ?? (newGoal.training_prefs as Record<string, unknown>)?.equipment_location
    ?? (primaryGoalPrefs as Record<string, unknown>)?.equipment_type
    ?? (primaryGoalPrefs as Record<string, unknown>)?.equipment_location;
  const literalLocation = String(explicitEquipmentType ?? '').trim().toLowerCase();
  const resolvedEquipmentType: 'home_gym' | 'commercial_gym' =
    literalLocation === 'commercial_gym' ? 'commercial_gym' : 'home_gym';
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

  // Anchor-referring trade-off messages ("adjust pinned long or group-ride days first") are
  // false noise when the athlete pinned no anchors. Derive the signal from combinedSchedulePrefs
  // and pass it to the boundary aggregator — see `_shared/plan-generation-trade-offs.ts`.
  const athleteHasPins = hasAthletePinsFromPrefs(combinedSchedulePrefs as Record<string, unknown>);
  const schedule_signals = aggregateOptimizerScheduleSignals(
    optimizerSnapshotsForTradeOffs,
    { hasAthletePins: athleteHasPins },
  );

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

  // Cut A (A2): non-race strength is sport-context-aware (§13.1) — honor the builder's explicit protocol
  // (validated, default durability) instead of the tri-coercing resolver, which would turn a runner's
  // five_by_five into triathlon. EVENTS keep resolveCombinedTriStrengthProtocol → byte-identical.
  const rawCombinedStrengthProtocol =
    combinedSchedulePrefs.strength_protocol != null
      ? String(combinedSchedulePrefs.strength_protocol)
      : undefined;
  const resolvedCombinedStrengthProtocol = isNonRaceGoalType(newGoal.goal_type)
    ? resolveNonRaceStrengthProtocol(rawCombinedStrengthProtocol)
    : resolveCombinedTriStrengthProtocol(
        rawCombinedStrengthProtocol,
        combinedSchedulePrefs.strength_intent != null
          ? String(combinedSchedulePrefs.strength_intent)
          : undefined,
      );

  // Cut A (A1): per_discipline_posture (D-210 consumer) — read DIRECTLY from the goal's training_prefs
  // (mergeCombinedSchedulePrefs filters to known schedule keys), sanitize, thread into athlete_state
  // below via a conditional spread (absent → omitted → byte-identical for events).
  const perDisciplinePosture = sanitizePerDisciplinePosture(
    (newGoal.training_prefs as Record<string, unknown> | undefined)?.per_discipline_posture,
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

  const explicitMonday = normalizeDateOnlyYmd(explicit_plan_start_date);
  const combinedPlanStartDate = explicitMonday
    ? mondayOfWeekISO(explicitMonday)   // the week CONTAINING the pick — see mondayOfWeekISO
    : currentWeekMondayISO();

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
  // SWIM-PROTOCOL §7.5 — flag tri athletes with no usable swim threshold pace
  // so the build emits the calibration trade-off + the per-session RPE fallback
  // cue. `swimSecPer100Yd` was already computed at line ~1249 from arc inputs.
  const noSwimThresholdPace =
    triPrimaryWithSwimLeg &&
    (swimSecPer100Yd == null || !Number.isFinite(swimSecPer100Yd) || swimSecPer100Yd <= 0);
  const generation_trade_offs = buildCombinedPlanGenerationTradeOffs({
    postRace: postRaceForTradeOffs,
    optimizerSnapshots: optimizerSnapshotsForTradeOffs,
    noSwimThresholdPace,
  });
  console.log('[buildCombinedPlan] generation_trade_offs:', JSON.stringify(generation_trade_offs));

  const trainingFitnessResolution = inferTrainingFitnessLevel({
    wizardFitnessRaw: fitness,
    currentCtl: currentCTL,
    arc: arcForCombined,
    structuralLoadHint: combinedTransition?.structural_load_hint,
    trainingIntent:
      freshCombinedPrefs.training_intent != null ? String(freshCombinedPrefs.training_intent) : undefined,
    wizardSwimExperienceTier:
      freshCombinedPrefs.swim_experience != null ? String(freshCombinedPrefs.swim_experience) : undefined,
  });

  if (recentLoads.length === 0) {
    currentCTL =
      { beginner: 20, intermediate: 40, advanced: 65 }[trainingFitnessResolution.level] ?? currentCTL;
  }

  // §SESSION-FREQUENCY-DEFAULTS Phase B: athlete-supplied weekly_hours_available from the
  // Arc wizard wins over the legacy fitness-bucket mapping. The wizard captures hours via the
  // 5-tier picker (5-7 / 8-10 / 10-12 / 12-14 / 14+) and persists tier midpoints (6/9/11/13/15)
  // to training_prefs.weekly_hours_available. Legacy mapping is the fallback for goals that
  // pre-date the wizard step or were created via Arc chat without an explicit hours answer.
  const wizardSuppliedHours = (() => {
    const raw =
      (newGoal.training_prefs as Record<string, unknown> | undefined)?.weekly_hours_available ??
      (primaryGoalPrefs as Record<string, unknown>)?.weekly_hours_available;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const weeklyHours =
    wizardSuppliedHours
      ?? ({ beginner: 6, intermediate: 10, advanced: 14 }[trainingFitnessResolution.level] ?? 10);

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
  // D-033 / Phase 1 (2026-05-22) — run-pace feedback loop input. Built from
  // last-4 athlete_snapshot rows; `null` when <3 weeks of `run_easy_pace_at_hr`
  // data are available. Reconciler short-circuits to baseline when null.
  const runObservedFitness = await buildRunObservedFitness(supabase, user_id);

  // Call the combined plan engine
  const combined = await invokeFunction(functionsBaseUrl, serviceKey, 'generate-combined-plan', {
    user_id,
    goals: goalsForCombined,
    start_date: combinedPlanStartDate,
    generation_trade_offs,
    // D-032 / Phase 0 (2026-05-22) — Arc channel. The wrapper already fetched
    // `arcForCombined` at line 1201; here we channel the curated 4-field dynamic
    // subset into the engine for Phase 1-4 consumers. Phase 0 is behavior-neutral;
    // no engine code path reads these fields today. See
    // `docs/PHASE-0-ARC-CHANNEL-SPEC.md`.
    // D-033 / Phase 1 (2026-05-22) — `run_observed_fitness` added; the engine
    // calls `resolveRunEasyPace(state.learned_fitness, arc.run_observed_fitness)`
    // and overrides `learned_fitness.run_easy_pace_sec_per_km` in-memory when
    // the reconciler displaces baseline. See `docs/PHASE-1-RUN-PACE-SPEC.md`.
    arc: {
      latest_snapshot: arcForCombined.latest_snapshot,
      cycling_fitness: arcForCombined.cycling_fitness,
      swim_training_from_workouts: arcForCombined.swim_training_from_workouts,
      longitudinal_signals: arcForCombined.longitudinal_signals,
      run_observed_fitness: runObservedFitness,
    },
    athlete_state: {
      current_ctl: currentCTL,
      weekly_hours_available: weeklyHours,
      loading_pattern: loadingPattern,
      plan_units: planUnitsForCombined,
      // Literal location (athlete's home_gym | commercial_gym choice — never overwritten by
      // capability inference). Mirror onto legacy `equipment_type` for backward compat.
      equipment_location: resolvedEquipmentType,
      equipment_type: resolvedEquipmentType,
      // Capability tier — separate concern, derived from chips + 1RM signals.
      equipment_tier: resolveStrengthEquipmentTier3(
        resolvedEquipmentType,
        Array.isArray(arcForCombined.equipment?.strength) ? arcForCombined.equipment.strength : [],
        arcForCombined.performance_numbers,
      ),
      // 1RMs + bodyweight feed the spec §5 missing-data trade-off and the materializer's
      // BW-fallback weight resolution.
      ...(arcForCombined.performance_numbers
        ? { performance_numbers: arcForCombined.performance_numbers }
        : {}),
      // Learned fitness signals (FTP estimate + run threshold/easy paces) — passed through
      // so `buildAthleteSnapshot` can pin bike.ftp_w + run paces at plan-creation time
      // (Tier 1 item 2 of the running→cycling delta map). Without this, the snapshot's
      // bike/run fields stay null and downstream materialization re-reads live baselines
      // (drift risk if athlete's learned values shift mid-plan).
      ...(arcForCombined.learned_fitness
        ? { learned_fitness: arcForCombined.learned_fitness }
        : {}),
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
      ...((): { strength_equipment?: string[] } => {
        const st = arcForCombined.equipment?.strength;
        if (!Array.isArray(st) || !st.length) return {};
        const labels = st.map((x) => String(x).trim()).filter(Boolean);
        return labels.length ? { strength_equipment: labels } : {};
      })(),
      // Spec §8.2 DB max — wizard sets training_prefs.db_max_lb when athlete has DBs but no
      // barbell. Default 50 if dumbbell_based tier and field unset.
      ...((): { db_max_lb?: number } => {
        const explicit = Number(
          (freshCombinedPrefs as { db_max_lb?: unknown }).db_max_lb ??
          (backfilledPrimaryPrefs as { db_max_lb?: unknown }).db_max_lb,
        );
        if (Number.isFinite(explicit) && explicit > 0) return { db_max_lb: explicit };
        const rawChips = arcForCombined.equipment?.strength;
        const arr = Array.isArray(rawChips)
          ? (rawChips as unknown[]).map((x) => String(x).trim()).filter(Boolean)
          : [];
        const tier = resolveStrengthEquipmentTier3(
          resolvedEquipmentType,
          arr,
          arcForCombined.performance_numbers,
        );
        if (tier === 'dumbbell_based') return { db_max_lb: 50 };
        return {};
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
      // Q-006: swim-only fitness override (hard clamp on swim_experience).
      // Learning → beginner, strong → advanced, steady/unset → inherit.
      swim_fitness: deriveSwimFitness(
        trainingFitnessResolution.level,
        freshCombinedPrefs.swim_experience as string | null | undefined,
      ),
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
      // Cut A (A1): per-discipline posture (D-210) — conditional spread, absent → byte-identical.
      ...(perDisciplinePosture ? { per_discipline_posture: perDisciplinePosture } : {}),
      ...(freshCombinedPrefs.strength_intent
        ? { strength_intent: freshCombinedPrefs.strength_intent }
        : {}),
      // §6.5 ordering preference (STRENGTH-PROTOCOL.md). Hybrid athletes pick;
      // durability/none auto-default `endurance_first` at wizard save time.
      strength_ordering_preference:
        (freshCombinedPrefs as Record<string, unknown>).strength_ordering_preference === 'strength_first'
          ? 'strength_first' as const
          : 'endurance_first' as const,
      // Theme B (CONSOLIDATED-MODE §9): unconditional default 'separated' —
      // legacy / non-asking goals thread inert until the wizard step (Slice 4);
      // no engine reads it until Slice 2. Mirrors the SOP resolution above.
      integration_mode:
        (freshCombinedPrefs as Record<string, unknown>).integration_mode === 'consolidated'
          ? 'consolidated' as const
          : 'separated' as const,
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
      // §SESSION-FREQUENCY-DEFAULTS §4 / sport-distribution shift in phase-structure.ts:
      // limiter_sport lives on goal.training_prefs (set via Arc chat or inferLimiterSportFromArc
      // enrichment at line 567-568). Promote it onto AthleteState so the reconciler's §4 limiter
      // logic and getBaseDistribution()'s +0.07 share shift can actually fire — both were
      // dead code prior to this promotion.
      ...((): { limiter_sport?: 'swim' | 'bike' | 'run' } => {
        const raw =
          (newGoal.training_prefs as Record<string, unknown> | undefined)?.limiter_sport ??
          (primaryGoalPrefs as Record<string, unknown>)?.limiter_sport;
        const v = String(raw ?? '').trim().toLowerCase();
        return v === 'swim' || v === 'bike' || v === 'run' ? { limiter_sport: v } : {};
      })(),
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
      hasAthletePins: athleteHasPins,
      strengthOrderingPreference:
        (freshCombinedPrefs as Record<string, unknown>).strength_ordering_preference === 'strength_first'
          ? 'strength_first'
          : 'endurance_first',
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
    hasAthletePins: athleteHasPins,
    strengthOrderingPreference:
      (freshCombinedPrefs as Record<string, unknown>).strength_ordering_preference === 'strength_first'
        ? 'strength_first'
        : 'endurance_first',
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
    // ⛔ SNAPPED ONCE, HERE, so every downstream path gets a Monday — the strength plan, the goal
    // row, and the combined builder alike. Previously each read `raw.plan_start_date` directly and
    // none of them snapped.
    const rawStart = normalizeDateOnlyYmd(raw.plan_start_date);
    const plan_start_date = rawStart ? mondayOfWeekISO(rawStart) : raw.plan_start_date;
    const bodyPreview = raw.preview === true;
    const ephemeralConflictPrefs =
      raw.ephemeral_conflict_preferences &&
      typeof raw.ephemeral_conflict_preferences === 'object' &&
      !Array.isArray(raw.ephemeral_conflict_preferences)
        ? (raw.ephemeral_conflict_preferences as Record<string, string>)
        : null;

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
    // D-214: non-race goals MUST route through the combined engine (D-213 #1) — force combine so a
    // non-race goal never falls to the legacy generators. ROW goal_type only (raw.goal.goal_type).
    const combine = !!(raw as CreateGoalRequest & { combine?: boolean }).combine || isNonRaceGoalType((raw.goal as any)?.goal_type);

    if (mode === 'create') {
      // D-214: non-race goals (ROW goal_type capacity/maintenance) anchor on target_weeks, not a date —
      // require target_weeks (4–52) instead of target_date, and skip the run race-distance gate.
      const createIsNonRace = isNonRaceGoalType(goal?.goal_type);
      if (!goal?.name || !goal?.sport || (!goal?.target_date && !createIsNonRace)) throw new AppError('missing_goal_fields', 'goal name, target_date, and sport are required');
      if (createIsNonRace && !(Number((goal as any)?.target_weeks) >= 4 && Number((goal as any)?.target_weeks) <= 52)) throw new AppError('missing_target_weeks', 'A non-race goal needs target_weeks (4–52).');
      // ⛔ THE ACTION GATE IS A WRITE GATE, AND A PREVIEW IS A READ (§4.1a).
      //
      // `action` answers exactly one question — what happens to the athlete's EXISTING goal when
      // this one is persisted. Every consumer is a write decision: the new goal's priority
      // (:2379, :2813, :3281) and the keep/replace of the prior goal (:3062, :3172, :3477).
      //
      // A preview persists NOTHING — no goal row (its `goal_id` is a synthetic marker, see :2375),
      // no plan row, no activate. So requiring an answer here demanded a decision with no
      // consequence, and refused the whole request when the client did not supply one. That is
      // strictness applied where its reason does not hold, which is §4.1a's test.
      //
      // ⚠️ THIS IS THE PREVIEW FAILURE THAT SURVIVED A WHOLE SESSION UNDIAGNOSED. It only became
      // findable once the client stopped swallowing the reason — the response said
      // `action must be keep or replace` all along and nothing ever read it. The fix belongs
      // HERE rather than in the client: teaching the caller to send `action: 'keep'` on a preview
      // would be answering a meaningless question to satisfy a gate that should not be asking.
      if (!bodyPreview && (!action || !['keep', 'replace'].includes(action))) {
        throw new AppError('invalid_action', 'action must be keep or replace');
      }
      if (String(goal.sport || '').toLowerCase() === 'run' && !goal.distance && !createIsNonRace) {
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
        // Build-eligibility guard — shared with the DB-lookup branch so the non-race exemption can't
        // drift between the two doors (F-1). Forwarded goals are freshly inserted (active) → no status check.
        const fwdGuardErr = buildExistingGuardError(resolvedGoal as any);
        if (fwdGuardErr) throw new AppError(fwdGuardErr.code, fwdGuardErr.message);
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
        // Build-eligibility guard — same predicate as the forwarded branch; status checked here since
        // a DB-looked-up goal may be inactive (the forwarded path's goal was just inserted). (F-1)
        const dbGuardErr = buildExistingGuardError(existingGoal, { checkStatus: true });
        if (dbGuardErr) throw new AppError(dbGuardErr.code, dbGuardErr.message);
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
    // D-214: non-race goals (ROW goal_type capacity/maintenance) have no race date — skip BOTH the
    // missing-date gate AND the date normalization. The generator's Cut 3 branch reads target_weeks.
    const resolvedIsNonRace = isNonRaceGoalType((resolvedGoal as any).goal_type);
    if (!resolvedIsNonRace) {
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
    }

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

    // ── Non-race short-circuit (D-213 guard-rail #1 — Cut 3b amendment) ────
    // Non-race goals (ROW goal_type capacity/maintenance) route through the ONE engine and must NEVER
    // reach the legacy per-sport build paths below: their distance/date gates (:tri / :run) assume a
    // race and threw on a non-race goal (the deploy-gated end-to-end caught this). Branch here, before
    // the tri/run split, so a non-race goal skips every legacy-path gate by construction. The
    // buildCombinedPlan call is identical to the per-sport ones — they pass no per-sport setup, only
    // what is already in scope here — so nothing the combine path needs is skipped. Covers create +
    // build_existing. Events (resolvedIsNonRace=false) are unaffected → byte-identical.
    if (resolvedIsNonRace) {
      // ⛔ A PREVIEW MUST NOT WRITE. This `mode === 'create'` branch inserted a real
      // `status: 'active'` goal row unconditionally — `bodyPreview` was only consulted 150 lines
      // later, where it skips linking and activation and returns the built plan.
      //
      // So "show me the week before I commit" created the goal, showed the week, and left the row
      // behind when the athlete backed out. Four looks at four start dates is four active goals, and
      // every one of them looks exactly like a real commitment to anything reading the table.
      //
      // ⚠️ The plan side was already correct — that is what makes this easy to miss: the preview
      // return genuinely does not persist a plan. Only the goal leaked.
      // The preview still gets a `goal_id` in its response; it is now a synthetic marker, not a row.
      if (mode === 'create' && !bodyPreview) {
        const newGoalPriority = action === 'keep' && existing_goal_id ? 'B' : 'A';
        const { data: createdGoal, error: goalInsertErr } = await supabase
          .from('goals')
          .insert({
            user_id,
            name: String(resolvedGoal?.name || '').trim(),
            goal_type: String((resolvedGoal as any)?.goal_type || 'capacity'), // ROW goal_type (capacity/maintenance)
            target_date: null,                                                  // non-race: no race date
            target_weeks: (resolvedGoal as any)?.target_weeks ?? null,
            sport,                                                              // resolvedGoal's sport (run/tri) — NOT hardcoded
            distance: resolvedGoal?.distance || null,
            course_profile: {}, target_metric: null, target_value: null, current_value: null,
            priority: newGoalPriority, status: 'active',
            training_prefs: resolvedGoal?.training_prefs || {}, notes: resolvedGoal?.notes || null,
          })
          .select('*').single();
        if (goalInsertErr || !createdGoal) throw new AppError('goal_create_failed', goalInsertErr?.message || 'Failed to create goal');
        createdGoalId = createdGoal.id;
      } else {
        createdGoalId = resolvedBuildId || existing_goal_id || null;
      }

      // ── GET STRONG (strength-primary) — SPEC-product-shape Program 1 ───────────────
      // Strength develops while endurance is HELD → strength is the SPINE, not an overlay. Route to the
      // sport-agnostic strength-primary engine (the conductor's arc + maintenance endurance) instead of
      // the (b)-run marathon stopgap. Serves runners AND cyclists. Barbell-only for now (the arc is the
      // 5×5/neural lanes); bodyweight Get Strong falls through to (b)-run durability until a bodyweight
      // strength-primary lane exists.
      {
        // BUG FIX (Q-096): `tp` is NOT in scope here (it's a local in mergeTrainingPrefsWithArcDefaults) —
        // the resolved goal's prefs in this scope are `resolvedGoal.training_prefs`. The prior `tp.*` refs
        // threw a ReferenceError the instant this block ran, before any gate → every non-race build rolled
        // back. Read the correct source.
        const gsTp = (resolvedGoal?.training_prefs ?? {}) as Record<string, any>;
        const gsPosture = sanitizePerDisciplinePosture(gsTp.per_discipline_posture as Record<string, unknown> | undefined);
        const gsEnduranceDevelops = ['run', 'bike', 'swim'].some((d) => gsPosture?.[d] === 'develop');
        if (gsPosture?.strength === 'develop' && !gsEnduranceDevelops) {
          const { data: gsBaseline } = await supabase
            .from('user_baselines').select('equipment, performance_numbers, learned_fitness').eq('user_id', user_id).maybeSingle();
          // ── D-323 / SPEC-get-stronger §0 — THE ENTRY GATE ────────────────────────────────────
          // ⛔ THERE IS NO EQUIPMENT GATE, DELIBERATELY. Michael, 2026-07-25: all cards are
          // pickable, the CARD states what it needs ("barbell, rack, bench"), and the athlete
          // decides. Equipment data goes stale and someone may want a plan their stored kit does
          // not match. Choosing a plan is stating your situation, not composing the programme.
          //
          // A `barbell_required` refusal was written here and REMOVED the same day, for two reasons:
          //   1. It contradicted the decision above.
          //   2. It did not even work. `resolveStrengthEquipmentTypeForPlan` treats **two or more
          //      compound 1RM fields** as barbell-capable (a deliberate fallback for a stale
          //      equipment list), so a dumbbell-only athlete carrying old gym numbers resolves to
          //      `commercial_gym` and passes — the exact case the refusal was written to catch. The
          //      only athlete it could stop had <2 numbers, and the baseline gate below catches them
          //      with a more useful message.
          // The `resolveStrengthEquipmentTypeForPlan` call that gated this branch is gone with it.
          // Do not reinstate an equipment gate.
          {
            // ⛔ NO 1RM, NO ENTRY — and ALL FOUR lifts, not two.
            // The old check tested bench + squat only, then set `needs_baseline` so week 1 became an
            // in-plan test. Both are wrong under the new spec:
            //   • FOUR lifts. Squat, bench, deadlift and overhead press are one main lift per day.
            //     Missing deadlift or press leaves TWO of four lifting days with no weight on them —
            //     and the old check passed that athlete straight through.
            //   • No in-plan baseline test. Entry is gated; the tests live in the Baselines screen
            //     (Lower = squat + deadlift, Upper = bench + press, Full Body = all four), which ramps
            //     from the empty bar to a 3–6 rep set rather than a max attempt.
            // Refuse and NAME the missing lift so the client can send them to the right test.
            // ONE reader for the four maxes (`shared/strength-system/barbell-maxes.ts`) — the same one
            // `generate-strength-plan` uses to build the working numbers. The key aliases used to be
            // written out here inline, which meant this gate and the composer each carried their own
            // list: a key one accepted and the other didn't would let an athlete past the gate into a
            // plan with no weight on a lifting day.
            const gsMaxes = readBarbellMaxes((gsBaseline?.performance_numbers ?? {}) as Record<string, unknown>);
            const gsMissing = missingBarbellLifts(gsMaxes).map((l) => LIFT_LABEL[l]);
            if (gsMissing.length > 0) {
              const list = gsMissing.length === 1
                ? gsMissing[0]
                : `${gsMissing.slice(0, -1).join(', ')} and ${gsMissing[gsMissing.length - 1]}`;
              throw new AppError(
                'missing_strength_baseline',
                `Before this plan can be built we need your ${list} number${gsMissing.length > 1 ? 's' : ''}. Log a baseline test in Training Baselines.`,
                409,
              );
            }
            // ⛔ THE 85 LB ENTRY MINIMUM, per lift (2026-08-13) — same shared reader, same reason
            // as the missing-lift gate above: every session's weight comes off these numbers, and
            // under 85 the program writes weights a 45 lb bar cannot be. See
            // `STRENGTH_ENTRY_MIN_1RM_LB` in `barbell-maxes.ts` for the derivation.
            // Under 65, even the 35 lb women's bar cannot carry the program's lightest set —
            // that athlete needs a beginner program, not a lighter 5/3/1. The 65-84 band is
            // ADMITTED: those lifts floor at 35 and the plan copy names the women's-bar sets.
            const gsLow = liftsBelowEntryMinimum(gsMaxes).map((l) => `${LIFT_LABEL[l]} (${gsMaxes[l as BarbellLift]} lb)`);
            if (gsLow.length > 0) {
              const list = gsLow.length === 1
                ? gsLow[0]
                : `${gsLow.slice(0, -1).join(', ')} and ${gsLow[gsLow.length - 1]}`;
              throw new AppError(
                'strength_below_minimum',
                `This plan needs a 1RM of at least ${STRENGTH_ENTRY_MIN_1RM_LB} lb on each of the four lifts — below that, even a 35 lb bar can't carry its lightest sets. Your ${list} ${gsLow.length > 1 ? 'are' : 'is'} under that line.`,
                409,
              );
            }
            // ⛔ RUN NO LONGER SWALLOWS THE BIKE. This line used to be the whole story, and an athlete
            // who set BOTH to `maintain` got run and silently lost the bike — posture, long-ride day
            // and weekly ride hours all collected at intake and then discarded, producing twelve
            // weeks with an empty Saturday and not one ride in the block.
            // `enduranceSport` stays the PRIMARY (it drives the run volume band and the frequency
            // spread); the bike now travels beside it instead of competing for the same slot.
            const gsSport = gsPosture?.run === 'maintain' ? 'run' : gsPosture?.bike === 'maintain' ? 'bike' : null;
            const gsBikeKept = gsPosture?.bike === 'maintain' && gsSport !== 'bike';
            // ⛔ ONE OWNER FOR THE RIDE ASK (stage 4, 2026-08-21) — `_shared/athlete-weekly-intent.ts`.
            // Hours, never miles (D-323 §6).
            const gsRideHours = normalizeRideHours(undefined, gsTp.target_weekly_ride_hours) ?? undefined;
            const gsLongRide = (gsTp.preferred_days as Record<string, string> | undefined)?.long_ride;
            // How many days the ride hours spread across. Absent → the composer's own default.
            /**
             * ⛔ THE CEILING IS 4 NOW ([D-430], 2026-08-19). This validated `<= 3` — the range the
             * picker offered then — so an athlete answering FOUR rides had the value dropped to
             * `undefined` here and fell back to the composer's default of 2. Their answer did not
             * survive the wire. ⚠️ The composer's own cap was `Math.min(3, …)` in TWO places and
             * both moved in the same change; this was the third.
             *
             * ⛔⛔ AND A FOURTH WAS STILL AT 3 UNTIL 2026-08-21 — `generate-strength-plan`, the very
             * next hop. Raising the number in four files and missing the fifth is not a mistake a
             * more careful session avoids; it is what an unowned rule does. The range now has ONE
             * statement (`RIDE_DAYS_CHOICES`) and this line reads it.
             */
            const gsRideDays = normalizeRideDays(gsTp.ride_days) ?? undefined;
            // Maintenance-endurance band (run only): the athlete's typed weekly miles + their learned easy
            // pace → the composer clamps to the science band. sec/km → min/mi = ×1.609344 ÷ 60. Absent
            // either → the composer falls to its fixed default (no band, no friction).
            // D-285 — was `Number(learned_fitness.run_easy_pace_sec_per_km)`, which reads the METRIC OBJECT
            // (`{value, confidence, sample_count}`), not `.value` → `Number({...})` is **NaN** → `NaN > 0` is
            // false → this band has NEVER once been applied. Silent, latent, and invisible: the composer just
            // fell to its fixed default forever. Now routed through the ONE run-pace resolver, which also
            // owns the sec/km → sec/mi conversion (the unit footgun this file was hand-rolling).
            const gsEasy = resolveCurrentRunEasyPace(gsBaseline as any);
            const gsEasyPaceMinPerMile = gsEasy.sec_per_mi != null ? gsEasy.sec_per_mi / 60 : undefined;
            const gsTargetWeeklyMiles = Number(gsTp.target_weekly_miles) > 0 ? Number(gsTp.target_weekly_miles) : undefined;
            // ── THE VERDICT SUPPLIER (D-326 layer 2) ─────────────────────────────────────────
            //
            // ⛔ ONLY MEANINGFUL ON A REBUILD. `create-goal` is the sole caller of
            // `generate-strength-plan`, and a fresh block authors twelve weeks before anything is
            // logged — every cycle is a forecast. Verdicts matter when an athlete REBUILDS a block
            // that is already running (`replace_plan_id` / `build_existing`): the cycles that have
            // finished carry real evidence, and the ones ahead are still a forecast.
            //
            // ⚠️ If this fetch fails or finds nothing, verdicts stay absent and the composer's
            // forecast exception applies — the same block it builds today. A supplier that cannot
            // read must not silently reset anyone's bar.
            const gsPriorPlanId = replace_plan_id ?? null;
            let gsVerdicts: Record<string, string[]> | undefined;
            // ⛔ THE BLOCK-TO-BLOCK TRANSITION GATE (§1d) — SPEC §1b's debt, paid 2026-08-15. The
            // CLOSING TM-test week of the finished block decides where the next one starts: five
            // reps at the training max advances it a step, three or four holds it, two or fewer
            // replaces it with the number computed off that set (Forever p.21). Absent → the
            // composer derives from the 1RM on file, which is the pre-2026-08-15 behaviour exactly.
            let gsPriorTrainingMax: Record<string, number> | undefined;
            if (gsPriorPlanId) {
              try {
                const gsWeeks = Number((resolvedGoal as any)?.target_weeks) || 12;
                // ⛔ THE PRIOR BLOCK'S OWN STRUCTURE, NOT A FRESH DERIVATION (2026-08-15, §1c).
                // `cyclesForBlock(gsWeeks)` re-derived the map from the DEFAULT tier, and since the
                // restructure the cycle ranges moved (2-4 / 5-7 / 9-11, with weeks 1, 8 and 12
                // standalone). Grouping a block that was built with a different shape against those
                // ranges files its 95% week as an ordinary week, and the verdict comes back `hold`
                // for a cycle the athlete actually passed — evidence loss with no error anywhere.
                const { data: gsPriorPlan } = await supabase
                  .from('plans')
                  .select('config')
                  .eq('id', gsPriorPlanId)
                  .eq('user_id', user_id)
                  .maybeSingle();
                const { data: plannedRows } = await supabase
                  .from('planned_workouts')
                  .select('id, week_number, date')
                  .eq('training_plan_id', gsPriorPlanId)
                  .eq('user_id', user_id);
                const weekById = new Map<string, number>();
                let currentWeek = 1;
                const todayIso = new Date().toISOString().slice(0, 10);
                for (const r of plannedRows ?? []) {
                  if (r?.id && typeof r.week_number === 'number') weekById.set(String(r.id), r.week_number);
                  // The current week is the highest week whose date has already started.
                  if (typeof r?.week_number === 'number' && String(r?.date ?? '') <= todayIso) {
                    currentWeek = Math.max(currentWeek, r.week_number);
                  }
                }
                const plannedIds = [...weekById.keys()];
                if (plannedIds.length > 0) {
                  const { data: doneRows } = await supabase
                    .from('workouts')
                    .select('planned_id, strength_exercises')
                    .eq('user_id', user_id)
                    .eq('type', 'strength')
                    .in('planned_id', plannedIds);
                  const joined = (doneRows ?? []).map((w: any) => ({
                    week_number: weekById.get(String(w?.planned_id)) ?? null,
                    strength_exercises: w?.strength_exercises ?? null,
                  }));
                  const cycles = cyclesFromStoredPhases((gsPriorPlan as any)?.config ?? null, gsWeeks);
                  const grouped = groupSessionsByCycle(joined, cycles);
                  gsVerdicts = {};
                  for (const [ref, name] of Object.entries(STRENGTH_LIFT_NAMES)) {
                    gsVerdicts[ref] = verdictsForBlock(cycles, grouped, name, currentWeek);
                  }
                  console.log(
                    `[create-goal] verdicts from ${joined.length} logged sessions, current week ${currentWeek}:`,
                    JSON.stringify(gsVerdicts),
                  );

                  // ── THE TRANSITION GATE ────────────────────────────────────────────────────
                  //
                  // ⚠️ THE CLOSING TEST WEEK ONLY. A block has two (weeks 1 and 12 of twelve); the
                  // opening one validated the number this block ran on and is already history. It is
                  // the LAST one that decides the next block, which is why it is the last element.
                  const gsTestWeeks = testWeeksFromStoredPhases((gsPriorPlan as any)?.config ?? null);
                  const gsClosingTest = gsTestWeeks.length > 0 ? gsTestWeeks[gsTestWeeks.length - 1] : null;
                  const gsStoredTm = ((gsPriorPlan as any)?.config?.training_max ?? {}) as Record<string, number>;
                  if (gsClosingTest != null && gsClosingTest <= currentWeek) {
                    const out: Record<string, number> = {};
                    for (const [ref, name] of Object.entries(STRENGTH_LIFT_NAMES)) {
                      const storedBase = Number(gsStoredTm[ref]);
                      if (!(storedBase > 0)) continue;
                      const isLower = ref === 'squat' || ref === 'deadlift';
                      // Where the finished block ENDED. `plans.config.training_max` stores the START,
                      // so the cycle progression is replayed with the verdicts just computed — the
                      // same function the block itself used, so the two cannot drift.
                      const endWn = workingNumberForCycles(
                        storedBase, cycles.length, isLower,
                        gsVerdicts[ref] as any,
                        { unknownMeans: 'hold' },
                      ).workingNumber;
                      const next = nextBlockTrainingMax(
                        endWn, isLower, tmTestResultFor(joined, gsClosingTest, name),
                      );
                      if (next > 0) out[ref] = next;
                    }
                    if (Object.keys(out).length > 0) gsPriorTrainingMax = out;
                    console.log(
                      `[create-goal] transition gate at week ${gsClosingTest}:`,
                      JSON.stringify(gsPriorTrainingMax ?? null),
                    );
                  }
                }
              } catch (e) {
                // ⛔ LOUD, AND NON-FATAL. A supplier that cannot read falls back to the forecast —
                // it must never quietly hand back `hold` for everything and flatten the block.
                console.warn('[create-goal] verdict supplier failed; falling back to forecast:', e);
                gsVerdicts = undefined;
                gsPriorTrainingMax = undefined;
              }
            }

            /**
             * ⚠️ THE `: 2` BELOW IS INTENTIONAL AND HAS LEGITIMATE CALLERS — DO NOT "FIX" IT. See
             * Q-270. It is the outermost layer of a four-deep default chain (here,
             * `generate-strength-plan:136` and `:257`, and the `DEFAULT_ENDURANCE_SESSIONS` FLOOR at
             * `strength-primary-plan:1531`), and removing this one alone changes nothing observable
             * because the next layer supplies the same 2.
             *
             * Two callers legitimately arrive with no `run_days`:
             *   · a BIKE-ONLY Strong Focus block — there is no running to count, `runSelected` is
             *     false downstream, and the value is computed and never read;
             *   · `mode: 'build_existing'` on a goal row stored before the intake started requiring
             *     the number (2026-08-10) — four of the eight call sites rebuild from the stored
             *     prefs.
             *
             * ⛔ WHAT IT IS NOT ALLOWED TO BE IS SILENT. Until 2026-08-10 the Strong Focus intake
             * could reach this with an unanswered "Runs a week" and the athlete would be built two
             * runs a week having chosen nothing — the card even said "Auto", which named this
             * literal as though it were a decision. The intake now requires the number, so from a
             * NEW build this branch should be unreachable unless running is out entirely. This warn
             * is how we find out whether that is true, rather than assuming it.
             */
            /**
             * ⛔ THE FLOOR IS 1, NOT 2, AS OF 2026-08-19 ([D-430]). This read `>= 2` — the range the
             * picker offered at the time — so an athlete answering ONE run a week failed the test,
             * was DEFAULTED to two, and had their answer overwritten with a console warning blaming
             * a "leaking intake gate" for carrying it correctly.
             *
             * ⚠️ THIS IS LAYER 1 OF Q-270's FOUR-LAYER DEFAULT CHAIN, and it is the only one that
             * VALIDATES rather than merely falls back — so it is the only one that could reject a
             * legal answer. The other three supply 2 for a missing value and pass a present one
             * through; the composer's own floor moved to 1 in the same change.
             *
             * ⛔ THE WARN BELOW IS UNCHANGED AND STILL EARNS ITS KEEP: it fires on a genuinely
             * absent or out-of-range value, which is what it was written to detect.
             */
            const gsRunDaysGiven = Number(gsTp.run_days) >= 1 && Number(gsTp.run_days) <= 4;
            if (!gsRunDaysGiven && gsSport === 'run') {
              console.warn(
                `[create-goal] endurance_frequency DEFAULTED to 2 — run_days was ${JSON.stringify(gsTp.run_days)} `
                + `on a RUN-sport Strength Focus block (user ${user_id}, goal ${String((resolvedGoal as any)?.id ?? 'inline')}). `
                + 'Expected only on goals stored before 2026-08-10; a new build reaching this means the intake gate is leaking. See Q-270.',
              );
            }
            const gsBody: Record<string, any> = {
              user_id,
              // The composer rounds this DOWN to a whole number of four-week cycles (12 → 12, 10 → 8).
              duration_weeks: Number((resolvedGoal as any)?.target_weeks) || 12,
              endurance_sport: gsSport,         // sport-agnostic maintenance (run / bike / none)
              // run frequency from intake (2/3/4); engine spreads miles + stacks extras onto upper lift days
              endurance_frequency: gsRunDaysGiven ? Number(gsTp.run_days) : 2,
              goal_name: String(resolvedGoal?.name || 'Strength Focus'),
              ...(gsTargetWeeklyMiles ? { target_weekly_miles: gsTargetWeeklyMiles } : {}),
              ...(gsEasyPaceMinPerMile ? { easy_pace_min_per_mile: gsEasyPaceMinPerMile } : {}),
              // ⛔ NO accessory_bias. Glute / Hyrox add-ons are OUT of this flow (D-323) and re-home to
              // the Adjust tab, where they REPLACE one of the session's three assistance slots rather
              // than stacking on top of the block.
              // Swim slots, only when the athlete kept swim for this block. Booked, not coached.
              ...(gsPosture?.swim === 'maintain' && Number(gsTp.swim_days) > 0
                ? { swim_days: Number(gsTp.swim_days) } : {}),
              // The athlete's three assistance picks from the build flow. Absent → the composer's
              // bodyweight defaults, so skipping that card still yields a complete block.
              ...(gsTp.assistance_picks && typeof gsTp.assistance_picks === 'object'
                ? { assistance_picks: gsTp.assistance_picks } : {}),
              // Long-run day from intake (composer constrains to Sat/Sun).
              ...((gsTp.preferred_days as Record<string, unknown> | undefined)?.long_run ? { long_run_day: (gsTp.preferred_days as Record<string, string>).long_run } : {}),
              // ⛔ THE SECOND PIN. Added 2026-07-26 — until now this block forwarded ONLY `long_run`
              // out of `preferred_days`, so the hard day the athlete picked reached the goal row and
              // stopped dead. The composer had never seen it, which is why the intake's promise that
              // "the lifting is placed around it" was true for the long run and silent for this one.
              //
              // ⛔ UP TO TWO NOW, AND THEY ARE NO LONGER MUTUALLY EXCLUSIVE (§1i, 2026-08-17). D-327
              // forced a choice between a hard run and a hard ride and this block forwarded whichever
              // won; the athlete may now have both, or two of one. `hard_days` on the goal is the new
              // shape and is read first; `preferred_days.quality_run` / `.quality_bike` remain the
              // fallback so a goal written before §1i still builds exactly the block it did.
              //
              // ⛔ THE TERRAIN RIDES WITH A RUN AND ONLY WITH A RUN (2026-08-06). It is the athlete's
              // answer to "which of these can you actually run" — a hill, a short hill, a treadmill.
              // The RIDE has no terrain question: one shape (Helgerud 4 × 4), and a turbo, a chaingang
              // and a climb are all the same session on it.
              // ⚠️ Absent is legal and means `hill_3min`. Forwarding nothing is what every goal
              // created before that field builds, and it must keep building it.
              ...(((): Record<string, unknown> => {
                const pd = gsTp.preferred_days as Record<string, unknown> | undefined;
                const terrain = pd?.quality_run_terrain;
                /**
                 * ⛔⛔ IT NO LONGER STAMPS THE §1i LIST, AND THAT WAS SILENTLY RUINING SESSIONS
                 * (found 2026-08-18). READ BEFORE RESTORING.
                 *
                 * `quality_run_terrain` defaults to `hill_3min` and the goal seed writes it whenever
                 * a hard run has a pinned day. This stamped it onto every §1i hard run that carried
                 * no terrain of its own — and since the wizard STOPPED asking for terrain on
                 * 2026-08-18, that is now every new goal.
                 *
                 * ⛔ A STAMPED TERRAIN IS INDISTINGUISHABLE FROM A CHOSEN ONE. `hardRunSession` adds
                 * *"no hill outside? a treadmill at 5-8% is the same session"* ONLY when terrain is
                 * absent, precisely because an athlete who picked the treadmill must not be told to
                 * go find a hill. Stamping killed that line for everyone — so an athlete in a flat
                 * neighbourhood was handed a 4 × 3 min hill session with the backup plan removed,
                 * and no way to know one existed.
                 *
                 * ⚠️ THE PRE-§1i FALLBACK BELOW STILL USES IT, deliberately. That path builds a hard
                 * day from `preferred_days.quality_run` alone — a goal from before slots carried
                 * their own terrain — where `quality_run_terrain` IS the athlete's answer rather
                 * than a default standing in for one.
                 */
                const withTerrain = (d: Record<string, unknown>) =>
                  (d.discipline === 'run' && typeof terrain === 'string' && !d.terrain)
                    ? { ...d, terrain }
                    : d;
                // The §1i shape, written by the builder's two hard-day slots.
                const stored = (gsTp as Record<string, unknown>).hard_days;
                if (Array.isArray(stored) && stored.length > 0) {
                  /**
                   * ⛔⛔ THE `typeof h.day === 'string'` TEST IS GONE (2026-08-18), AND IT WAS SILENTLY
                   * KILLING THE §1i PLACEMENT MODEL ON THIS PATH.
                   *
                   * Slice 8 made the day OPTIONAL: a prescribed hard day with no day is not a
                   * half-finished answer, it is the normal case — *"ours to write, ours to place"* —
                   * and the composer turns it into a FLEXIBLE session in the same solve that places
                   * the bar. The composer learned that. This forwarding layer never did, so every
                   * unpinned hard day was dropped here and the athlete's hard session vanished
                   * between the goal and the generator with nothing said.
                   *
                   * ⚠️ MALFORMED IS STILL DIFFERENT FROM ABSENT, and conflating them would be the
                   * silent move this file has fixed twice. `day` absent (null / undefined / '') means
                   * "engine, propose one". `day` PRESENT but not a string is a client bug or a
                   * hostile caller, and it still drops the entry — exactly as `strength-primary-plan`
                   * does with the same rule.
                   *
                   * ⚠️ A CLUB DAY WITH NO DAY IS NOT DROPPED HERE ANY MORE — the composer drops it
                   * itself (`if (!day && ownership === 'club') continue`), because only the athlete
                   * knows when the club meets and the engine declines to invent an appointment. One
                   * owner for that rule, not two.
                   */
                  const days = stored
                    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
                    .filter((h) => (h.day == null || typeof h.day === 'string')
                      && (h.discipline === 'run' || h.discipline === 'bike'));
                  return days.length > 0 ? { hard_days: days } : {};
                }
                // ⚠️ THE PRE-§1i GOAL. One pin, run winning if both somehow arrived — the D-327 gate
                // should have prevented that, and this is the same defensive order it always had.
                const run = typeof pd?.quality_run === 'string' ? pd.quality_run : null;
                const bike = typeof pd?.quality_bike === 'string' ? pd.quality_bike : null;
                if (run) return { hard_days: [withTerrain({ day: run, discipline: 'run' })] };
                if (bike) return { hard_days: [{ day: bike, discipline: 'bike' }] };
                return {};
              })()),
              // ⛔ `lifting_days` IS NO LONGER FORWARDED (§1f-0, 2026-08-17). It carried the intake
              // card's 4-or-3 answer off the goal's training prefs, and both ends of that wire are
              // gone: the card was deleted with slice 2, and `generate-strength-plan` no longer reads
              // the field. Every Strong Focus block is three days — Squat · Bench · Deadlift + Press.
              //
              // ⚠️ A GOAL ROW WRITTEN BEFORE TODAY MAY STILL CARRY `training_prefs.lifting_days`. It
              // is simply not read; the stored value is inert, not honoured. Nothing reshapes a block
              // from it, which is the point — three days is the only shape offered, and there is no
              // legacy four-day path to fall into (decided 2026-08-17: delete and rebuild, do not
              // tolerate).
              // ⛔ THE BIKE, travelling beside the primary sport rather than losing to it. Carries the
              // two things the athlete actually chose: how many hours, and which day is the long one.
              // Both were written to the goal and read by NOTHING under supabase/functions until now.
              // ⚠️ Hours, never miles (D-323 §6) — the engine turns hours into sessions and has never
              // learned a ride speed.
              ...(gsBikeKept
                ? { bike: { ...(gsRideHours ? { hours: gsRideHours } : {}), ...(gsRideDays ? { days: gsRideDays } : {}), ...(gsLongRide ? { long_ride_day: gsLongRide } : {}) } }
                : {}),
              // Retained for the bike-PRIMARY path (run out, bike maintained), where `enduranceSport`
              // is already 'bike' and the block above deliberately does not fire.
              ...(gsRideHours ? { target_weekly_ride_hours: gsRideHours } : {}),
              ...(plan_start_date ? { start_date: plan_start_date } : {}),
              ...(gsVerdicts ? { cycle_verdicts: gsVerdicts } : {}),
              // ⛔ WHERE THE NEXT BLOCK STARTS, per lift, absolute lb. Absent → the composer derives
              // from the 1RM on file, unchanged. See the transition-gate block above.
              ...(gsPriorTrainingMax ? { prior_training_max: gsPriorTrainingMax } : {}),
              // The posture the block was built under — `develop` is the only one that earns an
              // anchor-weighted shape (2026-07-28).
              ...(gsPosture?.strength ? { strength_posture: gsPosture.strength } : {}),
              ...(bodyPreview ? { preview: true } : {}),
            };
            console.log(`[create-goal] Get Strong → strength-primary: sport=${gsSport ?? 'strength-only'} weeks=${gsBody.duration_weeks}`);
            const gsGen = await invokeFunction(functionsBaseUrl, serviceKey, 'generate-strength-plan', gsBody);
            if (bodyPreview) {
              return new Response(JSON.stringify({
                success: true, mode, goal_id: createdGoalId, preview: true, sport: 'strength', combined: false,
                plan: gsGen?.plan ?? null,
              }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            const gsPlanId = gsGen?.plan_id;
            if (!gsPlanId) throw new AppError('plan_generation_failed', gsGen?.error || 'Strength plan returned no plan_id');
            createdPlanId = gsPlanId;
            const { error: gsLinkErr } = await supabase
              .from('plans').update({ goal_id: createdGoalId, plan_mode: 'rolling' }).eq('id', gsPlanId).eq('user_id', user_id);
            if (gsLinkErr) throw new AppError('plan_link_failed', gsLinkErr.message);

            // ⛔ THE GOAL RECORDS WHAT WAS PLACED, NOT WHAT WAS SEEDED.
            //
            // `non-race-goal-seeds.ts:113` seeds `preferred_days.strength` to Mon/Tue/Thu/Fri, with
            // the comment "match the engine grid so the intake header doesn't contradict the plan".
            // That WAS the engine grid — the hardcoded `MAIN_LIFTS` days that `place-week` replaced.
            // The solver places dynamically now, so the seed states a schedule the plan does not
            // have: an athlete's summary read Mon/Tue/Thu/Fri while the block ran Mon/Tue/Wed/Fri.
            //
            // ⚠️ AND IT IS NOT ONLY A HEADER. `adapt-plan` and the optimizer read
            // `preferred_days.strength`; a stale value there is a wrong picture of the week, not a
            // cosmetic one.
            const placedStrengthDays = Array.isArray(gsGen?.strength_days) ? gsGen.strength_days : null;
            if (placedStrengthDays?.length && createdGoalId) {
              const { data: goalRow } = await supabase
                .from('goals').select('training_prefs').eq('id', createdGoalId).eq('user_id', user_id).single();
              const prefs = (goalRow?.training_prefs ?? {}) as Record<string, unknown>;
              // ⛔ NOT `preferred_days.strength`. That key means "the athlete chose this", and on this
              // path nothing asks them — writing engine output there is the fabricated-preference bug
              // #131 fixed on the combined side. Engine days travel under the key that says so, the
              // same convention `strength_optimizer_slots` already uses in the export.
              const pd = { ...((prefs.preferred_days ?? {}) as Record<string, unknown>) };
              delete (pd as Record<string, unknown>).strength;
              const { error: pdErr } = await supabase
                .from('goals')
                .update({
                  training_prefs: {
                    ...prefs,
                    preferred_days: pd,
                    strength_optimizer_slots: placedStrengthDays,
                  },
                })
                .eq('id', createdGoalId).eq('user_id', user_id);
              if (pdErr) console.warn('[create-goal] could not write placed strength days:', pdErr.message);
              else console.log(`[create-goal] strength_optimizer_slots set from the plan: ${placedStrengthDays.join(', ')}`);
            }
            await invokeFunction(functionsBaseUrl, serviceKey, 'activate-plan', { plan_id: gsPlanId });
            await retireCompetingActivePlans(supabase, user_id, gsPlanId, { mode, existing_goal_id, replace_plan_id });
            await bustTrainingCachesAfterPlanChange('strength_plan');
            return new Response(JSON.stringify({
              success: true, mode, goal_id: createdGoalId, plan_id: gsPlanId, sport: 'strength', combined: false,
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
      }

      // ── (b)-run: run-shaped non-race → generate-run-plan with a RETEST head ────────
      // The combined engine is triathlon-shaped and cannot produce a single-sport run week (F-9/F-12).
      // Route run-shaped non-race goals to the working single-sport engine with terminalShape='retest'
      // (no peak/taper). Tri-shaped non-race falls through to buildCombinedPlan below (unchanged).
      // See docs/SPEC-non-race-run-retest.md.
      if (sport === 'run') {
        const tw = Number((resolvedGoal as any)?.target_weeks) || 12;
        const tp = (resolvedGoal?.training_prefs ?? {}) as Record<string, any>;
        const proxyRaw = proxyDistanceForNonRaceGoal(sport, tw, fitness); // 'half_marathon' | 'marathon'
        const runRetestBody: Record<string, any> = {
          user_id,
          distance: proxyRaw === 'marathon' ? 'marathon' : 'half',
          fitness,
          goal: 'complete',          // non-race base-building, not a speed/race target
          duration_weeks: tw,        // length anchors on target_weeks, not a race date
          approach: 'sustainable',   // no race peak
          days_per_week: tp.days_per_week
            ? `${tp.days_per_week}-${Math.min(7, Number(tp.days_per_week) + 1)}`
            : '4-5',
          terminalShape: 'retest',   // (b)-run head — Build → Retest, no taper/peak
          race_date: null,
          strength_frequency: Number(tp.strength_frequency) || 0,
          strength_protocol: resolveNonRaceStrengthProtocol(tp.strength_protocol),
          // E3b — the run-endurance time budget sizes the week. Part 1 passes the athlete's stated
          // weekly hours as the run-endurance slice (strength reservation/split is Part 2). Absent →
          // the engine falls back to the legacy table (races/no-budget byte-identical).
          ...(Number(tp.weekly_hours_available) > 0 ? { weekly_hours: Number(tp.weekly_hours_available) } : {}),
          run_lean: 1.0, // run-only single-sport path → all endurance to run; the fader supplies the split when bike develops
          ...(plan_start_date ? { start_date: plan_start_date } : {}),
          ...(bodyPreview ? { preview: true } : {}),
          // The pinned long-run day / club night — same channel, same reason as the event path above.
          ...(tp.preferred_days ? { preferred_days: tp.preferred_days } : {}),
        };

        // Q-093 Lock 1: thread strength_tier/strength_intent/equipment so generate-run-plan's tier
        // gate (`index.ts:271`, honors a protocol only at tier==='strength_power') stops dropping the
        // chosen developer to durability. Without this, EVERY non-race run developer silently
        // downgrades. Mirrors the event-path equipment resolution (`:2654`/`:3115`) — barbell-capable
        // → strength_power (developer honored); bodyweight → injury_prevention (durability, correct,
        // byte-identical). `baseline` isn't in scope at this block, so fetch equipment narrowly.
        const runDisciplinePosture = sanitizePerDisciplinePosture(
          tp.per_discipline_posture as Record<string, unknown> | undefined,
        );
        if (runDisciplinePosture?.run) {
          runRetestBody.endurance_posture = runDisciplinePosture.run;
        }
        if (Number(runRetestBody.strength_frequency) > 0) {
          const { data: runStrBaseline } = await supabase
            .from('user_baselines').select('equipment, performance_numbers').eq('user_id', user_id).maybeSingle();
          const runEquipmentType = resolveStrengthEquipmentTypeForPlan(
            tp.equipment_type,
            runStrBaseline?.equipment?.strength ?? [],
            runStrBaseline?.performance_numbers,
          );
          runRetestBody.equipment_type = runEquipmentType;
          runRetestBody.strength_tier = runEquipmentType === 'commercial_gym' ? 'strength_power' : 'injury_prevention';
          if (tp.strength_intent) runRetestBody.strength_intent = tp.strength_intent;

          // SMART SERVER (SPEC-product-shape): when strength DEVELOPS, the ENGINE picks the developer
          // from the RELIABLE server-side equipment — barbell → five_by_five (the strength base of the
          // arc), bodyweight → durability. This OVERRIDES whatever protocol the client stored: the
          // builder's equipment read is flaky (it seeded durability for a barbell athlete), and the
          // dumb client should only express the OUTCOME ("get stronger" = strength develops), not pick
          // the protocol. Maintain/support strength keeps the client's choice (durability/minimum_dose).
          if (runDisciplinePosture?.strength === 'develop') {
            runRetestBody.strength_protocol = runEquipmentType === 'commercial_gym' ? 'five_by_five' : 'durability';
          }
        }

        // Q-088 (D-220): strength-focus mode — endurance held + strength develops → upgrade the
        // resolved developer to its 4-day U/L/U/L lane @ freq 4 (five_by_five → strength_focus_build).
        const focus = resolveStrengthFocusMode(runDisciplinePosture, runRetestBody.strength_protocol);
        if (focus) {
          runRetestBody.strength_protocol = focus.protocol;
          runRetestBody.strength_frequency = focus.frequency;
          console.log(
            `[create-goal] Q-088 strength-focus mode (b)-run: ${focus.protocol} @ freq ${focus.frequency} (endurance ${focus.endurancePosture})`,
          );
        }

        // Ops observability for the non-race run path (kept; replaces the throwaway debug logs).
        console.log(`[create-goal] (b)-run → generate-run-plan: protocol=${runRetestBody.strength_protocol} tier=${runRetestBody.strength_tier} freq=${runRetestBody.strength_frequency} endurance=${runRetestBody.endurance_posture ?? 'n/a'}`);
        const runGen = await invokeFunction(functionsBaseUrl, serviceKey, 'generate-run-plan', runRetestBody);
        if (!runGen?.plan_id) console.warn('[create-goal] (b)-run generate-run-plan returned no plan_id:', JSON.stringify({ error: runGen?.error, validation_errors: runGen?.validation_errors }));
        if (bodyPreview) {
          return new Response(JSON.stringify({
            success: true, mode, goal_id: createdGoalId, preview: true,
            sport: 'run', combined: false,
            run_preview: runGen?.preview ?? null, plan: runGen?.plan ?? null,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const runPlanId = runGen?.plan_id;
        if (!runPlanId) throw new AppError('plan_generation_failed', runGen?.error || 'Non-race run plan returned no plan_id');
        createdPlanId = runPlanId;
        const { error: runLinkErr } = await supabase
          .from('plans').update({ goal_id: createdGoalId, plan_mode: 'rolling' })
          .eq('id', runPlanId).eq('user_id', user_id);
        if (runLinkErr) throw new AppError('plan_link_failed', runLinkErr.message);
        await invokeFunction(functionsBaseUrl, serviceKey, 'activate-plan', { plan_id: runPlanId });
        await retireCompetingActivePlans(supabase, user_id, runPlanId, { mode, existing_goal_id, replace_plan_id });
        await bustTrainingCachesAfterPlanChange('run_plan');
        return new Response(JSON.stringify({
          success: true, mode, goal_id: createdGoalId, plan_id: runPlanId, sport: 'run', combined: false,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // ── End (b)-run; tri-shaped non-race continues to buildCombinedPlan ───────────

      const combinedResult = createdGoalId ? await buildCombinedPlan(
        supabase, functionsBaseUrl, serviceKey, user_id, createdGoalId, resolvedGoal!, fitness,
        combinedTransitionFromPostRace(postRaceRecovery), plan_start_date ?? null, bodyPreview,
      ) : null;
      if (combinedResult) {
        if (combinedResult.preview) {
          return new Response(JSON.stringify({
            success: true, mode, goal_id: createdGoalId, preview: true,
            combined_preview: combinedResult.combined_preview, schedule_signals: combinedResult.schedule_signals,
            sport: 'multi_sport', combined: true,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        createdPlanId = combinedResult.plan_id;
        await bustTrainingCachesAfterPlanChange('combined_plan');
        return new Response(JSON.stringify({
          success: true, mode, goal_id: createdGoalId, plan_id: combinedResult.plan_id,
          schedule_signals: combinedResult.schedule_signals, sport: 'multi_sport', combined: true,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // null → roll back the orphan goal; do NOT fall through to the legacy paths (the whole point of #1)
      await rollbackCombinedPlanUnavailable();
      return new Response(JSON.stringify({
        success: false, combined: true, error_code: 'non_race_plan_failed',
        error: 'Non-race plan generation failed (combined engine returned no plan). Standalone generation was not run.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
            // D-214: ROW goal_type from the resolved request goal (NOT training_prefs.goal_type); a
            // non-race goal persists target_weeks + a null target_date.
            goal_type: String((resolvedGoal as any)?.goal_type || 'event'),
            target_date: resolvedGoal?.target_date ?? null,
            target_weeks: (resolvedGoal as any)?.target_weeks ?? null,
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
      // §7.5 — surface the swim_calibration trade-off here too. `triPrimaryWithSwimLeg` /
      // `swimSecPer100Yd` are computed earlier in this function (line ~1249) and remain
      // in scope. Even though this path drives `generate-triathlon-plan` (legacy), the
      // trade-off renderer is shared, so the athlete-facing message lands the same way.
      const standaloneNoSwimThresholdPace =
        triPrimaryWithSwimLeg &&
        (swimSecPer100Yd == null || !Number.isFinite(swimSecPer100Yd) || swimSecPer100Yd <= 0);
      const standalone_generation_trade_offs = buildCombinedPlanGenerationTradeOffs({
        postRace: postRaceRecovery,
        optimizerSnapshots: standaloneTriOptimizerSnapshot
          ? [{ goal_id: triTradeOffGoalId || 'tri', ...standaloneTriOptimizerSnapshot }]
          : [],
        noSwimThresholdPace: standaloneNoSwimThresholdPace,
      });
      triGenerateBody.generation_trade_offs = standalone_generation_trade_offs;
      console.log('[create-goal] standalone tri generation_trade_offs:', JSON.stringify(standalone_generation_trade_offs));

      // Standalone tri may not have a combinedSchedulePrefs in scope here; derive from the
      // standalone goal's training_prefs as a fallback signal.
      const standaloneTriPrefs = (newGoal.training_prefs as Record<string, unknown>) ?? {};
      const standaloneHasPins = hasAthletePinsFromPrefs(standaloneTriPrefs);
      const triScheduleSignals = aggregateOptimizerScheduleSignals(
        standaloneTriOptimizerSnapshot
          ? [{ goal_id: triTradeOffGoalId || 'tri', ...standaloneTriOptimizerSnapshot }]
          : [],
        { hasAthletePins: standaloneHasPins },
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
    /** True only when the marathon floor came from measured history rather than a fitness fallback. */
    let marathonFloorIsMeasured = false;
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
        // ⛔ THE PERSONALISED FLOOR IS ONLY PERSONAL WHEN IT WAS MEASURED (2026-08-04).
        //
        // `resolveAdaptiveMarathonDecisionFromMemory` returns a `minimum_feasible_weeks` whether or
        // not it had any evidence: with no `athlete_memory` row it falls through to
        // `fallbackMinByFitness` (`_shared/athlete-memory.ts:381`) — **advanced 3, intermediate 4,
        // beginner 6 weeks** — and hands that back in the same shape as a measured answer. This
        // line then took it as gospel, so a brand-new account ticking "advanced" got a floor of
        // THREE WEEKS for a marathon, and the static `MIN_WEEKS` table (advanced 8) never applied.
        //
        // ⛔ THE FIX IS NOT TO RAISE THE FALLBACK. The fallback is fine as an *estimate*; the bug is
        // treating an estimate as a personalisation. When the rule reports `insufficient_data` there
        // is nothing personal about the number, so the **level-scaled `MIN_WEEKS` table is the
        // floor** — which is exactly what it is for, and what it was doing before the adaptive
        // engine landed on top of it.
        //
        // ⚠️ `low_confidence` COUNTS AS MEASURED. It means a real value from real history that we
        // are hedging, not an absence — `getRuleOrInsufficient` returns the value in that case.
        // Treating a hedge as no-evidence would push experienced athletes back onto the static
        // table and make the adaptive engine pointless for exactly the people it was built for.
        const resolvedFloor = resolveMarathonFloorWeeks({
          staticFloorWeeks: floorWeeks,
          adaptiveMinWeeks: adaptive.minimum_feasible_weeks,
          minWeeksRuleStatus: (adaptive.decision_source?.rule_statuses ?? {})['run.minimum_feasible_weeks'],
        });
        personalizedFloorWeeks = resolvedFloor.floorWeeks;
        marathonFloorIsMeasured = resolvedFloor.measured;
        console.log('[adaptive-marathon-floor]', {
          user_id, weeksOut,
          measured: resolvedFloor.measured,
          adaptive_min: adaptive.minimum_feasible_weeks,
          static_min: floorWeeks,
          applied: personalizedFloorWeeks,
        });
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

    // ⛔ MOVED ABOVE THE REFUSAL (2026-08-04). These were computed after it, which was fine while the
    // refusal was dead code and is not fine now: the gate has to know whether a legitimate
    // short-block mode is in play before it decides to refuse.
    const adaptiveMode = adaptiveMarathonDecision?.recommended_mode as string | undefined;
    const adaptiveSupportMode = distanceApi === 'marathon' && ADAPTIVE_MARATHON_DECISIONS_ENABLED
      ? adaptiveMode === 'race_support' || adaptiveMode === 'bridge_peak'
      : false;

    /**
     * ⛔ THE TIMELINE GATE — NOW A WARNING (2026-08-06). Michael: *same "warn, no wall" as the
     * mileage floor.* It threw for two days; it states the cost now and the plan builds.
     *
     * ⛔ THE ARGUMENT IT REVERSES, KEPT SO NOBODY RE-DERIVES IT. The 2026-08-04 call was *timeline,
     * unlike mileage, is where we stop* — mileage is a judgement about a body and the athlete owns
     * it, a race inside the floor is arithmetic. The half that was wrong is "arithmetic": the
     * engine DOES have a plan for them. It builds to the weeks available, tapers into race day, and
     * (since this morning) states the long run it will actually reach. Short is a worse block, not
     * an impossible one, and this app's whole posture on worse-but-chosen is to price it.
     *
     * ⚠️ WHAT MUST STILL BE TRUE FOR THAT TO HOLD — check these before weakening anything else:
     *   • `durationWeeks` is trimmed to the race week, so no plan is laid out past its own race.
     *   • `buildLongRunArc` anchors the peak to race day at any length, so a 6-week block still
     *     tapers instead of racing off its biggest week.
     *   • The intake states the ceiling: what the longest run reaches vs the 18-20 norm.
     * The warning without those three is a shrug. With them it is a priced decision.
     *
     * ⚠️ THE ONE WALL LEFT IS STRUCTURAL, AND IT IS NOT THIS ONE. Under four weeks the phase
     * builder cannot lay out a block at all (`determinePhaseStructure` throws, `validateRequest`
     * rejects). That is a fact about the builder, not a verdict on the athlete — see the guard
     * below `durationWeeks`.
     *
     * ⛔ THE SUPPORT MODES STAY EXEMPT and now suppress the WARNING. `race_support` (≤2 weeks) and
     * `bridge_peak` (≤6) fire only with evidence of a build underneath — an active run plan
     * (`allowRaceWeekSupportMode`) or a floor from real memory (`marathonFloorIsMeasured`). Telling
     * an athlete mid-build that a marathon "usually takes 14 weeks" is noise; the engine already
     * knows their race is in nine days and is building for exactly that.
     */
    const timelineAdvisory = marathonTimelineAdvisory({
      distanceApi,
      weeksOut,
      floorWeeks: personalizedFloorWeeks,
      floorIsMeasured: marathonFloorIsMeasured,
      allowRaceWeekSupportMode,
      adaptiveSupportMode,
    });
    /** Stated on the build screen, never thrown. Same surface as the mileage-floor notice. */
    const advisories: Array<{ code: string; message: string }> = [];
    if (timelineAdvisory) {
      console.log('[race-close]', {
        user_id, distanceApi, fitness, weeksOut,
        floor: personalizedFloorWeeks, measured: marathonFloorIsMeasured,
      });
      advisories.push(timelineAdvisory);
    }
    /**
     * ⛔ THE PLAN WEEK RACE DAY ACTUALLY FALLS IN — and it is not always `weeksOut` (2026-08-06).
     *
     * `weeksOut` is counted from TODAY; the plan opens on the NEXT MONDAY. Race Sunday 2026-10-11
     * asked from Thursday 2026-08-06 is `ceil(66/7)` = 10 weeks out, but from the plan's own Monday
     * (2026-08-10) it is 62 days — race day lands in plan **week 9**, and the block was built ten
     * weeks long. Week 10 began the day after the race: an empty week on the calendar, every day of
     * it past the race, so `generateRaceWeekSessions` emitted nothing for all seven.
     *
     * ⚠️ `weeksOut` ITSELF IS UNTOUCHED. It feeds the timeline refusal and the planning-context
     * signals, both of which are asking "how long has this athlete got from now" — the right
     * question for them, and a settled one (STATE-race-builder §3). This only stops the plan being
     * laid out past its own race day.
     *
     * ⚠️ IT IS A CEILING, NOT A REPLACEMENT. The floor still raises a short block; this then trims
     * any week that would start after the race, so the two cannot disagree in the direction that
     * puts empty weeks on the calendar.
     */
    const raceWeekOfPlan = planWeekContaining(plan_start_date, resolvedGoal?.target_date);
    const durationWeeksRaw = adaptiveSupportMode
      ? Math.max(1, Math.min(weeksOut, adaptiveMode === 'race_support' ? 2 : 6))
      : allowRaceWeekSupportMode
        ? Math.max(1, Math.min(weeksOut, 2))
        : Math.max(personalizedFloorWeeks, Math.min(weeksOut, 20));
    const durationWeeks = raceWeekOfPlan != null
      ? Math.max(1, Math.min(durationWeeksRaw, raceWeekOfPlan))
      : durationWeeksRaw;
    if (raceWeekOfPlan != null && durationWeeks !== durationWeeksRaw) {
      console.log(`[create-goal] duration trimmed ${durationWeeksRaw} → ${durationWeeks} weeks: race day falls in plan week ${raceWeekOfPlan} counting from ${plan_start_date}`);
    }

    /**
     * ⛔ THE LAST WALL, AND IT IS THE BUILDER'S, NOT A VERDICT ON THE ATHLETE (2026-08-06).
     *
     * With the timeline gate demoted to a warning, this is the only thing left that refuses a race
     * on its date — and it refuses because `determinePhaseStructure` literally cannot lay out a
     * block under four weeks (`base-generator.ts:279` throws; `validateRequest` rejects the same).
     * Without this the athlete would get a raw 400 with `validation_errors` in it, which is a wall
     * with worse manners: same outcome, no sentence they can act on.
     *
     * ⚠️ THE SUPPORT MODES ARE EXEMPT and they are the reason this is not simply `< 4`. A
     * `race_support` block is 1-2 weeks BY DESIGN — it is not a build, it is the last week of one.
     * They are gated on evidence upstream (an active run plan, or a floor from real memory), so if
     * one is in play the short duration is the engine's considered answer, not an accident.
     */
    if (durationWeeks < 4 && !allowRaceWeekSupportMode && !adaptiveSupportMode) {
      throw new AppError(
        'race_within_build_window',
        `Your race is ${weeksOut === 1 ? 'a week' : `${weeksOut} weeks`} out, which leaves ${durationWeeks} week${durationWeeks === 1 ? '' : 's'} of training — under the four the plan builder needs to lay out a block with a taper. A later date, or a race you are already trained for, is what this one can build.`,
      );
    }

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

    // ⛔ A PREVIEW MUST NOT WRITE — THE EVENT PATH'S COPY OF THE SAME BUG (2026-08-04).
    //
    // The non-race branch fixed this at `:2396` and its comment says "the plan side was already
    // correct… only the goal leaked." **That was true of the non-race branch and false of the
    // repo.** This is a SECOND `mode === 'create'` insert, on the run-event path, and it had no
    // `bodyPreview` guard at all — so previewing a race goal created a real `status: 'active'` goal,
    // built a real plan, linked it, activated it, and retired whatever plan the athlete was on.
    // Worse than the leak it mirrors: that one left a stray row, this one changed the training.
    //
    // Found by tracing the marathon intake before wiring its confirm screen to `preview()`; the
    // preview was never fired on this path, so nothing had ever exercised it.
    //
    // ⚠️ THE GUARD ALONE IS NOT THE FIX. With no goal row, `createdGoalId` is null and the code
    // below would still call `generate-run-plan` for real, persist a plan, and then link it to
    // nothing. The preview must ALSO reach the generator's own no-persist mode and return before
    // the link/activate/retire block — see the two changes further down, and the (b)-run branch at
    // `:2721`/`:2774`, which is the shape being copied.
    //
    // ⚠️ THE TRIATHLON EVENT PATH AT `:2842` STILL HAS THIS HOLE. Same `if (mode === 'create')`,
    // same missing guard, and it is unreachable from the marathon intake so it is left for the
    // slice that owns the tri path. Do not assume it was fixed here.
    if (mode === 'create' && !bodyPreview) {
      const newGoalPriority = action === 'keep' && existing_goal_id ? 'B' : 'A';
      const { data: createdGoal, error: goalInsertErr } = await supabase
        .from('goals')
        .insert({
          user_id,
          name: String(resolvedGoal?.name || '').trim(),
          // D-214: ROW goal_type from the resolved request goal (NOT training_prefs.goal_type); a
          // non-race goal persists target_weeks + a null target_date.
          goal_type: String((resolvedGoal as any)?.goal_type || 'event'),
          target_date: resolvedGoal?.target_date ?? null,
          target_weeks: (resolvedGoal as any)?.target_weeks ?? null,
          sport,
          distance: resolvedGoal?.distance || null,
          /**
           * ⛔ THESE TWO WERE HARDCODED AWAY, AND THE INTAKE HAD ALREADY STARTED SENDING THEM
           * (2026-08-04). `course_profile: {}` and a missing `target_time` meant the race card
           * could collect a climb figure and a target finish, put both on the goal it posted, and
           * have the server silently drop them on the floor — inputs with no pipe behind them.
           *
           * Both have real readers already: `plan-context.ts:58` reads `course_profile` and
           * `race-readiness-llm` gates ALL race-terrain talk on its presence;
           * `resolveGoalTargetTimeSeconds` reads `target_time` for the coach, course-strategy and
           * the finish projection.
           *
           * ⚠️ `{}` IS NOT A SAFE DEFAULT FOR `course_profile` — an empty object still satisfies
           * the "is it present" check and would switch on terrain commentary with nothing behind
           * it. Absent must stay absent, so an empty/missing value writes `null`.
           */
          course_profile: (() => {
            const cp = (resolvedGoal as any)?.course_profile;
            return cp && typeof cp === 'object' && Object.keys(cp).length > 0 ? cp : null;
          })(),
          ...(Number((resolvedGoal as any)?.target_time) > 0
            ? { target_time: Math.round(Number((resolvedGoal as any).target_time)) } : {}),
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

    const runApproach = (allowRaceWeekSupportMode || adaptiveSupportMode)
      ? 'sustainable'
      : (goalType === 'complete' ? 'sustainable' : 'performance_build');

    /**
     * ⛔ THE ATHLETE'S NUMBER IS THE MAX, NOT THE MIN (2026-08-06). Michael, on the preview:
     * *"asking for 4 runs its giving 5."*
     *
     * This line read `${n}-${n+1}` — it turned the answer into a band that OPENS at what they asked
     * for, and `getRunningDaysForWeek` (`base-generator.ts:669`) uses the band's MAX on every build
     * week and its MIN only on cutbacks and the taper. So four came back as five runs a week for
     * the whole block, five came back as six, and nothing said so.
     *
     * The band still exists and still earns its keep — a cutback week SHOULD drop a day — but it is
     * anchored the other way now: `${n-1}-${n}`. Build weeks get exactly the number they picked;
     * recovery weeks get one fewer.
     *
     * ⛔ TWO MORE BUGS FELL OUT OF THE SAME LINE, both live and both silent 400s:
     *   • **7 days built `'7-8'`**, which is not one of the four legal strings — `validateRequest`
     *     rejected the whole request.
     *   • **6 days built `'6-7'` on a completion plan**, and `sustainable` does not support `'6-7'`
     *     (`APPROACH_CONSTRAINTS`) — rejected too. Picking the top option on the most common race
     *     goal in the app could not build a plan.
     * Anchoring at the max fixes both by construction: the four numbers now map onto the four legal
     * strings instead of walking off the end of them.
     *
     * ⚠️ AND WHERE THE APPROACH CANNOT TAKE IT, THE OVERRIDE IS STATED, NOT SILENT. A time goal runs
     * `performance_build`, which needs five (two quality sessions plus the long run plus easy days)
     * and does not support `'3-4'`. That athlete still gets five — but the advisory says so, because
     * a request quietly answered with a different number is the failure this file keeps producing.
     */
    const runDays = resolveRunDaysPerWeek(
      resolvedGoal?.training_prefs?.days_per_week,
      APPROACH_CONSTRAINTS[runApproach]?.supported_days ?? ['4-5'],
    );
    if (runDays.advisory) advisories.push(runDays.advisory);

    const generateBody: Record<string, any> = {
      user_id,
      distance: distanceApi,
      fitness,
      goal: goalType,
      duration_weeks: durationWeeks,
      approach: runApproach,
      days_per_week: runDays.range,
      race_date: resolvedGoal?.target_date,
      race_name: resolvedGoal?.name,
      // ⛔ THE PINNED DAYS, AND UNTIL NOW THEY STOPPED HERE. The intake asks which day the long run
      // is and which night the club meets, `buildPreferredDays` writes both to
      // `training_prefs.preferred_days`, and the run generator hardcoded Sunday/Tuesday/Thursday
      // with no input that could change it (`assign-days.ts` has the full account). Collected,
      // stored, never read — and the screen promised *"the plan puts its hard running there."*
      ...(resolvedGoal?.training_prefs?.preferred_days
        ? { preferred_days: resolvedGoal.training_prefs.preferred_days }
        : {}),
      // ⛔ THE ATHLETE'S TYPED WEEK BEATS THE SNAPSHOT, AND UNTIL NOW IT WAS NOT READ AT ALL.
      //
      // This line was `current_weekly_miles: weeklyMiles` — snapshot-derived only
      // (`planning-context.ts:366`). So the marathon intake could collect a weekly mileage and it
      // went nowhere: the one input that sets week one's volume was discarded on the event path,
      // and a brand-new athlete (no snapshots at all) had week one chosen by their level tick.
      //
      // ⚠️ PRECEDENCE, STATED: the typed number wins because it is the ANSWER TO A QUESTION WE
      // ASKED, and the snapshot is an inference. The snapshot stays as the fallback for every
      // caller that does not ask — the existing race form does not, so it is unchanged.
      // The engine still clamps whatever arrives (`resolveEffectiveStartVolume`), and the intake
      // now refuses to send a number that clamp would silently overwrite.
      //
      // ⚠️ MILES. `assemblePayload` canonicalises from the athlete's display unit before it leaves
      // the client (`NonRaceBuilder.tsx` `payloadNow`), so no conversion belongs here.
      //
      // ⛔ AND A TIER PREFILL IS NOT AN ANSWER (2026-08-06). Tapping a level on the intake DROPS
      // `TIER_SEEDS[level].weeklyMi` into the field — 20/30/40 — so `target_weekly_miles` always
      // arrives populated whether or not the athlete touched it. The rule above then handed the
      // engine the LEVEL BUTTON's number and discarded everything ingested from their training.
      // An athlete already running 35 who taps "first marathon" opened their block at 20.
      //
      // ⚠️ THE TEST IS EQUALITY WITH THE SEED, and it is an inference, not a flag: the client sends
      // no provenance. It is wrong only for an athlete whose real answer is EXACTLY the seed, and
      // for them the two numbers are claims about the same thing anyway.
      //
      // ⚠️ AND IT ONLY EVER MOVES THE NUMBER UP. `weeklyMiles` is not measured mileage — it is
      // `workload_by_discipline.run / 10` (`planning-context.ts:366`), a load-unit proxy that
      // UNDER-reports easy running by roughly a third. Higher than the seed therefore means "they
      // are certainly running more than the level assumes" and is worth acting on; lower cannot tell
      // "runs less" from "the proxy is lossy", so the athlete's own number stands.
      current_weekly_miles: (() => {
        const typed = Number((resolvedGoal?.training_prefs as Record<string, unknown> | undefined)?.target_weekly_miles);
        const seed = TIER_SEEDS[fitness as IntakeTier]?.weeklyMi;
        const untouchedSeed = Number.isFinite(typed) && seed != null && typed === seed;
        if (untouchedSeed && weeklyMiles != null && weeklyMiles > typed) return weeklyMiles;
        return Number.isFinite(typed) && typed > 0 ? typed : weeklyMiles;
      })(),
      // ⛔ THE TYPED LONGEST RUN, AND IT WAS THE SAME BUG ONE FIELD OVER. The intake asks "longest
      // run in the last month", `assemblePayload` writes it to `training_prefs.recent_long_run_miles`
      // — and this line read only the snapshot-derived value, so the answer was collected, stored
      // and never read. It is load-bearing now: it is the rung the long-run arc enters the table at
      // (`buildLongRunArc`), and the intake quotes the peak that arc reaches BEFORE the athlete
      // commits. Dropping it here would make that quote describe a plan we did not build.
      //
      // Same precedence as the week above, for the same reason.
      //
      // ⚠️ `weeks_since_peak_long_run` BELOW STILL DESCRIBES THE SNAPSHOT'S peak, not a typed one —
      // there is no "when" to go with the typed number. Only the peak-pivot branch in
      // `sustainable.getLongRunMiles` reads the pair, and only for a peaked athlete on a ≤10-week
      // plan. Left as is rather than invented; noted so the mismatch is not read as a fact.
      ...((() => {
        const typed = Number((resolvedGoal?.training_prefs as Record<string, unknown> | undefined)?.recent_long_run_miles);
        const seed = TIER_SEEDS[fitness as IntakeTier]?.longRunMi;
        const untouchedSeed = Number.isFinite(typed) && seed != null && typed === seed;
        const resolved = (untouchedSeed && recent_long_run_miles != null && recent_long_run_miles > typed)
          ? recent_long_run_miles
          : (Number.isFinite(typed) && typed > 0 ? typed : recent_long_run_miles);
        return resolved != null ? { recent_long_run_miles: resolved } : {};
      })()),
      ...(weeks_since_peak_long_run != null ? { weeks_since_peak_long_run } : {}),
      ...(current_acwr != null ? { current_acwr } : {}),
      ...(volume_trend ? { volume_trend } : {}),
      transition_mode: trainingTransition.mode,
      ...(plan_start_date ? { start_date: plan_start_date } : {}),
      // ⛔ THE GENERATOR'S OWN NO-PERSIST MODE (`generate-run-plan/index.ts:404`) — it composes the
      // plan and returns it with `plan_id: null`, inserting no `plans` row and writing no baseline.
      // Without this the guarded goal insert above would just move the damage: no goal row, but a
      // real plan still built and persisted. Same flag the (b)-run branch passes at `:2721`.
      ...(bodyPreview ? { preview: true } : {}),
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

    // ⛔ RETURN BEFORE ANYTHING PERSISTS OR MUTATES. Everything below this point writes: the plan is
    // linked to a goal, activated, and — the destructive one — `retireCompetingActivePlans` ENDS the
    // athlete's current plan. A preview that reached it would swap someone's training for a plan
    // they were only looking at.
    //
    // ⚠️ IT ALSO HAS TO SIT ABOVE THE `plan_id` CHECK, not below it. In preview mode the generator
    // deliberately returns `plan_id: null` (`generate-run-plan:406`), so the guard three lines down
    // would throw `plan_generation_failed` on a preview that worked perfectly.
    //
    // Response shape mirrors the (b)-run preview at `:2774` so the client reads one contract:
    // `goal_id` is null here because no row was created, and that is the point.
    if (bodyPreview) {
      return new Response(JSON.stringify({
        success: true, mode, goal_id: null, preview: true,
        sport: 'run', combined: false,
        run_preview: generated?.preview ?? null, plan: generated?.plan ?? null,
        // ⛔ THE COST, TRAVELLING WITH THE PLAN IT DESCRIBES. The timeline notice is the demoted
        // refusal (2026-08-06): it used to be an `AppError` the client rendered as a dead end, and
        // it is now a line beside the week the athlete is about to accept. Preview is where it
        // belongs — after this point they have committed, and a cost stated after the decision is
        // not a cost, it is an excuse.
        ...(advisories.length ? { advisories } : {}),
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
        // Carried on the committed build too, so a caller that skipped the preview (the old race
        // form, the wizard) still receives the sentence rather than only the athlete who previewed.
        ...(advisories.length ? { advisories } : {}),
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
