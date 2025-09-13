import React, { useMemo, useState } from 'react';
import StrengthCompareTable from './StrengthCompareTable';
import { useAppContext } from '@/contexts/AppContext';
import { Dumbbell } from 'lucide-react';

interface StrengthCompletedViewProps {
  workoutData: any;
  plannedWorkout?: any; // Optional planned workout data for comparison
}

interface CompletedExercise {
  id: string;
  name: string;
  sets?: Array<{
    reps: number;
    weight: number;
    rir?: number;
    completed: boolean;
  }>;
  notes?: string;
  reps?: number;
  weight?: number;
}

const StrengthCompletedView: React.FC<StrengthCompletedViewProps> = ({ workoutData, plannedWorkout: passedPlannedWorkout }) => {
  console.log('🔍 StrengthCompletedView received workoutData:', workoutData);
  console.log('🔍 strength_exercises:', workoutData.strength_exercises);
  console.log('🔍 completed_exercises:', workoutData.completed_exercises);
  console.log('🔍 workoutData type:', typeof workoutData);
  console.log('🔍 workoutData keys:', Object.keys(workoutData));
  
  const { workouts } = useAppContext();
  const [showComparison, setShowComparison] = useState(false);



  // Normalize dates to YYYY-MM-DD format for comparison
  const normalizeDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  // Find the planned workout - either the provided object if it's planned, or use passed planned workout
  const plannedWorkout = useMemo(() => {
    // If this is a planned workout, use it directly
    if (String(workoutData?.workout_status).toLowerCase() === 'planned') return workoutData;

    // If this is a completed workout, use the passed planned workout if available
    if (String(workoutData?.workout_status).toLowerCase() === 'completed') {
      console.log('🔍 StrengthCompletedView plannedWorkout useMemo:', {
        passedPlannedWorkout: passedPlannedWorkout,
        hasStrengthExercises: !!passedPlannedWorkout?.strength_exercises,
        strengthExercises: passedPlannedWorkout?.strength_exercises
      });
      return passedPlannedWorkout || null;
    }

    return null;
  }, [workoutData, passedPlannedWorkout]);

  // Find completed strength workout for the same date (logger save)
  const completedForDay = useMemo(() => {
    const sameDay = workouts.find(w => 
      normalizeDate(w.date) === normalizeDate(workoutData.date) &&
      w.type === 'strength' &&
      (w.workout_status === 'completed' || (w as any).status === 'completed')
    );
    return sameDay || null;
  }, [workouts, workoutData.date]);

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
    // If we have a saved completed workout for the day, prefer it
    if (completedForDay?.strength_exercises && completedForDay.strength_exercises.length > 0) {
      return completedForDay.strength_exercises as any[];
    }
    if (workoutData.strength_exercises && workoutData.strength_exercises.length > 0) {
      return workoutData.strength_exercises as any[];
    }
    if (workoutData.completed_exercises && workoutData.completed_exercises.length > 0) {
      return workoutData.completed_exercises as any[];
    }
    return [] as any[];
  };

  // Sanitize completed exercises to avoid rendering raw objects by mistake
  const completedExercises = getCompletedExercises().map((ex: any) => {
    const safeSets = Array.isArray(ex?.sets)
      ? ex.sets.map((s: any) => ({
          reps: Number((s?.reps as any) ?? 0) || 0,
          weight: Number((s?.weight as any) ?? 0) || 0,
          rir: typeof s?.rir === 'number' ? s.rir : undefined,
          completed: Boolean(s?.completed)
        }))
      : [];
    return { ...ex, sets: safeSets };
  });

  // FIXED: Calculate total workout statistics - handle both array and single exercise formats
  const workoutStats = useMemo(() => {
    let totalSets = 0;
    let totalReps = 0;
    let totalVolume = 0;
    
    completedExercises.forEach((exercise: CompletedExercise) => {
      if (exercise.sets && Array.isArray(exercise.sets)) {
        // Exercise with sets array
        const setsWithData = exercise.sets.filter(set => set.reps > 0 && set.weight > 0);
        totalSets += setsWithData.length;
        totalReps += setsWithData.reduce((sum, set) => sum + (set.reps || 0), 0);
        totalVolume += calculateExerciseVolume(exercise.sets);
      } else if (exercise.notes) {
        // Exercise with notes (from our description parsing)
        totalSets += 1;
        totalReps += exercise.reps || 0;
        totalVolume += 0; // No weight data from description
      }
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
        <StrengthCompareTable
          planned={(plannedWorkout.strength_exercises || []).map((ex: any)=>{
            // Normalize planned fields - handle both array and individual value formats
            const setsArr = Array.isArray(ex.sets) ? ex.sets : [];
            const setsNum = setsArr.length || (typeof ex.sets === 'number' ? ex.sets : 0);
            const repsNum = typeof ex.reps === 'number' ? ex.reps : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.reps)||0), 0) / setsArr.length) : 0);
            const weightNum = typeof ex.weight === 'number' ? ex.weight : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.weight)||0), 0) / setsArr.length) : 0);
            
            console.log('🔍 Mapping planned exercise:', {
              original: ex,
              setsArr,
              setsNum,
              repsNum,
              weightNum,
              mapped: { name: ex.name, sets: setsNum, reps: repsNum, weight: weightNum }
            });
            
            return { name: ex.name, sets: setsNum, reps: repsNum, weight: weightNum };
          })}
          completed={completedExercises.map((ex: any)=>({ name: ex.name, setsArray: Array.isArray(ex.sets)?ex.sets:[] }))}
        />
      ) : (
                // Clean completed view (default)
        <div className="space-y-6">
          {completedExercises.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No completed exercises found
            </div>
          ) : (
            completedExercises.map((exercise: CompletedExercise, index: number) => {
              if (!exercise.name) return null;
              
              // Check if this is a workout with description details (from our fix)
              if (exercise.notes) {
                return (
                  <div key={exercise.id || index} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{exercise.name}</h3>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700">{exercise.notes}</p>
                    </div>
                  </div>
                );
              }
              
              // Regular exercise with sets array
              if (!exercise.sets || !Array.isArray(exercise.sets)) return null;
              
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
                    <div className="grid grid-cols-4 gap-2 text-xs font-medium text-gray-500 pb-1 border-b border-gray-200">
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