/**
 * Calculate heart rate drift over the course of a workout
 * Compares early vs late HR to detect pacing issues or fatigue
 */
export function calculateHeartRateDrift(
  sensorData: any[],
  workStartTimestamp?: number,
  workEndTimestamp?: number
): { drift_bpm: number; early_avg_hr: number; late_avg_hr: number; interpretation: string; valid: boolean } {
  console.log('🔍 [HR DRIFT DEBUG] Starting calculation...');
  console.log('🔍 [HR DRIFT DEBUG] Total samples:', sensorData.length);
  
  // Filter to samples with valid HR data
  const validHRSamples = sensorData.filter(s => s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250);
  
  if (validHRSamples.length < 20) {
    console.log('⚠️ [HR DRIFT DEBUG] Insufficient HR samples:', validHRSamples.length);
    return {
      drift_bpm: 0,
      early_avg_hr: 0,
      late_avg_hr: 0,
      interpretation: 'Insufficient HR data',
      valid: false
    };
  }
  
  // Determine work period timestamps
  // If not provided, use first and last sample timestamps
  const firstSampleTimestamp = validHRSamples[0]?.timestamp || validHRSamples[0]?.elapsed_time_s || 0;
  const lastSampleTimestamp = validHRSamples[validHRSamples.length - 1]?.timestamp || 
                              validHRSamples[validHRSamples.length - 1]?.elapsed_time_s || 0;
  
  const workStart = workStartTimestamp !== undefined ? workStartTimestamp : firstSampleTimestamp;
  const workEnd = workEndTimestamp !== undefined ? workEndTimestamp : lastSampleTimestamp;
  
  const workDurationMinutes = (workEnd - workStart) / 60;
  console.log('🔍 [HR DRIFT DEBUG] Work start timestamp:', workStart);
  console.log('🔍 [HR DRIFT DEBUG] Work end timestamp:', workEnd);
  console.log('🔍 [HR DRIFT DEBUG] Work duration:', workDurationMinutes.toFixed(1), 'minutes');
  
  // Edge case: Workout too short for meaningful drift calculation
  if (workDurationMinutes < 20) {
    console.log('⚠️ [HR DRIFT DEBUG] Workout too short for drift calculation (< 20 minutes)');
    return {
      drift_bpm: 0,
      early_avg_hr: 0,
      late_avg_hr: 0,
      interpretation: 'Workout too short for drift calculation',
      valid: false
    };
  }
  
  // Step 1: Identify work period (exclude warmup/cooldown)
  // Skip first 5 minutes (warmup/settling period)
  // Skip last 5 minutes if there's a cooldown
  const warmupSkipSeconds = 5 * 60; // 5 minutes
  const cooldownSkipSeconds = 5 * 60; // 5 minutes
  
  const sustainedWorkStart = workStart + warmupSkipSeconds;
  const sustainedWorkEnd = workEnd - cooldownSkipSeconds;
  
  // Ensure we have enough sustained work time (at least 15 minutes)
  if ((sustainedWorkEnd - sustainedWorkStart) / 60 < 15) {
    // If removing warmup/cooldown leaves < 15 min, use full period but skip first 3 min
    const adjustedStart = workStart + (3 * 60);
    const adjustedEnd = workEnd;
    console.log('⚠️ [HR DRIFT DEBUG] Adjusted work period (too short after removing warmup/cooldown)');
    console.log('🔍 [HR DRIFT DEBUG] Adjusted start:', adjustedStart, 'Adjusted end:', adjustedEnd);
    
    // Step 2: Define comparison windows
    // Early window: Minutes 3-13 of sustained work (10 min average)
    // Late window: Last 10 minutes of sustained work
    const earlyWindowStart = adjustedStart + (3 * 60); // Start at minute 3
    const earlyWindowEnd = adjustedStart + (13 * 60); // Through minute 13
    const lateWindowStart = adjustedEnd - (10 * 60); // Last 10 minutes
    const lateWindowEnd = adjustedEnd;
    
    console.log('🔍 [HR DRIFT DEBUG] Early window: samples from', earlyWindowStart, 'to', earlyWindowEnd);
    console.log('🔍 [HR DRIFT DEBUG] Late window: samples from', lateWindowStart, 'to', lateWindowEnd);
    
    // Filter samples to windows
    const earlyWindow = validHRSamples.filter(s => {
      const timestamp = s.timestamp || s.elapsed_time_s || 0;
      return timestamp >= earlyWindowStart && timestamp <= earlyWindowEnd;
    });
    
    const lateWindow = validHRSamples.filter(s => {
      const timestamp = s.timestamp || s.elapsed_time_s || 0;
      return timestamp >= lateWindowStart && timestamp <= lateWindowEnd;
    });
    
    console.log('🔍 [HR DRIFT DEBUG] Early window samples:', earlyWindow.length);
    console.log('🔍 [HR DRIFT DEBUG] Late window samples:', lateWindow.length);
    
    if (earlyWindow.length < 10 || lateWindow.length < 10) {
      console.log('⚠️ [HR DRIFT DEBUG] Insufficient HR data in comparison windows');
      return {
        drift_bpm: 0,
        early_avg_hr: 0,
        late_avg_hr: 0,
        interpretation: 'Insufficient HR data in comparison windows',
        valid: false
      };
    }
    
    // Step 3: Calculate average HR for each window
    const earlyAvgHR = earlyWindow.reduce((sum, s) => sum + s.heart_rate, 0) / earlyWindow.length;
    const lateAvgHR = lateWindow.reduce((sum, s) => sum + s.heart_rate, 0) / lateWindow.length;
    
    console.log('🔍 [HR DRIFT DEBUG] Early window HRs (first 20):', earlyWindow.slice(0, 20).map(s => s.heart_rate));
    console.log('🔍 [HR DRIFT DEBUG] Late window HRs (first 20):', lateWindow.slice(0, 20).map(s => s.heart_rate));
    console.log('🔍 [HR DRIFT DEBUG] Early average HR:', earlyAvgHR.toFixed(1));
    console.log('🔍 [HR DRIFT DEBUG] Late average HR:', lateAvgHR.toFixed(1));
    
    // Step 4: Calculate drift
    const hrDrift = Math.round(lateAvgHR - earlyAvgHR);
    
    // Step 5: Interpret
    let interpretation = '';
    if (hrDrift < 5) {
      interpretation = 'Excellent stability (well-paced, fit, or conservative)';
    } else if (hrDrift < 10) {
      interpretation = 'Normal for sustained efforts';
    } else if (hrDrift < 20) {
      interpretation = 'Moderate drift (hot weather, dehydration, or long duration)';
    } else {
      interpretation = 'Significant drift (overpaced, environmental stress, or fatigue)';
    }
    
    console.log('🔍 [HR DRIFT DEBUG] Calculated drift:', hrDrift, 'bpm');
    console.log('🔍 [HR DRIFT DEBUG] Interpretation:', interpretation);
    
    // Calculate overall avg HR for context
    const overallAvgHR = validHRSamples.reduce((sum, s) => sum + s.heart_rate, 0) / validHRSamples.length;
    const maxHR = Math.max(...validHRSamples.map(s => s.heart_rate));
    console.log('🔍 [HR DRIFT DEBUG] Overall avg HR:', overallAvgHR.toFixed(1));
    console.log('🔍 [HR DRIFT DEBUG] Overall max HR:', maxHR);
    
    return {
      drift_bpm: hrDrift,
      early_avg_hr: Math.round(earlyAvgHR),
      late_avg_hr: Math.round(lateAvgHR),
      interpretation,
      valid: true
    };
  }
  
  // Step 2: Define comparison windows
  // Early window: Minutes 5-15 of sustained work (10 min average)
  // Late window: Last 10 minutes of sustained work
  const earlyWindowStart = sustainedWorkStart + (5 * 60); // Start at minute 5 of sustained work
  const earlyWindowEnd = sustainedWorkStart + (15 * 60); // Through minute 15
  const lateWindowStart = sustainedWorkEnd - (10 * 60); // Last 10 minutes
  const lateWindowEnd = sustainedWorkEnd;
  
  console.log('🔍 [HR DRIFT DEBUG] Early window: samples from', earlyWindowStart, 'to', earlyWindowEnd);
  console.log('🔍 [HR DRIFT DEBUG] Late window: samples from', lateWindowStart, 'to', lateWindowEnd);
  
  // Filter samples to windows
  const earlyWindow = validHRSamples.filter(s => {
    const timestamp = s.timestamp || s.elapsed_time_s || 0;
    return timestamp >= earlyWindowStart && timestamp <= earlyWindowEnd;
  });
  
  const lateWindow = validHRSamples.filter(s => {
    const timestamp = s.timestamp || s.elapsed_time_s || 0;
    return timestamp >= lateWindowStart && timestamp <= lateWindowEnd;
  });
  
  console.log('🔍 [HR DRIFT DEBUG] Early window samples:', earlyWindow.length);
  console.log('🔍 [HR DRIFT DEBUG] Late window samples:', lateWindow.length);
  
  if (earlyWindow.length < 10 || lateWindow.length < 10) {
    console.log('⚠️ [HR DRIFT DEBUG] Insufficient HR data in comparison windows');
    return {
      drift_bpm: 0,
      early_avg_hr: 0,
      late_avg_hr: 0,
      interpretation: 'Insufficient HR data in comparison windows',
      valid: false
    };
  }
  
  // Step 3: Calculate average HR for each window
  const earlyAvgHR = earlyWindow.reduce((sum, s) => sum + s.heart_rate, 0) / earlyWindow.length;
  const lateAvgHR = lateWindow.reduce((sum, s) => sum + s.heart_rate, 0) / lateWindow.length;
  
  console.log('🔍 [HR DRIFT DEBUG] Early window HRs (first 20):', earlyWindow.slice(0, 20).map(s => s.heart_rate));
  console.log('🔍 [HR DRIFT DEBUG] Late window HRs (first 20):', lateWindow.slice(0, 20).map(s => s.heart_rate));
  console.log('🔍 [HR DRIFT DEBUG] Early average HR:', earlyAvgHR.toFixed(1));
  console.log('🔍 [HR DRIFT DEBUG] Late average HR:', lateAvgHR.toFixed(1));
  
  // Step 4: Calculate drift
  const hrDrift = Math.round(lateAvgHR - earlyAvgHR);
  
  // Step 5: Interpret
  let interpretation = '';
  if (hrDrift < 5) {
    interpretation = 'Excellent stability (well-paced, fit, or conservative)';
  } else if (hrDrift < 10) {
    interpretation = 'Normal for sustained efforts';
  } else if (hrDrift < 20) {
    interpretation = 'Moderate drift (hot weather, dehydration, or long duration)';
  } else {
    interpretation = 'Significant drift (overpaced, environmental stress, or fatigue)';
  }
  
  console.log('🔍 [HR DRIFT DEBUG] Calculated drift:', hrDrift, 'bpm');
  console.log('🔍 [HR DRIFT DEBUG] Interpretation:', interpretation);
  
  // Calculate overall avg HR for context
  const overallAvgHR = validHRSamples.reduce((sum, s) => sum + s.heart_rate, 0) / validHRSamples.length;
  const maxHR = Math.max(...validHRSamples.map(s => s.heart_rate));
  console.log('🔍 [HR DRIFT DEBUG] Overall avg HR:', overallAvgHR.toFixed(1));
  console.log('🔍 [HR DRIFT DEBUG] Overall max HR:', maxHR);
  
  // Log HR progression every 10 minutes for verification
  console.log('🔍 [HR DRIFT DEBUG] HR progression:');
  for (let minute = 10; minute <= Math.floor(workDurationMinutes); minute += 10) {
    const minuteStart = workStart + (minute * 60) - (5 * 60); // 5 min window centered on minute
    const minuteEnd = workStart + (minute * 60) + (5 * 60);
    const minuteSamples = validHRSamples.filter(s => {
      const timestamp = s.timestamp || s.elapsed_time_s || 0;
      return timestamp >= minuteStart && timestamp <= minuteEnd;
    });
    if (minuteSamples.length > 0) {
      const minuteAvgHR = minuteSamples.reduce((sum, s) => sum + s.heart_rate, 0) / minuteSamples.length;
      console.log(`🔍 [HR DRIFT DEBUG] Min ${minute}: ${minuteAvgHR.toFixed(1)} bpm`);
    }
  }
  
  return {
    drift_bpm: hrDrift,
    early_avg_hr: Math.round(earlyAvgHR),
    late_avg_hr: Math.round(lateAvgHR),
    interpretation,
    valid: true
  };
}

