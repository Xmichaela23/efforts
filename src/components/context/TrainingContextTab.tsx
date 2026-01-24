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
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';
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
                <span className="text-white/40"> of planned (to-date)</span>
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
            Workload (to-date): {Math.round(data.plan_progress.completed_to_date_total)} / {Math.round(data.plan_progress.planned_to_date_total)} planned
          </div>
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

