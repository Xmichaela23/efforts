import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Plus, Activity, Bike, Waves, Dumbbell, Move, ChevronDown, Calendar } from 'lucide-react';
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
      console.log('🔍 All workouts for', activeDate, ':', workouts.filter((w: any) => w.date === activeDate));
      
      // 🔧 FIXED: Filter by both date AND status
      const dateWorkouts = workouts.filter((w: any) => {
        const isCorrectDate = w.date === activeDate;
        
        // For today and future dates: show only planned workouts
        if (activeDate >= today) {
          const isPlanned = w.workout_status === 'planned' || !w.workout_status; // Handle missing status as planned
          console.log(`Workout "${w.name}" - Date: ${isCorrectDate}, Status: ${w.workout_status}, IsPlanned: ${isPlanned}`);
          return isCorrectDate && isPlanned;
        } 
        // For past dates: show both planned and completed for reference
        else {
          console.log(`Past date workout "${w.name}" - Date: ${isCorrectDate}, Status: ${w.workout_status}`);
          return isCorrectDate;
        }
      });
      
      console.log('✅ Filtered workouts to display:', dateWorkouts);
      setDisplayWorkouts(dateWorkouts);
    } else {
      setDisplayWorkouts([]);
    }
  };

  // FIXED: React to selectedDate prop changes properly
  useEffect(() => {
    console.log('🔄 TodaysEffort useEffect triggered - selectedDate:', selectedDate, 'activeDate:', activeDate);
    loadWorkoutsForDate();
  }, [workouts, selectedDate]); // Changed from activeDate to selectedDate

  const getIcon = (type: string) => {
    switch (type) {
      case 'swim': return <Waves className="h-5 w-5" />;
      case 'ride': return <Bike className="h-5 w-5" />;
      case 'run': return <Activity className="h-5 w-5" />;
      case 'strength': return <Dumbbell className="h-5 w-5" />;
      case 'mobility': return <Move className="h-5 w-5" />;
      default: return <Activity className="h-5 w-5" />;
    }
  };

  const getIconColor = (workout: any) => {
    const isCompleted = workout.workout_status === 'completed';
    
    switch (workout.type) {
      case 'swim': return isCompleted ? 'text-cyan-300' : 'text-cyan-600';
      case 'ride': return isCompleted ? 'text-blue-300' : 'text-blue-600';
      case 'run': return isCompleted ? 'text-green-300' : 'text-green-600';
      case 'strength': return isCompleted ? 'text-orange-300' : 'text-orange-600';
      case 'mobility': return isCompleted ? 'text-purple-300' : 'text-purple-600';
      default: return isCompleted ? 'text-gray-300' : 'text-gray-600';
    }
  };

  // Format the date for display
  const formatDisplayDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Check if it's today, yesterday, or tomorrow
    const isToday = dateString === today.toLocaleDateString('en-CA');
    const isYesterday = dateString === yesterday.toLocaleDateString('en-CA');
    const isTomorrow = dateString === tomorrow.toLocaleDateString('en-CA');

    if (isToday) {
      return 'Today';
    } else if (isYesterday) {
      return 'Yesterday';
    } else if (isTomorrow) {
      return 'Tomorrow';
    } else {
      // Format as "Mon, Jan 15" for other dates
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const isPastDate = activeDate < today;
  const isToday = activeDate === today;

  // Add Effort Dropdown Component
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
            <DropdownMenuItem
              onClick={() => onAddEffort('mobility', activeDate)}
              className="cursor-pointer"
            >
              <Move className="h-4 w-4 mr-2" />
              Mobility
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  };

  if (loading) {
    return (
      <div className="w-full py-2">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full" style={{fontFamily: 'Inter, sans-serif'}}>
      {/* 🔥 COMPRESSED: Minimal header with inline layout */}
      <div className="flex items-center justify-between mb-3 px-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {formatDisplayDate(activeDate)}
          </span>
          {/* Show effort count inline */}
          {displayWorkouts.length > 0 && (
            <span className="text-xs text-muted-foreground">
              · {displayWorkouts.length} effort{displayWorkouts.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        
        {/* Add effort button always visible */}
        <AddEffortDropdown />
      </div>

      {displayWorkouts.length === 0 ? (
        // 🔥 COMPRESSED: Minimal empty state
        <div className="w-full py-2 px-4">
          <div className="text-center">
            <p className="text-muted-foreground text-xs">
              {isPastDate 
                ? 'No effort logged' 
                : isToday 
                  ? 'No effort scheduled'
                  : 'No effort scheduled'
              }
            </p>
          </div>
        </div>
      ) : (
        // 🔥 COMPRESSED: Tight row of smaller workout symbols
        <div className="w-full px-4">
          <div className="flex items-center justify-center gap-4 py-3">
            {displayWorkouts.map((workout) => (
              <button
                key={workout.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🎯 Symbol clicked:', workout);
                  onEditEffort && onEditEffort(workout);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🎯 Symbol touched:', workout);
                  onEditEffort && onEditEffort(workout);
                }}
                className={`p-3 rounded-lg active:scale-95 transition-transform cursor-pointer ${getIconColor(workout)}`}
                style={{ minWidth: '44px', minHeight: '44px' }}
              >
                {getIcon(workout.type)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TodaysEffort;