import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '../lib/supabase';
import StrengthPerformanceSummary from './StrengthPerformanceSummary';
import SessionNarrative from './SessionNarrative';
import EnduranceIntervalTable, { type GoalRaceReferenceMode } from './EnduranceIntervalTable';
import AdherenceChips from './AdherenceChips';
import { formatDuration } from '@/utils/workoutFormatting';

const PROJECTION_TIP_STORAGE_KEY = 'has_seen_projection_tip_v1';

type MobileSummaryProps = {
  planned: any | null;
  completed: any | null;
  session_detail_v1?: Record<string, any> | null;
  /** True while `scope=session_detail` workout-detail request is in flight */
  sessionDetailLoading?: boolean;
};

export default function MobileSummary({ planned, completed, session_detail_v1, sessionDetailLoading, hideTopAdherence }: MobileSummaryProps & { hideTopAdherence?: boolean }) {
  const { useImperial } = useAppContext();

  const sd = session_detail_v1;
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [referenceMode, setReferenceMode] = useState<GoalRaceReferenceMode | null>(null);
  const [showProjectionTip, setShowProjectionTip] = useState(false);

  const hasSessionDetail = !!sd;
  const noPlannedCompare = !planned && !sd?.plan_context?.planned_id;
  if (noPlannedCompare) {
    const typeMaybe = String((completed as any)?.type || '').toLowerCase();
    const allowCompletedOnly = (
      typeMaybe === 'strength' ||
      typeMaybe === 'run' || typeMaybe === 'running' ||
      typeMaybe === 'ride' || typeMaybe === 'cycling' || typeMaybe === 'bike' ||
      typeMaybe === 'swim' || typeMaybe === 'swimming'
    );
    if (!allowCompletedOnly) {
      return (<div className="text-sm text-gray-600">No planned session to compare.</div>);
    }
  }

  const type = String(sd?.type || (planned as any)?.type || (completed as any)?.type || '').toLowerCase();

  const race = sd?.race;
  const completedDate = (completed as { date?: string; start_date_local?: string } | null)?.date
    ?? (completed as { start_date_local?: string } | null)?.start_date_local;

  useEffect(() => {
    if (!race?.is_goal_race || !race.goal_id) {
      setReferenceMode(null);
      return;
    }
    const goalId = String(race.goal_id);
    const projS = race.fitness_projection_seconds;
    const goalS = race.goal_time_seconds;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('goals')
        .select('last_reference_mode')
        .eq('id', goalId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('[MobileSummary] last_reference_mode load', error);
      }
      const dStr = completedDate != null ? String(completedDate) : '';
      const raceDate = dStr
        ? new Date(dStr.includes('T') ? dStr : `${dStr.slice(0, 10)}T12:00:00`)
        : new Date();
      const postRace = raceDate < new Date();
      const def: GoalRaceReferenceMode = postRace ? 'projection' : 'goal';
      const stored = data?.last_reference_mode;
      let next: GoalRaceReferenceMode = stored === 'projection' || stored === 'goal' ? stored : def;
      if (projS == null && goalS == null) {
        next = 'goal';
      } else {
        if (next === 'projection' && projS == null) next = 'goal';
        if (next === 'goal' && goalS == null) next = 'projection';
      }
      setReferenceMode(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    race?.is_goal_race,
    race?.goal_id,
    race?.fitness_projection_seconds,
    race?.goal_time_seconds,
    completedDate,
  ]);

  const handleModeToggle = useCallback(async (mode: GoalRaceReferenceMode) => {
    if (!race?.is_goal_race || !race.goal_id) return;
    if (mode === 'projection' && race.fitness_projection_seconds == null) return;
    if (mode === 'goal' && race.goal_time_seconds == null) return;
    setReferenceMode(mode);
    if (mode === 'projection') {
      try {
        if (!localStorage.getItem(PROJECTION_TIP_STORAGE_KEY)) {
          setShowProjectionTip(true);
        }
      } catch { /* private mode / quota */ }
    }
    try {
      const { error } = await supabase
        .from('goals')
        .update({ last_reference_mode: mode })
        .eq('id', String(race.goal_id));
      if (error) console.warn('[MobileSummary] last_reference_mode persist', error);
    } catch (e) {
      console.warn('[MobileSummary] last_reference_mode persist', e);
    }
  }, [race]);

  const dismissProjectionTip = useCallback(() => {
    setShowProjectionTip(false);
    try {
      localStorage.setItem(PROJECTION_TIP_STORAGE_KEY, '1');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setRecomputeError(null);
    setRecomputing(false);
  }, [completed]);

  const recomputeAnalysis = async () => {
    const workoutId = String(sd?.workout_id || (completed as any)?.id || '');
    if (!workoutId) return;

    const formatInvokeError = async (err: unknown, step: string): Promise<string> => {
      const base = (err as { message?: string })?.message
        || (typeof err === 'object' && err !== null ? JSON.stringify(err).slice(0, 200) : String(err));
      const ctx = (err as { context?: { json?: () => Promise<unknown> } })?.context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = (await ctx.json()) as { error?: string } | string | null;
          if (body && typeof body === 'object' && typeof (body as { error?: string }).error === 'string') {
            return `${step}: ${(body as { error: string }).error}`;
          }
          if (body != null && typeof body === 'object') {
            return `${step}: ${JSON.stringify(body).slice(0, 400)}`;
          }
        } catch {
          /* ignore */
        }
      }
      return `${step}: ${base}`;
    };

    try {
      setRecomputing(true);
      setRecomputeError(null);

      const fnName = (() => {
        const t = String(type || '').toLowerCase();
        if (t === 'run' || t === 'running') return 'analyze-running-workout';
        if (t === 'ride' || t === 'cycling' || t === 'bike') return 'analyze-cycling-workout';
        if (t === 'strength' || t === 'strength_training') return 'analyze-strength-workout';
        if (t === 'swim' || t === 'swimming') return 'analyze-swim-workout';
        return 'analyze-running-workout';
      })();

      // Step 1: Recompute computed.overall (duration, pace, distance) so downstream analysis uses fresh values
      console.log('[recompute] Step 1: compute-workout-analysis for', workoutId);
      const computeRes = await supabase.functions.invoke('compute-workout-analysis', {
        body: { workout_id: workoutId },
      });
      if (computeRes.error) {
        console.warn('[recompute] compute-workout-analysis error:', computeRes.error);
        throw await formatInvokeError(computeRes.error, 'compute-workout-analysis');
      }
      console.log('[recompute] compute-workout-analysis ok');

      // Step 1b: session_load + facts (readiness / LOAD context); omitted before caused empty session_load after recompute
      console.log('[recompute] Step 1b: compute-facts for', workoutId);
      const factsRes = await supabase.functions.invoke('compute-facts', {
        body: { workout_id: workoutId },
      });
      if (factsRes.error) {
        console.warn('[recompute] compute-facts error:', factsRes.error);
        throw await formatInvokeError(factsRes.error, 'compute-facts');
      }
      console.log('[recompute] compute-facts ok');

      // Step 2: Run the discipline-specific analysis (builds fact packet, narrative, etc.)
      console.log('[recompute] Step 2:', fnName, 'for', workoutId);
      const analyzeRes = await supabase.functions.invoke(fnName, {
        body: { workout_id: workoutId },
      });
      if (analyzeRes.error) {
        console.error('[recompute]', fnName, 'error:', analyzeRes.error);
        throw await formatInvokeError(analyzeRes.error, fnName);
      }
      console.log('[recompute]', fnName, 'ok, data:', typeof analyzeRes.data === 'object' ? JSON.stringify(analyzeRes.data).slice(0, 200) : analyzeRes.data);

    } catch (e: unknown) {
      setRecomputeError(typeof e === 'string' ? e : (e as Error)?.message || String(e));
    } finally {
      // Always invalidate so session_detail re-fetches even if recompute partially failed
      try { window.dispatchEvent(new CustomEvent('workout-detail:invalidate')); } catch {}
      try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
      setRecomputing(false);
    }
  };

  // No interactive hydration path; assume data present during development

  // Strength and Mobility use dedicated component
  if (type === 'strength' || type === 'mobility') {
    if (sessionDetailLoading && !sd) {
      return (
        <div className="flex justify-center py-8" aria-busy="true" aria-label="Loading performance data">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      );
    }
    return <StrengthPerformanceSummary
      planned={planned}
      completed={completed}
      type={type as 'strength' | 'mobility'}
      sessionDetail={sd}
      onRecompute={recomputeAnalysis}
      recomputing={recomputing}
      recomputeError={recomputeError}
    />;
  }

  // Endurance (run/ride/swim) — all data comes from sd (session_detail_v1)

  return (
    <div className="w-full">
      {sessionDetailLoading && !hasSessionDetail && (
        <div className="flex justify-center py-8" aria-busy="true" aria-label="Loading performance data">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      )}

      {(() => {
        const race = sd?.race;
        if (!race?.is_goal_race) return null;
        const actualS = race.actual_seconds ?? null;
        const projS = race.fitness_projection_seconds ?? null;
        const goalS = race.goal_time_seconds ?? null;
        const ref = referenceMode ?? 'goal';
        const activeTarget = ref === 'projection' ? projS : goalS;
        const delta =
          activeTarget != null && actualS != null && Number.isFinite(activeTarget) && Number.isFinite(actualS)
            ? actualS - activeTarget
            : null;
        const beatTarget = delta != null && delta < 0;
        const fmt = (s: number | null | undefined) =>
          s != null && Number.isFinite(s) && s > 0 ? formatDuration(s) : '—';
        return (
          <div className="w-full pt-2 pb-3">
            <div className="mb-1 text-center text-xs text-gray-400 uppercase tracking-widest">
              Goal race · {race.event_name}
            </div>
            <div className="flex items-start justify-center gap-8 text-center">
              {goalS != null && (
                <div className="flex flex-col items-center">
                  <div className="text-sm font-semibold text-gray-100">{fmt(goalS)}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Goal</div>
                </div>
              )}
              {projS != null && (
                <div className="flex flex-col items-center">
                  <div className="text-sm font-semibold text-gray-100">
                    {race.fitness_projection_display ?? fmt(projS)}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Projected</div>
                </div>
              )}
              <div className="flex flex-col items-center">
                <div className="text-sm font-semibold text-gray-100">{fmt(actualS)}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Actual</div>
              </div>
            </div>
            {delta != null && (
              <div className="mt-3 text-center space-y-1">
                <div
                  className={`text-sm font-medium ${
                    beatTarget ? 'text-emerald-400' : 'text-white/60'
                  }`}
                >
                  {beatTarget
                    ? `${formatDuration(Math.abs(delta))} faster than ${ref === 'projection' ? 'projected' : 'goal'}`
                    : `${formatDuration(delta)} over ${ref === 'projection' ? 'projection' : 'goal'}`}
                </div>
                {beatTarget && ref === 'projection' && (
                  <div className="text-xs text-white/50">Ran faster than the model expected</div>
                )}
              </div>
            )}
          </div>
        );
      })()}
      <AdherenceChips
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        noPlannedCompare={noPlannedCompare}
        hideTopAdherence={hideTopAdherence || !!sd?.race?.is_goal_race}
      />


      {(() => {
        const race = sd?.race;
        if (!race?.is_goal_race) return null;
        const canProj = race.fitness_projection_seconds != null;
        const canGoal = race.goal_time_seconds != null;
        if (!canProj && !canGoal) return null;
        const ref = referenceMode ?? 'goal';
        return (
          <div className="w-full mb-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleModeToggle('projection')}
                disabled={!canProj}
                className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                  ref === 'projection' && canProj
                    ? 'border-white/30 bg-white/10'
                    : 'border-white/10 bg-white/[0.03]'
                } ${!canProj ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/8'}`}
              >
                <div className="text-sm font-medium text-gray-100">Projection</div>
                <div className="text-[11px] text-gray-500 leading-snug">Model from current fitness</div>
              </button>
              <button
                type="button"
                onClick={() => void handleModeToggle('goal')}
                disabled={!canGoal}
                className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                  ref === 'goal' && canGoal
                    ? 'border-white/30 bg-white/10'
                    : 'border-white/10 bg-white/[0.03]'
                } ${!canGoal ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/8'}`}
              >
                <div className={`text-sm font-medium ${!canGoal ? 'text-white/40' : 'text-gray-100'}`}>Goal</div>
                <div className="text-[11px] text-gray-500 leading-snug">
                  {canGoal ? 'Your target' : 'No goal set'}
                </div>
              </button>
            </div>
            {showProjectionTip && (
              <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-white/80">
                  Projection is what your current fitness suggested for this course. Goal is what you set before race
                  day.
                </p>
                <button
                  type="button"
                  onClick={dismissProjectionTip}
                  className="shrink-0 text-xs font-medium text-amber-200/90 hover:text-amber-100"
                >
                  Got it
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Execution score card is rendered in UnifiedWorkoutView strip to avoid duplication */}
      
      <EnduranceIntervalTable
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        useImperial={useImperial}
        noPlannedCompare={noPlannedCompare}
        goalRaceReferenceMode={referenceMode ?? 'goal'}
      />
      {!sd?.classification?.is_pool_swim && (
        <SessionNarrative
          sessionDetail={sd}
          hasSessionDetail={hasSessionDetail}
          noPlannedCompare={noPlannedCompare}
          planLinkNote={!planned ? 'No plan session linked.' : null}
          recomputing={recomputing}
          recomputeError={recomputeError}
          onRecompute={recomputeAnalysis}
        />
      )}
      {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
        <div className="py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-gray-800">Add‑ons</div>
            <div className="text-gray-900 space-y-1">
              {completed.addons.map((a:any, idx:number)=> (
                <div key={idx} className="flex items-center justify-between">
                  <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
                  <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


