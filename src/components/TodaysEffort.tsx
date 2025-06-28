import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ChevronDown, ChevronRight, ChevronLeft, Clock } from 'lucide-react';

interface TodaysEffortProps {
  selectedDate?: string;
  onAddEffort: () => void;
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showIntervals, setShowIntervals] = useState(false);

  const today = new Date().toLocaleDateString('en-CA');
  const activeDate = selectedDate || today;

  // FIXED: Consistent date formatting with timezone fix
  const formatDateDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    return `${date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    })} effort`.replace(',', '');
  };

  const loadWorkoutsForDate = () => {
    if (workouts && workouts.length > 0) {
      const dateWorkouts = workouts.filter((w: any) => w.date === activeDate);
      setDisplayWorkouts(dateWorkouts);
      setCurrentIndex(0);
    } else {
      setDisplayWorkouts([]);
      setCurrentIndex(0);
    }
  };

  useEffect(() => {
    loadWorkoutsForDate();
  }, [workouts, activeDate]);

  const currentWorkout = displayWorkouts[currentIndex] || null;
  const totalWorkouts = displayWorkouts.length;

  const formatWorkoutType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
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

  const formatIntervals = () => {
    if (!currentWorkout) return null;

    if (currentWorkout.type === 'strength' && currentWorkout.strength_exercises) {
      return currentWorkout.strength_exercises.map((ex: any, idx: number) => (
        <div key={idx} className="text-xs md:text-sm text-gray-600 ml-3 md:ml-4 leading-snug">
          {ex.name}: {ex.sets}x{ex.reps} @ {ex.weight} {useImperial ? 'lbs' : 'kg'}
        </div>
      ));
    }

    if (currentWorkout.intervals) {
      return currentWorkout.intervals.map((interval: any, idx: number) => (
        <div key={idx} className="text-xs md:text-sm text-gray-600 ml-3 md:ml-4 leading-snug">
          {interval.time && `${interval.time}`}
          {interval.distance && ` ${interval.distance} ${useImperial ? 'mi' : 'km'}`}
          {interval.effortLabel && ` @ ${interval.effortLabel}`}
          {!interval.effortLabel && interval.powerTarget && ` @ ${interval.powerTarget}`}
          {!interval.effortLabel && !interval.powerTarget && interval.paceTarget && ` @ ${interval.paceTarget}`}
          {interval.rpeTarget && `, RPE ${interval.rpeTarget}`}
        </div>
      ));
    }

    return <p className="text-xs md:text-sm text-gray-500 ml-3 md:ml-4">No segments</p>;
  };

  if (loading) {
    return (
      <Card className="w-full" style={{fontFamily: 'Inter, sans-serif'}}>
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="text-base md:text-lg font-normal text-black flex items-center gap-2">
            {formatDateDisplay(activeDate)}
            {activeDate !== today && workouts && workouts.length > 0 && (
              (() => {
                const todaysWorkouts = workouts.filter((w: any) => w.date === today);
                if (todaysWorkouts.length > 0) {
                  const types = [...new Set(todaysWorkouts.map((w: any) => w.type))];
                  return (
                    <span className="text-xs md:text-sm text-gray-500 font-normal">
                      · today: {types.join(' ')}
                    </span>
                  );
                }
                return null;
              })()
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 md:py-4">
          <div className="text-center py-3 md:py-4">
            <p className="text-[#666666] text-sm">Loading...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentWorkout) {
    return (
      <Card className="w-full" style={{fontFamily: 'Inter, sans-serif'}}>
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="text-base md:text-lg font-normal text-black flex items-center gap-2">
            {formatDateDisplay(activeDate)}
            {activeDate !== today && workouts && workouts.length > 0 && (
              (() => {
                const todaysWorkouts = workouts.filter((w: any) => w.date === today);
                if (todaysWorkouts.length > 0) {
                  const types = [...new Set(todaysWorkouts.map((w: any) => w.type))];
                  return (
                    <span className="text-xs md:text-sm text-gray-500 font-normal">
                      · today: {types.join(' ')}
                    </span>
                  );
                }
                return null;
              })()
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 md:py-4">
          <div className="text-center py-3 md:py-4">
            <p className="text-[#666666] mb-3 text-sm">
              No effort scheduled for this date
            </p>
            <Button 
              onClick={() => {
                console.log('🆕 Add effort clicked for date:', activeDate);
                onAddEffort();
              }} 
              size="sm" 
              className="gap-2 bg-gray-600 text-white hover:bg-gray-700 border-gray-600 hover:border-gray-700 rounded-md transition-all duration-150 hover:transform hover:-translate-y-0.5 hover:shadow-md font-medium text-sm px-4 py-2 min-h-[36px]"
            >
              <Plus className="h-4 w-4" />
              Add effort
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const intervalCount = currentWorkout.type === 'strength'
    ? (currentWorkout.strength_exercises?.length || 0)
    : (currentWorkout.intervals?.length || 0);

  return (
    <Card
      className="w-full cursor-pointer hover:shadow-md transition-shadow"
      style={{fontFamily: 'Inter, sans-serif'}}
      onClick={() => {
        console.log('🔧 TodaysEffort clicked:', currentWorkout);
        onEditEffort && onEditEffort(currentWorkout);
      }}
    >
      <CardHeader className="pb-2 md:pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            <CardTitle className="text-base md:text-lg font-normal text-black flex items-center gap-2">
              {formatDateDisplay(activeDate)}
              {activeDate !== today && workouts && workouts.length > 0 && (
                (() => {
                  const todaysWorkouts = workouts.filter((w: any) => w.date === today);
                  if (todaysWorkouts.length > 0) {
                    const types = [...new Set(todaysWorkouts.map((w: any) => w.type))];
                    return (
                      <span className="text-xs md:text-sm text-gray-500 font-normal">
                        · today: {types.join(' ')}
                      </span>
                    );
                  }
                  return null;
                })()
              )}
            </CardTitle>
            {totalWorkouts > 1 && (
              <div className="flex items-center gap-1 md:gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(prev => prev > 0 ? prev - 1 : totalWorkouts - 1);
                  }}
                  className="p-1 hover:text-black transition-colors text-gray-400 hover:bg-gray-50 rounded min-w-[32px] min-h-[32px] flex items-center justify-center"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs md:text-sm font-normal text-gray-500 px-1 md:px-2">
                  {currentIndex + 1} of {totalWorkouts}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(prev => prev < totalWorkouts - 1 ? prev + 1 : 0);
                  }}
                  className="p-1 hover:text-black transition-colors text-gray-400 hover:bg-gray-50 rounded min-w-[32px] min-h-[32px] flex items-center justify-center"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 md:space-y-4 py-3 md:py-4">
        {/* Workout Title and Type */}
        <div className="space-y-1">
          <h3 className="font-medium text-base md:text-lg leading-tight">{currentWorkout.name || formatWorkoutType(currentWorkout.type)}</h3>
          <p className="text-xs md:text-sm text-gray-600">{formatWorkoutType(currentWorkout.type)}</p>
        </div>

        {/* Total Time Display */}
        {currentWorkout.duration && currentWorkout.duration > 0 && (
          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
            <Clock className="h-3 w-3 md:h-4 md:w-4" />
            <span className="font-medium">Total Time:</span>
            <span>{formatTime(currentWorkout.duration)}</span>
          </div>
        )}

        {/* Collapsible Segments */}
        {intervalCount > 0 && (
          <div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowIntervals(!showIntervals);
              }}
              className="flex items-center gap-2 text-xs md:text-sm font-medium hover:text-gray-600 transition-colors"
            >
              {showIntervals ? <ChevronDown className="h-3 w-3 md:h-4 md:w-4" /> : <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />}
              {currentWorkout.type === 'strength' ? 'Exercises' : 'Segments'} ({intervalCount})
            </button>
            {showIntervals && (
              <div className="mt-1 md:mt-2 space-y-1">
                {formatIntervals()}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {currentWorkout.userComments && (
          <div className="space-y-1">
            <p className="text-xs md:text-sm font-medium">Notes</p>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed">{currentWorkout.userComments}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TodaysEffort;