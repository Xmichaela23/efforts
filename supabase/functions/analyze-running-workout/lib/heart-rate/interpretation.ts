/**
 * Interpretation Builder
 * 
 * Generates deterministic, template-based narratives for HR analysis.
 * No AI/LLM - same inputs always produce same outputs.
 */

import {
  WorkoutType,
  AnalysisType,
  DriftAnalysis,
  IntervalHRAnalysis,
  ZoneDistribution,
  EfficiencyMetrics,
  TrendAnalysis,
  HRAnalysisContext
} from './types.ts';

interface InterpretationInput {
  workoutType: WorkoutType;
  analysisType: AnalysisType;
  drift?: DriftAnalysis;
  intervals?: IntervalHRAnalysis;
  zones: ZoneDistribution;
  efficiency?: EfficiencyMetrics;
  trends?: TrendAnalysis;
  context: HRAnalysisContext;
}

// =============================================================================
// HEAT ALLOWANCE FOR PACE TOLERANCE
// =============================================================================

/**
 * Get additional pace tolerance based on temperature.
 * Hot conditions justify slower pacing without losing aerobic stimulus.
 */
export function getHeatAllowance(tempF: number | null | undefined): number {
  if (tempF === null || tempF === undefined) return 0;
  if (tempF > 85) return 0.12;  // +12%
  if (tempF > 75) return 0.07;  // +7%
  if (tempF > 65) return 0.03;  // +3%
  return 0;
}

/**
 * Base slowdown threshold for easy/long runs.
 * Running more than 15% slower than target = under-stimulated.
 */
export const BASE_SLOW_THRESHOLD = 0.15;

/**
 * Calculate effective slow floor with heat adjustment.
 */
export function getEffectiveSlowFloor(tempF: number | null | undefined): number {
  return BASE_SLOW_THRESHOLD + getHeatAllowance(tempF);
}

// =============================================================================
// CONDITIONS SEVERITY HELPER
// =============================================================================

type ConditionsSeverity = 'unknown' | 'low' | 'moderate' | 'high';

interface ConditionsSeverityResult {
  severity: ConditionsSeverity;
  climbRateFtPerHour: number | null;
}

/**
 * Calculate conditions severity based on temperature and terrain.
 * Returns 'unknown' if both temp and elevation are missing.
 */
function calculateConditionsSeverity(
  temperatureF: number | null | undefined,
  elevationGainFt: number | null | undefined,
  durationMinutes: number,
  terrainProfile: 'flat' | 'front_loaded' | 'back_loaded' | 'rolling' | 'throughout' | null | undefined
): ConditionsSeverityResult {
  // If both are missing, we can't assess conditions
  if ((temperatureF === null || temperatureF === undefined) && 
      (elevationGainFt === null || elevationGainFt === undefined)) {
    return { severity: 'unknown', climbRateFtPerHour: null };
  }
  
  let score = 0;
  let climbRateFtPerHour: number | null = null;
  
  // Heat contribution (0-3 points)
  if (temperatureF !== null && temperatureF !== undefined) {
    if (temperatureF >= 85) score += 3;
    else if (temperatureF >= 75) score += 2;
    else if (temperatureF >= 65) score += 1;
  }
  
  // Terrain contribution based on climb rate (0-3 points)
  // Only compute if we have valid duration
  if (elevationGainFt !== null && elevationGainFt !== undefined && durationMinutes > 0) {
    const durationHours = durationMinutes / 60;
    climbRateFtPerHour = elevationGainFt / durationHours;
    
    if (climbRateFtPerHour >= 600) score += 3;
    else if (climbRateFtPerHour >= 400) score += 2;
    else if (climbRateFtPerHour >= 200) score += 1;
  }
  // If durationMinutes is 0/missing, elevation contributes 0 to severity
  
  // Terrain profile modifier: back-loaded climbing is harder
  if (terrainProfile === 'back_loaded' || terrainProfile === 'late') {
    score += 1;
  }
  
  // Score to severity
  let severity: ConditionsSeverity;
  if (score >= 4) severity = 'high';
  else if (score >= 2) severity = 'moderate';
  else severity = 'low';
  
  return { severity, climbRateFtPerHour };
}

// =============================================================================
// EXPECTED DRIFT MODEL
// =============================================================================

interface DriftBand {
  lowerBpm: number;
  upperBpm: number;
  category: 'short' | 'moderate' | 'long' | 'extended';
}

type DriftClassification = 'below_expected' | 'normal' | 'elevated' | 'high';

/**
 * Get expected drift band based on duration and conditions.
 */
function getExpectedDrift(
  durationMinutes: number,
  conditionsSeverity: ConditionsSeverity
): DriftBand {
  // Base drift bands by duration
  let lower: number;
  let upper: number;
  let category: DriftBand['category'];
  
  if (durationMinutes < 45) {
    lower = 0; upper = 8; category = 'short';
  } else if (durationMinutes < 90) {
    lower = 4; upper = 12; category = 'moderate';
  } else if (durationMinutes < 150) {
    lower = 6; upper = 16; category = 'long';
  } else {
    lower = 8; upper = 20; category = 'extended';
  }
  
  // Severity modifier
  if (conditionsSeverity === 'high') {
    lower += 2;
    upper += 6;
  } else if (conditionsSeverity === 'moderate') {
    lower += 1;
    upper += 3;
  }
  // 'unknown' and 'low' get no modifier
  
  return { lowerBpm: lower, upperBpm: upper, category };
}

/**
 * Classify actual drift against expected band.
 */
function assessDriftBand(driftBpm: number, expected: DriftBand): DriftClassification {
  if (driftBpm < expected.lowerBpm) return 'below_expected';
  if (driftBpm <= expected.upperBpm) return 'normal';
  if (driftBpm <= expected.upperBpm + 5) return 'elevated';
  return 'high';
}

// =============================================================================
// STEADY-STATE NARRATIVE BUILDER
// =============================================================================

interface SteadyStateNarrativeInput {
  // Workout basics
  intent?: 'easy' | 'long' | 'recovery';
  durationMinutes: number;
  
  // Pace (optional)
  paceAdherencePct?: number;
  
  // Segment-level pace data (for long runs with fast finish)
  basePace?: string;        // Display pace for base portion (e.g., "11:10/mi")
  baseTargetPace?: string;  // Display target pace for base portion (e.g., "11:08/mi")
  baseSlowdownPct?: number;  // How much slower base portion was vs target (0.12 = 12% slow)
  finishOnTarget?: boolean;  // Whether finish segment hit target
  finishPace?: string;       // Display pace for finish (e.g., "9:56/mi")
  finishTargetPace?: string; // Display target pace for finish (e.g., "9:52/mi")
  finishDeltaSecPerMi?: number; // actual - target (sec/mi), + = slower
  hasFinishSegment?: boolean; // Whether workout has a distinct fast finish
  
  // HR drift (optional)
  hrDriftBpm?: number;
  earlyAvgHr?: number;
  lateAvgHr?: number;
  historicalAvgDriftBpm?: number; // user's typical drift for similar runs (bpm)
  
  // Conditions
  temperatureF?: number | null;
  elevationGainFt?: number | null;
  terrainProfile?: 'flat' | 'front_loaded' | 'back_loaded' | 'rolling' | 'throughout' | null;
  
  // Plan context
  phase?: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown';
  isLongestRunInPlan?: boolean;
}

/**
 * Build a synthesized narrative for steady-state workouts (easy/long/recovery).
 * Uses decision-tree logic with clear rules, not a data dump.
 * 
 * Key improvements:
 * - Heat-adjusted pace tolerance (slower pace in heat still achieves stimulus)
 * - HR drift as tie-breaker (if drift is normal, stimulus was achieved)
 * - Separate base vs finish assessment for long runs with fast finish
 */
function buildSteadyStateNarrative(input: SteadyStateNarrativeInput): string {
  const {
    intent,
    durationMinutes,
    paceAdherencePct,
    basePace,
    baseTargetPace,
    baseSlowdownPct,
    finishOnTarget,
    finishPace,
    finishTargetPace,
    finishDeltaSecPerMi,
    hasFinishSegment,
    hrDriftBpm,
    historicalAvgDriftBpm,
    temperatureF,
    elevationGainFt,
    terrainProfile,
    phase,
    isLongestRunInPlan
  } = input;
  
  const parts: string[] = [];

  const fmtDeltaSecPerMi = (deltaSec: number): string => {
    const s = Math.round(Math.abs(deltaSec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };
  
  // Compute conditions severity
  const { severity: conditionsSeverity } = calculateConditionsSeverity(
    temperatureF ?? null,
    elevationGainFt ?? null,
    durationMinutes,
    terrainProfile ?? null
  );
  
  // Compute drift band (if we have drift)
  let driftBand: DriftClassification | null = null;
  let expectedDrift: DriftBand | null = null;
  if (hrDriftBpm !== undefined && hrDriftBpm !== null) {
    expectedDrift = getExpectedDrift(durationMinutes, conditionsSeverity);
    driftBand = assessDriftBand(hrDriftBpm, expectedDrift);
  }
  
  // -------------------------------------------------------------------------
  // HEAT-ADJUSTED TOLERANCE + HR TIE-BREAKER
  // -------------------------------------------------------------------------
  const effectiveSlowFloor = getEffectiveSlowFloor(temperatureF);
  const hrSuggestsStimulus = driftBand === 'normal' || driftBand === 'elevated';
  const isWarm = temperatureF !== null && temperatureF !== undefined && temperatureF > 65;
  // Weather: only mention temp when severity >= moderate, always include the number
  // Map severity to adjective: moderate → "warm", high → "hot"
  const shouldMentionTemp = (conditionsSeverity === 'moderate' || conditionsSeverity === 'high') && temperatureF !== null && temperatureF !== undefined;
  const tempAdjective = conditionsSeverity === 'high' ? 'hot' : 'warm';
  const tempPhrase = shouldMentionTemp ? `${tempAdjective} conditions (${Math.round(temperatureF)}°F)` : 'warm conditions';
  
  // Determine if base portion was undercooked (beyond heat-adjusted tolerance)
  const baseUndercooked = baseSlowdownPct !== undefined && baseSlowdownPct > effectiveSlowFloor && !hrSuggestsStimulus;
  // Treat tiny differences as "on target" (rounding/GPS noise)
  const NEAR_TARGET_EPS = 0.02; // 2%
  const baseSlow = baseSlowdownPct !== undefined && baseSlowdownPct > NEAR_TARGET_EPS;
  const baseNearTarget = baseSlowdownPct !== undefined && baseSlowdownPct <= NEAR_TARGET_EPS;
  const baseWithinHeatTolerance = baseSlowdownPct !== undefined && baseSlowdownPct <= effectiveSlowFloor;
  
  // -------------------------------------------------------------------------
  // OPENING
  // -------------------------------------------------------------------------
  // If we detect a distinct fast-finish segment, label it explicitly (regardless of duration).
  if (hasFinishSegment) {
    parts.push('Long run with fast finish.');
  } else if (isLongestRunInPlan) {
    parts.push('Longest run so far in your plan.');
  } else if (durationMinutes > 120) {
    parts.push(`${durationMinutes}-minute long run.`);
  } else if (intent === 'recovery') {
    parts.push('Recovery run.');
  } else {
    parts.push('Easy run.');
  }
  
  // -------------------------------------------------------------------------
  // PACE ASSESSMENT - Heat + HR aware
  // -------------------------------------------------------------------------
  if (hasFinishSegment && baseSlowdownPct !== undefined) {
    // Long run with fast finish: evaluate base and finish separately
    if (baseNearTarget) {
      if (basePace && baseTargetPace) parts.push(`Easy portion was on target (${basePace} vs ${baseTargetPace}).`);
      else parts.push('Easy portion was on target.');
    } else if (baseSlow && baseWithinHeatTolerance && isWarm) {
      // Base was slow but within heat tolerance
      parts.push(`Pace was slower than the target range, but ${tempPhrase} increased the effort cost. HR suggests you still achieved the aerobic stimulus.`);
    } else if (baseSlow && hrSuggestsStimulus) {
      // Base was slow but HR indicates stimulus achieved
      parts.push('Pace was slower than the target range, but HR response confirms the aerobic stimulus was achieved.');
    } else if (baseUndercooked) {
      // Base was truly undercooked
      parts.push('The easy portion was well slower than the target range, reducing the intended aerobic stimulus.');
    } else if (!baseSlow) {
      // Base was on target
      if (basePace && baseTargetPace) parts.push(`Easy portion was on target (${basePace} vs ${baseTargetPace}).`);
      else parts.push('Pace was on target.');
    }
    
    // Finish assessment: if planned final segment was on target, add one sentence
    if (finishOnTarget && finishPace) {
      parts.push(`Last segment was on target at ${finishPace}.`);
    } else if (finishOnTarget) {
      parts.push('Last segment was on target.');
    } else {
      // Finish missed target
      if (finishPace && finishTargetPace) {
        parts.push(`Last segment was slower than target (${finishPace} vs ${finishTargetPace}).`);
      } else if (finishPace) {
        parts.push(`Last segment was slower than target (${finishPace}).`);
      } else {
        parts.push('Last segment was slower than target.');
      }
    }

    // Add magnitude when finish missed meaningfully (helps interpret “how far off”).
    if (!finishOnTarget && typeof finishDeltaSecPerMi === 'number' && Number.isFinite(finishDeltaSecPerMi) && finishDeltaSecPerMi > 10) {
      parts.push(`Fast-finish segment missed target by +${fmtDeltaSecPerMi(finishDeltaSecPerMi)}/mi.`);
    }
  } else if (paceAdherencePct !== undefined && paceAdherencePct !== null) {
    // Single-segment workout: use paceAdherencePct with heat/HR awareness
    if (paceAdherencePct >= 95) {
      if (conditionsSeverity === 'moderate' || conditionsSeverity === 'high') {
        parts.push(`You hit your pace targets despite ${tempPhrase}.`);
      } else {
        parts.push('Pace was on target.');
      }
    } else if (paceAdherencePct >= 85) {
      // Check if heat justifies the slowdown and HR confirms stimulus
      if (isWarm && hrSuggestsStimulus) {
        parts.push(`Pace was slower than the target range, but ${tempPhrase} increased the effort cost. HR suggests you still achieved the aerobic stimulus.`);
      } else if (conditionsSeverity === 'high') {
        parts.push(`Slightly slower than prescribed — ${tempPhrase} was a factor.`);
      } else {
        parts.push('Slightly slower than prescribed.');
      }
    } else {
      // < 85%
      if (isWarm && hrSuggestsStimulus) {
        parts.push(`Pace was slower than the target range, but ${tempPhrase} increased the effort cost. HR suggests you still achieved the aerobic stimulus.`);
      } else if (conditionsSeverity === 'high') {
        parts.push(`Well off pace, though ${tempPhrase} made it challenging.`);
      } else {
        // conditionsSeverity is unknown, low, or moderate — don't blame conditions if unknown
        parts.push('Slower than prescribed — could be fatigue or pacing.');
      }
    }
  } else {
    // No pace target — fallback to neutral statement
    parts.push('Pace was steady.');
  }
  
  // -------------------------------------------------------------------------
  // HR ASSESSMENT (only if we have drift)
  // -------------------------------------------------------------------------
  if (hrDriftBpm !== undefined && hrDriftBpm !== null && driftBand !== null) {
    // Round consistently for display
    const driftDisplay = Math.round(hrDriftBpm);
    
    switch (driftBand) {
      case 'below_expected':
        parts.push(`HR drifted ${driftDisplay} bpm — lower than expected.`);
        break;
      case 'normal':
        parts.push(`HR drifted ${driftDisplay} bpm — normal for this duration.`);
        break;
      case 'elevated':
        if (conditionsSeverity === 'high') {
          parts.push(`HR drifted ${driftDisplay} bpm — elevated, conditions likely contributed.`);
        } else {
          parts.push(`HR drifted ${driftDisplay} bpm — slightly elevated.`);
        }
        break;
      case 'high':
        parts.push(`HR drifted ${driftDisplay} bpm — high for this duration.`);
        break;
    }
  }

  // Personal baseline (historical drift) — only when available.
  if (historicalAvgDriftBpm !== undefined && historicalAvgDriftBpm !== null) {
    const typical = Math.round(Number(historicalAvgDriftBpm));
    const today = Math.round(Number(hrDriftBpm));
    if (Number.isFinite(typical) && typical > 0 && Number.isFinite(today) && today > 0) {
      parts.push(`Compared to your similar runs, typical drift is ~${typical} bpm (today ${today} bpm).`);
    }
  }
  
  // -------------------------------------------------------------------------
  // TERRAIN PROFILE (optional, only when relevant)
  // -------------------------------------------------------------------------
  const paceWasSlow = paceAdherencePct !== undefined && paceAdherencePct < 95;
  const driftWasElevated = driftBand === 'elevated' || driftBand === 'high';
  
  if ((paceWasSlow || driftWasElevated) && terrainProfile) {
    if (terrainProfile === 'front_loaded' || terrainProfile === 'early') {
      parts.push('Front-loaded climbing likely affected early pace.');
    } else if (terrainProfile === 'back_loaded' || terrainProfile === 'late') {
      parts.push('Back-loaded climbing likely contributed late.');
    } else if (terrainProfile === 'rolling' || terrainProfile === 'throughout') {
      parts.push('Rolling terrain throughout.');
    }
    // 'flat' or null: omit
  }
  
  // -------------------------------------------------------------------------
  // BOTTOM LINE
  // -------------------------------------------------------------------------
  if (phase === 'build' && driftWasElevated) {
    parts.push('Some fatigue is expected in a build phase — monitor recovery.');
  } else if (phase === 'recovery' && driftWasElevated) {
    parts.push('Elevated drift in a recovery week — treat recovery as real recovery.');
  } else if (phase === 'taper' && (driftBand === 'normal' || driftBand === 'below_expected')) {
    parts.push('Good efficiency heading into race week.');
  } else {
    parts.push('Solid aerobic work.');
  }
  
  return parts.join(' ');
}

/**
 * Build interpretation narrative from analysis results.
 */
export function buildInterpretation(input: InterpretationInput): string {
  const { workoutType, analysisType, drift, intervals, zones, efficiency, trends, context } = input;
  
  switch (analysisType) {
    case 'drift':
      return buildDriftInterpretation(drift!, zones, efficiency, trends, context);
    case 'intervals':
      return buildIntervalInterpretation(intervals!, zones, trends, context);
    case 'zones':
      return buildZonesInterpretation(zones, context);
    default:
      return 'Heart rate data analyzed.';
  }
}

// =============================================================================
// DRIFT INTERPRETATION (Steady-State Workouts)
// =============================================================================

function buildDriftInterpretation(
  drift: DriftAnalysis,
  zones: ZoneDistribution,
  efficiency: EfficiencyMetrics | undefined,
  trends: TrendAnalysis | undefined,
  context: HRAnalysisContext
): string {
  // Calculate duration from intervals
  const durationSeconds = context.intervals?.reduce((sum, i) => {
    const dur = i.executed?.durationS || (i.sampleIdxEnd && i.sampleIdxStart ? i.sampleIdxEnd - i.sampleIdxStart : 0);
    return sum + dur;
  }, 0) || 0;
  const durationMinutes = Math.round(durationSeconds / 60);
  
  // Determine intent from planned workout or duration
  let intent: 'easy' | 'long' | 'recovery' | undefined;
  if (context.plannedWorkout?.intent === 'recovery') {
    intent = 'recovery';
  } else if (context.plannedWorkout?.intent === 'long' || durationMinutes > 90) {
    intent = 'long';
  } else if (context.plannedWorkout?.intent === 'easy') {
    intent = 'easy';
  }
  
  // Map terrain profile to expected format
  let terrainProfile: 'flat' | 'front_loaded' | 'back_loaded' | 'rolling' | 'throughout' | null = null;
  if (drift.terrain.climbingLocation === 'early') {
    terrainProfile = 'front_loaded';
  } else if (drift.terrain.climbingLocation === 'late') {
    terrainProfile = 'back_loaded';
  } else if (drift.terrain.climbingLocation === 'throughout') {
    terrainProfile = 'rolling';
  } else if (drift.terrain.climbingLocation === 'flat') {
    terrainProfile = 'flat';
  }
  
  // Get phase from plan context
  let phase: 'build' | 'recovery' | 'taper' | 'peak' | 'baseline' | 'unknown' | undefined;
  if (context.planContext?.isRecoveryWeek) {
    phase = 'recovery';
  } else if (context.planContext?.isTaperWeek) {
    phase = 'taper';
  } else if (context.planContext?.weekIntent) {
    phase = context.planContext.weekIntent;
  }
  
  // Use raw drift (consistently rounded) for the narrative
  // The rounding happens inside buildSteadyStateNarrative
  const hrDriftBpm = drift.rawDriftBpm;
  
  // Build the synthesized narrative using the new decision-tree logic
  // Note: tempo_finish workouts should be handled by a separate narrative builder
  // once that type is implemented. For now, steady-state covers easy/long/recovery only.
  return buildSteadyStateNarrative({
    intent,
    durationMinutes,
    paceAdherencePct: context.paceAdherencePct, // From granular analysis
    // Segment-level data for long runs with fast finish
    basePace: context.segmentData?.basePace,
    baseTargetPace: context.segmentData?.baseTargetPace,
    baseSlowdownPct: context.segmentData?.baseSlowdownPct,
    finishOnTarget: context.segmentData?.finishOnTarget,
    finishPace: context.segmentData?.finishPace,
    finishTargetPace: context.segmentData?.finishTargetPace,
    finishDeltaSecPerMi: context.segmentData?.finishDeltaSecPerMi,
    hasFinishSegment: context.segmentData?.hasFinishSegment,
    hrDriftBpm,
    earlyAvgHr: drift.earlyAvgHr,
    lateAvgHr: drift.lateAvgHr,
    historicalAvgDriftBpm: context.historicalDrift?.avgDriftBpm,
    temperatureF: context.weather?.temperatureF,
    elevationGainFt: drift.terrain.totalElevationFt,
    terrainProfile,
    phase,
    isLongestRunInPlan: undefined // Would need to be passed in context
  });
}

function buildOpeningSentence(drift: DriftAnalysis, context: HRAnalysisContext): string {
  const duration = context.intervals?.reduce((sum, i) => {
    const dur = i.executed?.durationS || (i.sampleIdxEnd && i.sampleIdxStart ? i.sampleIdxEnd - i.sampleIdxStart : 0);
    return sum + dur;
  }, 0) || 0;
  const durationMin = Math.round(duration / 60);
  
  const parts: string[] = [];
  
  // Workout type
  if (drift.tempoSegment) {
    parts.push(`This was a ${durationMin > 0 ? durationMin + '-minute ' : ''}long run with a tempo finish`);
  } else if (drift.expected.durationCategory === 'long' || drift.expected.durationCategory === 'extended') {
    parts.push(`This was a ${durationMin > 0 ? durationMin + '-minute ' : ''}long run`);
  } else {
    parts.push(`This was a ${durationMin > 0 ? durationMin + '-minute ' : ''}run`);
  }
  
  // Conditions
  const conditions: string[] = [];
  if (drift.terrain.totalElevationFt && drift.terrain.totalElevationFt >= 200) {
    const location = drift.terrain.climbingLocation === 'early' ? ' (front-loaded)' :
                     drift.terrain.climbingLocation === 'late' ? ' (back-loaded)' : '';
    conditions.push(`${drift.terrain.totalElevationFt} ft of climbing${location}`);
  }
  if (drift.weather.note) {
    conditions.push(drift.weather.note.split('—')[0].trim());
  }
  
  if (conditions.length > 0) {
    parts.push(`in ${conditions.join(', ')}`);
  }
  
  return parts.join(' ') + '.';
}

function buildDriftStatement(drift: DriftAnalysis, context: HRAnalysisContext): string {
  const { rawDriftBpm, earlyAvgHr, lateAvgHr, expected, assessment, analysisScope } = drift;
  
  const scopeLabel = analysisScope === 'easy_portion' ? 'easy portion' : 
                     analysisScope === 'first_two_thirds' ? 'first two-thirds' : 
                     'workout';
  
  // Round all values consistently to avoid 142→156 showing +13 (should be +14)
  const earlyRounded = Math.round(earlyAvgHr);
  const lateRounded = Math.round(lateAvgHr);
  const driftRounded = lateRounded - earlyRounded; // Calculate from rounded values for consistency
  
  const hrRange = `(${earlyRounded}→${lateRounded} bpm)`;
  
  // Assessment-based statement using consistently rounded values
  switch (assessment) {
    case 'excellent':
      return `During the ${scopeLabel}, your HR drifted only +${driftRounded} bpm ${hrRange} — excellent aerobic efficiency, better than the typical ${expected.lowerBpm}-${expected.upperBpm} bpm range.`;
    
    case 'good':
      return `Your HR drifted +${driftRounded} bpm ${hrRange} — good aerobic response, on the lower end of expected.`;
    
    case 'normal':
      return `Your HR drifted +${driftRounded} bpm ${hrRange} — within the expected ${expected.lowerBpm}-${expected.upperBpm} bpm range for this duration.`;
    
    case 'elevated':
      return `Your HR drifted +${driftRounded} bpm ${hrRange} — slightly above the typical ${expected.lowerBpm}-${expected.upperBpm} bpm range.`;
    
    case 'high':
      return `Your HR drifted +${driftRounded} bpm ${hrRange} — above the typical ${expected.lowerBpm}-${expected.upperBpm} bpm range, suggesting accumulated fatigue or intensity creep.`;
    
    default:
      return `Your HR drifted +${driftRounded} bpm ${hrRange}.`;
  }
}

function buildTerrainImpact(drift: DriftAnalysis): string {
  const { contributionBpm, climbingLocation } = drift.terrain;
  const { rawDriftBpm, driftBpm } = drift;
  
  if (!contributionBpm) return '';
  
  if (contributionBpm > 0) {
    // Late segment was harder (uphill) - terrain made drift appear higher
    const location = climbingLocation === 'late' ? 'back-loaded climbing' : 'terrain';
    return `The ${location} added ~${Math.abs(contributionBpm)} bpm; terrain-adjusted drift is ~${driftBpm} bpm.`;
  } else {
    // Late segment was easier (downhill) — terrain masked some drift
    const location = climbingLocation === 'early' ? 'front-loaded terrain (downhill finish)' : 'terrain';
    return `The ${location} masked ~${Math.abs(contributionBpm)} bpm of drift; terrain-adjusted drift is ~${driftBpm} bpm.`;
  }
}

function buildTempoSegmentStatement(tempo: NonNullable<DriftAnalysis['tempoSegment']>): string {
  return `You finished with ${tempo.durationMin} minutes at tempo (${tempo.paceDesc}), where HR peaked at ${tempo.peakHr} bpm (avg ${tempo.avgHr}). That's the workout design, not drift.`;
}

function buildEfficiencyStatement(efficiency: EfficiencyMetrics): string {
  const { percent, assessment } = efficiency.decoupling;
  
  switch (assessment) {
    case 'excellent':
      return `Pace:HR decoupling was ${percent}% — excellent efficiency throughout.`;
    case 'good':
      return `Pace:HR decoupling was ${percent}% — good aerobic control.`;
    case 'moderate':
      return `Pace:HR decoupling was ${percent}% — your body worked harder to maintain pace in the second half.`;
    case 'high':
      return `Pace:HR decoupling was ${percent}% — significant drop in efficiency, suggesting this effort pushed your aerobic limits.`;
    default:
      return '';
  }
}

// Historical comparison removed - moved to weekly/block context level
// Individual workout comparisons were comparing apples to oranges:
// - Different analysis scopes (easy_only vs full_workout)
// - Different terrain profiles (hilly vs flat)
// - Raw vs terrain-adjusted drift
// Weekly aggregates provide more meaningful trend analysis

function buildPlanContextStatement(drift: DriftAnalysis, context: HRAnalysisContext): string {
  const plan = context.planContext;
  if (!plan) return '';
  
  const weekLabel = plan.weekIndex 
    ? `Week ${plan.weekIndex}${plan.planName ? ` of ${plan.planName}` : ''}` 
    : (plan.planName || 'your plan');
  
  const phaseLabel = plan.phaseName || plan.weekIntent || '';
  
  if (plan.weekIntent === 'build' || plan.weekIntent === 'peak') {
    if (drift.assessment === 'elevated' || drift.assessment === 'high') {
      return `${weekLabel}${phaseLabel ? ` (${phaseLabel})` : ''} — some accumulated fatigue is expected during build.`;
    }
    return `${weekLabel}${phaseLabel ? ` (${phaseLabel})` : ''}.`;
  }
  
  if (plan.isRecoveryWeek) {
    if (drift.assessment === 'elevated' || drift.assessment === 'high') {
      return `${weekLabel} is a recovery week — elevated drift suggests you're carrying fatigue.`;
    }
    return `${weekLabel} (recovery) — effort looks on track for adaptation.`;
  }
  
  if (plan.isTaperWeek) {
    if (drift.assessment === 'excellent' || drift.assessment === 'good') {
      return `${weekLabel} (taper) — improved efficiency shows your body is freshening up.`;
    }
    return `${weekLabel} (taper) — ensure you're truly easing off for race day.`;
  }
  
  // Default: just show week info
  if (plan.weekIndex) {
    return `${weekLabel}${phaseLabel ? ` (${phaseLabel})` : ''}.`;
  }
  
  return '';
}

function buildBottomLine(
  drift: DriftAnalysis,
  efficiency: EfficiencyMetrics | undefined,
  context: HRAnalysisContext
): string {
  const { assessment } = drift;
  const plan = context.planContext;
  
  if (assessment === 'excellent' || assessment === 'good') {
    if (plan?.isTaperWeek) {
      return 'Excellent taper execution — this is what we want heading into race day.';
    }
    if (drift.tempoSegment) {
      return 'Well executed — aerobic portion was efficient and you finished strong.';
    }
    return 'Strong aerobic efficiency.';
  }
  
  if (assessment === 'normal') {
    return 'Normal physiological response — you\'re on track.';
  }
  
  if (assessment === 'elevated') {
    if (plan?.weekIntent === 'build') {
      return 'Monitor how you feel going into next week.';
    }
    return 'Consider your recovery status before the next hard session.';
  }
  
  // High drift
  if (plan?.isRecoveryWeek) {
    return 'Keep the next few days genuinely easy to let your body catch up.';
  }
  return 'Prioritize recovery and ensure adequate fueling on long runs.';
}

// =============================================================================
// INTERVAL INTERPRETATION - Coaching-style narrative with complete pattern grammar
// =============================================================================

interface IntervalExecution {
  repNumber: number;
  targetMidpoint: number;  // sec/mi - midpoint of target range
  actualPace: number;      // sec/mi
  status: 'on_target' | 'too_fast' | 'too_slow' | 'blown';
  deviationPct: number;    // % deviation from target midpoint (negative = faster)
}

/**
 * Classify a rep's execution using %-based thresholds
 * Thresholds scale with pace (5 sec at 6:00 ≠ 5 sec at 11:00)
 * 
 * on_target:  within ±5% of target midpoint
 * too_fast:   >5% faster than target
 * too_slow:   >7% slower than target  
 * blown:      >15% slower than target
 */
function classifyRepExecution(
  actualPace: number,
  targetLower: number,
  targetUpper: number
): { status: IntervalExecution['status']; deviationPct: number } {
  const targetMidpoint = (targetLower + targetUpper) / 2;
  
  // Calculate % deviation (negative = faster, positive = slower)
  const deviationPct = ((actualPace - targetMidpoint) / targetMidpoint) * 100;
  
  // Classify based on % thresholds
  let status: IntervalExecution['status'];
  
  if (deviationPct <= -5) {
    // >5% faster than target
    status = 'too_fast';
  } else if (deviationPct >= 15) {
    // >15% slower = blown
    status = 'blown';
  } else if (deviationPct >= 7) {
    // >7% slower = too slow
    status = 'too_slow';
  } else {
    // Within ±5-7% = on target
    status = 'on_target';
  }
  
  return { status, deviationPct: Math.round(deviationPct * 10) / 10 };
}

/**
 * Detect execution patterns across the set
 */
interface ExecutionPatterns {
  hasBlownRep: boolean;
  firstRepTooFast: boolean;
  lateRepsSlow: boolean;           // Last 1-2 reps slow/blown
  progressiveFade: boolean;        // Each rep slower than previous by >3%
  negativeSplit: boolean;          // Second half ≥3% faster than first
  conservativeConsistent: boolean; // All slightly slow but within 3% of each other
  aggressiveConsistent: boolean;   // All slightly fast but within 3% of each other
  firstRepSlow: boolean;           // First rep >7% slow, rest on target
}

function detectExecutionPatterns(reps: IntervalExecution[]): ExecutionPatterns {
  const patterns: ExecutionPatterns = {
    hasBlownRep: false,
    firstRepTooFast: false,
    lateRepsSlow: false,
    progressiveFade: false,
    negativeSplit: false,
    conservativeConsistent: false,
    aggressiveConsistent: false,
    firstRepSlow: false
  };
  
  if (reps.length === 0) return patterns;
  
  // Basic flags
  patterns.hasBlownRep = reps.some(r => r.status === 'blown');
  patterns.firstRepTooFast = reps[0].status === 'too_fast';
  
  // First rep slow (>7% slow, but rest mostly on target)
  if (reps.length >= 2 && reps[0].deviationPct > 7) {
    const restOnTarget = reps.slice(1).filter(r => r.status === 'on_target').length;
    patterns.firstRepSlow = restOnTarget >= (reps.length - 1) * 0.6;
  }
  
  // Late reps slow (last 1-2 reps slow or blown)
  if (reps.length >= 2) {
    const lastRep = reps[reps.length - 1];
    const secondLastRep = reps.length >= 3 ? reps[reps.length - 2] : null;
    patterns.lateRepsSlow = 
      (lastRep.status === 'too_slow' || lastRep.status === 'blown') ||
      (secondLastRep && (secondLastRep.status === 'too_slow' || secondLastRep.status === 'blown'));
  }
  
  // Progressive fade: each rep slower than previous by >3%
  if (reps.length >= 3) {
    let fadeCount = 0;
    for (let i = 1; i < reps.length; i++) {
      const pctSlower = ((reps[i].actualPace - reps[i-1].actualPace) / reps[i-1].actualPace) * 100;
      if (pctSlower > 3) fadeCount++;
    }
    patterns.progressiveFade = fadeCount >= reps.length - 2; // Most transitions are fading
  }
  
  // Negative split: second half ≥3% faster than first half
  if (reps.length >= 4) {
    const midpoint = Math.floor(reps.length / 2);
    const firstHalfAvg = reps.slice(0, midpoint).reduce((sum, r) => sum + r.actualPace, 0) / midpoint;
    const secondHalfAvg = reps.slice(midpoint).reduce((sum, r) => sum + r.actualPace, 0) / (reps.length - midpoint);
    const pctFaster = ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100;
    patterns.negativeSplit = pctFaster >= 3;
  }
  
  // Conservative but consistent: all slightly slow (>5% slow) but within 3% of each other
  const allSlightlySlow = reps.every(r => r.deviationPct > 5 && r.deviationPct < 15);
  if (allSlightlySlow && reps.length >= 2) {
    const deviations = reps.map(r => r.deviationPct);
    const spread = Math.max(...deviations) - Math.min(...deviations);
    patterns.conservativeConsistent = spread <= 3;
  }
  
  // Aggressive but consistent: all slightly fast (< -3%) but within 3% of each other
  const allSlightlyFast = reps.every(r => r.deviationPct < -3);
  if (allSlightlyFast && reps.length >= 2) {
    const deviations = reps.map(r => r.deviationPct);
    const spread = Math.max(...deviations) - Math.min(...deviations);
    patterns.aggressiveConsistent = spread <= 3;
  }
  
  return patterns;
}

/**
 * Main interval interpretation function
 */
function buildIntervalInterpretation(
  hrIntervals: IntervalHRAnalysis,
  zones: ZoneDistribution,
  trends: TrendAnalysis | undefined,
  context: HRAnalysisContext
): string {
  const parts: string[] = [];
  
  // Extract work intervals with pace data from context
  const workIntervals = context.intervals.filter(i => i.role === 'work' || i.role === 'Work');
  
  // Analyze each rep's execution with %-based classification
  const repExecutions: IntervalExecution[] = [];
  for (let i = 0; i < workIntervals.length; i++) {
    const interval = workIntervals[i];
    const paceRange = interval.paceRange;
    const executed = interval.executed;
    
    if (paceRange && executed?.avgPaceSPerMi) {
      const { status, deviationPct } = classifyRepExecution(
        executed.avgPaceSPerMi,
        paceRange.lower,
        paceRange.upper
      );
      
      repExecutions.push({
        repNumber: i + 1,
        targetMidpoint: (paceRange.lower + paceRange.upper) / 2,
        actualPace: executed.avgPaceSPerMi,
        status,
        deviationPct
      });
    }
  }
  
  // Calculate summary stats
  const totalReps = repExecutions.length;
  const onTargetReps = repExecutions.filter(r => r.status === 'on_target').length;
  
  // Detect patterns
  const patterns = detectExecutionPatterns(repExecutions);
  
  // Recovery quality for physiology bridge
  const recoveryQuality = hrIntervals.recovery.quality;
  
  // Format pace helper
  const formatPace = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };
  
  // Build narrative
  if (totalReps > 0) {
    // Get target range from first work interval for display
    const firstWorkInterval = workIntervals[0];
    const paceRange = firstWorkInterval?.paceRange;
    
    if (paceRange) {
      const targetRange = `${formatPace(paceRange.lower)}-${formatPace(paceRange.upper)}/mi`;
      parts.push(`${totalReps} work intervals at ${targetRange}.`);
    } else {
      parts.push(`${totalReps} work intervals.`);
    }
    
    // Execution summary
    if (onTargetReps === totalReps) {
      parts.push(`All ${totalReps} reps on target — excellent execution.`);
    } else if (onTargetReps === 0) {
      parts.push(`No reps hit the target range.`);
    } else {
      parts.push(`You hit ${onTargetReps} of ${totalReps} reps on target.`);
    }
    
    // Pattern diagnosis - PRIORITY ORDER (only one fires)
    // 1. Blown reps present + first rep fast
    if (patterns.hasBlownRep && patterns.firstRepTooFast) {
      parts.push(`Started too fast and faded — pacing got away from you early.`);
    }
    // 2. Blown reps present (but not from fast start)
    else if (patterns.hasBlownRep) {
      if (patterns.lateRepsSlow) {
        parts.push(`Couldn't hold pace through the full set.`);
      } else {
        parts.push(`Mid-workout breakdown — consider recovery or pacing adjustments.`);
      }
    }
    // 3. First rep fast + late slow (no blown, but pacing error)
    else if (patterns.firstRepTooFast && patterns.lateRepsSlow) {
      parts.push(`First rep too aggressive, leading to slower finish.`);
    }
    // 4. Progressive fade
    else if (patterns.progressiveFade) {
      parts.push(`Gradual fade across the set — fatigue accumulated rep by rep.`);
    }
    // 5. Negative split
    else if (patterns.negativeSplit) {
      parts.push(`Built into the session — good patience.`);
    }
    // 6. Aggressive but controlled
    else if (patterns.aggressiveConsistent) {
      parts.push(`Aggressive execution, but well controlled across the set.`);
    }
    // 7. Conservative but consistent
    else if (patterns.conservativeConsistent) {
      parts.push(`Conservative but consistent — you protected the set at the cost of speed.`);
    }
    // 8. First rep slow (warm-up lag)
    else if (patterns.firstRepSlow) {
      parts.push(`Took a rep to find your rhythm.`);
    }
    // 9. First rep fast alone (no late fade)
    else if (patterns.firstRepTooFast) {
      parts.push(`First rep was fast — watch the start to avoid mid-set breakdown.`);
    }
    // 10. Default: even effort
    else if (onTargetReps < totalReps) {
      // Some misses but no clear pattern
      parts.push(`Mixed execution across the set.`);
    }
    // All on target already handled above
  } else {
    // Fallback if no pace data
    parts.push(`${hrIntervals.workIntervalCount} work intervals completed.`);
  }
  
  // HR metrics as supporting evidence
  const { creepBpm, assessment: creepAssessment } = hrIntervals.hrCreep;
  if (creepAssessment === 'minimal' || creepAssessment === 'normal') {
    parts.push(`HR crept ${creepBpm > 0 ? '+' : ''}${creepBpm} bpm — well controlled across the set.`);
  } else if (creepAssessment === 'elevated') {
    parts.push(`HR crept +${creepBpm} bpm — fatigue accumulating.`);
  } else if (creepAssessment === 'high') {
    parts.push(`HR crept +${creepBpm} bpm — significant fatigue or pacing issue.`);
  }
  
  // Recovery quality
  const { avgDropBpm } = hrIntervals.recovery;
  if (recoveryQuality === 'excellent') {
    parts.push(`Recovery was excellent (${avgDropBpm} bpm drop).`);
  } else if (recoveryQuality === 'good') {
    parts.push(`Recovery was solid.`);
  } else if (recoveryQuality === 'fair') {
    parts.push(`Recovery was adequate.`);
  } else if (recoveryQuality === 'poor') {
    parts.push(`Recovery was limited — consider longer rest next time.`);
  }
  
  // PHYSIOLOGY BRIDGE: Connect recovery to late fade
  if (patterns.lateRepsSlow && recoveryQuality === 'poor') {
    parts.push(`Limited recovery likely contributed to the late fade.`);
  }
  
  // Coaching bottom line
  const bottomLine = buildIntervalCoachingBottomLine(
    onTargetReps, totalReps, patterns, creepAssessment, recoveryQuality
  );
  if (bottomLine) {
    parts.push(bottomLine);
  }
  
  return parts.filter(p => p.length > 0).join(' ');
}

/**
 * Generate coaching bottom line based on execution and physiology
 */
function buildIntervalCoachingBottomLine(
  onTarget: number,
  total: number,
  patterns: ExecutionPatterns,
  hrCreep: string,
  recovery: string
): string {
  const hitRate = total > 0 ? onTarget / total : 0;
  const goodHR = hrCreep === 'minimal' || hrCreep === 'normal';
  const goodRecovery = recovery === 'excellent' || recovery === 'good';
  
  // Great execution
  if (hitRate >= 0.75 && goodHR && !patterns.hasBlownRep) {
    return 'Strong interval execution.';
  }
  
  // Good fitness, pacing issue from fast start
  if (goodHR && patterns.firstRepTooFast) {
    return 'Strong fitness, but tighten the first rep to avoid mid-set breakdown.';
  }
  
  // Negative split with good HR = intentional build
  if (patterns.negativeSplit && goodHR) {
    return 'Well-paced session with a strong finish.';
  }
  
  // Blown rep with otherwise decent execution
  if (patterns.hasBlownRep && hitRate >= 0.5) {
    return 'Solid fitness — address the blown rep to complete the full set next time.';
  }
  
  // Recovery-limited fade
  if (patterns.lateRepsSlow && !goodRecovery) {
    return 'Recovery limited the back half — consider longer rest or fewer reps.';
  }
  
  // Progressive fade with HR issues
  if (patterns.progressiveFade && !goodHR) {
    return 'Fatigue accumulated steadily — consider adjusting targets or recovery.';
  }
  
  // Conservative execution
  if (patterns.conservativeConsistent) {
    return 'Room to push harder next time while maintaining consistency.';
  }
  
  // Aggressive but controlled
  if (patterns.aggressiveConsistent && goodHR) {
    return 'Strong execution — consider this your new baseline.';
  }
  
  // Low hit rate with poor recovery
  if (hitRate < 0.5 && !goodRecovery) {
    return 'Recovery limited execution — consider longer rest or fewer reps.';
  }
  
  // General fade with HR issues
  if (hitRate < 0.5 && !goodHR) {
    return 'Fatigue accumulated — consider adjusting targets or recovery.';
  }
  
  return '';
}

// Old helper functions removed - buildIntervalInterpretation now handles everything inline
// with access to pace execution data for coaching-style narratives

// =============================================================================
// ZONES-ONLY INTERPRETATION (Fartlek/Mixed)
// =============================================================================

function buildZonesInterpretation(
  zones: ZoneDistribution,
  context: HRAnalysisContext
): string {
  const parts: string[] = [];
  
  parts.push(`Variable effort workout — showing zone distribution.`);
  
  // Primary zone
  parts.push(`Most time spent in ${zones.primaryZone}.`);
  
  // Zone breakdown
  const significantZones = zones.distribution.filter(z => z.percent >= 10);
  if (significantZones.length > 1) {
    const breakdown = significantZones
      .map(z => `${z.label}: ${z.percent}%`)
      .join(', ');
    parts.push(`Zone breakdown: ${breakdown}.`);
  }
  
  // Zone creep
  if (zones.zoneCreep) {
    parts.push(`HR crept into higher zones as the workout progressed.`);
  }
  
  return parts.join(' ');
}
