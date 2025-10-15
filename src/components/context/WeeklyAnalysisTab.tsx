import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, BarChart3, TrendingUp, TrendingDown, Target, CheckCircle, AlertCircle } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { useWeeklySummary } from '@/hooks/useWeeklySummary';
import { formatDuration, formatPace } from '@/utils/workoutFormatting';

interface WeeklyAnalysisTabProps {}

interface WeekData {
  weekNumber: number;
  startDate: string;
  endDate: string;
  grade: string;
  completionRate: string;
  totalTSS: number;
  intensityDistribution: {
    easy: number;
    hard: number;
  };
  performance: {
    runs: {
      completed: number;
      total: number;
      avgPace: string;
      paceChange: string;
      keyWorkout: string;
    };
    bikes: {
      completed: number;
      total: number;
      avgPower: number;
      powerChange: number;
      keyWorkout: string;
    };
    strength: {
      completed: number;
      total: number;
      progression: string;
    };
  };
  insights: string[];
  nextWeekPreview: {
    focus: string;
    keyWorkouts: string[];
    readiness: string;
  };
}

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



  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'text-green-600 bg-green-100';
      case 'B': return 'text-blue-600 bg-blue-100';
      case 'C': return 'text-yellow-600 bg-yellow-100';
      case 'D': return 'text-orange-600 bg-orange-100';
      case 'F': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getChangeIcon = (change: number | string) => {
    if (typeof change === 'number') {
      return change > 0 ? <TrendingUp className="h-3 w-3 text-green-600" /> : 
             change < 0 ? <TrendingDown className="h-3 w-3 text-red-600" /> : null;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-600 mb-4">Error loading week analysis: {error}</p>
        <Button onClick={refresh} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  if (!weekData) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No data available for this week</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentWeek(currentWeek - 1)}
          className="flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev Week
        </Button>
        
        <div className="text-center">
          <h3 className="text-lg font-semibold">
            Week of {weekStartDate}
          </h3>
          {currentWeek === 0 && (
            <p className="text-sm text-gray-600">Current Week</p>
          )}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentWeek(currentWeek + 1)}
          className="flex items-center gap-1"
        >
          Next Week
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Week Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Week Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">Week Grade: {weekData.week_grade}</div>
              <div className="text-sm text-gray-600">Overall Performance</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{weekData.week_overview.completion_rate}</div>
              <div className="text-sm text-gray-600">Sessions Completed</div>
            </div>
          </div>
          
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-lg font-semibold">{weekData.week_overview.total_tss}</div>
              <div className="text-sm text-gray-600">Total TSS</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">
                {weekData.week_overview.intensity_distribution}
              </div>
              <div className="text-sm text-gray-600">Intensity Balance</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance This Week */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Performance This Week
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Runs */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🏃</span>
                <div>
                  <div className="font-medium">Runs ({weekData.week_overview.disciplines.runs.count} completed)</div>
                  <div className="text-sm text-gray-600">
                    Avg pace: {weekData.week_overview.disciplines.runs.avg_pace || 'N/A'}
                    {weekData.comparison_to_last_week.runs_pace_change !== 'N/A' && (
                      <span className="ml-2 flex items-center gap-1">
                        {getChangeIcon(parseFloat(weekData.comparison_to_last_week.runs_pace_change))}
                        {weekData.comparison_to_last_week.runs_pace_change} vs last week
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Badge variant={weekData.week_overview.disciplines.runs.hard_count > 0 ? "default" : "secondary"}>
                {weekData.week_overview.disciplines.runs.hard_count} hard
              </Badge>
            </div>

            {/* Bikes */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🚴</span>
                <div>
                  <div className="font-medium">Bikes ({weekData.week_overview.disciplines.bikes.count} completed)</div>
                  <div className="text-sm text-gray-600">
                    Avg power: {weekData.week_overview.disciplines.bikes.avg_power || 'N/A'}W
                    {weekData.comparison_to_last_week.bikes_power_change !== 'N/A' && (
                      <span className="ml-2 flex items-center gap-1">
                        {getChangeIcon(parseFloat(weekData.comparison_to_last_week.bikes_power_change))}
                        {weekData.comparison_to_last_week.bikes_power_change} vs last week
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Badge variant={weekData.week_overview.disciplines.bikes.hard_count > 0 ? "default" : "secondary"}>
                {weekData.week_overview.disciplines.bikes.hard_count} hard
              </Badge>
            </div>

            {/* Strength */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💪</span>
                <div>
                  <div className="font-medium">Strength ({weekData.week_overview.disciplines.strength.count} completed)</div>
                  <div className="text-sm text-gray-600">
                    {weekData.week_overview.disciplines.strength.lifts.length > 0 
                      ? `${weekData.week_overview.disciplines.strength.lifts.length} exercises`
                      : 'No strength data'
                    }
                  </div>
                </div>
              </div>
              <Badge variant={weekData.week_overview.disciplines.strength.count > 0 ? "default" : "secondary"}>
                {weekData.week_overview.disciplines.strength.count > 0 ? '✅' : '⚠️'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Snapshot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Performance Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-gray-700">{weekData.performance_snapshot}</p>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Key Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="space-y-2">
            {weekData.key_insights.map((insight, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="text-blue-500 mt-1">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Next Week Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Next Week Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div>
              <p className="font-medium text-sm">Focus: {weekData.next_week_preview.focus}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Key Workouts:</p>
              <ul className="space-y-1">
                {weekData.next_week_preview.key_workouts.map((workout, index) => (
                  <li key={index} className="text-sm flex items-center gap-2">
                    <span className="text-green-500">•</span>
                    <span>{workout}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm text-gray-600">{weekData.next_week_preview.preparation}</p>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
};

export default WeeklyAnalysisTab;
