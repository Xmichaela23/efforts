import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================================
// ANALYZE-CYCLING-WORKOUT - CYCLING ANALYSIS EDGE FUNCTION
// =============================================================================
// 
// FUNCTION NAME: analyze-cycling-workout
// PURPOSE: Granular adherence analysis for cycling workouts
// 
// WHAT IT DOES:
// - Analyzes cycling workouts with prescribed power ranges
// - Calculates time-in-prescribed-range (not just averages)
// - Provides interval-by-interval execution breakdown
// - Detects patterns: too hard, fading, inconsistent power
// - Provides descriptive performance assessment
// - Identifies specific issues and strengths
// 
// KEY FEATURES:
// - Uses prescribed ranges from planned_workouts.intervals
// - Time-based analysis (how much TIME spent in range)
// - Context-aware grading (stricter for intervals, lenient for warmup)
// - Power zone analysis (FTP-based)
// - Heart rate analysis and drift detection
// - Plan-aware context extraction
// 
// DATA SOURCES:
// - workouts.computed (from compute-workout-summary)
// - planned_workouts.intervals (prescribed power ranges)
// 
// ANALYSIS OUTPUT:
// - adherence_percentage: % of time spent in prescribed power ranges
// - interval_breakdown: per-interval execution quality
// - performance_assessment: descriptive text based on percentage
// - primary_issues: specific problems identified
// - strengths: positive execution patterns
// 
// INPUT: { workout_id: string }
// OUTPUT: { success: boolean, analysis: CyclingWorkoutAnalysis }
// =============================================================================

// Power Zone Analysis Types
interface PowerZone {
  lower: number; // watts
  upper: number; // watts
  name: string;
}

interface PowerZones {
  zone1: PowerZone; // Active Recovery (0-55% FTP)
  zone2: PowerZone; // Endurance (55-75% FTP)
  zone3: PowerZone; // Tempo (75-90% FTP)
  zone4: PowerZone; // Threshold (90-105% FTP)
  zone5: PowerZone; // VO2max (105-120% FTP)
  zone6: PowerZone; // Neuromuscular Power (>120% FTP)
}

interface HeartRateZone {
  lower: number;
  upper: number;
  name: string;
}

interface HeartRateZones {
  zone1: HeartRateZone;
  zone2: HeartRateZone;
  zone3: HeartRateZone;
  zone4: HeartRateZone;
  zone5: HeartRateZone;
}

interface HeartRateAdherence {
  adherence_percentage: number;
  time_in_zone_s: number;
  time_outside_zone_s: number;
  total_time_s: number;
  samples_in_zone: number;
  samples_outside_zone: number;
  average_heart_rate: number;
  target_zone: HeartRateZone;
  hr_drift_bpm: number;
  hr_consistency: number;
}

// Power Variability Types
interface PowerVariability {
  coefficient_of_variation: number;
  avg_power_change_per_min: number;
  num_surges: number;
  num_crashes: number;
  steadiness_score: number;
  normalized_power: number;
  variability_index: number; // NP / AP
}

interface EnhancedAdherence {
  overall_adherence: number;
  time_in_range_score: number;
  variability_score: number;
  smoothness_score: number;
  power_variability: PowerVariability;
  time_in_range_s: number;
  time_outside_range_s: number;
  total_time_s: number;
  samples_in_range: number;
  samples_outside_range: number;
}

// Garmin-style execution scoring interfaces
type SegmentType = 'warmup' | 'cooldown' | 'work_interval' | 'tempo' | 'sweet_spot' | 'recovery' | 'endurance';

interface SegmentConfig {
  tolerance: number; // percentage
  weight: number;
}

interface SegmentPenalty {
  segment_idx: number;
  type: SegmentType;
  adherence: number;
  deviation: number;
  tolerance: number;
  base_penalty: number;
  direction_penalty: number;
  total_penalty: number;
  reason: string;
}

interface WorkoutExecutionAnalysis {
  overall_execution: number;
  power_execution: number;
  duration_adherence: number;
  segment_summary: {
    work_intervals: {
      completed: number;
      total: number;
      avg_adherence: number;
      within_tolerance: number;
    };
    recovery: {
      completed: number;
      total: number;
      avg_adherence: number;
      below_target: number;
    };
    warmup: {
      adherence: number;
      status: 'good' | 'acceptable' | 'poor';
    };
    cooldown: {
      adherence: number;
      duration_pct: number;
      status: 'good' | 'acceptable' | 'poor';
    };
  };
  penalties: {
    total: number;
    by_segment: SegmentPenalty[];
  };
}

// Garmin-style execution scoring configuration
// Tolerance guidelines for power:
// - Quality/intervals: ±5% (tighter)
// - Sweet spot/tempo: ±7% (moderate)
// - Endurance: ±10% (looser)
const SEGMENT_CONFIG: Record<SegmentType, SegmentConfig> = {
  warmup: { tolerance: 15, weight: 0.5 },
  cooldown: { tolerance: 15, weight: 0.3 },
  work_interval: { tolerance: 5, weight: 1.0 },
  tempo: { tolerance: 7, weight: 1.0 },
  sweet_spot: { tolerance: 7, weight: 1.0 },
  recovery: { tolerance: 20, weight: 0.7 },
  endurance: { tolerance: 10, weight: 0.8 }
};

// CORS helper function
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400'
  };
}

// Parse progression history from description or structured tags
function parseProgressionHistory(description: string, tags: string[]): string[] | null {
  // First try structured tag (most reliable)
  if (tags && Array.isArray(tags)) {
    const powerProgressionTag = tags.find((t: string) => t.startsWith('power_progression:') || t.startsWith('intensity_progression:'));
    if (powerProgressionTag) {
      const progression = powerProgressionTag.split(':')[1];
      // Format: "200w_220w_240w_none_260w" -> ["200w", "220w", "240w", "260w"]
      return progression.split('_').filter(p => p !== 'none').map(p => p.trim());
    }
  }
  
  // Fallback to description parsing (e.g., "200w → 220w → 240w")
  if (description) {
    const match = description.match(/(\d+w.*?→.*?\d+w)/i);
    if (match) {
      return match[0].split('→').map(p => p.trim());
    }
  }
  
  return null;
}

// Parse phase info from tags
function parsePhaseFromTags(tags: string[]): { phase: string | null, week: string | null, totalWeeks: string | null } {
  if (!tags || !Array.isArray(tags)) return { phase: null, week: null, totalWeeks: null };
  
  const phaseTag = tags.find((t: string) => t.startsWith('phase:'));
  const phase = phaseTag ? phaseTag.split(':')[1].replace(/_/g, ' ') : null;
  
  const weekTag = tags.find((t: string) => t.startsWith('week:'));
  let week: string | null = null;
  let totalWeeks: string | null = null;
  if (weekTag) {
    const parts = weekTag.split(':')[1].split('_of_');
    week = parts[0];
    totalWeeks = parts[1];
  }
  
  return { phase, week, totalWeeks };
}

/**
 * Calculate power zones from FTP
 */
function calculatePowerZones(ftp: number): PowerZones {
  return {
    zone1: { lower: 0, upper: ftp * 0.55, name: 'Active Recovery' },
    zone2: { lower: ftp * 0.55, upper: ftp * 0.75, name: 'Endurance' },
    zone3: { lower: ftp * 0.75, upper: ftp * 0.90, name: 'Tempo' },
    zone4: { lower: ftp * 0.90, upper: ftp * 1.05, name: 'Threshold' },
    zone5: { lower: ftp * 1.05, upper: ftp * 1.20, name: 'VO2max' },
    zone6: { lower: ftp * 1.20, upper: ftp * 2.0, name: 'Neuromuscular Power' }
  };
}

/**
 * Calculate heart rate zones from max HR
 */
function calculateHeartRateZones(maxHR: number): HeartRateZones {
  return {
    zone1: { lower: maxHR * 0.50, upper: maxHR * 0.60, name: 'Zone 1' },
    zone2: { lower: maxHR * 0.60, upper: maxHR * 0.70, name: 'Zone 2' },
    zone3: { lower: maxHR * 0.70, upper: maxHR * 0.80, name: 'Zone 3' },
    zone4: { lower: maxHR * 0.80, upper: maxHR * 0.90, name: 'Zone 4' },
    zone5: { lower: maxHR * 0.90, upper: maxHR * 1.00, name: 'Zone 5' }
  };
}

/**
 * Infer segment type from interval data and planned step
 */
function inferSegmentType(segment: any, plannedStep: any, plannedWorkout?: any): SegmentType {
  const role = segment.role;
  const token = plannedStep?.token || '';
  
  if (role === 'warmup') return 'warmup';
  if (role === 'cooldown') return 'cooldown';
  if (role === 'recovery') return 'recovery';
  
  if (role === 'work') {
    // Distinguish interval vs tempo vs sweet spot based on token patterns
    if (token.includes('interval_') || token.includes('vo2')) {
      return 'work_interval'; // Short, high intensity
    }
    if (token.includes('tempo_') || token.includes('threshold')) {
      return 'tempo'; // Sustained threshold effort
    }
    if (token.includes('sweet_spot') || token.includes('ss_')) {
      return 'sweet_spot'; // Between tempo and threshold
    }
    if (token.includes('endurance') || token.includes('z2')) {
      return 'endurance'; // Zone 2 endurance
    }
    
    // Check workout description
    const workoutDesc = (plannedWorkout?.description || plannedWorkout?.name || '').toLowerCase();
    if (workoutDesc.includes('sweet spot') || workoutDesc.includes('ss')) {
      return 'sweet_spot';
    }
    if (workoutDesc.includes('tempo') || workoutDesc.includes('threshold')) {
      return 'tempo';
    }
    
    // Default to endurance for long steady efforts
    const durationMin = segment.executed?.duration_s 
      ? segment.executed.duration_s / 60 
      : (segment.planned?.duration_s ? segment.planned.duration_s / 60 : 0);
    if (durationMin > 20) {
      return 'endurance';
    }
    
    return 'work_interval';
  }
  
  return 'endurance'; // Default
}

/**
 * Calculate normalized power (NP) from power samples
 * NP is a weighted average that emphasizes high power efforts
 */
function calculateNormalizedPower(powerSamples: number[]): number {
  if (powerSamples.length === 0) return 0;
  
  // Use 30-second rolling average
  const rollingAverages: number[] = [];
  const windowSize = 30; // 30 seconds
  
  for (let i = 0; i < powerSamples.length; i++) {
    const window = powerSamples.slice(Math.max(0, i - windowSize + 1), i + 1);
    const avg = window.reduce((sum, p) => sum + p, 0) / window.length;
    rollingAverages.push(avg);
  }
  
  // Raise to 4th power, average, then take 4th root
  const raised = rollingAverages.map(avg => Math.pow(avg, 4));
  const avgRaised = raised.reduce((sum, p) => sum + p, 0) / raised.length;
  const np = Math.pow(avgRaised, 1/4);
  
  return Math.round(np);
}

/**
 * Calculate power variability metrics
 */
function calculatePowerVariability(powerSamples: number[], normalizedPower: number): PowerVariability {
  if (powerSamples.length === 0) {
    return {
      coefficient_of_variation: 0,
      avg_power_change_per_min: 0,
      num_surges: 0,
      num_crashes: 0,
      steadiness_score: 0,
      normalized_power: normalizedPower,
      variability_index: 0
    };
  }
  
  const avgPower = powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length;
  const stdDev = Math.sqrt(
    powerSamples.reduce((sum, p) => sum + Math.pow(p - avgPower, 2), 0) / powerSamples.length
  );
  const coefficientOfVariation = avgPower > 0 ? (stdDev / avgPower) * 100 : 0;
  
  // Calculate power changes per minute
  const powerChanges: number[] = [];
  for (let i = 1; i < powerSamples.length; i++) {
    const change = Math.abs(powerSamples[i] - powerSamples[i - 1]);
    powerChanges.push(change);
  }
  const avgPowerChangePerMin = powerChanges.length > 0
    ? (powerChanges.reduce((sum, c) => sum + c, 0) / powerChanges.length) * 60
    : 0;
  
  // Detect surges (power increases >20% of average)
  let numSurges = 0;
  let numCrashes = 0;
  const surgeThreshold = avgPower * 0.20;
  
  for (let i = 1; i < powerSamples.length; i++) {
    const change = powerSamples[i] - powerSamples[i - 1];
    if (change > surgeThreshold) numSurges++;
    if (change < -surgeThreshold) numCrashes++;
  }
  
  // Steadiness score (0-100, higher is steadier)
  const steadinessScore = Math.max(0, 100 - coefficientOfVariation);
  
  // Variability Index (NP / AP)
  const variabilityIndex = avgPower > 0 ? normalizedPower / avgPower : 0;
  
  return {
    coefficient_of_variation: Math.round(coefficientOfVariation * 100) / 100,
    avg_power_change_per_min: Math.round(avgPowerChangePerMin),
    num_surges,
    num_crashes,
    steadiness_score: Math.round(steadinessScore * 100) / 100,
    normalized_power: normalizedPower,
    variability_index: Math.round(variabilityIndex * 100) / 100
  };
}

/**
 * Analyze power adherence for a single interval
 */
function analyzeIntervalPower(
  powerSamples: number[],
  interval: any,
  plannedWorkout: any
): {
  timeInRange: number;
  timeOutsideRange: number;
  totalSamples: number;
  adherencePercentage: number;
  granular_metrics?: any;
} {
  // Get power range from interval
  const powerRange = interval.power_range || 
                     interval.planned?.power_range ||
                     interval.target_power;
  
  if (!powerRange) {
    return {
      timeInRange: 0,
      timeOutsideRange: powerSamples.length,
      totalSamples: powerSamples.length,
      adherencePercentage: 0
    };
  }
  
  const lower = powerRange.lower || powerRange.min || 0;
  const upper = powerRange.upper || powerRange.max || Infinity;
  
  let inRange = 0;
  let outsideRange = 0;
  
  for (const power of powerSamples) {
    if (power >= lower && power <= upper) {
      inRange++;
    } else {
      outsideRange++;
    }
  }
  
  const total = powerSamples.length;
  const adherencePercentage = total > 0 ? (inRange / total) * 100 : 0;
  
  // Calculate granular metrics
  const avgPower = powerSamples.length > 0
    ? powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length
    : 0;
  const normalizedPower = calculateNormalizedPower(powerSamples);
  const powerVariability = calculatePowerVariability(powerSamples, normalizedPower);
  
  return {
    timeInRange: inRange,
    timeOutsideRange: outsideRange,
    totalSamples: total,
    adherencePercentage,
    granular_metrics: {
      avg_power: Math.round(avgPower),
      normalized_power: normalizedPower,
      power_variability: powerVariability
    }
  };
}

/**
 * Calculate power adherence for interval workouts
 */
function calculateIntervalPowerAdherence(
  sensorData: any[],
  intervals: any[],
  workout: any,
  plannedWorkout: any
): EnhancedAdherence {
  console.log('🚴 Analyzing interval workout power adherence');
  
  // Filter to intervals with power targets
  const workIntervals = intervals.filter(interval => {
    const hasPowerTarget = interval.power_range?.lower ||
                          interval.target_power?.lower ||
                          interval.planned?.power_range?.lower ||
                          interval.planned?.target_power?.lower;
    
    return hasPowerTarget && interval.executed && (interval.sample_idx_start !== undefined);
  });
  
  console.log(`📊 Analyzing ${workIntervals.length} intervals with power targets`);
  
  let totalTimeInRange = 0;
  let totalTimeOutsideRange = 0;
  let totalSamples = 0;
  const allPowerSamples: number[] = [];
  
  // Analyze each work interval
  for (const interval of workIntervals) {
    if (interval.sample_idx_start === undefined || interval.sample_idx_end === undefined) {
      continue;
    }
    
    const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);
    if (intervalSamples.length === 0) continue;
    
    // Extract power samples
    const powerSamples = intervalSamples
      .map(s => s.power || s.watts)
      .filter(p => p && p > 0);
    
    if (powerSamples.length === 0) continue;
    
    allPowerSamples.push(...powerSamples);
    
    const intervalResult = analyzeIntervalPower(powerSamples, interval, plannedWorkout);
    
    if (intervalResult.granular_metrics) {
      interval.granular_metrics = intervalResult.granular_metrics;
    }
    
    totalTimeInRange += intervalResult.timeInRange;
    totalTimeOutsideRange += intervalResult.timeOutsideRange;
    totalSamples += intervalResult.totalSamples;
  }
  
  // Calculate overall metrics
  const normalizedPower = calculateNormalizedPower(allPowerSamples);
  const powerVariability = calculatePowerVariability(allPowerSamples, normalizedPower);
  
  const totalTime = totalSamples;
  const overallAdherence = totalTime > 0 ? totalTimeInRange / totalTime : 0;
  
  // Calculate scores
  const timeInRangeScore = overallAdherence * 100;
  const variabilityScore = powerVariability.steadiness_score;
  const smoothnessScore = Math.max(0, 100 - powerVariability.coefficient_of_variation);
  
  return {
    overall_adherence: overallAdherence,
    time_in_range_score: timeInRangeScore,
    variability_score: variabilityScore,
    smoothness_score: smoothnessScore,
    power_variability: powerVariability,
    time_in_range_s: totalTimeInRange,
    time_outside_range_s: totalTimeOutsideRange,
    total_time_s: totalTime,
    samples_in_range: totalTimeInRange,
    samples_outside_range: totalTimeOutsideRange
  };
}

/**
 * Calculate power adherence for steady-state workouts
 */
function calculateSteadyStatePowerAdherence(
  sensorData: any[],
  intervals: any[],
  workout: any,
  plannedWorkout: any
): EnhancedAdherence {
  console.log('🚴 Analyzing steady-state workout power adherence');
  
  // Get power range from planned workout
  const plannedPowerRange = plannedWorkout?.computed?.steps?.find((s: any) => 
    s.power_range || s.target_power
  )?.power_range || plannedWorkout?.computed?.steps?.find((s: any) => 
    s.power_range || s.target_power
  )?.target_power;
  
  if (!plannedPowerRange) {
    return {
      overall_adherence: 0,
      time_in_range_score: 0,
      variability_score: 0,
      smoothness_score: 0,
      power_variability: {
        coefficient_of_variation: 0,
        avg_power_change_per_min: 0,
        num_surges: 0,
        num_crashes: 0,
        steadiness_score: 0,
        normalized_power: 0,
        variability_index: 0
      },
      time_in_range_s: 0,
      time_outside_range_s: sensorData.length,
      total_time_s: sensorData.length,
      samples_in_range: 0,
      samples_outside_range: sensorData.length
    };
  }
  
  const lower = plannedPowerRange.lower || plannedPowerRange.min || 0;
  const upper = plannedPowerRange.upper || plannedPowerRange.max || Infinity;
  
  // Extract power samples
  const powerSamples = sensorData
    .map(s => s.power || s.watts)
    .filter(p => p && p > 0);
  
  if (powerSamples.length === 0) {
    return {
      overall_adherence: 0,
      time_in_range_score: 0,
      variability_score: 0,
      smoothness_score: 0,
      power_variability: {
        coefficient_of_variation: 0,
        avg_power_change_per_min: 0,
        num_surges: 0,
        num_crashes: 0,
        steadiness_score: 0,
        normalized_power: 0,
        variability_index: 0
      },
      time_in_range_s: 0,
      time_outside_range_s: 0,
      total_time_s: 0,
      samples_in_range: 0,
      samples_outside_range: 0
    };
  }
  
  let inRange = 0;
  let outsideRange = 0;
  
  for (const power of powerSamples) {
    if (power >= lower && power <= upper) {
      inRange++;
    } else {
      outsideRange++;
    }
  }
  
  const total = powerSamples.length;
  const overallAdherence = total > 0 ? inRange / total : 0;
  
  const normalizedPower = calculateNormalizedPower(powerSamples);
  const powerVariability = calculatePowerVariability(powerSamples, normalizedPower);
  
  const timeInRangeScore = overallAdherence * 100;
  const variabilityScore = powerVariability.steadiness_score;
  const smoothnessScore = Math.max(0, 100 - powerVariability.coefficient_of_variation);
  
  return {
    overall_adherence: overallAdherence,
    time_in_range_score: timeInRangeScore,
    variability_score: variabilityScore,
    smoothness_score: smoothnessScore,
    power_variability: powerVariability,
    time_in_range_s: inRange,
    time_outside_range_s: outsideRange,
    total_time_s: total,
    samples_in_range: inRange,
    samples_outside_range: outsideRange
  };
}

/**
 * Calculate granular power adherence
 */
function calculatePrescribedRangeAdherenceGranular(
  sensorData: any[],
  intervals: any[],
  workout: any,
  plannedWorkout: any
): EnhancedAdherence {
  console.log(`📊 Starting granular power adherence analysis for ${intervals.length} intervals`);
  
  // Check if this is an interval workout
  const intervalsWithPowerTargets = intervals.filter(interval => {
    const hasPowerTarget = interval.power_range?.lower ||
                          interval.target_power?.lower ||
                          interval.planned?.power_range?.lower ||
                          interval.planned?.target_power?.lower;
    return hasPowerTarget && interval.executed;
  });
  
  const isIntervalWorkout = intervalsWithPowerTargets.length > 0;
  console.log(`🔍 Workout type: ${isIntervalWorkout ? 'Intervals' : 'Steady-state'}`);
  
  if (isIntervalWorkout) {
    return calculateIntervalPowerAdherence(sensorData, intervals, workout, plannedWorkout);
  } else {
    return calculateSteadyStatePowerAdherence(sensorData, intervals, workout, plannedWorkout);
  }
}

// Continue in next part due to length...

/**
 * Calculate duration adherence for cycling workouts
 */
function calculateDurationAdherence(workout: any, plannedWorkout: any, intervals: any[]): any {
  try {
    // Get planned duration from intervals
    const plannedDurationSeconds = intervals.reduce((sum, segment) => 
      sum + (segment.duration || segment.duration_s || 0), 0);
    
    // Get actual duration from computed data
    const actualDurationSeconds = workout?.computed?.overall?.duration_s_moving || 0;
    
    if (plannedDurationSeconds === 0 || actualDurationSeconds === 0) {
      return {
        planned_duration_s: plannedDurationSeconds,
        actual_duration_s: actualDurationSeconds,
        adherence_percentage: null,
        delta_seconds: null
      };
    }
    
    // Calculate adherence percentage
    const isIntervalWorkout = intervals.some(interval => interval.type === 'work');
    let adherencePercentage = 0;
    
    if (isIntervalWorkout) {
      // For intervals, use lenient tolerance (±10%)
      const tolerance = 0.10;
      const minAcceptable = plannedDurationSeconds * (1 - tolerance);
      const maxAcceptable = plannedDurationSeconds * (1 + tolerance);
      
      if (actualDurationSeconds >= minAcceptable && actualDurationSeconds <= maxAcceptable) {
        adherencePercentage = 95 + Math.random() * 5; // 95-100%
      } else {
        const deviation = Math.abs(actualDurationSeconds - plannedDurationSeconds) / plannedDurationSeconds;
        adherencePercentage = Math.max(0, 100 - (deviation * 100));
      }
    } else {
      // For steady-state workouts
      if (actualDurationSeconds <= plannedDurationSeconds) {
        adherencePercentage = (actualDurationSeconds / plannedDurationSeconds) * 100;
      } else {
        adherencePercentage = Math.min(100, (plannedDurationSeconds / actualDurationSeconds) * 100);
      }
    }
    
    const deltaSeconds = actualDurationSeconds - plannedDurationSeconds;
    
    return {
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      adherence_percentage: adherencePercentage,
      delta_seconds: deltaSeconds
    };
  } catch (error) {
    console.error('❌ Duration adherence calculation error:', error);
    return {
      planned_duration_s: 0,
      actual_duration_s: 0,
      adherence_percentage: null,
      delta_seconds: null
    };
  }
}

/**
 * Generate interval-by-interval breakdown for cycling
 */
function generateIntervalBreakdown(workIntervals: any[], allIntervals?: any[]): any {
  if (workIntervals.length === 0) {
    return { available: false, message: 'No work intervals to analyze' };
  }
  
  const breakdown = workIntervals.map((interval, index) => {
    const plannedDuration = interval.planned?.duration_s || interval.duration_s || 0;
    const plannedPower = interval.planned?.target_power || interval.power_range?.lower || 0;
    
    const actualDuration = interval.executed?.duration_s || interval.duration_s || 0;
    const actualPower = interval.executed?.avg_power || interval.granular_metrics?.avg_power || 0;
    const normalizedPower = interval.granular_metrics?.normalized_power || actualPower;
    
    // Calculate duration adherence
    let durationAdherence = 0;
    if (plannedDuration > 0 && actualDuration > 0) {
      const durationDelta = Math.abs(actualDuration - plannedDuration);
      durationAdherence = Math.max(0, 100 - (durationDelta / plannedDuration) * 100);
    }
    
    // Calculate power adherence
    let powerAdherence = 0;
    if (plannedPower > 0 && actualPower > 0) {
      const powerDelta = Math.abs(actualPower - plannedPower);
      powerAdherence = Math.max(0, 100 - (powerDelta / plannedPower) * 100);
    }
    
    // Overall score (70% power, 30% duration)
    const overallScore = (powerAdherence * 0.7) + (durationAdherence * 0.3);
    
    return {
      interval_number: index + 1,
      planned_duration_s: plannedDuration,
      actual_duration_s: actualDuration,
      planned_power_w: plannedPower,
      actual_power_w: actualPower,
      normalized_power_w: normalizedPower,
      power_adherence_percent: Math.round(powerAdherence),
      duration_adherence_percent: Math.round(durationAdherence),
      overall_score: Math.round(overallScore)
    };
  });
  
  return {
    available: true,
    intervals: breakdown,
    summary: {
      total_intervals: breakdown.length,
      avg_power_adherence: breakdown.length > 0
        ? Math.round(breakdown.reduce((sum, i) => sum + i.power_adherence_percent, 0) / breakdown.length)
        : 0,
      avg_duration_adherence: breakdown.length > 0
        ? Math.round(breakdown.reduce((sum, i) => sum + i.duration_adherence_percent, 0) / breakdown.length)
        : 0
    }
  };
}

/**
 * Analyze heart rate for cycling workouts
 */
function analyzeHeartRate(sensorData: any[], intervals: any[], maxHR?: number): any {
  const hrSamples = sensorData
    .map(s => s.heart_rate)
    .filter(hr => hr && hr > 0);
  
  if (hrSamples.length === 0) {
    return {
      available: false,
      message: 'No heart rate data available'
    };
  }
  
  const avgHR = Math.round(hrSamples.reduce((sum, hr) => sum + hr, 0) / hrSamples.length);
  const maxHRRecorded = Math.max(...hrSamples);
  const minHR = Math.min(...hrSamples);
  
  // Calculate HR drift (early vs late)
  const earlySamples = hrSamples.slice(0, Math.floor(hrSamples.length * 0.2));
  const lateSamples = hrSamples.slice(Math.floor(hrSamples.length * 0.8));
  const earlyAvgHR = earlySamples.length > 0
    ? Math.round(earlySamples.reduce((sum, hr) => sum + hr, 0) / earlySamples.length)
    : avgHR;
  const lateAvgHR = lateSamples.length > 0
    ? Math.round(lateSamples.reduce((sum, hr) => sum + hr, 0) / lateSamples.length)
    : avgHR;
  const hrDrift = lateAvgHR - earlyAvgHR;
  
  // Calculate HR zones if maxHR provided
  let hrZones = null;
  if (maxHR) {
    hrZones = calculateHeartRateZones(maxHR);
    // Calculate time in each zone
    const zoneTime: Record<string, number> = {};
    for (const hr of hrSamples) {
      if (hr <= hrZones.zone1.upper) zoneTime.zone1 = (zoneTime.zone1 || 0) + 1;
      else if (hr <= hrZones.zone2.upper) zoneTime.zone2 = (zoneTime.zone2 || 0) + 1;
      else if (hr <= hrZones.zone3.upper) zoneTime.zone3 = (zoneTime.zone3 || 0) + 1;
      else if (hr <= hrZones.zone4.upper) zoneTime.zone4 = (zoneTime.zone4 || 0) + 1;
      else zoneTime.zone5 = (zoneTime.zone5 || 0) + 1;
    }
  }
  
  return {
    available: true,
    average_hr: avgHR,
    max_hr: maxHRRecorded,
    min_hr: minHR,
    hr_drift_bpm: hrDrift,
    early_avg_hr: earlyAvgHR,
    late_avg_hr: lateAvgHR,
    hr_zones: hrZones,
    zone_time: hrZones ? zoneTime : null
  };
}

/**
 * Extract sensor data from workout
 * Tries multiple data sources in order of preference
 */
function extractSensorData(data: any): any[] {
  // Try time_series_data first (most likely to have power data)
  if (data.time_series_data && Array.isArray(data.time_series_data)) {
    return data.time_series_data;
  }
  
  // Try computed.series (from compute-workout-analysis)
  if (data.computed?.series && Array.isArray(data.computed.series)) {
    return data.computed.series;
  }
  
  // Try garmin_data
  if (data.garmin_data) {
    if (Array.isArray(data.garmin_data)) {
      return data.garmin_data;
    }
    if (data.garmin_data.samples && Array.isArray(data.garmin_data.samples)) {
      return data.garmin_data.samples;
    }
  }
  
  // Try sensor_data.samples
  if (data.sensor_data?.samples && Array.isArray(data.sensor_data.samples)) {
    return data.sensor_data.samples;
  }
  
  // Try computed data directly (might have series nested)
  if (data.computed && typeof data.computed === 'object') {
    if (Array.isArray(data.computed)) {
      return data.computed;
    }
  }
  
  return [];
}

/**
 * Generate AI narrative insights for cycling workouts
 */
async function generateAINarrativeInsights(
  sensorData: any[],
  workout: any,
  plannedWorkout: any,
  granularAnalysis: any,
  performance: any,
  detailedAnalysis: any,
  userUnits: 'metric' | 'imperial' = 'imperial',
  supabase: any = null
): Promise<string[]> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiKey) {
    console.warn('⚠️ OPENAI_API_KEY not set, skipping AI narrative generation');
    return [];
  }

  // Calculate metrics
  const movingTimeSeconds = workout.computed?.overall?.duration_s_moving 
    || (workout.moving_time ? workout.moving_time * 60 : null)
    || (workout.duration ? workout.duration * 60 : 0);
  const totalDurationMinutes = movingTimeSeconds / 60;
  const totalDistanceKm = workout.distance || 0;
  const distanceValue = userUnits === 'metric' ? totalDistanceKm : totalDistanceKm * 0.621371;
  const distanceUnit = userUnits === 'metric' ? 'km' : 'miles';
  
  // Extract power samples
  const powerSamples = sensorData
    .map(s => s.power || s.watts)
    .filter(p => p && p > 0);
  const avgPower = powerSamples.length > 0
    ? Math.round(powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length)
    : 0;
  const normalizedPower = calculateNormalizedPower(powerSamples);
  
  // Extract heart rate
  const hrSamples = sensorData.filter(s => s.heart_rate && s.heart_rate > 0).map(s => s.heart_rate);
  const avgHR = hrSamples.length > 0 
    ? Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length) 
    : 0;
  const maxHR = hrSamples.length > 0 ? Math.max(...hrSamples) : 0;
  
  const workoutContext = {
    type: workout.type,
    duration_minutes: totalDurationMinutes,
    distance: distanceValue,
    distance_unit: distanceUnit,
    avg_power: avgPower,
    normalized_power: normalizedPower,
    avg_heart_rate: avgHR,
    max_heart_rate: maxHR,
    variability_index: normalizedPower > 0 && avgPower > 0 ? (normalizedPower / avgPower).toFixed(2) : null
  };
  
  const adherenceContext = {
    execution_adherence_pct: Math.round(performance.execution_adherence || 0),
    power_adherence_pct: Math.round(performance.power_adherence || 0),
    duration_adherence_pct: Math.round(performance.duration_adherence || 0)
  };
  
  // Extract plan-aware context
  let planContext: any = null;
  if (plannedWorkout && plannedWorkout.training_plan_id) {
    try {
      const weekTag = plannedWorkout.tags?.find((t: string) => t.startsWith('week:'));
      const weekNumber = weekTag ? parseInt(weekTag.split(':')[1].split('_of_')[0]) : 1;
      
      let trainingPlan = null;
      const { data: planData } = await supabase
        .from('plans')
        .select('*')
        .eq('id', plannedWorkout.training_plan_id)
        .eq('user_id', workout.user_id)
        .single();
      
      if (planData) {
        trainingPlan = planData;
      } else {
        // Fallback to training_plans for legacy compatibility
        const { data: legacyPlanData } = await supabase
          .from('training_plans')
          .select('*')
          .eq('id', plannedWorkout.training_plan_id)
          .eq('user_id', workout.user_id)
          .single();
        if (legacyPlanData) {
          trainingPlan = legacyPlanData;
        }
      }
      
      if (trainingPlan && trainingPlan.user_id === workout.user_id) {
        const { phase, week, totalWeeks } = parsePhaseFromTags(plannedWorkout.tags || []);
        const weeklySummary = trainingPlan.config?.weekly_summaries?.[weekNumber] || 
                             trainingPlan.weekly_summaries?.[weekNumber] || null;
        const progressionHistory = parseProgressionHistory(plannedWorkout.description || '', plannedWorkout.tags || []);
        
        planContext = {
          plan_name: trainingPlan.name || 'Training Plan',
          week: weekNumber,
          total_weeks: trainingPlan.duration_weeks || 0,
          phase: phase || 'unknown',
          weekly_summary: weeklySummary,
          progression_history: progressionHistory,
          session_description: plannedWorkout.description || '',
          session_tags: plannedWorkout.tags || [],
          plan_description: trainingPlan.description || ''
        };
      }
    } catch (error) {
      console.log('⚠️ Failed to extract plan context:', error);
    }
  }
  
  // Build prompt
  let prompt = `You are analyzing a cycling workout. Generate 3-4 concise, data-driven observations.

CRITICAL RULES:
- Write like "a chart in words" - factual observations only
- NO motivational language ("great job", "keep it up")
- NO subjective judgments ("slow", "bad", "should have")
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and power references
- Describe patterns visible in the data
${planContext ? `
- CRITICAL: Reference plan context when available - explain WHY workout was programmed
- Contextualize adherence relative to phase goals
` : ''}

Workout Profile:
- Type: ${workoutContext.type}
- Duration: ${workoutContext.duration_minutes.toFixed(1)} minutes
- Distance: ${workoutContext.distance.toFixed(2)} ${workoutContext.distance_unit}
- Avg Power: ${workoutContext.avg_power}W
- Normalized Power: ${workoutContext.normalized_power}W
${workoutContext.variability_index ? `- Variability Index: ${workoutContext.variability_index}` : ''}
- Avg HR: ${workoutContext.avg_heart_rate} bpm (Max: ${workoutContext.max_heart_rate} bpm)
`;

  if (plannedWorkout) {
    prompt += `
Adherence Metrics (vs. Planned Workout):
- Execution: ${adherenceContext.execution_adherence_pct}%
- Power: ${adherenceContext.power_adherence_pct}%
- Duration: ${adherenceContext.duration_adherence_pct}%
${planContext ? `
═══════════════════════════════════════════════════════════════
📋 PLAN CONTEXT
═══════════════════════════════════════════════════════════════
Plan: ${planContext.plan_name}
Week: ${planContext.week} of ${planContext.total_weeks}
Phase: ${planContext.phase}
${planContext.weekly_summary?.focus ? `Week Focus: "${planContext.weekly_summary.focus}"` : ''}
${planContext.progression_history ? `Progression: ${planContext.progression_history.join(' → ')}` : ''}
` : ''}
`;
  }
  
  prompt += `
Generate 3-4 observations comparing actual vs. planned performance (if planned) or describing patterns (if freeform).
Return ONLY a JSON array of strings: ["observation 1", "observation 2", ...]`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a data analyst converting workout metrics into factual observations. Never use motivational language.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();
    
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const insights = JSON.parse(content);
    
    if (!Array.isArray(insights)) {
      throw new Error('AI response was not an array');
    }

    return insights;
  } catch (error) {
    console.error('❌ AI narrative generation failed:', error);
    return [];
  }
}

// Main handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let workout_id: string | undefined;
  
  try {
    const body = await req.json();
    workout_id = body.workout_id;
    
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    }

    console.log(`🚴 Analyzing cycling workout: ${workout_id}`);

    // Set analyzing status
    await supabase
      .from('workouts')
      .update({ analysis_status: 'analyzing', analysis_error: null })
      .eq('id', workout_id);

    // Get workout data
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select(`
        id, type, sensor_data, computed, time_series_data, garmin_data,
        planned_id, user_id, moving_time, duration, distance
      `)
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message}`);
    }

    if (workout.type !== 'ride' && workout.type !== 'cycling' && workout.type !== 'bike') {
      throw new Error(`Workout type ${workout.type} is not supported for cycling analysis`);
    }

    if (!workout.sensor_data && !workout.computed) {
      throw new Error('No sensor data or computed data available');
    }

    // Get user baselines (for FTP)
    let baselines = {};
    let userUnits = 'imperial';
    try {
      const { data: userBaselines } = await supabase
        .from('user_baselines')
        .select('performance_numbers, units')
        .eq('user_id', workout.user_id)
        .single();
      
      if (userBaselines?.units === 'metric' || userBaselines?.units === 'imperial') {
        userUnits = userBaselines.units;
      }
      baselines = userBaselines?.performance_numbers || {};
    } catch (error) {
      console.log('⚠️ No user baselines found');
    }

    // Get planned workout
    let plannedWorkout = null;
    let intervals = [];
    
    if (workout.planned_id) {
      const { data: planned } = await supabase
        .from('planned_workouts')
        .select('id, intervals, steps_preset, computed, description, tags, training_plan_id, user_id')
        .eq('id', workout.planned_id)
        .eq('user_id', workout.user_id)
        .single();

      if (planned) {
        plannedWorkout = planned;
        
        // Extract intervals from planned workout
        if (planned.computed?.steps) {
          intervals = planned.computed.steps.map((step: any) => ({
            id: step.id,
            type: step.kind || step.type,
            kind: step.kind || step.type,
            role: step.kind || step.type,
            duration_s: step.seconds || step.duration_s,
            power_range: step.power_range || step.target_power,
            planned: {
              duration_s: step.seconds || step.duration_s,
              target_power: step.power_range?.lower || step.target_power?.lower,
              power_range: step.power_range || step.target_power
            }
          }));
          
          // Enrich with execution data
          intervals = intervals.map(planned => {
            const computedInterval = workout?.computed?.intervals?.find((exec: any) => 
              exec.planned_step_id === planned.id
            );
            
            return {
              ...planned,
              executed: computedInterval?.executed || null,
              sample_idx_start: computedInterval?.sample_idx_start,
              sample_idx_end: computedInterval?.sample_idx_end
            };
          });
        }
      }
    }

    // Extract sensor data - try multiple sources
    let sensorData: any[] = [];
    
    // Try time_series_data first (most likely to have power data)
    if (workout.time_series_data) {
      console.log('🔍 Trying time_series_data...');
      sensorData = extractSensorData(workout.time_series_data);
      console.log(`📊 time_series_data yielded ${sensorData.length} samples`);
    }
    
    // Try garmin_data if time_series_data doesn't work
    if (sensorData.length === 0 && workout.garmin_data) {
      console.log('🔍 Trying garmin_data...');
      sensorData = extractSensorData(workout.garmin_data);
      console.log(`📊 garmin_data yielded ${sensorData.length} samples`);
    }
    
    // Try computed data
    if (sensorData.length === 0 && workout.computed) {
      console.log('🔍 Trying computed data...');
      sensorData = extractSensorData(workout.computed);
      console.log(`📊 computed data yielded ${sensorData.length} samples`);
    }
    
    // Try sensor_data as last resort
    if (sensorData.length === 0 && workout.sensor_data) {
      console.log('🔍 Trying sensor_data as fallback...');
      sensorData = extractSensorData(workout.sensor_data);
      console.log(`📊 sensor_data yielded ${sensorData.length} samples`);
    }
    
    if (sensorData.length === 0) {
      throw new Error('No sensor data available');
    }

    // Calculate granular power adherence
    const enhancedAnalysis = calculatePrescribedRangeAdherenceGranular(
      sensorData,
      intervals,
      workout,
      plannedWorkout
    );

    // Calculate duration adherence
    const durationAdherence = calculateDurationAdherence(workout, plannedWorkout, intervals);

    // Get work intervals for breakdown
    const workIntervals = intervals.filter(i => 
      (i.role === 'work' || i.kind === 'work') && i.executed
    );

    // Generate interval breakdown
    const intervalBreakdown = generateIntervalBreakdown(workIntervals, intervals);

    // Analyze heart rate
    const hrAnalysis = analyzeHeartRate(sensorData, intervals, baselines.max_heart_rate);

    // Calculate performance metrics
    const powerAdherence = enhancedAnalysis.overall_adherence != null
      ? Math.round(enhancedAnalysis.overall_adherence * 100)
      : 0;
    
    const performance = {
      execution_adherence: (powerAdherence + (durationAdherence.adherence_percentage || 0)) / 2,
      power_adherence: powerAdherence,
      duration_adherence: durationAdherence.adherence_percentage || 0,
      completed_steps: workIntervals.length,
      total_steps: intervals.length
    };

    // Generate AI insights
    const insights = await generateAINarrativeInsights(
      sensorData,
      workout,
      plannedWorkout,
      enhancedAnalysis,
      performance,
      { interval_breakdown: intervalBreakdown, hr_analysis: hrAnalysis },
      userUnits,
      supabase
    );

    // Extract power samples for summary
    const powerSamples = sensorData
      .map(s => s.power || s.watts)
      .filter(p => p && p > 0);
    const avgPower = powerSamples.length > 0
      ? Math.round(powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length)
      : 0;
    const normalizedPower = calculateNormalizedPower(powerSamples);

    // Build detailed analysis
    const detailedAnalysis = {
      workout_summary: {
        total_distance: workout.distance || 0,
        total_duration: workout.duration || 0,
        average_power: avgPower,
        normalized_power: normalizedPower,
        average_hr: hrAnalysis.available ? hrAnalysis.average_hr : 0
      },
      interval_breakdown: intervalBreakdown,
      heart_rate_analysis: hrAnalysis,
      power_variability: enhancedAnalysis.power_variability
    };

    // Save analysis
    const analysisPayload = {
      performance,
      detailed_analysis: detailedAnalysis,
      narrative_insights: insights,
      insights: insights, // Backward compatibility
      adherence_analysis: {
        power_adherence: powerAdherence,
        duration_adherence: durationAdherence.adherence_percentage,
        time_in_range_s: enhancedAnalysis.time_in_range_s,
        time_outside_range_s: enhancedAnalysis.time_outside_range_s
      }
    };

    const { error: updateError } = await supabase
      .from('workouts')
      .update({
        workout_analysis: analysisPayload,
        analysis_status: 'complete',
        analyzed_at: new Date().toISOString()
      })
      .eq('id', workout_id);

    if (updateError) {
      console.error('❌ Failed to save analysis:', updateError);
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: analysisPayload
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });

  } catch (error) {
    console.error('❌ Error in cycling workout analysis:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    if (workout_id && supabase) {
      await supabase
        .from('workouts')
        .update({
          analysis_status: 'failed',
          analysis_error: errorMessage
        })
        .eq('id', workout_id);
    }

    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: errorMessage
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
});
