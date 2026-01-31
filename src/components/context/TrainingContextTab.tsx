/**
 * =============================================================================
 * TRAINING CONTEXT TAB
 * =============================================================================
 * 
 * Main component for the Training Context screen
 * Displays comprehensive training context including:
 * - ACWR gauge with status
 * - 7-day training load chart
 * - Sport breakdown
 * - Smart insights
 * - 14-day activity timeline
 * 
 * Replaces the old WeeklyAnalysisTab
 */

import React from 'react';
import { Loader2, RefreshCw, AlertCircle, Target, Activity, Dumbbell, TrendingUp } from 'lucide-react';
import { useTrainingContext } from '@/hooks/useTrainingContext';
import { ACWRGauge } from './ACWRGauge';
import { TrainingLoadChart } from './TrainingLoadChart';
import { SportBreakdown } from './SportBreakdown';
import { SmartInsights } from './SmartInsights';
import { ActivityTimeline } from './ActivityTimeline';

interface TrainingContextTabProps {
  date?: string; // Defaults to today
  onSelectWorkout?: (workout: any) => void;
}

export const TrainingContextTab: React.FC<TrainingContextTabProps> = ({ date, onSelectWorkout }) => {
  // Default to today if no date provided
  const focusDate = date || new Date().toLocaleDateString('en-CA');
  
  const { data, loading, error, refresh } = useTrainingContext(focusDate);

  // Loading state
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/60">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <div className="text-sm">Loading training context...</div>
      </div>
    );
  }

  // Error state
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

  // No data state
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/60">
        <div className="text-sm">No training data available</div>
        <div className="text-xs text-white/40 mt-2">Complete some workouts to see your training context</div>
      </div>
    );
  }

  // Plan-aware ACWR label: on build/baseline/peak weeks, show "Below Base" instead of "undertrained"
  const hasActivePlan = !!data.acwr.plan_context?.hasActivePlan;
  const weekIntent = data.acwr.plan_context?.weekIntent;
  const isBuildBaselinePeak = weekIntent === 'build' || weekIntent === 'baseline' || weekIntent === 'peak';
  const acwrStatusLabel = hasActivePlan && isBuildBaselinePeak && data.acwr.status === 'undertrained'
    ? 'Below Base'
    : data.acwr.status.replace('_', ' ');

  // Human-centric status and coaching copy for Training Stability
  const heartLungsStatus = (() => {
    if (data.weekly_verdict) {
      if (data.weekly_verdict.label === 'high') return 'Fresh';
      if (data.weekly_verdict.label === 'medium') return 'Stable';
      return 'Tired';
    }
    const trend = data.weekly_readiness?.recent_form_trend;
    if (trend === 'worsening') return 'Tired';
    if (trend === 'improving') return 'Fresh';
    return 'Stable';
  })();
  const heartLungsCopy: Record<string, string> = {
    Fresh: 'Your heart is working efficiently; your engine is ready for today\'s work.',
    Stable: 'Your heart is holding steady; you can complete planned sessions with normal effort.',
    Tired: 'Based on your last runs, your heart is working harder than usual. Keep effort easy to let your engine catch up.',
  };

  const rir = data.structural_load?.avg_rir_acute;
  const muscleJointsStatus = rir == null
    ? 'Fresh'
    : rir >= 2
      ? 'Fresh'
      : rir >= 1
        ? 'Loaded'
        : 'Recovering';
  const muscleJointsCopy: Record<string, string> = {
    Fresh: 'Your recent lifting wasn\'t to failure; your legs are ready for impact.',
    Loaded: 'Some fatigue from recent strength work; easy running is fine, watch intensity on key days.',
    Recovering: 'Your recent lifting was close to failure; prioritize easy movement and let your legs recover.',
  };

  const burnoutRiskStatus = (acwrStatusLabel === 'Below Base' || data.acwr.status === 'undertrained' || data.acwr.status === 'recovery' || data.acwr.status === 'optimal_recovery')
    ? 'Low'
    : data.acwr.status === 'optimal'
      ? 'Good'
      : data.acwr.status === 'elevated'
        ? 'Elevated'
        : 'High';
  const burnoutRiskCopy: Record<string, string> = {
    Low: 'You aren\'t adding mileage too fast for your current base.',
    Good: 'Your training load is in a safe progression zone.',
    Elevated: 'Volume is building; prioritize recovery and sleep.',
    High: 'Back off slightly to reduce injury and illness risk.',
  };

  const verdictPermission = data.weekly_verdict
    ? (data.weekly_verdict.label === 'high' ? 'Good to go.' : data.weekly_verdict.label === 'medium' ? 'Proceed with caution.' : 'Prioritize recovery.')
    : null;

  return (
    <div className="space-y-3 pb-6">
      {/* Cockpit strip (matches dashboard week strip language) */}
      <div
        className="flex items-center justify-between relative"
        style={{
          backgroundColor: '#000000',
          padding: '0.55rem 0.75rem',
          borderRadius: '10px',
          border: '0.5px solid rgba(255, 255, 255, 0.12)',
          backgroundImage: `
            radial-gradient(ellipse at 18% 0%, rgba(255, 255, 255, 0.16) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 45%, rgba(255, 255, 255, 0.06) 0%, transparent 62%),
            linear-gradient(45deg, rgba(255,255,255,0.18) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.14) 1px, transparent 1px),
            linear-gradient(45deg, rgba(255,255,255,0.08) 1px, transparent 1px),
            linear-gradient(-45deg, rgba(255,255,255,0.06) 1px, transparent 1px)
          `,
          backgroundSize: 'cover, cover, 26px 26px, 26px 26px, 52px 52px, 52px 52px',
          backgroundPosition: 'center, center, center, center, center, center',
          backgroundBlendMode: 'screen, screen, soft-light, soft-light, soft-light, soft-light',
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.05) inset,
            inset 0 1px 0 rgba(255,255,255,0.18),
            inset -1px -1px 0 rgba(0,0,0,0.35),
            0 8px 18px rgba(0,0,0,0.45),
            0 0 22px rgba(255,255,255,0.06),
            0 0 22px rgba(255,215,0,0.06),
            0 0 26px rgba(74,158,255,0.05)
          `,
        }}
      >
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.40)' }}>
            Week
          </span>
          <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>
            Training Context
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className={`p-2 rounded-lg transition-colors ${
            loading
              ? 'text-white/30 cursor-not-allowed'
              : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          title="Refresh context"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Smart Insights (show at top if any) */}
      {data.insights && data.insights.length > 0 && (
        <SmartInsights insights={data.insights} />
      )}

      <div aria-hidden="true" className="instrument-divider" />

      {/* ACWR Gauge */}
      <ACWRGauge acwr={data.acwr} />

      {/* Training Stability (7d): human-centric labels + status-first + coaching copy */}
      <div className="instrument-card">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-white/50" />
          <span className="text-sm font-medium text-white">Training Stability (7d)</span>
        </div>
        <div className="space-y-3">
          {/* Heart & Lungs */}
          <div>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <div className="flex items-center gap-2 text-white/70">
                <Activity className="w-3.5 h-3.5 text-teal-400/80" />
                <span>Heart &amp; Lungs</span>
              </div>
              <span className={`font-medium ${heartLungsStatus === 'Fresh' ? 'text-green-400' : heartLungsStatus === 'Tired' ? 'text-amber-400' : 'text-white/80'}`}>
                {heartLungsStatus}
              </span>
            </div>
            <p className="text-xs text-white/50">{heartLungsCopy[heartLungsStatus]}</p>
          </div>
          {/* Muscle & Joints */}
          <div>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <div className="flex items-center gap-2 text-white/70">
                <Dumbbell className="w-3.5 h-3.5 text-orange-400/80" />
                <span>Muscle &amp; Joints</span>
              </div>
              <span className={`font-medium ${muscleJointsStatus === 'Fresh' ? 'text-green-400' : muscleJointsStatus === 'Recovering' ? 'text-amber-400' : 'text-white/80'}`}>
                {muscleJointsStatus}
              </span>
            </div>
            <p className="text-xs text-white/50">{muscleJointsCopy[muscleJointsStatus]}</p>
          </div>
          {/* Burnout Risk */}
          <div>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <span className="flex items-center gap-2 text-white/70">
                <TrendingUp className="w-3.5 h-3.5 text-blue-400/80" />
                Burnout Risk
              </span>
              <span className={`font-medium ${burnoutRiskStatus === 'Elevated' || burnoutRiskStatus === 'High' ? 'text-amber-400' : burnoutRiskStatus === 'Good' ? 'text-green-400' : 'text-white/80'}`}>
                {burnoutRiskStatus}
              </span>
            </div>
            {acwrStatusLabel === 'Below Base' ? (
              <p className="text-xs text-white/50">
                On your plan, low ACWR means you’re below your planned baseline—not undertrained. Use it as a “vs baseline” signal, not a cue to add volume.
              </p>
            ) : (
              <p className="text-xs text-white/50">{burnoutRiskCopy[burnoutRiskStatus]}</p>
            )}
          </div>
        </div>
      </div>

      {/* The Verdict: permission-based readiness for today's work */}
      {data.weekly_verdict ? (
        <div className="instrument-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-white/50" />
              <span className="text-sm font-medium text-white">The Verdict</span>
            </div>
            <span
              className={`text-lg font-semibold ${
                data.weekly_verdict.label === 'high'
                  ? 'text-green-400'
                  : data.weekly_verdict.label === 'medium'
                    ? 'text-amber-400'
                    : 'text-white/70'
              }`}
            >
              {data.weekly_verdict.readiness_pct}%
            </span>
          </div>
          <p className="text-sm font-medium text-white/90 mb-1.5">&ldquo;{verdictPermission}&rdquo;</p>
          <p className="text-sm text-white/80">{data.weekly_verdict.message}</p>
          {data.weekly_verdict.drivers.length > 0 && (
            <p className="text-xs text-white/50 mt-2">{data.weekly_verdict.drivers.join(' • ')}</p>
          )}
          {data.readiness_source_date && (
            <p className="text-xs text-white/40 mt-2">
              {data.readiness_source_start_date
                ? `Based on your last runs (${new Date(data.readiness_source_start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(data.readiness_source_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`
                : `Based on your run on ${new Date(data.readiness_source_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          )}
        </div>
      ) : (
        <div className="instrument-card">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-white/50" />
            <span className="text-sm font-medium text-white">The Verdict</span>
          </div>
          <p className="text-xs text-white/50">
            Complete a run with HR to see your verdict for today&apos;s work (based on heart-rate drift and pace adherence).
          </p>
        </div>
      )}

      {/* Training Load Chart */}
      <TrainingLoadChart 
        timeline={data.timeline} 
        totalWorkload={data.sport_breakdown.total_workload} 
      />

      {/* Plan progress (only when on an active plan and data is available) */}
      {data.plan_progress && data.acwr?.plan_context?.hasActivePlan && (
        <div className="instrument-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">On-plan progress</span>
            <span className="text-xs text-white/40">
              {data.plan_progress.week_start} → {data.plan_progress.week_end}
            </span>
          </div>

          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="text-sm text-white/80">
              {data.plan_progress.status === 'on_track' && (
                <span className="text-green-400 font-medium">On track</span>
              )}
              {data.plan_progress.status === 'behind' && (
                <span className="text-amber-400 font-medium">Behind</span>
              )}
              {data.plan_progress.status === 'ahead' && (
                <span className="text-blue-400 font-medium">Ahead</span>
              )}
              {data.plan_progress.status === 'unknown' && (
                <span className="text-white/60 font-medium">Unknown</span>
              )}
              <span className="text-white/40 ml-2">
                {data.acwr.plan_context?.planName ? `${data.acwr.plan_context.planName}` : 'Active plan'}
                {data.acwr.plan_context?.weekIndex ? ` • Week ${data.acwr.plan_context.weekIndex}` : ''}
              </span>
            </div>

            {typeof data.plan_progress.percent_of_planned_to_date === 'number' && (
              <div className="text-sm text-white/80">
                <span className="font-medium">{data.plan_progress.percent_of_planned_to_date}%</span>
                <span className="text-white/40"> of planned workload so far (to-date)</span>
              </div>
            )}
          </div>

          <div className="mt-1 text-xs text-white/50 flex items-center justify-between">
            <span>
              Sessions: {data.plan_progress.matched_planned_sessions_to_date}/{data.plan_progress.planned_sessions_to_date} matched (to-date)
            </span>
            <span>
              Match confidence: {Math.round((data.plan_progress.match_confidence || 0) * 100)}%
            </span>
          </div>

          <div className="mt-1 text-xs text-white/50">
            Workload so far: {Math.round(data.plan_progress.completed_to_date_total)} completed / {Math.round(data.plan_progress.planned_to_date_total)} planned to-date
            {data.plan_progress.planned_week_total > 0 && data.plan_progress.planned_week_total !== data.plan_progress.planned_to_date_total && (
              <span className="text-white/40"> • {Math.round(data.plan_progress.planned_week_total)} planned (full week)</span>
            )}
          </div>

          {(data.plan_progress.match_confidence ?? 0) < 0.5 && (
            <div className="mt-2 text-xs text-white/40 italic">
              Sessions not matched—your activities may be on different days than the planned sessions, or start workouts from your plan to link them. The % above compares completed workload so far to planned workload for the same period (same units).
            </div>
          )}
        </div>
      )}

      {/* Week Comparison */}
      {data.week_comparison && (
        <div className="instrument-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Week-over-Week</span>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${
                data.week_comparison.change_direction === 'increase' 
                  ? 'text-green-400' 
                  : data.week_comparison.change_direction === 'decrease'
                    ? 'text-red-400'
                    : 'text-white/60'
              }`}>
                {data.week_comparison.change_direction === 'increase' && '+'}
                {data.week_comparison.change_direction === 'decrease' && '-'}
                {Math.abs(data.week_comparison.change_percent)}%
              </span>
              <span className="text-xs text-white/40">
                ({Math.round(data.week_comparison.previous_week_total)} → {Math.round(data.week_comparison.current_week_total)})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sport Breakdown */}
      <SportBreakdown breakdown={data.sport_breakdown} />

      <div aria-hidden="true" className="instrument-divider" />

      {/* Activity Timeline */}
      <ActivityTimeline 
        timeline={data.timeline} 
        focusDate={focusDate} 
        onSelectWorkout={onSelectWorkout}
      />
    </div>
  );
};

export default TrainingContextTab;

