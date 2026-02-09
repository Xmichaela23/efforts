import React from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';

export default function CoachWeekTab() {
  const { data, loading, error, refresh } = useCoachWeekContext();

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
  const verdictTone =
    data.verdict.code === 'recover_overreaching' ? 'border-red-500/30 bg-red-500/10'
    : data.verdict.code === 'caution_ramping_fast' ? 'border-amber-500/30 bg-amber-500/10'
    : data.verdict.code === 'undertraining' ? 'border-sky-500/30 bg-sky-500/10'
    : 'border-white/15 bg-white/[0.06]';

  return (
    <div className="space-y-3 pb-6">
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
            <div className="text-sm text-white/60">Response snapshot</div>
            <div className="text-xl font-medium text-white">
              {(() => {
                const lbl = String(data.response?.overall?.label || '');
                if (lbl === 'absorbing_well') return 'Absorbing well';
                if (lbl === 'fatigue_signs') return 'Fatigue signs';
                if (lbl === 'mixed_signals') return 'Mixed signals';
                return 'Need more data';
              })()}
            </div>
            <div className="text-xs text-white/45 mt-1">
              Confidence: {Math.round((data.response?.overall?.confidence || 0) * 100)}%
            </div>
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
            <div className="text-xs text-white/55">Key sessions completed</div>
            <div className="text-xs text-white/85">
              {data.reaction.key_sessions_completed}/{data.reaction.key_sessions_planned}
              {keyPct != null ? <span className="text-white/45 ml-2">({keyPct}%)</span> : null}
            </div>
          </div>
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
        <div className="text-sm text-white/70">Baseline-relative signals (vs 28d norm)</div>
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Aerobic (HR drift)</div>
            <div className="text-xs text-white/85 text-right">
              {data.response?.aerobic?.drift_delta_bpm != null ? `${data.response.aerobic.drift_delta_bpm > 0 ? '+' : ''}${data.response.aerobic.drift_delta_bpm} bpm` : '—'}
              <div className="text-2xs text-white/45">{data.response?.aerobic?.label || 'unknown'}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Structural (Strength RIR)</div>
            <div className="text-xs text-white/85 text-right">
              {data.response?.structural?.rir_delta != null ? `${data.response.structural.rir_delta > 0 ? '+' : ''}${data.response.structural.rir_delta}` : '—'}
              <div className="text-2xs text-white/45">{data.response?.structural?.label || 'unknown'}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Subjective (RPE)</div>
            <div className="text-xs text-white/85 text-right">
              {data.response?.subjective?.rpe_delta != null ? `${data.response.subjective.rpe_delta > 0 ? '+' : ''}${data.response.subjective.rpe_delta}` : '—'}
              <div className="text-2xs text-white/45">{data.response?.subjective?.label || 'unknown'}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/55">Absorption (Execution)</div>
            <div className="text-xs text-white/85 text-right">
              {data.response?.absorption?.execution_delta != null ? `${data.response.absorption.execution_delta > 0 ? '+' : ''}${data.response.absorption.execution_delta}%` : '—'}
              <div className="text-2xs text-white/45">{data.response?.absorption?.label || 'unknown'}</div>
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
                  : (s.avg_hr_drift_bpm != null ? `Drift ${s.avg_hr_drift_bpm} bpm` : (s.avg_z2_percent != null ? `Z2 ${s.avg_z2_percent}%` : '—'));

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

