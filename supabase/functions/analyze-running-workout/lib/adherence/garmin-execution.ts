/**
 * Segment pace tolerances, used to widen a single-pace target into a range for the granular pace read and the
 * analyzer's interval enrichment. Exports getPaceToleranceForSegment.
 * ⛔ THE PENALTY EXECUTION SCORE THAT LIVED HERE IS DELETED (2026-09-17). Its result was assigned and never read; the
 * score is Garmin's time in range now (`_shared/execution-score.ts`). The weights and the direction penalties only
 * fed it and went with it. The tolerances stay: `granular-pace.ts` and the enrichment in `index.ts` still read them.
 */

export type SegmentType = 'warmup' | 'cooldown' | 'work_interval' | 'tempo' | 'cruise_interval' | 'recovery_jog' | 'easy_run';

export interface SegmentConfig {
  tolerance: number;
}

// Tolerance guidelines:
// - Quality/intervals: ±4-5% (tighter) - work_interval uses 5%
// - Easy/tempo: ±6-8% (looser) - tempo uses 7%, easy_run uses 8%
// OURS — `SEGMENT_CONFIG` tolerances; no page, kept as found. They widen a single-pace target only; Execution does not read them.
const SEGMENT_CONFIG: Record<SegmentType, SegmentConfig> = {
  warmup: { tolerance: 10 },
  cooldown: { tolerance: 10 },
  work_interval: { tolerance: 5 },
  tempo: { tolerance: 7 }, // ±7% for tempo (looser than intervals)
  cruise_interval: { tolerance: 5 },
  recovery_jog: { tolerance: 15 },
  easy_run: { tolerance: 8 }
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
    // OURS — `inferSegmentType` over 20 min or 3 mi = tempo, 8 min or less = interval; no page, kept as found
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

  // OURS — 5% when the segment type is unknown; kept as found
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
