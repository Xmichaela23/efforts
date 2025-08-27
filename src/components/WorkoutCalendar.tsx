import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, DayContent } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { generateWorkoutDisplay } from '../utils/workoutCodes';

interface WorkoutCalendarProps {
  onAddEffort: () => void;
  onSelectType: (type: string) => void;
  onSelectWorkout: (workout: any) => void;
  onViewCompleted: () => void;
  onEditEffort: (workout: any) => void;
  onDateSelect: (date: string) => void;
  onSelectRoutine?: (type: string) => void;
  onOpenPlanBuilder?: () => void;
  currentPlans?: any[];
  completedPlans?: any[];
  workouts?: any[];
  plannedWorkouts?: any[];
}

export default function WorkoutCalendar({
  onAddEffort,
  onSelectType,
  onSelectWorkout,
  onViewCompleted,
  onEditEffort,
  onDateSelect,
  onSelectRoutine,
  onOpenPlanBuilder,
  currentPlans = [],
  completedPlans = [],
  workouts = [],
  plannedWorkouts = []
}: WorkoutCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Get workouts for a specific date
  const getWorkoutsForDate = (date: Date) => {
    if (!date) return [];
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    const all = [
      ...(Array.isArray(workouts) ? workouts : []),
      ...(Array.isArray(plannedWorkouts) ? plannedWorkouts : []),
    ];
    
    const filtered = all.filter((w: any) => {
      if (!w || w.date !== dateStr) return false;
      
      const today = new Date().toLocaleDateString('en-CA');
      if (dateStr >= today) {
        const isPlanned = w.workout_status === 'planned' || !w.workout_status;
        const isCompleted = w.workout_status === 'completed';
        return isPlanned || isCompleted;
      } else {
        return true;
      }
    });
    
    // Deduplicate workouts
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

  // Custom day content to show workouts
  const CustomDayContent = (props: any) => {
    const workouts = getWorkoutsForDate(props.date);
    const isToday = new Date().toDateString() === props.date.toDateString();
    
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-start p-1">
        {/* Date number */}
        <div className={`text-sm font-medium ${isToday ? 'text-blue-600 font-semibold' : 'text-gray-900'}`}>
          {props.date.getDate()}
        </div>
        
        {/* Workouts */}
        {workouts.length > 0 && (
          <div className="flex flex-col items-center gap-1 mt-1 w-full">
            {workouts.slice(0, 2).map((workout, idx) => {
              const workoutDisplay = generateWorkoutDisplay(workout);
              const isCompleted = workout.workout_status === 'completed';
              
              return (
                <span 
                  key={workout.id || idx} 
                  className={`text-xs font-medium px-1 py-0.5 rounded-full w-full text-center truncate ${
                    isCompleted 
                      ? 'text-gray-600 bg-gray-100' 
                      : 'text-gray-900 bg-blue-100'
                  }`}
                  title={workoutDisplay}
                >
                  {workoutDisplay}
                  {isCompleted && <span className="ml-1">✓</span>}
                </span>
              );
            })}
            {workouts.length > 2 && (
              <div className="text-xs text-muted-foreground">
                +{workouts.length - 2}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleDateClick = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    setSelectedDate(dateStr);
    if (onDateSelect) {
      onDateSelect(dateStr);
    }
  };

  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);
  };

  return (
    <div className="w-full bg-white rounded-lg">
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          className="bg-transparent text-muted-foreground border-none hover:bg-gray-100 hover:text-black p-3 transition-all duration-150 min-h-[44px] min-w-[44px]"
          onClick={() => {
            const prevMonth = new Date(currentMonth);
            prevMonth.setMonth(prevMonth.getMonth() - 1);
            setCurrentMonth(prevMonth);
          }}
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
        </Button>
        
        <div className="text-center font-semibold text-sm text-foreground">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="bg-transparent text-muted-foreground border-none hover:bg-gray-100 hover:text-black p-3 transition-all duration-150 min-h-[44px] min-w-[44px]"
          onClick={() => {
            const nextMonth = new Date(currentMonth);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            setCurrentMonth(nextMonth);
          }}
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
        </Button>
      </div>

      {/* Calendar */}
      <DayPicker
        mode="single"
        selected={selectedDate ? new Date(selectedDate) : undefined}
        onSelect={(date) => date && handleDateClick(date)}
        month={currentMonth}
        onMonthChange={handleMonthChange}
        showOutsideDays={false}
        className="w-full"
        classNames={{
          months: "flex flex-col space-y-4",
          month: "space-y-4",
          caption: "flex justify-center pt-1 relative items-center",
          caption_label: "text-sm font-medium text-foreground",
          nav: "space-x-1 flex items-center",
          nav_button: "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 transition-opacity",
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          table: "w-full border-collapse space-y-1",
          head_row: "flex",
          head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
          row: "flex w-full mt-2",
          cell: "h-20 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
          day: "h-20 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-gray-100 rounded-lg transition-colors",
          day_selected: "bg-blue-100 text-blue-900 hover:bg-blue-200 focus:bg-blue-200 rounded-lg",
          day_today: "bg-gray-100 text-gray-900 rounded-lg",
          day_outside: "text-muted-foreground opacity-50",
          day_disabled: "text-muted-foreground opacity-50",
          day_hidden: "invisible",
        }}
        components={{
          DayContent: CustomDayContent,
        }}
      />
    </div>
  );
}