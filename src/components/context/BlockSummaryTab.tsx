/**
 * =============================================================================
 * BLOCK SUMMARY TAB
 * =============================================================================
 * 
 * Displays 4-week training block summary with GPT-4 generated analysis
 * 
 * Data from generate-overall-context edge function:
 * - performance_trends: GPT analysis of pace/power progression
 * - plan_adherence: GPT analysis of completion rates
 * - weekly_summary: GPT analysis of most recent week
 */

import React, { useState } from 'react';
import { RefreshCw, TrendingUp, CheckCircle, Calendar, Loader2, Bike, AlertCircle } from 'lucide-react';
import { useOverallContext } from '@/hooks/useOverallContext';

interface BlockSummaryTabProps {}

const BlockSummaryTab: React.FC<BlockSummaryTabProps> = () => {
  const { data, loading, error, refresh } = useOverallContext(4); // 4-week block
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Loading state
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-white/60">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <div className="text-sm">Generating block analysis...</div>
        <div className="text-xs text-white/40 mt-1">This may take a moment</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="px-4 py-8">
        <div className="text-center">
          <h3 className="text-base font-semibold text-white mb-2">Error Loading Analysis</h3>
          <p className="text-sm text-white/60 mb-4">{error}</p>
          <button 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-white/60">No analysis data available</p>
        <p className="text-xs text-white/40 mt-2">Complete some workouts to see your block summary</p>
        <button 
          onClick={handleRefresh} 
          className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
        >
          Generate Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-white">4-Week Block</h2>
          <p className="text-xs text-white/50">Performance trends and fitness progression</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
          className={`p-2 rounded-lg transition-colors ${
            loading || isRefreshing
              ? 'text-white/30 cursor-not-allowed' 
              : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          title="Refresh analysis"
        >
          <RefreshCw className={`w-4 h-4 ${loading || isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Performance Trends - or Insufficient Data Message */}
      {data.performance_trends ? (
        <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-teal-500" />
            <h3 className="text-sm font-medium text-white">Performance Trends</h3>
          </div>
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">
            {data.performance_trends}
          </p>
          
          {/* Bike power data quality note - show when rides exist but no comparable power trends */}
          {data.data_quality?.show_bike_note && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-start gap-2 text-amber-400/80">
                <Bike className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs">
                  <span className="font-medium">Bike power trends unavailable.</span>{' '}
                  {data.data_quality.bike_power_curves_count === 0 ? (
                    <>You have {data.data_quality.bike_rides_count} ride{data.data_quality.bike_rides_count !== 1 ? 's' : ''} but no power data. Complete 30min+ rides with a power meter.</>
                  ) : (
                    <>Need power data in both the current and previous 2-week periods to show trends.</>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : data.insufficient_data ? (
        <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-white/40" />
            <h3 className="text-sm font-medium text-white/60">Performance Trends</h3>
          </div>
          <div className="text-center py-2">
            <p className="text-sm text-white/50">
              Not enough structured workouts
            </p>
            <p className="text-xs text-white/40 mt-2">
              Complete {(data.min_required || 8) - (data.training_workout_count || 0)} more training sessions to unlock trends
            </p>
          </div>
        </div>
      ) : null}

      {/* Plan Adherence */}
      {data.plan_adherence && (
        <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <h3 className="text-sm font-medium text-white">Plan Adherence</h3>
          </div>
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">
            {data.plan_adherence}
          </p>
        </div>
      )}

      {/* Weekly Summary (Most Recent Week) */}
      {data.weekly_summary && (
        <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-medium text-white">This Week</h3>
          </div>
          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">
            {data.weekly_summary}
          </p>
        </div>
      )}

      {/* No content fallback */}
      {!data.performance_trends && !data.plan_adherence && !data.weekly_summary && (
        <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4 text-center">
          <p className="text-sm text-white/60">Analysis generated but no content available</p>
          <button 
            onClick={handleRefresh} 
            className="mt-2 text-sm text-white/80 hover:text-white underline"
          >
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
};

export default BlockSummaryTab;
