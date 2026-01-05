/**
 * Interval type for asymmetric pace adherence scoring
 */
export type IntervalType = 'work' | 'recovery' | 'easy' | 'warmup' | 'cooldown';

/**
 * Calculate pace adherence for a range-based target with ASYMMETRIC penalties
 * 
 * Training physiology reality:
 * - Work intervals: faster = strong (minor penalty), slower = missed stimulus (full penalty)
 * - Recovery intervals: faster = didn't recover (penalty), slower = fine (no penalty)
 * - Easy runs: faster = too aggressive (moderate penalty), slower = fine (minimal penalty)
 * - Warmup/Cooldown: very lenient - purpose is movement, not pace
 * 
 * Returns 0-100% adherence score
 */
export function calculatePaceRangeAdherence(
  actualPaceSeconds: number,
  paceRangeLower?: number,
  paceRangeUpper?: number,
  intervalType: IntervalType = 'work'
): number {
  if (!paceRangeLower || !paceRangeUpper || actualPaceSeconds <= 0) return 0;
  
  // If within range, perfect score for all interval types
  if (actualPaceSeconds >= paceRangeLower && actualPaceSeconds <= paceRangeUpper) {
    return 100;
  }
  
  const isFaster = actualPaceSeconds < paceRangeLower;
  const deviation = isFaster 
    ? paceRangeLower - actualPaceSeconds  // seconds faster than range
    : actualPaceSeconds - paceRangeUpper;  // seconds slower than range
  
  // Apply asymmetric scoring based on interval type
  switch (intervalType) {
    case 'work':
      return calculateWorkIntervalAdherence(deviation, isFaster);
    case 'recovery':
      return calculateRecoveryIntervalAdherence(deviation, isFaster);
    case 'easy':
      return calculateEasyRunAdherence(deviation, isFaster);
    case 'warmup':
    case 'cooldown':
      return calculateWarmupCooldownAdherence(deviation, isFaster);
    default:
      return calculateWorkIntervalAdherence(deviation, isFaster);
  }
}

/**
 * Work intervals (tempo, threshold, VO2max, 5K pace)
 * - Faster: Minor penalty (you're strong, but injury risk if way too fast)
 * - Slower: Full penalty (missed the training stimulus)
 */
function calculateWorkIntervalAdherence(deviation: number, isFaster: boolean): number {
  if (isFaster) {
    // Faster than target - you're strong!
    if (deviation <= 5) return 100;       // 0-5s faster: within GPS noise, perfect
    if (deviation <= 15) return 95;       // 6-15s faster: slightly aggressive
    if (deviation <= 30) return 85;       // 16-30s faster: moderate concern (injury risk)
    if (deviation <= 45) return 70;       // 31-45s faster: significantly too fast
    return 50;                            // 45s+ faster: dangerously fast, but still ran hard
  } else {
    // Slower than target - missed the effort
    if (deviation <= 5) return 100;       // 0-5s slower: within GPS noise, perfect
    if (deviation <= 15) return 60;       // 6-15s slower: missed effort but close
    if (deviation <= 30) return 30;       // 16-30s slower: failed rep but some benefit
    return 0;                             // 30s+ slower: complete failure
  }
}

/**
 * Recovery intervals (jogs between work intervals)
 * - Faster: Penalty (didn't recover, defeats the purpose)
 * - Slower: No penalty (still recovering, totally fine)
 */
function calculateRecoveryIntervalAdherence(deviation: number, isFaster: boolean): number {
  if (isFaster) {
    // Faster than recovery target - didn't recover
    if (deviation <= 5) return 100;       // 0-5s faster: within noise
    if (deviation <= 10) return 85;       // 6-10s faster: slightly rushed
    if (deviation <= 20) return 70;       // 11-20s faster: didn't recover fully
    if (deviation <= 30) return 55;       // 21-30s faster: defeated purpose
    return 40;                            // 30s+ faster: basically skipped recovery
  } else {
    // Slower than recovery target - still recovering, fine!
    return 100;                           // Any amount slower is perfect for recovery
  }
}

/**
 * Easy/Long runs
 * - Faster: Moderate penalty (too aggressive for easy day, but not terrible)
 * - Slower: Minimal penalty (easy runs should feel easy)
 */
function calculateEasyRunAdherence(deviation: number, isFaster: boolean): number {
  if (isFaster) {
    // Faster than easy pace - a bit aggressive
    if (deviation <= 5) return 100;       // 0-5s faster: within noise
    if (deviation <= 10) return 95;       // 6-10s faster: very minor concern
    if (deviation <= 20) return 85;       // 11-20s faster: moderate (not recovering)
    if (deviation <= 30) return 75;       // 21-30s faster: too hard for easy day
    if (deviation <= 45) return 65;       // 31-45s faster: significantly too hard
    return 50;                            // 45s+ faster: not an easy run anymore
  } else {
    // Slower than easy target - totally fine
    if (deviation <= 10) return 100;      // 0-10s slower: perfect
    if (deviation <= 20) return 98;       // 11-20s slower: still great
    if (deviation <= 30) return 95;       // 21-30s slower: fine
    return 90;                            // 30s+ slower: a bit slow but still valuable
  }
}

/**
 * Warmup/Cooldown
 * - Very lenient - purpose is movement preparation/recovery, not pace targets
 */
function calculateWarmupCooldownAdherence(deviation: number, isFaster: boolean): number {
  if (isFaster) {
    // Faster warmup - might not be ideal for prep, but minor concern
    if (deviation <= 15) return 100;      // 0-15s faster: fine
    if (deviation <= 30) return 95;       // 16-30s faster: slightly rushed
    if (deviation <= 45) return 90;       // 31-45s faster: too rushed
    return 80;                            // 45s+ faster: skipped warmup quality
  } else {
    // Slower warmup - totally fine, still moving
    return 100;                           // Any amount slower is fine
  }
}

/**
 * Determine interval type from role/kind string
 */
export function getIntervalType(role: string): IntervalType {
  const r = String(role || '').toLowerCase();
  
  if (r === 'warmup' || r === 'warm_up' || r === 'warm-up') return 'warmup';
  if (r === 'cooldown' || r === 'cool_down' || r === 'cool-down') return 'cooldown';
  if (r === 'recovery' || r === 'rest' || r === 'jog' || r === 'active_recovery') return 'recovery';
  if (r === 'easy' || r === 'long' || r === 'long_run' || r === 'easy_run' || r === 'aerobic') return 'easy';
  
  // Default to work for tempo, threshold, vo2max, 5k, interval, etc.
  return 'work';
}

/**
 * Legacy function for backward compatibility - treats all intervals as work
 * @deprecated Use calculatePaceRangeAdherence with intervalType parameter
 */
export function calculatePaceRangeAdherenceLegacy(
  actualPaceSeconds: number,
  paceRangeLower?: number,
  paceRangeUpper?: number
): number {
  return calculatePaceRangeAdherence(actualPaceSeconds, paceRangeLower, paceRangeUpper, 'work');
}
