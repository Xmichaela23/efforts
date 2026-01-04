/**
 * =============================================================================
 * SPORT BREAKDOWN COMPONENT
 * =============================================================================
 * 
 * Displays sport distribution as horizontal progress bars:
 * - Each sport with workload and percentage
 * - Sorted by workload (highest first)
 * - Only shows sports with activity
 */

import React from 'react';
import { getDisciplineTailwindClass, formatWorkload } from '@/lib/context-utils';
import type { SportBreakdown as SportBreakdownType } from '@/hooks/useTrainingContext';

interface SportBreakdownProps {
  breakdown: SportBreakdownType;
}

// Sport labels
const sportLabels: Record<string, string> = {
  run: 'Run',
  bike: 'Bike',
  swim: 'Swim',
  strength: 'Strength',
  mobility: 'Mobility',
};

export const SportBreakdown: React.FC<SportBreakdownProps> = ({ breakdown }) => {
  // Filter to sports with activity and sort by workload
  const activeSports = Object.entries(breakdown)
    .filter(([key, data]) => 
      key !== 'total_workload' && 
      typeof data === 'object' && 
      data !== null &&
      'workload' in data &&
      data.workload > 0
    )
    .sort((a, b) => {
      const aData = a[1] as { workload: number };
      const bData = b[1] as { workload: number };
      return bData.workload - aData.workload;
    });

  // Don't render if no active sports
  if (activeSports.length === 0) {
    return null;
  }

  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-white">Sport Breakdown</div>
        <div className="text-sm text-white/60">Last 7 days</div>
      </div>
      
      {/* Bars */}
      <div className="space-y-3">
        {activeSports.map(([sport, data]) => {
          const sportData = data as { workload: number; percent: number; sessions: number };
          const label = sportLabels[sport] || sport;
          const colorClass = getDisciplineTailwindClass(sport);
          
          return (
            <div key={sport}>
              {/* Label row */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white">{label}</span>
                <span className="text-xs text-white/60">
                  {formatWorkload(sportData.workload)} ({sportData.percent}%)
                </span>
              </div>
              
              {/* Progress bar */}
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${colorClass} rounded-full transition-all duration-300`}
                  style={{ width: `${sportData.percent}%` }}
                />
              </div>
              
              {/* Sessions count */}
              <div className="text-xs text-white/40 mt-0.5">
                {sportData.sessions} session{sportData.sessions !== 1 ? 's' : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
        <span className="text-sm text-white/60">Total Workload</span>
        <span className="text-sm font-medium text-white">
          {formatWorkload(breakdown.total_workload)}
        </span>
      </div>
    </div>
  );
};

export default SportBreakdown;

