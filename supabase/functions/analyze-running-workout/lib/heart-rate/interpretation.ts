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
  const parts: string[] = [];
  
  // Opening: What the workout was + conditions
  parts.push(buildOpeningSentence(drift, context));
  
  // HR drift statement
  parts.push(buildDriftStatement(drift, context));
  
  // Terrain impact (if significant)
  if (drift.terrain.contributionBpm && Math.abs(drift.terrain.contributionBpm) >= 3) {
    parts.push(buildTerrainImpact(drift));
  }
  
  // Weather impact - only show as separate statement if it contributed to drift
  // (temperature already shown in opening sentence)
  if (drift.weather.factor === 'hot' && drift.weather.contributionBpm && drift.weather.contributionBpm >= 3) {
    parts.push(`Heat (+${drift.weather.contributionBpm} bpm) contributed to the elevated drift.`);
  }
  
  // Tempo segment (if applicable)
  if (drift.tempoSegment) {
    parts.push(buildTempoSegmentStatement(drift.tempoSegment));
  }
  
  // Efficiency/decoupling (if calculated)
  if (efficiency) {
    parts.push(buildEfficiencyStatement(efficiency));
  }
  
  // Historical comparison
  if (trends?.vsLastSimilar) {
    parts.push(buildHistoricalComparison(trends));
  }
  
  // Plan context - show if we have any plan info
  if (context.planContext && (context.planContext.weekIndex || context.planContext.weekIntent)) {
    parts.push(buildPlanContextStatement(drift, context));
  }
  
  // Bottom line
  parts.push(buildBottomLine(drift, efficiency, context));
  
  return parts.filter(p => p.length > 0).join(' ');
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
  
  // Use RAW drift with raw HR values for consistency (156-142=14, not terrain-adjusted)
  const hrRange = `(${earlyAvgHr}→${lateAvgHr} bpm)`;
  
  // Assessment-based statement using RAW values
  switch (assessment) {
    case 'excellent':
      return `During the ${scopeLabel}, your HR drifted only +${rawDriftBpm} bpm ${hrRange} — excellent aerobic efficiency, better than the typical ${expected.lowerBpm}-${expected.upperBpm} bpm range.`;
    
    case 'good':
      return `Your HR drifted +${rawDriftBpm} bpm ${hrRange} — good aerobic response, on the lower end of expected.`;
    
    case 'normal':
      return `Your HR drifted +${rawDriftBpm} bpm ${hrRange} — within the expected ${expected.lowerBpm}-${expected.upperBpm} bpm range for this duration.`;
    
    case 'elevated':
      return `Your HR drifted +${rawDriftBpm} bpm ${hrRange} — slightly above the typical ${expected.lowerBpm}-${expected.upperBpm} bpm range.`;
    
    case 'high':
      return `Your HR drifted +${rawDriftBpm} bpm ${hrRange} — above the typical ${expected.lowerBpm}-${expected.upperBpm} bpm range, suggesting accumulated fatigue or intensity creep.`;
    
    default:
      return `Your HR drifted +${rawDriftBpm} bpm ${hrRange}.`;
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

function buildHistoricalComparison(trends: TrendAnalysis): string {
  const last = trends.vsLastSimilar;
  if (!last) return '';
  
  const diff = Math.abs(last.driftDiffBpm);
  
  if (diff <= 2) {
    return `That's consistent with your similar run ${last.daysSince} days ago.`;
  } else if (last.better) {
    return `That's ${diff} bpm less drift than ${last.daysSince} days ago — improving.`;
  } else {
    return `That's ${diff} bpm more than ${last.daysSince} days ago.`;
  }
}

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
