import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Plus, Activity, Bike, Waves, Dumbbell, Move, ChevronDown, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

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
  const [currentIndex, setCurrentIndex] = useState(1); // Start at 1 due to prepended duplicate
  const [transitionEnabled, setTransitionEnabled] = useState(true);

  const today = new Date().toLocaleDateString('en-CA');
  const activeDate = selectedDate || today;

  const loadWorkoutsForDate = () => {
    if (workouts && workouts.length > 0) {
      const dateWorkouts = workouts.filter((w: any) => w.date === activeDate);
      setDisplayWorkouts(dateWorkouts);
      setCurrentIndex(1); // Reset to first real item when date changes
    } else {
      setDisplayWorkouts([]);
      setCurrentIndex(1);
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

  // Create carousel items with duplicates for seamless looping
  const createCarouselItems = () => {
    const addEffortCard = { type: 'add-effort', id: 'add-effort' };
    const originalItems = [...displayWorkouts, addEffortCard];
    
    if (originalItems.length <= 1) {
      return originalItems;
    }
    
    // Create: [last_item, ...original_items, first_item]
    const lastItem = originalItems[originalItems.length - 1];
    const firstItem = originalItems[0];
    
    return [lastItem, ...originalItems, firstItem];
  };

  const carouselItems = createCarouselItems();
  const originalItemsLength = displayWorkouts.length + 1; // +1 for add effort card

  // Navigation functions with seamless looping using requestAnimationFrame
  const goLeft = () => {
    if (originalItemsLength <= 1) return;
    
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    
    // If we're at the first duplicate (index 0), snap to the real last item
    if (newIndex === 0) {
      setTimeout(() => {
        setTransitionEnabled(false);
        requestAnimationFrame(() => {
          setCurrentIndex(originalItemsLength);
          requestAnimationFrame(() => {
            setTransitionEnabled(true);
          });
        });
      }, 300); // Wait for transition to complete (300ms matches CSS transition)
    }
  };

  const goRight = () => {
    if (originalItemsLength <= 1) return;
    
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    
    // If we're at the last duplicate, snap to the real first item
    if (newIndex === originalItemsLength + 1) {
      setTimeout(() => {
        setTransitionEnabled(false);
        requestAnimationFrame(() => {
          setCurrentIndex(1);
          requestAnimationFrame(() => {
            setTransitionEnabled(true);
          });
        });
      }, 300); // Wait for transition to complete (300ms matches CSS transition)
    }
  };

  // Get the current real index for dots (accounting for duplicates)
  const getRealIndex = () => {
    if (originalItemsLength <= 1) return 0;
    if (currentIndex === 0) return originalItemsLength - 1; // First duplicate shows last real item
    if (currentIndex === originalItemsLength + 1) return 0; // Last duplicate shows first real item
    return currentIndex - 1; // Adjust for prepended duplicate
  };

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
      <div className="w-full py-6">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full" style={{fontFamily: 'Inter, sans-serif'}}>
      {/* Date Header - Always visible */}
      <div className="flex items-center justify-between mb-6 px-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {formatDisplayDate(activeDate)}
          </span>
          {/* Show actual date if it's not today/yesterday/tomorrow */}
          {!['Today', 'Yesterday', 'Tomorrow'].includes(formatDisplayDate(activeDate)) && (
            <span className="text-xs text-muted-foreground">
              ({new Date(activeDate + 'T00:00:00').toLocaleDateString('en-US', { 
                month: 'numeric', 
                day: 'numeric',
                year: new Date(activeDate).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
              })})
            </span>
          )}
        </div>
        
        {/* Show effort count if any exist */}
        {displayWorkouts.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {displayWorkouts.length} effort{displayWorkouts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {displayWorkouts.length === 0 ? (
        <div className="w-full py-8 px-4">
          <div className="text-center">
            <p className="text-muted-foreground mb-6 text-sm">
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
      ) : (
        <div className="w-full relative">
          {/* Navigation buttons - only show if more than 1 item */}
          {originalItemsLength > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
                onClick={goLeft}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
                onClick={goRight}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Workout cards container */}
          <div className="overflow-hidden px-4">
            <div 
              className="flex"
              style={{ 
                transform: `translateX(-${currentIndex * 100}%)`,
                transition: transitionEnabled ? 'transform 0.3s ease-in-out' : 'none'
              }}
            >
              {/* Render carousel items (includes duplicates) */}
              {carouselItems.map((item, index) => {
                if (item.type === 'add-effort') {
                  return (
                    <div key={`add-effort-${index}`} className="basis-full flex-shrink-0">
                      <div className="p-6 flex items-center justify-center min-h-[120px] mx-2">
                        <AddEffortDropdown />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${item.id}-${index}`}
                    className="basis-full flex-shrink-0"
                    onClick={() => {
                      console.log('🔧 Workout clicked:', item);
                      onEditEffort && onEditEffort(item);
                    }}
                  >
                    <div className="p-6 hover:bg-gray-50 transition-colors cursor-pointer min-h-[120px] mx-2">
                      {/* Workout title and summary */}
                      <div className="space-y-3">
                        <h3 className="font-medium text-base leading-tight">
                          {item.name || formatWorkoutType(item.type)}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {getIcon(item.type)}
                          <span>{getWorkoutSummary(item)}</span>
                        </div>
                        
                        {/* Notes if present */}
                        {item.userComments && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {item.userComments}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation dots - only show if more than 1 item */}
          {originalItemsLength > 1 && (
            <div className="flex justify-center mt-4">
              <div className="flex gap-2">
                {Array.from({ length: originalItemsLength }).map((_, index) => (
                  <button
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === getRealIndex() ? 'bg-foreground' : 'bg-muted-foreground'
                    }`}
                    onClick={() => setCurrentIndex(index + 1)} // +1 to account for prepended duplicate
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TodaysEffort;