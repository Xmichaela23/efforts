export const calculateExecutionPercentage = (plannedStep: any, executedStep: any): number | null => {
  if (!executedStep) return null;

  try {
    // Power adherence (cycling)
    const powerRange = (plannedStep?.power_range || plannedStep?.powerRange) as { lower?: number; upper?: number } | undefined;
    const lower = Number(powerRange?.lower);
    const upper = Number(powerRange?.upper);
    if (Number.isFinite(lower) && Number.isFinite(upper) && lower > 0 && upper > 0) {
      const targetMidpoint = (lower + upper) / 2;
      const executedWatts = Number((executedStep as any)?.avg_power_w || (executedStep as any)?.avg_watts || (executedStep as any)?.power);
      if (Number.isFinite(executedWatts) && executedWatts > 0 && targetMidpoint > 0) {
        return Math.round((executedWatts / targetMidpoint) * 100);
      }
    }

    // Duration adherence
    const plannedDuration = Number((plannedStep as any)?.seconds || (plannedStep as any)?.duration || (plannedStep as any)?.duration_sec || (plannedStep as any)?.durationSeconds);
    const executedDuration = Number((executedStep as any)?.duration_s);
    if (Number.isFinite(plannedDuration) && plannedDuration > 0 && Number.isFinite(executedDuration) && executedDuration > 0) {
      return Math.round((executedDuration / plannedDuration) * 100);
    }

    // Distance adherence
    const plannedDistance = Number((plannedStep as any)?.distanceMeters || (plannedStep as any)?.distance_m || (plannedStep as any)?.m || (plannedStep as any)?.meters);
    const executedDistance = Number((executedStep as any)?.distance_m);
    if (Number.isFinite(plannedDistance) && plannedDistance > 0 && Number.isFinite(executedDistance) && executedDistance > 0) {
      return Math.round((executedDistance / plannedDistance) * 100);
    }
  } catch {}

  return null;
};


