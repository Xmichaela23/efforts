/**
 * =============================================================================
 * ACTIVITY TIMELINE COMPONENT
 * =============================================================================
 * 
 * Displays a 14-day activity timeline:
 * - Each day with its workouts
 * - Rest days shown as empty
 * - Planned workouts shown differently
 * - Acute window highlighted
 */

import React from 'react';
import { getDisciplineColor, formatWorkload, formatTimelineDate } from '@/lib/context-utils';
import type { TimelineDay } from '@/hooks/useTrainingContext';

interface ActivityTimelineProps {
  timeline: TimelineDay[];
  focusDate: string;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ 
  timeline, 
  focusDate 
}) => {
  return (
    <div className="bg-white/[0.05] backdrop-blur-md border border-white/20 rounded-lg p-4">
      {/* Header */}
      <div className="text-sm font-medium text-white mb-3">Recent Activity</div>
      
      {/* Timeline list */}
      <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
        {timeline.map((day) => {
          const isToday = day.date === focusDate;
          const isAcuteWindow = day.is_acute_window;
          
          return (
            <div 
              key={day.date}
              className={`flex items-start gap-3 py-2 rounded-lg px-2 transition-colors ${
                isToday 
                  ? 'bg-white/[0.05]' 
                  : 'hover:bg-white/[0.03]'
              } ${
                isAcuteWindow ? 'opacity-100' : 'opacity-60'
              }`}
            >
              {/* Date column */}
              <div className="w-20 flex-shrink-0">
                <div className={`text-xs ${isToday ? 'text-white font-medium' : 'text-white/60'}`}>
                  {formatTimelineDate(day.date)}
                </div>
                {isAcuteWindow && !isToday && (
                  <div className="text-xs text-white/30 mt-0.5">acute</div>
                )}
              </div>
              
              {/* Workouts column */}
              <div className="flex-1 min-w-0">
                {day.workouts.length === 0 ? (
                  <div className="text-sm text-white/30 italic">Rest day</div>
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
                        
                        {/* Workload badge */}
                        {workout.workload_actual > 0 && (
                          <span className="text-xs text-white/40 flex-shrink-0 bg-white/5 px-1.5 py-0.5 rounded">
                            {formatWorkload(workout.workload_actual)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Daily total (for days with completed workouts) */}
              {day.daily_total > 0 && (
                <div className="w-14 text-right text-xs text-white/40 flex-shrink-0">
                  {formatWorkload(day.daily_total)} wl
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <div className="text-xs text-white/30 text-center">
          Showing last 14 days • Acute window (last 7 days) highlighted
        </div>
      </div>
    </div>
  );
};

export default ActivityTimeline;

