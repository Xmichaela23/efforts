/**
 * Workout Type Detection
 * 
 * Single place for determining workout type from structure and metadata.
 * All detection is deterministic - pattern matching on intervals and description.
 */

import { WorkoutType, IntervalData } from './types.ts';

interface PlannedWorkoutInfo {
  description?: string;
  workoutToken?: string;
  intent?: string;
}

/**
 * Detect workout type from intervals and planned workout info.
 */
export function detectWorkoutType(
  intervals: IntervalData[],
  plannedWorkout?: PlannedWorkoutInfo
): WorkoutType {
  console.log('🔍 [WORKOUT TYPE] Detecting...');
  console.log('🔍 [WORKOUT TYPE] Intervals:', intervals?.length || 0);
  
  // No intervals = steady state
  if (!intervals || intervals.length === 0) {
    console.log('🔍 [WORKOUT TYPE] No intervals → steady_state');
    return 'steady_state';
  }
  
  // Separate by role
  const workIntervals = intervals.filter(i => 
    i.role === 'work' || i.role === 'Work'
  );
  const recoveryIntervals = intervals.filter(i => 
    i.role === 'recovery' || i.role === 'Recovery' || i.role === 'rest'
  );
  
  console.log('🔍 [WORKOUT TYPE] Work intervals:', workIntervals.length);
  console.log('🔍 [WORKOUT TYPE] Recovery intervals:', recoveryIntervals.length);
  
  // Check description for explicit type hints
  const desc = (plannedWorkout?.description || '').toLowerCase();
  const token = (plannedWorkout?.workoutToken || '').toLowerCase();
  
  // Hill repeats detection
  if (isHillRepeats(intervals, desc, token)) {
    console.log('🔍 [WORKOUT TYPE] Hill repeats detected');
    return 'hill_repeats';
  }
  
  // Fartlek detection
  if (isFartlek(desc, token)) {
    console.log('🔍 [WORKOUT TYPE] Fartlek detected');
    return 'fartlek';
  }
  
  // Standard intervals: multiple work segments with recovery between
  if (workIntervals.length > 1 && recoveryIntervals.length > 0) {
    console.log('🔍 [WORKOUT TYPE] Multiple work + recovery → intervals');
    return 'intervals';
  }
  
  // Check for alternating work/recovery pattern by pace difference
  if (hasAlternatingPattern(intervals)) {
    console.log('🔍 [WORKOUT TYPE] Alternating pace pattern → intervals');
    return 'intervals';
  }
  
  // Check for tempo finish or progressive patterns
  const tempoOrProgressive = detectTempoOrProgressive(intervals, workIntervals, desc, token);
  if (tempoOrProgressive) {
    console.log('🔍 [WORKOUT TYPE] Detected:', tempoOrProgressive);
    return tempoOrProgressive;
  }
  
  // Check description for type keywords
  if (desc.includes('progressive') || token.includes('progressive')) {
    console.log('🔍 [WORKOUT TYPE] Description mentions progressive');
    return 'progressive';
  }
  
  if (desc.includes('tempo finish') || desc.includes('fast finish') ||
      desc.includes('@ m pace') || desc.includes('@ tempo') ||
      desc.includes('pickup') || desc.includes('strides')) {
    console.log('🔍 [WORKOUT TYPE] Description mentions tempo/fast finish');
    return 'tempo_finish';
  }
  
  console.log('🔍 [WORKOUT TYPE] Default → steady_state');
  return 'steady_state';
}

/**
 * Detect hill repeats from intervals or description.
 */
function isHillRepeats(
  intervals: IntervalData[],
  description: string,
  token: string
): boolean {
  // Check description keywords
  const hillKeywords = ['hill', 'hills', 'climb', 'uphill', 'incline'];
  const repeatKeywords = ['repeat', 'reps', 'x ', '×'];
  
  const hasHillWord = hillKeywords.some(kw => description.includes(kw) || token.includes(kw));
  const hasRepeatWord = repeatKeywords.some(kw => description.includes(kw) || token.includes(kw));
  
  if (hasHillWord && hasRepeatWord) {
    return true;
  }
  
  // Could also detect from elevation pattern in intervals
  // (e.g., each work interval has significant elevation gain)
  // TODO: Add elevation-based detection if interval elevation data available
  
  return false;
}

/**
 * Detect fartlek from description.
 */
function isFartlek(description: string, token: string): boolean {
  return description.includes('fartlek') || token.includes('fartlek');
}

/**
 * Check for alternating work/recovery pattern by pace differences.
 *
 * Uses planned `paceRange` when present (linked planned interval session);
 * falls back to `executed.avgPaceSPerMi` for unplanned sessions where the
 * runner detected intervals via executed-pace variance (e.g., fartleks logged
 * as plain `role: 'lap'` with no planned target). Without the fallback,
 * unplanned interval-class sessions default to `'steady_state'` and miss the
 * mixed-effort decoupling path entirely.
 */
function hasAlternatingPattern(intervals: IntervalData[]): boolean {
  if (intervals.length < 4) return false;

  const pickPace = (iv: IntervalData): number => {
    if (iv.paceRange) return (iv.paceRange.lower + iv.paceRange.upper) / 2;
    const ex = iv.executed?.avgPaceSPerMi;
    return typeof ex === 'number' && ex > 0 ? ex : 0;
  };

  let alternations = 0;
  for (let i = 1; i < intervals.length; i++) {
    const prevPace = pickPace(intervals[i - 1]);
    const currPace = pickPace(intervals[i]);

    if (prevPace > 0 && currPace > 0) {
      // Significant pace difference (>15%) suggests alternation
      const diff = Math.abs(currPace - prevPace) / Math.min(currPace, prevPace);
      if (diff > 0.15) {
        alternations++;
      }
    }
  }

  // Need at least 2 alternations to consider it interval pattern
  return alternations >= 2;
}

/**
 * Detect tempo finish vs progressive based on pace pattern.
 */
function detectTempoOrProgressive(
  allIntervals: IntervalData[],
  workIntervals: IntervalData[],
  description: string,
  token: string
): WorkoutType | null {
  const relevantIntervals = workIntervals.length >= 2 ? workIntervals : allIntervals;
  
  if (relevantIntervals.length < 2) return null;
  
  // Get pace values
  const paceRanges = relevantIntervals
    .map(i => i.paceRange || (i.executed?.avgPaceSPerMi ? { lower: i.executed.avgPaceSPerMi, upper: i.executed.avgPaceSPerMi } : null))
    .filter(Boolean) as { lower: number; upper: number }[];
  
  if (paceRanges.length < 2) return null;
  
  const firstPace = (paceRanges[0].lower + paceRanges[0].upper) / 2;
  const lastPace = (paceRanges[paceRanges.length - 1].lower + paceRanges[paceRanges.length - 1].upper) / 2;
  
  // Last segment significantly faster (>5% faster = lower seconds/mile)
  if (lastPace < firstPace * 0.95) {
    // Calculate durations to determine tempo finish vs progressive
    const lastInterval = relevantIntervals[relevantIntervals.length - 1];
    const lastDuration = getIntervalDuration(lastInterval);
    const totalDuration = relevantIntervals.reduce((sum, i) => sum + getIntervalDuration(i), 0);
    
    console.log('🔍 [WORKOUT TYPE] Tempo check: lastDuration=', lastDuration, 'totalDuration=', totalDuration);
    
    if (totalDuration > 0 && lastDuration / totalDuration < 0.25) {
      // Small fast finish (<25% of workout) = tempo finish
      return 'tempo_finish';
    }
    
    // Gradual pace increase throughout = progressive
    return 'progressive';
  }
  
  return null;
}

/**
 * Get interval duration from various sources.
 */
function getIntervalDuration(interval: IntervalData): number {
  // Try time-based duration
  if (interval.startTimeS !== undefined && interval.endTimeS !== undefined) {
    const duration = interval.endTimeS - interval.startTimeS;
    if (duration > 0) return duration;
  }
  
  // Try sample-based duration (~1 sample/sec)
  if (interval.sampleIdxStart !== undefined && interval.sampleIdxEnd !== undefined) {
    const duration = interval.sampleIdxEnd - interval.sampleIdxStart;
    if (duration > 0) return duration;
  }
  
  // Try executed duration
  if (interval.executed?.durationS) {
    return interval.executed.durationS;
  }
  
  return 0;
}
