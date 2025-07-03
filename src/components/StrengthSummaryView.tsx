import React, { useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';

interface StrengthSummaryViewProps {
  workoutData: any;
}

interface HistoricalSession {
  date: string;
  sets: number;
  reps: number;
  weight: number;
  isPR: boolean;
  percentOfMax: number;
}

const StrengthSummaryView: React.FC<StrengthSummaryViewProps> = ({ workoutData }) => {
  const { workouts } = useAppContext();

  // Get current workout exercises
  const getCurrentExercises = () => {
    if (workoutData.strength_exercises && workoutData.strength_exercises.length > 0) {
      return workoutData.strength_exercises;
    }
    if (workoutData.completed_exercises && workoutData.completed_exercises.length > 0) {
      return workoutData.completed_exercises;
    }
    return [];
  };

  const currentExercises = getCurrentExercises();

  // Get historical data for each exercise
  const getHistoricalData = useMemo(() => {
    const exerciseHistory: { [key: string]: HistoricalSession[] } = {};

    currentExercises.forEach((currentExercise: any) => {
      const exerciseName = currentExercise.name;
      
      // Find all historical workouts with this exercise
      const historicalWorkouts = workouts
        .filter(w => 
          w.type === 'strength' && 
          w.workout_status === 'completed' &&
          (w.strength_exercises || w.completed_exercises)
        )
        .map(w => {
          const exercises = w.strength_exercises || w.completed_exercises || [];
          const exercise = exercises.find((ex: any) => 
            ex.name.toLowerCase() === exerciseName.toLowerCase()
          );
          
          if (!exercise) return null;

          // Calculate max weight for this session
          let maxWeight = 0;
          let totalSets = 0;
          let avgReps = 0;

          if (exercise.sets && Array.isArray(exercise.sets)) {
            // Completed exercise format
            const completedSets = exercise.sets.filter((set: any) => set.completed !== false);
            maxWeight = Math.max(...completedSets.map((set: any) => set.weight || 0));
            totalSets = completedSets.length;
            avgReps = completedSets.reduce((sum: number, set: any) => sum + (set.reps || 0), 0) / completedSets.length;
          } else {
            // Planned exercise format
            maxWeight = exercise.weight || 0;
            totalSets = exercise.sets || 0;
            avgReps = exercise.reps || 0;
          }

          return {
            date: w.date,
            weight: maxWeight,
            sets: totalSets,
            reps: Math.round(avgReps),
            workoutId: w.id
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 4); // Last 4 sessions

      if (historicalWorkouts.length > 0) {
        // Calculate all-time max for PR detection and percentages
        const allTimeMax = Math.max(...historicalWorkouts.map(session => session.weight));
        
        exerciseHistory[exerciseName] = historicalWorkouts.map((session, index) => ({
          date: session.date,
          sets: session.sets,
          reps: session.reps,
          weight: session.weight,
          isPR: session.weight === allTimeMax && index === 0, // PR if it's max weight and most recent
          percentOfMax: allTimeMax > 0 ? Math.round((session.weight / allTimeMax) * 100) : 0
        }));
      }
    });

    return exerciseHistory;
  }, [workouts, currentExercises]);

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const isToday = dateString === today.toLocaleDateString('en-CA');
    const isYesterday = dateString === yesterday.toLocaleDateString('en-CA');

    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      {Object.entries(getHistoricalData).map(([exerciseName, sessions]) => (
        <div key={exerciseName} className="space-y-3">
          <h3 className="font-semibold text-gray-900">{exerciseName} - Last {sessions.length} Sessions</h3>
          
          <div className="space-y-2">
            {sessions.map((session, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {formatDate(session.date)}: {session.sets}x{session.reps} @ {session.weight} lbs
                  {session.isPR && <span className="text-gray-900"> (PR)</span>}
                </span>
                <span className="text-gray-500">
                  {session.percentOfMax}% of max
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {Object.keys(getHistoricalData).length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No historical data available
        </div>
      )}
    </div>
  );
};

export default StrengthSummaryView;