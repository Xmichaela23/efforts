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

  // Server-computed display values (smart server, dumb client). Fallback only for old cached responses.
  type FatigueTier = 'Low' | 'Moderate' | 'Elevated';
  const aerobicTier: FatigueTier = data.display_aerobic_tier ?? (() => {
    if (data.weekly_verdict) {
      if (data.weekly_verdict.label === 'high') return 'Low' as FatigueTier;
      if (data.weekly_verdict.label === 'medium') return 'Moderate' as FatigueTier;
      return 'Elevated' as FatigueTier;
    }
    const trend = data.weekly_readiness?.recent_form_trend;
    if (trend === 'worsening') return 'Elevated' as FatigueTier;
    if (trend === 'improving') return 'Low' as FatigueTier;
    return 'Moderate' as FatigueTier;
  })();
  const structuralTier: FatigueTier = data.display_structural_tier ?? (() => {
    const rir = data.structural_load?.avg_rir_acute;
    if (rir == null || rir >= 2) return 'Low' as FatigueTier;
    if (rir >= 1) return 'Moderate' as FatigueTier;
    return 'Elevated' as FatigueTier;
  })();
  const limiterLine = data.display_limiter_line ?? (() => {
    const o: Record<FatigueTier, number> = { Low: 0, Moderate: 1, Elevated: 2 };
    return o[aerobicTier] > o[structuralTier] ? 'Today is limited by aerobic fatigue.'
      : o[structuralTier] > o[aerobicTier] ? 'Today is limited by structural fatigue.'
      : 'No clear limiter.';
  })();
  const loadChangeRiskLabel = data.display_load_change_risk_label ?? (
    data.acwr.status === 'undertrained' || data.acwr.status === 'recovery' || data.acwr.status === 'optimal_recovery' ? 'Below baseline'
    : data.acwr.status === 'optimal' ? 'In range'
    : data.acwr.status === 'elevated' ? 'Ramping fast'
    : 'Overreaching'
  );

  // Plan-aware ACWR label (for burnout copy only)
  const hasActivePlan = !!data.acwr.plan_context?.hasActivePlan;
  const weekIntent = data.acwr.plan_context?.weekIntent;
  const isBuildBaselinePeak = weekIntent === 'build' || weekIntent === 'baseline' || weekIntent === 'peak';
  const acwrStatusLabel = hasActivePlan && isBuildBaselinePeak && data.acwr.status === 'undertrained'
    ? 'Below Base'
    : data.acwr.status.replace('_', ' ');

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
            Updated from your last 7 days
          </span>
          <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>
            Current training state
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

      {/* Context Summary: one integrated story (replaces scattered banner + plan lines) */}
      {data.context_summary && data.context_summary.length > 0 ? (
        <div className="instrument-card flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{data.context_summary[0]}</p>
          {data.context_summary.slice(1).map((line, i) => (
            <p key={i} className="text-sm text-white/90 leading-relaxed">{line}</p>
          ))}
        </div>
      ) : (
        <>
          {/* Fallback: plan science + banner when no context_summary (e.g. old cache) */}
          {data.acwr?.plan_context?.hasActivePlan && (data.acwr.plan_context.weekIndex != null || data.acwr.plan_context.weeks_remaining != null) && (
            <div className="text-xs text-white/50 px-1 flex flex-wrap gap-x-2">
              {data.acwr.plan_context.weekIndex != null && data.acwr.plan_context.duration_weeks != null && (
                <span>Week {data.acwr.plan_context.weekIndex} of {data.acwr.plan_context.duration_weeks}</span>
              )}
              {data.acwr.plan_context.weeks_remaining != null && (
                <span>{data.acwr.plan_context.race_date ? `${data.acwr.plan_context.weeks_remaining} weeks to race` : `${data.acwr.plan_context.weeks_remaining} weeks to go`}</span>
              )}
              {data.acwr.plan_context.next_week_intent != null && data.acwr.plan_context.next_week_intent !== 'unknown' && (
                <span>Next week: {data.acwr.plan_context.next_week_focus_label || data.acwr.plan_context.next_week_intent}</span>
              )}
            </div>
          )}
          {data.context_banner && (
            <div className="instrument-card flex flex-col gap-1.5">
              <p className="text-sm font-medium text-white/95">{data.context_banner.line1}</p>
              <p className="text-sm text-white/80">{data.context_banner.line2}</p>
              <p className="text-sm text-white/80">{data.context_banner.line3}</p>
              {data.context_banner.acwr_clause && (
                <p className="text-sm text-amber-400/90 pt-0.5">{data.context_banner.acwr_clause}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Other insights (ACWR-led insight removed; summary or banner replaces it) */}
      {data.insights && data.insights.length > 0 && (
        <SmartInsights insights={data.insights} />
      )}

      <div aria-hidden="true" className="instrument-divider" />

      {/* Section 1: Current Training State — state pillars + limiter */}
      <div className="instrument-card">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-white/50" />
          <span className="text-sm font-medium text-white">Current Training State</span>
        </div>
        <div className="space-y-3">
          {/* Aerobic Load */}
          <div>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <div className="flex items-center gap-2 text-white/70">
                <Activity className="w-3.5 h-3.5 text-teal-400/80" />
                <span>Aerobic Load</span>
              </div>
              <span className={`font-medium ${aerobicTier === 'Low' ? 'text-green-400' : aerobicTier === 'Elevated' ? 'text-amber-400' : 'text-white/80'}`}>
                {aerobicTier === 'Low' ? 'Low' : aerobicTier === 'Moderate' ? 'Moderate' : 'Elevated'} fatigue
              </span>
            </div>
          </div>
          {/* Structural Load */}
          <div>
            <div className="flex items-center justify-between text-sm mb-0.5">
              <div className="flex items-center gap-2 text-white/70">
                <Dumbbell className="w-3.5 h-3.5 text-orange-400/80" />
                <span>Structural Load</span>
              </div>
              <span className={`font-medium ${structuralTier === 'Low' ? 'text-green-400' : structuralTier === 'Elevated' ? 'text-amber-400' : 'text-white/80'}`}>
                {structuralTier === 'Low' ? 'Low' : structuralTier === 'Moderate' ? 'Moderate' : 'Elevated'} fatigue
              </span>
            </div>
          </div>
          {/* Limiter as label (no repeated prose) */}
          <p className="text-sm text-white/80 pt-1 border-t border-white/10">
            Limiter: {data.display_limiter_label ?? (limiterLine === 'No clear limiter.' ? 'None' : limiterLine.replace('Today is limited by ', '').replace('.', ''))}
          </p>
        </div>
      </div>

      {/* Why (collapsed by default — supports summary, not duplicate) */}
      <details className="instrument-card py-2 px-3" open={false}>
        <summary className="text-xs text-white/50 cursor-pointer list-none flex items-center gap-1">
          <span className="text-white/60">Why</span>
          <span className="text-white/40">— Aerobic: HR drift, pace adherence, last 3 runs. Structural: volume (7d), avg RIR (7d).</span>
        </summary>
        <div className="mt-2 pt-2 border-t border-white/10">
          <p className="text-xs text-white/50">
            <span className="text-white/70">Aerobic Load (based on):</span> HR drift trend, pace adherence, last 3 runs.
          </p>
          <p className="text-xs text-white/50 mt-1">
            <span className="text-white/70">Structural Load (based on):</span> lifting volume (7d), avg RIR (7d).
          </p>
        </div>
      </details>

      {/* Section 3: Load Change Risk — minimal row; on-plan + low = "Below baseline (planned)" + optional helper */}
      {data.acwr.data_days < 7 ? (
        <div className="text-xs text-white/50 py-2 px-3">
          Train for {7 - data.acwr.data_days} more day{7 - data.acwr.data_days !== 1 ? 's' : ''} to unlock load change risk.
        </div>
      ) : (
        <div className="space-y-1">
          <div className={`flex items-center justify-between text-sm py-2 px-3 rounded-lg border border-white/10 ${data.acwr.ratio > 1.3 ? 'bg-amber-500/10 border-amber-400/30' : 'bg-white/[0.03]'}`}>
            <span className="text-white/60">Load Change Risk</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-white/80">{data.acwr.ratio.toFixed(2)}</span>
              <span className={`font-medium ${data.acwr.ratio > 1.5 ? 'text-red-400' : data.acwr.ratio > 1.3 ? 'text-amber-400' : 'text-white/80'}`}>
                {loadChangeRiskLabel}
              </span>
            </span>
          </div>
          {data.display_load_change_risk_helper && (
            <p className="text-xs text-white/50 px-3">{data.display_load_change_risk_helper}</p>
          )}
        </div>
      )}

      {/* Projected week load — only when no context_summary (summary already includes it) */}
      {data.projected_week_load && !data.context_summary?.length && (
        <div className="text-xs text-white/50 py-2 px-3">
          {data.projected_week_load.message}
        </div>
      )}

      {/* Training Guidance (1–2 lines when summary present; full when not) */}
      {data.weekly_verdict ? (
        <div className="instrument-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-white/50" />
              <span className="text-sm font-medium text-white">Training Guidance</span>
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
          {data.context_summary?.length && data.next_action ? (
            <p className="text-sm text-white/85 mt-1">{data.next_action}</p>
          ) : data.context_summary?.length ? (
            <p className="text-sm text-white/85 mt-1">&ldquo;{verdictPermission}&rdquo;</p>
          ) : (
            <>
              <p className="text-sm font-medium text-white/90 mb-1.5 mt-1">&ldquo;{verdictPermission}&rdquo;</p>
              <p className="text-sm text-white/80">{data.weekly_verdict.message}</p>
              {data.weekly_verdict.drivers.length > 0 && (
                <p className="text-xs text-white/50 mt-2">{data.weekly_verdict.drivers.join(' • ')}</p>
              )}
            </>
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
            <span className="text-sm font-medium text-white">Training Guidance</span>
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

