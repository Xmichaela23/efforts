/**
 * Garmin-style execution scoring and segment tolerance.
 * Source of truth for segment types (warmup, work, cooldown, etc.) and pace tolerances.
 * Exports getPaceToleranceForSegment for use by granular pace and index.
 */

export type SegmentType = 'warmup' | 'cooldown' | 'work_interval' | 'tempo' | 'cruise_interval' | 'recovery_jog' | 'easy_run';

export interface SegmentConfig {
  tolerance: number;
  weight: number;
}

export interface SegmentPenalty {
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

export interface WorkoutExecutionAnalysis {
  overall_execution: number;
  pace_execution: number;
  duration_adherence: number;
  segment_summary: {
    work_intervals: {
      completed: number;
      total: number;
      avg_adherence: number;
      within_tolerance: number;
    };
    recovery_jogs: {
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

// Garmin-style execution scoring configuration
// Tolerance guidelines:
// - Quality/intervals: ±4-5% (tighter) - work_interval uses 5%
// - Easy/tempo: ±6-8% (looser) - tempo uses 7%, easy_run uses 8%
const SEGMENT_CONFIG: Record<SegmentType, SegmentConfig> = {
  warmup: { tolerance: 10, weight: 0.5 },
  cooldown: { tolerance: 10, weight: 0.3 },
  work_interval: { tolerance: 5, weight: 1.0 },
  tempo: { tolerance: 7, weight: 1.0 }, // ±7% for tempo (looser than intervals)
  cruise_interval: { tolerance: 5, weight: 0.9 },
  recovery_jog: { tolerance: 15, weight: 0.7 },
  easy_run: { tolerance: 8, weight: 0.6 }
};

/**
 * Infer segment type from interval data and planned step
 */
function inferSegmentType(segment: any, plannedStep: any, plannedWorkout?: any): SegmentType {
  const role = segment.role;
  const token = plannedStep?.token || '';

  if (role === 'warmup') return 'warmup';
  if (role === 'cooldown') return 'cooldown';
  if (role === 'recovery') return 'recovery_jog';

  if (role === 'work') {
    // Distinguish interval vs tempo vs cruise based on token patterns
    if (token.includes('interval_')) {
      return 'work_interval'; // Short, high intensity
    }
    if (token.includes('tempo_')) {
      return 'tempo'; // Sustained threshold effort
    }
    if (token.includes('cruise_')) {
      return 'cruise_interval'; // Between interval and tempo
    }

    // Check workout description for tempo keywords
    const workoutDesc = (plannedWorkout?.description || plannedWorkout?.name || '').toLowerCase();
    if (workoutDesc.includes('tempo') || workoutDesc.includes('threshold') || workoutDesc.includes('marathon pace')) {
      return 'tempo';
    }

    // Check planned step description
    const stepDesc = (plannedStep?.description || plannedStep?.label || '').toLowerCase();
    if (stepDesc.includes('tempo') || stepDesc.includes('threshold')) {
      return 'tempo';
    }

    // Infer from duration and distance
    const durationMin = segment.executed?.duration_s
      ? segment.executed.duration_s / 60
      : (segment.planned?.duration_s ? segment.planned.duration_s / 60 : 0);
    const distanceMi = segment.executed?.distance_m
      ? segment.executed.distance_m / 1609.34
      : (segment.planned?.distance_m ? segment.planned.distance_m / 1609.34 : 0);

    // Tempo characteristics: long continuous effort
    if (durationMin > 20 || distanceMi > 3) {
      return 'tempo'; // Long sustained effort = tempo
    }

    if (durationMin <= 8) {
      return 'work_interval'; // Short = interval
    }

    return 'tempo'; // Default to tempo for ambiguous cases (safer - wider tolerance)
  }

  return 'easy_run'; // Default fallback
}

/**
 * Get appropriate pace tolerance based on segment type.
 * Exported for use by granular pace module and index.
 * Quality/intervals: ±4-5% (tighter), Easy/tempo: ±6-8% (looser)
 */
export function getPaceToleranceForSegment(interval: any, plannedStep: any, plannedWorkout?: any): number {
  const segmentType = inferSegmentType(interval, plannedStep, plannedWorkout);
  const config = SEGMENT_CONFIG[segmentType];

  const tolerancePercent = config?.tolerance || 5; // Default to 5% if unknown

  // Debug logging for tempo detection
  if (interval.role === 'work') {
    const workoutName = plannedWorkout?.name || plannedWorkout?.description || 'unknown';
    const distanceMi = interval.executed?.distance_m
      ? interval.executed.distance_m / 1609.34
      : (interval.planned?.distance_m ? interval.planned.distance_m / 1609.34 : 0);
    const durationMin = interval.executed?.duration_s
      ? interval.executed.duration_s / 60
      : (interval.planned?.duration_s ? interval.planned.duration_s / 60 : 0);
    console.log(`🔍 [TEMPO DETECT] Work segment: type=${segmentType}, tolerance=${tolerancePercent}%, workout="${workoutName}", distance=${distanceMi.toFixed(1)}mi, duration=${durationMin.toFixed(1)}min`);
  }

  return tolerancePercent / 100; // Convert to decimal
}

/**
 * Calculate directional penalty for wrong stimulus direction
 */
function getDirectionalPenalty(segment: any, adherence: number): number {
  const type = segment.type;

  // Too slow on work = missed training stimulus
  if (['work_interval', 'tempo', 'cruise_interval'].includes(type)) {
    if (adherence < 95) return 5;  // Significantly too slow
    if (adherence > 110) return 3; // Significantly too fast
  }

  // Too slow on recovery = poor execution/fatigue
  if (type === 'recovery_jog') {
    if (adherence < 85) return 3; // Way too slow (walking)
    if (adherence > 110) return 2; // Too fast (not recovering)
  }

  // Too slow on easy runs = okay, too fast = not easy enough
  if (type === 'easy_run') {
    if (adherence > 115) return 2; // Way too fast for easy
  }

  return 0; // No directional penalty
}

/**
 * Generate human-readable penalty reason
 */
function generatePenaltyReason(segment: any, adherence: number, config: SegmentConfig, excessDeviation: number, directionPenalty: number): string {
  const type = segment.type;
  const plannedLabel = segment.planned_label || `Segment ${segment.segment_idx + 1}`;

  let reason = `${plannedLabel}: ${adherence}% adherence (${excessDeviation.toFixed(1)}% beyond ${config.tolerance}% tolerance)`;

  if (directionPenalty > 0) {
    if (adherence < 95 && ['work_interval', 'tempo', 'cruise_interval'].includes(type)) {
      reason += ' + too slow penalty';
    } else if (adherence > 110 && ['work_interval', 'tempo', 'cruise_interval'].includes(type)) {
      reason += ' + too fast penalty';
    } else if (adherence < 85 && type === 'recovery_jog') {
      reason += ' + poor recovery penalty';
    } else if (adherence > 110 && type === 'recovery_jog') {
      reason += ' + not recovering penalty';
    }
  }

  return reason;
}

/**
 * Calculate penalty for a single segment
 */
function calculateSegmentPenalty(segment: any, config: SegmentConfig, segmentIdx: number): SegmentPenalty {
  const adherence = segment.executed?.adherence_percentage || 100;
  const { tolerance, weight } = config;

  const deviation = Math.abs(adherence - 100);

  if (deviation <= tolerance) {
    return {
      segment_idx: segmentIdx,
      type: segment.type,
      adherence,
      deviation,
      tolerance,
      base_penalty: 0,
      direction_penalty: 0,
      total_penalty: 0,
      reason: `Within ${tolerance}% tolerance`
    };
  }

  const excessDeviation = deviation - tolerance;
  const basePenalty = excessDeviation * weight;
  const directionPenalty = getDirectionalPenalty(segment, adherence);
  const totalPenalty = basePenalty + directionPenalty;

  return {
    segment_idx: segmentIdx,
    type: segment.type,
    adherence,
    deviation,
    tolerance,
    base_penalty: basePenalty,
    direction_penalty: directionPenalty,
    total_penalty: totalPenalty,
    reason: generatePenaltyReason(segment, adherence, config, excessDeviation, directionPenalty)
  };
}

/**
 * Calculate Garmin-style execution score using penalty-based system
 */
export function calculateGarminExecutionScore(segments: any[], plannedWorkout: any): WorkoutExecutionAnalysis {
  console.log('🏃‍♂️ Calculating Garmin-style execution score for', segments.length, 'segments');

  const penalties: SegmentPenalty[] = [];
  let totalPenalty = 0;

  const segmentsWithTypes = segments.map((segment, idx) => {
    const plannedStep = plannedWorkout?.computed?.steps?.[idx] || {};
    const segmentType = inferSegmentType(segment, plannedStep, plannedWorkout);
    return {
      ...segment,
      type: segmentType,
      segment_idx: idx
    };
  });

  segmentsWithTypes.forEach((segment, idx) => {
    const config = SEGMENT_CONFIG[segment.type];
    const penalty = calculateSegmentPenalty(segment, config, idx);

    if (penalty.total_penalty > 0) {
      penalties.push(penalty);
      totalPenalty += penalty.total_penalty;
      console.log(`⚠️ Penalty for ${segment.planned_label || `Segment ${idx + 1}`}: ${penalty.total_penalty.toFixed(1)} (${penalty.reason})`);
    }
  });

  const executionScore = Math.max(0, Math.round(100 - totalPenalty));

  const withDuration = segments.filter((i: any) =>
    i.executed && i.planned && i.planned.duration_s
  );

  let durationAdherence = 100;
  if (withDuration.length > 0) {
    const plannedTotal = withDuration.reduce((sum: number, i: any) =>
      sum + i.planned.duration_s, 0
    );
    const actualTotal = withDuration.reduce((sum: number, i: any) =>
      sum + i.executed.duration_s, 0
    );
    durationAdherence = Math.round(Math.min(100, (actualTotal / plannedTotal) * 100));
  }

  const workIntervals = segmentsWithTypes.filter(s => s.type === 'work_interval');
  const recoveryJogs = segmentsWithTypes.filter(s => s.type === 'recovery_jog');
  const warmup = segmentsWithTypes.find(s => s.type === 'warmup');
  const cooldown = segmentsWithTypes.find(s => s.type === 'cooldown');

  const segmentSummary = {
    work_intervals: {
      completed: workIntervals.filter(s => s.executed).length,
      total: workIntervals.length,
      avg_adherence: workIntervals.length > 0
        ? Math.round(workIntervals.reduce((sum, s) => sum + (s.executed?.adherence_percentage || 100), 0) / workIntervals.length)
        : 100,
      within_tolerance: workIntervals.filter(s => {
        const adherence = s.executed?.adherence_percentage || 100;
        const deviation = Math.abs(adherence - 100);
        return deviation <= SEGMENT_CONFIG.work_interval.tolerance;
      }).length
    },
    recovery_jogs: {
      completed: recoveryJogs.filter(s => s.executed).length,
      total: recoveryJogs.length,
      avg_adherence: recoveryJogs.length > 0
        ? Math.round(recoveryJogs.reduce((sum, s) => sum + (s.executed?.adherence_percentage || 100), 0) / recoveryJogs.length)
        : 100,
      below_target: recoveryJogs.filter(s => {
        const adherence = s.executed?.adherence_percentage || 100;
        return adherence < 85;
      }).length
    },
    warmup: {
      adherence: warmup?.executed?.adherence_percentage || 100,
      status: (warmup && warmup.executed?.adherence_percentage > 90 && warmup.executed?.adherence_percentage < 110 ? 'good' : 'acceptable') as 'good' | 'acceptable' | 'poor'
    },
    cooldown: {
      adherence: cooldown?.executed?.adherence_percentage || 100,
      duration_pct: cooldown ? (cooldown.executed?.duration_s / cooldown.planned?.duration_s) * 100 : 100,
      status: (cooldown && cooldown.executed?.adherence_percentage > 90 && cooldown.executed?.adherence_percentage < 110 ? 'good' : 'acceptable') as 'good' | 'acceptable' | 'poor'
    }
  };

  console.log(`✅ Garmin execution analysis complete: ${executionScore}% execution, ${penalties.length} penalties`);

  return {
    overall_execution: executionScore,
    pace_execution: executionScore,
    duration_adherence: durationAdherence,
    segment_summary: segmentSummary,
    penalties: {
      total: totalPenalty,
      by_segment: penalties
    }
  };
}
