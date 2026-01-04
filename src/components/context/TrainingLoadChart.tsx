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
  
  // Find max daily total for scaling with minimum to prevent distortion
  const maxDayTotal = Math.max(...weekData.map(d => d.daily_total), 100);
  const effectiveMax = Math.max(maxDayTotal, 150);
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

      {/* Bar Chart */}
      <div className="flex items-end justify-between gap-1" style={{ height: chartHeight }}>
        {chronologicalData.map((day, idx) => {
          const dayDate = new Date(day.date + 'T12:00:00');
          const dayLabel = dayAbbrev[dayDate.getDay()];
          const barHeight = Math.min((day.daily_total / effectiveMax) * chartHeight, chartHeight);
          
          // Group workouts by type for stacking
          const workoutsByType: Record<string, number> = {};
          day.workouts
            .filter(w => w.status === 'completed')
            .forEach(w => {
              const type = w.type.toLowerCase();
              workoutsByType[type] = (workoutsByType[type] || 0) + w.workload_actual;
            });

          // Sort by workload for consistent stacking
          const sortedTypes = Object.entries(workoutsByType)
            .sort((a, b) => b[1] - a[1]);

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center">
              {/* Stacked bar */}
              <div 
                className="w-full rounded-t overflow-hidden flex flex-col-reverse"
                style={{ height: barHeight }}
              >
                {sortedTypes.map(([type, workload]) => {
                  const segmentHeight = day.daily_total > 0 
                    ? (workload / day.daily_total) * barHeight 
                    : 0;
                  return (
                    <div
                      key={type}
                      className="w-full transition-all duration-300"
                      style={{ 
                        height: segmentHeight,
                        backgroundColor: getDisciplineColor(type)
                      }}
                    />
                  );
                })}
                
                {/* Empty placeholder if no workouts */}
                {sortedTypes.length === 0 && (
                  <div className="w-full h-full bg-white/5 rounded-t" />
                )}
              </div>
              
              {/* Day label */}
              <div className="text-xs text-white/40 mt-1">{dayLabel}</div>
              
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

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-white/10">
        {[
          { type: 'run', label: 'Run' },
          { type: 'bike', label: 'Bike' },
          { type: 'swim', label: 'Swim' },
          { type: 'strength', label: 'Strength' },
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

