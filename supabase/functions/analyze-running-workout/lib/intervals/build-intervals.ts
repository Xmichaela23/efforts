/**
 * Unified interval building: single getWorkIntervals() with priority
 * planned_steps_light → computed.steps → plannedWorkout.intervals → steps_preset (token parser).
 * Enriches planned intervals with execution data from workout.computed.intervals.
 */

import { parseRunningTokens } from '../../_shared/token-parser.ts';

export type Baselines = {
  fiveK_pace?: number;
  easyPace?: number;
  tenK_pace?: number;
  marathon_pace?: number;
};

/**
 * Build work intervals from workout + planned workout using a single priority order.
 * Returns enriched intervals (planned + executed, sample_idx_start/end) or [].
 */
export async function getWorkIntervals(
  workout: any,
  plannedWorkout: any | null,
  baselines: Baselines
): Promise<any[]> {
  if (!plannedWorkout) {
    return workout?.computed?.intervals ?? [];
  }

  let intervals: any[] = [];

  // 1) planned_steps_light snapshot (taken when workout completed)
  if (workout?.computed?.planned_steps_light && Array.isArray(workout.computed.planned_steps_light)) {
    console.log('🏃 Using planned_steps_light snapshot from completed workout...');
    const plannedSteps = workout.computed.planned_steps_light.map((snap: any) => {
      const fullStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === snap.planned_step_id);
      return {
        id: snap.planned_step_id,
        kind: snap.kind,
        seconds: snap.seconds,
        distanceMeters: snap.meters,
        planned_index: snap.planned_index,
        pace_range: fullStep?.pace_range ?? snap.pace_range ?? null
      };
    });
    intervals = plannedSteps.map((step: any, idx: number) => ({
      id: step.id,
      type: step.kind,
      kind: step.kind,
      role: step.kind,
      duration_s: step.seconds,
      duration: step.seconds,
      distance_m: step.distanceMeters,
      distance: step.distanceMeters,
      target_pace: step.pace_range ? { lower: step.pace_range.lower, upper: step.pace_range.upper } : null,
      pace_range: step.pace_range ? { lower: step.pace_range.lower, upper: step.pace_range.upper } : null,
      step_index: step.planned_index !== undefined ? step.planned_index : idx,
      planned_index: step.planned_index !== undefined ? step.planned_index : idx
    }));
    intervals = enrichWithExecution(intervals, workout, (planned, exec) => exec.planned_step_id === planned.id);
    return intervals;
  }

  // 2) computed.steps from materialization
  if (plannedWorkout.computed?.steps && Array.isArray(plannedWorkout.computed.steps)) {
    console.log('🏃 Using computed.steps from materialization...');
    const materializedSteps = plannedWorkout.computed.steps.map((step: any, idx: number) => ({
      id: step.id,
      type: step.kind || step.type,
      kind: step.kind || step.type,
      role: step.kind || step.type,
      duration_s: step.seconds,
      duration: step.seconds,
      distance_m: step.distanceMeters,
      distance: step.distanceMeters,
      target_pace: step.pace_range ? { lower: step.pace_range.lower, upper: step.pace_range.upper } : null,
      pace_range: step.pace_range ? { lower: step.pace_range.lower, upper: step.pace_range.upper } : null,
      step_index: step.planned_index !== undefined ? step.planned_index : idx,
      planned_index: step.planned_index !== undefined ? step.planned_index : idx
    }));
    intervals = enrichWithExecution(materializedSteps, workout, (planned, exec) => exec.planned_step_id === planned.id);
    return intervals;
  }

  // 3) plannedWorkout.intervals
  if (plannedWorkout.intervals && Array.isArray(plannedWorkout.intervals)) {
    console.log('🏃 Using actual planned intervals from database...');
    const actualPlannedIntervals = plannedWorkout.intervals.map((interval: any) => ({
      type: interval.type || interval.kind,
      kind: interval.kind || interval.type,
      role: interval.role || interval.kind || interval.type,
      duration: interval.duration_s,
      duration_s: interval.duration_s,
      distance: interval.distance_m,
      distance_m: interval.distance_m,
      target_pace: interval.pace_range ? { lower: interval.pace_range.lower, upper: interval.pace_range.upper } : null,
      pace_range: interval.pace_range ? { lower: interval.pace_range.lower, upper: interval.pace_range.upper } : null,
      step_index: interval.step_index ?? null
    }));
    intervals = enrichWithExecution(actualPlannedIntervals, workout, (planned, exec) =>
      exec.step_index === planned.step_index || (exec.role === planned.role && exec.kind === planned.kind)
    );
    return intervals;
  }

  // 4) steps_preset + token parser
  if (plannedWorkout.steps_preset && plannedWorkout.steps_preset.length > 0) {
    console.log('🏃 Fallback: Parsing steps_preset tokens...');
    try {
      const parsedStructure = parseRunningTokens(plannedWorkout.steps_preset, baselines);
      const parsedIntervals = parsedStructure.segments.map((segment: any, idx: number) => ({
        type: segment.type,
        kind: segment.type,
        role: segment.type === 'work' ? 'work' : segment.type,
        duration: segment.duration,
        duration_s: segment.duration,
        distance: segment.distance,
        distance_m: segment.distance,
        target_pace: segment.target_pace ?? null,
        pace_range: segment.target_pace ? { lower: segment.target_pace.lower, upper: segment.target_pace.upper } : null,
        step_index: idx
      }));
      intervals = enrichWithExecution(parsedIntervals, workout, (planned, exec) =>
        exec.step_index === planned.step_index || (exec.role === planned.role && exec.kind === planned.kind)
      );
      console.log(`✅ Parsed ${intervals.length} intervals from tokens`);
      return intervals;
    } catch (error) {
      console.warn('⚠️ Token parsing failed, using computed intervals:', error);
    }
  }

  // Fallback
  intervals = workout.computed?.intervals ?? plannedWorkout.intervals ?? [];
  console.log(`🔍 No tokens found, using computed intervals: ${intervals.length} intervals found`);
  return intervals;
}

function enrichWithExecution(
  plannedList: any[],
  workout: any,
  match: (planned: any, exec: any) => boolean
): any[] {
  return plannedList.map(planned => {
    const computedInterval = workout?.computed?.intervals?.find((exec: any) => match(planned, exec));
    return {
      ...planned,
      executed: computedInterval?.executed ?? null,
      sample_idx_start: computedInterval?.sample_idx_start,
      sample_idx_end: computedInterval?.sample_idx_end,
      hasExecuted: !!computedInterval?.executed
    };
  });
}
