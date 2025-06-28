import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ChevronDown, ChevronRight, ChevronLeft, Clock } from 'lucide-react';

interface TodaysEffortProps {
  onAddEffort: () => void;
  onViewCompleted: () => void;
  onEditEffort?: (workout: any) => void;
}

const TodaysEffort: React.FC<TodaysEffortProps> = ({ onAddEffort, onViewCompleted, onEditEffort }) => {
  const { useImperial, workouts, loading } = useAppContext();
  const [todaysWorkouts, setTodaysWorkouts] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showIntervals, setShowIntervals] = useState(false);

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format

  // Function to load today's workouts from Supabase via AppContext
  const loadTodaysWorkouts = () => {
    if (workouts && workouts.length > 0) {
      const todayWorkouts = workouts.filter((w: any) => w.date === today);
      setTodaysWorkouts(todayWorkouts);
      setCurrentIndex(0); // Reset to first workout
    } else {
      setTodaysWorkouts([]);
      setCurrentIndex(0);
    }
  };

  useEffect(() => {
    loadTodaysWorkouts();
  }, [workouts, today]);

  const currentWorkout = todaysWorkouts[currentIndex] || null;
  const totalWorkouts = todaysWorkouts.length;

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
        <div key={idx} className="text-sm text-gray-600 ml-4">
          {ex.name}: {ex.sets}x{ex.reps} @ {ex.weight} {useImperial ? 'lbs' : 'kg'}
        </div>
      ));
    }

    if (currentWorkout.intervals) {
      return currentWorkout.intervals.map((interval: any, idx: number) => (
        <div key={idx} className="text-sm text-gray-600 ml-4">
          {interval.time && `${interval.time}`}
          {interval.distance && ` ${interval.distance} ${useImperial ? 'mi' : 'km'}`}
          {interval.effortLabel && ` @ ${interval.effortLabel}`}
          {!interval.effortLabel && interval.powerTarget && ` @ ${interval.powerTarget}`}
          {!interval.effortLabel && !interval.powerTarget && interval.paceTarget && ` @ ${interval.paceTarget}`}
          {interval.rpeTarget && `, RPE ${interval.rpeTarget}`}
        </div>
      ));
    }

    return <p className="text-sm text-gray-500 ml-4">No segments</p>;
  };

  // Show loading state if data is still being fetched
  if (loading) {
    return (
      <Card className="w-full" style={{fontFamily: 'Inter, sans-serif'}}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-normal text-black">
            Today's effort
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-[#666666]">Loading...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentWorkout) {
    return (
      <Card className="w-full" style={{fontFamily: 'Inter, sans-serif'}}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-normal text-black">
            Today's effort
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-[#666666] mb-3">
              No effort scheduled for today
            </p>
            <Button onClick={onAddEffort} size="sm" className="gap-2 bg-black text-white hover:bg-gray-800">
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
        console.log('🔧 onEditEffort function:', !!onEditEffort);
        console.log('🔧 Workout ID:', currentWorkout?.id);
        console.log('🔧 Workout type:', currentWorkout?.type);
        onEditEffort && onEditEffort(currentWorkout);
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="text-lg font-normal text-black">
              Today's effort
            </CardTitle>
            {totalWorkouts > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(prev => prev > 0 ? prev - 1 : totalWorkouts - 1);
                  }}
                  className="p-1 hover:text-black transition-colors text-gray-400 hover:bg-gray-50 rounded"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-normal text-gray-500 px-2">
                  {currentIndex + 1} of {totalWorkouts}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(prev => prev < totalWorkouts - 1 ? prev + 1 : 0);
                  }}
                  className="p-1 hover:text-black transition-colors text-gray-400 hover:bg-gray-50 rounded"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Workout Title and Type */}
        <div>
          <h3 className="font-medium text-lg">{currentWorkout.name || formatWorkoutType(currentWorkout.type)}</h3>
          <p className="text-sm text-gray-600">{formatWorkoutType(currentWorkout.type)}</p>
        </div>

        {/* Total Time Display */}
        {currentWorkout.duration && currentWorkout.duration > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="h-4 w-4" />
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
              className="flex items-center gap-2 text-sm font-medium hover:text-gray-600 transition-colors"
            >
              {showIntervals ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {currentWorkout.type === 'strength' ? 'Exercises' : 'Segments'} ({intervalCount})
            </button>
            {showIntervals && (
              <div className="mt-2">
                {formatIntervals()}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {currentWorkout.userComments && (
          <div>
            <p className="text-sm font-medium mb-1">Notes</p>
            <p className="text-sm text-gray-600">{currentWorkout.userComments}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TodaysEffort;