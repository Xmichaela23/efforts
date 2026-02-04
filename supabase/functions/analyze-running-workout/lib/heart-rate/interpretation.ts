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
  
  // HR drift (optional)
  hrDriftBpm?: number;
  earlyAvgHr?: number;
  lateAvgHr?: number;
  
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
 * Note: Tempo finish and other workout types should have their own narrative builders.
 */
function buildSteadyStateNarrative(input: SteadyStateNarrativeInput): string {
  const {
    intent,
    durationMinutes,
    paceAdherencePct,
    hrDriftBpm,
    temperatureF,
    elevationGainFt,
    terrainProfile,
    phase,
    isLongestRunInPlan
  } = input;
  
  const parts: string[] = [];
  
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
  // OPENING
  // -------------------------------------------------------------------------
  if (isLongestRunInPlan) {
    parts.push('Longest run so far in your plan.');
  } else if (durationMinutes > 120) {
    parts.push(`${durationMinutes}-minute long run.`);
  } else if (intent === 'recovery') {
    parts.push('Recovery run.');
  } else {
    parts.push('Easy run.');
  }
  
  // -------------------------------------------------------------------------
  // PACE ASSESSMENT (only if we have pace adherence)
  // -------------------------------------------------------------------------
  if (paceAdherencePct !== undefined && paceAdherencePct !== null) {
    if (paceAdherencePct >= 95) {
      if (conditionsSeverity === 'moderate' || conditionsSeverity === 'high') {
        parts.push('You hit your pace targets despite conditions.');
      } else {
        parts.push('Pace was on target.');
      }
    } else if (paceAdherencePct >= 85) {
      if (conditionsSeverity === 'high') {
        parts.push('Slightly slower than prescribed, and conditions were a factor.');
      } else {
        parts.push('Slightly slower than prescribed.');
      }
    } else {
      // < 85%
      if (conditionsSeverity === 'high') {
        parts.push('Well off pace, though conditions were challenging.');
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
    hrDriftBpm,
    earlyAvgHr: drift.earlyAvgHr,
    lateAvgHr: drift.lateAvgHr,
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
// INTERVAL INTERPRETATION
// =============================================================================

function buildIntervalInterpretation(
  intervals: IntervalHRAnalysis,
  zones: ZoneDistribution,
  trends: TrendAnalysis | undefined,
  context: HRAnalysisContext
): string {
  const parts: string[] = [];
  
  // Overview
  parts.push(`Your HR averaged ${intervals.workIntervalAvgHr} bpm across ${intervals.workIntervalCount} work intervals.`);
  
  // HR Creep
  parts.push(buildCreepStatement(intervals.hrCreep));
  
  // Recovery
  parts.push(buildRecoveryStatement(intervals.recovery));
  
  // Consistency
  if (intervals.workIntervalCount >= 3) {
    parts.push(buildConsistencyStatement(intervals.consistency));
  }
  
  // Plan context
  if (context.planContext?.hasActivePlan) {
    const weekNum = context.planContext.weekIndex ? `Week ${context.planContext.weekIndex}` : '';
    if (context.planContext.weekIntent === 'build') {
      parts.push(`${weekNum ? weekNum + ': ' : ''}Building fitness through quality intervals.`);
    }
  }
  
  // Bottom line
  parts.push(buildIntervalBottomLine(intervals));
  
  return parts.filter(p => p.length > 0).join(' ');
}

function buildCreepStatement(creep: IntervalHRAnalysis['hrCreep']): string {
  const { creepBpm, assessment } = creep;
  
  switch (assessment) {
    case 'minimal':
      return `HR creep was minimal (+${creepBpm} bpm from first to last interval) — strong fitness.`;
    case 'normal':
      return `HR crept +${creepBpm} bpm from first to last interval — normal fatigue accumulation.`;
    case 'elevated':
      return `HR crept +${creepBpm} bpm from first to last — moderate fatigue toward the end.`;
    case 'high':
      return `HR crept +${creepBpm} bpm across intervals — consider if recovery was adequate or intervals were too ambitious.`;
    default:
      return '';
  }
}

function buildRecoveryStatement(recovery: IntervalHRAnalysis['recovery']): string {
  const { avgDropBpm, quality, avgRecoveryTimeS } = recovery;
  const avgTimeMin = Math.round(avgRecoveryTimeS / 60 * 10) / 10;
  
  switch (quality) {
    case 'excellent':
      return `Recovery was excellent — HR dropped ${avgDropBpm} bpm on average during ${avgTimeMin}-min rest intervals.`;
    case 'good':
      return `Recovery was solid — ${avgDropBpm} bpm average drop.`;
    case 'fair':
      return `Recovery was moderate — ${avgDropBpm} bpm average drop. Consider longer rest if doing more reps next time.`;
    case 'poor':
      return `Recovery was limited — only ${avgDropBpm} bpm average drop. You may need longer rest intervals.`;
    default:
      return '';
  }
}

function buildConsistencyStatement(consistency: IntervalHRAnalysis['consistency']): string {
  const { assessment, coefficientOfVariation } = consistency;
  
  switch (assessment) {
    case 'very_consistent':
      return `HR was very consistent across intervals (${coefficientOfVariation}% CV).`;
    case 'consistent':
      return `HR was consistent across intervals.`;
    case 'variable':
      return `HR varied somewhat across intervals — pacing consistency could improve.`;
    case 'inconsistent':
      return `HR was inconsistent across intervals — focus on even pacing.`;
    default:
      return '';
  }
}

function buildIntervalBottomLine(intervals: IntervalHRAnalysis): string {
  const creepOk = intervals.hrCreep.assessment === 'minimal' || intervals.hrCreep.assessment === 'normal';
  const recoveryOk = intervals.recovery.quality === 'excellent' || intervals.recovery.quality === 'good';
  
  if (creepOk && recoveryOk) {
    return 'Strong interval execution.';
  }
  if (creepOk) {
    return 'Good pacing across intervals.';
  }
  if (recoveryOk) {
    return 'Recovery between intervals was on point.';
  }
  return 'Consider adjusting interval intensity or recovery for next session.';
}

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
