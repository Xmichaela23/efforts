/**
 * Prompt building helpers for AI narrative generation
 * Breaks down the large prompt into manageable pieces
 */

/**
 * Build workout context from raw workout data
 */
export function buildWorkoutContext(
  workout: any,
  sensorData: any[],
  userUnits: 'metric' | 'imperial'
): any {
  // Calculate metrics from sensor data
  // Use workout-level fields for duration and distance
  // NOTE: Database stores distance in KM and moving_time in MINUTES (not meters/seconds!)
  // ✅ FIX: Use moving time (not elapsed time) for pace calculations
  // Priority: computed.overall.duration_s_moving (seconds) > moving_time (minutes) > duration (minutes, elapsed)
  const movingTimeSeconds = workout.computed?.overall?.duration_s_moving 
    || (workout.moving_time ? workout.moving_time * 60 : null)
    || (workout.duration ? workout.duration * 60 : 0); // Last resort (elapsed time)
  const totalDurationMinutes = movingTimeSeconds / 60;
  const totalDistanceKm = workout.distance || 0;
  
  // Convert distance based on user preference
  const distanceValue = userUnits === 'metric' ? totalDistanceKm : totalDistanceKm * 0.621371;
  const distanceUnit = userUnits === 'metric' ? 'km' : 'miles';
  const paceUnit = userUnits === 'metric' ? 'min/km' : 'min/mi';
  
  // Calculate average pace from sensor data (matching chart calculation)
  // IMPORTANT: Chart averages SPEED then converts to pace (not average of paces!)
  // This is mathematically different and produces slightly different results
  
  // Extract valid speed samples from raw sensor data
  const rawSensorData = workout.sensor_data?.samples || [];
  const validSpeedSamples = rawSensorData.filter(s => 
    s.speedMetersPerSecond && 
    Number.isFinite(s.speedMetersPerSecond) && 
    s.speedMetersPerSecond > 0.5 &&  // Filter out stationary/unrealistic speeds
    s.speedMetersPerSecond < 10  // < 36 km/h (reasonable running speed)
  );
  
  let avgPaceSeconds = 0;
  let paceCalculationMethod = 'unknown';
  
  // ✅ CRITICAL FIX: Always calculate from moving time and distance (never use computed_avg_pace_s_per_mi)
  // We have the data - moving_time_seconds and distance - so use it directly
  if (distanceValue > 0 && movingTimeSeconds > 0) {
    // Calculate pace from moving time (CORRECT - uses moving time, not elapsed)
    avgPaceSeconds = movingTimeSeconds / distanceValue;
    
    // Convert to metric if needed
    if (userUnits === 'metric' && avgPaceSeconds > 0) {
      avgPaceSeconds = avgPaceSeconds / 1.609344;  // Convert s/mi to s/km
    }
    paceCalculationMethod = 'from_moving_time';
  } else if (validSpeedSamples.length > 0) {
    // Fallback only if we don't have moving time/distance: Calculate from sensor speed samples
    const avgSpeedMps = validSpeedSamples.reduce((sum, s) => sum + s.speedMetersPerSecond, 0) / validSpeedSamples.length;
    
    // Convert average speed to pace
    if (userUnits === 'imperial') {
      // Convert m/s to mph, then to min/mi
      const speedMph = avgSpeedMps * 2.23694;
      const paceMinPerMile = 60 / speedMph;
      avgPaceSeconds = paceMinPerMile * 60;  // Convert to seconds
    } else {
      // Convert m/s to km/h, then to min/km
      const speedKph = avgSpeedMps * 3.6;
      const paceMinPerKm = 60 / speedKph;
      avgPaceSeconds = paceMinPerKm * 60;  // Convert to seconds
    }
    paceCalculationMethod = 'from_sensor_speed';
  } else {
    // Should never happen - we should always have moving time and distance
    console.error('❌ [PACE CALC ERROR] No moving time or distance available - cannot calculate pace');
    avgPaceSeconds = 0;
    paceCalculationMethod = 'error_no_data';
  }
  
  // Convert to minutes per unit (km or mile)
  const avgPace = avgPaceSeconds / 60;
  
  const heartRates = sensorData.filter(s => s.heart_rate && s.heart_rate > 0).map(s => s.heart_rate);
  const avgHeartRate = heartRates.length > 0 ? 
    Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : 0;
  const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : 0;
  
  console.log('🔍 [PACE CALCULATION] Pace source for AI:', {
    raw_sensor_samples: rawSensorData.length,
    valid_speed_samples: validSpeedSamples.length,
    moving_time_seconds: movingTimeSeconds,
    distance_miles: distanceValue,
    calculated_pace_seconds: avgPaceSeconds,
    final_pace_minutes: avgPace,
    user_units: userUnits,
    pace_unit: paceUnit,
    calculation_method: paceCalculationMethod,
  });
  
  // Format pace as MM:SS for AI (not decimal minutes)
  const paceMinutes = Math.floor(avgPace);
  const paceSeconds = Math.round((avgPace - paceMinutes) * 60);
  const paceFormatted = `${paceMinutes}:${String(paceSeconds).padStart(2, '0')}`;
  
  // Extract weather data if available
  const weatherData = workout.weather_data || null;
  const weatherInfo = weatherData ? {
    temperature: weatherData.temperature || null,
    condition: weatherData.condition || null,
    humidity: weatherData.humidity || null,
    windSpeed: weatherData.windSpeed || null,
    windDirection: weatherData.windDirection || null
  } : null;
  
  // Also check for temperature from Garmin data as fallback
  const temperature = weatherInfo?.temperature || workout.avg_temperature || null;
  
  // Extract terrain data - USE EXACT SAME SOURCE AS DETAILS SCREEN (single source of truth)
  // Details screen uses: workout.elevation_gain ?? workout.metrics.elevation_gain (NO FALLBACKS)
  let terrainData: any = null;
  const elevationGainM = workout.elevation_gain ?? workout.metrics?.elevation_gain;
  
  if (elevationGainM != null && Number.isFinite(elevationGainM)) {
    terrainData = {
      total_elevation_gain_m: Number(elevationGainM),
      total_elevation_gain_ft: Math.round(Number(elevationGainM) * 3.28084)
    };
  }
  
  // Calculate average grade if we have elevation and distance
  if (terrainData && distanceValue > 0) {
    const elevationGainM = terrainData.total_elevation_gain_m;
    const distanceM = distanceValue * (userUnits === 'metric' ? 1000 : 1609.34);
    const avgGrade = distanceM > 0 ? (elevationGainM / distanceM) * 100 : 0;
    terrainData.avg_grade_percent = Math.round(avgGrade * 10) / 10;
  }
  
  return {
    type: workout.type,
    duration_minutes: totalDurationMinutes,
    distance: distanceValue,
    distance_unit: distanceUnit,
    avg_pace: paceFormatted,  // Use MM:SS format, not decimal
    pace_unit: paceUnit,
    avg_heart_rate: avgHeartRate,
    max_heart_rate: maxHeartRate,
    temperature: temperature,
    weather: weatherInfo,
    terrain: terrainData,
    aerobic_training_effect: workout.garmin_data?.trainingEffect || null,
    anaerobic_training_effect: workout.garmin_data?.anaerobicTrainingEffect || null,
    performance_condition_start: workout.garmin_data?.performanceCondition || null,
    performance_condition_end: workout.garmin_data?.performanceConditionEnd || null,
    stamina_start: workout.garmin_data?.staminaStart || null,
    stamina_end: workout.garmin_data?.staminaEnd || null,
    exercise_load: workout.garmin_data?.activityTrainingLoad || null
  };
}

/**
 * Build adherence context from performance and granular analysis
 */
export function buildAdherenceContext(performance: any, granularAnalysis: any): any {
  return {
    execution_adherence_pct: Math.round(performance.execution_adherence),
    pace_adherence_pct: Math.round(performance.pace_adherence),
    duration_adherence_pct: Math.round(performance.duration_adherence),
    hr_drift_bpm: granularAnalysis.heart_rate_analysis?.hr_drift_bpm || 0,
    pace_variability_pct: granularAnalysis.pacing_variability?.coefficient_of_variation || 0
  };
}

/**
 * Extract plan context if workout is part of a training plan
 */
export async function extractPlanContext(
  plannedWorkout: any,
  workout: any,
  supabase: any
): Promise<any> {
  if (!plannedWorkout || !plannedWorkout.training_plan_id) {
    return null;
  }
  
  try {
    // Get week number from tags or default to 1
    const weekTag = plannedWorkout.tags?.find((t: string) => t.startsWith('week:'));
    const weekNumber = weekTag ? parseInt(weekTag.split(':')[1].split('_of_')[0]) : 1;
    
    // Fetch training plan with authorization check
    // NOTE: planned_workouts.training_plan_id references the 'plans' table, not 'training_plans'
    let trainingPlan = null;
    const { data: planData, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', plannedWorkout.training_plan_id)
      .eq('user_id', workout.user_id) // Authorization: verify plan belongs to user
      .single();
    
    if (!planError && planData) {
      trainingPlan = planData;
    } else if (planError) {
      // Fallback: try 'training_plans' table (legacy)
      console.log('⚠️ Plan not found in plans table, trying training_plans...');
      const { data: legacyPlanData } = await supabase
        .from('training_plans')
        .select('*')
        .eq('id', plannedWorkout.training_plan_id)
        .eq('user_id', workout.user_id)
        .single();
      
      if (legacyPlanData) {
        trainingPlan = legacyPlanData;
      }
    }
    
    if (!trainingPlan) {
      return null;
    }
    
    // Double-check user ownership (defense in depth)
    if (trainingPlan.user_id !== workout.user_id) {
      console.warn('⚠️ Training plan does not belong to user - skipping plan context');
      return null;
    }
    
    // Parse phase from tags
    const phaseTag = plannedWorkout.tags?.find((t: string) => t.startsWith('phase:'));
    const phase = phaseTag ? phaseTag.split(':')[1].replace(/_/g, ' ') : null;
    
    // Get weekly summary
    const weeklySummary = trainingPlan.config?.weekly_summaries?.[weekNumber] || 
                          trainingPlan.weekly_summaries?.[weekNumber] || null;
    
    // Parse progression history from structured tags or description
    let progressionHistory: string[] | null = null;
    const tags = plannedWorkout.tags || [];
    
    // Try structured tags first (most reliable)
    const intensityProgressionTag = tags.find((t: string) => t.startsWith('intensity_progression:'));
    const volumeProgressionTag = tags.find((t: string) => t.startsWith('volume_progression:'));
    
    if (intensityProgressionTag) {
      // Format: "5x800_5x800_6x800_none_6x800_none_4x1mi_none"
      const progression = intensityProgressionTag.split(':')[1];
      progressionHistory = progression.split('_').filter(p => p !== 'none').map(p => p.replace(/x/g, '×'));
    } else if (volumeProgressionTag) {
      // Format: "90_100_110_80_120_130_140_150" -> ["90min", "100min", ...]
      const progression = volumeProgressionTag.split(':')[1];
      progressionHistory = progression.split('_').map(p => `${p}min`);
    } else {
      // Fallback to description parsing (e.g., "5×800m → 6×800m → 4×1mi")
      const progressionMatch = plannedWorkout.description?.match(/(\d+×\d+[a-z]+.*?→.*?\d+×\d+[a-z]+)/i);
      if (progressionMatch) {
        progressionHistory = progressionMatch[0].split('→').map(p => p.trim());
      }
    }
    
    const planContext = {
      plan_name: trainingPlan.name || 'Training Plan',
      week: weekNumber,
      total_weeks: trainingPlan.duration_weeks || 0,
      phase: phase || 'unknown',
      weekly_summary: weeklySummary,
      progression_history: progressionHistory,
      intensity_progression: intensityProgressionTag ? intensityProgressionTag.split(':')[1] : null,
      volume_progression: volumeProgressionTag ? volumeProgressionTag.split(':')[1] : null,
      session_description: plannedWorkout.description || '',
      session_tags: plannedWorkout.tags || [],
      plan_description: trainingPlan.description || ''
    };
    
    console.log('📋 PLAN CONTEXT EXTRACTED:', planContext);
    return planContext;
  } catch (error) {
    console.log('⚠️ Failed to extract plan context:', error);
    return null;
  }
}

/**
 * Extract planned pace information from planned workout
 */
export function extractPlannedPaceInfo(
  plannedWorkout: any,
  userUnits: 'metric' | 'imperial'
): any {
  if (!plannedWorkout?.computed?.steps) {
    return null;
  }
  
  // Find all work segments with pace ranges
  const workSteps = plannedWorkout.computed.steps.filter((step: any) => 
    (step.kind === 'work' || step.role === 'work') && step.pace_range
  );
  
  if (workSteps.length === 0) {
    return null;
  }
  
  // Extract unique pace ranges (in case of repeated intervals)
  const paceRanges = workSteps.map((step: any) => ({
    lower: step.pace_range.lower,
    upper: step.pace_range.upper
  }));
  
  // Use the first work segment's pace range (most workouts have consistent pace targets)
  const firstRange = paceRanges[0];
  const isRangeWorkout = firstRange.lower !== firstRange.upper;
  
  // Helper to format seconds to MM:SS
  const formatPace = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };
  
  const paceUnit = userUnits === 'metric' ? 'min/km' : 'min/mi';
  
  if (isRangeWorkout) {
    // Range workout (e.g., easy run: 10:17-10:43/mi)
    return {
      type: 'range',
      range: `${formatPace(firstRange.lower)}-${formatPace(firstRange.upper)} ${paceUnit}`,
      lower: firstRange.lower,
      upper: firstRange.upper,
      workoutType: 'easy/aerobic run (variability expected)'
    };
  } else {
    // Single target workout (e.g., tempo: 10:30/mi)
    return {
      type: 'single',
      target: `${formatPace(firstRange.lower)} ${paceUnit}`,
      targetSeconds: firstRange.lower,
      workoutType: 'tempo/interval run (consistency critical)'
    };
  }
}

/**
 * Build the complete prompt for OpenAI
 */
export function buildPrompt(
  workoutContext: any,
  adherenceContext: any,
  planContext: any,
  plannedPaceInfo: any,
  hasIntervals: boolean,
  detailedAnalysis: any,
  granularAnalysis: any,
  plannedWorkout: any,
  workout: any
): string {
  const isPlannedWorkout = !!plannedWorkout;
  const paceUnit = workoutContext.pace_unit;
  
  let prompt = `You are analyzing a running workout. Generate 3-4 concise, data-driven observations based on the metrics below.

CRITICAL RULES:
- Write like "a chart in words" - factual observations only
- NO motivational language ("great job", "keep it up")
- NO subjective judgments ("slow", "bad", "should have")
- NO generic advice ("run more", "push harder")
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and time references
- Describe patterns visible in the data
- Each observation should provide UNIQUE information - avoid repeating the same insight
- Combine related metrics into single observations (e.g., HR average + drift + peak in one paragraph)
${planContext ? `
- CRITICAL: Reference plan context when available - explain WHY workout was programmed, whether performance matches plan expectations, and what's coming next week
- Contextualize adherence relative to phase goals (e.g., Foundation Build vs Peak Strength)
` : ''}

Workout Profile:
- Type: ${workoutContext.type}
- Duration: ${workoutContext.duration_minutes} minutes
- Distance: ${workoutContext.distance.toFixed(2)} ${workoutContext.distance_unit}
${hasIntervals ? `- Overall Avg Pace: ${workoutContext.avg_pace} ${workoutContext.pace_unit} (includes warmup/recovery/cooldown - DO NOT compare to work interval targets)` : `- Avg Pace: ${workoutContext.avg_pace} ${workoutContext.pace_unit}`}
- Avg HR: ${workoutContext.avg_heart_rate} bpm (Max: ${workoutContext.max_heart_rate} bpm)
${workoutContext.aerobic_training_effect ? `- Aerobic TE: ${workoutContext.aerobic_training_effect} (Anaerobic: ${workoutContext.anaerobic_training_effect})` : ''}
${workoutContext.performance_condition_start !== null ? `- Performance Condition: ${workoutContext.performance_condition_start} → ${workoutContext.performance_condition_end} (${workoutContext.performance_condition_end - workoutContext.performance_condition_start} point change)` : ''}
${workoutContext.stamina_start !== null ? `- Stamina: ${workoutContext.stamina_start}% → ${workoutContext.stamina_end}% (${workoutContext.stamina_start - workoutContext.stamina_end}% depletion)` : ''}
${workoutContext.exercise_load ? `- Exercise Load: ${workoutContext.exercise_load}` : ''}
${workoutContext.terrain ? `
TERRAIN & ELEVATION:
- Total Elevation Gain: ${workoutContext.terrain.total_elevation_gain_ft}ft (${workoutContext.terrain.total_elevation_gain_m.toFixed(0)}m)
${workoutContext.terrain.avg_grade_percent ? `- Average Grade: ${workoutContext.terrain.avg_grade_percent}%` : ''}
` : ''}
${workoutContext.weather || workoutContext.temperature ? `
WEATHER & CONDITIONS:
${workoutContext.temperature ? `- Temperature: ${workoutContext.temperature}°F` : ''}
${workoutContext.weather?.condition ? `- Condition: ${workoutContext.weather.condition}` : ''}
${workoutContext.weather?.humidity ? `- Humidity: ${workoutContext.weather.humidity}%` : ''}
${workoutContext.weather?.windSpeed ? `- Wind Speed: ${workoutContext.weather.windSpeed} mph${workoutContext.weather.windDirection ? ` (${workoutContext.weather.windDirection})` : ''}` : ''}
` : ''}
`;

  if (isPlannedWorkout) {
    prompt += buildPlannedWorkoutPromptSection(
      adherenceContext,
      plannedPaceInfo,
      planContext,
      hasIntervals,
      detailedAnalysis,
      plannedWorkout,
      workout,
      paceUnit,
      workoutContext
    );
  } else {
    prompt += buildFreeformRunPromptSection(adherenceContext, workoutContext, granularAnalysis);
  }

  prompt += `
Return ONLY a JSON array of strings, no other text:
["observation 1", "observation 2", ...]`;

  return prompt;
}

/**
 * Build prompt section for planned workouts
 */
function buildPlannedWorkoutPromptSection(
  adherenceContext: any,
  plannedPaceInfo: any,
  planContext: any,
  hasIntervals: boolean,
  detailedAnalysis: any,
  plannedWorkout: any,
  workout: any,
  paceUnit: string,
  workoutContext: any
): string {
  let section = `
Adherence Metrics (vs. Planned Workout):
- Execution: ${adherenceContext.execution_adherence_pct}%
- Pace: ${adherenceContext.pace_adherence_pct}%
- Duration: ${adherenceContext.duration_adherence_pct}%
- HR Drift: ${adherenceContext.hr_drift_bpm} bpm
- Pace Variability: ${adherenceContext.pace_variability_pct}%
${plannedPaceInfo ? `
Planned Workout Details:
- Target Pace: ${plannedPaceInfo.type === 'range' ? plannedPaceInfo.range : plannedPaceInfo.target}
- Workout Type: ${plannedPaceInfo.workoutType}
` : ''}
${planContext ? buildPlanContextSection(planContext) : ''}

CRITICAL ANALYSIS RULES:
${hasIntervals ? buildIntervalWorkoutRules(plannedWorkout, detailedAnalysis, paceUnit, workoutContext) : buildContinuousRunRules(plannedPaceInfo, detailedAnalysis)}

Generate 3-4 observations comparing actual vs. planned performance:
${hasIntervals ? buildIntervalObservations(detailedAnalysis, plannedWorkout, adherenceContext) : buildContinuousRunObservations(plannedPaceInfo, detailedAnalysis, adherenceContext, paceUnit)}
${buildHRObservation(adherenceContext)}
${buildDurationObservation(plannedWorkout, adherenceContext)}
${buildExecutionObservation(plannedWorkout, workout, adherenceContext)}
${buildRequiredObservations(plannedWorkout, adherenceContext, planContext)}
`;

  return section;
}

/**
 * Build prompt section for freeform runs
 */
function buildFreeformRunPromptSection(
  adherenceContext: any,
  workoutContext: any,
  granularAnalysis: any
): string {
  const hrAnalysis = granularAnalysis?.heart_rate_analysis;
  const hrDrift = hrAnalysis?.hr_drift_bpm || 0;
  const earlyHR = hrAnalysis?.early_avg_hr;
  const lateHR = hrAnalysis?.late_avg_hr;
  const interpretation = hrAnalysis?.hr_drift_interpretation;
  
  let hrObservation = '';
  if (earlyHR && lateHR) {
    hrObservation = `"Heart rate averaged X bpm with ${hrDrift > 0 ? '+' : ''}${hrDrift} bpm drift (${earlyHR} bpm early → ${lateHR} bpm late) over Z minutes, ${interpretation ? interpretation.toLowerCase() : 'indicating normal cardiovascular response'}. Peaked at A bpm."`;
  } else {
    const driftContext = hrDrift === 0 ? 'Indicates remarkably stable cardiovascular response' : 
                        hrDrift < 5 ? 'Indicates excellent pacing and cardiovascular stability' : 
                        hrDrift < 10 ? 'Indicates normal cardiovascular response for sustained effort' : 
                        hrDrift < 20 ? 'Indicates moderate cardiovascular drift, possibly due to environmental factors or accumulated fatigue' : 
                        'Indicates significant cardiovascular drift, suggesting overpacing or environmental stress';
    hrObservation = `"Heart rate averaged X bpm with ${hrDrift > 0 ? '+' : ''}${hrDrift} bpm drift over Z minutes, peaking at A bpm. ${driftContext}."`;
  }
  
  return `
Pattern Analysis (Freeform Run):
- HR Drift: ${adherenceContext.hr_drift_bpm} bpm
- Pace Variability: ${adherenceContext.pace_variability_pct.toFixed(1)}%

Generate 3-4 observations describing patterns and stimulus:
"Maintained pace averaging X:XX ${workoutContext.pace_unit} throughout the Y ${workoutContext.distance_unit} effort. Pace varied by Z%, with most segments between A:AA-B:BB ${workoutContext.pace_unit}."
${hrObservation}
"Performance Condition declined from +X to -Y over Z minutes, reflecting accumulated fatigue from the sustained effort."
`;
}

/**
 * Build plan context section
 */
function buildPlanContextSection(planContext: any): string {
  return `

═══════════════════════════════════════════════════════════════
📋 PLAN CONTEXT
═══════════════════════════════════════════════════════════════

Plan: ${planContext.plan_name}
Week: ${planContext.week} of ${planContext.total_weeks}
Phase: ${planContext.phase}
${planContext.weekly_summary?.focus ? `
WEEK ${planContext.week} FOCUS:
"${planContext.weekly_summary.focus}"
` : ''}
${planContext.weekly_summary?.key_workouts && planContext.weekly_summary.key_workouts.length > 0 ? `
KEY WORKOUTS THIS WEEK:${planContext.weekly_summary.key_workouts.map((w: string) => `\n• ${w}`).join('')}
` : ''}
${planContext.weekly_summary?.notes ? `
WEEK NOTES:
${planContext.weekly_summary.notes}
` : ''}
${planContext.progression_history ? `
PROGRESSION HISTORY:
${planContext.progression_history.join(' → ')}
` : ''}
${planContext.session_description && planContext.session_description.length > 50 ? `
SESSION DESCRIPTION:
${planContext.session_description}
` : ''}

CRITICAL: Reference plan context in your analysis:
- Explain WHY this workout was programmed (phase, week focus)
- Compare performance to plan expectations
- Reference what's coming next week if mentioned in plan
- Contextualize adherence relative to phase goals
`;
}

/**
 * Build rules for interval workouts
 */
function buildIntervalWorkoutRules(plannedWorkout: any, detailedAnalysis: any, paceUnit: string, workoutContext: any): string {
  const steps = plannedWorkout?.computed?.steps || [];
  const plannedWorkSteps = steps.filter((step: any) => 
    (step.kind === 'work' || step.role === 'work' || step.step_type === 'interval') && 
    (step.pace_range || step.target_pace)
  );
  
  const formatPace = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };
  
  let plannedWorkoutDesc = '';
  if (plannedWorkSteps.length > 0) {
    const firstWorkStep = plannedWorkSteps[0];
    const plannedPace = firstWorkStep.pace_range 
      ? `${formatPace(firstWorkStep.pace_range.lower)}-${formatPace(firstWorkStep.pace_range.upper)} ${paceUnit}`
      : firstWorkStep.target_pace 
        ? `${formatPace(firstWorkStep.target_pace)} ${paceUnit}`
        : 'target pace';
    const plannedDuration = firstWorkStep.duration_s ? `${Math.round(firstWorkStep.duration_s / 60)} min` : '';
    const plannedDistance = firstWorkStep.distance_m ? `${(firstWorkStep.distance_m / 1609.34).toFixed(2)} mi` : '';
    
    plannedWorkoutDesc = `Planned: ${plannedWorkSteps.length} work intervals`;
    if (plannedDistance) plannedWorkoutDesc += ` of ${plannedDistance} each`;
    if (plannedDuration) plannedWorkoutDesc += ` (${plannedDuration} each)`;
    plannedWorkoutDesc += ` at ${plannedPace}`;
  }
  
  const intervalBreakdown = detailedAnalysis?.interval_breakdown;
  let intervalSection = '';
  if (intervalBreakdown && intervalBreakdown.available && intervalBreakdown.intervals && intervalBreakdown.intervals.length > 0) {
    const intervals = intervalBreakdown.intervals;
    const workIntervalsOnly = intervals.filter((i: any) => i.interval_type === 'work');
    const completedWorkIntervals = workIntervalsOnly.filter((i: any) => i.actual_duration_s > 0 || i.actual_pace_min_per_mi > 0);
    
    const paceAdherences = workIntervalsOnly.map((i: any) => i.pace_adherence_percent || 0).filter((p: number) => p > 0);
    const avgPaceAdherence = paceAdherences.length > 0 
      ? Math.round(paceAdherences.reduce((sum: number, p: number) => sum + p, 0) / paceAdherences.length)
      : 0;
    
    // Build work interval details
    const workIntervalDetails = workIntervalsOnly.map((i: any, idx: number) => {
      const actualPace = i.actual_pace_min_per_mi ? formatPace(i.actual_pace_min_per_mi * 60) : 'N/A';
      const targetPace = i.planned_pace_range 
        ? `${formatPace(i.planned_pace_range.lower)}-${formatPace(i.planned_pace_range.upper)}`
        : i.planned_pace ? formatPace(i.planned_pace * 60) : 'N/A';
      const adherence = i.pace_adherence_percent || 0;
      return `  Interval ${idx + 1}: ${actualPace} ${paceUnit} (target: ${targetPace} ${paceUnit}, ${adherence}% adherence)`;
    }).join('\n');
    
    intervalSection = `
PLANNED WORKOUT STRUCTURE:
${plannedWorkoutDesc || 'Interval workout with work and recovery segments'}

WORK INTERVAL PERFORMANCE (ANALYZE THESE, NOT OVERALL PACE):
- Completed ${completedWorkIntervals.length} of ${plannedWorkSteps.length} planned work intervals
- Average pace adherence across work intervals: ${avgPaceAdherence}%
- Pace adherence range: ${paceAdherences.length > 0 ? `${Math.min(...paceAdherences)}% to ${Math.max(...paceAdherences)}%` : 'N/A'}

WORK INTERVAL DETAILS:
${workIntervalDetails || 'No work interval data available'}

CRITICAL INSTRUCTION: 
- Focus EXCLUSIVELY on work interval performance shown above
- Compare each work interval's actual pace to its target pace range
- DO NOT compare overall average pace (${workoutContext.avg_pace} ${paceUnit}) to work interval targets - this is mathematically incorrect
- DO NOT mention overall average pace in relation to work intervals
- Report interval completion and pace adherence as shown above

`;
  } else if (plannedWorkoutDesc) {
    intervalSection = `
PLANNED WORKOUT STRUCTURE:
${plannedWorkoutDesc}
`;
  }
  
  return `
CRITICAL: This is an INTERVAL workout with work intervals and recovery periods.

ANALYSIS RULES:
- Focus EXCLUSIVELY on work interval performance (pace adherence, consistency across intervals)
- DO NOT compare overall average pace (${workoutContext.avg_pace} ${paceUnit}) to work interval pace targets - overall pace includes warmup/recovery/cooldown and will ALWAYS be slower than work interval targets
- DO NOT mention overall average pace in relation to work interval targets - this is mathematically incorrect
- Report interval completion (X of Y intervals completed)
- Report pace adherence range across work intervals
- Note any fading pattern (pace getting slower) or consistency across intervals
- For each work interval, compare its actual pace to its specific target pace range
- Do NOT analyze mile-by-mile breakdown for interval workouts
${intervalSection}`;
}

/**
 * Build rules for continuous runs
 */
function buildContinuousRunRules(plannedPaceInfo: any, detailedAnalysis: any): string {
  const mileByMile = detailedAnalysis?.mile_by_mile_terrain;
  let mileSection = '';
  
  if (mileByMile && mileByMile.available && mileByMile.splits && mileByMile.splits.length > 0) {
    const milesInRange = mileByMile.miles_in_range || 0;
    const totalMiles = mileByMile.total_miles || mileByMile.splits.length;
    const inRangePct = totalMiles > 0 ? Math.round((milesInRange / totalMiles) * 100) : 0;
    
    const sectionText = mileByMile.section || '';
    const withinRangeMatch = sectionText.match(/Within range: Miles? ([^\n]+)/i);
    const fasterMatch = sectionText.match(/Faster than range: Miles? ([^\n]+)/i);
    const slowerMatch = sectionText.match(/Slower than range: Miles? ([^\n]+)/i);
    
    const withinRangeMiles = withinRangeMatch ? withinRangeMatch[1].trim() : 'None';
    const fasterMiles = fasterMatch ? fasterMatch[1].trim() : 'None';
    const slowerMiles = slowerMatch ? slowerMatch[1].trim() : 'None';
    
    mileSection = `
MILE-BY-MILE CATEGORIZATION (PRE-CALCULATED - USE EXACTLY AS SHOWN):
- ${milesInRange} of ${totalMiles} miles within range (${inRangePct}%)
- Within range: ${withinRangeMiles}
- Faster than range: ${fasterMiles}
- Slower than range: ${slowerMiles}

CRITICAL INSTRUCTION: When summarizing the mile-by-mile breakdown, use EXACTLY these pre-calculated categorizations. Do NOT recalculate which miles are in/out of range. Simply report these findings as-is. 

When you write "Mile-by-mile breakdown:", you MUST use the exact mile numbers shown above:
- If "Within range: Miles 4" is shown, say "Mile 4 was within range"
- If "Faster than range: Miles 1, 2, 3, 6" is shown, say "Miles 1, 2, 3, 6 were faster than range start"
- If "Slower than range: Miles 5, 7, 8" is shown, say "Miles 5, 7, 8 were slower than range end"

Do NOT make up different mile numbers. Do NOT recalculate. Use the numbers provided above.

`;
  }
  
  if (plannedPaceInfo?.type === 'range') {
    return `
- This is a RANGE workout (${plannedPaceInfo.workoutType})
- Compare each mile/segment to the RANGE (${plannedPaceInfo.range})
- Miles within range are acceptable (not "too fast" or "too slow")
- Miles faster than range start are "faster than range start" (not "faster than target")
- Miles slower than range end are "slower than range end" (not "slower than target")
- Average pace within range is GOOD execution (not a miss)
- Variability is NORMAL for range workouts (not a problem)
${mileSection}`;
  } else if (plannedPaceInfo?.type === 'single') {
    return `
- This is a SINGLE-TARGET workout (${plannedPaceInfo.workoutType})
- Compare each mile/segment to the EXACT TARGET (${plannedPaceInfo.target})
- Consistency is CRITICAL - variability indicates pacing issues
- Miles faster than target are "too fast"
- Miles slower than target are "too slow"
- Average pace should match target closely
${mileSection}`;
  }
  
  return `
- Compare actual performance to planned targets
${mileSection}`;
}

/**
 * Build observation templates for interval workouts
 */
function buildIntervalObservations(detailedAnalysis: any, plannedWorkout: any, adherenceContext: any): string {
  const intervalBreakdown = detailedAnalysis?.interval_breakdown;
  const workIntervals = intervalBreakdown?.intervals || [];
  const completedIntervals = workIntervals.filter((i: any) => i.actual_duration_s > 0 || i.actual_pace_min_per_mi > 0);
  
  const steps = plannedWorkout?.computed?.steps || [];
  const plannedWorkSteps = steps.filter((step: any) => 
    (step.kind === 'work' || step.role === 'work' || step.step_type === 'interval') && 
    (step.pace_range || step.target_pace)
  );
  const totalPlannedIntervals = plannedWorkSteps.length;
  
  const paceAdherences = workIntervals.map((i: any) => i.pace_adherence_percent || 0).filter((p: number) => p > 0);
  const avgPaceAdherence = paceAdherences.length > 0 
    ? Math.round(paceAdherences.reduce((sum: number, p: number) => sum + p, 0) / paceAdherences.length)
    : 0;
  const minPaceAdherence = paceAdherences.length > 0 ? Math.min(...paceAdherences) : 0;
  const maxPaceAdherence = paceAdherences.length > 0 ? Math.max(...paceAdherences) : 0;
  
  const paces = workIntervals.map((i: any) => i.actual_pace_min_per_mi).filter((p: number) => p > 0);
  const isFading = paces.length >= 3 && paces[0] < paces[paces.length - 1];
  const isConsistent = paces.length > 0 && (Math.max(...paces) - Math.min(...paces)) < 0.1;
  
  let patternNote = '';
  if (isFading) {
    patternNote = 'Pace faded across intervals, with later intervals slower than early ones.';
  } else if (isConsistent) {
    patternNote = 'Pace remained consistent across all intervals.';
  } else {
    patternNote = 'Pace varied across intervals.';
  }
  
  if (workIntervals.length === 0) {
    return `"Completed ${completedIntervals.length} of ${totalPlannedIntervals} prescribed work intervals."`;
  }
  
  return `"Completed ${completedIntervals.length} of ${totalPlannedIntervals} prescribed work intervals. Work interval pace adherence ranged from ${minPaceAdherence}% to ${maxPaceAdherence}% (average ${avgPaceAdherence}%). ${patternNote}"`;
}

/**
 * Build observation templates for continuous runs
 */
function buildContinuousRunObservations(plannedPaceInfo: any, detailedAnalysis: any, adherenceContext: any, paceUnit: string): string {
  if (plannedPaceInfo?.type === 'range' && plannedPaceInfo.range) {
    const mileByMile = detailedAnalysis?.mile_by_mile_terrain;
    const milesInRange = mileByMile?.miles_in_range || 0;
    const totalMiles = mileByMile?.total_miles || mileByMile?.splits?.length || 0;
    
    return `"Maintained pace averaging X:XX ${paceUnit}, within the prescribed range of ${plannedPaceInfo.range}.

Pace control varied significantly mile-to-mile, with only ${milesInRange} of ${totalMiles} miles falling within the target range, though average pace remained excellent."
"Mile-by-mile breakdown: [CRITICAL: Use the PRE-CALCULATED mile categorization data from the MILE-BY-MILE CATEGORIZATION section above. Report EXACTLY which miles were within range, faster than range start, or slower than range end as shown in that section. Do NOT recalculate - copy the mile numbers directly from the pre-calculated data.]"`;
  } else if (plannedPaceInfo?.type === 'single' && plannedPaceInfo.target && plannedPaceInfo.targetSeconds) {
    return `"Maintained pace averaging X:XX ${paceUnit}, matching the prescribed target of ${plannedPaceInfo.target}. Pace varied by A%, indicating [consistent/inconsistent] pacing."`;
  }
  
  return `"Maintained pace averaging X:XX ${paceUnit}, achieving Y% adherence to prescribed pace target. Pace varied by A%, with most intervals between B:BB-C:CC ${paceUnit}."`;
}

/**
 * Build HR observation template
 */
function buildHRObservation(adherenceContext: any): string {
  // This is a template - actual values filled in by AI
  return `"Heart rate averaged X bpm with ${adherenceContext.hr_drift_bpm > 0 ? '+' : ''}${adherenceContext.hr_drift_bpm} bpm drift, peaking at Z bpm."`;
}

/**
 * Build duration observation template
 */
function buildDurationObservation(plannedWorkout: any, adherenceContext: any): string {
  if (!plannedWorkout) return '';
  
  let plannedDurationS = 0;
  if (plannedWorkout?.computed?.total_duration_seconds) {
    plannedDurationS = plannedWorkout.computed.total_duration_seconds;
  } else if (plannedWorkout?.computed?.steps?.length > 0) {
    plannedDurationS = plannedWorkout.computed.steps.reduce((sum: number, step: any) => {
      return sum + (step.duration_s || step.duration || 0);
    }, 0);
  }
  const plannedDurationMin = plannedDurationS > 0 ? Math.round(plannedDurationS / 60) : 0;
  
  if (plannedDurationMin > 0) {
    return `"Duration: X of ${plannedDurationMin} minutes completed (${adherenceContext.duration_adherence_pct}% adherence)."`;
  }
  return '';
}

/**
 * Build execution observation template
 */
function buildExecutionObservation(plannedWorkout: any, workout: any, adherenceContext: any): string {
  if (!plannedWorkout) return '';
  
  // This is complex - simplified for now, can be expanded
  return `"Overall execution: ${adherenceContext.execution_adherence_pct}% (${adherenceContext.pace_adherence_pct}% pace adherence, ${adherenceContext.duration_adherence_pct}% duration adherence)."`;
}

/**
 * Build required observations section
 */
function buildRequiredObservations(plannedWorkout: any, adherenceContext: any, planContext: any): string {
  if (!plannedWorkout) return '';
  
  let plannedDurationS = 0;
  if (plannedWorkout?.computed?.total_duration_seconds) {
    plannedDurationS = plannedWorkout.computed.total_duration_seconds;
  } else if (plannedWorkout?.computed?.steps?.length > 0) {
    plannedDurationS = plannedWorkout.computed.steps.reduce((sum: number, step: any) => {
      return sum + (step.duration_s || step.duration || 0);
    }, 0);
  }
  const plannedDurationMin = plannedDurationS > 0 ? Math.round(plannedDurationS / 60) : 0;
  
  let required = '';
  if (plannedDurationMin > 0) {
    required += `- You MUST include this exact line: "Duration: X of ${plannedDurationMin} minutes completed (${adherenceContext.duration_adherence_pct}% adherence)."
- You MUST include this exact line: "Overall execution: ${adherenceContext.execution_adherence_pct}% (${adherenceContext.pace_adherence_pct}% pace adherence, ${adherenceContext.duration_adherence_pct}% duration adherence)."`;
  }
  
  if (planContext) {
    required += `
- You MUST include plan context: Reference the plan phase (${planContext.phase}), week focus (${planContext.weekly_summary?.focus || 'N/A'}), and explain WHY this workout was programmed and whether performance matches plan expectations.`;
  }
  
  return required ? `\n\nREQUIRED OBSERVATIONS (MUST INCLUDE):\n${required}` : '';
}

/**
 * Call OpenAI API with the prompt
 */
export async function callOpenAI(openaiKey: string, prompt: string): Promise<string[]> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a data analyst converting workout metrics into factual observations. Never use motivational language or subjective judgments.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();
    
    console.log('🤖 [DEBUG] Raw AI response:', content);
    
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse JSON array from response
    const insights = JSON.parse(content);
    
    if (!Array.isArray(insights)) {
      throw new Error('AI response was not an array');
    }

    return insights;

  } catch (error) {
    console.error('❌ AI narrative generation failed:', error);
    throw error;
  }
}

