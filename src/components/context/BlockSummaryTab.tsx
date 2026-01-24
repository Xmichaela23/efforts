/**
 * =============================================================================
 * BLOCK SUMMARY TAB (v2)
 * =============================================================================
 * 
 * Smart Server, Dumb Client Architecture
 * 
 * - Receives structured data from generate-overall-context
 * - Renders each section with consistent formatting
 * - No interpretation or calculation - just display
 */

import React, { useState } from 'react';
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown,
  Minus,
  CheckCircle, 
  Calendar, 
  Loader2, 
  Bike, 
  Activity, 
  Dumbbell, 
  Waves,
  Target,
  AlertTriangle,
  Info,
  CheckCircle2
} from 'lucide-react';
import { useOverallContext } from '@/hooks/useOverallContext';

// =============================================================================
// CONSTANTS
// =============================================================================

const DISCIPLINE_CONFIG = {
  run: {
    icon: Activity,
    color: 'text-teal-400',
    bgColor: 'bg-teal-400/10',
    borderColor: 'border-teal-400/30'
  },
  bike: {
    icon: Bike,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    borderColor: 'border-green-400/30'
  },
  swim: {
    icon: Waves,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30'
  },
  strength: {
    icon: Dumbbell,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    borderColor: 'border-orange-400/30'
  }
};

const STATUS_CONFIG = {
  good: { icon: '✅', color: 'text-green-400' },
  warning: { icon: '⚠️', color: 'text-amber-400' },
  critical: { icon: '🔴', color: 'text-red-400' },
  over: { icon: 'ℹ️', color: 'text-blue-400' },
  info: { icon: 'ℹ️', color: 'text-white/50' }
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const BlockSummaryTab: React.FC = () => {
  const { data, loading, error, refresh } = useOverallContext(4);
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
        <div className="text-sm">Analyzing your training block...</div>
        <div className="text-xs text-white/40 mt-1">This may take a moment</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="px-4 py-8">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
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

  // Determine which data format we're using (structured vs legacy)
  // Structured data uses `_structured` suffix to avoid conflicts with legacy string fields
  const hasStructuredData = data.performance_trends_structured && typeof data.performance_trends_structured === 'object';

  return (
    <div className="space-y-3 pb-6">
      {/* Cockpit strip (matches dashboard language) */}
      <div
        className="flex items-center justify-between relative"
        style={{
          backgroundColor: '#000000',
          padding: '0.55rem 0.75rem',
          borderRadius: '10px',
          border: '0.5px solid rgba(255, 255, 255, 0.08)',
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.05) inset,
            inset 0 1px 0 rgba(255,255,255,0.18),
            inset -1px -1px 0 rgba(0,0,0,0.35),
            0 8px 18px rgba(0,0,0,0.45),
            0 0 22px rgba(255,255,255,0.06)
          `,
        }}
      >
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.40)' }}>
            Block
          </span>
          <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>
            4-Week Block
          </span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.50)' }}>
            Performance trends and training patterns
          </span>
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

      <div aria-hidden="true" className="instrument-divider" />

      {hasStructuredData ? (
        <>
          {/* Performance Trends - Structured */}
          <PerformanceTrendsSection trends={data.performance_trends_structured} quality={data.data_quality} />
          
          {/* Plan Adherence - Structured */}
          <PlanAdherenceSection adherence={data.plan_adherence_structured} />
          
          {/* Workout Quality - Structured */}
          <WorkoutQualitySection quality={data.workout_quality} />
          
          {/* This Week - Structured */}
          <ThisWeekSection week={data.this_week} />
          
          {/* Focus Areas - Structured */}
          <FocusAreasSection focusAreas={data.focus_areas} goal={data.goal} />
        </>
      ) : (
        <>
          {/* Legacy text-based rendering */}
          <LegacyPerformanceTrends data={data} />
          <LegacyPlanAdherence data={data} />
          <LegacyWeeklySummary data={data} />
        </>
      )}
    </div>
  );
};

// =============================================================================
// STRUCTURED DATA SECTIONS
// =============================================================================

const PerformanceTrendsSection: React.FC<{ trends: any; quality: any }> = ({ trends, quality }) => {
  const hasAnyTrend = trends?.run?.reliable || trends?.bike?.reliable;
  
  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-teal-500" />
        <h3 className="text-sm font-medium text-white">Performance Trends</h3>
      </div>
      
      <div className="space-y-3">
        {/* Run Trend */}
        <TrendItem 
          discipline="run" 
          trend={trends?.run} 
          quality={quality?.run}
        />
        
        {/* Bike Trend */}
        <TrendItem 
          discipline="bike" 
          trend={trends?.bike} 
          quality={quality?.bike}
        />
      </div>
      
      {/* Data quality notes */}
      {quality && (
        <DataQualityNotes quality={quality} />
      )}
    </div>
  );
};

const TrendItem: React.FC<{ discipline: string; trend: any; quality: any }> = ({ 
  discipline, 
  trend, 
  quality 
}) => {
  const config = DISCIPLINE_CONFIG[discipline as keyof typeof DISCIPLINE_CONFIG];
  if (!config) return null;
  
  const Icon = config.icon;
  
  if (!trend) {
    return (
      <div className="flex items-center gap-3 text-white/40">
        <Icon className="w-4 h-4" />
        <span className="text-sm capitalize">{discipline}</span>
        <span className="text-xs">No data</span>
      </div>
    );
  }
  
  if (!trend.reliable) {
    return (
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 mt-0.5 ${config.color}`} />
        <div>
          <span className={`text-sm capitalize ${config.color}`}>{discipline}</span>
          <p className="text-xs text-white/50 mt-0.5">{trend.message || 'Insufficient data'}</p>
        </div>
      </div>
    );
  }
  
  // Reliable trend
  const isPositive = trend.change_percent > 0;
  const TrendIcon = isPositive ? TrendingUp : trend.change_percent < 0 ? TrendingDown : Minus;
  // Use emerald for trends to distinguish from discipline colors (green=bike, teal=run)
  const changeColor = isPositive ? 'text-emerald-400' : trend.change_percent < 0 ? 'text-rose-400' : 'text-white/60';
  const sign = isPositive ? '+' : '';
  
  // Efficiency signal
  const eff = trend.efficiency;
  const effSignal = eff?.signal;
  const effColor = effSignal === 'improving' ? 'text-emerald-400' : 
                   effSignal === 'fatigued' ? 'text-amber-400' : 'text-white/50';
  const effIcon = effSignal === 'improving' ? '↓' : effSignal === 'fatigued' ? '↑' : '';
  
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className={`text-sm capitalize ${config.color}`}>{discipline}</span>
        <div className="flex items-center gap-2 text-sm text-white/80">
          <span>{trend.previous}</span>
          <span className="text-white/40">→</span>
          <span>{trend.current}</span>
          <span className={`${changeColor} flex items-center gap-1`}>
            <TrendIcon className="w-3 h-3" />
            {sign}{trend.change_percent}%
          </span>
        </div>
      </div>
      {/* Cardiac efficiency if available */}
      {eff && eff.signal && (
        <div className={`ml-8 text-xs ${effColor}`}>
          HR: {eff.previous_hr} → {eff.current_hr} bpm ({effIcon}{Math.abs(eff.hr_change)} bpm)
          {effSignal === 'improving' && ' • more efficient'}
          {effSignal === 'fatigued' && ' • possible fatigue'}
        </div>
      )}
    </div>
  );
};

const DataQualityNotes: React.FC<{ quality: any }> = ({ quality }) => {
  const notes: { discipline: string; note: string }[] = [];
  
  if (quality.run?.note && !quality.run.can_trend) {
    notes.push({ discipline: 'run', note: quality.run.note });
  }
  if (quality.bike?.note && !quality.bike.can_trend) {
    notes.push({ discipline: 'bike', note: quality.bike.note });
  }
  if (quality.strength?.note) {
    notes.push({ discipline: 'strength', note: quality.strength.note });
  }
  
  if (notes.length === 0) return null;
  
  return (
    <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
      {notes.map(({ discipline, note }) => {
        const config = DISCIPLINE_CONFIG[discipline as keyof typeof DISCIPLINE_CONFIG];
        if (!config) return null;
        const Icon = config.icon;
        
        return (
          <div 
            key={discipline}
            className={`flex items-start gap-2 p-2 rounded ${config.bgColor} ${config.borderColor} border`}
          >
            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
            <p className={`text-xs ${config.color}`}>{note}</p>
          </div>
        );
      })}
    </div>
  );
};

const PlanAdherenceSection: React.FC<{ adherence: any }> = ({ adherence }) => {
  if (!adherence) return null;
  
  const statusColors = {
    on_track: 'text-green-400',
    needs_attention: 'text-amber-400',
    falling_behind: 'text-red-400'
  };
  
  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <h3 className="text-sm font-medium text-white">Plan Adherence</h3>
        </div>
        <div className={`text-sm font-medium ${statusColors[adherence.overall?.status as keyof typeof statusColors] || 'text-white'}`}>
          {adherence.overall?.percent}%
        </div>
      </div>
      
      {/* Discipline breakdown */}
      <div className="space-y-2">
        {adherence.by_discipline?.map((item: any) => {
          if (item.planned === 0) return null;
          
          const statusConfig = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.info;
          
          return (
            <div key={item.discipline} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span>{statusConfig.icon}</span>
                <span className="capitalize text-white/80">{item.discipline}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/60">{item.completed}/{item.planned}</span>
                <span className={`text-xs ${statusConfig.color}`}>
                  {item.note}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Patterns */}
      {adherence.patterns?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10">
          {adherence.patterns.map((pattern: string, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              <span>{pattern}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Workout Quality Section - Shows execution quality patterns with trends
const WorkoutQualitySection: React.FC<{ quality: any }> = ({ quality }) => {
  if (!quality || !quality.items || quality.items.length === 0) return null;
  
  const WORKOUT_TYPE_LABELS: Record<string, string> = {
    intervals: 'Intervals',
    long_runs: 'Long runs',
    tempo: 'Tempo',
    easy: 'Easy runs'
  };
  
  const STATUS_COLORS = {
    good: 'text-emerald-400',
    warning: 'text-amber-400',
    info: 'text-white/60'
  };
  
  const TREND_LABELS: Record<string, string> = {
    improving: 'improving',
    stable: 'stable',
    worsening: 'worsening'
  };
  
  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-teal-500" />
        <h3 className="text-sm font-medium text-white">Workout Quality</h3>
      </div>
      
      <div className="space-y-2">
        {quality.items.map((item: any, i: number) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span>{item.icon}</span>
            <div className="flex-1">
              <span className="text-white/80">
                {WORKOUT_TYPE_LABELS[item.workout_type] || item.workout_type}:
              </span>{' '}
              <span className={STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] || 'text-white/60'}>
                {item.message}
              </span>
              <span className="text-white/40 ml-1">
                ({item.count} workouts)
              </span>
              {item.trend && item.trend !== 'stable' && (
                <span className={`ml-1 ${item.trend === 'improving' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {item.trend_icon} {TREND_LABELS[item.trend]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ThisWeekSection: React.FC<{ week: any }> = ({ week }) => {
  if (!week) return null;
  
  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-medium text-white">This Week</h3>
        </div>
        <span className="text-sm text-white/60">
          {week.completed_count}/{week.planned_count} sessions
        </span>
      </div>
      
      {/* Key workouts */}
      {week.key_workouts?.length > 0 && (
        <div className="space-y-1 mb-3">
          {week.key_workouts.map((kw: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {kw.status === 'completed' ? (
                <CheckCircle2 className="w-3 h-3 text-green-400" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-amber-400" />
              )}
              <span className={kw.status === 'completed' ? 'text-white/80' : 'text-amber-400'}>
                {kw.name}
              </span>
            </div>
          ))}
        </div>
      )}
      
      {/* Missed summary */}
      {week.missed?.length > 0 && (
        <div className="text-xs text-white/50">
          Missed: {groupMissedByDiscipline(week.missed)}
        </div>
      )}
      
      {/* Workload */}
      {week.workload && (
        <div className="mt-2 pt-2 border-t border-white/10 text-xs text-white/50">
          Workload: {week.workload.actual} ({week.workload.percent}% of planned)
        </div>
      )}
      
      {/* Patterns */}
      {week.patterns?.length > 0 && (
        <div className="mt-2">
          {week.patterns.map((pattern: string, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              <span>{pattern}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const FocusAreasSection: React.FC<{ focusAreas: any; goal?: any }> = ({ focusAreas, goal }) => {
  if (!focusAreas?.areas?.length) return null;
  
  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-500" />
          <h3 className="text-sm font-medium text-white">Focus Areas</h3>
        </div>
        {goal?.name && (
          <span className="text-xs text-teal-400">{goal.name}</span>
        )}
      </div>
      
      <div className="space-y-2">
        {focusAreas.areas.map((area: any, i: number) => (
          <div key={i} className="flex items-start gap-3">
            <span className="text-white/40 text-sm">{i + 1}.</span>
            <div>
              <p className="text-sm text-white">{area.action}</p>
              {area.reason && (
                <p className="text-xs text-white/50">{area.reason}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {goal?.weeks_remaining && (
        <div className="mt-3 pt-3 border-t border-white/10 text-xs text-white/50">
          {goal.weeks_remaining} weeks to go
        </div>
      )}
    </div>
  );
};

// =============================================================================
// LEGACY SECTIONS (for backward compatibility)
// =============================================================================

const LegacyPerformanceTrends: React.FC<{ data: any }> = ({ data }) => {
  // Only use string values, never objects
  const text = typeof data.performance_trends === 'string' ? data.performance_trends : null;
  if (!text) return null;
  
  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-teal-500" />
        <h3 className="text-sm font-medium text-white">Performance Trends</h3>
      </div>
      <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">
        {text}
      </p>
    </div>
  );
};

const LegacyPlanAdherence: React.FC<{ data: any }> = ({ data }) => {
  // Only use string values, never objects
  const text = typeof data.plan_adherence === 'string' ? data.plan_adherence : null;
  if (!text) return null;
  
  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle className="w-4 h-4 text-green-500" />
        <h3 className="text-sm font-medium text-white">Plan Adherence</h3>
      </div>
      <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">
        {text}
      </p>
    </div>
  );
};

const LegacyWeeklySummary: React.FC<{ data: any }> = ({ data }) => {
  if (!data.weekly_summary) return null;
  
  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-medium text-white">This Week</h3>
      </div>
      <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">
        {data.weekly_summary}
      </p>
    </div>
  );
};

// =============================================================================
// HELPERS
// =============================================================================

function groupMissedByDiscipline(missed: any[]): string {
  const byDiscipline: Record<string, number> = {};
  for (const m of missed) {
    byDiscipline[m.discipline] = (byDiscipline[m.discipline] || 0) + 1;
  }
  return Object.entries(byDiscipline)
    .map(([d, count]) => `${count} ${d}`)
    .join(', ');
}

export default BlockSummaryTab;
