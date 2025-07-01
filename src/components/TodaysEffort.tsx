import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Plus, Activity, Bike, Waves, Dumbbell, Move, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface TodaysEffortProps {
  selectedDate?: string;
  onAddEffort: (type: string, date?: string) => void;
  onViewCompleted: () => void;
  onEditEffort?: (workout: any) => void;
}

const TodaysEffort: React.FC<TodaysEffortProps> = ({ 
  selectedDate, 
  onAddEffort, 
  onViewCompleted, 
  onEditEffort 
}) => {
  const { useImperial, workouts, loading } = useAppContext();
  const [displayWorkouts, setDisplayWorkouts] = useState<any[]>([]);

  const today = new Date().toLocaleDateString('en-CA');
  const activeDate = selectedDate || today;

  const loadWorkoutsForDate = () => {
    if (workouts && workouts.length > 0) {
      const dateWorkouts = workouts.filter((w: any) => w.date === activeDate);
      setDisplayWorkouts(dateWorkouts);
    } else {
      setDisplayWorkouts([]);
    }
  };

  useEffect(() => {
    loadWorkoutsForDate();
  }, [workouts, activeDate]);

  const formatWorkoutType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'swim': return <Waves className="h-4 w-4" />;
      case 'ride': return <Bike className="h-4 w-4" />;
      case 'run': return <Activity className="h-4 w-4" />;
      case 'strength': return <Dumbbell className="h-4 w-4" />;
      case 'mobility': return <Move className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getWorkoutSummary = (workout: any) => {
    if (workout.type === 'strength' && workout.strength_exercises) {
      const exerciseNames = workout.strength_exercises
        .slice(0, 3) // Show first 3 exercises
        .map((ex: any) => ex.name)
        .join(', ');
      const remaining = workout.strength_exercises.length > 3 ? ` +${workout.strength_exercises.length - 3} more` : '';
      return exerciseNames + remaining;
    }
    
    if (workout.intervals && workout.intervals.length > 0) {
      const segmentNames = workout.intervals
        .slice(0, 2) // Show first 2 segments
        .map((interval: any) => {
          if (interval.effortLabel && interval.effortLabel !== `Segment ${workout.intervals.indexOf(interval) + 1}`) {
            return interval.effortLabel;
          }
          if (interval.time) return interval.time;
          if (interval.distance) return `${interval.distance}${useImperial ? 'mi' : 'km'}`;
          return 'Segment';
        })
        .join(', ');
      const remaining = workout.intervals.length > 2 ? ` +${workout.intervals.length - 2} more` : '';
      return segmentNames + remaining;
    }
    
    const duration = workout.duration ? formatTime(workout.duration) : '';
    return duration || 'Workout';
  };

  // 🚨 FIXED: Use the existing 'today' variable, don't redeclare it
  const isPastDate = activeDate < today;
  const isToday = activeDate === today;

  // 🚨 NEW: Add Effort Dropdown Component
  const AddEffortDropdown = () => {
    if (isPastDate) {
      // Past dates: Only show Log options
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="text-black hover:text-gray-600 transition-colors text-sm font-medium flex items-center gap-2"
              style={{fontFamily: 'Inter, sans-serif'}}
            >
              <Plus className="h-4 w-4" />
              Log effort
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => onAddEffort('log-run', activeDate)}
              className="cursor-pointer"
            >
              <Activity className="h-4 w-4 mr-2" />
              Log Run
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAddEffort('log-ride', activeDate)}
              className="cursor-pointer"
            >
              <Bike className="h-4 w-4 mr-2" />
              Log Ride
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAddEffort('log-swim', activeDate)}
              className="cursor-pointer"
            >
              <Waves className="h-4 w-4 mr-2" />
              Log Swim
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAddEffort('log-strength', activeDate)}
              className="cursor-pointer"
            >
              <Dumbbell className="h-4 w-4 mr-2" />
              Log Strength
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    } else {
      // Today and future: Show Build options
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="text-black hover:text-gray-600 transition-colors text-sm font-medium flex items-center gap-2"
              style={{fontFamily: 'Inter, sans-serif'}}
            >
              <Plus className="h-4 w-4" />
              Add effort
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => onAddEffort('run', activeDate)}
              className="cursor-pointer"
            >
              <Activity className="h-4 w-4 mr-2" />
              Run
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAddEffort('ride', activeDate)}
              className="cursor-pointer"
            >
              <Bike className="h-4 w-4 mr-2" />
              Ride
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAddEffort('swim', activeDate)}
              className="cursor-pointer"
            >
              <Waves className="h-4 w-4 mr-2" />
              Swim
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAddEffort('strength', activeDate)}
              className="cursor-pointer"
            >
              <Dumbbell className="h-4 w-4 mr-2" />
              Strength
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  };

  if (loading) {
    return (
      <div className="w-full py-4">
        <div className="text-center">
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (displayWorkouts.length === 0) {
    return (
      <div className="w-full py-6 px-4" style={{fontFamily: 'Inter, sans-serif'}}>
        <div className="text-center">
          <p className="text-gray-500 mb-4 text-sm">
            {isPastDate 
              ? 'No effort logged for this date' 
              : isToday 
                ? 'No effort scheduled for today'
                : 'No effort scheduled'
            }
          </p>
          <AddEffortDropdown />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full relative" style={{fontFamily: 'Inter, sans-serif'}}>
      {/* Horizontal scrollable workout cards - aggressive edge-to-edge positioning */}
      <div className="overflow-x-auto scrollbar-hide -mx-4">
        <div className="flex snap-x snap-mandatory">
          {displayWorkouts.map((workout, index) => (
            <div
              key={workout.id || index}
              className="flex-shrink-0 snap-start w-full max-w-sm pl-4 pr-2"
              onClick={() => {
                console.log('🔧 Workout clicked:', workout);
                onEditEffort && onEditEffort(workout);
              }}
            >
              <div className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                {/* Workout title and summary */}
                <div className="space-y-2">
                  <h3 className="font-medium text-base leading-tight">
                    {workout.name || formatWorkoutType(workout.type)}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    {getIcon(workout.type)}
                    <span>{getWorkoutSummary(workout)}</span>
                  </div>
                  
                  {/* Notes if present */}
                  {workout.userComments && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                      {workout.userComments}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {/* 🚨 NEW: Add effort card at the end when workouts exist */}
          <div className="flex-shrink-0 snap-start w-full max-w-sm pl-4 pr-2">
            <div className="p-4 flex items-center justify-center min-h-[100px]">
              <AddEffortDropdown />
            </div>
          </div>
        </div>
      </div>

      {/* Clean fade overlay for right edge */}
      <div className="absolute top-0 right-0 w-8 h-full bg-gradient-to-l from-white to-transparent pointer-events-none" />

      {/* Scroll indicator for multiple workouts */}
      {displayWorkouts.length > 0 && (
        <div className="flex justify-center mt-2">
          <div className="flex gap-1">
            {displayWorkouts.map((_, index) => (
              <div
                key={index}
                className="w-1.5 h-1.5 rounded-full bg-gray-300"
              />
            ))}
            {/* Extra dot for the add effort card */}
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          </div>
        </div>
      )}
    </div>
  );
};

export default TodaysEffort;