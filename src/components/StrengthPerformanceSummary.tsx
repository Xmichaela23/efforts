import React from 'react';
import StrengthCompareTable from './StrengthCompareTable';

interface StrengthPerformanceSummaryProps {
  planned: any | null;
  completed: any | null;
  type: 'strength' | 'mobility';
  sessionDetail?: Record<string, any> | null;
  onRecompute?: () => Promise<void>;
  recomputing?: boolean;
  recomputeError?: string | null;
}

const extractExercisesFromComputed = (workout: any) => {
  try {
    const computed = workout?.computed;
    const steps: any[] = Array.isArray(computed?.steps) ? computed.steps : [];
    
    const strengthSteps = steps.filter(st => st?.strength && typeof st.strength === 'object');
    
    return strengthSteps.map((st: any) => {
      const s = st.strength;
      const name = String(s?.name || 'Exercise');
      const sets = Number(s?.sets || s?.setsCount || 0);
      const reps = (() => {
        const r = s?.reps || s?.repCount;
        if (typeof r === 'string') return parseInt(r, 10) || 0;
        if (typeof r === 'number') return Math.max(1, Math.round(r));
        return 0;
      })();
      const weight = Number(s?.weight || s?.load || 0);
      const target_rir = typeof s?.target_rir === 'number' ? s.target_rir : undefined;
      
      return { name, sets, reps, weight, target_rir };
    });
  } catch (e) {
    return [];
  }
};

export default function StrengthPerformanceSummary({ planned, completed, type, sessionDetail, onRecompute, recomputing, recomputeError }: StrengthPerformanceSummaryProps) {
  let plannedExercises = extractExercisesFromComputed(planned);
  
  if (plannedExercises.length === 0) {
    const directExercises = type === 'strength' 
      ? (planned?.strength_exercises || [])
      : (planned?.mobility_exercises || []);
    
    if (Array.isArray(directExercises)) {
      plannedExercises = directExercises.map((ex: any)=>{
        if (ex.duration && typeof ex.duration === 'string') {
          const match = ex.duration.match(/(\d+)x(\d+)/i);
          if (match) {
            return {
              name: ex.name,
              sets: parseInt(match[1], 10),
              reps: parseInt(match[2], 10),
              weight: Number(ex.weight || 0)
            };
          }
        }
        const setsArr = Array.isArray(ex.sets) ? ex.sets : [];
        const setsNum = setsArr.length || (typeof ex.sets === 'number' ? ex.sets : 0);
        const durationNum = typeof ex.duration_seconds === 'number' ? ex.duration_seconds : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.duration_seconds)||0), 0) / setsArr.length) : 0);
        const repsNum = typeof ex.reps === 'number' ? ex.reps : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.reps)||0), 0) / setsArr.length) : 0);
        const weightNum = typeof ex.weight === 'number' ? ex.weight : (setsArr.length ? Math.round(setsArr.reduce((s:any, st:any)=> s + (Number(st?.weight)||0), 0) / setsArr.length) : 0);
        const target_rir = typeof ex.target_rir === 'number' ? ex.target_rir : undefined;
        const result: any = { name: ex.name, sets: setsNum, weight: weightNum, target_rir };
        if (durationNum > 0) {
          result.duration_seconds = durationNum;
        } else {
          result.reps = repsNum;
        }
        return result;
      });
    }
  }
  
  const parseCompletedExercises = (raw: any): any[] => {
    try {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string' && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };
  
  const completedRaw = type === 'strength'
    ? parseCompletedExercises(completed?.strength_exercises)
    : parseCompletedExercises(completed?.mobility_exercises);
  
  const completedExercises = completedRaw.map((ex: any) => {
    if (ex.duration && typeof ex.duration === 'string') {
      const match = ex.duration.match(/(\d+)x(\d+)/i);
      if (match) {
        const numSets = parseInt(match[1], 10);
        const reps = parseInt(match[2], 10);
        const weight = Number(ex.weight || 0);
        const setsArray = Array.from({ length: numSets }, () => ({
          reps,
          weight,
          completed: true
        }));
        return { name: ex.name, setsArray };
      }
    }
    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      return { name: ex.name, setsArray: ex.sets };
    }
    // Legacy compact shape: sets = set count, reps & weight on exercise (same as workout-detail fallback)
    if (typeof ex.sets === 'number' && ex.sets > 0) {
      const reps = Number(ex.reps ?? 0) || 0;
      const weight = Number(ex.weight ?? 0) || 0;
      if (reps > 0 || weight > 0) {
        const setsArray = Array.from({ length: ex.sets }, () => ({
          reps,
          weight,
          completed: true as boolean,
        }));
        return { name: ex.name, setsArray };
      }
    }
    return { name: ex.name, setsArray: [] };
  });

  const planId = (planned as any)?.training_plan_id 
    || (completed as any)?.training_plan_id 
    || (completed as any)?.plan_id
    || (planned as any)?.plan_id;
  
  const plannedWorkoutId = (planned as any)?.id || (completed as any)?.planned_id;
  
  const rirSummary = sessionDetail?.strength_rir_summary ?? null;
  const workoutId = sessionDetail?.workout_id ?? (completed as any)?.id ?? null;

  return (
    <div className="space-y-4">
      <StrengthCompareTable
        planned={plannedExercises}
        completed={completedExercises}
        completedWorkoutRaw={completed}
        planId={planId}
        plannedWorkoutId={plannedWorkoutId}
        rirSummary={rirSummary}
        workoutId={workoutId}
        onAdjustmentSaved={() => {
          window.dispatchEvent(new CustomEvent('plan:adjusted'));
          onRecompute?.();
        }}
      />
      {onRecompute && (
        <div className="pt-1">
          {recomputeError && (
            <p className="text-xs text-rose-400 mb-2">{recomputeError}</p>
          )}
          <button
            onClick={onRecompute}
            disabled={recomputing}
            className="w-full py-2 text-xs text-white/40 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white/60 transition-colors disabled:opacity-40"
          >
            {recomputing ? 'Recomputing…' : 'Recompute analysis'}
          </button>
        </div>
      )}
      {completed?.addons && Array.isArray(completed.addons) && completed.addons.length>0 && (
        <div className="text-sm text-gray-700">
          <div className="font-medium mb-1">Add‑ons</div>
          {completed.addons.map((a:any, idx:number)=> (
            <div key={idx} className="flex items-center justify-between border-t border-gray-100 py-1">
              <span>{a.token?.split('.')[0]?.replace(/_/g,' ') || a.name || 'Addon'}</span>
              <span className="text-gray-600">{a.completed? '✓ ' : ''}{a.duration_min||0}m</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
