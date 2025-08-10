import React, { useMemo, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { Dumbbell } from 'lucide-react';

interface StrengthCompletedViewProps {
  workoutData: any;
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
  const [showComparison, setShowComparison] = useState(false);

  // 🔍 DEBUG: Log the workout data being received
  console.log("🔍 DEBUG - StrengthCompletedView received workoutData:", {
    id: workoutData.id,
    name: workoutData.name,
    type: workoutData.type,
    date: workoutData.date,
    strength_exercises: workoutData.strength_exercises,
    strength_exercises_type: typeof workoutData.strength_exercises,
    strength_exercises_length: workoutData.strength_exercises ? (Array.isArray(workoutData.strength_exercises) ? workoutData.strength_exercises.length : 'not array') : 'null/undefined',
    completed_exercises: workoutData.completed_exercises,
    completed_exercises_type: typeof workoutData.completed_exercises,
    completed_exercises_length: workoutData.completed_exercises ? (Array.isArray(workoutData.completed_exercises) ? workoutData.completed_exercises.length : 'not array') : 'null/undefined'
  });

  // Normalize dates to YYYY-MM-DD format for comparison
  const normalizeDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  // Find the original planned workout for comparison
  const plannedWorkout = useMemo(() => {
    const planned = workouts.find(w => 
      normalizeDate(w.date) === normalizeDate(workoutData.date) && 
      w.type === 'strength' && 
      w.workout_status === 'planned' &&
      w.id !== workoutData.id
    );
    return planned;
  }, [workouts, workoutData.date, workoutData.id]);

  // FIXED: Calculate volume for an exercise - count sets with actual data
  const calculateExerciseVolume = (sets: Array<{ reps: number; weight: number; completed?: boolean }>) => {
    return sets
      .filter(set => set.reps > 0 && set.weight > 0) // Changed from completed check to data check
      .reduce((total, set) => total + (set.reps * set.weight), 0);
  };

  // Calculate planned vs actual comparison for an exercise
  const getExerciseComparison = (exerciseName: string, completedSets: any[]) => {
    if (!plannedWorkout?.strength_exercises) return null;
    
    const plannedExercise = plannedWorkout.strength_exercises.find(
      ex => ex.name.toLowerCase() === exerciseName.toLowerCase()
    );
    
    if (!plannedExercise) return null;

    const plannedVolume = plannedExercise.sets * plannedExercise.reps * (plannedExercise.weight || 0);
    const actualVolume = calculateExerciseVolume(completedSets);
    const volumeDiff = actualVolume - plannedVolume;

    return {
      planned: {
        sets: plannedExercise.sets,
        reps: plannedExercise.reps,
        weight: plannedExercise.weight || 0,
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
    console.log("🔍 DEBUG - getCompletedExercises called with:", {
      strength_exercises: workoutData.strength_exercises,
      strength_exercises_length: workoutData.strength_exercises ? (Array.isArray(workoutData.strength_exercises) ? workoutData.strength_exercises.length : 'not array') : 'null/undefined',
      completed_exercises: workoutData.completed_exercises,
      completed_exercises_length: workoutData.completed_exercises ? (Array.isArray(workoutData.completed_exercises) ? workoutData.completed_exercises.length : 'not array') : 'null/undefined'
    });
    
    if (workoutData.strength_exercises && workoutData.strength_exercises.length > 0) {
      console.log("🔍 DEBUG - Returning strength_exercises:", workoutData.strength_exercises);
      return workoutData.strength_exercises;
    }
    
    if (workoutData.completed_exercises && workoutData.completed_exercises.length > 0) {
      console.log("🔍 DEBUG - Returning completed_exercises:", workoutData.completed_exercises);
      return workoutData.completed_exercises;
    }
    
    console.log("🔍 DEBUG - No exercises found, returning empty array");
    return [];
  };

  const completedExercises = getCompletedExercises();

  // FIXED: Calculate total workout statistics - count sets with data
  const workoutStats = useMemo(() => {
    let totalSets = 0;
    let totalReps = 0;
    let totalVolume = 0;
    
    completedExercises.forEach((exercise: CompletedExercise) => {
      if (!exercise.sets) return;
      
      // Changed: count sets with actual data instead of just completed sets
      const setsWithData = exercise.sets.filter(set => set.reps > 0 && set.weight > 0);
      totalSets += setsWithData.length;
      totalReps += setsWithData.reduce((sum, set) => sum + (set.reps || 0), 0);
      totalVolume += calculateExerciseVolume(exercise.sets);
    });

    return {
      actual: { sets: totalSets, reps: totalReps, volume: totalVolume }
    };
  }, [completedExercises]);

  return (
    <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header - Single header with dumbbell icon */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-gray-600" />
            <h1 className="text-xl font-semibold text-gray-900">{workoutData.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>{workoutData.duration || 0} min</span>
          <span>•</span>
          <span className="font-medium">{workoutStats.actual.volume.toLocaleString()} lbs total</span>
        </div>
        
        {/* Compare to Plan button */}
        {plannedWorkout && (
          <div className="pt-2">
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="text-sm text-gray-600 hover:text-gray-700 font-medium"
            >
              {showComparison ? 'Hide Plan Comparison' : 'Compare to Plan →'}
            </button>
          </div>
        )}
      </div>

      {/* Exercises */}
      {showComparison && plannedWorkout ? (
        // Side-by-side comparison view
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Planned Column */}
          <div className="space-y-4">
            <h3 className="font-semibold text-blue-600 border-b border-blue-200 pb-2">PLANNED</h3>
            {plannedWorkout.strength_exercises?.map((exercise: any, index: number) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">{exercise.name}</h4>
                  <span className="text-sm text-gray-600">
                    {((exercise.sets || 0) * (exercise.reps || 0) * (exercise.weight || 0)).toLocaleString()} lbs
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {exercise.sets || 0} sets × {exercise.reps || 0} reps @ {exercise.weight || 0} lbs
                </div>
              </div>
            ))}
          </div>

          {/* Completed Column */}
          <div className="space-y-4">
            <h3 className="font-semibold text-green-600 border-b border-green-200 pb-2">COMPLETED</h3>
            {completedExercises.map((exercise: CompletedExercise, index: number) => {
              if (!exercise.sets || !exercise.name) return null;
              const exerciseVolume = calculateExerciseVolume(exercise.sets);
              const comparison = getExerciseComparison(exercise.name, exercise.sets);
              
              return (
                <div key={exercise.id || index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900">{exercise.name}</h4>
                    <div className="text-right">
                      <span className="text-sm text-gray-900">{exerciseVolume.toLocaleString()} lbs</span>
                      {comparison && comparison.diff.volume !== 0 && (
                        <div className={`text-xs ${comparison.diff.volume > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {comparison.diff.volume > 0 ? '+' : ''}{comparison.diff.volume.toLocaleString()} lbs
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {exercise.sets.map((set, setIndex) => (
                      <div key={setIndex} className="text-sm text-gray-600 flex justify-between">
                        <span>Set {setIndex + 1}: {set.reps} reps @ {set.weight} lbs</span>
                        {set.rir && <span>RIR: {set.rir}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // Clean completed view (default)
        <div className="space-y-6">
          {completedExercises.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No completed exercises found
            </div>
          ) : (
            completedExercises.map((exercise: CompletedExercise, index: number) => {
              if (!exercise.sets || !exercise.name) return null;
              
              const exerciseVolume = calculateExerciseVolume(exercise.sets);

              return (
                <div key={exercise.id || index} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{exercise.name}</h3>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {exerciseVolume.toLocaleString()} lbs
                      </div>
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
                      return (
                        <div key={setIndex} className="grid grid-cols-4 gap-2 text-sm">
                          <span className="text-gray-600">{setIndex + 1}</span>
                          <span className="font-medium">
                            {set.weight || 0} lbs
                          </span>
                          <span>
                            {set.reps || 0}
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
      )}

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
            <div className="text-xs text-gray-500">Total Sets</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">{workoutStats.actual.reps}</div>
            <div className="text-xs text-gray-500">Total Reps</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">{workoutStats.actual.volume.toLocaleString()}</div>
            <div className="text-xs text-gray-500">Volume (lbs)</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StrengthCompletedView;