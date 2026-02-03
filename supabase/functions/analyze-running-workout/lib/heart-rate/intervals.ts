/**
 * Interval HR Analysis
 * 
 * Analyzes HR patterns for interval and hill repeat workouts:
 * - HR creep (first vs last interval)
 * - HR consistency across intervals
 * - Recovery rate between intervals
 */

import {
  SensorSample,
  IntervalData,
  IntervalHRAnalysis,
  IntervalRecoveryData,
  PerIntervalHR
} from './types.ts';

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Analyze HR for interval workouts.
 */
export function analyzeIntervalHR(
  sensorData: SensorSample[],
  intervals: IntervalData[]
): IntervalHRAnalysis | undefined {
  console.log('🏃 [INTERVAL HR] Analyzing interval HR...');
  console.log('🏃 [INTERVAL HR] Total intervals:', intervals.length);
  
  // Separate work and recovery intervals
  const workIntervals = intervals.filter(i => 
    i.role === 'work' || i.role === 'Work'
  );
  const recoveryIntervals = intervals.filter(i => 
    i.role === 'recovery' || i.role === 'Recovery' || i.role === 'rest'
  );
  
  console.log('🏃 [INTERVAL HR] Work intervals:', workIntervals.length);
  console.log('🏃 [INTERVAL HR] Recovery intervals:', recoveryIntervals.length);
  
  if (workIntervals.length === 0) {
    console.log('🏃 [INTERVAL HR] No work intervals found');
    return undefined;
  }
  
  // Analyze each work interval
  const perIntervalData: PerIntervalHR[] = [];
  
  for (let i = 0; i < workIntervals.length; i++) {
    const interval = workIntervals[i];
    const hrData = calculateIntervalHRStats(sensorData, interval, i + 1);
    if (hrData) {
      perIntervalData.push(hrData);
    }
  }
  
  if (perIntervalData.length === 0) {
    console.log('🏃 [INTERVAL HR] No valid HR data for any interval');
    return undefined;
  }
  
  // Calculate aggregate metrics
  const allAvgHRs = perIntervalData.map(d => d.avgHr);
  const workIntervalAvgHr = Math.round(
    allAvgHRs.reduce((a, b) => a + b, 0) / allAvgHRs.length
  );
  
  // Calculate HR creep
  const hrCreep = calculateHRCreep(perIntervalData);
  
  // Calculate consistency
  const consistency = calculateConsistency(perIntervalData);
  
  // Calculate recovery
  const recovery = calculateRecovery(sensorData, workIntervals, recoveryIntervals);
  
  console.log('🏃 [INTERVAL HR] Work interval avg HR:', workIntervalAvgHr);
  console.log('🏃 [INTERVAL HR] HR creep:', hrCreep.creepBpm, 'bpm');
  console.log('🏃 [INTERVAL HR] Consistency CV:', consistency.coefficientOfVariation, '%');
  console.log('🏃 [INTERVAL HR] Avg recovery drop:', recovery.avgDropBpm, 'bpm');
  
  return {
    workIntervalAvgHr,
    workIntervalCount: perIntervalData.length,
    hrCreep,
    consistency,
    recovery,
    perInterval: perIntervalData
  };
}

// =============================================================================
// PER-INTERVAL STATS
// =============================================================================

function calculateIntervalHRStats(
  sensorData: SensorSample[],
  interval: IntervalData,
  intervalNumber: number
): PerIntervalHR | null {
  // Get samples for this interval
  let samples: SensorSample[];
  
  if (interval.sampleIdxStart !== undefined && interval.sampleIdxEnd !== undefined) {
    samples = sensorData.slice(interval.sampleIdxStart, interval.sampleIdxEnd + 1);
  } else if (interval.startTimeS !== undefined && interval.endTimeS !== undefined) {
    samples = sensorData.filter(s => 
      s.timestamp && s.timestamp >= interval.startTimeS! && s.timestamp <= interval.endTimeS!
    );
  } else {
    return null;
  }
  
  // Filter to valid HR
  const validSamples = samples.filter(s => 
    s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250
  );
  
  if (validSamples.length < 10) return null;
  
  const hrValues = validSamples.map(s => s.heart_rate!);
  
  return {
    intervalNumber,
    role: interval.role || 'work',
    avgHr: Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length),
    maxHr: Math.max(...hrValues),
    minHr: Math.min(...hrValues),
    durationS: validSamples.length // ~1 sample/sec
  };
}

// =============================================================================
// HR CREEP
// =============================================================================

function calculateHRCreep(
  intervals: PerIntervalHR[]
): IntervalHRAnalysis['hrCreep'] {
  if (intervals.length < 2) {
    return {
      firstIntervalAvgHr: intervals[0]?.avgHr || 0,
      lastIntervalAvgHr: intervals[0]?.avgHr || 0,
      creepBpm: 0,
      creepPct: 0,
      assessment: 'minimal'
    };
  }
  
  const firstAvg = intervals[0].avgHr;
  const lastAvg = intervals[intervals.length - 1].avgHr;
  const creepBpm = lastAvg - firstAvg;
  const creepPct = firstAvg > 0 ? (creepBpm / firstAvg) * 100 : 0;
  
  // Assess creep
  let assessment: 'minimal' | 'normal' | 'elevated' | 'high';
  if (Math.abs(creepBpm) <= 3) {
    assessment = 'minimal';
  } else if (creepBpm <= 6) {
    assessment = 'normal';
  } else if (creepBpm <= 10) {
    assessment = 'elevated';
  } else {
    assessment = 'high';
  }
  
  return {
    firstIntervalAvgHr: firstAvg,
    lastIntervalAvgHr: lastAvg,
    creepBpm: Math.round(creepBpm),
    creepPct: Math.round(creepPct * 10) / 10,
    assessment
  };
}

// =============================================================================
// CONSISTENCY
// =============================================================================

function calculateConsistency(
  intervals: PerIntervalHR[]
): IntervalHRAnalysis['consistency'] {
  if (intervals.length < 2) {
    return {
      stdDevBpm: 0,
      coefficientOfVariation: 0,
      assessment: 'very_consistent'
    };
  }
  
  const avgHRs = intervals.map(i => i.avgHr);
  const mean = avgHRs.reduce((a, b) => a + b, 0) / avgHRs.length;
  
  // Calculate standard deviation
  const squaredDiffs = avgHRs.map(hr => Math.pow(hr - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / avgHRs.length;
  const stdDev = Math.sqrt(variance);
  
  // Coefficient of variation (%)
  const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
  
  // Assess consistency
  let assessment: 'very_consistent' | 'consistent' | 'variable' | 'inconsistent';
  if (cv < 2) {
    assessment = 'very_consistent';
  } else if (cv < 4) {
    assessment = 'consistent';
  } else if (cv < 7) {
    assessment = 'variable';
  } else {
    assessment = 'inconsistent';
  }
  
  return {
    stdDevBpm: Math.round(stdDev * 10) / 10,
    coefficientOfVariation: Math.round(cv * 10) / 10,
    assessment
  };
}

// =============================================================================
// RECOVERY
// =============================================================================

function calculateRecovery(
  sensorData: SensorSample[],
  workIntervals: IntervalData[],
  recoveryIntervals: IntervalData[]
): IntervalHRAnalysis['recovery'] {
  const recoveryData: IntervalRecoveryData[] = [];
  
  // Match work intervals with following recovery intervals
  for (let i = 0; i < workIntervals.length && i < recoveryIntervals.length; i++) {
    const workInterval = workIntervals[i];
    const recoveryInterval = recoveryIntervals[i];
    
    // Get HR at end of work interval (last 10 samples)
    const workEndHR = getEndHR(sensorData, workInterval);
    
    // Get HR at end of recovery interval (last 10 samples)
    const recoveryEndHR = getEndHR(sensorData, recoveryInterval);
    
    if (workEndHR !== null && recoveryEndHR !== null) {
      const recoveryTimeS = getIntervalDuration(recoveryInterval);
      
      recoveryData.push({
        intervalNumber: i + 1,
        workEndHr: Math.round(workEndHR),
        recoveryEndHr: Math.round(recoveryEndHR),
        dropBpm: Math.round(workEndHR - recoveryEndHR),
        recoveryTimeS
      });
    }
  }
  
  if (recoveryData.length === 0) {
    return {
      avgDropBpm: 0,
      avgRecoveryTimeS: 0,
      recoveryRate: 0,
      quality: 'fair',
      perInterval: []
    };
  }
  
  // Calculate averages
  const avgDropBpm = recoveryData.reduce((sum, d) => sum + d.dropBpm, 0) / recoveryData.length;
  const avgRecoveryTimeS = recoveryData.reduce((sum, d) => sum + d.recoveryTimeS, 0) / recoveryData.length;
  
  // Recovery rate: BPM drop per minute
  const recoveryRate = avgRecoveryTimeS > 0 
    ? (avgDropBpm / avgRecoveryTimeS) * 60 
    : 0;
  
  // Assess quality
  let quality: 'excellent' | 'good' | 'fair' | 'poor';
  if (avgDropBpm >= 30) {
    quality = 'excellent';
  } else if (avgDropBpm >= 20) {
    quality = 'good';
  } else if (avgDropBpm >= 10) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }
  
  return {
    avgDropBpm: Math.round(avgDropBpm),
    avgRecoveryTimeS: Math.round(avgRecoveryTimeS),
    recoveryRate: Math.round(recoveryRate * 10) / 10,
    quality,
    perInterval: recoveryData
  };
}

function getEndHR(sensorData: SensorSample[], interval: IntervalData): number | null {
  let endSamples: SensorSample[];
  
  if (interval.sampleIdxEnd !== undefined) {
    const endIdx = interval.sampleIdxEnd;
    const startIdx = Math.max(0, endIdx - 10);
    endSamples = sensorData.slice(startIdx, endIdx + 1);
  } else if (interval.endTimeS !== undefined) {
    endSamples = sensorData.filter(s => 
      s.timestamp && s.timestamp >= interval.endTimeS! - 10 && s.timestamp <= interval.endTimeS!
    );
  } else {
    return null;
  }
  
  const validHR = endSamples
    .filter(s => s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250)
    .map(s => s.heart_rate!);
  
  if (validHR.length === 0) return null;
  
  return validHR.reduce((a, b) => a + b, 0) / validHR.length;
}

function getIntervalDuration(interval: IntervalData): number {
  if (interval.startTimeS !== undefined && interval.endTimeS !== undefined) {
    return interval.endTimeS - interval.startTimeS;
  }
  
  if (interval.sampleIdxStart !== undefined && interval.sampleIdxEnd !== undefined) {
    return interval.sampleIdxEnd - interval.sampleIdxStart; // ~1 sample/sec
  }
  
  return interval.executed?.durationS || 0;
}
