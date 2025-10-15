import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useOverallContext } from '@/hooks/useOverallContext';

interface BlockSummaryTabProps {}

interface OverallContextData {
  performance_trends: {
    run_pace: string[];
    bike_power: number[];
    swim_pace: string[];
    strength_lifts: any[];
  };
  plan_adherence: {
    overall: number;
    runs: number;
    bikes: number;
    swims: number;
    strength: number;
  };
  weekly_breakdown: any[];
  analysis: string;
  baseline_alerts?: string[];
  phase_assessment?: {
    current_phase: string;
    status: string;
    recommendation: string;
  };
}

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

  const getAdherenceText = (rate: number) => {
    if (rate >= 90) return 'Excellent';
    if (rate >= 80) return 'Good';
    if (rate >= 70) return 'Fair';
    return 'Needs Work';
  };

  if (loading && !data) {
    return (
      <div className="px-4 py-2 space-y-3">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-2">
        <div className="text-center">
          <h3 className="text-base font-semibold text-black mb-2">Error Loading Analysis</h3>
          <p className="text-sm text-[#666666] mb-4">{error}</p>
          <button 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            className="text-sm text-black hover:text-gray-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 py-2 text-center">
        <p className="text-sm text-[#666666]">No analysis data available</p>
        <button 
          onClick={handleRefresh} 
          className="text-sm text-black hover:text-gray-600 mt-2"
        >
          Generate Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-black">4-Week Training Block Summary</h3>
          <p className="text-xs text-[#666666] font-normal">Performance trends and fitness progression</p>
        </div>
        <button 
          onClick={handleRefresh} 
          disabled={isRefreshing}
          className="text-sm text-black hover:text-gray-600"
        >
          Refresh
        </button>
      </div>

      {/* Performance Trends */}
      <div>
        <h4 className="text-sm text-black mb-2">Performance Trends</h4>
        <div className="space-y-2">
          {/* Run Performance */}
          {data.performance_trends?.run_pace && data.performance_trends.run_pace.length > 0 && (
            <div className="grid grid-cols-3 gap-1 px-2">
              <div className="text-base font-semibold text-black">Running</div>
              <div className="text-xs text-[#666666] font-normal">
                {data.performance_trends.run_pace[0]} → {data.performance_trends.run_pace[data.performance_trends.run_pace.length - 1]}
              </div>
              <div className="text-sm text-black">Improving</div>
            </div>
          )}

          {/* Bike Performance */}
          {data.performance_trends?.bike_power && data.performance_trends.bike_power.length > 0 && (
            <div className="grid grid-cols-3 gap-1 px-2">
              <div className="text-base font-semibold text-black">Cycling</div>
              <div className="text-xs text-[#666666] font-normal">
                {data.performance_trends.bike_power[0]}W → {data.performance_trends.bike_power[data.performance_trends.bike_power.length - 1]}W
              </div>
              <div className="text-sm text-black">Stronger</div>
            </div>
          )}

          {/* Swim Performance */}
          {data.performance_trends?.swim_pace && data.performance_trends.swim_pace.length > 0 && (
            <div className="grid grid-cols-3 gap-1 px-2">
              <div className="text-base font-semibold text-black">Swimming</div>
              <div className="text-xs text-[#666666] font-normal">
                {data.performance_trends.swim_pace[0]} → {data.performance_trends.swim_pace[data.performance_trends.swim_pace.length - 1]}
              </div>
              <div className="text-sm text-black">Faster</div>
            </div>
          )}

          {/* Strength Performance */}
          {data.performance_trends?.strength_lifts && data.performance_trends.strength_lifts.length > 0 && (
            <div className="grid grid-cols-3 gap-1 px-2">
              <div className="text-base font-semibold text-black">Strength</div>
              <div className="text-xs text-[#666666] font-normal">Lifts progressing across all movements</div>
              <div className="text-sm text-black">Consistent</div>
            </div>
          )}
        </div>
      </div>

      {/* Plan Adherence */}
      <div>
        <h4 className="text-sm text-black mb-2">Plan Adherence</h4>
        <div className="space-y-2">
          {/* Overall Adherence */}
          <div className="grid grid-cols-3 gap-1 px-2">
            <div className="text-base font-semibold text-black">Overall</div>
            <div className="text-xs text-[#666666] font-normal">All disciplines combined</div>
            <div className="text-sm text-black">{data.plan_adherence?.overall || 0}%</div>
          </div>

          {/* Individual Disciplines */}
          <div className="grid grid-cols-3 gap-1 px-2">
            <div className="text-base font-semibold text-black">Runs</div>
            <div className="text-xs text-[#666666] font-normal">Running workouts</div>
            <div className="text-sm text-black">{data.plan_adherence?.runs || 0}%</div>
          </div>

          <div className="grid grid-cols-3 gap-1 px-2">
            <div className="text-base font-semibold text-black">Bikes</div>
            <div className="text-xs text-[#666666] font-normal">Cycling workouts</div>
            <div className="text-sm text-black">{data.plan_adherence?.bikes || 0}%</div>
          </div>

          <div className="grid grid-cols-3 gap-1 px-2">
            <div className="text-base font-semibold text-black">Swims</div>
            <div className="text-xs text-[#666666] font-normal">Swimming workouts</div>
            <div className="text-sm text-black">{data.plan_adherence?.swims || 0}%</div>
          </div>

          <div className="grid grid-cols-3 gap-1 px-2">
            <div className="text-base font-semibold text-black">Strength</div>
            <div className="text-xs text-[#666666] font-normal">Strength workouts</div>
            <div className="text-sm text-black">{data.plan_adherence?.strength || 0}%</div>
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      {data.analysis && (
        <div>
          <h4 className="text-sm text-black mb-2">Training Analysis</h4>
          <div className="px-2">
            <p className="text-sm text-black leading-relaxed whitespace-pre-line">
              {data.analysis}
            </p>
          </div>
        </div>
      )}

      {/* Weekly Breakdown */}
      {data.weekly_breakdown && data.weekly_breakdown.length > 0 && (
        <div>
          <h4 className="text-sm text-black mb-2">Weekly Breakdown</h4>
          <div className="space-y-2">
            {data.weekly_breakdown.map((week, index) => (
              <div key={index} className="grid grid-cols-3 gap-1 px-2">
                <div className="text-base font-semibold text-black">{week.week_label}</div>
                <div className="text-xs text-[#666666] font-normal">
                  Runs: {week.runs?.count || 0}, Bikes: {week.bikes?.count || 0}, Swims: {week.swims?.count || 0}
                </div>
                <div className="text-sm text-black">
                  {week.runs?.avg_pace && `Run: ${week.runs.avg_pace}`}
                  {week.bikes?.avg_power && ` Bike: ${week.bikes.avg_power}W`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockSummaryTab;
