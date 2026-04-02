import React, { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { CoachWeekContextV1 } from '@/hooks/useCoachWeekContext';
import { useExerciseLog } from '@/hooks/useExerciseLog';
import StrengthAdjustmentModal from '@/components/StrengthAdjustmentModal';

type CoachDataProp = {
  data: CoachWeekContextV1 | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function acwrLabel(v: number | null): string {
  if (v == null) return '—';
  if (v < 0.8) return 'build more';
  if (v <= 1.3) return 'balanced';
  if (v <= 1.5) return 'back off';
  return 'rest now';
}

// Maps ACWR to 0–100 position on gauge (0.6 → 0%, 1.7 → 100%)
function acwrToGaugePct(v: number): number {
  const min = 0.6;
  const max = 1.7;
  return Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
}

// Horizontal gauge: under | ok zone | high zone | spike
// Zones as % of total width: under=18%, ok=55%, high=18%, spike=9%
function AcwrGauge({ value, readinessState }: { value: number | null; readinessState: string | null }) {
  if (value == null) return <span className="text-white/25 text-[10px]">—</span>;
  const pos = acwrToGaugePct(value);
  // Dot color and label both come from server readiness — it has the full reconciled picture
  // Raw ACWR position is still valid (dot stays where it is), but color follows body state
  const dotColor =
    readinessState === 'fresh'      ? '#34d399' :
    readinessState === 'adapting'   ? '#38bdf8' :
    readinessState === 'normal'     ? '#34d399' :
    readinessState === 'fatigued'   ? '#fbbf24' :
    readinessState === 'overreached'? '#f87171' :
    readinessState === 'detrained'  ? '#38bdf8' :
    acwrLabel(value) === 'build more' ? '#38bdf8' :
    acwrLabel(value) === 'balanced'   ? '#34d399' :
    acwrLabel(value) === 'back off'   ? '#fbbf24' : '#f87171';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex items-center w-24 h-1.5 rounded-full overflow-visible">
        <span className="absolute inset-0 flex rounded-full overflow-hidden">
          <span className="h-full bg-sky-400/25"    style={{ width: '18%' }} />
          <span className="h-full bg-emerald-400/30" style={{ width: '55%' }} />
          <span className="h-full bg-amber-400/25"  style={{ width: '18%' }} />
          <span className="h-full bg-red-400/20"    style={{ width: '9%' }} />
        </span>
        <span
          className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 shadow-md"
          style={{ left: `${pos}%`, backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
        />
      </span>
    </span>
  );
}


function trendColor(dir: string, tone?: string): string {
  if (tone === 'positive') return 'text-emerald-400/80';
  if (tone === 'danger') return 'text-red-400/80';
  if (tone === 'warning') return 'text-amber-400/80';
  if (dir === 'improving') return 'text-emerald-400/75';
  if (dir === 'declining') return 'text-amber-400/75';
  return 'text-white/40';
}

function verdictToneToColor(tone: string): string {
  if (tone === 'action')   return 'text-amber-400/80';
  if (tone === 'caution')  return 'text-red-400/80';
  if (tone === 'positive') return 'text-emerald-400/75';
  if (tone === 'muted')    return 'text-sky-400/60';
  return 'text-white/45';
}

function loadStatusColor(status: string | undefined): string {
  if (!status) return 'text-white/30';
  if (status === 'on_target') return 'text-emerald-400/70';
  if (status === 'elevated') return 'text-amber-400/70';
  if (status === 'high') return 'text-red-400/70';
  if (status === 'under') return 'text-sky-400/70';
  return 'text-white/50';
}

function weekPct(startDate: string, endDate: string): number {
  const now = Date.now();
  const start = new Date(startDate + 'T00:00:00').getTime();
  const end = new Date(endDate + 'T23:59:59').getTime();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

// ── sub-components ────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-white/[0.055] last:border-0">
      <span className="text-[9px] font-semibold tracking-[0.12em] text-white/40 uppercase w-[72px] shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex-1 text-[11px] text-white/60 flex flex-wrap gap-x-3 gap-y-1 leading-none">
        {children}
      </div>
    </div>
  );
}

function Chip({ label, value, valueClass }: { label?: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      {label != null && <span className="text-white/30 text-[10px]">{label}</span>}
      <span className={valueClass ?? 'text-white/65'}>{value}</span>
    </span>
  );
}

function Dot() {
  return <span className="text-white/18 select-none">·</span>;
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function StateTab({ coachData }: { coachData: CoachDataProp }) {
  const { data, loading, error, refresh } = coachData;
  const { liftTrends } = useExerciseLog(8);
  const [adjustingLift, setAdjustingLift] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-4 h-4 animate-spin text-white/25" />
      </div>
    );
  }

  if (error || !data) {
    return <div className="py-8 text-center text-[11px] text-white/30">{error ?? 'No data'}</div>;
  }

  const wsv = data.weekly_state_v1;
  if (!wsv) return <div className="py-8 text-center text-[11px] text-white/30">Loading state…</div>;

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

  // ── WEEK header ──────────────────────────────────────────────────────────
  const weekLabel = week.index != null ? `WK ${week.index}` : 'WEEK';
  const pct = weekPct(week.start_date, week.end_date);

  // ── LOAD row ─────────────────────────────────────────────────────────────
  const acwr = load.acwr;

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
  const trends = wsv.trends;
  const readinessLabel = trends.readiness_label;
  const readiness = trends.readiness_state;
  const readinessColor =
    readiness === 'fresh' ? 'text-emerald-400/75' :
    readiness === 'adapting' ? 'text-sky-400/70' :
    readiness === 'overreached' ? 'text-red-400/75' :
    readiness === 'fatigued' ? 'text-amber-400/75' :
    'text-white/45';

  const dailyLoad = load.daily_load_7d ?? [];
  const maxLoad = Math.max(...dailyLoad.map(d => d.load), 1);

  // ── Cross-training signal ─────────────────────────────────────────────────
  // Surface when non-run load is meaningful (>15% of WTD) so user can see
  // whether cross-training is adding base or creating recovery load.
  const crossTrainingLine: { label: string; tone: string } | null = (() => {
    const byDiscipline = load.by_discipline ?? [];
    const totalLoad = byDiscipline.reduce((s: number, d: any) => s + (d.actual_load ?? 0), 0);
    const nonRunLoad = byDiscipline
      .filter((d: any) => d.discipline !== 'run' && d.discipline !== 'mobility')
      .reduce((s: number, d: any) => s + (d.actual_load ?? 0), 0);
    if (totalLoad === 0 || nonRunLoad / totalLoad < 0.15) return null;

    const interference = (data as any)?.interference ?? null;
    if (interference?.status === 'interference_detected') {
      return { label: `Cross-training load — ${interference.detail ?? 'interference detected'}`, tone: 'warning' };
    }

    const runningAcwr = load.running_acwr ?? null;
    const totalAcwr = load.acwr ?? null;
    if (totalAcwr != null && runningAcwr != null && totalAcwr > 1.05 && runningAcwr < 1.0) {
      return { label: 'Cross-training adding base — run load nominal', tone: 'positive' };
    }
    if (totalAcwr != null && runningAcwr != null && totalAcwr > 1.2 && runningAcwr > 1.1) {
      return { label: 'Cross-training adding to overall fatigue load', tone: 'neutral' };
    }
    return { label: 'Cross-training contributing to load', tone: 'neutral' };
  })();

  return (
    <div className="pt-1 pb-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-4 px-0.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold tracking-widest text-white/50 uppercase">{weekLabel}</span>
            <span className="text-[10px] text-white/35 tabular-nums">{pct}% through</span>
            {readinessLabel && (
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${readinessColor}`}>· {readinessLabel}</span>
            )}
          </div>
          {intentSummary && (
            <span className="text-[13px] font-medium text-white/70 leading-snug">{intentSummary}</span>
          )}
        </div>
        <button
          onClick={refresh}
          className="p-1 rounded text-white/20 hover:text-white/45 transition-colors shrink-0 mt-0.5"
          aria-label="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] divide-y divide-white/[0.055]">

        {/* LOAD — full-width gauge + sparkline */}
        <div className="px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-semibold tracking-[0.12em] text-white/40 uppercase">LOAD</span>
            <div className="flex items-center gap-2">
              <AcwrGauge value={acwr} readinessState={readiness} />
              {loadStatus?.status && (
                <><Dot /><span className={`text-[13px] font-semibold tracking-tight ${loadStatusColor(loadStatus.status)}`}>{
                  loadStatus.status === 'on_target' ? 'on track' :
                  loadStatus.status === 'elevated' ? 'a bit high' :
                  loadStatus.status === 'high' ? 'pull back' :
                  loadStatus.status === 'under' ? 'build more' :
                  loadStatus.status
                }</span></>
              )}
            </div>
          </div>
          {/* 7-day load bar chart */}
          {dailyLoad.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-white/40 uppercase tracking-[0.08em]">Daily load — last 7 days</span>
                <span className="text-[9px] tabular-nums text-white/30">{Math.round(load.wtd_actual_load ?? 0)} pts WTD</span>
              </div>
              {/* bars — color by dominant discipline */}
              <div className="flex items-end h-8 gap-[2px]">
                {dailyLoad.map((d) => {
                  const isToday = d.date === dailyLoad[dailyLoad.length - 1]?.date;
                  const pct = d.load > 0 ? Math.max(0.06, d.load / maxLoad) : 0;
                  const dtype = (d as any).dominant_type ?? 'none';
                  const barColor = d.load === 0
                    ? 'rgba(255,255,255,0.06)'
                    : dtype === 'bike'
                    ? isToday ? 'rgba(56,189,248,0.75)' : 'rgba(56,189,248,0.40)'   // sky
                    : dtype === 'swim'
                    ? isToday ? 'rgba(34,211,238,0.75)' : 'rgba(34,211,238,0.40)'   // cyan
                    : dtype === 'strength'
                    ? isToday ? 'rgba(167,139,250,0.70)' : 'rgba(167,139,250,0.35)' // violet
                    : isToday ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)'; // run/default
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-[2px]">
                      <div
                        className="rounded-[2px] transition-all"
                        style={{ width: 6, height: `${Math.round(pct * 100)}%`, minHeight: d.load > 0 ? 3 : 1, backgroundColor: barColor }}
                      />
                      <span className={`text-[7px] tabular-nums leading-none ${isToday ? 'text-white/55' : 'text-white/20'}`}>
                        {new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* BODY */}
        <div className="px-3 py-3">
          <div className="flex items-start gap-3">
            <span className="text-[9px] font-semibold tracking-[0.12em] text-white/40 uppercase pt-0.5 w-[72px] shrink-0">BODY</span>
            <div className="flex-1 space-y-1.5">
              {visibleSignals.length === 0 && (
                <Chip value="not enough data" valueClass="text-white/25" />
              )}
              {visibleSignals.map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-[11px] text-white/35">{s.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${trendColor(s.trend, s.trend_tone)}`}>{s.detail}</span>
                  </div>
                </div>
              ))}
              {crossTrainingLine && (
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[11px] text-white/35">Cross-training</span>
                  <span className={`text-[11px] ${
                    crossTrainingLine.tone === 'positive' ? 'text-emerald-400/75' :
                    crossTrainingLine.tone === 'warning' ? 'text-amber-400/75' :
                    'text-white/45'
                  }`}>{crossTrainingLine.label.replace(/^Cross-training[^—]*—\s*/, '').replace(/^Cross-training\s+/, '')}</span>
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
                const effColor = rt.avg_execution_score! >= 80 ? 'text-emerald-400/75'
                  : rt.avg_execution_score! >= 60 ? 'text-white/55'
                  : 'text-amber-400/75';
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
            <span className="text-[9px] font-semibold tracking-[0.12em] text-white/40 uppercase pt-0.5 w-[72px] shrink-0">STRENGTH</span>
            <div className="flex-1 space-y-2">
              {perLift.length === 0 && <Chip value="no data" valueClass="text-white/25" />}
              {perLift.map((lt: any) => {
                const verdictLabel: string = lt.verdict_label ?? '—';
                const verdictColor = verdictToneToColor(lt.verdict_tone ?? 'neutral');
                const isActionable = verdictLabel === 'add weight' || verdictLabel === 'back off weight';
                const currentWeight = liftWeightMap.get(lt.canonical_name) ?? 0;
                // Progress bar: e1rm as % of peak, capped at 100%
                const e1rmPct = lt.e1rm_current != null && lt.peak1RM > 0
                  ? Math.min(100, Math.round((lt.e1rm_current / lt.peak1RM) * 100))
                  : lt.e1rm_current != null && lt.e1rm_previous != null && lt.e1rm_previous > 0
                  ? Math.min(100, Math.round((lt.e1rm_current / (lt.e1rm_previous * 1.1)) * 100))
                  : null;
                return (
                  <div key={lt.canonical_name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/50">{lt.display_name}</span>
                      <span className="relative">
                        {isActionable ? (
                          <button
                            onClick={() => setAdjustingLift(adjustingLift === lt.canonical_name ? null : lt.canonical_name)}
                            className={`text-[11px] ${verdictColor} underline decoration-dotted underline-offset-2 hover:opacity-80`}
                          >{verdictLabel}</button>
                        ) : (
                          <span className={`text-[11px] ${verdictColor}`}>{verdictLabel}</span>
                        )}
                        {adjustingLift === lt.canonical_name && (
                          <StrengthAdjustmentModal
                            exerciseName={lt.display_name}
                            currentWeight={currentWeight}
                            nextPlannedWeight={Math.round(currentWeight * 1.025 / 5) * 5 || currentWeight}
                            targetRir={lt.rir_current ?? undefined}
                            actualRir={lt.rir_current ?? undefined}
                            planId={wsv.plan.plan_id ?? undefined}
                            isBodyweight={false}
                            hasPlannedWeight={currentWeight > 0}
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

        {/* NEXT */}
        <div className="px-3 py-3">
          <Row label="NEXT">
            {nextSessions.length === 0 && <Chip value="week complete" valueClass="text-white/25" />}
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
        <div className="mt-2 px-0.5 text-[9px] text-white/35 uppercase tracking-widest">
          {wsv.plan.plan_name}
        </div>
      )}
    </div>
  );
}
