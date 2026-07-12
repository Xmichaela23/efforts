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
import { frielBand } from '../../../_shared/state-trend/run.ts';

// Skip first 10 minutes (warmup/ramp-up)
const WARMUP_SKIP_SECONDS = 600;

/**
 * Map a decoupling % to this pipeline's display words using the SINGLE shared band the STATE run row +
 * coach use (frielBand). Q-161: frielBand is now the two science-defensible states at the 5% line
 * (≤5% sound / >5% needs work) — the old 4-word convention (excellent/good/moderate/high off a
 * <3/<5/<8 scale) collapsed with it, so the workout card can't grade finer than the science supports
 * or diverge from State. `good` = base sound, `needs_work` = build more base (or a residual confound).
 */
export function decouplingAssessmentFromPct(pct: number): 'good' | 'needs_work' {
  return frielBand(pct) === 'sound' ? 'good' : 'needs_work';
}

/**
 * Calculate efficiency metrics for steady-state workouts.
 *
 * D-037: `options.forMixedEffort=true` bypasses the intervals/hill_repeats steady-state guard so a
 * mixed-effort run (fartlek, or a steady run the variance gate flagged as mixed) still gets a
 * whole-session decoupling read — but a split-half ratio across heterogeneous efforts is NOT a clean
 * steady-state signal, so `basis` is forced to 'raw' regardless of GAP enrichment (the prompt's
 * raw-basis rule then treats the number as inconclusive, not a fitness verdict). Restored 2026-07-12:
 * the option was accidentally reverted by a8bf025b (an unrelated State-headline commit, 2026-06-14).
 */
export function calculateEfficiency(
  sensorData: SensorSample[],
  validHRSamples: SensorSample[],
  context: HRAnalysisContext,
  workoutType: WorkoutType,
  options?: { forMixedEffort?: boolean }
): EfficiencyMetrics | undefined {
  console.log('📈 [EFFICIENCY] Calculating pace:HR efficiency...');

  // Only calculate for steady-state-ish workouts — unless forMixedEffort explicitly opts a mixed run
  // in (basis is forced to 'raw' below so the number reads as inconclusive, not a clean verdict).
  if (!options?.forMixedEffort && (workoutType === 'intervals' || workoutType === 'hill_repeats')) {
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
  
  // Assess decoupling on the SAME shared band State + coach use (see decouplingAssessmentFromPct).
  const assessment = decouplingAssessmentFromPct(decouplingPercent);

  // Basis of this decoupling: 'gap' when the pace series was grade-adjusted (enrichSamplesWithGAP
  // stamps raw_pace_s_per_mi on every sample when the run had usable elevation), else 'raw' (device
  // pace, terrain-confounded). Only a 'gap' read is a trustworthy fitness signal — the Performance
  // "Aerobic decoupling" row gates on it (Q-158 follow-on). Detected the same way gap.ts:200 does.
  const detectedBasis: 'gap' | 'raw' =
    samplesAfterWarmup[0] && typeof (samplesAfterWarmup[0] as any).raw_pace_s_per_mi !== 'undefined'
      ? 'gap'
      : 'raw';
  // D-037: a whole-session ratio across mixed efforts is inconclusive → force 'raw' so the prompt's
  // raw-basis rule fires (never a clean fitness read), regardless of GAP enrichment.
  const basis: 'gap' | 'raw' = options?.forMixedEffort ? 'raw' : detectedBasis;

  // Overall average efficiency
  const avgRatio = calculateEfficiencyRatio(samplesAfterWarmup);

  return {
    decoupling: {
      basis,
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
