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
import { analyzeHeartRate, type HRAnalysisResult, type HRAnalysisContext, type WorkoutType, getEffectiveSlowFloor, getHeatAllowance } from './lib/heart-rate/index.ts';
import { generateMileByMileTerrainBreakdown } from './lib/analysis/mile-by-mile-terrain.ts';
import { fetchPlanContextForWorkout, type PlanContext } from '../_shared/plan-context.ts';
import { fetchGoalRaceCompletionForWorkout, type GoalRaceCompletionMatch } from '../_shared/goal-race-completion.ts';
import { buildMarathonGoalRaceAdherenceSummary } from './lib/analysis/marathon-race-narrative.ts';
import { buildWorkoutFactPacketV1 } from '../_shared/fact-packet/build.ts';
import { generateAISummaryV1 } from '../_shared/fact-packet/ai-summary.ts';
import { isPlanTransitionWindowByWeekIndex } from '../_shared/plan-week.ts';
import {
  collapseCourseSegmentsToZones,
  generateRaceDebrief,
  parseWorkoutWeatherDataBlob,
  resolveRaceDebriefWeather,
  type CourseStrategyZoneLine,
  type RawCourseSegmentRow,
} from '../_shared/race-debrief.ts';
import { runPostRaceFeedbackChain } from '../_shared/race-feedback.ts';

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
    const force_weather_refresh = body.force_weather_refresh === true;
    
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
    console.log(`🌡️ [WEATHER] force_weather_refresh param: ${force_weather_refresh}`);
    
    // Track if we need to force fetch weather (even if cached data exists in memory)
    let forceWeatherFetch = false;
    
    // Clear cached weather if force refresh requested
    if (force_weather_refresh) {
      console.log('🌡️ [WEATHER] Force refresh requested, clearing cached weather in DB...');
      const { error: clearError } = await supabase
        .from('workouts')
        .update({ weather_data: null })
        .eq('id', workout_id);
      if (clearError) {
        console.warn('🌡️ [WEATHER] Failed to clear cached weather:', clearError.message);
      } else {
        console.log('🌡️ [WEATHER] Successfully cleared cached weather from DB');
        forceWeatherFetch = true;
      }
    }
    const _t0 = Date.now();
    const _mem = () => { try { return `${Math.round((Deno as any).memoryUsage().heapUsed / 1048576)}MB`; } catch { return '?'; } };
    console.log(`🏁 START heap=${_mem()}`);

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

    // Phase 1: load metadata + primary sensor sources. Defer garmin_data/time_series_data
    // to a second query so we don't hold all large blobs in memory simultaneously.
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select(`
        id,
        name,
        type,
        sensor_data,
        computed,
        planned_id,
        user_id,
        moving_time,
        duration,
        elapsed_time,
        total_timer_time,
        distance,
        elevation_gain,
        weather_data,
        avg_temperature,
        start_position_lat,
        start_position_long,
        date,
        rpe,
        feeling,
        intensity_factor
      `)
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message}`);
    }
    console.log(`🏁 AFTER_FETCH +${Date.now()-_t0}ms heap=${_mem()}`);

    // If force refresh was requested, clear the in-memory weather data
    // (DB was already cleared, but SELECT might have returned stale data)
    if (forceWeatherFetch && workout.weather_data) {
      console.log('🌡️ [WEATHER] Force refresh: clearing in-memory weather_data');
      workout.weather_data = null;
    }

    console.log('🔍 Available data sources:', {
      computed: !!workout.computed,
      sensor_data: !!workout.sensor_data
    });

    if (workout.type !== 'run' && workout.type !== 'running') {
      throw new Error(`Workout type ${workout.type} is not supported for running analysis`);
    }

    console.log(`🏁 [GOAL RACE DEBUG] date=${workout.date} distance=${workout.distance} computed_distance_m=${workout.computed?.overall?.distance_m}`);
    const goalRaceCompletionMatch: GoalRaceCompletionMatch = await fetchGoalRaceCompletionForWorkout(
      supabase,
      workout.user_id,
      workout,
    );
    console.log(`🏁 [GOAL RACE RESULT] matched=${goalRaceCompletionMatch.matched}`);
    if (goalRaceCompletionMatch.matched) {
      console.log('🏁 [GOAL RACE] Marathon goal event:', goalRaceCompletionMatch.eventName, goalRaceCompletionMatch.goalId);
    }

    // Fetch historical weather if not cached (or force refresh) and we have location data
    if ((forceWeatherFetch || !workout.weather_data) && workout.start_position_lat && workout.start_position_long && workout.date) {
      console.log(`🌡️ [WEATHER] Fetching from Open-Meteo (forceWeatherFetch=${forceWeatherFetch}, cached=${!!workout.weather_data})...`);
      try {
        // Get actual workout start time from sensor data (more accurate than just date)
        let workoutTimestamp = workout.date;
        const sensorSamples = workout.sensor_data?.samples || workout.sensor_data || [];
        if (Array.isArray(sensorSamples) && sensorSamples.length > 0) {
          const firstSample = sensorSamples[0];
          // Garmin uses startTimeInSeconds (unix epoch) or timestamp (ms)
          if (firstSample.startTimeInSeconds) {
            workoutTimestamp = new Date(firstSample.startTimeInSeconds * 1000).toISOString();
          } else if (firstSample.timestamp && firstSample.timestamp > 1000000000000) {
            workoutTimestamp = new Date(firstSample.timestamp).toISOString();
          } else if (firstSample.timestamp) {
            workoutTimestamp = new Date(firstSample.timestamp * 1000).toISOString();
          }
        }
        console.log(`🌡️ [WEATHER] Using timestamp: ${workoutTimestamp}`);

        const durationSecondsForWeather = (() => {
          const comp = Number(workout?.computed?.overall?.duration_s_moving);
          if (Number.isFinite(comp) && comp >= 60) return Math.round(comp);
          const mv = Number(workout?.moving_time);
          if (!Number.isFinite(mv) || mv <= 0) return null;
          return mv < 1000 ? Math.round(mv * 60) : Math.round(mv);
        })();

        const weatherResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-weather`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            lat: workout.start_position_lat,
            lng: workout.start_position_long,
            timestamp: workoutTimestamp,
            workout_id: workout_id,
            force_refresh: forceWeatherFetch, // Skip all caches when force refresh requested
            duration_seconds: durationSecondsForWeather,
          })
        });
        if (weatherResp.ok) {
          const weatherResult = await weatherResp.json();
          if (weatherResult.weather) {
            workout.weather_data = weatherResult.weather;
            console.log(`🌡️ [WEATHER] Fetched: ${weatherResult.weather.temperature}°F (feels like ${weatherResult.weather.feels_like}°F)`);
          }
        } else {
          console.warn(`🌡️ [WEATHER] API returned ${weatherResp.status}`);
        }
      } catch (wxErr) {
        console.warn('🌡️ [WEATHER] Failed to fetch:', wxErr);
      }
    }

    // Get user baselines first (needed for both planned and unplanned workouts)
    let baselines: any = {};
    let effortPaces: any = null;
    let learnedFitness: any = null;
    let userUnits = 'imperial'; // default
    try {
      const { data: userBaselines } = await supabase
        .from('user_baselines')
        .select('performance_numbers, units, effort_paces, learned_fitness')
        .eq('user_id', workout.user_id)
        .single();
      
      if (userBaselines?.units === 'metric' || userBaselines?.units === 'imperial') {
        userUnits = userBaselines.units;
      }
      baselines = userBaselines?.performance_numbers || {};
      effortPaces = (userBaselines as any)?.effort_paces || null;
      learnedFitness = (userBaselines as any)?.learned_fitness || null;
      console.log('📊 User baselines found:', baselines);
    } catch (error) {
      console.log('⚠️ No user baselines found, using defaults');
      // Use default baselines for analysis
    }

    // Baseline paces for coach-grade comparisons (seconds per mile).
    // Prefer effort_paces (explicit training paces), then performance_numbers.easyPace, then learned_fitness.
    const parsePaceSecPerMi = (val: any): number | null => {
      try {
        if (val == null) return null;
        if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
        const s = String(val).trim();
        if (!s) return null;
        // allow "11:08/mi" or "11:08"
        const m = s.match(/(\d+)\s*:\s*(\d{1,2})/);
        if (!m) return null;
        const mm = Number(m[1]);
        const ss = Number(m[2]);
        if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;
        return (mm * 60) + ss;
      } catch {
        return null;
      }
    };

    const learnedEasySecPerMi = (() => {
      try {
        const lf = learnedFitness || {};
        const metric = (lf as any)?.run_easy_pace_sec_per_km ?? (lf as any)?.runEasyPaceSecPerKm ?? null;
        const v = (metric && typeof metric === 'object') ? Number((metric as any)?.value) : Number(metric);
        if (!Number.isFinite(v) || !(v > 0)) return null;
        // sec/km -> sec/mi
        return v * 1.60934;
      } catch {
        return null;
      }
    })();

    const baselinePacesSecPerMi = {
      base: Number.isFinite(Number(effortPaces?.base)) ? Number(effortPaces.base)
        : (parsePaceSecPerMi(baselines?.easyPace) ?? parsePaceSecPerMi(baselines?.easy_pace) ?? (learnedEasySecPerMi ?? null)),
      steady: Number.isFinite(Number(effortPaces?.steady)) ? Number(effortPaces.steady) : null,
      power: Number.isFinite(Number(effortPaces?.power)) ? Number(effortPaces.power) : null,
      speed: Number.isFinite(Number(effortPaces?.speed)) ? Number(effortPaces.speed) : null,
      race: Number.isFinite(Number(effortPaces?.race)) ? Number(effortPaces.race) : null,
    } as const;

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
      const currentDurationMin = Math.round(currentDuration / 60);
      
      // Fetch similar workouts - MORE LENIENT: any run 30+ minutes in last 90 days
      // (removed strict duration matching - all aerobic runs are comparable for drift trends)
      // NOTE: moving_time is stored in MINUTES in the database, not seconds!
      const minDuration = 30; // 30 minutes minimum
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      console.log(`📊 [HISTORICAL QUERY] Looking for runs: user=${workout.user_id}, minDuration=30min, since=${ninetyDaysAgo.toISOString()}, excludeId=${workout_id}`);
      
      const { data: similarWorkouts, error: histError } = await supabase
        .from('workouts')
        .select('id, name, date, moving_time, duration, elevation_gain, workout_analysis')
        .eq('user_id', workout.user_id)
        .eq('type', 'run')
        .neq('id', workout_id)
        .gte('date', ninetyDaysAgo.toISOString())
        .gte('moving_time', minDuration)
        .not('workout_analysis', 'is', null)
        .order('date', { ascending: false })
        .limit(5);
      
      if (histError) {
        console.log(`📊 [HISTORICAL QUERY] Error: ${histError.message}`);
      }
      
      console.log(`📊 [HISTORICAL QUERY] Found ${similarWorkouts?.length ?? 0} runs with analysis`);
      
      if (similarWorkouts && similarWorkouts.length > 0) {
        // Extract drift values then immediately free the large workout_analysis blobs.
        const workoutsWithDrift = similarWorkouts
          .map((w: any) => {
            const hrDrift = 
              w.workout_analysis?.granular_analysis?.heart_rate_analysis?.hr_drift_bpm ??
              w.workout_analysis?.heart_rate_summary?.drift_bpm ??
              w.workout_analysis?.detailed_analysis?.workout_summary?.hr_drift ??
              null;
            w.workout_analysis = null; // free immediately
            if (hrDrift != null && Number.isFinite(hrDrift)) {
              const daysSince = Math.round((Date.now() - new Date(w.date).getTime()) / (1000 * 60 * 60 * 24));
              return {
                date: w.date,
                driftBpm: hrDrift,
                durationMin: Math.round((w.moving_time || w.duration || 0) < 1000 ? (w.moving_time || w.duration || 0) : (w.moving_time || w.duration || 0) / 60),
                elevationFt: w.elevation_gain ? Math.round(w.elevation_gain * 3.28084) : undefined,
                daysSince
              };
            }
            return null;
          })
          .filter((w: any): w is NonNullable<typeof w> => w !== null);
        
        if (workoutsWithDrift.length >= 1) {
          const avgDrift = workoutsWithDrift.reduce((sum, w) => sum + w.driftBpm, 0) / workoutsWithDrift.length;
          
          // Find last similar workout (3-21 days ago for more flexibility)
          const lastWeekSimilar = workoutsWithDrift.find(w => w.daysSince >= 3 && w.daysSince <= 21);
          console.log(`📊 [HISTORICAL] Looking for similar workout 3-21 days ago. Candidates: ${workoutsWithDrift.map(w => `${w.daysSince}d ago: ${w.driftBpm}bpm`).join(', ')}`);
          
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
          console.log(`📊 [HISTORICAL] Found ${similarWorkouts.length} runs but none had HR drift data stored`);
        }
      } else {
        console.log(`📊 [HISTORICAL] No runs found (30+ min, last 90 days, with analysis)`);
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
      daysUntilRace?: number | null;
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
            planName: planContext.planName ?? undefined,
            daysUntilRace: planContext.daysUntilRace,
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
    let sensorData: any[] = [];

    // Try primary sources first (already loaded).
    if (workout.sensor_data) {
      sensorData = extractSensorData(workout.sensor_data);
      console.log(`📊 sensor_data yielded ${sensorData.length} samples`);
    }
    (workout as any).sensor_data = null; // free immediately

    if (sensorData.length === 0 && workout.computed) {
      sensorData = extractSensorData(workout.computed);
      console.log(`📊 computed data yielded ${sensorData.length} samples`);
    }

    // Phase 2: only load the heavy blobs if primary sources had no data.
    if (sensorData.length === 0) {
      console.log('🔍 Primary sources empty — loading time_series_data/garmin_data...');
      const { data: heavyRow } = await supabase
        .from('workouts')
        .select('time_series_data, garmin_data')
        .eq('id', workout_id)
        .single();
      if (heavyRow?.time_series_data) {
        sensorData = extractSensorData(heavyRow.time_series_data);
        console.log(`📊 time_series_data yielded ${sensorData.length} samples`);
      }
      if (sensorData.length === 0 && heavyRow?.garmin_data) {
        sensorData = extractSensorData(heavyRow.garmin_data);
        console.log(`📊 garmin_data yielded ${sensorData.length} samples`);
      }
      // heavyRow goes out of scope here — GC can reclaim it.
    }

    // Strip large computed sub-objects not needed by analysis.
    if (workout.computed) {
      (workout as any).computed.analysis = null;
      (workout as any).computed.raw_laps = null;
      (workout as any).computed.power_curve = null;
      (workout as any).computed.best_efforts = null;
      (workout as any).computed.adaptation = null;
    }
    console.log(`🏁 AFTER_EXTRACT +${Date.now()-_t0}ms heap=${_mem()} samples=${sensorData.length}`);

    if (!sensorData || sensorData.length === 0) {
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

    // Contract branch:
    // - LINKED workout (planned_id + plan steps): plan structure is the primary source of truth.
    // - UNLINKED workout: use computed/sensor-derived intervals.
    const linkedPlanSteps = getPlannedWorkSteps(plannedWorkout);
    const plannedStructuredIntervals = Array.isArray(intervals) ? intervals : [];
    const isPlanLinkedWorkout =
      !!plannedWorkout &&
      (
        linkedPlanSteps.length > 0 ||
        plannedStructuredIntervals.length > 0
      );
    const computedOnlyIntervals = Array.isArray(workout?.computed?.intervals) ? workout.computed.intervals : [];
    const hasExecutionEvidence = (iv: any): boolean => {
      const sIdx = Number(iv?.sample_idx_start);
      const eIdx = Number(iv?.sample_idx_end);
      const hasMeasuredWindow = Number.isFinite(sIdx) && Number.isFinite(eIdx) && eIdx > sIdx;
      const hasExecutedEnvelope = !!iv?.executed && (
        Number(iv?.executed?.duration_s ?? 0) > 0 ||
        Number(iv?.executed?.distance_m ?? 0) > 0 ||
        Number(iv?.executed?.avg_pace_s_per_mi ?? 0) > 0 ||
        Number(iv?.executed?.avg_hr ?? 0) > 0
      );
      const hasTopLevelActuals =
        Number(iv?.actual_duration_s ?? iv?.duration_s ?? 0) > 0 ||
        Number(iv?.actual_distance_m ?? iv?.distance_m ?? 0) > 0 ||
        Number(iv?.pace_s_per_mi ?? iv?.avg_pace_s_per_mi ?? iv?.actual_pace_min_per_mi ?? 0) > 0 ||
        Number(iv?.avg_heart_rate_bpm ?? iv?.avg_hr ?? 0) > 0;
      return hasMeasuredWindow || hasExecutedEnvelope || hasTopLevelActuals;
    };

    const plannedHasMeasuredEvidence = plannedStructuredIntervals.some((iv: any) => hasExecutionEvidence(iv));
    const computedHasMeasuredEvidence = computedOnlyIntervals.some((iv: any) => hasExecutionEvidence(iv));

    const intervalSource = isPlanLinkedWorkout
      ? (
          plannedHasMeasuredEvidence
            ? 'linked-plan-primary'
            : (computedHasMeasuredEvidence ? 'linked-plan-computed-fallback' : 'linked-plan-primary')
        )
      : (computedOnlyIntervals.length > 0 ? 'unlinked-sensor-primary' : 'unlinked-planned-fallback');

    const computedIntervals = isPlanLinkedWorkout
      ? (
          plannedHasMeasuredEvidence
            ? plannedStructuredIntervals
            : (computedHasMeasuredEvidence ? computedOnlyIntervals : plannedStructuredIntervals)
        )
      : (computedOnlyIntervals.length > 0 ? computedOnlyIntervals : plannedStructuredIntervals);
    console.log(`🔍 [INTERVAL SOURCE] ${intervalSource} (${computedIntervals.length} intervals)`);
    
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
    console.log(`🏁 AFTER_GRANULAR +${Date.now()-_t0}ms heap=${_mem()}`);

    // 💓 SINGLE SOURCE OF TRUTH: Consolidated HR Analysis
    // All HR metrics (drift, zones, efficiency, intervals) calculated here
    
    // Compute interval timestamps from sensor data
    // The sample indices reference the original data, but we need timestamps for reliable filtering
    // Use first sensor sample timestamp as base, add sample index as seconds offset
    const workoutStartTimestamp = sensorData[0]?.timestamp || 0;
    const isMilliseconds = workoutStartTimestamp > 1e10;
    
    // -------------------------------------------------------------------------
    // SEGMENT-LEVEL PACE DATA (for long runs with fast finish)
    // Calculate before HR analysis so narrative can use it
    // -------------------------------------------------------------------------
    let segmentData: {
      basePace?: string;
      baseTargetPace?: string;
      baseActualSecPerMi?: number;
      baseTargetSecPerMi?: number;
      baseDeltaSecPerMi?: number;
      baseSlowdownPct?: number;
      finishOnTarget?: boolean;
      finishPace?: string;
      finishTargetPace?: string;
      finishActualSecPerMi?: number;
      finishTargetSecPerMi?: number;
      finishDeltaSecPerMi?: number;
      hasFinishSegment?: boolean;
    } | undefined = undefined;
    
    // Check if this is a long run with fast finish (e.g., easy/base + fast finish).
    // IMPORTANT: these segments are not always tagged as "work" (they may be "easy"/"steady"),
    // so we include any non-recovery segment with an executed pace target.
    // Sort by true chronological key: start_time_s (actual timestamp) or planned_step_index (plan order).
    const workIntervalsUnsorted = intervalsToAnalyze.filter((i: any) => {
      const role = String(i?.role || i?.kind || '').toLowerCase();
      if (!i?.executed) return false;
      if (!i?.pace_range && !i?.target_pace) return false;
      // Exclude true recovery/rest segments (jog recoveries, rests)
      if (role.includes('recovery') || role.includes('rest')) return false;
      // Include "work", "easy", "steady", "base", etc.
      return true;
    });
    
    // Check if we have a reliable chronological key.
    // NOTE: computed.intervals from compute-workout-summary always include sample_idx_start, which is a
    // stable proxy for chronological order (1 sample ~ 1 second).
    const hasChronoKey = workIntervalsUnsorted.every((i: any) =>
      i.start_time_s != null ||
      i.start_offset_s != null ||
      i.sample_idx_start != null ||
      i.planned_step_index != null
    );
    
    // Only proceed with segment detection if we have reliable ordering
    const workIntervalsList = hasChronoKey
      ? workIntervalsUnsorted.sort((a: any, b: any) => {
          // Primary: actual start time (most reliable)
          const aTime = a.start_time_s ?? a.start_offset_s;
          const bTime = b.start_time_s ?? b.start_offset_s;
          if (aTime != null && bTime != null) return aTime - bTime;
          // Next: sample index start (proxy for time)
          const aS = a.sample_idx_start ?? null;
          const bS = b.sample_idx_start ?? null;
          if (aS != null && bS != null) return aS - bS;
          // Fallback: plan authoring order
          const aIdx = a.planned_step_index ?? 0;
          const bIdx = b.planned_step_index ?? 0;
          return aIdx - bIdx;
        })
      : []; // Empty = skip segment detection if no reliable order
    
    if (workIntervalsList.length >= 2) {
      const firstInterval = workIntervalsList[0];
      const lastInterval = workIntervalsList[workIntervalsList.length - 1];
      
      // Calculate target midpoints from pace_range
      // Handles both object format { lower: 621, upper: 715 } and string format "10:55-11:21/mi"
      const parsePaceRange = (range: any): { lower: number; upper: number } | null => {
        if (!range) return null;
        
        // If it's already an object with lower/upper properties (seconds)
        if (typeof range === 'object' && range.lower != null && range.upper != null) {
          return { lower: Number(range.lower), upper: Number(range.upper) };
        }
        
        // If it's a string, parse it
        if (typeof range === 'string') {
          const match = range.match(/(\d+):(\d+)[\s-]+(\d+):(\d+)/);
          if (!match) return null;
          const lower = parseInt(match[1]) * 60 + parseInt(match[2]);
          const upper = parseInt(match[3]) * 60 + parseInt(match[4]);
          return { lower, upper };
        }
        
        return null;
      };
      
      const firstRange = parsePaceRange(firstInterval.pace_range || firstInterval.target_pace);
      const lastRange = parsePaceRange(lastInterval.pace_range || lastInterval.target_pace);
      
      const normalizeRange = (r: { lower: number; upper: number } | null): { fast: number; slow: number } | null => {
        if (!r) return null;
        const a = Number(r.lower);
        const b = Number(r.upper);
        if (!Number.isFinite(a) || !Number.isFinite(b) || !(a > 0) || !(b > 0)) return null;
        // For pace (sec/mi), "fast" is the smaller number.
        return { fast: Math.min(a, b), slow: Math.max(a, b) };
      };

      const isPaceOnTarget = (actualSecPerMi: number | null | undefined, r: { lower: number; upper: number } | null): boolean => {
        const a = Number(actualSecPerMi);
        if (!Number.isFinite(a) || !(a > 0)) return false;
        const nr = normalizeRange(r);
        if (!nr) return false;
        const { fast, slow } = nr;

        // Point target: use tight absolute tolerance (seconds) to avoid false positives.
        // This matches the UI expectation for targets like "9:52/mi".
        const POINT_EPS_SEC = 5;
        if (Math.abs(slow - fast) <= 0.5) {
          return Math.abs(a - fast) <= POINT_EPS_SEC;
        }

        // Range target: allow a tiny buffer (1%) for GPS/rounding noise.
        const RANGE_EPS_PCT = 0.01;
        return a >= fast * (1 - RANGE_EPS_PCT) && a <= slow * (1 + RANGE_EPS_PCT);
      };

      if (firstRange && lastRange) {
        const firstMid = (firstRange.lower + firstRange.upper) / 2;
        const lastMid = (lastRange.lower + lastRange.upper) / 2;
        
        // If last segment target is at least 5% faster, this is a fast-finish workout
        if (lastMid < firstMid * 0.95) {
          const hasFinishSegment = true;
          
          // Calculate base slowdown (compare actual to target for base portion)
          const baseActualPace = firstInterval.executed?.avg_pace_s_per_mi;
          let baseSlowdownPct = 0;
          if (baseActualPace && firstMid > 0) {
            baseSlowdownPct = Math.max(0, (baseActualPace - firstMid) / firstMid);
          }
          
          // Check if finish segment was on target.
          // NOTE: pace ranges are in sec/mi where lower can mean "faster" (smaller number),
          // and some sources may invert lower/upper. Normalize first.
          const lastActualPace = lastInterval.executed?.avg_pace_s_per_mi;
          const finishOnTarget = isPaceOnTarget(lastActualPace, lastRange);
          
          // Format finish pace for display
          const formatPace = (secPerMi: number): string => {
            const mins = Math.floor(secPerMi / 60);
            const secs = Math.round(secPerMi % 60);
            return `${mins}:${String(secs).padStart(2, '0')}/mi`;
          };
          const finishPace = lastActualPace ? formatPace(lastActualPace) : undefined;
          const finishTargetPace = lastMid > 0 ? formatPace(lastMid) : undefined;
          const basePace = baseActualPace ? formatPace(baseActualPace) : undefined;
          const baseTargetPace = firstMid > 0 ? formatPace(firstMid) : undefined;
          
          segmentData = {
            basePace,
            baseTargetPace,
            baseActualSecPerMi: Number.isFinite(Number(baseActualPace)) ? Number(baseActualPace) : undefined,
            baseTargetSecPerMi: Number.isFinite(Number(firstMid)) ? Number(firstMid) : undefined,
            baseDeltaSecPerMi:
              Number.isFinite(Number(baseActualPace)) && Number.isFinite(Number(firstMid)) ? (Number(baseActualPace) - Number(firstMid)) : undefined,
            baseSlowdownPct,
            finishOnTarget,
            finishPace,
            finishTargetPace,
            finishActualSecPerMi: Number.isFinite(Number(lastActualPace)) ? Number(lastActualPace) : undefined,
            finishTargetSecPerMi: Number.isFinite(Number(lastMid)) ? Number(lastMid) : undefined,
            finishDeltaSecPerMi:
              Number.isFinite(Number(lastActualPace)) && Number.isFinite(Number(lastMid)) ? (Number(lastActualPace) - Number(lastMid)) : undefined,
            hasFinishSegment
          };
          
          console.log(`📊 [SEGMENT DATA] Fast-finish detected: base=${basePace} vs ${baseTargetPace} (slowdown=${(baseSlowdownPct*100).toFixed(1)}%), finishOnTarget=${finishOnTarget}, finish=${finishPace} vs ${finishTargetPace}`);
        }
      }
    }
    
    // Provide user-specific HR zones when we have a learned threshold HR baseline.
    const hrZonesFromBaseline = (() => {
      try {
        const thr = Number((learnedFitness as any)?.run_threshold_hr?.value ?? (learnedFitness as any)?.runThresholdHr?.value);
        if (!Number.isFinite(thr) || thr <= 0) return undefined;
        const z1Max = Math.round(thr * 0.75);
        const z2Max = Math.round(thr * 0.85);
        const z3Max = Math.round(thr * 0.92);
        const z4Max = Math.round(thr * 0.98);
        return { z1Max, z2Max, z3Max, z4Max, z5Max: 999 };
      } catch {
        return undefined;
      }
    })();

    // SINGLE SOURCE OF TRUTH: workout type key for interpretation.
    // Contract:
    // - Plan intent (when present) wins.
    // - Otherwise, fall back to deterministic detection (today: interval-structure heuristic).
    // - HR analyzer may observe interval-like patterns, but must not override plan intent.
    const planClassifiedTypeKey = resolveClassifiedTypeKey(plannedWorkout, planContextForDrift, goalRaceCompletionMatch);
    const linkedPlanWorkSteps = getPlannedWorkSteps(plannedWorkout);
    const isLinkedPlanSession = !!plannedWorkout && linkedPlanWorkSteps.length > 0;
    const classifiedTypeKey = isLinkedPlanSession
      ? (planClassifiedTypeKey || 'easy')
      : (planClassifiedTypeKey || String(detectWorkoutTypeFromIntervals(intervalsToAnalyze, plannedWorkout) || '').trim() || 'steady_state');
    const classifiedHrWorkoutType: WorkoutType = mapClassifiedTypeToHrWorkoutType(classifiedTypeKey);

    const hrAnalysisContext: HRAnalysisContext = {
      workoutType: classifiedHrWorkoutType,
      intervals: intervalsToAnalyze.map(interval => {
        // Compute timestamps from sample indices
        // Sample indices are roughly 1 sample per second
        const sampleIdxStart = interval.sample_idx_start ?? 0;
        const sampleIdxEnd = interval.sample_idx_end ?? 0;
        
        // Compute timestamp: base + index offset (in same units as base)
        let startTimeS = interval.start_time_s;
        let endTimeS = interval.end_time_s;
        
        // If no explicit timestamps, compute from sample indices
        if (!startTimeS || !endTimeS) {
          if (isMilliseconds) {
            // workoutStartTimestamp is in ms, convert to ms then back
            startTimeS = workoutStartTimestamp + (sampleIdxStart * 1000);
            endTimeS = workoutStartTimestamp + (sampleIdxEnd * 1000);
          } else {
            // Already in seconds
            startTimeS = workoutStartTimestamp + sampleIdxStart;
            endTimeS = workoutStartTimestamp + sampleIdxEnd;
          }
        }
        
        return {
          role: (interval.role || interval.kind || 'work') as any,
          sampleIdxStart,
          sampleIdxEnd,
          startTimeS,
          endTimeS,
          paceRange: interval.pace_range || interval.target_pace,
          executed: interval.executed ? {
            avgPaceSPerMi: interval.executed.avg_pace_s_per_mi,
            durationS: interval.executed.duration_s,
            avgHr: interval.executed.avg_hr
          } : undefined
        };
      }),
      terrain: {
        totalElevationGainM: workout?.elevation_gain ?? workout?.metrics?.elevation_gain ?? undefined,
        samples: sensorData
      },
      weather: (() => {
        const avgC = workout?.avg_temperature;
        const wd = workout?.weather_data;
        if (avgC == null && !wd) return undefined;
        const deviceF = avgC != null && avgC !== 0 ? Math.round(avgC * 9/5 + 32) : null;
        const apiF = wd?.temperature ?? null;
        const tempF = deviceF ?? apiF ?? (avgC === 0 ? 32 : null);
        return {
          temperatureF: tempF,
          feelsLikeF: wd?.feels_like,
          humidity: wd?.humidity,
          source: deviceF != null ? 'device' as const : 'openmeteo' as const,
        };
      })(),
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
        planName: planContextForDrift.planName,
        daysUntilRace: planContextForDrift.daysUntilRace ?? null,
      } : undefined,
      goalRaceCompletion: goalRaceCompletionMatch.matched
        ? {
            matched: true,
            eventName: goalRaceCompletionMatch.eventName,
            goalId: goalRaceCompletionMatch.goalId,
          }
        : undefined,
      historicalDrift: historicalDriftData ? {
        similarWorkouts: historicalDriftData.similarWorkouts || [],
        avgDriftBpm: historicalDriftData.avgDriftBpm || 0,
        trend: historicalDriftData.recentTrend,
        lastSimilar: historicalDriftData.lastWeekSimilar
      } : undefined,
      userUnits: userUnits as 'imperial' | 'metric',
      hrZones: hrZonesFromBaseline,
      // Pace adherence from granular analysis (0-1 fraction → 0-100 percentage)
      paceAdherencePct: analysis.overall_adherence != null 
        ? Math.round(analysis.overall_adherence * 100) 
        : undefined,
      // Segment-level data for long runs with fast finish
      segmentData
    };
    
    // Debug: log computed interval timestamps
    if (hrAnalysisContext.intervals.length > 0) {
      const firstInterval = hrAnalysisContext.intervals[0];
      console.log(`💓 [HR CONTEXT] Computed timestamps for first interval: startTimeS=${firstInterval.startTimeS}, endTimeS=${firstInterval.endTimeS}, isMs=${isMilliseconds}`);
    }
    
    const hrAnalysisResult = analyzeHeartRate(sensorData, hrAnalysisContext);
    console.log(`🏁 AFTER_HR +${Date.now()-_t0}ms heap=${_mem()} drift=${hrAnalysisResult.drift?.driftBpm ?? 'N/A'}`);
    
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
        max_heart_rate: hrAnalysisResult.summary?.maxHr ?? null,
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
    console.log('🔍 Enhanced analysis keys:', Object.keys(enhancedAnalysis));
    
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
    
    let performance: Record<string, any> = {
      execution_adherence: 0,
      pace_adherence: 0,
      duration_adherence: 0,
      completed_steps: 0,
      total_steps: computedIntervals.length,
      gap_adjusted: false,
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
      const workStepsForDetection = getPlannedWorkSteps(plannedWorkout);
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
          || (workout.moving_time ? (workout.moving_time < 1000 ? workout.moving_time * 60 : workout.moving_time) : null)
          || null;
        const distanceKmForPace = workout.distance || 0;
        const distanceMiForPace = distanceKmForPace * 0.621371;
        const avgPaceSecondsForAdherence = (movingTimeForPace > 0 && distanceMiForPace > 0) 
          ? movingTimeForPace / distanceMiForPace 
          : null;
        
        const targetPaceLower = workStepsForDetection[0]?.pace_range?.lower;
        const targetPaceUpper = workStepsForDetection[0]?.pace_range?.upper;
        
        if (avgPaceSecondsForAdherence && targetPaceLower && targetPaceUpper) {
          const stepKind = String(workStepsForDetection[0]?.kind || workStepsForDetection[0]?.role || '').toLowerCase();
          const isEasyOrLongRun =
            (planContextForDrift?.isRecoveryWeek === true || planContextForDrift?.weekIntent === 'recovery') ||
            stepKind === 'easy' || stepKind === 'long' || stepKind === 'aerobic' || stepKind === 'recovery';
          console.log(`🔍 [LINKED PLAN TYPE] single-work-step intent: ${isEasyOrLongRun ? 'easy/recovery' : 'work'}`);
          
          const intervalType: IntervalType = isEasyOrLongRun ? 'easy' : 'work';
          console.log(`🔍 [INTERVAL TYPE] Detected as '${intervalType}' - stepKind: ${stepKind}`);
          
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
        const workIntervalsForAdherence = computedIntervals.filter((i: any) => {
          const role = String(i?.role ?? i?.kind ?? i?.type ?? '').toLowerCase();
          const isWork = role === 'work' || role === 'interval' || role === 'repeat';
          return isWork && hasExecutionEvidence(i);
        });
        
        const intervalAdherences: number[] = [];
        
        const isIntervalWorkout = workStepsForDetection.length >= 2;
        const isEasyOrLongRunWorkout = !isIntervalWorkout && (
          planContextForDrift?.isRecoveryWeek === true || planContextForDrift?.weekIntent === 'recovery'
        );
        console.log(`🔍 [LINKED PLAN TYPE] multi-work-step=${workStepsForDetection.length}, interval=${isIntervalWorkout}`);
        
        for (const interval of workIntervalsForAdherence) {
          // Get the interval's actual average pace
          const actualPace = Number(
            interval?.executed?.avg_pace_s_per_mi ??
            interval?.executed?.pace_s_per_mi ??
            interval?.pace_s_per_mi ??
            interval?.avg_pace_s_per_mi ??
            (Number.isFinite(Number(interval?.actual_pace_min_per_mi))
              ? Number(interval.actual_pace_min_per_mi) * 60
              : 0)
          );
          
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
        } else if (workIntervalsForAdherence.length === 0 && !isIntervalWorkout) {
          // True steady-state run (single work step): use average pace vs target.
          console.log(`🔍 [PACE ADHERENCE] No work intervals (steady-state), calculating average pace vs target`);
          
          // Calculate overall average pace
          const movingTimeForPace = workout?.computed?.overall?.duration_s_moving 
            || (workout.moving_time ? (workout.moving_time < 1000 ? workout.moving_time * 60 : workout.moving_time) : null)
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
            const isEasyOrLongRun =
              (planContextForDrift?.isRecoveryWeek === true || planContextForDrift?.weekIntent === 'recovery');
            const intervalType: IntervalType = isEasyOrLongRun ? 'easy' : 'work';
            console.log(`🔍 [LINKED PLAN TYPE] steady-state fallback intent=${isEasyOrLongRun ? 'easy/recovery' : 'work'}`);
            
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
        } else if (workIntervalsForAdherence.length === 0 && isIntervalWorkout) {
          // Planned interval workout with missing attached work executions.
          // Keep interval classification; do not cross into steady-state logic.
          granularPaceAdherence = 0;
          console.warn(`⚠️ [PACE ADHERENCE] Interval workout missing attached work executions; adherence held at 0 until interval linkage is present.`);
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
      
      performance.pace_adherence = granularPaceAdherence;
      performance.duration_adherence = granularDurationAdherence;
      performance.gap_adjusted = !!(analysis as any).gap_adjusted;
      
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

    const plannedWorkStepsForContract = getPlannedWorkSteps(plannedWorkout);

    const looksPlanLinkedZeroed =
      !!plannedWorkout &&
      plannedWorkStepsForContract.length > 0 &&
      performance.execution_adherence === 0 &&
      performance.pace_adherence === 0 &&
      performance.duration_adherence === 0;

    if (looksPlanLinkedZeroed) {
      const fallbackPace = enhancedAnalysis.overall_adherence != null
        ? Math.round(enhancedAnalysis.overall_adherence * 100)
        : 0;
      const fallbackDuration = enhancedAnalysis.duration_adherence?.adherence_percentage != null
        ? Math.round(enhancedAnalysis.duration_adherence.adherence_percentage)
        : 0;
      performance.pace_adherence = fallbackPace;
      performance.duration_adherence = fallbackDuration;
      performance.execution_adherence = Math.round((fallbackPace + fallbackDuration) / 2);
      performance.total_steps = Math.max(performance.total_steps, plannedWorkStepsForContract.length);
      console.warn('⚠️ [PLAN CONTRACT GUARD] Recovered plan-linked adherence from granular metrics to avoid invalid 0/0/0 payload.', {
        workout_id,
        planned_work_steps: plannedWorkStepsForContract.length,
        fallbackPace,
        fallbackDuration,
      });
    }

    console.log('✅ Performance calculated:', performance);

    // Attach performance to enhancedAnalysis so it's available in generateIntervalBreakdown
    // This ensures single source of truth - performance.pace_adherence matches Summary view
    enhancedAnalysis.performance = performance;
    
    // FIX: Update HR narrative with correct pace adherence
    // The HR analysis ran before performance was calculated, so it used time-in-range (overall_adherence)
    // instead of average pace adherence (performance.pace_adherence). Fix the narrative to match the UI.
    if (analysis.heart_rate_analysis?.hr_drift_interpretation && performance.pace_adherence != null) {
      const currentNarrative = analysis.heart_rate_analysis.hr_drift_interpretation;
      const paceAdherencePct = Math.round(performance.pace_adherence);
      
      // Detect and fix pace assessment conflicts
      // The narrative might say "Slower than prescribed" when pace_adherence is actually 95%+
      const slowPhrases = [
        'Slower than prescribed — could be fatigue or pacing.',
        'Well off pace, though conditions were challenging.',
        'Slightly slower than prescribed, and conditions were a factor.',
        'Slightly slower than prescribed.',
      ];
      
      let correctedNarrative = currentNarrative;

      const replacePaceSentence = (narrative: string, replacement: string): string => {
        // Replace the steady-state "slower than target range" sentence(s) without depending on exact temperature text.
        // Examples:
        // - "Pace was slower than the target range, but warm conditions (74°F) increased the effort cost. HR suggests you still achieved the aerobic stimulus."
        // - "Pace was slower than the target range, but HR response confirms the aerobic stimulus was achieved."
        const patterns: RegExp[] = [
          /Pace was slower than the target range,[\s\S]*?aerobic stimulus\./,
          /Pace was slower than the target range,[\s\S]*?stimulus was achieved\./,
          /Pace was slower than the target range\.[\s\S]*?aerobic stimulus\./,
          /Pace was slower than the target range\.[\s\S]*?stimulus was achieved\./,
        ];
        let out = narrative;
        for (const re of patterns) {
          if (re.test(out)) {
            out = out.replace(re, replacement);
            break;
          }
        }
        return out;
      };
      
      if (paceAdherencePct >= 95) {
        // Should say "on target" or "hit targets despite conditions"
        for (const phrase of slowPhrases) {
          if (currentNarrative.includes(phrase)) {
            correctedNarrative = currentNarrative.replace(phrase, 'Pace was on target.');
            console.log(`🔧 [NARRATIVE FIX] Corrected pace assessment: "${phrase}" → "Pace was on target." (pace_adherence=${paceAdherencePct}%)`);
            break;
          }
        }
        if (correctedNarrative === currentNarrative && currentNarrative.includes('Pace was slower than the target range')) {
          correctedNarrative = replacePaceSentence(currentNarrative, 'Pace was on target.');
          if (correctedNarrative !== currentNarrative) {
            console.log(`🔧 [NARRATIVE FIX] Corrected target-range pace assessment → "Pace was on target." (pace_adherence=${paceAdherencePct}%)`);
          }
        }
      } else if (paceAdherencePct >= 85 && paceAdherencePct < 95) {
        // Should say "slightly slower"
        const verySlowPhrases = ['Slower than prescribed — could be fatigue or pacing.', 'Well off pace, though conditions were challenging.'];
        for (const phrase of verySlowPhrases) {
          if (currentNarrative.includes(phrase)) {
            correctedNarrative = currentNarrative.replace(phrase, 'Slightly slower than prescribed.');
            console.log(`🔧 [NARRATIVE FIX] Corrected pace assessment: "${phrase}" → "Slightly slower than prescribed." (pace_adherence=${paceAdherencePct}%)`);
            break;
          }
        }
        if (correctedNarrative === currentNarrative && currentNarrative.includes('Pace was slower than the target range')) {
          correctedNarrative = replacePaceSentence(currentNarrative, 'Slightly slower than prescribed.');
          if (correctedNarrative !== currentNarrative) {
            console.log(`🔧 [NARRATIVE FIX] Corrected target-range pace assessment → "Slightly slower than prescribed." (pace_adherence=${paceAdherencePct}%)`);
          }
        }
      }
      
      if (correctedNarrative !== currentNarrative) {
        analysis.heart_rate_analysis.hr_drift_interpretation = correctedNarrative;
      }
    }

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
      const workSteps = getPlannedWorkSteps(plannedWorkout);

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

    console.log(`🏁 BEFORE_DETAILED +${Date.now()-_t0}ms heap=${_mem()} perf=${performance.execution_adherence}%`);
    
    let detailedAnalysis = null;
    try {
      detailedAnalysis = generateDetailedChartAnalysis(sensorData, computedIntervals, enhancedAnalysis, plannedPaceInfo, workout, userUnits, plannedWorkout);
      console.log(`🏁 AFTER_DETAILED +${Date.now()-_t0}ms heap=${_mem()}`);
    } catch (error) {
      console.error('❌ Detailed analysis generation failed:', error);
      detailedAnalysis = { error: 'Failed to generate detailed analysis', message: error.message };
    }

    // Recalculate execution score from interval_breakdown
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
      // computed.* is owned by compute-workout-analysis/summary.
      // Do not overwrite intervals here to avoid persisting plan-shaped analysis artifacts.
      intervals: workoutToUse.computed?.intervals || workout.computed?.intervals || [],
      planned_steps_light: workoutToUse.computed?.planned_steps_light || workout.computed?.planned_steps_light || null
    };
    // Only include overall if it exists (preserve from compute-workout-analysis)
    if (workoutToUse.computed?.overall || workout.computed?.overall) {
      minimalComputed.overall = workoutToUse.computed?.overall || workout.computed?.overall;
    }
    // NOTE: analysis (with series) is NOT included — it's owned by compute-workout-analysis
    // and preserved by the JSONB || merge operator in merge_computed RPC.
    
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

    console.log('🔍 [PRE-UPDATE DEBUG] detailedAnalysis keys:', detailedAnalysis ? Object.keys(detailedAnalysis) : 'N/A');
    
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
    const aerobicCeilingBpm = (() => {
      try {
        const thr = Number((learnedFitness as any)?.run_threshold_hr?.value ?? (learnedFitness as any)?.runThresholdHr?.value);
        if (!Number.isFinite(thr) || thr <= 0) return null;
        return Math.round(thr * 0.85); // match fact-packet Z2 ceiling
      } catch {
        return null;
      }
    })();

    const adherenceSummary = generateAdherenceSummary(
      performance as { execution_adherence: number; pace_adherence: number; duration_adherence: number },
      detailedAnalysis,
      plannedWorkout,
      planContext,
      enhancedAnalysis,
      aerobicCeilingBpm,
      classifiedTypeKey,
      (hrAnalysisContext as any)?.weather?.temperatureF ?? null,
      goalRaceCompletionMatch,
      workout,
      workout?.weather_data ?? null,
    );
    const scoreExplanation = adherenceSummary?.verdict ?? null;
    console.log('📝 [ADHERENCE SUMMARY] verdict:', scoreExplanation, 'technical_insights:', adherenceSummary?.technical_insights?.length, 'plan_impact:', !!adherenceSummary?.plan_impact);

    // =========================================================================
    // Deterministic fact packet (v1) — single source of truth for coaching.
    console.log(`🏁 BEFORE_FACTPACKET +${Date.now()-_t0}ms heap=${_mem()}`);
    let fact_packet_v1: any = null;
    let flags_v1: any = null;
    try {
      // Prefer early plan context (for drift), but fallback to the later fetch
      const planContextForFact = (planContextForDrift as any) || planContext || null;
      if (planContextForFact) {
        console.log('📦 [FACT PACKET] planContext:', {
          weekIndex: (planContextForFact as any)?.weekIndex,
          weekIntent: (planContextForFact as any)?.weekIntent,
          isRecoveryWeek: (planContextForFact as any)?.isRecoveryWeek,
          phaseName: (planContextForFact as any)?.phaseName,
        });
      } else {
        console.log('📦 [FACT PACKET] planContext: null');
      }

      const workoutForFact = {
        ...workout,
        // Provide the same analysis object we're about to write to DB
        workout_analysis: {
          granular_analysis: enhancedAnalysis,
          performance,
          detailed_analysis: detailedAnalysis,
          classified_type: classifiedTypeKey,
        },
      };

      // Repair legacy duration units bug: if duration_s_moving is ~60x off (e.g. 108000 vs 1800),
      // infer correct seconds from moving_time/duration and patch before fact packet build.
      try {
        const overall = (workoutForFact as any)?.computed?.overall;
        const cur = Number(overall?.duration_s_moving);
        const mv = Number((workoutForFact as any)?.moving_time);
        const dur = Number((workoutForFact as any)?.duration);
        const raw = Number.isFinite(mv) && mv > 0 ? mv : Number.isFinite(dur) && dur > 0 ? dur : null;
        let inferred: number | null = null;
        if (raw != null && raw > 0) {
          inferred = raw < 1000 ? Math.round(raw * 60) : Math.round(raw);
        }
        if (
          Number.isFinite(cur) &&
          cur > 0 &&
          inferred != null &&
          inferred > 0 &&
          (cur / inferred >= 10 || inferred / cur >= 10)
        ) {
          const distM = Number(overall?.distance_m) || (Number((workoutForFact as any)?.distance) || 0) * 1000;
          const miles = distM > 0 ? distM / 1609.34 : 0;
          const avgPaceSPerMi = miles > 0 ? Math.round(inferred / miles) : null;
          const nextOverall = { ...(overall || {}), duration_s_moving: Math.round(inferred) };
          if (avgPaceSPerMi != null && avgPaceSPerMi > 0 && avgPaceSPerMi < 7200) {
            nextOverall.avg_pace_s_per_mi = avgPaceSPerMi;
          }
          const nextComputed = { ...(workoutForFact as any).computed, overall: nextOverall };
          (workoutForFact as any).computed = nextComputed;
          await supabase
            .from('workouts')
            .update({ computed: nextComputed })
            .eq('id', workout_id);
          console.log('🛠️ Repaired computed.overall.duration_s_moving (unit mismatch).', { cur, inferred });
        }
      } catch (e) {
        console.warn('[analyze-running-workout] duration repair failed (non-fatal):', e);
      }

      const intent = plannedWorkout ? (detectWorkoutIntent(plannedWorkout) as any) : null;
      const { factPacket, flags } = await buildWorkoutFactPacketV1({
        supabase,
        workout: workoutForFact,
        plannedWorkout: plannedWorkout || null,
        planContext: planContextForFact
          ? {
              planName: (planContextForFact as any).planName ?? null,
              phaseName: (planContextForFact as any).phaseName ?? null,
              weekFocusLabel: (planContextForFact as any).weekFocusLabel ?? null,
              weekIndex: (planContextForFact as any).weekIndex ?? null,
              weekIntent: (planContextForFact as any).weekIntent ?? null,
              isRecoveryWeek: (planContextForFact as any).isRecoveryWeek ?? null,
              daysUntilRace: (planContextForFact as any).daysUntilRace ?? null,
            }
          : null,
        workoutIntent: (intent as any) || null,
        classifiedTypeOverride: classifiedTypeKey,
        learnedFitness: learnedFitness || null,
      });
      fact_packet_v1 = factPacket;
      flags_v1 = flags;

      if (fact_packet_v1 && performance) {
        const fp = fact_packet_v1 as any;
        if (!fp.derived) fp.derived = {};
        fp.derived.interval_execution = {
          execution_score: performance.execution_adherence ?? null,
          pace_adherence: performance.pace_adherence ?? null,
          duration_adherence: performance.duration_adherence ?? null,
          completed_steps: performance.completed_steps ?? null,
          total_steps: performance.total_steps ?? null,
          gap_adjusted: !!performance.gap_adjusted,
        };
      }
    } catch (e) {
      console.warn('[analyze-running-workout] fact_packet_v1 build failed:', e);
      fact_packet_v1 = null;
      flags_v1 = null;
    }

    // =========================================================================
    // AI coaching paragraph (v1)
    // Fact packet + flags + holistic training context (deterministic layer).
    // =========================================================================
    let ai_summary: string | null = null;
    let ai_summary_generated_at: string | null = null;
    try {
      if (fact_packet_v1 && flags_v1) {
        ai_summary = await generateAISummaryV1(fact_packet_v1, flags_v1);
        if (ai_summary) ai_summary_generated_at = new Date().toISOString();
      }
    } catch (e) {
      console.warn('[analyze-running-workout] ai_summary generation failed:', e);
      ai_summary = null;
      ai_summary_generated_at = null;
    }

    // =========================================================================
    // Interval display (needed by summaryV1 below and session_state_v1)
    // =========================================================================
    const intervalDisplay = buildSessionIntervalRows(
      plannedWorkout,
      detailedAnalysis,
      computedIntervals,
      workout
    );

    // =========================================================================
    // Standardized per-workout summary (v1)
    // Discipline analyzers write this; coach consumes it (no re-interpretation).
    // =========================================================================
    const summaryV1 = (() => {
      type SummaryV1 = {
        version: 1;
        title: string;
        bullets: string[];
        tags: string[];
        confidence: number; // 0..1
      };

      // When a deterministic fact packet exists, avoid "HIGH CARDIAC STRESS" style titles that can
      // contradict plan intent and flags. Use a neutral title; the flags/coach paragraph carry the meaning.
      const title =
        (fact_packet_v1 ? 'Summary' : (
          (hrAnalysisResult as any)?.summaryLabel
          || (enhancedAnalysis as any)?.heart_rate_analysis?.summary_label
          || 'Summary'
        ));

      const narrative = String((hrAnalysisResult as any)?.interpretation || '').trim();
      const sentences = (() => {
        if (!narrative) return [] as string[];
        // Split on ". " followed by capital letter, keep periods.
        const parts = narrative
          .split(/\. (?=[A-Z])/g)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => (s.endsWith('.') ? s : `${s}.`));
        return parts;
      })();

      const bullets: string[] = [];
      // Prefer deterministic flags as the canonical "what matters" when available.
      if (fact_packet_v1 && Array.isArray(flags_v1) && flags_v1.length) {
        // Always lead with a single overall sentence so the summary isn't just one flag.
        try {
          const fp = fact_packet_v1 as any;
          const dist = Number(fp?.facts?.total_distance_mi);
          const dur = Number(fp?.facts?.total_duration_min);
          const pace = Number(fp?.facts?.avg_pace_sec_per_mi);
          const hr = Number(fp?.facts?.avg_hr);
          const terrain = String(fp?.facts?.terrain_type || '');
          const weekIntent = String(fp?.facts?.plan?.week_intent || '').toLowerCase();
          const wt = String(fp?.facts?.workout_type || '').toLowerCase();
          const fmtMi = (m: number) => `${m.toFixed(m < 1 ? 2 : 1)} mi`;
          const fmtMin = (m: number) => `${Math.round(m)} min`;
          const fmtPace = (secPerMi: number): string => {
            const s = Math.round(Math.max(0, secPerMi));
            const mm = Math.floor(s / 60);
            const ss = s % 60;
            return `${mm}:${String(ss).padStart(2, '0')}/mi`;
          };
          if (Number.isFinite(dist) && dist > 0 && Number.isFinite(dur) && dur > 0) {
            const isRecovery = weekIntent === 'recovery' || wt.includes('recovery');
            const execScore = typeof performance?.execution_adherence === 'number' ? performance.execution_adherence : null;
            const paceAdh = typeof performance?.pace_adherence === 'number' ? performance.pace_adherence : null;
            const completedSteps = typeof performance?.completed_steps === 'number' ? performance.completed_steps : null;
            const totalSteps = typeof performance?.total_steps === 'number' ? performance.total_steps : null;
            const isInterval = intervalDisplay?.mode === 'interval_compare_ready' && (intervalDisplay?.expected_work_rows ?? 0) >= 2;

            if (isInterval && execScore != null && completedSteps != null && totalSteps != null) {
              const workRows = (intervalDisplay?.rows || []).filter((r: any) => r?.kind === 'work');
              const paceStrings = workRows
                .map((r: any) => {
                  const p = r?.executed?.avg_pace_s_per_mi;
                  return (typeof p === 'number' && p > 0) ? fmtPace(p) : null;
                })
                .filter(Boolean);
              const targetDisplay = workRows[0]?.planned_pace_display || null;

              let line = `Interval workout: ${fmtMi(dist)} in ${fmtMin(dur)}`;
              if (targetDisplay) line += ` @ ${targetDisplay} target`;
              line += ` — ${execScore}% execution`;
              if (paceStrings.length > 0) line += ` (${paceStrings.join(', ')})`;
              line += '.';
              bullets.push(line);
            } else {
              const prefix = isRecovery ? 'Recovery run' : 'Run';
              const core = `${fmtMi(dist)} in ${fmtMin(dur)}`;
              const extras: string[] = [];
              if (Number.isFinite(pace) && pace > 0) extras.push(`${fmtPace(pace)}`);
              if (Number.isFinite(hr) && hr > 0) extras.push(`${Math.round(hr)} bpm avg HR`);
              if (terrain) extras.push(`${terrain} terrain`);
              if (execScore != null && execScore > 0) extras.push(`${execScore}% execution`);
              bullets.push(`${prefix}: ${core}${extras.length ? ` — ${extras.join(', ')}` : ''}.`);
            }
          }
        } catch {}

        const top = (flags_v1 as any[])
          .filter((f) => f && typeof f.message === 'string' && f.message.trim())
          .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))
          .slice(0, 2);
        for (const f of top) bullets.push(String(f.message).trim().replace(/\.$/, '') + '.');
      } else {
        const verdictRaw = (typeof adherenceSummary?.verdict === 'string' ? adherenceSummary.verdict.trim() : '');
        const verdictIsLowSignal = /\b\d+\s+of\s+\d+\s+intervals?\s+on\s+target\b/i.test(verdictRaw);
        if (verdictRaw && !verdictIsLowSignal) {
          bullets.push(verdictRaw.endsWith('.') ? verdictRaw : `${verdictRaw}.`);
        }
      }

      // If we are already summarizing via deterministic flags, do not add additional bullets
      // (it causes redundancies like repeating drift/terrain in "Context:" and again as a flag).
      const usedFlagBullets = !!(fact_packet_v1 && Array.isArray(flags_v1) && flags_v1.length);
      if (usedFlagBullets) {
        const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
        const cleanedBullets = bullets.map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4);
        const tags: string[] = [];
        const confLbl = String((hrAnalysisResult as any)?.confidence || '').toLowerCase();
        const confidence = confLbl === 'high' ? 0.85 : confLbl === 'medium' ? 0.65 : 0.45;
        return {
          version: 1,
          title: String(title),
          bullets: cleanedBullets.length ? cleanedBullets : [],
          tags: uniq(tags),
          confidence,
        } as any;
      }

      // Add 1-2 deterministic “coach-grade” insight bullets before the narrative,
      // using plan expectations + conditions + your historical norms (when available).
      try {
        // Prefer canonical fact packet signals when available (limiter/stimulus/comparisons).
        try {
          const st = fact_packet_v1?.derived?.stimulus;
          if (st && typeof st.achieved === 'boolean') {
            // Avoid repeating the Stimulus line in the summary when it's already shown in Analysis Details.
            // Keep the "missed" case since it's actionable.
            if (!st.achieved) {
              const note = st.partial_credit ? String(st.partial_credit) : 'targets/physiology did not align';
              bullets.push(`Stimulus may have been missed — ${note.endsWith('.') ? note : `${note}.`}`);
            }
          }

          const lim = fact_packet_v1?.derived?.primary_limiter;
          if (lim?.limiter) {
            const conf = Number(lim.confidence);
            const ev0 = Array.isArray(lim.evidence) && lim.evidence.length ? String(lim.evidence[0]) : '';
            const confPct = Number.isFinite(conf) ? Math.round(conf * 100) : null;
            bullets.push(
              `Primary limiter: ${String(lim.limiter)}${confPct != null ? ` (${confPct}%)` : ''}${ev0 ? ` — ${ev0.replace(/\.$/, '')}.` : '.'}`
            );
          }

          const vs = fact_packet_v1?.derived?.comparisons?.vs_similar;
          if (vs && typeof vs.sample_size === 'number' && vs.sample_size >= 3 && typeof vs.assessment === 'string') {
            const map: Record<string, string> = {
              better_than_usual: 'Better than usual vs similar workouts.',
              typical: 'Typical vs similar workouts.',
              worse_than_usual: 'Worse than usual vs similar workouts.',
            };
            const msg = map[String(vs.assessment)] || null;
            if (msg) bullets.push(msg);
          }
        } catch {}

        const seg = (hrAnalysisContext as any)?.segmentData || null;
        const histAvg = Number((hrAnalysisContext as any)?.historicalDrift?.avgDriftBpm);
        const driftBpm = Number((hrAnalysisResult as any)?.drift?.driftBpm);
        const tempF = Number((hrAnalysisContext as any)?.weather?.temperatureF);
        const humidity = Number((hrAnalysisContext as any)?.weather?.humidity);

        const fmtDelta = (sec: number): string => {
          const s = Math.round(Math.abs(sec));
          const m = Math.floor(s / 60);
          const r = s % 60;
          return `${m}:${String(r).padStart(2, '0')}`;
        };
        const fmtPace = (secPerMi: number): string => {
          const s = Math.round(Math.max(0, secPerMi));
          const m = Math.floor(s / 60);
          const r = s % 60;
          return `${m}:${String(r).padStart(2, '0')}/mi`;
        };

        // Baseline easy/base comparison (what this means *for you*, not just the plan).
        const baseActual = Number(seg?.baseActualSecPerMi);
        const baseBaseline = Number(baselinePacesSecPerMi.base);
        if (seg?.hasFinishSegment && Number.isFinite(baseActual) && baseActual > 0 && Number.isFinite(baseBaseline) && baseBaseline > 0) {
          const d = baseActual - baseBaseline;
          const abs = Math.abs(d);
          if (abs <= 10) {
            bullets.push(`Easy portion aligned with your baseline base pace (~${fmtPace(baseBaseline)}).`);
          } else {
            const dir = d > 0 ? 'slower' : 'faster';
            bullets.push(`Easy portion was ${fmtDelta(d)}/mi ${dir} than your baseline base pace (~${fmtPace(baseBaseline)}).`);
          }
        }

        // Segment delta (fast-finish magnitude)
        const finishDelta = Number(seg?.finishDeltaSecPerMi);
        if (seg?.hasFinishSegment && Number.isFinite(finishDelta) && Math.abs(finishDelta) >= 10) {
          const dir = finishDelta > 0 ? 'slower' : 'faster';
          bullets.push(`Fast-finish segment was ${fmtDelta(finishDelta)}/mi ${dir} than target.`);
        }

        // Historical drift baseline
        if (Number.isFinite(histAvg) && histAvg > 0 && Number.isFinite(driftBpm) && driftBpm > 0) {
          bullets.push(`HR drift ${Math.round(driftBpm)} bpm vs your typical ~${Math.round(histAvg)} bpm for similar runs.`);
        }

        // Conditions / terrain / pacing fluctuations (only when we have real signal).
        // Keep this to a single concise bullet so it stays high-signal.
        try {
          const parts: string[] = [];

          if (Number.isFinite(tempF)) {
            const tf = Math.round(tempF);
            if (tf >= 70) {
              const hum = Number.isFinite(humidity) ? `, ${Math.round(humidity)}% humidity` : '';
              parts.push(`${tf}°F${hum}`);
            }
          }

          // Pacing fluctuations: prefer CV% from granular pacing analysis; fallback to interval speed fluctuations
          const cv = Number((enhancedAnalysis as any)?.pacing_analysis?.pacing_variability?.coefficient_of_variation);
          const varPct = Number((detailedAnalysis as any)?.speed_fluctuations?.pace_variability_percent);
          const paceVar = Number.isFinite(cv) ? cv : (Number.isFinite(varPct) ? varPct : null);
          if (paceVar != null) {
            const pv = Math.round(paceVar);
            if (pv >= 6) parts.push(`pace variability ~${pv}%`);
          }

          // Terrain: use mile-by-mile splits to detect "rolling" / non-flat terrain
          const terrain = (detailedAnalysis as any)?.mile_by_mile_terrain;
          const splits = Array.isArray(terrain?.splits) ? terrain.splits : [];
          if (splits.length >= 3) {
            const nonFlat = splits.filter((s: any) => String(s?.terrain_type || '').toLowerCase() !== 'flat').length;
            if (nonFlat / splits.length >= 0.4) parts.push('rolling terrain');
          }

          if (parts.length) {
            bullets.push(`Context: ${parts.slice(0, 3).join(' • ')}.`);
          }
        } catch {}
      } catch {}

      for (const s of sentences) {
        // When the fact packet exists, avoid re-introducing legacy narrative sentences
        // (it tends to restate the interval table rather than coach).
        if (fact_packet_v1) break;
        if (bullets.length >= 4) break;
        if (bullets.some((b) => b.toLowerCase() === s.toLowerCase())) continue;
        bullets.push(s);
      }

      const tags: string[] = [];
      // Pace adherence tags (use the same metric displayed in UI)
      const paceAdh = Number((performance as any)?.pace_adherence);
      if (Number.isFinite(paceAdh)) {
        if (paceAdh >= 95) tags.push('pace_on_target');
        else if (paceAdh >= 85) tags.push('pace_slightly_off');
        else tags.push('pace_off_target');
      }
      // HR drift assessment tags
      const driftAssess = (hrAnalysisResult as any)?.drift?.assessment;
      if (driftAssess === 'excellent' || driftAssess === 'good' || driftAssess === 'normal') tags.push('hr_drift_normal');
      if (driftAssess === 'elevated') tags.push('hr_drift_elevated');
      if (driftAssess === 'high') tags.push('hr_drift_high');
      // Conditions tags (temperature only; keep simple/portable)
      const tempF = (hrAnalysisContext as any)?.weather?.temperatureF;
      if (Number.isFinite(Number(tempF))) {
        const tf = Number(tempF);
        if (tf >= 85) tags.push('conditions_hot');
        else if (tf >= 70) tags.push('conditions_warm');
      }
      // Workout type tag from HR analyzer
      const wt = String((hrAnalysisResult as any)?.workoutType || '').trim();
      if (wt) tags.push(`workout_type_${wt}`);

      // Confidence mapping
      const confLbl = String((hrAnalysisResult as any)?.confidence || '').toLowerCase();
      const confidence = confLbl === 'high' ? 0.85 : confLbl === 'medium' ? 0.65 : 0.45;

      const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
      const cleanedBullets = bullets.map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4);

      const out: SummaryV1 = {
        version: 1,
        title: String(title),
        // Goal races use structured technical_insights — bullets would show as wall-of-text INSIGHTS
        bullets: goalRaceCompletionMatch.matched
          ? []
          : (cleanedBullets.length ? cleanedBullets : (scoreExplanation ? [String(scoreExplanation)] : [])),
        tags: uniq(tags),
        confidence,
      };
      return out;
    })();

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
    
    // Preserve previous ai_summary when LLM fails on recompute.
    if (!ai_summary) {
      const { data: existingRow, error: existingRowErr } = await supabase
        .from('workouts')
        .select('workout_analysis')
        .eq('id', workout_id)
        .single();
      if (existingRowErr) {
        console.warn('[analyze-running-workout] failed to read existing workout_analysis:', existingRowErr.message);
      }
      const prev = existingRow?.workout_analysis;
      if (typeof prev?.ai_summary === 'string') {
        ai_summary = prev.ai_summary;
        ai_summary_generated_at = typeof prev?.ai_summary_generated_at === 'string'
          ? prev.ai_summary_generated_at
          : null;
        console.log('[analyze-running-workout] preserved previous ai_summary');
      }
      // Don't hold the blob — we only needed ai_summary.
    }

    const { data: existingAnalysisRow } = await supabase
      .from('workouts')
      .select('workout_analysis')
      .eq('id', workout_id)
      .maybeSingle();
    const prevWa = existingAnalysisRow?.workout_analysis as Record<string, unknown> | null | undefined;
    const preservedRaceDebrief =
      typeof prevWa?.race_debrief_text === 'string' && prevWa.race_debrief_text.trim()
        ? prevWa.race_debrief_text.trim()
        : null;

    let raceDebriefNew: string | null = null;
    // Hoisted out of the inner try so the persist step below can snapshot it
    // into workout_analysis.course_strategy_zones (defense-in-depth read path).
    let courseStrategyZonesUsed: CourseStrategyZoneLine[] | null = null;
    if (goalRaceCompletionMatch.matched) {
      try {
        const wAny = workout as Record<string, unknown>;
        const overall = (wAny.computed as Record<string, unknown> | undefined)?.overall as
          | Record<string, unknown>
          | undefined;
        const elapsedSec = (() => {
          const el = Number(overall?.duration_s_elapsed);
          if (Number.isFinite(el) && el > 60) return Math.round(el);
          const et = Number(wAny.elapsed_time);
          if (Number.isFinite(et) && et > 0) return et < 1000 ? Math.round(et * 60) : Math.round(et);
          return 0;
        })();
        const movingSec = (() => {
          const mv = Number(overall?.duration_s_moving);
          if (Number.isFinite(mv) && mv > 60) return Math.round(mv);
          const m = Number(wAny.moving_time);
          if (Number.isFinite(m) && m > 0) return m < 1000 ? Math.round(m * 60) : Math.round(m);
          return elapsedSec > 0 ? elapsedSec : 0;
        })();

        const terrain = (detailedAnalysis as Record<string, unknown> | undefined)?.mile_by_mile_terrain as
          | { splits?: unknown[] }
          | undefined;
        const rawSplits = Array.isArray(terrain?.splits) ? terrain!.splits! : [];
        const splits = rawSplits
          .map((s: unknown) => {
            const o = s as Record<string, unknown>;
            return {
              mile: Number(o.mile),
              paceSeconds: Number(o.pace_s_per_mi),
              avgHR: Math.round(Number(o.avg_hr_bpm ?? 0)),
              grade: Math.round(Number(o.grade_percent ?? 0) * 10) / 10,
            };
          })
          .filter((s) =>
            s.mile > 0 && s.paceSeconds > 120 && s.paceSeconds < 7200 && s.avgHR > 40,
          );

        const hrObj = (enhancedAnalysis as Record<string, unknown>)?.heart_rate_analysis as
          | Record<string, unknown>
          | undefined;
        const avgHr = Math.round(
          Number(hrObj?.average_heart_rate ?? hrAnalysisResult?.summary?.avgHr ?? 0) || 0,
        );
        const maxHr = Math.round(
          Number(hrObj?.max_heart_rate ?? hrAnalysisResult?.summary?.maxHr ?? 0) || 0,
        );

        const compOverall = (wAny.computed as Record<string, unknown> | undefined)?.overall as Record<string, unknown> | undefined;
        const ifVal = (() => {
          const v = Number(compOverall?.intensity_factor ?? wAny.intensity_factor);
          return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : null;
        })();

        let courseStrategyZones: CourseStrategyZoneLine[] | null = null;
        let courseStrategyWeather: {
          start_temp_f?: number | null;
          finish_temp_f?: number | null;
          humidity_pct?: number | null;
          conditions?: string | null;
        } | null = null;
        if (goalRaceCompletionMatch.goalId) {
          const { data: rc } = await supabase
            .from('race_courses')
            .select(`
              start_temp_f,
              finish_temp_f,
              humidity_pct,
              conditions,
              course_segments (
                segment_order,
                start_distance_m,
                end_distance_m,
                display_group_id,
                effort_zone,
                display_label,
                coaching_cue,
                avg_grade_pct,
                terrain_type,
                target_hr_low,
                target_hr_high
              )
            `)
            .eq('user_id', workout.user_id)
            .eq('goal_id', goalRaceCompletionMatch.goalId)
            .maybeSingle();
          if (rc) {
            courseStrategyWeather = {
              start_temp_f: rc.start_temp_f,
              finish_temp_f: rc.finish_temp_f,
              humidity_pct: rc.humidity_pct,
              conditions: rc.conditions != null ? String(rc.conditions) : null,
            };
            const rawSegs = Array.isArray((rc as { course_segments?: unknown }).course_segments)
              ? (rc as { course_segments: RawCourseSegmentRow[] }).course_segments
              : [];
            const z = collapseCourseSegmentsToZones(rawSegs);
            courseStrategyZones = z.length > 0 ? z : null;
          }
        }

        // Defense-in-depth: race_courses can be wiped or have its goal_id detached
        // (FK is ON DELETE SET NULL). If we have nothing live but a previous run
        // already snapshotted the zones into workout_analysis, use that copy.
        if (!courseStrategyZones) {
          const snap = (prevWa as Record<string, unknown> | null | undefined)?.course_strategy_zones;
          if (Array.isArray(snap) && snap.length > 0) {
            courseStrategyZones = snap as CourseStrategyZoneLine[];
            console.log('[analyze-running-workout] using snapshotted course_strategy_zones from prior workout_analysis');
          }
        }
        courseStrategyZonesUsed = courseStrategyZones;

        const activityWeather = parseWorkoutWeatherDataBlob(wAny.weather_data);
        const devC = wAny.avg_temperature;
        const deviceAvgTempC =
          devC != null && Number.isFinite(Number(devC)) && Number(devC) !== 0 ? Number(devC) : null;
        const weather = resolveRaceDebriefWeather({
          courseStrategy: courseStrategyWeather,
          activity: activityWeather,
          deviceAvgTempC,
        });

        if (splits.length >= 8 && elapsedSec > 120) {
          // When the workout is a matched goal race, ground the debrief in the
          // event name (e.g. "Ojai Valley Marathon") rather than the activity
          // title (often "Morning Run") so the LLM and copy stay race-aware.
          const debriefRaceName = goalRaceCompletionMatch.matched && goalRaceCompletionMatch.eventName
            ? String(goalRaceCompletionMatch.eventName)
            : String(wAny.name ?? 'Race');
          const debrief = await generateRaceDebrief({
            workoutName: debriefRaceName,
            elapsedSeconds: elapsedSec,
            movingSeconds: movingSec,
            goalSeconds: goalRaceCompletionMatch.goalTimeSeconds ?? null,
            projectedSeconds: goalRaceCompletionMatch.fitnessProjectionSeconds ?? null,
            avgHR: avgHr > 0 ? avgHr : 0,
            maxHR: maxHr > 0 ? maxHr : 0,
            intensityFactor: ifVal,
            weather,
            splits,
            courseStrategyZones,
          });
          if (debrief) raceDebriefNew = debrief;
        }
      } catch (e) {
        console.warn('[analyze-running-workout] race debrief skipped:', e);
      }
    }

    const race_debrief_text = raceDebriefNew ?? preservedRaceDebrief;

    const sessionStateV1 = {
      version: 1,
      owner: 'analysis',
      generated_at: new Date().toISOString(),
      workout_id: workout_id,
      discipline: 'run',
      glance: {
        status_label: adherenceSummary?.verdict?.label || null,
        execution_score: typeof performance?.execution_adherence === 'number' ? performance.execution_adherence : null,
      },
      narrative: {
        // Goal race: suppress AI narrative so structured technical_insights render instead
        text: goalRaceCompletionMatch.matched ? null : (ai_summary || null),
        source: goalRaceCompletionMatch.matched ? 'none' : (ai_summary ? 'ai' : 'none'),
      },
      summary: {
        title: (summaryV1?.title && String(summaryV1.title).trim()) ? String(summaryV1.title).trim() : 'Insights',
        bullets: Array.isArray(summaryV1?.bullets) ? summaryV1.bullets : [],
      },
      details: {
        adherence_summary: adherenceSummary ?? null,
        fact_packet_v1: fact_packet_v1 ?? null,
        flags_v1: flags_v1 ?? null,
        interval_rows: intervalDisplay.rows,
        interval_display: {
          mode: intervalDisplay.mode,
          reason: intervalDisplay.reason,
          expected_work_rows: intervalDisplay.expected_work_rows,
          measured_work_rows: intervalDisplay.measured_work_rows,
        },
      },
      guards: {
        is_transition_window: isPlanTransitionWindowByWeekIndex(planContext?.weekIndex),
        suppress_deviation_language: isPlanTransitionWindowByWeekIndex(planContext?.weekIndex),
      },
      ...(goalRaceCompletionMatch.matched ? {
        race: (() => {
          const distM = Number(workout?.computed?.overall?.distance_m);
          const distM2 = Number.isFinite(distM) && distM > 0
            ? distM
            : (Number(workout?.distance) > 0 ? Number(workout.distance) * 1000 : 0);
          const raceMi = distM2 > 0 ? distM2 / 1609.34 : 26.2188;
          const gts = goalRaceCompletionMatch.goalTimeSeconds;
          const fps = goalRaceCompletionMatch.fitnessProjectionSeconds;
          const goal_avg_pace_s_per_mi = (gts != null && Number.isFinite(gts) && raceMi > 0.1)
            ? Math.round(gts / raceMi)
            : null;
          const fitness_projection_avg_pace_s_per_mi = (fps != null && Number.isFinite(fps) && raceMi > 0.1)
            ? Math.round(fps / raceMi)
            : null;
          return {
            is_goal_race: true,
            goal_id: goalRaceCompletionMatch.goalId ?? null,
            event_name: goalRaceCompletionMatch.eventName,
            goal_time_seconds: gts ?? null,
            fitness_projection_seconds: fps ?? null,
            fitness_projection_display: goalRaceCompletionMatch.fitnessProjectionDisplay ?? null,
            goal_avg_pace_s_per_mi,
            fitness_projection_avg_pace_s_per_mi,
            actual_seconds: (() => {
              const elapsed = Number(workout?.computed?.overall?.duration_s_elapsed);
              if (Number.isFinite(elapsed) && elapsed > 0) return Math.round(elapsed);
              const elapsedMin = Number(workout?.elapsed_time);
              if (Number.isFinite(elapsedMin) && elapsedMin > 0) return Math.round(elapsedMin * 60);
              return null;
            })(),
          };
        })(),
      } : {}),
    };

    // Full replacement — every field is computed fresh in this run.
    const updatePayload = {
      workout_analysis: {
        classified_type: classifiedTypeKey,
        granular_analysis: enhancedAnalysis,
        performance: performance,
        detailed_analysis: detailedAnalysis,
        score_explanation: scoreExplanation,  // Backward-compat: single verdict line
        adherence_summary: adherenceSummary ?? null,  // Structured: verdict + technical_insights + plan_impact
        summary: summaryV1, // Standardized per-workout summary (v1)
        fact_packet_v1: fact_packet_v1,
        flags_v1: flags_v1,
        ai_summary: ai_summary,
        ai_summary_generated_at: ai_summary_generated_at,
        session_state_v1: sessionStateV1,
        mile_by_mile_terrain: detailedAnalysis?.mile_by_mile_terrain || null,  // Include terrain breakdown
        heart_rate_summary: hrAnalysisResult.summary,
        is_goal_race: goalRaceCompletionMatch.matched === true,
        race_debrief_text: race_debrief_text ?? null,
        // Snapshot the course strategy zones used for this debrief so the
        // strategy survives later loss of the race_courses row (deletion,
        // goal replacement, or migration). Read-back falls back to this
        // snapshot when race_courses returns nothing.
        course_strategy_zones: courseStrategyZonesUsed ?? (
          (prevWa as Record<string, unknown> | null | undefined)?.course_strategy_zones ?? null
        ),
      },
      analysis_status: 'complete',
      analyzed_at: new Date().toISOString()
    };
    
    console.log(`🏁 BEFORE_DB_UPDATE +${Date.now()-_t0}ms heap=${_mem()} keys=${Object.keys(updatePayload.workout_analysis).length}`);
    console.log(`🏁 [GOAL RACE SUMMARY] matched=${goalRaceCompletionMatch.matched} date=${workout.date} distance_raw=${workout.distance} computed_distance_m=${workout.computed?.overall?.distance_m}`);
    
    // Update workout_analysis and status
    const { error: updateError } = await supabase
      .from('workouts')
      .update(updatePayload)
      .eq('id', workout_id);

    console.log('✅ [TIMING] Database update completed!');
    
    if (updateError) {
      console.error('❌ Database update FAILED:', updateError);
      console.error('❌ Update payload keys:', Object.keys(updatePayload.workout_analysis));
    } else {
      console.log('✅ Analysis stored successfully in database');
    }

    console.log(`✅ Running analysis complete for workout ${workout_id}`);

    // ── Post-race feedback chain ─────────────────────────────────────────────
    // After a goal race finishes, push the result back into the intelligence
    // layer: nudge learned_fitness threshold pace if Riegel materially diverges,
    // recompute athlete memory, refresh full learned profile. Best-effort.
    // Idempotent on (goal_id, finish_seconds) via workout_analysis.post_race_feedback.
    if (goalRaceCompletionMatch.matched && !updateError) {
      try {
        const distMRaw = Number(workout?.computed?.overall?.distance_m);
        const distanceMeters = Number.isFinite(distMRaw) && distMRaw > 0
          ? distMRaw
          : (Number(workout?.distance) > 0 ? Number(workout.distance) * 1000 : 0);
        const elapsedRaw = Number(workout?.computed?.overall?.duration_s_elapsed);
        const elapsedMin = Number(workout?.elapsed_time);
        const finishSeconds = Number.isFinite(elapsedRaw) && elapsedRaw > 0
          ? Math.round(elapsedRaw)
          : (Number.isFinite(elapsedMin) && elapsedMin > 0 ? Math.round(elapsedMin * 60) : 0);

        if (finishSeconds > 0 && distanceMeters > 0) {
          const feedback = await runPostRaceFeedbackChain({
            supabase,
            supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
            serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            input: {
              userId: workout.user_id,
              workoutId: workout_id,
              goalId: goalRaceCompletionMatch.goalId ?? null,
              finishSeconds,
              distanceMeters,
              prevWorkoutAnalysis: prevWa ?? null,
            },
          });

          if (feedback.skippedIdempotent) {
            console.log('[post-race-feedback] skipped (already applied for this finish)');
          } else if (feedback.ran && feedback.marker) {
            const { error: markerErr } = await supabase
              .from('workouts')
              .update({
                workout_analysis: {
                  ...updatePayload.workout_analysis,
                  post_race_feedback: feedback.marker,
                },
              })
              .eq('id', workout_id);
            if (markerErr) {
              console.warn('[post-race-feedback] marker persist failed:', markerErr.message ?? markerErr);
            }
            console.log(
              '[post-race-feedback] applied:',
              'pace_updated=', feedback.paceUpdated,
              'delta=', feedback.marker.pace_delta_pct,
              'memory=', feedback.memoryRecomputed,
              'profile=', feedback.profileRelearned,
              'errors=', feedback.errors.length ? feedback.errors : 'none',
            );
          }
        } else {
          console.log('[post-race-feedback] skipped (finish or distance unavailable)');
        }
      } catch (fbErr: unknown) {
        console.warn(
          '[post-race-feedback] chain failed (non-fatal):',
          fbErr instanceof Error ? fbErr.message : fbErr,
        );
      }
    }

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

const MIN_SEGMENT_DISTANCE_MI = 0.25;
const MIN_SEGMENT_DURATION_S = 120;

/** Chronological order for plan-linked segments (matches granular segment logic). */
function sortIntervalsChrono(list: any[]): any[] {
  return [...list].sort((a: any, b: any) => {
    const aTime = a.start_time_s ?? a.start_offset_s;
    const bTime = b.start_time_s ?? b.start_offset_s;
    if (aTime != null && bTime != null) return aTime - bTime;
    const aS = a.sample_idx_start ?? null;
    const bS = b.sample_idx_start ?? null;
    if (aS != null && bS != null) return aS - bS;
    const aIdx = Number(a.planned_index ?? a.planned_step_index ?? a.step_index ?? 0);
    const bIdx = Number(b.planned_index ?? b.planned_step_index ?? b.step_index ?? 0);
    return aIdx - bIdx;
  });
}

/**
 * Non-recovery segments with a pace prescription (steady easy block, strides, tempo, etc.).
 * Must NOT mirror `role === 'work'` only — materialized easy blocks are often `steady`.
 */
function isWorkLikeForIntervalBreakdown(i: any): boolean {
  if (!i?.executed) return false;
  const role = String(i?.role || i?.kind || '').toLowerCase();
  if (role.includes('recovery') || role.includes('rest')) return false;
  if (role.includes('warmup') || role.includes('warm')) return false;
  if (role.includes('cooldown') || role.includes('cool')) return false;
  const hasPace = !!(i?.pace_range || i?.target_pace || i?.planned?.pace_range);
  // planned_steps_light strides are often `role: work` with no pace_range on the snapshot (pace only on
  // materialized plan). Excluding them collapses easy+strides to one work row + one recovery.
  const isRepWork = role === 'work' || role === 'interval';
  return hasPace || isRepWork;
}

/**
 * Merge consecutive micro-segments (e.g. 0.06 mi, 0.13 mi) into single segments so a steady
 * easy run shows one row instead of a dozen. Segments under minDistanceMi or minDurationS
 * that share the same role (work/recovery) are merged — use role so all small work segments
 * combine even when planned_step_id differs (e.g. 4×100m strides).
 */
function mergeMicroSegments(intervalList: any[], minDistanceMi: number = MIN_SEGMENT_DISTANCE_MI, minDurationS: number = MIN_SEGMENT_DURATION_S): any[] {
  if (!intervalList?.length) return intervalList;
  const minDistanceM = minDistanceMi * 1609.34;
  const isSmall = (i: any): boolean => {
    const dist = i?.executed?.distance_m ?? i?.distance_m ?? 0;
    const dur = i?.executed?.duration_s ?? i?.duration_s ?? 0;
    return (dist > 0 && dist < minDistanceM) || (dur > 0 && dur < minDurationS);
  };
  // Prefer planned_step_id so consecutive work reps (e.g. 4× strides) are NOT merged — workIntervals
  // omits recoveries between them in this array, so role-only key incorrectly merges into one row.
  const key = (i: any): string => {
    const pid = i?.planned_step_id ?? i?.plannedStepId ?? i?.id;
    if (pid != null && String(pid).trim().length > 0) return `step:${String(pid)}`;
    const idx = i?.planned_index ?? i?.step_index;
    if (Number.isFinite(Number(idx))) return `idx:${Number(idx)}`;
    return String(i?.role ?? i?.kind ?? i?.label ?? '');
  };

  const out: any[] = [];
  let run: any[] = [];
  const flushRun = () => {
    if (run.length === 0) return;
    if (run.length === 1) {
      out.push(run[0]);
      run = [];
      return;
    }
    const first = run[0];
    let totalDist = 0;
    let totalDur = 0;
    let paceWeighted = 0;
    let hrWeighted = 0;
    let paceWeight = 0;
    let hrWeight = 0;
    for (const i of run) {
      const exec = i?.executed ?? {};
      const d = exec.distance_m ?? i?.distance_m ?? 0;
      const t = exec.duration_s ?? i?.duration_s ?? 0;
      totalDist += d;
      totalDur += t;
      const p = exec.avg_pace_s_per_mi ?? exec.avg_pace_sec_per_mi ?? i?.avg_pace_s_per_mi;
      const h = exec.avg_hr ?? exec.avgHr ?? i?.avg_hr;
      if (p != null && p > 0 && t > 0) {
        paceWeighted += p * t;
        paceWeight += t;
      }
      if (h != null && h > 0 && t > 0) {
        hrWeighted += h * t;
        hrWeight += t;
      }
    }
    const merged = {
      ...first,
      executed: {
        ...(first?.executed ?? {}),
        distance_m: totalDist,
        duration_s: totalDur,
        avg_pace_s_per_mi: paceWeight > 0 ? Math.round(paceWeighted / paceWeight) : (first?.executed?.avg_pace_s_per_mi ?? null),
        avg_hr: hrWeight > 0 ? Math.round(hrWeighted / hrWeight) : (first?.executed?.avg_hr ?? null),
        max_hr: Math.max(...run.map((r) => r?.executed?.max_hr ?? r?.max_hr ?? 0).filter(Number)),
      },
      label: first?.label ?? first?.name ?? 'Merged',
    };
    out.push(merged);
    run = [];
  };

  for (const i of intervalList) {
    if (!isSmall(i)) {
      flushRun();
      out.push(i);
      continue;
    }
    const k = key(i);
    if (run.length > 0 && key(run[0]) !== k) {
      flushRun();
    }
    run.push(i);
  }
  flushRun();
  if (out.length < intervalList.length) {
    console.log(`[interval-breakdown] merged ${intervalList.length} micro-segments into ${out.length} (min ${minDistanceMi} mi / ${minDurationS}s)`);
  }
  return out;
}

/**
 * Generate detailed, chart-like analysis with specific metrics
 * Provides actionable insights similar to Garmin Connect analysis
 */
function generateDetailedChartAnalysis(sensorData: any[], intervals: any[], granularAnalysis: any, plannedPaceInfo: any, workout?: any, userUnits: 'metric' | 'imperial' = 'imperial', plannedWorkout?: any): any {
  console.log('📊 Generating detailed chart analysis...');
  
  // Extract work-like intervals (steady + work + strides), sorted in true workout order
  const workIntervals = sortIntervalsChrono(intervals.filter(isWorkLikeForIntervalBreakdown));
  const recoveryIntervals = sortIntervalsChrono(
    intervals.filter((i: any) => {
      const role = String(i?.role || i?.kind || '').toLowerCase();
      return !!i?.executed && (role.includes('recovery') || role.includes('rest'));
    }),
  );
  
  // Speed fluctuation analysis
  const speedAnalysis = analyzeSpeedFluctuations(sensorData, workIntervals);
  
  // Heart rate recovery analysis
  const hrRecoveryAnalysis = analyzeHeartRateRecovery(sensorData, workIntervals, recoveryIntervals);
  
  // Get pace adherence from performance (single source of truth - matches Summary view)
  // This is the interval-average pace adherence, not time-in-range score
  const paceAdherenceForBreakdown = performance?.pace_adherence != null
    ? Math.round(performance.pace_adherence)
    : undefined;
  
  // Interval-by-interval breakdown: merge micro-segments (<0.25 mi or <2 min) so steady runs show one row
  const intervalsForBreakdown = workIntervals.length > 0
    ? workIntervals
    : sortIntervalsChrono(intervals.filter((i: any) => i?.executed));
  const mergedForBreakdown = mergeMicroSegments(intervalsForBreakdown, MIN_SEGMENT_DISTANCE_MI, MIN_SEGMENT_DURATION_S);
  const intervalBreakdown = generateIntervalBreakdown(mergedForBreakdown, intervals, paceAdherenceForBreakdown, granularAnalysis, sensorData, userUnits, plannedWorkout, workout);
  
  // Pacing consistency analysis
  // Pacing consistency analysis (stub - function was removed during refactor)
  const pacingConsistency = { available: false, message: 'Pacing consistency analysis not available' };
  
  // Calculate workout-level average pace (from moving_time/distance) to pass to mile breakdown
  // This ensures consistency between AI narrative and pattern analysis
  const workoutMovingTimeSeconds = workout?.computed?.overall?.duration_s_moving 
    || (workout?.moving_time ? (workout.moving_time < 1000 ? workout.moving_time * 60 : workout.moving_time) : null)
    || (workout?.duration ? (workout.duration < 1000 ? workout.duration * 60 : workout.duration) : 0);
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
  granularAnalysis?: any,
  aerobicCeilingBpm?: number | null,
  classifiedTypeKey?: string | null,
  weatherTempF?: number | null,
  goalRaceCompletion?: GoalRaceCompletionMatch | null,
  workout?: { moving_time?: number | null; duration?: number | null; elapsed_time?: number | null },
  weatherProfile?: any | null,
): WorkoutAdherenceSummary | null {
  if (goalRaceCompletion?.matched) {
    return buildMarathonGoalRaceAdherenceSummary({
      match: goalRaceCompletion,
      granularAnalysis,
      detailedAnalysis,
      workout: workout || {},
      weatherTempF: weatherTempF ?? null,
      weatherProfile: weatherProfile ?? null,
    });
  }

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
  
  // Detect if this is an easy/recovery run vs an interval workout (affects messaging)
  const workoutToken = String(plannedWorkout?.workout_token || '').toLowerCase();
  const workoutName = String(plannedWorkout?.workout_name || plannedWorkout?.name || plannedWorkout?.title || '').toLowerCase();
  const workoutDesc = String(plannedWorkout?.workout_description || plannedWorkout?.description || plannedWorkout?.notes || '').toLowerCase();
  const combinedText = `${workoutToken} ${workoutName} ${workoutDesc}`;
  
  // First check: Is this clearly an interval workout?
  // - Multiple work intervals (2+)
  // - Contains interval-specific keywords in token/name (not just description)
  const hasMultipleWorkIntervals = workIntervals.length >= 2;
  const intervalKeywords = ['interval', 'repeat', 'tempo', 'threshold', 'fartlek', 'speed', 'track', 'vo2', 'i pace', 'r pace', 't pace'];
  const hasIntervalKeywordsInName = intervalKeywords.some(kw => workoutToken.includes(kw) || workoutName.includes(kw));
  // Check for patterns like "4x1000m", "4×800", "6 x 400" in any text
  const hasRepeatPattern = /\d+\s*[x×]\s*\d+/i.test(combinedText);
  const isIntervalWorkout = hasMultipleWorkIntervals || hasIntervalKeywordsInName || hasRepeatPattern;
  
  // Second check: Easy/recovery keywords (only applies if NOT an interval workout)
  // Note: "recovery" in "jog recovery between reps" means rest periods, not workout type
  const easyKeywords = ['easy', 'long', 'recovery', 'aerobic', 'base', 'endurance', 'e pace', 'easy pace', 'z2', 'zone 2', 'easy run'];
  const hasEasyKeywords = easyKeywords.some(kw => 
    workoutToken.includes(kw) || workoutName.includes(kw) || workoutDesc.includes(kw)
  );
  
  // Only classify as easy/recovery if it's NOT an interval workout AND has easy keywords
  const isEasyOrRecoveryRun = !isIntervalWorkout && hasEasyKeywords;

  // Single source of truth override: if the pipeline has already classified this workout,
  // use that classification for messaging (prevents strides/short reps from flipping to "intervals").
  const forced = String(classifiedTypeKey || '').toLowerCase().trim();
  const forcedIsInterval =
    forced === 'intervals' || forced === 'interval_run' || forced.includes('interval');
  const forcedIsEasyOrRecovery =
    forced === 'recovery' ||
    forced === 'easy' ||
    forced === 'easy_run' ||
    forced === 'long' ||
    forced === 'long_run' ||
    forced === 'steady_state' ||
    forced === 'tempo_finish' ||
    forced === 'progressive' ||
    forced === 'run';
  const finalIsIntervalWorkout = forced ? forcedIsInterval : isIntervalWorkout;
  const finalIsEasyOrRecoveryRun = forced ? (!forcedIsInterval && forcedIsEasyOrRecovery) : isEasyOrRecoveryRun;
  
  console.log(`🔍 [WORKOUT TYPE DETECT] classifiedTypeKey=${forced || 'none'}, isIntervalWorkout=${finalIsIntervalWorkout} (workIntervals=${workIntervals.length}, hasIntervalKeywords=${hasIntervalKeywordsInName}, hasRepeatPattern=${hasRepeatPattern}), hasEasyKeywords=${hasEasyKeywords}, final isEasyOrRecoveryRun=${finalIsEasyOrRecoveryRun}`);
  
  // Plan-aware context: use plan week intent if available, otherwise fall back to workout detection
  const isRecoveryContext = planContext?.isRecoveryWeek || planContext?.weekIntent === 'recovery' || finalIsEasyOrRecoveryRun;
  const isTaperContext = planContext?.isTaperWeek || planContext?.weekIntent === 'taper';
  const isBuildContext = planContext?.weekIntent === 'build' || planContext?.weekIntent === 'peak';
  const weekNumber = planContext?.weekIndex;
  const currentPhaseName = planContext?.phaseName ?? null;

  // HR gate for recovery integrity: faster-than-range is only a concern when HR confirms intensity drifted above aerobic (Z2 ceiling).
  const avgHR = Number(granularAnalysis?.heart_rate_analysis?.average_heart_rate);
  const hrIsAerobic = (aerobicCeilingBpm != null && Number.isFinite(avgHR) && avgHR > 0)
    ? avgHR <= (aerobicCeilingBpm as number)
    : null;

  const hrEvidence = (() => {
    try {
      if (hrIsAerobic !== true) return null;
      if (!(aerobicCeilingBpm != null && Number.isFinite(avgHR) && avgHR > 0)) return 'HR confirms aerobic effort';
      return `HR confirms aerobic effort (${Math.round(avgHR)} bpm avg ≤ ${Math.round(aerobicCeilingBpm)} bpm)`;
    } catch {
      return null;
    }
  })();
  
  console.log(`🔍 [EXPLANATION CONTEXT] isEasyOrRecoveryRun=${finalIsEasyOrRecoveryRun}, planContext=${planContext ? JSON.stringify({ weekIntent: planContext.weekIntent, isRecoveryWeek: planContext.isRecoveryWeek, weekIndex: planContext.weekIndex }) : 'none'}`);

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
  // For recovery/easy runs, use percentage-based tolerance to avoid false positives
  // Thresholds: ≤2% = on_target, 2-5% = slight (no warning), 5-10% = aggressive, >10% = blown
  const RECOVERY_TOLERANCE_PCT = 0.05; // 5% threshold for recovery/easy runs to trigger warning
  
  interface Deviation {
    interval: number;
    actual: string;
    target: string;
    delta: number;
    deltaPct: number; // percentage deviation from target midpoint
    direction: 'fast' | 'slow' | 'ok';
  }
  
  const deviations: Deviation[] = [];
  
  for (const interval of workIntervals) {
    const actualPaceSecPerMi = (interval.actual_pace_min_per_mi || 0) * 60;
    const targetLower = interval.planned_pace_range_lower || 0;
    const targetUpper = interval.planned_pace_range_upper || 0;
    
    if (actualPaceSecPerMi > 0 && targetLower > 0 && targetUpper > 0) {
      const targetMid = (targetLower + targetUpper) / 2;
      
      // Calculate percentage deviation from target midpoint
      // Note: faster pace = lower seconds, so negative deltaPct = faster
      const deltaPct = (targetMid - actualPaceSecPerMi) / targetMid;
      const absDeltaPct = Math.abs(deltaPct);
      
      let direction: 'fast' | 'slow' | 'ok' = 'ok';
      let delta = 0;
      
      // For recovery/easy runs: use percentage threshold to avoid false positives
      // For interval workouts: use absolute comparison (any deviation matters)
      if (finalIsEasyOrRecoveryRun || isRecoveryContext) {
        // Recovery/easy: only flag if deviation >= 5% of target
        if (deltaPct > RECOVERY_TOLERANCE_PCT) {
          // Positive deltaPct means actual is faster than target (lower seconds)
          direction = 'fast';
          delta = targetLower - actualPaceSecPerMi;
        } else if (deltaPct < -RECOVERY_TOLERANCE_PCT) {
          // Negative deltaPct means actual is slower than target
          direction = 'slow';
          delta = actualPaceSecPerMi - targetUpper;
        }
        // Otherwise: within 5% tolerance = 'ok' (no warning)
      } else {
        // Interval workouts: still use absolute comparison, but apply a small tolerance
        // for ultra-tight targets (e.g. 11:08-11:08) to avoid false "off target"
        // from rounding/GPS noise.
        const rangeWidth = Math.abs(targetUpper - targetLower);
        const epsSec = rangeWidth <= 3 ? 5 : 0; // only widen point targets
        const lo = targetLower - epsSec;
        const hi = targetUpper + epsSec;

        if (actualPaceSecPerMi < lo) {
          direction = 'fast';
          delta = targetLower - actualPaceSecPerMi;
        } else if (actualPaceSecPerMi > hi) {
          direction = 'slow';
          delta = actualPaceSecPerMi - targetUpper;
        }
      }
      
      console.log(`🎯 [PACE DEVIATION] Interval ${interval.interval_number || deviations.length + 1}: actual=${fmtPace(actualPaceSecPerMi)}, target=${fmtPace(targetLower)}-${fmtPace(targetUpper)}, deltaPct=${(deltaPct * 100).toFixed(1)}%, direction=${direction}, isRecovery=${finalIsEasyOrRecoveryRun || isRecoveryContext}`);
      
      deviations.push({
        interval: interval.interval_number || deviations.length + 1,
        actual: fmtPace(actualPaceSecPerMi),
        target: `${fmtPace(targetLower)}-${fmtPace(targetUpper)}`,
        delta,
        deltaPct,
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
      } else if (planContext?.hasActivePlan && finalIsEasyOrRecoveryRun) {
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
          if (hrIsAerobic === true) {
            parts.push(`Recovery week: Pace was ${fmtDelta(avgFastDelta)}/mi faster than the range, but ${hrEvidence || 'HR stayed aerobic'} — terrain and fitness explain the speed, and recovery intent was preserved`);
          } else {
            parts.push(`Recovery week: Ran ${fmtDelta(avgFastDelta)}/mi faster than target — too hard for recovery, limits adaptation and supercompensation`);
          }
        } else if (planContext?.hasActivePlan) {
          if (hrIsAerobic === true) {
            parts.push(`Easy run: Pace was ${fmtDelta(avgFastDelta)}/mi faster than the range, but ${hrEvidence || 'HR stayed aerobic'} — effort was controlled`);
          } else {
            parts.push(`Easy run was ${fmtDelta(avgFastDelta)}/mi faster than target — running too hard on recovery days limits adaptation`);
          }
        } else {
          if (hrIsAerobic === true) {
            parts.push(`Easy run: Pace was ${fmtDelta(avgFastDelta)}/mi faster than the range, but ${hrEvidence || 'HR stayed aerobic'} — effort was controlled`);
          } else {
            parts.push(`Easy run was ${fmtDelta(avgFastDelta)}/mi faster than target — running too hard on recovery days limits adaptation`);
          }
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
          if (hrIsAerobic === true) {
            parts.push(`Recovery week: Pace was ${fmtDelta(avgFastDelta)}/mi faster than prescribed, but ${hrEvidence || 'HR stayed aerobic'} — recovery intent preserved`);
          } else {
            parts.push(`Recovery week: Ran ${fmtDelta(avgFastDelta)}/mi faster than prescribed — too hard, compromises recovery and adaptation`);
          }
        } else {
          if (hrIsAerobic === true) {
            parts.push(`Easy run: Pace was ${fmtDelta(avgFastDelta)}/mi faster than prescribed, but ${hrEvidence || 'HR stayed aerobic'} — recovery intent preserved`);
          } else {
            parts.push(`Easy run was ${fmtDelta(avgFastDelta)}/mi faster than prescribed — too hard for recovery day`);
          }
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
  const ws = detailedAnalysis?.workout_summary;
  const hrDrift = ws?.hr_drift ?? granularAnalysis?.heart_rate_analysis?.hr_drift_bpm ?? null;
  const hrDriftAbs = hrDrift != null && Number.isFinite(hrDrift) ? Math.abs(hrDrift) : null;
  
  // -------------------------------------------------------------------------
  // HEAT-ADJUSTED TOLERANCE + HR TIE-BREAKER FOR STIMULUS DETERMINATION
  // -------------------------------------------------------------------------
  const tempF: number | null = weatherTempF ?? null;
  
  // Calculate effective slow floor with heat adjustment
  // Base: 15% slower = under-stimulated, but heat adds tolerance (+3% for 65-75°F, +7% for 75-85°F, +12% for >85°F)
  const effectiveSlowFloor = getEffectiveSlowFloor(tempF);
  const heatAllowanceApplied = getHeatAllowance(tempF);
  
  // Calculate actual slowdown percentage for slow intervals
  let maxSlowdownPct = 0;
  let avgSlowdownPct = 0;
  if (slowIntervals.length > 0) {
    for (const d of slowIntervals) {
      // Find the corresponding work interval to get target midpoint
      const wi = workIntervals.find((w: any) => w.interval_number === d.interval);
      if (wi) {
        const targetMid = ((wi.planned_pace_range_lower || 0) + (wi.planned_pace_range_upper || 0)) / 2;
        const actualPace = (wi.actual_pace_min_per_mi || 0) * 60;
        if (targetMid > 0 && actualPace > 0) {
          const slowdownPct = (actualPace - targetMid) / targetMid;
          if (slowdownPct > maxSlowdownPct) maxSlowdownPct = slowdownPct;
          avgSlowdownPct += slowdownPct;
        }
      }
    }
    if (slowIntervals.length > 0) avgSlowdownPct /= slowIntervals.length;
  }
  
  // Determine if HR suggests stimulus was achieved despite slow pace
  // HR drift being "normal" or "elevated" for the duration suggests cardiovascular work was done
  const durationMinutes = granularAnalysis?.duration_minutes ?? 0;
  // Normal drift bands by duration (from interpretation.ts):
  // <45 min: 0-8 bpm, 45-90: 4-12 bpm, 90-150: 6-16 bpm, 150+: 8-20 bpm
  let hrSuggestsStimulus = false;
  if (hrDrift != null && Number.isFinite(hrDrift)) {
    // If drift is >= 6 bpm for longer runs (>45 min), HR response indicates work was done
    if (durationMinutes > 90 && hrDrift >= 6) hrSuggestsStimulus = true;
    else if (durationMinutes > 45 && hrDrift >= 4) hrSuggestsStimulus = true;
    else if (hrDrift >= 3) hrSuggestsStimulus = true;
  }
  
  // Slow dominant only if: slow AND beyond heat-adjusted tolerance AND HR doesn't save it
  const trulySlow = avgSlowdownPct > effectiveSlowFloor && !hrSuggestsStimulus;
  const slowDominant = slowIntervals.length > 0 && fastIntervals.length === 0 && trulySlow;
  
  console.log(`🔥 [HEAT+HR CONTEXT] tempF=${tempF}, heatAllowance=${(heatAllowanceApplied*100).toFixed(0)}%, effectiveSlowFloor=${(effectiveSlowFloor*100).toFixed(0)}%`);
  console.log(`🔥 [HEAT+HR CONTEXT] avgSlowdownPct=${(avgSlowdownPct*100).toFixed(1)}%, hrDrift=${hrDrift}, hrSuggestsStimulus=${hrSuggestsStimulus}, trulySlow=${trulySlow}`);

  // Planned workout context: does the plan have a faster finish? (e.g. long easy + 1 mi at M pace)
  let hasPlannedFasterFinish = false;
  let finishSegmentOnTarget = false;
  let finishPaceDisplay = '';
  if (workIntervals.length >= 2) {
    const first = workIntervals[0];
    const last = workIntervals[workIntervals.length - 1];
    const firstMid = ((Number(first?.planned_pace_range_lower) || 0) + (Number(first?.planned_pace_range_upper) || 0)) / 2;
    const lastMid = ((Number(last?.planned_pace_range_lower) || 0) + (Number(last?.planned_pace_range_upper) || 0)) / 2;
    if (firstMid > 0 && lastMid > 0 && lastMid < firstMid * 0.95) {
      hasPlannedFasterFinish = true; // last segment target is at least 5% faster
      
      // Check if finish segment was on target
      const lastDev = deviations.find(d => d.interval === (last.interval_number || workIntervals.length));
      if (lastDev && lastDev.direction === 'ok') {
        finishSegmentOnTarget = true;
        finishPaceDisplay = lastDev.actual;
      } else if (lastDev && lastDev.direction === 'fast') {
        finishSegmentOnTarget = true; // fast is also "hit"
        finishPaceDisplay = lastDev.actual;
      }
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
  if (fastDominant && isRecoveryContext && hrDriftAbs != null && hrDriftAbs <= 5 && hrIsAerobic !== true) {
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
        if (hrIsAerobic === true) {
          outlook = `Pace came in faster than the prescribed range, but ${hrEvidence || 'HR stayed aerobic'} — terrain and fitness explain the speed, and the recovery intent was preserved.`;
        } else {
          outlook = currentPhaseName
            ? `This extra effort in the ${currentPhaseName} phase may dampen the supercompensation intended for this rest block.${weekFocus ? ` Consider a more conservative approach to ${weekFocus.toLowerCase()}.` : ''}`
            : "By exceeding the pace today, you turned a recovery session into a moderate-intensity run. This may dampen the supercompensation effect intended for this rest block.";
        }
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
        // Only show "missed stimulus" if heat+HR logic confirms it was truly missed
        outlook = currentPhaseName
          ? `Missed target stimulus in ${currentPhaseName} may reduce the intended training load for this block.${weekFocus ? ` Adjust ${weekFocus.toLowerCase()} as needed.` : ''}`
          : "Missed target stimulus today may reduce the intended training load for this phase.";
      } else if (slowIntervals.length > 0 && !trulySlow) {
        // Slow but within tolerance (heat) or HR suggests stimulus achieved
        // Keep BUILD EXECUTION concise — details are in SUMMARY
        if (heatAllowanceApplied > 0 && hrSuggestsStimulus) {
          outlook = "Stimulus achieved under warm conditions.";
        } else if (hrSuggestsStimulus) {
          outlook = "Stimulus achieved — HR confirms the work was done.";
        } else if (heatAllowanceApplied > 0) {
          outlook = "Pace adjusted for conditions — within heat tolerance.";
        }
        // Note: finish segment info is already in SUMMARY, don't repeat here
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

  // HR analysis → Use the rich context-aware interpretation from granular analysis
  // This includes terrain profile, workout plan context, and window-by-window analysis
  // For intervals, drift may be N/A but we still have interval-specific narrative
  const richHRInterpretation = granularAnalysis?.heart_rate_analysis?.hr_drift_interpretation;
  const hrSummaryLabel = granularAnalysis?.heart_rate_analysis?.summary_label;
  const workoutTypeFromAnalysis = granularAnalysis?.heart_rate_analysis?.workout_type;
  
  // CASE 1: Steady-state workouts with drift data
  if (hrDrift != null && Number.isFinite(hrDrift) && hrDriftAbs !== null) {
    // Use summary_label from HR analysis module (single source of truth)
    // Falls back to derived label only if summary_label not available
    let driftLabel = hrSummaryLabel;
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
  // CASE 2: Interval workouts - no drift, but have interval-specific narrative
  else if (workoutTypeFromAnalysis === 'intervals' && richHRInterpretation && richHRInterpretation.length > 20) {
    const intervalLabel = hrSummaryLabel || 'Interval Summary';
    technical_insights.push({ label: intervalLabel, value: richHRInterpretation });
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
  // The complete story is already told in the technical_insights (Summary / Cardiac Drift)
  const summaryLabels = ['Summary', 'Cardiac Drift', 'Aerobic Efficiency', 'Aerobic Stress', 'Aerobic Response', 'Elevated Drift', 'High Cardiac Stress', 'Interval Summary', 'Zone Summary'];
  const hasRichNarrative = technical_insights.some(t => 
    summaryLabels.includes(t.label) && t.value.length > 100
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
 * Extract planned WORK steps (exclude warmup/recovery/cooldown).
 * This is the canonical workout structure for plan-linked sessions.
 */
function getPlannedWorkSteps(plannedWorkout: any): any[] {
  const steps: any[] = Array.isArray(plannedWorkout?.computed?.steps) ? plannedWorkout.computed.steps : [];
  return steps.filter((step: any) => {
    const kind = String(step?.kind ?? step?.role ?? step?.step_type ?? step?.type ?? '').toLowerCase();
    const label = String(step?.name ?? step?.label ?? step?.description ?? '').toLowerCase();
    const pr = step?.pace_range;
    const hasPaceRange =
      !!pr &&
      Number.isFinite(Number(pr.lower)) &&
      Number.isFinite(Number(pr.upper)) &&
      Number(pr.lower) > 0 &&
      Number(pr.upper) > 0;
    const recoveryLike = /warm|cool|recover|rest/.test(kind) || /warm.?up|cool.?down|recovery|rest/.test(label);
    // Accept any pace-targeted non-recovery step to keep plan linkage robust across generator variants
    // (e.g. kind: easy/tempo/threshold/work/repeat).
    return hasPaceRange && !recoveryLike;
  });
}

function fmtDurationLabel(totalSeconds: number | null): string {
  if (!Number.isFinite(totalSeconds as number) || (totalSeconds as number) <= 0) return '';
  const s = Math.round(totalSeconds as number);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function fmtPaceRangeLabel(lower?: number, upper?: number): string {
  if (!Number.isFinite(lower as number) || !Number.isFinite(upper as number) || (lower as number) <= 0 || (upper as number) <= 0) return '';
  const l = Math.round(lower as number);
  const u = Math.round(upper as number);
  const lm = Math.floor(l / 60);
  const ls = l % 60;
  const um = Math.floor(u / 60);
  const us = u % 60;
  return `${lm}:${String(ls).padStart(2, '0')}-${um}:${String(us).padStart(2, '0')}/mi`;
}

function isStrideLikePlannedStep(step: any): boolean {
  const lbl = String(step?.label ?? step?.name ?? '').toLowerCase();
  const k = String(step?.kind ?? step?.type ?? step?.role ?? '').toLowerCase();
  return (
    lbl.includes('stride') ||
    lbl.includes('pickup') ||
    lbl.includes('drill') ||
    k.includes('stride')
  );
}

function formatStridePlannedLabel(step: any, plannedDurationSec: number): string {
  const dm = Number(step?.distanceMeters ?? step?.distance_m ?? step?.m ?? step?.meters ?? 0);
  const yd = Number(step?.distance_yd ?? step?.distance_yds ?? step?.yards ?? 0);
  const ov = Number(step?.original_val ?? 0);
  const ou = String(step?.original_units || '').toLowerCase();
  let yardsOut = yd > 0 ? Math.round(yd) : 0;
  if (!yardsOut && dm > 25 && dm < 800) yardsOut = Math.round(dm / 0.9144);
  if (!yardsOut && ov > 0 && (ou === 'yd' || ou === 'yard' || ou === 'yards')) yardsOut = Math.round(ov);
  if (yardsOut > 0) return `${yardsOut} yd Stride`;
  const sec =
    Number.isFinite(plannedDurationSec) && plannedDurationSec > 0
      ? plannedDurationSec
      : Number(step?.seconds ?? step?.duration_s ?? 0);
  if (sec > 0) {
    const s = Math.round(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')} Stride`;
  }
  return 'Stride';
}

function buildSessionIntervalRows(
  plannedWorkout: any,
  detailedAnalysis: any,
  computedIntervals: any[],
  workout: any
): {
  rows: any[];
  mode: 'interval_compare_ready' | 'overall_only' | 'awaiting_recompute';
  reason: string | null;
  expected_work_rows: number;
  measured_work_rows: number;
} {
  const plannedSteps: any[] = Array.isArray(plannedWorkout?.computed?.steps) ? plannedWorkout.computed.steps : [];
  const expectedWorkRows = getPlannedWorkSteps(plannedWorkout).length;
  const isStructuredIntervalSession = expectedWorkRows >= 2;
  if (!plannedSteps.length) {
    return {
      rows: [],
      mode: 'awaiting_recompute',
      reason: 'no_planned_steps',
      expected_work_rows: expectedWorkRows,
      measured_work_rows: 0,
    };
  }

  const breakdown = detailedAnalysis?.interval_breakdown;
  const breakdownIntervals: any[] = Array.isArray(breakdown?.intervals) ? breakdown.intervals : [];
  const byId = new Map<string, any>();
  for (const iv of breakdownIntervals) {
    const id = String(iv?.interval_id || '').trim();
    if (id) byId.set(id, iv);
  }

  const byKindCounters: Record<string, number> = { warmup: 0, cooldown: 0, recovery: 0, work: 0 };
  const byKindBuckets: Record<string, any[]> = {
    warmup: breakdownIntervals.filter((iv: any) => String(iv?.interval_type || '').toLowerCase() === 'warmup'),
    cooldown: breakdownIntervals.filter((iv: any) => String(iv?.interval_type || '').toLowerCase() === 'cooldown'),
    recovery: breakdownIntervals.filter((iv: any) => String(iv?.interval_type || '').toLowerCase() === 'recovery'),
    work: breakdownIntervals.filter((iv: any) => String(iv?.interval_type || '').toLowerCase() === 'work'),
  };

  const rows = plannedSteps.map((step: any, idx: number) => {
    const stepId = String(step?.id || '').trim();
    const stepKindRaw = String(step?.kind ?? step?.role ?? step?.step_type ?? step?.type ?? '').toLowerCase();
    const stepKind = /warm/.test(stepKindRaw)
      ? 'warmup'
      : /cool/.test(stepKindRaw)
        ? 'cooldown'
        : /recover|rest/.test(stepKindRaw)
          ? 'recovery'
          : 'work';

    let match = stepId ? byId.get(stepId) : null;
    if (!match) {
      const bucket = byKindBuckets[stepKind] || [];
      const cursor = byKindCounters[stepKind] || 0;
      match = bucket[cursor] || null;
      byKindCounters[stepKind] = cursor + 1;
    }
    if (!match) {
      match = computedIntervals.find((it: any) =>
        String(it?.planned_step_id || '') === stepId ||
        Number(it?.planned_index) === idx ||
        Number(it?.step_index) === idx ||
        (Number.isFinite(Number(it?.interval_number)) && (Number(it.interval_number) - 1) === idx)
      ) || null;
    }

    const paceRange = step?.pace_range || match?.pace_range || null;
    const plannedDuration = Number(step?.duration_s ?? step?.seconds ?? step?.duration ?? match?.planned_duration_s ?? 0);
    const plannedLabel = (() => {
      if (stepKind === 'work' && isStrideLikePlannedStep(step)) {
        const du = Number.isFinite(plannedDuration) && plannedDuration > 0 ? plannedDuration : 0;
        return formatStridePlannedLabel(step, du);
      }
      const t = fmtDurationLabel(Number.isFinite(plannedDuration) && plannedDuration > 0 ? plannedDuration : null);
      const p = fmtPaceRangeLabel(paceRange?.lower, paceRange?.upper);
      if (t && p) return `${t} @ ${p}`;
      return t || p || (stepKind === 'work' ? `Work ${idx + 1}` : stepKind.charAt(0).toUpperCase() + stepKind.slice(1));
    })();

    const sIdx = Number(match?.sample_idx_start);
    const eIdx = Number(match?.sample_idx_end);
    const hasMeasuredWindow = Number.isFinite(sIdx) && Number.isFinite(eIdx) && eIdx > sIdx;
    const hasActualTopLevel =
      Number(match?.actual_duration_s ?? 0) > 0 ||
      Number(match?.actual_distance_m ?? 0) > 0 ||
      Number(match?.actual_pace_min_per_mi ?? 0) > 0 ||
      Number(match?.avg_heart_rate_bpm ?? 0) > 0;
    const hasExecutedEnvelope = !!match?.executed && (
      Number(match?.executed?.duration_s ?? 0) > 0 ||
      Number(match?.executed?.distance_m ?? 0) > 0 ||
      Number(match?.executed?.avg_pace_s_per_mi ?? 0) > 0 ||
      Number(match?.executed?.avg_hr ?? 0) > 0
    );
    const hasExecutionEvidence = hasMeasuredWindow || hasActualTopLevel || hasExecutedEnvelope;

    const executedDuration = hasExecutionEvidence
      ? Number(
          match?.actual_duration_s ??
          match?.executed?.duration_s ??
          0
        )
      : 0;
    const executedDistance = hasExecutionEvidence
      ? Number(
          match?.actual_distance_m ??
          match?.executed?.distance_m ??
          0
        )
      : 0;
    const executedHr = hasExecutionEvidence
      ? Number(
          match?.avg_heart_rate_bpm ??
          match?.executed?.avg_hr ??
          match?.executed?.avgHr ??
          0
        )
      : 0;
    const directPaceS = hasExecutionEvidence
      ? Number(
          match?.pace_s_per_mi ??
          match?.executed?.avg_pace_s_per_mi ??
          (Number.isFinite(Number(match?.actual_pace_min_per_mi)) ? Number(match.actual_pace_min_per_mi) * 60 : 0)
        )
      : 0;
    const derivedPaceS =
      executedDuration > 0 && executedDistance > 0
        ? (executedDuration / (executedDistance / 1609.34))
        : 0;
    const executedPaceS = Number.isFinite(directPaceS) && directPaceS > 0
      ? directPaceS
      : (Number.isFinite(derivedPaceS) && derivedPaceS > 0 ? derivedPaceS : 0);

    return {
      row_id: stepId || `planned_${idx}`,
      planned_step_id: stepId || null,
      planned_index: idx,
      kind: stepKind,
      planned_label: plannedLabel,
      planned_pace_display: fmtPaceRangeLabel(paceRange?.lower, paceRange?.upper) || null,
      adherence_pct: Number.isFinite(Number(match?.pace_adherence_percent)) ? Math.round(Number(match.pace_adherence_percent)) : null,
      executed: {
        pace_s_per_mi: Number.isFinite(executedPaceS) && executedPaceS > 0 ? Math.round(executedPaceS) : null,
        avg_pace_s_per_mi: Number.isFinite(executedPaceS) && executedPaceS > 0 ? Math.round(executedPaceS) : null,
        distance_m: Number.isFinite(executedDistance) && executedDistance > 0 ? Math.round(executedDistance) : null,
        duration_s: Number.isFinite(executedDuration) && executedDuration > 0 ? Math.round(executedDuration) : null,
        avg_hr: Number.isFinite(executedHr) && executedHr > 0 ? Math.round(executedHr) : null,
      },
    };
  });

  // If no per-interval measured execution exists, return explicit recompute state
  // for structured interval sessions. Do not emit synthetic summary rows.
  const measuredRows = rows.filter((r: any) => {
    const ex = r?.executed || {};
    return Number(ex?.duration_s || 0) > 0 || Number(ex?.distance_m || 0) > 0 || Number(ex?.pace_s_per_mi || 0) > 0;
  });
  if (measuredRows.length === 0) {
    if (isStructuredIntervalSession) {
      return {
        rows: [],
        mode: 'awaiting_recompute',
        reason: 'missing_interval_execution',
        expected_work_rows: expectedWorkRows,
        measured_work_rows: 0,
      };
    }
    const overall = workout?.computed?.overall || {};
    const distM = Number(overall?.distance_m ?? ((Number(workout?.distance) > 0) ? Number(workout.distance) * 1000 : 0));
    const durS = Number(
      overall?.duration_s_moving ??
      ((Number(workout?.moving_time) > 0) ? Number(workout.moving_time) * 60 : 0)
    );
    const directPaceS = Number(overall?.avg_pace_s_per_mi ?? 0);
    const derivedPaceS = (durS > 0 && distM > 0) ? (durS / (distM / 1609.34)) : 0;
    const paceS = Number.isFinite(directPaceS) && directPaceS > 0 ? directPaceS : (Number.isFinite(derivedPaceS) && derivedPaceS > 0 ? derivedPaceS : 0);
    const hr = Number(overall?.avg_hr ?? workout?.avg_heart_rate ?? workout?.metrics?.avg_heart_rate ?? 0);

    if (durS > 0 || distM > 0 || paceS > 0) {
      return {
        rows: [{
          row_id: 'overall',
          planned_step_id: null,
          planned_index: 0,
          kind: 'overall',
          planned_label: 'Overall session',
          planned_pace_display: null,
          adherence_pct: null,
          executed: {
            pace_s_per_mi: Number.isFinite(paceS) && paceS > 0 ? Math.round(paceS) : null,
            avg_pace_s_per_mi: Number.isFinite(paceS) && paceS > 0 ? Math.round(paceS) : null,
            distance_m: Number.isFinite(distM) && distM > 0 ? Math.round(distM) : null,
            duration_s: Number.isFinite(durS) && durS > 0 ? Math.round(durS) : null,
            avg_hr: Number.isFinite(hr) && hr > 0 ? Math.round(hr) : null,
          },
        }],
        mode: 'overall_only',
        reason: 'no_measured_interval_execution',
        expected_work_rows: expectedWorkRows,
        measured_work_rows: 0,
      };
    }
    return {
      rows: [],
      mode: 'awaiting_recompute',
      reason: 'no_measured_execution_and_no_overall',
      expected_work_rows: expectedWorkRows,
      measured_work_rows: 0,
    };
  }
  const measuredWorkRows = rows.filter((r: any) => {
    if (String(r?.kind || '').toLowerCase() !== 'work') return false;
    const ex = r?.executed || {};
    return Number(ex?.duration_s || 0) > 0 || Number(ex?.distance_m || 0) > 0 || Number(ex?.pace_s_per_mi || 0) > 0;
  }).length;
  const compareReady = expectedWorkRows > 0 && measuredWorkRows >= expectedWorkRows;
  if (compareReady) {
    return {
      rows,
      mode: 'interval_compare_ready',
      reason: null,
      expected_work_rows: expectedWorkRows,
      measured_work_rows: measuredWorkRows,
    };
  }
  // Partial linkage on structured interval sessions is explicit recompute-only.
  if (isStructuredIntervalSession) {
    return {
      rows: [],
      mode: 'awaiting_recompute',
      reason: 'partial_interval_execution_linkage',
      expected_work_rows: expectedWorkRows,
      measured_work_rows: measuredWorkRows,
    };
  }
  // Non-interval partial linkage can collapse to measured overall row.
  const overall = workout?.computed?.overall || {};
  const distM = Number(overall?.distance_m ?? ((Number(workout?.distance) > 0) ? Number(workout.distance) * 1000 : 0));
  const durS = Number(
    overall?.duration_s_moving ??
    ((Number(workout?.moving_time) > 0) ? Number(workout.moving_time) * 60 : 0)
  );
  const directPaceS = Number(overall?.avg_pace_s_per_mi ?? 0);
  const derivedPaceS = (durS > 0 && distM > 0) ? (durS / (distM / 1609.34)) : 0;
  const paceS = Number.isFinite(directPaceS) && directPaceS > 0 ? directPaceS : (Number.isFinite(derivedPaceS) && derivedPaceS > 0 ? derivedPaceS : 0);
  const hr = Number(overall?.avg_hr ?? workout?.avg_heart_rate ?? workout?.metrics?.avg_heart_rate ?? 0);
  if (durS > 0 || distM > 0 || paceS > 0) {
    return {
      rows: [{
        row_id: 'overall',
        planned_step_id: null,
        planned_index: 0,
        kind: 'overall',
        planned_label: 'Overall session',
        planned_pace_display: null,
        adherence_pct: null,
        executed: {
          pace_s_per_mi: Number.isFinite(paceS) && paceS > 0 ? Math.round(paceS) : null,
          avg_pace_s_per_mi: Number.isFinite(paceS) && paceS > 0 ? Math.round(paceS) : null,
          distance_m: Number.isFinite(distM) && distM > 0 ? Math.round(distM) : null,
          duration_s: Number.isFinite(durS) && durS > 0 ? Math.round(durS) : null,
          avg_hr: Number.isFinite(hr) && hr > 0 ? Math.round(hr) : null,
        },
      }],
      mode: 'overall_only',
      reason: 'partial_interval_execution_linkage',
      expected_work_rows: expectedWorkRows,
      measured_work_rows: measuredWorkRows,
    };
  }
  return {
    rows: [],
    mode: 'awaiting_recompute',
    reason: 'partial_interval_execution_linkage',
    expected_work_rows: expectedWorkRows,
    measured_work_rows: measuredWorkRows,
  };
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

  // Interval signals must win over "jog recovery" wording inside interval descriptions.
  if (combined.includes('interval') || combined.includes('repeat') || combined.includes('speed')) return 'intervals';
  if (combined.includes('tempo') || combined.includes('threshold')) return 'tempo';

  // Recovery should match actual recovery session intent, not interval recovery segments.
  if (/\brecovery run\b|\brecovery session\b|\brest day\b/.test(combined)) return 'recovery';
  // Strides are commonly appended to easy/recovery runs; do not treat them as interval intent by default.
  if (combined.includes('stride')) {
    const hard = combined.includes('tempo') || combined.includes('threshold') || combined.includes('interval');
    if (!hard) return 'easy';
  }
  if (combined.includes('easy') || combined.includes('aerobic') || combined.includes('base')) return 'easy';
  if (combined.includes('long')) return 'long';
  
  return undefined;
}

/**
 * Resolve the canonical workout type key for the analysis pipeline.
 *
 * Contract:
 * 1) Plan intent wins when present
 * 2) Deterministic fallback (never let HR analyzer flip easy/recovery to intervals because of strides)
 */
function resolveClassifiedTypeKey(plannedWorkout: any, planContext: any, goalRace?: GoalRaceCompletionMatch | null): string | null {
  if (goalRace?.matched) {
    return 'long_run';
  }
  if (!plannedWorkout) {
    // No plan-linked workout: only force a type when plan context clearly indicates recovery intent.
    if (planContext?.isRecoveryWeek || planContext?.weekIntent === 'recovery') return 'recovery';
    return null;
  }

  // Contract for linked workouts:
  // 1) Planned step structure is primary source
  // 2) workout_type metadata is secondary
  // 3) description/token keyword guessing is last resort
  const workStepCount = getPlannedWorkSteps(plannedWorkout).length;
  if (workStepCount >= 2) return 'intervals';
  if (workStepCount === 1) {
    if (planContext?.isRecoveryWeek || planContext?.weekIntent === 'recovery') return 'recovery';
    return 'easy';
  }

  // Secondary: planned_workouts.workout_type
  const plannedTypeRaw = String(plannedWorkout?.workout_type ?? plannedWorkout?.type ?? '').toLowerCase().trim();
  const normalizePlannedType = (t: string): string | null => {
    const k = String(t || '').toLowerCase().trim();
    if (!k) return null;
    if (k === 'long') return 'long_run';
    if (k === 'easy_run') return 'easy';
    if (k === 'interval_run') return 'intervals';
    return k;
  };
  const plannedType = normalizePlannedType(plannedTypeRaw);

  if (plannedType) {
    // Generic "run" type must be disambiguated from planned structure.
    if (plannedType === 'run') {
      if (workStepCount >= 2) return 'intervals';
      if (planContext?.isRecoveryWeek || planContext?.weekIntent === 'recovery') return 'recovery';
      return 'easy';
    }
    if (plannedType === 'recovery') return 'recovery';
    if (plannedType === 'easy') {
      // Upgrade easy -> recovery when the plan week intent is explicitly recovery.
      if (planContext?.isRecoveryWeek || planContext?.weekIntent === 'recovery') return 'recovery';
      return 'easy';
    }
    if (plannedType === 'long_run' || plannedType === 'long') return 'long_run';
    if (plannedType === 'tempo') return 'tempo';
    if (plannedType === 'intervals') return 'intervals';
    return plannedType;
  }

  // Last resort: keyword-based intent detection (linked but missing structure+type).
  const intent = detectWorkoutIntent(plannedWorkout);
  if (intent === 'recovery') return 'recovery';
  if (intent === 'easy') {
    // Upgrade easy -> recovery when the plan week intent is explicitly recovery.
    if (planContext?.isRecoveryWeek || planContext?.weekIntent === 'recovery') return 'recovery';
    return 'easy';
  }
  if (intent === 'long') return 'long_run';
  if (intent === 'tempo') return 'tempo';
  if (intent === 'intervals') return 'intervals';

  // Default for plan-linked workouts: treat as steady-state so we don't over-trigger interval logic.
  return 'easy';
}

function mapClassifiedTypeToHrWorkoutType(classifiedTypeKey: string): WorkoutType {
  const k = String(classifiedTypeKey || '').toLowerCase().trim();
  if (k === 'intervals' || k === 'interval_run' || k.includes('interval')) return 'intervals';
  if (k.includes('hill')) return 'hill_repeats';
  return 'steady_state';
}
