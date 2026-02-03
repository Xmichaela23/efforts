import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractSensorData } from '../../lib/analysis/sensor-data/extractor.ts';
import { generateIntervalBreakdown } from './lib/intervals/interval-breakdown.ts';
import { getWorkIntervals } from './lib/intervals/build-intervals.ts';
import { calculatePaceRangeAdherence, getIntervalType, IntervalType } from './lib/adherence/pace-adherence.ts';
import { calculateGarminExecutionScore, getPaceToleranceForSegment } from './lib/adherence/garmin-execution.ts';
import { calculatePrescribedRangeAdherenceGranular, type PrescribedRangeAdherence, type IntervalAnalysis, type SampleTiming } from './lib/adherence/granular-pace.ts';
import { calculateIntervalHeartRate } from './lib/analysis/heart-rate.ts';
import { calculateIntervalElevation } from './lib/analysis/elevation.ts';
// Old HR drift import removed - now using consolidated HR analysis module
import { analyzeHeartRate, type HRAnalysisResult, type HRAnalysisContext, type WorkoutType } from './lib/heart-rate/index.ts';
import { generateAINarrativeInsights } from './lib/narrative/ai-generator.ts';
import { generateMileByMileTerrainBreakdown } from './lib/analysis/mile-by-mile-terrain.ts';
import { fetchPlanContextForWorkout, type PlanContext } from './lib/plan-context.ts';

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
// - Provides descriptive performance assessment
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
// - performance_assessment: descriptive text based on percentage
// - primary_issues: specific problems identified
// - strengths: positive execution patterns
// 
// INPUT: { workout_id: string }
// OUTPUT: { success: boolean, analysis: PrescribedRangeAdherence }
// =============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Declare workout_id outside try block so it's accessible in catch
  let workout_id: string | undefined;
  
  try {
    const body = await req.json();
    workout_id = body.workout_id;
    
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
    console.log('🔍 [MAIN DEBUG] Starting analysis for workout:', workout_id);

    // Set analysis status to 'analyzing' at start
    const { error: statusError } = await supabase
      .from('workouts')
      .update({ 
        analysis_status: 'analyzing',
        analysis_error: null 
      })
      .eq('id', workout_id);

    if (statusError) {
      console.warn('⚠️ Failed to set analyzing status:', statusError.message);
    }

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
        user_id,
        moving_time,
        duration,
        elapsed_time,
        total_timer_time,
        distance,
        weather_data,
        avg_temperature
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
    
    console.log('🔍 Workout summary fields:', {
      distance: workout.distance,
      moving_time: workout.moving_time,
      duration: workout.duration,
      type: workout.type
    });

    if (workout.type !== 'run' && workout.type !== 'running') {
      throw new Error(`Workout type ${workout.type} is not supported for running analysis`);
    }

    if (!workout.sensor_data && !workout.computed) {
      throw new Error('No sensor data or computed data available. Workout may not have been processed yet.');
    }

    // Get user baselines first (needed for both planned and unplanned workouts)
    let baselines = {};
    let userUnits = 'imperial'; // default
    try {
      const { data: userBaselines } = await supabase
        .from('user_baselines')
        .select('performance_numbers, units')
        .eq('user_id', workout.user_id)
        .single();
      
      if (userBaselines?.units === 'metric' || userBaselines?.units === 'imperial') {
        userUnits = userBaselines.units;
      }
      baselines = userBaselines?.performance_numbers || {};
      console.log('📊 User baselines found:', baselines);
    } catch (error) {
      console.log('⚠️ No user baselines found, using defaults');
      // Use default baselines for analysis
    }

    // Query similar historical workouts for HR drift comparison
    let historicalDriftData: {
      similarWorkouts: Array<{ date: string; driftBpm: number; durationMin: number; elevationFt?: number }>;
      avgDriftBpm: number;
      recentTrend?: 'improving' | 'stable' | 'worsening';
      lastWeekSimilar?: { date: string; driftBpm: number; durationMin: number; elevationFt?: number; daysSince: number };
    } | undefined = undefined;
    
    try {
      const currentDuration = workout.moving_time || workout.duration || 0;
      const currentDistance = workout.distance || 0;
      
      // Fetch similar workouts (within 30% duration, same type, last 90 days)
      const minDuration = currentDuration * 0.7;
      const maxDuration = currentDuration * 1.3;
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const { data: similarWorkouts } = await supabase
        .from('workouts')
        .select('id, start_date, moving_time, duration, elevation_gain, workout_analysis')
        .eq('user_id', workout.user_id)
        .eq('type', 'run')
        .neq('id', workout_id) // Exclude current workout
        .gte('start_date', ninetyDaysAgo.toISOString())
        .gte('moving_time', minDuration)
        .lte('moving_time', maxDuration)
        .not('workout_analysis', 'is', null)
        .order('start_date', { ascending: false })
        .limit(10);
      
      if (similarWorkouts && similarWorkouts.length > 0) {
        const workoutsWithDrift = similarWorkouts
          .map(w => {
            // Check multiple possible locations for HR drift (different analysis versions)
            const hrDrift = 
              w.workout_analysis?.granular_analysis?.heart_rate_analysis?.hr_drift_bpm ??
              w.workout_analysis?.heart_rate_summary?.drift_bpm ??
              w.workout_analysis?.detailed_analysis?.workout_summary?.hr_drift ??
              null;
            if (hrDrift != null && Number.isFinite(hrDrift)) {
              const daysSince = Math.round((Date.now() - new Date(w.start_date).getTime()) / (1000 * 60 * 60 * 24));
              return {
                date: w.start_date,
                driftBpm: hrDrift,
                durationMin: Math.round((w.moving_time || w.duration || 0) / 60),
                elevationFt: w.elevation_gain ? Math.round(w.elevation_gain * 3.28084) : undefined,
                daysSince
              };
            }
            return null;
          })
          .filter((w): w is NonNullable<typeof w> => w !== null);
        
        if (workoutsWithDrift.length >= 1) {
          const avgDrift = workoutsWithDrift.reduce((sum, w) => sum + w.driftBpm, 0) / workoutsWithDrift.length;
          
          // Find last week's similar workout (5-10 days ago)
          const lastWeekSimilar = workoutsWithDrift.find(w => w.daysSince >= 5 && w.daysSince <= 10);
          
          // Determine trend (compare recent 3 vs older)
          let trend: 'improving' | 'stable' | 'worsening' | undefined = undefined;
          if (workoutsWithDrift.length >= 4) {
            const recent = workoutsWithDrift.slice(0, Math.floor(workoutsWithDrift.length / 2));
            const older = workoutsWithDrift.slice(Math.floor(workoutsWithDrift.length / 2));
            const recentAvg = recent.reduce((sum, w) => sum + w.driftBpm, 0) / recent.length;
            const olderAvg = older.reduce((sum, w) => sum + w.driftBpm, 0) / older.length;
            
            if (recentAvg < olderAvg - 2) trend = 'improving';
            else if (recentAvg > olderAvg + 2) trend = 'worsening';
            else trend = 'stable';
          }
          
          historicalDriftData = {
            similarWorkouts: workoutsWithDrift,
            avgDriftBpm: Math.round(avgDrift),
            recentTrend: trend,
            lastWeekSimilar: lastWeekSimilar ? {
              date: lastWeekSimilar.date,
              driftBpm: lastWeekSimilar.driftBpm,
              durationMin: lastWeekSimilar.durationMin,
              elevationFt: lastWeekSimilar.elevationFt,
              daysSince: lastWeekSimilar.daysSince
            } : undefined
          };
          console.log(`📊 [HISTORICAL] Found ${workoutsWithDrift.length} similar workouts, avg drift: ${avgDrift.toFixed(1)} bpm, trend: ${trend || 'unknown'}, lastWeekSimilar: ${lastWeekSimilar ? lastWeekSimilar.driftBpm + ' bpm' : 'none'}`);
        } else {
          console.log(`📊 [HISTORICAL] Found ${similarWorkouts.length} similar workouts but none had HR drift data`);
        }
      } else {
        console.log(`📊 [HISTORICAL] No similar workouts found (within 30% duration, last 90 days)`);
      }
    } catch (error) {
      console.log('⚠️ Could not fetch historical drift data:', error);
      baselines = {
        fiveK_pace: 450, // 7:30/mi
        easyPace: 540,   // 9:00/mi
        tenK_pace: 480,  // 8:00/mi
        marathon_pace: 600 // 10:00/mi
      };
    }

    // Get planned workout data with token parsing support
    let plannedWorkout = null;
    let intervals = [];
    
    if (workout.planned_id) {
      const { data: planned, error: plannedError } = await supabase
        .from('planned_workouts')
        .select('id, intervals, steps_preset, computed, total_duration_seconds, description, tags, training_plan_id, user_id')
        .eq('id', workout.planned_id)
        .eq('user_id', workout.user_id) // Authorization: verify planned workout belongs to user
        .single();

      if (plannedError) {
        console.warn('⚠️ Could not load planned workout:', plannedError.message);
      } else {
        plannedWorkout = planned;
        intervals = await getWorkIntervals(workout, plannedWorkout, baselines);
      }
    }

    // Fetch plan context early so it can be used in HR drift interpretation
    let planContextForDrift: {
      weekIndex?: number;
      weekIntent?: string;
      phaseName?: string;
      isRecoveryWeek?: boolean;
      isTaperWeek?: boolean;
      hasActivePlan?: boolean;
      planName?: string;
    } | undefined = undefined;
    
    if (plannedWorkout?.training_plan_id) {
      try {
        const planContext = await fetchPlanContextForWorkout(
          supabase,
          workout.user_id,
          plannedWorkout.training_plan_id,
          workout.date || new Date().toISOString()
        );
        if (planContext) {
          planContextForDrift = {
            weekIndex: planContext.weekIndex,
            weekIntent: planContext.weekIntent,
            phaseName: planContext.phaseName,
            isRecoveryWeek: planContext.isRecoveryWeek,
            isTaperWeek: planContext.isTaperWeek,
            hasActivePlan: planContext.hasActivePlan,
            planName: planContext.planName ?? undefined
          };
          console.log('📋 [PLAN CONTEXT EARLY] Fetched for drift analysis:', planContextForDrift);
        }
      } catch (err) {
        console.warn('⚠️ Could not fetch plan context early:', err);
      }
    }

    if (!intervals || intervals.length === 0) {
      // Create reasonable pace targets for unplanned workouts using user baselines
      console.log('🏃 No planned workout found, creating pace targets from baselines');
      
      // Determine workout type based on duration and pace
      const workoutDuration = workout.moving_time || workout.duration || 0;
      const avgPace = workout.computed?.overall?.avg_pace_s_per_mi || 0;
      
      let targetPace = baselines.easyPace || 540; // Default to easy pace
      let workoutType = 'easy_run';
      
      if (workoutDuration > 3600) { // > 1 hour
        workoutType = 'long_run';
        targetPace = baselines.marathon_pace || 600;
      } else if (workoutDuration > 1800) { // 30-60 minutes
        workoutType = 'tempo_run';
        targetPace = baselines.tenK_pace || 480;
      } else if (workoutDuration < 900) { // < 15 minutes
        workoutType = 'interval_run';
        targetPace = baselines.fiveK_pace || 450;
      }
      
      // Create a single interval for the entire workout
      intervals = [{
        id: 'unplanned_interval',
        type: workoutType,
        duration_s: workoutDuration,
        pace_range: {
          lower: targetPace * 0.95, // 5% below target
          upper: targetPace * 1.05  // 5% above target
        }
      }];
      
      console.log(`🎯 Created pace target for ${workoutType}: ${targetPace}s/mi (${Math.floor(targetPace/60)}:${String(targetPace%60).padStart(2,'0')}/mi)`);
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
          performance_assessment: 'Unable to assess',
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

    // Use computed.intervals as the base (already has matched executed data)
    // Enhance with pace ranges from planned workout
    const computedIntervals = workout?.computed?.intervals || [];
    console.log(`🔍 Using ${computedIntervals.length} computed intervals as base`);
    
    // Enrich intervals with pace ranges from planned workout
    const intervalsToAnalyze = computedIntervals.map(interval => {
      // Find matching step in planned workout to get pace_range
      const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
      
      // ✅ CRITICAL FIX: Always check and expand ranges, even if interval already has pace_range
      // This ensures we use the expanded range for adherence calculation
      if (plannedStep?.pace_range) {
        // Check if we need to expand the range (whether from plannedStep or existing interval)
        const rangeToCheck = interval.pace_range || plannedStep.pace_range;
        const rangeWidth = rangeToCheck.upper - rangeToCheck.lower;
        const midpoint = (rangeToCheck.lower + rangeToCheck.upper) / 2;
        const actualTolerance = rangeWidth / midpoint;
        const expectedTolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
        
        // If range is too tight (less than 60% of expected tolerance), expand it
        if (actualTolerance < expectedTolerance * 0.6 && midpoint > 0) {
          const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
          const plannedPaceFromInterval = interval.planned?.target_pace_s_per_mi;
          const plannedPaceFromStep = plannedStep?.pace_sec_per_mi;
          const centerPace = plannedPaceFromInterval || 
                             plannedPaceFromStep || 
                             midpoint;
          
          console.log(`🔍 [CENTER DEBUG] Recalculating range - interval.planned.target_pace_s_per_mi=${plannedPaceFromInterval}, plannedStep.pace_sec_per_mi=${plannedPaceFromStep}, midpoint=${midpoint}, using centerPace=${centerPace}`);
          
          const lower = Math.round(centerPace * (1 - tolerance));
          const upper = Math.round(centerPace * (1 + tolerance));
          console.log(`⚠️ [FIX] Recalculated too-tight range ${rangeToCheck.lower}-${rangeToCheck.upper}s/mi (${(actualTolerance*100).toFixed(1)}% tolerance) to ${lower}-${upper}s/mi (${(tolerance*100).toFixed(1)}% tolerance) centered on ${centerPace}s/mi`);
          return {
            ...interval,
            pace_range: { lower, upper },
            target_pace: { lower, upper }
          };
        }
        
        // Check for zero-width range
        if (rangeToCheck.lower === rangeToCheck.upper && rangeToCheck.lower > 0) {
          const singlePace = rangeToCheck.lower;
          const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
          const lower = Math.round(singlePace * (1 - tolerance));
          const upper = Math.round(singlePace * (1 + tolerance));
          console.log(`⚠️ [FIX] Expanded zero-width range ${singlePace}-${singlePace} to ${lower}-${upper}s/mi`);
          return {
            ...interval,
            pace_range: { lower, upper },
            target_pace: { lower, upper }
          };
        }
      }
      
      // Add pace_range to interval if not already present
      if (plannedStep?.pace_range && !interval.pace_range && !interval.target_pace) {
        // ✅ FIX: Check for zero-width range
        if (plannedStep.pace_range.lower === plannedStep.pace_range.upper && plannedStep.pace_range.lower > 0) {
          const singlePace = plannedStep.pace_range.lower;
          const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
          const lower = Math.round(singlePace * (1 - tolerance));
          const upper = Math.round(singlePace * (1 + tolerance));
          console.log(`⚠️ [FIX] Expanded zero-width range ${singlePace}-${singlePace} to ${lower}-${upper}s/mi`);
          return {
            ...interval,
            pace_range: { lower, upper },
            target_pace: { lower, upper }
          };
        }
        
        // ✅ FIX: Check for asymmetric/too-tight ranges (e.g., 2% tolerance when should be 6-8%)
        // Detect if range is too tight by checking if it's less than expected tolerance
        const rangeWidth = plannedStep.pace_range.upper - plannedStep.pace_range.lower;
        const midpoint = (plannedStep.pace_range.lower + plannedStep.pace_range.upper) / 2;
        const actualTolerance = rangeWidth / midpoint;
        const expectedTolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
        
        // If actual tolerance is less than 60% of expected, recalculate with proper tolerance
        // This catches cases where materialize-plan used 2% but should have used 6-8% for tempo
        // ✅ CRITICAL: Use planned.target_pace_s_per_mi as center (workout-specific pace) instead of midpoint (baseline)
        if (actualTolerance < expectedTolerance * 0.6 && midpoint > 0) {
          const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
          // Priority: Use planned target pace (workout-specific) over range midpoint (baseline)
          // Check multiple possible locations for the planned pace
          const plannedPaceFromInterval = interval.planned?.target_pace_s_per_mi;
          const plannedPaceFromStep = plannedStep?.pace_sec_per_mi;
          const centerPace = plannedPaceFromInterval || 
                             plannedPaceFromStep || 
                             midpoint;
          
          console.log(`🔍 [CENTER DEBUG] Recalculating range - interval.planned.target_pace_s_per_mi=${plannedPaceFromInterval}, plannedStep.pace_sec_per_mi=${plannedPaceFromStep}, midpoint=${midpoint}, using centerPace=${centerPace}`);
          
          const lower = Math.round(centerPace * (1 - tolerance));
          const upper = Math.round(centerPace * (1 + tolerance));
          console.log(`⚠️ [FIX] Recalculated too-tight range ${plannedStep.pace_range.lower}-${plannedStep.pace_range.upper}s/mi (${(actualTolerance*100).toFixed(1)}% tolerance) to ${lower}-${upper}s/mi (${(tolerance*100).toFixed(1)}% tolerance) centered on ${centerPace}s/mi`);
          return {
            ...interval,
            pace_range: { lower, upper },
            target_pace: { lower, upper }
          };
        }
        
        return {
          ...interval,
          pace_range: plannedStep.pace_range,
          target_pace: {
            lower: plannedStep.pace_range.lower,
            upper: plannedStep.pace_range.upper
          }
        };
      }
      
      // ✅ FIX: If interval has planned.target_pace_s_per_mi but no range, create range with appropriate tolerance
      const singlePace = interval.planned?.target_pace_s_per_mi;
      if (singlePace && !interval.pace_range?.lower && !interval.target_pace?.lower) {
        const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
        const lower = Math.round(singlePace * (1 - tolerance));
        const upper = Math.round(singlePace * (1 + tolerance));
        return {
          ...interval,
          pace_range: { lower, upper },
          target_pace: { lower, upper }
        };
      }
      
      // Note: Range expansion for existing pace_range is now handled at the top of this function
      
      // ✅ FIX: Check target_pace object for zero width
      if (interval.target_pace?.lower === interval.target_pace?.upper && interval.target_pace?.lower > 0) {
        const singlePace = interval.target_pace.lower;
        const tolerance = getPaceToleranceForSegment(interval, plannedStep, plannedWorkout);
        const lower = Math.round(singlePace * (1 - tolerance));
        const upper = Math.round(singlePace * (1 + tolerance));
        console.log(`⚠️ [FIX] Expanded zero-width target_pace ${singlePace}-${singlePace} to ${lower}-${upper}s/mi`);
        return {
          ...interval,
          pace_range: { lower, upper },
          target_pace: { lower, upper }
        };
      }
      
      return interval;
    });
    
    console.log('🔍 [CRITICAL DEBUG] intervalsToAnalyze structure:', intervalsToAnalyze.map(i => ({
      role: i.role,
      hasTargetPace: !!i.target_pace,
      hasPaceRange: !!i.pace_range,
      hasPlannedPaceRange: !!i.planned?.pace_range,
      targetPace: i.target_pace,
      paceRange: i.pace_range
    })));
    
    // Perform granular adherence analysis
    console.log('🔴🔴🔴 INDEX.TS VERSION 2026-02-02-D: HR DRIFT FIX ACTIVE');
    console.log('🚀 [TIMING] Starting calculatePrescribedRangeAdherenceGranular...');
    const analysis = calculatePrescribedRangeAdherenceGranular(sensorData, intervalsToAnalyze, workout, plannedWorkout, historicalDriftData, planContextForDrift);
    console.log('✅ [TIMING] Granular analysis completed!');
    
    // 💓 SINGLE SOURCE OF TRUTH: Consolidated HR Analysis
    // All HR metrics (drift, zones, efficiency, intervals) calculated here
    const hrAnalysisContext: HRAnalysisContext = {
      workoutType: detectWorkoutTypeFromIntervals(intervalsToAnalyze, plannedWorkout),
      intervals: intervalsToAnalyze.map(interval => ({
        role: (interval.role || interval.kind || 'work') as any,
        sampleIdxStart: interval.sample_idx_start,
        sampleIdxEnd: interval.sample_idx_end,
        startTimeS: interval.start_time_s || 0,
        endTimeS: interval.end_time_s || 0,
        paceRange: interval.pace_range || interval.target_pace,
        executed: interval.executed ? {
          avgPaceSPerMi: interval.executed.avg_pace_s_per_mi,
          durationS: interval.executed.duration_s,
          avgHr: interval.executed.avg_hr
        } : undefined
      })),
      terrain: {
        totalElevationGainM: workout?.elevation_gain ?? workout?.metrics?.elevation_gain ?? undefined,
        samples: sensorData
      },
      weather: workout?.weather_data ? {
        temperatureF: workout.avg_temperature ?? workout.weather_data?.temperature,
        humidity: workout.weather_data?.humidity
      } : undefined,
      plannedWorkout: plannedWorkout ? {
        description: plannedWorkout.description || plannedWorkout.workout_description,
        workoutToken: plannedWorkout.workout_token,
        paceRanges: plannedWorkout.computed?.steps?.filter((s: any) => s.pace_range).map((s: any) => s.pace_range),
        intent: detectWorkoutIntent(plannedWorkout)
      } : undefined,
      planContext: planContextForDrift ? {
        weekIndex: planContextForDrift.weekIndex,
        weekIntent: planContextForDrift.weekIntent as any,
        isRecoveryWeek: planContextForDrift.isRecoveryWeek,
        isTaperWeek: planContextForDrift.isTaperWeek,
        phaseName: planContextForDrift.phaseName,
        planName: planContextForDrift.planName
      } : undefined,
      historicalDrift: historicalDriftData ? {
        similarWorkouts: historicalDriftData.similarWorkouts || [],
        avgDriftBpm: historicalDriftData.avgDriftBpm || 0,
        trend: historicalDriftData.recentTrend,
        lastSimilar: historicalDriftData.lastWeekSimilar
      } : undefined,
      userUnits: 'imperial'
    };
    
    const hrAnalysisResult = analyzeHeartRate(sensorData, hrAnalysisContext);
    console.log(`💓 [HR ANALYSIS] Complete: type=${hrAnalysisResult.workoutType}, drift=${hrAnalysisResult.drift?.driftBpm ?? 'N/A'}, confidence=${hrAnalysisResult.confidence}`);
    
    // Update analysis.heart_rate_analysis with consolidated results
    {
      const validHRSamples = sensorData.filter(s => s.heart_rate && s.heart_rate > 0 && s.heart_rate < 250);
      const avgHR = validHRSamples.length > 0
        ? Math.round(validHRSamples.reduce((sum, s) => sum + s.heart_rate, 0) / validHRSamples.length)
        : 0;
      
      analysis.heart_rate_analysis = {
        adherence_percentage: 100,
        time_in_zone_s: 0,
        time_outside_zone_s: 0,
        total_time_s: sensorData.length,
        samples_in_zone: validHRSamples.length,
        samples_outside_zone: 0,
        average_heart_rate: avgHR,
        target_zone: null,
        // Drift metrics from new module
        hr_drift_bpm: hrAnalysisResult.drift?.driftBpm ?? null,
        early_avg_hr: hrAnalysisResult.drift?.earlyAvgHr ?? null,
        late_avg_hr: hrAnalysisResult.drift?.lateAvgHr ?? null,
        hr_drift_interpretation: hrAnalysisResult.interpretation,
        analysis_scope: hrAnalysisResult.drift?.analysisScope ?? null,
        scope_description: hrAnalysisResult.drift?.scopeDescription ?? null,
        terrain_contribution_bpm: hrAnalysisResult.drift?.terrain?.contributionBpm ?? null,
        terrain_note: hrAnalysisResult.drift?.terrain?.profileDescription ?? null,
        temperature_factor: hrAnalysisResult.drift?.weather?.factor ?? null,
        temperature_note: hrAnalysisResult.drift?.weather?.note ?? null,
        excluded_segments: hrAnalysisResult.drift?.excludedSegments ?? [],
        confidence: hrAnalysisResult.confidence,
        workout_type: hrAnalysisResult.workoutType,
        // Human-readable label for UI
        summary_label: hrAnalysisResult.summaryLabel,
        // NEW: Full structured summary for weekly/block aggregation
        summary: hrAnalysisResult.summary
      };
    }

    // Add data quality information to analysis
    const enhancedAnalysis = {
      ...analysis,
      data_quality: {
        confidence_level: sensorData.length > 0 ? sensorData[0].data_quality?.confidence_level || 'unknown' : 'unknown',
        data_source_breakdown: {
          device_speed_samples: sensorData.filter(s => s.data_source === 'device_speed').length,
          cumulative_distance_samples: sensorData.filter(s => s.data_source === 'cumulative_distance').length,
          gps_calculation_samples: sensorData.filter(s => s.data_source === 'gps_calculation').length
        },
        total_samples: sensorData.length,
        quality_warning: sensorData.length > 0 && sensorData[0].data_quality?.confidence_level === 'low' 
          ? 'Adherence calculated from GPS data only. Precision may be affected by GPS accuracy.' 
          : null
      }
    };

    // Store analysis in database with correct nested structure
    console.log('💾 Storing analysis in database...');
    console.log('🔍 Enhanced analysis structure:', JSON.stringify(enhancedAnalysis, null, 2));
    
    // Get existing workout_analysis to preserve other fields
    const { data: existingWorkout } = await supabase
      .from('workouts')
      .select('id')
      .eq('id', workout_id)
      .single();
    
    // No need to fetch existing analysis - we're replacing it entirely with new structure
    console.log('🔍 Generating fresh workout_analysis with new structure');
    
    // 🎯 GARMIN-STYLE PERFORMANCE CALCULATION
    // Penalty-based execution scoring (honest assessment of workout compliance)
    
    let performance = {
      execution_adherence: 0,  // Overall score (100 - penalties)
      pace_adherence: 0,       // Same as overall (pace is main factor)
      duration_adherence: 0,   // Total time adherence (capped at 100%)
      completed_steps: 0,
      total_steps: computedIntervals.length
    };

    if (computedIntervals.length > 0) {
      const completedCount = computedIntervals.filter((i: any) => i.executed).length;
      performance.completed_steps = completedCount;
      
      // Calculate Garmin-style execution score using penalty system (for execution score only)
      const executionAnalysis = calculateGarminExecutionScore(computedIntervals, plannedWorkout);
      
      // ✅ PACE ADHERENCE CALCULATION
      // - Single-interval steady-state runs: Use average pace vs target range (100% if average is in range)
      // - Multi-interval workouts: Use time-in-range (sample-by-sample) since each interval has different targets
      
      // Detect if this is a single-interval steady-state workout
      const workStepsForDetection = plannedWorkout?.computed?.steps?.filter((step: any) =>
        (step.kind === 'work' || step.role === 'work') && step.pace_range
      ) || [];
      const isSingleIntervalSteadyState = workStepsForDetection.length === 1;
      
      let granularPaceAdherence = 0;
      
      if (isSingleIntervalSteadyState) {
        // SINGLE-INTERVAL STEADY-STATE: Use average pace vs target range
        console.log(`🔍 [PACE ADHERENCE] Single-interval steady-state detected`);
        console.log(`🔍 [EASY RUN CHECK] Planned workout fields:`, {
          workout_token: plannedWorkout?.workout_token,
          workout_name: plannedWorkout?.workout_name,
          name: plannedWorkout?.name,
          workout_description: plannedWorkout?.workout_description,
          description: plannedWorkout?.description,
          title: plannedWorkout?.title
        });
        
        const movingTimeForPace = workout?.computed?.overall?.duration_s_moving 
          || (workout.moving_time ? workout.moving_time * 60 : null)
          || null;
        const distanceKmForPace = workout.distance || 0;
        const distanceMiForPace = distanceKmForPace * 0.621371;
        const avgPaceSecondsForAdherence = (movingTimeForPace > 0 && distanceMiForPace > 0) 
          ? movingTimeForPace / distanceMiForPace 
          : null;
        
        const targetPaceLower = workStepsForDetection[0]?.pace_range?.lower;
        const targetPaceUpper = workStepsForDetection[0]?.pace_range?.upper;
        
        if (avgPaceSecondsForAdherence && targetPaceLower && targetPaceUpper) {
          // Determine interval type: check if it's an easy/long run or a work interval
          // Check multiple sources to catch easy runs
          const workoutToken = String(plannedWorkout?.workout_token || '').toLowerCase();
          const workoutName = String(plannedWorkout?.workout_name || plannedWorkout?.name || plannedWorkout?.title || '').toLowerCase();
          const workoutDesc = String(plannedWorkout?.workout_description || plannedWorkout?.description || plannedWorkout?.notes || '').toLowerCase();
          const stepKind = String(workStepsForDetection[0]?.kind || workStepsForDetection[0]?.role || '').toLowerCase();
          
          // Expanded detection for easy/recovery runs
          const easyKeywords = ['easy', 'long', 'recovery', 'aerobic', 'base', 'endurance', 'e pace', 'easy pace', 'z2', 'zone 2', 'easy run'];
          const isEasyOrLongRun = easyKeywords.some(kw => 
            workoutToken.includes(kw) || workoutName.includes(kw) || workoutDesc.includes(kw)
          ) || stepKind === 'easy' || stepKind === 'long' || stepKind === 'aerobic' || stepKind === 'recovery';
          console.log(`🔍 [EASY RUN DETECTION] isEasyOrLongRun=${isEasyOrLongRun}, workoutName="${workoutName}", workoutToken="${workoutToken}", stepKind="${stepKind}"`);
          
          const intervalType: IntervalType = isEasyOrLongRun ? 'easy' : 'work';
          console.log(`🔍 [INTERVAL TYPE] Detected as '${intervalType}' - token: ${workoutToken}, name: ${workoutName}, stepKind: ${stepKind}`);
          
          granularPaceAdherence = Math.round(calculatePaceRangeAdherence(avgPaceSecondsForAdherence, targetPaceLower, targetPaceUpper, intervalType));
          console.log(`🔍 [PACE ADHERENCE] Using AVERAGE pace adherence (${intervalType}): ${granularPaceAdherence}%`);
          console.log(`   - Average pace: ${(avgPaceSecondsForAdherence / 60).toFixed(2)} min/mi (${avgPaceSecondsForAdherence.toFixed(0)}s)`);
          console.log(`   - Target range: ${(targetPaceLower / 60).toFixed(2)}-${(targetPaceUpper / 60).toFixed(2)} min/mi (${targetPaceLower}-${targetPaceUpper}s)`);
          console.log(`   - In range? ${avgPaceSecondsForAdherence >= targetPaceLower && avgPaceSecondsForAdherence <= targetPaceUpper ? 'YES' : 'NO'}`);
        } else {
          // Fallback to time-in-range if we can't calculate average pace
          granularPaceAdherence = enhancedAnalysis.overall_adherence != null 
            ? Math.round(enhancedAnalysis.overall_adherence * 100)
            : 0;
          console.log(`🔍 [PACE ADHERENCE] Fallback to time-in-range: ${granularPaceAdherence}% (couldn't calculate average pace)`);
        }
      } else {
        // MULTI-INTERVAL WORKOUT: Calculate per-interval average pace adherence, then average
        console.log(`🔍 [PACE ADHERENCE] Multi-interval workout detected (${workStepsForDetection.length} work steps)`);
        
        // Calculate adherence for WORK intervals only (matches Summary view - single source of truth)
        // Summary view shows pace adherence for work intervals, not all intervals
        const workIntervalsForAdherence = computedIntervals.filter((i: any) => 
          (i.role === 'work' || i.kind === 'work') && i.executed
        );
        
        const intervalAdherences: number[] = [];
        
        // Check if this is an easy/recovery workout (overrides interval role)
        const workoutToken = String(plannedWorkout?.workout_token || '').toLowerCase();
        const workoutName = String(plannedWorkout?.workout_name || plannedWorkout?.name || plannedWorkout?.title || '').toLowerCase();
        const workoutDesc = String(plannedWorkout?.workout_description || plannedWorkout?.description || plannedWorkout?.notes || '').toLowerCase();
        const easyKeywords = ['easy', 'long', 'recovery', 'aerobic', 'base', 'endurance', 'e pace', 'easy pace', 'z2', 'zone 2', 'easy run'];
        const isEasyOrLongRunWorkout = easyKeywords.some(kw => 
          workoutToken.includes(kw) || workoutName.includes(kw) || workoutDesc.includes(kw)
        );
        console.log(`🔍 [EASY RUN DETECTION MULTI] isEasyOrLongRunWorkout=${isEasyOrLongRunWorkout}, workoutName="${workoutName}"`);
        
        for (const interval of workIntervalsForAdherence) {
          // Get the interval's actual average pace
          const actualPace = interval.executed?.avg_pace_s_per_mi || interval.executed?.pace_s_per_mi || 0;
          
          // Get the interval's target pace range
          const paceRange = interval.pace_range || interval.target_pace || interval.planned?.pace_range;
          const targetLower = paceRange?.lower || 0;
          const targetUpper = paceRange?.upper || 0;
          
          if (actualPace > 0 && targetLower > 0 && targetUpper > 0) {
            // Use asymmetric scoring - but check WORKOUT type first (overrides interval role)
            // An easy run's "work" step should still be scored as easy
            const intervalRole = isEasyOrLongRunWorkout ? 'easy' : getIntervalType(interval.role || interval.kind || 'work');
            const adherence = calculatePaceRangeAdherence(actualPace, targetLower, targetUpper, intervalRole);
            intervalAdherences.push(adherence);
            console.log(`   - Work interval ${interval.planned_step_id || 'unknown'} (${intervalRole}): ${(actualPace/60).toFixed(2)} min/mi vs ${(targetLower/60).toFixed(2)}-${(targetUpper/60).toFixed(2)} = ${adherence.toFixed(0)}%`);
          }
        }
        
        if (intervalAdherences.length > 0) {
          granularPaceAdherence = Math.round(intervalAdherences.reduce((sum, a) => sum + a, 0) / intervalAdherences.length);
          console.log(`🔍 [PACE ADHERENCE] Average of ${intervalAdherences.length} WORK intervals: ${granularPaceAdherence}% (matches Summary view)`);
        } else if (workIntervalsForAdherence.length === 0) {
          // No work intervals - this is a steady-state run, use average pace vs target (matches single-interval logic)
          console.log(`🔍 [PACE ADHERENCE] No work intervals (steady-state), calculating average pace vs target`);
          
          // Calculate overall average pace
          const movingTimeForPace = workout?.computed?.overall?.duration_s_moving 
            || (workout.moving_time ? workout.moving_time * 60 : null)
            || null;
          const distanceKmForPace = workout.distance || 0;
          const distanceMiForPace = distanceKmForPace * 0.621371;
          const avgPaceSecondsForAdherence = (movingTimeForPace > 0 && distanceMiForPace > 0) 
            ? movingTimeForPace / distanceMiForPace 
            : null;
          
          // Find target pace range from planned workout or intervals
          let targetPaceLower: number | undefined;
          let targetPaceUpper: number | undefined;
          
          // Try to get from planned workout steps (any step with pace_range)
          const stepsWithPace = plannedWorkout?.computed?.steps?.filter((step: any) => step.pace_range) || [];
          if (stepsWithPace.length > 0) {
            targetPaceLower = stepsWithPace[0]?.pace_range?.lower;
            targetPaceUpper = stepsWithPace[0]?.pace_range?.upper;
          }
          
          // Fallback: try to get from computed intervals
          if (!targetPaceLower || !targetPaceUpper) {
            const intervalsWithPace = computedIntervals.filter((i: any) => 
              (i.pace_range?.lower || i.target_pace?.lower || i.planned?.pace_range?.lower) && i.executed
            );
            if (intervalsWithPace.length > 0) {
              const paceRange = intervalsWithPace[0].pace_range || intervalsWithPace[0].target_pace || intervalsWithPace[0].planned?.pace_range;
              targetPaceLower = paceRange?.lower;
              targetPaceUpper = paceRange?.upper;
            }
          }
          
          if (avgPaceSecondsForAdherence && targetPaceLower && targetPaceUpper) {
            // Determine interval type for this steady-state workout
            const workoutToken = String(plannedWorkout?.workout_token || '').toLowerCase();
            const workoutName = String(plannedWorkout?.workout_name || plannedWorkout?.name || plannedWorkout?.title || '').toLowerCase();
            const workoutDesc = String(plannedWorkout?.workout_description || plannedWorkout?.description || plannedWorkout?.notes || '').toLowerCase();
            
            // Expanded detection for easy/recovery runs
            const easyKeywords = ['easy', 'long', 'recovery', 'aerobic', 'base', 'endurance', 'e pace', 'easy pace', 'z2', 'zone 2', 'easy run'];
            const isEasyOrLongRun = easyKeywords.some(kw => 
              workoutToken.includes(kw) || workoutName.includes(kw) || workoutDesc.includes(kw)
            );
            const intervalType: IntervalType = isEasyOrLongRun ? 'easy' : 'work';
            console.log(`🔍 [EASY RUN DETECTION FALLBACK] isEasyOrLongRun=${isEasyOrLongRun}, workoutName="${workoutName}"`);
            
            granularPaceAdherence = Math.round(calculatePaceRangeAdherence(avgPaceSecondsForAdherence, targetPaceLower, targetPaceUpper, intervalType));
            console.log(`🔍 [PACE ADHERENCE] Steady-state average pace adherence (${intervalType}): ${granularPaceAdherence}%`);
            console.log(`   - Average pace: ${(avgPaceSecondsForAdherence / 60).toFixed(2)} min/mi (${avgPaceSecondsForAdherence.toFixed(0)}s)`);
            console.log(`   - Target range: ${(targetPaceLower / 60).toFixed(2)}-${(targetPaceUpper / 60).toFixed(2)} min/mi (${targetPaceLower}-${targetPaceUpper}s)`);
          } else {
            // Fallback to time-in-range if we can't calculate average pace
            granularPaceAdherence = enhancedAnalysis.overall_adherence != null 
              ? Math.round(enhancedAnalysis.overall_adherence * 100)
              : 0;
            console.log(`🔍 [PACE ADHERENCE] Steady-state fallback to time-in-range: ${granularPaceAdherence}% (couldn't calculate average pace)`);
          }
        } else {
          // Fallback to time-in-range if we couldn't calculate per-interval adherence
          granularPaceAdherence = enhancedAnalysis.overall_adherence != null 
            ? Math.round(enhancedAnalysis.overall_adherence * 100)
            : 0;
          console.log(`🔍 [PACE ADHERENCE] Fallback to time-in-range: ${granularPaceAdherence}%`);
        }
      }
      
      console.log(`🔍 [PACE ADHERENCE] Final pace adherence: ${granularPaceAdherence}%`);
      
      // Duration adherence: Use granular duration adherence percentage
      // We have all the data - use granular analysis directly, no fallbacks
      const granularDurationAdherence = enhancedAnalysis.duration_adherence?.adherence_percentage != null
        ? Math.round(enhancedAnalysis.duration_adherence.adherence_percentage)
        : 0;
      
      console.log(`🔍 [GRANULAR CHECK] enhancedAnalysis.overall_adherence: ${enhancedAnalysis.overall_adherence}`);
      console.log(`🔍 [GRANULAR CHECK] enhancedAnalysis.duration_adherence:`, enhancedAnalysis.duration_adherence);
      console.log(`🔍 [GRANULAR CHECK] granularPaceAdherence calculated: ${granularPaceAdherence}`);
      console.log(`🔍 [GRANULAR CHECK] granularDurationAdherence calculated: ${granularDurationAdherence}`);
      
      // Use granular values directly - we have all the data
      performance.pace_adherence = granularPaceAdherence;
      performance.duration_adherence = granularDurationAdherence;
      
      // Execution adherence = combination of pace + duration (equal weight: 50% pace, 50% duration)
      // Will be recalculated after plannedPaceInfo is extracted to include average pace adherence
      performance.execution_adherence = Math.round(
        (performance.pace_adherence * 0.5) + (performance.duration_adherence * 0.5)
      );
      
      console.log(`🎯 Using adherence scores:`);
      console.log(`🎯 Pace adherence: ${granularPaceAdherence}% (${isSingleIntervalSteadyState ? 'AVERAGE pace' : 'per-interval AVERAGE pace'})`);
      console.log(`🎯 Duration adherence: ${granularDurationAdherence}% (from moving time)`);
      console.log(`🎯 Overall execution: ${performance.execution_adherence}% = (${performance.pace_adherence}% + ${performance.duration_adherence}%) / 2`);
    }

    console.log('✅ Performance calculated:', performance);

    // Attach performance to enhancedAnalysis so it's available in generateIntervalBreakdown
    // This ensures single source of truth - performance.pace_adherence matches Summary view
    enhancedAnalysis.performance = performance;

    // Extract planned pace info early so it can be passed to detailed analysis
    let plannedPaceInfo: {
      type: 'range' | 'single';
      range?: string;
      lower?: number;
      upper?: number;
      target?: string;
      targetSeconds?: number;
      workoutType: string;
    } | null = null;
    
    if (plannedWorkout?.computed?.steps) {
      const workSteps = plannedWorkout.computed.steps.filter((step: any) =>
        (step.kind === 'work' || step.role === 'work') && step.pace_range
      );

      if (workSteps.length > 0) {
        const paceRanges = workSteps.map((step: any) => ({
          lower: step.pace_range.lower,
          upper: step.pace_range.upper
        }));

        const firstRange = paceRanges[0];
        const isRangeWorkout = firstRange.lower !== firstRange.upper;

        const formatPace = (seconds: number): string => {
          const minutes = Math.floor(seconds / 60);
          const secs = Math.round(seconds % 60);
          return `${minutes}:${String(secs).padStart(2, '0')}`;
        };

        const paceUnit = userUnits === 'metric' ? 'min/km' : 'min/mi';

        if (isRangeWorkout) {
          plannedPaceInfo = {
            type: 'range',
            range: `${formatPace(firstRange.lower)}-${formatPace(firstRange.upper)} ${paceUnit}`,
            lower: firstRange.lower,
            upper: firstRange.upper,
            workoutType: 'easy/aerobic run (variability expected)'
          };
        } else {
          plannedPaceInfo = {
            type: 'single',
            target: `${formatPace(firstRange.lower)} ${paceUnit}`,
            targetSeconds: firstRange.lower,
            workoutType: 'tempo/interval run (consistency critical)'
          };
        }
        
        console.log('🎯 [PLANNED PACE] Extracted pace info:', JSON.stringify(plannedPaceInfo));
        console.log('🎯 [PLANNED PACE] Lower:', plannedPaceInfo?.lower, 'Upper:', plannedPaceInfo?.upper);
        
        // ✅ Overall adherence already calculated above: (pace_adherence + duration_adherence) / 2
        // pace_adherence = based on AVERAGE pace being in range
        // duration_adherence = based on moving time vs planned time
        console.log(`🎯 [OVERALL ADHERENCE] Final: ${performance.execution_adherence}% = (${performance.pace_adherence}% pace + ${performance.duration_adherence}% duration) / 2`);
      }
    }

    // 🚀 ENHANCED DETAILED ANALYSIS - Chart-like insights
    console.log('🚀 Starting detailed analysis generation...');
    console.log('🔍 Sensor data length:', sensorData.length);
    console.log('🔍 Computed intervals length:', computedIntervals.length);
    console.log('🔍 Enhanced analysis keys:', Object.keys(enhancedAnalysis));
    console.log('🔍 [HR DRIFT DEBUG] enhancedAnalysis.heart_rate_analysis?.hr_drift_bpm:', enhancedAnalysis?.heart_rate_analysis?.hr_drift_bpm);
    console.log('🔍 [HR DRIFT DEBUG] enhancedAnalysis.heart_rate_analysis exists:', !!enhancedAnalysis?.heart_rate_analysis);
    
    let detailedAnalysis = null;
    try {
      detailedAnalysis = generateDetailedChartAnalysis(sensorData, computedIntervals, enhancedAnalysis, plannedPaceInfo, workout, userUnits, plannedWorkout);
      console.log('📊 Detailed analysis generated successfully:', JSON.stringify(detailedAnalysis, null, 2));
    } catch (error) {
      console.error('❌ Detailed analysis generation failed:', error);
      detailedAnalysis = { error: 'Failed to generate detailed analysis', message: error.message };
    }

    // ✅ RECALCULATE EXECUTION SCORE FROM detailed_analysis.interval_breakdown (same source as segment scores)
    // ✅ RECALCULATE EXECUTION SCORE FROM detailed_analysis.interval_breakdown (same source as segment scores)
    // Weighted average: Warmup 15%, Work intervals 60%, Recoveries 10%, Cooldown 15%
    console.log(`🔍 [EXECUTION SCORE DEBUG] Checking conditions:`);
    console.log(`   - detailedAnalysis exists: ${!!detailedAnalysis}`);
    console.log(`   - interval_breakdown exists: ${!!detailedAnalysis?.interval_breakdown}`);
    console.log(`   - interval_breakdown.available: ${detailedAnalysis?.interval_breakdown?.available}`);
    console.log(`   - interval_breakdown.intervals: ${Array.isArray(detailedAnalysis?.interval_breakdown?.intervals) ? detailedAnalysis.interval_breakdown.intervals.length : 'not array'}`);
    if (detailedAnalysis && detailedAnalysis.interval_breakdown && detailedAnalysis.interval_breakdown.available) {
      // interval_breakdown is an object with .intervals array (not .summary)
      const breakdownData = detailedAnalysis.interval_breakdown;
      const intervalBreakdown = Array.isArray(breakdownData.intervals) ? breakdownData.intervals : [];      
      console.log(`🔍 [EXECUTION SCORE DEBUG] Entered calculation block, intervalBreakdown.length: ${intervalBreakdown.length}`);
      if (intervalBreakdown.length > 0) {
        // ✅ RECALCULATE PACE ADHERENCE from interval_breakdown (correct per-interval average pace adherence)
        // CRITICAL: Only use WORK intervals for pace adherence (matches Summary view - single source of truth)
        const workIntervalBreakdown = intervalBreakdown.filter(i => 
          String(i.interval_type || '').toLowerCase() === 'work'
        );
        const allPaceAdherences = workIntervalBreakdown
          .map(i => i.pace_adherence_percent)
          .filter(p => typeof p === 'number' && p > 0);
        
        if (allPaceAdherences.length > 0) {
          const avgPaceAdherence = Math.round(allPaceAdherences.reduce((sum, p) => sum + p, 0) / allPaceAdherences.length);
          console.log(`🔍 [PACE ADHERENCE] Recalculating from ${workIntervalBreakdown.length} WORK intervals only (not all ${intervalBreakdown.length} intervals):`);
          console.log(`🔍 [PACE ADHERENCE] Recalculating from interval_breakdown:`);
          console.log(`   - Individual adherences: ${allPaceAdherences.join(', ')}%`);
          console.log(`   - Average: ${avgPaceAdherence}%`);
          performance.pace_adherence = avgPaceAdherence;
          
          // Update enhancedAnalysis.performance to reflect the recalculated value (single source of truth)
          // This ensures breakdown text uses the correct value
          if (enhancedAnalysis.performance) {
            enhancedAnalysis.performance.pace_adherence = avgPaceAdherence;
            enhancedAnalysis.performance.execution_adherence = Math.round(
              (avgPaceAdherence * 0.5) + (performance.duration_adherence * 0.5)
            );
          }
          
          // Recalculate execution adherence with corrected pace adherence
          performance.execution_adherence = Math.round(
            (performance.pace_adherence * 0.5) + (performance.duration_adherence * 0.5)
          );
          console.log(`🔍 [EXECUTION] Recalculated: ${performance.execution_adherence}% = (${performance.pace_adherence}% pace + ${performance.duration_adherence}% duration) / 2`);
          
          // Update detailedAnalysis.interval_breakdown section text with corrected pace adherence
          // This ensures the breakdown text shows the correct overall percentage (matches Summary view)
          if (detailedAnalysis?.interval_breakdown?.section) {
            const sectionText = detailedAnalysis.interval_breakdown.section;
            // Replace the old "X% overall" with the correct value from work intervals
            let correctedSection = sectionText.replace(
              /PACE ADHERENCE BREAKDOWN \(\d+% overall\)/,
              `PACE ADHERENCE BREAKDOWN (${avgPaceAdherence}% overall)`
            );
            // CRITICAL: Fix execution score breakdown to show correct work interval pace (100% not 28%)
            correctedSection = correctedSection.replace(
              /✅ Work intervals: \d+% pace/g,
              `✅ Work intervals: ${avgPaceAdherence}% pace`
            );
            // Also fix the "WHY THIS MATTERS" section if it exists (should be removed but handle legacy)
            correctedSection = correctedSection.replace(
              /Your overall pace adherence is \d+% because/g,
              `Your overall pace adherence is ${avgPaceAdherence}% because`
            );
            detailedAnalysis.interval_breakdown.section = correctedSection;
            console.log(`🔍 [BREAKDOWN] Updated section text with correct pace adherence: ${avgPaceAdherence}%`);
          }
        }
        
        // First pass: count intervals by type to calculate per-interval weights
        const warmupIntervals = intervalBreakdown.filter(i => String(i.interval_type || '').toLowerCase() === 'warmup');
        const workIntervals = intervalBreakdown.filter(i => String(i.interval_type || '').toLowerCase() === 'work');
        const recoveryIntervals = intervalBreakdown.filter(i => String(i.interval_type || '').toLowerCase() === 'recovery');
        const cooldownIntervals = intervalBreakdown.filter(i => String(i.interval_type || '').toLowerCase() === 'cooldown');
        
        // Calculate per-interval weights (divide total segment weight by count)
        const warmupWeightPerInterval = warmupIntervals.length > 0 ? 0.15 / warmupIntervals.length : 0;
        const workWeightPerInterval = workIntervals.length > 0 ? 0.60 / workIntervals.length : 0;
        const recoveryWeightPerInterval = recoveryIntervals.length > 0 ? 0.10 / recoveryIntervals.length : 0;
        const cooldownWeightPerInterval = cooldownIntervals.length > 0 ? 0.15 / cooldownIntervals.length : 0;
        
        let weightedSum = 0;
        let totalWeight = 0;
        const segmentScores: any[] = [];
        
        for (const interval of intervalBreakdown) {
          const intervalType = String(interval.interval_type || '').toLowerCase();
          let weight = 0;
          
          // Assign per-interval weights based on interval type
          if (intervalType === 'warmup') {
            weight = warmupWeightPerInterval;
          } else if (intervalType === 'work') {
            weight = workWeightPerInterval;
          } else if (intervalType === 'recovery') {
            weight = recoveryWeightPerInterval;
          } else if (intervalType === 'cooldown') {
            weight = cooldownWeightPerInterval;
          }
          
          if (weight > 0) {
            // ✅ FIX: Use actual pace and duration adherence, not performance_score
            // performance_score from interval_breakdown uses average pace (100%), not time-in-range (66%)
            // Overall adherence should reflect actual execution consistency, not just hitting an average
            const paceAdherence = interval.pace_adherence_percent || 0;
            const durationAdherence = interval.duration_adherence_percent || 0;
            
            // Calculate segment score from actual adherence metrics (50% pace, 50% duration)
            const segmentScore = (paceAdherence + durationAdherence) / 2;
            
            const weightedContribution = segmentScore * weight;
            weightedSum += weightedContribution;
            totalWeight += weight;
            
            segmentScores.push({
              type: intervalType,
              interval_number: interval.interval_number || interval.recovery_number || '',
              performance_score: segmentScore,
              pace_adherence: paceAdherence,
              duration_adherence: durationAdherence,
              weight: weight,
              weighted_contribution: weightedContribution
            });
          }
        }
        
        if (totalWeight > 0) {
          const calculatedExecutionScore = Math.round(weightedSum / totalWeight);
          // ✅ Keep the correct calculation: (pace_adherence + duration_adherence) / 2
          // pace_adherence = average pace in range (100% if average is within target)
          // duration_adherence = moving time vs planned time
          // Only use interval_breakdown calculation as fallback
          if (performance.pace_adherence > 0 && performance.duration_adherence > 0) {
            // Already calculated correctly above - don't overwrite
            console.log(`🎯 [EXECUTION SCORE] Keeping main calculation: ${performance.execution_adherence}% = (${performance.pace_adherence}% pace + ${performance.duration_adherence}% duration) / 2`);
            console.log(`🎯 [EXECUTION SCORE] (Interval breakdown alternative would be: ${calculatedExecutionScore}%)`);
          } else {
            // Fallback: use interval_breakdown calculation if pace/duration not available
            performance.execution_adherence = calculatedExecutionScore;
          }
          
          console.log(`🎯 [EXECUTION SCORE] Recalculated from detailed_analysis.interval_breakdown:`);
          console.log(`   - Interval counts: Warmup=${warmupIntervals.length}, Work=${workIntervals.length}, Recovery=${recoveryIntervals.length}, Cooldown=${cooldownIntervals.length}`);
          console.log(`   - Per-interval weights: Warmup=${(warmupWeightPerInterval*100).toFixed(1)}%, Work=${(workWeightPerInterval*100).toFixed(1)}%, Recovery=${(recoveryWeightPerInterval*100).toFixed(1)}%, Cooldown=${(cooldownWeightPerInterval*100).toFixed(1)}%`);
          console.log(`   - Segment breakdown:`);
          segmentScores.forEach(seg => {
            console.log(`     ${seg.type} ${seg.interval_number || ''}: score=${seg.performance_score.toFixed(1)}%, pace=${seg.pace_adherence.toFixed(1)}%, duration=${seg.duration_adherence.toFixed(1)}%, weight=${(seg.weight*100).toFixed(2)}%, contribution=${seg.weighted_contribution.toFixed(2)}`);
          });
          console.log(`   - Weighted sum: ${weightedSum.toFixed(2)}`);
          console.log(`   - Total weight: ${totalWeight.toFixed(2)}`);
          console.log(`   - Weighted average: ${(weightedSum / totalWeight).toFixed(2)}%`);
          console.log(`   - Final execution score (rounded): ${calculatedExecutionScore}%`);
        }
        }

    }    // 🤖 GENERATE AI NARRATIVE INSIGHTS
    let narrativeInsights = null;
    try {
      console.log('🤖 [CRITICAL] Starting AI narrative generation...');
      console.log('🤖 [CRITICAL] Checking for OPENAI_API_KEY...');
      const hasKey = !!Deno.env.get('OPENAI_API_KEY');
      console.log('🤖 [CRITICAL] OPENAI_API_KEY present:', hasKey);
      console.log('🤖 [CRITICAL] User units preference:', userUnits);
      
      narrativeInsights = await generateAINarrativeInsights(
        sensorData,
        workout,
        plannedWorkout,
        enhancedAnalysis,
        performance,
        detailedAnalysis,
        userUnits,
        supabase
      );
      console.log('✅ [CRITICAL] AI narrative generated:', JSON.stringify(narrativeInsights));
      console.log('✅ [CRITICAL] AI narrative is array:', Array.isArray(narrativeInsights));
      console.log('✅ [CRITICAL] AI narrative length:', narrativeInsights?.length);
    } catch (error) {
      console.error('❌ [CRITICAL] AI narrative generation failed:', error);
      console.error('❌ [CRITICAL] Error message:', error.message);
      console.error('❌ [CRITICAL] Error stack:', error.stack);
      narrativeInsights = null; // Continue without narrative if AI fails
    }

    // Store enhanced intervals back to computed.intervals (single source of truth)
    // Store summary analysis in workout_analysis
    console.log('💾 [TIMING] Starting database update...');
    console.log('💾 [TIMING] Updating computed.intervals with', computedIntervals.length, 'intervals');
    
    // CRITICAL: Re-read workout to get latest computed.overall and computed.analysis from compute-workout-analysis
    // This ensures we preserve data even if compute-workout-analysis finished writing after we first read
    console.log('🔄 Re-reading workout to get latest computed data from compute-workout-analysis...');
    const { data: latestWorkout, error: reReadError } = await supabase
      .from('workouts')
      .select('computed')
      .eq('id', workout_id)
      .single();
    
    if (reReadError) {
      console.warn('⚠️ Failed to re-read workout, using original data:', reReadError.message);
    }
    
    // Use latest workout data if available, otherwise fall back to original
    const workoutToUse = latestWorkout || workout;
    
    // Build minimal computed object - DON'T spread (avoids sending thousands of sensor samples)
    // CRITICAL: Preserve analysis.series and overall from compute-workout-analysis (contains chart data and metrics)
    const minimalComputed: any = {
      version: workoutToUse.computed?.version || workout.computed?.version || '1.0',
      intervals: computedIntervals,  // Enhanced with granular_metrics
      planned_steps_light: workoutToUse.computed?.planned_steps_light || workout.computed?.planned_steps_light || null
    };
    // Only include overall/analysis if they exist (preserve from compute-workout-analysis)
    if (workoutToUse.computed?.overall || workout.computed?.overall) {
      minimalComputed.overall = workoutToUse.computed?.overall || workout.computed?.overall;
      console.log('✅ Preserving overall from compute-workout-analysis');
    }
    if (workoutToUse.computed?.analysis || workout.computed?.analysis) {
      minimalComputed.analysis = workoutToUse.computed?.analysis || workout.computed?.analysis;
      console.log('✅ Preserving analysis.series from compute-workout-analysis');
    } else {
      console.warn('⚠️ No analysis.series found - compute-workout-analysis may not have completed yet');
    }
    
    // Create analysis_v2 with version metadata
    const analysisV2 = {
      _meta: {
        version: "2.0",
        source: "analyze-running-workout",
        generated_at: new Date().toISOString(),
        generator_version: "2.0.1"
      },
      granular_analysis: enhancedAnalysis,
      performance: performance,
      detailed_analysis: detailedAnalysis
    };

    // Log what we're about to write
    console.log('🔍 [PRE-UPDATE DEBUG] About to write to database:');
    console.log('  - detailedAnalysis type:', typeof detailedAnalysis);
    console.log('  - detailedAnalysis is null?:', detailedAnalysis === null);
    console.log('  - detailedAnalysis keys:', detailedAnalysis ? Object.keys(detailedAnalysis) : 'N/A');
    console.log('  - detailedAnalysis value:', JSON.stringify(detailedAnalysis, null, 2));
    
    // Fetch plan context for smarter, plan-aware verbiage
    let planContext = null;
    if (plannedWorkout?.training_plan_id && workout?.date) {
      planContext = await fetchPlanContextForWorkout(
        supabase,
        workout.user_id,
        plannedWorkout.training_plan_id,
        workout.date
      );
      console.log('📋 [PLAN CONTEXT] Fetched:', planContext ? {
        weekIndex: planContext.weekIndex,
        weekIntent: planContext.weekIntent,
        isRecoveryWeek: planContext.isRecoveryWeek,
        phaseName: planContext.phaseName
      } : 'No plan context');
    }

    // Structured adherence summary (verdict + technical insights + plan impact)
    const adherenceSummary = generateAdherenceSummary(performance, detailedAnalysis, plannedWorkout, planContext, enhancedAnalysis);
    const scoreExplanation = adherenceSummary?.verdict ?? null;
    console.log('📝 [ADHERENCE SUMMARY] verdict:', scoreExplanation, 'technical_insights:', adherenceSummary?.technical_insights?.length, 'plan_impact:', !!adherenceSummary?.plan_impact);
    
    // Use RPC to merge computed (preserves analysis.series from compute-workout-analysis)
    // RPC is required - no fallbacks to prevent data loss
    const { error: rpcError } = await supabase.rpc('merge_computed', {
      p_workout_id: workout_id,
      p_partial_computed: minimalComputed
    });
    
    if (rpcError) {
      console.error('[analyze-running-workout] RPC merge_computed failed:', rpcError);
      throw new Error(`Failed to merge computed data: ${rpcError.message}. RPC function merge_computed is required.`);
    }
    
    // Update workout_analysis separately (doesn't conflict with computed)
    const updatePayload = {
      workout_analysis: {
        // DON'T spread existingAnalysis - replace entirely with new structure
        granular_analysis: enhancedAnalysis,
        performance: performance,
        detailed_analysis: detailedAnalysis,
        narrative_insights: narrativeInsights,  // AI-generated human-readable insights
        score_explanation: scoreExplanation,  // Backward-compat: single verdict line
        adherence_summary: adherenceSummary ?? null,  // Structured: verdict + technical_insights + plan_impact
        mile_by_mile_terrain: detailedAnalysis?.mile_by_mile_terrain || null,  // Include terrain breakdown
        // NEW: Structured HR summary for weekly/block context aggregation
        heart_rate_summary: hrAnalysisResult.summary
      },
      analysis_status: 'complete',
      analyzed_at: new Date().toISOString()
    };
    
    console.log('🔍 [PRE-UPDATE DEBUG] Full update payload workout_analysis keys:', 
      Object.keys(updatePayload.workout_analysis));
    
    // Update workout_analysis and status
    const { error: updateError } = await supabase
      .from('workouts')
      .update(updatePayload)
      .eq('id', workout_id);

    console.log('✅ [TIMING] Database update completed!');
    
    if (updateError) {
      console.error('❌ Database update FAILED:', updateError);
      console.error('❌ Update payload:', JSON.stringify({
        computed: minimalComputed,
        workout_analysis: {
          ...existingAnalysis,
          granular_analysis: enhancedAnalysis,
          performance: performance
        }
      }, null, 2));
    } else {
      console.log('✅ Analysis stored successfully in database');
      console.log('🔍 Stored performance:', JSON.stringify(performance, null, 2));
      console.log('🔍 Stored granular_analysis keys:', Object.keys(enhancedAnalysis));
      
      // Verify the update actually worked by reading it back
      const { data: verifyData, error: verifyError } = await supabase
        .from('workouts')
        .select('workout_analysis')
        .eq('id', workout_id)
        .single();
      
      if (verifyError) {
        console.error('❌ Verification read failed:', verifyError);
      } else {
        console.log('✅ [POST-UPDATE VERIFY] workout_analysis keys in DB:', verifyData?.workout_analysis ? Object.keys(verifyData.workout_analysis) : 'NULL');
        console.log('✅ [POST-UPDATE VERIFY] Has performance?:', !!verifyData?.workout_analysis?.performance);
        console.log('✅ [POST-UPDATE VERIFY] Has granular_analysis?:', !!verifyData?.workout_analysis?.granular_analysis);
        console.log('✅ [POST-UPDATE VERIFY] Has detailed_analysis?:', !!verifyData?.workout_analysis?.detailed_analysis);
        
        if (verifyData?.workout_analysis?.detailed_analysis) {
          console.log('✅ [POST-UPDATE VERIFY] detailed_analysis keys:', Object.keys(verifyData.workout_analysis.detailed_analysis));
        } else {
          console.error('❌ [POST-UPDATE VERIFY] detailed_analysis is MISSING from database after write!');
          console.error('❌ [POST-UPDATE VERIFY] This means either:');
          console.error('   1. The update payload did not include it');
          console.error('   2. A database trigger/constraint removed it');
          console.error('   3. Supabase client serialization issue');
        }
      }
    }

    console.log(`✅ Running analysis complete for workout ${workout_id}`);
    console.log(`📊 Overall adherence: ${(analysis.overall_adherence * 100).toFixed(1)}%`);
    console.log(`🎯 Performance: ${analysis.performance_assessment}`);

    return new Response(JSON.stringify({
      success: true,
      analysis: enhancedAnalysis,
      intervals: computedIntervals,
      performance: performance,
      detailed_analysis: detailedAnalysis  // Include in response to avoid extra DB reload
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
      }
    });

  } catch (error) {
    console.error('❌ Analyze running workout error:', error);
    
    // Set analysis status to 'failed' and capture error message
    try {
      await supabase
        .from('workouts')
        .update({ 
          analysis_status: 'failed',
          analysis_error: error.message || 'Internal server error'
        })
        .eq('id', workout_id);
    } catch (statusError) {
      console.error('❌ Failed to set error status:', statusError);
    }
    
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
      }
    });
  }
});

/**
 * REMOVED: Types and granular pace adherence (moved to lib/adherence/granular-pace.ts)
 * - PrescribedRangeAdherence, IntervalAnalysis, SampleTiming
 * - calculatePrescribedRangeAdherenceGranular, calculateIntervalPaceAdherence,
 *   calculateSteadyStatePaceAdherence, analyzeIntervalPace
 * - createEmptyAdherence, calculateAveragePace, calculateStandardDeviation,
 *   calculateIntervalAveragePaceAdherence
 */

/**
 * REMOVED: calculatePrescribedRangeAdherence - Dead code, never called
 * Replaced by calculatePrescribedRangeAdherenceGranular
 * 
 * Removed ~960 lines of dead code including:
 * - calculatePrescribedRangeAdherence
 * - calculateEnhancedAdherence  
 * - All helper functions only used by dead code
 */

/**
 * Generate detailed, chart-like analysis with specific metrics
 * Provides actionable insights similar to Garmin Connect analysis
 */
function generateDetailedChartAnalysis(sensorData: any[], intervals: any[], granularAnalysis: any, plannedPaceInfo: any, workout?: any, userUnits: 'metric' | 'imperial' = 'imperial', plannedWorkout?: any): any {
  console.log('📊 Generating detailed chart analysis...');
  
  // Extract work intervals for detailed analysis
  const workIntervals = intervals.filter(i => i.role === 'work' && i.executed);
  const recoveryIntervals = intervals.filter(i => i.role === 'recovery' && i.executed);
  
  // Speed fluctuation analysis
  const speedAnalysis = analyzeSpeedFluctuations(sensorData, workIntervals);
  
  // Heart rate recovery analysis
  const hrRecoveryAnalysis = analyzeHeartRateRecovery(sensorData, workIntervals, recoveryIntervals);
  
  // Get pace adherence from performance (single source of truth - matches Summary view)
  // This is the interval-average pace adherence, not time-in-range score
  const paceAdherenceForBreakdown = performance?.pace_adherence != null
    ? Math.round(performance.pace_adherence)
    : undefined;
  
  // Interval-by-interval breakdown
  // For steady-state runs with no work intervals, use all intervals (warmup/work/recovery/cooldown)
  // Otherwise use only work intervals
  const intervalsForBreakdown = workIntervals.length > 0 ? workIntervals : intervals.filter(i => i.executed);
  const intervalBreakdown = generateIntervalBreakdown(intervalsForBreakdown, intervals, paceAdherenceForBreakdown, granularAnalysis, sensorData, userUnits, plannedWorkout, workout);
  
  // Pacing consistency analysis
  // Pacing consistency analysis (stub - function was removed during refactor)
  const pacingConsistency = { available: false, message: 'Pacing consistency analysis not available' };
  
  // Calculate workout-level average pace (from moving_time/distance) to pass to mile breakdown
  // This ensures consistency between AI narrative and pattern analysis
  const workoutMovingTimeSeconds = workout?.computed?.overall?.duration_s_moving 
    || (workout?.moving_time ? workout.moving_time * 60 : null)
    || (workout?.duration ? workout.duration * 60 : 0);
  const workoutDistanceKm = workout?.distance || 0;
  const workoutDistanceMi = workoutDistanceKm * 0.621371;
  const workoutAvgPaceSeconds = (workoutMovingTimeSeconds > 0 && workoutDistanceMi > 0) 
    ? workoutMovingTimeSeconds / workoutDistanceMi 
    : null;
  
  // Detect if this is an interval workout (multiple work segments or alternating work/recovery)
  // Interval workouts should NOT have mile-by-mile breakdown - use interval breakdown instead
  const isIntervalWorkout = workIntervals.length > 1 || 
    (workIntervals.length >= 1 && recoveryIntervals.length >= 1 && intervals.length > 2);
  
  // Generate mile-by-mile terrain breakdown ONLY for continuous runs (not interval workouts)
  const mileByMileTerrain = isIntervalWorkout ? null : generateMileByMileTerrainBreakdown(
    sensorData, 
    intervals, 
    granularAnalysis, 
    plannedPaceInfo,
    workoutAvgPaceSeconds
  );
  
  return {
    speed_fluctuations: speedAnalysis,
    heart_rate_recovery: hrRecoveryAnalysis,
    interval_breakdown: intervalBreakdown,
    pacing_consistency: pacingConsistency,
    workout_summary: {
      total_intervals: workIntervals.length,
      completed_intervals: workIntervals.filter(i => i.executed).length,
      average_pace_adherence: workIntervals.length > 0 ? 
        workIntervals.reduce((sum, i) => sum + (i.pace_adherence || 0), 0) / workIntervals.length : 0,
      pace_variability: granularAnalysis.pacing_analysis?.pacing_variability || 0,
      // HR drift now comes from consolidated HR analysis module (handles tempo_finish, terrain, etc.)
      hr_drift: granularAnalysis.heart_rate_analysis?.hr_drift_bpm ?? null
    },
    mile_by_mile_terrain: mileByMileTerrain
  };
}

/**
 * Analyze speed fluctuations throughout the workout
 */
function analyzeSpeedFluctuations(sensorData: any[], workIntervals: any[]): any {
  if (workIntervals.length === 0) {
    return { available: false, message: 'No work intervals to analyze' };
  }
  
  // Extract pace data from work intervals
  const paceData = [];
  let currentTime = 0;
  
  for (const interval of workIntervals) {
    const intervalSamples = sensorData.filter(s => 
      s.timestamp >= interval.start_time_s && s.timestamp <= interval.end_time_s
    );
    
    for (const sample of intervalSamples) {
      if (sample.pace_s_per_mi && sample.pace_s_per_mi > 0) {
        paceData.push({
          time_s: currentTime + (sample.timestamp - interval.start_time_s),
          pace_min_per_mi: sample.pace_s_per_mi / 60,
          interval_type: interval.role
        });
      }
    }
    currentTime += interval.duration_s;
  }
  
  if (paceData.length === 0) {
    return { available: false, message: 'No pace data available' };
  }
  
  // Calculate pace statistics
  const paces = paceData.map(d => d.pace_min_per_mi);
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const paceRange = maxPace - minPace;
  
  // Calculate pace variability (coefficient of variation)
  const variance = paces.reduce((sum, pace) => sum + Math.pow(pace - avgPace, 2), 0) / paces.length;
  const stdDev = Math.sqrt(variance);
  const paceVariability = (stdDev / avgPace) * 100;
  
  // Identify pace patterns
  // Identify pace patterns (stub - function was removed during refactor)
  const patterns: any[] = [];
  
  return {
    available: true,
    average_pace_min_per_mi: Math.round(avgPace * 100) / 100,
    pace_range_min_per_mi: Math.round(paceRange * 100) / 100,
    fastest_pace_min_per_mi: Math.round(minPace * 100) / 100,
    slowest_pace_min_per_mi: Math.round(maxPace * 100) / 100,
    pace_variability_percent: Math.round(paceVariability * 10) / 10,
    pace_consistency_score: Math.max(0, 100 - paceVariability), // Higher is better
    patterns: patterns,
    data_points: paceData.length
  };
}

/**
 * Analyze heart rate recovery between intervals
 */
function analyzeHeartRateRecovery(sensorData: any[], workIntervals: any[], recoveryIntervals: any[]): any {
  if (workIntervals.length === 0 || recoveryIntervals.length === 0) {
    return { available: false, message: 'Need both work and recovery intervals for HR analysis' };
  }
  
  const hrRecoveryData = [];
  
  // Analyze HR recovery for each work-recovery pair
  for (let i = 0; i < Math.min(workIntervals.length, recoveryIntervals.length); i++) {
    const workInterval = workIntervals[i];
    const recoveryInterval = recoveryIntervals[i];
    
    // Get HR at end of work interval
    const workEndSamples = sensorData.filter(s => 
      s.timestamp >= workInterval.end_time_s - 10 && s.timestamp <= workInterval.end_time_s
    );
    const workEndHR = workEndSamples
      .filter(s => s.heart_rate && s.heart_rate > 0)
      .map(s => s.heart_rate);
    
    // Get HR at end of recovery interval
    const recoveryEndSamples = sensorData.filter(s => 
      s.timestamp >= recoveryInterval.end_time_s - 10 && s.timestamp <= recoveryInterval.end_time_s
    );
    const recoveryEndHR = recoveryEndSamples
      .filter(s => s.heart_rate && s.heart_rate > 0)
      .map(s => s.heart_rate);
    
    if (workEndHR.length > 0 && recoveryEndHR.length > 0) {
      const avgWorkEndHR = workEndHR.reduce((a, b) => a + b, 0) / workEndHR.length;
      const avgRecoveryEndHR = recoveryEndHR.reduce((a, b) => a + b, 0) / recoveryEndHR.length;
      const hrDrop = avgWorkEndHR - avgRecoveryEndHR;
      
      hrRecoveryData.push({
        interval_number: i + 1,
        work_end_hr: Math.round(avgWorkEndHR),
        recovery_end_hr: Math.round(avgRecoveryEndHR),
        hr_drop_bpm: Math.round(hrDrop),
        recovery_time_s: recoveryInterval.duration_s,
        recovery_efficiency: hrDrop / recoveryInterval.duration_s // BPM drop per second
      });
    }
  }
  
  if (hrRecoveryData.length === 0) {
    return { available: false, message: 'No heart rate recovery data available' };
  }
  
  // Calculate recovery statistics
  const avgHRDrop = hrRecoveryData.reduce((sum, d) => sum + d.hr_drop_bpm, 0) / hrRecoveryData.length;
  const avgRecoveryEfficiency = hrRecoveryData.reduce((sum, d) => sum + d.recovery_efficiency, 0) / hrRecoveryData.length;
  
  // Assess recovery quality
  const recoveryQuality = avgHRDrop > 20 ? 'Excellent' : 
                         avgHRDrop > 15 ? 'Good' : 
                         avgHRDrop > 10 ? 'Fair' : 'Poor';
  
  return {
    available: true,
    average_hr_drop_bpm: Math.round(avgHRDrop),
    average_recovery_efficiency: Math.round(avgRecoveryEfficiency * 100) / 100,
    recovery_quality: recoveryQuality,
    intervals_analyzed: hrRecoveryData.length,
    recovery_data: hrRecoveryData
  };
}



// AI Narrative generation moved to lib/narrative/ai-generator.ts
// Plan context moved to lib/plan-context.ts

/** Structured adherence summary: verdict + technical insights + plan impact (interpret, don't mirror). */
export interface WorkoutAdherenceSummary {
  verdict: string;
  technical_insights: { label: string; value: string }[];
  plan_impact: { focus: string; outlook: string };
}

function generateAdherenceSummary(
  performance: { execution_adherence: number; pace_adherence: number; duration_adherence: number },
  detailedAnalysis: any,
  plannedWorkout: any,
  planContext: {
    hasActivePlan: boolean;
    weekIndex: number | null;
    weekIntent: string;
    isRecoveryWeek: boolean;
    isTaperWeek: boolean;
    phaseName: string | null;
    weekFocusLabel: string | null;
    planName: string | null;
  } | null,
  granularAnalysis?: any
): WorkoutAdherenceSummary | null {
  const intervalBreakdown = detailedAnalysis?.interval_breakdown;
  
  // Only generate for interval workouts with breakdown data
  if (!intervalBreakdown?.available || !intervalBreakdown?.intervals?.length) {
    return null;
  }

  const intervals = intervalBreakdown.intervals;
  const workIntervals = intervals.filter((i: any) => i.interval_type === 'work');
  
  if (workIntervals.length === 0) {
    return null;
  }
  
  // Detect if this is an easy/recovery run (affects messaging)
  const workoutToken = String(plannedWorkout?.workout_token || '').toLowerCase();
  const workoutName = String(plannedWorkout?.workout_name || plannedWorkout?.name || plannedWorkout?.title || '').toLowerCase();
  const workoutDesc = String(plannedWorkout?.workout_description || plannedWorkout?.description || plannedWorkout?.notes || '').toLowerCase();
  const easyKeywords = ['easy', 'long', 'recovery', 'aerobic', 'base', 'endurance', 'e pace', 'easy pace', 'z2', 'zone 2', 'easy run'];
  const isEasyOrRecoveryRun = easyKeywords.some(kw => 
    workoutToken.includes(kw) || workoutName.includes(kw) || workoutDesc.includes(kw)
  );
  
  // Plan-aware context: use plan week intent if available, otherwise fall back to workout detection
  const isRecoveryContext = planContext?.isRecoveryWeek || planContext?.weekIntent === 'recovery' || isEasyOrRecoveryRun;
  const isTaperContext = planContext?.isTaperWeek || planContext?.weekIntent === 'taper';
  const isBuildContext = planContext?.weekIntent === 'build' || planContext?.weekIntent === 'peak';
  const weekNumber = planContext?.weekIndex;
  const currentPhaseName = planContext?.phaseName ?? null;
  
  console.log(`🔍 [EXPLANATION CONTEXT] isEasyOrRecoveryRun=${isEasyOrRecoveryRun}, planContext=${planContext ? JSON.stringify({ weekIntent: planContext.weekIntent, isRecoveryWeek: planContext.isRecoveryWeek, weekIndex: planContext.weekIndex }) : 'none'}`);

  // Format pace from seconds to MM:SS
  const fmtPace = (secPerMi: number): string => {
    if (!secPerMi || secPerMi <= 0) return 'N/A';
    const mins = Math.floor(secPerMi / 60);
    const secs = Math.round(secPerMi % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Format delta as readable string
  const fmtDelta = (deltaSeconds: number): string => {
    const mins = Math.floor(deltaSeconds / 60);
    const secs = Math.round(deltaSeconds % 60);
    return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
  };

  // Analyze pace deviations for each work interval
  interface Deviation {
    interval: number;
    actual: string;
    target: string;
    delta: number;
    direction: 'fast' | 'slow' | 'ok';
  }
  
  const deviations: Deviation[] = [];
  
  for (const interval of workIntervals) {
    const actualPaceSecPerMi = (interval.actual_pace_min_per_mi || 0) * 60;
    const targetLower = interval.planned_pace_range_lower || 0;
    const targetUpper = interval.planned_pace_range_upper || 0;
    
    if (actualPaceSecPerMi > 0 && targetLower > 0 && targetUpper > 0) {
      let direction: 'fast' | 'slow' | 'ok' = 'ok';
      let delta = 0;
      
      if (actualPaceSecPerMi < targetLower) {
        direction = 'fast';
        delta = targetLower - actualPaceSecPerMi;
      } else if (actualPaceSecPerMi > targetUpper) {
        direction = 'slow';
        delta = actualPaceSecPerMi - targetUpper;
      }
      
      deviations.push({
        interval: interval.interval_number || deviations.length + 1,
        actual: fmtPace(actualPaceSecPerMi),
        target: `${fmtPace(targetLower)}-${fmtPace(targetUpper)}`,
        delta,
        direction
      });
    }
  }

  if (deviations.length === 0) {
    return null;
  }

  // Summarize deviations by direction
  const fastIntervals = deviations.filter(d => d.direction === 'fast');
  const slowIntervals = deviations.filter(d => d.direction === 'slow');
  const okIntervals = deviations.filter(d => d.direction === 'ok');
  
  // Build explanation text - reflect ASYMMETRIC scoring philosophy
  // Work intervals: faster = minor penalty (strong), slower = full penalty (missed effort)
  // Recovery/easy: faster = penalty (didn't recover), slower = fine
  const parts: string[] = [];
  
  // Get the target range for display (use first interval's range as representative)
  const targetRange = deviations[0]?.target || '';
  const paceAdherencePct = Math.round(performance.pace_adherence);
  
  if (paceAdherencePct >= 95 && okIntervals.length === deviations.length) {
    // Perfect or near-perfect adherence - plan-aware
    if (planContext?.hasActivePlan && isBuildContext) {
      const weekInfo = weekNumber ? ` (Week ${weekNumber})` : '';
      parts.push(`Build week${weekInfo}: All ${deviations.length} work intervals within prescribed ${targetRange}/mi range — excellent execution`);
    } else if (planContext?.isRecoveryWeek) {
      parts.push(`Recovery week: All ${deviations.length} intervals within prescribed ${targetRange}/mi range — perfect pacing for adaptation`);
    } else {
      parts.push(`All ${deviations.length} work intervals within prescribed ${targetRange}/mi range`);
    }
  } else if (paceAdherencePct >= 85) {
    // Good execution
    if (fastIntervals.length > 0 && slowIntervals.length === 0) {
      const avgFastDelta = Math.round(fastIntervals.reduce((sum, d) => sum + d.delta, 0) / fastIntervals.length);
      if (planContext?.hasActivePlan && isBuildContext) {
        const weekInfo = weekNumber ? ` (Week ${weekNumber})` : '';
        parts.push(`Build week${weekInfo}: Strong execution — ${fastIntervals.length} of ${deviations.length} intervals ran ${fmtDelta(avgFastDelta)}/mi faster than target`);
      } else {
        parts.push(`Strong execution — ${fastIntervals.length} of ${deviations.length} intervals ran ${fmtDelta(avgFastDelta)}/mi faster than target`);
      }
    } else if (slowIntervals.length > 0 && isRecoveryContext) {
      // Recovery/easy run where slower is fine - make it plan-aware
      const avgSlowDelta = Math.round(slowIntervals.reduce((sum, d) => sum + d.delta, 0) / slowIntervals.length);
      
      if (planContext?.isRecoveryWeek) {
        // Recovery week: emphasize that slower is intentional and beneficial
        const weekInfo = weekNumber ? `Week ${weekNumber}` : '';
        parts.push(`Recovery week ${weekInfo}: Completed ${fmtDelta(avgSlowDelta)}/mi slower than target — perfect for adaptation and supercompensation`);
      } else if (planContext?.hasActivePlan && isEasyOrRecoveryRun) {
        // Easy run during build week: still good, but note it's for recovery
        parts.push(`Easy run completed ${fmtDelta(avgSlowDelta)}/mi slower than target — good recovery effort, maintaining aerobic base`);
      } else {
        // Generic easy run (no plan context)
        parts.push(`Easy run completed ${fmtDelta(avgSlowDelta)}/mi slower than target — good recovery effort`);
      }
    } else if (slowIntervals.length > 0) {
      parts.push(`${okIntervals.length} of ${deviations.length} intervals on target`);
    } else {
      parts.push(`Good pace execution across ${deviations.length} intervals`);
    }
  } else if (paceAdherencePct >= 50) {
    // Moderate adherence - explain what happened
    if (fastIntervals.length > 0 && slowIntervals.length === 0) {
      const avgFastDelta = Math.round(fastIntervals.reduce((sum, d) => sum + d.delta, 0) / fastIntervals.length);
      if (isRecoveryContext) {
        // Recovery/easy run that was too fast
        if (planContext?.isRecoveryWeek) {
          parts.push(`Recovery week: Ran ${fmtDelta(avgFastDelta)}/mi faster than target — too hard for recovery, limits adaptation and supercompensation`);
        } else if (planContext?.hasActivePlan) {
          parts.push(`Easy run was ${fmtDelta(avgFastDelta)}/mi faster than target — running too hard on recovery days limits adaptation`);
        } else {
          parts.push(`Easy run was ${fmtDelta(avgFastDelta)}/mi faster than target — running too hard on recovery days limits adaptation`);
        }
      } else {
        parts.push(`Completed intervals ${fmtDelta(avgFastDelta)}/mi faster than prescribed (${targetRange}/mi)`);
        if (avgFastDelta > 30) {
          parts.push(`significantly faster than target — consider injury risk`);
        }
      }
    } else if (slowIntervals.length > 0 && fastIntervals.length === 0) {
      const avgSlowDelta = Math.round(slowIntervals.reduce((sum, d) => sum + d.delta, 0) / slowIntervals.length);
      if (isRecoveryContext) {
        // Recovery/easy run where slower is totally fine
        if (planContext?.isRecoveryWeek) {
          parts.push(`Recovery week: Completed ${fmtDelta(avgSlowDelta)}/mi slower than target — optimal for adaptation`);
        } else {
          parts.push(`Easy run completed ${fmtDelta(avgSlowDelta)}/mi slower than target — recovery achieved`);
        }
      } else {
        // Work intervals that were too slow - plan-aware messaging
        if (planContext?.hasActivePlan && isBuildContext) {
          const weekInfo = weekNumber ? ` (Week ${weekNumber})` : '';
          parts.push(`Build week${weekInfo}: ${slowIntervals.length} of ${deviations.length} intervals ran ${fmtDelta(avgSlowDelta)}/mi slower than target — missed intended stimulus, may limit progression`);
        } else {
          parts.push(`${slowIntervals.length} of ${deviations.length} intervals ran ${fmtDelta(avgSlowDelta)}/mi slower than target (${targetRange}/mi) — missed intended effort`);
        }
      }
    } else if (fastIntervals.length > 0 && slowIntervals.length > 0) {
      parts.push(`Inconsistent pacing: ${fastIntervals.length} intervals fast, ${slowIntervals.length} slow`);
    }
  } else {
    // Low adherence - explain the issue  
    if (slowIntervals.length > 0) {
      const avgSlowDelta = Math.round(slowIntervals.reduce((sum, d) => sum + d.delta, 0) / slowIntervals.length);
      if (isRecoveryContext) {
        // Recovery/easy run - slower is fine
        if (planContext?.isRecoveryWeek) {
          parts.push(`Recovery week: Completed ${fmtDelta(avgSlowDelta)}/mi slower than target — still achieved recovery benefit`);
        } else {
          parts.push(`Easy run completed ${fmtDelta(avgSlowDelta)}/mi slower than target — still achieved recovery benefit`);
        }
      } else {
        // Work intervals that missed target significantly
        if (planContext?.hasActivePlan && isBuildContext) {
          const weekInfo = weekNumber ? ` (Week ${weekNumber})` : '';
          parts.push(`Build week${weekInfo}: ${slowIntervals.length} of ${deviations.length} intervals missed target by ${fmtDelta(avgSlowDelta)}/mi — workout stimulus not achieved, may impact phase goals`);
        } else {
          parts.push(`${slowIntervals.length} of ${deviations.length} intervals missed target by ${fmtDelta(avgSlowDelta)}/mi — workout stimulus not achieved`);
        }
      }
    } else if (fastIntervals.length > 0) {
      const avgFastDelta = Math.round(fastIntervals.reduce((sum, d) => sum + d.delta, 0) / fastIntervals.length);
      if (isRecoveryContext) {
        // Recovery/easy run that was too fast
        if (planContext?.isRecoveryWeek) {
          parts.push(`Recovery week: Ran ${fmtDelta(avgFastDelta)}/mi faster than prescribed — too hard, compromises recovery and adaptation`);
        } else {
          parts.push(`Easy run was ${fmtDelta(avgFastDelta)}/mi faster than prescribed — too hard for recovery day`);
        }
      } else {
        // Work intervals that were too fast
        if (planContext?.hasActivePlan && isBuildContext) {
          const weekInfo = weekNumber ? ` (Week ${weekNumber})` : '';
          parts.push(`Build week${weekInfo}: Ran significantly faster (${fmtDelta(avgFastDelta)}/mi) than prescribed ${targetRange}/mi — monitor fatigue and injury risk`);
        } else {
          parts.push(`Ran significantly faster (${fmtDelta(avgFastDelta)}/mi) than prescribed ${targetRange}/mi`);
        }
      }
    }
  }

  if (parts.length === 0) return null;

  const fastDominant = fastIntervals.length > 0 && slowIntervals.length === 0;
  const slowDominant = slowIntervals.length > 0 && fastIntervals.length === 0;
  const ws = detailedAnalysis?.workout_summary;
  const hrDrift = ws?.hr_drift ?? granularAnalysis?.heart_rate_analysis?.hr_drift_bpm ?? null;
  const hrDriftAbs = hrDrift != null && Number.isFinite(hrDrift) ? Math.abs(hrDrift) : null;

  // Planned workout context: does the plan have a faster finish? (e.g. long easy + 1 mi at M pace)
  let hasPlannedFasterFinish = false;
  if (workIntervals.length >= 2) {
    const first = workIntervals[0];
    const last = workIntervals[workIntervals.length - 1];
    const firstMid = ((Number(first?.planned_pace_range_lower) || 0) + (Number(first?.planned_pace_range_upper) || 0)) / 2;
    const lastMid = ((Number(last?.planned_pace_range_lower) || 0) + (Number(last?.planned_pace_range_upper) || 0)) / 2;
    if (firstMid > 0 && lastMid > 0 && lastMid < firstMid * 0.95) {
      hasPlannedFasterFinish = true; // last segment target is at least 5% faster
    }
  }
  const driftContextNote = hasPlannedFasterFinish
    ? ' Your plan included a faster finish; some of this rise may reflect that effort rather than fatigue.'
    : '';
  const driftClarify = ' (first vs last 10 min of moving time)';
  const plannedWorkoutLeadIn = plannedWorkout
    ? 'Considering your planned workout, '
    : '';

  // Verdict: single non-repetitive sentence; upgrade when internal vs external load tells a story
  let verdict = parts[0].trim() + (parts[0].endsWith('.') ? '' : '.');
  if (fastDominant && isRecoveryContext && hrDriftAbs != null && hrDriftAbs <= 5) {
    verdict = "Physiologically efficient, but tactically over-paced for a recovery day.";
  }

  // Plan impact: use currentPhaseName and weekFocusLabel to explain trade-offs (consequence, not restatement)
  let focus = 'Adherence';
  let outlook = '';
  const weekFocus = planContext?.weekFocusLabel || '';

  if (planContext?.hasActivePlan) {
    if (isRecoveryContext) {
      focus = 'Recovery Integrity';
      if (fastDominant) {
        outlook = currentPhaseName
          ? `This extra effort in the ${currentPhaseName} phase may dampen the supercompensation intended for this rest block.${weekFocus ? ` Consider a more conservative approach to ${weekFocus.toLowerCase()}.` : ''}`
          : "By exceeding the pace today, you turned a recovery session into a moderate-intensity run. This may dampen the supercompensation effect intended for this rest block.";
      } else if (slowDominant) {
        outlook = currentPhaseName
          ? `Slower-than-target pacing in ${currentPhaseName} supports adaptation and sets you up well for the next build.`
          : "Slower-than-target pacing on this recovery day supports adaptation and sets you up well for the next build phase.";
      }
    } else if (isBuildContext) {
      focus = 'Build Execution';
      if (fastDominant) {
        outlook = currentPhaseName
          ? `Strong execution in ${currentPhaseName}; this extra load may necessitate a more conservative approach to your next key session.${weekFocus ? ` Focus: ${weekFocus}.` : ''}`
          : "Strong execution; keep an eye on cumulative fatigue as the block progresses.";
      } else if (slowDominant) {
        outlook = currentPhaseName
          ? `Missed target stimulus in ${currentPhaseName} may reduce the intended training load for this block.${weekFocus ? ` Adjust ${weekFocus.toLowerCase()} as needed.` : ''}`
          : "Missed target stimulus today may reduce the intended training load for this phase.";
      }
    } else if (isTaperContext) {
      focus = 'Taper Discipline';
      outlook = currentPhaseName
        ? `Sticking to prescribed effort in ${currentPhaseName} protects race-day readiness.`
        : "Sticking to prescribed effort in taper protects race-day readiness.";
    }
  }
  if (!outlook && currentPhaseName) {
    outlook = `This effort fits within your current phase (${currentPhaseName}).`;
  }

  // Overall context: Only needed if there's something NOT covered in the HR drift narrative
  // The HR drift interpretation now tells the complete story including pace adherence
  if (!outlook && !planContext?.hasActivePlan) {
    const hasRichHRInterpretation = granularAnalysis?.heart_rate_analysis?.hr_drift_interpretation?.length > 100;
    
    if (!hasRichHRInterpretation) {
      // Fallback for older analyses without rich interpretation
      focus = 'Overall';
      if (fastDominant) {
        outlook = `Intervals were faster than prescribed; sustained faster pacing can contribute to fatigue and injury risk.`;
      } else if (slowDominant) {
        outlook = `Intervals were slower than prescribed — you may have missed the intended stimulus.`;
      } else {
        outlook = `Pacing was on target or mixed relative to prescribed.`;
      }
    }
    // If rich interpretation exists, don't set focus/outlook - let UI handle empty state
  }

  // Technical insights: internal vs external load + diagnostic labels (interpret, don't mirror)
  const technical_insights: { label: string; value: string }[] = [];

  // Internal vs external: if external load (pace) was high but internal (HR drift) low → surprising efficiency
  if (fastDominant && hrDriftAbs != null && hrDriftAbs <= 5) {
    technical_insights.push({
      label: 'Internal vs External Load',
      value: "External load was high for the day's intent, but internal load stayed low — surprising aerobic efficiency at this pace."
    });
  }

  // HR drift → Use the rich context-aware interpretation from granular analysis
  // This includes terrain profile, workout plan context, and window-by-window analysis
  const richHRInterpretation = granularAnalysis?.heart_rate_analysis?.hr_drift_interpretation;
  if (hrDrift != null && Number.isFinite(hrDrift) && hrDriftAbs !== null) {
    // Use summary_label from HR analysis module (single source of truth)
    // Falls back to derived label only if summary_label not available
    let driftLabel = granularAnalysis?.heart_rate_analysis?.summary_label;
    if (!driftLabel) {
      // Fallback for older analyses: derive label from drift magnitude
      driftLabel = 'Cardiac Drift';
      if (hrDriftAbs <= 3) {
        driftLabel = 'Aerobic Efficiency';
      } else if (hrDriftAbs > 10) {
        driftLabel = 'Aerobic Stress';
      }
    }
    
    // Use rich interpretation if available, otherwise fall back to simple text
    if (richHRInterpretation && richHRInterpretation.length > 20) {
      technical_insights.push({ label: driftLabel, value: richHRInterpretation });
    } else {
      // Fallback for older analyses without rich interpretation
      if (hrDriftAbs <= 3) {
        technical_insights.push({ label: driftLabel, value: `${plannedWorkoutLeadIn}Heart rate remained stable (${hrDrift > 0 ? '+' : ''}${hrDrift} bpm drift${driftClarify}), suggesting this pace is within your aerobic threshold.` });
      } else if (hrDriftAbs <= 10) {
        technical_insights.push({ label: driftLabel, value: `${plannedWorkoutLeadIn}Moderate HR drift (+${hrDrift} bpm${driftClarify}) in the second half — pace may have felt harder as the session went on.${driftContextNote}` });
      } else {
        technical_insights.push({ label: driftLabel, value: `${plannedWorkoutLeadIn}Significant HR drift (+${hrDrift} bpm${driftClarify}) suggests accumulated fatigue or intensity creep. Consider hydration, heat, and recovery; this may take longer to absorb.${driftContextNote}` });
      }
    }
  }

  // Pacing stability: < 5% → Pacing Mastery; otherwise diagnostic
  const speedFlux = detailedAnalysis?.speed_fluctuations;
  if (speedFlux?.available && speedFlux?.pace_variability_percent != null) {
    const pct = speedFlux.pace_variability_percent;
    if (pct < 5) {
      technical_insights.push({ label: 'Pacing Mastery', value: `Pace variance under 5% — high control across work intervals, even under changing terrain or effort.` });
    } else if (pct <= 8) {
      technical_insights.push({ label: 'Pacing Stability', value: `Moderate pace variance (${pct}%) — some fluctuation between intervals.` });
    } else {
      technical_insights.push({ label: 'Pacing Stability', value: `Higher pace variance (${pct}%) — consider smoothing effort across intervals next time.` });
    }
  }
  const paceVar = granularAnalysis?.pacing_analysis?.pacing_variability;
  if (paceVar?.coefficient_of_variation != null && technical_insights.every(t => t.label !== 'Pacing Mastery' && t.label !== 'Pacing Stability')) {
    const cv = paceVar.coefficient_of_variation;
    if (cv < 5) {
      technical_insights.push({ label: 'Pacing Mastery', value: `Pace variability (CV ${cv}%) was low — steady output and high control.` });
    } else {
      technical_insights.push({ label: 'Pacing Stability', value: `Pace variability (CV ${cv}%) ${cv <= 10 ? 'was moderate.' : 'was high — uneven effort.'}` });
    }
  }

  // HR recovery: > 30 bpm → High Readiness; otherwise diagnostic
  const hrRecovery = detailedAnalysis?.heart_rate_recovery;
  if (hrRecovery?.available && hrRecovery?.average_hr_drop_bpm != null) {
    const drop = hrRecovery.average_hr_drop_bpm;
    if (drop >= 30) {
      technical_insights.push({ label: 'High Readiness', value: `HR dropped ${drop} bpm in recovery intervals — strong cardiovascular rebound and readiness for the next interval.` });
    } else {
      const quality = hrRecovery.recovery_quality || (drop > 20 ? 'Excellent' : drop > 15 ? 'Good' : drop > 10 ? 'Fair' : 'Poor');
      technical_insights.push({ label: 'Recovery Efficiency', value: `HR dropped ${drop} bpm in recovery (${quality}) — reflects aerobic fitness and readiness.` });
    }
  }

  // If no specific plan_impact was set but we have a rich narrative, skip plan_impact
  // The complete story is already told in the technical_insights (HR Summary / Cardiac Drift)
  const hrSummaryLabels = ['HR Summary', 'Cardiac Drift', 'Aerobic Efficiency', 'Aerobic Stress', 'Aerobic Response', 'Elevated Drift', 'High Cardiac Stress'];
  const hasRichNarrative = technical_insights.some(t => 
    hrSummaryLabels.includes(t.label) && t.value.length > 100
  );
  
  return {
    verdict,
    technical_insights,
    plan_impact: { 
      focus: focus || '', 
      outlook: outlook || (hasRichNarrative ? '' : 'No additional context.')
    }
  };
}

// =============================================================================
// HR ANALYSIS HELPERS
// =============================================================================

/**
 * Detect workout type from intervals and planned workout info.
 * Used to provide context to the HR analysis module.
 */
function detectWorkoutTypeFromIntervals(
  intervals: any[],
  plannedWorkout?: any
): WorkoutType {
  if (!intervals || intervals.length === 0) {
    return 'steady_state';
  }
  
  const workIntervals = intervals.filter(i => 
    i.role === 'work' || i.role === 'Work' || i.kind === 'work'
  );
  const recoveryIntervals = intervals.filter(i => 
    i.role === 'recovery' || i.role === 'Recovery' || i.role === 'rest' || i.kind === 'recovery'
  );
  
  const desc = (plannedWorkout?.description || plannedWorkout?.workout_description || '').toLowerCase();
  const token = (plannedWorkout?.workout_token || '').toLowerCase();
  
  // Hill repeats
  if (desc.includes('hill') && (desc.includes('repeat') || desc.includes('reps'))) {
    return 'hill_repeats';
  }
  
  // Fartlek
  if (desc.includes('fartlek') || token.includes('fartlek')) {
    return 'fartlek';
  }
  
  // Standard intervals
  if (workIntervals.length > 1 && recoveryIntervals.length > 0) {
    return 'intervals';
  }
  
  // Tempo finish detection
  if (workIntervals.length >= 2) {
    const lastInterval = workIntervals[workIntervals.length - 1];
    const firstInterval = workIntervals[0];
    
    const lastPace = lastInterval.executed?.avg_pace_s_per_mi || lastInterval.pace_range?.lower || 0;
    const firstPace = firstInterval.executed?.avg_pace_s_per_mi || firstInterval.pace_range?.lower || 0;
    const lastDuration = lastInterval.executed?.duration_s || 
      (lastInterval.sample_idx_end && lastInterval.sample_idx_start 
        ? lastInterval.sample_idx_end - lastInterval.sample_idx_start : 0);
    const firstDuration = firstInterval.executed?.duration_s || 
      (firstInterval.sample_idx_end && firstInterval.sample_idx_start 
        ? firstInterval.sample_idx_end - firstInterval.sample_idx_start : 0);
    
    // Tempo finish: last interval is faster AND shorter (<25% of first)
    if (lastPace > 0 && firstPace > 0 && lastPace < firstPace * 0.9 &&
        lastDuration > 0 && firstDuration > 0 && lastDuration < firstDuration * 0.25) {
      return 'tempo_finish';
    }
  }
  
  // Check description
  if (desc.includes('progressive') || token.includes('progressive')) {
    return 'progressive';
  }
  
  if (desc.includes('tempo finish') || desc.includes('fast finish') || 
      desc.includes('@ m pace') || desc.includes('@ tempo')) {
    return 'tempo_finish';
  }
  
  return 'steady_state';
}

/**
 * Detect workout intent from planned workout metadata.
 */
function detectWorkoutIntent(plannedWorkout: any): 'easy' | 'long' | 'tempo' | 'intervals' | 'recovery' | undefined {
  if (!plannedWorkout) return undefined;
  
  const token = (plannedWorkout.workout_token || '').toLowerCase();
  const desc = (plannedWorkout.description || plannedWorkout.workout_description || '').toLowerCase();
  const name = (plannedWorkout.name || plannedWorkout.workout_name || '').toLowerCase();
  
  const combined = `${token} ${desc} ${name}`;
  
  if (combined.includes('recovery')) return 'recovery';
  if (combined.includes('easy') || combined.includes('aerobic') || combined.includes('base')) return 'easy';
  if (combined.includes('long')) return 'long';
  if (combined.includes('tempo') || combined.includes('threshold')) return 'tempo';
  if (combined.includes('interval') || combined.includes('repeat') || combined.includes('speed')) return 'intervals';
  
  return undefined;
}
