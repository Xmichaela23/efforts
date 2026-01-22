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
import { formatWorkload, getDisciplinePhosphorCore } from '@/lib/context-utils';
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
    <div 
      className="backdrop-blur-md rounded-lg p-4"
      style={{
        background: 'radial-gradient(ellipse at center top, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.25) 100%)',
        border: '0.5px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium" style={{ color: 'rgba(255, 255, 255, 0.92)' }}>Sport Breakdown</div>
        <div className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Last 7 days</div>
      </div>
      
      {/* Bars */}
      <div className="space-y-3">
        {activeSports.map(([sport, data]) => {
          const sportData = data as { workload: number; percent: number; sessions: number };
          const label = sportLabels[sport] || sport;
          const disciplineColor = getDisciplinePhosphorCore(sport);
          
          return (
            <div key={sport}>
              {/* Label row */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm" style={{ color: disciplineColor }}>{label}</span>
                <span className="text-xs text-white/60">
                  {formatWorkload(sportData.workload)} ({sportData.percent}%)
                </span>
              </div>
              
              {/* Progress bar */}
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                <div 
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${sportData.percent}%`, backgroundColor: disciplineColor }}
                />
              </div>
              
              {/* Sessions count */}
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                {sportData.sessions} session{sportData.sessions !== 1 ? 's' : ''}
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="mt-4 pt-3 flex items-center justify-between" style={{ borderTop: '0.5px solid rgba(255, 255, 255, 0.08)' }}>
        <span className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Workload</span>
        <span className="text-sm font-medium" style={{ color: 'rgba(255, 255, 255, 0.92)' }}>
          {formatWorkload(breakdown.total_workload)}
        </span>
      </div>
    </div>
  );
};

export default SportBreakdown;

