import { rowsComeFromTheWatch } from './lib/interval-display.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withAlarm } from '../_shared/alarm.ts';
import { hrDriftHalvesPct, warmupSkipSeconds } from '../_shared/hr-drift-halves.ts';
import { extractSensorData } from '../../lib/analysis/sensor-data/extractor.ts';
import { generateIntervalBreakdown } from './lib/intervals/interval-breakdown.ts';
import { getWorkIntervals } from './lib/intervals/build-intervals.ts';
import { calculatePaceRangeAdherence, getIntervalType, IntervalType } from './lib/adherence/pace-adherence.ts';
import { singleTargetBand } from '../_shared/plan-tokens/quality-work.ts';
import { executionFromEasyHr, executionFromSections } from '../_shared/execution-score.ts';
import { completedMovingSeconds } from '../_shared/moving-seconds.ts';
import { calculatePrescribedRangeAdherenceGranular, type PrescribedRangeAdherence, type IntervalAnalysis, type SampleTiming } from './lib/adherence/granular-pace.ts';
import { calculateIntervalHeartRate } from './lib/analysis/heart-rate.ts';
import { computeVarianceGate } from './lib/variance-gate.ts';
import { calculateIntervalElevation } from './lib/analysis/elevation.ts';
// Old HR drift import removed - now using consolidated HR analysis module
import { analyzeHeartRate, type HRAnalysisResult, type HRAnalysisContext, type WorkoutType, getEffectiveSlowFloor, getHeatAllowance } from './lib/heart-rate/index.ts';
import { generateMileByMileTerrainBreakdown } from './lib/analysis/mile-by-mile-terrain.ts';
import { fetchPlanContextForWorkout, type PlanContext } from '../_shared/plan-context.ts';
import { fetchGoalRaceCompletionForWorkout, type GoalRaceCompletionMatch } from '../_shared/goal-race-completion.ts';
import { buildMarathonGoalRaceAdherenceSummary } from './lib/analysis/marathon-race-narrative.ts';
import { buildWorkoutFactPacketV1 } from '../_shared/fact-packet/build.ts';
import { computePositiveSplitSec, guardNarrativeHonesty, fadeLeadBullets, structuredBySignalSuppressesFade, paceVariedPct } from '../_shared/fact-packet/execution-honesty.ts';
import { composeRunInsight, buildRunInsightInputFromPacket } from '../_shared/insights/run-insights.ts';
import { detectCrossDomainCarryover, buildCarryoverClause, classifyStrengthFocus, resolveCarriedInSoreness, CARRYOVER_WINDOW_DAYS, type SorenessEntry } from '../_shared/cross-domain-carryover.ts';
// D-036: GAP enrichment lifted to top-level so both pace-adherence and the
// HR analyzer consume the same grade-adjusted sample series.
import { enrichSamplesWithGAP } from '../_shared/gap.ts';
import { isPlanTransitionWindowByWeekIndex } from '../_shared/plan-week.ts';
import {
  collapseCourseSegmentsToZones,
  parseWorkoutWeatherDataBlob,
  resolveRaceDebriefWeather,
  type CourseStrategyZoneLine,
  type RawCourseSegmentRow,
} from '../_shared/race-debrief.ts';
import { runPostRaceFeedbackChain } from '../_shared/race-feedback.ts';
import { parseLocalDate } from '../_shared/parse-local-date.ts';
import { getArcContext } from '../_shared/arc-context.ts';
import type { ArcNarrativeContextV1 } from '../_shared/arc-narrative-state.ts';
import { resolveCurrentRunEasyPace } from '../../../src/lib/resolve-current-run-pace.ts';
import { resolveRunEasyHrBand, isEasyPrescribedRun, easyCeilingBpm, frielRunZones } from '../_shared/easy-hr.ts';
import { movingSecondsUnderCeiling, timeUnderCeiling } from '../_shared/time-under-ceiling.ts';
import { paceRangeBand, STOPPED_SLOWER_THAN_S_PER_MI } from '../_shared/run-pace.ts';
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts';

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

// The alarm wrapper (docs/WORKORDER-plumbing-2026-09-07.md §2): a throw or a 5xx here is reported
// (one email per kind per 15 minutes, every one in public.alarms) and then returned unchanged.
Deno.serve(withAlarm('analyze-running-workout', async (req) => {
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
  
  // D-078: when caller (recompute-workout) sets this flag, the preservation
  // fallback that re-uses the prior ai_summary when the LLM returns null is
  // SKIPPED — explicit user-triggered recompute should never leave stale text.
  // Cycling-side parity: same flag, same semantics.
  let forceRegenerateAiSummary = false;

  try {
    const body = await req.json();
    workout_id = body.workout_id;
    const force_weather_refresh = body.force_weather_refresh === true;
    forceRegenerateAiSummary = body.force_regenerate_ai_summary === true;

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
    
    // ⛔ NO WEATHER WRITE HERE (2026-09-16, Stage 7 session 1): get-weather is the one writer of `workouts.weather_data`.
    // A forced refresh is passed to it as `force_refresh` (it skips both caches and overwrites the row); the stored
    // weather is no longer cleared first, so a failed fetch leaves the previous weather in place.
    const forceWeatherFetch = force_weather_refresh;
    
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
        metrics,
        avg_speed,
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
    let configuredHrZones: any = null;
    let userUnits = 'imperial'; // default
    try {
      const { data: userBaselines } = await supabase
        .from('user_baselines')
        .select('performance_numbers, units, effort_paces, learned_fitness, configured_hr_zones')
        .eq('user_id', workout.user_id)
        .single();
      
      if (userBaselines?.units === 'metric' || userBaselines?.units === 'imperial') {
        userUnits = userBaselines.units;
      }
      baselines = userBaselines?.performance_numbers || {};
      effortPaces = (userBaselines as any)?.effort_paces || null;
      learnedFitness = (userBaselines as any)?.learned_fitness || null;
      configuredHrZones = (userBaselines as any)?.configured_hr_zones || null;
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

    // ⛔ `learnedEasySecPerMi` STOOD HERE AND WAS NEVER READ (deleted 2026-08-19). It was the raw
    // learned-column read this file used before D-287 routed the grading pace through the resolver;
    // the replacement landed, the old computation did not go with it. Zero references — verified by
    // grep before deleting. A dead raw read is still a raw read: it survives greps, it gets copied,
    // and it makes a file look like it has two opinions about one fact.

    // D-287 — the EASY pace this card GRADES the athlete against now comes from the ONE resolver.
    // It used to run its own chain: effort_paces -> manual -> learned. That is the OPPOSITE precedence to
    // the snapshot pin (learned only) and to resolveCurrentRunEasyPace (choice -> learned -> manual ->
    // effort_paces). So the screen that JUDGED the run and the plan that PRESCRIBED it could disagree about
    // what "easy" even was — and the athlete's own Q-174 choice was ignored here entirely.
    // Only `base` is routed: steady/power/speed/race have no resolver yet and keep their effort_paces read.
    const resolvedEasy = resolveCurrentRunEasyPace({
      learned_fitness: learnedFitness,
      performance_numbers: baselines,
      effort_paces: effortPaces,
    } as any);
    const baselinePacesSecPerMi = {
      base: resolvedEasy.sec_per_mi,
      // D-478: the easy pace RANGE off threshold (× 1.14 to × 1.29); the easy-portion line judges against it.
      baseLo: resolvedEasy.range_lo_sec_per_mi ?? null,
      baseHi: resolvedEasy.range_hi_sec_per_mi ?? null,
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
      // OURS — `minDuration` 30 min floor, 90-day window and last 5 runs for the drift history; no page, kept as found
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
              const daysSince = Math.round((Date.now() - parseLocalDate(String(w.date).slice(0, 10)).getTime()) / (1000 * 60 * 60 * 24));
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
          // OURS — 3 to 21 days back for the last similar run; no page, kept as found
          const lastWeekSimilar = workoutsWithDrift.find(w => w.daysSince >= 3 && w.daysSince <= 21);
          console.log(`📊 [HISTORICAL] Looking for similar workout 3-21 days ago. Candidates: ${workoutsWithDrift.map(w => `${w.daysSince}d ago: ${w.driftBpm}bpm`).join(', ')}`);
          
          // Determine trend (compare recent 3 vs older)
          let trend: 'improving' | 'stable' | 'worsening' | undefined = undefined;
          // OURS — 4 runs before a drift trend, 2 bpm between halves for improving / worsening; no page, kept as found
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
      // D-285 / LAW 2 — DO NOT FABRICATE BASELINES HERE.
      //
      // This catch guards the HISTORICAL-DRIFT fetch. It used to respond to that failure by REPLACING the
      // athlete's real `performance_numbers` (loaded at :294) with a hardcoded fictional athlete —
      // fiveK 7:30/mi, easy 9:00/mi, tenK 8:00/mi, marathon 10:00/mi — and the analyzer then GRADED the
      // athlete's workout against those numbers ("N/mi faster than your baseline base pace"). So a transient
      // query error on an UNRELATED lookup silently swapped in a stranger's paces and judged the run by them.
      // A fabricated anchor reaching a user-facing verdict is the exact failure Law 2 forbids, and it is how
      // the "short finish relative to the planned ~90 min" bug was manufactured.
      //
      // The drift data is optional context. Losing it must cost us the CONTEXT, never the TRUTH. The real
      // baselines stay; downstream already handles absent paces with `?? null` (:339) and discloses.
      console.log('⚠️ Could not fetch historical drift data (baselines left intact):', error);
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

    // D-035: Do NOT synthesize a fake target for unlinked workouts. The prior
    // block here invented a duration-derived pace target (tempo_run @ 10K pace
    // for 30-60 min, etc.) and scored adherence against it — then INSIGHTS
    // scolded the athlete for "missing" a target they never set. Unlinked
    // workouts now flow through with empty intervals; adherence fields are
    // null-overridden after computation (see D-035 guard below). Single-workout
    // signals (GAP, HR drift, variability) still compute honestly on the actual
    // ride/run data.
    if (!intervals || intervals.length === 0) {
      console.log('🏃 No planned workout — adherence will be null (D-035)');
      intervals = [];
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

    // ⛔ UNMATCHED WATCH LAPS ARE THE ROWS (2026-09-14). The plan's steps cannot be paired with them, and a plan step
    // reads as "measured" above because its PLANNED duration sits in `duration_s` — so without this the analyzer
    // chose 46 unexecuted plan steps and printed no rows at all.
    // ⛔ AND WHEN SOME LAPS WERE PAIRED WITH WORK STEPS (`laps-paired`, 2026-09-16) the laps are still the rows; a paired
    // rep carries its step's pace range, read off the plan by its step id, so it is judged like any planned rep.
    const lapsUnmatched = rowsComeFromTheWatch((workout as any)?.computed?.alignment_mode) && computedOnlyIntervals.length > 0;
    const planStepsById = new Map<string, any>((Array.isArray(plannedWorkout?.computed?.steps) ? plannedWorkout.computed.steps : []).map((s: any) => [String(s?.id), s]));
    const computedIntervals = lapsUnmatched
      ? computedOnlyIntervals.map((iv: any) => {
          const pr = iv?.planned_step_id != null ? planStepsById.get(String(iv.planned_step_id))?.pace_range : null;
          return pr && !iv.pace_range ? { ...iv, pace_range: { lower: pr.lower, upper: pr.upper }, target_pace: { lower: pr.lower, upper: pr.upper } } : iv;
        })
      : isPlanLinkedWorkout
      ? (
          plannedHasMeasuredEvidence
            ? plannedStructuredIntervals
            : (computedHasMeasuredEvidence ? computedOnlyIntervals : plannedStructuredIntervals)
        )
      : (computedOnlyIntervals.length > 0 ? computedOnlyIntervals : plannedStructuredIntervals);
    console.log(`🔍 [INTERVAL SOURCE] ${intervalSource} (${computedIntervals.length} intervals)`);
    
    // Enrich intervals with pace ranges from planned workout
    /**
     * ⛔⛔ THE SAVED RANGE IS THE RANGE (round 5, 2026-09-18, Michael's ruling: one owner for every step's top). This
     * block re-widened any saved pace range it judged "too tight" and widened a single pace by our own per-segment
     * tolerances (±5 / 7 / 8 / 10 / 15%, `getPaceToleranceForSegment`, OURS, no source) — a second band beside the
     * plan's. The plan writes every range through the one owner (`singleTargetBand`, TrainingPeaks ±10%, or the page's
     * own range), so a saved range is read as saved; a single pace (race day's one pace, a zero-width range, a planned
     * target with no range) gets the owner's ±10%. `getPaceToleranceForSegment` is deleted.
     */
    const bandOf = (pace: number) => singleTargetBand(pace);
    const intervalsToAnalyze = computedIntervals.map(interval => {
      const plannedStep = plannedWorkout?.computed?.steps?.find((s: any) => s.id === interval.planned_step_id);
      const range = interval.pace_range || plannedStep?.pace_range;
      if (range && Number(range.lower) > 0 && Number(range.upper) > 0) {
        if (Number(range.lower) === Number(range.upper)) {
          const b = bandOf(Number(range.lower));
          return { ...interval, pace_range: b, target_pace: b };
        }
        if (!interval.pace_range && !interval.target_pace) {
          return { ...interval, pace_range: range, target_pace: { lower: range.lower, upper: range.upper } };
        }
        return interval;
      }
      const singlePace = Number(interval.planned?.target_pace_s_per_mi);
      if (singlePace > 0 && !interval.pace_range?.lower && !interval.target_pace?.lower) {
        const b = bandOf(singlePace);
        return { ...interval, pace_range: b, target_pace: b };
      }
      if (interval.target_pace?.lower === interval.target_pace?.upper && interval.target_pace?.lower > 0) {
        const b = bandOf(interval.target_pace.lower);
        return { ...interval, pace_range: b, target_pace: b };
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
    
    // D-036: GAP enrichment lifted to top-level so the HR analyzer
    // (calculateEfficiency) can score decoupling on grade-adjusted pace, not
    // raw pace. enrichSamplesWithGAP is idempotent — granular-pace.ts's
    // internal call sees the marker and short-circuits, so no double-apply.
    const _enrichedRun = enrichSamplesWithGAP(sensorData);
    const effectiveSensorData = _enrichedRun.samples;
    const _runPaceBasis: 'gap' | 'raw' = _enrichedRun.basis;

    // Perform granular adherence analysis
    console.log('🔴🔴🔴 INDEX.TS VERSION 2026-02-02-D: HR DRIFT FIX ACTIVE');
    console.log('🚀 [TIMING] Starting calculatePrescribedRangeAdherenceGranular...');
    const analysis = calculatePrescribedRangeAdherenceGranular(effectiveSensorData, intervalsToAnalyze, workout, plannedWorkout, historicalDriftData, planContextForDrift);
    console.log(`🏁 AFTER_GRANULAR +${Date.now()-_t0}ms heap=${_mem()} pace_basis=${_runPaceBasis}`);

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

        // ⛔ THE SAVED RANGE, OR THE OWNER'S ±10% AROUND ONE PACE (round 5, 2026-09-18, `singleTargetBand`,
        // TrainingPeaks). Replaces our 5 s around a point target and 1% around a range (OURS).
        if (Math.abs(slow - fast) <= 0.5) {
          const b = singleTargetBand(fast);
          return a >= b.lower && a <= b.upper;
        }
        return a >= fast && a <= slow;
      };

      if (firstRange && lastRange) {
        const firstMid = (firstRange.lower + firstRange.upper) / 2;
        const lastMid = (lastRange.lower + lastRange.upper) / 2;
        
        // If last segment target is at least 5% faster, this is a fast-finish workout
        // OURS — a last segment 5% faster than the first marks a fast finish; no page, kept as found
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
    
    // Provide user-specific HR zones — use configured_hr_zones (same source as Training Baselines)
    // so debrief zone references match exactly what every other surface shows.
    // Fall back to Friel %LTHR computed from learned threshold HR if no configured zones.
    const hrZonesFromBaseline = (() => {
      try {
        // Priority 1: configured_hr_zones (what Training Baselines and coach display)
        const czArr = (configuredHrZones as any)?.zones as Array<{ min?: number; max?: number | null }> | undefined;
        if (Array.isArray(czArr) && czArr.length >= 4) {
          // zones[0]=Z1, [1]=Z2, [2]=Z3, [3]=Z4, [4]=Z5
          /**
           * ⛔ EACH ZONE ENDS ONE BEAT BELOW THE NEXT ZONE'S FLOOR (2026-09-17, clean-up batch item 10). The four
           * writers store a zone's top two ways: Friel from Baselines (`save-baselines` → `frielRunZones`) as the
           * beat below the next floor; Karvonen (`hrZones`), Strava (`strava-token-exchange`) and a FIT file
           * (`save-imported-workout`) as the next floor itself. Zone 1 took a beat off and zones 2–4 did not, so each
           * was one beat wrong for one of the two shapes. The floors agree in both, so the ceiling is read off them.
           */
          const get = (i: number) => czArr[i];
          const topOf = (i: number) => {
            const nextFloor = Number(get(i + 1)?.min);
            return Number.isFinite(nextFloor) && nextFloor > 0 ? nextFloor - 1 : Number(get(i)?.max ?? 0);
          };
          const z1Max = topOf(0);
          const z2Max = topOf(1);
          const z3Max = topOf(2);
          const z4Max = topOf(3);
          if (z1Max > 0 && z2Max > z1Max && z3Max > z2Max && z4Max > z3Max) {
            return { z1Max, z2Max, z3Max, z4Max, z5Max: 999 };
          }
        }
        // Priority 2: the CANONICAL Friel %LTHR model (friel-zones.ts) from the resolved threshold —
        // the SAME boundaries the facts bins, the Baselines screen, and the easy band use. Was a local
        // non-Friel table (0.75/0.85/0.92/0.98) that produced a SECOND, differently-binned distribution
        // surfacing next to the facts. audit 2026-07-17. LTHR via the one resolver (learned-first, gated).
        const thr = resolveCurrentLthr({ learned_fitness: learnedFitness as any }).bpm;
        if (thr == null || thr <= 0) return undefined;
        // ⛔ THE ONE TABLE, READ — not a copy of its percentages (WORKORDER §3b, 2026-09-16). The copy that
        // stood here put each zone's top on the next zone's first beat (Z1 top 85%, Z3 top 95%, Z4 top
        // 105%), one beat above `frielRunZones`, whose tops are the beat BELOW the next zone's floor.
        // The bins are `hr <= zNMax`, so the table's `max` is the ceiling exactly.
        const [fz1, fz2, fz3, fz4] = frielRunZones(thr);
        return { z1Max: fz1.max!, z2Max: fz2.max!, z3Max: fz3.max!, z4Max: fz4.max!, z5Max: 999 };
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

    // D-038 Piece 1B: pre-HR variance hint. The full _varGate below depends on
    // fact_packet_v1 (terrain_type, interval_execution) which isn't built yet,
    // so reproduce the subset of predicates whose inputs are available now:
    // pace CV at GAP basis, detected intervals on unplanned sessions, plan
    // intent intervals on linked sessions. Threaded into hrAnalysisContext so analyzeHeartRate marks the
    // DECOUPLING low-confidence (basis='raw') on a not-steady-enough effort — it NO LONGER re-labels the
    // run "fartlek" (that was scientifically wrong + out of step with every commercial app; the label
    // stays honest, the metric carries the uncertainty). ie-total-steps and raw-CV-on-flat signals are
    // deferred to the full _varGate downstream.
    const preHRMixedEffortHint: boolean = (() => {
      // (1) pace CV at GAP basis ≥ 13%. Was 8% — research-corrected 2026-07-12: normal easy runs run
      // 5–10% CV on raw/GAP pace (GPS noise + hills + lights) and 7% CV is metabolically costless, so 8%
      // fired on ordinary easy runs. ~13% (low-mid teens) separates genuinely-variable efforts (marathons
      // ~16%, fartlek/intervals higher) from steady easy running. (Ideal = a Variability-Index / NGP÷avg
      // gate ~1.05, jitter-resistant — not computed here yet.)
      const cvPct = Number((analysis as any)?.pacing_variability?.coefficient_of_variation);
      const gapAdj = Boolean((analysis as any)?.gap_adjusted);
      // OURS — 13% pace CV (the reasoning is in the note above, no named source); kept as found
      if (Number.isFinite(cvPct) && cvPct >= 13 && gapAdj) return true;
      // (2) detected intervals on unplanned session (non-easy/steady/long/recovery)
      if (!isLinkedPlanSession) {
        const detected = String(detectWorkoutTypeFromIntervals(intervalsToAnalyze, plannedWorkout) || '').toLowerCase().trim();
        if (detected && detected !== 'easy' && detected !== 'steady_state' &&
            detected !== 'long' && detected !== 'long_run' && detected !== 'recovery') {
          return true;
        }
      }
      // (3) plan intent intervals on linked session
      if (isLinkedPlanSession) {
        const k = String(classifiedTypeKey || '').toLowerCase();
        if (k === 'intervals' || k === 'interval' || k === 'interval_run' ||
            k === 'tempo' || k === 'tempo_run' || k === 'fartlek' || k === 'threshold' ||
            k === 'vo2' || k === 'vo2max' || k === 'speed' || k === 'track') return true;
      }
      return false;
    })();

    const hrAnalysisContext: HRAnalysisContext = {
      workoutType: classifiedHrWorkoutType,
      // D-035 canonical unplanned signal; consumed by the HR analyzer's
      // interval-route decoupling gate (detected intervals on unplanned runs
      // still compute decoupling, basis forced to 'raw').
      isUnplanned: !isLinkedPlanSession,
      // D-038 Piece 1B: see preHRMixedEffortHint construction above.
      varianceGate: { isMixedEffort: preHRMixedEffortHint },
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
        // Single-source temperature (2026-07-03): the API ambient is AUTHORITATIVE. The Garmin wrist
        // sensor (avg_temperature → deviceF) reads ~2–5°F high from body heat, and was the source of the
        // header-76 vs terrain-78 disagreement. API-first, matching the session-detail header
        // (temperature_start_f ?? temperature); device is a last resort only when no API weather exists.
        const apiF = (wd?.temperature_start_f ?? wd?.temperature) ?? null;
        const tempF = apiF ?? deviceF ?? (avgC === 0 ? 32 : null);
        return {
          temperatureF: tempF,
          feelsLikeF: wd?.feels_like,
          humidity: wd?.humidity,
          source: apiF != null ? 'openmeteo' as const : (deviceF != null ? 'device' as const : 'openmeteo' as const),
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
    
    // D-036: feed the HR analyzer the GAP-enriched samples (same series
    // calculatePrescribedRangeAdherenceGranular consumes). calculateEfficiency
    // now scores decoupling on grade-adjusted pace — terrain confound removed.
    const hrAnalysisResult = analyzeHeartRate(effectiveSensorData, hrAnalysisContext);
    console.log(`🏁 AFTER_HR +${Date.now()-_t0}ms heap=${_mem()} drift=${hrAnalysisResult.drift?.driftBpm ?? 'N/A'} pace_basis=${_runPaceBasis}`);
    
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
    
    // Execution is set once, at the serialization boundary below (Garmin's time in the target range).
    let performance: Record<string, any> = {
      execution_adherence: null,
      pace_adherence: 0,
      duration_adherence: 0,
      completed_steps: 0,
      total_steps: computedIntervals.length,
      gap_adjusted: false,
    };

    if (computedIntervals.length > 0) {
      const completedCount = computedIntervals.filter((i: any) => i.executed).length;
      performance.completed_steps = completedCount;
      
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
        
        // ⛔ THE SESSION'S ONE MOVING TIME (2026-09-16, Stage 7 session 1) — `completedMovingSeconds`, the
        // figure Details, the calendar and Today print; the device's seconds first. This was a copied ladder.
        const movingTimeForPace = completedMovingSeconds(workout) ?? 0;
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
          // ⛔ THE SESSION'S ONE MOVING TIME (2026-09-16, Stage 7 session 1) — `completedMovingSeconds`.
          const movingTimeForPace = completedMovingSeconds(workout) ?? 0;
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
      // ⛔ SHORT OR LONG — THE PERCENTAGE CANNOT SAY (2026-08-02, Michael: *"did you cut it short or
      // go long"*). `adherence_percentage` is distance-from-100 computed with Math.abs(), so 76% means
      // "24%% off" and a 35-minute run and a 57-minute run against a 46-minute plan both come out 76.
      // The signed delta has always been computed and then dropped before anything could read it.
      //
      // `volume_ratio_pct` is the plain ratio: under 100 is short, over 100 is long. Nothing is graded
      // here — it is the raw relationship, for the screen to read out and the coach to trend.
      //
      // ⚠️ IT IS MOVING TIME AGAINST PLANNED TIME (Michael: *"dont confuse duration with moving time"*).
      // Both analyzers resolve the actual from `computed.overall.duration_s_moving`, so the two sports
      // agree — but a session with long stops has a moving time well under its elapsed time, and this
      // ratio will read short for that reason alone. Surfaces that say "min" must mean moving minutes.
      {
        const pd = Number(enhancedAnalysis.duration_adherence?.planned_duration_s);
        const ad = Number(enhancedAnalysis.duration_adherence?.actual_duration_s);
        performance.volume_ratio_pct = (Number.isFinite(pd) && pd > 0 && Number.isFinite(ad) && ad > 0)
          ? Math.round((ad / pd) * 100)
          : null;
      }
      performance.gap_adjusted = !!(analysis as any).gap_adjusted;
      
      console.log(`🎯 Pace adherence: ${granularPaceAdherence}% · duration adherence: ${granularDurationAdherence}% (Execution is set at the serialization boundary)`);
    }

    const plannedWorkStepsForContract = getPlannedWorkSteps(plannedWorkout);

    const looksPlanLinkedZeroed =
      !!plannedWorkout &&
      plannedWorkStepsForContract.length > 0 &&
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
      performance.total_steps = Math.max(performance.total_steps, plannedWorkStepsForContract.length);
      console.warn('⚠️ [PLAN CONTRACT GUARD] Recovered plan-linked adherence from granular metrics to avoid invalid 0/0/0 payload.', {
        workout_id,
        planned_work_steps: plannedWorkStepsForContract.length,
        fallbackPace,
        fallbackDuration,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // THE EASY GOVERNOR — an easy run is scored on heart rate, not on pace
    // ─────────────────────────────────────────────────────────────────────────
    // The app has ALWAYS known this: the Insights paragraph below already drops the pace verdict on a
    // steady run and speaks to the easy band instead, and the client already hides the Pace chip
    // (`is_easy_like`). What was missing is that the read was PROSE ONLY — a sentence, off AVERAGE HR
    // — while the ride shipped the same idea as a scored chip off TIME UNDER THE CEILING ([D-362]).
    // So an easy run showed two chips, an easy ride three, and the run's Execution score was still
    // half-built from a pace number the same screen had decided not to show.
    //
    // Three things change, and they are the ride's three, applied to running:
    //   1. TIME under the ceiling, never the average — a hilly run averages over and reads as
    //      indiscipline when 90% of it was correctly easy (`_shared/time-under-ceiling.ts`).
    //   2. Its own chip, naming the ceiling AND where the ceiling came from — an estimate off max HR
    //      is not a measured threshold and the athlete deserves to know before it costs them a score.
    //   3. Execution = 50/50 intensity + duration, so the score is built from what was prescribed.
    //
    // ⚠️ THE CEILING IS THE RUN'S OWN (`resolveRunEasyHrBand`), not the ride's. Running HR sits 5-10
    // bpm above cycling at the same effort; both files say do not unify them.
    const runEasyBand = resolveRunEasyHrBand(learnedFitness, (baselines as any)?.threshold_heart_rate);
    if (isEasyPrescribedRun(classifiedTypeKey) && runEasyBand.ceiling != null) {
      const easyRead = timeUnderCeiling(
        sensorData.map((sample: any) => sample?.heart_rate),
        runEasyBand.ceiling,
      );
      const intensityAdherence = easyRead?.pct ?? null;
      if (intensityAdherence != null) {
        performance.intensity_adherence = intensityAdherence;
        // The surface shows MINUTES ("22 of 35 min under 134 bpm"), not a percentage, so both sides of
        // that sentence travel with the number. Back-converting from the pct against session duration
        // would claim time the strap never measured.
        performance.easy_under_s = easyRead!.under_s;
        performance.easy_total_s = easyRead!.total_s;
        performance.easy_ceiling_bpm = runEasyBand.ceiling;
        // The session contract's vocabulary is `threshold | max_hr | none`; the run band calls its
        // threshold anchor `lthr`. Translate at the boundary rather than teaching the client a second
        // word for one thing (the ride already emits `threshold`).
        performance.easy_ceiling_anchor = runEasyBand.anchor === 'lthr' ? 'threshold' : runEasyBand.anchor;
        // The score is not set here — Execution is set once at the serialization boundary.
        console.log(`🫀 [EASY GOVERNOR] ${intensityAdherence}% of time at or under ${runEasyBand.ceiling} bpm (${runEasyBand.anchor})`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // D-035: Unlinked-workout null-override
    // ─────────────────────────────────────────────────────────────────────────
    // Adherence means "vs what was prescribed." Without a plan link, there is
    // nothing to be measured against. Earlier in this function we deleted the
    // duration-derived target synthesis; here we make sure no residual default
    // (e.g., calculatePrescribedRangeAdherenceGranular returning 100% when no
    // mainSegments exist) leaks through as a misleading adherence number.
    const _hasLinkedPlan = !!plannedWorkout && getPlannedWorkSteps(plannedWorkout).length > 0;
    if (!_hasLinkedPlan) {
      performance.execution_adherence = null;
      performance.pace_adherence = null;
      performance.duration_adherence = null;
      // The easy governor is an adherence read like any other — "you held it easy" only means
      // something against a prescription that said easy. No plan, no chip.
      performance.intensity_adherence = null;
      performance.volume_ratio_pct = null;
      performance.easy_under_s = null;
      performance.easy_total_s = null;
      performance.easy_ceiling_bpm = null;
      performance.easy_ceiling_anchor = null;
      performance.completed_steps = null;
      performance.total_steps = null;
      performance.gap_adjusted = false;
      console.log('🔓 [D-035] Unlinked workout — adherence fields nulled');
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
      
      // OURS — pace adherence 95 = on target, 85 = slightly slower; no page, kept as found
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
        
        console.log(`🎯 [ADHERENCE] pace ${performance.pace_adherence}% · duration ${performance.duration_adherence}%`);
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

    // Pace adherence from the interval breakdown (work reps only). Execution does not read it.
    if (detailedAnalysis && detailedAnalysis.interval_breakdown && detailedAnalysis.interval_breakdown.available) {
      // interval_breakdown is an object with .intervals array (not .summary)
      const breakdownData = detailedAnalysis.interval_breakdown;
      const intervalBreakdown = Array.isArray(breakdownData.intervals) ? breakdownData.intervals : [];      
      if (intervalBreakdown.length > 0) {
        // ✅ RECALCULATE PACE ADHERENCE from interval_breakdown (correct per-interval average pace adherence)
        // CRITICAL: Only use WORK intervals for pace adherence (matches Summary view - single source of truth)
        const workIntervalBreakdown = intervalBreakdown.filter(i => 
          String(i.interval_type || '').toLowerCase() === 'work'
        );
        // ⛔ A FAILED REP COUNTS (2026-09-14). This dropped every 0, so reps of 100/100/100/0 averaged 100.
        // A 0 from a rep that had a pace target and a measured pace is a miss and stays in; a 0 from a rep
        // with no target or no pace (strides, a dropped recording) is not a score and stays out.
        const allPaceAdherences = workIntervalBreakdown
          .filter(i => {
            const p = i.pace_adherence_percent;
            if (typeof p !== 'number' || !Number.isFinite(p)) return false;
            if (p > 0) return true;
            const hasTarget = Number(i.planned_pace_range_lower) > 0 || Number(i.planned_pace_min_per_mi) > 0;
            const hasPace = Number(i.actual_pace_min_per_mi) > 0;
            return hasTarget && hasPace;
          })
          .map(i => i.pace_adherence_percent);
        
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
          }
          
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

    // Q-128/Q-129 (D-242/D-244): the within-run positive split is the ONE honesty key. Computed
    // ONCE here off the `workoutToUse` RE-READ — `computed.analysis.events.splits` is written by
    // compute-workout-analysis and is absent from the original line-162 read (the runtime-null that
    // misfired before D-244). The steady-effort gate (is_mixed_effort) is folded in AFTER the variance
    // gate below; `_executionHonesty` is assembled there and reused by all three narrative surfaces.
    const _ehComp = typeof (workoutToUse as any)?.computed === 'string'
      ? (() => { try { return JSON.parse((workoutToUse as any).computed); } catch { return null; } })()
      : (workoutToUse as any)?.computed;
    const _ehSplitsMi = _ehComp?.analysis?.events?.splits?.mi;
    // EFFORT = HR, NOT grade-adjusted pace (2026-07-19). A GAP half-vs-half FALSELY reads a "positive
    // split" on an OUT-AND-BACK — GAP credits the uphill leg, penalizes the downhill return, a terrain
    // artifact, not a fade. A fade may only be NAMED when HR agrees it drifted up. decouplingPct is the
    // single-source HR-drift read the State durability row + the session-detail PACING line also use;
    // HR held (≤5%, the Friel line) = even effort = terrain → suppress. Gating at the SOURCE suppresses
    // all three narrative surfaces (hr_drift guard, LLM prompt, fade bullets) at once. A real fade drifts
    // HR up (high/absent decoupling) → still named.
    const _ehDecoupling = Number(hrAnalysisResult?.summary?.decouplingPct);
    const _ehPosSplitSec = (Number.isFinite(_ehDecoupling) && _ehDecoupling <= 5)
      ? null
      : computePositiveSplitSec(_ehSplitsMi, true);
    // Pacing-verdict guard signal: raw pace variability, INDEPENDENT of the fade/HR gate above — a run can
    // be even-EFFORT (fade suppressed) yet have a wildly varying PACE (rolling terrain). Feeds the ai-summary
    // validator that forbids "the pace held steady" when the pace didn't.
    const _ehPaceVariedPct = paceVariedPct(_ehSplitsMi);

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
    
    /**
     * ⛔ EXECUTION = COROS'S EFFORT ACCURACY: DONE, AND DONE IN RANGE (2026-09-17, Michael) — `_shared/execution-score.ts`
     * carries COROS's words and URL. Set ONCE, here, after everything else; nothing below rewrites it.
     *   · The sections scored are the plan's steps that carry a target: a pace range, and not sent to the watch as
     *     time only (`watch_target: 'none'`, an easy jog). The warm-up and cool-down never count, by their kind, on any
     *     plan. COROS: open sections get no score.
     *   · Completion: done ÷ planned per section (distance when the step prescribes distance, else time), capped at
     *     100%, weighted by planned time; a section never reached counts 0. Intensity: seconds inside each section's
     *     own range (counted per second by compute-workout-summary, `executed.in_range_s`) ÷ seconds done. The range
     *     is the plan's as printed. Execution = the two averaged.
     *   · Easy run (a heart-rate target): completion = moving ÷ planned time; intensity = moving seconds under the
     *     easy ceiling ÷ moving seconds.
     *   · FALLBACK (OURS): a section with no per-second count is judged on its average — all of it or none of it.
     *   · Laps that could not be placed against the plan (`laps-unmatched`, `no-laps-whole-run`), or no target at all:
     *     no score.
     */
    {
      const alignmentMode = String((workout as any)?.computed?.alignment_mode || '');
      let execPct: number | null = null;
      let execBasis: 'work_time_in_range' | 'easy_hr' | null = null;
      let repsInRange = 0, repsJudged = 0, fallbackReps = 0;
      let completionPct: number | null = null, intensityPct: number | null = null;
      if (_hasLinkedPlan && isEasyPrescribedRun(classifiedTypeKey) && runEasyBand.ceiling != null) {
        // Each analyzer sample is one second (`duration_s`, the extractor's own); stopped seconds carry no pace.
        const under = movingSecondsUnderCeiling(
          sensorData.map((x: any) => ({
            seconds: Number(x?.duration_s) || 1,
            hr: x?.heart_rate,
            moving: Number(x?.pace_s_per_mi) > 0 && Number(x?.pace_s_per_mi) <= STOPPED_SLOWER_THAN_S_PER_MI,
          })),
          runEasyBand.ceiling,
        );
        const r = executionFromEasyHr(under, completedMovingSeconds(workout), Number(enhancedAnalysis.duration_adherence?.planned_duration_s) || null);
        execPct = r.pct; completionPct = r.completion_pct; intensityPct = r.intensity_pct;
        if (execPct != null) execBasis = 'easy_hr';
      } else if (_hasLinkedPlan && !['laps-unmatched', 'no-laps-whole-run'].includes(alignmentMode)) {
        const sections = computedIntervals
          .map((iv: any) => {
            const role = String(iv?.role ?? iv?.kind ?? '').toLowerCase();
            const st = iv?.planned_step_id != null ? planStepsById.get(String(iv.planned_step_id)) : null;
            const range = st?.pace_range ?? null;
            // ⛔ The warm-up and the cool-down are never scored, on any plan (2026-09-17): the book prescribes both as an
            // "easy jog" with no target (p231–235), and plans built before they went to the watch as time only still
            // carry a pace range on them. Decided by the step's kind, not by the range.
            const stepKind = String(st?.kind ?? st?.type ?? '').toLowerCase();
            if (/warm|cool/.test(stepKind) || /warm|cool/.test(role)) return null;
            if (!st || !range || st?.watch_target === 'none' || role === 'lap' || role === 'overall') return null;
            const notDone = iv?.not_done === true || !iv?.executed;
            const secs = notDone ? 0 : (Number(iv.executed?.moving_s ?? iv.executed?.duration_s) || 0);
            const plannedM = st?.distanceDerived === true ? 0 : Number(st?.distanceMeters) || 0;
            const plannedS = Number(st?.seconds ?? st?.duration_s) || 0;
            const doneM = notDone ? 0 : Number(iv.executed?.distance_m) || 0;
            const completion = plannedM > 0 && !(plannedS > 0) ? doneM / plannedM : (plannedS > 0 ? secs / plannedS : null);
            // Distance steps weigh by the time the range's middle pace gives them.
            const weight = plannedS > 0 ? plannedS : (plannedM > 0 ? (plannedM / 1609.34) * ((Number(range.lower) + Number(range.upper)) / 2) : null);
            // The summary step's segment pace on moving seconds — the pace the row prints and bands.
            const band = notDone ? null : paceRangeBand(Number(iv.executed?.avg_pace_s_per_mi) || null, range.lower, range.upper);
            return {
              planned_s: weight, completion, seconds: secs,
              in_range_s: notDone ? 0 : (iv.executed?.in_range_s ?? null),
              average_in_range: notDone ? false : (band == null ? null : band === 'in'),
              is_rep: role === 'work' && !notDone,
            };
          })
          .filter((x: any) => x != null);
        const r = executionFromSections(sections);
        execPct = r.pct; completionPct = r.completion_pct; intensityPct = r.intensity_pct;
        repsInRange = r.reps_in_range; repsJudged = r.reps_judged; fallbackReps = r.fallback_reps;
        if (execPct != null) execBasis = 'work_time_in_range';
      }
      performance.execution_completion_pct = completionPct;
      performance.execution_intensity_pct = intensityPct;
      console.log(`🎯 [EXECUTION] ${execPct ?? '—'}% = (done ${completionPct ?? '—'}% + in range ${intensityPct ?? '—'}%) / 2 (${execBasis ?? 'no target'}; reps in range ${repsInRange}/${repsJudged}; fallback ${fallbackReps})`);
      performance.execution_adherence = execPct;
      performance.execution_basis = execBasis;
      performance.execution_reps_in_range = execBasis === 'work_time_in_range' ? repsInRange : null;
      performance.execution_reps_judged = execBasis === 'work_time_in_range' ? repsJudged : null;
      performance.execution_fallback_reps = execBasis === 'work_time_in_range' ? fallbackReps : null;
      if (['laps-unmatched', 'no-laps-whole-run'].includes(alignmentMode)) (performance as any).pace_adherence = null;
      const ep = (enhancedAnalysis as any)?.performance;
      if (ep) { ep.execution_adherence = execPct; if (['laps-unmatched', 'no-laps-whole-run'].includes(alignmentMode)) ep.pace_adherence = null; }
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
        // Use configured Z2 max if available (same source as Training Baselines)
        const czArr = (configuredHrZones as any)?.zones as Array<{ max?: number | null }> | undefined;
        if (Array.isArray(czArr) && czArr.length >= 2) {
          const z2Max = Number(czArr[1]?.max ?? 0);
          if (z2Max > 0) return z2Max;
        }
        // Canonical easy ceiling (0.89·LTHR, friel-zones.ts) via the one resolver — NOT a local 0.85.
        const thr = resolveCurrentLthr({ learned_fitness: learnedFitness as any }).bpm;
        if (thr == null || thr <= 0) return null;
        return easyCeilingBpm(thr);
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
          // OURS — a 3x gap between the two moving times is read as a minutes / seconds mix-up; 7200 s/mi is the pace sanity cap; kept as found
          (cur / inferred >= 3 || inferred / cur >= 3)
        ) {
          const distM = Number(overall?.distance_m) || (Number((workoutForFact as any)?.distance) || 0) * 1000;
          const miles = distM > 0 ? distM / 1609.34 : 0;
          const avgPaceSPerMi = miles > 0 ? Math.round(inferred / miles) : null;
          const nextOverall = { ...(overall || {}), duration_s_moving: Math.round(inferred) };
          if (avgPaceSPerMi != null && avgPaceSPerMi > 0 && avgPaceSPerMi < 7200) {
            nextOverall.avg_pace_s_per_mi = avgPaceSPerMi;
          }
          const nextComputed = { ...(workoutForFact as any).computed, overall: nextOverall };
          // ⛔ IN MEMORY ONLY, for the fact packet (2026-09-16, Stage 7 session 1): compute-workout-summary owns
          // `workouts.computed`; this write spread a computed whose analysis, raw_laps, power_curve, best_efforts
          // and adaptation were nulled above, and wiped those five keys in the database.
          (workoutForFact as any).computed = nextComputed;
          console.log('🛠️ Repaired computed.overall.duration_s_moving in memory (unit mismatch).', { cur, inferred });
        }
      } catch (e) {
        console.warn('[analyze-running-workout] duration repair failed (non-fatal):', e);
      }

      const intent = plannedWorkout ? (detectWorkoutIntent(plannedWorkout) as any) : null;

      // D-041 Fix D: lightweight Arc lookup for phase-aware TREND pool filter.
      // Only needs (last completed goal-race target_date, days_since). Full
      // getArcContext fetch happens later at :2018 for ai_summary; this is a
      // small pre-query to inform the fact-packet build. Failure non-fatal —
      // falls through to legacy unfiltered trend pool.
      let preFactArc: { lastGoalRaceYmd: string | null; daysSinceLastGoalRace: number | null } = {
        lastGoalRaceYmd: null,
        daysSinceLastGoalRace: null,
      };
      try {
        const focusYmd = String(workout?.date ?? '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(focusYmd)) {
          const { data: goalRows } = await supabase
            .from('goals')
            .select('name, target_date, status, goal_type')
            .eq('user_id', workout.user_id);
          const candidates = (goalRows || [])
            .filter((r: any) => String(r.status || '').toLowerCase() !== 'cancelled')
            .filter((r: any) => String(r.goal_type || '').toLowerCase() === 'event')
            .map((r: any) => ({ name: String(r.name || 'Race'), td: r.target_date ? String(r.target_date).slice(0, 10) : '' }))
            .filter((r: { name: string; td: string }) => /^\d{4}-\d{2}-\d{2}$/.test(r.td) && r.td < focusYmd)
            .sort((a: { td: string }, b: { td: string }) => b.td.localeCompare(a.td));
          if (candidates.length) {
            const lr = candidates[0];
            const focusMs = new Date(focusYmd + 'T12:00:00Z').getTime();
            const raceMs = new Date(lr.td + 'T12:00:00Z').getTime();
            preFactArc = {
              lastGoalRaceYmd: lr.td,
              daysSinceLastGoalRace: Math.round((focusMs - raceMs) / 86400000),
            };
          }
        }
      } catch (arcLookupErr) {
        console.warn('[analyze-running-workout] preFactArc lookup failed (non-fatal):', arcLookupErr);
      }

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
        arcContext: preFactArc,
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

      // D-036: replace segment-level cardiac_decoupling_pct (raw pace) with
      // the sample-level decoupling from the run HR analyzer (now GAP-corrected
      // because the analyzer reads effectiveSensorData per task #24). Surface
      // basis so the LLM prompt rule can gate the fitness-claim translation.
      // No-op when sample-level decoupling is null (intervals, < 20 min, etc.) —
      // segment-level value stays in place for those cases.
      if (fact_packet_v1) {
        const fp = fact_packet_v1 as any;
        if (!fp.derived) fp.derived = {};
        const sampleLevelDecoupling = hrAnalysisResult.summary?.decouplingPct ?? null;
        if (sampleLevelDecoupling != null) {
          fp.derived.cardiac_decoupling_pct = Math.round(sampleLevelDecoupling * 10) / 10;
        }
        fp.derived.decoupling_basis = hrAnalysisResult.summary?.decouplingBasis ?? null;
        fp.derived.decoupling_assessment = hrAnalysisResult.summary?.decouplingAssessment ?? null;
      }
    } catch (e) {
      console.warn('[analyze-running-workout] fact_packet_v1 build failed:', e);
      fact_packet_v1 = null;
      flags_v1 = null;
    }

    // =========================================================================
    // Arc narrative mode (workout date slice, not "now")
    // =========================================================================
    let arc_narrative_for_summary: ArcNarrativeContextV1 | null = null;
    // D-042 / D-043 / D-060: weekly aerobic efficiency trend from athlete_snapshot.
    // Variable name updated to reflect what the value actually is — a
    // pace-at-easy-HR delta vs chronic average, NOT an HR-over-time delta.
    // negative = faster pace at same HR = aerobic base building. Forwarded
    // into the LLM via signals.aerobic_efficiency_trend_pct + derived
    // aerobic_direction. D-060 (2026-05-25): DB column renamed
    // run_easy_hr_trend → run_easy_pace_at_hr_trend to match.
    let arc_run_easy_pace_at_hr_trend: number | null = null;
    let run_spine_verdict: { discipline: 'run'; verdict: string; pctChange: number | null } | null = null; // Q-112 step 2
    try {
      const wdSlice = String(workout.date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(wdSlice) && workout.user_id) {
        const arc = await getArcContext(supabase, workout.user_id as string, `${wdSlice}T12:00:00.000Z`);
        arc_narrative_for_summary = arc.arc_narrative_context ?? null;
        const rEasyTrend = Number((arc.latest_snapshot as any)?.run_easy_pace_at_hr_trend);
        arc_run_easy_pace_at_hr_trend = Number.isFinite(rEasyTrend) ? rEasyTrend : null;
        // Q-112 step 2: capture the run's spine verdict here (arc is in scope) for rules 6/7 downstream.
        const rv: any = (arc.latest_snapshot as any)?.state_trends_v1?.run;
        run_spine_verdict = rv && rv.verdict ? { discipline: 'run', verdict: String(rv.verdict), pctChange: rv.pctChange ?? null } : null;
        const lr = arc_narrative_for_summary?.last_goal_race;
        console.log(
          `[analyze-running-workout] arc_narrative workout=${workout_id} date=${wdSlice} mode=${arc_narrative_for_summary?.mode ?? 'n/a'} ` +
            `days_since_last_race=${arc_narrative_for_summary?.days_since_last_goal_race ?? 'n/a'} ` +
            `last_race=${lr ? `${lr.name}@${lr.target_date}` : 'none'} next=${arc_narrative_for_summary?.next_primary_goal?.name ?? 'none'}`,
        );
        console.log(`arc_narrative_context.mode=${arc_narrative_for_summary?.mode ?? 'MISSING'} <- before generateAISummaryV1`);
        console.log(
          JSON.stringify({
            tag: 'arc_narrative_context_before_llm',
            workout_id,
            focus_ymd: wdSlice,
            mode: arc_narrative_for_summary?.mode ?? null,
            days_since_last_goal_race: arc_narrative_for_summary?.days_since_last_goal_race ?? null,
            last_goal_race: lr ? { name: lr.name, date: lr.target_date } : null,
            next_primary_goal: arc_narrative_for_summary?.next_primary_goal
              ? {
                  name: arc_narrative_for_summary.next_primary_goal.name,
                  target_date: arc_narrative_for_summary.next_primary_goal.target_date,
                  priority: arc_narrative_for_summary.next_primary_goal.priority,
                }
              : null,
            plan_phase_bucket: arc_narrative_for_summary?.plan_phase_normalized ?? null,
          }),
        );
      }
    } catch (arcSummErr) {
      console.warn('[analyze-running-workout] arc_narrative_for_summary skipped:', arcSummErr);
    }

    // =========================================================================
    // Variance gate — D-NNN (hoisted before ai_summary so it can gate the LLM
    // input shape: when mixed-effort, drop vs_similar steady comparisons and
    // hand the LLM an interval-summary block instead).
    // =========================================================================
    // D-044 item 7 (2026-05-25): variance-gate logic extracted as exported
    // pure function in `lib/variance-gate.ts`. Pin tests in
    // `lib/variance-gate.test.ts` cover the 5 spec scenarios + boundary
    // cases. Behavior is verifiably no-op vs the prior inline IIFE — same
    // inputs, same return shape.
    const _varGate = computeVarianceGate({
      analysisPacingVariabilityCv: (analysis as any)?.pacing_variability?.coefficient_of_variation,
      analysisGapAdjusted: (analysis as any)?.gap_adjusted,
      factPacketTerrainType: (fact_packet_v1 as any)?.facts?.terrain_type,
      factPacketIntervalExecutionTotalSteps: (fact_packet_v1 as any)?.derived?.interval_execution?.total_steps,
      isLinkedPlanSession,
      intervalsToAnalyze,
      plannedWorkout,
      classifiedTypeKey,
      detectWorkoutTypeFromIntervals,
    });

    // Q-128/Q-129 (D-242/D-244) — assemble the honesty key now that the variance gate is known.
    // STEADY-EFFORT GATE: "faded / didn't hold steady" only means something on a steady run. On a
    // run PRESCRIBED as structured (a linked plan with interval/tempo intent) a slower second half is
    // an expected cooldown, not a fade — so those suppress the guard. But the raw `is_mixed_effort`
    // ALSO trips on `pace_cv` (a fade IS a big pace swing) and on a mislabelled unplanned
    // `detected_intervals` (the detector called an easy run "Interval 1") — using it here suppressed
    // the guard on exactly the faded runs it must catch (Q-129 hole). So gate on the SIGNAL: only real
    // plan structure suppresses; a monotonic fade on an unplanned run still gets named.
    const _executionHonesty = _ehPosSplitSec != null
      ? { positiveSplitSec: _ehPosSplitSec, isMixedEffort: structuredBySignalSuppressesFade(_varGate.variance_signal) }
      : null;

    // Q-129: hr_drift_interpretation is a SECOND narrative surface (deterministic HR module). On a
    // faded STEADY run its bottom line ("Solid aerobic work.") is a TRUE HR-domain statement but omits
    // the pace collapse. Keep the true HR read; NAME the fade (D-246 honest dual read). guardNarrative-
    // Honesty no-ops on a structured run (isMixedEffort) and does NOT strip "Solid aerobic work"
    // (that phrase isn't a banned clean/steady EXECUTION claim) — it only appends the computed slowdown.
    if (_executionHonesty && analysis.heart_rate_analysis?.hr_drift_interpretation) {
      const g = guardNarrativeHonesty(analysis.heart_rate_analysis.hr_drift_interpretation, _executionHonesty);
      if (g.neutralized) {
        console.log(`🔧 [HR NARRATIVE HONESTY] named the fade on hr_drift_interpretation (positive split ${_executionHonesty.positiveSplitSec}s/mi)`);
        analysis.heart_rate_analysis.hr_drift_interpretation = g.text;
      }
    }

    // =========================================================================
    // AI coaching paragraph (v1)
    // Fact packet + flags + holistic training context (deterministic layer).
    // When is_mixed_effort, the summary builder drops steady-effort comparisons
    // and interprets per-interval execution instead.
    // =========================================================================
    let ai_summary: string | null = null;
    let ai_summary_generated_at: string | null = null;
    try {
      if (fact_packet_v1 && flags_v1) {
        // Q-112 step 2: run_spine_verdict (state_trends_v1) was captured above where getArcContext ran →
        // rules 6/7 on the per-workout INSIGHTS (no trend claim contradicting the spine; no receipt recap).
        // Q-128 (D-242): a run that FADED within itself did not "hold steady" — the within-run
        // positive split (`_executionHonesty`, computed once at the workoutToUse re-read above) is
        // the honesty key fed to the summary generator's PRIMARY prompt rule + validator backstop.
        // DETERMINISTIC INSIGHTS (2026-07-19) — the LLM ai_summary is REPLACED by the run composer. Same
        // verdicts (pacing via the shared pacingVerdict, decoupling, terrain, conditions, type), composed
        // deterministically: no model, no wild card, no honesty guard needed. generateAISummaryV1 and its
        // validators were DELETED on 2026-08-03 ([D-372]) — this composer is the only producer of
        // `ai_summary` for runs now. Reads fact_packet_v1 + the splits,
        // the SAME sources the PACING/TERRAIN rows use — one story across Performance and (later) State.
        const _ib = (detailedAnalysis as any)?.interval_breakdown;
        const _intervals = _ib ? { hit: _ib.completed ?? _ib.hit ?? null, total: _ib.total ?? _ib.count ?? null, consistent: _ib.consistent ?? null } : null;
        // The confound flag travels with the number (2026-08-02). The session-detail HR row has excluded
        // heat/effort-confounded decoupling since 2026-07-17; this paragraph was still asserting from it.
        ai_summary = composeRunInsight(buildRunInsightInputFromPacket(
          fact_packet_v1, _ehSplitsMi, _intervals,
          // ⚠️ Derived from the SAME two facts `decouplingConfounded` is built from further down
          // (`_heatConfound` + `_hasDecoupling`) rather than referencing that const — it is declared
          // ~800 lines below this call and reading it here is a temporal dead zone, i.e. a throw.
          ((hrAnalysisResult as any)?.drift?.weather?.factor === 'hot')
            && ((hrAnalysisResult as any)?.summary?.decouplingPct != null),
        ));
        if (ai_summary) ai_summary_generated_at = new Date().toISOString();
        void arc_narrative_for_summary; void _varGate; void isLinkedPlanSession; void arc_run_easy_pace_at_hr_trend; void run_spine_verdict; void _executionHonesty; void _ehPaceVariedPct; // dead LLM-path refs, retained for cleanup ([Q-246])

        // Axis 1 — cross-domain carryover (run card, greenfield, CONSERVATIVE first ship). Signal = RPE
        // (athlete-declared, strongest). RPE can't be mechanically deconfounded, so any material terrain/
        // heat/hard-prescription → suppress (favors silence). Antecedent = a lower/full strength session in
        // the ≤3d window. Detector + shared clause; appended deterministically (guaranteed honest wording).
        try {
          const uid = (workout as any)?.user_id;
          const wDate = String((workout as any)?.date || '').slice(0, 10);
          if (uid && /^\d{4}-\d{2}-\d{2}$/.test(wDate)) {
            const winStart = new Date(new Date(wDate + 'T12:00:00Z').getTime() - CARRYOVER_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
            const { data: recentStr } = await supabase.from('workouts')
              .select('date, strength_exercises, workload_actual')
              .eq('user_id', uid).eq('type', 'strength').eq('workout_status', 'completed')
              .gte('date', winStart).lt('date', wDate);
            const recentSessions = ((recentStr ?? []) as any[]).map((w) => {
              const exRaw = w?.strength_exercises;
              const ex = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (JSON.parse(exRaw || '[]')) : []);
              const names = (Array.isArray(ex) ? ex : []).map((e: any) => String(e?.name || ''));
              return { date: String(w?.date || ''), type: 'strength', strengthFocus: classifyStrengthFocus(names), workload: Number(w?.workload_actual || 0), isNovel: false };
            });
            // CONFOUND SUBTRACTION IS PRIMARY (Gate 3). The analyzer already judges whether the drift is
            // controlled FOR the conditions (heat + terrain + duration) — hrAnalysisResult.drift.assessment.
            // Feed THAT as the confound-adjusted residual, not raw drift: 'normal/good/excellent' = the
            // conditions explain it → residual at baseline → no_elevation (the honest reason for a warm,
            // hilly run). Only 'elevated'/'high' (beyond what conditions explain) leaves a real residual.
            // Signal restructure (research-grounded, Michael 2026-07-03): DOMS from eccentric lifting
            // degrades running ECONOMY + alters stride mechanics (PubMed 12783232). Because DOMS also
            // RAISES HR, pace-at-HR self-cancels → so CADENCE is primary (most direct stride signature,
            // heat-IMMUNE), pace-at-HR decoupling supporting (capped), declared RPE the confirmer/veto.
            // PRIMARY — cadence drop vs the athlete's own recent baseline (legs sluggish, won't turn over).
            const thisCadence = Number((workout as any)?.computed?.overall?.avg_cadence_spm ?? (workout as any)?.avg_cadence);
            // OURS — 42-day cadence baseline, 120–220 spm kept as real readings, 3 runs minimum; no page, kept as found
            const cadStart = new Date(new Date(wDate + 'T12:00:00Z').getTime() - 42 * 86400000).toISOString().slice(0, 10);
            const { data: recentRunCad } = await supabase.from('workouts')
              .select('avg_cadence, computed').eq('user_id', uid).eq('type', 'run').eq('workout_status', 'completed')
              .gte('date', cadStart).lt('date', wDate);
            const cads = ((recentRunCad ?? []) as any[])
              .map((w) => Number(w?.computed?.overall?.avg_cadence_spm ?? w?.avg_cadence))
              .filter((n) => Number.isFinite(n) && n > 120 && n < 220);
            const baselineCadence = cads.length >= 3 ? cads.reduce((a, b) => a + b, 0) / cads.length : null;
            const haveCadence = Number.isFinite(thisCadence) && thisCadence > 120 && thisCadence < 220 && baselineCadence != null;
            const cadenceDrop = haveCadence ? (baselineCadence! - thisCadence) : null; // + = cadence dropped
            // SUPPORTING — pace-at-HR decoupling beyond conditions (capped weight; HR-rises-with-DOMS caveat).
            const decoupAssess = String((hrAnalysisResult as any)?.summary?.decouplingAssessment || '');
            const decoupElevated = decoupAssess === 'needs_work'; // Q-161: was /elevated|high|poor/ over the old 4-word vocab
            // Two-way RPE gauge (Axis 4): this run's RPE vs the athlete's OWN baseline RPE for comparable-
            // INTENSITY runs (avg HR ±8 bpm — same effort band). Above expected → carryover trigger (catches
            // easy runs the cadence signal misses); below → veto. ≥3 comparables required, else gauge off.
            const thisRpe = Number((workout as any)?.rpe);
            const thisAvgHr = Number((hrAnalysisResult as any)?.summary?.avgHr);
            let declaredRpeGap: number | null = null;
            let declaredBaselineOk = false;
            if (Number.isFinite(thisRpe) && thisRpe > 0 && Number.isFinite(thisAvgHr) && thisAvgHr > 0) {
              const { data: recRuns } = await supabase.from('workouts')
                .select('rpe, workout_analysis').eq('user_id', uid).eq('type', 'run').eq('workout_status', 'completed')
                // OURS — 90-day RPE baseline, runs within 8 bpm average heart rate, 3 runs minimum; no page, kept as found
                .gte('date', new Date(new Date(wDate + 'T12:00:00Z').getTime() - 90 * 86400000).toISOString().slice(0, 10)).lt('date', wDate);
              const comps = ((recRuns ?? []) as any[])
                .map((w) => ({ rpe: Number(w?.rpe), hr: Number(w?.workout_analysis?.granular_analysis?.heart_rate_analysis?.average_heart_rate ?? w?.workout_analysis?.heart_rate_summary?.avg_hr) }))
                .filter((x) => Number.isFinite(x.rpe) && x.rpe > 0 && Number.isFinite(x.hr) && Math.abs(x.hr - thisAvgHr) <= 8);
              if (comps.length >= 3) {
                declaredRpeGap = thisRpe - (comps.reduce((a, b) => a + b.rpe, 0) / comps.length);
                declaredBaselineOk = true;
              }
            }
            // Declared soreness (D-234) — the strongest leg-feel signal. PER-WORKOUT post-completion soreness
            // (workout_metadata.readiness.soreness, Hooper 1–7), Z-score vs the athlete's own baseline, with
            // the before-session provenance guard (the run's own entry can't trigger its own card).
            let declaredSorenessElevated = false;
            {
              const { data: soreWk } = await supabase.from('workouts')
                .select('id, date, start_date, workout_metadata').eq('user_id', uid).eq('workout_status', 'completed')
                // OURS — 60-day soreness window; no page, kept as found
                .gte('date', new Date(new Date(wDate + 'T12:00:00Z').getTime() - 60 * 86400000).toISOString().slice(0, 10)).lte('date', wDate);
              const entries: SorenessEntry[] = ((soreWk ?? []) as any[])
                .map((w) => ({ workoutId: String(w?.id ?? ''), startTime: String(w?.start_date || (w?.date + 'T12:00:00Z')), soreness: Number(w?.workout_metadata?.readiness?.soreness) }))
                .filter((e) => e.workoutId && Number.isFinite(e.soreness));
              const targetStart = String((workout as any)?.start_date || (wDate + 'T12:00:00Z'));
              declaredSorenessElevated = resolveCarriedInSoreness(entries, { workoutId: String((workout as any)?.id ?? ''), startTime: targetStart }).elevated;
            }
            const carry = detectCrossDomainCarryover({
              targetDate: wDate, targetDiscipline: 'run',
              effortSignal: haveCadence ? 'cadence' : null, // primary = cadence (heat-immune → no confound subtraction)
              // OURS — a 3 spm cadence drop counts; no page, kept as found
              rawElevation: cadenceDrop, adjustedElevation: cadenceDrop, threshold: 3, // ~3 spm drop = notable
              confounds: { grade: false, heat: false, prescribedHard: false },
              recentSessions, nonLegElevated: null, declaredRpeGap, declaredBaselineOk, declaredSorenessElevated, corroborated: decoupElevated,
            });
            const clause = buildCarryoverClause(carry, 'run');
            if (clause) { ai_summary = ai_summary ? `${ai_summary} ${clause}` : clause; if (!ai_summary_generated_at) ai_summary_generated_at = new Date().toISOString(); }
            console.log(`[analyze-running-workout] carryover ${carry?.claimable ? `CLAIMED (${carry.confidence}, ${carry.antecedent?.dayName})` : `silent (${carry?.suppressedBy})`} [cad ${thisCadence}/${baselineCadence} drop=${cadenceDrop} decoup=${decoupAssess} rpe=${thisRpe}]`);
          }
        } catch (carryErr) {
          console.warn('[analyze-running-workout] carryover skipped:', carryErr);
        }
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
        // Q-129: on a faded run, lead with the named fade and drop the "vs similar workouts"
        // laundering bullet before capping to 4 (no-op when the run didn't trip the honesty guard).
        const cleanedBullets = fadeLeadBullets(bullets.map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean), _executionHonesty).slice(0, 4);
        const tags: string[] = [];
        const confLbl = String((hrAnalysisResult as any)?.confidence || '').toLowerCase();
        // OURS — confidence 0.85 / 0.65 / 0.45 per label; no page, kept as found
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
          // OURS — 3 similar sessions before a vs-similar line; no page, kept as found
          if (vs && typeof vs.sample_size === 'number' && vs.sample_size >= 3 && typeof vs.assessment === 'string') {
            const map: Record<string, string> = {
              better_than_usual: 'Better than usual vs similar workouts.',
              // 2026-09-03: 'typical' printed a bare sentence with no number in it; only a difference is worth a line.
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

        // ── D-288 — AN EASY RUN IS JUDGED ON HEART RATE, NOT PACE. ─────────────────────────────────────
        //
        // This block used to compare the easy portion's PACE to the baseline easy pace with a **±10 sec/mi**
        // tolerance, and say "Easy portion was 1:06/mi SLOWER than your baseline base pace."
        //
        // That is the wrong axis, and the tolerance is not real. On an easy run, pace is the OUTPUT — heat,
        // hills, wind, traffic, sleep and tired legs all change the cost of the same pace. The athlete who
        // correctly slows down in 78°F to hold Zone 2 was being told he ran a minute per mile slow. He
        // executed PERFECTLY. The app had his HR (138), his band (106-134) and the temperature — computed all
        // three, and then judged him on a fourth.
        //
        // THE FIELD (researched 2026-07-13):
        //  · Coaching standard is unambiguous: easy runs are EFFORT sessions, graded on HR/effort, not pace.
        //  · GARMIN ships a first-class structured-workout setting: **"Heart rate for slow steps, otherwise
        //    speed"** — i.e. exactly this split. Its guidance: pace/power for short hard efforts; heart rate
        //    for recovery control and steady endurance.
        //  · TRAININGPEAKS does not grade pace at all — compliance is duration / distance / TSS.
        //  · And the tolerance was absurd: TP's "completed as prescribed" band is **±20%**. ±10 sec/mi on an
        //    11:08 easy pace is **±1.5%** — 13x stricter, on the metric the field says not to use.
        //
        // SO: steady_state (easy / long / recovery) is judged on the HR BAND. Pace becomes a RECEIPT, not a
        // verdict. Every other type (intervals / tempo / progressive / hills / fartlek) KEEPS the pace verdict
        // — those sessions were GIVEN a pace target and asked to hit it. Judge what the athlete was trying to do.
        // ⛔ WAS `classifiedHrWorkoutType === 'steady_state'` (fixed 2026-08-02). That helper returns
        // `steady_state` for EVERYTHING except intervals and hills, so a TEMPO run took this branch and
        // was told it "ran 22 bpm over your easy ceiling" — a session that was supposed to be hard,
        // graded against a prescription it was never given ([D-362]). One gate now, shared with the
        // Easy chip, reading plan intent: `isEasyPrescribedRun`.
        const isSteadyEasyRun = isEasyPrescribedRun(classifiedTypeKey);
        const easyHrBand = resolveRunEasyHrBand(learnedFitness, (baselines as any)?.threshold_heart_rate);
        const runAvgHr = Number((hrAnalysisResult as any)?.summary?.avgHr);
        const ranHot = (hrAnalysisResult as any)?.drift?.weather?.factor === 'hot';
        const hrJudgeable = isSteadyEasyRun
          && easyHrBand.ceiling != null
          && Number.isFinite(runAvgHr) && runAvgHr > 0;

        const baseActual = Number(seg?.baseActualSecPerMi);
        const baseBaseline = Number(baselinePacesSecPerMi.base);
        const paceReceipt = Number.isFinite(baseActual) && baseActual > 0 ? ` (${fmtPace(baseActual)})` : '';

        if (hrJudgeable) {
          const ceiling = easyHrBand.ceiling as number;
          // ⛔ THE SENTENCE AND THE CHIP READ THE SAME NUMBER (2026-08-02). This used to speak off
          // AVERAGE heart rate — "Held your easy band — 134 bpm" — while the Easy chip above it scores
          // TIME under the ceiling. On a hilly run those two disagree by construction: the average can
          // sit under the ceiling while a third of the run was over it, so the paragraph would confirm
          // a session the chip had just marked 68%. One measurement, stated once (Constitution Law 1).
          const underPct = Number(performance?.intensity_adherence);
          if (Number.isFinite(underPct)) {
            bullets.push(
              `${underPct}% of the run at or under your ${ceiling} bpm easy ceiling${paceReceipt}.`
              + (ranHot && underPct < 100 ? ' Heat lifts heart rate at the same effort.' : ''),
            );
          }
          // Below the FLOOR (a walk / stopped strap) is not a verdict worth speaking. Silence.
        } else if (seg?.hasFinishSegment && Number.isFinite(baseActual) && baseActual > 0
          && Number(baselinePacesSecPerMi.baseLo) > 0 && Number(baselinePacesSecPerMi.baseHi) > 0) {
          // NOT a steady easy run -> it had a PACE target. Judged against the easy pace RANGE (D-478): inside it, or how
          // far outside the nearer edge. The ±10 s "aligned" allowance around one point is gone with the point.
          const lo = Number(baselinePacesSecPerMi.baseLo);
          const hi = Number(baselinePacesSecPerMi.baseHi);
          const rangeTxt = `${fmtPace(lo).replace(/\/mi$/, '')}–${fmtPace(hi)}`;
          if (baseActual >= lo && baseActual <= hi) {
            bullets.push(`Easy portion was inside your easy pace range (${rangeTxt}).`);
          } else {
            const d = baseActual > hi ? baseActual - hi : baseActual - lo;
            const dir = d > 0 ? 'slower' : 'faster';
            bullets.push(`Easy portion was ${fmtDelta(d)}/mi ${dir} than your easy pace range (${rangeTxt}).`);
          }
        }

        // Segment delta (fast-finish magnitude)
        const finishDelta = Number(seg?.finishDeltaSecPerMi);
        // OURS — 10 s/mi before the fast-finish gap is spoken; no page, kept as found
        if (seg?.hasFinishSegment && Number.isFinite(finishDelta) && Math.abs(finishDelta) >= 10) {
          const dir = finishDelta > 0 ? 'slower' : 'faster';
          bullets.push(`Fast-finish segment was ${fmtDelta(finishDelta)}/mi ${dir} than target.`);
        }

        // Historical drift baseline
        // 2026-09-03: the "HR drift N bpm vs your typical" sentence is gone — it contradicted the Heart rate
        // row on interval days (one said 3 bpm, the other said not read). Drift has ONE writer now: the
        // session-detail Heart rate row and the Drift chip, as a percentage against the 5% line.
        void histAvg; void driftBpm;

        // Conditions / terrain / pacing fluctuations (only when we have real signal).
        // Keep this to a single concise bullet so it stays high-signal.
        try {
          const parts: string[] = [];

          if (Number.isFinite(tempF)) {
            const tf = Math.round(tempF);
            // OURS — 70 °F before temperature is named (ledger row 39's heat note uses Garmin's 72 °F); kept as found
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
            // OURS — 6% pace variability before it is named; no page, kept as found
            if (pv >= 6) parts.push(`pace variability ~${pv}%`);
          }

          // Terrain: use mile-by-mile splits to detect "rolling" / non-flat terrain
          const terrain = (detailedAnalysis as any)?.mile_by_mile_terrain;
          const splits = Array.isArray(terrain?.splits) ? terrain.splits : [];
          // OURS — 3 mile splits and 40% of them not flat = rolling terrain; no page, kept as found
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
        // OURS — 4 bullets at most (display cap); kept as found
        if (bullets.length >= 4) break;
        if (bullets.some((b) => b.toLowerCase() === s.toLowerCase())) continue;
        bullets.push(s);
      }

      const tags: string[] = [];
      // Pace adherence tags (use the same metric displayed in UI)
      const paceAdh = Number((performance as any)?.pace_adherence);
      if (Number.isFinite(paceAdh)) {
        // OURS — pace adherence 95 / 85 tag bands; no page, kept as found
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
        // OURS — 85 °F hot, 70 °F warm tags; no page, kept as found
        if (tf >= 85) tags.push('conditions_hot');
        else if (tf >= 70) tags.push('conditions_warm');
      }
      // Workout type tag from HR analyzer
      const wt = String((hrAnalysisResult as any)?.workoutType || '').trim();
      if (wt) tags.push(`workout_type_${wt}`);

      // Confidence mapping
      const confLbl = String((hrAnalysisResult as any)?.confidence || '').toLowerCase();
      // OURS — confidence 0.85 / 0.65 / 0.45 per label; no page, kept as found
      const confidence = confLbl === 'high' ? 0.85 : confLbl === 'medium' ? 0.65 : 0.45;

      const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
      // Q-129: on a faded run, lead with the named fade and drop the "vs similar workouts"
      // laundering bullet before capping to 4 (no-op when the run didn't trip the honesty guard).
      const cleanedBullets = fadeLeadBullets(bullets.map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean), _executionHonesty).slice(0, 4);

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
    // D-078: skip preservation when the caller forced regeneration. Stale
    // narrative is the wrong default for user-triggered recompute — any
    // prompt-rule change leaves prior text governed by old rules.
    if (!ai_summary && !forceRegenerateAiSummary) {
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
    } else if (!ai_summary && forceRegenerateAiSummary) {
      console.log('[analyze-running-workout] LLM produced no new ai_summary AND force_regenerate set — leaving null (stale preservation suppressed)');
    }

    const { data: existingAnalysisRow } = await supabase
      .from('workouts')
      .select('workout_analysis')
      .eq('id', workout_id)
      .maybeSingle();
    const prevWa = existingAnalysisRow?.workout_analysis as Record<string, unknown> | null | undefined;
    // race_debrief_text: the model-written debrief paragraph is gone (no-AI work order, 2026-09-07). The
    // column is written null on every analysis so a paragraph a model wrote earlier does not survive a
    // recompute; the debrief screen shows the per-mile facts and the deterministic adherence digest.
    // Hoisted out of the inner try so the persist step below can snapshot it
    // into workout_analysis.course_strategy_zones (defense-in-depth read path).
    let courseStrategyZonesUsed: CourseStrategyZoneLine[] | null = null;
    /* parked: race debrief, WORKORDER §3a */
    if (goalRaceCompletionMatch.matched) {
      try {
        const wAny = workout as Record<string, unknown>;
        const overall = (wAny.computed as Record<string, unknown> | undefined)?.overall as
          | Record<string, unknown>
          | undefined;
        const elapsedSec = (() => {
          const el = Number(overall?.duration_s_elapsed);
          // OURS — under 60 s is treated as no reading; kept as found
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
          const rcSelect = `
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
            `;
          let rc: Record<string, unknown> | null = null;
          for (const leg of ['run', 'full'] as const) {
            const { data: one } = await supabase
              .from('race_courses')
              .select(rcSelect)
              .eq('user_id', workout.user_id)
              .eq('goal_id', goalRaceCompletionMatch.goalId)
              .eq('leg', leg)
              .maybeSingle();
            if (one) {
              rc = one as Record<string, unknown>;
              break;
            }
          }
          if (!rc) {
            const { data: rows } = await supabase
              .from('race_courses')
              .select(rcSelect)
              .eq('user_id', workout.user_id)
              .eq('goal_id', goalRaceCompletionMatch.goalId)
              .limit(1);
            rc = Array.isArray(rows) && rows[0] ? (rows[0] as Record<string, unknown>) : null;
          }
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

        // elapsedSec / movingSec / ifVal / weather / splits above fed the deleted model debrief only;
        // courseStrategyZonesUsed (set above) still reaches the persisted snapshot.
        void elapsedSec; void movingSec; void weather;
      } catch (e) {
        console.warn('[analyze-running-workout] race debrief skipped:', e);
      }
    }

    const race_debrief_text: string | null = null;

    // Variance gate (_varGate) is hoisted above generateAISummaryV1 so it can
    // gate the LLM input shape. The same values feed glance below.

    const sessionStateV1 = {
      version: 1,
      owner: 'analysis',
      generated_at: new Date().toISOString(),
      workout_id: workout_id,
      discipline: 'run',
      glance: {
        status_label: adherenceSummary?.verdict?.label || null,
        execution_score: typeof performance?.execution_adherence === 'number' ? performance.execution_adherence : null,
        // Variance gate (D-NNN). See _varGate computation above.
        is_mixed_effort: _varGate.is_mixed_effort,
        variance_signal: _varGate.variance_signal,
        pace_cv_pct: _varGate.pace_cv_pct,
        pace_cv_basis: _varGate.pace_cv_basis,
        classified_type_variance_override: _varGate.classified_type_variance_override,
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
          // FIELD — definition (marathon 42.195 km = 26.2188 mi); OURS — 0.1 mi floor below, sanity only
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

    // Decoupling-confound flag (continuity fix): a decoupling % is only a valid DURABILITY read in
    // controlled conditions. The validity gates are the OBJECTIVE conditions the field uses — Friel/
    // TrainingPeaks, Intervals.icu (Seiler), and the research all agree: heat, terrain, effort-type, and
    // duration invalidate the measurement; RPE is NOT a decoupling-validity gate (it's a load/narrative
    // metric, not a conditions gate). Terrain (GAP-corrected + 'raw'-drop), effort-type (isSteadyAerobic),
    // and duration (≥20 min) are already gated in state-trend/run.ts. HEAT is the missing one — flagged
    // here from the analyzer's own weather read (drift.weather.factor === 'hot', >75°F; Garmin's heat line
    // is ~72°F). Fueling/hydration also invalidate but are unmeasurable → honest-blank. State drops
    // confounded runs from the durability substrate; the workout screen already explains a hot run as
    // conditions, not fitness — this stops State minting a contradicting "durability gap" verdict.
    const _heatConfound = (hrAnalysisResult as any)?.drift?.weather?.factor === 'hot';
    const _hasDecoupling = (hrAnalysisResult as any)?.summary?.decouplingPct != null;
    const decouplingConfounded = _hasDecoupling && _heatConfound;
    const decouplingConfoundReason = decouplingConfounded ? 'heat' : null;
    const heartRateSummaryOut = (hrAnalysisResult as any)?.summary
      ? { ...(hrAnalysisResult as any).summary, decouplingConfounded, decouplingConfoundReason }
      : (hrAnalysisResult as any)?.summary;

    // Full replacement — every field is computed fresh in this run.
    const updatePayload = {
      workout_analysis: {
        /** workout-detail staleness: session_detail rebuild when GAP/narrative/analysis change */
        recomputed_at: new Date().toISOString(),
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
        heart_rate_summary: heartRateSummaryOut,
        // 2026-09-03: heart-rate drift as a percentage, halves by time, first 3 min skipped — the one
        // definition shared with rides (`_shared/hr-drift-halves.ts`). Read by session-detail when the
        // pace-to-heart-rate decoupling was not computed (intervals), so the Drift chip is never empty.
        hr_drift_v1: (() => {
          try {
            const smp = (typeof effectiveSensorData !== 'undefined' && Array.isArray(effectiveSensorData)) ? effectiveSensorData : (workout.sensor_data?.samples || []);
            const totalS = Number(workout?.moving_time ?? workout?.duration ?? 0);
            return hrDriftHalvesPct(smp, totalS > 0 && totalS < 1000 ? totalS * 60 : totalS, { skipStartS: warmupSkipSeconds((workout as any)?.computed) });
          } catch { return null; }
        })(),
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
}));

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

// OURS — `MIN_SEGMENT_DISTANCE_MI` 0.25 mi and `MIN_SEGMENT_DURATION_S` 120 s: shorter segments merge into one row (display); no page, kept as found
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
  // Watch laps (paired or not, 2026-09-16) are all shown, in the order recorded — not only the paired reps.
  const rowsAreWatchLaps = intervals.some((i: any) => ['lap', 'overall'].includes(String(i?.role || '').toLowerCase()));
  const intervalsForBreakdown = workIntervals.length > 0 && !rowsAreWatchLaps
    ? workIntervals
    : sortIntervalsChrono(intervals.filter((i: any) => i?.executed));
  // The watch's own laps are shown as recorded — a 90 m lap is not merged into its neighbour (2026-09-14).
  const mergedForBreakdown = rowsAreWatchLaps
    ? intervalsForBreakdown
    : mergeMicroSegments(intervalsForBreakdown, MIN_SEGMENT_DISTANCE_MI, MIN_SEGMENT_DURATION_S);
  const intervalBreakdown = generateIntervalBreakdown(mergedForBreakdown, intervals, paceAdherenceForBreakdown, granularAnalysis, sensorData, userUnits, plannedWorkout, workout);
  
  // Pacing consistency analysis
  // Pacing consistency analysis (stub - function was removed during refactor)
  const pacingConsistency = { available: false, message: 'Pacing consistency analysis not available' };
  
  // Calculate workout-level average pace (from moving_time/distance) to pass to mile breakdown
  // This ensures consistency between AI narrative and pattern analysis
  // ⛔ THE SESSION'S ONE MOVING TIME (2026-09-16, Stage 7 session 1) — `completedMovingSeconds`, the figure
  // Details, the calendar and Today print (device seconds first). This copied ladder put our computed
  // figure first and rebuilt the rest from whole minutes.
  const workoutMovingTimeSeconds = completedMovingSeconds(workout) ?? 0;
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
  // OURS — heart-rate drop 20 / 15 / 10 bpm = Excellent / Good / Fair; no page, kept as found
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
  /**
   * ⛔ JUDGED AGAINST THE SAVED RANGE, EASY RUNS AND INTERVALS ALIKE (round 5, 2026-09-18, one owner for every step's
   * top). An easy or recovery rep was flagged only past 5% of the range's midpoint (`RECOVERY_TOLERANCE_PCT`, OURS) —
   * a second top inside the easy pace range's own — and a point target was widened 5 s each side (OURS). Now faster
   * than the range's fast end is fast and slower than its slow end is slow; a single pace gets the owner's ±10%
   * (`singleTargetBand`, TrainingPeaks).
   */
  
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
      
      let direction: 'fast' | 'slow' | 'ok' = 'ok';
      let delta = 0;
      const judged = targetLower === targetUpper
        ? singleTargetBand(targetLower)
        : { lower: Math.min(targetLower, targetUpper), upper: Math.max(targetLower, targetUpper) };
      if (actualPaceSecPerMi < judged.lower) {
        direction = 'fast';
        delta = judged.lower - actualPaceSecPerMi;
      } else if (actualPaceSecPerMi > judged.upper) {
        direction = 'slow';
        delta = actualPaceSecPerMi - judged.upper;
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
  
  // OURS — pace adherence 95 / 85 / 50 bands for the deviation sentence; no page, kept as found
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
        // OURS — 30 s/mi faster than target before the injury-risk line; no page, kept as found
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
    // OURS — drift 6 bpm over 90 min, 4 bpm over 45 min, else 3 bpm = stimulus reached; no page, kept as found
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
    // OURS — last segment 5% faster = planned faster finish; no page, kept as found
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
  // OURS — 5 bpm drift (bpm, not p107's percent); no page, kept as found
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
  // OURS — 5 bpm drift (bpm, not p107's percent); no page, kept as found
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
      // OURS — drift 3 / 10 bpm label bands; no page, kept as found
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
      // OURS — drift 3 / 10 bpm sentence bands; no page, kept as found
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
    // OURS — pace variance 5 / 8% bands; no page, kept as found
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
    // OURS — pace CV 5 / 10% bands; no page, kept as found
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
    // OURS — heart-rate drop 30 bpm, then 20 / 15 / 10 bpm bands; no page, kept as found
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
  // OURS — a stride of 25–800 m is labelled in yards (display); 0.9144 m = 1 yd is the definition
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

  // ⛔ ROWS FROM THE WATCH ARE READY (2026-09-15): unmatched laps, or a structured run with no laps, carry no planned
  // step ids by design; with paired laps (2026-09-16) only the paired reps carry one. The table reads them from the breakdown; the missing-steps check below is for plan-aligned runs.
  if (rowsComeFromTheWatch(workout?.computed?.alignment_mode)) {
    return {
      rows: [],
      mode: 'interval_compare_ready',
      reason: null,
      expected_work_rows: expectedWorkRows,
      measured_work_rows: Array.isArray(computedIntervals) ? computedIntervals.filter((i: any) => !i?.not_done).length : 0,
    };
  }

  // Measured-evidence gate (Bug A.1 / D-NNN): when the analyzer's interval
  // breakdown produced ≥2 measured intervals, surface them as a per-interval
  // table regardless of plan link. The pre-fix gate insisted on a *planned*
  // structured-interval shape and collapsed unlinked-but-real interval sessions
  // to a single "Overall" row, hiding interval structure.
  const _bd = detailedAnalysis?.interval_breakdown;
  const _bdIntervals: any[] = Array.isArray(_bd?.intervals) ? _bd.intervals : [];
  const _bdMeasured = _bdIntervals.filter((iv: any) => {
    const dur = Number(iv?.actual_duration_s ?? iv?.executed?.duration_s ?? 0);
    const dist = Number(iv?.actual_distance_m ?? iv?.executed?.distance_m ?? 0);
    const pace = Number(iv?.actual_pace_min_per_mi ?? iv?.executed?.avg_pace_s_per_mi ?? 0);
    return dur > 0 || dist > 0 || pace > 0;
  });
  const buildRowsFromBreakdown = (): any[] => _bdIntervals.map((iv: any, idx: number) => {
    const kindRaw = String(iv?.interval_type || iv?.kind || '').toLowerCase();
    const kind = /warm/.test(kindRaw) ? 'warmup'
      : /cool/.test(kindRaw) ? 'cooldown'
      : /recover|rest/.test(kindRaw) ? 'recovery'
      : 'work';
    const dur = Number(iv?.actual_duration_s ?? iv?.executed?.duration_s ?? 0);
    const dist = Number(iv?.actual_distance_m ?? iv?.executed?.distance_m ?? 0);
    const paceDirect = Number(
      iv?.executed?.avg_pace_s_per_mi ??
      (Number.isFinite(Number(iv?.actual_pace_min_per_mi)) ? Number(iv.actual_pace_min_per_mi) * 60 : 0)
    );
    const paceDerived = (dur > 0 && dist > 0) ? (dur / (dist / 1609.34)) : 0;
    const pace = Number.isFinite(paceDirect) && paceDirect > 0
      ? paceDirect
      : (Number.isFinite(paceDerived) && paceDerived > 0 ? paceDerived : 0);
    const hr = Number(iv?.avg_heart_rate_bpm ?? iv?.executed?.avg_hr ?? 0);
    return {
      row_id: String(iv?.interval_id || `bd_${idx}`),
      planned_step_id: iv?.interval_id || null,
      planned_index: idx,
      kind,
      interval_number: typeof iv?.interval_number === 'number' ? iv.interval_number : undefined,
      recovery_number: typeof iv?.recovery_number === 'number' ? iv.recovery_number : undefined,
      planned_label: (typeof iv?.planned_label === 'string' && iv.planned_label.trim())
        ? iv.planned_label : null,
      planned_pace_display: null,
      adherence_pct: Number.isFinite(Number(iv?.pace_adherence_percent))
        ? Math.round(Number(iv.pace_adherence_percent)) : null,
      executed: {
        pace_s_per_mi: Number.isFinite(pace) && pace > 0 ? Math.round(pace) : null,
        avg_pace_s_per_mi: Number.isFinite(pace) && pace > 0 ? Math.round(pace) : null,
        distance_m: Number.isFinite(dist) && dist > 0 ? Math.round(dist) : null,
        duration_s: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
        avg_hr: Number.isFinite(hr) && hr > 0 ? Math.round(hr) : null,
      },
    };
  });

  if (!plannedSteps.length) {
    // No linked plan: empty steps are normal — show session totals, not a "planned workout" recompute state.
    if (!plannedWorkout) {
      // Bug A.1: unplanned session with real interval structure (Garmin-detected
      // intervals, fartlek, etc.) — surface the per-interval table instead of
      // collapsing to one "Overall" row.
      if (_bdMeasured.length >= 2) {
        const rows = buildRowsFromBreakdown();
        return {
          rows,
          mode: 'interval_compare_ready',
          reason: 'unplanned_detected_intervals',
          expected_work_rows: 0,
          measured_work_rows: rows.filter((r: any) => r.kind === 'work').length,
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
            // Bug A: never ship the literal 'Overall session'. Display layer
            // (CompletedTotalsSegmentTable) renders 'Overall' for the single-row case.
            planned_label: null,
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
          reason: 'unplanned_session',
          expected_work_rows: 0,
          measured_work_rows: 0,
        };
      }
      return {
        rows: [],
        mode: 'overall_only',
        reason: 'unplanned_no_totals',
        expected_work_rows: 0,
        measured_work_rows: 0,
      };
    }
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
          // Bug A: never ship the literal 'Overall session'. Display renders 'Overall'.
          planned_label: null,
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
        // Bug A: never ship the literal 'Overall session'. Display renders 'Overall'.
        planned_label: null,
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
  // OURS — 2 or more planned work steps = intervals; no page, kept as found
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
      // OURS — 2 or more planned work steps = intervals, as above
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
