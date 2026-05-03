import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '../lib/supabase';
import StrengthPerformanceSummary from './StrengthPerformanceSummary';
import SessionNarrative from './SessionNarrative';
import EnduranceIntervalTable from './EnduranceIntervalTable';
import AdherenceChips from './AdherenceChips';
import { formatDuration } from '@/utils/workoutFormatting';

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

  useEffect(() => {
    setRecomputeError(null);
    setRecomputing(false);
  }, [completed]);

  const recomputeAnalysis = async () => {
    const workoutId = String(sd?.workout_id || (completed as any)?.id || '');
    if (!workoutId) return;

    try {
      setRecomputing(true);
      setRecomputeError(null);

      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) console.warn('[MobileSummary] recompute getSession:', sessionErr);
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('Not signed in');
      }

      const res = await supabase.functions.invoke('recompute-workout', {
        body: { workout_id: workoutId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.error) {
        throw new Error(res.error.message);
      }

      const result = res.data as {
        ok: boolean;
        stale: boolean;
        steps: string[];
        error?: string;
        code?: string;
      };

      if (result.ok) {
        try {
          window.dispatchEvent(new CustomEvent('workout-detail:invalidate'));
          window.dispatchEvent(new CustomEvent('workouts:invalidate'));
        } catch (e) {
          console.warn('[MobileSummary] recompute: invalidate dispatch failed:', e);
        }
        if (result.stale) {
          console.warn('[MobileSummary] recompute partial success, steps:', result.steps);
        }
      } else {
        throw new Error(result.error ?? 'Recompute failed');
      }
    } catch (e: unknown) {
      setRecomputeError(typeof e === 'string' ? e : (e as Error)?.message || String(e));
    } finally {
      setRecomputing(false);
    }
  };

  // No interactive hydration path; assume data present during development

  // Strength and Mobility — show plan vs completed immediately; session_detail enriches RIR/adherence (may be slow).
  if (type === 'strength' || type === 'mobility') {
    return (
      <div className="w-full space-y-2">
        {sessionDetailLoading && !sd && (
          <div className="text-xs text-white/50 px-0.5" aria-live="polite">
            Loading performance analysis…
          </div>
        )}
        <StrengthPerformanceSummary
          planned={planned}
          completed={completed}
          type={type as 'strength' | 'mobility'}
          sessionDetail={sd}
          onRecompute={recomputeAnalysis}
          recomputing={recomputing}
          recomputeError={recomputeError}
        />
      </div>
    );
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
          </div>
        );
      })()}
      <AdherenceChips
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        noPlannedCompare={noPlannedCompare}
        hideTopAdherence={hideTopAdherence || !!sd?.race?.is_goal_race}
      />


      {/* Execution score card is rendered in UnifiedWorkoutView strip to avoid duplication */}
      {/* Goal race: no segments table — summary times + debrief only */}
      {!sd?.race?.is_goal_race && (
        <EnduranceIntervalTable
          sessionDetail={sd}
          hasSessionDetail={hasSessionDetail}
          useImperial={useImperial}
          noPlannedCompare={noPlannedCompare}
        />
      )}
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


