import React, { useMemo } from 'react';

interface StrengthCompletedViewProps {
  workoutData: any; // The completed workout data
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
  // Debug logging
  console.log('🔍 StrengthCompletedView received:', {
    workoutData,
    hasStrengthExercises: !!workoutData.strength_exercises,
    strengthExercisesLength: workoutData.strength_exercises?.length || 0,
    strengthExercisesData: workoutData.strength_exercises
  });

  // Calculate volume for an exercise
  const calculateExerciseVolume = (sets: Array<{ reps: number; weight: number; completed?: boolean }>) => {
    return sets
      .filter(set => set.completed !== false) // Include completed sets or sets without completed flag
      .reduce((total, set) => total + (set.reps * set.weight), 0);
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

  // Calculate total workout statistics - simplified to only show actual values
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

    return {
      sets: totalSets,
      reps: totalReps,
      volume: totalVolume
    };
  }, [completedExercises]);

  console.log('🔍 Rendering with:', {
    completedExercisesCount: completedExercises.length,
    workoutStats
  });

  return (
    <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Exercises - no header, just the content */}
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

      {/* Notes Section */}
      {workoutData.userComments && (
        <div className="p-4 bg-gray-50">
          <h3 className="font-medium text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-700">{workoutData.userComments}</p>
        </div>
      )}
    </div>
  );
};

export default StrengthCompletedView;