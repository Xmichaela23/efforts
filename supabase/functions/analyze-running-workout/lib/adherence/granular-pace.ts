/**
 * Granular pace adherence: prescribed range, interval/steady-state analysis,
 * and sample-level helpers. Uses getPaceToleranceForSegment from garmin-execution.
 */

import { getPaceToleranceForSegment } from './garmin-execution.ts';
import { calculatePaceRangeAdherence, getIntervalType, type IntervalType } from './pace-adherence.ts';
// NOTE: HR drift is now calculated by the consolidated HR analysis module in index.ts
// Do NOT import or call calculateHeartRateDrift here - it creates competing calculations

// -----------------------------------------------------------------------------
// Exported types
// -----------------------------------------------------------------------------

export interface PrescribedRangeAdherence {
  overall_adherence: number;
  time_in_range_s: number;
  time_outside_range_s: number;
  total_time_s: number;
  interval_breakdown?: IntervalAnalysis[];
  performance_assessment?: string;
  primary_issues?: string[];
  strengths?: string[];
  heart_rate_analysis: any;
  pacing_analysis: {
    time_in_range_score: number;
    variability_score: number;
    smoothness_score: number;
    pacing_variability: number;
  } | null;
  duration_adherence: any;
  analysis_metadata?: {
    total_intervals: number;
    intervals_analyzed: number;
    samples_processed: number;
    outliers_filtered: number;
    gaps_handled: number;
  };
  time_in_range_score?: number;
  time_in_range_pct?: number;
  variability_score?: number;
  smoothness_score?: number;
  pacing_variability?: any;
  samples_in_range?: number;
  samples_outside_range?: number;
  segment_adherence?: any;
}

export interface IntervalAnalysis {
  interval_id: string;
  interval_type: string;
  prescribed_range: {
    lower: number;
    upper: number;
    unit: string;
  };
  time_in_range: number;
  time_outside_range: number;
  adherence_percentage: number;
  samples_in_range: number;
  samples_outside_range: number;
  average_value: number;
  range_consistency: number;
  issues: string[];
  performance_assessment: string;
}

export interface SampleTiming {
  timestamp: number;
  duration_s: number;
  value: number;
  isInterpolated: boolean;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function createEmptyAdherence(): PrescribedRangeAdherence {
  return {
    overall_adherence: 0,
    time_in_range_s: 0,
    time_outside_range_s: 0,
    total_time_s: 0,
    heart_rate_analysis: null,
    pacing_analysis: null,
    duration_adherence: null
  };
}

function calculateAveragePace(samples: any[]): number {
  if (samples.length === 0) return 0;

  const validPaces = samples
    .map(sample => sample.pace_s_per_mi)
    .filter(pace => pace && pace > 0);

  if (validPaces.length === 0) return 0;

  return validPaces.reduce((sum, pace) => sum + pace, 0) / validPaces.length;
}

function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Calculate pace adherence based on interval averages (not time-in-range)
 * Industry standard: evaluate each interval by its average pace, not second-by-second
 */
function calculateIntervalAveragePaceAdherence(
  workIntervals: Array<{
    sample_idx_start: number;
    sample_idx_end: number;
    pace_range: [number, number];
  }>,
  sensorData: Array<{ pace_s_per_mi: number }>
): number {
  if (!workIntervals.length) return 0;

  const intervalScores = workIntervals.map(interval => {
    const samples = sensorData.slice(
      interval.sample_idx_start,
      interval.sample_idx_end + 1
    );

    if (samples.length === 0) return 0;

    const avgPace = samples.reduce((sum, s) => sum + s.pace_s_per_mi, 0) / samples.length;
    const [targetLower, targetUpper] = interval.pace_range;

    if (avgPace >= targetLower && avgPace <= targetUpper) {
      return 100;
    }

    const deviation = avgPace < targetLower
      ? (targetLower - avgPace)
      : (avgPace - targetUpper);
    const rangeWidth = (targetUpper - targetLower) / 2;
    return Math.max(0, 100 - (deviation / rangeWidth) * 100);
  });

  return intervalScores.reduce((a, b) => a + b) / intervalScores.length;
}

// -----------------------------------------------------------------------------
// analyzeIntervalPace (used by calculateIntervalPaceAdherence and segment adherence)
// -----------------------------------------------------------------------------

/**
 * Analyze pace adherence for a single interval using granular sample-by-sample analysis
 */
function analyzeIntervalPace(samples: any[], interval: any, plannedWorkout?: any): any {
  const validSamples = samples.filter(s => s.pace_s_per_mi && s.pace_s_per_mi > 0);

  if (validSamples.length === 0) {
    return {
      timeInRange: 0,
      timeOutsideRange: 0,
      totalSamples: 0,
      filteredOutliers: 0,
      handledGaps: 0,
      adherence: 0,
      granular_metrics: null
    };
  }

  const expandSinglePaceToRange = (singlePace: number): { lower: number; upper: number } => {
    const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
    const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
    return {
      lower: Math.round(singlePace * (1 - tolerance)),
      upper: Math.round(singlePace * (1 + tolerance))
    };
  };

  let targetLower: number | null = interval.target_pace?.lower ||
    interval.pace_range?.lower ||
    interval.planned?.pace_range?.lower ||
    null;

  let targetUpper: number | null = interval.target_pace?.upper ||
    interval.pace_range?.upper ||
    interval.planned?.pace_range?.upper ||
    null;

  let singlePaceValue: number | null = null;
  if (!targetLower && !targetUpper) {
    singlePaceValue = interval.planned?.target_pace_s_per_mi || null;
  }

  if (targetLower !== null && targetUpper !== null && targetLower === targetUpper && targetLower > 0) {
    const expanded = expandSinglePaceToRange(targetLower);
    targetLower = expanded.lower;
    targetUpper = expanded.upper;
    console.log(`⚠️ [FIX] Expanded zero-width range to ${targetLower}-${targetUpper}s/mi`);
  }

  if (singlePaceValue && targetLower === null && targetUpper === null) {
    const expanded = expandSinglePaceToRange(singlePaceValue);
    targetLower = expanded.lower;
    targetUpper = expanded.upper;
    console.log(`⚠️ [FIX] Expanded single pace ${singlePaceValue}s/mi to range ${targetLower}-${targetUpper}s/mi`);
  }

  if (targetLower === null || targetUpper === null || targetLower === 0 || targetUpper === 0) {
    console.warn(`⚠️ No valid target pace range found for interval ${interval.role || interval.kind}`);
    return {
      timeInRange: 0,
      timeOutsideRange: 0,
      totalSamples: validSamples.length,
      filteredOutliers: 0,
      handledGaps: 0,
      adherence: 0,
      granular_metrics: null
    };
  }

  if (targetLower >= targetUpper) {
    const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
    const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
    const center = targetLower;
    targetLower = Math.round(center * (1 - tolerance));
    targetUpper = Math.round(center * (1 + tolerance));
    console.warn(`⚠️ [FIX] Invalid range, expanded to ${targetLower}-${targetUpper}`);
  }

  console.log(`🔍 [ANALYZE] Interval ${interval.role || interval.kind}: target pace range ${targetLower.toFixed(0)}-${targetUpper.toFixed(0)}s/mi`);

  const workoutToken = String(plannedWorkout?.workout_token || '').toLowerCase();
  const workoutName = String(plannedWorkout?.workout_name || plannedWorkout?.name || plannedWorkout?.title || '').toLowerCase();
  const workoutDesc = String(plannedWorkout?.workout_description || plannedWorkout?.description || plannedWorkout?.notes || '').toLowerCase();
  const easyKeywords = ['easy', 'long', 'recovery', 'aerobic', 'base', 'endurance', 'e pace', 'easy pace', 'z2', 'zone 2', 'easy run'];
  const isEasyOrLongRunWorkout = easyKeywords.some(kw =>
    workoutToken.includes(kw) || workoutName.includes(kw) || workoutDesc.includes(kw)
  );
  const intervalRole = String(interval.role || interval.kind || 'work').toLowerCase();
  const intervalType = isEasyOrLongRunWorkout ? 'easy' : getIntervalType(intervalRole);

  const paceValues = validSamples.map(s => s.pace_s_per_mi);
  let samplesInRange = 0;
  let samplesOutsideRange = 0;
  let totalSampleScore = 0;

  for (const pace of paceValues) {
    if (pace >= targetLower && pace <= targetUpper) {
      samplesInRange++;
      totalSampleScore += 100;
    } else {
      samplesOutsideRange++;
      const sampleScore = calculatePaceRangeAdherence(pace, targetLower, targetUpper, intervalType);
      totalSampleScore += sampleScore;
    }
  }

  const totalSamples = validSamples.length;
  const timeInRangeScore = totalSamples > 0 ? totalSampleScore / (totalSamples * 100) : 0;
  const avgPace = paceValues.reduce((sum, p) => sum + p, 0) / paceValues.length;

  const hrValues = samples.filter(s => s.heart_rate && s.heart_rate > 0).map(s => s.heart_rate);
  const cadenceValues = samples.filter(s => s.cadence && s.cadence > 0).map(s => s.cadence);
  const paceStdDev = Math.sqrt(paceValues.reduce((sum, v) => sum + Math.pow(v - avgPace, 2), 0) / paceValues.length);
  const paceVariation = avgPace > 0 ? (paceStdDev / avgPace) * 100 : 0;

  // Per-interval HR drift is not meaningful (drift requires sustained effort)
  // Workout-level HR drift is now calculated by consolidated HR analysis in index.ts
  const hrDrift = 0;

  const avgCadence = cadenceValues.length > 0
    ? cadenceValues.reduce((sum, v) => sum + v, 0) / cadenceValues.length
    : 0;
  const cadenceStdDev = cadenceValues.length > 0
    ? Math.sqrt(cadenceValues.reduce((sum, v) => sum + Math.pow(v - avgCadence, 2), 0) / cadenceValues.length)
    : 0;
  const cadenceConsistency = avgCadence > 0 ? (cadenceStdDev / avgCadence) * 100 : 0;

  return {
    timeInRange: samplesInRange,
    timeOutsideRange: samplesOutsideRange,
    totalSamples,
    filteredOutliers: 0,
    handledGaps: 0,
    adherence: timeInRangeScore,
    granular_metrics: {
      pace_variation_pct: Math.round(paceVariation * 10) / 10,
      hr_drift_bpm: Math.round(hrDrift * 10) / 10,
      cadence_consistency_pct: Math.round(cadenceConsistency * 10) / 10,
      time_in_target_pct: Math.round(timeInRangeScore * 100)
    }
  };
}

// -----------------------------------------------------------------------------
// calculateIntervalPaceAdherence
// -----------------------------------------------------------------------------

function calculateIntervalPaceAdherence(
  sensorData: any[], 
  intervals: any[], 
  workout: any, 
  plannedWorkout: any,
  historicalDrift?: {
    similarWorkouts: Array<{ date: string; driftBpm: number; durationMin: number; elevationFt?: number }>;
    avgDriftBpm: number;
    recentTrend?: 'improving' | 'stable' | 'worsening';
    lastWeekSimilar?: { date: string; driftBpm: number; durationMin: number; elevationFt?: number; daysSince: number };
  },
  planContext?: {
    weekIndex?: number;
    weekIntent?: string;
    phaseName?: string;
    isRecoveryWeek?: boolean;
    hasActivePlan?: boolean;
  }
): PrescribedRangeAdherence {
  console.log('🔴🔴🔴 VERSION 2026-02-02-C-EARLY-DRIFT: calculateIntervalPaceAdherence STARTED');
  console.log('🟢🟢🟢 IMMEDIATE-CHECK: This should appear right after version');
  console.log('🏃‍♂️ Analyzing interval workout pace adherence');

  const workIntervals = intervals.filter(interval => {
    const hasPaceTarget = interval.target_pace?.lower ||
      interval.target_pace?.upper ||
      interval.planned?.target_pace_s_per_mi ||
      interval.pace_range?.lower ||
      interval.planned?.pace_range?.lower;
    return hasPaceTarget && interval.executed && (interval.sample_idx_start !== undefined);
  });

  console.log(`📊 Analyzing ${workIntervals.length} intervals with pace targets`);

  let totalTimeInRange = 0;
  let totalTimeOutsideRange = 0;
  let totalSamples = 0;

  for (const interval of workIntervals) {
    if (interval.sample_idx_start === undefined || interval.sample_idx_end === undefined) {
      console.warn(`⚠️ Interval missing slice indices, skipping`);
      continue;
    }
    const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);
    if (intervalSamples.length === 0) {
      console.warn(`⚠️ No samples for interval, skipping`);
      continue;
    }
    const intervalResult = analyzeIntervalPace(intervalSamples, interval, plannedWorkout);
    if (intervalResult.granular_metrics) {
      interval.granular_metrics = intervalResult.granular_metrics;
    }
    totalTimeInRange += intervalResult.timeInRange;
    totalTimeOutsideRange += intervalResult.timeOutsideRange;
    totalSamples += intervalResult.totalSamples;
  }

  console.log(`🟡🟡🟡 AFTER-FORLOOP: workIntervals processed, totalTimeInRange=${totalTimeInRange}`);
  console.log(`🔵🔵🔵 EARLY-DRIFT-SECTION-START: workIntervals.length=${workIntervals.length}`);

  // ============================================================================
  // BASIC HR STATS - Full drift analysis is done by consolidated module in index.ts
  // ============================================================================
  let heartRateAnalysis: any = null;
  const allWorkSamplesForHR: any[] = [];
  for (const interval of workIntervals) {
    if (interval.sample_idx_start !== undefined && interval.sample_idx_end !== undefined) {
      allWorkSamplesForHR.push(...sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1));
    }
  }
  console.log(`📊 [GRANULAR-PACE] Collecting basic HR stats from ${allWorkSamplesForHR.length} samples`);
  
  if (allWorkSamplesForHR.length > 0) {
    const validHRSamples = allWorkSamplesForHR.filter(s => s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250);
    const avgHR = validHRSamples.length > 0
      ? Math.round(validHRSamples.reduce((sum, s) => sum + s.heart_rate, 0) / validHRSamples.length)
      : 0;

    // Calculate totalTime for HR analysis
    const totalTimeForHR = workIntervals.reduce((sum, i) => {
      const duration = i.executed?.duration_s || 
        (i.sample_idx_end && i.sample_idx_start ? (i.sample_idx_end - i.sample_idx_start + 1) : 0);
      return sum + duration;
    }, 0);

    // NOTE: hr_drift_bpm and related fields are now populated by the consolidated
    // HR analysis module (analyzeHeartRate) in index.ts. We only capture basic stats here.
    heartRateAnalysis = {
      adherence_percentage: 100,
      time_in_zone_s: totalTimeForHR,
      time_outside_zone_s: 0,
      total_time_s: totalTimeForHR,
      samples_in_zone: validHRSamples.length,
      samples_outside_zone: 0,
      average_heart_rate: avgHR,
      target_zone: null,
      // Drift fields left null - populated by consolidated HR analysis in index.ts
      hr_drift_bpm: null,
      early_avg_hr: null,
      late_avg_hr: null,
      hr_drift_interpretation: null,
      hr_consistency: null // Will be updated later with pacing variability
    };
    console.log(`📊 [GRANULAR-PACE] Basic HR stats: avgHR=${avgHR}, samples=${validHRSamples.length}`);
  }
  // ============================================================================

  const totalTime = totalTimeInRange + totalTimeOutsideRange;
  const timeInRangeScore = totalTime > 0 ? totalTimeInRange / totalTime : 0;

  const allPaceSamples: number[] = [];
  for (const interval of workIntervals) {
    if (interval.sample_idx_start !== undefined && interval.sample_idx_end !== undefined) {
      const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);
      const validPaces = intervalSamples
        .map(s => s.pace_s_per_mi)
        .filter(p => p != null && p > 0);
      allPaceSamples.push(...validPaces);
    }
  }

  let pacingVariability = {
    coefficient_of_variation: 0,
    avg_pace_change_per_min: 0,
    num_surges: 0,
    num_crashes: 0,
    steadiness_score: 100,
    avg_pace_change_seconds: 0
  };

  if (allPaceSamples.length >= 2) {
    const mean = allPaceSamples.reduce((a, b) => a + b, 0) / allPaceSamples.length;
    const variance = allPaceSamples.reduce((sum, pace) => sum + Math.pow(pace - mean, 2), 0) / allPaceSamples.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / mean) * 100;
    let surges = 0;
    let crashes = 0;
    let totalChange = 0;
    for (let i = 1; i < allPaceSamples.length; i++) {
      const delta = allPaceSamples[i] - allPaceSamples[i - 1];
      totalChange += Math.abs(delta);
      if (delta < -10) surges++;
      if (delta > 10) crashes++;
    }
    const avgChange = totalChange / (allPaceSamples.length - 1);
    let steadinessScore = 100;
    if (cv > 10) steadinessScore -= 40;
    else if (cv > 7) steadinessScore -= 30;
    else if (cv > 5) steadinessScore -= 20;
    else if (cv > 3) steadinessScore -= 10;
    if (surges / allPaceSamples.length > 0.1) steadinessScore -= 20;
    if (crashes / allPaceSamples.length > 0.1) steadinessScore -= 20;
    if (avgChange > 15) steadinessScore -= 20;
    else if (avgChange > 10) steadinessScore -= 15;
    else if (avgChange > 5) steadinessScore -= 10;
    steadinessScore = Math.max(0, steadinessScore);
    pacingVariability = {
      coefficient_of_variation: Math.round(cv * 10) / 10,
      avg_pace_change_per_min: Math.round(avgChange * 10) / 10,
      num_surges: surges,
      num_crashes: crashes,
      steadiness_score: Math.round(steadinessScore),
      avg_pace_change_seconds: Math.round(avgChange * 10) / 10
    };
  }

  const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
  const actualDurationSeconds = workout?.computed?.overall?.duration_s_moving ||
    intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);

  let durationAdherencePct = 0;
  if (plannedDurationSeconds > 0 && actualDurationSeconds > 0) {
    const ratio = actualDurationSeconds / plannedDurationSeconds;
    if (ratio >= 0.9 && ratio <= 1.1) {
      durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
    } else if (ratio < 0.9) {
      durationAdherencePct = ratio * 100;
    } else {
      durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
    }
    durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct));
  }

  const warmupIntervals = workIntervals.filter(i => (i.role === 'warmup' || i.kind === 'warmup' || i.type === 'warmup'));
  const workIntervalsOnly = workIntervals.filter(i => (i.role === 'work' || i.kind === 'work' || i.type === 'work'));
  const recoveryIntervals = workIntervals.filter(i => (i.role === 'recovery' || i.kind === 'recovery' || i.type === 'recovery' || i.type === 'rest'));
  const cooldownIntervals = workIntervals.filter(i => (i.role === 'cooldown' || i.kind === 'cooldown' || i.type === 'cooldown'));

  const intervalAvgAdherence = calculateIntervalAveragePaceAdherence(
    workIntervalsOnly
      .filter(iv => {
        if (iv.sample_idx_start === undefined || iv.sample_idx_end === undefined) return false;
        const hasPaceRange = iv.pace_range?.lower || iv.target_pace?.lower || iv.planned?.pace_range?.lower;
        return !!hasPaceRange;
      })
      .map(iv => {
        const lower = iv.pace_range?.lower || iv.target_pace?.lower || iv.planned?.pace_range?.lower || 0;
        const upper = iv.pace_range?.upper || iv.target_pace?.upper || iv.planned?.pace_range?.upper || 999;
        return {
          sample_idx_start: iv.sample_idx_start!,
          sample_idx_end: iv.sample_idx_end!,
          pace_range: [lower, upper] as [number, number]
        };
      }),
    sensorData
  );

  const segmentAdherence: any = { warmup: null, work_intervals: null, recovery: null, cooldown: null };

  const calculateSegmentAdherence = (segmentIntervals: any[]): { adherence: number; timeInRange: number; totalTime: number } | null => {
    if (segmentIntervals.length === 0) return null;
    let segmentTimeInRange = 0;
    let segmentTimeOutsideRange = 0;
    for (const interval of segmentIntervals) {
      if (interval.sample_idx_start === undefined || interval.sample_idx_end === undefined) continue;
      const intervalSamples = sensorData.slice(interval.sample_idx_start, interval.sample_idx_end + 1);
      if (intervalSamples.length === 0) continue;
      const intervalResult = analyzeIntervalPace(intervalSamples, interval, plannedWorkout);
      segmentTimeInRange += intervalResult.timeInRange;
      segmentTimeOutsideRange += intervalResult.timeOutsideRange;
    }
    const segmentTotalTime = segmentTimeInRange + segmentTimeOutsideRange;
    const segmentAdherencePct = segmentTotalTime > 0 ? (segmentTimeInRange / segmentTotalTime) * 100 : 0;
    return { adherence: Math.round(segmentAdherencePct), timeInRange: segmentTimeInRange, totalTime: segmentTotalTime };
  };

  console.log(`🟣 PRE-SEGMENT: warmup=${warmupIntervals.length}, work=${workIntervalsOnly.length}, recovery=${recoveryIntervals.length}, cooldown=${cooldownIntervals.length}`);
  if (warmupIntervals.length > 0) segmentAdherence.warmup = calculateSegmentAdherence(warmupIntervals);
  if (workIntervalsOnly.length > 0) segmentAdherence.work_intervals = calculateSegmentAdherence(workIntervalsOnly);
  if (recoveryIntervals.length > 0) segmentAdherence.recovery = calculateSegmentAdherence(recoveryIntervals);
  if (cooldownIntervals.length > 0) segmentAdherence.cooldown = calculateSegmentAdherence(cooldownIntervals);
  console.log(`🟣 POST-SEGMENT: segment adherence calculated`);

  // Update hr_consistency now that we have pacing variability
  if (heartRateAnalysis) {
    heartRateAnalysis.hr_consistency = 1 - (pacingVariability.coefficient_of_variation / 100);
  }
  
  console.log(`🟣 RETURN: heartRateAnalysis=${heartRateAnalysis ? 'SET' : 'NULL'}, hr_drift_bpm=${heartRateAnalysis?.hr_drift_bpm ?? 'N/A'}`);

  return {
    overall_adherence: timeInRangeScore,
    time_in_range_score: timeInRangeScore,
    time_in_range_pct: timeInRangeScore,
    variability_score: pacingVariability.coefficient_of_variation / 100,
    smoothness_score: pacingVariability.steadiness_score / 100,
    pacing_variability: pacingVariability,
    time_in_range_s: totalTimeInRange,
    time_outside_range_s: totalTimeOutsideRange,
    total_time_s: totalTime,
    samples_in_range: totalSamples,
    samples_outside_range: 0,
    heart_rate_analysis: heartRateAnalysis,
    pacing_analysis: {
      time_in_range_score: intervalAvgAdherence,
      variability_score: 0,
      smoothness_score: 0,
      pacing_variability: 0
    },
    duration_adherence: {
      adherence_percentage: durationAdherencePct,
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      delta_seconds: actualDurationSeconds - plannedDurationSeconds
    },
    segment_adherence: segmentAdherence
  };
}

// -----------------------------------------------------------------------------
// calculateSteadyStatePaceAdherence
// -----------------------------------------------------------------------------

function calculateSteadyStatePaceAdherence(
  sensorData: any[], 
  intervals: any[], 
  workout: any, 
  plannedWorkout: any,
  historicalDrift?: {
    similarWorkouts: Array<{ date: string; driftBpm: number; durationMin: number; elevationFt?: number }>;
    avgDriftBpm: number;
    recentTrend?: 'improving' | 'stable' | 'worsening';
    lastWeekSimilar?: { date: string; driftBpm: number; durationMin: number; elevationFt?: number; daysSince: number };
  },
  planContext?: {
    weekIndex?: number;
    weekIntent?: string;
    phaseName?: string;
    isRecoveryWeek?: boolean;
    hasActivePlan?: boolean;
  }
): PrescribedRangeAdherence {
  console.log('🏃‍♂️ Analyzing steady-state workout pace adherence');

  const mainSegments = intervals.filter(interval => {
    const role = String(interval.role || interval.kind || interval.type || '').toLowerCase();
    return role !== 'warmup' && role !== 'cooldown' && interval.pace_range && interval.pace_range.lower && interval.pace_range.upper;
  });

  if (mainSegments.length === 0) {
    const totalTimeSeconds = workout?.computed?.overall?.duration_s_moving ||
      (workout.moving_time ? (workout.moving_time < 1000 ? workout.moving_time * 60 : workout.moving_time) : null) ||
      (sensorData.length > 0 ? sensorData.length : 0);
    const validPaceSamples = sensorData.filter(s => s.pace_s_per_mi > 0 && s.pace_s_per_mi < 1200);
    const avgPace = validPaceSamples.length > 0
      ? validPaceSamples.reduce((sum, s) => sum + s.pace_s_per_mi, 0) / validPaceSamples.length
      : 0;
    const validHRSamples = sensorData.filter(s => s.heart_rate > 0);
    const avgHR = validHRSamples.length > 0
      ? Math.round(validHRSamples.reduce((sum, s) => sum + s.heart_rate, 0) / validHRSamples.length)
      : 0;
    // NOTE: Full HR drift analysis is done by consolidated module in index.ts
    // We only capture basic stats here
    const allPaces = validPaceSamples.map(s => s.pace_s_per_mi);
    const stdDev = allPaces.length > 1 ? calculateStandardDeviation(allPaces) : 0;
    const cv = avgPace > 0 ? stdDev / avgPace : 0;

    let plannedPaceLower = 0;
    let plannedPaceUpper = 0;
    if (plannedWorkout?.computed?.steps) {
      const workStep = plannedWorkout.computed.steps.find((step: any) => (step.kind === 'work' || step.role === 'work') && step.pace_range);
      if (workStep?.pace_range) {
        plannedPaceLower = workStep.pace_range.lower || 0;
        plannedPaceUpper = workStep.pace_range.upper || 0;
      }
    }

    let paceAdherence = 1.0;
    let timeInRange = 0;
    let timeOutsideRange = 0;
    let totalSampleScore = 0;

    if (plannedPaceLower > 0 && plannedPaceUpper > 0 && validPaceSamples.length > 0) {
      const workoutToken = String(plannedWorkout?.workout_token || '').toLowerCase();
      const workoutName = String(plannedWorkout?.workout_name || plannedWorkout?.name || plannedWorkout?.title || '').toLowerCase();
      const workoutDesc = String(plannedWorkout?.workout_description || plannedWorkout?.description || plannedWorkout?.notes || '').toLowerCase();
      const easyKeywords = ['easy', 'long', 'recovery', 'aerobic', 'base', 'endurance', 'e pace', 'easy pace', 'z2', 'zone 2', 'easy run'];
      const isEasyOrLongRun = easyKeywords.some(kw => workoutToken.includes(kw) || workoutName.includes(kw) || workoutDesc.includes(kw));
      const intervalType: IntervalType = isEasyOrLongRun ? 'easy' : 'work';
      for (const sample of validPaceSamples) {
        const pace = sample.pace_s_per_mi;
        if (pace >= plannedPaceLower && pace <= plannedPaceUpper) {
          timeInRange += 1;
          totalSampleScore += 100;
        } else {
          timeOutsideRange += 1;
          totalSampleScore += calculatePaceRangeAdherence(pace, plannedPaceLower, plannedPaceUpper, intervalType);
        }
      }
      const totalPaceTime = timeInRange + timeOutsideRange;
      paceAdherence = totalPaceTime > 0 ? totalSampleScore / (totalPaceTime * 100) : 1.0;
    }

    const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
    const actualDurationSeconds = workout?.computed?.overall?.duration_s_moving || totalTimeSeconds || intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
    let durationAdherencePct = 0;
    if (plannedDurationSeconds > 0 && actualDurationSeconds > 0) {
      const ratio = actualDurationSeconds / plannedDurationSeconds;
      if (ratio >= 0.9 && ratio <= 1.1) durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
      else if (ratio < 0.9) durationAdherencePct = ratio * 100;
      else durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
      durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct));
    }

    return {
      overall_adherence: paceAdherence,
      time_in_range_score: paceAdherence,
      variability_score: cv,
      smoothness_score: Math.max(0, 1 - cv),
      pacing_variability: {
        coefficient_of_variation: cv * 100,
        avg_pace_change_per_min: stdDev,
        num_surges: 0,
        num_crashes: 0,
        steadiness_score: Math.max(0, 100 - (cv * 100)),
        avg_pace_change_seconds: stdDev
      },
      time_in_range_s: timeInRange,
      time_outside_range_s: timeOutsideRange,
      total_time_s: timeInRange + timeOutsideRange,
      samples_in_range: timeInRange,
      samples_outside_range: timeOutsideRange,
      // NOTE: Basic HR stats only - full drift analysis done by consolidated module in index.ts
      heart_rate_analysis: avgHR > 0 ? {
        adherence_percentage: 100,
        time_in_zone_s: totalTimeSeconds,
        time_outside_zone_s: 0,
        total_time_s: totalTimeSeconds,
        samples_in_zone: validHRSamples.length,
        samples_outside_zone: 0,
        average_heart_rate: avgHR,
        target_zone: null,
        // Drift fields left null - populated by consolidated HR analysis in index.ts
        hr_drift_bpm: null,
        early_avg_hr: null,
        late_avg_hr: null,
        hr_drift_interpretation: null,
        hr_consistency: 1 - cv
      } : null,
      pacing_analysis: { time_in_range_score: 100, variability_score: cv, smoothness_score: 1 - cv, pacing_variability: cv * 100 },
      duration_adherence: {
        adherence_percentage: durationAdherencePct,
        planned_duration_s: plannedDurationSeconds,
        actual_duration_s: actualDurationSeconds,
        delta_seconds: actualDurationSeconds - plannedDurationSeconds
      }
    };
  }

  const segmentDuration = 120;
  const segments: number[] = [];
  for (let i = 0; i < sensorData.length; i += segmentDuration) {
    const segmentSamples = sensorData.slice(i, i + segmentDuration);
    if (segmentSamples.length > 0) {
      const avgPace = calculateAveragePace(segmentSamples);
      if (avgPace > 0) segments.push(avgPace);
    }
  }

  if (segments.length === 0) {
    const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
    const actualDurationSeconds = workout?.computed?.overall?.duration_s_moving || intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
    let durationAdherencePct = 0;
    if (plannedDurationSeconds > 0 && actualDurationSeconds > 0) {
      const ratio = actualDurationSeconds / plannedDurationSeconds;
      if (ratio >= 0.9 && ratio <= 1.1) durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
      else if (ratio < 0.9) durationAdherencePct = ratio * 100;
      else durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
      durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct));
    }
    const empty = createEmptyAdherence();
    empty.duration_adherence = {
      adherence_percentage: durationAdherencePct,
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      delta_seconds: actualDurationSeconds - plannedDurationSeconds
    };
    return empty;
  }

  const avgPace = segments.reduce((sum, pace) => sum + pace, 0) / segments.length;
  const stdDev = calculateStandardDeviation(segments);
  const cv = stdDev / avgPace;
  const targetPaceLower = mainSegments[0].pace_range.lower;
  const targetPaceUpper = mainSegments[0].pace_range.upper;
  const targetPace = targetPaceLower + (targetPaceUpper - targetPaceLower) / 2;

  const validPaceSamples = sensorData.filter(s => s.pace_s_per_mi > 0 && s.pace_s_per_mi < 1200);
  let timeInRange = 0;
  let timeOutsideRange = 0;
  for (const sample of validPaceSamples) {
    const pace = sample.pace_s_per_mi;
    if (pace >= targetPaceLower && pace <= targetPaceUpper) timeInRange += 1;
    else timeOutsideRange += 1;
  }
  const totalPaceTime = timeInRange + timeOutsideRange;
  const timeInRangeScore = totalPaceTime > 0 ? timeInRange / totalPaceTime : 0;

  let consistencyMultiplier = 1.0;
  if (cv > 0.06) consistencyMultiplier = 0.85;
  else if (cv > 0.04) consistencyMultiplier = 0.90;
  else if (cv > 0.02) consistencyMultiplier = 0.95;
  const finalScore = timeInRangeScore * consistencyMultiplier;

  const plannedDurationSeconds = plannedWorkout?.computed?.total_duration_seconds || 0;
  const actualDurationSeconds = workout?.computed?.overall?.duration_s_moving || intervals.reduce((sum, i) => sum + (i.executed?.duration_s || 0), 0);
  let durationAdherencePct = 0;
  if (plannedDurationSeconds > 0 && actualDurationSeconds > 0) {
    const ratio = actualDurationSeconds / plannedDurationSeconds;
    if (ratio >= 0.9 && ratio <= 1.1) durationAdherencePct = 100 - Math.abs(ratio - 1) * 100;
    else if (ratio < 0.9) durationAdherencePct = ratio * 100;
    else durationAdherencePct = (plannedDurationSeconds / actualDurationSeconds) * 100;
    durationAdherencePct = Math.max(0, Math.min(100, durationAdherencePct));
  }

  const allSegmentSamples: any[] = [];
  for (const segment of mainSegments) {
    if (segment.sample_idx_start !== undefined && segment.sample_idx_end !== undefined) {
      allSegmentSamples.push(...sensorData.slice(segment.sample_idx_start, segment.sample_idx_end + 1));
    }
  }
  const samplesForHR = allSegmentSamples.length > 0 ? allSegmentSamples : sensorData;
  let heartRateAnalysis = null;
  if (samplesForHR.length > 0) {
    // NOTE: Full HR drift analysis is done by consolidated module in index.ts
    // We only capture basic stats here
    const validHRSamples = samplesForHR.filter(s => s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250);
    const avgHR = validHRSamples.length > 0 ? Math.round(validHRSamples.reduce((sum, s) => sum + s.heart_rate, 0) / validHRSamples.length) : 0;
    heartRateAnalysis = {
      adherence_percentage: 100,
      time_in_zone_s: actualDurationSeconds,
      time_outside_zone_s: 0,
      total_time_s: actualDurationSeconds,
      samples_in_zone: validHRSamples.length,
      samples_outside_zone: 0,
      average_heart_rate: avgHR,
      target_zone: null,
      // Drift fields left null - populated by consolidated HR analysis in index.ts
      hr_drift_bpm: null,
      early_avg_hr: null,
      late_avg_hr: null,
      hr_drift_interpretation: null,
      hr_consistency: 1 - cv
    };
  }

  return {
    overall_adherence: finalScore,
    time_in_range_score: timeInRangeScore,
    variability_score: cv,
    smoothness_score: 1 - cv,
    pacing_variability: {
      coefficient_of_variation: cv * 100,
      avg_pace_change_per_min: stdDev,
      num_surges: 0,
      num_crashes: 0,
      steadiness_score: Math.max(0, 100 - (cv * 100)),
      avg_pace_change_seconds: stdDev
    },
    time_in_range_s: timeInRange,
    time_outside_range_s: timeOutsideRange,
    total_time_s: totalPaceTime,
    samples_in_range: timeInRange,
    samples_outside_range: timeOutsideRange,
    heart_rate_analysis: heartRateAnalysis,
    pacing_analysis: {
      time_in_range_score: timeInRangeScore * 100,
      variability_score: cv,
      smoothness_score: 1 - cv,
      pacing_variability: cv * 100
    },
    duration_adherence: {
      adherence_percentage: durationAdherencePct,
      planned_duration_s: plannedDurationSeconds,
      actual_duration_s: actualDurationSeconds,
      delta_seconds: actualDurationSeconds - plannedDurationSeconds
    }
  };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Calculate prescribed range adherence using proper granular analysis.
 * Handles both intervals and steady-state workouts with consistency analysis.
 */
export function calculatePrescribedRangeAdherenceGranular(
  sensorData: any[],
  intervals: any[],
  workout: any,
  plannedWorkout: any,
  historicalDrift?: {
    similarWorkouts: Array<{ date: string; driftBpm: number; durationMin: number; elevationFt?: number }>;
    avgDriftBpm: number;
    recentTrend?: 'improving' | 'stable' | 'worsening';
    lastWeekSimilar?: { date: string; driftBpm: number; durationMin: number; elevationFt?: number; daysSince: number };
  },
  planContext?: {
    weekIndex?: number;
    weekIntent?: string;
    phaseName?: string;
    isRecoveryWeek?: boolean;
    hasActivePlan?: boolean;
  }
): PrescribedRangeAdherence {
  console.log(`📊 Starting granular prescribed range analysis for ${intervals.length} intervals`);

  const intervalsWithPaceTargets = intervals.filter(interval => {
    const hasPaceTarget = interval.target_pace?.lower ||
      interval.pace_range?.lower ||
      interval.planned?.target_pace_s_per_mi ||
      interval.planned?.pace_range;
    return hasPaceTarget && interval.executed;
  });

  const workIntervals = intervals.filter(interval => {
    const isWorkRole = interval.role === 'work' || interval.kind === 'work';
    const hasPaceTarget = interval.target_pace?.lower || interval.pace_range?.lower || interval.planned?.target_pace_s_per_mi || interval.planned?.pace_range;
    return isWorkRole && hasPaceTarget;
  });

  const isIntervalWorkout = intervalsWithPaceTargets.length > 0;
  console.log(`🔍 Workout type: ${isIntervalWorkout ? 'Intervals' : 'Steady-state'} (${intervalsWithPaceTargets.length} intervals with pace targets, ${workIntervals.length} work segments)`);

  if (isIntervalWorkout) {
    return calculateIntervalPaceAdherence(sensorData, intervals, workout, plannedWorkout, historicalDrift, planContext);
  }
  return calculateSteadyStatePaceAdherence(sensorData, intervals, workout, plannedWorkout, historicalDrift, planContext);
}
