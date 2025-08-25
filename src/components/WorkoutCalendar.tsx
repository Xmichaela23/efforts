import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import NewEffortDropdown from './NewEffortDropdown';
import LogEffortDropdown from './LogEffortDropdown';
import PlansDropdown from './PlansDropdown';
import AllEffortsDropdown from './AllEffortsDropdown';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { getDisciplineColor as getHexColor } from '@/lib/utils';
import { normalizePlannedSession } from '@/services/plans/normalizer';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const DISCIPLINE_COLORS = {
  run: 'bg-red-500',
  ride: 'bg-green-500', 
  swim: 'bg-blue-500',
  strength: 'bg-orange-500',
  mobility: 'bg-purple-500'
};

interface Plan {
  id: string;
  name: string;
  currentWeek?: number;
  status: 'active' | 'completed';
  description?: string;
}

interface WorkoutCalendarProps {
  onAddEffort: (type: string, date?: string) => void;
  onSelectType: (type: string) => void;
  onSelectWorkout: (workout: any) => void;
  onViewCompleted: () => void;
  onEditEffort: (workout: any) => void;
  onDateSelect?: (dateString: string) => void;
  onSelectRoutine?: (type: string) => void;
  onSelectDiscipline?: (discipline: string) => void;
  onOpenPlanBuilder?: () => void;
  currentPlans?: Plan[]; // NEW: AI-generated current plans
  completedPlans?: Plan[]; // NEW: Completed plans
}

export default function WorkoutCalendar({ 
  onAddEffort, 
  onSelectType, 
  onSelectWorkout, 
  onViewCompleted,
  onEditEffort,
  onDateSelect,
  onSelectRoutine,
  onSelectDiscipline,
  onOpenPlanBuilder,
  currentPlans = [], // NEW: Default to empty array
  completedPlans = [] // NEW: Default to empty array
}: WorkoutCalendarProps) {
  const { workouts } = useAppContext();
  const { plannedWorkouts } = usePlannedWorkouts();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Calendar stays simple; no baselines or summaries needed here

  const navigateMonth = (direction: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  const getWorkoutsForDate = (day: number) => {
    if (!day) return [];
    
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    // 🔧 FIXED: Apply same filtering logic as TodaysEffort - show both planned AND completed
    const today = new Date().toLocaleDateString('en-CA');
    const all = [
      ...(Array.isArray(workouts) ? workouts : []),
      ...(Array.isArray(plannedWorkouts) ? plannedWorkouts : []),
    ];
    
    const filtered = all.filter((w: any) => {
      if (!w || w.date !== dateStr) return false;
      
      // For today and future dates: show both planned AND completed workouts
      if (dateStr >= today) {
        const isPlanned = w.workout_status === 'planned' || !w.workout_status;
        const isCompleted = w.workout_status === 'completed';
        return isPlanned || isCompleted; // ✅ FIXED: Show both planned AND completed
      } 
      // For past dates: show both planned and completed for reference
      else {
        return true;
      }
    });
    
    return filtered;
  };

  const handleDateClick = (day: number, event: React.MouseEvent | React.TouchEvent) => {
    if (!day) return;
    
    // Prevent event from bubbling up to parent handlers
    event.preventDefault();
    event.stopPropagation();
    
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    // quiet calendar cell click logs
    
    // Set this date as selected for visual feedback
    setSelectedDate(dateStr);
    
    // Always update the Today's Effort section to show this date
    // This works for both empty dates and dates with workouts
    if (onDateSelect) {
      onDateSelect(dateStr);
    }

    // Do not auto-open logger. User selects date, then opens logger from the Log menu.
  };

  const isToday = (day: number) => {
    const today = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    if (!day || !selectedDate) return false;
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    return dateStr === selectedDate;
  };

  // Helper functions for discipline display
  const getDisciplineName = (type: string): string => {
    switch (type) {
      case 'run': return 'Run';
      case 'walk': return 'Walk';
      case 'ride': 
      case 'bike': return 'Ride';
      case 'swim': return 'Swim';
      case 'strength': return 'Lift';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  // Prefer provider sport label (e.g., Hike, Gravel Ride) for display
  const getDisplayLabel = (w: any): string => {
    const provider = w?.strava_data?.original_activity?.sport_type || w?.provider_sport || '';
    if (typeof provider === 'string' && provider.trim().length > 0) {
      const label = provider.replace(/_/g, ' ');
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return getDisciplineName(w?.type);
  };

  // No inline summaries in calendar cells per request

  const getDisciplineColor = (type: string, isCompleted?: boolean): string => {
    // Color code by status: completed = green, planned = orange
    if (isCompleted) {
      // All completed workouts are green
      return 'bg-green-100 text-green-800';
    } else {
      // All planned workouts are orange  
      return 'bg-orange-100 text-orange-800';
    }
  };

  const days = getDaysInMonth();

  return (
    <div className="w-full">
      {/* Navigation moved to bottom tab bar */}
      
      <div className="w-full bg-white">
        <div className="px-1">
          <div className="flex items-center justify-center gap-6 mb-4">
            <Button 
              className="bg-transparent text-muted-foreground border-none hover:bg-gray-100 hover:text-black p-3 transition-all duration-150 min-h-[44px] min-w-[44px]" 
              onClick={() => navigateMonth(-1)}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            </Button>
            <h3 className="text-lg sm:text-xl font-semibold mx-4 min-w-[180px] text-center" style={{fontFamily: 'Inter, sans-serif'}}>
              {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <Button 
              className="bg-transparent text-muted-foreground border-none hover:bg-gray-100 hover:text-black p-3 transition-all duration-150 min-h-[44px] min-w-[44px]"
              onClick={() => navigateMonth(1)}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
            </Button>
          </div>
          
          {/* Day headers */}
          <div className="grid gap-3 grid-cols-7 mb-3">
            {DAYS.map(day => (
              <div key={day} className="p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid - edge-to-edge immersive design */}
          <div className="grid gap-1 grid-cols-7">
            {days.map((day, index) => {
              const dayWorkouts = day ? getWorkoutsForDate(day) : [];
              
              return (
                <button
                  key={index}
                  className={`
                    w-full h-20 p-2 transition-all duration-100 rounded-lg
                    flex flex-col items-center justify-start
                    min-h-[44px] touch-manipulation select-none
                    ${day ? 'bg-white hover:bg-gray-100 active:bg-gray-200 border border-transparent hover:border-gray-200' : 'bg-gray-50 cursor-default'}
                    ${day && isToday(day) ? 'bg-gray-100 border-gray-200' : ''}
                    ${day && isSelected(day) ? 'bg-gray-200 border-gray-300' : ''}
                  `}
                  onClick={(e) => day && handleDateClick(day, e)}
                  disabled={!day}
                  type="button"
                >
                  {day && (
                    <>
                      {/* Date number - clean styling */}
                      <div className="text-sm font-medium mb-1 w-6 h-6 flex items-center justify-center text-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                        {day}
                      </div>
                      
                      {/* Discipline names */}
                      {dayWorkouts.length > 0 && (
                        <div className="flex flex-wrap justify-center items-center gap-1 mt-auto">
                          {dayWorkouts.slice(0, 2).map((workout, idx) => {
                            const hex = getHexColor(workout.type);
                            return (
                              <span key={workout.id || idx} className={`text-[10px] font-medium`} style={{ color: hex }}>
                                {getDisplayLabel(workout)}
                              </span>
                            );
                          })}
                          {dayWorkouts.length > 2 && (
                            <div className="text-[10px] text-muted-foreground font-medium leading-none">
                              +{dayWorkouts.length - 2}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}