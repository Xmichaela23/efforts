import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Calendar } from 'lucide-react';

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
      
      // 🚨 DEBUG: Check actual date formats
      console.log('🔍 DEBUG - First few workout dates:', workouts.slice(0, 3).map(w => ({
        name: w.name,
        date: w.date,
        dateType: typeof w.date,
        activeDate: activeDate,
        matches: w.date === activeDate
      })));
      
      // 🔧 FIXED: Filter by both date AND status
      const dateWorkouts = workouts.filter((w: any) => {
        const isCorrectDate = w.date === activeDate;
        
        // For today and future dates: show both planned AND completed workouts
        if (activeDate >= today) {
          const isPlanned = w.workout_status === 'planned' || !w.workout_status; // Handle missing status as planned
          const isCompleted = w.workout_status === 'completed';
          console.log(`Workout "${w.name}" - Date: ${isCorrectDate}, Status: ${w.workout_status}, IsPlanned: ${isPlanned}, IsCompleted: ${isCompleted}`);
          return isCorrectDate && (isPlanned || isCompleted); // ✅ FIXED: Show both planned AND completed
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
      case 'walk': return <Activity className="h-5 w-5" />;
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
      case 'walk': return isCompleted ? 'text-yellow-300' : 'text-yellow-600';
      case 'strength': return isCompleted ? 'text-orange-300' : 'text-orange-600';
      case 'mobility': return isCompleted ? 'text-purple-300' : 'text-purple-600';
      default: return isCompleted ? 'text-gray-300' : 'text-gray-600';
    }
  };

  // Format workout display: "Run - Tempo (45min)" or "Lift - Upper"
  const formatWorkoutDisplay = (workout: any) => {
    const discipline = getDisciplineName(workout.type);
    const type = getWorkoutType(workout);
    
    if (workout.type === 'strength') {
      return `${discipline} - ${type}`;
    } else {
      const duration = workout.duration ? `(${formatDuration(workout.duration)})` : '';
      return `${discipline} - ${type} ${duration}`.trim();
    }
  };

  // Get discipline name
  const getDisciplineName = (type: string): string => {
    switch (type) {
      case 'run': return 'Run';
      case 'walk': return 'Walk';
      case 'ride': 
      case 'bike': return 'Ride';
      case 'swim': return 'Swim';
      case 'strength': return 'Lift';
      case 'mobility': return 'Mobility';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  // Get workout type/focus
  const getWorkoutType = (workout: any): string => {
    // Check for specific workout types in name or description
    const name = workout.name?.toLowerCase() || '';
    const description = workout.description?.toLowerCase() || '';
    const text = `${name} ${description}`;

    // Cardio workout types
    if (text.includes('tempo') || text.includes('threshold')) return 'Tempo';
    if (text.includes('endurance') || text.includes('long')) return 'Endurance';
    if (text.includes('intervals') || text.includes('intervals')) return 'Intervals';
    if (text.includes('drills') || text.includes('technique')) return 'Drills';
    if (text.includes('easy') || text.includes('recovery')) return 'Easy';
    if (text.includes('hard') || text.includes('race')) return 'Hard';

    // Strength workout types
    if (text.includes('upper') || text.includes('push')) return 'Upper';
    if (text.includes('lower') || text.includes('legs')) return 'Lower';
    if (text.includes('compound') || text.includes('full')) return 'Compound';
    if (text.includes('core') || text.includes('abs')) return 'Core';

    // Default types
    switch (workout.type) {
      case 'run': return 'Easy';
      case 'walk': return 'Easy';
      case 'ride': return 'Endurance';
      case 'swim': return 'Drills';
      case 'strength': return 'Compound';
      case 'mobility': return 'Stretch';
      default: return 'Workout';
    }
  };

  // Format duration
  const formatDuration = (duration: any): string => {
    if (!duration) return '';
    
    const minutes = typeof duration === 'number' ? duration : parseInt(duration);
    if (isNaN(minutes)) return '';
    
    if (minutes < 60) {
      return `${minutes}min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `${hours}h`;
      } else {
        return `${hours}h ${remainingMinutes}min`;
      }
    }
  };

  // Format the date for display - compact format with date included
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

    // Get compact date format (e.g., "Aug 9")
    const compactDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    if (isToday) {
      return `Today, ${compactDate}`;
    } else if (isYesterday) {
      return `Yesterday, ${compactDate}`;
    } else if (isTomorrow) {
      return `Tomorrow, ${compactDate}`;
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



  if (loading) {
    return (
      <div className="w-full h-24 flex items-center justify-center" style={{fontFamily: 'Inter, sans-serif'}}>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-24 flex flex-col" style={{fontFamily: 'Inter, sans-serif'}}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-4 flex-shrink-0">
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
      </div>

      {/* Content area - fills remaining space */}
      <div className="flex-1 overflow-auto">
        {displayWorkouts.length === 0 ? (
          // Empty state
          <div className="flex items-center justify-center h-full px-4">
            <p className="text-muted-foreground text-xs text-center">
              {isPastDate 
                ? 'No effort logged' 
                : isToday 
                  ? 'No effort scheduled'
                  : 'No effort scheduled'
              }
            </p>
          </div>
        ) : (
          // Compact workout display - better for multiple workouts
          <div className="px-3 pb-2">
            <div className="space-y-1">
              {displayWorkouts.map((workout) => (
                <button
                  key={workout.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🎯 Workout clicked:', workout);
                    onEditEffort && onEditEffort(workout);
                  }}
                  className={`w-full text-left p-1.5 rounded-md transition-colors hover:bg-gray-50 ${
                    workout.workout_status === 'completed' 
                      ? 'bg-green-50' 
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`p-1 rounded ${getIconColor(workout)}`}>
                        {getIcon(workout.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs">
                          {getDisciplineName(workout.type)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {workout.workout_status === 'completed' && (
                        <div className="text-xs text-green-600 font-medium">
                          ✓
                        </div>
                      )}
                      {workout.duration && (
                        <div className="text-xs text-muted-foreground">
                          {formatDuration(workout.duration)}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TodaysEffort;