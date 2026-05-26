import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCyclingFactPacketV1 } from '../_shared/cycling-v1/build.ts';
import { generateCyclingFlagsV1 } from '../_shared/cycling-v1/flags.ts';
import { generateCyclingAISummaryV1 } from '../_shared/cycling-v1/ai-summary.ts';
import { rideComputedNp } from '../_shared/cycling-v1/np-trend.ts';
import { detectClimbSegments, parseStravaSegmentEfforts } from '../_shared/cycling-v1/segments.ts';
import { computeCtlAtl } from '../_shared/cycling-v1/ride-physiology.ts';
import { getArcContext } from '../_shared/arc-context.ts';
import type { ArcNarrativeContextV1 } from '../_shared/arc-narrative-state.ts';
import { getTrainingLoadContext } from '../_shared/fact-packet/queries.ts';
import { fetchPlanContextForWorkout } from '../_shared/plan-context.ts';
import { isPlanTransitionWindowByWeekIndex } from '../_shared/plan-week.ts';
import { formatLocalDate, mondayOfCalendarYmd, parseLocalDate } from '../_shared/parse-local-date.ts';
import {
  fetchCyclingGoalRaceCompletion,
  type CyclingGoalRaceCompletionMatch,
} from '../_shared/cycling-goal-race-completion.ts';
import {
  assessCyclingLimiter,
  fetchCyclingPRs,
  fetchCyclingVsSimilar,
  resolveWeightKg,
} from '../_shared/cycling-v1/cross-workout-queries.ts';
import type {
  CyclingLimiterV1,
  CyclingPRsV1,
  CyclingVsSimilarV1,
} from '../_shared/cycling-v1/cross-workout-types.ts';
import { runOnlyKeyScrub } from '../_shared/cross-sport-key-scrub.ts';

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

// =============================================================================
// CYCLING ADHERENCE SUMMARY (Tier 3 item 7 of running→cycling delta map)
// =============================================================================
// Structured wrapper mirroring `analyze-running-workout`'s WorkoutAdherenceSummary
// (analyze-running-workout/index.ts:3170-3175). Same shape — verdict + structured
// technical_insights array + plan_impact — so client renderers don't need to
// branch on sport for this surface.
//
// Cycling builds it from the inputs cycling already produces:
//   - performance.execution_score / power_adherence / duration_adherence
//   - intervalBreakdown (per-interval adherence_percentage)
//   - cyclingFactPacketV1.facts (NP, IF, classified_type)
//   - hrAnalysis (hr_drift_bpm + early_avg_hr → drift_pct)
//
// Running's equivalent is ~640 lines because it carries marathon goal-race branches,
// terrain context, weather adjustments, etc. The cycling version is intentionally
// smaller (~120 lines) — same SHAPE, no domain features that don't apply.

export interface CyclingAdherenceSummary {
  verdict: string;
  technical_insights: { label: string; value: string }[];
  plan_impact: { focus: string; outlook: string };
}

/**
 * Pure function — testable in isolation. All inputs already exist in the cycling
 * analyzer's working set; this wraps them into the shape running's adherence_summary
 * has used since the structured-debrief work landed.
 *
 * Returns null when there are no work intervals (e.g., free ride, recovery spin) —
 * matches running's behavior of suppressing structured summary for non-prescribed
 * sessions where adherence has no anchor.
 */
export function generateCyclingAdherenceSummary(opts: {
  performance: {
    execution_score?: number | null;
    execution_adherence?: number | null;
    power_adherence?: number | null;
    duration_adherence?: number | null;
  } | null | undefined;
  intervalBreakdown: Array<{ interval_type?: string; adherence_percentage?: number; adherence?: number }> | null | undefined;
  factPacket: { facts?: { normalized_power_w?: number | null; intensity_factor?: number | null; classified_type?: string | null } | null } | null | undefined;
  /** Computed from `hrAnalysis.hr_drift_bpm / hrAnalysis.early_avg_hr * 100`; null when HR unavailable. */
  hrDriftPct: number | null;
}): CyclingAdherenceSummary | null {
  const intervals = Array.isArray(opts.intervalBreakdown) ? opts.intervalBreakdown : [];
  const workIntervals = intervals.filter((i) => i?.interval_type === 'work');
  if (workIntervals.length === 0) return null;

  const exec = (opts.performance?.execution_score ?? opts.performance?.execution_adherence ?? null) as number | null;
  const powerAdh = (opts.performance?.power_adherence ?? null) as number | null;

  // Verdict (single-line summary). Same severity tiers running uses for status_label.
  let verdict = 'Workout completed.';
  if (typeof exec === 'number') {
    if (exec >= 90) verdict = 'Excellent execution — power held steady through the prescribed work.';
    else if (exec >= 80) verdict = 'Solid execution — power adherence was strong with minor variation.';
    else if (exec >= 65) verdict = 'Acceptable execution — power drifted from target on some intervals.';
    else verdict = 'Below target — power adherence was off; review pacing strategy or revisit FTP if pattern persists.';
  }

  const technical_insights: { label: string; value: string }[] = [];

  if (typeof powerAdh === 'number') {
    technical_insights.push({
      label: 'Power adherence',
      value: `${Math.round(powerAdh)}% of work-interval time within the prescribed power range.`,
    });
  }

  // Per-interval hit rate. Same hit-window [85, 115] as running (analyze-running-workout
  // uses the same threshold) and as compute-facts/buildRideFacts (intervals_hit logic).
  const hits = workIntervals.filter((i) => {
    const adh = i.adherence_percentage ?? i.adherence ?? 100;
    return adh >= 85 && adh <= 115;
  }).length;
  technical_insights.push({
    label: 'Interval execution',
    value: `${hits} of ${workIntervals.length} work intervals on target (within ±15% of prescribed power).`,
  });

  // HR drift interpretation. Cycling stores drift_bpm + early/late HR; convert to %
  // for the interpretation thresholds (which mirror running's drift bands).
  if (typeof opts.hrDriftPct === 'number' && Number.isFinite(opts.hrDriftPct)) {
    const drift = opts.hrDriftPct;
    if (Math.abs(drift) < 3) {
      technical_insights.push({
        label: 'Cardiac drift',
        value: `Heart rate stable (${drift > 0 ? '+' : ''}${drift.toFixed(1)}% drift). Aerobic system held steady throughout the ride.`,
      });
    } else if (drift >= 3 && drift < 8) {
      technical_insights.push({
        label: 'Cardiac drift',
        value: `Moderate HR drift (+${drift.toFixed(1)}%) — power held but HR climbed in the second half. Heat, hydration, or accumulated fatigue worth checking.`,
      });
    } else if (drift >= 8) {
      technical_insights.push({
        label: 'Cardiac drift',
        value: `Significant HR drift (+${drift.toFixed(1)}%). Indicates aerobic strain compounding through the ride; recovery may take longer than usual.`,
      });
    }
  }

  const facts = opts.factPacket?.facts;
  if (facts && typeof facts.normalized_power_w === 'number' && typeof facts.intensity_factor === 'number') {
    const ct = facts.classified_type ? String(facts.classified_type).replace(/_/g, ' ') : 'training stimulus';
    technical_insights.push({
      label: 'Intensity',
      value: `Normalized power ${facts.normalized_power_w}W at IF ${facts.intensity_factor.toFixed(2)} — ${ct} effort.`,
    });
  }

  // Plan impact. `focus` reflects what training adaptation this session targeted;
  // `outlook` is forward-looking guidance for the next session/week.
  const ctMap: Record<string, string> = {
    recovery: 'Active recovery',
    endurance: 'Aerobic base',
    endurance_long: 'Long aerobic',
    tempo: 'Tempo / muscular endurance',
    sweet_spot: 'Sweet spot / FTP development',
    threshold: 'Lactate threshold',
    vo2: 'VO2max / max aerobic power',
    anaerobic: 'Anaerobic capacity',
    neuromuscular: 'Neuromuscular / sprint',
    race_prep: 'Race preparation',
    brick: 'Brick / multi-sport transition',
  };
  const focus = (facts?.classified_type && ctMap[facts.classified_type]) || 'General aerobic';

  let outlook = 'Standard recovery sufficient before next quality session.';
  if (typeof exec === 'number') {
    if (exec >= 85) {
      outlook = 'Quality session executed well — proceed with planned next session.';
    } else if (exec >= 70) {
      outlook = 'Adequate stimulus delivered. Standard recovery; review power targets if pattern persists.';
    } else {
      outlook = 'Suboptimal stimulus — consider adjusting next session intensity or extending recovery before the next hard ride.';
    }
  }

  return {
    verdict,
    technical_insights,
    plan_impact: { focus, outlook },
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
  
  // Calculate HR zones if maxHR provided. `zoneTime` declared at the function scope
  // so the return statement below can reference it — was previously `const`-declared
  // inside the `if (maxHR)` block, which made it block-scoped and threw ReferenceError
  // at runtime on `zone_time: hrZones ? zoneTime : null` whenever maxHR was truthy.
  // The error was masked by an upstream try/catch in the handler, producing analyses
  // missing the zone_time field rather than failing visibly. Found via deno check
  // surfacing TS2304 'Cannot find name zoneTime'; fix verified by empirical scope test.
  let hrZones = null;
  const zoneTime: Record<string, number> = {};
  if (maxHR) {
    hrZones = calculateHeartRateZones(maxHR);
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

function toDateOnly(val: any): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function isoWeekStartMonday(isoDate: string): string {
  return mondayOfCalendarYmd(isoDate);
}

function isoDateAddDays(isoDate: string, days: number): string {
  const d = parseLocalDate(isoDate);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

async function inferPlanIdForDate(
  supabase: any,
  userId: string,
  workoutDateIso: string
): Promise<string | null> {
  const d0 = toDateOnly(workoutDateIso);
  if (!d0) return null;
  const weekStart = isoWeekStartMonday(d0);
  const weekEnd = isoDateAddDays(weekStart, 6);

  // Prefer plan ids that actually have planned_workouts in this week.
  try {
    const { data: plannedRows, error } = await supabase
      .from('planned_workouts')
      .select('training_plan_id,date,workout_status')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd);
    if (!error && Array.isArray(plannedRows)) {
      const ids = plannedRows
        .map((r: any) => String(r?.training_plan_id || '').trim())
        .filter(Boolean);
      if (ids.length) return ids[0];
    }
  } catch {}

  // Fallback: any active plan.
  try {
    const { data: plan } = await supabase
      .from('plans')
      .select('id,config')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plan?.id) return String(plan.id);
  } catch {}

  return null;
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
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    console.warn('⚠️ ANTHROPIC_API_KEY not set, skipping AI narrative generation');
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
    const { callLLM } = await import('../_shared/llm.ts');
    const raw = await callLLM({
      system: 'You are a data analyst converting workout metrics into factual observations. Never use motivational language.',
      user: prompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    if (!raw) throw new Error('Empty response from LLM');
    const content = raw.trim();
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
        planned_id, user_id, date, moving_time, duration, distance, elevation_gain, workout_status, workload_actual, workload_planned,
        achievements
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

    // Get user baselines (for FTP). Tier 3 item 10 also pulls `weight` for the W/kg
    // limiter signal; without it we fall back to the NP-trend path in the limiter.
    let baselines = {};
    let userUnits = 'imperial';
    let userWeight: number | null = null;
    try {
      const { data: userBaselines } = await supabase
        .from('user_baselines')
        .select('performance_numbers, units, weight')
        .eq('user_id', workout.user_id)
        .single();

      if (userBaselines?.units === 'metric' || userBaselines?.units === 'imperial') {
        userUnits = userBaselines.units;
      }
      baselines = userBaselines?.performance_numbers || {};
      userWeight = typeof userBaselines?.weight === 'number' ? userBaselines.weight : null;
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
    
    // D-035: Unlinked-ride null-override. Without a plan, "adherence" is
    // meaningless — there's nothing to be measured against. power_variability
    // (NP, CV, VI) keeps computing on actual ride data; those are honest
    // single-workout signals that still feed the variance gate (D-034).
    const _hasLinkedPlan = !!plannedWorkout;
    const performance = _hasLinkedPlan ? {
      execution_adherence: executionAdherence,
      // Alias: downstream consumers (coach Tier 4 work, Tier 3 #10 cross-workout
      // queries, glance status_label) read `execution_score` to mirror running's
      // analyzer field naming. Same value, two field names — closes the Cat A
      // type-debt errors filed in MAINTENANCE-DEBT.md (analyze-cycling-workout's
      // local performance type was narrower than what runtime constructs/reads).
      execution_score: executionAdherence,
      power_adherence: powerAdherence,
      duration_adherence: durationAdherenceValue,
      completed_steps: workIntervals.length,
      total_steps: intervals.length
    } : {
      execution_adherence: null,
      execution_score: null,
      power_adherence: null,
      duration_adherence: null,
      completed_steps: null,
      total_steps: null,
    };
    if (!_hasLinkedPlan) {
      console.log('🔓 [D-035] Unlinked cycling workout — adherence fields nulled');
    }
    
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

    // Prefer server-computed overall power metrics when available (matches UI readouts).
    const avgPower = (() => {
      const v = Number(
        (workout as any)?.computed?.overall?.avg_power_w ??
        (workout as any)?.computed?.overall?.avg_power ??
        (workout as any)?.avg_power ??
        (workout as any)?.metrics?.avg_power ??
        (workout as any)?.average_watts
      );
      if (Number.isFinite(v) && v >= 0) return Math.round(v);
      return powerSamples.length > 0
        ? Math.round(powerSamples.reduce((sum, p) => sum + p, 0) / powerSamples.length)
        : 0;
    })();
    const normalizedPower = (() => {
      const v = Number(
        // Canonical: compute-workout-analysis's full-series NP. computed.overall.*
        // is never populated at the overall level (compute-workout-summary writes
        // power only per-interval/segment) so it always fell through to provider/
        // device power, which disagreed with the analyzer. analysis.power is the
        // same source compute-facts:1124 trusts.
        (workout as any)?.computed?.analysis?.power?.normalized_power ??
        (workout as any)?.computed?.overall?.normalized_power_w ??
        (workout as any)?.computed?.overall?.normalized_power ??
        (workout as any)?.normalized_power ??
        (workout as any)?.metrics?.normalized_power ??
        (workout as any)?.weighted_average_watts
      );
      if (Number.isFinite(v) && v >= 0) return Math.round(v);
      return calculateNormalizedPower(powerSamples);
    })();

    // Canonical VI/IF from computed.analysis.power.* — passed straight through to
    // the fact packet as overrides so the packet (and the classifier's VI/IF
    // gate) reason over the analyzer's full-series numbers, not a re-derivation
    // from provider/device avg/NP. Null when the analyzer didn't write them
    // (e.g. FTP missing at analysis time) → fact packet recomputes per-metric.
    const canonicalVariabilityIndex = (() => {
      const v = Number((workout as any)?.computed?.analysis?.power?.variability_index);
      return Number.isFinite(v) && v > 0 ? v : null;
    })();
    const canonicalIntensityFactor = (() => {
      const v = Number((workout as any)?.computed?.analysis?.power?.intensity_factor);
      return Number.isFinite(v) && v > 0 ? v : null;
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

    // Plan context: even for unplanned workouts, infer active plan for this week.
    let planContext: any | null = null;
    try {
      const workoutDateIso = String((workout as any)?.date || '');
      const userId = String((workout as any)?.user_id || '');
      const plannedPlanId = String((plannedWorkout as any)?.training_plan_id || '').trim();
      const inferredPlanId = plannedPlanId || (await inferPlanIdForDate(supabase as any, userId, workoutDateIso));
      if (inferredPlanId && userId && workoutDateIso) {
        planContext = await fetchPlanContextForWorkout(
          supabase as any,
          userId,
          inferredPlanId,
          workoutDateIso
        );
      }
    } catch (e) {
      console.log('⚠️ Failed to fetch plan context for cycling:', e);
      planContext = null;
    }

    // Canonical, deterministic cycling fact packet + flags + coaching paragraph
    const cyclingFactPacketV1 = buildCyclingFactPacketV1({
      workout,
      plannedWorkout,
      powerSamplesW: powerSamples as number[],
      avgPowerW: avgPower || null,
      normalizedPowerW: normalizedPower || null,
      variabilityIndexOverride: canonicalVariabilityIndex,
      intensityFactorOverride: canonicalIntensityFactor,
      // Total ride elevation gain (metres) for the classifier's elevation
      // density gate — `workouts.elevation_gain`, added to the SELECT above.
      elevationGainM: (() => {
        const v = Number((workout as any)?.elevation_gain);
        return Number.isFinite(v) && v > 0 ? v : null;
      })(),
      avgHr: (hrAnalysis as any)?.available ? Number((hrAnalysis as any)?.average_hr ?? (hrAnalysis as any)?.average_heart_rate) : null,
      maxHr: (hrAnalysis as any)?.available ? Number((hrAnalysis as any)?.max_hr ?? (hrAnalysis as any)?.max_heart_rate) : null,
      ftpW,
      trainingLoad: trainingLoadContext,
      planContext,
      userUnits: (userUnits === 'metric' || userUnits === 'imperial') ? (userUnits as any) : null,
    });
    const cyclingFlagsV1 = generateCyclingFlagsV1(cyclingFactPacketV1, trainingLoadContext);

    // ai_summary is generated AFTER the cross-workout block below so the narrative
    // can use vs_similar_v1 / achievements_v1 / np_trend_v1 / limiter_v1 (mirrors
    // analyze-running-workout, whose fact packet carries comparisons before the
    // summary runs). Generating here (the old position) produced a context-blind
    // template-grade paragraph because none of that data existed yet.
    let ai_summary: string | null = null;
    let ai_summary_generated_at: string | null = null;

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

    // Build structured adherence summary (Tier 3 item 7 — mirrors running's
    // `adherence_summary` shape so client renderers don't sport-branch).
    // HR drift % computed from cycling's hr_drift_bpm + early_avg_hr (cycling
    // stores absolute beats; running stores percent — convert here for symmetry).
    const cyclingHrDriftPct = (
      hrAnalysis?.available &&
      typeof hrAnalysis?.hr_drift_bpm === 'number' &&
      typeof hrAnalysis?.early_avg_hr === 'number' &&
      hrAnalysis.early_avg_hr > 0
    )
      ? (hrAnalysis.hr_drift_bpm / hrAnalysis.early_avg_hr) * 100
      : null;
    const adherenceSummary = generateCyclingAdherenceSummary({
      performance,
      intervalBreakdown,
      factPacket: cyclingFactPacketV1,
      hrDriftPct: cyclingHrDriftPct,
    });
    console.log('📝 [ADHERENCE SUMMARY] verdict:', adherenceSummary?.verdict ?? '(null)', 'technical_insights:', adherenceSummary?.technical_insights?.length ?? 0, 'plan_impact:', !!adherenceSummary?.plan_impact);

    // Existing workout_analysis fetched UP HERE (was below analysisPayload pre-Tier-3-9)
    // so the goal-race snapshot fallback for course_strategy_zones can read prior values
    // when the current run doesn't find them. Mirrors running's prevWa pattern at
    // analyze-running-workout/index.ts:2374-2382.
    const { data: existingRowForMerge, error: existingRowErr } = await supabase
      .from('workouts')
      .select('workout_analysis')
      .eq('id', workout_id)
      .single();
    if (existingRowErr) {
      console.log('⚠️ Failed to read existing workout_analysis for cycling merge:', existingRowErr.message);
    }
    const existingAnalysis = (existingRowForMerge as any)?.workout_analysis || {};

    // Tier 3 item 9 — cycling goal-race detection (structural ship). Matches when this
    // workout is the bike leg of a tri goal on its target_date. `is_goal_race` flag
    // mirrors running; `course_strategy_zones` snapshots the bike-leg pre-race plan
    // (defense-in-depth: falls back to prior workout_analysis snapshot if available).
    // `race_debrief_text` is null for now — LLM narrative deferred to a separate ship.
    let cyclingGoalRaceMatch: CyclingGoalRaceCompletionMatch = { matched: false, eventName: '' };
    try {
      cyclingGoalRaceMatch = await fetchCyclingGoalRaceCompletion(
        supabase,
        String((workout as any).user_id),
        workout as any,
      );
      console.log(`🏁 [CYCLING GOAL RACE] matched=${cyclingGoalRaceMatch.matched} distanceKey=${cyclingGoalRaceMatch.distanceKey ?? '(none)'} hasZones=${!!cyclingGoalRaceMatch.courseStrategyZones?.length}`);
    } catch (e) {
      console.warn('[analyze-cycling-workout] goal-race match failed:', e);
    }
    const courseStrategyZonesUsed =
      cyclingGoalRaceMatch.courseStrategyZones ??
      ((existingAnalysis as Record<string, unknown> | null | undefined)?.course_strategy_zones ?? null);

    // ── Tier 3 item 10 — cycling cross-workout queries (per D-010) ──────────
    // Three signals: power-curve PRs (achievements_v1), vs-similar comparison
    // (vs_similar_v1), and limiter signal (limiter_v1). Each is independently null
    // when minimum data thresholds aren't met (5+ rides for PRs, 3+ matches for
    // vs-similar, bodyweight+FTP+tri-context for W/kg path with NP-trend fallback).
    let cyclingPRs: CyclingPRsV1 | null = null;
    let cyclingVsSimilar: CyclingVsSimilarV1 | null = null;
    let cyclingLimiter: CyclingLimiterV1 = { flag: 'none', source: 'insufficient_data', detail: 'Cross-workout queries skipped (analyzer error path).' };
    // Declared at cross-workout scope (not inside the NP-samples try) so it's visible
    // in the analysisPayload below — same scoping rule as cyclingVsSimilar/limiter.
    let npTrendV1: { points: Array<{ date: string; value: number; avg_hr: number | null; is_current: boolean }> } | null = null;
    // 20-min power best dated series — design Build Order #1 Mode 2 ("20-min
    // power best over last 90 days"). Built in the SAME historical loop / SAME
    // query as npTrendV1 (no new query, table, migration or function); reads
    // computed.power_curve['20min'] per ride. Declared at cross-workout scope
    // (same hoist as npTrendV1) so it's visible in analysisPayload.
    let pwr20TrendV1:
      | { points: Array<{ date: string; value: number; avg_hr: number | null; is_current: boolean }>; classified_type: string }
      | null = null;
    // CTL/ATL/TSB fitness model — design Build Order #7. Built from
    // computed.analysis.power.tss (#3) over the same 90d query; cross-workout
    // scope so it's visible in analysisPayload (same hoist as the trend series).
    let fitnessV1: { ctl: number; atl: number; tsb: number; tss_today: number | null } | null = null;
    try {
      // §1 PRs — best 20-min / 5-min / 1-min on 90d + all-time windows.
      cyclingPRs = await fetchCyclingPRs(supabase, {
        userId: String((workout as any).user_id),
        currentWorkoutId: workout_id!,
        // PR attribution: lets fetchCyclingPRs flag set_on_current_ride so the
        // narrative doesn't claim prior-ride bests were set today. The query
        // still excludes this workout — this is the only current-ride input.
        currentPowerCurve: ((workout as any)?.computed?.power_curve &&
          typeof (workout as any).computed.power_curve === 'object')
          ? (workout as any).computed.power_curve
          : null,
      });

      // §2 vs-similar — match on classified_type + duration ±20%.
      // D-073: thread currentAvgHr + currentHrDriftBpm so the pool computes
      // hr_delta_bpm / drift_delta_bpm against the matched rides (mirror of
      // run-side D-038 / D-047 HR field flow). Resolution mirrors the run
      // side: avg HR from the workout's `computed.overall.avg_hr` via the
      // shared three-stage helper; drift from `hrAnalysis.hr_drift_bpm`
      // (computed earlier in this analyzer at line ~1958).
      const facts = (cyclingFactPacketV1 as any)?.facts ?? {};
      const currentAvgHrForPool = ((): number | null => {
        const raw = (workout as any)?.computed?.overall?.avg_hr
          ?? (workout as any)?.computed?.overall?.avg_heart_rate
          ?? (workout as any)?.avg_heart_rate;
        const n = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      })();
      const currentHrDriftForPool: number | null =
        (hrAnalysis && typeof (hrAnalysis as any).hr_drift_bpm === 'number' && Number.isFinite((hrAnalysis as any).hr_drift_bpm))
          ? Math.round((hrAnalysis as any).hr_drift_bpm)
          : null;
      cyclingVsSimilar = await fetchCyclingVsSimilar(supabase, {
        userId: String((workout as any).user_id),
        currentWorkoutId: workout_id!,
        currentClassifiedType: String(facts.classified_type ?? 'unknown'),
        currentDurationMin: Number(facts.total_duration_min ?? 0),
        currentNp: Number.isFinite(facts.normalized_power) ? Number(facts.normalized_power) : null,
        currentIf: Number.isFinite(facts.intensity_factor) ? Number(facts.intensity_factor) : null,
        currentExecScore: typeof performance?.execution_score === 'number' ? performance.execution_score : null,
        currentAvgHr: currentAvgHrForPool,
        currentHrDriftBpm: currentHrDriftForPool,
      });

      // §3 Limiter — W/kg vs age-group norms (tri) or NP-trend fallback.
      // Tri detection: prefer the goal-race match's distanceKey when this workout IS
      // the goal race; otherwise check for any active tri 'event' goal.
      let isTriAthlete = false;
      let raceDistance: '70.3' | 'full' | null = null;
      if (cyclingGoalRaceMatch.matched && cyclingGoalRaceMatch.distanceKey) {
        isTriAthlete = true;
        raceDistance = cyclingGoalRaceMatch.distanceKey;
      } else {
        try {
          const { data: triGoals } = await supabase
            .from('goals')
            .select('id, sport, distance')
            .eq('user_id', (workout as any).user_id)
            .eq('goal_type', 'event')
            .ilike('sport', '%tri%')
            .limit(5);
          if (Array.isArray(triGoals) && triGoals.length > 0) {
            isTriAthlete = true;
            // Pick the first match's distance for the W/kg norm. If multiple goals
            // exist (e.g., 70.3 → full IM progression), the closest-upcoming would
            // be more correct — but that's a goal-context refinement for later.
            const dist = String(triGoals[0]?.distance ?? '').toLowerCase();
            if (dist.includes('70.3') || dist.includes('half')) raceDistance = '70.3';
            else if (dist.includes('full') || dist.includes('iron') || dist.includes('140.6')) raceDistance = 'full';
          }
        } catch (e) {
          console.warn('[analyze-cycling-workout] tri-goal detection failed (non-fatal):', e);
        }
      }

      // NP samples for the trend fallback. Two windows: recent ~14d + 90d baseline.
      // Skipped silently if the query fails — limiter falls through to insufficient_data.
      let recentNpSamples: number[] = [];
      let ninetyDayNpSamples: number[] = [];
      // Dated NP series for the cycling Trend sparkline. The 90d query below already
      // pulls {date, computed} per ride; running's trend reads a dated trend_points
      // array, cycling had none (vs_similar_v1 is a delta-summary, not a series), so
      // the chart could never render. Build the series here from data already fetched
      // (no extra query) and persist as np_trend_v1 — independent of CyclingVsSimilarV1
      // so its typed shape / tests don't ripple. (npTrendV1 declared at outer scope.)
      const npDated: Array<{ date: string; np: number; hr: number | null }> = [];
      const pwr20Dated: Array<{ date: string; w20: number; hr: number | null }> = [];
      const tssByDate = new Map<string, number>(); // design #7: daily TSS sum
      try {
        const today = new Date().toISOString().slice(0, 10);
        const ninetyAgo = (() => {
          const d = new Date(today + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() - 90);
          return d.toISOString().slice(0, 10);
        })();
        const fourteenAgo = (() => {
          const d = new Date(today + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() - 14);
          return d.toISOString().slice(0, 10);
        })();
        const { data: npRows, error: npErr } = await supabase
          .from('workouts')
          // Select ONLY `id, date, computed`. The whole `computed` JSONB carries
          // everything rideComputedNp needs — canonical
          // computed.analysis.power.normalized_power (mirrors compute-facts:1124)
          // plus computed.overall.* fallbacks. A prior change broadened this to
          // also select normalized_power / weighted_average_watts / metrics as
          // sibling columns; those may not exist on `workouts`, and PostgREST
          // 400s the ENTIRE query if any selected column is unknown — leaving
          // npRows null and the trend silently empty even though the data is in
          // `computed`. workout_analysis added so pwr20_trend can be filtered to
          // the current ride's classified_type (fact_packet_v1.facts.classified_type).
          // avg_heart_rate is a REAL workouts column (compute-facts reads it),
          // added for the historical HR resolve below (Q-007) — do NOT strip
          // it as a projection-footgun candidate, it exists.
          .select('id, date, computed, workout_analysis, avg_heart_rate')
          .eq('user_id', (workout as any).user_id)
          .in('type', ['ride', 'cycling', 'bike'])
          .eq('workout_status', 'completed')
          .neq('id', workout_id)
          .gte('date', ninetyAgo)
          .order('date', { ascending: false })
          .limit(120);
        if (npErr) {
          console.warn('[analyze-cycling-workout] np_trend rows fetch failed (trend will be empty):', npErr.message);
        }
        // Mode-aware TREND: the 20-min-power series is filtered to the current
        // ride's classified_type so the sparkline compares like-for-like (a vo2
        // 20-min best vs prior vo2 20-min bests, not vs an endurance ride).
        // 'unknown'/absent → null = no meaningful same-type set → series stays
        // under the ≥3 gate and build.ts falls back to np_trend.
        const curType = (cyclingFactPacketV1?.facts?.classified_type &&
          String(cyclingFactPacketV1.facts.classified_type).toLowerCase() !== 'unknown')
          ? String(cyclingFactPacketV1.facts.classified_type).toLowerCase()
          : null;
        for (const r of (Array.isArray(npRows) ? npRows : [])) {
          // Was `computed.overall.normalized_power` (no `_w`) — wrong field, so
          // rides written with the canonical `normalized_power_w` resolved to
          // NaN and the trend never reached 3 points. rideComputedNp tries `_w`
          // first then the legacy alias (same fix pattern as commit cead4e9e).
          const np = rideComputedNp(r);
          // 20-min power best for this historical ride (design Mode 2 series).
          // Independent of NP availability — collected even if `np == null`.
          const w20h = Number((r as any)?.computed?.power_curve?.['20min']);
          // Avg HR for the dual-line TREND (design #1b — mirrors running's
          // pace+HR sparkline). computed.overall.avg_hr is frequently null
          // (only set from an hr_bpm series), so the dashed HR line never had
          // ≥3 points. Resolve through the fact packet then the reliable
          // workouts.avg_heart_rate column (added to the SELECT above) — same
          // SELECT-projection class as the normalized_power_w / achievements /
          // elevation_gain fixes. Each candidate guarded individually (a stored
          // 0/null must fall through, not short-circuit — Number(null)===0). Q-007.
          const hrH = (() => {
            const cands = [
              (r as any)?.computed?.overall?.avg_hr,
              (r as any)?.workout_analysis?.fact_packet_v1?.facts?.avg_hr,
              (r as any)?.avg_heart_rate,
            ];
            for (const c of cands) {
              const h = Number(c);
              if (Number.isFinite(h) && h > 0) return Math.round(h);
            }
            return null;
          })();
          // Same-classified_type filter. Canonical source is
          // workout_analysis.fact_packet_v1.facts.classified_type; top-level
          // workout_analysis.classified_type is the fallback (it's nulled by the
          // cross-sport scrub on some rows, so the fact-packet path is primary).
          const histType = (() => {
            const wa = (r as any)?.workout_analysis;
            const t = wa?.fact_packet_v1?.facts?.classified_type ?? wa?.classified_type ?? null;
            return t ? String(t).toLowerCase() : null;
          })();
          if (r?.date && Number.isFinite(w20h) && w20h > 0 && curType && histType === curType) {
            pwr20Dated.push({ date: String(r.date), w20: Math.round(w20h), hr: hrH });
          }
          // Daily TSS for the CTL/ATL model (design #7) — sum if multiple
          // rides share a date.
          const tssH = Number((r as any)?.computed?.analysis?.power?.tss);
          if (r?.date && Number.isFinite(tssH) && tssH > 0) {
            const dk = String(r.date).slice(0, 10);
            tssByDate.set(dk, (tssByDate.get(dk) || 0) + tssH);
          }
          if (np == null) continue;
          ninetyDayNpSamples.push(np);
          if (String(r.date) >= fourteenAgo) recentNpSamples.push(np);
          if (r?.date) npDated.push({ date: String(r.date), np, hr: hrH });
        }
        // Add the current ride as the is_current point, then sort ascending and
        // cap to the most recent 12 so the sparkline stays readable.
        const factsNp = Number(cyclingFactPacketV1?.facts?.normalized_power_w);
        const currentNp = (Number.isFinite(factsNp) && factsNp > 0)
          ? factsNp
          : (rideComputedNp(workout) ?? NaN);
        const currentDate = String((workout as any)?.date || '');
        // Current ride avg HR for the dual-line TREND is_current point (design #1b).
        const currentHr = (() => {
          const h = Number(
            cyclingFactPacketV1?.facts?.avg_hr ?? (workout as any)?.computed?.overall?.avg_hr,
          );
          return Number.isFinite(h) && h > 0 ? Math.round(h) : null;
        })();
        const byDate = new Map<string, { date: string; value: number; avg_hr: number | null; is_current: boolean }>();
        for (const d of npDated) byDate.set(d.date, { date: d.date, value: d.np, avg_hr: d.hr, is_current: false });
        if (Number.isFinite(currentNp) && currentNp > 0 && currentDate) {
          byDate.set(currentDate, { date: currentDate, value: Math.round(currentNp), avg_hr: currentHr, is_current: true });
        }
        const pts = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
        if (pts.length >= 3) npTrendV1 = { points: pts };

        // 20-min power best dated series (design Mode 2). Same shape / same ≥3
        // gate as npTrendV1; current ride's 20-min from its own computed.
        const curW20 = Number((workout as any)?.computed?.power_curve?.['20min']);
        const w20ByDate = new Map<string, { date: string; value: number; avg_hr: number | null; is_current: boolean }>();
        for (const d of pwr20Dated) w20ByDate.set(d.date, { date: d.date, value: d.w20, avg_hr: d.hr, is_current: false });
        if (Number.isFinite(curW20) && curW20 > 0 && currentDate) {
          w20ByDate.set(currentDate, { date: currentDate, value: Math.round(curW20), avg_hr: currentHr, is_current: true });
        }
        const w20pts = Array.from(w20ByDate.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
        // ≥3 SAME-TYPE rides required (current ride is always same-type, so
        // ≥3 means ≥2 prior of this type). Under that, pwr20TrendV1 stays null
        // and build.ts pickCyclingTrendSeries falls back to np_trend_v1.
        if (w20pts.length >= 3 && curType) pwr20TrendV1 = { points: w20pts, classified_type: curType };

        // CTL/ATL/TSB (design #7): dense daily TSS series across the 90d query
        // window (rest days = 0), including the current ride's own TSS.
        try {
          const curTss = Number((workout as any)?.computed?.analysis?.power?.tss);
          if (Number.isFinite(curTss) && curTss > 0 && currentDate) {
            const ck = currentDate.slice(0, 10);
            tssByDate.set(ck, (tssByDate.get(ck) || 0) + curTss);
          }
          const dayMs = 86400000;
          const start = new Date(ninetyAgo + 'T00:00:00Z').getTime();
          const end = new Date(today + 'T00:00:00Z').getTime();
          if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            const daily: number[] = [];
            for (let ms = start; ms <= end; ms += dayMs) {
              const dk = new Date(ms).toISOString().slice(0, 10);
              daily.push(tssByDate.get(dk) || 0);
            }
            const fit = computeCtlAtl(daily);
            if (fit) {
              fitnessV1 = {
                ctl: fit.ctl,
                atl: fit.atl,
                tsb: fit.tsb,
                tss_today: Number.isFinite(curTss) && curTss > 0 ? Math.round(curTss) : null,
              };
            }
          }
        } catch { /* non-fatal */ }
      } catch (e) {
        console.warn('[analyze-cycling-workout] NP-samples fetch failed (non-fatal):', e);
      }

      cyclingLimiter = assessCyclingLimiter({
        weightKg: resolveWeightKg(userWeight, userUnits),
        ftpW,
        isTriAthlete,
        raceDistance,
        recentNpSamples,
        ninetyDayNpSamples,
      });
      console.log(`🚴 [CYCLING CROSS-WORKOUT] PRs sample=${cyclingPRs?.sample_size ?? 0}, vs-similar n=${cyclingVsSimilar?.sample_size ?? 0}, limiter flag=${cyclingLimiter.flag} source=${cyclingLimiter.source}`);
    } catch (e) {
      console.warn('[analyze-cycling-workout] cross-workout queries failed (non-fatal):', e);
    }

    // Segment history — design Build Order #6. Strava segment efforts from
    // workouts.achievements + synthetic Garmin climbs from the grade/elevation
    // series → cycling_segment_history (its own table per the unblock decision).
    // Fully non-fatal: the table is applied via the SQL editor (migration-
    // tracking divergence — see docs/MAINTENANCE-DEBT.md), so a missing table
    // or any error must NOT break analysis. Clean-replace per workout so
    // re-analyze is idempotent.
    try {
      const w: any = workout;
      const series = w?.computed?.analysis?.series || {};
      const efforts = [
        ...parseStravaSegmentEfforts(w?.achievements),
        ...detectClimbSegments(
          Array.isArray(series.time_s) ? series.time_s : [],
          Array.isArray(series.elevation_m) ? series.elevation_m : [],
          Array.isArray(series.grade_percent) ? series.grade_percent : [],
        ),
      ];
      if (efforts.length > 0 && workout_id && w?.user_id && w?.date) {
        const dateOnly = String(w.date).slice(0, 10);
        const seen = new Set<string>();
        const rows = efforts
          .filter((e) => {
            const k = `${e.source}|${e.segment_key}`;
            if (seen.has(k)) return false; // unique(workout_id,segment_key,source)
            seen.add(k);
            return true;
          })
          .map((e) => ({
            user_id: String(w.user_id),
            workout_id: String(workout_id),
            source: e.source,
            segment_key: e.segment_key,
            segment_id: e.segment_id,
            segment_name: e.segment_name,
            date: dateOnly,
            elapsed_time_s: e.elapsed_time_s,
            moving_time_s: e.moving_time_s,
            distance_m: e.distance_m,
            avg_power_w: e.avg_power_w,
            avg_hr_bpm: e.avg_hr_bpm,
            climb_gain_m: e.climb_gain_m,
            climb_vam_m_per_h: e.climb_vam_m_per_h,
          }));
        const del = await supabase.from('cycling_segment_history').delete().eq('workout_id', String(workout_id));
        if (del.error) throw del.error;
        const ins = await supabase.from('cycling_segment_history').insert(rows);
        if (ins.error) throw ins.error;
        console.log(`🚵 [SEGMENT HISTORY] wrote ${rows.length} efforts for workout ${workout_id}`);
      }
    } catch (e: any) {
      console.warn('[analyze-cycling-workout] segment-history upsert skipped (non-fatal — table may be unmigrated):', e?.message ?? e);
    }

    // Temporal Arc frame (post-race recovery / taper / race proximity / plan
    // phase) — same resolution + guard as analyze-running-workout:1985-1988.
    let arc_narrative_for_summary: ArcNarrativeContextV1 | null = null;
    try {
      const wdSlice = String((workout as any).date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(wdSlice) && (workout as any).user_id) {
        const arc = await getArcContext(supabase as any, (workout as any).user_id as string, `${wdSlice}T12:00:00.000Z`);
        arc_narrative_for_summary = arc.arc_narrative_context ?? null;
        console.log(`[analyze-cycling-workout] arc_narrative workout=${workout_id} mode=${arc_narrative_for_summary?.mode ?? 'n/a'} days_since_last_race=${arc_narrative_for_summary?.days_since_last_goal_race ?? 'n/a'}`);
      }
    } catch (arcSummErr) {
      console.warn('[analyze-cycling-workout] arc_narrative_for_summary skipped:', arcSummErr);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Variance gate — D-NNN (cycling). Hoisted before ai_summary so the LLM
    // input can drop the steady cross-workout block and replace it with an
    // interval-summary read for mixed-effort rides.
    // ─────────────────────────────────────────────────────────────────────────
    const _varGateRide = (() => {
      const vi = Number((enhancedAnalysis as any)?.power_variability?.variability_index);
      const cvPct = Number((enhancedAnalysis as any)?.power_variability?.coefficient_of_variation);
      const viValid = Number.isFinite(vi) && vi > 0;
      const cvValid = Number.isFinite(cvPct) && cvPct > 0;

      const viTrips = viValid && vi >= 1.05;
      const cvTrips = cvValid && cvPct >= 12;

      const plannedIntervalsLinked = !!plannedWorkout && (() => {
        const k = String((cyclingFactPacketV1 as any)?.facts?.classified_type || '').toLowerCase();
        return k === 'vo2' || k === 'vo2max' || k === 'threshold' ||
          k === 'sweet_spot' || k === 'intervals' || k === 'interval' ||
          k === 'fartlek' || k === 'tempo';
      })();

      let signal:
        | 'plan_intent_intervals' | 'variability_index' | 'power_cv' | null = null;
      if (plannedIntervalsLinked) signal = 'plan_intent_intervals';
      else if (viTrips) signal = 'variability_index';
      else if (cvTrips) signal = 'power_cv';

      const is_mixed_effort = signal !== null;

      const easyLikePlan = !!plannedWorkout && (() => {
        const k = String((cyclingFactPacketV1 as any)?.facts?.classified_type || '').toLowerCase();
        return k === 'endurance' || k === 'recovery' || k === 'easy';
      })();
      const classified_type_variance_override = is_mixed_effort && easyLikePlan;

      return {
        is_mixed_effort,
        variance_signal: signal,
        variability_index: viValid ? Math.round(vi * 100) / 100 : null,
        power_cv_pct: cvValid ? Math.round(cvPct * 10) / 10 : null,
        classified_type_variance_override,
      };
    })();

    // Cycling ai_summary — generated here so the narrative can lead with the
    // cross-workout comparison/trend (parity with analyze-running-workout).
    try {
      ai_summary = await generateCyclingAISummaryV1(cyclingFactPacketV1, cyclingFlagsV1, null, {
        vsSimilar: cyclingVsSimilar,
        achievements: cyclingPRs,
        npTrend: npTrendV1,
        // Type-filtered 20-min-power series — lets the narrative mirror the
        // TREND row's series selection (pwr20 if same-type ≥3, else np_trend)
        // so the cited ride count/type match what the row shows.
        pwr20Trend: pwr20TrendV1,
        limiter: cyclingLimiter,
        fitness: fitnessV1, // design #9 — CTL/ATL/TSB into the INSIGHTS narrative
      }, arc_narrative_for_summary, {
        isMixedEffort: _varGateRide.is_mixed_effort,
        intervalBreakdown: (detailedAnalysis as any)?.interval_breakdown ?? null,
      },
      // D-035: cycling unplanned gate. cross_workout stays populated for
      // unplanned rides (NP-vs-typical is honest history); the UNPLANNED MODE
      // prompt rule fires on is_unplanned in the display packet.
      { isUnplanned: !plannedWorkout });
      if (ai_summary) ai_summary_generated_at = new Date().toISOString();
    } catch (e) {
      console.log('⚠️ Cycling ai_summary generation failed:', e);
      ai_summary = null;
      ai_summary_generated_at = null;
    }

    // Save analysis - matches running analysis structure exactly
    const analysisPayload = {
      _meta: {
        version: "2.0",
        source: "analyze-cycling-workout",
        generated_at: new Date().toISOString(),
        generator_version: "2.0.0"
      },
      // Explicitly null run-only keys so the spread-merge below
      // (`{ ...existingAnalysis, ...analysisPayload }`) doesn't preserve stale run
      // analysis on cycling workouts. If this ride was ever analyzed by
      // analyze-running-workout (historical mis-route / mis-classified recompute),
      // these keys carry pace-per-mile splits + run verdict copy that the display
      // layer renders ("Mile 9 at 2:51/mi" on a ride). The cycling payload otherwise
      // has no corresponding keys, so the merge can't overwrite them — converting the
      // silent merge-gap into an explicit cross-sport scrub. Centralized + unit-tested
      // in _shared/cross-sport-key-scrub.ts; see docs/MAINTENANCE-DEBT.md
      // "Cross-sport analysis-key bleed".
      ...runOnlyKeyScrub(),
      granular_analysis: granularAnalysis,  // Same path as running for client compatibility
      performance: performance,
      detailed_analysis: detailedAnalysis,
      adherence_analysis: {
        power_adherence: powerAdherence,
        duration_adherence: durationAdherenceValue,
        time_in_range_s: enhancedAnalysis.time_in_range_s,
        time_outside_range_s: enhancedAnalysis.time_outside_range_s
      },
      adherence_summary: adherenceSummary ?? null,  // Structured: verdict + technical_insights + plan_impact (mirrors running)
      // Tier 3 item 9 — race-specific debrief structure (mirrors running's
      // analyze-running-workout/index.ts:2663-2671 field names so consumers don't
      // sport-branch). race_debrief_text stays null until the cycling-specific LLM
      // prompt lands as a follow-up.
      is_goal_race: cyclingGoalRaceMatch.matched === true,
      race_debrief_text: null,
      course_strategy_zones: courseStrategyZonesUsed,
      // Tier 3 item 10 — cycling cross-workout queries (per D-010). Each independently
      // null when minimum-data thresholds aren't met — see _shared/cycling-v1/
      // cross-workout-types.ts for the shape and minimum-data semantics.
      achievements_v1: cyclingPRs,
      vs_similar_v1: cyclingVsSimilar,
      limiter_v1: cyclingLimiter,
      // Dated NP series for the cycling Trend sparkline (see npTrendV1 build above).
      np_trend_v1: npTrendV1,
      pwr20_trend_v1: pwr20TrendV1,
      fitness_v1: fitnessV1,
    };

    console.log(`✅ Analysis payload structure:`, Object.keys(analysisPayload));
    console.log(`  - granular_analysis.interval_breakdown: ${intervalBreakdown.length} intervals`);

    if (!ai_summary && typeof (existingAnalysis as any)?.ai_summary === 'string') {
      ai_summary = (existingAnalysis as any).ai_summary;
      ai_summary_generated_at = typeof (existingAnalysis as any)?.ai_summary_generated_at === 'string'
        ? (existingAnalysis as any).ai_summary_generated_at
        : null;
      console.log('[analyze-cycling-workout] preserved previous ai_summary (LLM did not produce a new one)');
    }

    // _varGateRide is hoisted above generateCyclingAISummaryV1 so it can gate
    // the LLM input shape. The same values feed glance below.

    const sessionStateV1 = {
      version: 1,
      owner: 'analysis',
      generated_at: new Date().toISOString(),
      workout_id: workout_id,
      discipline: 'ride',
      glance: {
        status_label: typeof performance?.execution_score === 'number'
          ? (performance.execution_score >= 85 ? 'Strong execution' : performance.execution_score >= 70 ? 'Solid execution' : 'Needs adjustment')
          : null,
        execution_score: typeof performance?.execution_score === 'number' ? performance.execution_score : null,
        // Variance gate (D-NNN). See _varGateRide computation above.
        is_mixed_effort: _varGateRide.is_mixed_effort,
        variance_signal: _varGateRide.variance_signal,
        variability_index: _varGateRide.variability_index,
        power_cv_pct: _varGateRide.power_cv_pct,
        classified_type_variance_override: _varGateRide.classified_type_variance_override,
      },
      narrative: {
        text: ai_summary || null,
        source: ai_summary ? 'ai' : 'none',
      },
      summary: {
        title: 'Insights',
        bullets: Array.isArray(cyclingFlagsV1) ? cyclingFlagsV1.slice(0, 4).map((f: any) => String(f?.detail || f?.label || '').trim()).filter(Boolean) : [],
      },
      details: {
        fact_packet_v1: cyclingFactPacketV1 ?? null,
        flags_v1: cyclingFlagsV1 ?? null,
        adherence_summary: adherenceSummary ?? null,
      },
      guards: {
        is_transition_window: isPlanTransitionWindowByWeekIndex(planContext?.weekIndex),
        suppress_deviation_language: isPlanTransitionWindowByWeekIndex(planContext?.weekIndex),
      },
    };

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
          session_state_v1: sessionStateV1,
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
