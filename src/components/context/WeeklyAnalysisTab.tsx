import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppContext';
import { useWeeklySummary } from '@/hooks/useWeeklySummary';

interface WeeklyAnalysisTabProps {}

const WeeklyAnalysisTab: React.FC<WeeklyAnalysisTabProps> = () => {
  const { useImperial } = useAppContext();
  const [currentWeek, setCurrentWeek] = useState(0); // 0 = current week, -1 = last week, etc.
  
  // Calculate week start date
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + (currentWeek * 7)); // Start of week (Sunday)
  const weekStartDate = weekStart.toISOString().split('T')[0];
  
  const { data: weekData, loading, error, refresh } = useWeeklySummary(weekStartDate);

  useEffect(() => {
    if (weekStartDate) {
      refresh();
    }
  }, [weekStartDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
          </div>
          <div className="text-gray-500 text-lg mb-2">Loading week analysis...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-red-500 text-lg mb-2">Error loading week analysis</div>
          <div className="text-gray-400 text-sm mb-4">{error}</div>
          <Button onClick={refresh} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!weekData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-gray-500 text-lg mb-2">No data available for this week</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Week Navigation */}
      <div className="flex items-center justify-between px-2 -mt-10">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentWeek(currentWeek - 1)}
        >
          Prev Week
        </Button>
        
        <div className="text-center">
          <div className="text-lg font-semibold">Week of {weekStartDate}</div>
          {currentWeek === 0 && (
            <div className="text-sm text-gray-600">Current Week</div>
          )}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentWeek(currentWeek + 1)}
        >
          Next Week
        </Button>
      </div>

      {/* Week Overview - 3-column grid like CompletedTab */}
      <div className="grid grid-cols-3 gap-1 px-2 mt-2">
        {/* Week Grade */}
        <div className="px-2 pb-1">
          <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {weekData.week_grade}
          </div>
          <div className="text-xs text-[#666666] font-normal">
            <div className="font-medium">Week Grade</div>
          </div>
        </div>

        {/* Completion Rate */}
        <div className="px-2 pb-1">
          <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {weekData.week_overview.completion_rate}
          </div>
          <div className="text-xs text-[#666666] font-normal">
            <div className="font-medium">Completion</div>
          </div>
        </div>

        {/* Total TSS */}
        <div className="px-2 pb-1">
          <div className="text-base font-semibold text-black mb-0.5" style={{fontFeatureSettings: '"tnum"'}}>
            {weekData.week_overview.total_tss}
          </div>
          <div className="text-xs text-[#666666] font-normal">
            <div className="font-medium">Total TSS</div>
          </div>
        </div>
      </div>

      {/* Intensity Distribution */}
      <div className="px-2 mt-2">
        <div className="text-sm text-[#666666] font-normal">
          <div className="font-medium">Intensity Distribution</div>
        </div>
        <div className="text-sm text-black">
          {weekData.week_overview.intensity_distribution}
        </div>
      </div>

      {/* Performance by Discipline */}
      <div className="px-2 mt-4 space-y-3">
        <div className="text-sm text-[#666666] font-normal">
          <div className="font-medium">Performance This Week</div>
        </div>

        {/* Runs */}
        {weekData.week_overview.disciplines.runs.count > 0 && (
          <div className="space-y-1">
            <div className="text-sm text-black">
              Runs ({weekData.week_overview.disciplines.runs.count} completed)
            </div>
            <div className="text-xs text-[#666666]">
              Avg pace: {weekData.week_overview.disciplines.runs.avg_pace || 'N/A'}
              {weekData.comparison_to_last_week.runs_pace_change !== 'N/A' && (
                <span className="ml-2">{weekData.comparison_to_last_week.runs_pace_change} vs last week</span>
              )}
            </div>
            <div className="text-xs text-[#666666]">
              Hard workouts: {weekData.week_overview.disciplines.runs.hard_count}
            </div>
          </div>
        )}

        {/* Bikes */}
        {weekData.week_overview.disciplines.bikes.count > 0 && (
          <div className="space-y-1">
            <div className="text-sm text-black">
              Bikes ({weekData.week_overview.disciplines.bikes.count} completed)
            </div>
            <div className="text-xs text-[#666666]">
              Avg power: {weekData.week_overview.disciplines.bikes.avg_power || 'N/A'}W
              {weekData.comparison_to_last_week.bikes_power_change !== 'N/A' && (
                <span className="ml-2">{weekData.comparison_to_last_week.bikes_power_change} vs last week</span>
              )}
            </div>
            <div className="text-xs text-[#666666]">
              Hard workouts: {weekData.week_overview.disciplines.bikes.hard_count}
            </div>
          </div>
        )}

        {/* Strength */}
        {weekData.week_overview.disciplines.strength.count > 0 && (
          <div className="space-y-1">
            <div className="text-sm text-black">
              Strength ({weekData.week_overview.disciplines.strength.count} completed)
            </div>
            <div className="text-xs text-[#666666]">
              {weekData.week_overview.disciplines.strength.lifts.length > 0 
                ? `${weekData.week_overview.disciplines.strength.lifts.length} exercises`
                : 'No strength data'
              }
            </div>
          </div>
        )}
      </div>

      {/* Performance Snapshot */}
      <div className="px-2 mt-4">
        <div className="text-sm text-[#666666] font-normal">
          <div className="font-medium">Performance Snapshot</div>
        </div>
        <div className="text-sm text-black mt-1">
          {weekData.performance_snapshot}
        </div>
      </div>

      {/* Key Insights */}
      <div className="px-2 mt-4">
        <div className="text-sm text-[#666666] font-normal">
          <div className="font-medium">Key Insights</div>
        </div>
        <div className="text-sm text-black mt-1 space-y-1">
          {weekData.key_insights.map((insight, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="text-[#666666] mt-0.5">•</span>
              <span>{insight}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Next Week Preview */}
      <div className="px-2 mt-4">
        <div className="text-sm text-[#666666] font-normal">
          <div className="font-medium">Next Week Preview</div>
        </div>
        <div className="text-sm text-black mt-1 space-y-2">
          <div>
            <span className="font-medium">Focus:</span> {weekData.next_week_preview.focus}
          </div>
          <div>
            <div className="font-medium">Key Workouts:</div>
            <div className="text-xs text-[#666666] mt-1 space-y-1">
              {weekData.next_week_preview.key_workouts.map((workout, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-[#666666] mt-0.5">•</span>
                  <span>{workout}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="font-medium">Preparation:</span> {weekData.next_week_preview.preparation}
          </div>
        </div>
      </div>
    </>
  );
};

export default WeeklyAnalysisTab;