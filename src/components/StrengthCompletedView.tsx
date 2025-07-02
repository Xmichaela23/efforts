import React, { useMemo } from 'react';
import { useAppContext } from '@/contexts/AppContext';

interface StrengthCompletedViewProps {
  workoutData: any; // The completed workout data
}

interface PlannedWorkout {
  id: string;
  name: string;
  type: 'strength';
  date: string;
  strength_exercises: Array<{
    id: string;
    name: string;
    sets: number;
    reps: number;
    weight: number;
  }>;
}

interface CompletedExercise {
  id: string;
  name: string;
  sets: Array<{
    reps: number;
    weight: number;
    rir?: number;
    completed: boolean;
  }>;
}

const StrengthCompletedView: React.FC<StrengthCompletedViewProps> = ({ workoutData }) => {
  const { workouts } = useAppContext();

  // Debug logging
  console.log('🔍 StrengthCompletedView received:', {
    workoutData,
    hasStrengthExercises: !!workoutData.strength_exercises,
    strengthExercisesLength: workoutData.strength_exercises?.length || 0,
    strengthExercisesData: workoutData.strength_exercises
  });

  // Find the original planned workout for comparison
  const plannedWorkout = useMemo(() => {
    const found = workouts.find(w => 
      w.date === workoutData.date && 
      w.type === 'strength' && 
      w.workout_status === 'planned'
    );
    console.log('🔍 Found planned workout:', found);
    return found;
  }, [workouts, workoutData.date]);

  // Calculate volume for an exercise
  const calculateExerciseVolume = (sets: Array<{ reps: number; weight: number; completed?: boolean }>) => {
    return sets
      .filter(set => set.completed !== false) // Include completed sets or sets without completed flag
      .reduce((total, set) => total + (set.reps * set.weight), 0);
  };

  // Calculate planned vs actual comparison for an exercise
  const getExerciseComparison = (exerciseName: string, completedSets: any[]) => {
    if (!plannedWorkout?.strength_exercises) return null;
    
    const plannedExercise = plannedWorkout.strength_exercises.find(
      ex => ex.name.toLowerCase() === exerciseName.toLowerCase()
    );
    
    if (!plannedExercise) return null;

    const plannedVolume = plannedExercise.sets * plannedExercise.reps * plannedExercise.weight;
    const actualVolume = calculateExerciseVolume(completedSets);
    const volumeDiff = actualVolume - plannedVolume;

    return {
      planned: {
        sets: plannedExercise.sets,
        reps: plannedExercise.reps,
        weight: plannedExercise.weight,
        volume: plannedVolume
      },
      actual: {
        volume: actualVolume
      },
      diff: {
        volume: volumeDiff
      }
    };
  };

  // Determine which exercises array to use
  const getCompletedExercises = () => {
    // First try strength_exercises (from the database)
    if (workoutData.strength_exercises && workoutData.strength_exercises.length > 0) {
      return workoutData.strength_exercises;
    }
    
    // Then try completed_exercises (from the StrengthLogger)
    if (workoutData.completed_exercises && workoutData.completed_exercises.length > 0) {
      return workoutData.completed_exercises;
    }
    
    // Return empty array if neither exists
    return [];
  };

  const completedExercises = getCompletedExercises();

  // Calculate total workout statistics
  const workoutStats = useMemo(() => {
    let totalSets = 0;
    let totalReps = 0;
    let totalVolume = 0;
    
    completedExercises.forEach((exercise: CompletedExercise) => {
      if (!exercise.sets) return;
      
      const completedSets = exercise.sets.filter(set => set.completed !== false);
      totalSets += completedSets.length;
      totalReps += completedSets.reduce((sum, set) => sum + (set.reps || 0), 0);
      totalVolume += calculateExerciseVolume(completedSets);
    });

    // Calculate planned totals if planned workout exists
    let plannedStats = null;
    if (plannedWorkout?.strength_exercises) {
      const plannedSets = plannedWorkout.strength_exercises.reduce((sum, ex) => sum + (ex.sets || 0), 0);
      const plannedReps = plannedWorkout.strength_exercises.reduce((sum, ex) => sum + ((ex.sets || 0) * (ex.reps || 0)), 0);
      const plannedVolume = plannedWorkout.strength_exercises.reduce((sum, ex) => sum + ((ex.sets || 0) * (ex.reps || 0) * (ex.weight || 0)), 0);
      
      plannedStats = {
        sets: plannedSets,
        reps: plannedReps,
        volume: plannedVolume
      };
    }

    return {
      actual: { sets: totalSets, reps: totalReps, volume: totalVolume },
      planned: plannedStats,
      diffs: plannedStats ? {
        sets: totalSets - plannedStats.sets,
        reps: totalReps - plannedStats.reps,
        volume: totalVolume - plannedStats.volume
      } : null
    };
  }, [completedExercises, plannedWorkout]);

  console.log('🔍 Rendering with:', {
    completedExercisesCount: completedExercises.length,
    workoutStats,
    plannedWorkout: !!plannedWorkout
  });

  return (
    <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">{workoutData.name}</h1>
          <span className="text-sm text-green-600 font-medium">COMPLETED</span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{workoutData.date}</span>
          <span>•</span>
          <span>{workoutData.duration} min</span>
          <span>•</span>
          <span className="font-medium">{workoutStats.actual.volume.toLocaleString()} lbs total</span>
        </div>
      </div>

      {/* Exercises */}
      <div className="space-y-6">
        {completedExercises.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No completed exercises found
          </div>
        ) : (
          completedExercises.map((exercise: CompletedExercise, index: number) => {
            if (!exercise.sets || !exercise.name) return null;
            
            const comparison = getExerciseComparison(exercise.name, exercise.sets);
            const exerciseVolume = calculateExerciseVolume(exercise.sets);
            
            return (
              <div key={exercise.id || index} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{exercise.name}</h3>
                    {comparison && (
                      <div className="text-xs text-gray-500">
                        Planned: {comparison.planned.volume.toLocaleString()} lbs
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {exerciseVolume.toLocaleString()} lbs
                    </div>
                    {comparison && comparison.diff.volume !== 0 && (
                      <div className={`text-xs ${comparison.diff.volume > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {comparison.diff.volume > 0 ? '+' : ''}{comparison.diff.volume.toLocaleString()} lbs ↗
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-xs font-medium text-gray-500 pb-1 border-b border-gray-100">
                    <span>Set</span>
                    <span>Weight</span>
                    <span>Reps</span>
                    <span>RIR</span>
                  </div>
                  
                  {exercise.sets.map((set, setIndex) => {
                    // Find planned set for comparison
                    const plannedSet = comparison?.planned;
                    const weightDiff = plannedSet ? (set.weight || 0) - plannedSet.weight : 0;
                    const repsDiff = plannedSet ? (set.reps || 0) - plannedSet.reps : 0;
                    
                    return (
                      <div key={setIndex} className="grid grid-cols-4 gap-2 text-sm">
                        <span className="text-gray-600">{setIndex + 1}</span>
                        <span className={`font-medium ${weightDiff > 0 ? 'text-green-600' : ''}`}>
                          {set.weight || 0} lbs
                          {weightDiff > 0 && (
                            <span className="text-xs text-gray-400 ml-1">(+{weightDiff})</span>
                          )}
                        </span>
                        <span className={repsDiff > 0 ? 'text-green-600' : ''}>
                          {set.reps || 0}
                          {repsDiff > 0 && (
                            <span className="text-xs text-gray-400 ml-1">(+{repsDiff})</span>
                          )}
                        </span>
                        <span className="text-gray-500">{set.rir || '-'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Notes Section */}
      {workoutData.userComments && (
        <div className="p-4 bg-gray-50">
          <h3 className="font-medium text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-700">{workoutData.userComments}</p>
        </div>
      )}

      {/* Workout Statistics */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold text-gray-900">{workoutStats.actual.sets}</div>
            <div className="text-xs text-gray-500">
              {workoutStats.diffs && workoutStats.diffs.sets !== 0 && (
                <span className={workoutStats.diffs.sets > 0 ? 'text-green-600' : 'text-red-600'}>
                  {workoutStats.diffs.sets > 0 ? '+' : ''}{workoutStats.diffs.sets}
                </span>
              )}
              {!workoutStats.diffs && 'Total Sets'}
              {workoutStats.diffs && workoutStats.diffs.sets === 0 && 'Total Sets'}
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">{workoutStats.actual.reps}</div>
            <div className="text-xs text-gray-500">
              {workoutStats.diffs && workoutStats.diffs.reps !== 0 && (
                <span className={workoutStats.diffs.reps > 0 ? 'text-green-600' : 'text-red-600'}>
                  {workoutStats.diffs.reps > 0 ? '+' : ''}{workoutStats.diffs.reps}
                </span>
              )}
              {!workoutStats.diffs && 'Total Reps'}
              {workoutStats.diffs && workoutStats.diffs.reps === 0 && 'Total Reps'}
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">{workoutStats.actual.volume.toLocaleString()}</div>
            <div className="text-xs text-gray-500">
              {workoutStats.diffs && workoutStats.diffs.volume !== 0 && (
                <span className={workoutStats.diffs.volume > 0 ? 'text-green-600' : 'text-red-600'}>
                  {workoutStats.diffs.volume > 0 ? '+' : ''}{workoutStats.diffs.volume.toLocaleString()}
                </span>
              )}
              {!workoutStats.diffs && 'Volume (lbs)'}
              {workoutStats.diffs && workoutStats.diffs.volume === 0 && 'Volume (lbs)'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrengthCompletedView;