import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { MobileHeader } from '@/components/MobileHeader';
import { supabase, getStoredUserId, invokeFunction } from '@/lib/supabase';
import {
  arcEventGoalsHaveRequiredTrainingPrefs,
  coachVisibleProseSeeksReply,
  parseArcSetupFromAssistant,
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

type ChatMessage = { role: 'assistant' | 'user'; content: string };

/**
 * Messages sent to arc-setup-chat (sliding window). Too few turns drop earlier
 * locks (group-ride intensity, swim frequency) and the model re-asks the same questions.
 */
const MAX_THREAD_MESSAGES_FOR_API = 24;

function threadForApi(thread: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const recent = thread.slice(-MAX_THREAD_MESSAGES_FOR_API);
  const mapped = recent.map((m) => ({ role: m.role, content: m.content }));
  while (mapped.length > 0 && mapped[0]?.role === 'assistant') {
    mapped.shift();
  }
  return mapped;
}

/** Heuristic: coach is asking the athlete to confirm a performance / "faster time" read (State → confirm). */
function looksLikePerformanceIntentConfirmation(visible: string): boolean {
  const t = visible.trim();
  if (!t) return false;
  const seeksConfirm = /[?？]\s*$|right\?|sound right|good\?/i.test(t) || /—\s*right\?/i.test(t);
  if (!seeksConfirm) return false;
  return (
    /chasing a faster/i.test(t) ||
    /faster time/i.test(t) ||
    /faster 70\.3/i.test(t) ||
    /performance build/i.test(t) ||
    /(going|want to go) faster/i.test(t) ||
    (/\bPR\b/i.test(t) && /right\?/i.test(t))
  );
}

const COMPLETION_INTENT_USER_MESSAGE =
  "I'd like completion intent instead: a strong, healthy finish with durability and conservative load — not chasing a faster time. Please set training intent to completion for this A-race.";

/** Coach presented an either/or — labels match arc-setup prompt + disclosure buttons. */
const STRENGTH_SUPPORT_USER_MESSAGE =
  'Strength supports tri — one or two gym sessions per week depending on phase: two in base, one in build and race-specific, with modest loads and durability-focused work so lifting backs up swim, bike, and run. Set strength_intent to "support" on my tri goal(s).';

const STRENGTH_BUILD_USER_MESSAGE =
  'Build strength — two gym sessions per week through base, build, and race-specific with real compound work and progressive loading. I want to actually get stronger, not only do gym work that props up swim, bike, and run. Set strength_intent to "performance" on my tri goal(s).';

const SWIM_FOCUS_USER_MESSAGE =
  'Swim focus — 3 sessions a week, building volume and treating swim as a real priority this block.';

const SWIM_TO_RACE_USER_MESSAGE =
  'Swim to race — 2 sessions a week, one quality and one aerobic. Keep the swim sharp without adding load to the bike and run.';

const SWIM_LOAD_PROTECT_RUN_USER_MESSAGE =
  'Protect my run — take the extra swim load from bike volume.';

const SWIM_LOAD_PROTECT_BIKE_USER_MESSAGE =
  'Protect my bike — take the extra swim load from run volume.';

const SWIM_LOAD_SPLIT_USER_MESSAGE = 'Split it evenly between bike and run.';

/** Last explicit swim-intent choice in the thread (button text or same opening line). */
function priorThreadSwimIntentResolution(prior: ChatMessage[]): 'focus' | 'race' | null {
  let resolved: 'focus' | 'race' | null = null;
  for (const m of prior) {
    if (m.role !== 'user') continue;
    const c = m.content.trim();
    if (/^Swim focus —/i.test(c) || c === SWIM_FOCUS_USER_MESSAGE) resolved = 'focus';
    if (/^Swim to race —/i.test(c) || c === SWIM_TO_RACE_USER_MESSAGE) resolved = 'race';
  }
  return resolved;
}

function looksLikeStrengthIntentFork(visible: string): boolean {
  const t = visible.trim();
  if (!t) return false;
  if (!/strength|lift(ing)?|gym|squat|1rm|gains/i.test(t)) return false;
  const hasEitherOr =
    /—\s*or|–\s*or|-\s*or| or are you| or do you|,\s*or(?=\s)/i.test(t) ||
    /support the tri or a real|or a real co-?equal|which —\s*support|which—\s*support|or co-equal alongside/i.test(t) ||
    (/support/i.test(t) && /(co-?equal|co-equal|pushing it|powerlifting|separate)/i.test(t)) ||
    (/(twice|2×|2x|a week)/i.test(t) && /(co-?equal|or are you)/i.test(t)) ||
    (/\bstrength supports tri\b/i.test(t) && /\b(build strength|co-?equal|parallel goal|real goal)\b/i.test(t)) ||
    (/\bbuild strength\b/i.test(t) && /\b(supports tri|support tri|backs up|endurance)\b/i.test(t)) ||
    (/backs? up swim,\s*bike,\s*and run/i.test(t) && /(co-?equal|real goal|parallel)/i.test(t)) ||
    (/back(?:s|ing) up swim/i.test(t) && /\b(co-?equal|parallel goal|real goal)\b/i.test(t));
  if (!hasEitherOr) return false;
  return /[?？]/.test(t) || /season\s*\?/i.test(t);
}

/** State → confirm (good) strength-type line: build-strength vs support-tri phrasing, not day-picking. */
function looksLikeStrengthIntentStateConfirm(visible: string): boolean {
  if (looksLikePerformanceIntentConfirmation(visible)) return false;
  const t = visible.trim();
  if (!t) return false;
  if (looksLikeStrengthIntentFork(visible)) return false;
  if (!/right\?|sound right|good\?|works\?|does that work\?|[?？]\s*$/i.test(t)) return false;
  if (
    /which days|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(t) &&
    /\bfor strength\b|strength (days|on)/i.test(t)
  ) {
    return false;
  }
  return (
    /strength as a co-?equal|co-equal goal alongside|co-equal goal this season|push strength as a co-?equal|build(?:ing)? strength (?:as |for )a real|real goal.*lift/i.test(t) ||
    /strength is there to support|not a separate powerlifting|support the tri — not|support the tri, not|support the tri —|auxiliary to the tri|just maintenance\. right/i.test(t) ||
    (/^strength\b/i.test(t) && /co-?equal|support the tri|powerlifting|maintenance(?!$)/i.test(t))
  );
}

/** Swim pillar: app offers Swim focus vs Swim to race buttons — match assistant lines that pose that fork. */
function looksLikeSwimFork(visible: string): boolean {
  const t = visible.trim();
  if (!t) return false;
  if (
    looksLikeStrengthIntentFork(visible) ||
    looksLikeStrengthIntentStateConfirm(visible) ||
    looksLikePerformanceIntentConfirmation(visible)
  ) {
    return false;
  }
  const lower = t.toLowerCase();
  const swimCtx =
    /\bsw(?:im|imming)\b/i.test(t) || /\bpool\b/i.test(lower) || /\bopen water\b/i.test(lower);
  if (!swimCtx) return false;

  const namesBoth = /swim focus/i.test(t) && /swim to race/i.test(t);
  const namesOne = /swim focus|swim to race/i.test(t);
  const blockAndSwim = /\bswim this block\b/i.test(lower) || /\bthis block\b/.test(lower) && /\bsw(?:im|imming)\b/i.test(t);
  const prioritizeSwim =
    /\bprioritize\b/i.test(t) && /\bsw(?:im|imming)\b/i.test(t);
  const treatSwimPriority =
    /\btreat swim\b/i.test(lower) && /\b(priority|priorities|this block)\b/i.test(lower);

  return namesBoth || namesOne || blockAndSwim || prioritizeSwim || treatSwimPriority;
}

/**
 * Assistant is asking where extra swim (focus / third swim) load should be funded from.
 * Only meaningful after the athlete already chose Swim focus — see priorThreadSwimIntentResolution.
 */
function looksLikeSwimLoadSourceFork(visible: string): boolean {
  const t = visible.trim();
  if (!t) return false;
  if (
    looksLikeStrengthIntentFork(visible) ||
    looksLikeStrengthIntentStateConfirm(visible) ||
    looksLikePerformanceIntentConfirmation(visible) ||
    looksLikeSwimFork(visible)
  ) {
    return false;
  }
  const lower = t.toLowerCase();
  if (/\bstrength\b/i.test(t)) return false;
  if (/recovery week|rest day/i.test(lower)) return false;

  const hasCue =
    /protect your run/i.test(lower) ||
    /protect your bike/i.test(lower) ||
    /where should the extra swim load come from/i.test(lower) ||
    /where do you want to protect/i.test(lower) ||
    /who pays for the third swim/i.test(lower) ||
    /\btrim from bike\b/i.test(lower) ||
    /\btrim from run\b/i.test(lower) ||
    /trim run slightly/i.test(lower) ||
    /trim bike/i.test(lower) ||
    /keep your bike volume/i.test(lower) ||
    /keep run and trim bike/i.test(lower) ||
    /split it evenly/i.test(lower) ||
    (/third swim/i.test(lower) &&
      /(protect|trim|pull from|where|split|evenly|extra swim|load from)/i.test(lower));

  return hasCue;
}

type AssistantMessageDisclosure = 'strength_fork' | 'training_intent' | 'swim_fork' | 'swim_load_source';

function assistantMessageDisclosure(visible: string, priorMessages: ChatMessage[]): AssistantMessageDisclosure | null {
  if (looksLikeStrengthIntentFork(visible) || looksLikeStrengthIntentStateConfirm(visible)) return 'strength_fork';
  if (looksLikePerformanceIntentConfirmation(visible)) return 'training_intent';
  if (priorThreadSwimIntentResolution(priorMessages) === 'focus' && looksLikeSwimLoadSourceFork(visible)) {
    return 'swim_load_source';
  }
  if (looksLikeSwimFork(visible)) return 'swim_fork';
  return null;
}

function isValidGoalType(t: unknown): t is GoalInsert['goal_type'] {
  return t === 'event' || t === 'capacity' || t === 'maintenance';
}

function mapStrengthFocusToProtocol(focus: string | undefined): string {
  const f = (focus || 'general').toLowerCase();
  if (f === 'power') return 'neural_speed';
  return 'durability';
}

/** Matches `create-goal-and-materialize-plan` / manual Add Goal: beginner | intermediate | advanced */
function defaultTrainingFitness(raw: unknown): 'beginner' | 'intermediate' | 'advanced' {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'beginner' || s === 'intermediate' || s === 'advanced') return s;
  return 'intermediate';
}

/** Legacy training_prefs.goal_type before training_intent (complete vs speed; not the DB column `goals.goal_type` = event) */
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
  if (typeof raw === 'number' && [0, 1, 2, 3].includes(raw)) return raw;
  if (typeof raw === 'string' && ['0', '1', '2', '3'].includes(raw)) return Number(raw) as 0 | 1 | 2 | 3;
  return undefined;
}

function normalizeGoalInput(
  g: Record<string, unknown>,
  parent?: {
    strength_frequency?: 0 | 1 | 2 | 3;
    strength_focus?: string;
    default_intent?: string;
  },
): GoalInsert | null {
  const name = typeof g.name === 'string' && g.name.trim() ? g.name.trim() : null;
  if (!name) return null;
  const goal_type = g.goal_type;
  if (!isValidGoalType(goal_type)) return null;
  const target_date =
    typeof g.target_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(g.target_date) ? g.target_date.slice(0, 10) : null;
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
    course_profile: typeof g.course_profile === 'object' && g.course_profile !== null ? (g.course_profile as Record<string, unknown>) : {},
    target_metric: typeof g.target_metric === 'string' ? g.target_metric : null,
    target_value: typeof g.target_value === 'number' && Number.isFinite(g.target_value) ? g.target_value : null,
    current_value: typeof g.current_value === 'number' && Number.isFinite(g.current_value) ? g.current_value : null,
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
      // Auto-build requires `training_prefs.fitness` + `training_prefs.goal_type` for run/tri events.
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

function collectValidGoals(payload: ArcSetupPayload): GoalInsert[] {
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

/** Deep-merge `season_priorities` so partial Arc updates do not wipe other disciplines. */
function mergeAthleteIdentityPatches(
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

/** Raw arc_setup goals: at least one event with a YYYY-MM-DD (before normalize drops invalid rows). */
function payloadHasDatedEventGoal(payload: ArcSetupPayload | null | undefined): boolean {
  if (!payload?.goals || !Array.isArray(payload.goals)) return false;
  return payload.goals.some((g) => {
    if (typeof g !== 'object' || g === null) return false;
    const o = g as Record<string, unknown>;
    if (o.goal_type !== 'event') return false;
    return typeof o.target_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(o.target_date);
  });
}

function pickPrimaryEventGoalId(goals: { id: string; priority: string; target_date: string | null }[]): string | null {
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

async function parseArcInvokeError(
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

async function persistArcSetup(
  payload: ArcSetupPayload,
): Promise<{ ok: boolean; error?: string }> {
  const userId = getStoredUserId();
  if (!userId) return { ok: false, error: 'Not signed in' };

  const arcCtx = await fetchArcContext();
  const validGoals = collectValidGoals(payload).map((g) => enrichGoalInsertWithArcContext(g, arcCtx));
  const idPatch = (payload.athlete_identity && typeof payload.athlete_identity === 'object' && !Array.isArray(payload.athlete_identity))
    ? (payload.athlete_identity as Record<string, unknown>)
    : null;
  const hasDefaultIntent =
    payload.default_intent != null && String(payload.default_intent).trim() !== '';
  const hadGoalSlots = Array.isArray(payload.goals) && payload.goals.length > 0;
  if (hadGoalSlots && validGoals.length === 0 && !idPatch) {
    return { ok: false, error: 'No valid goals in the draft. Ask the coach to resend a proper <arc_setup> block.' };
  }
  if (validGoals.length === 0 && !idPatch && !hasDefaultIntent) {
    return { ok: false, error: 'Nothing to save.' };
  }

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
      const { data, error } = await supabase.from('goals').insert(rows).select();
      if (error) {
        console.error('GOALS INSERT FAILED:', error.message, (error as { details?: string }).details, (error as { hint?: string }).hint);
        console.error('[arc-setup] goal insert', error);
        return { ok: false, error: error.message };
      }
      const newGoalIds = (data || []).map((r: { id: string }) => r.id).filter(Boolean);
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
      if (fe) {
        return { ok: false, error: fe.message };
      }
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
        if (ue) {
          return { ok: false, error: ue.message };
        }
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
        if (ie) {
          return { ok: false, error: ie.message };
        }
      }
    }

    try {
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
      window.dispatchEvent(new CustomEvent('goals:invalidate'));
    } catch {}
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error: msg };
  }
}

type ArcSetupChatProps = {
  focusDate?: string;
  /** If set (e.g. home nudge), sent as the first user message once when the thread is empty */
  seedUserMessage?: string;
  /** @deprecated server builds prompt; kept for compatibility */
  onSystemPromptSupplement?: (s: string, arc: unknown) => void;
};

/**
 * Season arc setup: chat with Claude via `arc-setup-chat` (server uses web search for race research when needed).
 * No extra loading state — searches add latency only.
 * Optional `<arc_setup>` confirmation card.
 */
export default function ArcSetupChat({ focusDate, seedUserMessage }: ArcSetupChatProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [pendingSetup, setPendingSetup] = useState<{
    payload: ArcSetupPayload;
    summaryLine: string;
    goalPreviews: string[];
  } | null>(null);
  /** Which assistant message (index) shows the training-intent ⓘ explainer. */
  const [intentInfoOpenIdx, setIntentInfoOpenIdx] = useState<number | null>(null);
  /** Latest `<arc_setup>` payload from the model (sticky until replaced) — echoed to server to reduce re-asks / drift */
  const lastDraftArcSetupRef = useRef<ArcSetupPayload | null>(null);
  const arcNudgeSeedAppliedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    try {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingSetup, scrollToBottom]);

  const sendUserMessage = async (rawText: string) => {
    const t = rawText.trim();
    if (!t || sending) return;
    const userId = getStoredUserId();
    if (!userId) {
      setError('Sign in to continue');
      return;
    }
    setError(null);
    setIntentInfoOpenIdx(null);
    setSending(true);
    const nextThread = [...messages, { role: 'user' as const, content: t }];
    setMessages(nextThread);

    const api = threadForApi(nextThread);
    const today = focusDate && /^\d{4}-\d{2}-\d{2}/.test(focusDate) ? focusDate.slice(0, 10) : new Date().toISOString().slice(0, 10);

    try {
      const draftEcho = lastDraftArcSetupRef.current;
      const { data, error: fnErr } = await supabase.functions.invoke('arc-setup-chat', {
        body: {
          user_id: userId,
          messages: api,
          focus_date: today,
          ...(draftEcho ? { draft_arc_setup: draftEcho } : {}),
        },
      });
      if (fnErr) {
        // Try to read the actual error body the function sent (e.g. stop_reason from Anthropic).
        // The Supabase SDK sets fnErr.context = the raw Response object; body not yet consumed.
        try {
          const errBody = await (fnErr as { context?: Response }).context?.json();
          setError((errBody as { error?: string } | null)?.error || fnErr.message || 'Request failed');
        } catch {
          setError(fnErr.message || 'Request failed');
        }
        return;
      }
      const dataErr = (data as { error?: string } | null)?.error;
      if (dataErr) {
        setError(dataErr);
        return;
      }
      const text = (data as { text?: string } | null)?.text;
      if (typeof text !== 'string' || !text.trim()) {
        setError('No response from coach');
        return;
      }
      const { displayText, payload } = parseArcSetupFromAssistant(text);
      if (payload) {
        lastDraftArcSetupRef.current = payload;
      }
      const show = displayText || (payload ? 'Here’s a draft we can save—check the card below.' : '');
      setMessages((prev) => [...prev, { role: 'assistant', content: show }]);
      setSaveBanner(null);
      const validGoals = payload ? collectValidGoals(payload) : [];
      const hasId =
        payload?.athlete_identity &&
        typeof payload.athlete_identity === 'object' &&
        !Array.isArray(payload.athlete_identity) &&
        Object.keys(payload.athlete_identity as object).length > 0;
      const userTurnCount = nextThread.filter((m) => m.role === 'user').length;
      const stillAsking = coachVisibleProseSeeksReply(displayText);
      const canShowConfirmCard =
        payload != null &&
        userTurnCount >= 3 &&
        !stillAsking &&
        arcEventGoalsHaveRequiredTrainingPrefs(payload) &&
        (payloadHasDatedEventGoal(payload) || hasId);
      if (canShowConfirmCard) {
        const goalPreviews = validGoals.map(
          (g) => [g.name, g.goal_type, g.target_date || ''].filter(Boolean).join(' · ')
        );
        setPendingSetup({
          payload,
          goalPreviews,
          summaryLine:
            typeof payload.summary === 'string' && payload.summary.trim()
              ? payload.summary.trim()
              : 'Review and confirm to save to your account.',
        });
      } else {
        setPendingSetup(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    await sendUserMessage(t);
  };

  useEffect(() => {
    const s = seedUserMessage?.trim();
    if (!s) return;
    if (arcNudgeSeedAppliedRef.current) return;
    if (messages.length > 0) return;
    arcNudgeSeedAppliedRef.current = true;
    void sendUserMessage(s);
    // sendUserMessage intentionally omitted: stable enough for one-shot seed; avoids effect churn
  }, [seedUserMessage, messages.length]);

  const onConfirm = async () => {
    if (!pendingSetup) return;
    const confirmPayload = pendingSetup.payload;
    setSending(true);
    setError(null);
    setSaveBanner(null);
    const { ok, error: pe } = await persistArcSetup(confirmPayload);
    if (!ok) {
      setSending(false);
      setError(pe || 'Save failed');
      return;
    }
    setPendingSetup(null);

    const userId = getStoredUserId();
    if (!userId) {
      setSending(false);
      navigate('/goals', { replace: true, state: { fromArcSetup: true } });
      return;
    }

    const { data: evRows, error: evErr } = await supabase
      .from('goals')
      .select('id, priority, target_date, sport')
      .eq('user_id', userId)
      .eq('goal_type', 'event')
      .eq('status', 'active');

    if (evErr) {
      setSending(false);
      setError(evErr.message);
      navigate('/goals', { replace: true, state: { fromArcSetup: true } });
      return;
    }

    const eventGoals = (evRows || []) as {
      id: string;
      priority: string;
      target_date: string | null;
      sport: string | null;
    }[];
    const primaryId = pickPrimaryEventGoalId(eventGoals);

    if (!primaryId) {
      setSending(false);
      navigate('/goals', { replace: true, state: { fromArcSetup: true } });
      return;
    }

    const primarySport = eventGoals.find((g) => g.id === primaryId)?.sport ?? null;
    const { data: planRows, error: planErr } = await supabase
      .from('plans')
      .select('id, goal_id, status, config, plan_type')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (planErr) {
      setSending(false);
      setError(planErr.message);
      navigate('/goals', { replace: true, state: { fromArcSetup: true } });
      return;
    }

    const replacePlanId = findOrphanActivePlanConflictId((planRows || []) as PlanRowLite[], primarySport);

    const planStart = parsePlanStartDate(confirmPayload.plan_start_date);

    setSaveBanner('Building your training calendar…');
    const combine = eventGoals.length >= 2;
    const { data, error: fnErr } = await invokeFunction('create-goal-and-materialize-plan', {
      user_id: userId,
      mode: 'build_existing',
      existing_goal_id: String(primaryId),
      combine,
      replace_plan_id: replacePlanId,
      ...(planStart ? { plan_start_date: planStart } : {}),
    });

    setSending(false);
    setSaveBanner(null);

    if (fnErr || !data || (data as { success?: boolean }).success !== true) {
      const parsed = await parseArcInvokeError(fnErr, data, 'Unable to build training plan');
      if (parsed.code === 'missing_pace_benchmark') {
        navigate('/goals', { replace: true, state: { fromArcSetup: true, needPaceCalibration: true } });
        return;
      }
      setError(parsed.message);
      return;
    }

    const planId = (data as { plan_id?: string | null }).plan_id ?? null;

    try {
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
      window.dispatchEvent(new CustomEvent('goals:invalidate'));
      window.dispatchEvent(new CustomEvent('plans:refresh'));
    } catch {
      void 0;
    }

    navigate('/goals', {
      replace: true,
      state: {
        fromArcSetup: true,
        seasonPlanJustBuilt: true,
        builtPlanId: planId,
      },
    });
  };

  const onClarify = () => {
    setPendingSetup(null);
  };

  const showIntroBanner = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full min-w-0 max-w-lg mx-auto overflow-x-hidden">
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 scroll-pb-36 pb-40 pt-2
          pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
      >
        {showIntroBanner && (
          <div
            className="rounded-2xl border border-teal-500/25 bg-gradient-to-b from-teal-950/55 via-zinc-950/50 to-zinc-950/90 px-4 py-5 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
            role="region"
            aria-label="Season setup"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-teal-400/90 mb-2">
              Season setup
            </p>
            <h2 className="text-[1.35rem] sm:text-2xl font-semibold text-white leading-snug tracking-tight pr-1">
              What does your season look like?
            </h2>
            <p className="mt-2.5 text-[17px] leading-relaxed text-white/60">
              Add a race or races—we can find most events and add the date. Your arc builds around your goals from there.
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div
                key={i}
                className="w-fit max-w-[min(100%,24rem)] ml-auto pl-3.5 pr-3.5 py-2.5 text-[17px] leading-relaxed text-white/90 bg-white/[0.08] rounded-xl border border-white/[0.1] break-words [overflow-wrap:anywhere]"
              >
                {m.content}
              </div>
            );
          }
          const disc = assistantMessageDisclosure(m.content, messages.slice(0, i));
          return (
            <div key={i} className="min-w-0 pr-1">
              <div className="text-[17px] sm:text-lg leading-relaxed text-white/85 break-words [overflow-wrap:anywhere]">
                <span className="align-baseline">{m.content}</span>
                {disc && (
                  <button
                    type="button"
                    className="inline align-baseline ml-1.5 -translate-y-px text-white/35 hover:text-teal-300/90 text-[1.05rem] leading-none p-0.5 rounded"
                    aria-label={
                      disc === 'strength_fork'
                        ? 'Support tri vs build strength in the gym'
                        : disc === 'swim_fork'
                          ? 'Swim focus vs swim to race'
                          : disc === 'swim_load_source'
                            ? 'Where to fund extra swim load'
                            : 'What performance and completion training intent mean'
                    }
                    aria-expanded={intentInfoOpenIdx === i}
                    onClick={() => setIntentInfoOpenIdx((v) => (v === i ? null : i))}
                  >
                    ⓘ
                  </button>
                )}
              </div>
              {disc === 'strength_fork' && intentInfoOpenIdx === i && (
                <div
                  className="mt-2.5 p-3 rounded-xl border border-white/10 bg-zinc-900/85 text-[15px] leading-relaxed text-white/80 space-y-3"
                  role="region"
                  aria-label="Strength on the plan"
                >
                  <p>
                    <span className="text-white/90 font-medium">Strength supports tri</span> — gym work in service of
                    endurance: one or two sessions per week by phase (more in base, leaner toward the race), accessory and
                    durability bias, lighter loads. Not a strength-build track. Saves <span className="text-white/85">support</span>{' '}
                    intent.
                  </p>
                  <p>
                    <span className="text-white/90 font-medium">Build strength</span> — you are choosing to{' '}
                    <span className="text-white/90">get stronger on purpose</span>: two sessions per week through base, build,
                    and race-specific, compound-forward with real load progression. Endurance still matters, but the gym is a
                    real training goal, not only backup work. Saves <span className="text-white/85">performance</span> intent.
                  </p>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void sendUserMessage(STRENGTH_SUPPORT_USER_MESSAGE)}
                      className="text-sm font-medium px-3 py-2 rounded-lg bg-white/[0.08] text-teal-100/95 border border-white/15 hover:bg-white/12 disabled:opacity-50 flex-1 min-w-0"
                    >
                      Strength supports tri
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void sendUserMessage(STRENGTH_BUILD_USER_MESSAGE)}
                      className="text-sm font-medium px-3 py-2 rounded-lg bg-teal-500/15 text-teal-100/95 border border-teal-500/35 hover:bg-teal-500/25 disabled:opacity-50 flex-1 min-w-0"
                    >
                      Build strength
                    </button>
                  </div>
                </div>
              )}
              {disc === 'training_intent' && intentInfoOpenIdx === i && (
                <div
                  className="mt-2.5 p-3 rounded-xl border border-white/10 bg-zinc-900/85 text-[15px] leading-relaxed text-white/80 space-y-3"
                  role="region"
                  aria-label="Training intent options"
                >
                  <p>
                    <span className="text-white/90 font-medium">Performance</span> — chasing a faster time. Higher
                    quality load, time targets, more intensity.
                  </p>
                  <p>
                    <span className="text-white/90 font-medium">Completion</span> — strong healthy finish. Durability
                    focus, conservative load, finish well.
                  </p>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendUserMessage(COMPLETION_INTENT_USER_MESSAGE)}
                    className="text-sm font-medium px-3 py-2 rounded-lg bg-white/[0.08] text-teal-100/95 border border-white/15 hover:bg-white/12 disabled:opacity-50 w-full sm:w-auto"
                  >
                    Change intent
                  </button>
                </div>
              )}
              {disc === 'swim_fork' && intentInfoOpenIdx === i && (
                <div
                  className="mt-2.5 p-3 rounded-xl border border-white/10 bg-zinc-900/85 text-[15px] leading-relaxed text-white/80 space-y-3"
                  role="region"
                  aria-label="Swim focus options"
                >
                  <p>
                    <span className="text-white/90 font-medium">Swim focus</span> — 3 sessions per week — one threshold
                    main set, one technique session with drill emphasis, one quality aerobic. Volume builds from ~6,000
                    to ~8,000 yards through the block. Treat swim as a development priority.
                  </p>
                  <p>
                    <span className="text-white/90 font-medium">Swim to race</span> — 2 sessions per week — one threshold
                    set to stay sharp, one aerobic session with race-specific work. ~4,000–5,000 yards weekly. Swim
                    supports the block without competing with bike and run load.
                  </p>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void sendUserMessage(SWIM_FOCUS_USER_MESSAGE)}
                      className="text-sm font-medium px-3 py-2 rounded-lg bg-teal-500/15 text-teal-100/95 border border-teal-500/35 hover:bg-teal-500/25 disabled:opacity-50 flex-1 min-w-0"
                    >
                      Swim focus
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void sendUserMessage(SWIM_TO_RACE_USER_MESSAGE)}
                      className="text-sm font-medium px-3 py-2 rounded-lg bg-white/[0.08] text-teal-100/95 border border-white/15 hover:bg-white/12 disabled:opacity-50 flex-1 min-w-0"
                    >
                      Swim to race
                    </button>
                  </div>
                </div>
              )}
              {disc === 'swim_load_source' && intentInfoOpenIdx === i && (
                <div
                  className="mt-2.5 p-3 rounded-xl border border-white/10 bg-zinc-900/85 text-[15px] leading-relaxed text-white/80 space-y-3"
                  role="region"
                  aria-label="Swim load funding options"
                >
                  <p>
                    A third weekly swim pulls load from bike and/or run. Pick what you want to protect most — the model
                    saves this as <span className="text-white/90">swim_load_source</span> on your tri goal.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void sendUserMessage(SWIM_LOAD_PROTECT_RUN_USER_MESSAGE)}
                      className="text-sm font-medium px-3 py-2.5 rounded-lg bg-teal-500/40 text-teal-50 border border-teal-500/60 hover:bg-teal-500/50 disabled:opacity-50 w-full text-left"
                    >
                      Protect my run
                    </button>
                    <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void sendUserMessage(SWIM_LOAD_PROTECT_BIKE_USER_MESSAGE)}
                        className="text-sm font-medium px-3 py-2 rounded-lg bg-white/[0.08] text-teal-100/95 border border-white/15 hover:bg-white/12 disabled:opacity-50 flex-1 min-w-0"
                      >
                        Protect my bike
                      </button>
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void sendUserMessage(SWIM_LOAD_SPLIT_USER_MESSAGE)}
                        className="text-sm font-medium px-3 py-2 rounded-lg bg-white/[0.08] text-teal-100/95 border border-white/15 hover:bg-white/12 disabled:opacity-50 flex-1 min-w-0"
                      >
                        Split it
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {saveBanner && (
          <p className="text-base text-teal-200/90 py-1 break-words leading-relaxed">{saveBanner}</p>
        )}

        {pendingSetup && (
          <div className="mt-2 p-3.5 rounded-xl border border-teal-500/35 bg-teal-950/40 min-w-0 max-w-full">
            <p className="text-[12px] font-medium text-teal-200/90 uppercase tracking-wide mb-1.5">Ready to save</p>
            <p className="text-[17px] text-white/85 leading-snug mb-2 break-words [overflow-wrap:anywhere]">
              {pendingSetup.summaryLine}
            </p>
            {pendingSetup.goalPreviews.length > 0 && (
              <ul className="text-[16px] text-white/65 list-disc pl-4 mb-3 space-y-1.5 [overflow-wrap:anywhere]">
                {pendingSetup.goalPreviews.map((line, i) => (
                  <li key={i} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => void onConfirm()}
                className="text-sm font-medium px-3.5 py-2 rounded-lg bg-teal-500/30 text-teal-100 border border-teal-500/50 hover:bg-teal-500/40 disabled:opacity-50"
              >
                Looks right
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={onClarify}
                className="text-sm font-medium px-3.5 py-2 rounded-lg bg-white/[0.06] text-white/80 border border-white/15 hover:bg-white/10"
              >
                Let me clarify
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-base text-red-300/90 break-words leading-relaxed [overflow-wrap:anywhere]">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-zinc-950/95 backdrop-blur-md
          pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]
          pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="max-w-lg mx-auto w-full min-w-0 flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Message…"
            className="flex-1 min-w-0 min-h-[48px] max-h-28 resize-y rounded-xl bg-white/[0.07] border border-white/15 text-[17px] text-white placeholder:text-white/35 px-3.5 py-3 focus:outline-none focus:border-teal-500/50"
            disabled={sending}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            className="shrink-0 h-12 min-w-[4.5rem] px-4 rounded-xl bg-teal-500/25 text-teal-100 text-base font-medium border border-teal-500/40 disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

const ARC_HEADER_INSET: React.CSSProperties = {
  // Fixed .mobile-header does not take flow space. Pad the whole main column. Extra 12px
  // keeps the title strip and intro below the wordmark and header-glow blend on iOS.
  paddingTop: 'calc(var(--header-h, 64px) + env(safe-area-inset-top, 0px) + 12px)',
};

type ArcSetupScreenChromeProps = {
  title?: string;
  children: React.ReactNode;
};

export function ArcSetupScreenChrome({ title = 'Plan my season', children }: ArcSetupScreenChromeProps) {
  const navigate = useNavigate();
  return (
    <>
      <MobileHeader
        showBackButton
        onBack={() => navigate(-1)}
        wordmarkSize={28}
      />
      <div
        className="flex-1 flex flex-col min-h-0 min-w-0 w-full bg-zinc-950"
        style={ARC_HEADER_INSET}
      >
        <div className="shrink-0 z-20 border-b border-white/10 bg-zinc-950">
          <p className="text-center text-lg font-semibold text-white/95 px-4 py-2.5 tracking-tight">{title}</p>
        </div>
        {children}
      </div>
    </>
  );
}
