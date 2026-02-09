import React, { useMemo, useState } from 'react';
import { AlertCircle, HelpCircle, Link2, Loader2, RefreshCw, X } from 'lucide-react';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { supabase } from '@/lib/supabase';

type LinkExtrasDialogProps = {
  open: boolean;
  onClose: () => void;
  onLinked: () => Promise<void> | void;
  extras: Array<{ workout_id: string; date: string; type: string; name: string | null; workload_actual: number | null }>;
  gaps: Array<{ planned_id: string; date: string; type: string; name: string | null; category: string; workload_planned: number | null }>;
};

function LinkExtrasDialog({ open, onClose, onLinked, extras, gaps }: LinkExtrasDialogProps) {
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null);
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const doLink = async () => {
    if (!selectedExtra || !selectedGap) return;
    try {
      setLinking(true);
      setError(null);
      const { data, error: fnErr } = await supabase.functions.invoke('auto-attach-planned', {
        body: { workout_id: selectedExtra, planned_id: selectedGap },
      });
      if (fnErr) throw fnErr;
      if (!(data as any)?.success || !(data as any)?.attached) {
        throw new Error((data as any)?.reason || 'Linking failed');
      }
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
      try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
      await onLinked?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0b0b0c]/95 p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white/80">Link extra sessions</div>
            <div className="text-xs text-white/45 mt-0.5">
              Pick an extra completed session and a missing planned key session to link them.
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error ? (
          <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="text-xs text-white/60">Extras (completed, not in plan)</div>
            <div className="mt-2 space-y-1 max-h-56 overflow-auto">
              {extras.length ? extras.map((w) => {
                const selected = selectedExtra === w.workout_id;
                return (
                  <button
                    key={w.workout_id}
                    onClick={() => setSelectedExtra(w.workout_id)}
                    className={`w-full text-left rounded-lg px-2.5 py-2 border transition-colors ${
                      selected ? 'border-sky-400/40 bg-sky-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-white/85">{w.date} • {w.type}{w.name ? ` (${w.name})` : ''}</div>
                      <div className="text-2xs text-white/45">{w.workload_actual != null ? `${Math.round(w.workload_actual)}pts` : '—'}</div>
                    </div>
                  </button>
                );
              }) : (
                <div className="text-xs text-white/40">No extras found.</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="text-xs text-white/60">Gaps (planned key sessions not linked)</div>
            <div className="mt-2 space-y-1 max-h-56 overflow-auto">
              {gaps.length ? gaps.map((p) => {
                const selected = selectedGap === p.planned_id;
                return (
                  <button
                    key={p.planned_id}
                    onClick={() => setSelectedGap(p.planned_id)}
                    className={`w-full text-left rounded-lg px-2.5 py-2 border transition-colors ${
                      selected ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-white/85">{p.date} • {p.type}{p.name ? ` (${p.name})` : ''}</div>
                      <div className="text-2xs text-white/45">{p.workload_planned != null ? `${Math.round(p.workload_planned)}pts` : '—'}</div>
                    </div>
                    <div className="text-2xs text-white/40 mt-0.5">{p.category}</div>
                  </button>
                );
              }) : (
                <div className="text-xs text-white/40">No gaps found.</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={linking}
            className="px-3 py-2 rounded-lg text-xs bg-white/[0.06] border border-white/10 text-white/70 hover:bg-white/[0.10] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={doLink}
            disabled={linking || !selectedExtra || !selectedGap}
            className="px-3 py-2 rounded-lg text-xs bg-white/90 text-black hover:bg-white disabled:opacity-60"
          >
            {linking ? 'Linking…' : 'Link selected'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CoachWeekTab() {
  const { data, loading, error, refresh } = useCoachWeekContext();
  const [linkOpen, setLinkOpen] = useState(false);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/60">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <div className="text-sm">Loading week context...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-400">
        <AlertCircle className="w-8 h-8 mb-3" />
        <div className="text-sm text-center">{error}</div>
        <button
          onClick={refresh}
          className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/60">
        <div className="text-sm">No data available</div>
      </div>
    );
  }

  const pct = data.metrics.wtd_completion_ratio != null ? Math.round(data.metrics.wtd_completion_ratio * 100) : null;
  const remainingPct = data.week?.planned_total_load && data.week.planned_total_load > 0
    ? Math.round(((data.week.planned_remaining_load || 0) / data.week.planned_total_load) * 100)
    : null;
  const keyPct = data.reaction?.key_sessions_completion_ratio != null ? Math.round(data.reaction.key_sessions_completion_ratio * 100) : null;
  const ts = data.training_state;
  const acwrLine = ts?.load_ramp_acwr != null ? `Load ramp: ${Number(ts.load_ramp_acwr.toFixed(2))}×` : null;
  const loadDriverRows = useMemo(() => {
    const rows = Array.isArray(ts?.load_ramp?.acute7_by_type) ? ts!.load_ramp.acute7_by_type : [];
    return rows.slice(0, 3);
  }, [ts?.load_ramp?.acute7_by_type]);
  const topSessionsRows = useMemo(() => {
    const rows = Array.isArray(ts?.load_ramp?.top_sessions_acute7) ? ts!.load_ramp.top_sessions_acute7 : [];
    return rows.slice(0, 2);
  }, [ts?.load_ramp?.top_sessions_acute7]);

  const trainingConfidenceLabel = (() => {
    const c = ts?.confidence ?? 0;
    if (c >= 0.8) return 'High';
    if (c >= 0.6) return 'Medium';
    return 'Low';
  })();
  const trainingConfidenceExplain = (() => {
    const execN = data.reaction?.execution_sample_size || 0;
    const driftN = data.reaction?.hr_drift_sample_size || 0;
    const rpeN = data.reaction?.rpe_sample_size_7d || 0;
    const rirN = data.reaction?.rir_sample_size_7d || 0;
    const signals = (driftN > 0 ? 1 : 0) + (rpeN > 0 ? 1 : 0) + (rirN > 0 ? 1 : 0) + (execN > 0 ? 1 : 0);
    return `Training state confidence is based on ${signals}/4 response markers with data (exec n=${execN}, drift n=${driftN}, rpe n=${rpeN}, rir n=${rirN}).`;
  })();

  const formatDelta = (v: number | null, unit: string) => {
    if (v == null) return '—';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v}${unit}`;
  };

  const labelPhrase = (lbl: string | undefined | null) => {
    const s = String(lbl || '');
    if (s === 'efficient' || s === 'good' || s === 'fresh') return 'better';
    if (s === 'stable') return 'normal';
    if (s === 'stressed' || s === 'strained' || s === 'fatigued' || s === 'slipping') return 'worse';
    return 'unknown';
  };

  const verdictTone =
    data.verdict.code === 'recover_overreaching' ? 'border-red-500/30 bg-red-500/10'
    : data.verdict.code === 'caution_ramping_fast' ? 'border-amber-500/30 bg-amber-500/10'
    : data.verdict.code === 'undertraining' ? 'border-sky-500/30 bg-sky-500/10'
    : 'border-white/15 bg-white/[0.06]';

  return (
    <div className="space-y-3 pb-6">
      <LinkExtrasDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onLinked={async () => { await refresh(); }}
        extras={Array.isArray(data.reaction?.extra_sessions_details) ? data.reaction.extra_sessions_details : []}
        gaps={Array.isArray(data.reaction?.key_session_gaps_details) ? data.reaction.key_session_gaps_details : []}
      />

      <div className="flex items-center justify-between">
        <div className="text-xs text-white/50">
          {data.week_start_date} → {data.week_end_date}
          {data.plan.has_active_plan && data.plan.week_index != null ? (
            <span className="ml-2 text-white/40">Week {data.plan.week_index}</span>
          ) : null}
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/15 text-white/80 hover:bg-white/[0.12] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className={`rounded-xl border p-3 ${verdictTone}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-white/60">Training state</div>
            <div className="text-2xs text-white/40 mt-0.5">{ts?.kicker || ''}</div>
            <div className="text-xl font-medium text-white">{ts?.title || '—'}</div>
            <div className="text-xs text-white/45 mt-1">
              {ts?.subtitle || '—'}
            </div>
            <div className="text-2xs text-white/35 mt-1">
              <span className="inline-flex items-center gap-1">
                Confidence: {trainingConfidenceLabel}
                <span title={trainingConfidenceExplain} className="inline-flex items-center">
                  <HelpCircle className="w-3.5 h-3.5 text-white/35" />
                </span>
              </span>
              {acwrLine ? <span> • {acwrLine}</span> : null}
              <span> • Baseline: last {ts?.baseline_days || 28} days</span>
            </div>
            {loadDriverRows.length ? (
              <div className="mt-2 space-y-1">
                <div className="text-2xs text-white/45">Top load drivers (7d)</div>
                {loadDriverRows.map((r) => (
                  <div key={r.type} className="flex items-center justify-between gap-2 text-2xs">
                    <div className="text-white/65">{r.type}</div>
                    <div className="text-white/55 text-right">
                      <span className="text-white/75">{Math.round(r.total_load)}pts</span>
                      <span className="ml-2">
                        <span className="text-emerald-300/80">planned {Math.round(r.linked_load)} </span>
                        <span className="text-sky-300/80">extra {Math.round(r.extra_load)}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {topSessionsRows.length ? (
              <div className="mt-2">
                <div className="text-2xs text-white/45">Biggest sessions (7d)</div>
                <div className="mt-1 space-y-0.5">
                  {topSessionsRows.map((r) => (
                    <div key={`${r.date}-${r.type}-${r.workload_actual}`} className="text-2xs text-white/50">
                      <span className="text-white/65">{r.date} {r.type}</span>
                      {r.name ? <span className="text-white/45"> ({r.name})</span> : null}
                      <span className="text-white/35"> • </span>
                      <span className={r.linked ? 'text-emerald-300/80' : 'text-sky-300/80'}>{r.linked ? 'planned' : 'extra'}</span>
                      <span className="text-white/35"> • </span>
                      <span className="text-white/70">{Math.round(r.workload_actual)}pts</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {data.plan.week_focus_label ? (
              <div className="text-xs text-white/50 mt-1">{data.plan.week_focus_label}</div>
            ) : null}
          </div>
          <div className="text-right text-xs text-white/45">
            <div>{data.methodology_id}</div>
            {data.plan.week_intent ? <div className="mt-1">Intent: {data.plan.week_intent}</div> : null}
            {data.baselines?.learning_status ? <div className="mt-1">Baselines: {data.baselines.learning_status}</div> : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/15 bg-white/[0.06] p-3">
        <div className="text-sm text-white/70">How you’re responding</div>
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Key sessions (WTD)</div>
            <div className="text-xs text-white/85">
              {data.reaction.key_sessions_linked}/{data.reaction.key_sessions_planned}
              {keyPct != null ? <span className="text-white/45 ml-2">({keyPct}%)</span> : null}
            </div>
          </div>
          {data.reaction.key_sessions_planned > 0 ? (
            <div className="mt-1">
              <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden border border-white/10">
                <div className="h-full flex">
                  <div
                    className="h-full bg-emerald-400/70"
                    style={{ width: `${Math.round((data.reaction.key_sessions_linked / data.reaction.key_sessions_planned) * 100)}%` }}
                  />
                  <div
                    className="h-full bg-amber-400/70"
                    style={{ width: `${Math.round((data.reaction.key_sessions_gaps / data.reaction.key_sessions_planned) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-2xs text-white/45">
                <div>
                  <span className="text-emerald-300/80">Linked {data.reaction.key_sessions_linked}</span>
                  <span className="text-white/30"> • </span>
                  <span className="text-amber-300/80">Gaps {data.reaction.key_sessions_gaps}</span>
                  <span className="text-white/30"> • </span>
                  <span className="text-sky-300/80">Extras +{data.reaction.extra_sessions}</span>
                </div>
                <div className="inline-flex items-center gap-2">
                  <span title={data.reaction.linking_confidence?.explain || ''} className="inline-flex items-center gap-1">
                    Linking confidence: {String(data.reaction.linking_confidence?.label || '').toUpperCase()}
                    <HelpCircle className="w-3.5 h-3.5 text-white/35" />
                  </span>
                  {data.reaction.extra_sessions > 0 && data.reaction.key_sessions_gaps > 0 ? (
                    <button
                      onClick={() => setLinkOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/70 hover:bg-white/[0.10]"
                      title="Link extras to gaps"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Link
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Execution score (avg)</div>
            <div className="text-xs text-white/85">
              {data.reaction.avg_execution_score != null ? `${data.reaction.avg_execution_score}%` : '—'}
              {data.reaction.execution_sample_size ? (
                <span className="text-white/45 ml-2">n={data.reaction.execution_sample_size}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">HR drift (avg)</div>
            <div className="text-xs text-white/85">
              {data.reaction.hr_drift_avg_bpm != null ? `${data.reaction.hr_drift_avg_bpm} bpm` : '—'}
              {data.reaction.hr_drift_sample_size ? (
                <span className="text-white/45 ml-2">n={data.reaction.hr_drift_sample_size}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Session RPE (7d avg)</div>
            <div className="text-xs text-white/85">
              {data.reaction.avg_session_rpe_7d != null ? `${data.reaction.avg_session_rpe_7d}` : '—'}
              {data.reaction.rpe_sample_size_7d ? (
                <span className="text-white/45 ml-2">n={data.reaction.rpe_sample_size_7d}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Strength RIR (7d avg)</div>
            <div className="text-xs text-white/85">
              {data.reaction.avg_strength_rir_7d != null ? `${data.reaction.avg_strength_rir_7d}` : '—'}
              {data.reaction.rir_sample_size_7d ? (
                <span className="text-white/45 ml-2">n={data.reaction.rir_sample_size_7d}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/15 bg-white/[0.06] p-3">
        <div className="text-sm text-white/70">What changed vs your baseline (28d)</div>
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Aerobic (HR drift)</div>
            <div className="text-xs text-white/85 text-right">
              {formatDelta(data.response?.aerobic?.drift_delta_bpm ?? null, ' bpm')}
              <div className="text-2xs text-white/45">{labelPhrase(data.response?.aerobic?.label)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Structural (Strength RIR)</div>
            <div className="text-xs text-white/85 text-right">
              {formatDelta(data.response?.structural?.rir_delta ?? null, '')}
              <div className="text-2xs text-white/45">{labelPhrase(data.response?.structural?.label)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Subjective (RPE)</div>
            <div className="text-xs text-white/85 text-right">
              {formatDelta(data.response?.subjective?.rpe_delta ?? null, '')}
              <div className="text-2xs text-white/45">{labelPhrase(data.response?.subjective?.label)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Absorption (Execution)</div>
            <div className="text-xs text-white/85 text-right">
              {formatDelta(data.response?.absorption?.execution_delta ?? null, '%')}
              <div className="text-2xs text-white/45">{labelPhrase(data.response?.absorption?.label)}</div>
            </div>
          </div>
        </div>
      </div>

      {Array.isArray(data.response?.run_session_types_7d) && data.response.run_session_types_7d.length ? (
        <div className="rounded-xl border border-white/15 bg-white/[0.06] p-3">
          <div className="text-sm text-white/70">Run session types (7d)</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {data.response.run_session_types_7d.slice(0, 6).map((s) => {
              const label =
                s.type === 'z2' ? 'Zone 2'
                : s.type === 'long' ? 'Long'
                : s.type === 'tempo' ? 'Tempo'
                : s.type === 'progressive' ? 'Progressive'
                : s.type === 'fartlek' ? 'Fartlek'
                : s.type === 'intervals' ? 'Intervals'
                : s.type === 'hills' ? 'Hills'
                : s.type === 'easy' ? 'Easy'
                : 'Unknown';

              const metric =
                s.type === 'intervals' || s.type === 'hills'
                  ? (s.avg_interval_hr_creep_bpm != null ? `HR creep ${s.avg_interval_hr_creep_bpm} bpm` : (s.avg_execution_score != null ? `Exec ${s.avg_execution_score}%` : '—'))
                  : (s.avg_decoupling_pct != null ? `Decoupling ${s.avg_decoupling_pct}%` : (s.avg_hr_drift_bpm != null ? `Drift ${s.avg_hr_drift_bpm} bpm` : (s.avg_z2_percent != null ? `Z2 ${s.avg_z2_percent}%` : '—')));

              return (
                <div key={`${s.type}-${metric}`} className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-white/80">{label}</div>
                    <div className="text-2xs text-white/45">n={s.sample_size}</div>
                  </div>
                  <div className="mt-0.5 text-2xs text-white/60">{metric}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

    </div>
  );
}

