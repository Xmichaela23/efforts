import React, { useMemo, useState } from 'react';
import StrengthCompareTable from './StrengthCompareTable';
import { useAppContext } from '@/contexts/AppContext';
import { Dumbbell } from 'lucide-react';
import { getSessionRPE, getWorkoutNotes, getWorkoutReadiness } from '@/utils/workoutMetadata';

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



  // Normalize dates to YYYY-MM-DD format for comparison using user's local timezone
  const normalizeDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-CA');
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
    // Extract clean exercise name (text before colon, or full name if no colon)
    const cleanName = ex?.name ? String(ex.name).split(':')[0].trim() : '';
    
    // Handle old mobility format: {name, duration: '2x8', weight: 20}
    if (!Array.isArray(ex?.sets) && ex?.duration && typeof ex.duration === 'string') {
      // Parse duration like "2x8" or "3x10"
      const match = ex.duration.match(/(\d+)x(\d+)/i);
      if (match) {
        const numSets = parseInt(match[1], 10);
        const reps = parseInt(match[2], 10);
        const weight = Number(ex?.weight || 0);
        
        // Generate sets array
        const generatedSets = Array.from({ length: numSets }, () => ({
          reps,
          weight,
          rir: undefined,
          completed: true
        }));
        
        return { ...ex, name: cleanName, sets: generatedSets };
      }
    }
    
    // Handle standard format with sets array
    const safeSets = Array.isArray(ex?.sets)
      ? ex.sets.map((s: any) => ({
          reps: Number((s?.reps as any) ?? 0) || 0,
          weight: Number((s?.weight as any) ?? 0) || 0,
          rir: typeof s?.rir === 'number' ? s.rir : undefined,
          completed: Boolean(s?.completed)
        }))
      : [];
    return { ...ex, name: cleanName, sets: safeSets };
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
          {(getSessionRPE(workoutData) !== undefined || getWorkoutNotes(workoutData)) && (
            <div className="flex items-center gap-4 text-sm text-gray-700">
              {getSessionRPE(workoutData) !== undefined && (
                <div className="px-2 py-1 rounded bg-gray-100">RPE: {getSessionRPE(workoutData)}</div>
              )}
              {getWorkoutNotes(workoutData) && (
                <div className="hidden sm:block max-w-[360px] truncate" title={getWorkoutNotes(workoutData)}>Notes: {getWorkoutNotes(workoutData)}</div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="font-medium">{workoutStats.actual.volume.toLocaleString()} lbs total</span>
          {(workoutData as any).workload_actual || (workoutData as any).workload_planned ? (
            <span className="workload-line">
              Workload: {(workoutData as any).workload_actual || (workoutData as any).workload_planned}
            </span>
          ) : null}
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
      {getWorkoutNotes(workoutData) && (
        <div className="p-3 bg-gray-50 rounded-md sm:hidden">
          <div className="text-sm text-gray-900 font-medium mb-1">Notes</div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap">{getWorkoutNotes(workoutData)}</div>
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
                      <h3 className="font-semibold text-white">{exercise.name}</h3>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-white/80">
                        {exerciseVolume.toLocaleString()} lbs
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-2 text-xs font-medium text-white/50 pb-1 border-b border-white/20">
                      <span>Set</span>
                      <span>Weight</span>
                      <span>Reps</span>
                      <span>RIR</span>
                    </div>
                    
                    {exercise.sets.map((set, setIndex) => {
                      return (
                        <div key={setIndex} className="grid grid-cols-4 gap-2 text-sm text-white/90">
                          <span className="text-white/60">{setIndex + 1}</span>
                          <span className="font-medium">
                            {set.weight || 0} lbs
                          </span>
                          <span>
                            {set.reps || 0}
                          </span>
                          <span className="text-white/50">{set.rir || '-'}</span>
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

      {/* Session RPE Section */}
      {(() => {
        const sessionRPE = getSessionRPE(workoutData);
        if (sessionRPE === undefined) return null;
        return (
          <div className="py-4">
            <h3 className="font-medium text-gray-900 mb-2">Session RPE</h3>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-gray-900">{sessionRPE}</span>
              <span className="text-sm text-gray-600">
                {sessionRPE <= 3 ? 'Light' :
                 sessionRPE <= 5 ? 'Moderate' :
                 sessionRPE <= 7 ? 'Hard' :
                 sessionRPE <= 9 ? 'Very Hard' : 'Maximal'}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Readiness Check Section */}
      {(() => {
        const readiness = getWorkoutReadiness(workoutData);
        if (!readiness) return null;
        return (
          <div className="py-4">
            <h3 className="font-medium text-gray-900 mb-2">Pre-Workout Readiness</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Energy</div>
                <div className="font-medium">{readiness.energy}/10</div>
              </div>
              <div>
                <div className="text-gray-600">Soreness</div>
                <div className="font-medium">{readiness.soreness}/10</div>
              </div>
              <div>
                <div className="text-gray-600">Sleep</div>
                <div className="font-medium">{readiness.sleep}h</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Notes Section */}
      {workoutData.userComments && (
        <div className="py-4">
          <h3 className="font-medium text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-700">{workoutData.userComments}</p>
        </div>
      )}

      {/* Workout Statistics */}
      <div className="py-4">
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