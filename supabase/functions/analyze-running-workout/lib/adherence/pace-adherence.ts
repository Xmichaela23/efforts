/**
 * Calculate pace adherence for a range-based target
 * Returns 0-100% adherence score
 */
export function calculatePaceRangeAdherence(
  actualPaceSeconds: number,
  paceRangeLower?: number,
  paceRangeUpper?: number
): number {
  if (!paceRangeLower || !paceRangeUpper || actualPaceSeconds <= 0) return 0;
  
  // If within range, perfect score
  if (actualPaceSeconds >= paceRangeLower && actualPaceSeconds <= paceRangeUpper) {
    return 100;
  }
  
  // For work intervals: if slightly faster than range (within 5 seconds), still give 100%
  // This accounts for GPS noise and the fact that being slightly faster is acceptable for work intervals
  if (actualPaceSeconds < paceRangeLower && (paceRangeLower - actualPaceSeconds) <= 5) {
    return 100;
  }
  
  // Calculate deviation from range
  let deviation = 0;
  if (actualPaceSeconds < paceRangeLower) {
    deviation = paceRangeLower - actualPaceSeconds;
  } else {
    deviation = actualPaceSeconds - paceRangeUpper;
  }
  
  // Calculate penalty - range width is the tolerance
  const rangeWidth = (paceRangeUpper - paceRangeLower) / 2;
  const penalty = (deviation / rangeWidth) * 100;
  
  return Math.max(0, 100 - penalty);
}

