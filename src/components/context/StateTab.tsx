import React, { useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { CoachWeekContextV1, RaceReadinessV1 } from '@/hooks/useCoachWeekContext';
import { useExerciseLog } from '@/hooks/useExerciseLog';
import StrengthAdjustmentModal from '@/components/StrengthAdjustmentModal';
import { getDisciplineColor, hexToRgb } from '@/lib/context-utils';
import LoadBar from '@/components/LoadBar';
import { supabase, getStoredUserId, invokeFunctionFormData, invokeFunction } from '@/lib/supabase';
import { resolveEventTargetTimeSeconds } from '@/lib/goal-target-time';
import CourseStrategyModal from '@/components/CourseStrategyModal';

type CoachDataProp = {
  data: CoachWeekContextV1 | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
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
  rr,
  primaryRaceReadiness,
  onOpenKeyRun,
  resolvedGoalId,
  courseRow,
  courseBusy,
  onAddCourse,
  onViewStrategy,
}: {
  rr: RaceReadinessV1;
  primaryRaceReadiness?: PrimaryRaceReadinessRow | null;
  onOpenKeyRun?: (workoutId: string) => void;
  resolvedGoalId: string | null;
  courseRow: { id: string; name: string } | null;
  courseBusy: boolean;
  onAddCourse: () => void;
  onViewStrategy: () => void;
}) {
  const distLabel = rr.goal.distance.replace(/_/g, ' ');
  return (
    <div className="px-3 py-3 space-y-2.5">
      {/* Header: goal + weeks out */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase">RACE</span>
        <span className="text-[11px] text-white/55">{rr.goal.name} — {rr.goal.weeks_out}w out</span>
      </div>

      {/* Predicted finish + delta */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] font-semibold tabular-nums text-white/90 tracking-tight">{rr.predicted_finish_display}</span>
          <span className="text-[11px] text-white/50">{distLabel}</span>
        </div>
        <div className="flex items-baseline gap-2">
          {rr.delta_display && (
            <span className={`text-[13px] font-medium tabular-nums ${assessmentColor(rr.assessment)}`}>
              {rr.delta_display}
            </span>
          )}
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${assessmentColor(rr.assessment)}`}>
            {assessmentLabel(rr.assessment)}
          </span>
        </div>
      </div>

      {/* Target comparison */}
      {rr.target_finish_display && (
        <div className="flex items-baseline gap-2 text-[11px] text-white/55">
          <span>Target {rr.target_finish_display}</span>
          <Dot />
          <span>Race pace {rr.predicted_race_pace_display}</span>
        </div>
      )}

      {/* VDOT trend */}
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

      {/* Assessment message */}
      <p className="text-[12px] text-white/65 leading-relaxed">{rr.assessment_message}</p>

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
      {rr.training_signals.length > 0 && (
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
      <div className="flex items-center gap-3 pt-0.5 text-[10px] text-white/45">
        <span>Easy {rr.pace_zones.easy}</span>
        <span>Threshold {rr.pace_zones.threshold}</span>
        <span>Race {rr.pace_zones.race}</span>
      </div>

      {/* Modifiers */}
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
  const { data, loading, error, refresh } = coachData;
  const { liftTrends } = useExerciseLog(8);
  const [adjustingLift, setAdjustingLift] = useState<string | null>(null);
  const [resolvedGoalId, setResolvedGoalId] = useState<string | null>(null);
  const [stateCourseRow, setStateCourseRow] = useState<{ id: string; name: string } | null>(null);
  const [courseBusy, setCourseBusy] = useState(false);
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [strategyCourseId, setStrategyCourseId] = useState<string | null>(null);
  const stateCourseFileRef = useRef<HTMLInputElement>(null);

  const raceReadiness = (data as { race_readiness?: RaceReadinessV1 | null } | null)?.race_readiness ?? null;

  useEffect(() => {
    if (!raceReadiness) {
      setResolvedGoalId(null);
      setStateCourseRow(null);
      return;
    }
    const uid = getStoredUserId();
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const { data: goalsRows } = await supabase
        .from('goals')
        .select('id, name, status, target_time, sport')
        .eq('user_id', uid)
        .eq('status', 'active');
      const g = (goalsRows || []).find(
        (x: { name?: string; sport?: string | null }) =>
          String(x.name || '') === raceReadiness.goal.name && String(x.sport || '').toLowerCase() === 'run',
      ) as { id: string } | undefined;
      if (!g || cancelled) {
        if (!cancelled) {
          setResolvedGoalId(null);
          setStateCourseRow(null);
        }
        return;
      }
      if (!cancelled) setResolvedGoalId(g.id);
      const { data: rc } = await supabase.from('race_courses').select('id, name').eq('goal_id', g.id).maybeSingle();
      if (cancelled) return;
      if (rc?.id) setStateCourseRow({ id: rc.id as string, name: String(rc.name || 'Course') });
      else setStateCourseRow(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [raceReadiness]);

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
  const rm = (wsv as any).response_model as {
    visible_signals: Array<{ label: string; trend: string; trend_tone: string; detail: string; samples: number }>;
    strength: { per_lift: Array<{ canonical_name: string; display_name: string; e1rm_trend: string; rir_current: number | null; sufficient: boolean }> };
    endurance: unknown;
    assessment: { label: string; signals_concerning: number };
  } | undefined;
  const snap = (data as any)?.athlete_snapshot ?? null;
  const loadStatus = snap?.body_response?.load_status ?? null;
  const primaryRaceReadiness: PrimaryRaceReadinessRow | null = data?.primary_race_readiness ?? null;

  async function handleStateCourseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !resolvedGoalId) return;
    const uid = getStoredUserId();
    const { data: gRow } = await supabase.from('goals').select('target_time, name').eq('id', resolvedGoalId).maybeSingle();
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
    let paceTargetSec = resolveEventTargetTimeSeconds({ target_time: gRow?.target_time ?? null }, null);
    if (paceTargetSec == null) {
      for (const p of planRows || []) {
        const t = resolveEventTargetTimeSeconds({}, (p as { config?: Record<string, unknown> }).config ?? null);
        if (t != null) {
          paceTargetSec = t;
          break;
        }
      }
    }
    if (paceTargetSec == null) {
      window.alert(
        'No race target time found. Link a plan with a build-time race target, or set a target on the goal (Goals tab).',
      );
      return;
    }
    setCourseBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', `${String(gRow.name || 'Race')} course`);
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
      setStateCourseRow({ id: up.course_id, name: `${String(gRow.name || 'Race')} course` });
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
        </div>
        <button
          onClick={refresh}
          className="p-1 rounded text-white/35 hover:text-white/55 transition-colors shrink-0 mt-0.5"
          aria-label="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
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
              {visibleSignals.length === 0 && (
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

        {/* RACE — predicted finish, VDOT trend, pace zones (gated on data) */}
        {raceReadiness && (
          <RaceSection
            rr={raceReadiness}
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
