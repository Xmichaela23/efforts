/**
 * Heart Rate Analysis - Single Source of Truth
 * 
 * This is the ONE entry point for all HR analysis in workout processing.
 * All calculations are deterministic.
 * 
 * Usage:
 *   const result = analyzeHeartRate(sensorData, context);
 * 
 * The result contains:
 *   - drift: For steady-state workouts (drift metrics, terrain factors)
 *   - intervals: For interval workouts (creep, recovery, consistency)
 *   - zones: Always present (time in each HR zone)
 *   - efficiency: For steady-state (pace:HR decoupling)
 *   - trends: When historical data available
 *   - interpretation: Human-readable narrative
 *   - summary: Structured metrics for weekly/block aggregation
 */

import {
  HRAnalysisContext,
  HRAnalysisResult,
  WorkoutType,
  SensorSample,
  HRSummaryMetrics,
  ZoneDistribution,
  ZoneTime
} from './types.ts';

import { detectWorkoutType } from './detect-workout-type.ts';
import { analyzeSteadyStateDrift } from './drift.ts';
import { analyzeIntervalHR } from './intervals.ts';
import { calculateZoneDistribution } from './zones.ts';
import { calculateEfficiency } from './efficiency.ts';
import { buildInterpretation } from './interpretation.ts';

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Analyze heart rate data for a workout.
 * 
 * @param sensorData - Array of sensor samples with HR, pace, elevation
 * @param context - Full context including intervals, terrain, weather, plan
 * @returns Complete HR analysis result
 */
export function analyzeHeartRate(
  sensorData: SensorSample[],
  context: HRAnalysisContext
): HRAnalysisResult {
  console.log('💓 [HR ANALYSIS] Starting analysis...');
  console.log('💓 [HR ANALYSIS] Samples:', sensorData.length);
  console.log('💓 [HR ANALYSIS] Workout type (input):', context.workoutType);
  
  // Filter to valid HR samples
  const validHRSamples = sensorData.filter(s => 
    s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250
  );
  
  console.log('💓 [HR ANALYSIS] Valid HR samples:', validHRSamples.length);
  
  // Calculate basic HR stats
  const hrValues = validHRSamples.map(s => s.heart_rate!);
  const avgHr = hrValues.length > 0 
    ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) 
    : 0;
  const maxHr = hrValues.length > 0 ? Math.max(...hrValues) : 0;
  const minHr = hrValues.length > 0 ? Math.min(...hrValues) : 0;
  const durationMinutes = sensorData.length / 60; // ~1 sample/sec
  
  // Insufficient data check
  if (validHRSamples.length < 60) { // Less than 1 minute of HR data
    console.log('⚠️ [HR ANALYSIS] Insufficient HR data');
    return createInsufficientDataResult(avgHr, maxHr, minHr, durationMinutes, context.workoutType);
  }
  
  // Detect/confirm workout type
  const workoutType = context.workoutType || detectWorkoutType(context.intervals, context.plannedWorkout);
  console.log('💓 [HR ANALYSIS] Workout type (final):', workoutType);
  
  // Calculate zone distribution (always done)
  const zones = calculateZoneDistribution(validHRSamples, context.hrZones, context.plannedWorkout?.intent);
  
  // Route to appropriate analysis based on workout type
  let result: HRAnalysisResult;
  
  switch (workoutType) {
    case 'steady_state':
    case 'tempo_finish':
    case 'progressive':
      result = analyzeSteadyStateWorkout(sensorData, validHRSamples, context, workoutType, zones, durationMinutes);
      break;
      
    case 'intervals':
    case 'hill_repeats':
      result = analyzeIntervalWorkout(sensorData, validHRSamples, context, workoutType, zones, durationMinutes);
      break;
      
    case 'fartlek':
    case 'mixed':
    default:
      result = analyzeMixedWorkout(sensorData, validHRSamples, context, workoutType, zones, durationMinutes);
      break;
  }
  
  console.log('💓 [HR ANALYSIS] Complete. Type:', result.workoutType, 'Confidence:', result.confidence);
  return result;
}

// =============================================================================
// STEADY-STATE ANALYSIS (drift-focused)
// =============================================================================

function analyzeSteadyStateWorkout(
  sensorData: SensorSample[],
  validHRSamples: SensorSample[],
  context: HRAnalysisContext,
  workoutType: WorkoutType,
  zones: ZoneDistribution,
  durationMinutes: number
): HRAnalysisResult {
  console.log('💓 [HR ANALYSIS] Analyzing as steady-state/drift workout');
  console.log('💓 [HR ANALYSIS] Context check - planContext:', context.planContext ? 
    `week=${context.planContext.weekIndex}, intent=${context.planContext.weekIntent}, plan=${context.planContext.planName}` : 'NONE');
  console.log('💓 [HR ANALYSIS] Context check - historicalDrift:', context.historicalDrift ? 
    `${context.historicalDrift.similarWorkouts.length} workouts, lastSimilar=${context.historicalDrift.lastSimilar?.driftBpm ?? 'NONE'}` : 'NONE');
  console.log('💓 [HR ANALYSIS] Context check - weather:', context.weather ? 
    `${context.weather.temperatureF}°F (${context.weather.source || 'unknown'})` : 'NONE');
  
  try {
    // Calculate drift
    console.log('💓 [HR ANALYSIS] Calling analyzeSteadyStateDrift...');
    const drift = analyzeSteadyStateDrift(sensorData, validHRSamples, context, workoutType);
    console.log('💓 [HR ANALYSIS] Drift calculated:', drift?.driftBpm);
    
    // Calculate efficiency (pace:HR decoupling)
    console.log('💓 [HR ANALYSIS] Calculating efficiency...');
    const efficiency = calculateEfficiency(sensorData, validHRSamples, context, workoutType);
    
    // Build trends if historical data available
    const trends = buildTrends(drift, efficiency, context);
    console.log('💓 [HR ANALYSIS] Trends built:', trends ? 
      `drift trend=${trends.drift?.trend}, vsLastSimilar=${trends.vsLastSimilar ? trends.vsLastSimilar.driftDiffBpm + 'bpm diff' : 'NONE'}` : 'NONE');
    
    // Determine confidence
    const { confidence, reasons } = determineConfidence(validHRSamples.length, workoutType, drift);
    
    // Build interpretation narrative
    console.log('💓 [HR ANALYSIS] Building interpretation...');
    const interpretation = buildInterpretation({
      workoutType,
      analysisType: 'drift',
      drift,
      zones,
      efficiency,
      trends,
      context
    });
    
    // Build summary for aggregation
    const summary = buildSummary(validHRSamples, drift, efficiency, zones, workoutType, durationMinutes, confidence);
  
    // Determine summary label based on assessment
    const summaryLabel = getSummaryLabel(drift?.assessment, workoutType);
    
    return {
      workoutType,
      analysisType: 'drift',
      drift,
      zones,
      efficiency,
      trends,
      interpretation,
      summaryLabel,
      confidence,
      confidenceReasons: reasons,
      summary
    };
  } catch (error) {
    console.error('❌ [HR ANALYSIS] Error in steady-state analysis:', error);
    console.error('❌ [HR ANALYSIS] Stack:', (error as Error)?.stack);
    
    // Return a minimal result on error
    const hrValues = validHRSamples.map(s => s.heart_rate!);
    return {
      workoutType,
      analysisType: 'drift',
      zones,
      interpretation: 'Error during HR analysis.',
      summaryLabel: 'Summary',
      confidence: 'low',
      confidenceReasons: ['Analysis error occurred'],
      summary: {
        avgHr: hrValues.length > 0 ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : 0,
        maxHr: hrValues.length > 0 ? Math.max(...hrValues) : 0,
        minHr: hrValues.length > 0 ? Math.min(...hrValues) : 0,
        driftBpm: null,
        decouplingPct: null,
        efficiencyRatio: null,
        timeInZones: { z1Seconds: 0, z2Seconds: 0, z3Seconds: 0, z4Seconds: 0, z5Seconds: 0 },
        intervalHrCreepBpm: null,
        intervalRecoveryRate: null,
        workoutType,
        analysisConfidence: 'low',
        durationMinutes
      }
    };
  }
}

// =============================================================================
// INTERVAL ANALYSIS (creep/recovery focused)
// =============================================================================

function analyzeIntervalWorkout(
  sensorData: SensorSample[],
  validHRSamples: SensorSample[],
  context: HRAnalysisContext,
  workoutType: WorkoutType,
  zones: ZoneDistribution,
  durationMinutes: number
): HRAnalysisResult {
  console.log('💓 [HR ANALYSIS] Analyzing as interval workout');
  
  // Calculate interval-specific HR metrics
  const intervals = analyzeIntervalHR(sensorData, context.intervals);
  
  // Build trends if historical data available
  const trends = buildIntervalTrends(intervals, context);
  
  // Determine confidence
  const { confidence, reasons } = determineIntervalConfidence(intervals, context.intervals.length);
  
  // Build interpretation narrative
  const interpretation = buildInterpretation({
    workoutType,
    analysisType: 'intervals',
    intervals,
    zones,
    trends,
    context
  });
  
  // Build summary for aggregation
  const summary = buildIntervalSummary(validHRSamples, intervals, zones, workoutType, durationMinutes, confidence);
  
  return {
    workoutType,
    analysisType: 'intervals',
    intervals,
    zones,
    trends,
    interpretation,
    summaryLabel: 'Interval Summary',
    confidence,
    confidenceReasons: reasons,
    summary
  };
}

// =============================================================================
// MIXED/FARTLEK ANALYSIS (zone distribution focused)
// =============================================================================

function analyzeMixedWorkout(
  sensorData: SensorSample[],
  validHRSamples: SensorSample[],
  context: HRAnalysisContext,
  workoutType: WorkoutType,
  zones: ZoneDistribution,
  durationMinutes: number
): HRAnalysisResult {
  console.log('💓 [HR ANALYSIS] Analyzing as mixed/fartlek workout');
  
  // For mixed workouts, zone distribution is the main insight
  const { confidence, reasons } = determineMixedConfidence(validHRSamples.length);
  
  // Build interpretation narrative
  const interpretation = buildInterpretation({
    workoutType,
    analysisType: 'zones',
    zones,
    context
  });
  
  // Build summary for aggregation
  const summary = buildMixedSummary(validHRSamples, zones, workoutType, durationMinutes, confidence);
  
  return {
    workoutType,
    analysisType: 'zones',
    zones,
    interpretation,
    summaryLabel: 'Zone Summary',
    confidence,
    confidenceReasons: reasons,
    summary
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function createInsufficientDataResult(
  avgHr: number,
  maxHr: number,
  minHr: number,
  durationMinutes: number,
  workoutType: WorkoutType
): HRAnalysisResult {
  return {
    workoutType,
    analysisType: 'zones',
    zones: {
      distribution: [],
      primaryZone: 'Unknown',
      zoneCreep: false,
      timeAboveTarget: 0,
      percentInTarget: 0
    },
    interpretation: 'Insufficient heart rate data for analysis.',
    summaryLabel: 'HR Summary',
    confidence: 'low',
    confidenceReasons: ['Less than 1 minute of HR data'],
    summary: {
      avgHr,
      maxHr,
      minHr,
      driftBpm: null,
      decouplingPct: null,
      efficiencyRatio: null,
      timeInZones: { z1Seconds: 0, z2Seconds: 0, z3Seconds: 0, z4Seconds: 0, z5Seconds: 0 },
      intervalHrCreepBpm: null,
      intervalRecoveryRate: null,
      workoutType,
      analysisConfidence: 'low',
      durationMinutes
    }
  };
}

/**
 * Get human-readable summary label based on assessment.
 * Used by UI instead of deriving label from assessment.
 * Note: Changed from "HR Summary" to "Summary" - this is a holistic workout summary, not just HR.
 */
function getSummaryLabel(
  assessment: string | undefined,
  workoutType: WorkoutType
): string {
  // For tempo finish or progressive, show generic "Summary"
  if (workoutType === 'tempo_finish' || workoutType === 'progressive') {
    return 'Summary';
  }
  
  switch (assessment) {
    case 'excellent':
      return 'Aerobic Efficiency';
    case 'good':
      return 'Aerobic Response';
    case 'normal':
      return 'Summary';
    case 'elevated':
      return 'Elevated Drift';
    case 'high':
      return 'High Cardiac Stress';
    default:
      return 'Summary';
  }
}

function buildTrends(
  drift: any,
  efficiency: any,
  context: HRAnalysisContext
): HRAnalysisResult['trends'] {
  if (!context.historicalDrift || context.historicalDrift.similarWorkouts.length < 2) {
    return undefined;
  }
  
  const historical = context.historicalDrift;
  const currentDrift = drift?.driftBpm ?? 0;
  
  // Calculate drift trend
  const avgHistoricalDrift = historical.avgDriftBpm;
  const driftChangePercent = avgHistoricalDrift > 0 
    ? ((currentDrift - avgHistoricalDrift) / avgHistoricalDrift) * 100
    : 0;
  
  let driftTrend: 'improving' | 'stable' | 'worsening' = 'stable';
  if (driftChangePercent < -10) driftTrend = 'improving';
  else if (driftChangePercent > 10) driftTrend = 'worsening';
  
  const result: HRAnalysisResult['trends'] = {
    drift: {
      trend: historical.trend || driftTrend,
      changePercent: Math.round(driftChangePercent),
      comparedTo: `${historical.similarWorkouts.length} similar runs`,
      sampleSize: historical.similarWorkouts.length
    }
  };
  
  // Add vs last similar if available
  if (historical.lastSimilar) {
    result.vsLastSimilar = {
      date: historical.lastSimilar.date,
      daysSince: historical.lastSimilar.daysSince,
      driftDiffBpm: currentDrift - historical.lastSimilar.driftBpm,
      better: currentDrift < historical.lastSimilar.driftBpm
    };
  }
  
  return result;
}

function buildIntervalTrends(
  intervals: any,
  context: HRAnalysisContext
): HRAnalysisResult['trends'] {
  // TODO: Build interval-specific trends when historical interval data available
  return undefined;
}

function determineConfidence(
  sampleCount: number,
  workoutType: WorkoutType,
  drift: any
): { confidence: 'high' | 'medium' | 'low'; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;
  
  // Sample count
  if (sampleCount < 600) { // <10 min
    score -= 30;
    reasons.push('Limited HR data (<10 minutes)');
  } else if (sampleCount < 1200) { // <20 min
    score -= 15;
    reasons.push('Moderate HR data (10-20 minutes)');
  }
  
  // Terrain uncertainty
  if (drift?.terrain?.contributionBpm && Math.abs(drift.terrain.contributionBpm) > 5) {
    score -= 15;
    reasons.push('Significant terrain adjustment applied');
  }
  
  // Workout type complexity
  if (workoutType === 'tempo_finish' || workoutType === 'progressive') {
    score -= 10;
    reasons.push('Complex workout structure');
  }
  
  if (score >= 75) return { confidence: 'high', reasons };
  if (score >= 50) return { confidence: 'medium', reasons };
  return { confidence: 'low', reasons };
}

function determineIntervalConfidence(
  intervals: any,
  intervalCount: number
): { confidence: 'high' | 'medium' | 'low'; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;
  
  if (intervalCount < 3) {
    score -= 30;
    reasons.push('Few intervals to compare');
  }
  
  if (!intervals?.recovery?.perInterval?.length) {
    score -= 20;
    reasons.push('No recovery data between intervals');
  }
  
  if (score >= 75) return { confidence: 'high', reasons };
  if (score >= 50) return { confidence: 'medium', reasons };
  return { confidence: 'low', reasons };
}

function determineMixedConfidence(
  sampleCount: number
): { confidence: 'high' | 'medium' | 'low'; reasons: string[] } {
  const reasons: string[] = ['Unstructured workout — showing zone distribution'];
  
  if (sampleCount < 600) {
    return { confidence: 'low', reasons: [...reasons, 'Limited HR data'] };
  }
  return { confidence: 'medium', reasons };
}

function buildSummary(
  validHRSamples: SensorSample[],
  drift: any,
  efficiency: any,
  zones: ZoneDistribution,
  workoutType: WorkoutType,
  durationMinutes: number,
  confidence: 'high' | 'medium' | 'low'
): HRSummaryMetrics {
  const hrValues = validHRSamples.map(s => s.heart_rate!);
  
  return {
    avgHr: Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length),
    maxHr: Math.max(...hrValues),
    minHr: Math.min(...hrValues),
    driftBpm: drift?.driftBpm ?? null,
    decouplingPct: efficiency?.decoupling?.percent ?? null,
    efficiencyRatio: efficiency?.avgEfficiencyRatio ?? null,
    timeInZones: zonesToTimeInZones(zones),
    intervalHrCreepBpm: null,
    intervalRecoveryRate: null,
    workoutType,
    analysisConfidence: confidence,
    durationMinutes
  };
}

function buildIntervalSummary(
  validHRSamples: SensorSample[],
  intervals: any,
  zones: ZoneDistribution,
  workoutType: WorkoutType,
  durationMinutes: number,
  confidence: 'high' | 'medium' | 'low'
): HRSummaryMetrics {
  const hrValues = validHRSamples.map(s => s.heart_rate!);
  
  return {
    avgHr: Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length),
    maxHr: Math.max(...hrValues),
    minHr: Math.min(...hrValues),
    driftBpm: null,
    decouplingPct: null,
    efficiencyRatio: null,
    timeInZones: zonesToTimeInZones(zones),
    intervalHrCreepBpm: intervals?.hrCreep?.creepBpm ?? null,
    intervalRecoveryRate: intervals?.recovery?.recoveryRate ?? null,
    workoutType,
    analysisConfidence: confidence,
    durationMinutes
  };
}

function buildMixedSummary(
  validHRSamples: SensorSample[],
  zones: ZoneDistribution,
  workoutType: WorkoutType,
  durationMinutes: number,
  confidence: 'high' | 'medium' | 'low'
): HRSummaryMetrics {
  const hrValues = validHRSamples.map(s => s.heart_rate!);
  
  return {
    avgHr: Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length),
    maxHr: Math.max(...hrValues),
    minHr: Math.min(...hrValues),
    driftBpm: null,
    decouplingPct: null,
    efficiencyRatio: null,
    timeInZones: zonesToTimeInZones(zones),
    intervalHrCreepBpm: null,
    intervalRecoveryRate: null,
    workoutType,
    analysisConfidence: confidence,
    durationMinutes
  };
}

function zonesToTimeInZones(zones: ZoneDistribution): HRSummaryMetrics['timeInZones'] {
  const result = { z1Seconds: 0, z2Seconds: 0, z3Seconds: 0, z4Seconds: 0, z5Seconds: 0 };
  
  for (const zone of zones.distribution) {
    if (zone.label === 'Z1') result.z1Seconds = zone.seconds;
    else if (zone.label === 'Z2') result.z2Seconds = zone.seconds;
    else if (zone.label === 'Z3') result.z3Seconds = zone.seconds;
    else if (zone.label === 'Z4') result.z4Seconds = zone.seconds;
    else if (zone.label === 'Z5') result.z5Seconds = zone.seconds;
  }
  
  return result;
}

// Re-export types for convenience
export * from './types.ts';
