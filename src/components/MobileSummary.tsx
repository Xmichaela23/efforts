import React, { useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '../lib/supabase';
import StrengthPerformanceSummary from './StrengthPerformanceSummary';
import SessionNarrative from './SessionNarrative';
import EnduranceIntervalTable from './EnduranceIntervalTable';
import {
  type SessionInterpretationV1,
  planAssessmentLines,
} from '@/utils/performance-format';

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

/** Extract weekly intent from fact packet to explain plan context (e.g. "Week 10 • Race-specific work") */
function getWeeklyIntentLabel(completedSrc: any): string | null {
  try {
    const wa = completedSrc?.workout_analysis;
    const raw = (wa as any)?.fact_packet_v1 ?? (wa as any)?.factPacketV1 ?? null;
    const fp = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const plan = fp?.facts?.plan;
    if (!plan) return null;
    const weekNum = typeof plan?.week_number === 'number' ? plan.week_number : null;
    const focusLabel = typeof plan?.week_focus_label === 'string' && plan.week_focus_label ? String(plan.week_focus_label) : null;
    const phase = typeof plan?.phase === 'string' && plan.phase ? String(plan.phase) : null;
    const weekIntent = typeof plan?.week_intent === 'string' && plan.week_intent && plan.week_intent !== 'unknown' ? String(plan.week_intent) : null;
    const humanLabel = focusLabel || phase || (weekIntent ? weekIntent.charAt(0).toUpperCase() + weekIntent.slice(1) : null);
    if (!humanLabel) return null;
    if (weekNum != null) return `Week ${weekNum} • ${humanLabel}`;
    return humanLabel;
  } catch { return null; }
}

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
  const intervalDisplayReason: string | null = typeof intervalDisplay?.reason === 'string' ? intervalDisplay.reason : null;
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
  const waitingForCanonicalRows = !!planned && isStructuredIntervalSession && intervalDisplayMode === 'awaiting_recompute';
  const needsCanonicalHydration = !!planned && isStructuredIntervalSession && !hasCanonicalIntervalRows;
  const completedComputed = (completedSrc as any)?.computed;
  const overallForDisplay = (completedSrc as any)?.computed?.overall ?? {};
  const computedIntervals: any[] = Array.isArray(completedComputed?.intervals) 
    ? completedComputed.intervals 
    : [];
  const hasServerComputed = computedIntervals.length > 0;

  type MetricType = 'duration' | 'distance' | 'pace';

  // -------- Strict mode: if workout is attached to a plan, do NOT render client fallback. --------
  const isAttachedToPlan = !!planned && !!(planned as any)?.id;
  const [computeInvoked, setComputeInvoked] = useState(false);
  const [forceComputing, setForceComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        // Server now computes on attach; rely on polling below only
        // If we are viewing a planned row that is linked to a completed workout, but we didn't
        // receive the completed object here, trigger compute for that completed id.
        // no-op
      } catch {}
    })();
  }, [isAttachedToPlan, hasServerComputed, completed, computeInvoked]);

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

  // Detect sport for display formatting
  const sportType = String((completed?.type || planned?.type || '')).toLowerCase();
  const isRideSport = /ride|bike|cycling/.test(sportType);
  const isSwimSport = /swim/.test(sportType);

  return (
    <div className="w-full">
      {/* Source line removed per UI request */}

      {(() => {
        // Component adherence strip (pace / duration / distance)
        try {
          const isRunOrWalk = /run|walk/i.test(sportType);
          const isRide = /ride|bike|cycling/i.test(sportType);
          const isSwim = /swim/i.test(sportType);

          // ------------ RUN/WALK (existing behavior) ------------
          if (!isRide && !isSwim && isRunOrWalk) {

          // Planned totals
          const plannedSecondsTotal = (() => {
            // prefer computed.total_duration_seconds
            const t = Number((planned as any)?.computed?.total_duration_seconds);
            if (Number.isFinite(t) && t > 0) return t;
            // fallback: sum step durations
            const arr = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
            const s = arr.reduce((sum:number, st:any)=> sum + (Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0) || 0), 0);
            return s > 0 ? s : null;
          })();

          // Planned and executed session-averaged pace (strict, totals-based)
          const plannedPaceSecPerMi = (() => {
            const secondsTotal = (() => {
              const t = Number((planned as any)?.computed?.total_duration_seconds);
              if (Number.isFinite(t) && t>0) return t;
              const arr = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
              if (!arr.length) return null;
              const s = arr.reduce((sum:number, st:any)=> sum + (Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0) || 0), 0);
              return s>0 ? s : null;
            })();
            const metersTotal = (() => {
              const arr = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
              if (!arr.length) return null;
              let meters = 0;
              for (const st of arr) {
                const dm = Number(st?.distanceMeters || st?.distance_m || st?.m || 0);
                if (Number.isFinite(dm) && dm > 0) {
                  meters += dm;
                  continue;
                }
                // Derive distance for time-only steps when a planned pace exists
                const dur = Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0);
                if (!Number.isFinite(dur) || dur <= 0) continue;
                let paceSecPerMi: number | null = null;
                if (Number.isFinite(st?.pace_sec_per_mi as any) && (st as any).pace_sec_per_mi > 0) {
                  paceSecPerMi = Number((st as any).pace_sec_per_mi);
                } else {
                  try {
                    const txt = String(st?.paceTarget || st?.target_pace || st?.pace || '').trim();
                    if (txt) {
                      let m = txt.match(/(\d{1,2}):(\d{2})\s*\/(mi|mile)/i);
                      if (m) paceSecPerMi = parseInt(m[1],10)*60 + parseInt(m[2],10);
                      if (!paceSecPerMi) {
                        m = txt.match(/(\d{1,2}):(\d{2})\s*\/km/i);
                        if (m) paceSecPerMi = Math.round((parseInt(m[1],10)*60 + parseInt(m[2],10)) * 1.60934);
                      }
                    }
                  } catch {}
                }
                if (Number.isFinite(paceSecPerMi as any) && (paceSecPerMi as number) > 0) {
                  const miles = dur / (paceSecPerMi as number);
                  if (miles > 0) meters += miles * 1609.34;
                }
              }
              return meters > 0 ? Math.round(meters) : null;
            })();
            if (Number.isFinite(secondsTotal as any) && Number.isFinite(metersTotal as any) && (metersTotal as number) > 0) {
              const miles = (metersTotal as number) / 1609.34;
              if (miles > 0.01) return Math.round((secondsTotal as number) / miles);
            }
            return null;
          })();

          const plannedDistanceMeters = (() => {
            const arr = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
            let m = 0; for (const st of arr) { const dm = Number(st?.distanceMeters || st?.distance_m || st?.m || 0); if (Number.isFinite(dm) && dm>0) m += dm; }
            if (m > 0) return m;
            return null;
          })();

          // Executed totals
          const compOverall = (hydratedCompleted || completed)?.computed?.overall || {};
          const executedSeconds = (() => {
            // ONLY use moving time - no fallbacks
            const s = Number(compOverall?.duration_s_moving);
            return Number.isFinite(s) && s > 0 ? s : null;
          })();
          const executedMeters = (() => {
            const m = Number(compOverall?.distance_m);
            if (Number.isFinite(m) && m>0) return m;
            return null;
          })();
          // STRICT: use server-computed pace only (no client derivation)
          const executedSecPerMi = (() => {
            const v = Number(compOverall?.avg_pace_s_per_mi);
            return Number.isFinite(v) && v > 0 ? v : null;
          })();

          // Prefer session_detail_v1 (server contract); fallback to workout_analysis
          const workoutAnalysis = completedSrc?.workout_analysis;
          const granularAnalysis = workoutAnalysis?.granular_analysis;
          const ex = sd?.execution;
          const perf = completedSrc?.workout_analysis?.performance;
          const sessionState = completedSrc?.workout_analysis?.session_state_v1;

          let finalExecutionScore = hasSessionDetail && ex?.execution_score != null
            ? Math.round(ex.execution_score)
            : (Number.isFinite(perf?.execution_adherence) ? Math.round(perf.execution_adherence) : (Number.isFinite(sessionState?.glance?.execution_score) ? Math.round(sessionState.glance.execution_score) : null));
          const finalPacePct = hasSessionDetail && ex?.pace_adherence != null ? Math.round(ex.pace_adherence) : (Number.isFinite(perf?.pace_adherence) ? Math.round(perf.pace_adherence) : null);
          const finalDurationPct = hasSessionDetail && ex?.duration_adherence != null ? Math.round(ex.duration_adherence) : (Number.isFinite(perf?.duration_adherence) ? Math.round(perf.duration_adherence) : null);
          // Stale session_detail_v1: execution 0 while pace/duration are non-zero (ledger used to use `||` on execution_score)
          if (finalExecutionScore === 0) {
            const fromPerf = Number.isFinite(perf?.execution_adherence) ? Math.round(perf.execution_adherence) : null;
            if (fromPerf != null && fromPerf > 0) finalExecutionScore = fromPerf;
            else {
              const parts = [finalPacePct, finalDurationPct].filter((x): x is number => x != null && x > 0);
              if (parts.length > 0) {
                finalExecutionScore = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
              }
            }
          }
          const finalDistPct = null;
          const performanceAssessment = hasSessionDetail ? (ex?.performance_assessment ?? null) : (granularAnalysis?.performance_assessment ?? null);

          const anyVal = (finalPacePct != null && finalPacePct >= 0) || (finalDurationPct != null && finalDurationPct >= 0) || (finalDistPct != null) || (finalExecutionScore != null && finalExecutionScore >= 0);
          const allZeroAdherence = finalExecutionScore === 0 && finalPacePct === 0 && finalDurationPct === 0;

          if (noPlannedCompare) return null;

          const planModified = hasSessionDetail ? (ex?.assessed_against === 'actual') : (() => {
            try {
              const wa = completedSrc?.workout_analysis;
              const raw = (wa as any)?.fact_packet_v1 ?? (wa as any)?.factPacketV1 ?? null;
              const fp = typeof raw === 'string' ? JSON.parse(raw) : raw;
              return String(fp?.derived?.execution?.assessed_against || '').toLowerCase() === 'actual';
            } catch { return false; }
          })();
          if (planModified) return null;

          if (hasSessionDetail && sd?.display?.show_adherence_chips === false) return null;
          if (allZeroAdherence) return null;
          if (!anyVal || hideTopAdherence) return null;

          const chip = (label:string, pct:number|null, text:string, metricType: MetricType) => {
            if (pct==null) return null;
            void metricType;
            return (
              <div className="flex flex-col items-center px-2">
                <div className="text-sm font-semibold text-gray-100">{pct}%</div>
                <div className="text-[12px] text-gray-300">{label}</div>
                <div className="text-[12px] text-gray-400">{text}</div>
              </div>
            );
          };

          const fmtDeltaTime = (s:number) => {
            const sign = s>=0 ? '+' : '−'; const v = Math.abs(Math.round(s));
            const m = Math.floor(v/60); const ss = v%60; return `${sign}${m}:${String(ss).padStart(2,'0')}`;
          };
          
          // Use legacy duration delta that already works
          const finalDurationDelta = null; // Will be calculated from granular analysis
          const fmtDeltaPace = (s:number) => {
            const faster = s>0; const v = Math.abs(s); const m = Math.floor(v/60); const ss = Math.round(v%60);
            return `${m?`${m}m `:''}${ss}s/mi ${faster? 'faster' : 'slower'}`.trim();
          };
          const fmtDeltaMi = (mi:number) => {
            const sign = mi>=0 ? '+' : '−'; const v = Math.abs(mi);
            const val = v < 0.95 ? v.toFixed(1) : v.toFixed(0);
            return `${sign}${val} mi`;
          };

          // Adherence chips only; summary (technical_insights + plan_impact) is rendered below the intervals table
          const adherenceSummary = completedSrc?.workout_analysis?.adherence_summary;
          const weeklyIntentLabel = getWeeklyIntentLabel(completedSrc);

          return (
            <div className="w-full pt-1 pb-2">
              {/* Weekly intent: explain plan context so grades make sense (e.g. shorter run vs planned) */}
              {weeklyIntentLabel && (
                <div className="mb-2 text-center text-xs text-gray-400">
                  {weeklyIntentLabel}
                </div>
              )}
              {/* Adherence scores */}
              <div className="flex items-center justify-center gap-6 text-center mb-3">
                <div className="flex items-end gap-3">
                  {chip('Execution', finalExecutionScore, 
                       performanceAssessment ? `${performanceAssessment} Performance` : 'Overall adherence', 'pace')}
                  {chip('Duration', finalDurationPct, 
                       'Time adherence', 'duration')}
                  {chip('Pace', finalPacePct,
                       isStructuredIntervalSession ? 'Blended interval pace' : 'Pace adherence', 'pace')}
                </div>
              </div>

              {hasSessionDetail &&
                sd?.session_interpretation &&
                (() => {
                  const pa = planAssessmentLines(sd.session_interpretation);
                  if (pa.length === 0) return null;
                  return (
                    <div className="px-2 mb-2 max-w-lg mx-auto text-center space-y-1">
                      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Plan assessment</div>
                      {pa.map((line, i) => (
                        <p key={i} className="text-sm text-gray-300 leading-snug">{line}</p>
                      ))}
                    </div>
                  );
                })()}
              
              {/* View in Context link — above table */}
              {onNavigateToContext && completedSrc?.id && (
                <div className="text-center mb-2">
                  <button
                    onClick={() => onNavigateToContext(completedSrc.id)}
                    className="text-sm text-gray-200 hover:text-white transition-colors underline underline-offset-2"
                  >
                    View context
                  </button>
                </div>
              )}
            </div>
          );
          }

          // ------------ SWIM (session-average per-100 pace + duration) - OPEN WATER ONLY ------------
          if (isSwim && !isPoolSwim) {
            if (noPlannedCompare) return null;
            // Planned totals
            const plannedSecondsTotal = (() => {
              const t = Number((planned as any)?.computed?.total_duration_seconds);
              if (Number.isFinite(t) && t > 0) return t;
              const arr = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
              const s = arr.reduce((sum:number, st:any)=> sum + (Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0) || 0), 0);
              return s > 0 ? s : null;
            })();

            const swimUnit = String((planned as any)?.swim_unit || 'yd').toLowerCase();

            // Planned per-100 seconds (prefer baselines, else duration‑weighted from steps, else derive from distance+time)
            const plannedPer100 = (() => {
              const fromBaseline = Number((planned as any)?.baselines_template?.swim_pace_per_100_sec ?? (planned as any)?.baselines?.swim_pace_per_100_sec);
              if (Number.isFinite(fromBaseline) && (fromBaseline as number) > 0) return Math.round(fromBaseline as number);
              const steps = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
              let sum = 0; let w = 0;
              for (const st of steps) {
                const dur = Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0);
                let p100: number | null = null;
                if (typeof (st as any)?.swim_pace_sec_per_100 === 'number') p100 = Number((st as any).swim_pace_sec_per_100);
                const rng = (st as any)?.swim_pace_range_per_100;
                if (p100 == null && rng && typeof rng.lower === 'number' && typeof rng.upper === 'number') {
                  p100 = Math.round(((rng.lower as number) + (rng.upper as number)) / 2);
                }
                if (Number.isFinite(p100 as any) && (p100 as number) > 0 && Number.isFinite(dur) && dur > 0) { sum += (p100 as number) * dur; w += dur; }
              }
              if (w > 0) return Math.round(sum / w);
              // Derive from planned distance and time
              const distM = (() => {
                const arr = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
                let m = 0; for (const st of arr) { const dm = Number(st?.distanceMeters || st?.distance_m || st?.m || 0); if (Number.isFinite(dm) && dm>0) m += dm; }
                return m > 0 ? m : null;
              })();
              if (plannedSecondsTotal && distM) {
                const denom = swimUnit === 'yd' ? ((distM as number)/0.9144)/100 : ((distM as number)/100);
                if (denom > 0) return Math.round((plannedSecondsTotal as number) / denom);
              }
              return null;
            })();

            // Executed totals
            const compOverall = (hydratedCompleted || completed)?.computed?.overall || {};
            const executedSeconds = (() => {
              // ONLY use moving time - no fallbacks
              const s = Number(compOverall?.duration_s_moving);
              return Number.isFinite(s) && s > 0 ? s : null;
            })();
            const executedMeters = (() => {
              const m = Number(compOverall?.distance_m);
              if (Number.isFinite(m) && m>0) return m;
              const km = Number((hydratedCompleted || completed)?.distance);
              return Number.isFinite(km) && km>0 ? Math.round(km * 1000) : null;
            })();
            const executedPer100 = (() => {
              if (Number.isFinite(executedSeconds as any) && (executedSeconds as number) > 0 && Number.isFinite(executedMeters as any) && (executedMeters as number) > 0) {
                const denom = swimUnit === 'yd' ? (((executedMeters as number)/0.9144)/100) : (((executedMeters as number)/100));
                if (denom > 0) return Math.round((executedSeconds as number) / denom);
              }
              return null;
            })();

            const pacePct = (plannedPer100 && executedPer100) ? Math.round((plannedPer100 / executedPer100) * 100) : null;
            const paceDeltaSec = (plannedPer100 && executedPer100) ? (plannedPer100 - executedPer100) : null; // + is faster
            const durationPct = (plannedSecondsTotal && executedSeconds) ? Math.round((executedSeconds as number / (plannedSecondsTotal as number)) * 100) : null;
            const durationDelta = (plannedSecondsTotal && executedSeconds) ? ((executedSeconds as number) - (plannedSecondsTotal as number)) : null;

            const chip = (label:string, pct:number|null, text:string, metricType: MetricType) => {
              if (pct==null) return null;
            void metricType;
              return (
                <div className="flex flex-col items-center px-2">
                <div className="text-sm font-semibold text-gray-100">{pct}%</div>
                  <div className="text-[11px] text-gray-700">{label}</div>
                  <div className="text-[11px] text-gray-600">{text}</div>
                </div>
              );
            };
            const fmtDeltaTime = (s:number) => { const sign = s>=0 ? '+' : '−'; const v = Math.abs(Math.round(s)); const m=Math.floor(v/60); const ss=v%60; return `${sign}${m}:${String(ss).padStart(2,'0')}`; };
            const fmtDeltaPer100 = (s:number) => { const faster = s>0; const v = Math.abs(s); const m=Math.floor(v/60); const ss=Math.round(v%60); return `${m?`${m}m `:''}${ss}s/${swimUnit==='yd'?'100yd':'100m'} ${faster? 'faster' : 'slower'}`.trim(); };

            // Use server-computed metrics only (no local execution fallback)
            const performance = completedSrc?.workout_analysis?.performance;
            const sessionState = completedSrc?.workout_analysis?.session_state_v1;
            let executionScore = Number.isFinite(performance?.execution_adherence)
              ? Math.round(performance.execution_adherence)
              : (Number.isFinite(sessionState?.glance?.execution_score) ? Math.round(sessionState.glance.execution_score) : null);
            // ✅ FIX: Only use server-side granular analysis, no fallback to client calculations
            const paceAdherence = Number.isFinite(performance?.pace_adherence)
              ? Math.round(performance.pace_adherence)
              : null;
            const durationAdherence = Number.isFinite(performance?.duration_adherence)
              ? Math.round(performance.duration_adherence)
              : null;
            if (executionScore === 0) {
              const fromPerf = Number.isFinite(performance?.execution_adherence) ? Math.round(performance.execution_adherence) : null;
              if (fromPerf != null && fromPerf > 0) executionScore = fromPerf;
              else {
                const parts = [paceAdherence, durationAdherence].filter((x): x is number => x != null && x > 0);
                if (parts.length > 0) {
                  executionScore = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
                }
              }
            }
            
            // ✅ FIX: Check for any valid values (including 0, but not null)
            const anyVal = (paceAdherence != null && paceAdherence >= 0) || 
                          (durationAdherence != null && durationAdherence >= 0) || 
                          (executionScore != null && executionScore >= 0);
            if (!anyVal) return null;

            const weeklyIntentLabel = getWeeklyIntentLabel(completedSrc);

            return (
              <div className="w-full pt-1 pb-2">
                {weeklyIntentLabel && (
                  <div className="mb-2 text-center text-xs text-gray-400">
                    {weeklyIntentLabel}
                  </div>
                )}
                {/* Adherence scores */}
                <div className="flex items-center justify-center gap-6 text-center mb-3">
                  <div className="flex items-end gap-3">
                    {chip('Execution', executionScore, 'Overall adherence', 'pace')}
                    {chip('Pace', paceAdherence, paceDeltaSec!=null ? fmtDeltaPer100(paceDeltaSec) : '—', 'pace')}
                    {chip('Duration', durationAdherence, durationDelta!=null ? fmtDeltaTime(durationDelta) : '—', 'duration')}
                  </div>
                </div>
                
                {/* View in Context link */}
                {onNavigateToContext && completedSrc?.id && (
                  <div className="text-center">
                    <button
                      onClick={() => onNavigateToContext(completedSrc.id)}
                    className="text-sm text-black hover:text-gray-600 transition-colors"
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: '15px',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      padding: 0
                    }}
                  >
                    View context
                    </button>
                  </div>
                )}
              </div>
            );
          }

          // ------------ BIKE/RIDE (smart server, dumb client - same as running) ------------
          if (isRide) {
            if (noPlannedCompare) return null;
            const perfRide = completedSrc?.workout_analysis?.performance;
            const exRide = sd?.execution;
            let executionAdherence = hasSessionDetail && exRide?.execution_score != null
              ? Math.round(exRide.execution_score)
              : (Number.isFinite(perfRide?.execution_adherence) ? Math.round(perfRide.execution_adherence) : null);
            const powerAdherence = hasSessionDetail && exRide?.power_adherence != null
              ? Math.round(exRide.power_adherence)
              : (Number.isFinite(perfRide?.power_adherence) ? Math.round(perfRide.power_adherence) : null);
            const durationAdherence = hasSessionDetail && exRide?.duration_adherence != null
              ? Math.round(exRide.duration_adherence)
              : (Number.isFinite(perfRide?.duration_adherence) ? Math.round(perfRide.duration_adherence) : null);
            if (executionAdherence === 0) {
              const fromPerf = Number.isFinite(perfRide?.execution_adherence) ? Math.round(perfRide.execution_adherence) : null;
              if (fromPerf != null && fromPerf > 0) executionAdherence = fromPerf;
              else {
                const parts = [powerAdherence, durationAdherence].filter((x): x is number => x != null && x > 0);
                if (parts.length > 0) {
                  executionAdherence = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
                }
              }
            }
            
            // Calculate deltas for display only (not for adherence %)
            const plannedSecondsTotal = (() => {
              const t = Number((planned as any)?.computed?.total_duration_seconds);
              if (Number.isFinite(t) && t > 0) return t;
              const arr = Array.isArray((planned as any)?.computed?.steps) ? (planned as any).computed.steps : [];
              const s = arr.reduce((sum:number, st:any)=> sum + (Number(st?.seconds || st?.duration || st?.duration_sec || st?.durationSeconds || 0) || 0), 0);
              return s > 0 ? s : null;
            })();

            const compOverall = (hydratedCompleted || completed)?.computed?.overall || {};
            const executedSeconds = (() => {
              const s = Number(compOverall?.duration_s_moving);
              return Number.isFinite(s) && s > 0 ? s : null;
            })();
            const durationDelta = (plannedSecondsTotal && executedSeconds) ? ((executedSeconds as number) - (plannedSecondsTotal as number)) : null;

            const chip = (label:string, pct:number|null, text:string, metricType: MetricType) => {
              if (pct==null) return null;
              void metricType;
              return (
                <div className="flex flex-col items-center px-2">
                  <div className="text-sm font-semibold text-gray-100">{pct}%</div>
                  <div className="text-[11px] text-gray-700">{label}</div>
                  <div className="text-[11px] text-gray-600">{text}</div>
                </div>
              );
            };
            const fmtDeltaTime = (s:number) => { const sign = s>=0 ? '+' : '−'; const v = Math.abs(Math.round(s)); const m=Math.floor(v/60); const ss=v%60; return `${sign}${m}:${String(ss).padStart(2,'0')}`; };

            // ✅ FIX: Check for any valid server-computed values
            const anyVal = (executionAdherence != null && executionAdherence >= 0) ||
                          (powerAdherence != null && powerAdherence >= 0) ||
                          (durationAdherence != null && durationAdherence >= 0);
            if (!anyVal) return null;

            const weeklyIntentLabel = getWeeklyIntentLabel(completedSrc);

            return (
              <div className="w-full pt-1 pb-2">
                {weeklyIntentLabel && (
                  <div className="mb-2 text-center text-xs text-gray-400">
                    {weeklyIntentLabel}
                  </div>
                )}
                {/* Adherence scores - all from server */}
                <div className="flex items-center justify-center gap-6 text-center mb-3">
                  <div className="flex items-end gap-3">
                    {chip('Execution', executionAdherence, 'Overall adherence', 'pace')}
                    {chip('Power', powerAdherence, 'Time in range', 'pace')}
                    {chip('Duration', durationAdherence, durationDelta!=null ? fmtDeltaTime(durationDelta) : '—', 'duration')}
                  </div>
                </div>
                
                {/* View in Context link */}
                {onNavigateToContext && completedSrc?.id && (
                  <div className="text-center">
                    <button
                      onClick={() => onNavigateToContext(completedSrc.id)}
                    className="text-sm text-black hover:text-gray-600 transition-colors"
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 400,
                      fontSize: '15px',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      padding: 0
                    }}
                  >
                    View context
                    </button>
                  </div>
                )}
              </div>
            );
          }

          return null;
        } catch { return null; }
      })()}

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
          completedSrc={completedSrc}
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






