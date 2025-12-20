/**
 * Effort Score Calculation Utilities
 * 
 * Effort Score is the app's proprietary fitness metric based on VDOT calculation.
 * Used by Balanced Build plans to calculate personalized training paces.
 * 
 * The math is based on Jack Daniels' Running Formula (public domain).
 * We brand it as "Effort Score" for product identity.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TrainingPaces {
  base: number;    // Easy pace (seconds per mile)
  race: number;    // Marathon pace (seconds per mile)
  steady: number;  // Threshold pace (seconds per mile)
  power: number;   // Interval pace (seconds per mile)
  speed: number;   // Repetition pace (seconds per mile)
}

export interface EffortScoreResult {
  score: number;
  paces: TrainingPaces;
  pacesKm: TrainingPaces;  // Same paces in seconds per km
}

export type RaceDistance = '5k' | '10k' | 'half' | 'marathon';

// ============================================================================
// VDOT LOOKUP TABLES
// ============================================================================

// VDOT values mapped to race times (in seconds)
// Source: Jack Daniels' Running Formula tables
const VDOT_TABLE: { vdot: number; times: Record<RaceDistance, number> }[] = [
  { vdot: 30, times: { '5k': 1860, '10k': 3900, 'half': 8580, 'marathon': 17880 } },
  { vdot: 31, times: { '5k': 1800, '10k': 3768, 'half': 8292, 'marathon': 17280 } },
  { vdot: 32, times: { '5k': 1740, '10k': 3642, 'half': 8016, 'marathon': 16704 } },
  { vdot: 33, times: { '5k': 1686, '10k': 3528, 'half': 7764, 'marathon': 16164 } },
  { vdot: 34, times: { '5k': 1632, '10k': 3414, 'half': 7518, 'marathon': 15648 } },
  { vdot: 35, times: { '5k': 1584, '10k': 3312, 'half': 7290, 'marathon': 15168 } },
  { vdot: 36, times: { '5k': 1536, '10k': 3210, 'half': 7068, 'marathon': 14712 } },
  { vdot: 37, times: { '5k': 1488, '10k': 3114, 'half': 6858, 'marathon': 14280 } },
  { vdot: 38, times: { '5k': 1446, '10k': 3024, 'half': 6660, 'marathon': 13872 } },
  { vdot: 39, times: { '5k': 1404, '10k': 2940, 'half': 6468, 'marathon': 13476 } },
  { vdot: 40, times: { '5k': 1362, '10k': 2856, 'half': 6288, 'marathon': 13104 } },
  { vdot: 41, times: { '5k': 1326, '10k': 2778, 'half': 6114, 'marathon': 12750 } },
  { vdot: 42, times: { '5k': 1290, '10k': 2700, 'half': 5946, 'marathon': 12408 } },
  { vdot: 43, times: { '5k': 1254, '10k': 2628, 'half': 5790, 'marathon': 12084 } },
  { vdot: 44, times: { '5k': 1222, '10k': 2558, 'half': 5634, 'marathon': 11772 } },
  { vdot: 45, times: { '5k': 1188, '10k': 2490, 'half': 5490, 'marathon': 11472 } },
  { vdot: 46, times: { '5k': 1158, '10k': 2424, 'half': 5346, 'marathon': 11184 } },
  { vdot: 47, times: { '5k': 1128, '10k': 2364, 'half': 5214, 'marathon': 10908 } },
  { vdot: 48, times: { '5k': 1098, '10k': 2304, 'half': 5082, 'marathon': 10644 } },
  { vdot: 49, times: { '5k': 1072, '10k': 2244, 'half': 4956, 'marathon': 10392 } },
  { vdot: 50, times: { '5k': 1044, '10k': 2190, 'half': 4836, 'marathon': 10152 } },
  { vdot: 51, times: { '5k': 1020, '10k': 2136, 'half': 4716, 'marathon': 9918 } },
  { vdot: 52, times: { '5k': 996, '10k': 2088, 'half': 4608, 'marathon': 9696 } },
  { vdot: 53, times: { '5k': 972, '10k': 2040, 'half': 4500, 'marathon': 9480 } },
  { vdot: 54, times: { '5k': 951, '10k': 1992, 'half': 4398, 'marathon': 9276 } },
  { vdot: 55, times: { '5k': 930, '10k': 1950, 'half': 4302, 'marathon': 9078 } },
  { vdot: 56, times: { '5k': 909, '10k': 1908, 'half': 4206, 'marathon': 8892 } },
  { vdot: 57, times: { '5k': 891, '10k': 1866, 'half': 4116, 'marathon': 8712 } },
  { vdot: 58, times: { '5k': 873, '10k': 1830, 'half': 4032, 'marathon': 8538 } },
  { vdot: 59, times: { '5k': 855, '10k': 1794, 'half': 3954, 'marathon': 8376 } },
  { vdot: 60, times: { '5k': 838, '10k': 1758, 'half': 3876, 'marathon': 8220 } },
  { vdot: 65, times: { '5k': 762, '10k': 1596, 'half': 3522, 'marathon': 7482 } },
  { vdot: 70, times: { '5k': 696, '10k': 1458, 'half': 3222, 'marathon': 6858 } },
  { vdot: 75, times: { '5k': 642, '10k': 1344, 'half': 2970, 'marathon': 6330 } },
  { vdot: 80, times: { '5k': 594, '10k': 1248, 'half': 2754, 'marathon': 5880 } },
  { vdot: 85, times: { '5k': 552, '10k': 1158, 'half': 2562, 'marathon': 5478 } },
];

// Training paces by VDOT (seconds per mile)
const PACE_TABLE: { vdot: number; paces: TrainingPaces }[] = [
  { vdot: 30, paces: { base: 744, race: 682, steady: 622, power: 568, speed: 534 } },
  { vdot: 32, paces: { base: 708, race: 648, steady: 592, power: 540, speed: 508 } },
  { vdot: 34, paces: { base: 672, race: 618, steady: 564, power: 516, speed: 484 } },
  { vdot: 36, paces: { base: 642, race: 588, steady: 538, power: 492, speed: 462 } },
  { vdot: 38, paces: { base: 612, race: 562, steady: 514, power: 470, speed: 442 } },
  { vdot: 40, paces: { base: 585, race: 537, steady: 491, power: 449, speed: 422 } },
  { vdot: 42, paces: { base: 560, race: 514, steady: 470, power: 430, speed: 404 } },
  { vdot: 44, paces: { base: 536, race: 492, steady: 450, power: 412, speed: 387 } },
  { vdot: 45, paces: { base: 525, race: 482, steady: 441, power: 403, speed: 379 } },
  { vdot: 46, paces: { base: 514, race: 472, steady: 432, power: 395, speed: 371 } },
  { vdot: 48, paces: { base: 494, race: 453, steady: 415, power: 379, speed: 357 } },
  { vdot: 50, paces: { base: 474, race: 436, steady: 399, power: 365, speed: 343 } },
  { vdot: 52, paces: { base: 456, race: 419, steady: 383, power: 351, speed: 330 } },
  { vdot: 54, paces: { base: 439, race: 403, steady: 369, power: 338, speed: 318 } },
  { vdot: 56, paces: { base: 423, race: 388, steady: 355, power: 325, speed: 306 } },
  { vdot: 58, paces: { base: 408, race: 375, steady: 343, power: 314, speed: 295 } },
  { vdot: 60, paces: { base: 394, race: 362, steady: 331, power: 303, speed: 285 } },
  { vdot: 65, paces: { base: 362, race: 332, steady: 304, power: 278, speed: 262 } },
  { vdot: 70, paces: { base: 334, race: 306, steady: 280, power: 256, speed: 241 } },
  { vdot: 75, paces: { base: 309, race: 284, steady: 260, power: 238, speed: 224 } },
  { vdot: 80, paces: { base: 287, race: 264, steady: 241, power: 221, speed: 208 } },
];

// ============================================================================
// DISTANCE CONVERSION
// ============================================================================

const DISTANCE_METERS: Record<RaceDistance, number> = {
  '5k': 5000,
  '10k': 10000,
  'half': 21097,
  'marathon': 42195,
};

export function metersToRaceDistance(meters: number): RaceDistance | null {
  if (meters === 5000) return '5k';
  if (meters === 10000) return '10k';
  if (meters >= 21000 && meters <= 21200) return 'half';
  if (meters >= 42000 && meters <= 42300) return 'marathon';
  return null;
}

export function raceDistanceToMeters(distance: RaceDistance): number {
  return DISTANCE_METERS[distance];
}

// ============================================================================
// EFFORT SCORE CALCULATION
// ============================================================================

/**
 * Calculate Effort Score from a race result
 * Uses interpolation between VDOT table entries
 */
export function calculateEffortScore(
  distanceMeters: number,
  timeSeconds: number
): number {
  const distance = metersToRaceDistance(distanceMeters);
  if (!distance) {
    console.warn('Unknown race distance:', distanceMeters);
    return 40; // Default fallback
  }

  // Find the two VDOT entries that bracket this time
  let lower = VDOT_TABLE[0];
  let upper = VDOT_TABLE[VDOT_TABLE.length - 1];

  for (let i = 0; i < VDOT_TABLE.length - 1; i++) {
    const current = VDOT_TABLE[i];
    const next = VDOT_TABLE[i + 1];
    
    if (timeSeconds <= current.times[distance] && timeSeconds >= next.times[distance]) {
      lower = current;
      upper = next;
      break;
    }
  }

  // Handle edge cases
  if (timeSeconds >= lower.times[distance]) {
    return lower.vdot;
  }
  if (timeSeconds <= upper.times[distance]) {
    return upper.vdot;
  }

  // Linear interpolation
  const lowerTime = lower.times[distance];
  const upperTime = upper.times[distance];
  const timeDiff = lowerTime - upperTime;
  const vdotDiff = upper.vdot - lower.vdot;
  
  const fraction = (lowerTime - timeSeconds) / timeDiff;
  const vdot = lower.vdot + (fraction * vdotDiff);

  return Math.round(vdot * 10) / 10; // Round to 1 decimal
}

/**
 * Get training paces from Effort Score
 * Returns paces in seconds per mile
 */
export function getPacesFromScore(score: number): TrainingPaces {
  // Find the two pace entries that bracket this score
  let lower = PACE_TABLE[0];
  let upper = PACE_TABLE[PACE_TABLE.length - 1];

  for (let i = 0; i < PACE_TABLE.length - 1; i++) {
    const current = PACE_TABLE[i];
    const next = PACE_TABLE[i + 1];
    
    if (score >= current.vdot && score <= next.vdot) {
      lower = current;
      upper = next;
      break;
    }
  }

  // Handle edge cases
  if (score <= lower.vdot) {
    return { ...lower.paces };
  }
  if (score >= upper.vdot) {
    return { ...upper.paces };
  }

  // Linear interpolation for each pace
  const fraction = (score - lower.vdot) / (upper.vdot - lower.vdot);
  
  return {
    base: Math.round(lower.paces.base - fraction * (lower.paces.base - upper.paces.base)),
    race: Math.round(lower.paces.race - fraction * (lower.paces.race - upper.paces.race)),
    steady: Math.round(lower.paces.steady - fraction * (lower.paces.steady - upper.paces.steady)),
    power: Math.round(lower.paces.power - fraction * (lower.paces.power - upper.paces.power)),
    speed: Math.round(lower.paces.speed - fraction * (lower.paces.speed - upper.paces.speed)),
  };
}

/**
 * Convert paces from seconds/mile to seconds/km
 */
export function pacesToKm(paces: TrainingPaces): TrainingPaces {
  const mileToKm = 1.60934;
  return {
    base: Math.round(paces.base / mileToKm),
    race: Math.round(paces.race / mileToKm),
    steady: Math.round(paces.steady / mileToKm),
    power: Math.round(paces.power / mileToKm),
    speed: Math.round(paces.speed / mileToKm),
  };
}

/**
 * Full calculation: race result → Effort Score + all paces
 */
export function calculateEffortScoreResult(
  distanceMeters: number,
  timeSeconds: number
): EffortScoreResult {
  const score = calculateEffortScore(distanceMeters, timeSeconds);
  const paces = getPacesFromScore(score);
  const pacesKm = pacesToKm(paces);
  
  return { score, paces, pacesKm };
}

// ============================================================================
// RECENCY ADJUSTMENT
// ============================================================================

export type RaceRecency = 'recent' | '3-6months' | '6-12months' | 'over1year';

/**
 * Adjust Effort Score based on how old the race result is
 * Fitness decays over time without training
 */
export function adjustScoreForRecency(
  score: number,
  recency: RaceRecency,
  currentlyTraining: boolean = false
): number {
  const adjustments: Record<RaceRecency, number> = {
    'recent': 0,           // Last 3 months - no adjustment
    '3-6months': -2,       // Slight decline
    '6-12months': -4,      // Moderate decline
    'over1year': -6,       // Significant decline (unless maintaining)
  };

  let adjustment = adjustments[recency];
  
  // If they're currently training at a decent level, reduce the penalty
  if (currentlyTraining && recency !== 'recent') {
    adjustment = Math.round(adjustment / 2);
  }

  return Math.max(30, score + adjustment); // Don't go below 30
}

// ============================================================================
// ESTIMATED SCORE FROM FITNESS LEVEL
// ============================================================================

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Estimate Effort Score from self-reported fitness level
 * Used when user doesn't have a recent race time
 */
export function estimateScoreFromFitness(level: FitnessLevel): number {
  const estimates: Record<FitnessLevel, number> = {
    'beginner': 32,      // ~28:00 5K
    'intermediate': 40,  // ~24:00 5K
    'advanced': 48,      // ~20:00 5K
  };
  return estimates[level];
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format seconds to MM:SS pace string
 */
export function formatPace(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to pace with unit
 */
export function formatPaceWithUnit(seconds: number, unit: 'mi' | 'km'): string {
  return `${formatPace(seconds)}/${unit}`;
}

/**
 * Format a time in seconds to HH:MM:SS or MM:SS
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse time string to seconds
 * - For 5K/10K: MM:SS format (e.g., "22:00" = 22 minutes)
 * - For Half/Marathon: H:MM or H:MM:SS format (e.g., "3:55" = 3 hours 55 minutes)
 */
export function parseTimeToSeconds(timeStr: string, distance?: RaceDistance): number | null {
  const parts = timeStr.split(':').map(p => parseInt(p, 10));
  
  if (parts.some(isNaN)) return null;
  
  if (parts.length === 2) {
    // Two-part time: could be MM:SS or H:MM depending on context
    if (distance === 'marathon' || distance === 'half') {
      // For marathon/half, interpret as H:MM (hours:minutes)
      return parts[0] * 3600 + parts[1] * 60;
    } else {
      // For 5K/10K, interpret as MM:SS (minutes:seconds)
      return parts[0] * 60 + parts[1];
    }
  } else if (parts.length === 3) {
    // Three-part time: always HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return null;
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Get a user-friendly description of training zones
 */
export function getZoneDescriptions(paces: TrainingPaces, unit: 'mi' | 'km'): {
  name: string;
  brandName: string;
  pace: string;
  purpose: string;
}[] {
  const p = unit === 'km' ? pacesToKm(paces) : paces;
  
  return [
    {
      name: 'Easy',
      brandName: 'Base',
      pace: formatPaceWithUnit(p.base, unit),
      purpose: 'Aerobic foundation and recovery',
    },
    {
      name: 'Marathon',
      brandName: 'Race',
      pace: formatPaceWithUnit(p.race, unit),
      purpose: 'Goal race pace and rhythm',
    },
    {
      name: 'Threshold',
      brandName: 'Steady',
      pace: formatPaceWithUnit(p.steady, unit),
      purpose: 'Lactate threshold and stamina',
    },
    {
      name: 'Interval',
      brandName: 'Power',
      pace: formatPaceWithUnit(p.power, unit),
      purpose: 'VO2max and aerobic power',
    },
    {
      name: 'Repetition',
      brandName: 'Speed',
      pace: formatPaceWithUnit(p.speed, unit),
      purpose: 'Running economy and speed',
    },
  ];
}
