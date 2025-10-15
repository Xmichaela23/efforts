import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, TrendingUp, Target, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
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

  const getTrendIcon = (trend: string) => {
    if (trend.includes('improved') || trend.includes('faster') || trend.includes('increased')) {
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    }
    return <TrendingUp className="h-4 w-4 text-red-600" />;
  };

  const getAdherenceColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600 bg-green-100';
    if (rate >= 80) return 'text-blue-600 bg-blue-100';
    if (rate >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  if (loading && !data) {
    return (
      <div className="p-4 space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-4/5 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Analysis</h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No analysis data available</p>
        <Button onClick={handleRefresh} className="mt-4">
          Generate Analysis
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">4-Week Training Block Summary</h3>
          <p className="text-sm text-gray-600">Performance trends and fitness progression</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Performance Trends */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Performance Trends
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Run Performance */}
            {data.performance_trends?.run_pace && data.performance_trends.run_pace.length > 0 && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏃</span>
                  <div>
                    <div className="font-medium">Running</div>
                    <div className="text-sm text-gray-600">
                      Pace: {data.performance_trends.run_pace[0]} → {data.performance_trends.run_pace[data.performance_trends.run_pace.length - 1]}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getTrendIcon('improved')}
                  <Badge variant="outline" className="text-green-600 border-green-200">
                    Improving
                  </Badge>
                </div>
              </div>
            )}

            {/* Bike Performance */}
            {data.performance_trends?.bike_power && data.performance_trends.bike_power.length > 0 && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🚴</span>
                  <div>
                    <div className="font-medium">Cycling</div>
                    <div className="text-sm text-gray-600">
                      Power: {data.performance_trends.bike_power[0]}W → {data.performance_trends.bike_power[data.performance_trends.bike_power.length - 1]}W
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getTrendIcon('increased')}
                  <Badge variant="outline" className="text-green-600 border-green-200">
                    Stronger
                  </Badge>
                </div>
              </div>
            )}

            {/* Swim Performance */}
            {data.performance_trends?.swim_pace && data.performance_trends.swim_pace.length > 0 && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏊</span>
                  <div>
                    <div className="font-medium">Swimming</div>
                    <div className="text-sm text-gray-600">
                      Pace: {data.performance_trends.swim_pace[0]} → {data.performance_trends.swim_pace[data.performance_trends.swim_pace.length - 1]}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getTrendIcon('improved')}
                  <Badge variant="outline" className="text-green-600 border-green-200">
                    Faster
                  </Badge>
                </div>
              </div>
            )}

            {/* Strength Performance */}
            {data.performance_trends?.strength_lifts && data.performance_trends.strength_lifts.length > 0 && (
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💪</span>
                  <div>
                    <div className="font-medium">Strength</div>
                    <div className="text-sm text-gray-600">
                      Lifts progressing across all movements
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <Badge variant="outline" className="text-green-600 border-green-200">
                    Consistent
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan Adherence */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Plan Adherence
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Overall Adherence */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium">Overall</div>
                <div className="text-sm text-gray-600">All disciplines combined</div>
              </div>
              <Badge className={getAdherenceColor(data.plan_adherence?.overall || 0)}>
                {data.plan_adherence?.overall || 0}%
              </Badge>
            </div>

            {/* Individual Disciplines */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏃</span>
                  <span className="text-sm font-medium">Runs</span>
                </div>
                <Badge className={getAdherenceColor(data.plan_adherence?.runs || 0)}>
                  {data.plan_adherence?.runs || 0}%
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚴</span>
                  <span className="text-sm font-medium">Bikes</span>
                </div>
                <Badge className={getAdherenceColor(data.plan_adherence?.bikes || 0)}>
                  {data.plan_adherence?.bikes || 0}%
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏊</span>
                  <span className="text-sm font-medium">Swims</span>
                </div>
                <Badge className={getAdherenceColor(data.plan_adherence?.swims || 0)}>
                  {data.plan_adherence?.swims || 0}%
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💪</span>
                  <span className="text-sm font-medium">Strength</span>
                </div>
                <Badge className={getAdherenceColor(data.plan_adherence?.strength || 0)}>
                  {data.plan_adherence?.strength || 0}%
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Baseline Alerts */}
      {data.baseline_alerts && data.baseline_alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Baseline Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {data.baseline_alerts.map((alert, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <div className="font-medium text-yellow-800">Update Recommended</div>
                    <div className="text-yellow-700">{alert}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase Assessment */}
      {data.phase_assessment && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Phase Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Current Phase:</span>
                <Badge variant="outline">{data.phase_assessment.current_phase}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Status:</span>
                <Badge className={data.phase_assessment.status === 'On track' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {data.phase_assessment.status}
                </Badge>
              </div>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm font-medium text-blue-800 mb-1">Recommendation:</div>
                <div className="text-sm text-blue-700">{data.phase_assessment.recommendation}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis */}
      {data.analysis && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Training Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="prose prose-sm max-w-none">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {data.analysis}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Breakdown */}
      {data.weekly_breakdown && data.weekly_breakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Weekly Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {data.weekly_breakdown.map((week, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{week.week_label}</div>
                    <div className="text-sm text-gray-600">
                      Runs: {week.runs?.count || 0}, Bikes: {week.bikes?.count || 0}, Swims: {week.swims?.count || 0}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {week.runs?.avg_pace && `Run: ${week.runs.avg_pace}`}
                    </div>
                    <div className="text-sm font-medium">
                      {week.bikes?.avg_power && `Bike: ${week.bikes.avg_power}W`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BlockSummaryTab;
