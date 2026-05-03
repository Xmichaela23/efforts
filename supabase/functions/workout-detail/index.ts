// @ts-nocheck
// Function: workout-detail
// Behavior: Return canonical completed workout details by id with optional heavy fields

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { weekStartOf } from '../_shared/plan-week.ts';
import { buildDailyLedger, buildPlannedSession } from '../_shared/athlete-snapshot/daily-ledger.ts';
import { buildBodyResponse } from '../_shared/athlete-snapshot/body-response.ts';
import { buildSessionDetailV1 } from '../_shared/session-detail/build.ts';
import {
  fetchActivePlanId,
  fetchPlanContextForWorkout,
  fetchPlanRaceMetaForWorkout,
  type PlanContext,
} from '../_shared/plan-context.ts';
import { trySessionRaceReadinessLlm } from '../_shared/session-detail/race-readiness-llm.ts';
import { buildReadiness } from '../_shared/readiness.ts';
import type { ReadinessSnapshotV1 } from '../_shared/readiness-types.ts';
import { generateRaceNarrative } from '../_shared/race-narrative.ts';
import { getArcContext } from '../_shared/arc-context.ts';
import { buildForwardContext } from '../_shared/session-detail/forward-context.ts';
import { FORWARD_CONTEXT_COPY_VERSION } from '../_shared/session-detail/types.ts';
import {
  buildArcPerformanceBridge,
  ARC_PERFORMANCE_BRIDGE_VERSION,
} from '../_shared/session-detail/arc-performance-bridge.ts';

type DetailOptions = {
  include_gps?: boolean;
  include_sensors?: boolean;
  include_swim?: boolean;
  resolution?: 'low' | 'high';
  normalize?: boolean;
  version?: string; // response schema version; default v1
};

/** workout = map/readouts only; session_detail = Performance contract + LLM; full = both (omit scope for backward compat). */
type WorkoutDetailScope = 'workout' | 'session_detail' | 'full';

const SNAPSHOT_LATENCY_WARN_MS = 200;

function parseScope(body: Record<string, unknown>): WorkoutDetailScope {
  const s = String(body?.scope || '').toLowerCase();
  if (s === 'workout' || s === 'session_detail') return s;
  return 'full';
}

function parseAnalysisFromWorkoutRow(row: any): Record<string, unknown> {
  const raw = row?.workout_analysis;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function msFromTimestampField(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Persisted session_detail_v1 is stale → run full snapshot + LLM pipeline.
 * `session_detail_updated_at` is set by merge_session_detail_v1_into_workout_analysis (JSONB on workouts).
 */
function isSessionDetailStale(workoutRow: { updated_at?: string | null }, analysis: Record<string, unknown>): boolean {
  const sessionDetail = analysis?.session_detail_v1 as Record<string, unknown> | undefined;
  if (!sessionDetail || typeof sessionDetail !== 'object') return true;

  // Schema upgrade: goal-race payloads written before forward_context shipped
  // are missing the field entirely. Treat as stale so they refresh once.
  // Also treat older copy_version as stale so voice/copy changes propagate.
  const race = (sessionDetail as any)?.race;
  if (race?.is_goal_race) {
    const fc = (sessionDetail as any)?.forward_context;
    if (!fc) return true;
    const cv = Number(fc?.copy_version);
    if (!Number.isFinite(cv) || cv < FORWARD_CONTEXT_COPY_VERSION) return true;
  }

  const ap = (sessionDetail as any)?.arc_performance;
  const apv = Number(ap?.version);
  if (!Number.isFinite(apv) || apv < ARC_PERFORMANCE_BRIDGE_VERSION) return true;

  const writtenMs =
    msFromTimestampField(analysis.session_detail_updated_at) ??
    msFromTimestampField(analysis.updated_at);
  if (writtenMs == null) return true;

  const rec = analysis.recomputed_at;
  if (rec != null) {
    const recMs = msFromTimestampField(rec);
    if (recMs != null && recMs > writtenMs) return true;
  }

  const wUa = workoutRow?.updated_at;
  if (wUa != null) {
    const wMs = msFromTimestampField(wUa);
    if (wMs != null && wMs > writtenMs) return true;
  }

  const ageMs = Date.now() - writtenMs;
  if (ageMs > 24 * 60 * 60 * 1000) return true;

  return false;
}

/** Strip response-only keys; they must never appear in persisted workout_analysis.session_detail_v1. */
function stripResponseOnlySessionDetailFields(sd: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!sd || typeof sd !== 'object') return (sd ?? {}) as Record<string, unknown>;
  const { stale: _s, stale_reason: _r, ...rest } = sd as Record<string, unknown>;
  return rest as Record<string, unknown>;
}

type SessionDetailStaleReason = 'recomputing' | 'attach_pending' | 'analysis_missing';

/**
 * Inject `stale` / `stale_reason` only on the HTTP response payload.
 * If you see these keys in a DB row, strip them — that is a bug.
 */
function enrichSessionDetailForResponse(
  rowSd: any,
  sessionDetailV1: any | null,
  arcContextLoadFailed: boolean,
): any {
  if (!sessionDetailV1 || typeof sessionDetailV1 !== 'object') {
    return { stale: true, stale_reason: 'analysis_missing' };
  }
  const base = stripResponseOnlySessionDetailFields(sessionDetailV1 as Record<string, unknown>) as any;
  const rowPlanned = rowSd?.planned_id != null && String(rowSd.planned_id).trim() !== '' ? String(rowSd.planned_id) : '';
  const sdPlanned = base?.plan_context?.planned_id != null && String(base.plan_context.planned_id).trim() !== ''
    ? String(base.plan_context.planned_id)
    : '';

  let stale = false;
  let stale_reason: SessionDetailStaleReason | undefined;

  if (rowPlanned && sdPlanned !== rowPlanned) {
    stale = true;
    stale_reason = 'attach_pending';
  } else if (rowPlanned && !sdPlanned) {
    stale = true;
    stale_reason = 'attach_pending';
  }

  if (!stale && arcContextLoadFailed) {
    stale = true;
    stale_reason = 'recomputing';
  }

  if (stale) {
    return { ...base, stale, stale_reason };
  }
  return { ...base, stale: false };
}

function processingCompleteFromWorkoutRow(row: any): boolean {
  let comp = row?.computed;
  if (typeof comp === 'string') {
    try {
      comp = JSON.parse(comp);
    } catch {
      comp = null;
    }
  }
  try {
    const s = comp?.analysis?.series || null;
    const n = Array.isArray(s?.distance_m) ? s.distance_m.length : 0;
    const nt = Array.isArray(s?.time_s) ? s.time_s.length : (Array.isArray(s?.time) ? s.time.length : 0);
    return n > 1 && nt > 1;
  } catch {
    return false;
  }
}

/**
 * JSON + scalar fields needed for session_detail_v1 pipeline (no GPS/track/display_metrics).
 */
function buildDetailCoreForSession(row: any): { detail: any; processingComplete: boolean } {
  const detail = normalizeBasic(row);
  try { (detail as any).computed = (()=>{ try { return typeof row.computed === 'string' ? JSON.parse(row.computed) : (row.computed || null); } catch { return row.computed || null; } })(); } catch {}
  try { (detail as any).metrics  = (()=>{ try { return typeof row.metrics  === 'string' ? JSON.parse(row.metrics)  : (row.metrics  || null); } catch { return row.metrics  || null; } })(); } catch {}
  try { (detail as any).workout_analysis = (()=>{ try { return typeof row.workout_analysis === 'string' ? JSON.parse(row.workout_analysis) : (row.workout_analysis || null); } catch { return row.workout_analysis || null; } })(); } catch {}
  try {
    let se = (()=>{ try { return typeof row.strength_exercises === 'string' ? JSON.parse(row.strength_exercises) : (row.strength_exercises || null); } catch { return row.strength_exercises || null; } })();
    if (Array.isArray(se) && se.length > 0) {
      se = se.map((exercise: any, index: number) => ({
        id: exercise.id || `temp-${index}`,
        name: exercise.name || '',
        sets: Array.isArray(exercise.sets)
          ? exercise.sets.map((set: any) => ({
              reps: Number((set?.reps as any) ?? 0) || 0,
              weight: Number((set?.weight as any) ?? 0) || 0,
              rir: typeof set?.rir === 'number' ? set.rir : undefined,
              completed: Boolean(set?.completed)
            }))
          : Array.from({ length: Math.max(1, Number(exercise.sets||0)) }, () => ({ reps: Number(exercise.reps||0)||0, weight: Number(exercise.weight||0)||0, completed: false })),
        reps: Number(exercise.reps || 0) || 0,
        weight: Number(exercise.weight || 0) || 0,
        notes: exercise.notes || '',
        weightMode: exercise.weightMode || 'same'
      }));
    }
    (detail as any).strength_exercises = se;
  } catch {}
  try { (detail as any).mobility_exercises = (()=>{ try { return typeof row.mobility_exercises === 'string' ? JSON.parse(row.mobility_exercises) : (row.mobility_exercises || null); } catch { return row.mobility_exercises || null; } })(); } catch {}
  try { (detail as any).achievements = (()=>{ try { return typeof row.achievements === 'string' ? JSON.parse(row.achievements) : (row.achievements || null); } catch { return row.achievements || null; } })(); } catch {}
  try { (detail as any).device_info = (()=>{ try { return typeof row.device_info === 'string' ? JSON.parse(row.device_info) : (row.device_info || null); } catch { return row.device_info || null; } })(); } catch {}
  (detail as any).rpe = row.rpe ?? null;
  (detail as any).gear_id = row.gear_id ?? null;
  let meta: Record<string, unknown> = {};
  try {
    meta = row.workout_metadata != null
      ? (typeof row.workout_metadata === 'string' ? JSON.parse(row.workout_metadata) : row.workout_metadata)
      : {};
  } catch { meta = {}; }
  if (meta.session_rpe == null && row.rpe != null) meta = { ...meta, session_rpe: row.rpe };
  (detail as any).workout_metadata = meta;
  try { (detail as any).swim_data = typeof row.swim_data === 'string' ? JSON.parse(row.swim_data) : (row.swim_data || null); } catch { (detail as any).swim_data = row.swim_data || null; }
  (detail as any).number_of_active_lengths = row.number_of_active_lengths ?? null;
  (detail as any).pool_length = row.pool_length ?? null;

  const hasSeries = (computed: any) => {
    try {
      const s = computed?.analysis?.series || null;
      const n = Array.isArray(s?.distance_m) ? s.distance_m.length : 0;
      const nt = Array.isArray(s?.time_s) ? s.time_s.length : (Array.isArray(s?.time) ? s.time.length : 0);
      return n > 1 && nt > 1;
    } catch { return false; }
  };
  const processingComplete = hasSeries((detail as any).computed);
  return { detail, processingComplete };
}

/** Keep session_detail under edge time limits: omit race_readiness if LLM + DB gate runs long. */
const RACE_READINESS_BUDGET_MS = 42_000;

function raceReadinessWithBudget<T>(p: Promise<T | null>): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      console.warn(
        `[workout-detail] race_readiness_llm exceeded ${RACE_READINESS_BUDGET_MS}ms — omitting block`,
      );
      resolve(null);
    }, RACE_READINESS_BUDGET_MS);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      console.warn('[workout-detail] race_readiness_llm rejected:', e instanceof Error ? e.message : e);
      resolve(null);
    });
  });
}

async function overlaySavedRaceResultFromGoal(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionDetailV1: any,
): Promise<void> {
  const race = sessionDetailV1?.race;
  const goalId = race?.goal_id ? String(race.goal_id) : null;
  if (!goalId) return;

  const { data: goal, error } = await supabase
    .from('goals')
    .select('current_value, target_time, status')
    .eq('id', goalId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !goal || String(goal.status) !== 'completed') return;

  const savedActual = Number(goal.current_value);
  if (Number.isFinite(savedActual) && savedActual > 0) {
    race.actual_seconds = Math.round(savedActual);
    race.time_source = 'goals.current_value';
  }

  const savedTarget = Number(goal.target_time);
  if (Number.isFinite(savedTarget) && savedTarget > 0) {
    race.goal_time_seconds = Math.round(savedTarget);
  }
}

async function runSessionDetailPipelineAndPersist(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  id: string,
  row: any,
  detail: any,
): Promise<{ sessionDetailV1: any | null; snapshot_latency_ms: number | null; arcContextLoadFailed: boolean }> {
  let sessionDetailV1: any = null;
  let snapshot_latency_ms: number | null = null;
  let arcContextLoadFailed = false;
  if (!userId || String(row?.workout_status || '').toLowerCase() !== 'completed') {
    return { sessionDetailV1: null, snapshot_latency_ms: null, arcContextLoadFailed: false };
  }
  const t0 = performance.now();
  try {
    const workoutDate = String(row?.date || '').slice(0, 10);
    const weekStartDate = weekStartOf(workoutDate, 'mon');
    const weekEndDate = addDaysISO(weekStartDate, 6);
    const asOfDate = workoutDate;

    let readinessSnapshot: ReadinessSnapshotV1 | null = null;
    let readinessUnavailable = false;
    const readinessP = buildReadiness(supabase, userId, new Date(workoutDate))
      .then((r) => {
        readinessSnapshot = r;
      })
      .catch((reErr: unknown) => {
        readinessUnavailable = true;
        console.warn(
          '[session_detail_v1] readiness unavailable, using legacy load context:',
          reErr instanceof Error ? reErr.message : reErr,
        );
      });

    const [plannedRes, weekWorkoutsRes, , arcCtx] = await Promise.all([
      supabase
        .from('planned_workouts')
        .select('id,date,type,name,description,rendered_description,total_duration_seconds,workload_planned,computed,strength_exercises,swim_unit,baselines_template,baselines,training_plan_id')
        .eq('user_id', userId)
        .gte('date', weekStartDate)
        .lte('date', weekEndDate),
      supabase
        .from('workouts')
        .select('id,date,timestamp,type,name,workout_status,workload_actual,planned_id,computed,workout_analysis,workout_metadata,rpe,moving_time,duration,distance,avg_heart_rate,strength_exercises')
        .eq('user_id', userId)
        .gte('date', weekStartDate)
        .lte('date', weekEndDate),
      readinessP,
      getArcContext(supabase, userId, asOfDate).catch((arcErr: unknown) => {
        arcContextLoadFailed = true;
        console.warn(
          '[session_detail_v1] getArcContext failed:',
          arcErr instanceof Error ? arcErr.message : arcErr,
        );
        return null;
      }),
    ]);

    const plannedRows = Array.isArray(plannedRes?.data) ? plannedRes.data : [];
    const weekWorkoutsRaw = Array.isArray(weekWorkoutsRes?.data) ? weekWorkoutsRes.data : [];
    const weekWorkouts = weekWorkoutsRaw
      .map((w: any) => {
        let wa = w?.workout_analysis;
        if (typeof wa === 'string') try { wa = JSON.parse(wa); } catch { wa = null; }
        return {
          ...w,
          workout_analysis: wa,
          __local_date: String(w?.date || '').slice(0, 10),
          avg_hr: w?.avg_hr ?? w?.avg_heart_rate,
          average_heartrate: w?.average_heartrate ?? w?.avg_heart_rate,
        };
      })
      .filter((w: any) => {
        const d = String(w?.__local_date || '');
        return d >= weekStartDate && d <= asOfDate && String(w?.workout_status || '').toLowerCase() === 'completed';
      });

    const isImperial = true;
    const dailyLedger = buildDailyLedger({
      weekStartDate,
      weekEndDate,
      asOfDate,
      plannedRows,
      workoutRows: weekWorkouts,
      imperial: isImperial,
    });

    const snapshotNorms = {
      easy_hr_at_pace: null,
      threshold_pace_sec_per_mi: null,
      avg_execution_score: null,
      avg_rpe: null,
      avg_hr_drift_bpm: null,
      avg_decoupling_pct: null,
      avg_rir: null,
    };

    const bodyResponse = buildBodyResponse(
      dailyLedger,
      snapshotNorms,
      isImperial,
      { actual_vs_planned_pct: null, acwr: null, running_acwr: null },
      { interference: false, detail: 'No interference detected.' },
    );

    const ledgerDay = dailyLedger.find((d) => d.date === workoutDate) ?? null;
    const actualSession = ledgerDay?.actual.find((a) => a.workout_id === id) ?? null;
    let match = ledgerDay?.matches.find((m) => m.workout_id === id) ?? null;
    let plannedSession = match?.planned_id
      ? ledgerDay?.planned.find((p) => p.planned_id === match.planned_id) ?? null
      : null;
    const sessionObs = bodyResponse.session_signals.find((o) => o.workout_id === id);
    const observations = sessionObs?.observations ?? [];

    const wa = (detail as any).workout_analysis || {};
    // Goal races use structured technical_insights — suppress ai_summary so it doesn't render as a wall of text
    const narrativeText = wa?.is_goal_race === true
      ? null
      : (wa?.session_state_v1?.narrative?.text ?? wa?.ai_summary ?? null);

    const rowPlannedId =
      row?.planned_id != null && String(row.planned_id).length > 0 ? String(row.planned_id) : '';
    const effectivePlannedId = (match?.planned_id ? String(match.planned_id) : '') || rowPlannedId;

    let attachPlannedRaw: any = null;
    if (effectivePlannedId && (!plannedSession || !match || !match.planned_id)) {
      attachPlannedRaw =
        plannedRows.find((r: any) => String(r?.id) === String(effectivePlannedId)) ?? null;
      if (!attachPlannedRaw) {
        const { data: pr } = await supabase
          .from('planned_workouts')
          .select(
            'id,date,type,name,description,rendered_description,total_duration_seconds,workload_planned,computed,strength_exercises,swim_unit,baselines_template,baselines,training_plan_id',
          )
          .eq('user_id', userId)
          .eq('id', effectivePlannedId)
          .maybeSingle();
        attachPlannedRaw = pr ?? null;
      }
      if (attachPlannedRaw) {
        if (!plannedSession) {
          plannedSession = buildPlannedSession(attachPlannedRaw, isImperial);
        }
        if (!match || !match.planned_id) {
          const t = String(plannedSession?.type || row?.type || '').toLowerCase();
          const isStrength =
            t.includes('strength') || t === 'weight_training' || t === 'weights';
          match = {
            planned_id: effectivePlannedId,
            workout_id: id,
            endurance_quality: isStrength ? null : 'followed',
            strength_quality: isStrength ? 'followed' : null,
            summary: plannedSession?.prescription
              ? `Linked to plan — ${String(plannedSession.prescription).slice(0, 120)}`
              : 'Linked to planned session',
          };
        }
      }
    }

    const plannedId = match?.planned_id ?? null;
    let plannedRowRaw: any = null;
    if (plannedId) {
      let raw =
        attachPlannedRaw && String(attachPlannedRaw?.id) === String(plannedId)
          ? attachPlannedRaw
          : plannedRows.find((r: any) => String(r?.id) === String(plannedId));
      if (!raw) {
        const { data: pr } = await supabase
          .from('planned_workouts')
          .select(
            'id,date,type,name,description,rendered_description,total_duration_seconds,workload_planned,computed,strength_exercises,swim_unit,baselines_template,baselines,training_plan_id',
          )
          .eq('user_id', userId)
          .eq('id', plannedId)
          .maybeSingle();
        raw = pr ?? null;
      }
      if (raw) {
        let se = raw?.strength_exercises;
        if (typeof se === 'string') try { se = JSON.parse(se); } catch { se = null; }
        plannedRowRaw = { ...raw, strength_exercises: se };
      }
    }

    const compStrength = (detail as any).strength_exercises ?? row?.strength_exercises;
    const compStrengthArr = Array.isArray(compStrength) ? compStrength : (typeof compStrength === 'string' ? (() => { try { return JSON.parse(compStrength); } catch { return null; } })() : null);

    let nextPlanned = plannedRows
      .filter((p: any) => String(p?.date || '') > workoutDate)
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))[0] ?? null;

    if (!nextPlanned) {
      const dayAfter = addDaysISO(workoutDate, 1);
      const lookAhead = addDaysISO(workoutDate, 14);
      const { data: upcoming } = await supabase
        .from('planned_workouts')
        .select('id,date,type,name,description')
        .eq('user_id', userId)
        .gte('date', dayAfter)
        .lte('date', lookAhead)
        .order('date', { ascending: true })
        .limit(1);
      if (upcoming && upcoming.length > 0) nextPlanned = upcoming[0];
    }

    const nextSession = nextPlanned ? {
      name: String(nextPlanned.name || nextPlanned.type || 'Workout'),
      date: String(nextPlanned.date || '').slice(0, 10) || null,
      type: nextPlanned.type ? String(nextPlanned.type) : null,
      prescription: nextPlanned.description
        ? String(nextPlanned.description).slice(0, 160)
        : nextPlanned.rendered_description
          ? String(nextPlanned.rendered_description).slice(0, 160)
          : null,
    } : null;

    let planCtxForSession: PlanContext | null = null;
    try {
      let tpId =
        plannedRowRaw?.training_plan_id ??
        attachPlannedRaw?.training_plan_id ??
        null;
      const hasPlanLink = !!(match?.planned_id || effectivePlannedId);
      if (!tpId && userId && hasPlanLink) {
        const activePid = await fetchActivePlanId(supabase, userId);
        if (activePid) {
          tpId = activePid;
          console.warn(
            '[session_detail_v1] plan context: resolved plans.id from active plan (planned row missing training_plan_id)',
          );
        }
      }
      if (userId && tpId && workoutDate) {
        planCtxForSession = await fetchPlanContextForWorkout(
          supabase,
          userId,
          String(tpId),
          workoutDate,
        );
        if (!planCtxForSession) {
          planCtxForSession = await fetchPlanRaceMetaForWorkout(
            supabase,
            userId,
            String(tpId),
            workoutDate,
          );
          if (planCtxForSession) {
            console.warn(
              '[session_detail_v1] plan context: race-meta fallback (full week context unavailable)',
            );
          }
        }
      }
    } catch (durErr: unknown) {
      console.warn(
        '[session_detail_v1] plan context fetch failed:',
        durErr instanceof Error ? durErr.message : durErr,
      );
    }

    const hasLinkedPlannedSession = !!(String(row?.planned_id || match?.planned_id || '').trim());
    const arcPerformance = buildArcPerformanceBridge(arcCtx, asOfDate, hasLinkedPlannedSession);
    try {
      const nc = arcCtx?.arc_narrative_context;
      console.log(
        `[workout-detail] arc_narrative workout=${id} as_of=${asOfDate} mode=${nc?.mode ?? 'n/a'} ` +
          `days_since_last_race=${nc?.days_since_last_goal_race ?? 'n/a'} ` +
          `last_race=${nc?.last_goal_race ? `${nc.last_goal_race.name}@${nc.last_goal_race.target_date}` : 'none'} ` +
          `next_goal=${nc?.next_primary_goal?.name ?? 'none'}`,
      );
    } catch {
      /* non-fatal logging */
    }

    sessionDetailV1 = buildSessionDetailV1({
      workoutId: id,
      workoutDate,
      workoutType: row?.type ?? 'other',
      workoutName: row?.name ?? null,
      ledgerDay,
      actualSession,
      match,
      plannedSession,
      plannedRowRaw,
      completedStrengthExercises: Array.isArray(compStrengthArr) ? compStrengthArr : null,
      observations,
      workoutAnalysis: wa,
      narrativeText,
      loadStatus: bodyResponse?.load_status ? { status: bodyResponse.load_status.status, interpretation: bodyResponse.load_status.interpretation } : null,
      completedComputed: (detail as any).computed ?? null,
      completedRefinedType: (detail as any).refined_type ?? row?.refined_type ?? null,
      nextSession,
      readinessSnapshot: readinessUnavailable ? null : readinessSnapshot,
      readinessUnavailable,
      arcPerformance,
    });

    if (sessionDetailV1?.race?.is_goal_race) {
      await overlaySavedRaceResultFromGoal(supabase, userId, sessionDetailV1);
    }

    if (sessionDetailV1 && planCtxForSession) {
      try {
        const rrLlm = await raceReadinessWithBudget(
          trySessionRaceReadinessLlm({
            sessionDetail: sessionDetailV1,
            workoutAnalysis: wa,
            planContext: planCtxForSession,
            row: row as Record<string, unknown>,
            supabase,
            userId,
          }),
        );
        if (rrLlm) sessionDetailV1.race_readiness = rrLlm;
      } catch (rrErr: unknown) {
        console.warn(
          '[race_readiness_llm] skipped:',
          rrErr instanceof Error ? rrErr.message : rrErr,
        );
      }
    }

    // Goal race: generate LLM debrief narrative from actual per-mile data
    if (sessionDetailV1) sessionDetailV1._rn_gate = `is_goal_race=${wa?.is_goal_race}`;
    if (sessionDetailV1 && wa?.is_goal_race === true) {
      try {
        const raceData = wa?.race ?? {};
        // Primary source: pre-computed mile splits from analyze-running-workout
        let mileSplits: any[] = wa?.detailed_analysis?.mile_by_mile_terrain?.splits ?? [];

        // Fallback: build mile splits from computed.analysis.series (columnar arrays written by
        // compute-workout-analysis). This fires when analyze-running-workout couldn't read sensor
        // data (e.g. after a recompute) and left mile_by_mile_terrain empty.
        if (mileSplits.length < 10) {
          const computedRaw = (row as any)?.computed;
          const computed = typeof computedRaw === 'string' ? (() => { try { return JSON.parse(computedRaw); } catch { return null; } })() : computedRaw;
          const series = computed?.analysis?.series;
          if (series && Array.isArray(series.distance_m) && series.distance_m.length >= 20) {
            const distM: number[] = series.distance_m;
            const timeS: number[] = series.time_s ?? [];
            const hrBpm: (number | null)[] = series.hr_bpm ?? [];
            const elevM: (number | null)[] = series.elevation_m ?? [];
            const n = distM.length;
            const totalMi = (distM[n - 1] ?? 0) / 1609.34;
            const miles = Math.floor(totalMi);

            const interp = (arr: number[], targetD: number): number => {
              for (let i = 1; i < n; i++) {
                if (distM[i] >= targetD) {
                  const d0 = distM[i - 1], d1 = distM[i];
                  const f = d1 === d0 ? 0 : (targetD - d0) / (d1 - d0);
                  return arr[i - 1] + f * (arr[i] - arr[i - 1]);
                }
              }
              return arr[n - 1];
            };

            const fallbackSplits: any[] = [];
            for (let m = 1; m <= miles; m++) {
              const dStart = (m - 1) * 1609.34, dEnd = m * 1609.34;
              if (timeS.length < n) continue;
              const t0m = interp(timeS as number[], dStart);
              const t1m = interp(timeS as number[], dEnd);
              if (!(t1m > t0m)) continue;
              const pace_s_per_mi = t1m - t0m;

              let hrSum = 0, hrCnt = 0;
              let firstElev: number | null = null, lastElev: number | null = null;
              for (let i = 0; i < n; i++) {
                if (distM[i] < dStart || distM[i] > dEnd) continue;
                const hr = hrBpm[i];
                if (typeof hr === 'number' && hr > 40 && hr < 250) { hrSum += hr; hrCnt++; }
                const el = elevM[i];
                if (typeof el === 'number' && Number.isFinite(el)) {
                  if (firstElev === null) firstElev = el;
                  lastElev = el;
                }
              }
              const avg_hr_bpm = hrCnt > 0 ? Math.round(hrSum / hrCnt) : null;
              const elevGain = firstElev != null && lastElev != null ? Math.max(0, lastElev - firstElev) : null;
              const gradePercent = firstElev != null && lastElev != null ? ((lastElev - firstElev) / 1609.34) * 100 : null;
              fallbackSplits.push({ mile: m, pace_s_per_mi, avg_hr_bpm, elevation_gain_m: elevGain, grade_percent: gradePercent, start_elevation_m: firstElev, end_elevation_m: lastElev });
            }
            if (fallbackSplits.length >= 10) {
              mileSplits = fallbackSplits;
              console.log('[race-narrative] using computed.analysis.series fallback splits:', fallbackSplits.length);
            }
          }
        }

        const wd = (() => {
          const raw = (row as any)?.weather_data;
          if (!raw) return null;
          if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
          return raw;
        })();

        const actualSec = Number(raceData?.actual_seconds);
        if (sessionDetailV1) sessionDetailV1._rn_data = `splits=${mileSplits?.length} actualSec=${actualSec} isFinite=${Number.isFinite(actualSec)} gt3600=${actualSec > 3600}`;
        if (Array.isArray(mileSplits) && mileSplits.length >= 10 && Number.isFinite(actualSec) && actualSec > 3600) {
          const raceNarrative = await generateRaceNarrative({
            actualSeconds: actualSec,
            goalTimeSeconds: raceData?.goal_time_seconds != null ? Number(raceData.goal_time_seconds) : null,
            fitnessProjectionSeconds: raceData?.fitness_projection_seconds != null ? Number(raceData.fitness_projection_seconds) : null,
            eventName: raceData?.event_name ?? null,
            splits: mileSplits,
            weatherStartF: wd?.temperature_start_f ?? wd?.temperature ?? null,
            weatherEndF: wd?.temperature_end_f ?? null,
            weatherPeakF: wd?.temperature_peak_f ?? null,
            weatherHumidity: wd?.humidity ?? null,
            weatherWindMph: wd?.windSpeed ?? wd?.wind_speed ?? null,
          });
          if (raceNarrative) {
            sessionDetailV1.narrative_text = raceNarrative;
            console.log('[race-narrative] narrative set, length:', sessionDetailV1.narrative_text.length);
          }
        } else {
          console.log('[race-narrative] skipped — insufficient data (splits:', mileSplits?.length, 'actualSec:', actualSec, ')');
        }
      } catch (rnErr: unknown) {
        console.warn('[race-narrative] skipped:', rnErr instanceof Error ? rnErr.message : rnErr);
      }
    }

    // Forward context: "What this means for future races".
    // Wires Arc into the post-race debrief so it can speak to what comes next,
    // not just what happened. Goal-race only; never blocks the debrief.
    if (sessionDetailV1?.race?.is_goal_race) {
      try {
        const todayYmd = new Date().toISOString().slice(0, 10);
        // Use today (or the workout date, whichever is later) so we don't
        // recommend a race that already happened between race day and now.
        const forwardAsOf = todayYmd > asOfDate ? todayYmd : asOfDate;
        const arc = await getArcContext(supabase, userId, forwardAsOf);
        const forward = buildForwardContext({
          arc,
          sessionDetailV1,
          asOfDate: forwardAsOf,
        });
        if (forward) {
          sessionDetailV1.forward_context = forward;
          console.log(
            '[forward-context] set: next_goal=',
            forward.next_goal?.name ?? 'none',
            'phase=', forward.current_phase,
            'projection=', forward.projection_line ?? 'n/a',
          );
        } else {
          sessionDetailV1.forward_context = null;
        }
      } catch (fcErr: unknown) {
        console.warn(
          '[forward-context] skipped:',
          fcErr instanceof Error ? fcErr.message : fcErr,
        );
      }
    }
  } catch (snapErr: any) {
    console.warn('[workout-detail] session_detail_v1 build failed:', snapErr?.message || snapErr, snapErr?.stack || '');
  }
  snapshot_latency_ms = Math.round(performance.now() - t0);
  if (snapshot_latency_ms >= SNAPSHOT_LATENCY_WARN_MS) {
    console.warn(`[workout-detail] session_detail snapshot build took ${snapshot_latency_ms}ms (>= ${SNAPSHOT_LATENCY_WARN_MS}ms)`);
  }

  if (sessionDetailV1) {
    try {
      const forPersist = stripResponseOnlySessionDetailFields(sessionDetailV1 as Record<string, unknown>);
      await supabase.rpc('merge_session_detail_v1_into_workout_analysis', {
        p_workout_id: id,
        p_session_detail_v1: forPersist,
      });
    } catch (persistErr: any) {
      console.warn('[workout-detail] session_detail_v1 persist failed (non-fatal):', persistErr?.message || persistErr);
    }
  }

  return { sessionDetailV1, snapshot_latency_ms, arcContextLoadFailed };
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function isUuid(v?: string | null): boolean { return !!v && /[0-9a-fA-F-]{36}/.test(v); }

function addDaysISO(iso: string, deltaDays: number): string {
  const [y, m, d] = String(iso).split('-').map((x) => parseInt(x, 10));
  const base = new Date(y, (m || 1) - 1, d || 1);
  base.setDate(base.getDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

// Decode Google/Strava encoded polylines (precision 1e5)
function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    // latitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    // longitude
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates;
}

// --- Adaptive track simplification (Douglas-Peucker, iterative) ---
const MAX_TRACK_POINTS = 1200;

function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.sqrt(dx * dx + dy * dy);
}

function douglasPeucker(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    if (e - s <= 1) continue;
    let mx = 0, mi = s;
    for (let i = s + 1; i < e; i++) { const d = perpDist(pts[i], pts[s], pts[e]); if (d > mx) { mx = d; mi = i; } }
    if (mx > tol) { keep[mi] = 1; stack.push([s, mi]); stack.push([mi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function simplifyTrack(track: [number, number][]): [number, number][] {
  if (track.length <= MAX_TRACK_POINTS) return track;
  const factor = track.length / MAX_TRACK_POINTS;
  const tol = Math.min(0.0001, Math.max(0.000005, factor * 0.000002));
  return douglasPeucker(track, tol);
}

// --- Min/max series bucketing (preserves spikes, keeps arrays aligned) ---
const MAX_SERIES_POINTS = 800;

function bucketSeries(series: Record<string, any>, maxPts: number): Record<string, any> {
  const arrKeys = Object.keys(series).filter(k => Array.isArray(series[k]) && series[k].length > 0);
  if (arrKeys.length === 0) return series;
  const len = series[arrKeys[0]].length;
  if (len <= maxPts) return series;

  const numBuckets = Math.floor(maxPts / 2);
  const bucketSize = len / numBuckets;
  const primary = ['speed_mps', 'power_w', 'hr_bpm', 'elevation_m']
    .find(k => arrKeys.includes(k)) || arrKeys.find(k => k !== 'time_s' && k !== 'distance_m') || arrKeys[0];

  const indices: number[] = [0];
  for (let b = 0; b < numBuckets; b++) {
    const lo = Math.floor(b * bucketSize);
    const hi = Math.min(Math.floor((b + 1) * bucketSize), len);
    if (lo >= hi) continue;
    let minI = lo, maxI = lo, minV = series[primary][lo] ?? 0, maxV = minV;
    for (let i = lo; i < hi; i++) {
      const v = series[primary][i];
      if (v != null && v < minV) { minV = v; minI = i; }
      if (v != null && v > maxV) { maxV = v; maxI = i; }
    }
    const pair = minI <= maxI ? [minI, maxI] : [maxI, minI];
    for (const idx of pair) { if (indices[indices.length - 1] !== idx) indices.push(idx); }
  }
  if (indices[indices.length - 1] !== len - 1) indices.push(len - 1);

  const out: Record<string, any> = {};
  for (const k of Object.keys(series)) {
    if (!Array.isArray(series[k])) { out[k] = series[k]; continue; }
    out[k] = indices.map(i => series[k][i]);
  }
  return out;
}

function normalizeBasic(w: any) {
  const type = String(w?.type || '').toLowerCase();
  return {
    normalization_version: String(w?.normalization_version || ''),
    id: String(w?.id || ''),
    user_id: String(w?.user_id || ''),
    date: String(w?.date || '').slice(0,10),
    type,
    workout_status: String(w?.workout_status || 'completed'),
    planned_id: w?.planned_id || null,
    name: w?.name || null,
    // Basic metrics (pass-through; units as stored)
    distance: w?.distance ?? w?.distance_km ?? null,
    distance_meters: w?.distance_meters ?? (typeof w?.distance === 'number' ? w.distance * 1000 : null),
    moving_time: w?.moving_time ?? w?.metrics?.moving_time ?? null,
    elapsed_time: w?.elapsed_time ?? w?.metrics?.elapsed_time ?? null,
    avg_heart_rate: w?.avg_heart_rate ?? w?.metrics?.avg_heart_rate ?? null,
    max_heart_rate: w?.max_heart_rate ?? w?.metrics?.max_heart_rate ?? null,
    avg_power: w?.avg_power ?? w?.metrics?.avg_power ?? null,
    max_power: w?.max_power ?? w?.metrics?.max_power ?? null,
    avg_cadence: w?.avg_cadence ?? w?.metrics?.avg_cadence ?? null,
    max_cadence: w?.max_cadence ?? w?.metrics?.max_cadence ?? null,
    avg_speed_mps: w?.avg_speed_mps ?? null,
    avg_speed: w?.avg_speed ?? w?.metrics?.avg_speed ?? null,
    duration: w?.duration ?? null,
    calories: w?.calories ?? null,
    steps: w?.steps ?? null,
    elevation_gain: w?.elevation_gain ?? w?.metrics?.elevation_gain ?? null,
    elevation_loss: w?.elevation_loss ?? w?.metrics?.elevation_loss ?? null,
    // Location
    start_position_lat: w?.start_position_lat ?? null,
    start_position_long: w?.start_position_long ?? null,
    timestamp: w?.timestamp ?? null,
    // Source tracking
    source: w?.source ?? null,
    is_strava_imported: w?.is_strava_imported ?? null,
    strava_activity_id: w?.strava_activity_id ?? null,
    garmin_activity_id: w?.garmin_activity_id ?? null,
    device_info: w?.device_info ?? null,
    // Achievements (PRs, segments)
    achievements: w?.achievements ?? null,
    // Computed snapshot passthrough
    computed: w?.computed || null,
    // Workload data
    workload_actual: w?.workload_actual ?? null,
    workload_planned: w?.workload_planned ?? null,
    intensity_factor: w?.intensity_factor ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(()=>({}));
    const id = String(body?.id || '').trim();
    const scope = parseScope(body);
    const opts: DetailOptions = {
      include_gps: body?.include_gps !== false,
      include_sensors: body?.include_sensors !== false,
      include_swim: body?.include_swim !== false,
      resolution: (body?.resolution === 'low' ? 'low' : 'high'),
      normalize: body?.normalize !== false,
      version: String(body?.version || 'v1'),
    };
    if (!isUuid(id)) {
      return new Response(JSON.stringify({ error: 'id must be a UUID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authH = req.headers.get('Authorization') || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : null;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let userId: string | null = null;
    try {
      if (token) {
        const { data: userData } = await supabase.auth.getUser(token as any);
        userId = userData?.user?.id || null;
      }
    } catch {}

    // Select minimal set plus optional blobs (shared column list)
    const baseSel = [
      'id','user_id','date','type','workout_status','planned_id','name','metrics','computed','workout_analysis',
      'avg_heart_rate','max_heart_rate','avg_power','max_power','avg_cadence','max_cadence',
      'avg_speed','max_speed','max_pace','distance','duration','elapsed_time','moving_time','calories','steps','elevation_gain','elevation_loss',
      'start_position_lat','start_position_long','timestamp',
      'strength_exercises','mobility_exercises','refined_type',
      // Source tracking for display
      'source','is_strava_imported','strava_activity_id','garmin_activity_id','device_info',
      // Achievements (PRs, segments)
      'achievements',
      // Workload data (single source of truth from calculate-workload)
      'workload_actual','workload_planned','intensity_factor',
      // User feedback (RPE, gear, unified metadata)
      'rpe','gear_id','workout_metadata',
      // GPS trackpoints (polyline) for fallback when gps_track is missing
      'gps_trackpoints',
      // Timestamp for processing trigger deduplication
      'updated_at'
    ].join(',');

    if (scope === 'session_detail') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      let urlForceRefresh = false;
      try {
        urlForceRefresh = new URL(req.url).searchParams.get('force_refresh') === 'true';
      } catch {
        /* ignore bad URL */
      }
      const forceRefresh = body?.force_refresh === true || urlForceRefresh;

      const selectSd = baseSel + ',swim_data,number_of_active_lengths,pool_length,weather_data';
      let qSd = supabase.from('workouts').select(selectSd).eq('id', id) as any;
      qSd = qSd.eq('user_id', userId);
      const { data: rowSd, error: errSd } = await qSd.maybeSingle();
      if (errSd) throw errSd;
      if (!rowSd) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const analysisSd = parseAnalysisFromWorkoutRow(rowSd);
      if (!forceRefresh && !isSessionDetailStale(rowSd, analysisSd)) {
        const sd = analysisSd.session_detail_v1 as any;
        console.log('[workout-detail] session_detail fast path: serving persisted session_detail_v1');
        const pcFast = processingCompleteFromWorkoutRow(rowSd);
        const cachedAt = analysisSd.session_detail_updated_at ?? analysisSd.updated_at;
        const sdForResponse =
          sd && typeof sd === 'object'
            ? stripResponseOnlySessionDetailFields({ ...sd } as Record<string, unknown>)
            : sd;
        const enriched = enrichSessionDetailForResponse(rowSd, sdForResponse, false);
        const outFast: Record<string, unknown> = {
          session_detail_v1: enriched,
          processing_complete: pcFast,
          _cache_hit: true,
          _cached_at: cachedAt != null ? String(cachedAt) : null,
        };
        const headersFast: Record<string, string> = {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Session-Detail-Cache': 'hit',
        };
        return new Response(JSON.stringify(outFast), { headers: headersFast });
      }

      if (forceRefresh) {
        console.log('[workout-detail] session_detail force_refresh — running full pipeline');
      } else {
        console.log('[workout-detail] session_detail stale or missing — running full pipeline');
      }

      const { detail: dSd, processingComplete: pcSd } = buildDetailCoreForSession(rowSd);
      const { sessionDetailV1: sdV1, snapshot_latency_ms: latMs, arcContextLoadFailed } = await runSessionDetailPipelineAndPersist(
        supabase,
        userId,
        id,
        rowSd,
        dSd,
      );
      const out: Record<string, unknown> = { processing_complete: pcSd, _cache_hit: false };
      out.session_detail_v1 = enrichSessionDetailForResponse(rowSd, sdV1, arcContextLoadFailed);
      if (latMs != null && latMs >= SNAPSHOT_LATENCY_WARN_MS) out.snapshot_latency_ms = latMs;
      const headersOut: Record<string, string> = {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-Session-Detail-Cache': 'miss',
      };
      return new Response(JSON.stringify(out), { headers: headersOut });
    }

    const gpsSel = opts.include_gps ? ',gps_track' : '';
    const swimSel = opts.include_swim ? ',swim_data,number_of_active_lengths,pool_length' : '';
    const select = baseSel + gpsSel + swimSel;

    let query = supabase.from('workouts').select(select).eq('id', id) as any;
    if (userId) query = query.eq('user_id', userId);
    const { data: row, error } = await query.maybeSingle();
    if (error) throw error;
    if (!row) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Normalize light fields only (Phase 1: no heavy processing/downsampling)
    const detail = normalizeBasic(row);

    // No derived fallbacks here; detail is a thin wrapper around stored data.

    // Parse/attach structured fields
    try { (detail as any).computed = (()=>{ try { return typeof row.computed === 'string' ? JSON.parse(row.computed) : (row.computed || null); } catch { return row.computed || null; } })(); } catch {}
    try { (detail as any).metrics  = (()=>{ try { return typeof row.metrics  === 'string' ? JSON.parse(row.metrics)  : (row.metrics  || null); } catch { return row.metrics  || null; } })(); } catch {}
    try { (detail as any).workout_analysis = (()=>{ try { return typeof row.workout_analysis === 'string' ? JSON.parse(row.workout_analysis) : (row.workout_analysis || null); } catch { return row.workout_analysis || null; } })(); } catch {}
    try {
      let se = (()=>{ try { return typeof row.strength_exercises === 'string' ? JSON.parse(row.strength_exercises) : (row.strength_exercises || null); } catch { return row.strength_exercises || null; } })();
      // Normalize strength_exercises sets shape for client (smart server, dumb client)
      if (Array.isArray(se) && se.length > 0) {
        se = se.map((exercise: any, index: number) => ({
          id: exercise.id || `temp-${index}`,
          name: exercise.name || '',
          sets: Array.isArray(exercise.sets)
            ? exercise.sets.map((set: any) => ({
                reps: Number((set?.reps as any) ?? 0) || 0,
                weight: Number((set?.weight as any) ?? 0) || 0,
                rir: typeof set?.rir === 'number' ? set.rir : undefined,
                completed: Boolean(set?.completed)
              }))
            : Array.from({ length: Math.max(1, Number(exercise.sets||0)) }, () => ({ reps: Number(exercise.reps||0)||0, weight: Number(exercise.weight||0)||0, completed: false })),
          reps: Number(exercise.reps || 0) || 0,
          weight: Number(exercise.weight || 0) || 0,
          notes: exercise.notes || '',
          weightMode: exercise.weightMode || 'same'
        }));
      }
      (detail as any).strength_exercises = se;
    } catch {}
    try { (detail as any).mobility_exercises = (()=>{ try { return typeof row.mobility_exercises === 'string' ? JSON.parse(row.mobility_exercises) : (row.mobility_exercises || null); } catch { return row.mobility_exercises || null; } })(); } catch {}
    try { (detail as any).achievements = (()=>{ try { return typeof row.achievements === 'string' ? JSON.parse(row.achievements) : (row.achievements || null); } catch { return row.achievements || null; } })(); } catch {}
    try { (detail as any).device_info = (()=>{ try { return typeof row.device_info === 'string' ? JSON.parse(row.device_info) : (row.device_info || null); } catch { return row.device_info || null; } })(); } catch {}
    let gpsTrack: any = null;
    if (opts.include_gps) {
      try { 
        gpsTrack = typeof row.gps_track === 'string' ? JSON.parse(row.gps_track) : (row.gps_track || null);
      } catch { 
        gpsTrack = row.gps_track || null;
      }
      
      // If gps_track is missing but gps_trackpoints (polyline) exists, decode it server-side
      if ((!gpsTrack || (Array.isArray(gpsTrack) && gpsTrack.length === 0)) && row.gps_trackpoints) {
        console.log(`[workout-detail] Decoding polyline for workout ${id}, polyline length: ${row.gps_trackpoints.length}`);
        try {
          const decoded = decodePolyline(row.gps_trackpoints);
          console.log(`[workout-detail] Decoded ${decoded.length} coordinates from polyline`);
          if (decoded.length > 0) {
            // Convert [lat, lng] to gps_track format: [{lat, lng, timestamp, startTimeInSeconds}]
            const workoutTimestamp = row.timestamp 
              ? Math.floor(new Date(row.timestamp).getTime() / 1000)
              : Math.floor(Date.now() / 1000);
            
            gpsTrack = decoded.map(([lat, lng], index) => ({
              lat,
              lng,
              timestamp: (workoutTimestamp + index) * 1000,
              startTimeInSeconds: workoutTimestamp + index
            }));
            console.log(`[workout-detail] Created gps_track with ${gpsTrack.length} points`);
          }
        } catch (decodeErr) {
          console.error('[workout-detail] Failed to decode polyline:', decodeErr);
        }
      }
      
      // gps_track stays local — only `track` (simplified) is sent to client
    }
    if (opts.include_swim) {
      try { (detail as any).swim_data = typeof row.swim_data === 'string' ? JSON.parse(row.swim_data) : (row.swim_data || null); } catch { (detail as any).swim_data = row.swim_data || null; }
      (detail as any).number_of_active_lengths = row.number_of_active_lengths ?? null;
      (detail as any).pool_length = row.pool_length ?? null;
    }

    // User feedback: RPE and gear (always include - sourced from DB)
    (detail as any).rpe = row.rpe ?? null;
    (detail as any).gear_id = row.gear_id ?? null;
    // Canonical workout_metadata: merge rpe into session_rpe when missing (smart server, dumb client)
    let meta: Record<string, unknown> = {};
    try {
      meta = row.workout_metadata != null
        ? (typeof row.workout_metadata === 'string' ? JSON.parse(row.workout_metadata) : row.workout_metadata)
        : {};
    } catch { meta = {}; }
    if (meta.session_rpe == null && row.rpe != null) meta = { ...meta, session_rpe: row.rpe };
    (detail as any).workout_metadata = meta;

    // Check if processing is complete (for UI to show loading state if needed)
    const hasSeries = (computed: any) => {
      try {
        const s = computed?.analysis?.series || null;
        const n = Array.isArray(s?.distance_m) ? s.distance_m.length : 0;
        const nt = Array.isArray(s?.time_s) ? s.time_s.length : (Array.isArray(s?.time) ? s.time.length : 0);
        return n > 1 && nt > 1;
      } catch { return false; }
    };
    const processingComplete = hasSeries((detail as any).computed);

    // Normalize interval_breakdown: add executed + planned_label + steps (smart server, dumb client)
    const ib = (detail as any).workout_analysis?.detailed_analysis?.interval_breakdown;
    if (ib?.available && Array.isArray(ib.intervals)) {
      for (const iv of ib.intervals) {
        if (!iv.executed && (iv.actual_duration_s != null || iv.actual_distance_m != null || iv.avg_heart_rate_bpm != null)) {
          iv.executed = {
            distance_m: iv.actual_distance_m ?? null,
            duration_s: iv.actual_duration_s ?? null,
            avg_hr: iv.avg_heart_rate_bpm ?? iv.avg_hr ?? null,
          };
        }
        if (!iv.planned_label && iv.interval_type === 'work') {
          iv.planned_label = `Work · ${iv.actual_duration_s ? `${Math.round(iv.actual_duration_s / 60)} min` : ''}`;
        } else if (!iv.planned_label) {
          iv.planned_label = String(iv.interval_type || '');
        }
      }
      // Add steps array for MobileSummary (stepsFromUnplanned)
      ib.steps = ib.intervals.map((iv: any, idx: number) => ({
        id: iv.interval_id || 'unplanned_interval',
        kind: iv.interval_type || 'work',
        type: iv.interval_type || 'work',
        planned_index: idx,
        seconds: iv.planned_duration_s || iv.actual_duration_s,
        duration_s: iv.actual_duration_s,
        distanceMeters: iv.actual_distance_m,
        pace_range: (iv.planned_pace_range_lower != null && iv.planned_pace_range_upper != null)
          ? { lower: iv.planned_pace_range_lower, upper: iv.planned_pace_range_upper }
          : undefined,
      }));
    }

    // computed_detail_steps: from computed.intervals for MobileSummary (smart server, dumb client)
    const compIntervals = Array.isArray((detail as any).computed?.intervals) ? (detail as any).computed.intervals : [];
    (detail as any).computed_detail_steps = compIntervals
      .filter((it: any) => it && (it.executed || it.duration_s || it.distance_m))
      .map((it: any, idx: number) => {
        const exec = it.executed || it;
        const distM = Number(exec?.distance_m ?? exec?.distanceMeters ?? exec?.distance_meters);
        const durS = Number(exec?.duration_s ?? exec?.durationS ?? it?.duration_s);
        return {
          id: String(it?.planned_step_id || it?.id || `exec_${idx}`),
          kind: String(it?.role || it?.kind || it?.interval_type || it?.type || 'segment'),
          label: String(it?.label || it?.name || it?.role || it?.kind || `Segment ${idx + 1}`),
          planned_index: Number.isFinite(Number(it?.planned_index)) ? Number(it.planned_index) : idx,
          seconds: Number.isFinite(durS) ? durS : undefined,
          duration_s: Number.isFinite(durS) ? durS : undefined,
          distanceMeters: Number.isFinite(distM) ? distM : undefined,
          pace_range: it?.pace_range || it?.planned?.pace_range || it?.paceRange || null,
        };
      });

    // track: canonical simplified [lng,lat][] — hard guarantee (smart server, dumb client)
    {
      let fullTrack: [number, number][] = [];
      if (Array.isArray(gpsTrack) && gpsTrack.length > 0) {
        fullTrack = gpsTrack
          .map((p: any) => {
            const lng = p?.lng ?? p?.longitude ?? p?.longitudeInDegree ?? (Array.isArray(p) ? p[0] : undefined);
            const lat = p?.lat ?? p?.latitude ?? p?.latitudeInDegree ?? (Array.isArray(p) ? p[1] : undefined);
            if (Number.isFinite(lng) && Number.isFinite(lat)) return [Number(lng), Number(lat)] as [number, number];
            return null;
          })
          .filter(Boolean) as [number, number][];
      }
      (detail as any).track = simplifyTrack(fullTrack);
    }

    // display_metrics: WorkoutDataNormalized for useWorkoutData (smart server, dumb client)
    const d = detail as any;
    const getDistM = () => { const distKm = Number.isFinite(d?.distance) ? Number(d.distance) * 1000 : null; const distM = d?.computed?.overall?.distance_m ?? null; return Number.isFinite(distM) && distM > 0 ? Number(distM) : (Number.isFinite(distKm) ? Number(distKm) : null); };
    const distM = getDistM();
    const distKm = Number.isFinite(distM) && distM > 0 ? distM / 1000 : null;
    const durS = Number.isFinite(d?.computed?.overall?.duration_s_moving) ? Number(d.computed.overall.duration_s_moving) : (Number.isFinite(d?.moving_time ?? d?.metrics?.moving_time) ? Number(d.moving_time ?? d.metrics.moving_time) * 60 : null);
    const elapsedS = Number.isFinite(d?.computed?.overall?.duration_s_elapsed) ? Number(d.computed.overall.duration_s_elapsed) : (Number.isFinite(d?.elapsed_time ?? d?.metrics?.elapsed_time) ? Number(d.elapsed_time ?? d.metrics.elapsed_time) * 60 : null) ?? durS;
    const elevation_gain_m = Number.isFinite(d?.elevation_gain ?? d?.metrics?.elevation_gain) ? Number(d.elevation_gain ?? d.metrics.elevation_gain) : null;
    const avg_power = Number.isFinite(d?.avg_power ?? d?.metrics?.avg_power) ? Number(d.avg_power ?? d.metrics.avg_power) : null;
    const avg_hr = Number.isFinite(d?.avg_heart_rate ?? d?.metrics?.avg_heart_rate) ? Number(d.avg_heart_rate ?? d.metrics.avg_heart_rate) : null;
    const max_hr = Number.isFinite(d?.max_heart_rate ?? d?.metrics?.max_heart_rate) ? Number(d.max_heart_rate ?? d.metrics.max_heart_rate) : null;
    const max_power = Number.isFinite(d?.max_power ?? d?.metrics?.max_power) ? Number(d.max_power ?? d.metrics.max_power) : null;
    const avg_speed_kmh = Number.isFinite(d?.metrics?.avg_speed) ? Number(d.metrics.avg_speed) : (Number.isFinite(d?.avg_speed) ? Number(d.avg_speed) : (distKm && durS && durS > 0 ? (distKm / (durS / 3600)) : null));
    const avg_speed_mps = Number.isFinite(avg_speed_kmh) ? avg_speed_kmh / 3.6 : null;
    const avg_pace_s_per_km = Number.isFinite(d?.computed?.overall?.avg_pace_s_per_mi) ? Number(d.computed.overall.avg_pace_s_per_mi) / 1.60934 : (Number.isFinite(d?.avg_pace ?? d?.metrics?.avg_pace) ? Number(d.avg_pace ?? d.metrics.avg_pace) : (avg_speed_kmh && avg_speed_kmh > 0 ? (3600 / avg_speed_kmh) : null));
    let max_speed_mps: number | null = Number.isFinite(d?.computed?.analysis?.bests?.max_speed_mps) ? Number(d.computed.analysis.bests.max_speed_mps) : Number.isFinite(d?.computed?.overall?.max_speed_mps) ? Number(d.computed.overall.max_speed_mps) : (Number.isFinite(d?.max_speed ?? d?.metrics?.max_speed) ? Number(d.max_speed ?? d.metrics.max_speed) / 3.6 : null);
    // Series-based fallback: derive from speed_mps samples when all other sources are null
    if (max_speed_mps == null) {
      const speeds: number[] | undefined = d?.computed?.analysis?.series?.speed_mps;
      if (Array.isArray(speeds) && speeds.length > 0) {
        let best = 0;
        for (const s of speeds) { if (Number.isFinite(s) && s > 0.5 && s < 30 && s > best) best = s; }
        if (best > 0) max_speed_mps = best;
      }
    }
    const max_pace_s_per_km = Number.isFinite(d?.computed?.analysis?.bests?.max_pace_s_per_km) ? Number(d.computed.analysis.bests.max_pace_s_per_km) : (Number.isFinite(d?.metrics?.max_pace ?? d?.max_pace) ? Number(d.metrics?.max_pace ?? d.max_pace) : (max_speed_mps && max_speed_mps > 0 ? (1000 / max_speed_mps) : null));
    const max_cadence_rpm = Number.isFinite(d?.max_cadence ?? d?.max_cycling_cadence ?? d?.max_running_cadence) ? Number(d.max_cadence ?? d.max_cycling_cadence ?? d.max_running_cadence) : null;
    const avg_running_cadence_spm = Number.isFinite(d?.avg_cadence ?? d?.avg_running_cadence ?? d?.avg_run_cadence) ? Number(d.avg_cadence ?? d.avg_running_cadence ?? d.avg_run_cadence) : null;
    const avg_cycling_cadence_rpm = Number.isFinite(d?.avg_cadence ?? d?.avg_bike_cadence ?? d?.metrics?.avg_bike_cadence) ? Number(d.avg_cadence ?? d.avg_bike_cadence ?? d.metrics?.avg_bike_cadence) : null;
    const calories = Number.isFinite(d?.calories ?? d?.metrics?.calories) ? Number(d.calories ?? d.metrics.calories) : null;
    const powerMetrics = d?.computed?.analysis?.power;
    const normalized_power = Number.isFinite(powerMetrics?.normalized_power) ? Number(powerMetrics.normalized_power) : null;
    const intensity_factor = Number.isFinite(powerMetrics?.intensity_factor) ? Number(powerMetrics.intensity_factor) : null;
    const variability_index = Number.isFinite(powerMetrics?.variability_index) ? Number(powerMetrics.variability_index) : null;
    const avg_power_pedaling_w = Number.isFinite(powerMetrics?.avg_power_pedaling_w) ? Number(powerMetrics.avg_power_pedaling_w) : null;
    const pct_time_pedaling = Number.isFinite(powerMetrics?.pct_time_pedaling) ? Number(powerMetrics.pct_time_pedaling) : null;
    const swimMetrics = d?.computed?.analysis?.swim;
    const avg_swim_pace_per_100m = Number.isFinite(swimMetrics?.avg_pace_per_100m) ? Number(swimMetrics.avg_pace_per_100m) : null;
    const avg_swim_pace_per_100yd = Number.isFinite(swimMetrics?.avg_pace_per_100yd) ? Number(swimMetrics.avg_pace_per_100yd) : null;
    const work_kj = Number.isFinite(d?.total_work) ? Number(d.total_work) : null;
    const rawSeries = d?.computed?.analysis?.series || null;
    const series = rawSeries ? bucketSeries(rawSeries, MAX_SERIES_POINTS) : null;
    (detail as any).display_metrics = { distance_m: distM, distance_km: distKm, duration_s: durS, elapsed_s: elapsedS, elevation_gain_m: elevation_gain_m, avg_power, avg_hr, max_hr, max_power, max_speed_mps, max_pace_s_per_km, max_cadence_rpm, avg_speed_kmh, avg_speed_mps, avg_pace_s_per_km, avg_running_cadence_spm, avg_cycling_cadence_rpm, avg_swim_pace_per_100m, avg_swim_pace_per_100yd, calories, work_kj, normalized_power, intensity_factor, variability_index, avg_power_pedaling_w, pct_time_pedaling, sport: (d?.type || null), series };

    if (scope === 'workout') {
      return new Response(JSON.stringify({
        workout: detail,
        processing_complete: processingComplete,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { sessionDetailV1: rawSd, snapshot_latency_ms, arcContextLoadFailed } = await runSessionDetailPipelineAndPersist(
      supabase,
      userId || '',
      id,
      row,
      detail,
    );

    const responsePayload: Record<string, unknown> = {
      workout: detail,
      processing_complete: processingComplete,
    };
    if (rawSd) {
      responsePayload.session_detail_v1 = enrichSessionDetailForResponse(row, rawSd, arcContextLoadFailed);
    }
    if (snapshot_latency_ms != null && snapshot_latency_ms >= SNAPSHOT_LATENCY_WARN_MS) {
      responsePayload.snapshot_latency_ms = snapshot_latency_ms;
    }

    return new Response(JSON.stringify(responsePayload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = (e && (e.message || e.msg)) ? (e.message || e.msg) : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


