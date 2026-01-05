/**
 * Data Quality Assessment
 * 
 * Pure TypeScript logic - no AI interpretation.
 * Determines what data is available and reliable for analysis.
 */

import { DataQuality, Workout, UserBaselines } from './types.ts';

// =============================================================================
// CONFIGURATION
// =============================================================================

const MIN_WORKOUTS_FOR_TREND = 4; // 2 per period minimum

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export function assessDataQuality(
  workouts: Workout[],
  userBaselines: UserBaselines,
  weeksBack: number = 4
): DataQuality {
  const bikeWorkouts = workouts.filter(w => 
    w.type === 'ride' || w.type === 'cycling' || w.type === 'bike'
  );
  
  const runWorkouts = workouts.filter(w => 
    w.type === 'run' || w.type === 'running'
  );
  
  const strengthWorkouts = workouts.filter(w => w.type === 'strength');
  
  const swimWorkouts = workouts.filter(w => 
    w.type === 'swim' || w.type === 'swimming'
  );
  
  return {
    bike: assessBikeQuality(bikeWorkouts),
    run: assessRunQuality(runWorkouts),
    strength: assessStrengthQuality(strengthWorkouts, userBaselines),
    swim: assessSwimQuality(swimWorkouts)
  };
}

// =============================================================================
// BIKE QUALITY
// =============================================================================

function assessBikeQuality(workouts: Workout[]): DataQuality['bike'] {
  const count = workouts.length;
  
  // Check for power data
  const withPower = workouts.filter(w => 
    (w.avg_power && w.avg_power > 0) || 
    (w.normalized_power && w.normalized_power > 0)
  );
  
  const hasPower = withPower.length > 0;
  const canTrend = withPower.length >= MIN_WORKOUTS_FOR_TREND;
  
  let note: string | undefined;
  
  if (count === 0) {
    note = 'No bike workouts in this period';
  } else if (!hasPower) {
    note = 'Bike rides logged but no power data. Use a power meter for trends.';
  } else if (!canTrend) {
    note = `Need ${MIN_WORKOUTS_FOR_TREND - withPower.length} more rides with power for trends`;
  }
  
  return {
    count,
    has_power: hasPower,
    can_trend: canTrend,
    note
  };
}

// =============================================================================
// RUN QUALITY
// =============================================================================

function assessRunQuality(workouts: Workout[]): DataQuality['run'] {
  const count = workouts.length;
  
  // Check for pace data
  const withPace = workouts.filter(w => {
    if (w.avg_pace_s && w.avg_pace_s > 0) return true;
    if (w.avg_pace) return true;
    if (w.computed) {
      const computed = typeof w.computed === 'string' 
        ? JSON.parse(w.computed) 
        : w.computed;
      if (computed?.overall?.avg_pace_s_per_mi) return true;
    }
    return false;
  });
  
  const hasPace = withPace.length > 0;
  const canTrend = withPace.length >= MIN_WORKOUTS_FOR_TREND;
  
  let note: string | undefined;
  
  if (count === 0) {
    note = 'No run workouts in this period';
  } else if (!hasPace) {
    note = 'Runs logged but no pace data. Ensure GPS is enabled.';
  } else if (!canTrend) {
    note = `Need ${MIN_WORKOUTS_FOR_TREND - withPace.length} more runs with pace for trends`;
  }
  
  return {
    count,
    has_pace: hasPace,
    can_trend: canTrend,
    note
  };
}

// =============================================================================
// STRENGTH QUALITY
// =============================================================================

function assessStrengthQuality(
  workouts: Workout[],
  userBaselines: UserBaselines
): DataQuality['strength'] {
  const count = workouts.length;
  
  const hasBaselines = !!(
    userBaselines.bench || 
    userBaselines.squat || 
    userBaselines.deadlift || 
    userBaselines.overheadPress1RM
  );
  
  // Can't really "trend" strength the same way - we compare to baselines
  const canTrend = hasBaselines && count >= 2;
  
  let note: string | undefined;
  
  if (count === 0) {
    note = 'No strength workouts in this period';
  } else if (!hasBaselines) {
    note = 'Set 1RM baselines in settings to track strength progression';
  }
  
  return {
    count,
    has_baselines: hasBaselines,
    can_trend: canTrend,
    note
  };
}

// =============================================================================
// SWIM QUALITY
// =============================================================================

function assessSwimQuality(workouts: Workout[]): DataQuality['swim'] {
  const count = workouts.length;
  const canTrend = count >= MIN_WORKOUTS_FOR_TREND;
  
  let note: string | undefined;
  
  if (count === 0) {
    note = 'No swim workouts in this period';
  } else if (!canTrend) {
    note = `Need ${MIN_WORKOUTS_FOR_TREND - count} more swims for trends`;
  }
  
  return {
    count,
    can_trend: canTrend,
    note
  };
}

// =============================================================================
// FORMAT FOR UI
// =============================================================================

export function formatDataQualityForDisplay(quality: DataQuality): string[] {
  const notes: string[] = [];
  
  if (quality.bike.note) {
    notes.push(`🚴 ${quality.bike.note}`);
  }
  
  if (quality.run.note) {
    notes.push(`🏃 ${quality.run.note}`);
  }
  
  if (quality.strength.note) {
    notes.push(`💪 ${quality.strength.note}`);
  }
  
  if (quality.swim.note) {
    notes.push(`🏊 ${quality.swim.note}`);
  }
  
  return notes;
}

