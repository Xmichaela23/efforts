/**
 * Persistence utilities for Arc Setup — goal insertion, identity upsert, and
 * goal-normalization helpers. Extracted from ArcSetupChat so they can be shared
 * by both the legacy chat flow (if ever needed) and the new wizard.
 */
import { supabase, getStoredUserId, invokeFunction } from '@/lib/supabase';
import {
  parsePlanStartDate,
  type ArcSetupPayload,
} from '@/lib/parse-arc-setup';
import type { GoalInsert } from '@/hooks/useGoals';
import { fetchArcContext } from '@/lib/fetch-arc-context';
import { enrichGoalInsertWithArcContext } from '@/lib/enrichArcGoalTrainingPrefs';
import { inferEventSportForTri } from '@/lib/tri-goal-helpers';
import { fixTransposedEasyBikeRunAgainstSwimOrder } from '@/lib/tri-preferred-days-sanity';
import { normalizeTrainingIntent, trainingIntentToPrefsGoalType, type TrainingIntent } from '@/lib/training-intent';
import { findOrphanActivePlanConflictId, type PlanRowLite } from '@/lib/plan-goal-conflict';

// ─── Types ──────────────────────────────────────────────────────────────────

export type InsertedGoalRow = {
  id: string;
  priority: string;
  target_date: string | null;
  sport: string | null;
  name: string | null;
  distance: string | null;
  training_prefs: Record<string, unknown> | null;
  notes: string | null;
};

export type PersistResult = {
  ok: boolean;
  error?: string;
  insertedGoals?: InsertedGoalRow[];
};

export type CompleteContext = {
  primaryId: string;
  combine: boolean;
  replacePlanId: string | null;
  planStart: string | null;
  primaryGoalData: {
    name: string | null;
    target_date: string | null;
    sport: string | null;
    distance: string | null;
    training_prefs: Record<string, unknown> | null;
    notes: string | null;
  } | null;
};

// ─── Small pure helpers ──────────────────────────────────────────────────────

function isValidGoalType(t: unknown): t is GoalInsert['goal_type'] {
  return t === 'event' || t === 'capacity' || t === 'maintenance';
}

function mapStrengthFocusToProtocol(focus: string | undefined): string {
  const f = (focus || 'general').toLowerCase();
  if (f === 'power') return 'neural_speed';
  return 'durability';
}

function defaultTrainingFitness(raw: unknown): 'beginner' | 'intermediate' | 'advanced' {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'beginner' || s === 'intermediate' || s === 'advanced') return s;
  return 'intermediate';
}

function defaultTrainingGoalType(raw: unknown): 'complete' | 'speed' {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'speed' || s === 'performance') return 'speed';
  return 'complete';
}

function inferIntentFromLegacyPrefs(tp: Record<string, unknown>, g: Record<string, unknown>): TrainingIntent {
  if (defaultTrainingGoalType(tp.goal_type ?? g.goal_type) === 'speed') return 'performance';
  return 'completion';
}

function coalesceStrengthFrequency(
  g: Record<string, unknown>,
  parent?: { strength_frequency?: 0 | 1 | 2 | 3 },
  trainingPrefs?: Record<string, unknown>,
): 0 | 1 | 2 | 3 | undefined {
  const raw = g.strength_frequency ?? parent?.strength_frequency ?? trainingPrefs?.strength_frequency;
  if (typeof raw === 'number' && [0, 1, 2, 3].includes(raw)) return raw as 0 | 1 | 2 | 3;
  if (typeof raw === 'string' && ['0', '1', '2', '3'].includes(raw)) return Number(raw) as 0 | 1 | 2 | 3;
  return undefined;
}

export function payloadHasDatedEventGoal(payload: ArcSetupPayload | null | undefined): boolean {
  if (!payload?.goals || !Array.isArray(payload.goals)) return false;
  return payload.goals.some((g) => {
    if (typeof g !== 'object' || g === null) return false;
    const o = g as Record<string, unknown>;
    if (o.goal_type !== 'event') return false;
    return typeof o.target_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(o.target_date);
  });
}

/** Deep-merge `season_priorities` so partial Arc updates do not wipe other disciplines. */
export function mergeAthleteIdentityPatches(
  prev: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prev, ...patch };
  const pSp = prev.season_priorities;
  const nSp = patch.season_priorities;
  if (nSp != null && typeof nSp === 'object' && !Array.isArray(nSp)) {
    out.season_priorities =
      pSp != null && typeof pSp === 'object' && !Array.isArray(pSp)
        ? { ...(pSp as Record<string, unknown>), ...(nSp as Record<string, unknown>) }
        : { ...(nSp as Record<string, unknown>) };
  }
  return out;
}

function normalizeGoalInput(
  g: Record<string, unknown>,
  parent?: { strength_frequency?: 0 | 1 | 2 | 3; strength_focus?: string; default_intent?: string },
): GoalInsert | null {
  const name = typeof g.name === 'string' && g.name.trim() ? g.name.trim() : null;
  if (!name) return null;
  const goal_type = g.goal_type;
  if (!isValidGoalType(goal_type)) return null;
  const target_date =
    typeof g.target_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(g.target_date)
      ? g.target_date.slice(0, 10)
      : null;
  const target_time =
    typeof g.target_time === 'number' && Number.isFinite(g.target_time) && g.target_time > 0
      ? Math.round(g.target_time)
      : null;
  let sport: string | null = typeof g.sport === 'string' ? g.sport : null;
  const distance: string | null = typeof g.distance === 'string' ? g.distance : null;
  if (goal_type === 'event') {
    sport = inferEventSportForTri(String(goal_type), sport, distance, name) ?? sport;
  }

  return {
    name,
    goal_type,
    target_date,
    target_time,
    sport,
    distance,
    course_profile:
      typeof g.course_profile === 'object' && g.course_profile !== null
        ? (g.course_profile as Record<string, unknown>)
        : {},
    target_metric: typeof g.target_metric === 'string' ? g.target_metric : null,
    target_value:
      typeof g.target_value === 'number' && Number.isFinite(g.target_value) ? g.target_value : null,
    current_value:
      typeof g.current_value === 'number' && Number.isFinite(g.current_value) ? g.current_value : null,
    priority: g.priority === 'B' || g.priority === 'C' ? g.priority : 'A',
    status: 'active',
    training_prefs: (() => {
      const tp =
        typeof g.training_prefs === 'object' && g.training_prefs !== null
          ? { ...(g.training_prefs as Record<string, unknown>) }
          : {};
      const sportLowerForPd = (sport || '').toLowerCase();
      if (goal_type === 'event' && (sportLowerForPd === 'triathlon' || sportLowerForPd === 'tri')) {
        const pdR = tp.preferred_days ?? tp.preferredDays;
        if (pdR && typeof pdR === 'object' && !Array.isArray(pdR)) {
          tp.preferred_days = fixTransposedEasyBikeRunAgainstSwimOrder(pdR as Record<string, unknown>);
          delete tp.preferredDays;
        }
      }
      const freq = coalesceStrengthFrequency(g, parent, tp);
      const focusRaw =
        typeof g.strength_focus === 'string'
          ? g.strength_focus
          : parent?.strength_focus ??
            (typeof tp.strength_focus === 'string' ? tp.strength_focus : undefined);
      if (freq !== undefined) {
        if (freq === 0) {
          tp.strength_protocol = 'none';
          tp.strength_frequency = 0;
        } else {
          tp.strength_frequency = freq;
          tp.strength_protocol = mapStrengthFocusToProtocol(
            typeof focusRaw === 'string' ? focusRaw : 'general',
          );
        }
      }
      const sportLower = (sport || '').toLowerCase();
      const needsBuildPrefs =
        goal_type === 'event' &&
        (sportLower === 'run' || sportLower === 'triathlon' || sportLower === 'tri');
      if (needsBuildPrefs) {
        tp.fitness = defaultTrainingFitness(tp.fitness);
        const intent = normalizeTrainingIntent(
          g.training_intent ?? parent?.default_intent,
          inferIntentFromLegacyPrefs(tp, g),
        );
        (tp as Record<string, unknown>).training_intent = intent;
        tp.goal_type = trainingIntentToPrefsGoalType(intent);
      }
      return tp;
    })(),
    notes: typeof g.notes === 'string' ? g.notes : null,
  };
}

export function collectValidGoals(payload: ArcSetupPayload): GoalInsert[] {
  const out: GoalInsert[] = [];
  const parent = {
    strength_frequency: payload.strength_frequency,
    strength_focus: payload.strength_focus,
    default_intent: payload.default_intent,
  };
  for (const g of Array.isArray(payload.goals) ? payload.goals : []) {
    if (typeof g !== 'object' || g === null) continue;
    const row = normalizeGoalInput(g as Record<string, unknown>, parent);
    if (row) out.push(row);
  }
  return out;
}

export function pickPrimaryEventGoalId(
  goals: { id: string; priority: string; target_date: string | null }[],
): string | null {
  if (goals.length === 0) return null;
  const sorted = [...goals].sort((a, b) => {
    const pr = (p: string) => (p === 'A' ? 0 : p === 'B' ? 1 : p === 'C' ? 2 : 3);
    const c = pr(String(a.priority)) - pr(String(b.priority));
    if (c !== 0) return c;
    const da = a.target_date ? new Date(a.target_date + 'T12:00:00').getTime() : 0;
    const db = b.target_date ? new Date(b.target_date + 'T12:00:00').getTime() : 0;
    if (da !== db) return da - db;
    return a.id.localeCompare(b.id);
  });
  return sorted[0]?.id ?? null;
}

export async function parseArcInvokeError(
  error: unknown,
  data: unknown,
  fallback: string,
): Promise<{ message: string; code?: string }> {
  if (data && typeof data === 'object') {
    const msg = (data as { error?: string }).error;
    const code = (data as { error_code?: string }).error_code;
    if (typeof msg === 'string' && msg.trim()) return { message: msg, code };
  }
  try {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } })?.context;
    if (ctx?.json) {
      const payload = (await ctx.json()) as { error?: string; error_code?: string };
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return { message: payload.error, code: payload.error_code };
      }
    }
  } catch {
    /* ignore */
  }
  const msg =
    error && typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: string }).message)
      : '';
  return { message: msg || fallback };
}

// ─── Core persist function ───────────────────────────────────────────────────

export async function persistArcSetup(payload: ArcSetupPayload): Promise<PersistResult> {
  const userId = getStoredUserId();
  if (!userId) return { ok: false, error: 'Not signed in' };

  const arcCtx = await fetchArcContext();
  const validGoals = collectValidGoals(payload).map((g) => enrichGoalInsertWithArcContext(g, arcCtx));
  const idPatch =
    payload.athlete_identity &&
    typeof payload.athlete_identity === 'object' &&
    !Array.isArray(payload.athlete_identity)
      ? (payload.athlete_identity as Record<string, unknown>)
      : null;
  const hasDefaultIntent =
    payload.default_intent != null && String(payload.default_intent).trim() !== '';
  const hadGoalSlots = Array.isArray(payload.goals) && payload.goals.length > 0;
  if (hadGoalSlots && validGoals.length === 0 && !idPatch) {
    return { ok: false, error: 'No valid goals to save.' };
  }
  if (validGoals.length === 0 && !idPatch && !hasDefaultIntent) {
    return { ok: false, error: 'Nothing to save.' };
  }

  let insertedGoalRows: InsertedGoalRow[] = [];

  try {
    if (validGoals.length > 0) {
      const rows = validGoals.map((row) => {
        const { target_time, ...rest } = row;
        const base: Record<string, unknown> = { user_id: userId, ...rest };
        if (target_time != null && Number.isFinite(target_time) && target_time > 0) {
          base.target_time = Math.round(target_time);
        }
        return base;
      });
      const { data, error } = await supabase
        .from('goals')
        .insert(rows)
        .select('id, priority, target_date, sport, name, distance, training_prefs, notes');
      if (error) {
        return { ok: false, error: error.message };
      }
      insertedGoalRows = ((data || []) as InsertedGoalRow[]).filter(
        (r) => typeof r.id === 'string' && r.id,
      );
      const newGoalIds = insertedGoalRows.map((r) => r.id);
      if (newGoalIds.length > 0) {
        const { error: reErr } = await supabase.functions.invoke('refresh-goal-race-projections', {
          body: { goal_ids: newGoalIds },
        });
        if (reErr) console.warn('[arc-setup] refresh-goal-race-projections', reErr.message);
      }
    }

    if (idPatch || hasDefaultIntent) {
      const { data: ub, error: fe } = await supabase
        .from('user_baselines')
        .select('id, athlete_identity')
        .eq('user_id', userId)
        .maybeSingle();
      if (fe) return { ok: false, error: fe.message };

      const prev = (ub?.athlete_identity as Record<string, unknown>) || {};
      const merged = mergeAthleteIdentityPatches(prev, (idPatch || {}) as Record<string, unknown>);
      merged.confirmed_by_user = true;
      merged.arc_setup_confirmed_at = new Date().toISOString();
      if (hasDefaultIntent) {
        merged.default_intent = normalizeTrainingIntent(payload.default_intent, 'completion');
      }
      if (ub?.id) {
        const { error: ue } = await supabase
          .from('user_baselines')
          .update({ athlete_identity: merged, updated_at: new Date().toISOString() })
          .eq('id', ub.id);
        if (ue) return { ok: false, error: ue.message };
      } else {
        const { error: ie } = await supabase.from('user_baselines').insert([
          {
            user_id: userId,
            age: 0,
            disciplines: [] as string[],
            discipline_fitness: {},
            benchmarks: {},
            performance_numbers: {},
            equipment: {},
            injury_regions: [] as string[],
            training_background: '',
            athlete_identity: merged,
          } as Record<string, unknown>,
        ]);
        if (ie) return { ok: false, error: ie.message };
      }
    }

    try {
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
      window.dispatchEvent(new CustomEvent('goals:invalidate'));
    } catch {}
    return { ok: true, insertedGoals: insertedGoalRows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error: msg };
  }
}

// ─── Build CompleteContext after a successful persist ────────────────────────

export async function buildCompleteContext(
  payload: ArcSetupPayload,
  insertedGoals: InsertedGoalRow[],
  userId: string,
): Promise<CompleteContext | { error: string }> {
  let eventGoals = insertedGoals;

  if (eventGoals.length === 0) {
    const { data: evRows, error: evErr } = await supabase
      .from('goals')
      .select('id, priority, target_date, sport, name, distance, training_prefs, notes')
      .eq('user_id', userId)
      .eq('goal_type', 'event')
      .eq('status', 'active');
    if (evErr) return { error: evErr.message };
    eventGoals = (evRows || []) as InsertedGoalRow[];
  }

  const primaryId = pickPrimaryEventGoalId(eventGoals);
  if (!primaryId) return { error: 'No primary goal found.' };

  const primaryGoalRow = eventGoals.find((g) => g.id === primaryId) ?? null;
  const primarySport = primaryGoalRow?.sport ?? null;
  const primaryGoalData = primaryGoalRow
    ? {
        name: primaryGoalRow.name ?? null,
        target_date: primaryGoalRow.target_date ?? null,
        sport: primaryGoalRow.sport ?? null,
        distance: primaryGoalRow.distance ?? null,
        training_prefs: (primaryGoalRow.training_prefs as Record<string, unknown> | null) ?? null,
        notes: primaryGoalRow.notes ?? null,
      }
    : null;

  const { data: planRows, error: planErr } = await supabase
    .from('plans')
    .select('id, goal_id, status, config, plan_type')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (planErr) return { error: planErr.message };

  const replacePlanId = findOrphanActivePlanConflictId(
    (planRows || []) as PlanRowLite[],
    primarySport,
  );
  const planStart = parsePlanStartDate(payload.plan_start_date);
  const combine = eventGoals.length >= 2;

  return {
    primaryId: String(primaryId),
    combine,
    replacePlanId,
    planStart: planStart ?? null,
    primaryGoalData,
  };
}

export { invokeFunction };
