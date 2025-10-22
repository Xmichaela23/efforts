import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================================
// ANALYZE-RUNNING-WORKOUT - RUNNING ANALYSIS EDGE FUNCTION
// =============================================================================
// 
// FUNCTION NAME: analyze-running-workout
// PURPOSE: Granular adherence analysis for running workouts
// 
// WHAT IT DOES:
// - Analyzes running workouts with prescribed pace/power ranges
// - Calculates time-in-prescribed-range (not just averages)
// - Provides interval-by-interval execution breakdown
// - Detects patterns: too fast, fading, inconsistent pacing
// - Generates honest execution grades (A/B/C/D/F)
// - Identifies specific issues and strengths
// 
// KEY FEATURES:
// - Uses prescribed ranges from planned_workouts.intervals
// - Time-based analysis (how much TIME spent in range)
// - Context-aware grading (stricter for intervals, lenient for warmup)
// - GPS spike and outlier detection
// - Gap handling and interpolation for sensor data
// - Fuzzy interval boundary matching
// 
// DATA SOURCES:
// - workouts.computed (from compute-workout-summary)
// - planned_workouts.intervals (prescribed pace/power ranges)
// 
// ANALYSIS OUTPUT:
// - adherence_percentage: % of time spent in prescribed ranges
// - interval_breakdown: per-interval execution quality
// - execution_grade: honest A-F grade
// - primary_issues: specific problems identified
// - strengths: positive execution patterns
// 
// INPUT: { workout_id: string }
// OUTPUT: { success: boolean, analysis: PrescribedRangeAdherence }
// =============================================================================

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { workout_id } = await req.json();
    
    if (!workout_id) {
      return new Response(JSON.stringify({
        error: 'workout_id is required'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    console.log(`🏃‍♂️ Analyzing running workout: ${workout_id}`);
    console.log('🆕 NEW VERSION: Checking time_series_data and garmin_data for pace data');

    // Get workout data
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select(`
        id,
        type,
        sensor_data,
        computed,
        time_series_data,
        garmin_data,
        planned_id,
        user_id
      `)
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message}`);
    }

    console.log('🔍 Available data sources:', {
      time_series_data: !!workout.time_series_data,
      garmin_data: !!workout.garmin_data,
      computed: !!workout.computed,
      sensor_data: !!workout.sensor_data
    });

    if (workout.type !== 'run' && workout.type !== 'running') {
      throw new Error(`Workout type ${workout.type} is not supported for running analysis`);
    }

    if (!workout.sensor_data && !workout.computed) {
      throw new Error('No sensor data or computed data available. Workout may not have been processed yet.');
    }

    // Get planned workout data with token parsing support
    let plannedWorkout = null;
    let intervals = [];
    
    if (workout.planned_id) {
      const { data: planned, error: plannedError } = await supabase
        .from('planned_workouts')
        .select('id, intervals, steps_preset')
        .eq('id', workout.planned_id)
        .single();

      if (plannedError) {
        console.warn('⚠️ Could not load planned workout:', plannedError.message);
      } else {
        plannedWorkout = planned;
        
        // Get user baselines for token parsing
        let baselines = {};
        try {
          const { data: userBaselines } = await supabase
            .from('user_baselines')
            .select('performance_numbers')
            .eq('user_id', workout.user_id)
            .single();
          baselines = userBaselines?.performance_numbers || {};
        } catch (error) {
          console.log('⚠️ No user baselines found, using defaults');
          // Use default baselines for analysis
          baselines = {
            fiveK_pace: 450, // 7:30/mi
            easyPace: 540,   // 9:00/mi
            tenK_pace: 480,  // 8:00/mi
            marathon_pace: 600 // 10:00/mi
          };
        }

        // Parse tokens if available, otherwise use intervals
        if (plannedWorkout.steps_preset && plannedWorkout.steps_preset.length > 0) {
          console.log('🏃 Parsing steps_preset tokens...');
          try {
            // Import the token parser
            const { parseRunningTokens } = await import('../../lib/analysis/running/token-parser.ts');
            const parsedStructure = parseRunningTokens(plannedWorkout.steps_preset, baselines);
            
            // Convert parsed segments to intervals format
            intervals = parsedStructure.segments.map((segment: any) => ({
              type: segment.type,
              duration_s: segment.duration,
              distance_m: segment.distance,
              pace_range: segment.target_pace ? {
                lower: segment.target_pace.lower,
                upper: segment.target_pace.upper
              } : null
            }));
            
            console.log(`✅ Parsed ${intervals.length} intervals from tokens`);
          } catch (error) {
            console.warn('⚠️ Token parsing failed, using intervals:', error);
            intervals = plannedWorkout.intervals || [];
          }
        } else {
          intervals = plannedWorkout.intervals || [];
        }
      }
    }

    if (!intervals || intervals.length === 0) {
      // Return a meaningful response instead of crashing
      return new Response(JSON.stringify({
        success: true,
        analysis: {
          adherence_percentage: 0,
          execution_grade: 'N/A',
          primary_issues: ['No user baselines found - cannot analyze workout without pace references'],
          strengths: [],
          workout_type: 'long_run',
          time_in_range_s: 0,
          time_outside_range_s: 0
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Extract sensor data - try different data sources
    let sensorData = [];
    
    // Try time_series_data first (most likely to have pace data)
    if (workout.time_series_data) {
      console.log('🔍 Trying time_series_data first...');
      sensorData = extractSensorData(workout.time_series_data);
      console.log(`📊 time_series_data yielded ${sensorData.length} samples`);
    }
    
    // Try garmin_data if time_series_data doesn't work
    if (sensorData.length === 0 && workout.garmin_data) {
      console.log('🔍 Trying garmin_data...');
      sensorData = extractSensorData(workout.garmin_data);
      console.log(`📊 garmin_data yielded ${sensorData.length} samples`);
    }
    
    // Try computed data
    if (sensorData.length === 0 && workout.computed) {
      console.log('🔍 Trying computed data...');
      sensorData = extractSensorData(workout.computed);
      console.log(`📊 computed data yielded ${sensorData.length} samples`);
    }
    
    // Try sensor_data as last resort
    if (sensorData.length === 0 && workout.sensor_data) {
      console.log('🔍 Trying sensor_data as fallback...');
      sensorData = extractSensorData(workout.sensor_data);
      console.log(`📊 sensor_data yielded ${sensorData.length} samples`);
    }
    
    if (!sensorData || sensorData.length === 0) {
      // Return a meaningful response instead of crashing
      return new Response(JSON.stringify({
        success: true,
        analysis: {
          adherence_percentage: 0,
          execution_grade: 'N/A',
          primary_issues: ['No sensor data available - workout may not have been processed yet'],
          strengths: [],
          workout_type: 'long_run',
          time_in_range_s: 0,
          time_outside_range_s: 0
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Perform granular adherence analysis
    const analysis = calculatePrescribedRangeAdherence(sensorData, intervals);

    // Store analysis in database
    const { error: updateError } = await supabase
      .from('workouts')
      .update({
        workout_analysis: analysis
      })
      .eq('id', workout_id);

    if (updateError) {
      console.warn('⚠️ Could not store analysis:', updateError.message);
    }

    console.log(`✅ Running analysis complete for workout ${workout_id}`);
    console.log(`📊 Overall adherence: ${(analysis.overall_adherence * 100).toFixed(1)}%`);
    console.log(`🎯 Execution grade: ${analysis.execution_grade}`);

    return new Response(JSON.stringify({
      success: true,
      analysis: analysis
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('❌ Analyze running workout error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});

// Types
interface PrescribedRangeAdherence {
  overall_adherence: number;
  time_in_range_s: number;
  time_outside_range_s: number;
  total_time_s: number;
  interval_breakdown: IntervalAnalysis[];
  execution_grade: string;
  primary_issues: string[];
  strengths: string[];
  analysis_metadata: {
    total_intervals: number;
    intervals_analyzed: number;
    samples_processed: number;
    outliers_filtered: number;
    gaps_handled: number;
  };
}

interface IntervalAnalysis {
  interval_id: string;
  interval_type: string;
  prescribed_range: {
    lower: number;
    upper: number;
    unit: string;
  };
  time_in_range: number;
  time_outside_range: number;
  adherence_percentage: number;
  samples_in_range: number;
  samples_outside_range: number;
  average_value: number;
  range_consistency: number;
  issues: string[];
  grade: string;
}

interface SampleTiming {
  timestamp: number;
  duration_s: number;
  value: number;
  isInterpolated: boolean;
}

/**
 * Extract sensor data from sensor_data column
 * This reads the raw sensor data from the workouts table
 */
function extractSensorData(data: any): any[] {
  console.log('🔍 Data type:', typeof data);
  console.log('🔍 Data is array:', Array.isArray(data));
  console.log('🔍 Data keys:', data && typeof data === 'object' ? Object.keys(data) : 'N/A');
  
  if (!data) {
    console.log('⚠️ Data is null or undefined.');
    return [];
  }

  // Handle different data structures
  let dataArray = [];
  
  if (Array.isArray(data)) {
    // Direct array
    dataArray = data;
  } else if (typeof data === 'string') {
    // JSON string - try to parse it
    console.log('🔍 Parsing JSON string...');
    try {
      const parsed = JSON.parse(data);
      console.log('🔍 Parsed JSON type:', typeof parsed);
      console.log('🔍 Parsed JSON is array:', Array.isArray(parsed));
      
      if (Array.isArray(parsed)) {
        dataArray = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Check if it's an object with array properties
        if (parsed.samples && Array.isArray(parsed.samples)) {
          dataArray = parsed.samples;
        } else if (parsed.data && Array.isArray(parsed.data)) {
          dataArray = parsed.data;
        } else if (parsed.series && Array.isArray(parsed.series)) {
          dataArray = parsed.series;
        } else {
          console.log('⚠️ Parsed JSON is an object but no array property found.');
          console.log('🔍 Available properties:', Object.keys(parsed));
          return [];
        }
      } else {
        console.log('⚠️ Parsed JSON is not an array or object.');
        return [];
      }
    } catch (error) {
      console.log('⚠️ Failed to parse JSON string:', error.message);
      return [];
    }
  } else if (data && typeof data === 'object') {
    // Check if it's an object with array properties
    if (data.samples && Array.isArray(data.samples)) {
      dataArray = data.samples;
    } else if (data.data && Array.isArray(data.data)) {
      dataArray = data.data;
    } else if (data.series && Array.isArray(data.series)) {
      dataArray = data.series;
    } else if (data.intervals && Array.isArray(data.intervals)) {
      // Check if it's already processed analysis data
      console.log('🔍 Found intervals in computed data, checking for sensor data...');
      console.log('🔍 Intervals structure:', JSON.stringify(data.intervals[0], null, 2));
      // This might be processed analysis, not raw sensor data
      return [];
    } else {
      console.log('⚠️ Data is an object but no array property found.');
      console.log('🔍 Available properties:', Object.keys(data));
      console.log('🔍 Full data structure:', JSON.stringify(data, null, 2));
      return [];
    }
  } else {
    console.log('⚠️ Data is not an array, object, or string.');
    return [];
  }

  console.log(`📊 Raw sensor data length: ${dataArray.length}`);

  if (dataArray.length === 0) {
    console.log('⚠️ Sensor data array is empty.');
    return [];
  }

  // Log first few samples to understand structure
  console.log('🔍 First sample structure:', JSON.stringify(dataArray[0], null, 2));

  // Filter out samples where pace is null or undefined, as pace is critical for running analysis
  const filteredSamples = dataArray.map((sample: any, index: number) => {
    // Check if sample has the required structure
    if (!sample || typeof sample !== 'object') {
      return null;
    }

    // Skip first sample as we need previous sample for calculations
    if (index === 0) return null;
    
    const prevSample = dataArray[index - 1];
    if (!prevSample) return null;

    // Extract pace using Garmin API priority order
    let pace_s_per_mi: number | null = null;
    let dataSource = 'unknown';
    
    // Priority 1: Direct speed from device (Best)
    if (sample.speedMetersPerSecond != null && sample.speedMetersPerSecond > 0) {
      pace_s_per_mi = 26.8224 / sample.speedMetersPerSecond; // Convert m/s to min/mi, then to s/mi
      pace_s_per_mi = pace_s_per_mi * 60; // Convert min/mi to s/mi
      dataSource = 'device_speed';
      if (index % 100 === 0) console.log(`🔍 Device speed: ${(pace_s_per_mi/60).toFixed(1)} min/mi`);
    }
    
    // Priority 2: Calculate from cumulative distance (Good)
    else if (sample.totalDistanceInMeters != null && prevSample.totalDistanceInMeters != null) {
      const distanceDelta = sample.totalDistanceInMeters - prevSample.totalDistanceInMeters;
      const timeDelta = sample.timestamp - prevSample.timestamp;
      
      if (distanceDelta > 0 && timeDelta > 0) {
        const speedMPS = distanceDelta / timeDelta;
        if (speedMPS > 0.5 && speedMPS < 10) { // Realistic running speeds (1.8-36 km/h)
          pace_s_per_mi = 26.8224 / speedMPS; // Convert m/s to min/mi
          pace_s_per_mi = pace_s_per_mi * 60; // Convert min/mi to s/mi
          dataSource = 'cumulative_distance';
          if (index % 100 === 0) console.log(`🔍 Cumulative distance: ${(pace_s_per_mi/60).toFixed(1)} min/mi`);
        }
      }
    }
    
    // Priority 3: Calculate from GPS coordinates (Fallback)
    else if (sample.latitude != null && sample.longitude != null && 
             prevSample.latitude != null && prevSample.longitude != null) {
      pace_s_per_mi = calculatePaceFromGPS(sample, prevSample);
      if (pace_s_per_mi != null) {
        dataSource = 'gps_calculation';
        if (index % 100 === 0) console.log(`🔍 GPS pace calculated: ${(pace_s_per_mi/60).toFixed(1)} min/mi`);
      }
    }

    if (pace_s_per_mi == null) {
      return null; // Filter out samples with no pace data
    }

    return {
      timestamp: sample.timestamp || index,
      pace_s_per_mi: pace_s_per_mi,
      power_w: sample.power || null,
      heart_rate: sample.heartRate || sample.heart_rate || null,
      duration_s: 1,
      data_source: dataSource // Track which method was used
    };
  }).filter(Boolean); // Remove null entries

  // Log data source distribution
  const dataSourceCounts = filteredSamples.reduce((acc: any, sample: any) => {
    const source = sample.data_source || 'unknown';
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  
  console.log(`✅ Extracted ${filteredSamples.length} valid sensor samples.`);
  console.log('📊 Data source distribution:', dataSourceCounts);
  
  return filteredSamples;
}

/**
 * Calculate prescribed range adherence for running workouts
 * This is the core analysis function that measures time-in-range
 */
function calculatePrescribedRangeAdherence(sensorData: any[], intervals: any[]): PrescribedRangeAdherence {
  console.log(`📊 Starting prescribed range analysis for ${intervals.length} intervals`);
  
  let totalTimeInRange = 0;
  let totalTimeOutsideRange = 0;
  let totalSamples = 0;
  let filteredOutliers = 0;
  let handledGaps = 0;
  
  const intervalAnalysis: IntervalAnalysis[] = [];
  
  for (const interval of intervals) {
    console.log(`🔍 Analyzing interval: ${interval.type} (${interval.duration_s}s)`);
    console.log('🔍 Interval structure:', JSON.stringify(interval, null, 2));
    
    // Get samples for this interval
    const intervalSamples = getSamplesForInterval(sensorData, interval);
    console.log(`📈 Found ${intervalSamples.length} samples for interval`);
    
    if (intervalSamples.length === 0) {
      console.log(`⚠️ No samples found for interval, skipping`);
      continue;
    }
    
    // Filter outliers and handle gaps
    const { cleanSamples, outliers, gaps } = filterOutliersAndGaps(intervalSamples);
    filteredOutliers += outliers;
    handledGaps += gaps;
    
    console.log(`🧹 Filtered ${outliers} outliers, handled ${gaps} gaps`);
    
    if (cleanSamples.length === 0) {
      console.log(`⚠️ No clean samples after filtering, skipping interval`);
      continue;
    }
    
    // Calculate adherence for this interval
    const intervalResult = calculateIntervalAdherence(cleanSamples, interval);
    intervalAnalysis.push(intervalResult);
    
    totalTimeInRange += intervalResult.time_in_range;
    totalTimeOutsideRange += intervalResult.time_outside_range;
    totalSamples += cleanSamples.length;
    
    console.log(`✅ Interval adherence: ${(intervalResult.adherence_percentage * 100).toFixed(1)}%`);
  }
  
  const totalTime = totalTimeInRange + totalTimeOutsideRange;
  const overallAdherence = totalTime > 0 ? totalTimeInRange / totalTime : 0;
  
  // Calculate execution grade
  const executionGrade = calculateHonestGrade(overallAdherence, intervalAnalysis);
  
  // Identify primary issues and strengths
  const primaryIssues = identifyPrimaryIssues(intervalAnalysis);
  const strengths = identifyStrengths(intervalAnalysis);
  
  console.log(`🎯 Overall adherence: ${(overallAdherence * 100).toFixed(1)}%`);
  console.log(`📊 Grade: ${executionGrade}`);
  console.log(`🚨 Issues: ${primaryIssues.length}`);
  console.log(`💪 Strengths: ${strengths.length}`);
  
  return {
    overall_adherence: overallAdherence,
    time_in_range_s: totalTimeInRange,
    time_outside_range_s: totalTimeOutsideRange,
    total_time_s: totalTime,
    interval_breakdown: intervalAnalysis,
    execution_grade: executionGrade,
    primary_issues: primaryIssues,
    strengths: strengths,
    analysis_metadata: {
      total_intervals: intervals.length,
      intervals_analyzed: intervalAnalysis.length,
      samples_processed: totalSamples,
      outliers_filtered: filteredOutliers,
      gaps_handled: handledGaps
    }
  };
}

/**
 * Get samples that fall within an interval's time range
 * Uses fuzzy matching to handle timing discrepancies
 */
function getSamplesForInterval(sensorData: any[], interval: any): any[] {
  // For long runs or single intervals, use all samples
  if (!interval.start_time || !interval.end_time) {
    console.log('🔍 No start/end time for interval, using all samples for long run');
    return sensorData;
  }
  
  const startTime = new Date(interval.start_time).getTime() / 1000;
  const endTime = new Date(interval.end_time).getTime() / 1000;
  
  // Add tolerance for manual lap button presses
  const startTolerance = 10; // 10 seconds before
  const endTolerance = 5;    // 5 seconds after
  
  return sensorData.filter(sample => {
    const sampleTime = sample.timestamp;
    return sampleTime >= (startTime - startTolerance) && 
           sampleTime <= (endTime + endTolerance);
  });
}

/**
 * Filter out GPS spikes and unrealistic values
 * Handle gaps in sensor data with interpolation
 */
function filterOutliersAndGaps(samples: any[]): { cleanSamples: any[], outliers: number, gaps: number } {
  if (samples.length === 0) return { cleanSamples: [], outliers: 0, gaps: 0 };
  
  let outliers = 0;
  let gaps = 0;
  const cleanSamples: any[] = [];
  
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const nextSample = samples[i + 1];
    
    // Check for outliers (GPS spikes, unrealistic pace/power)
    if (isOutlier(sample)) {
      outliers++;
      continue;
    }
    
    // Handle gaps in sensor data
    if (nextSample) {
      const timeDiff = nextSample.timestamp - sample.timestamp;
      
      if (timeDiff > 60) {
        // Large gap - skip this sample entirely
        gaps++;
        continue;
      } else if (timeDiff > 10) {
        // Medium gap - interpolate
        const interpolatedSamples = interpolateGap(sample, nextSample);
        cleanSamples.push(...interpolatedSamples);
        gaps++;
      }
    }
    
    cleanSamples.push(sample);
  }
  
  return { cleanSamples, outliers, gaps };
}

/**
 * Check if a sample is an outlier (GPS spike, unrealistic value)
 */
function isOutlier(sample: any): boolean {
  // Check for unrealistic pace values (faster than 4:00/mi or slower than 15:00/mi)
  if (sample.pace_s_per_mi && (sample.pace_s_per_mi < 240 || sample.pace_s_per_mi > 900)) {
    return true;
  }
  
  // Check for unrealistic power values (negative or > 1000W)
  if (sample.power_w && (sample.power_w < 0 || sample.power_w > 1000)) {
    return true;
  }
  
  // Check for unrealistic heart rate (below 30 or above 220)
  if (sample.heart_rate && (sample.heart_rate < 30 || sample.heart_rate > 220)) {
    return true;
  }
  
  return false;
}

/**
 * Interpolate between two samples for medium gaps
 */
function interpolateGap(sample1: any, sample2: any): any[] {
  const timeDiff = sample2.timestamp - sample1.timestamp;
  const steps = Math.floor(timeDiff / 5); // 5-second steps
  const interpolated: any[] = [];
  
  for (let i = 1; i < steps; i++) {
    const ratio = i / steps;
    const interpolatedSample = {
      timestamp: sample1.timestamp + (timeDiff * ratio),
      pace_s_per_mi: interpolateValue(sample1.pace_s_per_mi, sample2.pace_s_per_mi, ratio),
      power_w: interpolateValue(sample1.power_w, sample2.power_w, ratio),
      heart_rate: interpolateValue(sample1.heart_rate, sample2.heart_rate, ratio),
      duration_s: 5
    };
    interpolated.push(interpolatedSample);
  }
  
  return interpolated;
}

/**
 * Linear interpolation between two values
 */
function interpolateValue(value1: number, value2: number, ratio: number): number {
  if (value1 == null || value2 == null) return value1 || value2 || 0;
  return value1 + (value2 - value1) * ratio;
}

/**
 * Calculate adherence for a single interval
 */
function calculateIntervalAdherence(samples: any[], interval: any): IntervalAnalysis {
  const prescribedRange = getPrescribedRange(interval);
  let timeInRange = 0;
  let timeOutsideRange = 0;
  let samplesInRange = 0;
  let samplesOutsideRange = 0;
  let totalValue = 0;
  
  for (const sample of samples) {
    const value = getSampleValue(sample, interval);
    const duration = sample.duration_s || 1;
    
    if (value == null) continue;
    
    totalValue += value;
    
    if (isInPrescribedRange(value, prescribedRange)) {
      timeInRange += duration;
      samplesInRange++;
    } else {
      timeOutsideRange += duration;
      samplesOutsideRange++;
    }
  }
  
  const totalTime = timeInRange + timeOutsideRange;
  const adherencePercentage = totalTime > 0 ? timeInRange / totalTime : 0;
  const averageValue = samples.length > 0 ? totalValue / samples.length : 0;
  
  // Calculate range consistency (coefficient of variation)
  const rangeConsistency = calculateRangeConsistency(samples, interval);
  
  // Identify issues for this interval
  const issues = identifyIntervalIssues(adherencePercentage, averageValue, prescribedRange, interval);
  
  // Calculate grade for this interval
  const grade = calculateIntervalGrade(adherencePercentage, interval.type);
  
  return {
    interval_id: interval.id || `interval_${Date.now()}`,
    interval_type: interval.type || 'unknown',
    prescribed_range: prescribedRange,
    time_in_range: timeInRange,
    time_outside_range: timeOutsideRange,
    adherence_percentage: adherencePercentage,
    samples_in_range: samplesInRange,
    samples_outside_range: samplesOutsideRange,
    average_value: averageValue,
    range_consistency: rangeConsistency,
    issues: issues,
    grade: grade
  };
}

/**
 * Get the prescribed range for an interval (pace or power)
 */
function getPrescribedRange(interval: any): { lower: number, upper: number, unit: string } {
  if (interval.pace_range) {
    return {
      lower: interval.pace_range.lower,
      upper: interval.pace_range.upper,
      unit: 's_per_mi'
    };
  }
  
  if (interval.power_range) {
    return {
      lower: interval.power_range.lower,
      upper: interval.power_range.upper,
      unit: 'watts'
    };
  }
  
  // Default fallback
  return {
    lower: 0,
    upper: 1000,
    unit: 'unknown'
  };
}

/**
 * Calculate pace from GPS coordinates
 */
function calculatePaceFromGPS(sample: any, prevSample: any): number | null {
  if (!prevSample || !prevSample.latitude || !prevSample.longitude || !prevSample.timestamp) {
    return null;
  }
  
  // Calculate distance between GPS points using Haversine formula
  const distance = calculateDistance(
    prevSample.latitude, prevSample.longitude,
    sample.latitude, sample.longitude
  );
  
  // Calculate time difference
  const timeDiff = sample.timestamp - prevSample.timestamp;
  
  // Skip if time difference is too small or too large (GPS errors)
  if (timeDiff <= 0 || timeDiff > 60) return null;
  
  // Calculate speed in m/s
  const speedMps = distance / timeDiff;
  
  // Skip unrealistic speeds (faster than 20 mph or slower than 2 mph)
  if (speedMps < 0.9 || speedMps > 8.9) return null;
  
  // Convert to pace in seconds per mile using Garmin API formula
  const paceMinPerMile = 26.8224 / speedMps; // Convert m/s to min/mi
  return paceMinPerMile * 60; // Convert min/mi to s/mi
}

/**
 * Calculate distance between two GPS points using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in meters
}

/**
 * Get the relevant value from a sample based on interval type
 */
function getSampleValue(sample: any, interval: any): number | null {
  if (interval.pace_range && sample.pace_s_per_mi != null) {
    return sample.pace_s_per_mi;
  }
  
  if (interval.power_range && sample.power_w != null) {
    return sample.power_w;
  }
  
  return null;
}

/**
 * Check if a value is within the prescribed range
 */
function isInPrescribedRange(value: number, range: { lower: number, upper: number }): boolean {
  return value >= range.lower && value <= range.upper;
}

/**
 * Calculate range consistency (coefficient of variation)
 */
function calculateRangeConsistency(samples: any[], interval: any): number {
  const values = samples
    .map(s => getSampleValue(s, interval))
    .filter(v => v != null) as number[];
  
  if (values.length < 2) return 0;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return mean > 0 ? stdDev / mean : 0;
}

/**
 * Identify issues for a specific interval
 */
function identifyIntervalIssues(adherence: number, averageValue: number, range: { lower: number, upper: number, unit: string }, interval: any): string[] {
  const issues: string[] = [];
  
  if (adherence < 0.5) {
    issues.push('Poor adherence to prescribed range');
  }
  
  if (averageValue < range.lower) {
    issues.push('Consistently too fast');
  } else if (averageValue > range.upper) {
    issues.push('Consistently too slow');
  }
  
  if (interval.type === 'work' && adherence < 0.7) {
    issues.push('Work interval not executed as prescribed');
  }
  
  return issues;
}

/**
 * Calculate grade for a specific interval
 */
function calculateIntervalGrade(adherence: number, intervalType: string): string {
  const thresholds = getGradingThresholds(intervalType);
  
  if (adherence >= thresholds.excellent) return 'A';
  if (adherence >= thresholds.good) return 'B';
  if (adherence >= thresholds.acceptable) return 'C';
  if (adherence >= thresholds.poor) return 'D';
  return 'F';
}

/**
 * Calculate honest overall grade based on adherence and patterns
 */
function calculateHonestGrade(overallAdherence: number, intervalAnalysis: IntervalAnalysis[]): string {
  // Base grade on overall adherence
  let grade = calculateIntervalGrade(overallAdherence, 'overall');
  
  // Adjust based on patterns
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work' || i.interval_type === 'interval');
  const workAdherence = workIntervals.length > 0 
    ? workIntervals.reduce((sum, i) => sum + i.adherence_percentage, 0) / workIntervals.length
    : overallAdherence;
  
  // Stricter grading for work intervals
  if (workIntervals.length > 0 && workAdherence < 0.6) {
    grade = 'F';
  } else if (workIntervals.length > 0 && workAdherence < 0.7) {
    grade = 'D';
  }
  
  return grade;
}

/**
 * Get grading thresholds based on interval type
 */
function getGradingThresholds(intervalType: string): { excellent: number, good: number, acceptable: number, poor: number } {
  if (intervalType === 'warmup' || intervalType === 'cooldown') {
    // More lenient for warmup/cooldown
    return { excellent: 0.80, good: 0.70, acceptable: 0.60, poor: 0.45 };
  }
  
  if (intervalType === 'interval' || intervalType === 'work') {
    // Stricter for intervals
    return { excellent: 0.90, good: 0.80, acceptable: 0.70, poor: 0.55 };
  }
  
  // Default thresholds
  return { excellent: 0.85, good: 0.75, acceptable: 0.65, poor: 0.50 };
}

/**
 * Identify primary issues across all intervals
 */
function identifyPrimaryIssues(intervalAnalysis: IntervalAnalysis[]): string[] {
  const issues: string[] = [];
  
  if (intervalAnalysis.length === 0) {
    return ['No intervals analyzed'];
  }
  
  // Check for consistently too fast
  const tooFastIntervals = intervalAnalysis.filter(i => 
    i.average_value < i.prescribed_range.lower && i.adherence_percentage < 0.5
  );
  if (tooFastIntervals.length > intervalAnalysis.length / 2) {
    issues.push('Consistently too fast - adjust target pace');
  }
  
  // Check for consistently too slow
  const tooSlowIntervals = intervalAnalysis.filter(i => 
    i.average_value > i.prescribed_range.upper && i.adherence_percentage < 0.5
  );
  if (tooSlowIntervals.length > intervalAnalysis.length / 2) {
    issues.push('Consistently too slow - increase target pace');
  }
  
  // Check for fading in final intervals
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work' || i.interval_type === 'interval');
  if (workIntervals.length >= 3) {
    const lastThird = workIntervals.slice(-Math.floor(workIntervals.length / 3));
    const fadingCount = lastThird.filter(i => i.adherence_percentage < 0.6).length;
    if (fadingCount > lastThird.length / 2) {
      issues.push('Fading in final intervals - consider reducing target pace');
    }
  }
  
  // Check for poor recovery
  const recoveryIntervals = intervalAnalysis.filter(i => i.interval_type === 'recovery');
  if (recoveryIntervals.length > 0) {
    const avgRecoveryAdherence = recoveryIntervals.reduce((sum, i) => sum + i.adherence_percentage, 0) / recoveryIntervals.length;
    if (avgRecoveryAdherence < 0.5) {
      issues.push('Poor recovery discipline - slow down during recovery periods');
    }
  }
  
  return issues;
}

/**
 * Identify strengths in execution
 */
function identifyStrengths(intervalAnalysis: IntervalAnalysis[]): string[] {
  const strengths: string[] = [];
  
  if (intervalAnalysis.length === 0) {
    return [];
  }
  
  // Check for excellent overall adherence
  const excellentIntervals = intervalAnalysis.filter(i => i.adherence_percentage >= 0.9);
  if (excellentIntervals.length > intervalAnalysis.length / 2) {
    strengths.push('Excellent adherence to prescribed ranges');
  }
  
  // Check for strong finish
  const workIntervals = intervalAnalysis.filter(i => i.interval_type === 'work' || i.interval_type === 'interval');
  if (workIntervals.length >= 3) {
    const lastThird = workIntervals.slice(-Math.floor(workIntervals.length / 3));
    const strongFinishCount = lastThird.filter(i => i.adherence_percentage >= 0.8).length;
    if (strongFinishCount > lastThird.length / 2) {
      strengths.push('Strong finish - maintained pace through final intervals');
    }
  }
  
  // Check for consistent pacing
  const consistentIntervals = intervalAnalysis.filter(i => i.range_consistency < 0.1);
  if (consistentIntervals.length > intervalAnalysis.length / 2) {
    strengths.push('Consistent pacing within intervals');
  }
  
  return strengths;
}