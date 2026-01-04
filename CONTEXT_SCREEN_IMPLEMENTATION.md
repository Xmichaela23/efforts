# Context Screen Implementation Guide

## File Structure

```
src/
├── hooks/
│   └── useTrainingContext.ts        # New hook for context data
├── components/
│   └── context/
│       ├── TrainingContextTab.tsx   # Replace WeeklyAnalysisTab
│       ├── ACWRGauge.tsx            # ACWR visualization
│       ├── TrainingLoadChart.tsx    # 7-day stacked bar chart
│       ├── SportBreakdown.tsx       # Sport distribution bars
│       ├── SmartInsights.tsx        # Insight cards
│       └── ActivityTimeline.tsx     # 14-day workout timeline
└── lib/
    └── context-utils.ts             # Shared utilities

supabase/
└── functions/
    └── generate-training-context/
        └── index.ts                 # Edge function
```

---

## Hook: `useTrainingContext`

```typescript
// src/hooks/useTrainingContext.ts

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface ACWRData {
  ratio: number;
  status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
  acute_daily_avg: number;
  chronic_daily_avg: number;
  acute_total: number;
  chronic_total: number;
  data_days: number;
  projected?: {
    ratio: number;
    status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
    planned_workload: number;
  };
}

interface SportData {
  workload: number;
  percent: number;
  sessions: number;
}

interface SportBreakdown {
  run: SportData;
  bike: SportData;
  swim: SportData;
  strength: SportData;
  mobility: SportData;
  total_workload: number;
}

interface TimelineWorkout {
  id: string;
  type: string;
  name: string;
  workload_actual: number;
  duration: number;
  status: 'completed' | 'planned' | 'skipped';
}

interface TimelineDay {
  date: string;
  workouts: TimelineWorkout[];
  daily_total: number;
  is_acute_window: boolean;
}

interface WeekComparison {
  current_week_total: number;
  previous_week_total: number;
  change_percent: number;
  change_direction: 'increase' | 'decrease' | 'stable';
}

interface Insight {
  type: 'acwr_high' | 'consecutive_hard' | 'sport_imbalance' | 'weekly_jump';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  data?: any;
}

export interface TrainingContextData {
  acwr: ACWRData;
  sport_breakdown: SportBreakdown;
  timeline: TimelineDay[];
  week_comparison: WeekComparison;
  insights: Insight[];
}

interface UseTrainingContextResult {
  data: TrainingContextData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const CACHE_KEY_PREFIX = 'training_context_';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

export function useTrainingContext(date: string): UseTrainingContextResult {
  const [data, setData] = useState<TrainingContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedData(date);
        if (cached) {
          setData(cached);
          setLoading(false);
          return;
        }
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Call edge function
      const { data: response, error: apiError } = await supabase.functions.invoke(
        'generate-training-context',
        {
          body: {
            user_id: user.id,
            date: date
          }
        }
      );

      if (apiError) {
        throw new Error(apiError.message || 'Failed to generate training context');
      }

      if (!response) {
        throw new Error('No response from server');
      }

      // Cache the result
      cacheData(date, response);
      setData(response);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Training context fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const getCachedData = (date: string): TrainingContextData | null => {
    try {
      const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${date}`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data;
        }
      }
    } catch (err) {
      console.error('Cache read error:', err);
    }
    return null;
  };

  const cacheData = (date: string, data: TrainingContextData) => {
    try {
      localStorage.setItem(
        `${CACHE_KEY_PREFIX}${date}`,
        JSON.stringify({ data, timestamp: Date.now() })
      );
    } catch (err) {
      console.error('Cache write error:', err);
    }
  };

  const refresh = useCallback(() => fetchContext(true), [fetchContext]);

  // Fetch on mount and when date changes
  useEffect(() => {
    fetchContext();
  }, [date, fetchContext]);

  return { data, loading, error, refresh };
}
```

---

## Component: `TrainingContextTab`

```typescript
// src/components/context/TrainingContextTab.tsx

import React from 'react';
import { useTrainingContext } from '@/hooks/useTrainingContext';
import { ACWRGauge } from './ACWRGauge';
import { TrainingLoadChart } from './TrainingLoadChart';
import { SportBreakdown } from './SportBreakdown';
import { SmartInsights } from './SmartInsights';
import { ActivityTimeline } from './ActivityTimeline';
import { RefreshCw } from 'lucide-react';

interface TrainingContextTabProps {
  focusDate?: string;
}

const TrainingContextTab: React.FC<TrainingContextTabProps> = ({ focusDate }) => {
  // Default to today
  const today = new Date().toLocaleDateString('en-CA');
  const date = focusDate || today;
  
  const { data, loading, error, refresh } = useTrainingContext(date);

  if (loading && !data) {
    return (
      <div className="px-4 py-2 space-y-4">
        <div className="animate-pulse">
          <div className="h-24 bg-white/10 rounded-lg mb-4"></div>
          <div className="h-32 bg-white/10 rounded-lg mb-4"></div>
          <div className="h-20 bg-white/10 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-2">
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
          <div className="text-red-400 font-medium">Error loading context</div>
          <div className="text-red-300/80 text-sm mt-1">{error}</div>
          <button 
            onClick={refresh}
            className="mt-3 text-sm text-red-400 hover:text-red-300"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 py-2 text-center">
        <p className="text-white/60">No context data available</p>
        <button onClick={refresh} className="mt-2 text-white/80 hover:text-white">
          Generate Context
        </button>
      </div>
    );
  }

  return (
    <div className="px-2 py-2 space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-lg font-semibold text-white">Training Context</h3>
          <p className="text-xs text-white/60">Load, fatigue & insights</p>
        </div>
        <button 
          onClick={refresh}
          disabled={loading}
          className="p-2 text-white/60 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ACWR Gauge */}
      <ACWRGauge 
        acwr={data.acwr}
        showProjected={!!data.acwr.projected}
      />

      {/* Training Load Chart (7 days) */}
      <TrainingLoadChart 
        timeline={data.timeline.slice(0, 7)} // Only last 7 days
        totalWorkload={data.sport_breakdown.total_workload}
      />

      {/* Sport Breakdown */}
      <SportBreakdown 
        breakdown={data.sport_breakdown}
      />

      {/* Smart Insights */}
      {data.insights.length > 0 && (
        <SmartInsights insights={data.insights} />
      )}

      {/* 14-Day Timeline */}
      <ActivityTimeline 
        timeline={data.timeline}
        focusDate={date}
      />
    </div>
  );
};

export default TrainingContextTab;
```

---

## Component: `ACWRGauge`

```typescript
// src/components/context/ACWRGauge.tsx

import React from 'react';

interface ACWRData {
  ratio: number;
  status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
  acute_daily_avg: number;
  chronic_daily_avg: number;
  acute_total: number;
  chronic_total: number;
  data_days: number;
  projected?: {
    ratio: number;
    status: 'undertrained' | 'optimal' | 'elevated' | 'high_risk';
    planned_workload: number;
  };
}

interface ACWRGaugeProps {
  acwr: ACWRData;
  showProjected?: boolean;
}

const statusConfig = {
  undertrained: { color: 'blue-500', label: 'Undertrained', bg: 'bg-blue-500' },
  optimal: { color: 'green-500', label: 'Optimal', bg: 'bg-green-500' },
  elevated: { color: 'yellow-500', label: 'Elevated', bg: 'bg-yellow-500' },
  high_risk: { color: 'red-500', label: 'High Risk', bg: 'bg-red-500' },
};

export const ACWRGauge: React.FC<ACWRGaugeProps> = ({ acwr, showProjected }) => {
  const config = statusConfig[acwr.status];
  
  // Calculate gauge position (0.5 = leftmost, 2.0 = rightmost)
  // Map 0.5-2.0 range to 0-100%
  const gaugePosition = Math.min(Math.max((acwr.ratio - 0.5) / 1.5, 0), 1) * 100;

  // Progressive disclosure caveat
  let caveat = '';
  if (acwr.data_days < 7) {
    return (
      <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
        <div className="text-white/60 text-sm text-center">
          Train for {7 - acwr.data_days} more days to unlock training load insights
        </div>
      </div>
    );
  } else if (acwr.data_days < 14) {
    caveat = '(preliminary - 7 days)';
  } else if (acwr.data_days < 28) {
    caveat = `(${acwr.data_days} days of data)`;
  }

  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      {/* ACWR Value and Status */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-2xl font-bold text-white">
            {acwr.ratio.toFixed(2)}
          </div>
          <div className={`text-sm text-${config.color}`}>
            {config.label} {caveat && <span className="text-white/40">{caveat}</span>}
          </div>
        </div>
        <div className="text-right text-sm text-white/60">
          <div>Acute (7d): {acwr.acute_total}</div>
          <div>Chronic (28d): {acwr.chronic_total}</div>
        </div>
      </div>

      {/* Gauge Bar */}
      <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
        {/* Zone indicators */}
        <div className="absolute inset-0 flex">
          <div className="w-[20%] bg-blue-500/30"></div>   {/* 0.5-0.8 undertrained */}
          <div className="w-[33%] bg-green-500/30"></div>  {/* 0.8-1.3 optimal */}
          <div className="w-[13%] bg-yellow-500/30"></div> {/* 1.3-1.5 elevated */}
          <div className="w-[34%] bg-red-500/30"></div>    {/* 1.5-2.0 high_risk */}
        </div>
        
        {/* Current position indicator */}
        <div 
          className={`absolute top-0 bottom-0 w-1 ${config.bg} rounded-full shadow-lg`}
          style={{ left: `${gaugePosition}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      {/* Projected ACWR */}
      {showProjected && acwr.projected && (
        <div className="mt-3 pt-3 border-t border-white/10 text-sm text-white/70">
          If you complete today's workout: {' '}
          <span className={`text-${statusConfig[acwr.projected.status].color}`}>
            {acwr.projected.ratio.toFixed(2)} ({statusConfig[acwr.projected.status].label})
          </span>
        </div>
      )}
    </div>
  );
};
```

---

## Component: `TrainingLoadChart`

```typescript
// src/components/context/TrainingLoadChart.tsx

import React from 'react';
import { SPORT_COLORS, getDisciplineColor } from '@/lib/context-utils';

interface TimelineDay {
  date: string;
  workouts: Array<{
    id: string;
    type: string;
    workload_actual: number;
  }>;
  daily_total: number;
}

interface TrainingLoadChartProps {
  timeline: TimelineDay[];
  totalWorkload: number;
}

export const TrainingLoadChart: React.FC<TrainingLoadChartProps> = ({ 
  timeline, 
  totalWorkload 
}) => {
  // Find max daily total for scaling with minimum to prevent distortion
  // Minimum 100 workload prevents very light weeks from looking tall
  const maxDayTotal = Math.max(...timeline.map(d => d.daily_total), 100);
  // Use effective max of at least 150 to keep bars proportional
  const effectiveMax = Math.max(maxDayTotal, 150);
  const chartHeight = 120; // pixels

  // Day abbreviations
  const dayAbbrev = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-white">7-Day Training Load</div>
        <div className="text-sm text-white/60">{totalWorkload} total</div>
      </div>

      {/* Bar Chart */}
      <div className="flex items-end justify-between gap-1" style={{ height: chartHeight }}>
        {timeline.map((day, idx) => {
          const dayDate = new Date(day.date);
          const dayLabel = dayAbbrev[dayDate.getDay()];
          // Cap bar height to prevent overflow, use effectiveMax for scaling
          const barHeight = Math.min((day.daily_total / effectiveMax) * chartHeight, chartHeight);
          
          // Stack workouts by type
          const workoutsByType: Record<string, number> = {};
          day.workouts.forEach(w => {
            const type = w.type.toLowerCase();
            workoutsByType[type] = (workoutsByType[type] || 0) + w.workload_actual;
          });

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center">
              {/* Stacked bar */}
              <div 
                className="w-full rounded-t overflow-hidden"
                style={{ height: barHeight }}
              >
                {Object.entries(workoutsByType).map(([type, workload]) => {
                  const segmentHeight = (workload / day.daily_total) * barHeight;
                  return (
                    <div
                      key={type}
                      style={{ 
                        height: segmentHeight,
                        backgroundColor: getDisciplineColor(type)
                      }}
                    />
                  );
                })}
              </div>
              
              {/* Day label */}
              <div className="text-xs text-white/40 mt-1">{dayLabel}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

---

## Component: `SportBreakdown`

```typescript
// src/components/context/SportBreakdown.tsx

import React from 'react';
import { getDisciplineTailwindClass } from '@/lib/context-utils';

interface SportData {
  workload: number;
  percent: number;
  sessions: number;
}

interface SportBreakdown {
  run: SportData;
  bike: SportData;
  swim: SportData;
  strength: SportData;
  mobility: SportData;
  total_workload: number;
}

interface SportBreakdownProps {
  breakdown: SportBreakdown;
}

// Labels only - colors come from getDisciplineTailwindClass for consistency
const sportLabels: Record<string, string> = {
  run: 'Run',
  bike: 'Bike',
  swim: 'Swim',
  strength: 'Strength',
  mobility: 'Mobility',
};

export const SportBreakdown: React.FC<SportBreakdownProps> = ({ breakdown }) => {
  // Filter to sports with activity
  const activeSports = Object.entries(breakdown)
    .filter(([key, data]) => 
      key !== 'total_workload' && 
      typeof data === 'object' && 
      data.workload > 0
    )
    .sort((a, b) => (b[1] as SportData).workload - (a[1] as SportData).workload);

  if (activeSports.length === 0) {
    return null;
  }

  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="text-sm font-medium text-white mb-3">Sport Breakdown (7 days)</div>
      
      <div className="space-y-2">
        {activeSports.map(([sport, data]) => {
          const sportData = data as SportData;
          const label = sportLabels[sport] || sport;
          const colorClass = getDisciplineTailwindClass(sport);
          
          return (
            <div key={sport} className="flex items-center gap-3">
              {/* Progress bar */}
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${colorClass} rounded-full`}
                  style={{ width: `${sportData.percent}%` }}
                />
              </div>
              
              {/* Labels */}
              <div className="flex items-center gap-2 min-w-[140px]">
                <span className="text-sm text-white">{label}</span>
                <span className="text-xs text-white/60">
                  {sportData.workload} ({sportData.percent}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

---

## Component: `SmartInsights`

```typescript
// src/components/context/SmartInsights.tsx

import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface Insight {
  type: 'acwr_high' | 'consecutive_hard' | 'sport_imbalance' | 'weekly_jump';
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

interface SmartInsightsProps {
  insights: Insight[];
}

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    bg: 'bg-red-500/20',
    border: 'border-red-500/30',
    text: 'text-red-400',
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
  },
};

export const SmartInsights: React.FC<SmartInsightsProps> = ({ insights }) => {
  return (
    <div className="space-y-2">
      {insights.map((insight, idx) => {
        const config = severityConfig[insight.severity];
        const Icon = config.icon;
        
        return (
          <div 
            key={idx}
            className={`${config.bg} border ${config.border} rounded-lg p-3 flex items-start gap-2`}
          >
            <Icon className={`w-4 h-4 ${config.text} flex-shrink-0 mt-0.5`} />
            <p className={`text-sm ${config.text}`}>{insight.message}</p>
          </div>
        );
      })}
    </div>
  );
};
```

---

## Utility Functions

```typescript
// src/lib/context-utils.ts

/**
 * Unified sport colors (glassmorphism theme)
 * Use these everywhere for consistency across Context components
 */
export const SPORT_COLORS = {
  run: '#14b8a6',      // teal-500
  running: '#14b8a6',  // alias
  bike: '#22c55e',     // green-500
  ride: '#22c55e',     // alias
  cycling: '#22c55e',  // alias
  swim: '#3b82f6',     // blue-500
  swimming: '#3b82f6', // alias
  strength: '#f97316', // orange-500
  mobility: '#a855f7', // purple-500
  pilates_yoga: '#a855f7', // alias
} as const;

/**
 * Get discipline color for charts and indicators
 */
export function getDisciplineColor(type: string): string {
  const normalized = (type || '').toLowerCase();
  return SPORT_COLORS[normalized as keyof typeof SPORT_COLORS] || '#64748b'; // gray-500 fallback
}

/**
 * Get Tailwind class for discipline (for components using Tailwind)
 */
export function getDisciplineTailwindClass(type: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'run' || t === 'running') return 'bg-teal-500';
  if (t === 'ride' || t === 'cycling' || t === 'bike') return 'bg-green-500';
  if (t === 'swim' || t === 'swimming') return 'bg-blue-500';
  if (t === 'strength') return 'bg-orange-500';
  if (t === 'mobility' || t === 'pilates_yoga') return 'bg-purple-500';
  return 'bg-gray-500';
}

/**
 * Get ACWR status from ratio
 */
export function getACWRStatus(ratio: number): 'undertrained' | 'optimal' | 'elevated' | 'high_risk' {
  if (ratio < 0.80) return 'undertrained';
  if (ratio <= 1.30) return 'optimal';
  if (ratio <= 1.50) return 'elevated';
  return 'high_risk';
}

/**
 * Calculate consecutive hard days
 */
export function calculateConsecutiveHardDays(
  timeline: Array<{ daily_total: number }>,
  threshold: number = 80
): number {
  let maxConsecutive = 0;
  let current = 0;
  
  for (const day of timeline) {
    if (day.daily_total >= threshold) {
      current++;
      maxConsecutive = Math.max(maxConsecutive, current);
    } else {
      current = 0;
    }
  }
  
  return maxConsecutive;
}

/**
 * Detect sport imbalance
 */
export function detectSportImbalance(
  breakdown: Record<string, { percent: number }>,
  threshold: number = 65
): { sport: string; percent: number } | null {
  for (const [sport, data] of Object.entries(breakdown)) {
    if (sport !== 'total_workload' && data.percent > threshold) {
      return { sport, percent: Math.round(data.percent) };
    }
  }
  return null;
}

/**
 * Format workload for display
 */
export function formatWorkload(workload: number): string {
  if (workload >= 1000) {
    return `${(workload / 1000).toFixed(1)}k`;
  }
  return Math.round(workload).toString();
}
```

---

## Component: `ActivityTimeline`

```typescript
// src/components/context/ActivityTimeline.tsx

import React from 'react';
import { getDisciplineColor } from '@/lib/context-utils';

interface TimelineWorkout {
  id: string;
  type: string;
  name: string;
  workload_actual: number;
  duration: number;
  status: 'completed' | 'planned' | 'skipped';
}

interface TimelineDay {
  date: string;
  workouts: TimelineWorkout[];
  daily_total: number;
  is_acute_window: boolean;
}

interface ActivityTimelineProps {
  timeline: TimelineDay[];
  focusDate: string;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ 
  timeline, 
  focusDate 
}) => {
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T12:00:00'); // Avoid timezone issues
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA');
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA');
    
    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterdayStr) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatWorkload = (workload: number): string => {
    if (workload >= 1000) return `${(workload / 1000).toFixed(1)}k`;
    return Math.round(workload).toString();
  };

  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="text-sm font-medium text-white mb-3">Recent Activity (14 days)</div>
      
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {timeline.map((day) => {
          const isToday = day.date === focusDate;
          const isAcuteWindow = day.is_acute_window;
          
          return (
            <div 
              key={day.date}
              className={`flex items-start gap-3 py-1 ${
                isToday ? 'opacity-100' : isAcuteWindow ? 'opacity-80' : 'opacity-60'
              }`}
            >
              {/* Date column */}
              <div className="w-20 flex-shrink-0">
                <div className="text-xs text-white/60">{formatDate(day.date)}</div>
              </div>
              
              {/* Workouts column */}
              <div className="flex-1 min-w-0">
                {day.workouts.length === 0 ? (
                  <div className="text-sm text-white/40 italic">Rest day</div>
                ) : (
                  <div className="space-y-1">
                    {day.workouts.map((workout) => (
                      <div key={workout.id} className="flex items-center gap-2">
                        {/* Sport indicator dot */}
                        <div 
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ 
                            backgroundColor: getDisciplineColor(workout.type),
                            opacity: workout.status === 'planned' ? 0.5 : 1
                          }}
                        />
                        
                        {/* Workout name */}
                        <span className={`text-sm truncate ${
                          workout.status === 'planned' 
                            ? 'text-white/50 italic' 
                            : 'text-white/80'
                        }`}>
                          {workout.status === 'planned' && 'Planned: '}
                          {workout.name}
                        </span>
                        
                        {/* Workload */}
                        {workout.workload_actual > 0 && (
                          <span className="text-xs text-white/40 flex-shrink-0">
                            {formatWorkload(workout.workload_actual)} wl
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Daily total (for days with workouts) */}
              {day.daily_total > 0 && (
                <div className="w-12 text-right text-xs text-white/40 flex-shrink-0">
                  {formatWorkload(day.daily_total)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

---

## Integration with Existing System

### Updating `ContextTabs.tsx`

```typescript
// Replace WeeklyAnalysisTab import
import TrainingContextTab from './context/TrainingContextTab';

// In tabs:
<TabsContent value="weekly" className="flex-1 p-1">
  <TrainingContextTab />  {/* Was: WeeklyAnalysisTab */}
</TabsContent>
```

### Cache Invalidation on Workout Changes

```typescript
// In workout save handlers (StrengthLogger, etc.)
const invalidateContextCache = () => {
  const today = new Date().toLocaleDateString('en-CA');
  localStorage.removeItem(`training_context_${today}`);
};

// After successful workout save:
invalidateContextCache();
```

---

## Implementation Checklist

### Phase 1: Foundation (Edge Function + Hook)

- [ ] **Create edge function** `supabase/functions/generate-training-context/index.ts`
  - [ ] Set up CORS headers
  - [ ] Accept `user_id`, `date`, optional `workout_id`
  - [ ] Query last 28 days of completed workouts
  - [ ] Query planned workout for focus date (if any)
  - [ ] Return basic timeline and sport breakdown

- [ ] **Create utility file** `src/lib/context-utils.ts`
  - [ ] `SPORT_COLORS` constant
  - [ ] `getDisciplineColor()` function
  - [ ] `getDisciplineTailwindClass()` function
  - [ ] `getACWRStatus()` function
  - [ ] `calculateConsecutiveHardDays()` function
  - [ ] `detectSportImbalance()` function
  - [ ] `formatWorkload()` function

### Phase 2: ACWR + Insights

- [ ] **Implement ACWR calculation** in edge function
  - [ ] Rolling 7-day acute (sum / 7)
  - [ ] Rolling 28-day chronic (sum / 28)
  - [ ] Ratio calculation
  - [ ] Status determination
  - [ ] Progressive disclosure (data_days)
  - [ ] Projected ACWR (if planned workout exists)

- [ ] **Implement week comparison** in edge function
  - [ ] Current 7-day total
  - [ ] Previous 7-day total
  - [ ] Change percent and direction

- [ ] **Implement smart insights** in edge function
  - [ ] High ACWR warning (>1.30)
  - [ ] Consecutive hard days (3+ days, workload >80)
  - [ ] Large weekly jump (>30% increase)
  - [ ] Sport imbalance (>65% one sport)
  - [ ] Priority ordering (max 3)

### Phase 3: Hook + Components

- [ ] **Create hook** `src/hooks/useTrainingContext.ts`
  - [ ] State management (data, loading, error)
  - [ ] LocalStorage caching (1 hour TTL)
  - [ ] Fetch from edge function
  - [ ] Refresh capability

- [ ] **Create components** in `src/components/context/`
  - [ ] `ACWRGauge.tsx` - ACWR display with gauge bar
  - [ ] `TrainingLoadChart.tsx` - 7-day stacked bar chart
  - [ ] `SportBreakdown.tsx` - Sport distribution bars
  - [ ] `SmartInsights.tsx` - Insight cards
  - [ ] `ActivityTimeline.tsx` - 14-day workout list

### Phase 4: Integration

- [ ] **Create main tab** `src/components/context/TrainingContextTab.tsx`
  - [ ] Wire up all components
  - [ ] Handle loading/error states
  - [ ] Add refresh button

- [ ] **Update ContextTabs.tsx**
  - [ ] Replace `WeeklyAnalysisTab` with `TrainingContextTab`
  - [ ] Update tab label if needed

- [ ] **Add cache invalidation**
  - [ ] In `StrengthLogger.tsx` on save
  - [ ] In workout completion handlers
  - [ ] On Strava/Garmin import

### Phase 5: Testing & Polish

- [ ] **Test progressive disclosure**
  - [ ] New user with 0 days → message shown
  - [ ] 7 days → preliminary ACWR with caveat
  - [ ] 14 days → ACWR with data count
  - [ ] 28+ days → full ACWR, no caveat

- [ ] **Test insights accuracy**
  - [ ] High ACWR triggers at >1.30
  - [ ] Consecutive hard days detected
  - [ ] Weekly jump detected at >30%
  - [ ] Sport imbalance detected at >65%

- [ ] **Test edge cases**
  - [ ] No workouts in range
  - [ ] Only planned, no completed
  - [ ] All rest days
  - [ ] Very high workload days (chart scaling)

- [ ] **Performance optimization**
  - [ ] Cache working correctly
  - [ ] Edge function response time <500ms
  - [ ] UI renders without flicker

---

## Files to Create

```
New files:
├── supabase/functions/generate-training-context/index.ts
├── src/lib/context-utils.ts
├── src/hooks/useTrainingContext.ts
├── src/components/context/TrainingContextTab.tsx
├── src/components/context/ACWRGauge.tsx
├── src/components/context/TrainingLoadChart.tsx
├── src/components/context/SportBreakdown.tsx
├── src/components/context/SmartInsights.tsx
└── src/components/context/ActivityTimeline.tsx

Files to modify:
├── src/components/ContextTabs.tsx (replace WeeklyAnalysisTab)
└── src/components/StrengthLogger.tsx (add cache invalidation)
```

---

## Quick Start Commands

```bash
# Create edge function directory
mkdir -p supabase/functions/generate-training-context

# Create component files
touch src/lib/context-utils.ts
touch src/hooks/useTrainingContext.ts
touch src/components/context/TrainingContextTab.tsx
touch src/components/context/ACWRGauge.tsx
touch src/components/context/TrainingLoadChart.tsx
touch src/components/context/SportBreakdown.tsx
touch src/components/context/SmartInsights.tsx
touch src/components/context/ActivityTimeline.tsx
```

