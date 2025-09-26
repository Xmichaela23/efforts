import { useMemo } from 'react';
import { calculateExecutionPercentage } from '@/services/metrics/adherence';

interface ExecutionResult {
  score: number | null;
  methodLabel: string;
  pairs: Array<{ planned: any; executed: any }>; 
  totalWeight: number;
}

export const useExecutionScore = (
  workoutType: string,
  plannedSteps: any[],
  executedIntervals: any[]
): ExecutionResult => {
  return useMemo(() => {
    if (!Array.isArray(plannedSteps) || !plannedSteps.length || !Array.isArray(executedIntervals) || !executedIntervals.length) {
      return { score: null, methodLabel: '', pairs: [], totalWeight: 0 };
    }

    // Build lookup maps
    const byPlannedId = new Map<string, any>();
    const byPlannedIndex = new Map<number, any>();
    for (const ex of executedIntervals) {
      const pid = String(ex?.planned_step_id || ''); if (pid) byPlannedId.set(pid, ex);
      const pidx = Number(ex?.planned_index); if (Number.isFinite(pidx)) byPlannedIndex.set(pidx, ex);
    }

    // Map planned to executed, excluding rest/recovery
    const pairs = plannedSteps
      .map((planned, index) => {
        const id = String(planned?.id || '');
        const idx = Number(planned?.planned_index ?? index);
        let executed = (id && byPlannedId.get(id)) || (Number.isFinite(idx) ? byPlannedIndex.get(idx) : undefined);
        // Fallback: positional match when server snapshot lacks planned_index mapping
        if (!executed && Array.isArray(executedIntervals) && executedIntervals.length > index) {
          executed = executedIntervals[index];
        }
        return { planned, executed };
      })
      .filter(({ planned }) => {
        const stepType = String(planned?.type || planned?.kind || '').toLowerCase();
        return !stepType.includes('rest') && !stepType.includes('recovery');
      });

    if (!pairs.length || pairs.every(p => !p.executed)) {
      return { score: null, methodLabel: '', pairs: [], totalWeight: 0 };
    }

    // Calculate weighted score
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const t = String(workoutType || '').toLowerCase();

    for (const { planned, executed } of pairs) {
      if (!executed) continue;
      const ex = (executed as any)?.executed ?? executed;
      const percentage = calculateExecutionPercentage(planned, ex);
      if (percentage === null) continue;

      let weight = 1;
      if (t === 'swim') {
        weight = Number(ex?.distance_m || planned.distance_m || planned.distanceMeters || 1) || 1;
      } else if (t === 'strength') {
        const reps = Number(ex?.reps || planned.reps || 1) || 1;
        const sets = Number(ex?.sets || planned.sets || 1) || 1;
        weight = Math.max(1, reps * sets);
      } else {
        weight = Number(ex?.duration_s || planned.seconds || planned.duration || 60) || 60;
      }

      totalWeightedScore += percentage * weight;
      totalWeight += weight;
    }

    const score = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : null;

    // Determine method label
    const hasVariedDurations = (() => {
      const durations = plannedSteps
        .map((s: any) => Number(s?.seconds || s?.duration || 0))
        .filter((d: number) => d > 0);
      if (durations.length < 2) return false;
      const max = Math.max(...durations);
      const min = Math.min(...durations);
      return min > 0 && max / min > 2;
    })();

    const methodLabel = (() => {
      switch (t) {
        case 'ride':
        case 'bike':
        case 'cycling':
          return hasVariedDurations ? 'Duration-weighted power adherence' : 'Average power adherence';
        case 'run':
        case 'walk':
          return hasVariedDurations ? 'Duration-weighted pace adherence' : 'Average pace adherence';
        case 'swim':
          return 'Distance-weighted pace adherence';
        case 'strength':
          return 'Rep-weighted load adherence';
        default:
          return hasVariedDurations ? 'Duration-weighted adherence' : 'Average adherence';
      }
    })();

    return { score, methodLabel, pairs, totalWeight };
  }, [workoutType, plannedSteps, executedIntervals]);
};


