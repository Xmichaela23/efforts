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
import { generateWorkoutDisplay } from '@/utils/workoutCodes';

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
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Calendar stays simple; no baselines or summaries needed here

  const navigateWeek = (direction: number) => {
    setCurrentWeek(prev => {
      const newDate = new Date(prev);
      newDate.setDate(prev.getDate() + (direction * 7));
      return newDate;
    });
  };

  const getDaysInWeek = () => {
    const year = currentWeek.getFullYear();
    const month = currentWeek.getMonth();
    const day = currentWeek.getDate();
    
    // Get the start of the current week (Sunday)
    const startOfWeek = new Date(currentWeek);
    startOfWeek.setDate(day - currentWeek.getDay());
    
    const days = [];
    
    for (let i = 0; i < 7; i++) {
      const weekDay = new Date(startOfWeek);
      weekDay.setDate(startOfWeek.getDate() + i);
      days.push(weekDay);
    }
    
    return days;
  };

  const getWorkoutsForDate = (date: Date) => {
    if (!date) return [];
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
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
    
    // 🔧 NEW: Deduplicate workouts by ID and type to prevent messy display
    const uniqueWorkouts = filtered.reduce((acc: any[], workout: any) => {
      const existingIndex = acc.findIndex((w: any) => 
        w.id === workout.id || 
        (w.type === workout.type && w.workout_status === workout.workout_status)
      );
      
      if (existingIndex === -1) {
        acc.push(workout);
      }
      return acc;
    }, []);
    
    return uniqueWorkouts;
  };

  const handleDateClick = (date: Date, event: React.MouseEvent | React.TouchEvent) => {
    if (!date) return;
    
    // Prevent event from bubbling up to parent handlers
    event.preventDefault();
    event.stopPropagation();
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
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

  const isToday = (date: Date) => {
    const today = new Date();
    
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (date: Date) => {
    if (!date || !selectedDate) return false;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
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

  const weekDays = getDaysInWeek();

  return (
    <div className="w-full">
      {/* Navigation moved to bottom tab bar */}
      
      <div className="w-full bg-white">
        <div className="px-1">
          <div className="flex items-center justify-center gap-6 mb-4">
            <Button 
              className="bg-transparent text-muted-foreground border-none hover:bg-gray-100 hover:text-black p-3 transition-all duration-150 min-h-[44px] min-w-[44px]" 
              onClick={() => navigateWeek(-1)}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            </Button>
            <h3 className="text-lg sm:text-xl font-semibold mx-4 min-w-[180px] text-center" style={{fontFamily: 'Inter, sans-serif'}}>
              Week of {weekDays[0]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6]?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </h3>
            <Button 
              className="bg-transparent text-muted-foreground border-none hover:bg-gray-100 hover:text-black p-3 transition-all duration-150 min-h-[44px] min-w-[44px]"
              onClick={() => navigateWeek(1)}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
            </Button>
          </div>
          
          {/* Day headers - 3 columns for mobile, matching workout cell layout exactly */}
          <div className="mb-3">
            {/* Row 1: Sun, Mon, Tue */}
            <div className="flex gap-1 mb-1">
              <div className="flex-1 p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                SUN
              </div>
              <div className="flex-1 p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                MON
              </div>
              <div className="flex-1 p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                TUE
              </div>
            </div>
            {/* Row 2: Wed, Thu, Fri */}
            <div className="flex gap-1 mb-1">
              <div className="flex-1 p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                WED
              </div>
              <div className="flex-1 p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                THU
              </div>
              <div className="flex-1 p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                FRI
              </div>
            </div>
            {/* Row 3: Sat, empty, empty */}
            <div className="flex gap-1">
              <div className="flex-1 p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                SAT
              </div>
              <div className="flex-1 p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                
              </div>
              <div className="flex-1 p-2 text-center font-semibold text-xs text-muted-foreground uppercase tracking-wide" style={{fontFamily: 'Inter, sans-serif'}}>
                
              </div>
            </div>
          </div>

          {/* Week grid - 3 columns for mobile */}
          <div className="grid gap-1 grid-cols-3">
            {/* Row 1: Sun, Mon, Tue */}
            <button
              key="sun"
              className={`
                w-full h-32 p-3 transition-all duration-100 rounded-lg
                flex flex-col items-center justify-start
                min-h-[44px] touch-manipulation select-none
                ${weekDays[0] ? 'bg-white hover:bg-gray-100 active:bg-gray-200 border border-transparent hover:border-gray-200' : 'bg-gray-50 cursor-default'}
                ${weekDays[0] && isToday(weekDays[0]) ? 'bg-gray-100 border-gray-200' : ''}
                ${weekDays[0] && isSelected(weekDays[0]) ? 'bg-gray-200 border-gray-300' : ''}
              `}
              onClick={(e) => weekDays[0] && handleDateClick(weekDays[0], e)}
              disabled={!weekDays[0]}
              type="button"
            >
              {weekDays[0] && (
                <>
                  <div className="text-sm font-medium mb-2 w-6 h-6 flex items-center justify-center text-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                    {weekDays[0].getDate()}
                  </div>
                  {getWorkoutsForDate(weekDays[0]).length > 0 && (
                    <div className="flex flex-col justify-center items-center gap-2 mt-auto w-full">
                      {getWorkoutsForDate(weekDays[0]).slice(0, 3).map((workout, idx) => {
                        const workoutDisplay = generateWorkoutDisplay(workout);
                        const isCompleted = workout.workout_status === 'completed';
                        
                        return (
                          <span 
                            key={workout.id || idx} 
                            className={`text-xs font-medium px-2 py-1 rounded-full w-full text-center ${
                              isCompleted 
                                ? 'text-gray-600 bg-gray-100' 
                                : 'text-gray-900 bg-blue-100'
                            }`}
                          >
                            {workoutDisplay}
                            {isCompleted && <span className="ml-1">✓</span>}
                          </span>
                        );
                      })}
                      {getWorkoutsForDate(weekDays[0]).length > 3 && (
                        <div className="text-xs text-muted-foreground font-medium leading-none">
                          +{getWorkoutsForDate(weekDays[0]).length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </button>

            <button
              key="mon"
              className={`
                w-full h-32 p-3 transition-all duration-100 rounded-lg
                flex flex-col items-center justify-start
                min-h-[44px] touch-manipulation select-none
                ${weekDays[1] ? 'bg-white hover:bg-gray-100 active:bg-gray-200 border border-transparent hover:border-gray-200' : 'bg-gray-50 cursor-default'}
                ${weekDays[1] && isToday(weekDays[1]) ? 'bg-gray-100 border-gray-200' : ''}
                ${weekDays[1] && isSelected(weekDays[1]) ? 'bg-gray-200 border-gray-300' : ''}
              `}
              onClick={(e) => weekDays[1] && handleDateClick(weekDays[1], e)}
              disabled={!weekDays[1]}
              type="button"
            >
              {weekDays[1] && (
                <>
                  <div className="text-sm font-medium mb-2 w-6 h-6 flex items-center justify-center text-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                    {weekDays[1].getDate()}
                  </div>
                  {getWorkoutsForDate(weekDays[1]).length > 0 && (
                    <div className="flex flex-col justify-center items-center gap-2 mt-auto w-full">
                      {getWorkoutsForDate(weekDays[1]).slice(0, 3).map((workout, idx) => {
                        const workoutDisplay = generateWorkoutDisplay(workout);
                        const isCompleted = workout.workout_status === 'completed';
                        
                        return (
                          <span 
                            key={workout.id || idx} 
                            className={`text-xs font-medium px-2 py-1 rounded-full w-full text-center ${
                              isCompleted 
                                ? 'text-gray-600 bg-gray-100' 
                                : 'text-gray-900 bg-blue-100'
                            }`}
                          >
                            {workoutDisplay}
                            {isCompleted && <span className="ml-1">✓</span>}
                          </span>
                        );
                      })}
                      {getWorkoutsForDate(weekDays[1]).length > 3 && (
                        <div className="text-xs text-muted-foreground font-medium leading-none">
                          +{getWorkoutsForDate(weekDays[1]).length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </button>

            <button
              key="tue"
              className={`
                w-full h-32 p-3 transition-all duration-100 rounded-lg
                flex flex-col items-center justify-start
                min-h-[44px] touch-manipulation select-none
                ${weekDays[2] ? 'bg-white hover:bg-gray-100 active:bg-gray-200 border border-transparent hover:border-gray-200' : 'bg-gray-50 cursor-default'}
                ${weekDays[2] && isToday(weekDays[2]) ? 'bg-gray-100 border-gray-200' : ''}
                ${weekDays[2] && isSelected(weekDays[2]) ? 'bg-gray-200 border-gray-300' : ''}
              `}
              onClick={(e) => weekDays[2] && handleDateClick(weekDays[2], e)}
              disabled={!weekDays[2]}
              type="button"
            >
              {weekDays[2] && (
                <>
                  <div className="text-sm font-medium mb-2 w-6 h-6 flex items-center justify-center text-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                    {weekDays[2].getDate()}
                  </div>
                  {getWorkoutsForDate(weekDays[2]).length > 0 && (
                    <div className="flex flex-col justify-center items-center gap-1 mt-auto w-full">
                      {getWorkoutsForDate(weekDays[2]).slice(0, 3).map((workout, idx) => {
                        const workoutDisplay = generateWorkoutDisplay(workout);
                        const isCompleted = workout.workout_status === 'completed';
                        
                        return (
                          <span 
                            key={workout.id || idx} 
                            className={`text-xs font-medium px-2 py-1 rounded-full w-full text-center ${
                              isCompleted 
                                ? 'text-gray-600 bg-gray-100' 
                                : 'text-gray-900 bg-blue-100'
                            }`}
                          >
                            {workoutDisplay}
                            {isCompleted && <span className="ml-1">✓</span>}
                          </span>
                        );
                      })}
                      {getWorkoutsForDate(weekDays[2]).length > 3 && (
                        <div className="text-xs text-muted-foreground font-medium leading-none">
                          +{getWorkoutsForDate(weekDays[2]).length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </button>

            {/* Row 2: Wed, Thu, Fri */}
            <button
              key="wed"
              className={`
                w-full h-32 p-3 transition-all duration-100 rounded-lg
                flex flex-col items-center justify-start
                min-h-[44px] touch-manipulation select-none
                ${weekDays[3] ? 'bg-white hover:bg-gray-100 active:bg-gray-200 border border-transparent hover:border-gray-200' : 'bg-gray-50 cursor-default'}
                ${weekDays[3] && isToday(weekDays[3]) ? 'bg-gray-100 border-gray-200' : ''}
                ${weekDays[3] && isSelected(weekDays[3]) ? 'bg-gray-200 border-gray-300' : ''}
              `}
              onClick={(e) => weekDays[3] && handleDateClick(weekDays[3], e)}
              disabled={!weekDays[3]}
              type="button"
            >
              {weekDays[3] && (
                <>
                  <div className="text-sm font-medium mb-2 w-6 h-6 flex items-center justify-center text-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                    {weekDays[3].getDate()}
                  </div>
                  {getWorkoutsForDate(weekDays[3]).length > 0 && (
                    <div className="flex flex-col justify-center items-center gap-2 mt-auto w-full">
                      {getWorkoutsForDate(weekDays[3]).slice(0, 3).map((workout, idx) => {
                        const workoutDisplay = generateWorkoutDisplay(workout);
                        const isCompleted = workout.workout_status === 'completed';
                        
                        return (
                          <span 
                            key={workout.id || idx} 
                            className={`text-xs font-medium px-2 py-1 rounded-full w-full text-center ${
                              isCompleted 
                                ? 'text-gray-600 bg-gray-100' 
                                : 'text-gray-900 bg-blue-100'
                            }`}
                          >
                            {workoutDisplay}
                            {isCompleted && <span className="ml-1">✓</span>}
                          </span>
                        );
                      })}
                      {getWorkoutsForDate(weekDays[3]).length > 3 && (
                        <div className="text-xs text-muted-foreground font-medium leading-none">
                          +{getWorkoutsForDate(weekDays[3]).length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </button>

            <button
              key="thu"
              className={`
                w-full h-32 p-3 transition-all duration-100 rounded-lg
                flex flex-col items-center justify-start
                min-h-[44px] touch-manipulation select-none
                ${weekDays[4] ? 'bg-white hover:bg-gray-100 active:bg-gray-200 border border-transparent hover:border-gray-200' : 'bg-gray-50 cursor-default'}
                ${weekDays[4] && isToday(weekDays[4]) ? 'bg-gray-100 border-gray-200' : ''}
                ${weekDays[4] && isSelected(weekDays[4]) ? 'bg-gray-200 border-gray-300' : ''}
              `}
              onClick={(e) => weekDays[4] && handleDateClick(weekDays[4], e)}
              disabled={!weekDays[4]}
              type="button"
            >
              {weekDays[4] && (
                <>
                  <div className="text-sm font-medium mb-2 w-6 h-6 flex items-center justify-center text-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                    {weekDays[4].getDate()}
                  </div>
                  {getWorkoutsForDate(weekDays[4]).length > 0 && (
                    <div className="flex flex-col justify-center items-center gap-2 mt-auto w-full">
                      {getWorkoutsForDate(weekDays[4]).slice(0, 3).map((workout, idx) => {
                        const workoutDisplay = generateWorkoutDisplay(workout);
                        const isCompleted = workout.workout_status === 'completed';
                        
                        return (
                          <span 
                            key={workout.id || idx} 
                            className={`text-xs font-medium px-2 py-1 rounded-full w-full text-center ${
                              isCompleted 
                                ? 'text-gray-600 bg-gray-100' 
                                : 'text-gray-900 bg-blue-100'
                            }`}
                          >
                            {workoutDisplay}
                            {isCompleted && <span className="ml-1">✓</span>}
                          </span>
                        );
                      })}
                      {getWorkoutsForDate(weekDays[4]).length > 3 && (
                        <div className="text-xs text-muted-foreground font-medium leading-none">
                          +{getWorkoutsForDate(weekDays[4]).length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </button>

            <button
              key="fri"
              className={`
                w-full h-32 p-3 transition-all duration-100 rounded-lg
                flex flex-col items-center justify-start
                min-h-[44px] touch-manipulation select-none
                ${weekDays[5] ? 'bg-white hover:bg-gray-100 active:bg-gray-200 border border-transparent hover:border-gray-200' : 'bg-gray-50 cursor-default'}
                ${weekDays[5] && isToday(weekDays[5]) ? 'bg-gray-100 border-gray-200' : ''}
                ${weekDays[5] && isSelected(weekDays[5]) ? 'bg-gray-200 border-gray-300' : ''}
              `}
              onClick={(e) => weekDays[5] && handleDateClick(weekDays[5], e)}
              disabled={!weekDays[5]}
              type="button"
            >
              {weekDays[5] && (
                <>
                  <div className="text-sm font-medium mb-2 w-6 h-6 flex items-center justify-center text-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                    {weekDays[5].getDate()}
                  </div>
                  {getWorkoutsForDate(weekDays[5]).length > 0 && (
                    <div className="flex flex-col justify-center items-center gap-2 mt-auto w-full">
                      {getWorkoutsForDate(weekDays[5]).slice(0, 3).map((workout, idx) => {
                        const workoutDisplay = generateWorkoutDisplay(workout);
                        const isCompleted = workout.workout_status === 'completed';
                        
                        return (
                          <span 
                            key={workout.id || idx} 
                            className={`text-xs font-medium px-2 py-1 rounded-full w-full text-center ${
                              isCompleted 
                                ? 'text-gray-600 bg-gray-100' 
                                : 'text-gray-900 bg-blue-100'
                            }`}
                          >
                            {workoutDisplay}
                            {isCompleted && <span className="ml-1">✓</span>}
                          </span>
                        );
                      })}
                      {getWorkoutsForDate(weekDays[5]).length > 3 && (
                        <div className="text-xs text-muted-foreground font-medium leading-none">
                          +{getWorkoutsForDate(weekDays[5]).length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </button>

            {/* Row 3: Sat, empty, empty */}
            <button
              key="sat"
              className={`
                w-full h-32 p-3 transition-all duration-100 rounded-lg
                flex flex-col items-center justify-start
                min-h-[44px] touch-manipulation select-none
                ${weekDays[6] ? 'bg-white hover:bg-gray-100 active:bg-gray-200 border border-transparent hover:border-gray-200' : 'bg-gray-50 cursor-default'}
                ${weekDays[6] && isToday(weekDays[6]) ? 'bg-gray-100 border-gray-200' : ''}
                ${weekDays[6] && isSelected(weekDays[6]) ? 'bg-gray-200 border-gray-300' : ''}
              `}
              onClick={(e) => weekDays[6] && handleDateClick(weekDays[6], e)}
              disabled={!weekDays[6]}
              type="button"
            >
              {weekDays[6] && (
                <>
                  <div className="text-sm font-medium mb-2 w-6 h-6 flex items-center justify-center text-foreground" style={{fontFamily: 'Inter, sans-serif'}}>
                    {weekDays[6].getDate()}
                  </div>
                  {getWorkoutsForDate(weekDays[6]).length > 0 && (
                    <div className="flex flex-col justify-center items-center gap-2 mt-auto w-full">
                      {getWorkoutsForDate(weekDays[6]).slice(0, 3).map((workout, idx) => {
                        const workoutDisplay = generateWorkoutDisplay(workout);
                        const isCompleted = workout.workout_status === 'completed';
                        
                        return (
                          <span 
                            key={workout.id || idx} 
                            className={`text-xs font-medium px-2 py-1 rounded-full w-full text-center ${
                              isCompleted 
                                ? 'text-gray-600 bg-gray-100' 
                                : 'text-gray-900 bg-blue-100'
                            }`}
                          >
                            {workoutDisplay}
                            {isCompleted && <span className="ml-1">✓</span>}
                          </span>
                        );
                      })}
                      {getWorkoutsForDate(weekDays[6]).length > 3 && (
                        <div className="text-xs text-muted-foreground font-medium leading-none">
                          +{getWorkoutsForDate(weekDays[6]).length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </button>

            {/* Empty cells for balance */}
            <div className="w-full h-32"></div>
            <div className="w-full h-32"></div>
          </div>
        </div>
      </div>
    </div>
  );
}