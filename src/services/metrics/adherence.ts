export const calculateExecutionPercentage = (plannedStep: any, executedStep: any): number | null => {
  if (!executedStep) return null;

  try {
    // Swim pace adherence (per 100 yards)
    // Trigger when step appears swim-related and not a drill/technique, with sufficient distance
    {
      const kindStr = String((plannedStep as any)?.type || (plannedStep as any)?.kind || (plannedStep as any)?.name || '').toLowerCase();
      const looksSwim = /swim|pool|lap|freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly/.test(kindStr) ||
                        (typeof (plannedStep as any)?.distance_yd === 'number');
      const isExcluded = /drill|technique/.test(kindStr);
      if (looksSwim && !isExcluded) {
        const mToYd = 1.09361;
        const plannedMeters = Number((plannedStep as any)?.distanceMeters ?? (plannedStep as any)?.distance_m ?? (plannedStep as any)?.m ?? (plannedStep as any)?.meters);
        const plannedYards = Number((plannedStep as any)?.distance_yd ?? (plannedStep as any)?.distance_yds ?? (Number.isFinite(plannedMeters) ? plannedMeters * mToYd : NaN));
        const plannedSec = Number((plannedStep as any)?.seconds || (plannedStep as any)?.duration || (plannedStep as any)?.duration_sec || (plannedStep as any)?.durationSeconds);

        const execMeters = Number((executedStep as any)?.distance_m);
        const execYards = Number.isFinite(execMeters) ? execMeters * mToYd : NaN;
        const execSec = Number((executedStep as any)?.duration_s);

        if (Number.isFinite(plannedYards) && plannedYards > 0 && Number.isFinite(plannedSec) && plannedSec > 0 &&
            Number.isFinite(execYards) && execYards >= 25 && Number.isFinite(execSec) && execSec > 0) {
          const plannedPacePer100 = plannedSec / (plannedYards / 100);
          const execPacePer100 = execSec / (execYards / 100);
          if (plannedPacePer100 > 0 && execPacePer100 > 0) {
            return Math.round((plannedPacePer100 / execPacePer100) * 100);
          }
        }
      }
    }

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


