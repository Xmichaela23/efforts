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
}

export const TrainingContextTab: React.FC<TrainingContextTabProps> = ({ date }) => {
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
    <div className="space-y-4 pb-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">Training Context</h2>
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

      {/* ACWR Gauge */}
      <ACWRGauge acwr={data.acwr} />

      {/* Training Load Chart */}
      <TrainingLoadChart 
        timeline={data.timeline} 
        totalWorkload={data.sport_breakdown.total_workload} 
      />

      {/* Week Comparison */}
      {data.week_comparison && (
        <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
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

      {/* Activity Timeline */}
      <ActivityTimeline timeline={data.timeline} focusDate={focusDate} />
    </div>
  );
};

export default TrainingContextTab;

