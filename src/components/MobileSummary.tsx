import React, { useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '../lib/supabase';
import StrengthPerformanceSummary from './StrengthPerformanceSummary';
import SessionNarrative from './SessionNarrative';
import EnduranceIntervalTable from './EnduranceIntervalTable';
import AdherenceChips from './AdherenceChips';
import type { SessionInterpretationV1 } from '@/utils/performance-format';

type MobileSummaryProps = {
  planned: any | null;
  completed: any | null;
  session_detail_v1?: {
    execution?: { execution_score?: number | null; pace_adherence?: number | null; power_adherence?: number | null; duration_adherence?: number | null; performance_assessment?: string | null; assessed_against?: string | null; status_label?: string | null };
    observations?: string[];
    narrative_text?: string | null;
    intervals?: Array<{ id: string; interval_type: string; planned_label: string; planned_duration_s: number | null; executed: { duration_s: number | null; distance_m: number | null; avg_hr: number | null; actual_pace_sec_per_mi?: number | null }; pace_adherence_pct?: number | null; duration_adherence_pct?: number | null }>;
    display?: { show_adherence_chips?: boolean; interval_display_reason?: string | null; has_measured_execution?: boolean };
    plan_context?: { planned_id?: string | null; planned?: unknown | null; match?: { summary?: string } | null };
    session_interpretation?: SessionInterpretationV1;
  } | null;
  onNavigateToContext?: (workoutId: string) => void;
};

export default function MobileSummary({ planned, completed, session_detail_v1, hideTopAdherence, onNavigateToContext }: MobileSummaryProps & { hideTopAdherence?: boolean }) {
  const { useImperial } = useAppContext();

  // Prefer session_detail_v1 (server contract) over workout_analysis (raw) when available
  const sd = session_detail_v1;
  const hasSessionDetail = !!sd;
  // Prefer server snapshot from completed.computed when available
  const serverPlannedLight: any[] = Array.isArray((completed as any)?.computed?.planned_steps_light) ? (completed as any).computed.planned_steps_light : [];
  const hasServerPlanned = serverPlannedLight.length > 0;
  // When there is no planned session attached, still allow an "analysis-only" view for supported disciplines.
  // This is required for unplanned rides/runs: we should still be able to generate and display analysis.
  const noPlannedCompare = !planned && !hasServerPlanned;
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

  const type = String((planned as any)?.type || (completed as any)?.type || '').toLowerCase();
  const isRidePlanned = /ride|bike|cycling/.test(type);
  const refinedType = String((completed as any)?.refined_type || '').toLowerCase();
  const isPoolSwim = refinedType === 'pool_swim' || (type === 'swim' && refinedType !== 'open_water_swim');
  // Completed data used for computations (assumed present in development/clean data)
  const [hydratedCompleted, setHydratedCompleted] = useState<any>(completed);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  useEffect(() => {
    setHydratedCompleted(completed);
    setRecomputeError(null);
    setRecomputing(false);
  }, [completed]);

  const recomputeAnalysis = async () => {
    const src = hydratedCompleted || completed;
    const workoutId = String((src as any)?.id || '');
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

      const { data: refreshed, error: wErr } = await supabase
        .from('workouts')
        .select('id,computed,workout_analysis,analysis_status,analyzed_at')
        .eq('id', workoutId)
        .maybeSingle();
      if (wErr) throw wErr;
      if (refreshed) {
        const normalized: any = { ...(refreshed as any) };
        try {
          if (typeof normalized.workout_analysis === 'string') {
            normalized.workout_analysis = JSON.parse(normalized.workout_analysis);
          }
        } catch {}
        setHydratedCompleted((prev: any) => ({ ...(prev || {}), ...(normalized as any) }));
      }

      // Invalidate workout-detail cache so session_detail_v1 is rebuilt from
      // the fresh workout_analysis (useWorkoutDetail listens for both events)
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
    return <StrengthPerformanceSummary planned={planned} completed={completed} type={type as 'strength' | 'mobility'} />;
  }

  // Endurance (run/ride/swim)
  // Read intervals from computed.intervals (single source of truth)
  // These intervals include both executed data AND granular_metrics from analyze-{discipline}-workout
  const completedSrc: any = hydratedCompleted || completed;
  const sessionState: any = (completedSrc as any)?.workout_analysis?.session_state_v1 ?? null;
  const intervalDisplay: any = sessionState?.details?.interval_display ?? null;
  const intervalDisplayMode: string | null = typeof intervalDisplay?.mode === 'string' ? intervalDisplay.mode : null;
  const sessionIntervalRows: any[] = Array.isArray(sessionState?.details?.interval_rows)
    ? sessionState.details.interval_rows
    : [];
  const hasCanonicalIntervalRows = !!planned && sessionIntervalRows.length > 0;
  const isStructuredIntervalSession = (() => {
    if (intervalDisplayMode === 'interval_compare_ready') return true;
    if (intervalDisplayMode === 'overall_only') return false;
    if (intervalDisplayMode === 'awaiting_recompute') return true;
    if (!intervalDisplayMode) return false;
    const pSteps: any[] = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
    const workSteps = pSteps.filter((s: any) => s?.kind === 'work' || s?.type === 'work' || s?.kind === 'interval');
    return workSteps.length >= 2;
  })();
  const needsCanonicalHydration = !!planned && isStructuredIntervalSession && !hasCanonicalIntervalRows;
  const completedComputed = (completedSrc as any)?.computed;
  const computedIntervals: any[] = Array.isArray(completedComputed?.intervals) 
    ? completedComputed.intervals 
    : [];
  const hasServerComputed = computedIntervals.length > 0;

  const isAttachedToPlan = !!planned && !!(planned as any)?.id;

  // Poll for server-computed after invoke (or when attached without data)
  useEffect(() => {
    let cancelled = false;
    if (!isAttachedToPlan || (!needsCanonicalHydration && hasServerComputed) || !(completed as any)?.id) return;
    let tries = 0;
    const maxTries = 10;
    const tick = async () => {
      try {
        const { data } = await supabase
          .from('workouts')
          .select('computed,workout_analysis,analysis_status,analyzed_at')
          .eq('id', (completed as any).id)
          .maybeSingle();
        const compd = (data as any)?.computed;
        const waRaw = (data as any)?.workout_analysis;
        const wa = typeof waRaw === 'string' ? (() => { try { return JSON.parse(waRaw); } catch { return waRaw; } })() : waRaw;
        if (!cancelled && compd && Array.isArray(compd?.intervals) && compd.intervals.length) {
          setHydratedCompleted((prev:any) => ({
            ...(prev || completed),
            computed: compd,
            workout_analysis: wa ?? (prev as any)?.workout_analysis,
            analysis_status: (data as any)?.analysis_status ?? (prev as any)?.analysis_status,
            analyzed_at: (data as any)?.analyzed_at ?? (prev as any)?.analyzed_at,
          }));
          return; // stop polling
        }
      } catch {}
      tries += 1;
      if (!cancelled && tries < maxTries) setTimeout(tick, 1500);
    };
    setTimeout(tick, 1200);
    return () => { cancelled = true; };
  }, [isAttachedToPlan, hasServerComputed, completed, needsCanonicalHydration]);

  // Poll path when only planned has a completed_workout_id
  useEffect(() => {
    let cancelled = false;
    const cid = (planned as any)?.completed_workout_id ? String((planned as any).completed_workout_id) : null;
    if (!isAttachedToPlan || (!needsCanonicalHydration && hasServerComputed) || !cid) return;
    let tries = 0;
    const maxTries = 10;
    const tick = async () => {
      try {
        const { data } = await supabase
          .from('workouts')
          .select('computed,workout_analysis,analysis_status,analyzed_at')
          .eq('id', cid)
          .maybeSingle();
        const compd = (data as any)?.computed;
        const waRaw = (data as any)?.workout_analysis;
        const wa = typeof waRaw === 'string' ? (() => { try { return JSON.parse(waRaw); } catch { return waRaw; } })() : waRaw;
        if (!cancelled && compd && Array.isArray(compd?.intervals) && compd.intervals.length) {
          setHydratedCompleted((prev:any) => ({
            ...(prev || {}),
            id: cid,
            computed: compd,
            workout_analysis: wa ?? (prev as any)?.workout_analysis,
            analysis_status: (data as any)?.analysis_status ?? (prev as any)?.analysis_status,
            analyzed_at: (data as any)?.analyzed_at ?? (prev as any)?.analyzed_at,
          }));
          return;
        }
      } catch {}
      tries += 1;
      if (!cancelled && tries < maxTries) setTimeout(tick, 1500);
    };
    setTimeout(tick, 1200);
    return () => { cancelled = true; };
  }, [isAttachedToPlan, hasServerComputed, planned, needsCanonicalHydration]);

  const sportType = String((completed?.type || planned?.type || '')).toLowerCase();

  return (
    <div className="w-full">
      {/* Source line removed per UI request */}

      <AdherenceChips
        planned={planned}
        completedSrc={completedSrc}
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        sportType={sportType}
        isPoolSwim={isPoolSwim}
        isStructuredIntervalSession={isStructuredIntervalSession}
        noPlannedCompare={noPlannedCompare}
        hideTopAdherence={hideTopAdherence}
        onNavigateToContext={onNavigateToContext}
      />


      {/* Execution score card is rendered in UnifiedWorkoutView strip to avoid duplication */}
      
      <EnduranceIntervalTable
        planned={planned}
        completedSrc={completedSrc}
        sessionDetail={sd}
        hasSessionDetail={hasSessionDetail}
        type={type}
        isPoolSwim={isPoolSwim}
        isRidePlanned={isRidePlanned}
        useImperial={useImperial}
        noPlannedCompare={noPlannedCompare}
        serverPlannedLight={serverPlannedLight}
        hasServerPlanned={hasServerPlanned}
        onNavigateToContext={onNavigateToContext}
      />
      {!isPoolSwim && (
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


