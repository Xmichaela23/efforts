/**
 * HR Zone Distribution Calculator
 * 
 * Calculates time spent in each HR zone.
 * Uses user-defined zones if available, otherwise estimates from max HR.
 */

import { SensorSample, ZoneDistribution, ZoneTime } from './types.ts';

interface HRZones {
  z1Max: number;  // Recovery ceiling
  z2Max: number;  // Aerobic ceiling
  z3Max: number;  // Tempo ceiling
  z4Max: number;  // Threshold ceiling
  z5Max: number;  // VO2max ceiling (effectively max HR)
}

// Default zone percentages of max HR (if no custom zones provided)
const DEFAULT_ZONE_PERCENTAGES = {
  z1Max: 0.60,  // Recovery: <60% max HR
  z2Max: 0.70,  // Aerobic: 60-70% max HR
  z3Max: 0.80,  // Tempo: 70-80% max HR
  z4Max: 0.90,  // Threshold: 80-90% max HR
  z5Max: 1.00   // VO2max: 90-100% max HR
};

/**
 * Calculate zone distribution from HR samples.
 */
export function calculateZoneDistribution(
  validHRSamples: SensorSample[],
  customZones?: HRZones,
  workoutIntent?: string
): ZoneDistribution {
  if (validHRSamples.length === 0) {
    return {
      distribution: [],
      primaryZone: 'Unknown',
      zoneCreep: false,
      timeAboveTarget: 0,
      percentInTarget: 0
    };
  }
  
  // Determine zones to use
  const zones = customZones || estimateZonesFromSamples(validHRSamples);
  
  // Count time in each zone (assuming ~1 sample/second)
  const zoneCounts = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  
  for (const sample of validHRSamples) {
    const hr = sample.heart_rate!;
    
    if (hr <= zones.z1Max) {
      zoneCounts.z1++;
    } else if (hr <= zones.z2Max) {
      zoneCounts.z2++;
    } else if (hr <= zones.z3Max) {
      zoneCounts.z3++;
    } else if (hr <= zones.z4Max) {
      zoneCounts.z4++;
    } else {
      zoneCounts.z5++;
    }
  }
  
  const totalSamples = validHRSamples.length;
  
  // Build distribution array
  const distribution: ZoneTime[] = [
    {
      zone: 'Z1 Recovery',
      label: 'Z1',
      rangeDescription: `< ${zones.z1Max} bpm`,
      seconds: zoneCounts.z1,
      percent: Math.round((zoneCounts.z1 / totalSamples) * 100)
    },
    {
      zone: 'Z2 Aerobic',
      label: 'Z2',
      rangeDescription: `${zones.z1Max}-${zones.z2Max} bpm`,
      seconds: zoneCounts.z2,
      percent: Math.round((zoneCounts.z2 / totalSamples) * 100)
    },
    {
      zone: 'Z3 Tempo',
      label: 'Z3',
      rangeDescription: `${zones.z2Max}-${zones.z3Max} bpm`,
      seconds: zoneCounts.z3,
      percent: Math.round((zoneCounts.z3 / totalSamples) * 100)
    },
    {
      zone: 'Z4 Threshold',
      label: 'Z4',
      rangeDescription: `${zones.z3Max}-${zones.z4Max} bpm`,
      seconds: zoneCounts.z4,
      percent: Math.round((zoneCounts.z4 / totalSamples) * 100)
    },
    {
      zone: 'Z5 VO2max',
      label: 'Z5',
      rangeDescription: `> ${zones.z4Max} bpm`,
      seconds: zoneCounts.z5,
      percent: Math.round((zoneCounts.z5 / totalSamples) * 100)
    }
  ];
  
  // Determine primary zone (most time spent)
  const maxZone = distribution.reduce((max, zone) => 
    zone.seconds > max.seconds ? zone : max
  );
  
  // Detect zone creep (started lower, ended higher)
  const zoneCreep = detectZoneCreep(validHRSamples, zones);
  
  // Calculate time above target zone (based on workout intent)
  const { timeAboveTarget, percentInTarget } = calculateTargetCompliance(
    zoneCounts,
    totalSamples,
    workoutIntent
  );
  
  return {
    distribution,
    primaryZone: maxZone.zone,
    zoneCreep,
    timeAboveTarget,
    percentInTarget
  };
}

/**
 * Estimate HR zones from the workout's HR data.
 * Uses max HR observed + typical zone percentages.
 */
function estimateZonesFromSamples(samples: SensorSample[]): HRZones {
  const hrValues = samples.map(s => s.heart_rate!);
  const maxHR = Math.max(...hrValues);
  
  // If max HR seems too low (probably didn't hit max), estimate higher
  // Rule of thumb: during a workout, peak HR is often 85-95% of true max
  const estimatedMaxHR = maxHR < 150 ? 180 : Math.round(maxHR / 0.90);
  
  return {
    z1Max: Math.round(estimatedMaxHR * DEFAULT_ZONE_PERCENTAGES.z1Max),
    z2Max: Math.round(estimatedMaxHR * DEFAULT_ZONE_PERCENTAGES.z2Max),
    z3Max: Math.round(estimatedMaxHR * DEFAULT_ZONE_PERCENTAGES.z3Max),
    z4Max: Math.round(estimatedMaxHR * DEFAULT_ZONE_PERCENTAGES.z4Max),
    z5Max: Math.round(estimatedMaxHR * DEFAULT_ZONE_PERCENTAGES.z5Max)
  };
}

/**
 * Detect if HR crept from a lower zone to a higher zone during the workout.
 */
function detectZoneCreep(samples: SensorSample[], zones: HRZones): boolean {
  if (samples.length < 600) return false; // Need at least 10 min
  
  const windowSize = Math.min(300, Math.floor(samples.length / 4)); // 5 min or 1/4 workout
  
  // Early window (after warmup - skip first 10%)
  const earlyStart = Math.floor(samples.length * 0.1);
  const earlySamples = samples.slice(earlyStart, earlyStart + windowSize);
  const earlyAvgHR = earlySamples.reduce((sum, s) => sum + s.heart_rate!, 0) / earlySamples.length;
  
  // Late window (before cooldown - skip last 5%)
  const lateEnd = Math.floor(samples.length * 0.95);
  const lateSamples = samples.slice(lateEnd - windowSize, lateEnd);
  const lateAvgHR = lateSamples.reduce((sum, s) => sum + s.heart_rate!, 0) / lateSamples.length;
  
  // Determine zones
  const earlyZone = getZoneNumber(earlyAvgHR, zones);
  const lateZone = getZoneNumber(lateAvgHR, zones);
  
  return lateZone > earlyZone;
}

/**
 * Get zone number (1-5) for a given HR.
 */
function getZoneNumber(hr: number, zones: HRZones): number {
  if (hr <= zones.z1Max) return 1;
  if (hr <= zones.z2Max) return 2;
  if (hr <= zones.z3Max) return 3;
  if (hr <= zones.z4Max) return 4;
  return 5;
}

/**
 * Calculate compliance with target zone based on workout intent.
 */
function calculateTargetCompliance(
  zoneCounts: { z1: number; z2: number; z3: number; z4: number; z5: number },
  totalSamples: number,
  workoutIntent?: string
): { timeAboveTarget: number; percentInTarget: number } {
  // Default: no target
  if (!workoutIntent) {
    return { timeAboveTarget: 0, percentInTarget: 0 };
  }
  
  const intent = workoutIntent.toLowerCase();
  
  // Easy/recovery runs should be Z1-Z2
  if (intent.includes('easy') || intent.includes('recovery')) {
    const inTarget = zoneCounts.z1 + zoneCounts.z2;
    const aboveTarget = zoneCounts.z3 + zoneCounts.z4 + zoneCounts.z5;
    return {
      timeAboveTarget: aboveTarget,
      percentInTarget: Math.round((inTarget / totalSamples) * 100)
    };
  }
  
  // Long runs should be mostly Z2 with some Z3
  if (intent.includes('long')) {
    const inTarget = zoneCounts.z1 + zoneCounts.z2 + zoneCounts.z3;
    const aboveTarget = zoneCounts.z4 + zoneCounts.z5;
    return {
      timeAboveTarget: aboveTarget,
      percentInTarget: Math.round((inTarget / totalSamples) * 100)
    };
  }
  
  // Tempo runs should be Z3-Z4
  if (intent.includes('tempo') || intent.includes('threshold')) {
    const inTarget = zoneCounts.z3 + zoneCounts.z4;
    const aboveTarget = zoneCounts.z5;
    return {
      timeAboveTarget: aboveTarget,
      percentInTarget: Math.round((inTarget / totalSamples) * 100)
    };
  }
  
  // Intervals - Z4-Z5 during work
  if (intent.includes('interval') || intent.includes('speed')) {
    const inTarget = zoneCounts.z4 + zoneCounts.z5;
    return {
      timeAboveTarget: 0, // For intervals, high zones are expected
      percentInTarget: Math.round((inTarget / totalSamples) * 100)
    };
  }
  
  return { timeAboveTarget: 0, percentInTarget: 0 };
}
