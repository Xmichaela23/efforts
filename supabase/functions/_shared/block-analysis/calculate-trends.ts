/**
 * Calculate Performance Trends
 * 
 * Pure TypeScript calculations - no AI interpretation.
 * Compares current 2-week period vs previous 2-week period.
 */

import { TrendResult, PerformanceTrends, StrengthTrend, Workout, UserBaselines } from './types.ts';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Maximum realistic % change in 2 weeks (anything higher = different workout types)
const MAX_BIKE_CHANGE_PERCENT = 25;
const MAX_RUN_CHANGE_PERCENT = 15;

// Minimum workouts needed per period for reliable comparison
const MIN_WORKOUTS_PER_PERIOD = 2;

// HR change thresholds for efficiency signal
const HR_IMPROVING_THRESHOLD = -3;  // 3+ bpm lower = improving
const HR_FATIGUED_THRESHOLD = 5;    // 5+ bpm higher = potential fatigue

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export function calculatePerformanceTrends(
  workouts: Workout[],
  userBaselines: UserBaselines,
  weeksBack: number = 4
): PerformanceTrends {
  const now = new Date();
  const midpoint = new Date(now);
  midpoint.setDate(midpoint.getDate() - (weeksBack * 7) / 2);
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - (weeksBack * 7));
  
  // Split workouts by type
  const bikeWorkouts = workouts.filter(w => 
    w.type === 'ride' || w.type === 'cycling' || w.type === 'bike'
  );
  const runWorkouts = workouts.filter(w => 
    w.type === 'run' || w.type === 'running'
  );
  const strengthWorkouts = workouts.filter(w => w.type === 'strength');
  
  return {
    bike: calculateBikeTrend(bikeWorkouts, midpoint, periodStart),
    run: calculateRunTrend(runWorkouts, midpoint, periodStart),
    strength: calculateStrengthTrend(strengthWorkouts, userBaselines)
  };
}

// =============================================================================
// BIKE TREND
// =============================================================================

function calculateBikeTrend(
  workouts: Workout[],
  midpoint: Date,
  periodStart: Date
): TrendResult {
  const currentPeriod = workouts.filter(w => new Date(w.date) >= midpoint);
  const previousPeriod = workouts.filter(w => 
    new Date(w.date) >= periodStart && new Date(w.date) < midpoint
  );
  
  // Check data availability
  if (currentPeriod.length === 0 && previousPeriod.length === 0) {
    return {
      current: '-',
      previous: '-',
      change_percent: 0,
      reliable: false,
      reason: 'insufficient_data',
      message: 'No bike workouts in the 4-week period'
    };
  }
  
  // Get power values
  const currentPowers = currentPeriod
    .map(w => w.normalized_power || w.avg_power)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  
  const previousPowers = previousPeriod
    .map(w => w.normalized_power || w.avg_power)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  
  // Check if we have power data
  if (currentPowers.length === 0 && previousPowers.length === 0) {
    return {
      current: '-',
      previous: '-',
      change_percent: 0,
      reliable: false,
      reason: 'no_power_data',
      message: 'Bike rides exist but no power data. Use a power meter for trends.'
    };
  }
  
  // Not enough in both periods
  if (currentPowers.length < MIN_WORKOUTS_PER_PERIOD || previousPowers.length < MIN_WORKOUTS_PER_PERIOD) {
    return {
      current: currentPowers.length > 0 ? `${Math.round(avg(currentPowers))}W` : '-',
      previous: previousPowers.length > 0 ? `${Math.round(avg(previousPowers))}W` : '-',
      change_percent: 0,
      reliable: false,
      reason: 'insufficient_data',
      message: `Need ${MIN_WORKOUTS_PER_PERIOD}+ rides with power in each 2-week period`,
      sample_sizes: { current: currentPowers.length, previous: previousPowers.length }
    };
  }
  
  // Calculate trend
  const currentAvg = avg(currentPowers);
  const previousAvg = avg(previousPowers);
  const changePercent = ((currentAvg - previousAvg) / previousAvg) * 100;
  
  // Sanity check - reject unrealistic changes
  if (Math.abs(changePercent) > MAX_BIKE_CHANGE_PERCENT) {
    return {
      current: `${Math.round(currentAvg)}W`,
      previous: `${Math.round(previousAvg)}W`,
      change_percent: changePercent,
      reliable: false,
      reason: 'variance_too_high',
      message: 'Large variance suggests different workout types - not comparable',
      sample_sizes: { current: currentPowers.length, previous: previousPowers.length }
    };
  }
  
  // Calculate cardiac efficiency if HR data available
  const efficiency = calculateEfficiency(currentPeriod, previousPeriod);
  
  return {
    current: `${Math.round(currentAvg)}W`,
    previous: `${Math.round(previousAvg)}W`,
    change_percent: Math.round(changePercent * 10) / 10,
    reliable: true,
    sample_sizes: { current: currentPowers.length, previous: previousPowers.length },
    efficiency
  };
}

// =============================================================================
// RUN TREND
// =============================================================================

function calculateRunTrend(
  workouts: Workout[],
  midpoint: Date,
  periodStart: Date
): TrendResult {
  const currentPeriod = workouts.filter(w => new Date(w.date) >= midpoint);
  const previousPeriod = workouts.filter(w => 
    new Date(w.date) >= periodStart && new Date(w.date) < midpoint
  );
  
  // Check data availability
  if (currentPeriod.length === 0 && previousPeriod.length === 0) {
    return {
      current: '-',
      previous: '-',
      change_percent: 0,
      reliable: false,
      reason: 'insufficient_data',
      message: 'No run workouts in the 4-week period'
    };
  }
  
  // Get pace values (seconds per mile)
  const currentPaces = currentPeriod
    .map(w => extractPaceSeconds(w))
    .filter((p): p is number => typeof p === 'number' && p > 0);
  
  const previousPaces = previousPeriod
    .map(w => extractPaceSeconds(w))
    .filter((p): p is number => typeof p === 'number' && p > 0);
  
  // Not enough in both periods
  if (currentPaces.length < MIN_WORKOUTS_PER_PERIOD || previousPaces.length < MIN_WORKOUTS_PER_PERIOD) {
    return {
      current: currentPaces.length > 0 ? secondsToPace(avg(currentPaces)) : '-',
      previous: previousPaces.length > 0 ? secondsToPace(avg(previousPaces)) : '-',
      change_percent: 0,
      reliable: false,
      reason: 'insufficient_data',
      message: `Need ${MIN_WORKOUTS_PER_PERIOD}+ runs with pace data in each 2-week period`,
      sample_sizes: { current: currentPaces.length, previous: previousPaces.length }
    };
  }
  
  // Calculate trend (note: for pace, LOWER is better)
  const currentAvg = avg(currentPaces);
  const previousAvg = avg(previousPaces);
  const changePercent = ((previousAvg - currentAvg) / previousAvg) * 100; // Positive = faster
  
  // Sanity check - reject unrealistic changes
  if (Math.abs(changePercent) > MAX_RUN_CHANGE_PERCENT) {
    return {
      current: secondsToPace(currentAvg),
      previous: secondsToPace(previousAvg),
      change_percent: changePercent,
      reliable: false,
      reason: 'variance_too_high',
      message: 'Large variance suggests different workout types (easy vs hard) - not comparable',
      sample_sizes: { current: currentPaces.length, previous: previousPaces.length }
    };
  }
  
  // Calculate cardiac efficiency if HR data available
  const efficiency = calculateEfficiency(currentPeriod, previousPeriod);
  
  return {
    current: secondsToPace(currentAvg),
    previous: secondsToPace(previousAvg),
    change_percent: Math.round(changePercent * 10) / 10,
    reliable: true,
    sample_sizes: { current: currentPaces.length, previous: previousPaces.length },
    efficiency
  };
}

// =============================================================================
// CARDIAC EFFICIENCY
// =============================================================================

function calculateEfficiency(
  currentPeriod: Workout[],
  previousPeriod: Workout[]
): TrendResult['efficiency'] {
  // Get workouts with HR data
  const currentWithHR = currentPeriod.filter(w => w.avg_heart_rate && w.avg_heart_rate > 0);
  const previousWithHR = previousPeriod.filter(w => w.avg_heart_rate && w.avg_heart_rate > 0);
  
  // Need at least 2 workouts with HR in each period
  if (currentWithHR.length < 2 || previousWithHR.length < 2) {
    return undefined;
  }
  
  const currentAvgHR = avg(currentWithHR.map(w => w.avg_heart_rate!));
  const previousAvgHR = avg(previousWithHR.map(w => w.avg_heart_rate!));
  const hrChange = currentAvgHR - previousAvgHR;
  
  // Determine signal
  let signal: 'improving' | 'stable' | 'fatigued' | null = null;
  if (hrChange <= HR_IMPROVING_THRESHOLD) {
    signal = 'improving';  // Lower HR for similar work = more efficient
  } else if (hrChange >= HR_FATIGUED_THRESHOLD) {
    signal = 'fatigued';   // Higher HR for similar work = strain
  } else {
    signal = 'stable';
  }
  
  return {
    current_hr: Math.round(currentAvgHR),
    previous_hr: Math.round(previousAvgHR),
    hr_change: Math.round(hrChange),
    signal
  };
}

// =============================================================================
// STRENGTH TREND
// =============================================================================

function calculateStrengthTrend(
  workouts: Workout[],
  userBaselines: UserBaselines
): StrengthTrend {
  const hasBaselines = !!(
    userBaselines.bench || 
    userBaselines.squat || 
    userBaselines.deadlift || 
    userBaselines.overheadPress1RM
  );
  
  // We don't compare strength over time like cardio
  // Instead, we report current working weights vs baselines
  return {
    has_baselines: hasBaselines,
    lifts: [] // Frontend can show baselines if needed
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function extractPaceSeconds(workout: Workout): number | null {
  // Try computed field first
  if (workout.computed) {
    const computed = typeof workout.computed === 'string' 
      ? JSON.parse(workout.computed) 
      : workout.computed;
    if (computed?.overall?.avg_pace_s_per_mi) {
      return computed.overall.avg_pace_s_per_mi;
    }
  }
  
  // Try direct pace field (seconds)
  if (workout.avg_pace_s && workout.avg_pace_s > 0) {
    return workout.avg_pace_s;
  }
  
  // Try parsing string pace
  if (workout.avg_pace) {
    return paceStringToSeconds(workout.avg_pace);
  }
  
  return null;
}

function paceStringToSeconds(pace: string): number {
  const cleanPace = pace.replace(/\/mi|\/km/g, '').trim();
  const parts = cleanPace.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

function secondsToPace(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
}

function avg(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

// =============================================================================
// FORMAT FOR UI
// =============================================================================

export function formatTrendForDisplay(trend: TrendResult): string {
  if (!trend.reliable) {
    return trend.message || 'Insufficient data';
  }
  
  const direction = trend.change_percent > 0 ? 'improved' : 'declined';
  const absChange = Math.abs(trend.change_percent);
  const sign = trend.change_percent > 0 ? '+' : '';
  
  return `${trend.previous} → ${trend.current} (${sign}${trend.change_percent}%)`;
}

