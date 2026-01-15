/**
 * =============================================================================
 * TRAINING LOAD CHART COMPONENT
 * =============================================================================
 * 
 * Displays a 7-day stacked bar chart showing:
 * - Daily workload totals
 * - Stacked by sport type (color-coded)
 * - Day labels
 * - Total workload for the period
 */

import React from 'react';
import { getDisciplineColor, formatWorkload } from '@/lib/context-utils';
import type { TimelineDay } from '@/hooks/useTrainingContext';

interface TrainingLoadChartProps {
  timeline: TimelineDay[];
  totalWorkload: number;
}

export const TrainingLoadChart: React.FC<TrainingLoadChartProps> = ({ 
  timeline, 
  totalWorkload 
}) => {
  // Take only the last 7 days (timeline is reverse chronological)
  const weekData = timeline.slice(0, 7);
  
  // Find max daily total for scaling
  const dailyTotals = weekData.map(d => d.daily_total);
  const maxDayTotal = Math.max(...dailyTotals, 1); // At least 1 to avoid division by zero
  
  // Scale to chart height: ensure max bar uses ~95% of height to prevent overflow
  // This gives visual breathing room and prevents any rounding/rendering edge cases
  const effectiveMax = maxDayTotal / 0.95; // Max bar will be 95% of chartHeight
  const chartHeight = 120; // pixels

  // Day abbreviations
  const dayAbbrev = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Reverse to show in chronological order (oldest on left)
  const chronologicalData = [...weekData].reverse();

  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-white">7-Day Training Load</div>
        <div className="text-sm text-white/60">{formatWorkload(totalWorkload)} total</div>
      </div>

      {/* Bar Chart Container */}
      <div className="relative" style={{ height: `${chartHeight}px` }}>
        {/* Bars aligned to bottom */}
        <div 
          className="flex items-end justify-between gap-1 absolute bottom-0 left-0 right-0"
          style={{ 
            height: chartHeight
          }}
        >
          {chronologicalData.map((day, idx) => {
            const dayDate = new Date(day.date + 'T12:00:00');
            const dayLabel = dayAbbrev[dayDate.getDay()];
            // Calculate bar height: max bar will be 95% of chartHeight, others scale proportionally
            const barHeight = Math.min((day.daily_total / effectiveMax) * chartHeight, chartHeight * 0.95);
            
            // Group workouts by type for stacking
            // Normalize types to match backend normalization (same as generate-training-context)
            const normalizeType = (type: string): string => {
              const t = (type || '').toLowerCase();
              if (t === 'run' || t === 'running') return 'run';
              if (t === 'ride' || t === 'bike' || t === 'cycling') return 'bike';
              if (t === 'swim' || t === 'swimming') return 'swim';
              if (t === 'strength' || t === 'strength_training' || t === 'weight' || t === 'weights') return 'strength';
              if (t === 'mobility' || t === 'pilates' || t === 'yoga' || t === 'pilates_yoga' || t === 'stretch') return 'mobility';
              return t; // Return as-is for other types
            };

            const workoutsByType: Record<string, number> = {};
            day.workouts
              .filter(w => w.status === 'completed')
              .forEach(w => {
                const normalizedType = normalizeType(w.type);
                const workload = w.workload_actual || 0;
                if (workload > 0) { // Only include workouts with actual workload
                  workoutsByType[normalizedType] = (workoutsByType[normalizedType] || 0) + workload;
                }
              });

            // Sort by workload for consistent stacking (largest at bottom)
            const sortedTypes = Object.entries(workoutsByType)
              .sort((a, b) => b[1] - a[1]);

            return (
              <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full">
                {/* Stacked bar - positioned at bottom, segments stack upward from bottom */}
                <div 
                  className="w-full rounded-t overflow-hidden relative"
                  style={{ 
                    height: `${barHeight}px`,
                    maxHeight: `${chartHeight}px`,
                    flexShrink: 0
                  }}
                >
                  {/* Calculate segment positions - stack from bottom to top */}
                  {(() => {
                    let bottomOffset = 0;
                    return sortedTypes.map(([type, workload]) => {
                      const segmentHeight = day.daily_total > 0 
                        ? (workload / day.daily_total) * barHeight 
                        : 0;
                      
                      if (segmentHeight <= 0) return null;
                      
                      const currentBottom = bottomOffset;
                      bottomOffset += segmentHeight;
                      
                      return (
                        <div
                          key={type}
                          className="w-full absolute left-0 transition-all duration-300"
                          style={{ 
                            height: `${segmentHeight}px`,
                            bottom: `${currentBottom}px`,
                            backgroundColor: getDisciplineColor(type)
                          }}
                        />
                      );
                    }).filter(Boolean);
                  })()}
                  
                  {/* Empty placeholder if no workouts */}
                  {sortedTypes.length === 0 && (
                    <div className="w-full h-full bg-white/5 rounded-t" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Labels positioned below bars */}
        <div className="flex justify-between gap-1 absolute top-full left-0 right-0 mt-1">
          {chronologicalData.map((day) => {
            const dayDate = new Date(day.date + 'T12:00:00');
            const dayLabel = dayAbbrev[dayDate.getDay()];
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center">
                {/* Day label */}
                <div className="text-xs text-white/40">{dayLabel}</div>
                
                {/* Workload label (for non-zero days) */}
                {day.daily_total > 0 && (
                  <div className="text-xs text-white/30 mt-0.5">
                    {Math.round(day.daily_total)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-white/10">
        {[
          { type: 'run', label: 'Run' },
          { type: 'bike', label: 'Bike' },
          { type: 'swim', label: 'Swim' },
          { type: 'strength', label: 'Strength' },
          { type: 'mobility', label: 'Mobility' },
        ].map(({ type, label }) => (
          <div key={type} className="flex items-center gap-1">
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getDisciplineColor(type) }}
            />
            <span className="text-xs text-white/50">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TrainingLoadChart;

