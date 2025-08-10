import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Calendar, MapPin, Zap, Heart, Mountain, Clock, Activity, Bike, Waves, Dumbbell, Weight } from 'lucide-react';

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

  // 🔧 FIXED: Use Pacific timezone for date calculations to avoid timezone issues
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
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

  // Icons removed - using text-only interface

  // Icon colors removed - using text-only interface

  // Format rich workout display - different for planned vs completed
  const formatRichWorkoutDisplay = (workout: any) => {
    const discipline = getDisciplineName(workout.type);
    const duration = workout.duration ? formatDuration(workout.duration) : 'N/A';
    const isCompleted = workout.workout_status === 'completed';
    
    // Get metrics/description based on workout status
    const getMetrics = () => {
      if (!isCompleted) {
        // PLANNED: Show workout description/structure
        const description = workout.description || workout.intervals?.map(i => i.description).join(', ') || 
                           workout.workout_type || 'Planned workout';
        return [
          { icon: Activity, value: description }
        ];
      }
      
      // COMPLETED: Show actual metrics
      if (workout.type === 'strength') {
        // Strength: show exercise abbreviations with their set/rep/weight info
        // Read from strength_exercises field which contains the actual workout data
        const exercises = workout.strength_exercises || [];
        
        if (exercises.length > 0) {
          // Create exercise summaries with abbreviations
          const exerciseSummaries = exercises.map(ex => {
            const exerciseName = ex.name || '';
            const sets = ex.sets?.length || 0;
            const avgReps = ex.sets?.reduce((total, set) => total + (set.reps || 0), 0) / sets || 0;
            const weight = ex.sets?.[0]?.weight || 0;
            
            // Create exercise abbreviation
            let abbreviation = '';
            if (exerciseName.toLowerCase().includes('overhead press')) abbreviation = 'OHP';
            else if (exerciseName.toLowerCase().includes('bench press')) abbreviation = 'BP';
            else if (exerciseName.toLowerCase().includes('deadlift')) abbreviation = 'DL';
            else if (exerciseName.toLowerCase().includes('squat')) abbreviation = 'SQ';
            else if (exerciseName.toLowerCase().includes('row')) abbreviation = 'ROW';
            else if (exerciseName.toLowerCase().includes('curl')) abbreviation = 'CURL';
            else {
              // Take first letter of each word
              abbreviation = exerciseName.split(' ').map(word => word[0]).join('').toUpperCase();
            }
            
            return `${abbreviation} ${sets}s ${Math.round(avgReps)}r ${weight}lbs`;
          });
          
          return exerciseSummaries.map((summary, index) => ({
            icon: Activity,
            value: summary
          }));
        }

        // Fallback if no exercises
        return [
          { icon: Activity, value: 'No exercises' }
        ];
      } else {
        // Endurance: distance, pace/speed, heart rate, elevation
        // Handle distance - could be in meters, miles, or other units
        let distance = 'N/A';
        if (workout.distance) {
          const dist = Number(workout.distance);
          if (dist > 1000) {
            // Probably meters, convert to miles
            distance = `${Math.round((dist / 1609.34) * 10) / 10} mi`;
          } else {
            // Probably already in miles or km
            distance = `${Math.round(dist * 10) / 10} mi`;
          }
        }
        
        const isRun = workout.type === 'run' || workout.type === 'walk';
        
                      // Handle pace/speed using transformed data from useWorkouts
              let paceSpeed = 'N/A';
              // useWorkouts.ts transforms: duration_seconds → duration (minutes), distance_meters → distance (km)
              const distanceKm = Number(workout.distance);
              const durationMinutes = Number(workout.duration);
              const avgSpeedMps = Number(workout.avg_speed_mps);
              
              if (isRun && distanceKm && durationMinutes && distanceKm > 0 && durationMinutes > 0) {
                // Calculate pace from transformed distance/duration
                const distanceMiles = distanceKm * 0.621371; // Convert km to miles
                const paceMinPerMile = durationMinutes / distanceMiles;
                const minutes = Math.floor(paceMinPerMile);
                const seconds = Math.round((paceMinPerMile - minutes) * 60);
                paceSpeed = `${minutes}:${seconds.toString().padStart(2,'0')}/mi`;
              } else if (avgSpeedMps && avgSpeedMps > 0) {
                // Convert m/s to mph: multiply by 2.237
                const speedMph = avgSpeedMps * 2.237;
                paceSpeed = `${Math.round(speedMph * 10) / 10} mph`;
              }
        
        const heartRate = workout.avg_heart_rate || workout.metrics?.avg_heart_rate;
        const hrDisplay = heartRate && heartRate > 0 ? `${Math.round(heartRate)} bpm` : 'N/A';
        
        const elevation = workout.elevation_gain || workout.metrics?.elevation_gain;
        const elevationFt = elevation && elevation > 0 ? `${Math.round(elevation * 3.28084)} ft` : 'N/A';
        
        return [
          { icon: MapPin, value: distance },
          { icon: Zap, value: paceSpeed },
          { icon: Heart, value: hrDisplay },
          { icon: Mountain, value: elevationFt }
        ];
      }
    };
    
    return { discipline, duration, metrics: getMetrics() };
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
    <div className="w-full h-40 flex flex-col" style={{fontFamily: 'Inter, sans-serif'}}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
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
                  <div className="space-y-1">
                    {/* Title and Duration Row */}
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">
                        {workout.name || getDisciplineName(workout.type)}
                        {workout.workout_status !== 'completed' && (
                          <span className="text-xs text-orange-600 ml-2">(Planned)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {workout.workout_status === 'completed' ? (
                          <span className="text-green-600 font-medium">✓</span>
                        ) : (
                          <span className="text-orange-600 font-medium">📋</span>
                        )}
                        <span className="text-muted-foreground">
                          {formatRichWorkoutDisplay(workout).duration}
                        </span>
                      </div>
                    </div>
                    
                    {/* Metrics Row */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {formatRichWorkoutDisplay(workout).metrics.map((metric, index) => {
                        const IconComponent = metric.icon;
                        return (
                          <div key={index} className="flex items-center gap-1">
                            <IconComponent className="h-3 w-3" />
                            <span>{metric.value}</span>
                          </div>
                        );
                      })}
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