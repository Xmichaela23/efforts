// Edge Function: coach
//
// V1: Deterministic week context contract.
// - Week framing is based on active plan's PlanContractV1.week_start (defaults to Monday).
// - Metrics are computed from stored workload_* fields (source of truth).
// - No AI here; AI language should be layered on top of these facts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  CoachWeekContextRequestV1,
  CoachWeekContextResponseV1,
  MethodologyId,
  WeekStartDow,
  WeekVerdictCode,
  NextActionCode,
  EvidenceItem,
  KeySessionCategory,
  KeySessionItem,
} from './types.ts';
import { getMethodology } from './methodologies/registry.ts';
import type { MethodologyContext } from './methodologies/types.ts';
import { computeMarathonReadiness } from '../_shared/marathon-readiness/index.ts';
import {
  getAcwrRiskFlag,
  getAcwrStatus,
  isAcwrDetrainedSignal,
  isAcwrFatiguedSignal,
} from '../_shared/acwr-state.ts';
import { computeWtdLoadSummary } from '../_shared/adherence-plan.ts';
import {
  isPlanTransitionWindowByWeekIndex,
  resolvePlanWeekIndex,
  resolveWeekStartDowFromPlanConfig,
  weekStartOf,
} from '../_shared/plan-week.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODateOnly(iso: string): Date {
  const [y, m, d] = String(iso).split('-').map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

function addDaysISO(iso: string, deltaDays: number): string {
  const base = parseISODateOnly(iso);
  base.setDate(base.getDate() + deltaDays);
  return toISODate(base);
}

function weekdayFromISODate(iso: string): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  try {
    return names[parseISODateOnly(iso).getDay()] || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function sessionLocalLabel(workout: any, fallbackIsoDate: string, timezone?: string | null): string {
  const tsRaw = workout?.timestamp || workout?.start_time || null;
  if (tsRaw) {
    try {
      const dt = new Date(String(tsRaw));
      if (!Number.isNaN(dt.getTime())) {
        const opts: Intl.DateTimeFormatOptions = {
          weekday: 'long',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        };
        if (timezone) opts.timeZone = timezone;
        return dt.toLocaleDateString('en-US', opts);
      }
    } catch {
      // fall through to date-only label
    }
  }
  const day = weekdayFromISODate(fallbackIsoDate);
  return `${day}`;
}

function workoutLocalDate(workout: any, fallbackIsoDate: string, timezone?: string | null): string {
  const tsRaw = workout?.timestamp || workout?.start_time || null;
  if (tsRaw) {
    try {
      const dt = new Date(String(tsRaw));
      if (!Number.isNaN(dt.getTime())) {
        const opts: Intl.DateTimeFormatOptions = {};
        if (timezone) opts.timeZone = timezone;
        return dt.toLocaleDateString('en-CA', opts);
      }
    } catch {
      // fall through
    }
  }
  return String(fallbackIsoDate || '').slice(0, 10);
}

function safeNum(n: any): number | null {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

type ActivePlanLite = {
  id: string;
  name: string | null;
  config: any;
  duration_weeks: number | null;
};

async function loadAllActivePlans(supabase: any, userId: string): Promise<ActivePlanLite[]> {
  const { data } = await supabase
    .from('plans')
    .select('id,name,config,duration_weeks,athlete_context_by_week')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5);
  return Array.isArray(data) ? (data as any[]) : [];
}

// Primary plan = soonest upcoming race date; falls back to most recently created.
function pickPrimaryPlan(plans: ActivePlanLite[]): ActivePlanLite | null {
  if (!plans.length) return null;
  const withRace = plans
    .filter(p => p.config?.race_date)
    .sort((a, b) => new Date(a.config.race_date).getTime() - new Date(b.config.race_date).getTime());
  return (withRace[0] ?? plans[0]) as ActivePlanLite;
}

function inferMethodologyId(planConfig: any): MethodologyId {
  const approach = String(planConfig?.approach || '').toLowerCase();
  if (approach === 'performance_build') return 'run:performance_build';
  if (approach === 'sustainable') return 'run:sustainable';
  // Triathlon approaches: map to the closest run methodology for threshold/verdict math.
  // The distinct coaching identity is injected into narrativeFacts separately.
  if (approach === 'race_peak') return 'run:performance_build';
  if (approach === 'base_first') return 'run:sustainable';
  return 'unknown';
}

/** Returns human-readable methodology description for the LLM, or null for run plans. */
function triMethodologyFact(planConfig: any, allActivePlans: any[]): string | null {
  // approach may be at the top-level config (standalone tri plan) OR inside plan_contract_v1 (combined plan)
  const approach = String(
    planConfig?.approach ||
    planConfig?.plan_contract_v1?.tri_approach ||
    '',
  ).toLowerCase();
  const sport = String(planConfig?.sport || planConfig?.plan_type || planConfig?.plan_contract_v1?.sport || '').toLowerCase();
  const isTri = sport.includes('tri') || sport === 'multi_sport' ||
    allActivePlans.some(p =>
      String(p.config?.sport || '').toLowerCase().includes('tri') ||
      String(p.config?.plan_type || '').toLowerCase().includes('tri') ||
      String(p.config?.plan_contract_v1?.sport || '').toLowerCase().includes('tri'),
    );
  if (!isTri && approach !== 'base_first' && approach !== 'race_peak') return null;

  if (approach === 'base_first') {
    return [
      `TRAINING METHODOLOGY: Triathlon — Aerobic Foundation (Completion-Focus).`,
      `Quality sessions are deliberately in Zone 3 tempo, NOT threshold intervals — this is by design.`,
      `Brick sessions are neuromuscular transition practice at Zone 2, not metabolic stress tests.`,
      `Praise consistency, low HR drift, and aerobic comfort. Do NOT suggest adding intervals or pushing harder — durability is the goal.`,
      `Loading is 2:1 (every 3rd week is recovery); flag it positively if the athlete held steady through load weeks.`,
    ].join(' ');
  }
  if (approach === 'race_peak') {
    return [
      `TRAINING METHODOLOGY: Triathlon — Race-Peak (Performance-Focus).`,
      `Quality sessions target Zone 4 threshold and Zone 5 VO2max to raise the aerobic ceiling.`,
      `Race-pace bricks in Build/Race-Specific phases simulate metabolic switching under fatigue — these are key sessions.`,
      `Praise power output, FTP-percentage work, CSS swim adherence, and threshold session completion.`,
      `Loading is 3:1 (every 4th week is recovery); monitor accumulated fatigue across all three disciplines.`,
    ].join(' ');
  }
  if (sport === 'multi_sport' || sport.includes('tri')) {
    return `TRAINING METHODOLOGY: Multi-Sport Combined (80/20 Unified Plan). Training load is budgeted across swim, bike, run, and strength as a single TSS pool. When coaching, consider total systemic load — a hard swim day counts toward the weekly hard quota just like a hard run.`;
  }
  return null;
}

function resolveWeekStartDow(planConfig: any): WeekStartDow {
  return resolveWeekStartDowFromPlanConfig(planConfig) as WeekStartDow;
}

function computeWeekIndex(planConfig: any, focusIso: string, weekStartDow: WeekStartDow, durationWeeks: number | null): number | null {
  void weekStartDow; // week start is resolved canonically from plan config
  return resolvePlanWeekIndex(planConfig, focusIso, durationWeeks);
}

function weekIntentFromContract(planConfig: any, weekIndex: number | null): { intent: CoachWeekContextResponseV1['plan']['week_intent']; focus_label: string | null } {
  if (!weekIndex) return { intent: 'unknown', focus_label: null };
  const c = planConfig?.plan_contract_v1;
  const phases: string[] | null = Array.isArray(c?.phase_by_week) ? c.phase_by_week : null;
  const intents: any[] | null = Array.isArray(c?.week_intent_by_week) ? c.week_intent_by_week : null;
  let intent: CoachWeekContextResponseV1['plan']['week_intent'] = 'unknown';
  if (phases && weekIndex >= 1 && weekIndex <= phases.length) {
    const p = String(phases[weekIndex - 1] || '').toLowerCase();
    if (p === 'recovery') intent = 'recovery';
    else if (p === 'taper') intent = 'taper';
    else if (p === 'peak') intent = 'peak';
    else if (p === 'base') intent = 'baseline';
    else if (p) intent = 'build';
  }
  const focus_label = intents ? String((intents.find((x: any) => Number(x?.week_index) === weekIndex)?.focus_label) || '') || null : null;
  return { intent, focus_label };
}

function buildVerdict(
  metrics: CoachWeekContextResponseV1['metrics'],
  methodologyId: MethodologyId,
  ctx: MethodologyContext,
  reaction: CoachWeekContextResponseV1['reaction'],
  isPlanTransitionPeriod: boolean = false,
): { code: WeekVerdictCode; label: string; confidence: number; reason_codes: string[]; next: { code: NextActionCode; title: string; details: string } } {
  const reason_codes: string[] = [];
  const acwr = metrics.acwr;
  const completion = metrics.wtd_completion_ratio;
  // Early weeks of a new plan: the 7-day acute window overlaps with the final
  // days of the previous training cycle, making ACWR unreliable. Suppress
  // ACWR-only caution unless the ratio is critically high or execution is poor.
  const isPlanWeek1 = isPlanTransitionPeriod;
  const methodology = getMethodology(methodologyId);
  const t = methodology.thresholds(ctx);
  const warn = t.warn_acwr;
  const high = t.high_acwr;

  if (acwr == null) {
    return {
      code: 'insufficient_data',
      label: 'Not enough data yet',
      confidence: 0.4,
      reason_codes: ['missing_acwr'],
      next: {
        code: 'insufficient_data',
        title: 'Log a few sessions first',
        details: 'Once you have a week or two of logged training, I can give you a confident week verdict.',
      },
    };
  }

  if (acwr >= high) {
    reason_codes.push('acwr_high');
    return {
      code: 'recover_overreaching',
      label: 'Recover',
      confidence: 0.8,
      reason_codes,
      next: {
        code: 'take_rest_or_easy',
        title: 'Make today easy or take rest',
        details: 'Protect recovery so your next quality session lands well.',
      },
    };
  }

  // Execution quality: if key sessions are being executed poorly, bias toward reducing intensity even if ACWR is okay.
  if (
    t.min_execution_score_ok != null &&
    reaction.avg_execution_score != null &&
    reaction.execution_sample_size >= 1 &&
    reaction.avg_execution_score < t.min_execution_score_ok
  ) {
    reason_codes.push('execution_low');
    return {
      code: 'caution_ramping_fast',
      label: 'Caution',
      confidence: 0.72,
      reason_codes,
      next: {
        code: 'swap_quality_for_easy',
        title: 'Dial back intensity for 24–48h',
        details: 'Your execution suggests you’re not absorbing the work. Keep it easy, then re-attempt the next key session.',
      },
    };
  }

  if (acwr >= warn && !isPlanWeek1) {
    reason_codes.push('acwr_elevated');
    return {
      code: 'caution_ramping_fast',
      label: 'Caution',
      confidence: 0.7,
      reason_codes,
      next: {
        code: 'swap_quality_for_easy',
        title: 'If needed, swap intensity for easy volume',
        details: 'Keep the week moving forward without digging a deeper hole.',
      },
    };
  }

  // Under-target is methodology-controlled (and often disabled for taper/recovery).
  if (t.under_target_completion_ratio != null && completion != null && completion < t.under_target_completion_ratio) {
    reason_codes.push('behind_plan');
    return {
      code: 'undertraining',
      label: 'Under target',
      confidence: 0.6,
      reason_codes,
      next: {
        code: 'add_easy_volume',
        title: 'Add easy volume if you can recover',
        details: 'A small, easy session can help you get back toward the plan’s intent.',
      },
    };
  }

  // If key sessions are being missed, bias next action toward prioritizing the next key session, not adding random volume.
  if (reaction.key_sessions_completion_ratio != null && reaction.key_sessions_completion_ratio < 0.6) {
    reason_codes.push('key_sessions_missed');
    return {
      code: 'undertraining',
      label: 'Under target',
      confidence: 0.62,
      reason_codes,
      next: {
        code: 'proceed_as_planned',
        title: 'Prioritize the next key session',
        details: 'Focus on completing the next key workout rather than adding extra volume.',
      },
    };
  }

  // In taper/recovery weeks, default next action leans conservative unless overridden by ACWR logic above.
  if (ctx.week_intent === 'recovery' || ctx.week_intent === 'taper') {
    return {
      code: 'on_track',
      label: 'On track',
      confidence: 0.7,
      reason_codes: ['recovery_week'],
      next: {
        code: 'take_rest_or_easy',
        title: 'Keep it easy',
        details: 'In a recovery/taper week, prioritize freshness over adding stress.',
      },
    };
  }

  return {
    code: 'on_track',
    label: 'On track',
    confidence: 0.75,
    reason_codes: ['acwr_ok'],
    next: {
      code: 'proceed_as_planned',
      title: 'Proceed as planned',
      details: 'Stay consistent and keep easy days truly easy.',
    },
  };
}

function keyCategoryForPlanned(row: any, ctx: MethodologyContext, methodologyId: MethodologyId): KeySessionCategory {
  const methodology = getMethodology(methodologyId);
  try {
    return methodology.classifyKeySession(row, ctx);
  } catch {
    return 'other';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  try {
    const payload = (await req.json().catch(() => ({}))) as Partial<CoachWeekContextRequestV1>;
    const userId = String(payload?.user_id || '');
    if (!userId) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userTz = payload?.timezone ? String(payload.timezone) : null;
    const asOfDate = String(payload?.date || (() => {
      try { return userTz ? new Date().toLocaleDateString('en-CA', { timeZone: userTz }) : new Date().toLocaleDateString('en-CA'); } catch { return new Date().toLocaleDateString('en-CA'); }
    })());

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const allActivePlans = await loadAllActivePlans(supabase, userId);
    const activePlan = pickPrimaryPlan(allActivePlans);
    const secondaryPlans = allActivePlans.filter(p => p.id !== activePlan?.id);
    const planConfig = activePlan?.config || null;
    const methodologyId: MethodologyId = inferMethodologyId(planConfig);
    const weekStartDow: WeekStartDow = resolveWeekStartDow(planConfig);

    const weekStartDate = weekStartOf(asOfDate, weekStartDow);
    const weekEndDate = addDaysISO(weekStartDate, 6);
    const weekIndex = activePlan ? computeWeekIndex(planConfig, asOfDate, weekStartDow, activePlan.duration_weeks || null) : null;

    // Plan transition period: first two plan weeks.
    // During this window, load-ratio comparisons are often contaminated by the prior cycle.
    const isPlanTransitionPeriod = isPlanTransitionWindowByWeekIndex(weekIndex);

    const weekIntentInfo = activePlan ? weekIntentFromContract(planConfig, weekIndex) : { intent: 'unknown', focus_label: null };
    const weekIntent = weekIntentInfo.intent as CoachWeekContextResponseV1['plan']['week_intent'];
    const weekFocusLabel = weekIntentInfo.focus_label as string | null;
    const methodologyCtx: MethodologyContext = { week_intent: weekIntent as any, week_start_dow: weekStartDow };

    // Planned rows within the week window — scoped to all active plans so
    // rows from ended plans in the same date range are excluded.
    let plannedWeekQuery = supabase
      .from('planned_workouts')
      .select('id,date,type,name,description,rendered_description,steps_preset,tags,workout_status,workload_planned,completed_workout_id,skip_reason,skip_note,training_plan_id')
      .eq('user_id', userId)
      .gte('date', weekStartDate)
      .lte('date', weekEndDate);
    if (allActivePlans.length > 0) {
      plannedWeekQuery = plannedWeekQuery.in('training_plan_id', allActivePlans.map(p => p.id));
    }
    const { data: plannedWeek, error: pErr } = await plannedWeekQuery;
    if (pErr) throw pErr;

    // WTD actual load: completed workouts within [week_start, as_of]
    const { data: actualWtd, error: wErr } = await supabase
      .from('workouts')
      .select('workload_actual,date,workout_status')
      .eq('user_id', userId)
      .gte('date', weekStartDate)
      .lte('date', asOfDate);
    if (wErr) throw wErr;

    const plannedWeekArr = Array.isArray(plannedWeek) ? plannedWeek : [];
    const wtd = computeWtdLoadSummary(plannedWeekArr as any[], (actualWtd || []) as any[], asOfDate);
    const plannedWtdLoad = wtd.planned_wtd_load;
    const plannedWeekTotalLoad = wtd.planned_week_total_load;
    const plannedRemainingLoad = wtd.planned_remaining_load;
    const actualWtdLoad = wtd.actual_wtd_load;
    const wtdCompletionRatio = wtd.wtd_completion_ratio;

    const plannedWtdArr = plannedWeekArr.filter((r: any) => String(r?.date || '') <= asOfDate);

    const keySessionsRemaining: KeySessionItem[] = plannedWeekArr
      .filter((r: any) => String(r?.date || '') >= asOfDate && String(r?.workout_status || '').toLowerCase() !== 'completed')
      .map((r: any) => {
        const category = keyCategoryForPlanned(r, methodologyCtx, methodologyId);
        return {
          date: String(r?.date || '').slice(0, 10),
          type: String(r?.type || ''),
          name: r?.name != null ? String(r.name) : null,
          category,
          workload_planned: safeNum(r?.workload_planned),
        } as KeySessionItem;
      })
      .filter((x: any) => x.category !== 'other')
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));

    // Key session completion + execution quality
    // IMPORTANT: this is week-to-date (<= asOfDate), otherwise mid-week counts look wrong.
    const keySessionsPlanned = plannedWtdArr
      .map((r: any) => ({ r, cat: keyCategoryForPlanned(r, methodologyCtx, methodologyId) }))
      .filter((x: any) => x.cat !== 'other');

    // Pull completed workouts in-week for execution_score sampling (linked workouts usually have planned_id)
    const plannedIds = new Set<string>(plannedWeekArr.map((p: any) => String(p?.id || '')).filter(Boolean));
    const workoutQueryFrom = addDaysISO(weekStartDate, -2);
    const workoutQueryTo = addDaysISO(asOfDate, 2);
    const { data: weekWorkoutsRows, error: wwErr } = await supabase
      .from('workouts')
      .select('id,date,timestamp,type,name,workout_status,workload_actual,planned_id,computed,workout_analysis,workout_metadata,rpe,session_rpe,feeling,strength_exercises')
      .eq('user_id', userId)
      .gte('date', workoutQueryFrom)
      .lte('date', workoutQueryTo);
    if (wwErr) throw wwErr;

    // Date truth for weekly rollups should be user-local timestamp when present,
    // not stored UTC-sliced date strings that can drift across midnight.
    const weekWorkouts = (Array.isArray(weekWorkoutsRows) ? weekWorkoutsRows : [])
      .map((w: any) => {
        const localDate = workoutLocalDate(w, String(w?.date || '').slice(0, 10), userTz);
        return { ...w, __local_date: localDate };
      })
      .filter((w: any) => {
        const d = String(w?.__local_date || '');
        return d >= weekStartDate && d <= asOfDate;
      });

    const completedPlannedIdsFromWorkouts = new Set<string>(
      (Array.isArray(weekWorkouts) ? weekWorkouts : [])
        .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
        .map((w: any) => (w?.planned_id != null ? String(w.planned_id) : ''))
        .filter((s: string) => Boolean(s))
    );

    const isPlannedCompleted = (r: any): boolean => {
      const statusDone = String(r?.workout_status || '').toLowerCase() === 'completed';
      const hardLinked = r?.completed_workout_id != null;
      const viaWorkoutRef = r?.id != null && completedPlannedIdsFromWorkouts.has(String(r.id));
      return Boolean(statusDone || hardLinked || viaWorkoutRef);
    };

    // Do not mark same-day sessions as "missed" unless they are already completed.
    // This prevents morning/midday check-ins from prematurely counting today's
    // planned key session as a gap.
    const keySessionsPlannedEffective = keySessionsPlanned.filter((x: any) => {
      const d = String(x?.r?.date || '').slice(0, 10);
      if (d !== asOfDate) return true;
      return isPlannedCompleted(x?.r);
    });
    const keySessionsCompleted = keySessionsPlannedEffective.filter((x: any) => isPlannedCompleted(x?.r));
    const keySessionsCompletionRatio = keySessionsPlannedEffective.length > 0 ? keySessionsCompleted.length / keySessionsPlannedEffective.length : null;

    // Linking breakdown (WTD): linked vs gaps vs extras
    const keySessionGapsDetails = keySessionsPlannedEffective
      .filter((x: any) => !isPlannedCompleted(x?.r))
      .map((x: any) => ({
        planned_id: String(x?.r?.id || ''),
        date: String(x?.r?.date || '').slice(0, 10),
        type: String(x?.r?.type || ''),
        name: x?.r?.name != null ? String(x.r.name) : null,
        category: x?.cat,
        workload_planned: safeNum(x?.r?.workload_planned),
        skip_reason: x?.r?.skip_reason ?? null,
        skip_note: x?.r?.skip_note ?? null,
      }))
      .filter((x: any) => Boolean(x.planned_id));

    const rpeFromWorkout = (w: any): number | null => {
      let meta: any = {};
      try {
        meta = typeof (w as any)?.workout_metadata === 'string' ? JSON.parse((w as any).workout_metadata) : ((w as any)?.workout_metadata || {});
      } catch {}
      const v = meta?.session_rpe ?? (w as any)?.session_rpe ?? (w as any)?.rpe ?? null;
      const n = safeNum(v);
      return n != null && n >= 1 && n <= 10 ? n : null;
    };
    const feelingFromWorkout = (w: any): string | null => {
      const f = String((w as any)?.feeling || '').toLowerCase();
      return ['great', 'good', 'ok', 'tired', 'exhausted'].includes(f) ? f : null;
    };
    const workoutSignalsRecovery = (w: any): boolean => {
      const rpe = rpeFromWorkout(w);
      const feeling = feelingFromWorkout(w);
      return (rpe != null && rpe <= 4) || (feeling != null && ['great', 'good', 'ok'].includes(feeling));
    };

    const extraSessionsDetails = (Array.isArray(weekWorkouts) ? weekWorkouts : [])
      .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
      .filter((w: any) => w?.planned_id == null || String(w?.planned_id || '') === '')
      .map((w: any) => ({
        workout_id: String(w?.id || ''),
        date: String(w?.date || '').slice(0, 10),
        type: String(w?.type || ''),
        name: w?.name != null ? String(w.name) : null,
        workload_actual: safeNum((w as any)?.workload_actual),
        rpe: rpeFromWorkout(w),
        feeling: feelingFromWorkout(w),
        signals_recovery: workoutSignalsRecovery(w),
      }))
      .filter((x: any) => Boolean(x.workout_id));

    const keySessionsLinked = keySessionsPlannedEffective.length - keySessionGapsDetails.length;
    const keySessionsGaps = keySessionGapsDetails.length;
    const extraSessions = extraSessionsDetails.length;

    const daysInWindow = Math.max(
      1,
      Math.round((new Date(asOfDate).getTime() - new Date(weekStartDate).getTime()) / (24 * 3600 * 1000)) + 1
    );
    const daysWithActivity = new Set<string>(
      (Array.isArray(weekWorkouts) ? weekWorkouts : [])
        .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
        .map((w: any) => String((w as any)?.__local_date || (w as any)?.date || '').slice(0, 10))
        .filter(Boolean)
    ).size;
    const coverageRatio = Math.max(0, Math.min(1, daysWithActivity / daysInWindow));

    const parseJson = (v: any) => {
      try { return typeof v === 'string' ? JSON.parse(v) : (v || null); } catch { return null; }
    };

    const executionScoreFromWorkout = (wAny: any): number | null => {
      try {
        // Prefer canonical computed score when present
        const c = parseJson((wAny as any)?.computed);
        const s1 = safeNum(c?.overall?.execution_score);
        if (s1 != null) return Math.max(0, Math.min(100, s1));

        const wa = parseJson((wAny as any)?.workout_analysis) || {};
        const s2 =
          safeNum(wa?.execution_summary?.overall_execution) ??
          safeNum(wa?.performance?.execution_adherence) ??
          safeNum(wa?.performance?.pace_adherence) ??
          safeNum(wa?.performance?.overall_adherence) ??
          null;
        if (s2 == null) return null;

        // Normalize 0..1 fractions to 0..100
        const normalized = s2 > 0 && s2 <= 1 ? s2 * 100 : s2;
        return Math.max(0, Math.min(100, Math.round(normalized)));
      } catch {
        return null;
      }
    };

    const hrWorkoutTypeFromWorkout = (wAny: any): string | null => {
      try {
        const wa = parseJson((wAny as any)?.workout_analysis) || {};
        const hr = wa?.granular_analysis?.heart_rate_analysis || {};
        const wt = hr?.workout_type;
        if (wt == null) return null;
        const s = String(wt).toLowerCase();
        return s || null;
      } catch {
        return null;
      }
    };

    const driftBpmFromWorkout = (wAny: any): number | null => {
      try {
        const wa = parseJson(wAny?.workout_analysis) || {};
        const v =
          wa?.granular_analysis?.heart_rate_analysis?.hr_drift_bpm ??
          wa?.heart_rate_summary?.drift_bpm ??
          wa?.detailed_analysis?.workout_summary?.hr_drift ??
          wa?.heart_rate_analysis?.hr_drift_bpm ??
          null;
        const n = safeNum(v);
        return n;
      } catch {
        return null;
      }
    };

    const sessionRpeFromWorkout = (wAny: any): number | null => {
      // Prefer unified workout_metadata.session_rpe, then workouts.rpe if present.
      try {
        const meta = parseJson((wAny as any)?.workout_metadata) || {};
        const v = meta?.session_rpe ?? (wAny as any)?.session_rpe ?? (wAny as any)?.rpe ?? null;
        const n = safeNum(v);
        if (n == null) return null;
        if (n < 1 || n > 10) return null;
        return n;
      } catch {
        return null;
      }
    };

    const avgStrengthRirFromWorkout = (wAny: any): number | null => {
      try {
        const exRaw = (wAny as any)?.strength_exercises;
        const ex = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (parseJson(exRaw) || []) : []);
        if (!Array.isArray(ex) || ex.length === 0) return null;
        const rirs: number[] = [];
        for (const e of ex) {
          const sets = Array.isArray(e?.sets) ? e.sets : [];
          for (const s of sets) {
            const r = safeNum((s as any)?.rir);
            if (r != null && r >= 0 && r <= 10) rirs.push(r);
          }
        }
        if (rirs.length === 0) return null;
        return Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10;
      } catch {
        return null;
      }
    };
    const executionScores: number[] = [];
    const driftBpms: number[] = [];
    for (const w of Array.isArray(weekWorkouts) ? weekWorkouts : []) {
      if (String(w?.workout_status || '').toLowerCase() !== 'completed') continue;
      const pid = w?.planned_id != null ? String(w.planned_id) : '';
      if (pid && plannedIds.has(pid)) {
        const s = executionScoreFromWorkout(w as any);
        if (s != null) executionScores.push(s);
        // Aerobic response: HR drift for steady aerobic runs only (avoid intervals/fartlek noise)
        if (String((w as any)?.type || '').toLowerCase() === 'run') {
          if (hrWorkoutTypeFromWorkout(w as any) === 'steady_state') {
            const d = driftBpmFromWorkout(w as any);
            if (d != null) driftBpms.push(d);
          }
        }
        continue;
      }
      // Fallback: if workout_analysis has a numeric execution adherence, use it.
      const wa = parseJson((w as any).workout_analysis);
      // We intentionally do NOT include unplanned workouts in execution here
      // because "execution" is meant to reflect compliance to planned intent.
      if (String((w as any)?.type || '').toLowerCase() === 'run') {
        if (hrWorkoutTypeFromWorkout(w as any) === 'steady_state') {
          const d = driftBpmFromWorkout(w as any);
          if (d != null) driftBpms.push(d);
        }
      }
    }
    const avgExecutionScore =
      executionScores.length > 0 ? Math.round(executionScores.reduce((a, b) => a + b, 0) / executionScores.length) : null;

    // Subjective + structural response windows (last 7 days)
    const rpeStart = addDaysISO(asOfDate, -6);
    const { data: recentWorkouts, error: rwErr } = await supabase
      .from('workouts')
      .select('id,date,type,workout_status,workout_metadata,rpe,session_rpe,strength_exercises,workout_analysis')
      .eq('user_id', userId)
      .gte('date', rpeStart)
      .lte('date', asOfDate);
    if (rwErr) throw rwErr;

    const rpes: number[] = [];
    const rirs: number[] = [];
    for (const w of Array.isArray(recentWorkouts) ? recentWorkouts : []) {
      if (String(w?.workout_status || '').toLowerCase() !== 'completed') continue;
      const r = sessionRpeFromWorkout(w as any);
      if (r != null) rpes.push(r);
      if (String((w as any)?.type || '').toLowerCase() === 'strength') {
        const rirAvg = avgStrengthRirFromWorkout(w as any);
        if (rirAvg != null) rirs.push(rirAvg);
      }
    }
    const avgSessionRpe7d = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;
    const avgStrengthRir7d = rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null;
    const hrDriftAvg = driftBpms.length ? Math.round((driftBpms.reduce((a, b) => a + b, 0) / driftBpms.length) * 10) / 10 : null;

    // Run session type classification (7d window)
    type RunSessionType = 'easy' | 'z2' | 'long' | 'tempo' | 'progressive' | 'fartlek' | 'intervals' | 'hills' | 'unknown';
    const runTypeFromWorkout = (wAny: any): RunSessionType => {
      try {
        const wa = parseJson((wAny as any)?.workout_analysis) || {};
        const hr = wa?.granular_analysis?.heart_rate_analysis || {};
        const wt = String(hr?.workout_type || '').toLowerCase();
        const sum = hr?.summary || {};
        const durationMin = safeNum(sum?.durationMinutes);
        const timeInZones = sum?.timeInZones || {};
        const z2Sec = safeNum(timeInZones?.z2Seconds) || 0;
        const totalSec = durationMin != null ? Math.max(1, Math.round(durationMin * 60)) : null;
        const z2Pct = totalSec != null ? (z2Sec / totalSec) * 100 : null;

        if (wt === 'intervals') return 'intervals';
        if (wt === 'hill_repeats') return 'hills';
        if (wt === 'fartlek') return 'fartlek';
        if (wt === 'tempo_finish') return 'tempo';
        if (wt === 'progressive') return 'progressive';
        if (wt === 'steady_state') {
          if (durationMin != null && durationMin >= 80) return 'long';
          if (z2Pct != null && z2Pct >= 60) return 'z2';
          return 'easy';
        }
        return 'unknown';
      } catch {
        return 'unknown';
      }
    };

    const runAgg: Record<RunSessionType, { n: number; exec: number[]; drift: number[]; z2pct: number[]; creep: number[]; decouple: number[] }> = {
      easy: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      z2: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      long: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      tempo: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      progressive: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      fartlek: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      intervals: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      hills: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
      unknown: { n: 0, exec: [], drift: [], z2pct: [], creep: [], decouple: [] },
    };

    for (const w of Array.isArray(recentWorkouts) ? recentWorkouts : []) {
      if (String((w as any)?.workout_status || '').toLowerCase() !== 'completed') continue;
      if (String((w as any)?.type || '').toLowerCase() !== 'run') continue;
      const rt = runTypeFromWorkout(w as any);
      runAgg[rt].n += 1;

      const c = parseJson((w as any)?.computed);
      const ex = safeNum(c?.overall?.execution_score);
      if (ex != null) runAgg[rt].exec.push(ex);

      // Drift is only meaningful for steady/progressive/tempo finish types; don't show it for intervals/fartlek.
      const hrType = hrWorkoutTypeFromWorkout(w as any);
      if (hrType === 'steady_state' || hrType === 'progressive' || hrType === 'tempo_finish') {
        const d = driftBpmFromWorkout(w as any);
        if (d != null) runAgg[rt].drift.push(d);
      }

      try {
        const wa = parseJson((w as any)?.workout_analysis) || {};
        const hr = wa?.granular_analysis?.heart_rate_analysis || {};
        const sum = hr?.summary || {};
        const tz = sum?.timeInZones || {};
        const z2Sec = safeNum(tz?.z2Seconds);
        const durMin = safeNum(sum?.durationMinutes);
        const totalSec = durMin != null ? Math.max(1, Math.round(durMin * 60)) : null;
        if (z2Sec != null && totalSec != null) runAgg[rt].z2pct.push(Math.max(0, Math.min(100, (z2Sec / totalSec) * 100)));
        const creep = safeNum(sum?.intervalHrCreepBpm);
        if (creep != null) runAgg[rt].creep.push(creep);
        const dec = safeNum(sum?.decouplingPct);
        if (dec != null) runAgg[rt].decouple.push(dec);
      } catch {
        // ignore
      }
    }

    const avgArr = (arr: number[], dp: number): number | null => {
      if (!arr.length) return null;
      const v = arr.reduce((a, b) => a + b, 0) / arr.length;
      const m = Math.pow(10, dp);
      return Math.round(v * m) / m;
    };

    const runSessionTypes7d: CoachWeekContextResponseV1['response']['run_session_types_7d'] = (Object.keys(runAgg) as RunSessionType[])
      .filter((k) => runAgg[k].n > 0)
      .map((k) => ({
        type: k,
        sample_size: runAgg[k].n,
        avg_execution_score: avgArr(runAgg[k].exec, 0),
        avg_hr_drift_bpm: avgArr(runAgg[k].drift, 1),
        avg_z2_percent: avgArr(runAgg[k].z2pct, 0),
        avg_interval_hr_creep_bpm: avgArr(runAgg[k].creep, 1),
        avg_decoupling_pct: avgArr(runAgg[k].decouple, 1),
      }))
      .sort((a, b) => b.sample_size - a.sample_size);

    const linkingConfidence: CoachWeekContextResponseV1['reaction']['linking_confidence'] = (() => {
      const base =
        0.25 +
        0.35 * Math.min(1, coverageRatio / 0.75) +
        0.25 * Math.min(1, keySessionsPlanned.length / 3) +
        0.15 * Math.min(1, executionScores.length / 4);
      const score = Math.max(0.15, Math.min(0.98, base));
      const label = score >= 0.8 ? 'high' : score >= 0.55 ? 'medium' : 'low';
      const explain = `Based on ${daysWithActivity}/${daysInWindow} days with activity and ${executionScores.length} plan-linked execution samples.`;
      return { label, score: Number(score.toFixed(2)), explain };
    })();

    // Key-quality extras: only long/tempo/intervals (not easy/z2) — use for Key sessions display
    const keyQualityExtrasCount = (() => {
      const ww = Array.isArray(weekWorkouts) ? weekWorkouts : [];
      return extraSessionsDetails.filter((e) => {
        const w = ww.find((x: any) => String(x?.id) === e.workout_id);
        if (!w) return false;
        const t = String((w as any)?.type || '').toLowerCase();
        if (t === 'run' || t === 'running') {
          const rt = runTypeFromWorkout(w as any);
          return ['long', 'tempo', 'intervals', 'hills', 'progressive', 'fartlek'].includes(rt);
        }
        return false;
      }).length;
    })();

    // Recovery-signaled extras: user explicitly signaled easy (RPE ≤4 or feeling great/good/ok)
    const recoverySignaledExtrasCount = extraSessionsDetails.filter((e) => e.signals_recovery).length;

    const reaction: CoachWeekContextResponseV1['reaction'] = {
      key_sessions_planned: keySessionsPlannedEffective.length,
      key_sessions_completed: keySessionsCompleted.length,
      key_sessions_completion_ratio: keySessionsCompletionRatio,
      key_sessions_linked: keySessionsLinked,
      key_sessions_gaps: keySessionsGaps,
      extra_sessions: extraSessions,
      key_quality_extras: keyQualityExtrasCount,
      recovery_signaled_extras: recoverySignaledExtrasCount,
      key_session_gaps_details: keySessionGapsDetails.slice(0, 10),
      extra_sessions_details: extraSessionsDetails.slice(0, 10),
      linking_confidence: linkingConfidence,
      avg_execution_score: avgExecutionScore,
      execution_sample_size: executionScores.length,
      hr_drift_avg_bpm: hrDriftAvg,
      hr_drift_sample_size: driftBpms.length,
      avg_session_rpe_7d: avgSessionRpe7d,
      rpe_sample_size_7d: rpes.length,
      avg_strength_rir_7d: avgStrengthRir7d,
      rir_sample_size_7d: rirs.length,
    };

    // =========================================================================
    // Baselines + 28d personal norms (to avoid generic thresholds)
    // =========================================================================
    const { data: ub, error: ubErr } = await supabase
      .from('user_baselines')
      .select('performance_numbers,effort_paces,learned_fitness,dismissed_suggestions,units')
      .eq('user_id', userId)
      .maybeSingle();
    if (ubErr) throw ubErr;

    const userUnits = String((ub as any)?.units || 'imperial').toLowerCase();
    const isImperial = userUnits !== 'metric';
    const wUnit = isImperial ? 'lb' : 'kg';

    const learnedFitness = (() => {
      try { return typeof (ub as any)?.learned_fitness === 'string' ? JSON.parse((ub as any).learned_fitness) : ((ub as any)?.learned_fitness || null); } catch { return (ub as any)?.learned_fitness || null; }
    })();
    const learningStatus = learnedFitness?.learning_status ? String(learnedFitness.learning_status) : null;

    // 28d norms (use completed workouts only)
    const normStart = addDaysISO(asOfDate, -27);
    const { data: normWorkouts, error: nwErr } = await supabase
      .from('workouts')
      .select('id,date,type,workout_status,planned_id,computed,workout_analysis,workout_metadata,rpe,session_rpe,strength_exercises')
      .eq('user_id', userId)
      .gte('date', normStart)
      .lte('date', asOfDate);
    if (nwErr) throw nwErr;

    const normExecution: number[] = [];
    const normDrift: number[] = [];
    const normRpe: number[] = [];
    const normRir: number[] = [];
    for (const w of Array.isArray(normWorkouts) ? normWorkouts : []) {
      if (String((w as any)?.workout_status || '').toLowerCase() !== 'completed') continue;

      // execution score
      // Baseline execution should match the planned-execution definition.
      if ((w as any)?.planned_id != null) {
        const ex = executionScoreFromWorkout(w as any);
        if (ex != null) normExecution.push(ex);
      }

      // HR drift: steady aerobic runs only (TrainingPeaks-style)
      if (String((w as any)?.type || '').toLowerCase() === 'run' && hrWorkoutTypeFromWorkout(w as any) === 'steady_state') {
        const d = driftBpmFromWorkout(w as any);
        if (d != null) normDrift.push(d);
      }

      // session RPE
      const srpe = sessionRpeFromWorkout(w as any);
      if (srpe != null) normRpe.push(srpe);

      // strength RIR
      if (String((w as any)?.type || '').toLowerCase() === 'strength') {
        const r = avgStrengthRirFromWorkout(w as any);
        if (r != null) normRir.push(r);
      }
    }

    const avg = (arr: number[], dp: number = 1): number | null => {
      if (!arr.length) return null;
      const v = arr.reduce((a, b) => a + b, 0) / arr.length;
      const m = Math.pow(10, dp);
      return Math.round(v * m) / m;
    };

    const norms28d = {
      hr_drift_avg_bpm: avg(normDrift, 1),
      hr_drift_sample_size: normDrift.length,
      session_rpe_avg: avg(normRpe, 1),
      session_rpe_sample_size: normRpe.length,
      strength_rir_avg: avg(normRir, 1),
      strength_rir_sample_size: normRir.length,
      execution_score_avg: avg(normExecution, 0),
      execution_score_sample_size: normExecution.length,
    };

    const dismissed = (ub as any)?.dismissed_suggestions || null;
    const dismissedDrift = (dismissed?.baseline_drift as Record<string, string>) || {};

    const baselines: CoachWeekContextResponseV1['baselines'] = {
      performance_numbers: (ub as any)?.performance_numbers || null,
      effort_paces: (ub as any)?.effort_paces || null,
      learned_fitness: learnedFitness || null,
      learning_status: learningStatus,
      norms_28d: norms28d,
      dismissed_suggestions: dismissed,
    };

    // Baseline drift suggestions: learned 1RM > baseline by 5%+, medium/high confidence.
    // Plan-aware guardrails:
    // - Hide during transition window, recovery/taper intent, or near-race window.
    // - Require meaningful sample count so suggestions are stable and goal-relevant.
    const perf = (ub as any)?.performance_numbers || {};
    const strength = learnedFitness?.strength_1rms || {};
    const raceDateIso = String(
      planConfig?.race_date ||
      planConfig?.event_date ||
      planConfig?.target_date ||
      '',
    ).slice(0, 10);
    const daysToRace = (() => {
      if (!raceDateIso) return null;
      try {
        const raceMs = parseISODateOnly(raceDateIso).getTime();
        const asOfMs = parseISODateOnly(asOfDate).getTime();
        return Math.floor((raceMs - asOfMs) / (24 * 60 * 60 * 1000));
      } catch {
        return null;
      }
    })();
    const shouldSuppressBaselineDriftSuggestions =
      isPlanTransitionPeriod ||
      weekIntent === 'recovery' ||
      weekIntent === 'taper' ||
      (daysToRace != null && daysToRace <= 28);

    const driftPairs: Array<{ lift: string; label: string; baseline: number; learned: number }> = [
      { lift: 'squat', label: 'Squat', baseline: Number(perf?.squat), learned: Number(strength?.squat?.value) },
      { lift: 'bench_press', label: 'Bench press', baseline: Number(perf?.bench), learned: Number(strength?.bench_press?.value) },
      { lift: 'deadlift', label: 'Deadlift', baseline: Number(perf?.deadlift), learned: Number(strength?.deadlift?.value) },
      { lift: 'overhead_press', label: 'Overhead press', baseline: Number(perf?.overheadPress1RM ?? perf?.ohp ?? perf?.overhead), learned: Number(strength?.overhead_press?.value) },
    ];
    const today = asOfDate;
    const baseline_drift_suggestions: Array<{ lift: string; label: string; baseline: number; learned: number; basis: string }> = [];
    if (!shouldSuppressBaselineDriftSuggestions) {
      for (const p of driftPairs) {
        if (!Number.isFinite(p.baseline) || p.baseline <= 0) continue;
        const rawLearned = p.learned;
        const rounded = Math.floor(rawLearned / 5) * 5;
        if (!Number.isFinite(rounded) || rounded < p.baseline * 1.05) continue;
        const liftData = strength[p.lift as keyof typeof strength];
        const conf = liftData?.confidence;
        if (conf !== 'high' && conf !== 'medium') continue;
        const dismissedAt = dismissedDrift[p.lift];
        if (dismissedAt) {
          const d = new Date(dismissedAt).getTime();
          const t = new Date(today).getTime();
          if (t - d < 30 * 24 * 60 * 60 * 1000) continue;
        }
        const sessions = Number(liftData?.sample_count ?? 0);
        if (sessions < 4) continue;
        baseline_drift_suggestions.push({
          ...p,
          learned: rounded,
          basis: `Estimated 1RM from ${sessions} session${sessions !== 1 ? 's' : ''} (${conf} confidence)`,
        });
      }
    }

    // =========================================================================
    // Baseline-relative response interpretation (what a coach would show)
    // =========================================================================
    const driftDelta = (reaction.hr_drift_avg_bpm != null && norms28d.hr_drift_avg_bpm != null)
      ? Math.round((reaction.hr_drift_avg_bpm - norms28d.hr_drift_avg_bpm) * 10) / 10
      : null;
    const rirDelta = (reaction.avg_strength_rir_7d != null && norms28d.strength_rir_avg != null)
      ? Math.round((reaction.avg_strength_rir_7d - norms28d.strength_rir_avg) * 10) / 10
      : null;
    const rpeDelta = (reaction.avg_session_rpe_7d != null && norms28d.session_rpe_avg != null)
      ? Math.round((reaction.avg_session_rpe_7d - norms28d.session_rpe_avg) * 10) / 10
      : null;
    const execDelta = (reaction.avg_execution_score != null && norms28d.execution_score_avg != null)
      ? Math.round((reaction.avg_execution_score - norms28d.execution_score_avg) * 1) / 1
      : null;

    const aerobicLabel: CoachWeekContextResponseV1['response']['aerobic']['label'] =
      driftDelta == null ? 'unknown' : driftDelta >= 3 ? 'stressed' : driftDelta <= -2 ? 'efficient' : 'stable';
    const structuralLabel: CoachWeekContextResponseV1['response']['structural']['label'] =
      rirDelta == null ? 'unknown' : rirDelta <= -0.5 ? 'fatigued' : rirDelta >= 0.5 ? 'fresh' : 'stable';
    const subjectiveLabel: CoachWeekContextResponseV1['response']['subjective']['label'] =
      rpeDelta == null ? 'unknown' : rpeDelta >= 0.7 ? 'strained' : rpeDelta <= -0.7 ? 'good' : 'stable';
    const absorptionLabel: CoachWeekContextResponseV1['response']['absorption']['label'] =
      execDelta == null ? 'unknown' : execDelta <= -5 ? 'slipping' : execDelta >= 3 ? 'good' : 'stable';

    const drivers: string[] = [];
    if (aerobicLabel === 'stressed') drivers.push('aerobic_drift_up');
    if (structuralLabel === 'fatigued') drivers.push('structural_rir_down');
    if (subjectiveLabel === 'strained') drivers.push('subjective_rpe_up');
    if (absorptionLabel === 'slipping') drivers.push('absorption_exec_down');

    const sampleSignals =
      (reaction.hr_drift_sample_size > 0 ? 1 : 0) +
      (reaction.rpe_sample_size_7d > 0 ? 1 : 0) +
      (reaction.rir_sample_size_7d > 0 ? 1 : 0) +
      (reaction.execution_sample_size > 0 ? 1 : 0);

    let overallLabel: CoachWeekContextResponseV1['response']['overall']['label'] = 'need_more_data';
    if (sampleSignals >= 2) {
      if (drivers.length >= 2) overallLabel = 'fatigue_signs';
      else if (drivers.length === 1) overallLabel = 'mixed_signals';
      else overallLabel = 'absorbing_well';
    }
    const overallConfidence = Math.max(0.35, Math.min(0.9, 0.35 + 0.15 * sampleSignals + 0.1 * Math.min(2, reaction.execution_sample_size)));

    const responseInterp: CoachWeekContextResponseV1['response'] = {
      aerobic: {
        label: aerobicLabel,
        drift_avg_bpm: reaction.hr_drift_avg_bpm,
        drift_norm_28d_bpm: norms28d.hr_drift_avg_bpm,
        drift_delta_bpm: driftDelta,
        sample_size: reaction.hr_drift_sample_size,
      },
      structural: {
        label: structuralLabel,
        strength_rir_7d: reaction.avg_strength_rir_7d,
        strength_rir_norm_28d: norms28d.strength_rir_avg,
        rir_delta: rirDelta,
        sample_size: reaction.rir_sample_size_7d,
      },
      subjective: {
        label: subjectiveLabel,
        rpe_7d: reaction.avg_session_rpe_7d,
        rpe_norm_28d: norms28d.session_rpe_avg,
        rpe_delta: rpeDelta,
        sample_size: reaction.rpe_sample_size_7d,
      },
      absorption: {
        label: absorptionLabel,
        execution_score: reaction.avg_execution_score,
        execution_norm_28d: norms28d.execution_score_avg,
        execution_delta: execDelta,
        sample_size: reaction.execution_sample_size,
      },
      overall: {
        label: overallLabel,
        confidence: Number(overallConfidence.toFixed(2)),
        drivers,
      },
      run_session_types_7d: runSessionTypes7d,
    };

    // Rolling windows (residual context)
    const acuteStart = addDaysISO(asOfDate, -6);
    const chronicStart = addDaysISO(asOfDate, -27);

    const { data: rolling, error: rErr } = await supabase
      .from('workouts')
      .select('id,workload_actual,date,workout_status,type,name,planned_id')
      .eq('user_id', userId)
      .gte('date', chronicStart)
      .lte('date', asOfDate);
    if (rErr) throw rErr;

    const completedRolling = (rolling || []).filter((r: any) => String(r?.workout_status || '').toLowerCase() === 'completed');
    const acute7Rows = completedRolling.filter((r: any) => String(r?.date) >= acuteStart);
    const acute7Load = acute7Rows.reduce((sum: number, r: any) => sum + (safeNum(r?.workload_actual) || 0), 0);
    const chronic28Load = completedRolling.reduce((sum: number, r: any) => sum + (safeNum(r?.workload_actual) || 0), 0);

    const normalizeType = (t: any): string => {
      const s = String(t || '').toLowerCase();
      if (!s) return 'other';
      // Brick must be checked first — a brick session often contains 'run' or 'bike'
      // in its sub-type (e.g. 'brick_run', 'brick_bike', 'brick'). Identifying it as
      // 'brick' preserves the transition context for the LLM.
      if (s === 'brick' || s.startsWith('brick_') || s.endsWith('_brick')) return 'brick';
      if (s.includes('run')) return 'run';
      if (s.includes('bike') || s.includes('ride') || s.includes('cycl')) return 'bike';
      if (s.includes('swim')) return 'swim';
      if (s.includes('strength')) return 'strength';
      if (s.includes('mobility') || s === 'pt') return 'mobility';
      return s;
    };

    const byType = (rows: any[]): Array<{
      type: string;
      total_sessions: number;
      total_load: number;
      linked_sessions: number;
      linked_load: number;
      extra_sessions: number;
      extra_load: number;
    }> => {
      const m = new Map<string, { total_sessions: number; total: number; linked_sessions: number; linked: number; extra_sessions: number; extra: number }>();
      for (const r of rows) {
        const typ = normalizeType(r?.type);
        const wl = safeNum(r?.workload_actual) || 0;
        const isLinked = r?.planned_id != null && String(r.planned_id) !== '';
        const cur = m.get(typ) || { total_sessions: 0, total: 0, linked_sessions: 0, linked: 0, extra_sessions: 0, extra: 0 };
        cur.total_sessions += 1;
        cur.total += wl;
        if (isLinked) { cur.linked_sessions += 1; cur.linked += wl; }
        else { cur.extra_sessions += 1; cur.extra += wl; }
        m.set(typ, cur);
      }
      return Array.from(m.entries())
        .map(([type, v]) => ({
          type,
          total_sessions: v.total_sessions,
          total_load: Math.round(v.total),
          linked_sessions: v.linked_sessions,
          linked_load: Math.round(v.linked),
          extra_sessions: v.extra_sessions,
          extra_load: Math.round(v.extra),
        }))
        .sort((a, b) => b.total_load - a.total_load);
    };

    const topSessionsAcute7 = acute7Rows
      .map((r: any) => ({
        date: String(r?.date || '').slice(0, 10),
        type: normalizeType(r?.type),
        name: r?.name != null ? String(r.name) : null,
        workload_actual: safeNum(r?.workload_actual) || 0,
        linked: r?.planned_id != null && String(r.planned_id) !== '',
      }))
      .sort((a: any, b: any) => (b.workload_actual || 0) - (a.workload_actual || 0))
      .slice(0, 3);

    const acwr = chronic28Load > 0 ? (acute7Load / 7) / (chronic28Load / 28) : null;

    const metrics: CoachWeekContextResponseV1['metrics'] = {
      wtd_planned_load: plannedWtdLoad || 0,
      wtd_actual_load: actualWtdLoad || 0,
      wtd_completion_ratio: wtdCompletionRatio,
      acute7_actual_load: completedRolling.length ? acute7Load : null,
      chronic28_actual_load: completedRolling.length ? chronic28Load : null,
      acwr,
    };

    const v = buildVerdict(metrics, methodologyId, methodologyCtx, reaction, isPlanTransitionPeriod);

    // =========================================================================
    // Deterministic training state (plan-aware topline for dumb clients)
    // =========================================================================
    const intentLabel =
      weekIntent === 'build' ? 'Build week'
      : weekIntent === 'peak' ? 'Peak week'
      : weekIntent === 'taper' ? 'Taper week'
      : weekIntent === 'recovery' ? 'Recovery week'
      : weekIntent === 'baseline' ? 'Baseline week'
      : 'Plan';

    const athleteContextByWeek = activePlan?.athlete_context_by_week;
    const athleteContextStr = (() => {
      if (!activePlan || weekIndex == null || !athleteContextByWeek || typeof athleteContextByWeek !== 'object') return null;
      const ctx = athleteContextByWeek[String(weekIndex)] ?? athleteContextByWeek[weekIndex];
      return (typeof ctx === 'string' && ctx.trim()) ? ctx.trim() : null;
    })();
    const athleteContextSuggestsIllness = athleteContextStr && /sick|flu|covid|illness|ill\b|not feeling|under the weather/i.test(athleteContextStr);

    const primaryDeltaLine = (() => {
      const d = responseInterp.overall.drivers || [];
      if (d.includes('absorption_exec_down')) {
        const delta = responseInterp.absorption.execution_delta;
        const n = reaction.execution_sample_size || 0;
        return delta != null ? `Execution: ${delta}% vs baseline (n=${n})` : `Execution: below baseline (n=${n})`;
      }
      if (d.includes('aerobic_drift_up')) {
        const delta = responseInterp.aerobic.drift_delta_bpm;
        const n = reaction.hr_drift_sample_size || 0;
        return delta != null ? `Aerobic strain: +${Math.abs(delta)} bpm drift vs baseline (n=${n})` : `Aerobic strain: elevated drift vs baseline (n=${n})`;
      }
      if (d.includes('structural_rir_down')) {
        const delta = responseInterp.structural.rir_delta;
        const n = reaction.rir_sample_size_7d || 0;
        return delta != null ? `Strength fatigue: ${delta} RIR vs baseline (n=${n})` : `Strength fatigue: lower RIR vs baseline (n=${n})`;
      }
      if (d.includes('subjective_rpe_up')) {
        const delta = responseInterp.subjective.rpe_delta;
        const n = reaction.rpe_sample_size_7d || 0;
        return delta != null ? `Perceived strain: +${Math.abs(delta)} RPE vs baseline (n=${n})` : `Perceived strain: higher RPE vs baseline (n=${n})`;
      }
      return null;
    })();

    const training_state: CoachWeekContextResponseV1['training_state'] = (() => {
      const kicker = `${intentLabel} • Response vs baseline`;
      const conf = responseInterp.overall.confidence || 0;
      const baseline_days = 28;
      const load_ramp_acwr = metrics.acwr;
      const load_ramp = {
        acute7_total_load: completedRolling.length ? Math.round(acute7Load) : null,
        chronic28_total_load: completedRolling.length ? Math.round(chronic28Load) : null,
        acute7_by_type: byType(acute7Rows),
        chronic28_by_type: byType(completedRolling),
        top_sessions_acute7: topSessionsAcute7,
      };
      if (responseInterp.overall.label === 'need_more_data') {
        return {
          code: 'need_more_data',
          kicker,
          title: 'Not enough data',
          subtitle: 'We need a few more logged sessions to compare against your baseline.',
          confidence: conf,
          baseline_days,
          load_ramp_acwr,
          load_ramp,
        };
      }
      if (v.code === 'recover_overreaching' || (responseInterp.overall.drivers.length >= 2 && responseInterp.overall.label === 'fatigue_signs')) {
        return {
          code: 'overstrained',
          kicker,
          title: 'High fatigue',
          subtitle: primaryDeltaLine || 'Multiple response markers are worse than your normal.',
          confidence: conf,
          baseline_days,
          load_ramp_acwr,
          load_ramp,
        };
      }
      if (v.code === 'caution_ramping_fast' || (responseInterp.overall.drivers.length === 1 && !isPlanTransitionPeriod)) {
        if (athleteContextSuggestsIllness && (v.code === 'undertraining' || recoverySignaledExtrasCount > 0)) {
          return {
            code: 'strained',
            kicker,
            title: 'Recovery',
            subtitle: primaryDeltaLine ? `Response markers may reflect illness rather than training load. ${primaryDeltaLine}` : 'Take the time you need. Response markers can be skewed when sick.',
            confidence: conf,
            baseline_days,
            load_ramp_acwr,
            load_ramp,
          };
        }
        return {
          code: 'strained',
          kicker,
          title: 'Elevated fatigue',
          subtitle: primaryDeltaLine || 'One response marker is worse than your normal.',
          confidence: conf,
          baseline_days,
          load_ramp_acwr,
          load_ramp,
        };
      }
      const okTitle = (weekIntent === 'recovery' || weekIntent === 'taper') ? 'Recovery' : 'Normal';
      return {
        code: 'strain_ok',
        kicker,
        title: okTitle,
        subtitle: (weekIntent === 'recovery' || weekIntent === 'taper')
          ? 'Your response markers look appropriate for a down week vs your baseline.'
          : 'Your response markers are within your normal range vs your baseline.',
        confidence: conf,
        baseline_days,
        load_ramp_acwr,
        load_ramp,
      };
    })();

    // =========================================================================
    // Fitness direction + Readiness state + Interference
    // =========================================================================

    // Fetch latest athlete_snapshot for interference data
    let latestSnapshot: any = null;
    try {
      const { data: snapRows } = await supabase
        .from('athlete_snapshot')
        .select('interference, run_easy_hr_trend, strength_volume_trend, strength_top_lifts, acwr, rpe_trend')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(1);
      latestSnapshot = snapRows?.[0] ?? null;
    } catch {}

    // Fitness direction: combine aerobic + structural trends
    const fitnessDirection = (() => {
      const aerobic = responseInterp.aerobic;
      const structural = responseInterp.structural;

      const aerobicGood = aerobic.label === 'efficient';
      const aerobicBad = aerobic.label === 'stressed';
      const structGood = structural.label === 'fresh';
      const structBad = structural.label === 'fatigued';

      if (aerobicGood && (structGood || structural.label === 'stable')) return 'improving';
      if (aerobicBad && structBad) return 'declining';
      if (aerobicBad || structBad) return 'mixed';
      if (aerobicGood || structGood) return 'improving';
      return 'stable';
    })() as 'improving' | 'stable' | 'declining' | 'mixed';

    // Readiness state: combine RPE trend, ACWR, and response
    const readinessState = (() => {
      const acwrVal = metrics.acwr;
      const overallLabel = responseInterp.overall.label;
      const verdictCode = v.code;

      if (verdictCode === 'recover_overreaching') return 'overreached';
      if (verdictCode === 'caution_ramping_fast') return 'fatigued';
      if (overallLabel === 'fatigue_signs' && !isPlanTransitionPeriod) return 'fatigued';
      if (isAcwrFatiguedSignal(acwrVal, isPlanTransitionPeriod)) return 'fatigued';
      if (isAcwrDetrainedSignal(acwrVal)) return 'detrained';
      if (overallLabel === 'absorbing_well') return 'fresh';
      return 'normal';
    })() as 'fresh' | 'normal' | 'fatigued' | 'overreached' | 'detrained';

    const interference = latestSnapshot?.interference ?? null;

    // Plan adaptation suggestions (Phase 3): deload / add recovery when overreaching or fatigued
    const planAdaptationDismissed = (dismissed?.plan_adaptation as Record<string, string>) || {};
    const todayMs = new Date(asOfDate).getTime();
    const cooldownMs = 30 * 24 * 60 * 60 * 1000;
    const plan_adaptation_suggestions: Array<{ code: string; title: string; details: string }> = [];
    if (activePlan && !isPlanTransitionPeriod && (weekIntent !== 'recovery' && weekIntent !== 'taper')) {
      const addSuggestion = (code: string, title: string, details: string) => {
        const dismissedAt = planAdaptationDismissed[code];
        if (dismissedAt) {
          const d = new Date(dismissedAt).getTime();
          if (todayMs - d < cooldownMs) return;
        }
        plan_adaptation_suggestions.push({ code, title, details });
      };
      if (readinessState === 'overreached' || v.code === 'recover_overreaching') {
        addSuggestion(
          'deload',
          'Consider a deload week',
          "You're showing signs of overreaching. A deload or recovery week before continuing to build can help you absorb your gains.",
        );
      } else if (readinessState === 'fatigued' || v.code === 'caution_ramping_fast') {
        addSuggestion(
          'add_recovery',
          'Consider adding recovery',
          'Fatigue is elevated. Swap a quality session for easy or add a rest day this week.',
        );
      }
    }

    // Athlete-provided context (athleteContextStr computed earlier for training_state)

    // =========================================================================
    // AI week narrative — coach paragraph from structured facts
    // =========================================================================
    let week_narrative: string | null = null;
    try {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey) {
        const narrativeFacts: string[] = [];
        let routeInsightLine: string | null = null;

        // Regular routes intelligence (course-specific progression)
        try {
          const { data: routeWeekRows } = await supabase
            .from('route_progress_metrics')
            .select('route_cluster_id,metric_date,effort_adjusted_pace_sec_per_km,avg_pace_sec_per_km,improvement_score,confidence_score,distance_m')
            .eq('user_id', userId)
            .gte('metric_date', weekStartDate)
            .lte('metric_date', weekEndDate)
            .order('metric_date', { ascending: false })
            .limit(30);

          const weekRouteRows = Array.isArray(routeWeekRows) ? routeWeekRows : [];
          const routeIds = Array.from(new Set(weekRouteRows.map((r: any) => String(r.route_cluster_id || '')).filter(Boolean)));
          if (routeIds.length > 0) {
            const [{ data: clusterRows }, { data: priorRows }] = await Promise.all([
              supabase
                .from('route_clusters')
                .select('id,name')
                .eq('user_id', userId)
                .in('id', routeIds),
              supabase
                .from('route_progress_metrics')
                .select('route_cluster_id,effort_adjusted_pace_sec_per_km,metric_date')
                .eq('user_id', userId)
                .in('route_cluster_id', routeIds)
                .lt('metric_date', weekStartDate)
                .gte('metric_date', addDaysISO(weekStartDate, -84))
                .order('metric_date', { ascending: false }),
            ]);

            const nameById = new Map<string, string>();
            for (const c of (Array.isArray(clusterRows) ? clusterRows : [])) {
              nameById.set(String((c as any)?.id || ''), String((c as any)?.name || 'regular route'));
            }

            const summarize = routeIds.slice(0, 2).map((rid) => {
              const nowRows = weekRouteRows.filter((r: any) => String(r.route_cluster_id) === rid);
              const prevVals = (Array.isArray(priorRows) ? priorRows : [])
                .filter((r: any) => String(r.route_cluster_id) === rid)
                .map((r: any) => safeNum((r as any).effort_adjusted_pace_sec_per_km))
                .filter((n: number | null): n is number => n != null)
                .slice(0, 6);
              const nowVals = nowRows
                .map((r: any) => safeNum((r as any).effort_adjusted_pace_sec_per_km))
                .filter((n: number | null): n is number => n != null);
              if (!nowVals.length || !prevVals.length) return null;
              const nowAvg = nowVals.reduce((a, b) => a + b, 0) / nowVals.length;
              const prevAvg = prevVals.reduce((a, b) => a + b, 0) / prevVals.length;
              if (prevAvg <= 0) return null;
              const pct = ((prevAvg - nowAvg) / prevAvg) * 100;
              const routeName = nameById.get(rid) || 'regular route';
              const direction = pct >= 0 ? 'faster' : 'slower';
              const magnitude = Math.abs(pct);
              const conf = nowRows
                .map((r: any) => safeNum((r as any).confidence_score))
                .filter((n: number | null): n is number => n != null);
              const confAvg = conf.length ? (conf.reduce((a, b) => a + b, 0) / conf.length) : null;
              return `${routeName}: ${magnitude.toFixed(1)}% ${direction}${confAvg != null ? ` (confidence ${Math.round(confAvg * 100)}%)` : ''}`;
            }).filter(Boolean) as string[];

            if (summarize.length) {
              routeInsightLine = `REGULAR ROUTE PROGRESS: ${summarize.join('; ')}.`;
            }
          }
        } catch (routeErr) {
          console.warn('[coach] route progression summary failed (non-fatal):', (routeErr as any)?.message || routeErr);
        }

        // Narrative facts are built from the same canonical weekly inputs used for
        // deterministic state. Do not read parallel fact pipelines here.
        const completedNarrativeWorkouts = (Array.isArray(weekWorkouts) ? weekWorkouts : [])
          .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
          .sort((a: any, b: any) => {
            const da = String(a?.__local_date || a?.date || '');
            const db = String(b?.__local_date || b?.date || '');
            if (da !== db) return da.localeCompare(db);
            return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
          });

        // Athlete-provided context (highest priority — never guess over this)
        if (athleteContextStr) {
          narrativeFacts.unshift(`ATHLETE SAYS (use this, do not guess): ${athleteContextStr}`);
        }

        // Plan context
        if (activePlan) {
          const planName = activePlan.name || 'training plan';
          const totalWeeks = activePlan.duration_weeks || null;
          const weekNum = weekIndex ?? '?';
          const intentStr = weekIntent && weekIntent !== 'unknown' ? weekIntent : null;
          let planLine = `The athlete is on "${planName}"`;
          if (totalWeeks) planLine += ` (${totalWeeks} weeks total)`;
          planLine += `, currently in week ${weekNum}`;
          if (intentStr) planLine += ` which is a ${intentStr} week`;
          planLine += '.';
          narrativeFacts.push(planLine);

          // Multi-event: surface each secondary active plan with its own race date + phase
          if (secondaryPlans.length > 0) {
            narrativeFacts.push(`MULTI-EVENT ATHLETE: training for ${allActivePlans.length} events simultaneously.`);
            for (const sp of secondaryPlans) {
              const spName = sp.config?.race_name || sp.name || 'event';
              const spSport = sp.config?.sport || sp.config?.plan_type || 'sport';
              const spDist  = sp.config?.distance || sp.config?.race_distance || null;
              const spRace  = sp.config?.race_date ? new Date(sp.config.race_date).toDateString() : null;
              const spWeeks = sp.duration_weeks ?? null;
              const spWkIdx = computeWeekIndex(sp.config, asOfDate, 'Monday' as any, spWeeks);
              const spPhase = weekIntentFromContract(sp.config, spWkIdx)?.intent ?? 'unknown';
              let spLine = `ALSO TRAINING FOR: "${spName}"`;
              if (spDist) spLine += ` (${spDist} ${spSport})`;
              if (spRace) spLine += ` on ${spRace}`;
              if (spWkIdx != null) spLine += ` — week ${spWkIdx} of ${spWeeks ?? '?'}`;
              if (spPhase !== 'unknown') spLine += ` (${spPhase} phase)`;
              narrativeFacts.push(spLine + '.');
            }
            narrativeFacts.push('When coaching, address how this week serves BOTH events. Flag any sessions this week that build toward the secondary event. Do not suggest adding extra sessions — all sessions from all plans are already included in the session list.');
          }

          // Triathlon / multi-sport methodology context
          // This is critical: without it, the LLM gives generic "push harder" advice
          // to a completion athlete who is intentionally staying in Zone 3.
          const triMethodFact = triMethodologyFact(planConfig, allActivePlans);
          if (triMethodFact) narrativeFacts.push(triMethodFact);

          narrativeFacts.push('IMPORTANT: There is an active training plan. Do NOT suggest adding extra sessions. If sessions were missed, suggest hitting the planned sessions next week. If suggesting changes, frame them as adjustments within the existing plan.');
          if (isPlanTransitionPeriod) {
            narrativeFacts.push(`NOTE: This is an early week of a new plan (within the first 2 weeks). The 7-day load ratio and 28-day baseline both overlap with the previous training cycle, so any "overreaching" or elevated load signals are unreliable artifacts of the plan transition — do NOT flag load as elevated or suggest recovery based on the load ratio. Focus exclusively on execution quality of the planned sessions and whether the athlete feels good.`);
          }
        } else {
          narrativeFacts.push('The athlete is NOT on a structured plan. Suggestions for adding or adjusting sessions are appropriate.');
        }

        // Session completion
        narrativeFacts.push(`Planned key sessions: ${reaction.key_sessions_planned}. Completed and linked: ${reaction.key_sessions_linked}. Missed: ${reaction.key_sessions_gaps}. Extra unplanned sessions: ${reaction.extra_sessions}.`);
        if (routeInsightLine) narrativeFacts.push(routeInsightLine);
        if (recoverySignaledExtrasCount > 0) {
          narrativeFacts.push(`ATHLETE SIGNALED RECOVERY: ${recoverySignaledExtrasCount} unplanned session(s) with low RPE or positive feeling (easy/recovery intent).`);
        }

        // Missed session reasons (athlete-provided — use these, do not guess)
        const gapsWithReasons = (reaction.key_session_gaps_details || []).filter((g: any) => g.skip_reason || g.skip_note);
        if (gapsWithReasons.length > 0) {
          const lines = gapsWithReasons.map((g: any) => {
            const parts = [`${g.date} ${g.type}: ${g.skip_reason || 'no tag'}`];
            if (g.skip_note) parts.push(`(${g.skip_note})`);
            return parts.join(' ');
          });
          narrativeFacts.push(`MISSED SESSION REASONS (athlete-provided): ${lines.join('; ')}.`);
        }

        // ── Per-workout detail from canonical weekly workouts only ──
        for (const w of completedNarrativeWorkouts) {
          const discipline = normalizeType((w as any)?.type);
          const localDate = String((w as any)?.__local_date || (w as any)?.date || '').slice(0, 10);
          const localWhen = sessionLocalLabel(w, localDate, userTz);
          const parts = [`${localWhen} ${localDate} ${discipline}`];
          const wl = safeNum((w as any)?.workload_actual);
          if (wl != null) parts.push(`${Math.round(wl)} pts load`);
          const rpe = rpeFromWorkout(w);
          if (rpe != null) parts.push(`RPE ${rpe}/10`);
          const feeling = feelingFromWorkout(w);
          if (feeling) parts.push(`feeling: ${feeling}`);
          const ex = executionScoreFromWorkout(w);
          if (ex != null) parts.push(`execution ${Math.round(ex)}%`);
          narrativeFacts.push(`SESSION: ${parts.join(' | ')}`);
        }

        // ── Strength exercise summary from workout payloads only ──
        const strengthEntries: Array<{ name: string; best_weight: number; best_reps: number; avg_rir: number | null }> = [];
        for (const w of completedNarrativeWorkouts) {
          if (normalizeType((w as any)?.type) !== 'strength') continue;
          const exRaw = (w as any)?.strength_exercises;
          const exArr = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (parseJson(exRaw) || []) : []);
          if (!Array.isArray(exArr)) continue;
          for (const ex of exArr) {
            const sets = Array.isArray(ex?.sets) ? ex.sets : [];
            const weights: number[] = [];
            const reps: number[] = [];
            const rirs: number[] = [];
            for (const s of sets) {
              const wt = safeNum((s as any)?.weight);
              const rp = safeNum((s as any)?.reps);
              const rr = safeNum((s as any)?.rir);
              if (wt != null) weights.push(wt);
              if (rp != null) reps.push(rp);
              if (rr != null) rirs.push(rr);
            }
            const bestWeight = weights.length ? Math.max(...weights) : safeNum(ex?.weight) || 0;
            const bestReps = reps.length ? Math.max(...reps) : safeNum(ex?.reps) || 0;
            const avgRir = rirs.length ? (rirs.reduce((a, b) => a + b, 0) / rirs.length) : null;
            strengthEntries.push({
              name: String(ex?.name || 'exercise'),
              best_weight: bestWeight,
              best_reps: bestReps,
              avg_rir: avgRir,
            });
          }
        }
        if (strengthEntries.length > 0) {
          const exLines = strengthEntries.slice(0, 10).map((e) => {
            const rirPart = e.avg_rir != null ? `, avg ${e.avg_rir.toFixed(1)} reps in reserve` : '';
            return `${e.name}: best ${Math.round(e.best_weight)}${wUnit} × ${Math.round(e.best_reps)}${rirPart}`;
          });
          narrativeFacts.push(`STRENGTH EXERCISES THIS WEEK: ${exLines.join('; ')}.`);
        }

        // Load by discipline
        const loadLines = training_state.load_ramp.acute7_by_type.map((r: any) => {
          const plannedPct = r.total_load > 0 ? Math.round((r.linked_load / r.total_load) * 100) : 0;
          const extraPct = 100 - plannedPct;
          return `${r.type}: ${Math.round(r.total_load)} pts total (${plannedPct}% planned, ${extraPct}% extra/unplanned)`;
        });
        if (loadLines.length) narrativeFacts.push(`Training load by discipline this week: ${loadLines.join('; ')}.`);

        // ── Athlete performance baselines ─────────────────────────────────────
        // Without these, the LLM guesses whether a 200W ride is hard or easy.
        // With them it can say "your 210W average was 88% of your FTP — solid tempo."
        const perfNums = (ub as any)?.performance_numbers || {};
        const effortPaces = (ub as any)?.effort_paces || {};
        const baselineLines: string[] = [];
        const ftpVal = perfNums?.ftp || perfNums?.bike_ftp || null;
        if (ftpVal) baselineLines.push(`Bike FTP: ${Math.round(ftpVal)}W`);
        const swimCssSec = perfNums?.swim_pace_per_100_sec || perfNums?.swimPacePer100 || null;
        if (swimCssSec) {
          const cssMins = Math.floor(Number(swimCssSec) / 60);
          const cssSecs = Math.round(Number(swimCssSec) % 60);
          baselineLines.push(`Swim CSS: ${cssMins}:${String(cssSecs).padStart(2, '0')}/100yd`);
        }
        const threshPace = effortPaces?.threshold || effortPaces?.z4 || perfNums?.threshold_pace_min_per_mi || null;
        if (threshPace) baselineLines.push(`Run threshold pace: ${threshPace} min/${isImperial ? 'mi' : 'km'}`);
        const fiveKPace = effortPaces?.five_k || perfNums?.five_k_pace_min_per_mi || null;
        if (fiveKPace) baselineLines.push(`5K pace: ${fiveKPace} min/${isImperial ? 'mi' : 'km'}`);
        if (baselineLines.length > 0) {
          narrativeFacts.push(
            `ATHLETE PERFORMANCE BASELINES: ${baselineLines.join('. ')}. ` +
            `Use these when commenting on workout intensity (e.g. "your 210W average was 88% of your FTP — solid tempo work").`
          );
        }

        // ACWR
        if (metrics.acwr != null) {
          const acwrStatus = getAcwrStatus(metrics.acwr, activePlan ? {
            hasActivePlan: true,
            weekIntent: weekIntent as any,
            isRecoveryWeek: weekIntent === 'recovery',
            isTaperWeek: weekIntent === 'taper',
          } : null);
          const acwrRisk = getAcwrRiskFlag(metrics.acwr, isPlanTransitionPeriod);
          const acwrLabel = isPlanTransitionPeriod
            ? 'in plan transition (includes prior training cycle — ignore this ratio)'
            : acwrStatus === 'undertrained'
              ? 'under-reached'
              : acwrStatus === 'optimal' || acwrStatus === 'optimal_recovery'
                ? (acwrStatus === 'optimal_recovery' ? 'planned recovery zone' : 'in the optimal zone')
                : acwrRisk === 'overreaching'
                  ? 'overreaching'
                  : acwrRisk === 'fast'
                    ? 'ramping fast'
                    : 'in the optimal zone';
          narrativeFacts.push(`Training volume ratio (this week vs last 4 weeks): ${metrics.acwr.toFixed(2)} — ${acwrLabel}.`);
        }

        // Body response vs baseline
        if (reaction.avg_execution_score != null) narrativeFacts.push(`Average execution score: ${reaction.avg_execution_score}% (baseline: ${baselines.norms_28d.execution_score_avg ?? '?'}%).`);
        if (reaction.avg_session_rpe_7d != null) narrativeFacts.push(`Average perceived effort: ${reaction.avg_session_rpe_7d}/10 (baseline: ${baselines.norms_28d.session_rpe_avg ?? '?'}/10).`);
        if (reaction.avg_strength_rir_7d != null) narrativeFacts.push(`Average strength reps in reserve: ${reaction.avg_strength_rir_7d} (baseline: ${baselines.norms_28d.strength_rir_avg ?? '?'}).`);
        if (reaction.hr_drift_avg_bpm != null) narrativeFacts.push(`Average cardiac drift: ${reaction.hr_drift_avg_bpm} bpm (baseline: ${baselines.norms_28d.hr_drift_avg_bpm ?? '?'} bpm).`);

        // Per-discipline execution breakdown
        const execByDiscipline: Record<string, number[]> = {};
        for (const w of completedNarrativeWorkouts) {
          const score = executionScoreFromWorkout(w);
          if (score == null) continue;
          const d = normalizeType((w as any)?.type);
          (execByDiscipline[d] = execByDiscipline[d] || []).push(score);
        }
        const execLines = Object.entries(execByDiscipline).map(([d, scores]) => {
          const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          return `${d}: ${avg}%`;
        });
        if (execLines.length > 1) narrativeFacts.push(`Execution by discipline: ${execLines.join(', ')}.`);

        // 4-week deltas
        const deltas: string[] = [];
        if (responseInterp.aerobic.drift_delta_bpm != null) deltas.push(`aerobic efficiency ${responseInterp.aerobic.drift_delta_bpm < 0 ? 'improving' : 'worsening'} (${responseInterp.aerobic.drift_delta_bpm > 0 ? '+' : ''}${responseInterp.aerobic.drift_delta_bpm} bpm drift)`);
        if (responseInterp.structural.rir_delta != null) deltas.push(`strength fatigue ${responseInterp.structural.rir_delta < 0 ? 'increasing' : 'decreasing'} (${responseInterp.structural.rir_delta > 0 ? '+' : ''}${responseInterp.structural.rir_delta} reps in reserve)`);
        if (responseInterp.subjective.rpe_delta != null) deltas.push(`perceived effort ${responseInterp.subjective.rpe_delta > 0 ? 'increasing' : 'decreasing'} (${responseInterp.subjective.rpe_delta > 0 ? '+' : ''}${responseInterp.subjective.rpe_delta})`);
        if (responseInterp.absorption.execution_delta != null) deltas.push(`execution quality ${responseInterp.absorption.execution_delta > 0 ? 'improving' : 'declining'} (${responseInterp.absorption.execution_delta > 0 ? '+' : ''}${responseInterp.absorption.execution_delta}%)`);
        if (deltas.length) narrativeFacts.push(`4-week trends: ${deltas.join(', ')}.`);

        // Deterministic verdict
        narrativeFacts.push(`Overall status: ${training_state.title}.`);
        narrativeFacts.push(`Fitness direction: ${fitnessDirection}. Readiness: ${readinessState}.`);

        // Interference signal
        if (interference && interference.status === 'interference_detected') {
          narrativeFacts.push(`INTERFERENCE ALERT: ${interference.detail}`);
        } else if (interference && interference.aerobic && interference.structural) {
          narrativeFacts.push(`System balance: aerobic is ${interference.aerobic}, structural is ${interference.structural}. No interference detected.`);
        }

        const todayDay = (() => {
          try { return new Date(asOfDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', ...(userTz ? { timeZone: userTz } : {}) }); }
          catch { return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(asOfDate + 'T12:00:00Z').getUTCDay()]; }
        })();
        // Dynamic coach persona based on active sport(s).
        // A triathlete deserves a coach who speaks swim/bike/run fluently — not a
        // running coach who "also sees some cross-training."
        const hasTri = allActivePlans.some(p =>
          String(p.config?.sport || '').toLowerCase().includes('tri') ||
          String(p.config?.plan_type || '').toLowerCase().includes('tri') ||
          String(p.config?.plan_contract_v1?.sport || '').toLowerCase() === 'multi_sport',
        );
        const coachPersona = hasTri
          ? `You are a multi-sport triathlon coach writing a weekly check-in for your athlete.`
          : `You are a personal coach writing a weekly check-in for your athlete.`;

        const narrativePrompt = `${coachPersona} Today is ${todayDay}, ${asOfDate}. You have detailed facts about every session they did this week, including exactly what was planned vs what they actually did. Write 3-4 sentences in second person. Be specific and practical. Use day names instead of raw dates.

STYLE (Training Status): sentence 1 = status + why in plain language. sentence 2 = what happened this week (completed vs missed, only past sessions). sentence 3 = one clear next action.

NEVER GUESS WHY: If the facts include athlete-provided reasons, use those reasons. Otherwise, state what happened without speculation. Only explain causes when the athlete explicitly provided them.

TIME ANCHORING IS STRICT: For each SESSION fact, use the provided local day/time label exactly as the source of truth. Do not rename the day or infer a different day from dates.

Connect the dots when you have athlete context: if they said they had the flu, that explains missed sessions. If they said they went heavier on purpose, that explains the weight deviation. If their running efficiency improved, say so. If there is an INTERFERENCE ALERT, explain it in plain language.

CRITICAL: If the athlete has an active training plan, NEVER suggest adding extra sessions or workouts. If sessions were missed, tell them to prioritize the planned sessions next week. Frame adjustments only as intensity changes within existing planned sessions.

DAY PRECISION RULE: Never mention a specific day unless that exact day appears in SESSION or key-session facts for this week. If unsure, use generic wording about the next planned session.

End with one concrete, actionable suggestion. Do NOT use jargon like ACWR, RIR, RPE, TRIMP, or sample sizes. Speak like a real coach talking to their athlete.

UNITS: The athlete uses ${isImperial ? 'imperial (lb, miles)' : 'metric (kg, km)'}. Always use ${wUnit} for weights and ${isImperial ? 'miles' : 'km'} for distances. The facts below already use the correct units.

${userTz ? `TIMEZONE: The athlete is in ${userTz}. All dates in the facts are in their local time.` : ''}
${isPlanTransitionPeriod ? `TRANSITION MODE (first 2 weeks of a new plan): Do NOT mention percentage-over-plan language, deviation percentages, "more/less than planned" math, or fatigue/load warnings derived from plan-transition data. Focus only on execution quality, consistency, and the next planned sessions.` : ''}

FACTS:
${narrativeFacts.join('\n')}`;

        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: hasTri
                  ? 'You are an expert multi-sport triathlon coach fluent in swim, bike, run, and strength. Write a single paragraph (3-5 sentences). No bullets, no headers, no jargon. Second person. Conversational but knowledgeable. When referencing workouts, use the sport-specific context (e.g., power for bike, pace per 100 for swim, pace per mile for run). For brick sessions, acknowledge the transition component.'
                  : 'You are an expert endurance and strength coach. Write a single paragraph (3-5 sentences). No bullets, no headers, no jargon. Second person. Conversational but knowledgeable.' },
              { role: 'user', content: narrativePrompt },
            ],
            temperature: 0,
            seed: 42,
            max_tokens: 300,
          }),
        });
        if (resp.ok) {
          const aiData = await resp.json();
          const raw = String(aiData?.choices?.[0]?.message?.content || '').trim();
          week_narrative = raw || null;
        }
      }
    } catch (narErr: any) {
      console.warn('[coach] week narrative generation failed (non-fatal):', narErr?.message || narErr);
    }

    // Phase 3.5: Marathon readiness checklist (when run data exists)
    let marathon_readiness: CoachWeekContextResponseV1['marathon_readiness'];
    try {
      const mr = await computeMarathonReadiness(userId, asOfDate, acwr ?? null, supabase);
      marathon_readiness = mr ?? undefined;
      // When athlete says they're sick/injured and readiness is needs_work, add a recovery-focused note
      if (marathon_readiness?.summary === 'needs_work' && athleteContextStr) {
        const ctx = athleteContextStr.toLowerCase();
        if (/\b(sick|ill|flu|covid|virus|injured|injury|hurt)\b/.test(ctx)) {
          marathon_readiness = {
            ...marathon_readiness,
            context_note: 'Your gaps may reflect being sick — recover first, then reassess. You can still finish; prioritize health over hitting every number.',
          };
        }
      }
    } catch (mrErr: any) {
      console.warn('[coach] marathon readiness failed (non-fatal):', mrErr?.message ?? mrErr);
    }

    const evidence: EvidenceItem[] = [
      { code: 'week_window', label: 'Week window', value: `${weekStartDate} → ${weekEndDate}` },
      { code: 'wtd_load', label: 'Week-to-date load', value: Math.round(actualWtdLoad), unit: 'pts' },
      { code: 'wtd_vs_plan', label: 'WTD vs planned', value: plannedWtdLoad > 0 ? `${Math.round((wtdCompletionRatio || 0) * 100)}%` : '—' },
      { code: 'acwr', label: 'ACWR', value: acwr != null ? Number(acwr.toFixed(2)) : '—' },
      { code: 'remaining_plan_load', label: 'Remaining planned load', value: Math.round(plannedRemainingLoad), unit: 'pts' },
    ];

    const trendSignals: NonNullable<NonNullable<CoachWeekContextResponseV1['weekly_state_v1']>['trends']>['signals'] = [
      {
        metric: 'aerobic_efficiency',
        direction: responseInterp.aerobic.drift_delta_bpm == null
          ? 'stable'
          : responseInterp.aerobic.drift_delta_bpm <= -2 ? 'improving' : responseInterp.aerobic.drift_delta_bpm >= 3 ? 'declining' : 'stable',
        magnitude: responseInterp.aerobic.drift_delta_bpm != null && Math.abs(responseInterp.aerobic.drift_delta_bpm) >= 3 ? 'notable' : 'slight',
        delta: responseInterp.aerobic.drift_delta_bpm,
      },
      {
        metric: 'strength_reserve',
        direction: responseInterp.structural.rir_delta == null
          ? 'stable'
          : responseInterp.structural.rir_delta >= 0.5 ? 'improving' : responseInterp.structural.rir_delta <= -0.5 ? 'declining' : 'stable',
        magnitude: responseInterp.structural.rir_delta != null && Math.abs(responseInterp.structural.rir_delta) >= 0.5 ? 'notable' : 'slight',
        delta: responseInterp.structural.rir_delta,
      },
      {
        metric: 'effort_level',
        direction: responseInterp.subjective.rpe_delta == null
          ? 'stable'
          : responseInterp.subjective.rpe_delta <= -0.7 ? 'improving' : responseInterp.subjective.rpe_delta >= 0.7 ? 'declining' : 'stable',
        magnitude: responseInterp.subjective.rpe_delta != null && Math.abs(responseInterp.subjective.rpe_delta) >= 0.7 ? 'notable' : 'slight',
        delta: responseInterp.subjective.rpe_delta,
      },
      {
        metric: 'execution_quality',
        direction: responseInterp.absorption.execution_delta == null
          ? 'stable'
          : responseInterp.absorption.execution_delta >= 3 ? 'improving' : responseInterp.absorption.execution_delta <= -5 ? 'declining' : 'stable',
        magnitude: responseInterp.absorption.execution_delta != null && Math.abs(responseInterp.absorption.execution_delta) >= 5 ? 'notable' : 'slight',
        delta: responseInterp.absorption.execution_delta,
      },
    ];

    const weekly_state_v1: NonNullable<CoachWeekContextResponseV1['weekly_state_v1']> = {
      version: 1,
      owner: 'coach',
      generated_at: new Date().toISOString(),
      as_of_date: asOfDate,
      week: {
        start_date: weekStartDate,
        end_date: weekEndDate,
        week_start_dow: weekStartDow,
        index: weekIndex,
        intent: weekIntent,
        focus_label: weekFocusLabel,
      },
      plan: {
        has_active_plan: Boolean(activePlan),
        plan_id: activePlan?.id || null,
        plan_name: activePlan?.name || null,
        athlete_context_for_week: athleteContextStr || null,
      },
      guards: {
        is_transition_window: isPlanTransitionPeriod,
        suppress_deviation_language: isPlanTransitionPeriod,
        suppress_baseline_deltas: isPlanTransitionPeriod,
        show_trends: training_state.baseline_days >= 14,
        show_readiness: Boolean(marathon_readiness?.applicable),
      },
      glance: {
        training_state_code: training_state.code,
        training_state_title: training_state.title,
        training_state_subtitle: training_state.subtitle,
        verdict_code: v.code,
        verdict_label: v.label,
        next_action_code: v.next.code,
        next_action_title: v.next.title,
        next_action_details: v.next.details,
        completion_ratio: wtdCompletionRatio ?? null,
        key_sessions_linked: reaction.key_sessions_linked,
        key_sessions_planned: reaction.key_sessions_planned,
      },
      coach: {
        narrative: week_narrative,
        baseline_drift_suggestions: baseline_drift_suggestions.length ? baseline_drift_suggestions : undefined,
        plan_adaptation_suggestions: plan_adaptation_suggestions.length ? plan_adaptation_suggestions : undefined,
      },
      load: {
        wtd_planned_load: plannedWtdLoad ?? null,
        wtd_actual_load: actualWtdLoad ?? null,
        acute7_actual_load: acute7Load ?? null,
        chronic28_actual_load: chronic28Load ?? null,
        acwr: acwr ?? null,
        by_discipline: (training_state.load_ramp.acute7_by_type || []).map((r: any) => ({
          discipline: String(r.type || 'other'),
          planned_load: typeof r.linked_load === 'number' ? r.linked_load : null,
          actual_load: Number(r.total_load || 0),
          extra_load: Number(r.extra_load || 0),
          session_count: Number(r.total_sessions || 0),
        })),
      },
      trends: {
        fitness_direction: fitnessDirection,
        readiness_state: readinessState,
        signals: trendSignals,
      },
      details: {
        evidence,
        reaction,
        response: responseInterp,
        training_state,
        marathon_readiness,
        interference,
      },
    };

    const response: CoachWeekContextResponseV1 = {
      version: 1,
      as_of_date: asOfDate,
      week_start_date: weekStartDate,
      week_end_date: weekEndDate,
      methodology_id: methodologyId,
      plan: {
        has_active_plan: Boolean(activePlan),
        plan_id: activePlan?.id || null,
        plan_name: activePlan?.name || null,
        week_index: weekIndex,
        week_intent: weekIntent,
        week_focus_label: weekFocusLabel,
        week_start_dow: weekStartDow,
        athlete_context_for_week: athleteContextStr || null,
        // All concurrent active plans (multi-event support)
        active_plans: allActivePlans.map(p => ({
          plan_id: p.id,
          plan_name: p.name,
          sport: p.config?.sport ?? null,
          distance: p.config?.distance ?? p.config?.race_distance ?? null,
          race_date: p.config?.race_date ?? null,
          race_name: p.config?.race_name ?? null,
          duration_weeks: p.duration_weeks,
          is_primary: p.id === activePlan?.id,
        })),
      },
      metrics,
      week: {
        planned_total_load: plannedWeekTotalLoad || 0,
        planned_remaining_load: plannedRemainingLoad || 0,
        key_sessions_remaining: keySessionsRemaining,
      },
      reaction,
      baselines,
      baseline_drift_suggestions: baseline_drift_suggestions.length ? baseline_drift_suggestions : undefined,
      response: responseInterp,
      training_state,
      verdict: {
        code: v.code,
        label: v.label,
        confidence: v.confidence,
        reason_codes: v.reason_codes,
      },
      next_action: v.next,
      evidence,
      week_narrative,
      fitness_direction: fitnessDirection,
      readiness_state: readinessState,
      interference,
      plan_adaptation_suggestions: plan_adaptation_suggestions.length ? plan_adaptation_suggestions : undefined,
      marathon_readiness,
      weekly_state_v1,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[coach] error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

