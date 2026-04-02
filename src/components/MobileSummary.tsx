import React, { useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '../lib/supabase';
import StrengthPerformanceSummary from './StrengthPerformanceSummary';
import SessionNarrative from './SessionNarrative';
import EnduranceIntervalTable from './EnduranceIntervalTable';
import AdherenceChips from './AdherenceChips';

type MobileSummaryProps = {
  planned: any | null;
  completed: any | null;
  session_detail_v1?: Record<string, any> | null;
  onNavigateToContext?: (workoutId: string) => void;
};

export default function MobileSummary({ planned, completed, session_detail_v1, hideTopAdherence, onNavigateToContext }: MobileSummaryProps & { hideTopAdherence?: boolean }) {
  const { useImperial } = useAppContext();

  const sd = session_detail_v1;
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
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
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
      if (computeRes.error) console.warn('[recompute] compute-workout-analysis error:', computeRes.error);
      else console.log('[recompute] compute-workout-analysis ok');

      // Step 1b: session_load + facts (readiness / LOAD context); omitted before caused empty session_load after recompute
      console.log('[recompute] Step 1b: compute-facts for', workoutId);
      const factsRes = await supabase.functions.invoke('compute-facts', {
        body: { workout_id: workoutId },
      });
      if (factsRes.error) console.warn('[recompute] compute-facts error:', factsRes.error);
      else console.log('[recompute] compute-facts ok');

      // Step 2: Run the discipline-specific analysis (builds fact packet, narrative, etc.)
      console.log('[recompute] Step 2:', fnName, 'for', workoutId);
      const analyzeRes = await supabase.functions.invoke(fnName, {
        body: { workout_id: workoutId },
      });
      if (analyzeRes.error) {
        console.error('[recompute]', fnName, 'error:', analyzeRes.error);
        throw analyzeRes.error;
      }
      console.log('[recompute]', fnName, 'ok, data:', typeof analyzeRes.data === 'object' ? JSON.stringify(analyzeRes.data).slice(0, 200) : analyzeRes.data);

      // Invalidate workout-detail cache so session_detail_v1 is rebuilt
      try { window.dispatchEvent(new CustomEvent('workout-detail:invalidate')); } catch {}
      try { window.dispatchEvent(new CustomEvent('workouts:invalidate')); } catch {}
    } catch (e: any) {
      setRecomputeError(e?.message || String(e));
    } finally {
      setRecomputing(false);
    }
  };

  // No interactive hydration path; assume data present during development

  // Strength and Mobility use dedicated component
  if (type === 'strength' || type === 'mobility') {
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
      {/* Source line removed per UI request */}

      <AdherenceChips
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        noPlannedCompare={noPlannedCompare}
        hideTopAdherence={hideTopAdherence}
        onNavigateToContext={onNavigateToContext}
      />


      {/* Execution score card is rendered in UnifiedWorkoutView strip to avoid duplication */}
      
      <EnduranceIntervalTable
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        useImperial={useImperial}
        noPlannedCompare={noPlannedCompare}
        onNavigateToContext={onNavigateToContext}
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


