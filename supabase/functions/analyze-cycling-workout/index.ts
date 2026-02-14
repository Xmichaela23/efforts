import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCyclingFactPacketV1 } from '../_shared/cycling-v1/build.ts';
import { generateCyclingFlagsV1 } from '../_shared/cycling-v1/flags.ts';
import { generateCyclingAISummaryV1 } from '../_shared/cycling-v1/ai-summary.ts';
import { getTrainingLoadContext } from '../_shared/fact-packet/queries.ts';

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
    num_surges: numSurges,
    num_crashes: numCrashes,
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
  
  // Filter to work intervals with execution data
  const workIntervals = intervals.filter(interval => {
    const hasPowerTarget = interval.power_range?.lower ||
                          interval.target_power?.lower ||
                          interval.planned?.power_range?.lower ||
                          interval.planned?.target_power?.lower;
    
    const isWorkInterval = interval.role === 'work' || interval.kind === 'work' || interval.type === 'work';
    const hasExecution = interval.executed || interval.sample_idx_start !== undefined;
    
    console.log(`🔍 Interval check: hasPower=${hasPowerTarget}, isWork=${isWorkInterval}, hasExec=${hasExecution}, role=${interval.role}`);
    
    // Accept intervals that either have power targets OR are work intervals
    return (hasPowerTarget || isWorkInterval) && hasExecution;
  });
  
  console.log(`📊 Analyzing ${workIntervals.length} work intervals`);
  
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
  
  // Check if this is an interval workout - look for work intervals with power targets
  const workIntervals = intervals.filter(interval => {
    const hasPowerTarget = interval.power_range?.lower ||
                          interval.target_power?.lower ||
                          interval.planned?.power_range?.lower ||
                          interval.planned?.target_power?.lower;
    const isWorkInterval = interval.role === 'work' || interval.kind === 'work' || interval.type === 'work';
    const hasExecution = interval.executed || interval.sample_idx_start !== undefined;
    
    return (hasPowerTarget || isWorkInterval) && hasExecution;
  });
  
  console.log(`🔍 Found ${workIntervals.length} work intervals with execution data`);
  
  const isIntervalWorkout = workIntervals.length > 0;
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
    
    // Calculate adherence percentage - same formula as running
    // Duration adherence = how close actual is to planned (100% when equal, decreases with deviation)
    const durationDelta = Math.abs(actualDurationSeconds - plannedDurationSeconds);
    const adherencePercentage = Math.max(0, 100 - (durationDelta / plannedDurationSeconds) * 100);
    
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
 * Matches running analysis structure for client compatibility
 */
function generateIntervalBreakdown(workIntervals: any[], allIntervalsWithPower?: any[], sensorData?: any[]): any[] {
  // Analyze ALL intervals with power targets (warmup, work, cooldown)
  // This ensures we capture deviations in non-work segments too
  const intervalsToAnalyze = allIntervalsWithPower && allIntervalsWithPower.length > 0 
    ? allIntervalsWithPower.filter(i => i.executed)
    : workIntervals.filter(i => i.executed);
  
  if (intervalsToAnalyze.length === 0) {
    return [];
  }
  
  return intervalsToAnalyze.map((interval, index) => {
    // Extract planned values
    const plannedDuration = interval.planned?.duration_s || interval.duration_s || 0;
    const powerRange = interval.power_range || interval.planned?.power_range || interval.target_power;
    const plannedPowerLower = powerRange?.lower || powerRange?.min || 0;
    const plannedPowerUpper = powerRange?.upper || powerRange?.max || plannedPowerLower;
    const plannedPowerCenter = plannedPowerLower > 0 && plannedPowerUpper > 0 
      ? Math.round((plannedPowerLower + plannedPowerUpper) / 2) 
      : plannedPowerLower;
    
    // Extract actual values from executed object
    // Note: compute-workout-summary outputs avg_power_w (with _w suffix) and avg_hr (not avg_heart_rate)
    const actualDuration = interval.executed?.duration_s || interval.duration_s || 0;
    const actualPower = interval.executed?.avg_power_w || interval.executed?.avg_power || interval.granular_metrics?.avg_power || 0;
    const normalizedPower = interval.granular_metrics?.normalized_power || actualPower;
    const actualDistance = interval.executed?.distance_m || 0;
    
    // Heart rate from interval
    const avgHR = interval.executed?.avg_hr || interval.executed?.avg_heart_rate || interval.granular_metrics?.avg_heart_rate || null;
    const maxHR = interval.executed?.max_hr || interval.executed?.max_heart_rate || null;
    
    // Calculate duration adherence: how close actual is to planned
    let durationAdherence = 0;
    if (plannedDuration > 0 && actualDuration > 0) {
      const durationDelta = Math.abs(actualDuration - plannedDuration);
      durationAdherence = Math.max(0, 100 - (durationDelta / plannedDuration) * 100);
    }
    
    // Calculate power adherence using range if available
    let powerAdherence = 0;
    if (plannedPowerLower > 0 && plannedPowerUpper > 0 && actualPower > 0) {
      // Check if actual power is within range
      if (actualPower >= plannedPowerLower && actualPower <= plannedPowerUpper) {
        powerAdherence = 100;
      } else if (actualPower < plannedPowerLower) {
        // Below range - calculate how far below
        const deviation = (plannedPowerLower - actualPower) / plannedPowerLower;
        powerAdherence = Math.max(0, 100 - (deviation * 100));
      } else {
        // Above range - calculate how far above
        const deviation = (actualPower - plannedPowerUpper) / plannedPowerUpper;
        powerAdherence = Math.max(0, 100 - (deviation * 100));
      }
    } else if (plannedPowerCenter > 0 && actualPower > 0) {
      // Fallback to single target calculation
      const powerDelta = Math.abs(actualPower - plannedPowerCenter);
      powerAdherence = Math.max(0, 100 - (powerDelta / plannedPowerCenter) * 100);
    }
    
    // Overall performance score (70% power, 30% duration)
    const performanceScore = (powerAdherence * 0.7) + (durationAdherence * 0.3);
    
    // Determine interval type based on role/kind
    const role = String(interval.role || interval.kind || interval.type || '').toLowerCase();
    let intervalType = 'work';
    if (role.includes('warm')) intervalType = 'warmup';
    else if (role.includes('cool')) intervalType = 'cooldown';
    else if (role.includes('recovery') || role.includes('rest')) intervalType = 'recovery';
    
    return {
      interval_type: intervalType,
      interval_number: index + 1,
      interval_id: interval.planned_step_id || interval.id || `interval_${index}`,
      // Duration metrics
      planned_duration_s: plannedDuration,
      actual_duration_s: actualDuration,
      duration_adherence_percent: Math.round(durationAdherence),
      // Power metrics
      planned_power_range_lower: plannedPowerLower,
      planned_power_range_upper: plannedPowerUpper,
      planned_power_w: plannedPowerCenter,
      actual_power_w: Math.round(actualPower),
      normalized_power_w: Math.round(normalizedPower),
      power_adherence_percent: Math.round(powerAdherence),
      // Combined adherence (0-1 scale for compatibility with client getEnhancedAdherence)
      adherence_percentage: powerAdherence / 100,
      // Distance
      actual_distance_m: actualDistance,
      // Heart rate
      avg_heart_rate_bpm: avgHR ? Math.round(avgHR) : null,
      max_heart_rate_bpm: maxHR ? Math.round(maxHR) : null,
      // Performance score
      performance_score: Math.round(performanceScore)
    };
  });
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
 * When called with workout.computed, data IS the computed object, so check data.series directly
 */
function extractSensorData(data: any): any[] {
  // If data is already an array, return it
  if (Array.isArray(data)) {
    return data;
  }
  
  // Try time_series_data first (most likely to have power data)
  if (data.time_series_data && Array.isArray(data.time_series_data)) {
    return data.time_series_data;
  }
  
  // Try series directly (when data IS computed object: workout.computed.series)
  // This is an object with arrays: { power_watts: [...], hr_bpm: [...], time_s: [...] }
  if (data.series && typeof data.series === 'object' && !Array.isArray(data.series)) {
    const series = data.series;
    const time_s = series.time_s || [];
    const power_watts = series.power_watts || [];
    const hr_bpm = series.hr_bpm || [];
    const speed_mps = series.speed_mps || [];
    const distance_m = series.distance_m || [];
    
    // Convert series structure to array of sample objects
    if (time_s.length > 0) {
      const samples = [];
      for (let i = 0; i < time_s.length; i++) {
        samples.push({
          timestamp: time_s[i] || i,
          power: power_watts[i] || null,
          watts: power_watts[i] || null,
          heart_rate: hr_bpm[i] || null,
          speed: speed_mps[i] || null,
          distance: distance_m[i] || null,
          t: time_s[i] || i
        });
      }
      console.log(`✅ Converted computed.series to ${samples.length} samples (power: ${power_watts.filter((p: any) => p && p > 0).length} samples)`);
      return samples;
    }
  }
  
  // Try computed.series (when data is workout object, not computed object)
  if (data.computed?.series && typeof data.computed.series === 'object' && !Array.isArray(data.computed.series)) {
    const series = data.computed.series;
    const time_s = series.time_s || [];
    const power_watts = series.power_watts || [];
    const hr_bpm = series.hr_bpm || [];
    const speed_mps = series.speed_mps || [];
    const distance_m = series.distance_m || [];
    
    if (time_s.length > 0) {
      const samples = [];
      for (let i = 0; i < time_s.length; i++) {
        samples.push({
          timestamp: time_s[i] || i,
          power: power_watts[i] || null,
          watts: power_watts[i] || null,
          heart_rate: hr_bpm[i] || null,
          speed: speed_mps[i] || null,
          distance: distance_m[i] || null,
          t: time_s[i] || i
        });
      }
      console.log(`✅ Converted computed.series to ${samples.length} samples (power: ${power_watts.filter((p: any) => p && p > 0).length} samples)`);
      return samples;
    }
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
  
  return [];
}

function inferSecondsFromMaybeMinutes(args: {
  value: number | null;
  workout: any;
}): number | null {
  const { value, workout } = args;
  if (value == null) return null;
  if (!Number.isFinite(value) || value <= 0) return null;

  const asSeconds = value;
  const asMinutesSeconds = value * 60;

  // If one option is clearly impossible (> 36h), prefer the other.
  const tooBig = (s: number) => s > 36 * 3600;
  if (tooBig(asMinutesSeconds) && !tooBig(asSeconds)) return asSeconds;
  if (tooBig(asSeconds) && !tooBig(asMinutesSeconds)) return asMinutesSeconds;

  // If we have distance + avg_speed, choose the candidate closer to expected clock time.
  const distKm = Number(workout?.distance);
  const avgSpeedKph = Number(workout?.avg_speed);
  if (Number.isFinite(distKm) && distKm > 0 && Number.isFinite(avgSpeedKph) && avgSpeedKph > 2) {
    const expectedSeconds = (distKm / avgSpeedKph) * 3600;
    if (Number.isFinite(expectedSeconds) && expectedSeconds > 60 && expectedSeconds < 36 * 3600) {
      const d1 = Math.abs(asSeconds - expectedSeconds);
      const d2 = Math.abs(asMinutesSeconds - expectedSeconds);
      return d1 <= d2 ? asSeconds : asMinutesSeconds;
    }
  }

  // Default: schema typically stores minutes.
  return asMinutesSeconds;
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
    || inferSecondsFromMaybeMinutes({ value: workout.moving_time ?? null, workout })
    || inferSecondsFromMaybeMinutes({ value: workout.duration ?? null, workout })
    || 0;
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
        planned_id, user_id, date, moving_time, duration, distance, workout_status, workload_actual, workload_planned
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

    const ftpW = (() => {
      try {
        const v = Number((baselines as any)?.ftp ?? (baselines as any)?.functional_threshold_power);
        return Number.isFinite(v) && v > 0 ? v : null;
      } catch {
        return null;
      }
    })();

    // Get planned workout
    let plannedWorkout = null;
    let intervals = [];
    
    if (workout.planned_id) {
      const { data: planned } = await supabase
        .from('planned_workouts')
        .select('id, workout_type, intervals, steps_preset, computed, description, tags, training_plan_id, user_id, name, workout_name')
        .eq('id', workout.planned_id)
        .eq('user_id', workout.user_id)
        .single();

      if (planned) {
        plannedWorkout = planned;
        
        console.log('📋 Planned workout found:', {
          id: planned.id,
          hasComputedSteps: !!planned.computed?.steps,
          stepsCount: planned.computed?.steps?.length || 0
        });
        
        // Log first step's full structure to understand data format
        if (planned.computed?.steps?.[0]) {
          console.log('📊 First step full structure:', JSON.stringify(planned.computed.steps[0], null, 2));
        }
        
        // ✅ APPROACH: Use workout.computed.intervals (the source of truth from compute-workout-summary)
        // These have the planned step data already matched with execution data
        const computedIntervals = workout?.computed?.intervals || [];
        
        console.log('📊 Workout computed intervals:', {
          hasIntervals: computedIntervals.length > 0,
          count: computedIntervals.length
        });
        
        if (computedIntervals.length > 0) {
          // Log first interval to see its structure
          console.log('📊 First computed interval structure:', JSON.stringify(computedIntervals[0], null, 2));
          
          // Use computed intervals directly - they already have planned/executed data matched
          intervals = computedIntervals.map((interval: any, idx: number) => {
            // Look up full step from planned workout to get power_range
            const fullStep = planned.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
            
            // Extract power range from multiple possible locations
            const powerRange = fullStep?.power_range || 
                              fullStep?.powerRange || 
                              fullStep?.target_power ||
                              interval.planned?.power_range ||
                              interval.power_range;
            
            console.log(`📊 Interval ${idx}:`, {
              planned_step_id: interval.planned_step_id,
              kind: interval.kind || interval.role,
              fullStep_power_range: fullStep?.power_range,
              interval_planned_power_range: interval.planned?.power_range,
              resolved_power_range: powerRange
            });
            
            return {
              id: interval.planned_step_id,
              type: interval.kind || interval.role,
              kind: interval.kind || interval.role,
              role: interval.role || interval.kind,
              duration_s: interval.planned?.duration_s || fullStep?.seconds,
              power_range: powerRange,
              planned: {
                duration_s: interval.planned?.duration_s || fullStep?.seconds,
                target_power: powerRange?.lower,
                power_range: powerRange
              },
              executed: interval.executed,
              sample_idx_start: interval.sample_idx_start,
              sample_idx_end: interval.sample_idx_end,
              planned_step_id: interval.planned_step_id
            };
          });
        } else if (planned.computed?.steps) {
          // Fallback: Use planned steps if no computed intervals
          intervals = planned.computed.steps.map((step: any, idx: number) => ({
            id: step.id,
            type: step.kind || step.type,
            kind: step.kind || step.type,
            role: step.kind || step.type,
            duration_s: step.seconds || step.duration_s,
            power_range: step.power_range || step.powerRange || step.target_power,
            planned: {
              duration_s: step.seconds || step.duration_s,
              target_power: step.power_range?.lower,
              power_range: step.power_range || step.powerRange || step.target_power
            },
            executed: null,
            sample_idx_start: undefined,
            sample_idx_end: undefined,
            planned_step_id: step.id
          }));
        }
      }
    }

    // Log what we actually have in the workout
    console.log('🔍 Workout data structure check:', {
      has_computed: !!workout.computed,
      computed_type: typeof workout.computed,
      computed_keys: workout.computed && typeof workout.computed === 'object' ? Object.keys(workout.computed) : [],
      has_computed_series: !!workout.computed?.series,
      has_computed_analysis: !!workout.computed?.analysis,
      has_computed_analysis_series: !!workout.computed?.analysis?.series,
      has_time_series_data: !!workout.time_series_data,
      has_garmin_data: !!workout.garmin_data,
      has_sensor_data: !!workout.sensor_data,
      computed_series_type: workout.computed?.series ? typeof workout.computed.series : 'N/A',
      computed_series_keys: workout.computed?.series && typeof workout.computed.series === 'object' ? Object.keys(workout.computed.series) : []
    });
    
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
    
    // Try computed.series (from compute-workout-analysis)
    // This is the same structure Details screen uses
    if (sensorData.length === 0 && workout.computed?.series) {
      console.log('🔍 Trying computed.series...');
      sensorData = extractSensorData(workout.computed);
      console.log(`📊 computed.series yielded ${sensorData.length} samples`);
    }
    
    // Try computed.analysis.series (alternative location - what Details screen uses)
    if (sensorData.length === 0 && workout.computed?.analysis?.series) {
      console.log('🔍 Trying computed.analysis.series...');
      sensorData = extractSensorData(workout.computed.analysis);
      console.log(`📊 computed.analysis.series yielded ${sensorData.length} samples`);
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

    // Generate interval breakdown for ALL intervals with power targets (not just work)
    // This captures warmup/cooldown deviations too
    const allIntervalsWithPower = intervals.filter(i => i.power_range && i.executed);
    const intervalBreakdown = generateIntervalBreakdown(workIntervals, allIntervalsWithPower, sensorData);

    // Analyze heart rate
    const hrAnalysis = analyzeHeartRate(sensorData, intervals, baselines.max_heart_rate);

    // Calculate performance metrics with proper weighting
    // Work intervals get 2x weight (they're the most important part of the workout)
    let powerAdherence = 0;
    if (intervalBreakdown.length > 0) {
      // Calculate weighted average with work intervals weighted 2x
      let totalWeight = 0;
      let weightedSum = 0;
      
      for (const interval of intervalBreakdown) {
        const isWorkInterval = interval.interval_type === 'work';
        // Work intervals get 2x weight, others get 1x
        const typeMultiplier = isWorkInterval ? 2.0 : 1.0;
        const durationWeight = interval.actual_duration_s || 1;
        const weight = durationWeight * typeMultiplier;
        
        totalWeight += weight;
        weightedSum += (interval.power_adherence_percent || 0) * weight;
      }
      
      powerAdherence = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
      
      console.log(`📊 Power adherence calculation: ${intervalBreakdown.length} intervals, work intervals 2x weighted`);
    } else if (enhancedAnalysis.overall_adherence != null) {
      powerAdherence = Math.round(enhancedAnalysis.overall_adherence * 100);
    }
    
    const durationAdherenceValue = durationAdherence.adherence_percentage != null 
      ? Math.round(durationAdherence.adherence_percentage) 
      : 0;
    
    // Execution adherence: For cycling, power is primary metric (70% weight)
    // Duration matters less than hitting your power targets
    const executionAdherence = Math.round((powerAdherence * 0.7) + (durationAdherenceValue * 0.3));
    
    const performance = {
      execution_adherence: executionAdherence,
      power_adherence: powerAdherence,
      duration_adherence: durationAdherenceValue,
      completed_steps: workIntervals.length,
      total_steps: intervals.length
    };
    
    console.log(`🎯 Cycling performance metrics:`);
    console.log(`  - Power adherence: ${powerAdherence}% (work intervals 2x weighted)`);
    console.log(`  - Duration adherence: ${durationAdherenceValue}%`);
    console.log(`  - Execution adherence: ${executionAdherence}% = (${powerAdherence}% × 0.7) + (${durationAdherenceValue}% × 0.3)`);

    // Legacy AI insights are deprecated. Cycling V1 uses a deterministic fact packet + single coaching paragraph.
    const insights: any = null;

    // Extract power samples (include zeros; exclude null/NaN)
    const powerSamples = sensorData
      .map((s: any) => {
        const v = (s?.power ?? s?.watts ?? s?.power_w ?? s?.powerWatts);
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : null;
      })
      .filter((n: number | null): n is number => n != null);

    // Prefer workout summary power metrics when available (they already include coasting/zeros correctly).
    const avgPower = (() => {
      const v = Number((workout as any)?.avg_power ?? (workout as any)?.metrics?.avg_power);
      if (Number.isFinite(v) && v >= 0) return Math.round(v);
      return powerSamples.length > 0
        ? Math.round(powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length)
        : 0;
    })();
    const normalizedPower = (() => {
      const v = Number((workout as any)?.normalized_power ?? (workout as any)?.metrics?.normalized_power);
      if (Number.isFinite(v) && v >= 0) return Math.round(v);
      return calculateNormalizedPower(powerSamples);
    })();

    let trainingLoadContext: any | null = null;
    try {
      if ((workout as any)?.date) {
        trainingLoadContext = await getTrainingLoadContext(supabase as any, {
          userId: String((workout as any).user_id),
          workoutDateIso: String((workout as any).date),
        });
      }
    } catch (e) {
      console.log('⚠️ Failed to fetch training load context for cycling:', e);
      trainingLoadContext = null;
    }

    // Canonical, deterministic cycling fact packet + flags + coaching paragraph
    const cyclingFactPacketV1 = buildCyclingFactPacketV1({
      workout,
      plannedWorkout,
      powerSamplesW: powerSamples as number[],
      avgPowerW: avgPower || null,
      normalizedPowerW: normalizedPower || null,
      avgHr: (hrAnalysis as any)?.available ? Number((hrAnalysis as any)?.average_hr ?? (hrAnalysis as any)?.average_heart_rate) : null,
      maxHr: (hrAnalysis as any)?.available ? Number((hrAnalysis as any)?.max_hr ?? (hrAnalysis as any)?.max_heart_rate) : null,
      ftpW,
      trainingLoad: trainingLoadContext,
      userUnits: (userUnits === 'metric' || userUnits === 'imperial') ? (userUnits as any) : null,
    });
    const cyclingFlagsV1 = generateCyclingFlagsV1(cyclingFactPacketV1, trainingLoadContext);

    let ai_summary: string | null = null;
    let ai_summary_generated_at: string | null = null;
    try {
      ai_summary = await generateCyclingAISummaryV1(cyclingFactPacketV1, cyclingFlagsV1);
      if (ai_summary) ai_summary_generated_at = new Date().toISOString();
    } catch (e) {
      console.log('⚠️ Cycling ai_summary generation failed:', e);
      ai_summary = null;
      ai_summary_generated_at = null;
    }

    // Repair legacy 60x duration units bug in computed.overall.duration_s_moving when detected.
    try {
      const overall = (workout as any)?.computed?.overall;
      const cur = Number(overall?.duration_s_moving);
      const inferred = inferSecondsFromMaybeMinutes({ value: (workout as any)?.moving_time ?? (workout as any)?.duration ?? null, workout });
      if (
        Number.isFinite(cur) &&
        cur > 0 &&
        inferred != null &&
        inferred > 0 &&
        (cur / inferred >= 10 || inferred / cur >= 10)
      ) {
        const nextComputed = {
          ...(workout as any).computed,
          overall: {
            ...(overall || {}),
            duration_s_moving: Math.round(inferred),
          },
        };
        await supabase
          .from('workouts')
          .update({ computed: nextComputed })
          .eq('id', workout_id);
        console.log('🛠️ Repaired computed.overall.duration_s_moving (unit mismatch).', { cur, inferred });
      }
    } catch (e) {
      console.log('⚠️ Failed to repair computed duration units:', e);
    }

    // Build granular analysis (matches running structure for client compatibility)
    const granularAnalysis = {
      interval_breakdown: intervalBreakdown,
      power_variability: enhancedAnalysis.power_variability,
      heart_rate_analysis: hrAnalysis,
      time_in_range_s: enhancedAnalysis.time_in_range_s,
      time_outside_range_s: enhancedAnalysis.time_outside_range_s,
      total_time_s: enhancedAnalysis.total_time_s,
      overall_adherence: enhancedAnalysis.overall_adherence
    };

    // Build detailed analysis
    const detailedAnalysis = {
      workout_summary: {
        total_distance: workout.distance || 0,
        total_duration: workout.duration || 0,
        average_power: avgPower,
        normalized_power: normalizedPower,
        average_hr: hrAnalysis.available ? hrAnalysis.average_hr : 0
      },
      interval_breakdown: intervalBreakdown, // Also include here for backwards compatibility
      heart_rate_analysis: hrAnalysis,
      power_variability: enhancedAnalysis.power_variability
    };

    // Save analysis - matches running analysis structure exactly
    const analysisPayload = {
      _meta: {
        version: "2.0",
        source: "analyze-cycling-workout",
        generated_at: new Date().toISOString(),
        generator_version: "2.0.0"
      },
      granular_analysis: granularAnalysis,  // Same path as running for client compatibility
      performance: performance,
      detailed_analysis: detailedAnalysis,
      narrative_insights: null, // deprecated
      insights: null, // deprecated
      adherence_analysis: {
        power_adherence: powerAdherence,
        duration_adherence: durationAdherenceValue,
        time_in_range_s: enhancedAnalysis.time_in_range_s,
        time_outside_range_s: enhancedAnalysis.time_outside_range_s
      }
    };
    
    console.log(`✅ Analysis payload structure:`, Object.keys(analysisPayload));
    console.log(`  - granular_analysis.interval_breakdown: ${intervalBreakdown.length} intervals`);

    // Contract: merge into existing workout_analysis (do not replace).
    const { data: existingRowForMerge, error: existingRowErr } = await supabase
      .from('workouts')
      .select('workout_analysis')
      .eq('id', workout_id)
      .single();
    if (existingRowErr) {
      console.log('⚠️ Failed to read existing workout_analysis for cycling merge:', existingRowErr.message);
    }
    const existingAnalysis = (existingRowForMerge as any)?.workout_analysis || {};

    const { error: updateError } = await supabase
      .from('workouts')
      .update({
        workout_analysis: {
          ...(existingAnalysis || {}),
          ...(analysisPayload || {}),
          classified_type: cyclingFactPacketV1?.facts?.classified_type || null,
          fact_packet_v1: cyclingFactPacketV1,
          flags_v1: cyclingFlagsV1,
          ai_summary,
          ai_summary_generated_at,
        },
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
