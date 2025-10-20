import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================================
// ANALYZE-RUNNING-WORKOUT - RUNNING ANALYSIS EDGE FUNCTION
// =============================================================================
// 
// FUNCTION NAME: analyze-running-workout
// PURPOSE: Granular adherence analysis for running workouts
// 
// WHAT IT DOES:
// - Analyzes running workouts with prescribed pace/power ranges
// - Calculates time-in-prescribed-range (not just averages)
// - Provides interval-by-interval execution breakdown
// - Detects patterns: too fast, fading, inconsistent pacing
// - Generates honest execution grades (A/B/C/D/F)
// - Identifies specific issues and strengths
// 
// KEY FEATURES:
// - Uses prescribed ranges from planned_workouts.intervals
// - Time-based analysis (how much TIME spent in range)
// - Context-aware grading (stricter for intervals, lenient for warmup)
// - GPS spike and outlier detection
// - Gap handling and interpolation for sensor data
// - Fuzzy interval boundary matching
// 
// DATA SOURCES:
// - workouts.computed (from compute-workout-summary)
// - planned_workouts.intervals (prescribed pace/power ranges)
// 
// ANALYSIS OUTPUT:
// - adherence_percentage: % of time spent in prescribed ranges
// - interval_breakdown: per-interval execution quality
// - execution_grade: honest A-F grade
// - primary_issues: specific problems identified
// - strengths: positive execution patterns
// 
// INPUT: { workout_id: string }
// OUTPUT: { success: boolean, analysis: PrescribedRangeAdherence }
// =============================================================================

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { workout_id } = await req.json();
    
    if (!workout_id) {
      return new Response(JSON.stringify({
        error: 'workout_id is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    console.log(`🏃‍♂️ Analyzing running workout: ${workout_id}`);

    // Get workout data
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select(`
        id,
        type,
        computed,
        planned_id
      `)
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message}`);
    }

    if (workout.type !== 'run' && workout.type !== 'running') {
      throw new Error(`Workout type ${workout.type} is not supported for running analysis`);
    }

    if (!workout.computed) {
      throw new Error('Workout data not computed. Run compute-workout-summary first.');
    }

    // Get planned workout data
    let plannedWorkout = null;
    if (workout.planned_id) {
      const { data: planned, error: plannedError } = await supabase
        .from('planned_workouts')
        .select('id, intervals')
        .eq('id', workout.planned_id)
        .single();

      if (plannedError) {
        console.warn('⚠️ Could not load planned workout:', plannedError.message);
      } else {
        plannedWorkout = planned;
      }
    }

    if (!plannedWorkout || !plannedWorkout.intervals) {
      throw new Error('No planned workout intervals found. This analysis requires a planned workout with intervals.');
    }

    // Extract sensor data from computed workout
    const sensorData = extractSensorData(workout.computed);
    
    if (!sensorData || sensorData.length === 0) {
      throw new Error('No sensor data found in computed workout');
    }

    // Perform granular adherence analysis
    const analysis = calculatePrescribedRangeAdherence(sensorData, plannedWorkout.intervals);

    // Store analysis in database
    const { error: updateError } = await supabase
      .from('workouts')
      .update({
        workout_analysis: analysis
      })
      .eq('id', workout_id);

    if (updateError) {
      console.warn('⚠️ Could not store analysis:', updateError.message);
    }

    console.log(`✅ Running analysis complete for workout ${workout_id}`);
    console.log(`📊 Overall adherence: ${(analysis.overall_adherence * 100).toFixed(1)}%`);
    console.log(`🎯 Execution grade: ${analysis.execution_grade}`);

    return new Response(JSON.stringify({
      success: true,
      analysis: analysis
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('❌ Analyze running workout error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});

// Types
interface PrescribedRangeAdherence {
  overall_adherence: number;
  time_in_range_s: number;
  time_outside_range_s: number;
  total_time_s: number;
  interval_breakdown: IntervalAnalysis[];
  execution_grade: string;
  primary_issues: string[];
  strengths: string[];
  analysis_metadata: {
    total_intervals: number;
    intervals_analyzed: number;
    samples_processed: number;
    outliers_filtered: number;
    gaps_handled: number;
  };
}

interface IntervalAnalysis {
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
  grade: string;
}

interface SampleTiming {
  timestamp: number;
  duration_s: number;
  value: number;
  isInterpolated: boolean;
}

/**
 * Extract sensor data from computed workout data
 * This reads the normalized data from compute-workout-summary
 */
function extractSensorData(computed: any): any[] {
  if (!computed || !computed.samples) {
    return [];
  }

  return computed.samples.map((sample: any) => ({
    timestamp: sample.timestamp,
    pace_s_per_mi: sample.pace_s_per_mi,
    power_w: sample.power_w,
    heart_rate: sample.heart_rate,
    duration_s: sample.duration_s || 1
  }));
}

/**
 * Calculate prescribed range adherence for running workouts
 * This is the core analysis function that measures time-in-range
 */
function calculatePrescribedRangeAdherence(sensorData: any[], intervals: any[]): PrescribedRangeAdherence {
  console.log(`📊 Starting prescribed range analysis for ${intervals.length} intervals`);
  
  let totalTimeInRange = 0;
  let totalTimeOutsideRange = 0;
  let totalSamples = 0;
  let filteredOutliers = 0;
  let handledGaps = 0;
  
  const intervalAnalysis: IntervalAnalysis[] = [];
  
  for (const interval of intervals) {
    console.log(`🔍 Analyzing interval: ${interval.type} (${interval.duration_s}s)`);
    
    // Get samples for this interval
    const intervalSamples = getSamplesForInterval(sensorData, interval);
    console.log(`📈 Found ${intervalSamples.length} samples for interval`);
    
    if (intervalSamples.length === 0) {
      console.log(`⚠️ No samples found for interval, skipping`);
      continue;
    }
    
    // Filter outliers and handle gaps
    const { cleanSamples, outliers, gaps } = filterOutliersAndGaps(intervalSamples);
    filteredOutliers += outliers;
    handledGaps += gaps;
    
    console.log(`🧹 Filtered ${outliers} outliers, handled ${gaps} gaps`);
    
    if (cleanSamples.length === 0) {
      console.log(`⚠️ No clean samples after filtering, skipping interval`);
      continue;
    }
    
    // Calculate adherence for this interval
    const intervalResult = calculateIntervalAdherence(cleanSamples, interval);
    intervalAnalysis.push(intervalResult);
    
    totalTimeInRange += intervalResult.time_in_range;
    totalTimeOutsideRange += intervalResult.time_outside_range;
    totalSamples += cleanSamples.length;
    
    console.log(`✅ Interval adherence: ${(intervalResult.adherence_percentage * 100).toFixed(1)}%`);
  }
  
  const totalTime = totalTimeInRange + totalTimeOutsideRange;
  const overallAdherence = totalTime > 0 ? totalTimeInRange / totalTime : 0;
  
  // Calculate execution grade
  const executionGrade = calculateHonestGrade(overallAdherence, intervalAnalysis);
  
  // Identify primary issues and strengths
  const primaryIssues = identifyPrimaryIssues(intervalAnalysis);
  const strengths = identifyStrengths(intervalAnalysis);
  
  console.log(`🎯 Overall adherence: ${(overallAdherence * 100).toFixed(1)}%`);
  console.log(`📊 Grade: ${executionGrade}`);
  console.log(`🚨 Issues: ${primaryIssues.length}`);
  console.log(`💪 Strengths: ${strengths.length}`);
  
  return {
    overall_adherence: overallAdherence,
    time_in_range_s: totalTimeInRange,
    time_outside_range_s: totalTimeOutsideRange,
    total_time_s: totalTime,
    interval_breakdown: intervalAnalysis,
    execution_grade: executionGrade,
    primary_issues: primaryIssues,
    strengths: strengths,
    analysis_metadata: {
      total_intervals: intervals.length,
      intervals_analyzed: intervalAnalysis.length,
      samples_processed: totalSamples,
      outliers_filtered: filteredOutliers,
      gaps_handled: handledGaps
    }
  };
}

/**
 * Get samples that fall within an interval's time range
 * Uses fuzzy matching to handle timing discrepancies
 */
function getSamplesForInterval(sensorData: any[], interval: any): any[] {
  const startTime = new Date(interval.start_time).getTime() / 1000;
  const endTime = new Date(interval.end_time).getTime() / 1000;
  
  // Add tolerance for manual lap button presses
  const startTolerance = 10; // 10 seconds before
  const endTolerance = 5;    // 5 seconds after
  
  return sensorData.filter(sample => {
    const sampleTime = sample.timestamp;
    return sampleTime >= (startTime - startTolerance) && 
           sampleTime <= (endTime + endTolerance);
  });
}

/**
 * Filter out GPS spikes and unrealistic values
 * Handle gaps in sensor data with interpolation
 */
function filterOutliersAndGaps(samples: any[]): { cleanSamples: any[], outliers: number, gaps: number } {
  if (samples.length === 0) return { cleanSamples: [], outliers: 0, gaps: 0 };
  
  let outliers = 0;
  let gaps = 0;
  const cleanSamples: any[] = [];
  
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const nextSample = samples[i + 1];
    
    // Check for outliers (GPS spikes, unrealistic pace/power)
    if (isOutlier(sample)) {
      outliers++;
      continue;
    }
    
    // Handle gaps in sensor data
    if (nextSample) {
      const timeDiff = nextSample.timestamp - sample.timestamp;
      
      if (timeDiff > 60) {
        // Large gap - skip this sample entirely
        gaps++;
        continue;
      } else if (timeDiff > 10) {
        // Medium gap - interpolate
        const interpolatedSamples = interpolateGap(sample, nextSample);
        cleanSamples.push(...interpolatedSamples);
        gaps++;
      }
    }
    
    cleanSamples.push(sample);
  }
  
  return { cleanSamples, outliers, gaps };
}

/**
 * Check if a sample is an outlier (GPS spike, unrealistic value)
 */
function isOutlier(sample: any): boolean {
  // Check for unrealistic pace values (faster than 4:00/mi or slower than 15:00/mi)
  if (sample.pace_s_per_mi && (sample.pace_s_per_mi < 240 || sample.pace_s_per_mi > 900)) {
    return true;
  }
  
  // Check for unrealistic power values (negative or > 1000W)
  if (sample.power_w && (sample.power_w < 0 || sample.power_w > 1000)) {
    return true;
  }
  
  // Check for unrealistic heart rate (below 30 or above 220)
  if (sample.heart_rate && (sample.heart_rate < 30 || sample.heart_rate > 220)) {
    return true;
  }
  
  return false;
}

/**
 * Interpolate between two samples for medium gaps
 */
function interpolateGap(sample1: any, sample2: any): any[] {
  const timeDiff = sample2.timestamp - sample1.timestamp;
  const steps = Math.floor(timeDiff / 5); // 5-second steps
  const interpolated: any[] = [];
  
  for (let i = 1; i < steps; i++) {
    const ratio = i / steps;
    const interpolatedSample = {
      timestamp: sample1.timestamp + (timeDiff * ratio),
      pace_s_per_mi: interpolateValue(sample1.pace_s_per_mi, sample2.pace_s_per_mi, ratio),
      power_w: interpolateValue(sample1.power_w, sample2.power_w, ratio),
      heart_rate: interpolateValue(sample1.heart_rate, sample2.heart_rate, ratio),
      duration_s: 5
    };
    interpolated.push(interpolatedSample);
  }
  
  return interpolated;
}

/**
 * Linear interpolation between two values
 */
function interpolateValue(value1: number, value2: number, ratio: number): number {
  if (value1 == null || value2 == null) return value1 || value2 || 0;
  return value1 + (value2 - value1) * ratio;
}

/**
 * Calculate adherence for a single interval
 */
function calculateIntervalAdherence(samples: any[], interval: any): IntervalAnalysis {
  const prescribedRange = getPrescribedRange(interval);
  let timeInRange = 0;
  let timeOutsideRange = 0;
  let samplesInRange = 0;
  let samplesOutsideRange = 0;
  let totalValue = 0;
  
  for (const sample of samples) {
    const value = getSampleValue(sample, interval);
    const duration = sample.duration_s || 1;
    
    if (value == null) continue;
    
    totalValue += value;
    
    if (isInPrescribedRange(value, prescribedRange)) {
      timeInRange += duration;
      samplesInRange++;
    } else {
      timeOutsideRange += duration;
      samplesOutsideRange++;
    }
  }
  
  const totalTime = timeInRange + timeOutsideRange;
  const adherencePercentage = totalTime > 0 ? timeInRange / totalTime : 0;
  const averageValue = samples.length > 0 ? totalValue / samples.length : 0;
  
  // Calculate range consistency (coefficient of variation)
  const rangeConsistency = calculateRangeConsistency(samples, interval);
  
  // Identify issues for this interval
  const issues = identifyIntervalIssues(adherencePercentage, averageValue, prescribedRange, interval);
  
  // Calculate grade for this interval
  const grade = calculateIntervalGrade(adherencePercentage, interval.type);
  
  return {
    interval_id: interval.id || `interval_${Date.now()}`,
    interval_type: interval.type || 'unknown',
    prescribed_range: prescribedRange,
    time_in_range: timeInRange,
    time_outside_range: timeOutsideRange,
    adherence_percentage: adherencePercentage,
    samples_in_range: samplesInRange,
    samples_outside_range: samplesOutsideRange,
    average_value: averageValue,
    range_consistency: rangeConsistency,
    issues: issues,
    grade: grade
  };
}

/**
 * Get the prescribed range for an interval (pace or power)
 */
function getPrescribedRange(interval: any): { lower: number, upper: number, unit: string } {
  if (interval.pace_range) {
    return {
      lower: interval.pace_range.lower,
      upper: interval.pace_range.upper,
      unit: 's_per_mi'
    };
  }
  
  if (interval.power_range) {
    return {
      lower: interval.power_range.lower,
      upper: interval.power_range.upper,
      unit: 'watts'
    };
  }
  
  // Default fallback
  return {
    lower: 0,
    upper: 1000,
    unit: 'unknown'
  };
}

/**
 * Get the relevant value from a sample based on interval type
 */
function getSampleValue(sample: any, interval: any): number | null {
  if (interval.pace_range && sample.pace_s_per_mi != null) {
    return sample.pace_s_per_mi;
  }
  
  if (interval.power_range && sample.power_w != null) {
    return sample.power_w;
  }
  
  return null;
}

/**
 * Check if a value is within the prescribed range
 */
function isInPrescribedRange(value: number, range: { lower: number, upper: number }): boolean {
  return value >= range.lower && value <= range.upper;
}

/**
 * Calculate range consistency (coefficient of variation)
 */
function calculateRangeConsistency(samples: any[], interval: any): number {
  const values = samples
    .map(s => getSampleValue(s, interval))
    .filter(v => v != null) as number[];
  
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return mean > 0 ? stdDev / mean : 0;
}

/**
 * Identify issues for a specific interval
 */
function identifyIntervalIssues(adherence: number, averageValue: number, range: { lower: number, upper: number, unit: string }, interval: any): string[] {
  const issues: string[] = [];
  
  if (adherence < 0.5) {
    issues.push('Poor adherence to prescribed range');
  }
  
  if (averageValue < range.lower) {
    issues.push('Consistently too fast');
  } else if (averageValue > range.upper) {
    issues.push('Consistently too slow');
  }
  
  if (interval.type === 'work' && adherence < 0.7) {
    issues.push('Work interval not executed as prescribed');
  }
  
  return issues;
}

/**
 * Calculate grade for a specific interval
 */
function calculateIntervalGrade(adherence: number, intervalType: string): string {
  const thresholds = getGradingThresholds(intervalType);
  
  if (adherence >= thresholds.excellent) return 'A';
  if (adherence >= thresholds.good) return 'B';
  if (adherence >= thresholds.acceptable) return 'C';
  if (adherence >= thresholds.poor) return 'D';
  return 'F';
}

/**
 * Calculate honest overall grade based on adherence and patterns
 */
function calculateHonestGrade(overallAdherence: number, intervalAnalysis: IntervalAnalysis[]): string {
  // Base grade on overall adherence
  let grade = calculateIntervalGrade(overallAdherence, 'overall');
  
  // Adjust based on patterns
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work' || i.interval_type === 'interval');
  const workAdherence = workIntervals.length > 0 
    ? workIntervals.reduce((sum, i) => sum + i.adherence_percentage, 0) / workIntervals.length
    : overallAdherence;
  
  // Stricter grading for work intervals
  if (workIntervals.length > 0 && workAdherence < 0.6) {
    grade = 'F';
  } else if (workIntervals.length > 0 && workAdherence < 0.7) {
    grade = 'D';
  }
  
  return grade;
}

/**
 * Get grading thresholds based on interval type
 */
function getGradingThresholds(intervalType: string): { excellent: number, good: number, acceptable: number, poor: number } {
  if (intervalType === 'warmup' || intervalType === 'cooldown') {
    // More lenient for warmup/cooldown
    return { excellent: 0.80, good: 0.70, acceptable: 0.60, poor: 0.45 };
  }
  
  if (intervalType === 'interval' || intervalType === 'work') {
    // Stricter for intervals
    return { excellent: 0.90, good: 0.80, acceptable: 0.70, poor: 0.55 };
  }
  
  // Default thresholds
  return { excellent: 0.85, good: 0.75, acceptable: 0.65, poor: 0.50 };
}

/**
 * Identify primary issues across all intervals
 */
function identifyPrimaryIssues(intervalAnalysis: IntervalAnalysis[]): string[] {
  const issues: string[] = [];
  
  if (intervalAnalysis.length === 0) {
    return ['No intervals analyzed'];
  }
  
  // Check for consistently too fast
  const tooFastIntervals = intervalAnalysis.filter(i => 
    i.average_value < i.prescribed_range.lower && i.adherence_percentage < 0.5
  );
  if (tooFastIntervals.length > intervalAnalysis.length / 2) {
    issues.push('Consistently too fast - adjust target pace');
  }
  
  // Check for consistently too slow
  const tooSlowIntervals = intervalAnalysis.filter(i => 
    i.average_value > i.prescribed_range.upper && i.adherence_percentage < 0.5
  );
  if (tooSlowIntervals.length > intervalAnalysis.length / 2) {
    issues.push('Consistently too slow - increase target pace');
  }
  
  // Check for fading in final intervals
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work' || i.interval_type === 'interval');
  if (workIntervals.length >= 3) {
    const lastThird = workIntervals.slice(-Math.floor(workIntervals.length / 3));
    const fadingCount = lastThird.filter(i => i.adherence_percentage < 0.6).length;
    if (fadingCount > lastThird.length / 2) {
      issues.push('Fading in final intervals - consider reducing target pace');
    }
  }
  
  // Check for poor recovery
  const recoveryIntervals = intervalAnalysis.filter(i => i.interval_type === 'recovery');
  if (recoveryIntervals.length > 0) {
    const avgRecoveryAdherence = recoveryIntervals.reduce((sum, i) => sum + i.adherence_percentage, 0) / recoveryIntervals.length;
    if (avgRecoveryAdherence < 0.5) {
      issues.push('Poor recovery discipline - slow down during recovery periods');
    }
  }
  
  return issues;
}

/**
 * Identify strengths in execution
 */
function identifyStrengths(intervalAnalysis: IntervalAnalysis[]): string[] {
  const strengths: string[] = [];
  
  if (intervalAnalysis.length === 0) {
    return [];
  }
  
  // Check for excellent overall adherence
  const excellentIntervals = intervalAnalysis.filter(i => i.adherence_percentage >= 0.9);
  if (excellentIntervals.length > intervalAnalysis.length / 2) {
    strengths.push('Excellent adherence to prescribed ranges');
  }
  
  // Check for strong finish
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work' || i.interval_type === 'interval');
  if (workIntervals.length >= 3) {
    const lastThird = workIntervals.slice(-Math.floor(workIntervals.length / 3));
    const strongFinishCount = lastThird.filter(i => i.adherence_percentage >= 0.8).length;
    if (strongFinishCount > lastThird.length / 2) {
      strengths.push('Strong finish - maintained pace through final intervals');
    }
  }
  
  // Check for consistent pacing
  const consistentIntervals = intervalAnalysis.filter(i => i.range_consistency < 0.1);
  if (consistentIntervals.length > intervalAnalysis.length / 2) {
    strengths.push('Consistent pacing within intervals');
  }
  
  return strengths;
}