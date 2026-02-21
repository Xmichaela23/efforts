/**
 * Shared workload calculation formulas
 *
 * Single source of truth used by:
 *   - calculate-workload (canonical, full data)
 *   - get-week (self-healing fallback, partial data)
 *
 * All formulas live here. Callers adapt their data shapes before calling in.
 */

// ---------------------------------------------------------------------------
// Intensity factor tables
// ---------------------------------------------------------------------------

export const INTENSITY_FACTORS: Record<string, Record<string, number>> = {
  run: {
    easypace: 0.65, warmup_run_easy: 0.65, cooldown_easy: 0.65,
    longrun_easypace: 0.70,
    '5kpace_plus1:00': 0.85, '5kpace_plus0:50': 0.87,
    '5kpace_plus0:45': 0.88, '5kpace_plus0:35': 0.90,
    '5kpace': 0.95, '10kpace': 0.90, marathon_pace: 0.82,
    speed: 1.10, strides: 1.05, interval: 0.95, tempo: 0.88, cruise: 0.88,
  },
  ride: {
    Z1: 0.55, recovery: 0.55, Z2: 0.70, endurance: 0.70,
    warmup_bike: 0.60, cooldown_bike: 0.60,
    tempo: 0.80, ss: 0.90, thr: 1.00, vo2: 1.15, anaerobic: 1.20, neuro: 1.10,
  },
  bike: {
    Z1: 0.55, recovery: 0.55, Z2: 0.70, endurance: 0.70,
    warmup_bike: 0.60, cooldown_bike: 0.60,
    tempo: 0.80, ss: 0.90, thr: 1.00, vo2: 1.15, anaerobic: 1.20, neuro: 1.10,
  },
  swim: {
    warmup: 0.60, cooldown: 0.60, drill: 0.50, easy: 0.65,
    aerobic: 0.75, pull: 0.70, kick: 0.75, threshold: 0.95, interval: 1.00,
  },
  strength: {
    '@pct60': 0.70, '@pct65': 0.75, '@pct70': 0.80, '@pct75': 0.85,
    '@pct80': 0.90, '@pct85': 0.95, '@pct90': 1.00,
    main_: 0.85, acc_: 0.70, core_: 0.60, bodyweight: 0.65,
  },
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function getDefaultIntensityForType(type: string): number {
  const defaults: Record<string, number> = {
    run: 0.75, ride: 0.70, bike: 0.70, swim: 0.75,
    strength: 0.75, mobility: 0.60, pilates_yoga: 0.75, walk: 0.40,
  };
  return defaults[type] || 0.75;
}

// ---------------------------------------------------------------------------
// Steps-preset intensity
// ---------------------------------------------------------------------------

export function getStepsIntensity(steps: string[], type: string): number {
  const factors = INTENSITY_FACTORS[type];
  if (!factors || !Array.isArray(steps) || steps.length === 0) {
    return getDefaultIntensityForType(type);
  }
  const intensities: number[] = [];
  for (const token of steps) {
    const tokenLower = String(token).toLowerCase();
    for (const [key, value] of Object.entries(factors)) {
      if (tokenLower.includes(key.toLowerCase())) {
        intensities.push(value);
        break;
      }
    }
  }
  return intensities.length > 0 ? Math.max(...intensities) : getDefaultIntensityForType(type);
}

// ---------------------------------------------------------------------------
// RPE → intensity mapping
// ---------------------------------------------------------------------------

export function mapRPEToIntensity(rpe: number): number {
  if (rpe >= 9) return 0.95;
  if (rpe >= 8) return 0.90;
  if (rpe >= 7) return 0.85;
  if (rpe >= 6) return 0.80;
  if (rpe >= 5) return 0.75;
  if (rpe >= 4) return 0.70;
  if (rpe >= 3) return 0.65;
  return 0.60;
}

// ---------------------------------------------------------------------------
// Strength workload
// ---------------------------------------------------------------------------

export function getStrengthIntensity(exercises: any[], sessionRPE?: number): number {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    if (typeof sessionRPE === 'number' && sessionRPE >= 1 && sessionRPE <= 10) {
      return mapRPEToIntensity(sessionRPE);
    }
    return 0.75;
  }

  if (typeof sessionRPE === 'number' && sessionRPE >= 1 && sessionRPE <= 10) {
    return mapRPEToIntensity(sessionRPE);
  }

  const intensities = exercises.map(ex => {
    let base = 0.75;

    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      const completedSets = ex.sets.filter((s: any) => s.completed !== false);
      if (completedSets.length === 0) return base;

      const rirValues = completedSets
        .map((s: any) => (typeof s.rir === 'number' && s.rir >= 0 ? s.rir : null))
        .filter((rir: number | null) => rir !== null) as number[];

      if (rirValues.length > 0) {
        const avgRIR = rirValues.reduce((a: number, b: number) => a + b, 0) / rirValues.length;
        if (avgRIR <= 1) base = 0.95;
        else if (avgRIR <= 2) base = 0.90;
        else if (avgRIR <= 3) base = 0.85;
        else if (avgRIR <= 4) base = 0.80;
        else if (avgRIR <= 5) base = 0.75;
        else base = 0.70;
      } else {
        const avgWeight = completedSets.reduce((sum: number, s: any) => sum + (Number(s.weight) || 0), 0) / completedSets.length;
        const avgReps = completedSets.reduce((sum: number, s: any) => sum + (Number(s.reps) || 0), 0) / completedSets.length;

        if (completedSets[0].duration_seconds && completedSets[0].duration_seconds > 0) {
          base = INTENSITY_FACTORS.strength['core_'];
          const avgDuration = completedSets.reduce((sum: number, s: any) => sum + (Number(s.duration_seconds) || 0), 0) / completedSets.length;
          if (avgDuration > 90) base *= 1.05;
          return base;
        }

        if (avgWeight > 0) {
          if (avgReps <= 5 && avgWeight > 50) base = 0.90;
          else if (avgReps <= 5) base = 0.85;
          else if (avgReps >= 13) base = 0.70;
          else base = 0.80;
        }

        if (avgReps <= 5) base *= 1.05;
        else if (avgReps >= 13) base *= 0.90;
      }

      return base;
    }

    if (ex.duration_seconds && ex.duration_seconds > 0) {
      base = INTENSITY_FACTORS.strength['core_'];
      if (ex.duration_seconds > 90) base *= 1.05;
      return base;
    }

    if (ex.weight && typeof ex.weight === 'string' && ex.weight.includes('% 1RM')) {
      const pct = parseInt(ex.weight);
      const roundedPct = Math.floor(pct / 5) * 5;
      const key = `@pct${roundedPct}`;
      base = INTENSITY_FACTORS.strength[key] || 0.75;
    } else if (ex.weight && typeof ex.weight === 'string' && ex.weight.toLowerCase().includes('bodyweight')) {
      base = INTENSITY_FACTORS.strength['bodyweight'];
    }

    const reps = typeof ex.reps === 'number' ? ex.reps : 8;
    if (reps <= 5) base *= 1.05;
    else if (reps >= 13) base *= 0.90;

    return base;
  });

  return intensities.reduce((a: number, b: number) => a + b, 0) / intensities.length;
}

export function calculateStrengthWorkload(exercises: any[], sessionRPE?: number): number {
  if (!Array.isArray(exercises) || exercises.length === 0) return 0;

  let totalVolume = 0;
  exercises.forEach(ex => {
    if (Array.isArray(ex.sets) && ex.sets.length > 0) {
      ex.sets.forEach((set: any) => {
        if (set.completed !== false) {
          totalVolume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
        }
      });
    }
  });

  const volumeFactor = totalVolume / 10000;
  const effectiveVolumeFactor = Math.max(volumeFactor, 0.1);
  const intensity = getStrengthIntensity(exercises, sessionRPE);

  return Math.round(effectiveVolumeFactor * Math.pow(intensity, 2) * 100);
}

// ---------------------------------------------------------------------------
// Mobility workload
// ---------------------------------------------------------------------------

export function getMobilityIntensity(exercises: any[]): number {
  const completedCount = exercises.filter((ex: any) => ex.completed).length;
  const totalCount = exercises.length;
  if (totalCount === 0) return 0.60;
  return 0.60 + (completedCount / totalCount) * 0.1;
}

export function calculateMobilityWorkload(exercises: any[]): number {
  if (!Array.isArray(exercises) || exercises.length === 0) return 0;

  const total = exercises.length;
  const completed = exercises.filter((e: any) => e.completed).length;
  if (completed === 0) return 0;

  const completionRatio = completed / total;
  const intensity = clamp(getMobilityIntensity(exercises), 0.50, 0.80);

  const raw = total * 1.0 * completionRatio;
  const intensityMultiplier = clamp(0.85 + (intensity - 0.60) * 1.5, 0.75, 1.10);
  const workload = Math.round(raw * intensityMultiplier);

  const minIfMeaningful = completed >= 3 ? 3 : 0;
  return clamp(workload, minIfMeaningful, 30);
}

// ---------------------------------------------------------------------------
// Pilates / Yoga workload  (sRPE: duration_minutes × RPE)
// ---------------------------------------------------------------------------

export function calculatePilatesYogaWorkload(durationMinutes: number, sessionRPE?: number): number {
  if (!durationMinutes || durationMinutes <= 0) return 0;

  if (typeof sessionRPE === 'number' && sessionRPE >= 1 && sessionRPE <= 10) {
    return Math.round(durationMinutes * sessionRPE);
  }

  // Fallback when RPE unavailable: duration (hours) × 0.75² × 100
  const durationHours = durationMinutes / 60;
  return Math.round(durationHours * Math.pow(0.75, 2) * 100);
}

// ---------------------------------------------------------------------------
// TRIMP (cardio with HR data)
// ---------------------------------------------------------------------------

export interface TRIMPInput {
  avgHR: number;
  maxHR: number;
  restingHR?: number;
  thresholdHR?: number;
  durationMinutes: number;
}

export function calculateTRIMPWorkload(input: TRIMPInput): number | null {
  const { avgHR, maxHR, durationMinutes } = input;
  const restingHR = input.restingHR
    || (input.thresholdHR ? Math.max(input.thresholdHR - 90, 45) : 60);

  if (!avgHR || !maxHR || avgHR <= 0 || maxHR <= 0) return null;
  if (avgHR < restingHR || avgHR > maxHR) return null;
  if (!durationMinutes || durationMinutes <= 0) return null;

  const hrReserve = maxHR - restingHR;
  const hrRatio = (avgHR - restingHR) / hrReserve;
  const weightingFactor = 0.64 * Math.exp(1.92 * hrRatio);
  const rawTRIMP = durationMinutes * hrRatio * weightingFactor;

  return Math.round(rawTRIMP * 0.6);
}

// ---------------------------------------------------------------------------
// Duration-based cardio workload (no HR)
// ---------------------------------------------------------------------------

export function calculateDurationWorkload(
  durationMinutes: number,
  intensity: number,
): number {
  if (!durationMinutes || durationMinutes <= 0) return 0;
  const durationHours = durationMinutes / 60;
  return Math.round(durationHours * Math.pow(intensity, 2) * 100);
}
