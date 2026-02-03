/**
 * Efficiency Metrics Calculator
 * 
 * Calculates pace:HR efficiency and decoupling for steady-state workouts.
 * Decoupling = how much harder your body works to maintain pace over time.
 */

import {
  SensorSample,
  HRAnalysisContext,
  WorkoutType,
  EfficiencyMetrics
} from './types.ts';

// Skip first 10 minutes (warmup/ramp-up)
const WARMUP_SKIP_SECONDS = 600;

/**
 * Calculate efficiency metrics for steady-state workouts.
 */
export function calculateEfficiency(
  sensorData: SensorSample[],
  validHRSamples: SensorSample[],
  context: HRAnalysisContext,
  workoutType: WorkoutType
): EfficiencyMetrics | undefined {
  console.log('📈 [EFFICIENCY] Calculating pace:HR efficiency...');
  
  // Only calculate for steady-state-ish workouts
  if (workoutType === 'intervals' || workoutType === 'hill_repeats') {
    console.log('📈 [EFFICIENCY] Skipping for interval workout');
    return undefined;
  }
  
  // Need samples with both pace and HR
  const samplesWithBoth = sensorData.filter(s => 
    s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250 &&
    s.pace_s_per_mi && s.pace_s_per_mi > 0 && s.pace_s_per_mi < 1800 // < 30 min/mi
  );
  
  console.log('📈 [EFFICIENCY] Samples with pace and HR:', samplesWithBoth.length);
  
  if (samplesWithBoth.length < 1200) { // Need at least 20 min of data
    console.log('📈 [EFFICIENCY] Insufficient data for efficiency calculation');
    return undefined;
  }
  
  // Skip warmup
  const warmupSkip = Math.min(WARMUP_SKIP_SECONDS, Math.floor(samplesWithBoth.length * 0.15));
  const samplesAfterWarmup = samplesWithBoth.slice(warmupSkip);
  
  if (samplesAfterWarmup.length < 600) { // Need 10 min after warmup
    return undefined;
  }
  
  // Split into halves
  const midpoint = Math.floor(samplesAfterWarmup.length / 2);
  const firstHalf = samplesAfterWarmup.slice(0, midpoint);
  const secondHalf = samplesAfterWarmup.slice(midpoint);
  
  // Calculate pace:HR ratio for each half
  // Lower pace (faster) + lower HR = more efficient
  // We use pace/HR so higher = more efficient
  const earlyRatio = calculateEfficiencyRatio(firstHalf);
  const lateRatio = calculateEfficiencyRatio(secondHalf);
  
  console.log('📈 [EFFICIENCY] Early ratio:', earlyRatio);
  console.log('📈 [EFFICIENCY] Late ratio:', lateRatio);
  
  if (earlyRatio === null || lateRatio === null) {
    return undefined;
  }
  
  // Decoupling = how much efficiency dropped
  // Negative decoupling (rare) means you got MORE efficient
  // Positive decoupling means you got less efficient (normal)
  const decouplingPercent = earlyRatio > 0 
    ? ((earlyRatio - lateRatio) / earlyRatio) * 100 
    : 0;
  
  console.log('📈 [EFFICIENCY] Decoupling:', decouplingPercent, '%');
  
  // Assess decoupling
  let assessment: 'excellent' | 'good' | 'moderate' | 'high';
  const absDecoupling = Math.abs(decouplingPercent);
  
  if (absDecoupling < 3) {
    assessment = 'excellent';
  } else if (absDecoupling < 5) {
    assessment = 'good';
  } else if (absDecoupling < 8) {
    assessment = 'moderate';
  } else {
    assessment = 'high';
  }
  
  // Overall average efficiency
  const avgRatio = calculateEfficiencyRatio(samplesAfterWarmup);
  
  return {
    decoupling: {
      percent: Math.round(decouplingPercent * 10) / 10,
      earlyRatio: Math.round(earlyRatio * 1000) / 1000,
      lateRatio: Math.round(lateRatio * 1000) / 1000,
      assessment
    },
    avgEfficiencyRatio: avgRatio !== null ? Math.round(avgRatio * 1000) / 1000 : 0
  };
}

/**
 * Calculate efficiency ratio for a set of samples.
 * 
 * Efficiency = pace (normalized) / HR
 * Higher = more efficient (faster pace per HR beat)
 * 
 * We invert pace so faster = higher number.
 */
function calculateEfficiencyRatio(samples: SensorSample[]): number | null {
  if (samples.length === 0) return null;
  
  // Get average pace and HR
  const paces = samples.map(s => s.pace_s_per_mi!);
  const hrs = samples.map(s => s.heart_rate!);
  
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
  const avgHR = hrs.reduce((a, b) => a + b, 0) / hrs.length;
  
  if (avgHR === 0) return null;
  
  // Invert pace so higher = faster
  // Normalize by dividing by typical easy pace (~700 s/mi = 11:40/mi)
  const normalizedSpeed = 700 / avgPace;
  
  // Efficiency ratio: speed / HR
  return normalizedSpeed / avgHR;
}
