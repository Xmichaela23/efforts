import React, { useMemo, useState, useEffect } from 'react';
import { AlertCircle, Link2, Loader2, RefreshCw, X } from 'lucide-react';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { supabase } from '@/lib/supabase';
import { StackedHBar, DeltaIndicator, TrainingStateBar } from '@/components/ui/charts';

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
  const [contextExpanded, setContextExpanded] = useState(false);
  const [contextValue, setContextValue] = useState('');
  const [contextSaving, setContextSaving] = useState(false);

  useEffect(() => {
    const val = data?.plan?.athlete_context_for_week ?? '';
    setContextValue(typeof val === 'string' ? val : '');
  }, [data?.plan?.athlete_context_for_week]);

  const saveAthleteContext = async (value: string) => {
    const planId = data?.plan?.plan_id;
    const weekIndex = data?.plan?.week_index;
    if (!planId || weekIndex == null) return;
    try {
      setContextSaving(true);
      const { data: planRow } = await supabase
        .from('plans')
        .select('athlete_context_by_week')
        .eq('id', planId)
        .single();
      const current = (planRow?.athlete_context_by_week ?? {}) as Record<string, string>;
      const merged = { ...current };
      const trimmed = value.trim();
      if (trimmed) merged[String(weekIndex)] = trimmed;
      else delete merged[String(weekIndex)];
      await supabase.from('plans').update({ athlete_context_by_week: merged }).eq('id', planId);
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
      await refresh();
    } catch {
      // non-fatal
    } finally {
      setContextSaving(false);
    }
  };

  const updateSkipReason = async (plannedId: string, reason: string | null, note?: string | null) => {
    try {
      const patch: Record<string, unknown> = { skip_reason: reason ?? null };
      if (note !== undefined) patch.skip_note = note || null;
      await supabase.from('planned_workouts').update(patch).eq('id', plannedId);
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
      await refresh();
    } catch {
      // non-fatal
    }
  };

  // Hooks must be called unconditionally (even while loading/error).
  // Keep derived memoized slices above any early returns.
  const ts = data?.training_state;
  const loadDriverRows = useMemo(() => {
    const rows = (ts && Array.isArray(ts?.load_ramp?.acute7_by_type)) ? ts.load_ramp.acute7_by_type : [];
    return rows.slice(0, 3);
  }, [ts?.load_ramp?.acute7_by_type]);

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



  const verdictTone =
    data.verdict.code === 'recover_overreaching' ? 'border-red-500/40 bg-gradient-to-br from-red-500/15 to-red-900/10'
    : data.verdict.code === 'caution_ramping_fast' ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-amber-900/10'
    : data.verdict.code === 'undertraining' ? 'border-sky-500/40 bg-gradient-to-br from-sky-500/12 to-sky-900/8'
    : 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 to-emerald-900/5';

  const titleGlow =
    data.verdict.code === 'recover_overreaching' ? 'text-red-300'
    : data.verdict.code === 'caution_ramping_fast' ? 'text-amber-300'
    : data.verdict.code === 'undertraining' ? 'text-sky-300'
    : 'text-emerald-300';

  const weekLabel = (() => {
    const parts: string[] = [];
    if (data.plan.has_active_plan && data.plan.week_index != null) parts.push(`Week ${data.plan.week_index}`);
    if (data.plan.week_intent) {
      const intent = String(data.plan.week_intent).toLowerCase();
      if (intent === 'peak') parts.push('Peak phase');
      else if (intent === 'recovery') parts.push('Recovery week');
      else if (intent === 'taper') parts.push('Taper');
      else if (intent === 'build') parts.push('Build phase');
      else if (intent === 'base') parts.push('Base phase');
    }
    return parts.join(' · ');
  })();

  const rpeLabel = (rpe: number | null) => {
    if (rpe == null) return null;
    if (rpe <= 3) return 'Light';
    if (rpe <= 5) return 'Moderate';
    if (rpe <= 7) return 'Hard';
    return 'Very hard';
  };

  const rirLabel = (rir: number | null) => {
    if (rir == null) return null;
    if (rir >= 4) return 'Very fresh';
    if (rir >= 3) return 'Fresh';
    if (rir >= 2) return 'Moderate';
    if (rir >= 1) return 'Pushing limits';
    return 'At failure';
  };

  const efficiencyLabel = (decouple: number | null) => {
    if (decouple == null) return null;
    if (decouple <= 3) return 'Excellent';
    if (decouple <= 5) return 'Good';
    if (decouple <= 8) return 'Moderate';
    return 'Fatigued';
  };

  const efficiencyColor = (decouple: number | null) => {
    if (decouple == null) return 'text-white/50';
    if (decouple <= 5) return 'text-emerald-400';
    if (decouple <= 8) return 'text-amber-400';
    return 'text-red-400';
  };

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
          {weekLabel ? <span className="ml-2 text-white/60">{weekLabel}</span> : null}
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/15 text-white/80 hover:bg-white/[0.12] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Week Context Note (athlete-provided) ── */}
      {data.plan.has_active_plan && data.plan.plan_id && data.plan.week_index != null && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
          {contextExpanded ? (
            <textarea
              value={contextValue}
              onChange={(e) => setContextValue(e.target.value)}
              onBlur={() => {
                saveAthleteContext(contextValue);
                if (!contextValue.trim()) setContextExpanded(false);
              }}
              placeholder="e.g. had the flu, travel, increased weights on purpose..."
              className="w-full min-h-[72px] px-3 py-2.5 bg-transparent text-sm text-white/90 placeholder:text-white/40 resize-none focus:outline-none focus:ring-0 border-0"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setContextExpanded(true)}
              className="w-full text-left px-3 py-2.5 text-xs text-white/45 hover:text-white/65 hover:bg-white/[0.04] transition-colors"
            >
              {contextValue.trim() ? (
                <span className="italic">&quot;{contextValue.length > 50 ? contextValue.slice(0, 50) + '…' : contextValue}&quot;</span>
              ) : (
                'Add context for this week (sick, travel, etc.) — helps the AI get it right'
              )}
            </button>
          )}
          {contextSaving && (
            <div className="px-3 py-1 text-[10px] text-white/40 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving…
            </div>
          )}
        </div>
      )}

      {/* ── Coach Narrative ── */}
      <div className={`rounded-xl border p-4 ${verdictTone}`}>
        <div className={`text-lg font-semibold ${titleGlow}`}
          style={{ textShadow: `0 0 12px currentColor` }}
        >{ts?.title || '—'}</div>

        {data.week_narrative ? (
          <div className="text-sm text-white/75 mt-2 leading-relaxed">{data.week_narrative}</div>
        ) : ts?.subtitle ? (
          <div className="text-sm text-white/55 mt-1">{ts.subtitle}</div>
        ) : null}

        {ts?.load_ramp_acwr != null && (
          <div className="mt-3">
            <TrainingStateBar acwr={ts.load_ramp_acwr} />
          </div>
        )}
      </div>

      {/* ── Training Load ── */}
      {loadDriverRows.length ? (
        <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
          <div className="text-sm text-white/80 mb-2">Training load</div>
          <div className="space-y-2">
            {(() => {
              const maxLoad = Math.max(...loadDriverRows.map(r => r.total_load), 1);
              return loadDriverRows.map((r: any) => (
                <div key={r.type}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-white/70 capitalize">{r.type}</span>
                    <span className="text-xs text-white/50">{Math.round(r.total_load)} pts</span>
                  </div>
                  <StackedHBar
                    segments={[
                      { value: r.linked_load, color: '#34d399', label: 'planned' },
                      { value: r.extra_load, color: '#38bdf8', label: 'extra' },
                    ]}
                    maxValue={maxLoad}
                    height={10}
                    showLabels={false}
                  />
                </div>
              ));
            })()}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-[10px]">
                <div className="w-2 h-2 rounded-[2px]" style={{ background: '#34d399' }} />
                <span className="text-emerald-400/70">Planned</span>
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <div className="w-2 h-2 rounded-[2px]" style={{ background: '#38bdf8' }} />
                <span className="text-sky-400/70">Extra</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}


      {/* ── Key Sessions ── */}
      {data.reaction.key_sessions_planned > 0 && (
        <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-white/80">Key sessions</div>
            <div className="text-sm text-white/90 font-medium">
              {data.reaction.key_sessions_linked}/{data.reaction.key_sessions_planned} done
            </div>
          </div>
          <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden border border-white/10">
            <div className="h-full flex">
              <div
                className="h-full bg-emerald-400/70"
                style={{ width: `${Math.round((data.reaction.key_sessions_linked / data.reaction.key_sessions_planned) * 100)}%` }}
              />
            </div>
          </div>
          {(data.reaction.extra_sessions > 0 || data.reaction.key_sessions_gaps > 0) && (
            <div className="mt-2 flex items-center justify-between text-xs text-white/45">
              <div>
                {data.reaction.key_sessions_gaps > 0 && (
                  <span className="text-amber-300/80">{data.reaction.key_sessions_gaps} missed</span>
                )}
                {data.reaction.extra_sessions > 0 && (
                  <span className={data.reaction.key_sessions_gaps > 0 ? 'ml-2 text-sky-300/80' : 'text-sky-300/80'}>+{data.reaction.extra_sessions} extra</span>
                )}
              </div>
              {data.reaction.extra_sessions > 0 && data.reaction.key_sessions_gaps > 0 && (
                <button
                  onClick={() => setLinkOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/70 hover:bg-white/[0.10]"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Link
                </button>
              )}
            </div>
          )}
          {data.reaction.key_session_gaps_details && data.reaction.key_session_gaps_details.length > 0 && (
            <div className="mt-3 space-y-2 pt-2 border-t border-white/10">
              <div className="text-[10px] text-white/45 uppercase tracking-wide">Why missed?</div>
              {data.reaction.key_session_gaps_details.map((g) => (
                <div key={g.planned_id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-white/70 mb-1.5">
                    {g.date} · {g.type}{g.name ? ` (${g.name})` : ''}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(['sick', 'travel', 'rest', 'life', 'swapped'] as const).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => updateSkipReason(g.planned_id, g.skip_reason === tag ? null : tag)}
                        className={`px-2 py-0.5 rounded text-[10px] capitalize transition-colors ${
                          g.skip_reason === tag
                            ? 'bg-amber-500/30 text-amber-200 border border-amber-400/40'
                            : 'bg-white/[0.06] text-white/50 border border-white/10 hover:bg-white/[0.1] hover:text-white/70'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Add note (optional)"
                    defaultValue={g.skip_note ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (g.skip_note ?? '')) updateSkipReason(g.planned_id, g.skip_reason, v);
                    }}
                    className="mt-1.5 w-full px-2 py-1 text-[10px] bg-white/[0.04] border border-white/10 rounded text-white/70 placeholder:text-white/30 focus:outline-none focus:border-white/20"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Body Response ── */}
      <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
        <div className="text-sm text-white/80 mb-3">Body response</div>
        <div className="space-y-3">
          {data.reaction.avg_execution_score != null && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/60">Plan execution</div>
              <div className="text-sm text-white/90 font-medium">{data.reaction.avg_execution_score}%</div>
            </div>
          )}
          {data.reaction.avg_session_rpe_7d != null && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/60">Effort level</div>
              <div className="text-sm text-white/90">
                <span className="font-medium">{rpeLabel(data.reaction.avg_session_rpe_7d)}</span>
                <span className="text-xs text-white/40 ml-1.5">{data.reaction.avg_session_rpe_7d}/10</span>
              </div>
            </div>
          )}
          {data.reaction.avg_strength_rir_7d != null && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/60">Strength reserve</div>
              <div className="text-sm text-white/90">
                <span className="font-medium">{rirLabel(data.reaction.avg_strength_rir_7d)}</span>
                <span className="text-xs text-white/40 ml-1.5">{data.reaction.avg_strength_rir_7d} reps in tank</span>
              </div>
            </div>
          )}
          {data.reaction.hr_drift_avg_bpm != null && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/60">Cardiac drift</div>
              <div className="text-sm text-white/90">
                {data.reaction.hr_drift_avg_bpm <= 5 ? (
                  <span className="text-emerald-400 font-medium">Minimal</span>
                ) : data.reaction.hr_drift_avg_bpm <= 10 ? (
                  <span className="text-white/80 font-medium">Normal</span>
                ) : (
                  <span className="text-amber-400 font-medium">Elevated</span>
                )}
                <span className="text-xs text-white/40 ml-1.5">{data.reaction.hr_drift_avg_bpm} bpm</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 4-week trend ── */}
      <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
        <div className="text-sm text-white/80 mb-3">4-week trend</div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/60">Aerobic fitness</div>
            <DeltaIndicator value={data.response?.aerobic?.drift_delta_bpm ?? null} unit=" bpm" invertPositive={true} size="sm" />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/60">Strength capacity</div>
            <DeltaIndicator value={data.response?.structural?.rir_delta ?? null} invertPositive={false} size="sm" />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/60">Perceived effort</div>
            <DeltaIndicator value={data.response?.subjective?.rpe_delta ?? null} invertPositive={true} size="sm" />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/60">Execution quality</div>
            <DeltaIndicator value={data.response?.absorption?.execution_delta ?? null} unit="%" invertPositive={false} size="sm" />
          </div>
        </div>
      </div>

      {/* ── Run sessions ── */}
      {Array.isArray(data.response?.run_session_types_7d) && data.response.run_session_types_7d.length ? (
        <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
          <div className="text-sm text-white/80 mb-2">Run sessions this week</div>
          <div className="grid grid-cols-2 gap-2">
            {data.response.run_session_types_7d.slice(0, 6).map((s: any) => {
              const label =
                s.type === 'z2' ? 'Zone 2' : s.type === 'long' ? 'Long Run' : s.type === 'tempo' ? 'Tempo'
                : s.type === 'progressive' ? 'Progressive' : s.type === 'fartlek' ? 'Fartlek'
                : s.type === 'intervals' ? 'Intervals' : s.type === 'hills' ? 'Hills'
                : s.type === 'easy' ? 'Easy' : 'Other';

              const decouple = s.avg_decoupling_pct;
              const effLbl = efficiencyLabel(decouple);
              const effClr = efficiencyColor(decouple);

              const metric =
                s.type === 'intervals' || s.type === 'hills'
                  ? (s.avg_execution_score != null ? `${s.avg_execution_score}% execution` : '\u2014')
                  : (effLbl ? `${effLbl} efficiency` : '\u2014');

              return (
                <div key={`${s.type}-${s.sample_size}`} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-white/85 font-medium">{label}</div>
                    <div className="text-[10px] text-white/35">&times;{s.sample_size}</div>
                  </div>
                  <div className={`mt-0.5 text-xs ${effClr}`}>{metric}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

    </div>
  );
}
