import React, { useMemo, useState, useEffect } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Link2, Loader2, RefreshCw, X, Target } from 'lucide-react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { StackedHBar, DeltaIndicator, TrainingStateBar } from '@/components/ui/charts';

// ─── Link Extras Dialog ────────────────────────────────────────────────────

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
            <div className="text-sm text-white/80">Did you do a different workout instead?</div>
            <div className="text-xs text-white/45 mt-0.5">
              Pick the session you completed and the planned session it should count toward.
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
            <div className="text-xs text-white/60">What you did (not in plan)</div>
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
                      <div className="text-[10px] text-white/45">{w.workload_actual != null ? `${Math.round(w.workload_actual)}pts` : '—'}</div>
                    </div>
                  </button>
                );
              }) : (
                <div className="text-xs text-white/40">No extras found.</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="text-xs text-white/60">What it should count toward</div>
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
                      <div className="text-[10px] text-white/45">{p.workload_planned != null ? `${Math.round(p.workload_planned)}pts` : '—'}</div>
                    </div>
                    <div className="text-[10px] text-white/40 mt-0.5">{p.category}</div>
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
            {linking ? 'Matching…' : 'Match selected'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Baseline Drift Card ───────────────────────────────────────────────────

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type BaselineDriftSuggestion = { lift: string; label: string; baseline: number; learned: number; basis?: string };

function BaselineDriftCard({
  suggestions,
  onAccept,
  onDismiss,
}: {
  suggestions: BaselineDriftSuggestion[];
  onAccept: (lift: string, learned: number) => Promise<void>;
  onDismiss: (lift: string) => Promise<void>;
}) {
  const [actioning, setActioning] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-900/5 p-4">
      <div className="text-sm font-medium text-amber-200/90 mb-2">Update your strength baselines?</div>
      <div className="text-xs text-white/60 mb-3">
        Your logged lifts have progressed. Updating keeps planned weights accurate.
      </div>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <div
            key={s.lift}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2"
          >
            <div className="flex flex-col">
              <span className="text-sm text-white/90">
                {s.label}: {s.baseline} → {s.learned} lb
              </span>
              {s.basis && (
                <span className="text-[10px] text-white/40 mt-0.5">{s.basis}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={async () => {
                  setActioning(s.lift);
                  try { await onAccept(s.lift, s.learned); } finally { setActioning(null); }
                }}
                disabled={actioning !== null}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-emerald-500/80 text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {actioning === s.lift ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Update
              </button>
              <button
                onClick={async () => {
                  setActioning(s.lift);
                  try { await onDismiss(s.lift); } finally { setActioning(null); }
                }}
                disabled={actioning !== null}
                className="px-2.5 py-1 rounded text-xs bg-white/[0.06] border border-white/15 text-white/70 hover:bg-white/[0.1] disabled:opacity-60"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Plan Adaptation Card ──────────────────────────────────────────────────

type PlanAdaptationSuggestion = { code: string; title: string; details: string };

function PlanAdaptationCard({
  suggestions,
  onAccept,
  onDismiss,
}: {
  suggestions: PlanAdaptationSuggestion[];
  onAccept: (code: string) => Promise<void>;
  onDismiss: (code: string) => Promise<void>;
}) {
  const [actioning, setActioning] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-900/5 p-4">
      <div className="text-sm font-medium text-amber-200/90 mb-2">Plan adjustment suggestion</div>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <div key={s.code} className="rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2">
            <div className="text-sm text-white/90 font-medium">{s.title}</div>
            <div className="text-xs text-white/60 mt-0.5">{s.details}</div>
            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={async () => {
                  setActioning(s.code);
                  try { await onAccept(s.code); } finally { setActioning(null); }
                }}
                disabled={actioning !== null}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-emerald-500/80 text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {actioning === s.code ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Got it
              </button>
              <button
                onClick={async () => {
                  setActioning(s.code);
                  try { await onDismiss(s.code); } finally { setActioning(null); }
                }}
                disabled={actioning !== null}
                className="px-2.5 py-1 rounded text-xs bg-white/[0.06] border border-white/15 text-white/70 hover:bg-white/[0.1] disabled:opacity-60"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function CoachWeekTab() {
  const [weekOffset, setWeekOffset] = useState(0);
  const focusDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return toIsoDate(d);
  }, [weekOffset]);

  const { data, loading, error, refresh } = useCoachWeekContext(focusDate);
  const [linkOpen, setLinkOpen] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [contextValue, setContextValue] = useState('');
  const [contextSaving, setContextSaving] = useState(false);
  const [pendingSkipReasons, setPendingSkipReasons] = useState<Record<string, string | null>>({});
  const [skipReasonError, setSkipReasonError] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);

  const ws = data?.weekly_state_v1;

  useEffect(() => {
    const val = ws?.plan?.athlete_context_for_week ?? '';
    setContextValue(typeof val === 'string' ? val : '');
  }, [ws?.plan?.athlete_context_for_week]);

  useEffect(() => {
    setPendingSkipReasons({});
    setSkipReasonError(null);
    setApplyToAll(false);
  }, [focusDate]);

  const saveAthleteContext = async (value: string) => {
    const planId = ws?.plan?.plan_id;
    const weekIndex = ws?.week?.index;
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
    const prev = pendingSkipReasons[plannedId] ?? (data?.reaction?.key_session_gaps_details?.find((g: any) => g.planned_id === plannedId)?.skip_reason ?? null);
    setPendingSkipReasons((s) => ({ ...s, [plannedId]: reason }));
    setSkipReasonError(null);
    try {
      const patch: Record<string, unknown> = { skip_reason: reason ?? null };
      if (note !== undefined) patch.skip_note = note || null;
      const { error: updateErr } = await supabase
        .from('planned_workouts')
        .update(patch)
        .eq('id', plannedId);
      if (updateErr) throw updateErr;
      window.dispatchEvent(new CustomEvent('planned:invalidate'));
      await refresh();
      setPendingSkipReasons((s) => {
        const next = { ...s };
        delete next[plannedId];
        return next;
      });
    } catch (e: any) {
      setPendingSkipReasons((s) => ({ ...s, [plannedId]: prev }));
      setSkipReasonError(e?.message || 'Failed to save. Try again.');
    }
  };

  const updateAllSkipReasons = async (reason: string) => {
    const gaps = reaction?.key_session_gaps_details ?? [];
    for (const g of gaps) {
      await updateSkipReason(g.planned_id, reason);
    }
  };

  // Derived slices — kept above early returns so hooks are unconditional
  const ts = ws?.details?.training_state;
  const reaction = ws?.details?.reaction;
  // run_session_types_7d is at the root of weekly_state_v1, not under details
  const runSessionTypes = (ws as any)?.run_session_types_7d ?? [];
  const readiness = ws?.details?.marathon_readiness;
  const narrativeText = ws?.coach?.narrative ?? null;
  const planAdaptationSuggestions = ws?.coach?.plan_adaptation_suggestions ?? [];
  const keySessionsPlanned = ws?.glance?.key_sessions_planned ?? 0;
  const keySessionsLinked = ws?.glance?.key_sessions_linked ?? 0;
  const verdictCode = ws?.glance?.verdict_code ?? 'on_track';
  const showReadiness = ws?.guards?.show_readiness ?? false;

  // Active goals — today derived from training_state.subtitle ("5 weeks to Ojai.")
  // When backend sends a goals[] array, replace this derivation with ws.goals
  const activeGoals = useMemo(() => {
    const wsCast = ws as any;
    if (Array.isArray(wsCast?.goals) && wsCast.goals.length > 0) {
      return wsCast.goals as Array<{ id: string; subtitle: string; name?: string; weeks_out?: number }>;
    }
    const subtitle = ts?.subtitle;
    if (!subtitle || subtitle === '—' || !subtitle.trim()) return [];
    return [{ id: 'primary', subtitle }];
  }, [ws, ts?.subtitle]);

  const loadDriverRows = useMemo(() => {
    const rows = Array.isArray(ws?.load?.by_discipline) ? ws.load.by_discipline : [];
    return rows.slice(0, 4).map((r: any) => ({
      type: r.discipline,
      total_load: r.actual_load,
      linked_load: r.planned_load ?? 0,
      extra_load: r.extra_load,
    }));
  }, [ws?.load?.by_discipline]);

  const weekLabel = useMemo(() => {
    const parts: string[] = [];
    if (ws?.plan?.has_active_plan && ws?.week?.index != null) parts.push(`Week ${ws.week.index}`);
    if (ws?.week?.intent) {
      const intent = String(ws.week.intent).toLowerCase();
      if (intent === 'peak') parts.push('Peak');
      else if (intent === 'recovery') parts.push('Recovery');
      else if (intent === 'taper') parts.push('Taper');
      else if (intent === 'build') parts.push('Build');
      else if (intent === 'base') parts.push('Base');
    }
    return parts.join(' · ');
  }, [ws?.plan?.has_active_plan, ws?.week?.index, ws?.week?.intent]);

  const weekPosition = useMemo(() => {
    const start = ws?.week?.start_date;
    const end = ws?.week?.end_date;
    const asOf = ws?.as_of_date;
    if (!start || !end || !asOf) return null;
    try {
      const s = new Date(`${start}T12:00:00`);
      const e = new Date(`${end}T12:00:00`);
      const a = new Date(`${asOf}T12:00:00`);
      const totalDays = Math.max(1, Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      const elapsedRaw = Math.floor((a.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      const elapsedDays = Math.max(1, Math.min(totalDays, elapsedRaw));
      const pct = Math.round((elapsedDays / totalDays) * 100);
      const dayName = a.toLocaleDateString('en-US', { weekday: 'long' });
      return { totalDays, elapsedDays, pct, dayName };
    } catch {
      return null;
    }
  }, [ws?.week?.start_date, ws?.week?.end_date, ws?.as_of_date]);

  // ── Loading / error states ────────────────────────────────────────────────

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
        <button onClick={refresh} className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors">
          Try Again
        </button>
      </div>
    );
  }

  if (!data || !ws) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/60">
        <div className="text-sm">No data available</div>
      </div>
    );
  }

  // ── Verdict styles ────────────────────────────────────────────────────────

  const verdictTone =
    verdictCode === 'recover_overreaching' ? 'border-red-500/40 bg-gradient-to-br from-red-500/15 to-red-900/10'
    : verdictCode === 'caution_ramping_fast' ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-amber-900/10'
    : verdictCode === 'undertraining' ? 'border-sky-500/40 bg-gradient-to-br from-sky-500/12 to-sky-900/8'
    : 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 to-emerald-900/5';

  const titleGlow =
    verdictCode === 'recover_overreaching' ? 'text-red-300'
    : verdictCode === 'caution_ramping_fast' ? 'text-amber-300'
    : verdictCode === 'undertraining' ? 'text-sky-300'
    : 'text-emerald-300';

  const hasActivePlan = ws.plan.has_active_plan;
  const gaps = reaction?.key_session_gaps_details ?? [];

  return (
    <div className="space-y-3 pb-6">
      <LinkExtrasDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onLinked={async () => { await refresh(); }}
        extras={Array.isArray(reaction?.extra_sessions_details) ? reaction.extra_sessions_details : []}
        gaps={Array.isArray(reaction?.key_session_gaps_details) ? reaction.key_session_gaps_details : []}
      />

      {/* ── Week nav ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="p-1.5 rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white/70"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-xs text-white/50 min-w-[140px]">
            {ws.week.start_date} → {ws.week.end_date}
          </div>
          <button
            onClick={() => setWeekOffset((o) => Math.min(o + 1, 0))}
            className="p-1.5 rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30"
            aria-label="Next week"
            disabled={weekOffset >= 0}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={async () => {
            if (contextExpanded && contextValue !== (ws?.plan?.athlete_context_for_week ?? '')) {
              await saveAthleteContext(contextValue);
            }
            await refresh();
          }}
          className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/15 text-white/80 hover:bg-white/[0.12] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Week position strip — phase label only, no key sessions duplicate ── */}
      {weekPosition && (
        <div className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-white/55">
            <span>{weekPosition.dayName}</span>
            {weekLabel && (
              <>
                <span className="text-white/25">·</span>
                <span className="text-white/70">{weekLabel}</span>
              </>
            )}
            <span className="text-white/25">·</span>
            <span>{weekPosition.pct}% through week</span>
          </div>
        </div>
      )}

      {/* ── No-plan state ── */}
      {!hasActivePlan ? (
        <div className="space-y-3">
          {/* Still show narrative/training state if available */}
          {ts?.title && (
            <div className={`rounded-xl border p-4 ${verdictTone}`}>
              <div className={`text-lg font-semibold ${titleGlow}`} style={{ textShadow: '0 0 12px currentColor' }}>
                {ts.title}
              </div>
              {narrativeText && (
                <div className="text-sm text-white/75 mt-2 leading-relaxed">{narrativeText}</div>
              )}
              {ts.load_ramp_acwr != null && (
                <div className="mt-3"><TrainingStateBar acwr={ts.load_ramp_acwr} /></div>
              )}
            </div>
          )}
          {loadDriverRows.length > 0 && (
            <TrainingLoadCard rows={loadDriverRows} />
          )}
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center">
            <Target className="w-6 h-6 text-white/30 mx-auto mb-2" />
            <div className="text-sm text-white/60 mb-1">No active training plan</div>
            <div className="text-xs text-white/35">Add a goal to generate a plan and unlock weekly coaching.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">

          {/* ── 1. Coach narrative + race countdown ── */}
          <div className={`rounded-xl border p-4 ${verdictTone}`}>
            {/* Race countdown rows — multi-goal stub; maps over activeGoals array */}
            {activeGoals.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {activeGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-white/85 bg-white/[0.08] border border-white/15 rounded-full px-3 py-1"
                  >
                    <Target className="w-3 h-3 shrink-0 opacity-60" />
                    {goal.subtitle}
                  </div>
                ))}
              </div>
            )}

            <div
              className={`text-lg font-semibold ${titleGlow}`}
              style={{ textShadow: '0 0 12px currentColor' }}
            >
              {ts?.title || '—'}
            </div>

            {narrativeText ? (
              <div className="text-sm text-white/75 mt-2 leading-relaxed">{narrativeText}</div>
            ) : (
              // Fallback to structured server data when LLM narrative is unavailable
              <div className="mt-2 space-y-1">
                {ts?.kicker && <div className="text-sm text-white/65">{ts.kicker}</div>}
                {ws?.glance?.next_action_details && (
                  <div className="text-xs text-white/45">{ws.glance.next_action_details}</div>
                )}
              </div>
            )}

            {ts?.load_ramp_acwr != null && (
              <div className="mt-3">
                <TrainingStateBar acwr={ts.load_ramp_acwr} />
              </div>
            )}
          </div>

          {/* ── 2. Race readiness (moved up from bottom) ── */}
          {showReadiness && readiness?.applicable && (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-sm font-medium text-white/90 mb-1">Race readiness</div>
              <div className="text-xs text-white/50 mb-2">
                Whether your recent training is enough to finish strong.
              </div>
              <details className="mb-3 group">
                <summary className="text-[11px] text-white/40 cursor-pointer hover:text-white/60">
                  How each tells the story
                </summary>
                <div className="mt-1.5 text-[11px] text-white/40 space-y-1 pl-1 border-l border-white/10">
                  <div><span className="text-white/55">Long run</span> — Legs ready for race distance?</div>
                  <div><span className="text-white/55">Volume</span> — Enough weekly base to sustain?</div>
                  <div><span className="text-white/55">M-pace</span> — Recent race-pace work to stay sharp?</div>
                  <div><span className="text-white/55">ACWR</span> — Load in a safe range?</div>
                  <div><span className="text-white/55">Durability</span> — Legs won&apos;t fade late in the race?</div>
                </div>
              </details>
              <div className="space-y-2">
                {readiness.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 rounded-lg px-2.5 py-2 border border-white/[0.06] bg-white/[0.02]"
                  >
                    {item.pass ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500/90 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-amber-500/80 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/90">{item.label}</div>
                      <div className="text-[11px] text-white/50 mt-0.5">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              {readiness.summary !== 'insufficient_data' && !readiness.context_note && (
                <div className="mt-2 text-[11px] text-white/50">
                  {readiness.summary === 'on_track'
                    ? 'On track — training base looks sufficient for race day.'
                    : 'Needs work — address the gaps above before race day.'}
                </div>
              )}
              {readiness.context_note && (
                <div className="mt-2 rounded-lg px-2.5 py-2 bg-sky-500/10 border border-sky-500/20 text-xs text-sky-200/90">
                  {readiness.context_note}
                </div>
              )}
              {readiness.summary !== 'insufficient_data' && readiness.context_note && (
                <div className="mt-2 text-[11px] text-white/50">Needs work — but see note above.</div>
              )}
            </div>
          )}

          {/* ── 3. Training load ── */}
          {loadDriverRows.length > 0 && <TrainingLoadCard rows={loadDriverRows} />}

          {/* ── 4. Key sessions ── */}
          {keySessionsPlanned > 0 && (
            <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <div className="text-sm text-white/80">Key sessions</div>
                  <div className="text-[10px] text-white/40 mt-0.5">Intervals, long runs, tempo — the sessions that move the needle.</div>
                </div>
                <div className="text-sm text-white/90 font-medium shrink-0">
                  {keySessionsLinked}/{keySessionsPlanned} done
                </div>
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden border border-white/10">
                <div className="h-full flex">
                  <div
                    className="h-full bg-emerald-400/70"
                    style={{ width: `${Math.round((keySessionsLinked / Math.max(1, keySessionsPlanned)) * 100)}%` }}
                  />
                </div>
              </div>
              {((typeof reaction?.key_quality_extras === 'number' ? reaction.key_quality_extras : (reaction?.extra_sessions || 0)) > 0 || (reaction?.key_sessions_gaps || 0) > 0) && (
                <div className="mt-2 flex items-center justify-between text-xs text-white/45">
                  <div>
                    {(reaction?.key_sessions_gaps || 0) > 0 && (
                      <span className="text-amber-300/80">{reaction?.key_sessions_gaps || 0} missed</span>
                    )}
                    {(typeof reaction?.key_quality_extras === 'number' ? reaction.key_quality_extras : (reaction?.extra_sessions || 0)) > 0 && (
                      <span className={(reaction?.key_sessions_gaps || 0) > 0 ? 'ml-2 text-sky-300/80' : 'text-sky-300/80'}>
                        +{typeof reaction?.key_quality_extras === 'number' ? reaction.key_quality_extras : (reaction?.extra_sessions || 0)} extra
                      </span>
                    )}
                  </div>
                  {(reaction?.extra_sessions || 0) > 0 && (reaction?.key_sessions_gaps || 0) > 0 && (
                    <button
                      onClick={() => setLinkOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.06] border border-white/10 text-white/70 hover:bg-white/[0.10] text-xs"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Did a different workout instead?
                    </button>
                  )}
                </div>
              )}
              {gaps.length > 0 && (
                <div className="mt-3 space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-white/45 uppercase tracking-wide">Why missed?</div>
                    {skipReasonError && (
                      <span className="text-[10px] text-amber-300">{skipReasonError}</span>
                    )}
                  </div>
                  {/* Apply to all toggle — shown when more than one gap */}
                  {gaps.length > 1 && (
                    <div className="flex items-center gap-3 mb-1">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyToAll}
                          onChange={(e) => setApplyToAll(e.target.checked)}
                          className="w-3 h-3 accent-amber-400"
                        />
                        <span className="text-[10px] text-white/50">Same reason for all</span>
                      </label>
                      {applyToAll && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            updateAllSkipReasons(val);
                          }}
                          className="flex-1 px-2 py-1 rounded text-[10px] bg-white/[0.06] border border-white/10 text-white/70 focus:outline-none focus:border-white/20 appearance-none"
                          style={{ colorScheme: 'dark' }}
                        >
                          <option value="" className="bg-neutral-900">Select reason…</option>
                          <option value="sick" className="bg-neutral-900">Sick</option>
                          <option value="travel" className="bg-neutral-900">Travel</option>
                          <option value="rest" className="bg-neutral-900">Rest</option>
                          <option value="life" className="bg-neutral-900">Life</option>
                          <option value="swapped" className="bg-neutral-900">Swapped</option>
                        </select>
                      )}
                    </div>
                  )}
                  {!applyToAll && gaps.map((g) => {
                    const effectiveReason = pendingSkipReasons[g.planned_id] ?? g.skip_reason ?? null;
                    return (
                      <div key={g.planned_id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                        <div className="text-xs text-white/70 mb-1.5">
                          {g.date} · {g.type}{g.name ? ` (${g.name})` : ''}
                        </div>
                        <select
                          value={effectiveReason ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateSkipReason(g.planned_id, val || null);
                          }}
                          className="w-full px-2 py-1 rounded text-[10px] bg-white/[0.06] border border-white/10 text-white/70 focus:outline-none focus:border-white/20 appearance-none"
                          style={{ colorScheme: 'dark' }}
                        >
                          <option value="" className="bg-neutral-900">Select reason…</option>
                          <option value="sick" className="bg-neutral-900">Sick</option>
                          <option value="travel" className="bg-neutral-900">Travel</option>
                          <option value="rest" className="bg-neutral-900">Rest</option>
                          <option value="life" className="bg-neutral-900">Life</option>
                          <option value="swapped" className="bg-neutral-900">Swapped</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Add note (optional)"
                          defaultValue={g.skip_note ?? ''}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (g.skip_note ?? '')) updateSkipReason(g.planned_id, effectiveReason, v);
                          }}
                          className="mt-1.5 w-full px-2 py-1 text-[10px] bg-white/[0.04] border border-white/10 rounded text-white/70 placeholder:text-white/30 focus:outline-none focus:border-white/20"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── 5. Context input — AFTER narrative so athlete reads coach take first ── */}
          {ws.plan.plan_id && ws.week.index != null && (() => {
            const prompt = (ws as any)?.response_model?.context_prompt;
            const tags = prompt?.tags ?? [];
            return (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
                {prompt?.show && !contextValue.trim() && !(gaps.length > 0) ? (
                  <div className="px-3 py-3">
                    <div className="text-xs text-white/70 mb-2">{prompt.question}</div>
                    {tags.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          setContextValue(val);
                          saveAthleteContext(val);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs bg-white/[0.06] border border-white/10 text-white/70 focus:outline-none focus:border-white/20 appearance-none mb-2"
                        style={{ colorScheme: 'dark' }}
                      >
                        <option value="" disabled className="bg-neutral-900">Select a reason…</option>
                        {tags.map((tag: any) => (
                          <option key={tag.id} value={tag.id} className="bg-neutral-900">
                            {tag.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => setContextExpanded(true)}
                      className="text-[10px] text-white/35 hover:text-white/55"
                    >
                      Or add your own note...
                    </button>
                  </div>
                ) : contextExpanded ? (
                  <>
                    <textarea
                      value={contextValue}
                      onChange={(e) => setContextValue(e.target.value)}
                      onBlur={() => {
                        saveAthleteContext(contextValue);
                        if (!contextValue.trim()) setContextExpanded(false);
                      }}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          saveAthleteContext(contextValue);
                          if (!contextValue.trim()) setContextExpanded(false);
                          (e.target as HTMLTextAreaElement).blur();
                        }
                      }}
                      placeholder="e.g. had the flu, travel, increased weights on purpose..."
                      className="w-full min-h-[72px] px-3 py-2.5 bg-transparent text-sm text-white/90 placeholder:text-white/40 resize-none focus:outline-none focus:ring-0 border-0"
                      autoFocus
                    />
                    <div className="px-3 pb-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          saveAthleteContext(contextValue);
                          if (!contextValue.trim()) setContextExpanded(false);
                        }}
                        disabled={contextSaving}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/80 text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {contextSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => setContextExpanded(true)}
                    className="w-full text-left px-3 py-2.5 text-xs text-white/45 hover:text-white/65 hover:bg-white/[0.04] transition-colors"
                  >
                    {contextValue.trim() ? (
                      <span className="italic text-white/55">&quot;{contextValue.length > 40 ? contextValue.slice(0, 40) + '…' : contextValue}&quot;</span>
                    ) : (
                      'Anything the coach should know about this week?'
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
            );
          })()}

          {/* ── 6. Baseline drift ── */}
          {Array.isArray(ws.coach.baseline_drift_suggestions) && ws.coach.baseline_drift_suggestions.length > 0 && (
            <BaselineDriftCard
              suggestions={ws.coach.baseline_drift_suggestions}
              onAccept={async (lift, learned) => {
                const uId = getStoredUserId();
                if (!uId) return;
                const key = lift === 'overhead_press' ? 'overheadPress1RM' : lift === 'bench_press' ? 'bench' : lift;
                const { data: ub } = await supabase.from('user_baselines').select('performance_numbers, dismissed_suggestions').eq('user_id', uId).maybeSingle();
                const perf = { ...((ub?.performance_numbers as Record<string, unknown>) || {}), [key]: learned };
                const dismissed = (ub?.dismissed_suggestions as Record<string, Record<string, string>>) || {};
                const drift = { ...(dismissed.baseline_drift || {}) };
                delete drift[lift];
                await supabase.from('user_baselines').update({
                  performance_numbers: perf,
                  dismissed_suggestions: { ...dismissed, baseline_drift: drift },
                  updated_at: new Date().toISOString(),
                }).eq('user_id', uId);
                window.dispatchEvent(new CustomEvent('planned:invalidate'));
                await refresh();
              }}
              onDismiss={async (lift) => {
                const uId = getStoredUserId();
                if (!uId) return;
                const today = new Date().toISOString().slice(0, 10);
                const { data: ub } = await supabase.from('user_baselines').select('dismissed_suggestions').eq('user_id', uId).maybeSingle();
                const dismissed = (ub?.dismissed_suggestions as Record<string, Record<string, string>>) || {};
                const drift = { ...(dismissed.baseline_drift || {}), [lift]: today };
                await supabase.from('user_baselines').update({
                  dismissed_suggestions: { ...dismissed, baseline_drift: drift },
                  updated_at: new Date().toISOString(),
                }).eq('user_id', uId);
                await refresh();
              }}
            />
          )}

          {/* ── 7. Plan adaptation ── */}
          {Array.isArray(planAdaptationSuggestions) && planAdaptationSuggestions.length > 0 && (
            <PlanAdaptationCard
              suggestions={planAdaptationSuggestions}
              onAccept={async (code) => {
                const uId = getStoredUserId();
                if (!uId) return;
                if (code.startsWith('str_prog_') || code.startsWith('str_deload_') || code.startsWith('end_')) {
                  try {
                    await supabase.functions.invoke('adapt-plan', {
                      body: { user_id: uId, action: 'accept', suggestion_id: code },
                    });
                    window.dispatchEvent(new CustomEvent('planned:invalidate'));
                  } catch (e) {
                    console.error('[adapt-plan] accept failed:', e);
                  }
                }
                const today = new Date().toISOString().slice(0, 10);
                const { data: ub } = await supabase.from('user_baselines').select('dismissed_suggestions').eq('user_id', uId).maybeSingle();
                const dismissed = (ub?.dismissed_suggestions as Record<string, Record<string, string>>) || {};
                const pa = { ...(dismissed.plan_adaptation || {}), [code]: today };
                await supabase.from('user_baselines').update({
                  dismissed_suggestions: { ...dismissed, plan_adaptation: pa },
                  updated_at: new Date().toISOString(),
                }).eq('user_id', uId);
                await refresh();
              }}
              onDismiss={async (code) => {
                const uId = getStoredUserId();
                if (!uId) return;
                const today = new Date().toISOString().slice(0, 10);
                const { data: ub } = await supabase.from('user_baselines').select('dismissed_suggestions').eq('user_id', uId).maybeSingle();
                const dismissed = (ub?.dismissed_suggestions as Record<string, Record<string, string>>) || {};
                const pa = { ...(dismissed.plan_adaptation || {}), [code]: today };
                await supabase.from('user_baselines').update({
                  dismissed_suggestions: { ...dismissed, plan_adaptation: pa },
                  updated_at: new Date().toISOString(),
                }).eq('user_id', uId);
                await refresh();
              }}
            />
          )}

          {/* ── 8. Training signals — collapsed by default ── */}
          {(() => {
            const rm = (ws as any)?.response_model;
            if (!rm) return null;
            const assessment = rm.assessment;
            const headline = rm.headline;
            const signals: any[] = rm.visible_signals ?? [];
            const crossDomain = rm.cross_domain;

            const TONE_STYLES: Record<string, { text: string; bg: string }> = {
              positive: { text: 'text-emerald-400', bg: 'border-emerald-500/20 bg-emerald-500/5' },
              warning: { text: 'text-amber-400', bg: 'border-amber-500/20 bg-amber-500/5' },
              danger: { text: 'text-red-400', bg: 'border-red-500/20 bg-red-500/5' },
              neutral: { text: 'text-white/50', bg: 'border-white/10 bg-white/[0.03]' },
            };
            const TREND_TONE_COLORS: Record<string, string> = {
              positive: 'text-emerald-400',
              warning: 'text-amber-400',
              danger: 'text-red-400',
              neutral: 'text-white/40',
            };
            const tone = TONE_STYLES[assessment?.tone] ?? TONE_STYLES.neutral;
            const enduranceSignals = signals.filter((s: any) => s.category === 'endurance');
            const strengthSignals = signals.filter((s: any) => s.category === 'strength');

            return (
              <details className="rounded-xl border border-white/15 bg-white/[0.06] overflow-hidden group">
                <summary className="px-4 py-3 text-xs text-white/55 cursor-pointer hover:text-white/75 hover:bg-white/[0.03] transition-colors list-none flex items-center justify-between">
                  <span>Training data</span>
                  <span className="text-white/25 group-open:rotate-180 transition-transform inline-block">▾</span>
                </summary>
                <div className="px-4 pb-4 space-y-4">
                  {headline && (
                    <div>
                      <div className="text-sm text-white/85 font-medium">{headline.text}</div>
                      <div className="text-[10px] text-white/40 mt-0.5">{headline.subtext}</div>
                    </div>
                  )}

                  {assessment && assessment.label !== 'insufficient_data' && (
                    <div className={`rounded-lg border px-3 py-2 ${tone.bg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${tone.text}`}>{assessment.title}</span>
                      </div>
                      <div className="text-xs text-white/60 mt-1">{assessment.explain}</div>
                    </div>
                  )}
                  {assessment?.label === 'insufficient_data' && (
                    <div className="text-xs text-white/50">{assessment.explain}</div>
                  )}

                  {enduranceSignals.length > 0 && (
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wide mb-2">Endurance</div>
                      <div className="space-y-2">
                        {enduranceSignals.map((s: any) => (
                          <div key={s.label} className="flex items-center justify-between">
                            <div className="text-xs text-white/60">{s.label}</div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${TREND_TONE_COLORS[s.trend_tone] ?? 'text-white/40'}`}>{s.trend_icon} {s.detail}</span>
                              <span className="text-[10px] text-white/25">{s.samples_label || `${s.samples}`}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {strengthSignals.length > 0 && (
                    <div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wide mb-2">Strength</div>
                      <div className="space-y-2">
                        {strengthSignals.map((s: any) => (
                          <div key={s.label} className="flex items-center justify-between">
                            <div className="text-xs text-white/60">{s.label}</div>
                            <div className="flex items-center gap-2">
                              {s.value_display && <span className="text-xs text-white/70">{s.value_display}</span>}
                              <span className={`text-xs font-medium ${TREND_TONE_COLORS[s.trend_tone] ?? 'text-white/40'}`}>{s.trend_icon} {s.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {crossDomain?.interference_detected && crossDomain.patterns?.length > 0 && (
                    <div>
                      <div className="text-[10px] text-amber-400/70 uppercase tracking-wide mb-1">Strength + endurance</div>
                      {crossDomain.patterns.filter((p: any) => p.code !== 'concurrent_gains').map((p: any, i: number) => (
                        <div key={i} className="text-xs text-white/55">{p.description}</div>
                      ))}
                    </div>
                  )}
                  {crossDomain?.patterns?.some((p: any) => p.code === 'concurrent_gains') && (
                    <div className="text-[10px] text-emerald-400/60">
                      Strength and endurance are working well together.
                    </div>
                  )}

                  {signals.length === 0 && assessment?.label !== 'insufficient_data' && (
                    <div className="text-xs text-white/45">No signal data available for this week yet.</div>
                  )}
                </div>
              </details>
            );
          })()}

          {/* ── 9. Session breakdown (all disciplines — run only for now, Tier 2 generalizes) ── */}
          {runSessionTypes.length > 0 && (
            <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
              <div className="text-sm text-white/80 mb-2">Session breakdown</div>
              <div className="grid grid-cols-2 gap-2">
                {runSessionTypes.slice(0, 6).map((s: any) => {
                  const TONE_COLORS: Record<string, string> = {
                    positive: 'text-emerald-400', warning: 'text-amber-400', danger: 'text-red-400', neutral: 'text-white/50',
                  };
                  const label = s.type_label || s.type;
                  const metric = s.efficiency_label || '—';
                  const clr = TONE_COLORS[s.efficiency_tone] || 'text-white/50';
                  return (
                    <div key={`${s.type}-${s.sample_size}`} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-white/85 font-medium">{label}</div>
                        <div className="text-[10px] text-white/35">&times;{s.sample_size}</div>
                      </div>
                      <div className={`mt-0.5 text-xs ${clr}`}>{metric}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── Training Load Card (extracted for reuse in no-plan state) ─────────────

function TrainingLoadCard({ rows }: { rows: Array<{ type: string; total_load: number; linked_load: number; extra_load: number }> }) {
  const maxLoad = Math.max(...rows.map(r => r.total_load), 1);
  return (
    <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
      <div className="text-sm text-white/80 mb-0.5">Training load</div>
      <div className="text-[10px] text-white/40 mb-2">
        Workload by discipline this week. Green = from your plan; blue = unplanned.
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
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
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2">
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
  );
}
