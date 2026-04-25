// =============================================================================
// RIEGEL — endurance-time prediction across distances
// =============================================================================
// Single source of truth for the Riegel scaling law:
//
//   T2 = T1 * (D2/D1)^1.06
//
// Used by:
//   - session-detail/forward-context.ts  (project this race onto next race)
//   - race-feedback.ts                    (project this race onto threshold pace)
//
// Conservative, well-behaved, and accurate enough at endurance distances
// (5K → marathon range). Beyond ultra distances drift can creep in.
// =============================================================================

/** Standard Riegel exponent for human endurance running. */
export const RIEGEL_EXPONENT = 1.06;

/**
 * Standard Riegel: predict the time at distance D2 given a known time T1
 * at distance D1.
 */
export function riegelProjectTime(args: {
  knownTimeSeconds: number;
  knownDistanceMeters: number;
  targetDistanceMeters: number;
}): number {
  const { knownTimeSeconds, knownDistanceMeters, targetDistanceMeters } = args;
  if (knownTimeSeconds <= 0 || knownDistanceMeters <= 0 || targetDistanceMeters <= 0) return 0;
  const ratio = targetDistanceMeters / knownDistanceMeters;
  return knownTimeSeconds * Math.pow(ratio, RIEGEL_EXPONENT);
}

/**
 * Inverse Riegel: predict the distance covered in a target time T2 given a
 * known time T1 at distance D1. From T2 = T1 * (D2/D1)^1.06 →
 * D2 = D1 * (T2/T1)^(1/1.06).
 */
export function riegelProjectDistance(args: {
  knownTimeSeconds: number;
  knownDistanceMeters: number;
  targetTimeSeconds: number;
}): number {
  const { knownTimeSeconds, knownDistanceMeters, targetTimeSeconds } = args;
  if (knownTimeSeconds <= 0 || knownDistanceMeters <= 0 || targetTimeSeconds <= 0) return 0;
  const ratio = targetTimeSeconds / knownTimeSeconds;
  return knownDistanceMeters * Math.pow(ratio, 1 / RIEGEL_EXPONENT);
}

/**
 * Convenience: from a race result, derive the athlete's threshold pace
 * (sec/km), defined operationally as the pace they could hold for one
 * hour. Standard "lactate threshold ≈ 1-hour TT" mapping.
 *
 * Example: a 4:32 marathon (16320s, 42195m) → ~10067m in 1 hour →
 * threshold pace ~358 sec/km (~5:58/km).
 */
export function riegelThresholdPaceSecPerKm(args: {
  raceTimeSeconds: number;
  raceDistanceMeters: number;
}): number {
  const oneHourDistanceM = riegelProjectDistance({
    knownTimeSeconds: args.raceTimeSeconds,
    knownDistanceMeters: args.raceDistanceMeters,
    targetTimeSeconds: 3600,
  });
  if (oneHourDistanceM <= 0) return 0;
  return 3600 / (oneHourDistanceM / 1000);
}
