import React, { useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type {
  CoachWeekContextV1,
  RaceReadinessV1,
  RaceFinishProjectionV1,
} from '@/hooks/useCoachWeekContext';
import { useExerciseLog } from '@/hooks/useExerciseLog';
import StrengthAdjustmentModal from '@/components/StrengthAdjustmentModal';
import { getDisciplineColor, hexToRgb } from '@/lib/context-utils';
import LoadBar from '@/components/LoadBar';
import { supabase, getStoredUserId, invokeFunctionFormData, invokeFunction } from '@/lib/supabase';
import { resolveEventTargetTimeSeconds } from '@/lib/goal-target-time';
import CourseStrategyModal from '@/components/CourseStrategyModal';
import { pickRaceFinishProjectionV1FromCoachData } from '@/lib/coach-payload';
import { planWizardRaceDistanceDisplay } from '@/lib/plan-wizard-distance-label';

type CoachDataProp = {
  data: CoachWeekContextV1 | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  revalidating?: boolean;
};

type PrimaryRaceReadinessRow = NonNullable<CoachWeekContextV1['primary_race_readiness']>;

// ── helpers ───────────────────────────────────────────────────────────────────

function trendColor(dir: string, tone?: string): string {
  if (tone === 'positive') return 'text-emerald-400/90';
  if (tone === 'danger') return 'text-red-400/90';
  if (tone === 'warning') return 'text-amber-400/90';
  if (dir === 'improving') return 'text-emerald-400/85';
  if (dir === 'declining') return 'text-amber-400/85';
  return 'text-white/55';
}

function verdictToneToColor(tone: string): string {
  if (tone === 'action')   return 'text-amber-400/90';
  if (tone === 'caution')  return 'text-red-400/90';
  if (tone === 'positive') return 'text-emerald-400/85';
  if (tone === 'muted')    return 'text-sky-400/75';
  return 'text-white/60';
}


function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

/** Goal target finish clock from coach `goal_context.primary_event.target_time` (seconds). */
function fmtGoalClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const mi = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${mi}:${String(s).padStart(2, '0')}`;
}

function isRunPrimary(pe: { sport?: string | null } | null | undefined): boolean {
  if (!pe) return false;
  const s = String(pe.sport || '').toLowerCase();
  return s === 'run' || s === 'running' || !pe.sport;
}

function goalMetaFromGoalLite(
  g: { name: string; sport?: string | null; distance?: string | null; target_time?: number | null } | null | undefined,
  upcoming: Array<{ name: string; weeks_out: number }> | undefined,
): { name: string; weeks_out: number; distance: string; target_time_seconds: number | null } | null {
  if (!g || !isRunPrimary(g)) return null;
  const weeksOutMeta = upcoming?.find(r => r.name === g.name)?.weeks_out ?? 0;
  const tt = (g as { target_time?: number | null }).target_time;
  return {
    name: g.name,
    weeks_out: weeksOutMeta,
    distance: g.distance || 'marathon',
    target_time_seconds:
      tt != null && Number.isFinite(Number(tt)) && Number(tt) > 0 ? Math.round(Number(tt)) : null,
  };
}

// ── sub-components ────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-white/[0.055] last:border-0">
      <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase w-[72px] shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex-1 text-[12px] text-white/80 flex flex-wrap gap-x-3 gap-y-1 leading-none">
        {children}
      </div>
    </div>
  );
}

function Chip({ label, value, valueClass }: { label?: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      {label != null && <span className="text-white/60 text-[11px]">{label}</span>}
      <span className={valueClass ?? 'text-white/80'}>{value}</span>
    </span>
  );
}

function Dot() {
  return <span className="text-white/30 select-none">·</span>;
}

function assessmentColor(a: RaceReadinessV1['assessment']): string {
  if (a === 'ahead') return 'text-emerald-400/90';
  if (a === 'on_track') return 'text-emerald-400/85';
  if (a === 'behind') return 'text-amber-400/90';
  return 'text-red-400/90';
}

function assessmentLabel(a: RaceReadinessV1['assessment']): string {
  if (a === 'ahead') return 'ahead';
  if (a === 'on_track') return 'on track';
  if (a === 'behind') return 'stretch';
  return 'adjust target';
}

function signalToneColor(tone: string): string {
  if (tone === 'positive') return 'text-emerald-400/85';
  if (tone === 'warning') return 'text-amber-400/85';
  return 'text-white/65';
}

function RaceSection({
  projection,
  rr,
  goalMeta,
  planWizardDistance,
  planWizardTargetSeconds,
  primaryRaceReadiness,
  onOpenKeyRun,
  resolvedGoalId,
  courseRow,
  courseBusy,
  onAddCourse,
  onViewStrategy,
}: {
  projection: RaceFinishProjectionV1 | null;
  rr: RaceReadinessV1 | null;
  goalMeta: { name: string; weeks_out: number; distance: string; target_time_seconds: number | null } | null;
  /** From coach `plan.active_plans[].distance` (same as Plan Wizard / plan config). */
  planWizardDistance: string | null;
  /** `plans.config.target_time` from coach (Plan Wizard / generate-run-plan). Shown when coach RFP row is absent. */
  planWizardTargetSeconds: number | null;
  primaryRaceReadiness?: PrimaryRaceReadinessRow | null;
  onOpenKeyRun?: (workoutId: string) => void;
  resolvedGoalId: string | null;
  courseRow: { id: string; name: string } | null;
  courseBusy: boolean;
  onAddCourse: () => void;
  onViewStrategy: () => void;
}) {
  const distLabel = planWizardRaceDistanceDisplay(
    planWizardDistance ?? rr?.goal.distance ?? goalMeta?.distance ?? null,
  );
  const weeksOut = rr?.goal.weeks_out ?? goalMeta?.weeks_out ?? 0;

  const statedSec = goalMeta?.target_time_seconds ?? null;
  const wizardSec =
    planWizardTargetSeconds != null && Number.isFinite(planWizardTargetSeconds) && planWizardTargetSeconds > 0
      ? Math.round(planWizardTargetSeconds)
      : null;
  /** Stated goal from plan row, goal meta, or wizard — no client-side pace math. */
  const statedGoalDisplay =
    projection?.plan_goal_display ??
    (statedSec != null ? fmtGoalClock(statedSec) : wizardSec != null ? fmtGoalClock(wizardSec) : null);
  /** Server fitness clock from projection, else coach race_readiness (same server pipeline). */
  const projectedFromTraining =
    projection?.fitness_projection_display ?? rr?.predicted_finish_display ?? null;
  const hideDuplicateProjected =
    statedGoalDisplay != null &&
    projectedFromTraining != null &&
    statedGoalDisplay === projectedFromTraining;
  const showProjectedRow = projectedFromTraining != null && !hideDuplicateProjected;
  const hasAnyFinishTime = statedGoalDisplay != null || projectedFromTraining != null;

  return (
    <div className="px-3 py-3 space-y-2.5">
      {/* Header: goal + weeks out */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase">RACE</span>
        <span className="text-[11px] text-white/55">{distLabel} — {weeksOut}w out</span>
      </div>

      {/* Stated goal vs server fitness projection (pacing anchor stays on projection for Course Strategy). */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-3 min-w-0 flex-1">
          {statedGoalDisplay != null && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] text-white/45 leading-snug">Your goal</p>
              <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
                {statedGoalDisplay}
              </span>
            </div>
          )}
          {showProjectedRow && (
            <div className="flex flex-col gap-0.5">
              <p className="text-[10px] text-white/45 leading-snug">Projected from your training</p>
              <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">
                {projectedFromTraining}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
          {rr?.delta_display && (
            <span className={`text-[13px] font-medium tabular-nums ${assessmentColor(rr.assessment)}`}>
              {rr.delta_display}
            </span>
          )}
          {rr && (
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${assessmentColor(rr.assessment)}`}>
              {assessmentLabel(rr.assessment)}
            </span>
          )}
        </div>
      </div>

      {projection?.mismatch_blurb && (
        <p className="text-[11px] text-white/50 leading-relaxed">{projection.mismatch_blurb}</p>
      )}
      {!hasAnyFinishTime && (
        <p className="text-[11px] text-sky-400/80 leading-snug">
          No finish time yet — pull down to refresh State.
        </p>
      )}

      {/* Target comparison — full race_readiness only */}
      {rr?.target_finish_display && (
        <div className="flex items-baseline gap-2 text-[11px] text-white/55">
          <span>Target {rr.target_finish_display}</span>
          <Dot />
          <span>Race pace {rr.predicted_race_pace_display}</span>
        </div>
      )}

      {/* VDOT trend */}
      {rr && (
        <div className="flex items-baseline gap-2 text-[11px]">
          <span className="text-white/55">VDOT {rr.current_vdot.toFixed(1)}</span>
          {rr.plan_vdot != null && rr.vdot_delta != null && rr.vdot_direction !== 'stable' && (
            <>
              <Dot />
              <span className={rr.vdot_direction === 'improved' ? 'text-emerald-400/85' : 'text-amber-400/85'}>
                {rr.vdot_delta > 0 ? '+' : ''}{rr.vdot_delta.toFixed(1)} since plan start
              </span>
            </>
          )}
        </div>
      )}

      {/* Assessment message */}
      {rr && (
        <p className="text-[12px] text-white/65 leading-relaxed">{rr.assessment_message}</p>
      )}

      {resolvedGoalId && (
        <div className="pt-0.5">
          {courseBusy ? (
            <p className="text-[11px] text-white/40">Working on course…</p>
          ) : courseRow ? (
            <button
              type="button"
              onClick={onViewStrategy}
              className="w-full text-left text-[12px] text-sky-400/85 hover:text-sky-300/90 py-1"
            >
              View terrain strategy → <span className="text-white/40">{courseRow.name}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddCourse}
              className="w-full text-left text-[12px] text-sky-400/85 hover:text-sky-300/90 py-1"
            >
              Add course for terrain strategy based on your data →
            </button>
          )}
        </div>
      )}

      {/* KEY RUN — primary long-run race readiness (single signal; full block on Performance) */}
      {primaryRaceReadiness && onOpenKeyRun && (
        <button
          type="button"
          onClick={() => onOpenKeyRun(primaryRaceReadiness.workout_id)}
          className="w-full text-left rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-3 space-y-2.5 mt-1 active:opacity-90"
        >
          <span className="text-[10px] font-medium text-white/45 uppercase tracking-wide">Key run</span>
          <p className="text-[11px] text-white/50 tabular-nums">
            {fmtDate(primaryRaceReadiness.workout_date)} · {primaryRaceReadiness.distance_miles}mi
          </p>
          <p className="text-[13px] font-semibold text-white/90 leading-snug">{primaryRaceReadiness.headline}</p>
          {!!String(primaryRaceReadiness.tactical_instruction || '').trim() && (
            <div className="rounded-md border border-white/15 bg-white/[0.08] px-2.5 py-2">
              <span className="text-[10px] font-medium text-white/45 uppercase tracking-wide">Race day</span>
              <p className="text-[12px] text-white/85 mt-0.5 leading-snug">{primaryRaceReadiness.tactical_instruction}</p>
            </div>
          )}
          {!!String(primaryRaceReadiness.projection || '').trim() && (
            <p className="text-[11px] text-white/45 leading-relaxed">{primaryRaceReadiness.projection}</p>
          )}
          <span className="text-[11px] font-normal text-white/40">View full analysis →</span>
        </button>
      )}

      {/* Training signals */}
      {rr && rr.training_signals.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
          {rr.training_signals.map((s, i) => (
            <span key={i} className="text-[11px]">
              <span className="text-white/50">{s.label}</span>{' '}
              <span className={signalToneColor(s.tone)}>{s.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Pace zones */}
      {rr && (
        <div className="flex items-center gap-3 pt-0.5 text-[10px] text-white/45">
          <span>Easy {rr.pace_zones.easy}</span>
          <span>Threshold {rr.pace_zones.threshold}</span>
          <span>Race {rr.pace_zones.race}</span>
        </div>
      )}

      {/* Modifiers */}
      {rr && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/35">
          {rr.data_source === 'plan_targets' && (
            <span className="italic">Based on plan targets</span>
          )}
          {rr.durability_factor < 0.97 && (
            <span>Durability adj {((1 - rr.durability_factor) * 100).toFixed(1)}%</span>
          )}
          {rr.durability_factor >= 1.0 && (
            <span className="text-emerald-400/40">Durability +{((rr.durability_factor - 1) * 100).toFixed(1)}%</span>
          )}
          {rr.confidence_adjustment_pct > 0 && (
            <span>Confidence adj +{rr.confidence_adjustment_pct.toFixed(1)}%</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function StateTab({
  coachData,
  onClose,
  onSelectWorkout,
}: {
  coachData: CoachDataProp;
  onClose?: () => void;
  onSelectWorkout?: (workout: any) => void;
}) {
  const { data, loading, error, refresh, revalidating } = coachData;
  const coachBusy = loading || Boolean(revalidating);
  const { liftTrends } = useExerciseLog(8);
  const [adjustingLift, setAdjustingLift] = useState<string | null>(null);
  const [resolvedGoalId, setResolvedGoalId] = useState<string | null>(null);
  const [stateCourseRow, setStateCourseRow] = useState<{ id: string; name: string } | null>(null);
  const [courseBusy, setCourseBusy] = useState(false);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyCourseId, setStrategyCourseId] = useState<string | null>(null);
  const stateCourseFileRef = useRef<HTMLInputElement>(null);

  const raceReadiness = (data as CoachWeekContextV1 | null)?.race_readiness ?? null;
  const raceFinishProjection = pickRaceFinishProjectionV1FromCoachData(data as CoachWeekContextV1 | null);

  useEffect(() => {
    const gc = (data as CoachWeekContextV1 | null)?.goal_context;
    const planId = data?.weekly_state_v1?.plan?.plan_id ?? null;
    const goalFromPlan =
      planId && gc?.goals ? gc.goals.find(g => g.plan_id === planId && isRunPrimary(g)) : undefined;

    const goalIdFromCoach =
      raceFinishProjection?.goal_id?.trim() ||
      raceReadiness?.goal?.id?.trim() ||
      gc?.primary_event?.id?.trim() ||
      goalFromPlan?.id?.trim() ||
      null;

    if (!goalIdFromCoach) {
      setResolvedGoalId(null);
      setStateCourseRow(null);
      return;
    }
    const uid = getStoredUserId();
    if (!uid) return;
    let cancelled = false;

    (async () => {
      let goalId: string | null = goalIdFromCoach;

      if (!goalId && raceReadiness) {
        const { data: goalsRows, error: goalsErr } = await supabase
          .from('goals')
          .select('id, name, status, sport')
          .eq('user_id', uid)
          .eq('status', 'active');
        if (goalsErr) {
          console.warn('[StateTab] goals lookup failed:', goalsErr.message);
          if (!cancelled) {
            setResolvedGoalId(null);
            setStateCourseRow(null);
          }
          return;
        }
        const g = (goalsRows || []).find(
          (x: { name?: string; sport?: string | null }) =>
            String(x.name || '') === raceReadiness.goal.name && String(x.sport || '').toLowerCase() === 'run',
        ) as { id: string } | undefined;
        goalId = g?.id ?? null;
      }

      if (!goalId || cancelled) {
        if (!cancelled) {
          setResolvedGoalId(null);
          setStateCourseRow(null);
        }
        return;
      }
      if (!cancelled) setResolvedGoalId(goalId);
      const { data: rc } = await supabase.from('race_courses').select('id, name').eq('goal_id', goalId).maybeSingle();
      if (cancelled) return;
      if (rc?.id) setStateCourseRow({ id: rc.id as string, name: String(rc.name || 'Course') });
      else setStateCourseRow(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    raceFinishProjection?.goal_id,
    raceReadiness?.goal?.id,
    raceReadiness?.goal?.name,
    raceReadiness?.goal?.weeks_out,
    data?.weekly_state_v1?.plan?.plan_id,
    (data as CoachWeekContextV1 | null)?.goal_context?.primary_event?.id,
    (data as CoachWeekContextV1 | null)?.goal_context?.goals
      ?.map(g => `${g.id}:${g.plan_id ?? '-'}`)
      .join('|'),
    raceFinishProjection ? 1 : 0,
    raceReadiness ? 1 : 0,
  ]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-4 h-4 animate-spin text-white/45" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="py-8 text-center text-[12px] text-white/50">{error ?? 'No data'}</div>;
  }

  const wsv = data.weekly_state_v1;
  if (!wsv) return <div className="py-8 text-center text-[12px] text-white/50">Loading state…</div>;

  const week = wsv.week;
  const load = wsv.load;
  const rm = ((data as any)?.response_model ?? (wsv as any)?.response_model) as {
    visible_signals: Array<{ label: string; category?: string; trend: string; trend_tone: string; detail: string; samples: number }>;
    overall_training_read?: { summary: string; tone: 'positive' | 'warning' | 'neutral' | 'info' } | null;
    strength: { per_lift: Array<{ canonical_name: string; display_name: string; e1rm_trend: string; rir_current: number | null; sufficient: boolean }> };
    endurance: unknown;
    assessment: { label: string; signals_concerning: number };
  } | undefined;
  const snap = (data as any)?.athlete_snapshot ?? null;
  const loadStatus = snap?.body_response?.load_status ?? null;
  const primaryRaceReadiness: PrimaryRaceReadinessRow | null = data?.primary_race_readiness ?? null;

  const gc = (data as CoachWeekContextV1).goal_context;
  const pe = gc?.primary_event;

  const goalMetaPrimary = pe ? goalMetaFromGoalLite(pe, gc?.upcoming_races) : null;
  const projGid = raceFinishProjection?.goal_id?.trim();
  const goalForProj = projGid && gc?.goals ? gc.goals.find(x => x.id === projGid) : undefined;
  const goalMetaFromProjection = goalForProj ? goalMetaFromGoalLite(goalForProj, gc?.upcoming_races) : null;
  const activePlanId = wsv.plan.plan_id;
  const goalLinkedToPlan =
    activePlanId && gc?.goals
      ? gc.goals.find(g => g.plan_id === activePlanId && isRunPrimary(g))
      : undefined;
  const goalMetaFromPlanLink = goalLinkedToPlan
    ? goalMetaFromGoalLite(goalLinkedToPlan, gc?.upcoming_races)
    : null;
  const goalMeta = goalMetaPrimary ?? goalMetaFromProjection ?? goalMetaFromPlanLink ?? null;

  const planRoot = (
    data as CoachWeekContextV1 & {
      plan?: {
        active_plans?: Array<{
          plan_id?: string | null;
          distance?: string | null;
          is_primary?: boolean;
          plan_target_finish_seconds?: number | null;
        }>;
      };
    }
  ).plan;
  const activePlans = planRoot?.active_plans;
  const planWizardDistance =
    (activePlanId && activePlans?.find(p => p.plan_id === activePlanId)?.distance) ??
    activePlans?.find(p => p.is_primary)?.distance ??
    activePlans?.[0]?.distance ??
    null;
  const planWizardTargetSeconds =
    (activePlanId && activePlans?.find(p => p.plan_id === activePlanId)?.plan_target_finish_seconds) ??
    activePlans?.find(p => p.is_primary)?.plan_target_finish_seconds ??
    activePlans?.[0]?.plan_target_finish_seconds ??
    null;

  async function handleStateCourseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !resolvedGoalId) return;
    const uid = getStoredUserId();
    const { data: gRow } = await supabase.from('goals').select('name').eq('id', resolvedGoalId).maybeSingle();
    let planRows: { config?: Record<string, unknown> }[] | null = null;
    if (uid) {
      const { data } = await supabase
        .from('plans')
        .select('config')
        .eq('user_id', uid)
        .eq('goal_id', resolvedGoalId)
        .order('updated_at', { ascending: false })
        .limit(5);
      planRows = data;
    }
    let paceTargetSec =
      raceReadiness?.target_finish_time_seconds != null &&
      Number.isFinite(raceReadiness.target_finish_time_seconds) &&
      raceReadiness.target_finish_time_seconds > 0
        ? raceReadiness.target_finish_time_seconds
        : null;
    if (paceTargetSec == null) {
      for (const p of planRows || []) {
        const t = resolveEventTargetTimeSeconds({}, (p as { config?: Record<string, unknown> }).config ?? null);
        if (t != null) {
          paceTargetSec = t;
          break;
        }
      }
    }
    const coachPredSec =
      raceFinishProjection &&
      raceFinishProjection.goal_id === resolvedGoalId &&
      Number.isFinite(raceFinishProjection.anchor_seconds) &&
      raceFinishProjection.anchor_seconds > 0
        ? raceFinishProjection.anchor_seconds
        : raceReadiness &&
            (raceReadiness.goal.id === resolvedGoalId ||
              String(gRow?.name || '') === String(raceReadiness.goal.name)) &&
            Number.isFinite(raceReadiness.predicted_finish_time_seconds) &&
            raceReadiness.predicted_finish_time_seconds > 0
          ? raceReadiness.predicted_finish_time_seconds
          : null;
    if (paceTargetSec == null && coachPredSec == null) {
      window.alert(
        'No pacing target yet: set a race target on the goal or plan, or refresh State and try again.',
      );
      return;
    }
    setCourseBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', `${String(gRow?.name || raceReadiness?.goal?.name || 'Race')} course`);
      fd.append('goal_id', resolvedGoalId);
      const { data: up, error: upErr } = await invokeFunctionFormData<{ course_id: string }>('course-upload', fd);
      if (upErr || !up?.course_id) {
        window.alert(upErr?.message || 'Upload failed');
        return;
      }
      const { error: stErr } = await invokeFunction('course-strategy', { course_id: up.course_id });
      if (stErr) {
        window.alert(stErr.message || 'Strategy failed');
        return;
      }
      setStateCourseRow({ id: up.course_id, name: `${String(gRow?.name || raceReadiness?.goal?.name || 'Race')} course` });
      setStrategyCourseId(up.course_id);
      setStrategyModalOpen(true);
    } finally {
      setCourseBusy(false);
    }
  }

  // ── WEEK header ──────────────────────────────────────────────────────────
  const weekLabel = week.index != null ? `WK ${week.index}` : 'WEEK';

  // ── BODY row — endurance signals only (strength signals go in STRENGTH row) ─
  const visibleSignals = (rm?.visible_signals ?? []).filter((s: any) => s.category === 'endurance');

  // ── STRENGTH row — server-computed per_lift from response_model ──────────
  const perLift = (rm?.strength?.per_lift ?? []).filter((l: any) => l.sufficient).slice(0, 5);
  // Still use liftTrends only for pre-filling the adjustment modal (best_weight)
  const liftWeightMap = new Map(liftTrends.map(lt => [lt.canonical, lt.entries[lt.entries.length - 1]?.best_weight ?? 0]));

  // ── RUN row — from run_session_types_7d ──────────────────────────────────
  const runTypes = (wsv as any).run_session_types_7d as Array<{
    type: string;
    sample_size: number;
    avg_execution_score: number | null;
    avg_hr_drift_bpm: number | null;
  }> ?? [];

  // ── NEXT row ─────────────────────────────────────────────────────────────
  const sessionsRemaining = data.week?.key_sessions_remaining ?? [];
  const nextSessions = sessionsRemaining.slice(0, 3);

  // ── intent summary + readiness — server-computed ─────────────────────────
  const intentSummary = wsv.week.intent_summary ?? null;
  const weekNarrative = wsv.coach?.narrative ?? null;
  const raceWeekGuidance = wsv.coach?.grounded_race_week_guidance_v1;
  const trends = wsv.trends;
  const readinessLabel = trends.readiness_label;
  const readiness = trends.readiness_state;
  const readinessColor =
    readiness === 'fresh' ? 'text-emerald-400/90' :
    readiness === 'adapting' ? 'text-sky-400/85' :
    readiness === 'overreached' ? 'text-red-400/90' :
    readiness === 'fatigued' ? 'text-amber-400/90' :
    'text-white/60';


  // ── Cross-training signal (server-computed) ──────────────────────────────
  const crossTrainingSignal = load.cross_training_signal ?? null;

  return (
    <div className="pt-1 pb-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-4 px-0.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[11px] font-semibold tracking-widest text-white/65 uppercase">{weekLabel}</span>
            {readinessLabel && (
              <span className={`text-[11px] uppercase tracking-wider font-semibold ${readinessColor}`}>· {readinessLabel}</span>
            )}
          </div>
          {intentSummary && (
            <span className="text-[14px] font-medium text-white/85 leading-snug">{intentSummary}</span>
          )}
          {weekNarrative && (
            <span className="text-[12px] text-white/50 leading-snug">{weekNarrative}</span>
          )}
          {raceWeekGuidance && raceWeekGuidance.bullets.length > 0 && (
            <div
              className="mt-2 rounded-lg border border-sky-400/20 bg-sky-500/[0.07] px-3 py-2.5"
              role="region"
              aria-label="Race-week guidance"
            >
              <p className="text-[10px] font-semibold tracking-[0.12em] text-sky-300/85 uppercase mb-1.5">
                {raceWeekGuidance.title}
              </p>
              <ul className="text-[11px] text-white/72 leading-relaxed space-y-1.5 list-disc pl-3.5 marker:text-sky-400/50">
                {raceWeekGuidance.bullets.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={coachBusy}
          className="min-h-[44px] min-w-[44px] -mr-1 flex items-center justify-center rounded-lg text-white/40 hover:text-white/65 hover:bg-white/[0.06] disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0 touch-manipulation relative z-10"
          aria-label={coachBusy ? 'Updating training data' : 'Refresh'}
        >
          <RefreshCw className={`w-4 h-4 ${coachBusy ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] divide-y divide-white/[0.055]">

        {/* LOAD — full-width gauge + sparkline */}
        <LoadBar load={load} loadStatus={loadStatus} readinessState={readiness} weekIntent={week.intent} />

        {/* BODY */}
        <div className="px-3 py-3">
          <div className="flex items-start gap-3">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase pt-0.5 w-[72px] shrink-0">BODY</span>
            <div className="flex-1 space-y-1.5">
              {visibleSignals.length === 0 && (rm as any)?.overall_training_read?.summary && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[12px] text-white/70">This week</span>
                  <span
                    className={`text-[12px] text-right max-w-[min(100%,220px)] leading-snug ${
                      (rm as any).overall_training_read.tone === 'positive'
                        ? 'text-emerald-400/90'
                        : (rm as any).overall_training_read.tone === 'warning'
                          ? 'text-amber-400/90'
                          : (rm as any).overall_training_read.tone === 'info'
                            ? 'text-sky-400/85'
                            : 'text-white/70'
                    }`}
                  >
                    {(rm as any).overall_training_read.summary}
                  </span>
                </div>
              )}
              {visibleSignals.length === 0 && !(rm as any)?.overall_training_read?.summary && (
                <Chip value="not enough data" valueClass="text-white/55" />
              )}
              {visibleSignals.map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-[12px] text-white/70">{s.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] ${trendColor(s.trend, s.trend_tone)}`}>{s.detail}</span>
                  </div>
                </div>
              ))}
              {crossTrainingSignal && (
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[12px] text-white/70">Cross-training</span>
                  <span className={`text-[12px] ${
                    crossTrainingSignal.tone === 'positive' ? 'text-emerald-400/90' :
                    crossTrainingSignal.tone === 'warning' ? 'text-amber-400/90' :
                    crossTrainingSignal.tone === 'info' ? 'text-sky-400/85' :
                    'text-white/70'
                  }`}>{crossTrainingSignal.label}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AERO */}
        {runTypes.some(rt => rt.avg_execution_score != null) && (
          <div className="px-3 py-3">
            <Row label="AERO">
              {runTypes.filter(rt => rt.avg_execution_score != null).map((rt, i) => {
                const effColor = rt.avg_execution_score! >= 80 ? 'text-emerald-400/85'
                  : rt.avg_execution_score! >= 60 ? 'text-white/70'
                  : 'text-amber-400/85';
                return (
                  <React.Fragment key={rt.type}>
                    {i > 0 && <Dot />}
                    <Chip label={rt.type} value={`${Math.round(rt.avg_execution_score!)}% eff`} valueClass={effColor} />
                  </React.Fragment>
                );
              })}
            </Row>
          </div>
        )}

        {/* STRENGTH */}
        <div className="px-3 py-3">
          <div className="flex items-start gap-3">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase pt-0.5 w-[72px] shrink-0">STRENGTH</span>
            <div className="flex-1 space-y-2">
              {perLift.length === 0 && <Chip value="no data" valueClass="text-white/55" />}
              {perLift.map((lt: any) => {
                const verdictLabel: string = lt.verdict_label ?? '—';
                const verdictColor = verdictToneToColor(lt.verdict_tone ?? 'neutral');
                const suggestedWeight: number | null = lt.suggested_weight ?? null;
                const bestWeight: number | null = lt.best_weight ?? liftWeightMap.get(lt.canonical_name) ?? null;
                const hasWeightSuggestion = suggestedWeight != null && bestWeight != null && bestWeight > 0;
                const e1rmPct = lt.e1rm_current != null && lt.peak1RM > 0
                  ? Math.min(100, Math.round((lt.e1rm_current / lt.peak1RM) * 100))
                  : lt.e1rm_current != null && lt.e1rm_previous != null && lt.e1rm_previous > 0
                  ? Math.min(100, Math.round((lt.e1rm_current / (lt.e1rm_previous * 1.1)) * 100))
                  : null;
                return (
                  <div key={lt.canonical_name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-white/80">{lt.display_name}</span>
                      <span className="relative">
                        {hasWeightSuggestion ? (
                          <button
                            onClick={() => setAdjustingLift(adjustingLift === lt.canonical_name ? null : lt.canonical_name)}
                            className={`text-[12px] ${verdictColor} underline decoration-dotted underline-offset-2 hover:opacity-80`}
                          >{bestWeight} → {suggestedWeight} lbs</button>
                        ) : (
                          <span className={`text-[12px] ${verdictColor}`}>{verdictLabel}</span>
                        )}
                        {adjustingLift === lt.canonical_name && (
                          <StrengthAdjustmentModal
                            exerciseName={lt.display_name}
                            currentWeight={bestWeight ?? 0}
                            nextPlannedWeight={suggestedWeight ?? bestWeight ?? 0}
                            targetRir={(lt as any).rir_target ?? undefined}
                            actualRir={lt.rir_current ?? undefined}
                            planId={wsv.plan.plan_id ?? undefined}
                            isBodyweight={false}
                            hasPlannedWeight={(bestWeight ?? 0) > 0}
                            onClose={() => setAdjustingLift(null)}
                            onSaved={() => { setAdjustingLift(null); refresh(); }}
                          />
                        )}
                      </span>
                    </div>
                    {e1rmPct != null && (
                      <div className="h-[3px] w-full rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${e1rmPct}%`,
                            backgroundColor: verdictLabel === 'add weight' ? 'rgba(251,191,36,0.5)' :
                              verdictLabel === 'back off weight' ? 'rgba(248,113,113,0.4)' :
                              verdictLabel === 'getting stronger' ? 'rgba(52,211,153,0.4)' :
                              'rgba(255,255,255,0.15)',
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RACE — show when active plan or projection/readiness/goal meta exists (same finish anchor as terrain when available). */}
        {(wsv.plan?.has_active_plan || raceFinishProjection || raceReadiness || goalMeta) && (
          <RaceSection
            projection={raceFinishProjection}
            rr={raceReadiness}
            goalMeta={goalMeta}
            planWizardDistance={planWizardDistance}
            planWizardTargetSeconds={planWizardTargetSeconds ?? null}
            primaryRaceReadiness={primaryRaceReadiness}
            resolvedGoalId={resolvedGoalId}
            courseRow={stateCourseRow}
            courseBusy={courseBusy}
            onAddCourse={() => stateCourseFileRef.current?.click()}
            onViewStrategy={() => {
              if (stateCourseRow?.id) {
                setStrategyCourseId(stateCourseRow.id);
                setStrategyModalOpen(true);
              }
            }}
            onOpenKeyRun={
              onSelectWorkout
                ? (workoutId) => {
                    onClose?.();
                    onSelectWorkout({ id: workoutId, workout_status: 'completed', type: 'run' });
                  }
                : undefined
            }
          />
        )}

        {/* NEXT */}
        <div className="px-3 py-3">
          <Row label="NEXT">
            {nextSessions.length === 0 && <Chip value="week complete" valueClass="text-white/55" />}
            {nextSessions.map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Dot />}
                <Chip label={fmtDate(s.date)} value={s.name ?? s.type} />
              </React.Fragment>
            ))}
          </Row>
        </div>
      </div>

      {wsv.plan.plan_name && (
        <div className="mt-2 px-0.5 text-[10px] text-white/60 uppercase tracking-widest">
          {wsv.plan.plan_name}
        </div>
      )}

      <input
        ref={stateCourseFileRef}
        type="file"
        accept=".gpx,application/gpx+xml,.xml"
        className="hidden"
        onChange={handleStateCourseFile}
      />
      <CourseStrategyModal
        open={strategyModalOpen}
        courseId={strategyCourseId}
        onClose={() => {
          setStrategyModalOpen(false);
          setStrategyCourseId(null);
        }}
      />
    </div>
  );
}
