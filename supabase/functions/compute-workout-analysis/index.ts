// Supabase Edge Function: compute-workout-analysis
// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { normalizeSamples } from '../../lib/analysis/sensor-data/extractor.ts';

const ANALYSIS_VERSION = 'v0.1.8'; // elevation + NP + swim pace (no sample timeout)

// =============================================================================
// RUNNING TOKEN PARSER (INLINE IMPLEMENTATION)
// =============================================================================

interface ParsedRunStructure {
  segments: RunSegment[];
}

interface RunSegment {
  type: 'warmup' | 'work' | 'rest' | 'cooldown';
  duration?: number;        // seconds
  distance?: number;        // meters
  target_pace?: {
    target: number;         // Target pace (seconds per mile)
    lower: number;          // Lower bound (faster)
    upper: number;          // Upper bound (slower)
    tolerance: number;      // e.g., 0.05 for 5%
  };
  reps?: number;            // For intervals
}

interface UserBaselines {
  fiveK_pace?: number;      // seconds per mile
  easyPace?: number;        // seconds per mile
  tenK_pace?: number;       // seconds per mile
  marathon_pace?: number;   // seconds per mile
}

function parseRunningTokens(
  steps_preset: string[],
  baselines: UserBaselines
): ParsedRunStructure {
  console.log('🏃 Parsing running tokens:', steps_preset);
  console.log('📊 User baselines:', baselines);
  
  const segments: RunSegment[] = [];
  
  for (const token of steps_preset) {
    try {
      const parsedSegments = parseToken(token, baselines);
      segments.push(...parsedSegments);
    } catch (error) {
      console.warn(`⚠️ Failed to parse token: ${token}`, error);
      // Continue parsing other tokens instead of crashing
    }
  }
  
  console.log('✅ Parsed segments:', segments.length);
  return { segments };
}

function parseToken(token: string, baselines: UserBaselines): RunSegment[] {
  const segments: RunSegment[] = [];
  
  // Warmup patterns
  if (token.includes('warmup_run')) {
    const segment = parseWarmupToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  // Cooldown patterns
  else if (token.includes('cooldown')) {
    const segment = parseCooldownToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  // Interval patterns
  else if (token.includes('interval_')) {
    const intervalSegments = parseIntervalToken(token, baselines);
    segments.push(...intervalSegments);
  }
  
  // Tempo patterns
  else if (token.includes('tempo_')) {
    const segment = parseTempoToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  // Long run patterns
  else if (token.includes('longrun_')) {
    const segment = parseLongRunToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  // Easy run patterns
  else if (token.includes('run_easy_')) {
    const segment = parseEasyRunToken(token, baselines);
    if (segment) segments.push(segment);
  }
  
  else {
    console.warn(`⚠️ Unknown token pattern: ${token}`);
  }
  
  return segments;
}

function parseWarmupToken(token: string, baselines: UserBaselines): RunSegment | null {
  const durationMatch = token.match(/(\d+)min/);
  if (!durationMatch) {
    console.warn(`⚠️ Could not parse warmup duration from: ${token}`);
    return null;
  }
  
  const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
  const targetPace = baselines.easyPace || 540; // Default 9:00/mi if no baseline
  const tolerance = 0.10;
  
  return {
    type: 'warmup',
    duration,
    target_pace: {
      target: targetPace,
      lower: Math.round(targetPace * (1 - tolerance)),
      upper: Math.round(targetPace * (1 + tolerance)),
      tolerance
    }
  };
}

function parseCooldownToken(token: string, baselines: UserBaselines): RunSegment | null {
  const durationMatch = token.match(/(\d+)min/);
  if (!durationMatch) {
    console.warn(`⚠️ Could not parse cooldown duration from: ${token}`);
    return null;
  }
  
  const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
  const targetPace = baselines.easyPace || 540; // Default 9:00/mi if no baseline
  const tolerance = 0.10;
  
  return {
    type: 'cooldown',
    duration,
    target_pace: {
      target: targetPace,
      lower: Math.round(targetPace * (1 - tolerance)),
      upper: Math.round(targetPace * (1 + tolerance)),
      tolerance
    }
  };
}

function parseIntervalToken(token: string, baselines: UserBaselines): RunSegment[] {
  const segments: RunSegment[] = [];
  
  // Parse: interval_6x800m_5kpace_r90s
  const intervalMatch = token.match(/interval_(\d+)x(\d+)m_(\w+)_[rR](\d+)([sm]?)/);
  if (!intervalMatch) {
    console.warn(`⚠️ Could not parse interval token: ${token}`);
    return segments;
  }
  
  const reps = parseInt(intervalMatch[1]);
  const distance = parseInt(intervalMatch[2]); // meters
  const paceRef = intervalMatch[3];
  const restDuration = parseInt(intervalMatch[4]);
  const restUnit = intervalMatch[5] || 's'; // Default to seconds
  
  // Convert rest duration to seconds
  const restSeconds = restUnit === 'm' ? restDuration * 60 : restDuration;
  
  // Look up target pace
  const targetPace = getPaceFromReference(paceRef, baselines);
  if (!targetPace) {
    console.warn(`⚠️ Could not find pace reference: ${paceRef}`);
    return segments;
  }
  
  // Quality work gets 5% tolerance
  const tolerance = 0.05;
  
  // Create work and rest segments for each rep
  for (let i = 0; i < reps; i++) {
    // Work segment
    segments.push({
      type: 'work',
      distance,
      target_pace: {
        target: targetPace,
        lower: Math.round(targetPace * (1 - tolerance)),
        upper: Math.round(targetPace * (1 + tolerance)),
        tolerance
      }
    });
    
    // Rest segment (except after last rep)
    if (i < reps - 1) {
      segments.push({
        type: 'rest',
        duration: restSeconds
      });
    }
  }
  
  return segments;
}

function parseTempoToken(token: string, baselines: UserBaselines): RunSegment | null {
  // Parse duration-based tempo: tempo_30min_5kpace_plus0:50
  const durationMatch = token.match(/tempo_(\d+)min_(\w+)_plus(\d+):(\d+)/);
  if (durationMatch) {
    const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
    const paceRef = durationMatch[2];
    const plusMinutes = parseInt(durationMatch[3]);
    const plusSeconds = parseInt(durationMatch[4]);
    const plusTotal = plusMinutes * 60 + plusSeconds; // Total seconds to add
    
    const basePace = getPaceFromReference(paceRef, baselines);
    if (!basePace) {
      console.warn(`⚠️ Could not find pace reference: ${paceRef}`);
      return null;
    }
    
    const targetPace = basePace + plusTotal;
    const tolerance = 0.05; // 5% for tempo work
    
    return {
      type: 'work',
      duration,
      target_pace: {
        target: targetPace,
        lower: Math.round(targetPace * (1 - tolerance)),
        upper: Math.round(targetPace * (1 + tolerance)),
        tolerance
      }
    };
  }
  
  console.warn(`⚠️ Could not parse tempo token: ${token}`);
  return null;
}

function parseLongRunToken(token: string, baselines: UserBaselines): RunSegment | null {
  const durationMatch = token.match(/longrun_(\d+)min_(\w+)/);
  if (!durationMatch) {
    console.warn(`⚠️ Could not parse long run duration from: ${token}`);
    return null;
  }
  
  const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
  const paceRef = durationMatch[2];
  
  const targetPace = getPaceFromReference(paceRef, baselines);
  if (!targetPace) {
    console.warn(`⚠️ Could not find pace reference: ${paceRef}`);
    return null;
  }
  
  // Long runs get 10% tolerance (easier than intervals)
  const tolerance = 0.10;
  
  return {
    type: 'work',
    duration,
    target_pace: {
      target: targetPace,
      lower: Math.round(targetPace * (1 - tolerance)),
      upper: Math.round(targetPace * (1 + tolerance)),
      tolerance
    }
  };
}

function parseEasyRunToken(token: string, baselines: UserBaselines): RunSegment | null {
  const durationMatch = token.match(/run_easy_(\d+)min/);
  if (!durationMatch) {
    console.warn(`⚠️ Could not parse easy run duration from: ${token}`);
    return null;
  }
  
  const duration = parseInt(durationMatch[1]) * 60; // Convert to seconds
  const targetPace = baselines.easyPace || 540; // Default 9:00/mi if no baseline
  const tolerance = 0.10;
  
  return {
    type: 'work',
    duration,
    target_pace: {
      target: targetPace,
      lower: Math.round(targetPace * (1 - tolerance)),
      upper: Math.round(targetPace * (1 + tolerance)),
      tolerance
    }
  };
}

function getPaceFromReference(paceRef: string, baselines: UserBaselines): number | null {
  switch (paceRef) {
    case '5kpace':
      return baselines.fiveK_pace || null;
    case 'easypace':
      return baselines.easyPace || null;
    case '10kpace':
      return baselines.tenK_pace || null;
    case 'marathon_pace':
      return baselines.marathon_pace || null;
    default:
      console.warn(`⚠️ Unknown pace reference: ${paceRef}`);
      return null;
  }
}

function smoothEMA(values: (number|null)[], alpha = 0.25): (number|null)[] {
  let ema: number | null = null;
  const out: (number|null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      ema = ema == null ? v : alpha * v + (1 - alpha) * ema;
      out[i] = ema;
    } else {
      out[i] = ema; // hold last for continuity; UI can still smooth further
    }
  }
  return out;
}

// =============================================================================
// POWER CURVE CALCULATION (Peak Performance Tracking)
// =============================================================================
// Calculates best average power for various durations (5s, 1min, 5min, 20min, 60min)
// Used for tracking fitness improvements and comparing peak efforts over time

interface PowerCurve {
  '5s'?: number;
  '1min'?: number;
  '5min'?: number;
  '20min'?: number;
  '60min'?: number;
}

interface BestEfforts {
  '1mi'?: { pace_s_per_mi: number; duration_s: number; avg_hr?: number };
  '5k'?: { pace_s_per_mi: number; duration_s: number; avg_hr?: number };
  '10k'?: { pace_s_per_mi: number; duration_s: number; avg_hr?: number };
}

/**
 * Calculate rolling max average power for a given window size
 * Returns the best average power over any contiguous window of that duration
 */
function rollingMaxAverage(data: (number | null)[], windowSize: number): number | null {
  // Filter to valid power values with their indices
  const validPower: { idx: number; val: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v !== null && Number.isFinite(v) && v > 0) {
      validPower.push({ idx: i, val: v });
    }
  }
  
  if (validPower.length < windowSize) return null;
  
  // Simple approach: slide window through valid samples
  // Note: This assumes ~1 sample per second (typical for power meters)
  let maxAvg = 0;
  let windowSum = 0;
  
  // Initialize window
  for (let i = 0; i < windowSize; i++) {
    windowSum += validPower[i].val;
  }
  maxAvg = windowSum / windowSize;
  
  // Slide window
  for (let i = windowSize; i < validPower.length; i++) {
    windowSum += validPower[i].val - validPower[i - windowSize].val;
    const avg = windowSum / windowSize;
    if (avg > maxAvg) maxAvg = avg;
  }
  
  return Math.round(maxAvg);
}

/**
 * Calculate power curve for a cycling workout
 * Returns best power at key durations for fitness tracking
 */
function calculatePowerCurve(powerData: (number | null)[]): PowerCurve | null {
  const validCount = powerData.filter(p => p !== null && Number.isFinite(p) && p > 0).length;
  
  // Need at least 60 seconds of power data
  if (validCount < 60) {
    console.log(`⚡ Power curve: insufficient data (${validCount} samples, need 60+)`);
    return null;
  }
  
  const curve: PowerCurve = {};
  const durations: { label: keyof PowerCurve; seconds: number }[] = [
    { label: '5s', seconds: 5 },
    { label: '1min', seconds: 60 },
    { label: '5min', seconds: 300 },
    { label: '20min', seconds: 1200 },
    { label: '60min', seconds: 3600 }
  ];
  
  for (const { label, seconds } of durations) {
    if (validCount >= seconds) {
      const best = rollingMaxAverage(powerData, seconds);
      if (best !== null && best > 0) {
        curve[label] = best;
      }
    }
  }
  
  const curveLabels = Object.keys(curve).join(', ');
  console.log(`⚡ Power curve calculated: ${curveLabels || 'none'}`);
  if (Object.keys(curve).length > 0) {
    console.log(`⚡ Power curve values:`, curve);
  }
  
  return Object.keys(curve).length > 0 ? curve : null;
}

/**
 * Calculate best running efforts at standard distances
 * Finds fastest segment for each target distance
 */
function calculateBestRunEfforts(
  distanceM: number[],
  timeS: number[],
  hrBpm: (number | null)[]
): BestEfforts | null {
  if (distanceM.length < 10 || timeS.length < 10) return null;
  
  const efforts: BestEfforts = {};
  const targets: { label: keyof BestEfforts; meters: number }[] = [
    { label: '1mi', meters: 1609.34 },
    { label: '5k', meters: 5000 },
    { label: '10k', meters: 10000 }
  ];
  
  const totalDistance = distanceM[distanceM.length - 1] - distanceM[0];
  
  for (const { label, meters } of targets) {
    // Only calculate if workout covers this distance
    if (totalDistance < meters * 0.95) continue;
    
    let bestPace = Infinity;
    let bestDuration = 0;
    let bestAvgHr: number | undefined;
    
    // Slide window to find fastest segment of this distance
    let startIdx = 0;
    for (let endIdx = 1; endIdx < distanceM.length; endIdx++) {
      const segmentDist = distanceM[endIdx] - distanceM[startIdx];
      
      // Move start forward until segment is close to target
      while (segmentDist > meters * 1.02 && startIdx < endIdx - 1) {
        startIdx++;
      }
      
      // Check if we have a valid segment
      if (segmentDist >= meters * 0.98 && segmentDist <= meters * 1.02) {
        const segmentTime = timeS[endIdx] - timeS[startIdx];
        const pacePerMile = (segmentTime / segmentDist) * 1609.34;
        
        if (pacePerMile < bestPace && pacePerMile > 180) { // Sanity: faster than 3:00/mi
          bestPace = pacePerMile;
          bestDuration = segmentTime;
          
          // Calculate avg HR for this segment
          const hrSegment = hrBpm.slice(startIdx, endIdx + 1).filter((h): h is number => h !== null && Number.isFinite(h));
          if (hrSegment.length > 0) {
            bestAvgHr = Math.round(hrSegment.reduce((a, b) => a + b, 0) / hrSegment.length);
          }
        }
      }
    }
    
    if (bestPace < Infinity) {
      efforts[label] = {
        pace_s_per_mi: Math.round(bestPace),
        duration_s: Math.round(bestDuration),
        avg_hr: bestAvgHr
      };
    }
  }
  
  const effortLabels = Object.keys(efforts).join(', ');
  console.log(`🏃 Best efforts calculated: ${effortLabels || 'none'}`);
  
  return Object.keys(efforts).length > 0 ? efforts : null;
}

// =============================================================================
// GRANULAR ADHERENCE ANALYSIS FUNCTIONS
// =============================================================================

interface PrescribedRange {
  lower: number;
  upper: number;
}

interface PlannedInterval {
  type: string;
  duration_s: number;
  pace_range?: PrescribedRange;
  power_range?: PrescribedRange;
}

interface ExecutedInterval {
  start_time_s: number;
  end_time_s: number;
  samples: Array<{
    time_s: number;
    pace_s_per_km?: number;
    power_w?: number;
    hr_bpm?: number;
  }>;
}

interface IntervalAnalysis {
  interval_type: string;
  prescribed_range: PrescribedRange;
  average_value: number;
  adherence_percentage: number;
  time_in_range_s: number;
  time_outside_range_s: number;
  issues: string[];
  performance_assessment: string;
}

interface PrescribedRangeAdherence {
  overallAdherence: number;
  timeInRange: number;
  timeOutsideRange: number;
  intervalAnalysis: IntervalAnalysis[];
  executionGrade: string;
  primaryIssues: string[];
  strengths: string[];
}

function calculatePrescribedRangeAdherence(
  executedIntervals: ExecutedInterval[],
  plannedIntervals: PlannedInterval[],
  overallMetrics: any
): PrescribedRangeAdherence {
  console.log('🔍 Starting granular adherence analysis...');
  console.log('📊 Executed intervals:', executedIntervals.length);
  console.log('📋 Planned intervals:', plannedIntervals.length);

  let totalTimeInRange = 0;
  let totalTimeOutsideRange = 0;
  const intervalAnalysis: IntervalAnalysis[] = [];

  // Process each planned interval
  for (let i = 0; i < plannedIntervals.length; i++) {
    const planned = plannedIntervals[i];
    const executed = executedIntervals[i];

    if (!executed || !planned) {
      console.log(`⚠️ Skipping interval ${i} - missing data`);
      continue;
    }

    // Determine which metric to analyze (pace or power)
    const prescribedRange = planned.pace_range || planned.power_range;
    if (!prescribedRange) {
      console.log(`⚠️ Skipping interval ${i} - no prescribed range`);
      continue;
    }

    const metricType = planned.pace_range ? 'pace' : 'power';
    console.log(`📈 Analyzing interval ${i} (${planned.type}) - ${metricType} range: ${prescribedRange.lower}-${prescribedRange.upper}`);

    // Calculate adherence for this interval
    const intervalResult = calculateIntervalAdherence(executed, prescribedRange, metricType);
    
    intervalAnalysis.push({
      interval_type: planned.type,
      prescribed_range: prescribedRange,
      average_value: intervalResult.averageValue,
      adherence_percentage: intervalResult.adherencePercentage,
      time_in_range_s: intervalResult.timeInRange,
      time_outside_range_s: intervalResult.timeOutsideRange,
      issues: intervalResult.issues,
      performance_assessment: intervalResult.performanceAssessment
    });

    totalTimeInRange += intervalResult.timeInRange;
    totalTimeOutsideRange += intervalResult.timeOutsideRange;

    console.log(`✅ Interval ${i} complete: ${intervalResult.adherencePercentage.toFixed(1)}% adherence, assessment: ${intervalResult.performanceAssessment}`);
  }

  const totalTime = totalTimeInRange + totalTimeOutsideRange;
  const overallAdherence = totalTime > 0 ? totalTimeInRange / totalTime : 0;

  console.log('📊 Overall adherence calculation:', {
    timeInRange: totalTimeInRange,
    timeOutsideRange: totalTimeOutsideRange,
    totalTime,
    adherence: overallAdherence
  });

  return {
    overallAdherence,
    timeInRange: totalTimeInRange,
    timeOutsideRange: totalTimeOutsideRange,
    intervalAnalysis,
    executionGrade: calculateHonestGrade(overallAdherence),
    primaryIssues: identifyPrimaryIssues(intervalAnalysis),
    strengths: identifyStrengths(intervalAnalysis)
  };
}

function calculateIntervalAdherence(
  executed: ExecutedInterval,
  prescribedRange: PrescribedRange,
  metricType: 'pace' | 'power'
): {
  averageValue: number;
  adherencePercentage: number;
  timeInRange: number;
  timeOutsideRange: number;
  issues: string[];
  performanceAssessment: string;
} {
  let timeInRange = 0;
  let timeOutsideRange = 0;
  let totalValue = 0;
  let validSamples = 0;

  const samples = executed.samples || [];
  console.log(`🔍 Processing ${samples.length} samples for interval`);

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const value = metricType === 'pace' ? sample.pace_s_per_km : sample.power_w;
    
    if (value === undefined || value === null) continue;

    // Convert pace to seconds per km if needed (assuming input is in seconds per mile)
    const normalizedValue = metricType === 'pace' ? value * 1.60934 : value;
    
    // Check if value is realistic
    if (metricType === 'pace' && (normalizedValue < 180 || normalizedValue > 1200)) {
      console.log(`⚠️ Skipping unrealistic pace: ${normalizedValue}s/km`);
      continue;
    }
    if (metricType === 'power' && (normalizedValue < 50 || normalizedValue > 1000)) {
      console.log(`⚠️ Skipping unrealistic power: ${normalizedValue}W`);
      continue;
    }

    totalValue += normalizedValue;
    validSamples++;

    // Calculate sample duration
    const nextSample = samples[i + 1];
    const sampleDuration = nextSample ? 
      Math.min(nextSample.time_s - sample.time_s, 10) : // Cap at 10 seconds
      1; // Default 1 second for last sample

    // Check if value is in prescribed range
    const isInRange = normalizedValue >= prescribedRange.lower && normalizedValue <= prescribedRange.upper;
    
    if (isInRange) {
      timeInRange += sampleDuration;
    } else {
      timeOutsideRange += sampleDuration;
    }
  }

  const averageValue = validSamples > 0 ? totalValue / validSamples : 0;
  const totalTime = timeInRange + timeOutsideRange;
  const adherencePercentage = totalTime > 0 ? timeInRange / totalTime : 0;

  const issues = identifyIntervalIssues(adherencePercentage, averageValue, prescribedRange, metricType);
  const performanceAssessment = getPerformanceAssessment(adherencePercentage, executed);

  return {
    averageValue,
    adherencePercentage,
    timeInRange,
    timeOutsideRange,
    issues,
    performanceAssessment
  };
}

function getPerformanceAssessment(adherence: number, executed: ExecutedInterval): string {
  const percentage = Math.round(adherence * 100);
  
  // Determine interval type from executed data
  const intervalType = executed.interval_type || 'unknown';
  
  if (intervalType === 'warmup' || intervalType === 'cooldown') {
    // More lenient for warmup/cooldown
    if (adherence >= 0.80) return 'Excellent';
    if (adherence >= 0.70) return 'Good';
    if (adherence >= 0.60) return 'Fair';
    if (adherence >= 0.45) return 'Poor';
    return 'Very Poor';
  }
  
  if (intervalType === 'interval' || intervalType === 'work') {
    // Stricter for intervals
    if (adherence >= 0.90) return 'Excellent';
    if (adherence >= 0.80) return 'Good';
    if (adherence >= 0.70) return 'Fair';
    if (adherence >= 0.55) return 'Poor';
    return 'Very Poor';
  }
  
  // Default thresholds
  if (adherence >= 0.85) return 'Excellent';
  if (adherence >= 0.75) return 'Good';
  if (adherence >= 0.65) return 'Fair';
  if (adherence >= 0.50) return 'Poor';
  return 'Very Poor';
}

function identifyIntervalIssues(
  adherence: number,
  averageValue: number,
  prescribedRange: PrescribedRange,
  metricType: 'pace' | 'power'
): string[] {
  const issues: string[] = [];
  
  if (adherence < 0.5) {
    issues.push('very_poor_adherence');
  } else if (adherence < 0.7) {
    issues.push('poor_adherence');
  }

  if (averageValue < prescribedRange.lower) {
    issues.push(metricType === 'pace' ? 'too_fast' : 'too_high_power');
  } else if (averageValue > prescribedRange.upper) {
    issues.push(metricType === 'pace' ? 'too_slow' : 'too_low_power');
  }

  return issues;
}

function calculateIntervalGrade(adherence: number, executed: ExecutedInterval): string {
  if (adherence >= 0.9) return 'A';
  if (adherence >= 0.8) return 'B';
  if (adherence >= 0.7) return 'C';
  if (adherence >= 0.6) return 'D';
  return 'F';
}

function calculateHonestGrade(overallAdherence: number): string {
  if (overallAdherence >= 0.9) return 'A';
  if (overallAdherence >= 0.8) return 'B';
  if (overallAdherence >= 0.7) return 'C';
  if (overallAdherence >= 0.6) return 'D';
  return 'F';
}

function identifyPrimaryIssues(intervalAnalysis: IntervalAnalysis[]): string[] {
  const issues: string[] = [];
  
  // Check for consistently too fast
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work');
  const tooFastCount = workIntervals.filter(i => i.issues.includes('too_fast')).length;
  if (tooFastCount > workIntervals.length / 2) {
    issues.push('Consistently too fast in work intervals');
  }

  // Check for fading
  const lastThird = workIntervals.slice(-Math.floor(workIntervals.length / 3));
  const fadingCount = lastThird.filter(i => i.adherence_percentage < 0.7).length;
  if (fadingCount > lastThird.length / 2) {
    issues.push('Fading in final intervals - consider reducing target pace');
  }

  // Check for poor recovery
  const recoveryIntervals = intervalAnalysis.filter(i => i.interval_type === 'recovery');
  const poorRecoveryCount = recoveryIntervals.filter(i => i.adherence_percentage < 0.6).length;
  if (poorRecoveryCount > recoveryIntervals.length / 2) {
    issues.push('Poor recovery discipline - not slowing down enough');
  }

  return issues;
}

function identifyStrengths(intervalAnalysis: IntervalAnalysis[]): string[] {
  const strengths: string[] = [];
  
  // Check for strong finish
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work');
  const lastInterval = workIntervals[workIntervals.length - 1];
  if (lastInterval && lastInterval.adherence_percentage >= 0.8) {
    strengths.push('Strong finish - maintained pace through final interval');
  }

  // Check for consistent execution
  const consistentIntervals = workIntervals.filter(i => i.adherence_percentage >= 0.8).length;
  if (consistentIntervals >= workIntervals.length * 0.8) {
    strengths.push('Excellent consistency across all work intervals');
  }

  // Check for good recovery discipline
  const recoveryIntervals = intervalAnalysis.filter(i => i.interval_type === 'recovery');
  const goodRecoveryCount = recoveryIntervals.filter(i => i.adherence_percentage >= 0.7).length;
  if (goodRecoveryCount >= recoveryIntervals.length * 0.8) {
    strengths.push('Good recovery discipline - properly slowed down between intervals');
  }

  return strengths;
}

function parseTimeToSeconds(timeStr: string): number {
  // Parse time strings like "15:00", "1:30", "45" (seconds)
  if (!timeStr) return 300; // Default 5 minutes
  
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    // Format: "15:00" (minutes:seconds)
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 1) {
    // Format: "45" (seconds) or "15" (minutes)
    const num = parseInt(parts[0]);
    return num > 60 ? num : num * 60; // Assume minutes if > 60
  }
  
  return 300; // Default 5 minutes
}

// Long run analysis for pace consistency, negative splits, and drift
function analyzeLongRun(computed: any, plannedInterval: any) {
  console.log('🏃 Analyzing long run...');
  
  const intervals = computed.analysis?.intervals || [];
  if (intervals.length === 0) {
    return {
      paceConsistency: 0,
      timeInRange: 0,
      timeOutsideRange: 0,
      segments: [],
      performance_assessment: 'Very Poor',
      issues: ['No interval data available'],
      strengths: []
    };
  }
  
  // Extract pace data from intervals
  const paceData = intervals.map((interval: any) => ({
    time: interval.start_time || 0,
    pace: interval.avg_pace || 0,
    duration: interval.duration || 0
  })).filter(d => d.pace > 0);
  
  if (paceData.length === 0) {
    return {
      paceConsistency: 0,
      timeInRange: 0,
      timeOutsideRange: 0,
      segments: [],
      performance_assessment: 'Very Poor',
      issues: ['No pace data available'],
      strengths: []
    };
  }
  
  // Calculate pace statistics
  const paces = paceData.map(d => d.pace);
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
  const paceStdDev = Math.sqrt(paces.reduce((sum, pace) => sum + Math.pow(pace - avgPace, 2), 0) / paces.length);
  const paceCV = paceStdDev / avgPace; // Coefficient of variation
  
  // Calculate pace consistency (inverse of CV - lower CV = higher consistency)
  const paceConsistency = Math.max(0, Math.min(1, 1 - paceCV * 2)); // Scale CV to 0-1
  
  // Analyze segments (first 25%, middle 50%, final 25%)
  const totalDuration = paceData.reduce((sum, d) => sum + d.duration, 0);
  const first25Duration = totalDuration * 0.25;
  const middle50Duration = totalDuration * 0.5;
  const final25Duration = totalDuration * 0.25;
  
  let first25Pace = 0, middle50Pace = 0, final25Pace = 0;
  let first25Time = 0, middle50Time = 0, final25Time = 0;
  
  let currentTime = 0;
  for (const segment of paceData) {
    if (currentTime < first25Duration) {
      const segmentTime = Math.min(segment.duration, first25Duration - currentTime);
      first25Pace += segment.pace * segmentTime;
      first25Time += segmentTime;
    } else if (currentTime < first25Duration + middle50Duration) {
      const segmentTime = Math.min(segment.duration, first25Duration + middle50Duration - currentTime);
      middle50Pace += segment.pace * segmentTime;
      middle50Time += segmentTime;
    } else {
      const segmentTime = segment.duration;
      final25Pace += segment.pace * segmentTime;
      final25Time += segmentTime;
    }
    currentTime += segment.duration;
  }
  
  first25Pace = first25Time > 0 ? first25Pace / first25Time : avgPace;
  middle50Pace = middle50Time > 0 ? middle50Pace / middle50Time : avgPace;
  final25Pace = final25Time > 0 ? final25Pace / final25Time : avgPace;
  
  // Calculate negative split (second half faster than first half)
  const firstHalfPace = (first25Pace + middle50Pace) / 2;
  const secondHalfPace = (middle50Pace + final25Pace) / 2;
  const negativeSplit = secondHalfPace < firstHalfPace;
  const splitDifference = Math.abs(secondHalfPace - firstHalfPace) / firstHalfPace;
  
  // Calculate pace drift (final 25% vs middle 50%)
  const paceDrift = (final25Pace - middle50Pace) / middle50Pace;
  const significantDrift = Math.abs(paceDrift) > 0.05; // 5% threshold
  
  // Generate issues and strengths
  const issues: string[] = [];
  const strengths: string[] = [];
  
  if (paceCV > 0.05) {
    issues.push('Pace variability too high - work on steady pacing');
  }
  
  if (paceDrift > 0.05) {
    issues.push('Pace drift detected - consider starting slower');
  } else if (paceDrift < -0.05) {
    issues.push('Significant pace fade - may have started too fast');
  }
  
  if (paceConsistency >= 0.9) {
    strengths.push('Excellent pace consistency throughout');
  }
  
  if (negativeSplit && splitDifference > 0.02) {
    strengths.push('Strong negative split - great pacing discipline');
  }
  
  if (paceCV < 0.03) {
    strengths.push('Very steady pacing - excellent aerobic control');
  }
  
  // Calculate grade based on consistency and execution
  let performanceAssessment = 'Very Poor';
  if (paceConsistency >= 0.9 && !significantDrift) {
    performanceAssessment = 'Excellent';
  } else if (paceConsistency >= 0.8 && paceDrift < 0.1) {
    performanceAssessment = 'Good';
  } else if (paceConsistency >= 0.7) {
    performanceAssessment = 'Fair';
  } else if (paceConsistency >= 0.6) {
    performanceAssessment = 'Poor';
  }
  
  // Create segment breakdown
  const segments = [
    {
      segment: 'First 25%',
      pace: first25Pace,
      duration: first25Time,
      performance_assessment: first25Pace <= avgPace * 1.05 ? 'Excellent' : 'Good'
    },
    {
      segment: 'Middle 50%',
      pace: middle50Pace,
      duration: middle50Time,
      performance_assessment: Math.abs(middle50Pace - avgPace) / avgPace < 0.03 ? 'Excellent' : 'Good'
    },
    {
      segment: 'Final 25%',
      pace: final25Pace,
      duration: final25Time,
      performance_assessment: final25Pace <= avgPace * 1.1 ? 'Excellent' : 'Good'
    }
  ];
  
  return {
    paceConsistency,
    timeInRange: totalDuration * paceConsistency,
    timeOutsideRange: totalDuration * (1 - paceConsistency),
    segments,
    performance_assessment: performanceAssessment,
    issues,
    strengths,
    paceCV,
    negativeSplit,
    paceDrift
  };
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const { workout_id } = await req.json();
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id required' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // Load workout essentials
    const { data: w, error: wErr } = await supabase
      .from('workouts')
      .select('id, user_id, type, source, strava_activity_id, garmin_activity_id, gps_track, sensor_data, laps, computed, date, timestamp, swim_data, pool_length, number_of_active_lengths, distance, moving_time, planned_id')
      .eq('id', workout_id)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!w) return new Response(JSON.stringify({ error: 'workout not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    const sport = String(w.type || 'run').toLowerCase();
    
    // Fetch user FTP from performance_numbers JSONB for cycling metrics
    let userFtp: number | null = null;
    try {
      if (w.user_id) {
        const { data: baseline } = await supabase
          .from('user_baselines')
          .select('performance_numbers')
          .eq('user_id', w.user_id)
          .maybeSingle();
        console.log('[FTP] Baseline data:', baseline);
        if (baseline?.performance_numbers) {
          const perfNumbers = typeof baseline.performance_numbers === 'string' 
            ? JSON.parse(baseline.performance_numbers) 
            : baseline.performance_numbers;
          console.log('[FTP] Parsed performance_numbers:', perfNumbers);
          if (perfNumbers?.ftp) {
            userFtp = Number(perfNumbers.ftp);
            console.log('[FTP] Extracted FTP:', userFtp);
          }
        }
      }
    } catch (e) {
      console.error('[FTP] Error fetching FTP:', e);
    }

    // Parse JSON columns if stringified
    function parseJson(val: any) {
      if (val == null) return null;
      try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return val; }
    }
    let gps = parseJson(w.gps_track) || [];
    let sensorRaw = parseJson(w.sensor_data) || [];
    let sensor = Array.isArray(sensorRaw?.samples) ? sensorRaw.samples : (Array.isArray(sensorRaw) ? sensorRaw : []);
    const laps = parseJson(w.laps) || [];

    // Minimal provider provenance for envelope
    const input = {
      provider: (w.source || '').toLowerCase() || null,
      sourceIds: {
        garminActivityId: w.garmin_activity_id || null,
        stravaActivityId: w.strava_activity_id || null,
      },
      units: { distance: 'm', elevation: 'm', speed: 'mps', pace: 's_per_km', hr: 'bpm', power: 'w' }
    };

    // Load Garmin row for fallback/date correction when available
    let ga: any = null;
    try {
      if ((w as any)?.garmin_activity_id && (w as any)?.user_id) {
        const { data } = await supabase
          .from('garmin_activities')
          .select('sensor_data,samples_data,gps_track,start_time,start_time_offset_seconds,raw_data')
          .eq('user_id', (w as any).user_id)
          .eq('garmin_activity_id', (w as any).garmin_activity_id)
          .maybeSingle();
        ga = data || null;
      }
    } catch {}

    // Correct workouts.date to provider-local date (prefer explicit local seconds if present)
    // Skip for Strava - the date is already set correctly from start_date_local in ingest-activity
    const isStrava = (w as any)?.source === 'strava' || (w as any)?.strava_activity_id;
    if (!isStrava) {
      try {
        const tsIso: string | null = (w as any)?.timestamp || null;
        let expectedLocal: string | null = null;
        if (ga) {
          // Fallback: parse from raw_data if columns are not present
          try {
            const raw = parseJson(ga.raw_data) || {};
            const gSummary = raw?.summary || raw;
            const gIn = Number(gSummary?.startTimeInSeconds ?? raw?.startTimeInSeconds);
            const gOff = Number(gSummary?.startTimeOffsetInSeconds ?? raw?.startTimeOffsetInSeconds ?? ga.start_time_offset_seconds);
            if (Number.isFinite(gIn) && Number.isFinite(gOff)) {
              expectedLocal = new Date((gIn + gOff) * 1000).toISOString().split('T')[0];
            } else if (ga.start_time && Number.isFinite(ga.start_time_offset_seconds)) {
              expectedLocal = new Date(Date.parse(ga.start_time) + Number(ga.start_time_offset_seconds) * 1000).toISOString().split('T')[0];
            }
          } catch {}
        } else if (tsIso) {
          // As a last resort, treat timestamp as local already
          try { expectedLocal = new Date(tsIso).toISOString().split('T')[0]; } catch {}
        }
        if (expectedLocal && expectedLocal !== (w as any)?.date) {
          await supabase.from('workouts').update({ date: expectedLocal }).eq('id', (w as any).id);
        }
      } catch {}
    }

    // If workouts JSON is empty, fall back to Garmin heavy JSON
    if (((sensor?.length ?? 0) < 2) && ((gps?.length ?? 0) < 2) && ga) {
      const sRaw = parseJson(ga.sensor_data) || parseJson(ga.samples_data) || [];
      sensor = Array.isArray(sRaw?.samples) ? sRaw.samples : (Array.isArray(sRaw) ? sRaw : []);
      gps = parseJson(ga.gps_track) || [];
    }

  // Build minimal provider-agnostic analysis rows (time, dist, elev, hr, cadences, power, speed)
  // OLD - Replaced by shared library: supabase/lib/analysis/sensor-data/extractor.ts
  // Keeping as backup for rollback if needed
  /*
  function normalizeSamples(samplesIn: any[]): Array<{ t:number; d:number; elev?:number; hr?:number; cad_spm?:number; cad_rpm?:number; power_w?:number; v_mps?:number }> {
    const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad_spm?:number; cad_rpm?:number; power_w?:number; v_mps?:number }> = [];
      for (let i=0;i<samplesIn.length;i+=1) {
        const s = samplesIn[i] || {} as any;
        const t = Number(
          s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.elapsed_s ?? s.offsetInSeconds ?? s.startTimeInSeconds ?? i
        );
        const d = Number(
          s.totalDistanceInMeters ?? s.distanceInMeters ?? s.cumulativeDistanceInMeters ?? s.totalDistance ?? s.distance
        );
        const elev = (typeof s.elevationInMeters === 'number' && s.elevationInMeters) || (typeof s.altitudeInMeters === 'number' && s.altitudeInMeters) || (typeof s.altitude === 'number' && s.altitude) || undefined;
        const hr = (typeof s.heartRate === 'number' && s.heartRate) || (typeof s.heart_rate === 'number' && s.heart_rate) || (typeof s.heartRateInBeatsPerMinute === 'number' && s.heartRateInBeatsPerMinute) || undefined;
      const cad_spm = (typeof s.stepsPerMinute === 'number' && s.stepsPerMinute) || (typeof s.runCadence === 'number' && s.runCadence) || undefined;
      // Bike cadence commonly lives in bikeCadenceInRPM/bikeCadence/cadence
      const cad_rpm = (typeof s.bikeCadenceInRPM === 'number' && s.bikeCadenceInRPM)
        || (typeof s.bikeCadence === 'number' && s.bikeCadence)
        || (typeof s.cadence === 'number' && s.cadence)
        || undefined;
      const power_w = (typeof s.power === 'number' && s.power) || (typeof s.watts === 'number' && s.watts) || undefined;
      const v_mps = (typeof s.speedMetersPerSecond === 'number' && s.speedMetersPerSecond) || (typeof s.v === 'number' && s.v) || undefined;
      out.push({ t: Number.isFinite(t)?t:i, d: Number.isFinite(d)?d:NaN, elev, hr, cad_spm, cad_rpm, power_w, v_mps });
      }
      out.sort((a,b)=>(a.t||0)-(b.t||0));
      if (!out.length) return out;
      // Fill distance if missing by integrating speed if provided, else leave NaN and fix later
      // Backfill NaNs with previous value
      let lastD = Number.isFinite(out[0].d) ? out[0].d : 0;
      out[0].d = lastD;
      for (let i=1;i<out.length;i+=1) {
        const d = out[i].d;
        if (!Number.isFinite(d) || d < lastD) {
          out[i].d = lastD; // enforce monotonic
        } else {
          lastD = d;
        }
      }
      return out;
    }
  */

    // Build rows from sensor samples; fallback to GPS if needed
    let rows = normalizeSamples(sensor);
    if (rows.length < 2 && Array.isArray(gps) && gps.length > 1) {
      // Fallback: derive time/distance from gps_track
      function haversineMeters(a:any, b:any): number {
        const lat1 = Number(a.lat ?? a.latitudeInDegree ?? a.latitude);
        const lon1 = Number(a.lng ?? a.longitudeInDegree ?? a.longitude);
        const lat2 = Number(b.lat ?? b.latitudeInDegree ?? b.latitude);
        const lon2 = Number(b.lng ?? b.longitudeInDegree ?? b.longitude);
        if (![lat1,lon1,lat2,lon2].every(Number.isFinite)) return 0;
        const R = 6371000; // m
        const dLat = (lat2-lat1) * Math.PI/180;
        const dLon = (lon2-lon1) * Math.PI/180;
        const sa = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        const c = 2*Math.atan2(Math.sqrt(sa), Math.sqrt(1-sa));
        return R*c;
      }
      const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad?:number }> = [];
      let cum = 0;
      const getTs = (p:any) => Number(p?.timestamp ?? p?.startTimeInSeconds ?? p?.ts ?? 0);
      const tStart = getTs(gps[0]) || 0;
      for (let i=0;i<gps.length;i+=1) {
        if (i>0) cum += haversineMeters(gps[i-1], gps[i]);
        const elev = (typeof gps[i]?.elevation === 'number' ? gps[i].elevation : (typeof gps[i]?.altitude === 'number' ? gps[i].altitude : undefined));
        out.push({ t: Math.max(0, getTs(gps[i]) - tStart), d: cum, elev });
      }
      rows = out;
    }
    // If distance never grows (provider didn't include distance in samples), rebuild from GPS
    if (rows.length >= 2) {
      const totalM = Math.max(0, (rows[rows.length-1].d||0) - (rows[0].d||0));
      if (totalM < 50 && Array.isArray(gps) && gps.length > 1) {
        const out: Array<{ t:number; d:number; elev?:number; hr?:number; cad?:number }> = [];
        let cum = 0; const getTs = (p:any)=>Number(p?.timestamp ?? p?.startTimeInSeconds ?? p?.ts ?? 0); const tStart = getTs(gps[0]) || 0;
        for (let i=0;i<gps.length;i+=1) {
          if (i>0) cum += ( ()=>{ const a=gps[i-1], b=gps[i]; const lat1=Number(a.lat ?? a.latitudeInDegree ?? a.latitude); const lon1=Number(a.lng ?? a.longitudeInDegree ?? a.longitude); const lat2=Number(b.lat ?? b.latitudeInDegree ?? b.latitude); const lon2=Number(b.lng ?? b.longitudeInDegree ?? b.longitude); if (![lat1,lon1,lat2,lon2].every(Number.isFinite)) return 0; const R=6371000; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180; const sa=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2; const c=2*Math.atan2(Math.sqrt(sa), Math.sqrt(1-sa)); return R*c; })();
          const elev = (typeof gps[i]?.elevation === 'number' ? gps[i].elevation : (typeof gps[i]?.altitude === 'number' ? gps[i].altitude : undefined));
          out.push({ t: Math.max(0, getTs(gps[i]) - tStart), d: cum, elev });
        }
        rows = out;
      }
    }
    // ELEVATION FIX: Merge elevation from GPS into sensor-based rows
    // Sensor data often lacks elevation, but GPS track has it
    if (rows.length >= 2 && Array.isArray(gps) && gps.length > 1) {
      const getTs = (p:any) => Number(p?.timestamp ?? p?.startTimeInSeconds ?? p?.ts ?? 0);
      const tStart = getTs(gps[0]) || 0;
      
      // Build GPS elevation lookup by timestamp
      const gpsElevByTime = new Map<number, number>();
      for (const g of gps) {
        const t = Math.max(0, getTs(g) - tStart);
        const elev = (typeof g?.elevation === 'number' ? g.elevation : (typeof g?.altitude === 'number' ? g.altitude : undefined));
        if (typeof elev === 'number') {
          gpsElevByTime.set(t, elev);
        }
      }
      
      // Merge elevation into rows by closest timestamp match
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].elev == null) {
          const t = rows[i].t || 0;
          // Find closest GPS timestamp
          let closest = gpsElevByTime.get(t);
          if (closest == null) {
            // Search within ±2 seconds
            for (let dt = 1; dt <= 2 && closest == null; dt++) {
              closest = gpsElevByTime.get(t + dt) ?? gpsElevByTime.get(t - dt);
            }
          }
          if (closest != null) rows[i].elev = closest;
        }
      }
    }
    const hasRows = rows.length >= 2;
    const d0 = hasRows ? (rows[0].d || 0) : 0;
    const t0 = hasRows ? (rows[0].t || 0) : 0;

    // Series
    const time_s: number[] = [];
    const distance_m: number[] = [];
    const elevation_m: (number|null)[] = [];
  const pace_s_per_km: (number|null)[] = [];
    const hr_bpm: (number|null)[] = [];
  const cadence_spm: (number|null)[] = [];
  const cadence_rpm: (number|null)[] = [];
  const power_watts: (number|null)[] = [];
  const speed_mps: (number|null)[] = [];
  const grade_percent: (number|null)[] = [];
    if (hasRows) {
      for (let i=0;i<rows.length;i+=1) {
        const r = rows[i];
        time_s.push(Math.max(0, (r.t||0) - t0));
        distance_m.push(Math.max(0, (r.d||0) - d0));
        elevation_m.push(typeof r.elev === 'number' ? r.elev : null);
        hr_bpm.push(typeof r.hr === 'number' ? r.hr : null);
      cadence_spm.push(typeof r.cad_spm === 'number' ? r.cad_spm : null);
      cadence_rpm.push(typeof r.cad_rpm === 'number' ? r.cad_rpm : null);
      power_watts.push(typeof r.power_w === 'number' ? r.power_w : null);
        if (i>0) {
          const dt = Math.max(0, (rows[i].t||0) - (rows[i-1].t||0));
          const dd = Math.max(0, (rows[i].d||0) - (rows[i-1].d||0));
          const MIN_DD = 2.5; // meters
          if (dt > 0 && dd > MIN_DD) {
            pace_s_per_km.push(dt / (dd / 1000));
          speed_mps.push(dd / dt);
          const de = (typeof rows[i].elev === 'number' ? rows[i].elev : (typeof elevation_m[i] === 'number' ? (elevation_m[i] as number) : null))
                   - (typeof rows[i-1].elev === 'number' ? rows[i-1].elev : (typeof elevation_m[i-1] === 'number' ? (elevation_m[i-1] as number) : null));
          grade_percent.push(typeof de === 'number' && dd > 0 ? (de / dd) * 100 : (grade_percent[grade_percent.length-1] ?? null));
          } else {
            pace_s_per_km.push(pace_s_per_km[pace_s_per_km.length-1] ?? null);
          speed_mps.push(r.v_mps ?? speed_mps[speed_mps.length-1] ?? null);
          grade_percent.push(grade_percent[grade_percent.length-1] ?? null);
          }
        } else {
          pace_s_per_km.push(null);
        speed_mps.push(r.v_mps ?? null);
        grade_percent.push(null);
        }
      }
    }

    // Discipline-specific field visibility: ensure mutually exclusive primary metrics
    const isRide = /ride|bike|cycl/i.test(sport);
    const isRun = /run|walk/i.test(sport);
    try {
      if (isRide && !isRun) {
        // Rides: expose speed_mps and cadence_rpm only
        for (let i = 0; i < pace_s_per_km.length; i++) pace_s_per_km[i] = null;
        for (let i = 0; i < cadence_spm.length; i++) cadence_spm[i] = null;
      } else if (isRun && !isRide) {
        // Runs/Walks: expose pace_s_per_km and cadence_spm only
        for (let i = 0; i < speed_mps.length; i++) speed_mps[i] = null;
        for (let i = 0; i < cadence_rpm.length; i++) cadence_rpm[i] = null;
      }
    } catch {}

    // Normalized Power (NP) calculation for cyclists
    let normalizedPower: number | null = null;
    let intensityFactor: number | null = null;
    let variabilityIndex: number | null = null;
    
    try {
      if (isRide && hasRows && power_watts.some(p => p !== null)) {
        const windowSize = 30; // 30 seconds rolling window
        const rollingAvgs: number[] = [];
        
        for (let i = 0; i < rows.length; i++) {
          const windowStart = Math.max(0, i - windowSize + 1);
          const windowPowers = rows.slice(windowStart, i + 1)
            .map(r => r.power_w)
            .filter((p): p is number => p !== null && !isNaN(p));
          
          if (windowPowers.length > 0) {
            const avgPower = windowPowers.reduce((a, b) => a + b, 0) / windowPowers.length;
            rollingAvgs.push(Math.pow(avgPower, 4));
          }
        }
        
        if (rollingAvgs.length > 0) {
          const avgOfFourthPowers = rollingAvgs.reduce((a, b) => a + b, 0) / rollingAvgs.length;
          normalizedPower = Math.pow(avgOfFourthPowers, 0.25);
          
          // Variability Index: NP / Avg Power
          const powerValues = power_watts.filter((p): p is number => p !== null);
          if (powerValues.length > 0) {
            const avgPower = powerValues.reduce((a, b) => a + b, 0) / powerValues.length;
            if (avgPower > 0) {
              variabilityIndex = normalizedPower / avgPower;
            }
          }
          
          // Intensity Factor: NP / FTP (if user has FTP)
          if (userFtp && userFtp > 0) {
            intensityFactor = normalizedPower / userFtp;
          }
        }
      }
    } catch (e) {
      // NP is optional, don't fail
    }

    // Splits helper
    function computeSplits(splitMeters: number) {
      const out: any[] = [];
      if (!hasRows) return out;
      let startIdx = 0;
      let nextTarget = (rows[0].d||0) + splitMeters;
      for (let i=1;i<rows.length;i+=1) {
        if ((rows[i].d||0) >= nextTarget) {
          const s = rows[startIdx]; const e = rows[i];
          const dist_m = Math.max(0, (e.d||0) - (s.d||0));
          const dur_s = Math.max(1, (e.t||0) - (s.t||0));
          const pace = dist_m>0 ? dur_s/(dist_m/1000) : null;
          // Averages
          let hrVals:number[]=[]; let cadVals:number[]=[];
          for (let k=startIdx;k<=i;k+=1) { const h=rows[k].hr; if (typeof h==='number') hrVals.push(h); const c=rows[k].cad; if (typeof c==='number') cadVals.push(c); }
          const avgHr = hrVals.length? Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length) : null;
          const avgCad = cadVals.length? Math.round(cadVals.reduce((a,b)=>a+b,0)/cadVals.length) : null;
          out.push({ n: out.length+1, t0: Math.max(0,(s.t||0)-t0), t1: Math.max(0,(e.t||0)-t0), distance_m: Math.round(dist_m), avgPace_s_per_km: pace!=null? Math.round(pace): null, avgHr_bpm: avgHr, avgCadence_spm: avgCad });
          startIdx = i+1; nextTarget += splitMeters;
        }
      }
      return out;
    }

    // Fix decisecond values (Garmin bug): if pace values > 1200, they're in deciseconds
    const pace_s_per_km_fixed = pace_s_per_km.map((p: number | null) => {
      if (p == null || !Number.isFinite(p)) return null;
      // If pace > 1200 s/km (20 min/km), it's likely in deciseconds
      return p > 1200 ? Math.round(p / 10) : p;
    });
  
  // Light smoothing for elevation and pace to reduce noise/spikes
  const elevation_sm = hasRows ? smoothEMA(elevation_m, 0.25) : [];
  const pace_sm = hasRows ? smoothEMA(pace_s_per_km_fixed, 0.25) : [];
  const speed_sm = hasRows ? smoothEMA(speed_mps, 0.18) : [];
  const grade_sm = hasRows ? smoothEMA(grade_percent, 0.25) : [];

  const analysis: any = {
      version: ANALYSIS_VERSION,
      computedAt: new Date().toISOString(),
      input,
    // Always return consistent series structure with all 10 fields (even if empty)
    series: {
      time_s: hasRows ? time_s : [],
      distance_m: hasRows ? distance_m : [],
      elevation_m: hasRows ? elevation_sm : [],
      pace_s_per_km: hasRows ? pace_sm : [],
      speed_mps: hasRows ? speed_sm : [],
      hr_bpm: hasRows ? hr_bpm : [],
      cadence_spm: hasRows ? cadence_spm : [],
      cadence_rpm: hasRows ? cadence_rpm : [],
      power_watts: hasRows ? power_watts : [],
      grade_percent: hasRows ? grade_sm : []
    },
      events: {
        laps: Array.isArray(laps) ? laps.slice(0, 50) : [],
        splits: { km: computeSplits(1000), mi: computeSplits(1609.34) }
      },
    zones: {},
      bests: (() => {
        const bests: any = {};
        // Calculate max pace (fastest = minimum seconds per km) from series speed data
        // Use raw speed_mps array (before smoothing) to get true fastest pace
        if (hasRows && isRun && speed_mps.length > 0) {
          const validSpeeds = speed_mps.filter((s): s is number => 
            s !== null && Number.isFinite(s) && s > 0.5 && s < 10 // Realistic running speeds: 0.5-10 m/s
          );
          if (validSpeeds.length > 0) {
            const maxSpeedMps = Math.max(...validSpeeds); // Fastest speed
            if (maxSpeedMps > 0) {
              bests.max_pace_s_per_km = Math.round(1000 / maxSpeedMps); // Convert m/s to s/km
            }
          }
        }
        return bests;
      })(),
      power: normalizedPower !== null ? {
        normalized_power: Math.round(normalizedPower),
        variability_index: variabilityIndex,
        intensity_factor: intensityFactor
      } : undefined,
      ui: { footnote: `Computed at ${ANALYSIS_VERSION}`, renderHints: { preferPace: sport === 'run' } }
    };

  // Zones histograms (auto-range for HR, FTP-based for power)
  try {
    // Auto-range bins for HR (works well with natural HR ranges)
    const binsFor = (values: (number|null)[], times: number[], n: number) => {
      const vals: number[] = [];
      for (let i=0;i<values.length;i++) if (typeof values[i] === 'number' && Number.isFinite(values[i] as number)) vals.push(values[i] as number);
      if (vals.length < 10) return null;
      const min = Math.min(...vals), max = Math.max(...vals);
      if (!(max>min)) return null;
      const step = (max - min) / n;
      const bins = new Array(n).fill(0);
      for (let i=1;i<times.length && i<values.length;i++) {
        const v = values[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const dt = Math.max(0, times[i] - times[i-1]);
        let idx = Math.floor((v - min) / step);
        if (idx >= n) idx = n - 1;
        if (idx < 0) idx = 0;
        bins[idx] += dt;
      }
      return { bins: bins.map((t_s:number, i:number)=>({ i, t_s, min: Math.round(min + i*step), max: Math.round(min + (i+1)*step) })), schema: 'auto-range' };
    };
    
    // FTP-based bins for power (uses custom boundaries)
    const binsForBoundaries = (values: (number|null)[], times: number[], boundaries: number[]) => {
      const vals: number[] = [];
      for (let i=0;i<values.length;i++) if (typeof values[i] === 'number' && Number.isFinite(values[i] as number)) vals.push(values[i] as number);
      if (vals.length < 10) return null;
      
      const bins = new Array(boundaries.length - 1).fill(0);
      for (let i=1;i<times.length && i<values.length;i++) {
        const v = values[i];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
        const dt = Math.max(0, times[i] - times[i-1]);
        
        // Find which zone this value falls into
        let zoneIdx = -1;
        for (let z=0; z<boundaries.length-1; z++) {
          if (v >= boundaries[z] && v < boundaries[z+1]) {
            zoneIdx = z;
            break;
          }
        }
        // Handle edge case: value equals max boundary
        if (zoneIdx === -1 && v >= boundaries[boundaries.length-2]) {
          zoneIdx = boundaries.length - 2;
        }
        
        if (zoneIdx >= 0 && zoneIdx < bins.length) {
          bins[zoneIdx] += dt;
        }
      }
      
      return { 
        bins: bins.map((t_s:number, i:number)=>({ 
          i, 
          t_s, 
          min: Math.round(boundaries[i]), 
          max: i === bins.length-1 ? Math.round(boundaries[i+1]) : Math.round(boundaries[i+1]) 
        })), 
        schema: 'ftp-based' 
      };
    };
    
    const hrZones = binsFor(hr_bpm, time_s, 5);
    if (hrZones) analysis.zones.hr = hrZones as any;
    
    // Power zones: FTP-based (using userFtp variable extracted earlier)
    const ftpForZones = userFtp || 200;
    console.log('[POWER ZONES] Using FTP:', ftpForZones, '(userFtp was:', userFtp, ')');
    const powerZoneBoundaries = [
      0,
      ftpForZones * 0.55,   // Z1 max: Active Recovery
      ftpForZones * 0.75,   // Z2 max: Endurance
      ftpForZones * 0.90,   // Z3 max: Tempo
      ftpForZones * 1.05,   // Z4 max: Threshold
      ftpForZones * 1.20,   // Z5 max: VO2 Max
      ftpForZones * 1.50,   // Z6 max: Anaerobic
      Infinity              // Z6+ (anything above)
    ];
    console.log('[POWER ZONES] Boundaries:', powerZoneBoundaries.slice(0, -1)); // Omit Infinity
    const pwrZones = binsForBoundaries(power_watts, time_s, powerZoneBoundaries);
    if (pwrZones) analysis.zones.power = pwrZones as any;
  } catch {}

    // --- DISABLED: Swim 100m splits calculation ---
    // Removed because:
    // 1. Causes timeouts/infinite loops on certain data
    // 2. Garmin doesn't provide accurate per-length timing for pool swims
    // 3. Only overall avg pace (calculated below) is reliable from the data we have
    // If splits are needed in the future, would require different data source or algorithm

    // Derive canonical overall for swims and endurance
    const overall = (() => {
      const cPrev = parseJson(w.computed) || {};
      const prevOverall = cPrev?.overall || {};
      const type = String(w.type || '').toLowerCase();
      // Endurance: prefer series totals when available
      if (type !== 'strength') {
        try {
          const distSeries = hasRows ? Number(distance_m[distance_m.length-1]||0) : NaN;
          const timeSeries = hasRows ? Number(time_s[time_s.length-1]||0) : NaN;
          // Swims: ensure non-zero distance
          if (type.includes('swim')) {
            let dist = Number.isFinite(distSeries) && distSeries>0 ? distSeries : null;
            if (!dist) {
              // lengths.sum
              const swim = parseJson((w as any).swim_data) || null;
              const lengths: any[] = Array.isArray(swim?.lengths) ? swim.lengths : [];
              if (lengths.length) {
                const sum = lengths.reduce((s:number,l:any)=> s + (Number(l?.distance_m)||0), 0);
                if (sum>0) dist = Math.round(sum);
              }
              if (!dist) {
                const nLen = Number((w as any)?.number_of_active_lengths);
                const poolM = Number((w as any)?.pool_length);
                if (Number.isFinite(nLen) && nLen>0 && Number.isFinite(poolM) && poolM>0) dist = Math.round(nLen*poolM);
              }
            }
            // Extract time from Garmin: for pool swims, use distance/speed or non-uniform lengths
            let dur = null;
            let elapsedDur = null;
            
            // 1) Distance ÷ avg speed (Garmin's avgSpeed is based on moving time!)
            if (ga) {
              try {
                const raw = parseJson(ga.raw_data) || {};
                const summary = raw?.summary || {};
                const distM = Number(summary?.distanceInMeters ?? summary?.totalDistanceInMeters);
                const avgMps = Number(summary?.averageSpeedInMetersPerSecond);
                if (Number.isFinite(distM) && distM > 0 && Number.isFinite(avgMps) && avgMps > 0) {
                  dur = Math.round(distM / avgMps);
                  console.log(`🏊 Using distance/avgSpeed = ${dur}s for moving time`);
                }
              } catch {}
            }
            
            // 2) Try summing swim lengths (only if non-uniform, indicating real Garmin data)
            if (!dur) {
              const swim = parseJson((w as any).swim_data) || null;
              const lengths: any[] = Array.isArray(swim?.lengths) ? swim.lengths : [];
              if (lengths.length > 0) {
                const durs = lengths.map(l => Number(l?.duration_s ?? 0)).filter(d => d > 0);
                if (durs.length) {
                  const min = Math.min(...durs);
                  const max = Math.max(...durs);
                  const essentiallyUniform = durs.length >= 3 && (max - min) <= 1;
                  if (!essentiallyUniform) {
                    const lengthSum = durs.reduce((a,b) => a + b, 0);
                    if (lengthSum > 0) {
                      dur = Math.round(lengthSum);
                      console.log(`🏊 Using sum of ${lengths.length} non-uniform lengths = ${dur}s`);
                    }
                  }
                }
              }
            }
            
            // 3) Extract elapsed time from samples
            if (ga) {
              try {
                const raw = parseJson(ga.raw_data) || {};
                const samples = Array.isArray(raw?.samples) ? raw.samples : [];
                if (samples.length > 0) {
                  const lastSample = samples[samples.length - 1];
                  const clockS = Number(lastSample?.clockDurationInSeconds);
                  if (Number.isFinite(clockS) && clockS > 0) elapsedDur = Math.round(clockS);
                }
              } catch {}
            }
            
            // 4) Fallback: timeSeries or summary duration
            if (!dur) {
              dur = Number.isFinite(timeSeries) && timeSeries>0 ? Math.round(timeSeries) : null;
            }
            if (!dur && ga) {
              try {
                const raw = parseJson(ga.raw_data) || {};
                const garminDur = Number(raw?.summary?.durationInSeconds ?? raw?.durationInSeconds);
                if (Number.isFinite(garminDur) && garminDur > 0) dur = Math.round(garminDur);
              } catch {}
            }
            
            // Last resort fallback from workouts table fields (already in minutes, convert to seconds)
            if (!dur) {
              const moveMin = Number((w as any)?.moving_time);
              if (Number.isFinite(moveMin) && moveMin > 0) dur = Math.round(moveMin * 60);
            }
            if (!elapsedDur) {
              const elapsedMin = Number((w as any)?.elapsed_time);
              if (Number.isFinite(elapsedMin) && elapsedMin > 0) elapsedDur = Math.round(elapsedMin * 60);
            }
            return {
              ...(prevOverall||{}),
              distance_m: dist || prevOverall?.distance_m || 0,
              duration_s_moving: dur || prevOverall?.duration_s_moving || null,
              duration_s_elapsed: elapsedDur || prevOverall?.duration_s_elapsed || null,
            };
          }
          // Non-swim (runs, rides)
          const dist = Number.isFinite(distSeries) && distSeries>0 ? Math.round(distSeries)
            : (Number((w as any)?.distance)*1000 || prevOverall?.distance_m || null);
          // Extract duration - PRIORITIZE moving time over elapsed time
          // timeSeries might be elapsed time, so we need to get moving time explicitly
          let dur = null;
          let elapsedDur = null;

          // First: try to get moving time from raw sensor data (most accurate)
          if (ga) {
            try {
              const raw = parseJson(ga.raw_data) || {};
              const samples = Array.isArray(raw?.samples) ? raw.samples : [];
              if (samples.length > 0) {
                const lastSample = samples[samples.length - 1];
                const movingS = Number(lastSample?.movingDurationInSeconds);
                const clockS = Number(lastSample?.clockDurationInSeconds);
                if (Number.isFinite(movingS) && movingS > 0) dur = Math.round(movingS);
                if (Number.isFinite(clockS) && clockS > 0) elapsedDur = Math.round(clockS);
              }
            } catch {}
          }
          
          // Second: use stored moving_time field (reliable fallback)
          if (!dur) {
            const moveMin = Number((w as any)?.moving_time);
            if (Number.isFinite(moveMin) && moveMin > 0) dur = Math.round(moveMin * 60);
          }
          
          // Third: use timeSeries ONLY if we don't have moving time (might be elapsed time)
          // This ensures pace calculations use moving time, not elapsed time
          if (!dur && Number.isFinite(timeSeries) && timeSeries > 0) {
            dur = Math.round(timeSeries);
          }
          
          // Set elapsed time if we have timeSeries but didn't get it from raw data
          if (!elapsedDur && Number.isFinite(timeSeries) && timeSeries > 0) {
            elapsedDur = Math.round(timeSeries);
          }
          
          // Calculate avg_pace_s_per_mi for runs/walks (needed by Summary screen)
          let avgPaceSPerMi: number | null = null;
          if (dist && dur && dist > 0 && dur > 0) {
            const miles = dist / 1609.34; // meters to miles
            if (miles > 0) {
              avgPaceSPerMi = dur / miles; // seconds per mile
            }
          }
          
          return { 
            ...(prevOverall||{}), 
            distance_m: dist, 
            duration_s_moving: dur, 
            duration_s_elapsed: elapsedDur,
            avg_pace_s_per_mi: avgPaceSPerMi ?? prevOverall?.avg_pace_s_per_mi ?? null
          };
        } catch { return prevOverall || {}; }
      }
      return prevOverall || {};
    })();

    // Note: avg_pace_s_per_km is calculated from overall.avg_pace_s_per_mi in useWorkoutData hook
    // No need to duplicate - both Summary and Details use computed.overall.avg_pace_s_per_mi

    // Add swim pace metrics to analysis (needs overall data)
    if (sport.includes('swim')) {
      console.log('🏊 Swim overall:', { dist: overall?.distance_m, dur: overall?.duration_s_moving, elapsed: overall?.duration_s_elapsed });
      if (overall?.distance_m && overall?.duration_s_moving) {
        const dist = overall.distance_m;
        const dur = overall.duration_s_moving;
        const per100m = (dur / dist) * 100;
        const distYards = dist / 0.9144;
        const per100yd = (dur / distYards) * 100;
        analysis.swim = {
          avg_pace_per_100m: Math.round(per100m),
          avg_pace_per_100yd: Math.round(per100yd)
        };
        console.log('🏊 Swim pace calculated:', analysis.swim);
      } else {
        console.log('❌ Swim pace NOT calculated - missing distance or duration');
      }
    }

    // ==========================================================================
    // CALCULATE PEAK PERFORMANCE METRICS
    // ==========================================================================
    // Power curve for cycling, best efforts for running
    // Used by generate-overall-context for honest performance trend analysis
    
    let powerCurve: PowerCurve | null = null;
    let bestEfforts: BestEfforts | null = null;
    
    if (w.type === 'ride' || w.type === 'cycling' || w.type === 'bike') {
      // Calculate power curve for bikes
      powerCurve = calculatePowerCurve(power_watts);
      if (powerCurve) {
        console.log(`⚡ Power curve saved for bike workout`);
      }
    }
    
    if (w.type === 'run' || w.type === 'running') {
      // Calculate best efforts for runs
      bestEfforts = calculateBestRunEfforts(distance_m, time_s, hr_bpm);
      if (bestEfforts) {
        console.log(`🏃 Best efforts saved for run workout`);
      }
    }

    // Build partial computed data (only what this function writes)
    // Database will merge this with existing computed data atomically
    const partialComputed = {
      overall, 
      analysis,
      // Peak performance metrics (null if not calculated/applicable)
      power_curve: powerCurve,
      best_efforts: bestEfforts
    };

    console.log('📝 About to UPDATE:', {
      workout_id,
      type: String(w.type),
      has_overall: !!partialComputed.overall,
      has_analysis: !!partialComputed.analysis,
      analysis_version: partialComputed.analysis?.version,
      swim_in_analysis: !!partialComputed.analysis?.swim,
      power_in_analysis: !!partialComputed.analysis?.power,
      power_curve: partialComputed.power_curve ? Object.keys(partialComputed.power_curve).join(',') : null,
      best_efforts: partialComputed.best_efforts ? Object.keys(partialComputed.best_efforts).join(',') : null
    });

    // Trigger granular analysis for running workouts
    // NOTE: analyze-running-workout writes to workout_analysis independently
    console.log('🔍 Checking granular analysis conditions:', {
      type: w.type,
      planned_id: w.planned_id,
      isRun: w.type === 'run',
      hasPlannedId: !!w.planned_id
    });
    
    if (w.type === 'run') {
      try {
        console.log('🏃 Triggering analyze-running-workout...');
        
        // Call the dedicated analyze-running-workout function
        // It will write to workout_analysis independently
        const { error: runningError } = await supabase.functions.invoke('analyze-running-workout', {
          body: { workout_id: workout_id }
        });
        
        if (runningError) {
          console.error('❌ Running analysis failed:', runningError.message);
        } else {
          console.log('✅ Running analysis triggered successfully');
        }
      } catch (error) {
        console.error('❌ Failed to trigger running analysis:', error);
      }
    }
    
    // Trigger granular analysis for cycling workouts
    if (w.type === 'ride') {
      try {
        console.log('🚴 Triggering analyze-cycling-workout...');
        
        // Call the dedicated analyze-cycling-workout function
        // It will write to workout_analysis independently
        const { error: cyclingError } = await supabase.functions.invoke('analyze-cycling-workout', {
          body: { workout_id: workout_id }
        });
        
        if (cyclingError) {
          console.error('❌ Cycling analysis failed:', cyclingError.message);
        } else {
          console.log('✅ Cycling analysis triggered successfully');
        }
      } catch (error) {
        console.error('❌ Failed to trigger cycling analysis:', error);
      }
    }

    // Use database RPC for atomic JSONB merge - REQUIRED, no fallbacks
    console.log('[compute-workout-analysis] Calling merge_computed RPC with:', {
      workout_id,
      partial_computed_keys: Object.keys(partialComputed),
      has_analysis: !!partialComputed.analysis,
      has_overall: !!partialComputed.overall
    });
    
    const { error: rpcError, data: rpcData } = await supabase.rpc('merge_computed', {
      p_workout_id: workout_id,
      p_partial_computed: partialComputed
    });
    
    if (rpcError) {
      console.error('[compute-workout-analysis] RPC merge_computed failed:', {
        error: rpcError,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
        code: rpcError.code
      });
      throw new Error(`Failed to merge computed data: ${rpcError.message || JSON.stringify(rpcError)}. RPC function merge_computed is required.`);
    }
    
    console.log('✅ UPDATE result: merged via RPC', rpcData);

    return new Response(JSON.stringify({ 
      success: true, 
      analysisVersion: ANALYSIS_VERSION,
      debug: {
        workoutType: w.type,
        plannedId: w.planned_id,
        note: 'workout_analysis written by analyze-running-workout'
      }
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});
