import React, { useMemo, useState } from 'react';
import StrengthCompareTable from './StrengthCompareTable';
import StrengthAdjustmentModal from './StrengthAdjustmentModal';
import { useAppContext } from '@/contexts/AppContext';
import { getSessionRPE, getWorkoutNotes, getWorkoutReadiness } from '@/utils/workoutMetadata';
import { Settings2 } from 'lucide-react';

interface StrengthCompletedViewProps {
  workoutData: any;
  plannedWorkout?: any; // Optional planned workout data for comparison
  planId?: string; // Plan ID for adjustments
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

const StrengthCompletedView: React.FC<StrengthCompletedViewProps> = ({ workoutData, plannedWorkout: passedPlannedWorkout, planId }) => {
  const { workouts } = useAppContext();
  const [showComparison, setShowComparison] = useState(false);
  
  // Adjustment modal state
  const [adjustingExercise, setAdjustingExercise] = useState<{
    name: string;
    currentWeight: number;
    nextPlannedWeight: number;
    targetRir?: number;
    actualRir?: number;
  } | null>(null);



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

  const isMobility = String(workoutData?.type || '').toLowerCase() === 'mobility';
  
  // Helper to get planned exercise data for an exercise name
  const getPlannedExerciseData = (exerciseName: string) => {
    const plannedExercises = (plannedWorkout as any)?.strength_exercises || (plannedWorkout as any)?.mobility_exercises || [];
    const planned = plannedExercises.find((ex: any) => 
      ex.name.toLowerCase() === exerciseName.toLowerCase()
    );
    if (!planned) return null;
    
    // Get weight from various sources
    let weight = 0;
    if (typeof planned.weight === 'number') weight = planned.weight;
    else if (planned.weight_display) {
      const match = String(planned.weight_display).match(/(\d+)/);
      if (match) weight = parseInt(match[1]);
    }
    
    return {
      weight,
      targetRir: planned.target_rir
    };
  };
  
  // Calculate average RIR for a set of logged sets
  const calculateAverageRir = (sets: Array<{ rir?: number }>) => {
    const rirsWithValues = sets.filter(s => typeof s.rir === 'number').map(s => s.rir as number);
    if (rirsWithValues.length === 0) return undefined;
    return rirsWithValues.reduce((a, b) => a + b, 0) / rirsWithValues.length;
  };

  return (
    <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Adjustment hint - show for strength workouts with planned data */}
      {!isMobility && plannedWorkout && (
        <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-xs text-amber-400/80">
            Tap Adjust to modify your next session or plan.
          </p>
        </div>
      )}
      
      {/* Summary line - volume/workload only (title shown in parent) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-white/60">
          <div className="flex items-center gap-4">
            {!isMobility && workoutStats.actual.volume > 0 && (
              <span className="font-medium">{workoutStats.actual.volume.toLocaleString()} lbs total</span>
            )}
            {(workoutData as any).workload_actual || (workoutData as any).workload_planned ? (
              <span>
                Workload: {(workoutData as any).workload_actual || (workoutData as any).workload_planned}
              </span>
            ) : null}
          </div>
          {getSessionRPE(workoutData) !== undefined && (
            <div className="px-2 py-1 rounded bg-white/10 text-white/70">RPE: {getSessionRPE(workoutData)}</div>
          )}
        </div>
        
        {/* Compare to Plan button - only show if planned has exercises */}
        {plannedWorkout && (() => {
          const plannedExercises = (plannedWorkout as any).strength_exercises || (plannedWorkout as any).mobility_exercises || [];
          return plannedExercises.length > 0;
        })() && (
          <div className="pt-1">
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="text-sm text-white/60 hover:text-white/80 font-medium"
            >
              {showComparison ? 'Hide Plan Comparison' : 'Compare to Plan →'}
            </button>
          </div>
        )}
      </div>

      {/* Notes (expanded block on mobile/smaller screens) */}
      {getWorkoutNotes(workoutData) && (
        <div className="p-3 bg-white/5 rounded-md sm:hidden">
          <div className="text-sm text-white font-medium mb-1">Notes</div>
          <div className="text-sm text-white/70 whitespace-pre-wrap">{getWorkoutNotes(workoutData)}</div>
        </div>
      )}

      {/* Exercises */}
      {showComparison && plannedWorkout ? (() => {
        const plannedExercises = ((plannedWorkout as any).strength_exercises || (plannedWorkout as any).mobility_exercises || []).map((ex: any) => {
          const setsArr = Array.isArray(ex.sets) ? ex.sets : [];
          const setsNum = setsArr.length || (typeof ex.sets === 'number' ? ex.sets : 0);
          const repsNum = typeof ex.reps === 'number' ? ex.reps : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.reps)||0), 0) / setsArr.length) : 0);
          const weightNum = typeof ex.weight === 'number' ? ex.weight : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.weight)||0), 0) / setsArr.length) : 0);
          const durationNum = typeof ex.duration_seconds === 'number' ? ex.duration_seconds : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.duration_seconds)||0), 0) / setsArr.length) : 0);
          return { name: ex.name, sets: setsNum, reps: repsNum, weight: weightNum, duration_seconds: durationNum };
        });
        const completedForTable = completedExercises.map((ex: any) => ({ name: ex.name, setsArray: Array.isArray(ex.sets) ? ex.sets : [] }));
        
        return (
          <StrengthCompareTable
            planned={plannedExercises}
            completed={completedForTable}
          />
        );
      })() : (
                // Clean completed view (default)
        <div className="space-y-6">
          {completedExercises.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              No completed exercises found
            </div>
          ) : (
            completedExercises.map((exercise: CompletedExercise, index: number) => {
              if (!exercise.name) return null;
              
              // Regular exercise with sets array
              if (!exercise.sets || !Array.isArray(exercise.sets)) return null;
              
              const exerciseVolume = calculateExerciseVolume(exercise.sets);
              const hasWeight = exercise.sets.some(s => s.weight && s.weight > 0);
              
              // Get planned data and calculate RIR comparison
              const plannedData = getPlannedExerciseData(exercise.name);
              const avgRir = calculateAverageRir(exercise.sets);
              const avgWeight = hasWeight 
                ? Math.round(exercise.sets.filter(s => s.weight > 0).reduce((sum, s) => sum + s.weight, 0) / exercise.sets.filter(s => s.weight > 0).length)
                : 0;
              
              // Determine if RIR is concerning (lower than target by 0.5+)
              const rirConcern = avgRir != null && plannedData?.targetRir != null && avgRir < plannedData.targetRir - 0.5;

              return (
                <div key={exercise.id || index} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white">{exercise.name}</h3>
                      {/* Adjust button - only show for weighted exercises with planned data */}
                      {hasWeight && plannedData && !isMobility && (
                        <button
                          onClick={() => setAdjustingExercise({
                            name: exercise.name,
                            currentWeight: avgWeight,
                            nextPlannedWeight: Math.round(plannedData.weight * 1.025 / 5) * 5 || avgWeight, // Estimate next weight as +2.5%
                            targetRir: plannedData.targetRir,
                            actualRir: avgRir
                          })}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                            rirConcern 
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30' 
                              : 'bg-white/5 border-white/20 text-white/50 hover:bg-white/10 hover:text-white/70'
                          }`}
                        >
                          Adjust
                        </button>
                      )}
                    </div>
                    {hasWeight && exerciseVolume > 0 && (
                      <div className="text-right">
                        <div className="text-sm font-medium text-white/70">
                          {exerciseVolume.toLocaleString()} lbs
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* RIR Summary - show if we have both actual and target RIR */}
                  {hasWeight && avgRir != null && plannedData?.targetRir != null && (
                    <div className={`text-xs px-2 py-1 rounded ${
                      rirConcern ? 'bg-amber-500/10 text-amber-400/80' : 'bg-white/5 text-white/50'
                    }`}>
                      Avg RIR: {avgRir.toFixed(1)} (target: {plannedData.targetRir})
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    {(() => {
                      const hasDuration = exercise.sets.some(s => s.duration_seconds && s.duration_seconds > 0);
                      const formatDuration = (secs: number) => {
                        const mins = Math.floor(secs / 60);
                        const remaining = secs % 60;
                        return mins > 0 ? `${mins}:${String(remaining).padStart(2, '0')}` : `${secs}s`;
                      };
                      
                      return (
                        <>
                          <div className={`grid ${hasWeight ? 'grid-cols-4' : 'grid-cols-2'} gap-2 text-xs font-medium text-white/60 pb-1 border-b border-white/20`}>
                            <span>Set</span>
                            {hasWeight && <span>Weight</span>}
                            <span>{hasDuration ? 'Duration' : 'Reps'}</span>
                            {hasWeight && <span>RIR</span>}
                          </div>
                          
                          {exercise.sets.map((set, setIndex) => (
                            <div key={setIndex} className={`grid ${hasWeight ? 'grid-cols-4' : 'grid-cols-2'} gap-2 text-sm text-white`}>
                              <span className="text-white/70">{setIndex + 1}</span>
                              {hasWeight && (
                                <span className="font-medium">
                                  {set.weight || 0} lbs
                                </span>
                              )}
                              <span>
                                {hasDuration && set.duration_seconds ? formatDuration(set.duration_seconds) : (set.reps || 0)}
                              </span>
                              {hasWeight && <span className="text-white/60">{set.rir || '-'}</span>}
                            </div>
                          ))}
                        </>
                      );
                    })()}
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
            <h3 className="font-medium text-white mb-2">Session RPE</h3>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">{sessionRPE}</span>
              <span className="text-sm text-white/60">
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
            <h3 className="font-medium text-white mb-2">Pre-Workout Readiness</h3>
            <div className="grid grid-cols-3 gap-4 text-sm text-white">
              <div>
                <div className="text-white/60">Energy</div>
                <div className="font-medium">{readiness.energy}/10</div>
              </div>
              <div>
                <div className="text-white/60">Soreness</div>
                <div className="font-medium">{readiness.soreness}/10</div>
              </div>
              <div>
                <div className="text-white/60">Sleep</div>
                <div className="font-medium">{readiness.sleep}h</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Notes Section */}
      {workoutData.userComments && (
        <div className="py-4">
          <h3 className="font-medium text-white mb-2">Notes</h3>
          <p className="text-sm text-white/70">{workoutData.userComments}</p>
        </div>
      )}

      {/* Workout Statistics - only show for strength (has weight data) */}
      {!isMobility && workoutStats.actual.volume > 0 && (
        <div className="py-4">
          <div className="grid grid-cols-3 gap-4 text-center text-white">
            <div>
              <div className="text-lg font-semibold">{workoutStats.actual.sets}</div>
              <div className="text-xs text-white/50">Total Sets</div>
            </div>
            <div>
              <div className="text-lg font-semibold">{workoutStats.actual.reps}</div>
              <div className="text-xs text-white/50">Total Reps</div>
            </div>
            <div>
              <div className="text-lg font-semibold">{workoutStats.actual.volume.toLocaleString()}</div>
              <div className="text-xs text-white/50">Volume (lbs)</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Adjustment Modal */}
      {adjustingExercise && (
        <StrengthAdjustmentModal
          exerciseName={adjustingExercise.name}
          currentWeight={adjustingExercise.currentWeight}
          nextPlannedWeight={adjustingExercise.nextPlannedWeight}
          targetRir={adjustingExercise.targetRir}
          actualRir={adjustingExercise.actualRir}
          planId={planId}
          onClose={() => setAdjustingExercise(null)}
          onSaved={() => {
            // Could trigger a refresh here if needed
            window.dispatchEvent(new CustomEvent('plan:adjusted'));
          }}
        />
      )}
    </div>
  );
};

export default StrengthCompletedView;