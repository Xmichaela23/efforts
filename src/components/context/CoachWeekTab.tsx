import React, { useMemo, useState, useEffect } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Link2, Loader2, RefreshCw, X } from 'lucide-react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useCoachWeekContext } from '@/hooks/useCoachWeekContext';
import { supabase, getStoredUserId } from '@/lib/supabase';
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

  const handleAccept = async (s: BaselineDriftSuggestion) => {
    setActioning(s.lift);
    try {
      await onAccept(s.lift, s.learned);
    } finally {
      setActioning(null);
    }
  };

  const handleDismiss = async (s: BaselineDriftSuggestion) => {
    setActioning(s.lift);
    try {
      await onDismiss(s.lift);
    } finally {
      setActioning(null);
    }
  };

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
                onClick={() => handleAccept(s)}
                disabled={actioning !== null}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-emerald-500/80 text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {actioning === s.lift ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Update
              </button>
              <button
                onClick={() => handleDismiss(s)}
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

  const handleAccept = async (s: PlanAdaptationSuggestion) => {
    setActioning(s.code);
    try {
      await onAccept(s.code);
    } finally {
      setActioning(null);
    }
  };

  const handleDismiss = async (s: PlanAdaptationSuggestion) => {
    setActioning(s.code);
    try {
      await onDismiss(s.code);
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-900/5 p-4">
      <div className="text-sm font-medium text-amber-200/90 mb-2">Plan adjustment suggestion</div>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <div
            key={s.code}
            className="rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2"
          >
            <div className="text-sm text-white/90 font-medium">{s.title}</div>
            <div className="text-xs text-white/60 mt-0.5">{s.details}</div>
            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={() => handleAccept(s)}
                disabled={actioning !== null}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-emerald-500/80 text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {actioning === s.code ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Got it
              </button>
              <button
                onClick={() => handleDismiss(s)}
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

export default function CoachWeekTab() {
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week
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
  const ws = data?.weekly_state_v1;

  useEffect(() => {
    const val = ws?.plan?.athlete_context_for_week ?? '';
    setContextValue(typeof val === 'string' ? val : '');
  }, [ws?.plan?.athlete_context_for_week]);

  useEffect(() => {
    setPendingSkipReasons({});
    setSkipReasonError(null);
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

  // Hooks must be called unconditionally (even while loading/error).
  // Keep derived memoized slices above any early returns.
  const ts = ws?.details?.training_state;
  const reaction = ws?.details?.reaction;
  const runSessionTypes = (ws as any)?.run_session_types_7d ?? [];
  const readiness = ws?.details?.marathon_readiness;
  const narrativeText = ws?.coach?.narrative ?? null;
  const planAdaptationSuggestions = ws?.coach?.plan_adaptation_suggestions ?? [];
  const keySessionsPlanned = ws?.glance?.key_sessions_planned ?? 0;
  const keySessionsLinked = ws?.glance?.key_sessions_linked ?? 0;
  const verdictCode = ws?.glance?.verdict_code ?? 'on_track';
  const showReadiness = ws?.guards?.show_readiness ?? false;

  const loadDriverRows = useMemo(() => {
    const ownerRows = (ws && Array.isArray(ws?.load?.by_discipline))
      ? ws.load.by_discipline.map((r: any) => ({
          type: r.discipline,
          total_load: r.actual_load,
          linked_load: r.planned_load ?? 0,
          extra_load: r.extra_load,
        }))
      : [];
    return ownerRows.slice(0, 3);
  }, [ws?.load?.by_discipline]);

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

  if (!ws) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-300">
        <AlertCircle className="w-8 h-8 mb-3" />
        <div className="text-sm text-center">Weekly data contract missing. Please refresh.</div>
        <button
          onClick={refresh}
          className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }



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

  const weekLabel = (() => {
    const parts: string[] = [];
    if (ws.plan.has_active_plan && ws.week.index != null) parts.push(`Week ${ws.week.index}`);
    if (ws.week.intent) {
      const intent = String(ws.week.intent).toLowerCase();
      if (intent === 'peak') parts.push('Peak phase');
      else if (intent === 'recovery') parts.push('Recovery week');
      else if (intent === 'taper') parts.push('Taper');
      else if (intent === 'build') parts.push('Build phase');
      else if (intent === 'base') parts.push('Base phase');
    }
    return parts.join(' · ');
  })();

  const weekPosition = (() => {
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
  })();

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
        extras={Array.isArray(reaction?.extra_sessions_details) ? reaction.extra_sessions_details : []}
        gaps={Array.isArray(reaction?.key_session_gaps_details) ? reaction.key_session_gaps_details : []}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="p-1.5 rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-30"
            aria-label="Previous week"
            disabled={weekOffset >= 0}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-xs text-white/50 min-w-[140px]">
            {ws.week.start_date} → {ws.week.end_date}
            {weekLabel ? <span className="ml-2 text-white/60">{weekLabel}</span> : null}
          </div>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="p-1.5 rounded-lg text-white/50 hover:bg-white/[0.06] hover:text-white/70"
            aria-label="Next week"
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

      {weekPosition ? (
        <div className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-white/75">
              <span className="text-white/45">Week position:</span> {weekPosition.dayName} · Day {weekPosition.elapsedDays}/{weekPosition.totalDays}
            </span>
            <span className="text-white/45">•</span>
            <span className="text-white/75">
              <span className="text-white/45">Progress:</span> {weekPosition.pct}%
            </span>
            <span className="text-white/45">•</span>
            <span className="text-white/75">
              <span className="text-white/45">Key sessions:</span> {keySessionsLinked}/{keySessionsPlanned}
            </span>
          </div>
        </div>
      ) : null}

      {/* ── Structured Context (server-driven prompts) ── */}
      {ws.plan.has_active_plan && ws.plan.plan_id && ws.week.index != null && (() => {
        const prompt = (ws as any)?.response_model?.context_prompt;
        const tags = prompt?.tags ?? [];

        return (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
            {prompt?.show && !contextValue.trim() ? (
              <div className="px-3 py-3">
                <div className="text-xs text-white/70 mb-2">{prompt.question}</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((tag: any) => (
                    <button
                      key={tag.id}
                      onClick={() => {
                        setContextValue(tag.id);
                        saveAthleteContext(tag.id);
                      }}
                      className="px-2.5 py-1 rounded-full text-[11px] bg-white/[0.06] border border-white/10 text-white/60 hover:bg-white/[0.12] hover:text-white/80 transition-colors"
                    >
                      {tag.emoji} {tag.label}
                    </button>
                  ))}
                </div>
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
                  'Add context for this week (sick, travel, etc.)'
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

      {/* ── Baseline drift suggestion (Phase 3) ── */}
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

      {/* ── Plan adaptation suggestions ── */}
      {Array.isArray(planAdaptationSuggestions) && planAdaptationSuggestions.length > 0 && (
        <PlanAdaptationCard
          suggestions={planAdaptationSuggestions}
          onAccept={async (code) => {
            const uId = getStoredUserId();
            if (!uId) return;
            // Strength progression/deload: call adapt-plan to apply weight changes
            if (code.startsWith('str_prog_') || code.startsWith('str_deload_')) {
              try {
                await supabase.functions.invoke('adapt-plan', {
                  body: { user_id: uId, action: 'accept', suggestion_id: code },
                });
                window.dispatchEvent(new CustomEvent('planned:invalidate'));
              } catch (e) {
                console.error('[adapt-plan] accept failed:', e);
              }
            }
            // Endurance pace/FTP: call adapt-plan
            if (code.startsWith('end_')) {
              try {
                await supabase.functions.invoke('adapt-plan', {
                  body: { user_id: uId, action: 'accept', suggestion_id: code },
                });
                window.dispatchEvent(new CustomEvent('planned:invalidate'));
              } catch (e) {
                console.error('[adapt-plan] accept failed:', e);
              }
            }
            // Dismiss from future suggestions
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

      {/* ── Coach Narrative ── */}
      <div className={`rounded-xl border p-4 ${verdictTone}`}>
        <div className={`text-lg font-semibold ${titleGlow}`}
          style={{ textShadow: `0 0 12px currentColor` }}
        >{ts?.title || '—'}</div>

        {narrativeText ? (
          <div className="text-sm text-white/75 mt-2 leading-relaxed">{narrativeText}</div>
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
          <div className="text-sm text-white/80 mb-0.5">Training load</div>
          <div className="text-[10px] text-white/40 mb-2">Workload points by discipline. Planned = from your plan; Extra = unplanned sessions.</div>
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
      {keySessionsPlanned > 0 && (
        <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <div className="text-sm text-white/80">Key sessions</div>
              <div className="text-[10px] text-white/40 mt-0.5">High-priority workouts (intervals, long runs, tempo) from your plan.</div>
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
                  <span className={(reaction?.key_sessions_gaps || 0) > 0 ? 'ml-2 text-sky-300/80' : 'text-sky-300/80'}>+{typeof reaction?.key_quality_extras === 'number' ? reaction.key_quality_extras : (reaction?.extra_sessions || 0)} extra</span>
                )}
              </div>
              {(reaction?.extra_sessions || 0) > 0 && (reaction?.key_sessions_gaps || 0) > 0 && (
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
          {reaction?.key_session_gaps_details && reaction.key_session_gaps_details.length > 0 && (
            <div className="mt-3 space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] text-white/45 uppercase tracking-wide">Why missed?</div>
                {skipReasonError && (
                  <span className="text-[10px] text-amber-300">{skipReasonError}</span>
                )}
              </div>
              {reaction.key_session_gaps_details.map((g) => {
                const effectiveReason = pendingSkipReasons[g.planned_id] ?? g.skip_reason ?? null;
                return (
                <div key={g.planned_id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-white/70 mb-1.5">
                    {g.date} · {g.type}{g.name ? ` (${g.name})` : ''}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(['sick', 'travel', 'rest', 'life', 'swapped'] as const).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => updateSkipReason(g.planned_id, effectiveReason === tag ? null : tag)}
                        className={`px-2 py-0.5 rounded text-[10px] capitalize transition-colors ${
                          effectiveReason === tag
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

      {/* ── Body Response (renders server-computed response_model verbatim) ── */}
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
          <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4 space-y-4">
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
                  <span className="text-[10px] text-white/30">·</span>
                  <span className="text-[10px] text-white/40">{assessment.confidence} confidence</span>
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
                        <span className="text-[10px] text-white/25">n={s.samples}</span>
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
                <div className="text-[10px] text-amber-400/70 uppercase tracking-wide mb-1">Cross-training interference</div>
                {crossDomain.patterns.filter((p: any) => p.code !== 'concurrent_gains').map((p: any, i: number) => (
                  <div key={i} className="text-xs text-white/55">{p.description}</div>
                ))}
              </div>
            )}
            {crossDomain?.patterns?.some((p: any) => p.code === 'concurrent_gains') && (
              <div className="text-[10px] text-emerald-400/60">
                No strength-endurance interference detected — concurrent training is working well.
              </div>
            )}

            {signals.length === 0 && assessment?.label !== 'insufficient_data' && (
              <div className="text-xs text-white/45">No signal data available for this week yet.</div>
            )}
          </div>
        );
      })()}

      {/* ── Run sessions ── */}
      {runSessionTypes.length > 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/[0.06] p-4">
          <div className="text-sm text-white/80 mb-2">Run sessions this week</div>
          <div className="grid grid-cols-2 gap-2">
            {runSessionTypes.slice(0, 6).map((s: any) => {
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

      {/* ── Marathon Readiness (Phase 3.5) — at bottom so context note lands last ── */}
      {showReadiness && readiness?.applicable && (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-sm font-medium text-white/90 mb-1">Marathon readiness</div>
          <div className="text-xs text-white/50 mb-2">
            Whether your recent training is enough to finish strong. ✓ = met, ✗ = gap.
          </div>
          <details className="mb-3 group">
            <summary className="text-[11px] text-white/40 cursor-pointer hover:text-white/60">
              How each tells the story
            </summary>
            <div className="mt-1.5 text-[11px] text-white/40 space-y-1 pl-1 border-l border-white/10">
              <div><span className="text-white/55">Long run</span> — Legs ready for 26.2?</div>
              <div><span className="text-white/55">Volume</span> — Enough weekly base to sustain?</div>
              <div><span className="text-white/55">M-pace</span> — Recent marathon-pace work to stay sharp?</div>
              <div><span className="text-white/55">ACWR</span> — Load in a safe range (not ramping too fast or dropping)?</div>
              <div><span className="text-white/55">Durability</span> — Legs won&apos;t fade in the final 10K?</div>
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

    </div>
  );
}
