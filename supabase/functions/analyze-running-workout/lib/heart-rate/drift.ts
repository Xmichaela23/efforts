/**
 * Steady-State HR Drift Analysis
 * 
 * Calculates cardiac drift for steady-state workouts.
 * Handles tempo_finish (excludes tempo portion) and progressive (first 2/3).
 * Includes terrain and weather adjustments.
 */

import {
  WorkoutType,
  SensorSample,
  HRAnalysisContext,
  DriftAnalysis,
  IntervalData
} from './types.ts';

// =============================================================================
// CONSTANTS
// =============================================================================

// Skip first 10 minutes for steady-state baseline (HR ramp-up period)
const WARMUP_SKIP_SECONDS = 600;

// Expected drift ranges by duration (bpm)
const DRIFT_EXPECTATIONS = {
  short: { lower: 3, upper: 8 },      // <60 min
  moderate: { lower: 5, upper: 12 },  // 60-90 min
  long: { lower: 8, upper: 15 },      // 90-150 min
  extended: { lower: 10, upper: 20 }  // 150+ min
};

// Terrain contribution: ~4 bpm per 1% grade difference
const GRADE_TO_HR_COEFFICIENT = 4;

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Analyze HR drift for steady-state workouts.
 */
export function analyzeSteadyStateDrift(
  sensorData: SensorSample[],
  validHRSamples: SensorSample[],
  context: HRAnalysisContext,
  workoutType: WorkoutType
): DriftAnalysis {
  console.log('📊 [DRIFT] Starting drift analysis for:', workoutType);
  console.log('📊 [DRIFT] Total samples:', sensorData.length);
  console.log('📊 [DRIFT] Valid HR samples:', validHRSamples.length);
  
  // Select samples based on workout type
  const selection = selectSamplesForDrift(
    validHRSamples,
    sensorData,
    workoutType,
    context.intervals
  );
  
  console.log('📊 [DRIFT] Samples to analyze:', selection.samples.length);
  console.log('📊 [DRIFT] Scope:', selection.scopeDescription);
  
  // Check minimum duration (need at least 15 min after warmup skip)
  const durationMinutes = selection.samples.length / 60;
  if (durationMinutes < 15) {
    console.log('📊 [DRIFT] Too short for drift analysis:', durationMinutes, 'min');
    return createInvalidDrift('Effort too short for drift analysis (< 15 minutes)', workoutType);
  }
  
  // Define early and late windows
  // Skip warmup (first 10 min) for early window
  const warmupSkip = Math.min(WARMUP_SKIP_SECONDS, Math.floor(selection.samples.length * 0.15));
  const samplesAfterWarmup = selection.samples.slice(warmupSkip);
  
  if (samplesAfterWarmup.length < 600) { // Need at least 10 min after warmup
    return createInvalidDrift('Insufficient data after warmup period', workoutType);
  }
  
  // Window size: 10 min or 1/3 of remaining data
  const windowSize = Math.min(600, Math.floor(samplesAfterWarmup.length / 3));
  
  const earlyWindow = samplesAfterWarmup.slice(0, windowSize);
  const lateWindow = samplesAfterWarmup.slice(-windowSize);
  
  console.log('📊 [DRIFT] Window size:', windowSize);
  console.log('📊 [DRIFT] Early window:', earlyWindow.length, 'samples');
  console.log('📊 [DRIFT] Late window:', lateWindow.length, 'samples');
  
  // Calculate HR averages
  const earlyAvgHr = calculateAvgHR(earlyWindow);
  const lateAvgHr = calculateAvgHR(lateWindow);
  const rawDriftBpm = lateAvgHr - earlyAvgHr;
  
  console.log('📊 [DRIFT] Early avg HR:', earlyAvgHr);
  console.log('📊 [DRIFT] Late avg HR:', lateAvgHr);
  console.log('📊 [DRIFT] Raw drift:', rawDriftBpm, 'bpm');
  
  // Calculate terrain factors
  const terrain = analyzeTerrainContribution(earlyWindow, lateWindow, sensorData, context);
  console.log('📊 [DRIFT] Terrain contribution:', terrain.contributionBpm, 'bpm');
  
  // Calculate weather factors
  const weather = analyzeWeatherContribution(context);
  
  // Calculate terrain-adjusted drift
  const terrainAdjustedDrift = terrain.contributionBpm !== null && Math.abs(terrain.contributionBpm) >= 3
    ? rawDriftBpm - terrain.contributionBpm
    : rawDriftBpm;
  
  const finalDriftBpm = Math.round(terrainAdjustedDrift);
  console.log('📊 [DRIFT] Final drift (terrain-adjusted):', finalDriftBpm, 'bpm');
  
  // Determine expected range based on duration
  const expected = getExpectedDriftRange(durationMinutes, context);
  
  // Assess drift quality
  const assessment = assessDrift(finalDriftBpm, expected, context);
  
  // Handle tempo segment if applicable
  const tempoSegment = workoutType === 'tempo_finish' 
    ? analyzeTempoSegment(sensorData, context.intervals)
    : undefined;
  
  return {
    driftBpm: finalDriftBpm,
    rawDriftBpm: Math.round(rawDriftBpm),
    earlyAvgHr: Math.round(earlyAvgHr),
    lateAvgHr: Math.round(lateAvgHr),
    analysisScope: selection.scope,
    scopeDescription: selection.scopeDescription,
    excludedSegments: selection.excludedSegments,
    terrain,
    weather,
    expected,
    assessment,
    tempoSegment
  };
}

// =============================================================================
// SAMPLE SELECTION
// =============================================================================

interface SampleSelection {
  samples: SensorSample[];
  scope: 'full_workout' | 'easy_portion' | 'first_two_thirds';
  scopeDescription: string;
  excludedSegments: string[];
  tempoSamples?: SensorSample[];
}

function selectSamplesForDrift(
  validHRSamples: SensorSample[],
  allSensorData: SensorSample[],
  workoutType: WorkoutType,
  intervals: IntervalData[]
): SampleSelection {
  console.log('📊 [DRIFT] Selecting samples for:', workoutType);
  
  // Steady state: use all samples (minus warmup/cooldown handled later)
  if (workoutType === 'steady_state') {
    return {
      samples: validHRSamples,
      scope: 'full_workout',
      scopeDescription: 'Full workout',
      excludedSegments: []
    };
  }
  
  // Tempo finish: exclude the tempo portion at the end
  if (workoutType === 'tempo_finish') {
    return selectTempoFinishSamples(validHRSamples, allSensorData, intervals);
  }
  
  // Progressive: use first 2/3 only
  if (workoutType === 'progressive') {
    const cutoff = Math.floor(validHRSamples.length * 0.67);
    return {
      samples: validHRSamples.slice(0, cutoff),
      scope: 'first_two_thirds',
      scopeDescription: 'First 2/3 of workout (before progressive buildup)',
      excludedSegments: ['Progressive buildup (final third)']
    };
  }
  
  // Default: use all
  return {
    samples: validHRSamples,
    scope: 'full_workout',
    scopeDescription: 'Full workout',
    excludedSegments: []
  };
}

function selectTempoFinishSamples(
  validHRSamples: SensorSample[],
  allSensorData: SensorSample[],
  intervals: IntervalData[]
): SampleSelection {
  // Find the last (tempo) interval
  if (!intervals || intervals.length < 2) {
    return {
      samples: validHRSamples,
      scope: 'full_workout',
      scopeDescription: 'Full workout (could not isolate tempo portion)',
      excludedSegments: []
    };
  }
  
  // Sort intervals by start time/index
  const sortedIntervals = [...intervals].sort((a, b) => {
    const aStart = a.sampleIdxStart ?? a.startTimeS ?? 0;
    const bStart = b.sampleIdxStart ?? b.startTimeS ?? 0;
    return aStart - bStart;
  });
  
  const lastInterval = sortedIntervals[sortedIntervals.length - 1];
  
  // Try to find tempo start using sample index
  if (lastInterval.sampleIdxStart !== undefined) {
    const tempoStartIdx = lastInterval.sampleIdxStart;
    
    // Filter to samples before tempo portion
    // Use index in the original sensor data array
    const easySamples: SensorSample[] = [];
    const tempoSamples: SensorSample[] = [];
    
    for (let i = 0; i < validHRSamples.length; i++) {
      const sample = validHRSamples[i];
      // Find this sample's position in the original array
      const originalIdx = findSampleIndex(sample, allSensorData);
      
      if (originalIdx !== -1 && originalIdx < tempoStartIdx) {
        easySamples.push(sample);
      } else if (originalIdx !== -1) {
        tempoSamples.push(sample);
      }
    }
    
    if (easySamples.length >= 600) { // At least 10 min of easy data
      const tempoDurationMin = tempoSamples.length / 60;
      const tempoPace = lastInterval.paceRange 
        ? formatPace((lastInterval.paceRange.lower + lastInterval.paceRange.upper) / 2)
        : 'faster pace';
      
      console.log('📊 [DRIFT] Easy samples:', easySamples.length, 'Tempo samples:', tempoSamples.length);
      
      return {
        samples: easySamples,
        scope: 'easy_portion',
        scopeDescription: 'Easy portion only (drift measured here)',
        excludedSegments: [`Tempo finish (~${Math.round(tempoDurationMin)} min at ${tempoPace})`],
        tempoSamples
      };
    }
  }
  
  // Fallback: couldn't isolate tempo
  return {
    samples: validHRSamples,
    scope: 'full_workout',
    scopeDescription: 'Full workout (could not isolate tempo portion)',
    excludedSegments: []
  };
}

/**
 * Find sample's index in array by timestamp.
 */
function findSampleIndex(sample: SensorSample, allSamples: SensorSample[]): number {
  // Try by timestamp
  if (sample.timestamp) {
    return allSamples.findIndex(s => s.timestamp === sample.timestamp);
  }
  
  // Fallback: try by reference (if same objects)
  return allSamples.indexOf(sample);
}

// =============================================================================
// TERRAIN ANALYSIS
// =============================================================================

interface TerrainContribution {
  contributionBpm: number | null;
  earlyAvgGrade: number | null;
  lateAvgGrade: number | null;
  profileDescription: string | null;
  climbingLocation: 'early' | 'middle' | 'late' | 'throughout' | 'flat' | null;
  totalElevationFt: number | null;
}

function analyzeTerrainContribution(
  earlyWindow: SensorSample[],
  lateWindow: SensorSample[],
  allSamples: SensorSample[],
  context: HRAnalysisContext
): TerrainContribution {
  // Calculate average grade for each window
  const earlyGrade = calculateAvgGrade(earlyWindow);
  const lateGrade = calculateAvgGrade(lateWindow);
  
  console.log('📊 [TERRAIN] Early avg grade:', earlyGrade);
  console.log('📊 [TERRAIN] Late avg grade:', lateGrade);
  
  // Calculate grade difference and contribution
  let contributionBpm: number | null = null;
  if (earlyGrade !== null && lateGrade !== null) {
    const gradeDiff = lateGrade - earlyGrade;
    
    if (Math.abs(gradeDiff) > 0.3) { // Meaningful difference
      contributionBpm = Math.round(gradeDiff * GRADE_TO_HR_COEFFICIENT);
    }
  }
  
  // Analyze overall terrain profile
  const profile = analyzeTerrainProfile(allSamples, context.terrain?.totalElevationGainM);
  
  return {
    contributionBpm,
    earlyAvgGrade: earlyGrade !== null ? Math.round(earlyGrade * 100) / 100 : null,
    lateAvgGrade: lateGrade !== null ? Math.round(lateGrade * 100) / 100 : null,
    profileDescription: profile.description,
    climbingLocation: profile.climbingLocation,
    totalElevationFt: profile.totalElevationFt
  };
}

function calculateAvgGrade(samples: SensorSample[]): number | null {
  const grades: number[] = [];
  
  for (let i = 1; i < samples.length; i++) {
    const curr = samples[i];
    const prev = samples[i - 1];
    
    const currElev = curr.elevation_m ?? curr.elevationInMeters;
    const prevElev = prev.elevation_m ?? prev.elevationInMeters;
    
    if (currElev != null && prevElev != null && Number.isFinite(currElev) && Number.isFinite(prevElev)) {
      // Estimate distance from speed
      const speed = curr.speedMetersPerSecond ?? 2.5; // ~9 min/mi default
      const distance = speed * 1; // 1 second
      
      if (distance > 0.5) { // At least half a meter
        const elevChange = currElev - prevElev;
        const grade = (elevChange / distance) * 100;
        
        // Filter unrealistic grades (GPS noise)
        if (Math.abs(grade) < 25) {
          grades.push(grade);
        }
      }
    }
  }
  
  if (grades.length < 10) return null;
  return grades.reduce((a, b) => a + b, 0) / grades.length;
}

interface TerrainProfile {
  description: string | null;
  climbingLocation: 'early' | 'middle' | 'late' | 'throughout' | 'flat' | null;
  totalElevationFt: number | null;
}

function analyzeTerrainProfile(
  samples: SensorSample[],
  totalElevationGainM?: number
): TerrainProfile {
  // Get elevation values
  const elevations = samples
    .map(s => (s.elevation_m ?? s.elevationInMeters))
    .filter((e): e is number => e != null && Number.isFinite(e))
    .map(e => e * 3.28084); // Convert to feet
  
  if (elevations.length < 100) {
    return { description: null, climbingLocation: null, totalElevationFt: null };
  }
  
  // Calculate total gain from samples if not provided
  let totalGainFt = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) totalGainFt += diff;
  }
  
  // Use provided elevation if available, otherwise use calculated
  const finalElevationFt = totalElevationGainM 
    ? Math.round(totalElevationGainM * 3.28084)
    : Math.round(totalGainFt);
  
  // Determine climbing location
  const quarterSize = Math.floor(elevations.length / 4);
  const q1Gain = calculateGainInRange(elevations, 0, quarterSize);
  const q2Gain = calculateGainInRange(elevations, quarterSize, quarterSize * 2);
  const q3Gain = calculateGainInRange(elevations, quarterSize * 2, quarterSize * 3);
  const q4Gain = calculateGainInRange(elevations, quarterSize * 3, elevations.length);
  
  const firstHalfGain = q1Gain + q2Gain;
  const secondHalfGain = q3Gain + q4Gain;
  const totalGain = firstHalfGain + secondHalfGain;
  
  let climbingLocation: 'early' | 'middle' | 'late' | 'throughout' | 'flat' | null = null;
  let description: string | null = null;
  
  if (totalGain < 100) {
    climbingLocation = 'flat';
    description = 'Relatively flat course';
  } else if (firstHalfGain > secondHalfGain * 2) {
    climbingLocation = 'early';
    description = `Front-loaded climb (${Math.round(finalElevationFt)} ft total)`;
  } else if (secondHalfGain > firstHalfGain * 2) {
    climbingLocation = 'late';
    description = `Back-loaded climb (${Math.round(finalElevationFt)} ft total)`;
  } else if ((q2Gain + q3Gain) > (q1Gain + q4Gain) * 1.5) {
    climbingLocation = 'middle';
    description = `Mid-workout climb (${Math.round(finalElevationFt)} ft total)`;
  } else {
    climbingLocation = 'throughout';
    description = `Rolling terrain (${Math.round(finalElevationFt)} ft total)`;
  }
  
  return { description, climbingLocation, totalElevationFt: finalElevationFt };
}

function calculateGainInRange(elevations: number[], start: number, end: number): number {
  let gain = 0;
  for (let i = start + 1; i < end && i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) gain += diff;
  }
  return gain;
}

// =============================================================================
// WEATHER ANALYSIS
// =============================================================================

interface WeatherContribution {
  factor: 'normal' | 'hot' | 'cold' | 'unknown';
  contributionBpm: number;
  note: string | null;
}

function analyzeWeatherContribution(context: HRAnalysisContext): WeatherContribution {
  const temp = context.weather?.temperatureF;
  const feelsLike = context.weather?.feelsLikeF;
  
  if (temp === undefined || temp === null) {
    return { factor: 'unknown', contributionBpm: 0, note: null };
  }
  
  // Use feels_like for physiological impact calculation (accounts for humidity, wind)
  const effectiveTemp = feelsLike ?? temp;
  
  // Format temperature string - show feels like if significantly different
  const tempStr = (feelsLike && Math.abs(feelsLike - temp) >= 3)
    ? `${Math.round(temp)}°F (feels like ${Math.round(feelsLike)}°F)`
    : `${Math.round(temp)}°F`;
  
  // Hot conditions (>82°F significant, >75°F moderate) - use effective temp
  if (effectiveTemp > 82) {
    return {
      factor: 'hot',
      contributionBpm: 8,
      note: `${tempStr} — significant heat, elevated drift expected`
    };
  }
  
  if (effectiveTemp > 75) {
    return {
      factor: 'hot',
      contributionBpm: 4,
      note: `${tempStr} — warm conditions`
    };
  }
  
  // Cold conditions (<50°F)
  if (effectiveTemp < 50) {
    return {
      factor: 'cold',
      contributionBpm: -2,
      note: `${tempStr} — cool conditions`
    };
  }
  
  // Normal/ideal conditions - still show temp for context
  return { 
    factor: 'normal', 
    contributionBpm: 0, 
    note: tempStr 
  };
}

// =============================================================================
// EXPECTED DRIFT & ASSESSMENT
// =============================================================================

function getExpectedDriftRange(
  durationMinutes: number,
  context: HRAnalysisContext
): DriftAnalysis['expected'] {
  // Base range by duration
  let category: 'short' | 'moderate' | 'long' | 'extended';
  let base: { lower: number; upper: number };
  
  if (durationMinutes < 60) {
    category = 'short';
    base = { ...DRIFT_EXPECTATIONS.short };
  } else if (durationMinutes < 90) {
    category = 'moderate';
    base = { ...DRIFT_EXPECTATIONS.moderate };
  } else if (durationMinutes < 150) {
    category = 'long';
    base = { ...DRIFT_EXPECTATIONS.long };
  } else {
    category = 'extended';
    base = { ...DRIFT_EXPECTATIONS.extended };
  }
  
  // Adjust for plan phase
  if (context.planContext?.weekIntent === 'build' || context.planContext?.weekIntent === 'peak') {
    base.upper += 2; // Build phase: expect more fatigue accumulation
  } else if (context.planContext?.isRecoveryWeek) {
    base.upper -= 2; // Recovery: expect lower drift
  } else if (context.planContext?.isTaperWeek) {
    base.upper -= 3; // Taper: expect improved efficiency
  }
  
  // Adjust for weather
  const weatherContribution = analyzeWeatherContribution(context).contributionBpm;
  base.upper += weatherContribution;
  base.lower += Math.floor(weatherContribution / 2);
  
  return {
    lowerBpm: Math.max(0, base.lower),
    upperBpm: base.upper,
    durationCategory: category
  };
}

function assessDrift(
  driftBpm: number,
  expected: DriftAnalysis['expected'],
  context: HRAnalysisContext
): DriftAnalysis['assessment'] {
  if (driftBpm < expected.lowerBpm - 2) {
    return 'excellent';
  }
  
  if (driftBpm <= expected.lowerBpm) {
    return 'good';
  }
  
  if (driftBpm <= expected.upperBpm) {
    return 'normal';
  }
  
  if (driftBpm <= expected.upperBpm + 5) {
    return 'elevated';
  }
  
  return 'high';
}

// =============================================================================
// TEMPO SEGMENT ANALYSIS
// =============================================================================

function analyzeTempoSegment(
  sensorData: SensorSample[],
  intervals: IntervalData[]
): DriftAnalysis['tempoSegment'] | undefined {
  if (!intervals || intervals.length < 2) return undefined;
  
  // Find the last (tempo) interval
  const sortedIntervals = [...intervals].sort((a, b) => {
    const aStart = a.sampleIdxStart ?? a.startTimeS ?? 0;
    const bStart = b.sampleIdxStart ?? b.startTimeS ?? 0;
    return aStart - bStart;
  });
  
  const lastInterval = sortedIntervals[sortedIntervals.length - 1];
  
  if (lastInterval.sampleIdxStart === undefined || lastInterval.sampleIdxEnd === undefined) {
    return undefined;
  }
  
  const tempoSamples = sensorData
    .slice(lastInterval.sampleIdxStart, lastInterval.sampleIdxEnd + 1)
    .filter(s => s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250);
  
  if (tempoSamples.length < 60) return undefined;
  
  const hrValues = tempoSamples.map(s => s.heart_rate!);
  const avgHr = Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length);
  const peakHr = Math.max(...hrValues);
  const durationMin = tempoSamples.length / 60;
  
  const paceDesc = lastInterval.paceRange
    ? formatPace((lastInterval.paceRange.lower + lastInterval.paceRange.upper) / 2)
    : 'tempo pace';
  
  return {
    avgHr,
    peakHr,
    durationMin: Math.round(durationMin),
    paceDesc
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function calculateAvgHR(samples: SensorSample[]): number {
  const hrValues = samples.map(s => s.heart_rate!).filter(hr => hr > 0 && hr < 250);
  return hrValues.length > 0 
    ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length 
    : 0;
}

function formatPace(secPerMi: number): string {
  const min = Math.floor(secPerMi / 60);
  const sec = Math.round(secPerMi % 60);
  return `${min}:${String(sec).padStart(2, '0')}/mi`;
}

function createInvalidDrift(reason: string, workoutType: WorkoutType): DriftAnalysis {
  return {
    driftBpm: 0,
    rawDriftBpm: 0,
    earlyAvgHr: 0,
    lateAvgHr: 0,
    analysisScope: 'full_workout',
    scopeDescription: reason,
    excludedSegments: [],
    terrain: {
      contributionBpm: null,
      earlyAvgGrade: null,
      lateAvgGrade: null,
      profileDescription: null,
      climbingLocation: null,
      totalElevationFt: null
    },
    weather: {
      factor: 'unknown',
      contributionBpm: 0,
      note: null
    },
    expected: {
      lowerBpm: 0,
      upperBpm: 0,
      durationCategory: 'short'
    },
    assessment: 'normal'
  };
}
