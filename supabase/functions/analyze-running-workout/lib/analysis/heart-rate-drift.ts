/**
 * Context-Aware Heart Rate Drift Analysis
 * 
 * Calculates HR drift with awareness of:
 * - Planned workout structure (detects tempo finish, intervals, progressive runs)
 * - Terrain/elevation (normalizes for grade differences)
 * - Weather conditions (adjusts interpretation for heat)
 * 
 * Key principle: Only measure drift within homogeneous effort segments.
 * Comparing easy-pace HR to tempo-pace HR is not drift — it's different effort.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface HRDriftContext {
  intervals?: Array<{
    role: 'warmup' | 'work' | 'recovery' | 'cooldown' | string;
    start_time_s: number;
    end_time_s: number;
    sample_idx_start?: number;
    sample_idx_end?: number;
    pace_range?: { lower: number; upper: number };
    executed?: {
      avg_pace_s_per_mi?: number;
      duration_s?: number;
    };
  }>;
  plannedWorkout?: {
    workout_token?: string;
    description?: string;
    computed?: { steps?: any[] };
  };
  weather?: {
    temperature?: number;
    humidity?: number;
  };
  avgTemperature?: number;
  userUnits?: 'metric' | 'imperial';
  // Workout-level metrics for richer interpretation
  totalElevationGainM?: number;
  totalDistanceM?: number;
  avgPaceSecPerMi?: number;
  // Historical comparison data
  historicalDrift?: {
    similarWorkouts: Array<{
      date: string;
      driftBpm: number;
      durationMin: number;
      elevationFt?: number;
    }>;
    avgDriftBpm: number;
    recentTrend?: 'improving' | 'stable' | 'worsening';
    lastWeekSimilar?: {
      date: string;
      driftBpm: number;
      durationMin: number;
      elevationFt?: number;
      daysSince: number;
    };
  };
  // Training plan context
  planContext?: {
    weekIndex?: number;
    weekIntent?: 'build' | 'recovery' | 'taper' | 'peak' | string;
    phaseName?: string;
    isRecoveryWeek?: boolean;
    hasActivePlan?: boolean;
  };
}

export interface HRDriftResult {
  drift_bpm: number;
  analysis_scope: 'full_workout' | 'primary_segment' | 'work_intervals' | 'not_applicable';
  scope_description: string;
  early_avg_hr: number;
  late_avg_hr: number;
  terrain_contribution_bpm: number | null;
  terrain_note: string | null;
  temperature_factor: 'normal' | 'hot' | 'cold' | 'unknown';
  temperature_note: string | null;
  interpretation: string;
  confidence: 'high' | 'medium' | 'low';
  excluded_segments: string[];
  valid: boolean;
  workout_type: WorkoutType;
  // For tempo finish workouts - capture what happened in the tempo segment
  tempo_segment?: {
    avg_hr: number;
    peak_hr: number;
    duration_min: number;
    pace_desc: string;
  };
}

type WorkoutType = 'steady_state' | 'tempo_finish' | 'progressive' | 'intervals' | 'mixed';

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Calculate heart rate drift with full context awareness.
 * 
 * @param sensorData - Array of sensor samples with heart_rate, pace, elevation
 * @param context - Optional context including intervals, planned workout, weather
 * @returns Comprehensive HR drift analysis
 */
export function calculateHeartRateDrift(
  sensorData: any[],
  context?: HRDriftContext
): HRDriftResult {
  console.log('🔍 [HR DRIFT v2] Starting context-aware calculation...');
  console.log('🔍 [HR DRIFT v2] Total samples:', sensorData.length);
  console.log('🔍 [HR DRIFT v2] Context provided:', {
    hasIntervals: !!context?.intervals?.length,
    intervalCount: context?.intervals?.length || 0,
    hasPlannedWorkout: !!context?.plannedWorkout,
    hasWeather: !!context?.weather || !!context?.avgTemperature
  });

  // Default result for invalid/insufficient data
  const invalidResult = (reason: string, scope: HRDriftResult['analysis_scope'] = 'not_applicable'): HRDriftResult => ({
    drift_bpm: 0,
    analysis_scope: scope,
    scope_description: reason,
    early_avg_hr: 0,
    late_avg_hr: 0,
    terrain_contribution_bpm: null,
    terrain_note: null,
    temperature_factor: 'unknown',
    temperature_note: null,
    interpretation: reason,
    confidence: 'low',
    excluded_segments: [],
    valid: false,
    workout_type: 'steady_state'
  });

  // Filter to samples with valid HR data
  const validHRSamples = sensorData.filter(s => 
    s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250
  );

  if (validHRSamples.length < 20) {
    console.log('⚠️ [HR DRIFT v2] Insufficient HR samples:', validHRSamples.length);
    return invalidResult('Insufficient HR data');
  }

  // Detect workout type from context
  const workoutType = detectWorkoutType(context?.intervals, context?.plannedWorkout);
  console.log('🔍 [HR DRIFT v2] Detected workout type:', workoutType);

  // For interval workouts, drift measurement is not meaningful
  if (workoutType === 'intervals') {
    console.log('⚠️ [HR DRIFT v2] Interval workout — drift not applicable');
    return {
      ...invalidResult('HR drift not applicable for interval workouts — effort varies by design', 'not_applicable'),
      workout_type: 'intervals',
      valid: true // Valid analysis, just not applicable
    };
  }

  // Determine which samples to analyze based on workout type
  const sampleSelection = selectSamplesForAnalysis(
    validHRSamples,
    sensorData,
    workoutType,
    context?.intervals
  );
  const { samplesToAnalyze, excludedSegments, scopeDescription, tempoSegmentSamples, tempoSegmentInfo } = sampleSelection;

  if (samplesToAnalyze.length < 20) {
    console.log('⚠️ [HR DRIFT v2] Insufficient samples after filtering:', samplesToAnalyze.length);
    return invalidResult('Insufficient data in primary effort segment');
  }

  // Calculate moving duration
  const movingDurationMinutes = samplesToAnalyze.length / 60; // Assume ~1 sample/second
  
  if (movingDurationMinutes < 15) {
    console.log('⚠️ [HR DRIFT v2] Segment too short for drift calculation:', movingDurationMinutes.toFixed(1), 'min');
    return invalidResult('Effort segment too short for drift calculation (< 15 minutes)');
  }

  // Define early and late windows (first 10 min vs last 10 min of selected samples)
  const windowSize = Math.min(600, Math.floor(samplesToAnalyze.length / 2)); // 10 min or half, whichever is smaller
  const earlyWindow = samplesToAnalyze.slice(0, windowSize);
  const lateWindow = samplesToAnalyze.slice(-windowSize);

  console.log('🔍 [HR DRIFT v2] Window sizes - early:', earlyWindow.length, 'late:', lateWindow.length);

  if (earlyWindow.length < 10 || lateWindow.length < 10) {
    return invalidResult('Insufficient data in comparison windows');
  }

  // Calculate tempo segment HR stats if available
  let tempoSegment: HRDriftResult['tempo_segment'] = undefined;
  if (tempoSegmentSamples && tempoSegmentSamples.length > 0 && tempoSegmentInfo) {
    const tempoHRs = tempoSegmentSamples.map(s => s.heart_rate).filter(hr => hr > 0 && hr < 250);
    if (tempoHRs.length > 0) {
      tempoSegment = {
        avg_hr: Math.round(tempoHRs.reduce((a, b) => a + b, 0) / tempoHRs.length),
        peak_hr: Math.max(...tempoHRs),
        duration_min: tempoSegmentInfo.duration_min,
        pace_desc: tempoSegmentInfo.pace_desc
      };
      console.log('🔍 [HR DRIFT v2] Tempo segment HR - avg:', tempoSegment.avg_hr, 'peak:', tempoSegment.peak_hr);
    }
  }

  // Calculate terrain-normalized drift with total elevation context and full profile
  const terrainAnalysis = calculateTerrainNormalizedDrift(
    earlyWindow, 
    lateWindow,
    context?.totalElevationGainM,
    context?.totalDistanceM,
    sensorData // Pass all samples for full profile analysis
  );
  
  // Get temperature context
  const temperature = context?.weather?.temperature ?? context?.avgTemperature;
  const tempContext = getTemperatureContext(temperature, context?.userUnits || 'imperial');

  // Calculate raw HR averages
  const earlyAvgHR = Math.round(earlyWindow.reduce((sum, s) => sum + s.heart_rate, 0) / earlyWindow.length);
  const lateAvgHR = Math.round(lateWindow.reduce((sum, s) => sum + s.heart_rate, 0) / lateWindow.length);
  const rawDrift = lateAvgHR - earlyAvgHR;

  // Use terrain-adjusted drift if significant terrain difference, otherwise raw
  const reportedDrift = terrainAnalysis.terrain_contribution_bpm !== null && 
                        Math.abs(terrainAnalysis.terrain_contribution_bpm) >= 3
    ? terrainAnalysis.adjusted_drift_bpm
    : rawDrift;

  console.log('🔍 [HR DRIFT v2] Early avg HR:', earlyAvgHR);
  console.log('🔍 [HR DRIFT v2] Late avg HR:', lateAvgHR);
  console.log('🔍 [HR DRIFT v2] Raw drift:', rawDrift);
  console.log('🔍 [HR DRIFT v2] Terrain contribution:', terrainAnalysis.terrain_contribution_bpm);
  console.log('🔍 [HR DRIFT v2] Reported drift:', reportedDrift);

  // Generate interpretation with full context including tempo segment
  const interpretation = generateInterpretation(
    reportedDrift,
    workoutType,
    scopeDescription,
    terrainAnalysis,
    tempContext,
    excludedSegments,
    context,
    earlyAvgHR,
    lateAvgHR,
    tempoSegment
  );

  // Determine confidence level
  const confidence = determineConfidence(samplesToAnalyze.length, workoutType, terrainAnalysis);

  const result: HRDriftResult = {
    drift_bpm: Math.round(reportedDrift),
    analysis_scope: workoutType === 'tempo_finish' || workoutType === 'progressive' 
      ? 'primary_segment' 
      : 'full_workout',
    scope_description: scopeDescription,
    early_avg_hr: earlyAvgHR,
    late_avg_hr: lateAvgHR,
    terrain_contribution_bpm: terrainAnalysis.terrain_contribution_bpm,
    terrain_note: terrainAnalysis.terrain_note,
    temperature_factor: tempContext.factor,
    temperature_note: tempContext.note,
    interpretation,
    confidence,
    excluded_segments: excludedSegments,
    valid: true,
    workout_type: workoutType,
    tempo_segment: tempoSegment
  };

  console.log('✅ [HR DRIFT v2] Analysis complete:', JSON.stringify(result, null, 2));
  return result;
}

// =============================================================================
// WORKOUT TYPE DETECTION
// =============================================================================

function detectWorkoutType(
  intervals?: HRDriftContext['intervals'],
  plannedWorkout?: HRDriftContext['plannedWorkout']
): WorkoutType {
  console.log('🔍 [WORKOUT TYPE] Detecting...');

  if (!intervals || intervals.length === 0) {
    console.log('🔍 [WORKOUT TYPE] No intervals — assuming steady_state');
    return 'steady_state';
  }

  const workIntervals = intervals.filter(i => 
    i.role === 'work' || i.role === 'Work'
  );
  const recoveryIntervals = intervals.filter(i => 
    i.role === 'recovery' || i.role === 'Recovery' || i.role === 'rest'
  );

  console.log('🔍 [WORKOUT TYPE] Work intervals:', workIntervals.length);
  console.log('🔍 [WORKOUT TYPE] Recovery intervals:', recoveryIntervals.length);

  // Check planned workout description for keywords
  const desc = (plannedWorkout?.description || '').toLowerCase();
  const token = (plannedWorkout?.workout_token || '').toLowerCase();

  // Interval workout: multiple work segments with recovery between
  if (workIntervals.length > 1 && recoveryIntervals.length > 0) {
    console.log('🔍 [WORKOUT TYPE] Multiple work + recovery intervals → intervals');
    return 'intervals';
  }

  // Check for alternating work/recovery pattern even without explicit roles
  if (intervals.length >= 4) {
    const hasAlternatingPattern = intervals.some((interval, i) => {
      if (i === 0) return false;
      const prev = intervals[i - 1];
      const currPace = interval.pace_range ? (interval.pace_range.lower + interval.pace_range.upper) / 2 : 0;
      const prevPace = prev.pace_range ? (prev.pace_range.lower + prev.pace_range.upper) / 2 : 0;
      // Significant pace difference (>15%) suggests work/recovery alternation
      return currPace > 0 && prevPace > 0 && Math.abs(currPace - prevPace) / Math.min(currPace, prevPace) > 0.15;
    });
    
    if (hasAlternatingPattern && intervals.length >= 4) {
      console.log('🔍 [WORKOUT TYPE] Alternating pace pattern detected → intervals');
      return 'intervals';
    }
  }

  // Check for tempo finish or progressive patterns
  if (workIntervals.length >= 2 || intervals.length >= 2) {
    const relevantIntervals = workIntervals.length >= 2 ? workIntervals : intervals;
    const paceRanges = relevantIntervals
      .map(i => i.pace_range || i.executed?.avg_pace_s_per_mi)
      .filter(Boolean);

    if (paceRanges.length >= 2) {
      const firstPace = typeof paceRanges[0] === 'number' 
        ? paceRanges[0] 
        : (paceRanges[0].lower + paceRanges[0].upper) / 2;
      const lastPace = typeof paceRanges[paceRanges.length - 1] === 'number'
        ? paceRanges[paceRanges.length - 1]
        : (paceRanges[paceRanges.length - 1].lower + paceRanges[paceRanges.length - 1].upper) / 2;

      // Last segment is significantly faster (>5% faster pace = lower seconds/mile)
      if (lastPace < firstPace * 0.95) {
        // Check if it's a small fast finish vs full progressive
        const lastInterval = relevantIntervals[relevantIntervals.length - 1];
        
        // Calculate duration from time fields, falling back to sample indices (≈1 sample/sec)
        const getDuration = (interval: any) => {
          const timeDuration = (interval.end_time_s || 0) - (interval.start_time_s || 0);
          if (timeDuration > 0) return timeDuration;
          // Fallback: use sample indices as proxy for duration
          const sampleDuration = (interval.sample_idx_end || 0) - (interval.sample_idx_start || 0);
          if (sampleDuration > 0) return sampleDuration;
          // Last fallback: use executed duration
          return interval.executed?.duration_s || 0;
        };
        
        const lastDuration = getDuration(lastInterval);
        const totalDuration = relevantIntervals.reduce((sum, i) => sum + getDuration(i), 0);

        console.log('🔍 [WORKOUT TYPE] Tempo check: lastDuration=', lastDuration, 'totalDuration=', totalDuration, 'ratio=', totalDuration > 0 ? lastDuration / totalDuration : 'N/A');

        if (totalDuration > 0 && lastDuration / totalDuration < 0.25) {
          console.log('🔍 [WORKOUT TYPE] Small fast segment at end → tempo_finish');
          return 'tempo_finish';
        }
        console.log('🔍 [WORKOUT TYPE] Gradual pace increase → progressive');
        return 'progressive';
      }
    }
  }

  // Check description for clues
  if (desc.includes('progressive') || token.includes('progressive')) {
    console.log('🔍 [WORKOUT TYPE] Description mentions progressive → progressive');
    return 'progressive';
  }

  if (desc.includes('tempo finish') || desc.includes('fast finish') ||
      desc.includes('@ m pace') || desc.includes('@ tempo') ||
      desc.includes('pickup') || desc.includes('strides')) {
    console.log('🔍 [WORKOUT TYPE] Description mentions tempo/fast finish → tempo_finish');
    return 'tempo_finish';
  }

  console.log('🔍 [WORKOUT TYPE] Default → steady_state');
  return 'steady_state';
}

// =============================================================================
// SAMPLE SELECTION
// =============================================================================

interface SampleSelection {
  samplesToAnalyze: any[];
  excludedSegments: string[];
  scopeDescription: string;
  // For tempo finish - the samples from the tempo segment
  tempoSegmentSamples?: any[];
  tempoSegmentInfo?: {
    duration_min: number;
    pace_desc: string;
  };
}

function selectSamplesForAnalysis(
  validHRSamples: any[],
  allSensorData: any[],
  workoutType: WorkoutType,
  intervals?: HRDriftContext['intervals']
): SampleSelection {
  console.log('🔍 [SAMPLE SELECT] Selecting samples for', workoutType);

  // For steady state, use all samples with standard warmup/cooldown skip
  if (workoutType === 'steady_state' || !intervals || intervals.length === 0) {
    // Skip first 3 minutes (warmup) and last 3 minutes (cooldown) for steady-state
    const skipSamples = 180; // 3 minutes at 1 sample/sec
    const samplesToAnalyze = validHRSamples.slice(
      Math.min(skipSamples, Math.floor(validHRSamples.length * 0.1)),
      Math.max(validHRSamples.length - skipSamples, Math.floor(validHRSamples.length * 0.9))
    );
    
    return {
      samplesToAnalyze,
      excludedSegments: [],
      scopeDescription: 'Full workout (excluding warmup/cooldown)'
    };
  }

  // For tempo finish, analyze easy portion separately and capture tempo segment data
  if (workoutType === 'tempo_finish') {
    // Find the last interval (the tempo/fast portion)
    const sortedIntervals = [...intervals].sort((a, b) => 
      (a.start_time_s || 0) - (b.start_time_s || 0)
    );
    
    const lastInterval = sortedIntervals[sortedIntervals.length - 1];
    const lastIntervalPace = lastInterval.pace_range 
      ? (lastInterval.pace_range.lower + lastInterval.pace_range.upper) / 2
      : lastInterval.executed?.avg_pace_s_per_mi || 0;
    
    // Format pace description
    const lastPaceFormatted = lastIntervalPace > 0
      ? `${Math.floor(lastIntervalPace / 60)}:${String(Math.round(lastIntervalPace % 60)).padStart(2, '0')}/mi`
      : 'faster pace';
    
    // Calculate tempo segment duration
    let tempoDurationMin = 0;
    if (lastInterval.executed?.duration_s) {
      tempoDurationMin = lastInterval.executed.duration_s / 60;
    } else if (lastInterval.sample_idx_end !== undefined && lastInterval.sample_idx_start !== undefined) {
      tempoDurationMin = (lastInterval.sample_idx_end - lastInterval.sample_idx_start) / 60;
    }
    
    // If we have sample indices, use them to split easy vs tempo
    if (lastInterval.sample_idx_start !== undefined) {
      const tempoStartIndex = lastInterval.sample_idx_start;
      
      // Easy portion samples (before tempo)
      const samplesToAnalyze = validHRSamples.filter((s, idx) => {
        const originalIdx = allSensorData.indexOf(s);
        return originalIdx < tempoStartIndex;
      });
      
      // Tempo segment samples (for reporting, not drift calculation)
      const tempoSegmentSamples = validHRSamples.filter((s, idx) => {
        const originalIdx = allSensorData.indexOf(s);
        return originalIdx >= tempoStartIndex;
      });
      
      console.log('🔍 [TEMPO SPLIT] Easy samples:', samplesToAnalyze.length, 'Tempo samples:', tempoSegmentSamples.length);
      
      return {
        samplesToAnalyze,
        excludedSegments: [`tempo finish (~${tempoDurationMin.toFixed(0)} min at ${lastPaceFormatted})`],
        scopeDescription: `Easy portion only (drift measured here) — tempo finish reported separately`,
        tempoSegmentSamples,
        tempoSegmentInfo: {
          duration_min: tempoDurationMin,
          pace_desc: lastPaceFormatted
        }
      };
    }
    
    // Fallback: use time-based split
    const lastIntervalStart = lastInterval.start_time_s || 0;
    const samplesToAnalyze = validHRSamples.filter(s => {
      const sampleTime = s.timestamp || s.elapsed_time_s || 0;
      return sampleTime < lastIntervalStart;
    });
    const tempoSegmentSamples = validHRSamples.filter(s => {
      const sampleTime = s.timestamp || s.elapsed_time_s || 0;
      return sampleTime >= lastIntervalStart;
    });
    
    return {
      samplesToAnalyze: samplesToAnalyze.length >= 20 ? samplesToAnalyze : validHRSamples,
      excludedSegments: ['tempo finish'],
      scopeDescription: samplesToAnalyze.length >= 20 
        ? 'Easy portion only (drift measured here) — tempo finish reported separately'
        : 'Full workout (insufficient data to isolate easy portion)',
      tempoSegmentSamples: samplesToAnalyze.length >= 20 ? tempoSegmentSamples : undefined,
      tempoSegmentInfo: samplesToAnalyze.length >= 20 ? {
        duration_min: tempoDurationMin,
        pace_desc: lastPaceFormatted
      } : undefined
    };
  }

  // For progressive runs, analyze the first 2/3 of the workout
  if (workoutType === 'progressive') {
    const cutoff = Math.floor(validHRSamples.length * 0.67);
    const samplesToAnalyze = validHRSamples.slice(0, cutoff);
    
    return {
      samplesToAnalyze,
      excludedSegments: ['progressive buildup (final third)'],
      scopeDescription: 'Early portion only — progressive run excludes faster buildup'
    };
  }

  // Default: use all samples
  return {
    samplesToAnalyze: validHRSamples,
    excludedSegments: [],
    scopeDescription: 'Full workout'
  };
}

// =============================================================================
// TERRAIN ANALYSIS
// =============================================================================

interface TerrainAnalysis {
  adjusted_drift_bpm: number;
  terrain_contribution_bpm: number | null;
  terrain_note: string | null;
  early_avg_grade: number | null;
  late_avg_grade: number | null;
  // Overall terrain context
  total_elevation_gain_ft: number | null;
  elevation_per_mile_ft: number | null;
  terrain_difficulty: 'flat' | 'rolling' | 'hilly' | 'mountainous' | null;
  late_segment_hillier: boolean | null;
  // Terrain profile narrative
  profile_description: string | null;
  climbing_location: 'early' | 'middle' | 'late' | 'throughout' | 'flat' | null;
  early_window_terrain: string | null;
  late_window_terrain: string | null;
}

interface ElevationSegment {
  start_pct: number;
  end_pct: number;
  start_elev_ft: number;
  end_elev_ft: number;
  gain_ft: number;
  loss_ft: number;
  net_change_ft: number;
  description: string;
}

function analyzeElevationProfile(
  allSamples: any[],
  totalDistanceM?: number
): { segments: ElevationSegment[]; profileDescription: string | null; climbingLocation: 'early' | 'middle' | 'late' | 'throughout' | 'flat' | null; peakLocation: string | null; totalGainFt: number } {
  // Get elevation values from samples
  const getElev = (s: any): number | null => {
    const elev = s.elevation_m ?? s.elevation ?? s.elevationInMeters ?? s.altitude;
    return (elev != null && Number.isFinite(elev)) ? elev * 3.28084 : null; // Convert to feet
  };

  const elevations = allSamples.map(s => getElev(s)).filter(e => e !== null) as number[];
  if (elevations.length < 100) {
    return { segments: [], profileDescription: null, climbingLocation: null, peakLocation: null, totalGainFt: 0 };
  }

  // Smooth elevation data (moving average to reduce GPS noise)
  const smoothed: number[] = [];
  const windowSize = Math.min(30, Math.floor(elevations.length / 20));
  for (let i = 0; i < elevations.length; i++) {
    const start = Math.max(0, i - windowSize);
    const end = Math.min(elevations.length, i + windowSize + 1);
    const avg = elevations.slice(start, end).reduce((a, b) => a + b, 0) / (end - start);
    smoothed.push(avg);
  }

  // Divide into quarters for analysis
  const quarterSize = Math.floor(smoothed.length / 4);
  const quarters: ElevationSegment[] = [];
  
  for (let q = 0; q < 4; q++) {
    const startIdx = q * quarterSize;
    const endIdx = q === 3 ? smoothed.length - 1 : (q + 1) * quarterSize - 1;
    const segment = smoothed.slice(startIdx, endIdx + 1);
    
    // Calculate gain and loss within segment
    let gain = 0, loss = 0;
    for (let i = 1; i < segment.length; i++) {
      const diff = segment[i] - segment[i - 1];
      if (diff > 0) gain += diff;
      else loss += Math.abs(diff);
    }

    const startElev = segment[0];
    const endElev = segment[segment.length - 1];
    const netChange = endElev - startElev;
    
    // Describe this quarter
    let desc = '';
    if (Math.abs(netChange) < 30) {
      desc = 'flat/rolling';
    } else if (netChange > 100) {
      desc = 'significant climb';
    } else if (netChange > 50) {
      desc = 'gradual climb';
    } else if (netChange < -100) {
      desc = 'significant descent';
    } else if (netChange < -50) {
      desc = 'gradual descent';
    } else if (netChange > 0) {
      desc = 'slight climb';
    } else {
      desc = 'slight descent';
    }

    quarters.push({
      start_pct: q * 25,
      end_pct: (q + 1) * 25,
      start_elev_ft: Math.round(startElev),
      end_elev_ft: Math.round(endElev),
      gain_ft: Math.round(gain),
      loss_ft: Math.round(loss),
      net_change_ft: Math.round(netChange),
      description: desc
    });
  }

  // Find where the peak elevation occurred
  const maxElev = Math.max(...smoothed);
  const peakIdx = smoothed.indexOf(maxElev);
  const peakPct = Math.round((peakIdx / smoothed.length) * 100);
  const peakLocation = peakPct < 35 ? 'early' : peakPct < 65 ? 'middle' : 'late';

  // Determine where most climbing occurred
  const firstHalfGain = quarters[0].gain_ft + quarters[1].gain_ft;
  const secondHalfGain = quarters[2].gain_ft + quarters[3].gain_ft;
  const totalGain = firstHalfGain + secondHalfGain;

  let climbingLocation: 'early' | 'middle' | 'late' | 'throughout' | 'flat' | null = null;
  if (totalGain < 100) {
    climbingLocation = 'flat';
  } else if (firstHalfGain > secondHalfGain * 2) {
    climbingLocation = 'early';
  } else if (secondHalfGain > firstHalfGain * 2) {
    climbingLocation = 'late';
  } else if (quarters[1].gain_ft + quarters[2].gain_ft > (quarters[0].gain_ft + quarters[3].gain_ft) * 1.5) {
    climbingLocation = 'middle';
  } else {
    climbingLocation = 'throughout';
  }

  // Build profile description using quarters
  const startElev = Math.round(smoothed[0]);
  const endElev = Math.round(smoothed[smoothed.length - 1]);
  const peakElevFt = Math.round(maxElev);
  
  // Estimate miles based on total distance or sample count
  const totalMiles = totalDistanceM ? totalDistanceM / 1609.34 : smoothed.length / 600; // ~10 samples/sec, 10 min/mi ≈ 600 samples/mi
  
  let profileDesc = '';
  if (climbingLocation === 'flat') {
    profileDesc = `Relatively flat course (${startElev}–${endElev} ft).`;
  } else if (climbingLocation === 'early') {
    const peakMile = Math.round((peakPct / 100) * totalMiles);
    profileDesc = `Climb from ${startElev} ft to peak ${peakElevFt} ft around mile ${peakMile}, then mostly downhill/flat to ${endElev} ft.`;
  } else if (climbingLocation === 'late') {
    const climbStartMile = Math.round(0.5 * totalMiles);
    profileDesc = `Relatively flat first half, then climb to ${peakElevFt} ft in second half.`;
  } else if (climbingLocation === 'middle') {
    const peakMile = Math.round((peakPct / 100) * totalMiles);
    profileDesc = `Build to peak ${peakElevFt} ft around mile ${peakMile}, then descend.`;
  } else {
    profileDesc = `Rolling terrain throughout (${startElev}–${peakElevFt} ft range).`;
  }

  console.log('🏔️ [TERRAIN PROFILE] Quarters:', JSON.stringify(quarters.map(q => ({ pct: `${q.start_pct}-${q.end_pct}`, net: q.net_change_ft, gain: q.gain_ft, desc: q.description }))));
  console.log('🏔️ [TERRAIN PROFILE] Total gain from sensor data:', totalGain, 'ft');
  console.log('🏔️ [TERRAIN PROFILE] Peak at:', peakPct + '%', 'Climbing location:', climbingLocation);
  console.log('🏔️ [TERRAIN PROFILE] Description:', profileDesc);

  return {
    segments: quarters,
    profileDescription: profileDesc,
    climbingLocation,
    peakLocation: `${peakPct}% through (mile ~${Math.round((peakPct / 100) * totalMiles)})`,
    totalGainFt: Math.round(totalGain) // Return total gain calculated from sensor data
  };
}

function describeWindowTerrain(samples: any[]): string | null {
  const getElev = (s: any): number | null => {
    const elev = s.elevation_m ?? s.elevation ?? s.elevationInMeters ?? s.altitude;
    return (elev != null && Number.isFinite(elev)) ? elev * 3.28084 : null;
  };

  const elevations = samples.map(s => getElev(s)).filter(e => e !== null) as number[];
  if (elevations.length < 20) return null;

  const startElev = elevations[0];
  const endElev = elevations[elevations.length - 1];
  const netChange = endElev - startElev;

  let gain = 0, loss = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) gain += diff;
    else loss += Math.abs(diff);
  }

  if (Math.abs(netChange) < 20 && gain < 50) {
    return 'flat';
  } else if (netChange > 80) {
    return `climbing (+${Math.round(netChange)} ft)`;
  } else if (netChange > 30) {
    return `uphill (+${Math.round(netChange)} ft)`;
  } else if (netChange < -80) {
    return `descending (${Math.round(netChange)} ft)`;
  } else if (netChange < -30) {
    return `downhill (${Math.round(netChange)} ft)`;
  } else if (gain > 100) {
    return `rolling (${Math.round(gain)} ft of ups and downs)`;
  } else {
    return 'gently rolling';
  }
}

function calculateTerrainNormalizedDrift(
  earlyWindow: any[],
  lateWindow: any[],
  totalElevationGainM?: number,
  totalDistanceM?: number,
  allSamples?: any[]
): TerrainAnalysis {
  // Analyze the full elevation profile if we have all samples
  let profileAnalysis = { segments: [] as ElevationSegment[], profileDescription: null as string | null, climbingLocation: null as 'early' | 'middle' | 'late' | 'throughout' | 'flat' | null, peakLocation: null as string | null, totalGainFt: 0 };
  if (allSamples && allSamples.length > 0) {
    profileAnalysis = analyzeElevationProfile(allSamples, totalDistanceM);
    console.log('🏔️ [TERRAIN] Profile analysis returned totalGainFt:', profileAnalysis.totalGainFt);
  }

  // Describe terrain in each analysis window
  const earlyWindowTerrain = describeWindowTerrain(earlyWindow);
  const lateWindowTerrain = describeWindowTerrain(lateWindow);

  // Calculate average grade for each window (for drift adjustment)
  const getAvgGrade = (samples: any[]): number | null => {
    const grades: number[] = [];
    
    for (let i = 1; i < samples.length; i++) {
      const curr = samples[i];
      const prev = samples[i - 1];
      
      // Try to get elevation from various field names
      const currElev = curr.elevation_m ?? curr.elevation ?? curr.elevationInMeters ?? curr.altitude;
      const prevElev = prev.elevation_m ?? prev.elevation ?? prev.elevationInMeters ?? prev.altitude;
      
      if (currElev != null && prevElev != null && Number.isFinite(currElev) && Number.isFinite(prevElev)) {
        // Calculate distance between samples (assume ~1 second of movement)
        const speed = curr.speedMetersPerSecond ?? prev.speedMetersPerSecond ?? 2.5; // ~9 min/mi default
        const distance = speed * 1; // 1 second
        
        if (distance > 0) {
          const elevChange = currElev - prevElev;
          const grade = (elevChange / distance) * 100;
          
          // Filter out unrealistic grades (GPS noise)
          if (Math.abs(grade) < 30) {
            grades.push(grade);
          }
        }
      }
    }
    
    if (grades.length < 10) return null;
    return grades.reduce((a, b) => a + b, 0) / grades.length;
  };

  const earlyGrade = getAvgGrade(earlyWindow);
  const lateGrade = getAvgGrade(lateWindow);

  // Calculate raw HR averages
  const earlyHR = earlyWindow.reduce((sum, s) => sum + s.heart_rate, 0) / earlyWindow.length;
  const lateHR = lateWindow.reduce((sum, s) => sum + s.heart_rate, 0) / lateWindow.length;
  const rawDrift = lateHR - earlyHR;

  // Calculate overall terrain context
  // Use workout.elevation_gain if available, otherwise fall back to sensor-data-derived value
  let totalElevationGainFt: number | null = null;
  let elevationPerMileFt: number | null = null;
  let terrainDifficulty: 'flat' | 'rolling' | 'hilly' | 'mountainous' | null = null;
  
  if (totalElevationGainM != null && totalElevationGainM > 0) {
    // Use workout-provided elevation gain
    totalElevationGainFt = Math.round(totalElevationGainM * 3.28084);
    console.log('🏔️ [TERRAIN] Using workout elevation_gain:', totalElevationGainFt, 'ft');
  } else if (profileAnalysis.totalGainFt > 0) {
    // Fall back to sensor-data-derived elevation gain
    totalElevationGainFt = profileAnalysis.totalGainFt;
    console.log('🏔️ [TERRAIN] Using sensor-derived elevation gain:', totalElevationGainFt, 'ft');
  }
  
  if (totalElevationGainFt != null && totalDistanceM != null && totalDistanceM > 0) {
    const totalDistanceMi = totalDistanceM / 1609.34;
    elevationPerMileFt = totalDistanceMi > 0 ? Math.round(totalElevationGainFt / totalDistanceMi) : null;
    
    // Classify terrain difficulty based on ft/mile
    if (elevationPerMileFt !== null) {
      if (elevationPerMileFt < 20) {
        terrainDifficulty = 'flat';
      } else if (elevationPerMileFt < 50) {
        terrainDifficulty = 'rolling';
      } else if (elevationPerMileFt < 100) {
        terrainDifficulty = 'hilly';
      } else {
        terrainDifficulty = 'mountainous';
      }
    }
  }

  // Estimate terrain contribution to HR difference
  // Rule of thumb: ~3-5 bpm per 1% grade increase at steady effort
  let terrainContribution: number | null = null;
  let terrainNote: string | null = null;
  let lateSegmentHillier: boolean | null = null;

  if (earlyGrade !== null && lateGrade !== null) {
    const gradeDiff = lateGrade - earlyGrade;
    lateSegmentHillier = gradeDiff > 0.3;
    
    if (Math.abs(gradeDiff) > 0.3) { // Meaningful grade difference
      terrainContribution = Math.round(gradeDiff * 4); // ~4 bpm per 1% grade
      
      if (gradeDiff > 0.3) {
        terrainNote = `Late segment averaged +${gradeDiff.toFixed(1)}% steeper grade — estimated +${terrainContribution} bpm from terrain`;
      } else if (gradeDiff < -0.3) {
        terrainNote = `Late segment averaged ${Math.abs(gradeDiff).toFixed(1)}% less steep — estimated ${Math.abs(terrainContribution)} bpm less from terrain`;
      }
    }
  }

  // Calculate terrain-adjusted drift
  const adjustedDrift = terrainContribution !== null
    ? rawDrift - terrainContribution
    : rawDrift;

  console.log('🔍 [TERRAIN] Total elevation:', totalElevationGainFt ?? 'N/A', 'ft');
  console.log('🔍 [TERRAIN] Elevation per mile:', elevationPerMileFt ?? 'N/A', 'ft/mi');
  console.log('🔍 [TERRAIN] Terrain difficulty:', terrainDifficulty ?? 'N/A');
  console.log('🔍 [TERRAIN] Profile description:', profileAnalysis.profileDescription ?? 'N/A');
  console.log('🔍 [TERRAIN] Climbing location:', profileAnalysis.climbingLocation ?? 'N/A');
  console.log('🔍 [TERRAIN] Early window:', earlyWindowTerrain ?? 'N/A');
  console.log('🔍 [TERRAIN] Late window:', lateWindowTerrain ?? 'N/A');
  console.log('🔍 [TERRAIN] Early avg grade:', earlyGrade?.toFixed(2) ?? 'N/A');
  console.log('🔍 [TERRAIN] Late avg grade:', lateGrade?.toFixed(2) ?? 'N/A');
  console.log('🔍 [TERRAIN] Terrain contribution:', terrainContribution ?? 'N/A');
  console.log('🔍 [TERRAIN] Adjusted drift:', adjustedDrift.toFixed(1));

  return {
    adjusted_drift_bpm: Math.round(adjustedDrift),
    terrain_contribution_bpm: terrainContribution,
    terrain_note: terrainNote,
    early_avg_grade: earlyGrade,
    late_avg_grade: lateGrade,
    total_elevation_gain_ft: totalElevationGainFt,
    elevation_per_mile_ft: elevationPerMileFt,
    terrain_difficulty: terrainDifficulty,
    late_segment_hillier: lateSegmentHillier,
    profile_description: profileAnalysis.profileDescription,
    climbing_location: profileAnalysis.climbingLocation,
    early_window_terrain: earlyWindowTerrain,
    late_window_terrain: lateWindowTerrain
  };
}

// =============================================================================
// TEMPERATURE CONTEXT
// =============================================================================

interface TemperatureContext {
  factor: 'normal' | 'hot' | 'cold' | 'unknown';
  note: string | null;
  expectedDriftIncrease: number;
}

function getTemperatureContext(
  temperature: number | undefined,
  units: 'metric' | 'imperial'
): TemperatureContext {
  if (temperature === undefined || temperature === null) {
    return { factor: 'unknown', note: null, expectedDriftIncrease: 0 };
  }

  // Convert to Celsius for consistent thresholds
  const tempC = units === 'imperial' ? (temperature - 32) * 5 / 9 : temperature;
  const tempDisplay = `${Math.round(temperature)}°${units === 'imperial' ? 'F' : 'C'}`;

  if (tempC > 28) { // > 82°F - significant heat
    return {
      factor: 'hot',
      note: `${tempDisplay} — significant heat, elevated drift expected (+5-10 bpm typical)`,
      expectedDriftIncrease: 8
    };
  }

  if (tempC > 24) { // > 75°F - moderate heat
    return {
      factor: 'hot',
      note: `${tempDisplay} — warm conditions, some additional drift expected`,
      expectedDriftIncrease: 4
    };
  }

  if (tempC < 10) { // < 50°F
    return {
      factor: 'cold',
      note: `${tempDisplay} — cool conditions`,
      expectedDriftIncrease: -2
    };
  }

  return { factor: 'normal', note: null, expectedDriftIncrease: 0 };
}

// =============================================================================
// INTERPRETATION
// =============================================================================

function formatPace(secPerMi: number): string {
  const min = Math.floor(secPerMi / 60);
  const sec = Math.round(secPerMi % 60);
  return `${min}:${String(sec).padStart(2, '0')}/mi`;
}

function generateInterpretation(
  driftBpm: number,
  workoutType: WorkoutType,
  scopeDescription: string,
  terrainAnalysis: TerrainAnalysis,
  tempContext: TemperatureContext,
  excludedSegments: string[],
  context?: HRDriftContext,
  earlyAvgHR?: number,
  lateAvgHR?: number,
  tempoSegment?: HRDriftResult['tempo_segment']
): string {
  const parts: string[] = [];

  // Build context flags
  const hasTempoFinish = workoutType === 'tempo_finish' || excludedSegments.some(s => s.includes('tempo') || s.includes('faster'));
  const hasSignificantTerrain = terrainAnalysis.total_elevation_gain_ft !== null && terrainAnalysis.total_elevation_gain_ft >= 300;
  const isHot = tempContext.factor === 'hot';
  const isCold = tempContext.factor === 'cold';
  const climbWasEarly = terrainAnalysis.climbing_location === 'early';
  const climbWasLate = terrainAnalysis.climbing_location === 'late';
  
  // Weather description for narrative
  const weatherDesc = tempContext.note ? tempContext.note.split('—')[0].trim() : null;

  // Extract plan details if available
  const intervals = context?.intervals || [];
  const totalDurationMin = intervals.reduce((sum, i) => sum + ((i.end_time_s || 0) - (i.start_time_s || 0)), 0) / 60;
  const isLongRun = totalDurationMin >= 75; // 75+ min = long run
  
  // Analyze pace execution vs prescription
  let paceExecution: 'slower' | 'faster' | 'on_target' | 'unknown' = 'unknown';
  let paceDeviationPct = 0;
  let executedPaceDesc = '';
  let targetPaceDesc = '';
  
  // Look at the main steady segment (not tempo finish)
  const steadySegments = intervals.filter(i => 
    i.role === 'work' || i.role === 'steady' || 
    (i.pace_range && !['warmup', 'cooldown', 'recovery'].includes(i.role || ''))
  );
  
  // Find the longest segment that's not a tempo finish
  const mainSegment = steadySegments
    .filter(i => {
      // Exclude if it's the fastest segment (likely tempo)
      const segmentPace = i.pace_range ? (i.pace_range.lower + i.pace_range.upper) / 2 : 0;
      const allPaces = steadySegments.map(s => s.pace_range ? (s.pace_range.lower + s.pace_range.upper) / 2 : 0).filter(p => p > 0);
      const fastestPace = Math.min(...allPaces);
      return segmentPace === 0 || segmentPace > fastestPace * 1.05; // Not the fastest segment
    })
    .sort((a, b) => ((b.end_time_s || 0) - (b.start_time_s || 0)) - ((a.end_time_s || 0) - (a.start_time_s || 0)))[0];
  
  if (mainSegment && mainSegment.pace_range && mainSegment.executed?.avg_pace_s_per_mi) {
    const targetMidPace = (mainSegment.pace_range.lower + mainSegment.pace_range.upper) / 2;
    const executedPace = mainSegment.executed.avg_pace_s_per_mi;
    
    targetPaceDesc = `${formatPace(mainSegment.pace_range.lower)}–${formatPace(mainSegment.pace_range.upper)}`;
    executedPaceDesc = formatPace(executedPace);
    
    // Calculate deviation (positive = slower, negative = faster)
    paceDeviationPct = ((executedPace - targetMidPace) / targetMidPace) * 100;
    
    if (executedPace > mainSegment.pace_range.upper * 1.02) {
      paceExecution = 'slower';
    } else if (executedPace < mainSegment.pace_range.lower * 0.98) {
      paceExecution = 'faster';
    } else {
      paceExecution = 'on_target';
    }
  }
  
  // Build plan description from intervals
  let planDescription = '';
  if (intervals.length > 0) {
    const mainSegments = intervals.filter(i => i.role === 'work' || i.role === 'steady' || !['warmup', 'cooldown', 'recovery'].includes(i.role || ''));
    if (mainSegments.length >= 2) {
      const firstSegment = mainSegments[0];
      const lastSegment = mainSegments[mainSegments.length - 1];
      
      // Check if last segment is faster (tempo finish)
      const firstPace = firstSegment.pace_range ? (firstSegment.pace_range.lower + firstSegment.pace_range.upper) / 2 : 0;
      const lastPace = lastSegment.pace_range ? (lastSegment.pace_range.lower + lastSegment.pace_range.upper) / 2 : 0;
      
      if (lastPace > 0 && firstPace > 0 && lastPace < firstPace * 0.92) {
        // Last segment is at least 8% faster
        const firstDurationMin = ((firstSegment.end_time_s || 0) - (firstSegment.start_time_s || 0)) / 60;
        const lastDurationMin = ((lastSegment.end_time_s || 0) - (lastSegment.start_time_s || 0)) / 60;
        
        if (firstSegment.pace_range && lastSegment.pace_range) {
          planDescription = `${Math.round(firstDurationMin)} min at ${formatPace(firstSegment.pace_range.lower)}–${formatPace(firstSegment.pace_range.upper)}, finishing with ${Math.round(lastDurationMin)} min at ${formatPace(lastSegment.pace_range.lower)}–${formatPace(lastSegment.pace_range.upper)}`;
        }
      }
    }
  }

  // ==========================================================================
  // DURATION-BASED EXPECTED DRIFT RANGES (Exercise Physiology Research)
  // - <60 min: 3-8 bpm typical
  // - 60-90 min: 5-12 bpm typical  
  // - 90-150 min: 8-15 bpm typical (marathon training long runs)
  // - 150+ min: 10-20 bpm typical (ultra/marathon distance)
  // Sources: Coyle & González-Alonso 2001, Wingo et al. 2005, Jeukendrup 2011
  // ==========================================================================
  
  let expectedDriftLower = 5;
  let expectedDriftUpper = 12;
  let durationCategory = 'standard';
  
  if (totalDurationMin < 60) {
    expectedDriftLower = 3;
    expectedDriftUpper = 8;
    durationCategory = 'short';
  } else if (totalDurationMin < 90) {
    expectedDriftLower = 5;
    expectedDriftUpper = 12;
    durationCategory = 'moderate';
  } else if (totalDurationMin < 150) {
    expectedDriftLower = 8;
    expectedDriftUpper = 15;
    durationCategory = 'long';
  } else {
    expectedDriftLower = 10;
    expectedDriftUpper = 20;
    durationCategory = 'extended';
  }
  
  // Adjust expectations for terrain
  if (hasSignificantTerrain) {
    expectedDriftUpper += 3; // Hills add variability
  }
  
  // Adjust for training phase context
  const plan = context?.planContext;
  const isBuildPhase = plan?.weekIntent === 'build' || plan?.weekIntent === 'peak';
  const isRecoveryPhase = plan?.isRecoveryWeek || plan?.weekIntent === 'recovery';
  const isTaperPhase = plan?.weekIntent === 'taper';
  
  if (isBuildPhase) {
    expectedDriftUpper += 2; // Accumulated training load is expected
  } else if (isRecoveryPhase) {
    expectedDriftUpper -= 2; // Recovery should show lower drift
  } else if (isTaperPhase) {
    expectedDriftUpper -= 3; // Taper should show improved efficiency
  }
  
  // Adjust for temperature (heat significantly increases expected drift)
  if (tempContext.expectedDriftIncrease !== 0) {
    expectedDriftUpper += tempContext.expectedDriftIncrease;
    expectedDriftLower += Math.floor(tempContext.expectedDriftIncrease / 2); // Lower bound shifts less
  }

  // Determine if drift is within expected range for THIS workout
  const isWithinExpected = driftBpm >= expectedDriftLower - 2 && driftBpm <= expectedDriftUpper;
  const isBelowExpected = driftBpm < expectedDriftLower - 2;
  const isAboveExpected = driftBpm > expectedDriftUpper;
  
  // Historical context
  const historical = context?.historicalDrift;

  // ==========================================================================
  // BUILD THE NARRATIVE AS FLOWING PROSE - TELL THE COMPLETE STORY
  // Structure: Conditions → What you did → How body responded → Tempo finish → Context → Bottom line
  // ==========================================================================

  // OPENING: Set the scene with conditions
  let opening = '';
  const conditionsParts: string[] = [];
  
  // Weather context
  if (weatherDesc) {
    conditionsParts.push(weatherDesc);
  }
  
  // Terrain context
  if (hasSignificantTerrain) {
    const terrainDesc = climbWasEarly 
      ? `${terrainAnalysis.total_elevation_gain_ft} ft of climbing (front-loaded)`
      : climbWasLate 
        ? `${terrainAnalysis.total_elevation_gain_ft} ft of climbing (back-loaded)`
        : `${terrainAnalysis.total_elevation_gain_ft} ft of climbing`;
    conditionsParts.push(terrainDesc);
  }
  
  // Build opening based on workout type
  if (hasTempoFinish) {
    const durationDesc = totalDurationMin > 0 ? `${Math.round(totalDurationMin)}-minute ` : '';
    opening = `This was a ${durationDesc}long run with a tempo finish`;
    if (conditionsParts.length > 0) {
      opening += ` in ${conditionsParts.join(', ')}`;
    }
    opening += '.';
  } else if (durationCategory === 'long' || durationCategory === 'extended') {
    opening = `This was a ${Math.round(totalDurationMin)}-minute long run`;
    if (conditionsParts.length > 0) {
      opening += ` in ${conditionsParts.join(', ')}`;
    }
    opening += '.';
  } else {
    if (conditionsParts.length > 0) {
      opening = `Conditions: ${conditionsParts.join(', ')}.`;
    }
  }
  
  if (opening) {
    parts.push(opening);
  }

  // PACING: How you executed the easy portion
  let pacingStatement = '';
  if (paceExecution === 'slower' && Math.abs(paceDeviationPct) >= 5) {
    if (hasSignificantTerrain) {
      pacingStatement = `You paced the ${hasTempoFinish ? 'easy portion' : 'run'} conservatively at ${executedPaceDesc} (vs ${targetPaceDesc} prescribed)—a smart choice given the terrain.`;
    } else {
      pacingStatement = `You ran easier than prescribed at ${executedPaceDesc} (vs ${targetPaceDesc}).`;
    }
  } else if (paceExecution === 'faster' && Math.abs(paceDeviationPct) >= 3) {
    pacingStatement = `You pushed harder than prescribed (${executedPaceDesc} vs ${targetPaceDesc}).`;
  } else if (paceExecution === 'on_target' && executedPaceDesc) {
    pacingStatement = `Pacing was right on target at ${executedPaceDesc}.`;
  }
  
  if (pacingStatement) {
    parts.push(pacingStatement);
  }

  // HR RESPONSE: What happened to your heart rate in the easy portion
  let hrStatement = '';
  const hrNumbers = earlyAvgHR && lateAvgHR 
    ? ` (HR climbed from ${earlyAvgHR} to ${lateAvgHR} bpm)` 
    : '';
  
  if (isWithinExpected) {
    if (durationCategory === 'long' || durationCategory === 'extended') {
      hrStatement = `During the ${hasTempoFinish ? 'easy portion' : 'run'}, your heart rate drifted +${driftBpm} bpm${hrNumbers}—right in the expected ${expectedDriftLower}-${expectedDriftUpper} bpm range for an effort this long.`;
    } else {
      hrStatement = `Your cardiac drift of +${driftBpm} bpm${hrNumbers} is a normal aerobic response for this duration.`;
    }
  } else if (isBelowExpected) {
    hrStatement = `Your cardiac drift of only +${driftBpm} bpm${hrNumbers} is excellent—better than the typical ${expectedDriftLower}-${expectedDriftUpper} bpm range. Strong aerobic efficiency.`;
  } else {
    // Above expected
    if (isBuildPhase && driftBpm <= expectedDriftUpper + 5) {
      hrStatement = `Your +${driftBpm} bpm drift${hrNumbers} is slightly above typical, but expected when carrying accumulated training load.`;
    } else if (paceExecution === 'slower' && hasSignificantTerrain) {
      hrStatement = `Your +${driftBpm} bpm drift${hrNumbers} is elevated despite conservative pacing—the terrain was clearly a factor.`;
    } else {
      hrStatement = `Your +${driftBpm} bpm drift${hrNumbers} is above the typical ${expectedDriftLower}-${expectedDriftUpper} bpm range for this duration.`;
    }
  }
  
  // Add weather impact inline
  if (isHot) {
    hrStatement += ` The heat adds 5-10 bpm to expected drift.`;
  } else if (isCold) {
    hrStatement += ` Cool conditions were favorable for HR stability.`;
  }
  
  parts.push(hrStatement);

  // TEMPO FINISH: What happened when you picked up the pace
  if (hasTempoFinish && tempoSegment) {
    const tempoStatement = `You then finished with ${Math.round(tempoSegment.duration_min)} minutes at tempo (${tempoSegment.pace_desc}), where HR peaked at ${tempoSegment.peak_hr} bpm (avg ${tempoSegment.avg_hr}). That's not drift—that's the workout design doing its job.`;
    parts.push(tempoStatement);
  } else if (hasTempoFinish) {
    parts.push(`The tempo finish naturally pushed HR higher—that's the intended stimulus, not fatigue.`);
  }

  // CONTEXT: Training phase and historical comparison (conversational)
  if (plan?.hasActivePlan && plan?.weekIntent) {
    const weekNum = plan.weekIndex ? `Week ${plan.weekIndex}` : '';
    
    if (isBuildPhase) {
      parts.push(`You're in ${weekNum ? weekNum + ' of your ' : 'the '}build phase, so some fatigue accumulation is expected and productive.`);
    } else if (isRecoveryPhase) {
      if (isAboveExpected) {
        parts.push(`This is a recovery week—elevated drift suggests you're carrying fatigue into this block.`);
      } else {
        parts.push(`This recovery week effort looks on track.`);
      }
    } else if (isTaperPhase) {
      if (isBelowExpected) {
        parts.push(`You're in taper, and the improved efficiency shows your body is freshening up for race day.`);
      } else if (isAboveExpected) {
        parts.push(`You're in taper—make sure you're truly easing off so you arrive at race day fresh.`);
      }
    }
  }
  
  // Historical comparison (brief, conversational)
  if (historical?.lastWeekSimilar) {
    const lastWeek = historical.lastWeekSimilar;
    const diff = driftBpm - lastWeek.driftBpm;
    const diffAbs = Math.abs(diff);
    
    if (diffAbs <= 2) {
      parts.push(`That's consistent with your similar run ${lastWeek.daysSince} days ago.`);
    } else if (diff > 2) {
      parts.push(`That's ${diffAbs} bpm more than your similar run ${lastWeek.daysSince} days ago (${lastWeek.driftBpm} bpm then).`);
    } else {
      parts.push(`That's actually ${diffAbs} bpm less drift than ${lastWeek.daysSince} days ago—improving.`);
    }
  } else if (historical && historical.similarWorkouts.length >= 2 && Math.abs(driftBpm - historical.avgDriftBpm) > 2) {
    const diff = driftBpm - historical.avgDriftBpm;
    if (diff > 0) {
      parts.push(`That's higher than your typical ${historical.avgDriftBpm} bpm on similar runs.`);
    } else {
      parts.push(`That's better than your typical ${historical.avgDriftBpm} bpm on similar runs.`);
    }
  }
  
  // Trend mention (only if notable)
  if (historical?.recentTrend === 'improving') {
    parts.push(`Your drift has been improving over recent long runs—aerobic fitness is building.`);
  } else if (historical?.recentTrend === 'worsening' && !isBuildPhase) {
    parts.push(`Drift has been creeping up lately—worth watching your recovery.`);
  }

  // CLOSING: The bottom line (integrated, not labeled)
  let bottomLine = '';
  
  if (isWithinExpected || isBelowExpected) {
    if (isBuildPhase && hasSignificantTerrain) {
      bottomLine = `You handled a challenging workout exactly as expected—the hills, duration, and accumulated load all factor in. This is the work that builds marathon fitness.`;
    } else if (isBuildPhase) {
      bottomLine = `Solid execution. Your body is responding appropriately to the progressive training load.`;
    } else if (isRecoveryPhase && isBelowExpected) {
      bottomLine = `Great recovery run—low drift shows you're absorbing the recent training well.`;
    } else if (isTaperPhase && isBelowExpected) {
      bottomLine = `Excellent taper execution—this is exactly what we want to see heading into race day.`;
    } else if (hasTempoFinish) {
      bottomLine = `Well executed—the easy portion was appropriately aerobic and you finished strong.`;
    } else if (durationCategory === 'long' || durationCategory === 'extended') {
      bottomLine = `Your aerobic system handled this well. Good long run.`;
    } else if (isBelowExpected) {
      bottomLine = `Excellent aerobic efficiency.`;
    } else {
      bottomLine = `Normal physiological response—you're on track.`;
    }
  } else if (isAboveExpected) {
    const overBy = driftBpm - expectedDriftUpper;
    
    if (isRecoveryPhase) {
      bottomLine = `Keep the next few days genuinely easy to let your body catch up.`;
    } else if (isTaperPhase) {
      bottomLine = `Make sure you're truly easing off—the goal is to arrive at race day fresh.`;
    } else if (overBy <= 5 && isBuildPhase) {
      bottomLine = `Monitor how you feel going into next week—if legs feel heavy, consider an extra easy day.`;
    } else if (overBy <= 5 && hasSignificantTerrain) {
      bottomLine = `The terrain was demanding—factor that into your assessment.`;
    } else if (paceExecution === 'slower') {
      bottomLine = `Higher drift despite conservative pacing suggests accumulated fatigue. Prioritize recovery before your next hard session.`;
    } else {
      bottomLine = `Consider your recovery status and ensure adequate fueling on long runs.`;
    }
  }
  
  if (bottomLine) {
    parts.push(bottomLine);
  }

  return parts.join(' ');
}

// =============================================================================
// CONFIDENCE
// =============================================================================

function determineConfidence(
  sampleCount: number,
  workoutType: WorkoutType,
  terrainAnalysis: TerrainAnalysis
): 'high' | 'medium' | 'low' {
  // High confidence: plenty of data, steady state, minimal terrain confounders
  if (sampleCount >= 1200 && // 20+ minutes of data
      workoutType === 'steady_state' &&
      (terrainAnalysis.terrain_contribution_bpm === null || 
       Math.abs(terrainAnalysis.terrain_contribution_bpm) < 3)) {
    return 'high';
  }

  // Low confidence: limited data or significant confounders
  if (sampleCount < 600 || // < 10 minutes
      (terrainAnalysis.terrain_contribution_bpm !== null && 
       Math.abs(terrainAnalysis.terrain_contribution_bpm) >= 8)) {
    return 'low';
  }

  return 'medium';
}
