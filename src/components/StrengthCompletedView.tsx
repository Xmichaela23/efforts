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
      // If we have a passed planned workout, use it
      if (passedPlannedWorkout) {
        return passedPlannedWorkout;
      }
      
      // Otherwise, if this completed workout has a planned_id, we need to fetch the planned data
      // For now, return null - the parent component should handle fetching
      return null;
    }

    return null;
  }, [workoutData, passedPlannedWorkout]);

  // Find completed workout for the same date (logger save) - supports both strength and mobility
  const completedForDay = useMemo(() => {
    const workoutType = String(workoutData?.type || '').toLowerCase();
    const sameDay = workouts.find(w => 
      normalizeDate(w.date) === normalizeDate(workoutData.date) &&
      (w.type === workoutType) &&
      ((w as any).workout_status === 'completed' || (w as any).status === 'completed')
    );
    return sameDay || null;
  }, [workouts, workoutData.date, workoutData.type]);

  // FIXED: Calculate volume for an exercise - count sets with actual data
  const calculateExerciseVolume = (sets: Array<{ reps: number; weight: number; completed?: boolean }>) => {
    return sets
      .filter(set => set.reps > 0 && set.weight > 0) // Changed from completed check to data check
      .reduce((total, set) => total + (set.reps * set.weight), 0);
  };

  // Calculate planned vs actual comparison for an exercise - supports both strength and mobility
  const getExerciseComparison = (exerciseName: string, completedSets: any[]) => {
    const plannedExercises = (plannedWorkout?.strength_exercises || plannedWorkout?.mobility_exercises);
    if (!plannedExercises) return null;
    
    const plannedExercise = plannedExercises.find(
      (ex: any) => ex.name.toLowerCase() === exerciseName.toLowerCase()
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

  // Parse possibly stringified JSONB columns
  const parseExercises = (raw: any): any[] => {
    try {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };

  // Determine which exercises array to use - supports both strength and mobility
  const getCompletedExercises = () => {
    // If we have a saved completed workout for the day, prefer it (check both fields)
    const dayStrength = parseExercises((completedForDay as any)?.strength_exercises);
    if (dayStrength.length > 0) return dayStrength;
    
    const dayMobility = parseExercises((completedForDay as any)?.mobility_exercises);
    if (dayMobility.length > 0) return dayMobility;
    
    const workoutStrength = parseExercises((workoutData as any).strength_exercises);
    if (workoutStrength.length > 0) return workoutStrength;
    
    const workoutMobility = parseExercises((workoutData as any).mobility_exercises);
    if (workoutMobility.length > 0) return workoutMobility;
    
    const completed = parseExercises((workoutData as any).completed_exercises);
    if (completed.length > 0) return completed;
    
    return [];
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

  // Calculate total workout statistics
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
          {(typeof workoutData?.rpe === 'number' || (workoutData?.notes && String(workoutData.notes).trim().length > 0)) && (
            <div className="flex items-center gap-4 text-sm text-gray-700">
              {typeof workoutData?.rpe === 'number' && (
                <div className="px-2 py-1 rounded bg-gray-100">RPE: {workoutData.rpe}</div>
              )}
              {workoutData?.notes && String(workoutData.notes).trim().length > 0 && (
                <div className="hidden sm:block max-w-[360px] truncate" title={workoutData.notes}>Notes: {workoutData.notes}</div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
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

      {/* Notes (expanded block on mobile/smaller screens) */}
      {workoutData?.notes && String(workoutData.notes).trim().length > 0 && (
        <div className="p-3 bg-gray-50 rounded-md sm:hidden">
          <div className="text-sm text-gray-900 font-medium mb-1">Notes</div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap">{workoutData.notes}</div>
        </div>
      )}

      {/* Exercises */}
      {showComparison && plannedWorkout ? (
        <StrengthCompareTable
          planned={((plannedWorkout as any).strength_exercises || (plannedWorkout as any).mobility_exercises || []).map((ex: any)=>{
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