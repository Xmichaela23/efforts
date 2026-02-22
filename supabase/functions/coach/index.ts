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

const DOW_INDEX: Record<WeekStartDow, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function weekStartOf(focusIso: string, weekStartDow: WeekStartDow): string {
  const d = parseISODateOnly(focusIso);
  const jsDow = d.getDay(); // 0=Sun..6=Sat
  const target = DOW_INDEX[weekStartDow];
  const diff = (jsDow - target + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
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

async function loadActivePlan(supabase: any, userId: string): Promise<ActivePlanLite | null> {
  const { data } = await supabase
    .from('plans')
    .select('id,name,config,duration_weeks')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as any;
}

function inferMethodologyId(planConfig: any): MethodologyId {
  const approach = String(planConfig?.approach || '').toLowerCase();
  if (approach === 'performance_build') return 'run:performance_build';
  if (approach === 'sustainable') return 'run:sustainable';
  return 'unknown';
}

function resolveWeekStartDow(planConfig: any): WeekStartDow {
  const dow = String(planConfig?.plan_contract_v1?.week_start || 'mon').toLowerCase();
  if (dow === 'sun' || dow === 'mon' || dow === 'tue' || dow === 'wed' || dow === 'thu' || dow === 'fri' || dow === 'sat') return dow;
  return 'mon';
}

function computeWeekIndex(planConfig: any, focusIso: string, weekStartDow: WeekStartDow, durationWeeks: number | null): number | null {
  const start = String(planConfig?.user_selected_start_date || planConfig?.start_date || '');
  if (!start) return null;
  // Align the plan start to the start of its first training week.
  const planWeek1Start = weekStartOf(start, weekStartDow);
  const a = parseISODateOnly(planWeek1Start);
  const b = parseISODateOnly(focusIso);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  let w = Math.max(1, Math.floor(diffDays / 7) + 1);
  if (durationWeeks && durationWeeks > 0) w = Math.min(w, durationWeeks);
  return w;
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
  reaction: CoachWeekContextResponseV1['reaction']
): { code: WeekVerdictCode; label: string; confidence: number; reason_codes: string[]; next: { code: NextActionCode; title: string; details: string } } {
  const reason_codes: string[] = [];
  const acwr = metrics.acwr;
  const completion = metrics.wtd_completion_ratio;
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

  if (acwr >= warn) {
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
    const asOfDate = String(payload?.date || new Date().toLocaleDateString('en-CA'));

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const activePlan = await loadActivePlan(supabase, userId);
    const planConfig = activePlan?.config || null;
    const methodologyId: MethodologyId = inferMethodologyId(planConfig);
    const weekStartDow: WeekStartDow = resolveWeekStartDow(planConfig);

    const weekStartDate = weekStartOf(asOfDate, weekStartDow);
    const weekEndDate = addDaysISO(weekStartDate, 6);
    const weekIndex = activePlan ? computeWeekIndex(planConfig, asOfDate, weekStartDow, activePlan.duration_weeks || null) : null;
    const weekIntentInfo = activePlan ? weekIntentFromContract(planConfig, weekIndex) : { intent: 'unknown', focus_label: null };
    const weekIntent = weekIntentInfo.intent as CoachWeekContextResponseV1['plan']['week_intent'];
    const weekFocusLabel = weekIntentInfo.focus_label as string | null;
    const methodologyCtx: MethodologyContext = { week_intent: weekIntent as any, week_start_dow: weekStartDow };

    // Planned rows within the week window (used for totals + remaining + WTD)
    const { data: plannedWeek, error: pErr } = await supabase
      .from('planned_workouts')
      .select('id,date,type,name,description,rendered_description,steps_preset,tags,workout_status,workload_planned,completed_workout_id')
      .eq('user_id', userId)
      .gte('date', weekStartDate)
      .lte('date', weekEndDate);
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
    const plannedWtdLoad = plannedWeekArr
      .filter((r: any) => String(r?.date || '') <= asOfDate)
      .reduce((sum: number, r: any) => sum + (safeNum(r?.workload_planned) || 0), 0);
    const plannedWeekTotalLoad = plannedWeekArr.reduce((sum: number, r: any) => sum + (safeNum(r?.workload_planned) || 0), 0);
    const plannedRemainingLoad = plannedWeekArr
      .filter((r: any) => String(r?.date || '') >= asOfDate && String(r?.workout_status || '').toLowerCase() !== 'completed')
      .reduce((sum: number, r: any) => sum + (safeNum(r?.workload_planned) || 0), 0);

    const actualWtdLoad = (actualWtd || [])
      .filter((r: any) => String(r?.workout_status || '').toLowerCase() === 'completed')
      .reduce((sum: number, r: any) => sum + (safeNum(r?.workload_actual) || 0), 0);

    const wtdCompletionRatio = plannedWtdLoad > 0 ? Math.max(0, Math.min(1, actualWtdLoad / plannedWtdLoad)) : null;

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
    const { data: weekWorkouts, error: wwErr } = await supabase
      .from('workouts')
      .select('id,date,type,name,workout_status,workload_actual,planned_id,computed,workout_analysis,workout_metadata,rpe,session_rpe,strength_exercises')
      .eq('user_id', userId)
      .gte('date', weekStartDate)
      .lte('date', asOfDate);
    if (wwErr) throw wwErr;

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

    const keySessionsCompleted = keySessionsPlanned.filter((x: any) => isPlannedCompleted(x?.r));
    const keySessionsCompletionRatio = keySessionsPlanned.length > 0 ? keySessionsCompleted.length / keySessionsPlanned.length : null;

    // Linking breakdown (WTD): linked vs gaps vs extras
    const keySessionGapsDetails = keySessionsPlanned
      .filter((x: any) => !isPlannedCompleted(x?.r))
      .map((x: any) => ({
        planned_id: String(x?.r?.id || ''),
        date: String(x?.r?.date || '').slice(0, 10),
        type: String(x?.r?.type || ''),
        name: x?.r?.name != null ? String(x.r.name) : null,
        category: x?.cat,
        workload_planned: safeNum(x?.r?.workload_planned),
      }))
      .filter((x: any) => Boolean(x.planned_id));

    const extraSessionsDetails = (Array.isArray(weekWorkouts) ? weekWorkouts : [])
      .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
      .filter((w: any) => w?.planned_id == null || String(w?.planned_id || '') === '')
      .map((w: any) => ({
        workout_id: String(w?.id || ''),
        date: String(w?.date || '').slice(0, 10),
        type: String(w?.type || ''),
        name: w?.name != null ? String(w.name) : null,
        workload_actual: safeNum((w as any)?.workload_actual),
      }))
      .filter((x: any) => Boolean(x.workout_id));

    const keySessionsLinked = keySessionsPlanned.length - keySessionGapsDetails.length;
    const keySessionsGaps = keySessionGapsDetails.length;
    const extraSessions = extraSessionsDetails.length;

    const daysInWindow = Math.max(
      1,
      Math.round((new Date(asOfDate).getTime() - new Date(weekStartDate).getTime()) / (24 * 3600 * 1000)) + 1
    );
    const daysWithActivity = new Set<string>(
      (Array.isArray(weekWorkouts) ? weekWorkouts : [])
        .filter((w: any) => String(w?.workout_status || '').toLowerCase() === 'completed')
        .map((w: any) => String(w?.date || '').slice(0, 10))
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

    const reaction: CoachWeekContextResponseV1['reaction'] = {
      key_sessions_planned: keySessionsPlanned.length,
      key_sessions_completed: keySessionsCompleted.length,
      key_sessions_completion_ratio: keySessionsCompletionRatio,
      key_sessions_linked: keySessionsLinked,
      key_sessions_gaps: keySessionsGaps,
      extra_sessions: extraSessions,
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
      .select('performance_numbers,effort_paces,learned_fitness')
      .eq('user_id', userId)
      .maybeSingle();
    if (ubErr) throw ubErr;

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

    const baselines: CoachWeekContextResponseV1['baselines'] = {
      performance_numbers: (ub as any)?.performance_numbers || null,
      effort_paces: (ub as any)?.effort_paces || null,
      learned_fitness: learnedFitness || null,
      learning_status: learningStatus,
      norms_28d: norms28d,
    };

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

    const v = buildVerdict(metrics, methodologyId, methodologyCtx, reaction);

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
      if (v.code === 'caution_ramping_fast' || responseInterp.overall.drivers.length === 1) {
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
    // AI week narrative — coach paragraph from structured facts
    // =========================================================================
    let week_narrative: string | null = null;
    try {
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (openaiKey) {
        const narrativeFacts: string[] = [];

        // ── Pull workout-level + exercise-level detail from deterministic layer ──
        const [wfRes, elRes] = await Promise.all([
          supabase
            .from('workout_facts')
            .select('workout_id, date, discipline, duration_minutes, workload, session_rpe, adherence, run_facts, strength_facts, ride_facts, swim_facts')
            .eq('user_id', userId)
            .gte('date', weekStartDate)
            .lte('date', weekEndDate)
            .order('date', { ascending: true }),
          supabase
            .from('exercise_log')
            .select('workout_id, date, exercise_name, canonical_name, sets_completed, best_weight, best_reps, total_volume, avg_rir, estimated_1rm')
            .eq('user_id', userId)
            .gte('date', weekStartDate)
            .lte('date', weekEndDate)
            .order('date', { ascending: true }),
        ]);
        const weekFacts: any[] = wfRes.data || [];
        const weekExercises: any[] = elRes.data || [];

        // Plan context
        if (weekIntent && weekIntent !== 'unknown') {
          narrativeFacts.push(`This is a ${weekIntent} week (week ${weekIndex ?? '?'} of the plan).`);
        }

        // Session completion
        narrativeFacts.push(`Planned key sessions: ${reaction.key_sessions_planned}. Completed and linked: ${reaction.key_sessions_linked}. Missed: ${reaction.key_sessions_gaps}. Extra unplanned sessions: ${reaction.extra_sessions}.`);

        // ── Per-workout detail with plan deviations ──
        for (const wf of weekFacts) {
          const adh = wf.adherence || {};
          const parts = [`${wf.date} ${wf.discipline}`];
          if (wf.duration_minutes) parts.push(`${Math.round(wf.duration_minutes)} min`);
          if (wf.workload) parts.push(`${Math.round(wf.workload)} pts load`);
          if (wf.session_rpe) parts.push(`RPE ${wf.session_rpe}/10`);

          if (adh.execution_score != null) parts.push(`execution ${adh.execution_score}%`);
          if (adh.workload_pct != null && Math.abs(adh.workload_pct - 100) >= 10) {
            parts.push(adh.workload_pct > 100
              ? `DID ${adh.workload_pct - 100}% MORE LOAD than planned`
              : `did ${100 - adh.workload_pct}% less load than planned`);
          }

          // Strength-specific: per-exercise planned vs actual
          if (wf.discipline === 'strength' && wf.strength_facts?.exercises) {
            const deviations: string[] = [];
            for (const ex of wf.strength_facts.exercises) {
              if (ex.planned_weight && ex.best_weight) {
                const plannedW = parseFloat(ex.planned_weight) || 0;
                if (plannedW > 0 && ex.best_weight > plannedW * 1.05) {
                  deviations.push(`${ex.name}: lifted ${ex.best_weight}kg but plan said ${ex.planned_weight}kg (+${Math.round(((ex.best_weight / plannedW) - 1) * 100)}% heavier)`);
                } else if (plannedW > 0 && ex.best_weight < plannedW * 0.9) {
                  deviations.push(`${ex.name}: lifted ${ex.best_weight}kg vs planned ${ex.planned_weight}kg (lighter than plan)`);
                }
              }
              if (ex.planned_sets && ex.sets_completed && ex.sets_completed !== ex.planned_sets) {
                deviations.push(`${ex.name}: did ${ex.sets_completed} sets vs ${ex.planned_sets} planned`);
              }
            }
            if (deviations.length) parts.push(`DEVIATIONS: ${deviations.join('; ')}`);
          }

          // Run-specific: pacing adherence
          if (wf.discipline === 'run' && wf.run_facts) {
            if (wf.run_facts.z2_pct != null) parts.push(`zone 2 time: ${wf.run_facts.z2_pct}%`);
            if (wf.run_facts.decoupling_pct != null) parts.push(`cardiac decoupling: ${wf.run_facts.decoupling_pct}%`);
            if (wf.run_facts.intervals_hit != null && wf.run_facts.intervals_total != null) {
              parts.push(`intervals: ${wf.run_facts.intervals_hit}/${wf.run_facts.intervals_total} on target`);
            }
          }

          narrativeFacts.push(`SESSION: ${parts.join(' | ')}`);
        }

        // ── Strength exercise summary with context ──
        if (weekExercises.length > 0) {
          const byExercise = new Map<string, any[]>();
          for (const e of weekExercises) {
            const arr = byExercise.get(e.canonical_name) || [];
            arr.push(e);
            byExercise.set(e.canonical_name, arr);
          }
          const exLines: string[] = [];
          for (const [canon, entries] of byExercise) {
            const bestW = Math.max(...entries.map((e: any) => e.best_weight || 0));
            const bestReps = entries.find((e: any) => e.best_weight === bestW)?.best_reps || 0;
            const best1rm = Math.max(...entries.map((e: any) => e.estimated_1rm || 0));
            const avgRir = entries.filter((e: any) => e.avg_rir != null).reduce((s: number, e: any) => s + e.avg_rir, 0) / (entries.filter((e: any) => e.avg_rir != null).length || 1);
            exLines.push(`${canon}: best ${bestW}kg × ${bestReps}, est 1RM ${Math.round(best1rm)}kg, avg ${avgRir.toFixed(1)} reps in reserve`);
          }
          narrativeFacts.push(`STRENGTH EXERCISES THIS WEEK: ${exLines.join('; ')}.`);
        }

        // Load by discipline
        const loadLines = training_state.load_ramp.acute7_by_type.map((r: any) => {
          const plannedPct = r.total_load > 0 ? Math.round((r.linked_load / r.total_load) * 100) : 0;
          const extraPct = 100 - plannedPct;
          return `${r.type}: ${Math.round(r.total_load)} pts total (${plannedPct}% planned, ${extraPct}% extra/unplanned)`;
        });
        if (loadLines.length) narrativeFacts.push(`Training load by discipline this week: ${loadLines.join('; ')}.`);

        // ACWR
        if (metrics.acwr != null) {
          const acwrLabel = metrics.acwr < 0.8 ? 'under-reached' : metrics.acwr > 1.3 ? 'overreaching' : 'in the optimal zone';
          narrativeFacts.push(`Training volume ratio (this week vs last 4 weeks): ${metrics.acwr.toFixed(2)} — ${acwrLabel}.`);
        }

        // Body response vs baseline
        if (reaction.avg_execution_score != null) narrativeFacts.push(`Average execution score: ${reaction.avg_execution_score}% (baseline: ${baselines.norms_28d.execution_score_avg ?? '?'}%).`);
        if (reaction.avg_session_rpe_7d != null) narrativeFacts.push(`Average perceived effort: ${reaction.avg_session_rpe_7d}/10 (baseline: ${baselines.norms_28d.session_rpe_avg ?? '?'}/10).`);
        if (reaction.avg_strength_rir_7d != null) narrativeFacts.push(`Average strength reps in reserve: ${reaction.avg_strength_rir_7d} (baseline: ${baselines.norms_28d.strength_rir_avg ?? '?'}).`);
        if (reaction.hr_drift_avg_bpm != null) narrativeFacts.push(`Average cardiac drift: ${reaction.hr_drift_avg_bpm} bpm (baseline: ${baselines.norms_28d.hr_drift_avg_bpm ?? '?'} bpm).`);

        // Per-discipline execution breakdown
        const execByDiscipline: Record<string, number[]> = {};
        for (const wf of weekFacts) {
          const score = wf.adherence?.execution_score;
          if (score != null) {
            (execByDiscipline[wf.discipline] = execByDiscipline[wf.discipline] || []).push(score);
          }
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

        const narrativePrompt = `You are a personal coach writing a weekly check-in for your athlete. You have detailed facts about every session they did this week, including exactly what was planned vs what they actually did. Write 3-5 sentences in second person ("you"). Be specific — name exercises, weights, and sessions when they deviated from the plan. Connect the dots: if they lifted heavier than planned, explain how that connects to their fatigue. If their running efficiency improved, say so. End with one concrete suggestion. Do NOT use jargon like ACWR, RIR, RPE, TRIMP, or sample sizes. Speak like a real coach talking to their athlete.

FACTS:
${narrativeFacts.join('\n')}`;

        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are an expert endurance and strength coach. Write a single paragraph (3-5 sentences). No bullets, no headers, no jargon. Second person. Conversational but knowledgeable.' },
              { role: 'user', content: narrativePrompt },
            ],
            temperature: 0.6,
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

    const evidence: EvidenceItem[] = [
      { code: 'week_window', label: 'Week window', value: `${weekStartDate} → ${weekEndDate}` },
      { code: 'wtd_load', label: 'Week-to-date load', value: Math.round(actualWtdLoad), unit: 'pts' },
      { code: 'wtd_vs_plan', label: 'WTD vs planned', value: plannedWtdLoad > 0 ? `${Math.round((wtdCompletionRatio || 0) * 100)}%` : '—' },
      { code: 'acwr', label: 'ACWR', value: acwr != null ? Number(acwr.toFixed(2)) : '—' },
      { code: 'remaining_plan_load', label: 'Remaining planned load', value: Math.round(plannedRemainingLoad), unit: 'pts' },
    ];

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
      },
      metrics,
      week: {
        planned_total_load: plannedWeekTotalLoad || 0,
        planned_remaining_load: plannedRemainingLoad || 0,
        key_sessions_remaining: keySessionsRemaining,
      },
      reaction,
      baselines,
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

