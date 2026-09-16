/**
 * =============================================================================
 * EDGE FUNCTION: learn-fitness-profile
 * =============================================================================
 * 
 * PURPOSE: Auto-learn user's fitness profile from workout data
 * 
 * WHAT IT DOES:
 * - Analyzes completed runs and rides with HR data
 * - Classifies workouts by effort type (easy, threshold, race)
 * - Extracts HR bands for each zone
 * - Detects threshold pace (running) and estimates FTP (cycling)
 * - Stores learned metrics in user_baselines
 * 
 * KEY INSIGHT: Properly trained athletes rarely hit max HR
 * So we anchor on THRESHOLD, not max:
 * - Easy HR from recovery/long runs
 * - Threshold HR from tempo runs, sustained efforts
 * - Race HR from 5K/10K efforts, hard intervals
 * 
 * INPUT: { user_id: string }
 * OUTPUT: LearnedFitnessProfile
 * =============================================================================
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUserOrService, AuthError } from '../_shared/require-user.ts';
import {
  fitRunThresholdFromBestEfforts,
  thresholdHrFromHrCurves,
  type RunDistanceBests,
  type RunPaceCurve,
  type RunHrCurve,
} from '../../../src/lib/run-critical-speed.ts';
import {
  inferAthleteIdentityV1,
  inferDisciplinesTextArray,
  inferTrainingBackgroundSentence,
  normType,
  type DisciplineRecency,
} from '../_shared/athlete-identity-inference.ts';
import { recomputeRaceProjectionsForUser } from '../_shared/recompute-goal-race-projections.ts';
import { fitSwimCss } from '../_shared/swim/swim-css-learner.ts';
// The bike FTP estimator (docs/SPEC-ftp-estimator-2026-09-04.md): the power-duration fit, guardrails, receipt.
import {
  bestPerDuration,
  compoundFtp,
  fitCriticalPower,
  type CompoundFtp,
} from '../../../src/lib/bike-ftp-estimator.ts';

// Q-169: the ONE definition of "is this heartbeat easy" — threshold-anchored (Friel Z2), %max-bootstrapped.
// The RUN sites use it; the BIKE band (65-75% max + power filter) is deliberately NOT routed through it.
import { resolveRunEasyHrBand, isEasyHr } from '../_shared/easy-hr.ts';
import { resolveMeasuredEasyPaceSecPerMi } from '../../../src/lib/resolve-current-run-pace.ts';
// One definition of "this CSS came from the test", shared with save-baselines, which sets the plan's swim pace from it.
import { isTestedSwimCss } from '../save-baselines/derive.ts';

// =============================================================================
// CORS HEADERS
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin'
};

/** DB `workouts.type` values used in 90d — matches Strava/Garmin/bulk imports + legacy aliases. */
const TYPES_90D_LEARN = [
  'run', 'ride', 'swim', 'strength', 'walk',
  'cycling', 'bike', 'virtualride', 'swimming', 'indoorcycling', 'gravelride',
  'ebikeride', 'mountainbikeride', 'virtualrun', 'treadmillrun', 'workout', 'nordicski',
] as const;

function isRunWorkoutType(type: string): boolean {
  const r = (type || '').toLowerCase().trim();
  if (r === 'walk' || r === 'hike') return false;
  return normType(type) === 'run';
}

function isRideWorkoutType(type: string): boolean {
  return normType(type) === 'ride';
}

/** `workouts.type` is the activity column; there is no `workouts.discipline` column. */
function workoutTypeFromRow(w: { type?: string | null }): string {
  return w?.type != null ? String(w.type) : '';
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface WorkoutRecord {
  id: string;
  /** DB: `workouts.type` — not `discipline` */
  type: string;
  date: string;
  duration: number;
  moving_time: number;
  distance: number;
  avg_heart_rate: number;
  max_heart_rate: number;
  avg_pace: number;  // seconds per km
  avg_power: number;
  normalized_power: number;
  avg_speed: number; // km/h
  workout_status: string;
  computed: any; // May contain analysis.bests.power_20min
}

interface LearnedMetric {
  value: number;
  confidence: 'low' | 'medium' | 'high';
  source: string;
  sample_count: number;
  /**
   * ⛔ LAW 2, MADE EXPLICIT ON THE STORED FACT (2026-08-20). `true` = this number was NOT detected;
   * it was filled in so a hole would have something in it.
   *
   * ⛔ WHY IT HAD TO BE ITS OWN FIELD. The distinction existed — every fallback branch says so in
   * `source` — but readers had no way to act on prose, so they inferred it from `sample_count === 0`
   * (D-284). That proxy answers "how many samples", not "is this a measurement", and the two branches
   * that mean the same thing disagreed under it: `88% of observed max (estimated)` wrote `0`, while
   * `95th percentile of sustained efforts (no clear threshold data)` wrote **18** — the count of the
   * efforts it took a percentile OF. Both are non-detections. One passed every gate.
   *
   * ⛔ WHAT THAT COST, OBSERVED ON A REAL ACCOUNT. The percentile branch published 146 bpm and
   * anchored the easy band at 89% of it = 130. That athlete's easy runs sit at 133-141, so ZERO
   * qualified and `run_easy_pace_sec_per_km` went null. With no easy pace there is no ceiling on the
   * threshold-pace filter either, so contaminated candidates published at 12:51/mi — slower than his
   * own easy runs. One mislabelled number took out the entire chain beneath it.
   *
   * ⚠️ THIS DOES NOT REVERSE Q-171. That ruling is *weak but MEASURED still anchors — the gate is
   * invented-vs-measured, not weak-vs-strong*, and it stands untouched: a low-confidence reading from
   * four real threshold efforts still anchors. What changed is that a non-detection now SAYS it is
   * one, instead of being guessed at from a sample count.
   *
   * ⚠️ ABSENT means "written before this field existed" — treated as NOT an estimate, so the
   * `sample_count === 0` gate stays as the legacy path. Both are checked.
   */
  is_estimate?: boolean;
  /**
   * Q-173 / Law 3 — the date of the NEWEST session that actually fed this number.
   *
   * NOT the same as `learned_fitness.last_updated`, which only says when the profile was last REBUILT.
   * The distinction is load-bearing: a re-learn that runs today over runs from May stamps `last_updated`
   * with today's date while the number is three months stale. That is the freshness lie.
   *
   * It bites hardest in summer: heat lifts run HR ~4-7 bpm, so hot runs land ABOVE the easy ceiling and are
   * (correctly) excluded from the easy band — which means through a hot season almost nothing qualifies, the
   * learner quietly stops updating, and the surface keeps showing a months-old pace that LOOKS current.
   * Stamping the newest contributor is what lets the surface say "as of {date}" instead of lying by omission.
   *
   * Mirrors the coach's BODY "as of" treatment (v85/v87).
   */
  as_of?: string | null;
}

/** Newest session date among the rows that fed a metric. null when unknown — never a fabricated today. */
function newestDate(rows: Array<{ date?: string | null }>): string | null {
  const ds = rows.map((r) => r?.date).filter((d): d is string => typeof d === 'string' && d.length >= 10).sort();
  return ds.length ? ds[ds.length - 1] : null;
}

interface LearnedFitnessProfile {
  // Running metrics
  run_easy_hr: LearnedMetric | null;
  run_threshold_hr: LearnedMetric | null;
  run_race_hr: LearnedMetric | null;
  run_max_hr_observed: LearnedMetric | null;
  run_easy_pace_sec_per_km: LearnedMetric | null;
  run_threshold_pace_sec_per_km: LearnedMetric | null;
  
  // Cycling metrics
  ride_easy_hr: LearnedMetric | null;
  ride_threshold_hr: LearnedMetric | null;
  ride_max_hr_observed: LearnedMetric | null;
  ride_ftp_estimated: LearnedMetric | null;

  /** Median sec/100m from ≥3 completed swim workouts (replaces manual swim pace in projections when confident) */
  swim_pace_per_100m: LearnedMetric | null;
  /** D-199: learned CSS THRESHOLD sec/100m (best-effort critical-speed fit; distinct from the median). null = abstained. */
  swim_css_sec_per_100m?: unknown;
  
  // Meta
  workouts_analyzed: number;
  last_updated: string;
  learning_status: 'insufficient_data' | 'learning' | 'confident';

  // Strength 1RMs (from compute-facts / exercise_log)
  strength_1rms?: Record<string, LearnedMetric>;
}

// =============================================================================
// THE TWO FIELD TESTS — swim CSS and the run time trial
// =============================================================================

/**
 * ⛔ ONE WRITER OF LEARNED VALUES (2026-09-16, Stage 7 session 1). `compute-workout-analysis` read these two
 * tests off the laps and wrote `learned_fitness` itself; the learner then rebuilt the object on its next run,
 * so two functions wrote one column. The maths moved here UNCHANGED, the way the FTP test already lives here;
 * the analysis now only asks the learner to run with `assessment_workout_id` after a linked assessment.
 *
 * Pure: the planned row's tags, the workout's laps, the stored learned values (for the easy-pace check) and
 * the clock. Returns the learned keys the test sets, or null when it sets none.
 */
export function assessmentFromLaps(
  tags: string[],
  laps: any[],
  priorLearned: Record<string, any> | null,
  now: Date = new Date(),
): Record<string, unknown> | null {
  if (!Array.isArray(tags) || !tags.includes('assessment') || !Array.isArray(laps)) return null;
  const out: Record<string, unknown> = {};
  const lapDist = (L: any) =>
    Number(L?.totalDistanceInMeters ?? L?.distanceInMeters ?? L?.dist_m ?? L?.distance ?? 0);
  const lapTime = (L: any) =>
    Number(L?.totalTimerTimeInSeconds ?? L?.totalElapsedTimeInSeconds ?? L?.time_s ?? L?.elapsed_time ?? 0);
  const lapHr = (L: any) => {
    const v = Number(L?.averageHeartRateInBeatsPerMinute ?? L?.avg_heart_rate ?? L?.avg_hr ?? L?.averageHeartRate ?? L?.avgHr ?? NaN);
    return Number.isFinite(v) && v > 100 && v < 220 ? Math.round(v) : null;
  };

  // ── Swim CSS test ──────────────────────────────────────────────────────────
  // Protocol: 400 yd warmup → rest → 400 yd TT → rest → 200 yd TT → 200 yd cool-down. 400 yd ≈ 366 m, 200 yd ≈ 183 m.
  // The TT laps are the fastest in each distance range.
  if (tags.includes('css_test')) {
    const meaningfulLaps = laps.filter((L) => lapDist(L) > 100 && lapTime(L) > 30);
    const longGroup = meaningfulLaps.filter((L) => lapDist(L) >= 300 && lapDist(L) <= 430);
    const shortGroup = meaningfulLaps.filter((L) => lapDist(L) >= 140 && lapDist(L) <= 230);
    if (longGroup.length >= 1 && shortGroup.length >= 1) {
      const best400 = longGroup.reduce((a, b) => (lapTime(a) <= lapTime(b) ? a : b));
      const best200 = shortGroup.reduce((a, b) => (lapTime(a) <= lapTime(b) ? a : b));
      const t400 = lapTime(best400), t200 = lapTime(best200), d400 = lapDist(best400), d200 = lapDist(best200);
      if (t400 > 0 && t200 > 0 && t400 > t200 && d400 > d200) {
        const cssSecPer100m = Math.round(((t400 - t200) / (d400 - d200)) * 100);
        console.log(`[assessment] CSS = ${cssSecPer100m} sec/100m  (400yd=${t400}s d=${d400}m, 200yd=${t200}s d=${d200}m)`);
        if (cssSecPer100m > 55 && cssSecPer100m < 200) {
          // A CLEAN, confirmed threshold → the dedicated swim_css field, NOT the median key swim_pace_per_100m
          // (analyzeSwims owns that). confidence 'moderate' = 2 confirmed efforts (400+200).
          out.swim_css_sec_per_100m = {
            value: cssSecPer100m,
            confidence: 'moderate',
            source: 'CSS test (400/200 yd time trial)',
            n_efforts: 2,
            tested_at: now.toISOString(),
          };
        } else {
          console.warn(`[assessment] CSS ${cssSecPer100m} outside 55–200 range — skipped`);
        }
      } else {
        console.warn('[assessment] CSS: lap time/distance logic failed sanity check');
      }
    } else {
      console.warn(`[assessment] CSS: could not find 400/200 lap pair (long=${longGroup.length}, short=${shortGroup.length})`);
    }
  }

  // ── Run time trial ─────────────────────────────────────────────────────────
  // Protocol: 15 min warmup → 4×stride/walk → TT → 10 min cool-down. p210: 12 / 10 / 8 min — accept any of the three.
  if (tags.includes('run_test')) {
    const ttLap = laps.find((L) => {
      const t = lapTime(L);
      const d = lapDist(L);
      return t >= 450 && t <= 780 && d > 500;
    });
    if (ttLap) {
      const t = lapTime(ttLap);
      const d = lapDist(ttLap);
      // ⛔ p210: the trial gives vVO2 speed; THRESHOLD SPEED = 88% OF IT, so threshold pace = trial pace ÷ 0.88.
      const vvo2PaceSecPerKm = Math.round(t / (d / 1000));
      const paceSecPerKm = Math.round(vvo2PaceSecPerKm / 0.88);
      console.log(`[assessment] Run TT: ${d}m in ${t}s = ${vvo2PaceSecPerKm} sec/km vVO2 pace → threshold ${paceSecPerKm} sec/km (88% of speed, p210)`);
      // ⛔ A threshold effort is faster than the athlete's MEASURED easy pace (D-478); a trial slower than it is a
      // lap detected in the wrong place, a GPS dropout, or an abandoned test. The resolver is sec/MILE; the lap is
      // sec/KM — converted once.
      const measuredEasyMi = resolveMeasuredEasyPaceSecPerMi({ learned_fitness: priorLearned ?? {} } as never);
      const easySecPerKm = measuredEasyMi != null ? measuredEasyMi / 1.609344 : NaN;
      const slowerThanEasy = Number.isFinite(easySecPerKm) && easySecPerKm > 0 && paceSecPerKm >= easySecPerKm;
      if (slowerThanEasy) {
        console.warn(`[assessment] run TT ${paceSecPerKm} s/km is not faster than easy pace ${easySecPerKm} — not a threshold reading, skipped`);
      }
      if (paceSecPerKm > 180 && paceSecPerKm < 600 && !slowerThanEasy) {
        const ttHr = lapHr(ttLap);
        const asOf = now.toISOString().slice(0, 10);
        // ⚠️ NO threshold HEART RATE from this trial: it is a VO2-pace effort (p210). The lap HR is kept as a fact.
        out.run_vvo2_pace_sec_per_km = { value: vvo2PaceSecPerKm, confidence: 'high', source: 'Run time trial (p210)', sample_count: 1, as_of: asOf, lap_avg_hr: ttHr, lap_seconds: t, lap_meters: d };
        out.run_threshold_pace_sec_per_km = {
          value: paceSecPerKm,
          confidence: 'high',
          source: 'Run time trial — 88% of vVO2 speed (Viada p210)',
          sample_count: 1,
          // `as_of` is the field every reader uses (Q-173); `tested_at` kept because rows already carry it.
          as_of: asOf,
          tested_at: now.toISOString(),
          is_estimate: false,
        };
      } else if (!slowerThanEasy) {
        console.warn(`[assessment] run pace ${paceSecPerKm} outside 180–600 range — skipped`);
      }
    } else {
      console.warn(`[assessment] run_test: no ~720s lap found in ${laps.length} laps`);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

const isTrialThreshold = (m: unknown): boolean => {
  const x = m as { value?: unknown; source?: unknown } | null;
  return !!x && Number(x.value) > 0 && /time trial/.test(String(x.source ?? ''));
};
const stampOf = (m: unknown): string => {
  const x = m as { tested_at?: unknown; as_of?: unknown } | null;
  return String(x?.tested_at ?? x?.as_of ?? '');
};

/**
 * ⛔ THE READ-MODIFY-WRITE WINDOW, CLOSED (2026-09-16, Stage 7 session 1). The learner read `learned_fitness`, spent
 * seconds on goals and identity, then wrote the whole object back — so a strength save (compute-facts), an accept
 * (save-baselines) or a test result (another learner run) landing in between was lost. The row is re-read
 * immediately before the write and every key this run does not own is taken from that fresh read:
 *   · `strength_1rms` — compute-facts';
 *   · `ride_ftp_accepted` / `run_threshold_pace_accepted` — the athlete's answer, when one is on the row;
 *   · a time-trial threshold (with its vVO2) or a tested CSS on the fresh row that is newer than this run's.
 */
export function carryThroughFresh(
  merged: Record<string, unknown>,
  fresh: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...merged };
  const f = fresh ?? {};
  out.strength_1rms = f.strength_1rms;
  for (const k of ['ride_ftp_accepted', 'run_threshold_pace_accepted']) {
    if (Number((f[k] as { value?: unknown } | undefined)?.value) > 0) out[k] = f[k];
  }
  if (isTrialThreshold(f.run_threshold_pace_sec_per_km)) {
    const ours = out.run_threshold_pace_sec_per_km;
    if (!isTrialThreshold(ours) || stampOf(f.run_threshold_pace_sec_per_km) > stampOf(ours)) {
      out.run_threshold_pace_sec_per_km = f.run_threshold_pace_sec_per_km;
      if (f.run_vvo2_pace_sec_per_km) out.run_vvo2_pace_sec_per_km = f.run_vvo2_pace_sec_per_km;
    }
  }
  if (isTestedSwimCss(f.swim_css_sec_per_100m)) {
    const ours = out.swim_css_sec_per_100m;
    if (!isTestedSwimCss(ours) || stampOf(f.swim_css_sec_per_100m) > stampOf(ours)) {
      out.swim_css_sec_per_100m = f.swim_css_sec_per_100m;
    }
  }
  return out;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const payload = await req.json();
    // B1: identity comes from the verified JWT; the service key (internal fan-out / scripts) may name a user in the body. Body user_id is otherwise ignored.
    let user_id: string;
    try {
      ({ userId: user_id } = await requireUserOrService(req, payload?.user_id));
    } catch (e) {
      if (e instanceof AuthError) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw e;
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`🏃 Learning fitness profile for user ${user_id}`);

    // Calculate date range (last 90 days)
    const today = new Date();
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);
    const ninetyDaysAgoISO = ninetyDaysAgo.toLocaleDateString('en-CA');

    const eighteenMoAgo = new Date(today);
    eighteenMoAgo.setDate(today.getDate() - 550);
    const eighteenMoAgoISO = eighteenMoAgo.toLocaleDateString('en-CA');

    // ==========================================================================
    // FETCH WORKOUT DATA
    // ==========================================================================
    // Include swim/strength/walk for arc identity. Do not require HR here — the DB stores
    // `ride` (not "cycling"); also include aliases like cycling, bike, virtualride.
    // HR gating is applied inside analyzeRuns / analyzeRides.

    const { data: workouts, error: workoutsError } = await supabase
      .from('workouts')
      .select('id, type, date, duration, moving_time, distance, avg_heart_rate, max_heart_rate, avg_pace, avg_power, normalized_power, avg_speed, workout_status, computed, strava_data, name, rpe, workout_metadata')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .in('type', [...TYPES_90D_LEARN])
      .gte('date', ninetyDaysAgoISO)
      .order('date', { ascending: false });

    if (workoutsError) {
      console.error('❌ Error fetching workouts:', workoutsError);
      throw new Error(`Failed to fetch workouts: ${workoutsError.message}`);
    }

    const allWorkouts: WorkoutRecord[] = workouts || [];
    const withAvgHr = allWorkouts.filter(
      w => w.avg_heart_rate != null && w.avg_heart_rate > 60 && w.avg_heart_rate < 220
    );
    console.log(`📊 90d rows: ${allWorkouts.length} total, ${withAvgHr.length} with usable avg HR`);

    const runs = allWorkouts.filter((w) => isRunWorkoutType(workoutTypeFromRow(w)));
    const rides = allWorkouts.filter((w) => isRideWorkoutType(workoutTypeFromRow(w)));

    console.log(`🏃 Runs (normalized): ${runs.length}, 🚴 Rides (normalized): ${rides.length}`);

    // Q-051: swim pace comes from workout_facts (compute-facts already computed it correctly
    // per-session) — NOT recomputed from raw workouts.distance/moving_time, whose units (km/min
    // vs the expected m/s) made analyzeSwims filter out EVERY swim and publish null. Single-source
    // of truth (same principle as the spine): don't re-derive what's already computed right.
    const swimIds = allWorkouts
      .filter((w) => normType(workoutTypeFromRow(w)) === 'swim')
      .map((w) => String(w.id))
      .filter((id) => id && id !== 'undefined');
    const swimPaceById = new Map<string, number>();
    if (swimIds.length) {
      const { data: swimFacts, error: sfErr } = await supabase
        .from('workout_facts')
        .select('workout_id, swim_facts')
        .in('workout_id', swimIds);
      if (sfErr) console.warn('⚠️ swim workout_facts fetch failed (non-fatal):', sfErr.message);
      for (const r of (swimFacts || [])) {
        const sf = (r as any)?.swim_facts;
        // Fix: exclude equipment/drill-contaminated swims from the learned baseline, matching the State
        // trend's filter (compute-snapshot / useStateTrends gate on pace_equipment_contaminated). Was
        // inconsistent — the trend dropped fins/kick swims but this median kept them, so the baseline that
        // feeds plan-gen / coach / race-proj ran off a dirtier sample set than the State card.
        if (sf?.pace_equipment_contaminated === true) continue;
        const p = Number(sf?.pace_per_100m);
        if (Number.isFinite(p) && p > 0) swimPaceById.set(String((r as any).workout_id), p);
      }
    }

    // Last activity per normalized type (for dormant swim, etc.) — 18m lookback; uses `workouts.type`
    const { data: recencyRows, error: recencyErr } = await supabase
      .from('workouts')
      .select('type, date')
      .eq('user_id', user_id)
      .eq('workout_status', 'completed')
      .gte('date', eighteenMoAgoISO)
      .order('date', { ascending: false });

    if (recencyErr) {
      console.warn('⚠️ recency query failed (non-fatal):', recencyErr.message);
    }
    const recency: DisciplineRecency = {};
    for (const row of recencyRows || []) {
      const t = workoutTypeFromRow(row);
      const raw = t.toLowerCase().trim();
      if (raw === 'walk' || raw === 'hike') continue;
      const k = normType(t);
      if (k === 'other' || k === 'walk') continue;
      if (!recency[k] && row.date) {
        recency[k] = String(row.date).slice(0, 10);
      }
    }

    // ==========================================================================
    // ANALYZE RUNS
    // ==========================================================================

    // ⛔ THE THRESHOLD IS YOUR BEST SUSTAINED 20-MINUTE EFFORT, EVER ON FILE (Michael 2026-09-02, "we need
    // to figure it out" / "I'm not entering"). Not a 90-day refit, not a whole-run median: the one window
    // TrainingPeaks reads. Both numbers come off the same run. It only goes up. So the curves are read
    // across the athlete's whole history (18 months), and the prior learned values ride along for the
    // only-up comparison.
    const allRunCurves: WorkoutRecord[] = await (async () => {
      try {
        const { data } = await supabase
          .from('workouts')
          .select('id, type, date, computed, avg_heart_rate, workout_status')
          .eq('user_id', user_id)
          .eq('workout_status', 'completed')
          .in('type', ['run', 'running'])
          .gte('date', eighteenMoAgoISO);
        return (data ?? []) as WorkoutRecord[];
      } catch { return []; }
    })();
    const priorLearned = await (async () => {
      try {
        const { data } = await supabase.from('user_baselines').select('learned_fitness').eq('user_id', user_id).maybeSingle();
        const raw = data?.learned_fitness;
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return (obj && typeof obj === 'object') ? (obj as Record<string, any>) : null;
      } catch { return null; }
    })();

    // ⛔ A FIELD TEST JUST FINISHED (2026-09-16, Stage 7 session 1): compute-workout-analysis names the workout.
    // Its result joins the prior values, so the run analysis below keeps the trial as a test (a test beats an
    // inference) and the CSS merge below keeps the tested CSS. A newer test replaces an older one here.
    const assessmentWorkoutId = typeof payload?.assessment_workout_id === 'string' ? payload.assessment_workout_id : null;
    let tested: Record<string, unknown> | null = null;
    if (assessmentWorkoutId) {
      try {
        const { data: aw } = await supabase
          .from('workouts')
          .select('id, planned_id, laps')
          .eq('id', assessmentWorkoutId)
          .eq('user_id', user_id)
          .maybeSingle();
        if (aw?.planned_id) {
          const { data: ap } = await supabase.from('planned_workouts').select('tags').eq('id', String(aw.planned_id)).maybeSingle();
          const tags: string[] = Array.isArray(ap?.tags) ? ap.tags.map((t: unknown) => String(t)) : [];
          const laps = typeof aw.laps === 'string' ? (() => { try { return JSON.parse(aw.laps); } catch { return []; } })() : (aw.laps ?? []);
          tested = assessmentFromLaps(tags, Array.isArray(laps) ? laps : [], priorLearned);
        }
      } catch (e) {
        console.warn('[assessment] test read failed (non-fatal):', (e as Error)?.message ?? String(e));
      }
    }
    const priorForRuns = tested ? { ...(priorLearned ?? {}), ...tested } : priorLearned;
    const runProfile = analyzeRuns(runs, allRunCurves, priorForRuns);

    // ==========================================================================
    // ANALYZE RIDES
    // ==========================================================================

    // Every ride's power curve on file (18 months), for the compound FTP's hard ceiling — the best
    // 20 minutes actually pedalled. Only `computed.power_curve['20min']` is read from these rows.
    // ⛔ ONE NUMBER PER RIDE, NOT THE ANALYSIS BLOB (2026-09-04). The first cut selected `computed`
    // wholesale for 18 months of rides — megabytes per athlete — and the function died on
    // WORKER_RESOURCE_LIMIT the first time it ran in prod. Only the best 20-minute power is read here,
    // so only that is fetched; the shape `{ computed: { power_curve: { '20min' } } }` is rebuilt so
    // `analyzeRides` reads it the same way it reads a full row.
    const allRideCurves: WorkoutRecord[] = await (async () => {
      try {
        const { data } = await supabase
          .from('workouts')
          .select('id, type, date, p20:computed->power_curve->>20min')
          .eq('user_id', user_id)
          .eq('workout_status', 'completed')
          .in('type', ['ride', 'cycling', 'bike', 'virtualride', 'indoorcycling', 'gravelride', 'mountainbikeride'])
          .gte('date', eighteenMoAgoISO);
        return ((data ?? []) as Array<{ id: string; type: string; date: string; p20: string | null }>)
          .map((r) => ({ id: r.id, type: r.type, date: r.date, computed: { power_curve: { '20min': Number(r.p20) } } })) as unknown as WorkoutRecord[];
      } catch { return []; }
    })();
    const rideProfile = analyzeRides(rides, allRideCurves, priorLearned);
    const swimProfile = analyzeSwims(allWorkouts, swimPaceById);

    // D-199 CSS learner — fit a swim THRESHOLD from CLEAN continuous efforts (swimPaceById is already
    // contamination-filtered; confirmed-hard = RPE>=7). Guarded: ABSTAINS unless the data earns a tier
    // (>=2 distinct durations, monotonic curve, CSS faster than the median, plausible D', R² floor).
    // On aerobic-only / dirty data it publishes nothing. Staged off-precedence — the resolver gate
    // (SWIM_CSS_LIVE in planning-context) controls whether a published value ever drives plans.
    const swimEfforts = allWorkouts
      .filter((w) => normType(workoutTypeFromRow(w)) === 'swim')
      .map((w) => {
        const pace = swimPaceById.get(String((w as any).id));
        if (!Number.isFinite(pace as number) || (pace as number) <= 0) return null;
        const dRaw = Number((w as any).distance);
        const distM = dRaw < 1000 ? dRaw * 1000 : dRaw;
        if (!(distM >= 200)) return null;
        // D-199: honor the popup's clean signal — exclude ad-hoc drills/mixed swims and any planned swim
        // the athlete flagged as NOT swum-as-planned (deviation). Only continuous full-stroke feeds CSS.
        let meta: any = (w as any).workout_metadata;
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
        meta = meta || {};
        const kind = String(meta.swim_session_kind || '').toLowerCase();
        if (kind === 'drills' || kind === 'mixed') return null;     // ad-hoc non-straight → not a clean threshold read
        if (meta.swam_as_planned === false) return null;            // planned but deviated → exclude (one spelling, §8.0 #35)
        const rpe = Number((w as any).rpe);
        return { distanceM: Math.round(distM), timeS: Math.round((pace as number) * (distM / 100)), confirmedHard: Number.isFinite(rpe) && rpe >= 7, date: String((w as any).date || (w as any).timestamp || '') };
      })
      .filter(Boolean) as { distanceM: number; timeS: number; confirmedHard: boolean; date: string }[];
    const _swimMedianM = (swimProfile.swim_pace_per_100m as any)?.value ?? null;
    const _cssFit = fitSwimCss(swimEfforts, _swimMedianM);
    const swimCss = _cssFit.cssSecPer100m != null ? {
      value: _cssFit.cssSecPer100m, confidence: _cssFit.confidence, source: 'learner (best-effort CS fit)',
      n_efforts: _cssFit.nPoints, d_prime_m: _cssFit.dPrimeM, r2: _cssFit.r2, last_updated: new Date().toISOString(),
    } : null;
    console.log(`[CSS learner] ${_cssFit.confidence} - ${_cssFit.reason}${swimCss ? ` -> ${_cssFit.cssSecPer100m} s/100m` : ' (abstained, publishing nothing)'}`);

    // ==========================================================================
    // BUILD LEARNED PROFILE
    // ==========================================================================

    const runRideSessions = runs.length + rides.length;
    let learningStatus: 'insufficient_data' | 'learning' | 'confident' = 'insufficient_data';

    if (runRideSessions >= 15) {
      learningStatus = 'confident';
    } else if (runRideSessions >= 5) {
      learningStatus = 'learning';
    }

    const learnedProfile: LearnedFitnessProfile = {
      // Running
      run_easy_hr: runProfile.easy_hr,
      run_threshold_hr: runProfile.threshold_hr,
      run_race_hr: runProfile.race_hr,
      run_max_hr_observed: runProfile.max_hr_observed,
      run_easy_pace_sec_per_km: runProfile.easy_pace,
      run_threshold_pace_sec_per_km: runProfile.threshold_pace,
      
      // Cycling
      ride_easy_hr: rideProfile.easy_hr,
      ride_threshold_hr: rideProfile.threshold_hr,
      ride_max_hr_observed: rideProfile.max_hr_observed,
      ride_ftp_estimated: rideProfile.ftp_estimated,

      swim_pace_per_100m: swimProfile.swim_pace_per_100m,
      swim_css_sec_per_100m: swimCss,
      
      // Meta: count run+ride sessions in window (all included rows, not only those with HR)
      workouts_analyzed: runRideSessions,
      last_updated: new Date().toISOString(),
      learning_status: learningStatus
    };

    // ==========================================================================
    // STORE IN USER_BASELINES
    // ==========================================================================

    // First, fetch existing baselines (preserve strength_1rms from compute-facts)
    const { data: existingBaselines } = await supabase
      .from('user_baselines')
      .select('id, learned_fitness, athlete_identity, disciplines, training_background')
      .eq('user_id', user_id)
      .maybeSingle();

    const parseJsonb = (raw: unknown): Record<string, unknown> => {
      if (raw == null) return {};
      if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
      if (typeof raw === 'string') {
        try {
          const o = JSON.parse(raw);
          return typeof o === 'object' && o !== null && !Array.isArray(o) ? o : {};
        } catch {
          return {};
        }
      }
      return {};
    };
    const existing = parseJsonb(existingBaselines?.learned_fitness);
    const mergedLearned: Record<string, unknown> = {
      ...learnedProfile,
      strength_1rms: existing?.strength_1rms,
    };
    if (learnedProfile.swim_pace_per_100m == null && existing?.swim_pace_per_100m) {
      mergedLearned.swim_pace_per_100m = existing.swim_pace_per_100m;
    }
    // ⛔ A TESTED CSS BEATS THE FIT (2026-09-16, Stage 7 session 1) — the precedence the run analysis already gives
    // a time-trial threshold. Before, a publishing fit overwrote a CSS test. A test from this run wins; a stored
    // test stands; otherwise the fit, or the prior value when the fit abstains.
    if (tested?.swim_css_sec_per_100m) {
      mergedLearned.swim_css_sec_per_100m = tested.swim_css_sec_per_100m;
    } else if (isTestedSwimCss(existing?.swim_css_sec_per_100m)) {
      mergedLearned.swim_css_sec_per_100m = existing.swim_css_sec_per_100m;
    } else if ((learnedProfile as any).swim_css_sec_per_100m == null && (existing as any)?.swim_css_sec_per_100m) {
      (mergedLearned as any).swim_css_sec_per_100m = (existing as any).swim_css_sec_per_100m;
    }
    // ⛔ THE TRIAL'S vVO2 PACE IS CARRIED (2026-09-16). The object is rebuilt on every learn and this key was not in
    // it, so every learn after a time trial dropped it.
    const vvo2 = tested?.run_vvo2_pace_sec_per_km ?? existing?.run_vvo2_pace_sec_per_km;
    if (vvo2) mergedLearned.run_vvo2_pace_sec_per_km = vvo2;

    // Tier-cliff guard: block FTP overwrite ONLY when new confidence drops below prior.
    // A decline measured at equal-or-higher confidence still goes through. No-op on INSERT
    // (existing parses to {} → priorFtp undefined → condition short-circuits).
    const confRank = (c: unknown): number =>
      c === 'high' ? 2 : c === 'medium' ? 1 : c === 'low' ? 0 : -1;
    const priorFtp = existing?.ride_ftp_estimated as LearnedMetric | undefined;
    const newFtp = learnedProfile.ride_ftp_estimated;
    if (
      priorFtp && newFtp &&
      typeof priorFtp.value === 'number' && typeof newFtp.value === 'number' &&
      newFtp.value < priorFtp.value &&
      confRank(newFtp.confidence) < confRank(priorFtp.confidence)
    ) {
      mergedLearned.ride_ftp_estimated = priorFtp;
      console.log(`  FTP ratchet floor: kept prior ${priorFtp.value}W (${priorFtp.confidence}) over new ${newFtp.value}W (${newFtp.confidence})`);
    }

    // ⛔ THE LEARNER PROPOSES, THE ATHLETE ACCEPTS (2026-09-04, docs/SPEC-ftp-accept-2026-09-04.md).
    // `ride_ftp_accepted` is the athlete's answer, written by the checkpoint card or the Baselines row,
    // never by this learner — EXCEPT the one-time seed below. It is carried over verbatim on every
    // learn: `mergedLearned` is rebuilt from this run's profile, so without this line the first learn
    // after an accept would drop it and every zone would snap back to the live estimate.
    const acceptSeeds: Array<{ kind: 'ftp' | 'run_threshold'; value: number }> = [];
    const priorAccepted = existing?.ride_ftp_accepted as Record<string, unknown> | undefined;
    if (priorAccepted && Number(priorAccepted.value) > 0) {
      mergedLearned.ride_ftp_accepted = priorAccepted;
    } else {
      // THE SEED. An athlete with a confident estimate and no accepted value is running on the
      // estimate today (resolver tier 1 fallback). Seeding accepted = estimated changes nothing they
      // see — same watt number, same source — and turns the seam on: from here the estimate only
      // proposes. Through the app on its own next run, not a DB write. Low-confidence never seeds
      // (learned-low never proposes, and a low number must not become "the number they said yes to").
      const seedFrom = mergedLearned.ride_ftp_estimated as LearnedMetric | undefined;
      if (seedFrom && Number(seedFrom.value) > 0 && (seedFrom.confidence === 'medium' || seedFrom.confidence === 'high')) {
        // ⛔ Through save-baselines' accept after this learn is written (Stage 7 session 1) — the one writer of it.
        acceptSeeds.push({ kind: 'ftp', value: Number(seedFrom.value) });
      }
    }
    // ⛔ RUN THRESHOLD PACE: PROPOSED, THEN ACCEPTED — the FTP pattern applied to the run (2026-09-05). Keep the
    // accepted value; seed it from the first trusted learned value; never overwrite it here. The accept lives on
    // Adjust, the post-run popup and the six-week checkpoint (`acceptLearnedRunThreshold`).
    const priorThrAccepted = existing?.run_threshold_pace_accepted as Record<string, unknown> | undefined;
    if (priorThrAccepted && Number(priorThrAccepted.value) > 0) {
      mergedLearned.run_threshold_pace_accepted = priorThrAccepted;
    } else {
      const seedThr = mergedLearned.run_threshold_pace_sec_per_km as LearnedMetric | undefined;
      if (seedThr && Number(seedThr.value) > 0 && (seedThr.confidence === 'medium' || seedThr.confidence === 'high')) {
        acceptSeeds.push({ kind: 'run_threshold', value: Number(seedThr.value) });
      }
    }

    const existingIdentity = parseJsonb((existingBaselines as any)?.athlete_identity);
    const userConfirmed = existingIdentity?.confirmed_by_user === true;

    let identityUpdate: Record<string, unknown> = {};
    if (!userConfirmed) {
      try {
        const { data: goalRowsForPhase, error: goalsPhaseErr } = await supabase
          .from('goals')
          .select('target_date, sport, distance')
          .eq('user_id', user_id)
          .eq('status', 'active')
          .eq('goal_type', 'event')
          .not('target_date', 'is', null);
        if (goalsPhaseErr) {
          console.warn('⚠️ goals for phase inference (non-fatal):', goalsPhaseErr.message);
        }
        const goalsForPhase = (goalRowsForPhase ?? []).map(
          (r: { target_date: string; sport: string | null; distance: string | null }) => ({
            target_date: String(r.target_date).slice(0, 10),
            sport: r.sport ?? null,
            distance: r.distance ?? null,
          })
        );
        const idv1 = inferAthleteIdentityV1(allWorkouts as any, learningStatus, recency, goalsForPhase);
        const disciplines = inferDisciplinesTextArray(idv1.discipline_mix);
        const training_background = inferTrainingBackgroundSentence(idv1);
        identityUpdate = {
          disciplines,
          training_background,
          athlete_identity: { ...existingIdentity, ...idv1, confirmed_by_user: false },
        };
      } catch (e) {
        console.warn('⚠️ inferAthleteIdentityV1 failed (non-fatal):', e);
      }
    }

    let baselinesWriteOk = false;
    if (existingBaselines?.id) {
      // Re-read immediately before the write; see `carryThroughFresh`.
      const { data: freshRow } = await supabase.from('user_baselines').select('learned_fitness').eq('id', existingBaselines.id).maybeSingle();
      const toWrite = carryThroughFresh(mergedLearned, parseJsonb(freshRow?.learned_fitness));
      // ⛔ The learned keys below are this step's (2026-09-16, Stage 7 session 1); strength_1rms and the two accepted keys ride through.
      const { error: updateError } = await supabase
        .from('user_baselines')
        .update({
          /* writes-keys: run_easy_hr, run_threshold_hr, run_race_hr, run_max_hr_observed, run_easy_pace_sec_per_km, run_threshold_pace_sec_per_km, run_vvo2_pace_sec_per_km, ride_easy_hr, ride_threshold_hr, ride_max_hr_observed, ride_ftp_estimated, swim_pace_per_100m, swim_css_sec_per_100m, workouts_analyzed, last_updated, learning_status */
          learned_fitness: toWrite,
          ...identityUpdate,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingBaselines.id);

      if (updateError) {
        console.error('❌ Error updating baselines:', updateError);
      } else {
        baselinesWriteOk = true;
        console.log('✅ Updated learned_fitness in user_baselines');
      }
    } else {
      // Insert new record
      const baseInsert: Record<string, unknown> = {
        user_id: user_id,
        /* writes-keys: run_easy_hr, run_threshold_hr, run_race_hr, run_max_hr_observed, run_easy_pace_sec_per_km, run_threshold_pace_sec_per_km, run_vvo2_pace_sec_per_km, ride_easy_hr, ride_threshold_hr, ride_max_hr_observed, ride_ftp_estimated, swim_pace_per_100m, swim_css_sec_per_100m, workouts_analyzed, last_updated, learning_status */
        learned_fitness: mergedLearned,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...identityUpdate,
      };
      const { error: insertError } = await supabase
        .from('user_baselines')
        .insert(baseInsert);

      if (insertError) {
        console.error('❌ Error inserting baselines:', insertError);
      } else {
        baselinesWriteOk = true;
        console.log('✅ Created new user_baselines with learned_fitness');
      }
    }

    console.log(`✅ Fitness profile learned: status=${learningStatus}, workouts=${runRideSessions}`);

    if (baselinesWriteOk) {
      recomputeRaceProjectionsForUser(supabase, user_id).catch((e) =>
        console.warn('[learn-fitness-profile] recompute goal projection', e)
      );
    }

    for (const seed of baselinesWriteOk ? acceptSeeds : []) {
      try {
        const { data: seeded, error: seedErr } = await supabase.functions.invoke('save-baselines', {
          body: { user_id, accept: { kind: seed.kind, value: seed.value, via: 'seed' } },
        });
        if (seedErr) console.warn(`[seed] ${seed.kind} accepted value not seeded:`, seedErr.message ?? String(seedErr));
        else console.log(`  ${seed.kind} accepted seeded from the learned value ${seed.value}`, seeded?.seeded === false ? '(already answered)' : '');
      } catch (e) {
        console.warn(`[seed] ${seed.kind} accepted value not seeded:`, (e as Error)?.message ?? String(e));
      }
    }

    // ⛔ A TESTED CSS STILL SETS THE PLAN'S SWIM PACE (2026-09-16, Stage 7 session 1) — through save-baselines, the
    // one writer of `performance_numbers`. It reads the tested CSS just written and converts it there.
    if (baselinesWriteOk && tested?.swim_css_sec_per_100m) {
      try {
        const { error: swimErr } = await supabase.functions.invoke('save-baselines', {
          body: { user_id, accept: { kind: 'swim_css_test' } },
        });
        if (swimErr) console.warn('[assessment] swim pace not set from the CSS test:', swimErr.message ?? String(swimErr));
      } catch (e) {
        console.warn('[assessment] swim pace not set from the CSS test:', (e as Error)?.message ?? String(e));
      }
    }

    return new Response(JSON.stringify(learnedProfile), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Learn fitness profile error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// =============================================================================
// RUN ANALYSIS
// =============================================================================

interface RunAnalysisResult {
  easy_hr: LearnedMetric | null;
  threshold_hr: LearnedMetric | null;
  race_hr: LearnedMetric | null;
  max_hr_observed: LearnedMetric | null;
  easy_pace: LearnedMetric | null;
  threshold_pace: LearnedMetric | null;
}

export function analyzeRuns(runs: WorkoutRecord[], allRunCurves: WorkoutRecord[] = [], priorLearned: Record<string, any> | null = null): RunAnalysisResult {
  if (runs.length < 3) {
    // ⛔ A TEST BEATS AN INFERENCE, EVEN WITH TOO FEW RUNS TO INFER (2026-09-16, Stage 7 session 1): the trial's
    // threshold pace is the same one the full read below keeps (p210). Without this an athlete whose first runs
    // include the trial lost it on the learn that recorded it.
    const priorPace = priorLearned?.run_threshold_pace_sec_per_km;
    const trialPace = priorPace && /time trial/.test(String(priorPace.source ?? '')) && Number(priorPace.value) > 0 ? priorPace as LearnedMetric : null;
    return {
      easy_hr: null,
      threshold_hr: null,
      race_hr: null,
      max_hr_observed: null,
      easy_pace: null,
      threshold_pace: trialPace
    };
  }

  // ==========================================================================
  // STEP 1: Find observed max HR (this is reliable)
  // ==========================================================================
  const allMaxHRs = runs
    .filter(r => r.max_heart_rate && r.max_heart_rate > 100 && r.max_heart_rate < 220)
    .map(r => r.max_heart_rate);
  
  const observedMaxHR = allMaxHRs.length > 0 ? Math.max(...allMaxHRs) : null;
  
  const max_hr_observed: LearnedMetric | null = observedMaxHR ? {
    value: observedMaxHR,
    confidence: allMaxHRs.length >= 5 ? 'high' : 'medium',
    source: 'max observed across all runs',
    sample_count: allMaxHRs.length
  } : null;

  console.log(`  📊 Observed max HR: ${observedMaxHR} from ${allMaxHRs.length} runs`);

  // ==========================================================================
  // STEP 2: Find threshold HR using HR-based detection (not pace)
  // Threshold is 85-92% of max HR in sustained efforts
  // ==========================================================================
  
  // Filter for sustained efforts (20-60 min) with valid HR
  const sustainedEfforts = runs.filter(r => {
    const duration = r.moving_time || r.duration || 0;
    const hr = r.avg_heart_rate || 0;
    return duration >= 20 && duration <= 60 && hr > 100 && hr < 220;
  });

  console.log(`  📊 Sustained efforts (20-60 min): ${sustainedEfforts.length}`);

  let threshold_hr: LearnedMetric | null = null;
  let thresholdHRValue: number | null = null;

  if (observedMaxHR && sustainedEfforts.length >= 2) {
    // Look for efforts in the threshold HR range (85-92% of max)
    const thresholdLow = observedMaxHR * 0.85;
    const thresholdHigh = observedMaxHR * 0.92;
    
    const thresholdCandidates = sustainedEfforts.filter(r => 
      r.avg_heart_rate >= thresholdLow && r.avg_heart_rate <= thresholdHigh
    );

    console.log(`  📊 Threshold candidates (${Math.round(thresholdLow)}-${Math.round(thresholdHigh)} bpm): ${thresholdCandidates.length}`);

    if (thresholdCandidates.length >= 2) {
      // Take median of threshold efforts
      const sortedHRs = thresholdCandidates.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      thresholdHRValue = sortedHRs[Math.floor(sortedHRs.length / 2)];
      
      threshold_hr = {
        value: Math.round(thresholdHRValue),
        confidence: thresholdCandidates.length >= 5 ? 'high' : 'medium',
        source: `median of ${thresholdCandidates.length} threshold efforts (85-92% max)`,
        sample_count: thresholdCandidates.length,
        as_of: newestDate(thresholdCandidates)
      };
    } else {
      // Fallback: Take 95th percentile of all sustained efforts
      const sortedAllHRs = sustainedEfforts.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      if (sortedAllHRs.length >= 3) {
        const idx = Math.floor(sortedAllHRs.length * 0.95);
        thresholdHRValue = sortedAllHRs[Math.min(idx, sortedAllHRs.length - 1)];
        
        threshold_hr = {
          value: Math.round(thresholdHRValue),
          confidence: 'low',
          source: '95th percentile of sustained efforts (no clear threshold data)',
          // The count is of the efforts a percentile was taken OF — not of threshold detections.
          sample_count: sortedAllHRs.length,
          is_estimate: true,
        };
      } else {
        // Last resort: 88% of max HR
        thresholdHRValue = Math.round(observedMaxHR * 0.88);
        
        threshold_hr = {
          value: thresholdHRValue,
          confidence: 'low',
          source: '88% of observed max (estimated)',
          sample_count: 0,
          is_estimate: true,
        };
      }
    }
  }

  console.log(`  📊 Threshold HR determined: ${thresholdHRValue} bpm`);

  // ==========================================================================
  // STEP 3: Find easy HR (bottom 25% of sustained efforts, or efforts < 75% max)
  // ==========================================================================
  
  let easy_hr: LearnedMetric | null = null;

  // Q-169: the RUN easy band is threshold-anchored (Friel Z2), NOT a 75%-of-max ceiling. The old gate
  // (observedMaxHR * 0.75) excluded 100% of a real athlete's easy runs — running HR sits 5-10 bpm above
  // cycling at the same effort, so the %max band that works for the bike locks the run out. One shared
  // definition now: `_shared/easy-hr.ts`. (The BIKE band below is untouched — it works.)
  // Built from what THIS pass just learned (both are in scope: `threshold_hr` at :549-591,
  // `observedMaxHR` at :524) — so the band upgrades to the threshold anchor the moment a hard effort
  // is logged, and bootstraps off %max until then. Same shared definition every other surface uses.
  const runEasyBand = resolveRunEasyHrBand({
    run_threshold_hr: threshold_hr,
    run_max_hr_observed: observedMaxHR != null ? { value: observedMaxHR, confidence: 'high' } : null,
  });
  if (runEasyBand.ceiling != null) {
    const easyEfforts = runs.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      return duration >= 20 && isEasyHr(hr, runEasyBand) === true;
    });

    if (easyEfforts.length >= 3) {
      const sortedEasyHRs = easyEfforts.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      const medianEasyHR = sortedEasyHRs[Math.floor(sortedEasyHRs.length / 2)];

      easy_hr = {
        value: Math.round(medianEasyHR),
        confidence: easyEfforts.length >= 5 ? 'high' : 'medium',
        // The receipt names the ACTUAL band that was applied (Law 3), not a hardcoded "<75% max" that
        // stopped being true.
        source: `median of ${easyEfforts.length} easy runs (${runEasyBand.basis})`,
        sample_count: easyEfforts.length,
        as_of: newestDate(easyEfforts),   // Q-173: how old is the newest run behind this number?
      };
    } else {
      // Q-169 / LAW 2 — THE FABRICATION IS DELETED.
      // This used to invent `70% of observed max (estimated)`, sample_count: 0, and ship it as a
      // confident-looking number. On real data it produced `run_easy_hr = 122 bpm` for an athlete who
      // actually runs easy at ~135 — a value measured from NOTHING. Worse, it fired precisely BECAUSE
      // the (broken) gate above found no easy runs: the app failed to observe, then filled the hole it
      // had just dug with a guess, and labelled the result "confident".
      //
      // We do not know it yet. Say so. `null` is honest; it re-learns the moment 3 easy runs land.
      easy_hr = null;
    }
  }

  // ==========================================================================
  // STEP 4: Find race HR (efforts > 92% of max, typically short hard efforts)
  // ==========================================================================
  
  let race_hr: LearnedMetric | null = null;

  if (observedMaxHR) {
    const raceHRFloor = observedMaxHR * 0.92;
    const raceEfforts = runs.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      // Race efforts: shorter duration (10-45 min), high HR
      return duration >= 10 && duration <= 45 && hr >= raceHRFloor;
    });

    if (raceEfforts.length >= 2) {
      const sortedRaceHRs = raceEfforts.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      const medianRaceHR = sortedRaceHRs[Math.floor(sortedRaceHRs.length / 2)];
      
      race_hr = {
        value: Math.round(medianRaceHR),
        confidence: raceEfforts.length >= 3 ? 'high' : 'medium',
        source: `median of ${raceEfforts.length} race/hard efforts (>92% max)`,
        sample_count: raceEfforts.length
      };
    }
  }

  // ==========================================================================
  // STEP 5: Find threshold PACE (pace at which threshold HR occurs)
  // This is the correct way - HR determines effort, pace follows
  // ==========================================================================
  
  let threshold_pace: LearnedMetric | null = null;
  let easy_pace: LearnedMetric | null = null;

  // ⛔⛔ EASY PACE IS LEARNED FIRST NOW, AND THRESHOLD IS MEASURED AGAINST IT (2026-08-19).
  // The order is load-bearing — see the block below `easy_pace` for why. Threshold pace follows.

  // Find easy pace (pace when HR is in easy zone)
  // Q-169: THE STARVATION. This gate (`hr <= observedMaxHR * 0.75` = 130.5 bpm for a 174 max) excluded
  // 0-of-77 of a real athlete's runs — his genuine easy runs (RPE 2-3) sit at 133-141 bpm. It needs 3
  // to learn. It could never get 3. So `run_easy_pace_sec_per_km` stayed null forever, which starved
  // the D-033 pace reconciler (`generate-combined-plan/science.ts:110`) — the machine that notices an
  // athlete has detrained — so the app kept prescribing against a pace he had not run in 77 recorded
  // runs. Now threshold-anchored via the ONE shared band. NOTE: it no longer requires `easy_hr` to
  // have been learned first (that coupled two starvations together).
  if (runEasyBand.ceiling != null) {
    const easyPaceRuns = runs.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      const pace = r.avg_pace || 0;
      // ⛔ THE TALK TEST IS THE DEFINITION OF EASY (Viada p235); the heart-rate band is its proxy. A run
      // the athlete rated 3 or under ("conversational — full sentences", the popup's own anchor) is easy
      // even when heat pushed the heart rate above the band (Michael, 2026-09-02: "but they are chatting").
      const rpe = Number((r as any).rpe ?? (r as any).workout_metadata?.session_rpe);
      const talkTestEasy = Number.isFinite(rpe) && rpe > 0 && rpe <= 3;
      return duration >= 20 &&
             pace > 150 && pace < 900 &&
             (talkTestEasy || isEasyHr(hr, runEasyBand) === true);
    });

    if (easyPaceRuns.length >= 3) {
      // ⛔ THE FIVE MOST RECENT, not every easy run in the window (2026-09-05). This is the number the
      // Adjust row shows as "from runs" and the easy steps print as the reference pace, and it has to be
      // the same "last five easy runs" the State row reads. `runs` arrives newest first. Heat and hills
      // move it by design — the row says so — and a 90-day median would hide a whole summer.
      const recentEasy = easyPaceRuns.slice(0, 5);
      const sortedPaces = recentEasy.map(r => r.avg_pace).sort((a, b) => a - b);
      const mid = sortedPaces.length / 2;
      const medianPace = sortedPaces.length % 2 ? sortedPaces[(sortedPaces.length - 1) / 2] : (sortedPaces[mid - 1] + sortedPaces[mid]) / 2;
      easy_pace = {
        value: Math.round(medianPace),
        confidence: recentEasy.length >= 5 ? 'high' : 'medium',
        source: `median of the last ${recentEasy.length} easy runs (${runEasyBand.basis})`,
        sample_count: recentEasy.length,
        as_of: newestDate(recentEasy),  // Q-173: heat can silence this learner for a whole summer
      };
    }
  }

  // ⛔ THRESHOLD HEART RATE IS READ OFF THE HIGHEST-HEART-RATE WINDOWS, NOT THE FASTEST ONE (2026-09-13).
  // The retired best-45-minute pace block used to write threshold_hr = the heart rate during the FASTEST 20 minutes. On an easy-but-quick
  // stretch that is far below threshold (Michael: 152 bpm from 2026-04-02 against a Garmin-measured 172, which set every
  // easy-day heart-rate range 17 bpm low). TrainingPeaks: "your best 60-minute average heart rate, or 95% of your best
  // 20-minute average heart rate, whichever is higher" (trainingpeaks.com/blog/are-you-using-threshold-improvement-notifications);
  // Intervals.icu reads the same windows (forum.intervals.icu/t/threshold-heart-rate-achievements/1459).
  // A time-trial threshold heart rate still stands over this (a test beats an inference, p210). Only up: a prior value
  // written by this rule stays while it is higher. No heart-rate curves on file → the earlier steps' answer stands.
  {
    const priorHr = priorLearned?.run_threshold_hr;
    const trialStands = priorHr && /time trial/.test(String(priorHr.source ?? '')) && Number(priorHr.value) > 0;
    const fromCurves = thresholdHrFromHrCurves(allRunCurves.map((r) => ({
      date: String(r.date ?? ''),
      hrCurve: (r.computed as { hr_curve?: RunHrCurve } | null)?.hr_curve,
    })));
    const priorFromCurves = priorHr && /heart-rate window|heart rate window/.test(String(priorHr.source ?? '')) && Number(priorHr.value) > 0;
    if (trialStands) {
      threshold_hr = priorHr as LearnedMetric;
      thresholdHRValue = Number(priorHr.value);
    } else if (fromCurves && priorFromCurves && Number(priorHr.value) >= fromCurves.value) {
      threshold_hr = priorHr as LearnedMetric;               // only up
      thresholdHRValue = Number(priorHr.value);
    } else if (fromCurves) {
      const label = fromCurves.basis === '60'
        ? `best 60-minute heart-rate window on ${fromCurves.date} (${fromCurves.windowAvgHr} bpm)`
        : `95% of the best 20-minute heart-rate window on ${fromCurves.date} (${fromCurves.windowAvgHr} bpm)`;
      threshold_hr = { value: fromCurves.value, confidence: 'high', source: label, sample_count: 1, as_of: fromCurves.date };
      thresholdHRValue = fromCurves.value;
      console.log(`  📊 Threshold HR: ${fromCurves.value} bpm — ${label}`);
    }
  }

  // ==========================================================================
  // THRESHOLD PACE — A SUGGESTION FROM BEST EFFORTS (2026-09-14, Michael)
  //
  // Critical speed from the fastest 400 m – 5 km efforts of the last 16 weeks, plus the best 45 minutes when that
  // window was hard (Smyth & Muniz-Pumares 2020; `src/lib/run-critical-speed.ts`). It writes the MEASURED threshold
  // only: the athlete accepts it (Adjust, the post-run popup, the six-week checkpoint) before anything re-prices.
  // It replaces three earlier readers — the median of runs near threshold heart rate, the duration-bucket fit,
  // and the best-45-minute override with its "only faster" rule.
  // ⛔ A TEST BEATS AN INFERENCE (p210): a threshold written by the 12-minute time trial stands until a newer trial
  // or the athlete's own number replaces it.
  // ⚠️ It runs after threshold heart rate, which the 45-minute point is checked against.
  // ==========================================================================
  {
    const priorPace = priorLearned?.run_threshold_pace_sec_per_km;
    const priorIsTrial = priorPace && /time trial/.test(String(priorPace.source ?? '')) && Number(priorPace.value) > 0;
    if (priorIsTrial) {
      threshold_pace = priorPace as LearnedMetric;
      console.log(`  📊 Threshold pace: the time trial stands (${priorPace.value}s/km, ${priorPace.as_of})`);
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const fit = fitRunThresholdFromBestEfforts(
        allRunCurves.map((r) => {
          const c = r.computed as { run_best_distances?: RunDistanceBests; pace_curve?: RunPaceCurve } | null;
          return { date: String(r.date ?? ''), distanceBests: c?.run_best_distances ?? null, paceCurve: c?.pace_curve ?? null };
        }),
        today,
        // Only a threshold heart rate that was read from runs or a test — never the percentile fill-in, which can sit
        // inside the easy band and would call an easy 45 minutes hard.
        threshold_hr != null && threshold_hr.is_estimate !== true ? (thresholdHRValue ?? null) : null,
        Number.isFinite(Number(easy_pace?.value)) ? Number(easy_pace!.value) : null,
      );
      console.log(`  📊 Threshold pace suggestion: ${fit.csSecPerKm ?? 'none'} — ${fit.reason}`);
      threshold_pace = fit.csSecPerKm != null
        ? {
          value: fit.csSecPerKm,
          confidence: fit.confidence === 'high' ? 'high' : 'medium',
          source: fit.reason,
          sample_count: fit.nPoints,
          as_of: fit.asOf ?? undefined,
        }
        : null;
    }
  }

  return {
    easy_hr,
    threshold_hr,
    race_hr,
    max_hr_observed,
    easy_pace,
    threshold_pace
  };
}

// =============================================================================
// RIDE ANALYSIS
// =============================================================================

interface RideAnalysisResult {
  easy_hr: LearnedMetric | null;
  threshold_hr: LearnedMetric | null;
  max_hr_observed: LearnedMetric | null;
  ftp_estimated: LearnedMetric | null;
}

export function analyzeRides(
  rides: WorkoutRecord[],
  /** every completed ride on file (18 months) — only `computed.power_curve` is read, for the ceiling */
  allRideCurves: WorkoutRecord[] = [],
  /** the previous `learned_fitness`, for the compound estimate's rate limit and threshold fallback */
  priorLearned: Record<string, any> | null = null,
): RideAnalysisResult {
  if (rides.length < 3) {
    return {
      easy_hr: null,
      threshold_hr: null,
      max_hr_observed: null,
      ftp_estimated: null,
    };
  }

  // ==========================================================================
  // STEP 1: Find observed max HR
  // ==========================================================================
  const allMaxHRs = rides
    .filter(r => r.max_heart_rate && r.max_heart_rate > 100 && r.max_heart_rate < 220)
    .map(r => r.max_heart_rate);
  
  const observedMaxHR = allMaxHRs.length > 0 ? Math.max(...allMaxHRs) : null;
  
  const max_hr_observed: LearnedMetric | null = observedMaxHR ? {
    value: observedMaxHR,
    confidence: allMaxHRs.length >= 5 ? 'high' : 'medium',
    source: 'max observed across all rides',
    sample_count: allMaxHRs.length
  } : null;

  console.log(`  📊 Ride max HR: ${observedMaxHR} from ${allMaxHRs.length} rides`);

  // ==========================================================================
  // STEP 2: Find threshold HR using POWER + HR detection
  // 
  // For cycling, HR alone is unreliable (heat, fatigue, caffeine inflate HR on casual rides)
  // True threshold = high power AND high HR simultaneously
  // Filter: Only consider rides with power > 75th percentile as threshold candidates
  // ==========================================================================
  
  // Duration is stored in minutes; allow up to 2h for outdoor rides (common endurance length).
  const sustainedEfforts = rides.filter((r) => {
    const duration = r.moving_time || r.duration || 0;
    const hr = r.avg_heart_rate || 0;
    return duration >= 20 && duration <= 120 && hr > 100 && hr < 220;
  });

  let threshold_hr: LearnedMetric | null = null;

  // Get power distribution to filter for hard efforts
  const allPowers = rides
    .filter(r => r.avg_power && r.avg_power > 50)
    .map(r => r.avg_power)
    .sort((a, b) => a - b);
  
  // 75th percentile power = hard effort threshold
  const p75Power = allPowers.length >= 4 
    ? allPowers[Math.floor(allPowers.length * 0.75)] 
    : null;
  
  console.log(`  📊 Ride power distribution: ${allPowers.length} rides, P75=${p75Power}W`);

  if (observedMaxHR && sustainedEfforts.length >= 2) {
    const thresholdLow = observedMaxHR * 0.85;
    const thresholdHigh = observedMaxHR * 0.95; // Widened to 95% for cycling (more variability)
    
    // Filter for HARD efforts: must have power data AND be above 75th percentile
    // This excludes casual rides where HR is elevated but power is low
    let thresholdCandidates = sustainedEfforts.filter(r => {
      const inHRRange = r.avg_heart_rate >= thresholdLow && r.avg_heart_rate <= thresholdHigh;
      
      // If we have power data, require high power
      if (p75Power && r.avg_power) {
        return inHRRange && r.avg_power >= p75Power * 0.85; // Power must be at least 85% of P75
      }
      
      // No power data available - fall back to HR only (less reliable)
      return inHRRange;
    });

    console.log(`  📊 Threshold candidates (power-filtered): ${thresholdCandidates.length}`);

    /**
     * ⛔ THE HEART RATE DURING THE BEST 20-MINUTE POWER EFFORT (2026-08-20). Tried FIRST, because the
     * filter above cannot work for most riders and the fallback beneath it is a formula.
     *
     * ⛔ WHY THE FILTER FAILS. It requires a WHOLE RIDE to average 85-95% of max heart rate. Real
     * rides do not: you coast, you descend, you stop at lights. On a real account — 20 rides, high
     * confidence on max HR — it found ZERO candidates and published `90% of observed max (estimated)`,
     * sample_count 0, which every consumer then treated as this athlete's cycling threshold. It is the
     * same defect the RUN threshold pace had, one sport over: judging a sustained effort by an average
     * over an activity that was not sustained.
     *
     * ⛔ AND THE EFFORT WAS ALREADY IDENTIFIED. `power_curve['20min']` is the best 20 minutes of
     * pedalling in the ride, and the FTP tier below already trusts it enough to derive FTP from it at
     * 95%. If it is a threshold effort for power it is a threshold effort for heart rate. The only
     * thing missing was the heart rate during it — now carried as `power_curve._hr`
     * (`compute-workout-analysis:calculatePowerCurve`).
     *
     * ⚠️ THE BEST EFFORT, NOT THE MEDIAN. FTP takes `Math.max` of the 20-minute bests; this takes the
     * heart rate from THAT SAME ride, so the two anchors describe one effort instead of two.
     *
     * ⚠️ NO BACKFILL. `_hr` is written at analysis time, so it lands on rides from here forward.
     * Until two carry it, the tiers below still answer.
     */
    const twentyMinEfforts = rides
      .map((r) => ({
        power: Number(r.computed?.power_curve?.['20min']) || 0,
        hr: Number(r.computed?.power_curve?._hr?.['20min']) || 0,
      }))
      .filter((e) => e.power > 50 && e.hr > 0
        // Plausibility, not judgement: a threshold heart rate sits below max and well above resting.
        && e.hr < observedMaxHR && e.hr > observedMaxHR * 0.6)
      .sort((a, b) => b.power - a.power);

    if (twentyMinEfforts.length >= 1) {
      const best = twentyMinEfforts[0];
      threshold_hr = {
        value: Math.round(best.hr),
        confidence: twentyMinEfforts.length >= 3 ? 'high' : (twentyMinEfforts.length >= 2 ? 'medium' : 'low'),
        source: `HR during best 20-min power effort (${best.power}W, ${twentyMinEfforts.length} efforts on file)`,
        sample_count: twentyMinEfforts.length,
      };
      console.log(`  💓 Threshold HR from the 20-min power window: ${threshold_hr.value} bpm at ${best.power}W`);
    } else if (thresholdCandidates.length >= 2) {
      // Take the HIGHER end of the HR range (true threshold, not tempo)
      const sortedHRs = thresholdCandidates.map(r => r.avg_heart_rate).sort((a, b) => b - a); // Descending
      // Take 25th percentile from top (not median - we want hard efforts, not average)
      const thresholdHRValue = sortedHRs[Math.floor(sortedHRs.length * 0.25)];
      
      threshold_hr = {
        value: Math.round(thresholdHRValue),
        confidence: thresholdCandidates.length >= 4 ? 'high' : 'medium',
        source: `from ${thresholdCandidates.length} hard rides (power-filtered, 85-95% max HR)`,
        sample_count: thresholdCandidates.length
      };
      console.log(`  💓 Threshold HR: ${thresholdHRValue} bpm`);
    } else if (thresholdCandidates.length === 1) {
      // Single hard effort - use it, it's better than a generic estimate
      const singleEffortHR = thresholdCandidates[0].avg_heart_rate;
      threshold_hr = {
        value: Math.round(singleEffortHR),
        confidence: 'low',
        source: 'from 1 hard ride (need more data)',
        sample_count: 1
      };
      console.log(`  💓 Threshold HR from single effort: ${singleEffortHR} bpm`);
    } else {
      // No hard efforts found - use 90% of max (higher estimate for cycling)
      // Cyclists tend to have higher threshold % than runners
      threshold_hr = {
        value: Math.round(observedMaxHR * 0.90),
        confidence: 'low',
        source: '90% of observed max (estimated - no hard rides found)',
        sample_count: 0,
        is_estimate: true,
      };
      console.log(`  💓 Threshold HR fallback: ${Math.round(observedMaxHR * 0.90)} bpm (90% of max)`);
    }
  }

  // ==========================================================================
  // STEP 3: Find easy HR (65-75% of max, with power filter)
  // 
  // Easy zone should be intentional training, not commutes or errands
  // Filter: Require meaningful power to exclude casual pedaling
  // ==========================================================================
  
  let easy_hr: LearnedMetric | null = null;

  if (observedMaxHR) {
    // Easy zone: 65-75% of max HR (not just <75%)
    // Below 65% is recovery/commute territory
    const easyHRFloor = observedMaxHR * 0.65;
    const easyHRCeiling = observedMaxHR * 0.75;
    
    // P50 power = moderate effort baseline (filter out casual rides)
    const p50Power = allPowers.length >= 4 
      ? allPowers[Math.floor(allPowers.length * 0.50)] 
      : null;
    
    const easyEfforts = rides.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      const inHRRange = hr >= easyHRFloor && hr <= easyHRCeiling;
      
      // If power data available, require at least 50% of P50 (not just pedaling)
      if (p50Power && r.avg_power) {
        return duration >= 30 && inHRRange && r.avg_power >= p50Power * 0.50;
      }
      
      return duration >= 30 && inHRRange;
    });

    console.log(`  📊 Easy effort candidates (65-75% max, power-filtered): ${easyEfforts.length}`);

    if (easyEfforts.length >= 3) {
      const sortedEasyHRs = easyEfforts.map(r => r.avg_heart_rate).sort((a, b) => a - b);
      const medianEasyHR = sortedEasyHRs[Math.floor(sortedEasyHRs.length / 2)];
      
      easy_hr = {
        value: Math.round(medianEasyHR),
        confidence: easyEfforts.length >= 5 ? 'high' : 'medium',
        source: `median of ${easyEfforts.length} easy rides (65-75% max, power-filtered)`,
        sample_count: easyEfforts.length
      };
    } else if (easyEfforts.length >= 1) {
      // Use what we have
      const avgEasyHR = easyEfforts.reduce((sum, r) => sum + r.avg_heart_rate, 0) / easyEfforts.length;
      easy_hr = {
        value: Math.round(avgEasyHR),
        confidence: 'low',
        source: `from ${easyEfforts.length} easy rides (need more data)`,
        sample_count: easyEfforts.length
      };
    } else {
      // No easy training rides found - use 70% of max as estimate
      easy_hr = {
        value: Math.round(observedMaxHR * 0.70),
        confidence: 'low',
        source: '70% of observed max (estimated - no easy training rides found)',
        sample_count: 0,
        is_estimate: true,
      };
    }
  }

  // ==========================================================================
  // STEP 4: THE THIN-DATA FALLBACK for FTP — 95% of the single best 20-minute effort
  //
  // ⛔ NOT THE ESTIMATOR ANY MORE (2026-09-04). STEP 5 below is the one FTP method; this tier only
  // supplies a value when STEP 5 abstains (too few rides with heart rate AND power, too few curve
  // durations — the first weeks of a new athlete). One method, one fallback for thin data, the way
  // TrainerRoad's detection hands back to a test result until it has enough rides.
  // 
  // FTP estimation hierarchy:
  // 1. Pre-calculated 20-min best power × 0.95 (most accurate)
  // 2. Best NP from HARD efforts (HR > 80% max OR power > P75) × 0.95
  // 3. Best avg power from hard efforts × 1.05 × 0.95
  // 
  // KEY: Filter for hard efforts to exclude casual rides!
  // ==========================================================================
  
  const ridesWithPower = rides.filter(r =>
    Number(r.avg_power) > 50 || Number(r.normalized_power) > 50
  );
  let ftp_estimated: LearnedMetric | null = null;

  if (ridesWithPower.length >= 3) {
    const sustainedPowerRides = ridesWithPower.filter((r) => {
      const duration = r.moving_time || r.duration || 0;
      return duration >= 20 && duration <= 120;
    });

    // Priority 1: Look for pre-calculated 20-min best power (already represents hard effort).
    //
    // Reads `computed.power_curve['20min']`, written by `compute-workout-analysis` at the
    // partialComputed merge (~line 1900) via `calculatePowerCurve()` (rolling max-mean over
    // valid power samples; see `compute-workout-analysis/index.ts:86-120`).
    //
    // Zero-stripping semantic: `power_curve['20min']` is the best 20 minutes of pedaling
    // samples with zeros excluded — slightly optimistic vs a continuous 20-min test effort
    // but correct for hilly outdoor rides where coasting samples would otherwise drag the
    // window down. Athletes doing a flat indoor 20-min test get an honest reading; outdoor
    // riders don't get penalized for descents.
    //
    // Prior code path read three fields (`computed.analysis.bests.power_20min`,
    // `computed.analysis.power.best_20min`, `computed.bests.power_20min`) — none of which
    // any writer in the codebase populates. Tier 1 silently never fired; estimation always
    // fell through to Tier 2 (NP from hard efforts × 0.95). Removed.
    const bestsPower20: number[] = [];
    for (const r of sustainedPowerRides) {
      const p20 = r.computed?.power_curve?.['20min'];
      if (p20 && p20 > 50) {
        bestsPower20.push(p20);
      }
    }

    if (bestsPower20.length >= 2) {
      const best20MinPower = Math.max(...bestsPower20);
      const estimatedFTP = Math.round(best20MinPower * 0.95);
      
      ftp_estimated = {
        value: estimatedFTP,
        confidence: bestsPower20.length >= 3 ? 'high' : 'medium',
        source: `95% of 20-min best power (${bestsPower20.length} efforts)`,
        sample_count: bestsPower20.length
      };
      console.log(`  ⚡ FTP from 20-min bests: ${estimatedFTP}W (from ${best20MinPower}W)`);
    }

    // Priority 2: Use Normalized Power from HARD efforts only
    // Hard effort = HR > 80% of max OR power in top quartile
    if (!ftp_estimated) {
      // Filter for hard efforts
      const hardEffortRides = sustainedPowerRides.filter(r => {
        const hr = r.avg_heart_rate || 0;
        const power = r.normalized_power || r.avg_power || 0;
        
        // HR-based: above 80% of observed max
        const isHardByHR = observedMaxHR && hr >= observedMaxHR * 0.80;
        
        // Power-based: above 75th percentile
        const isHardByPower = p75Power && power >= p75Power * 0.85;
        
        return isHardByHR || isHardByPower;
      });

      console.log(`  📊 Hard effort rides for FTP: ${hardEffortRides.length} (of ${sustainedPowerRides.length} sustained)`);

      const normalizedPowers = hardEffortRides
        .filter(r => r.normalized_power && r.normalized_power > 50)
        .map(r => r.normalized_power)
        .sort((a, b) => b - a);

      if (normalizedPowers.length >= 1) {
        // Take best NP from hard efforts
        const bestNP = normalizedPowers[0];
        const estimatedFTP = Math.round(bestNP * 0.95);
        
        ftp_estimated = {
          value: estimatedFTP,
          // Tier 2 cap: NP-from-hard-rides is a fallback, not a 20-min measurement. Never claim resolver-trusted 'high'.
          confidence: normalizedPowers.length >= 2 ? 'medium' : 'low',
          source: `95% of best NP from ${normalizedPowers.length} hard rides`,
          sample_count: normalizedPowers.length
        };
        console.log(`  ⚡ FTP from hard effort NP: ${estimatedFTP}W (from ${bestNP}W NP)`);
      }
    }

    // Priority 3: Use avg power from hard efforts
    if (!ftp_estimated) {
      const hardEffortRides = sustainedPowerRides.filter(r => {
        const hr = r.avg_heart_rate || 0;
        const power = r.avg_power || 0;
        const isHardByHR = observedMaxHR && hr >= observedMaxHR * 0.80;
        const isHardByPower = p75Power && power >= p75Power * 0.85;
        return isHardByHR || isHardByPower;
      });

      const avgPowers = hardEffortRides
        .filter(r => r.avg_power && r.avg_power > 50)
        .map(r => r.avg_power)
        .sort((a, b) => b - a);

      if (avgPowers.length >= 1) {
        const bestAvgPower = avgPowers[0];
        // Adjust avg power to approximate NP, then take 95%
        const estimatedFTP = Math.round(bestAvgPower * 1.05 * 0.95);
        
        ftp_estimated = {
          value: estimatedFTP,
          confidence: avgPowers.length >= 3 ? 'medium' : 'low',
          source: `estimated from ${avgPowers.length} hard rides`,
          sample_count: avgPowers.length
        };
        console.log(`  ⚡ FTP from hard effort avg power: ${estimatedFTP}W (from ${bestAvgPower}W avg)`);
      }
    }

    // Priority 4: Fallback - no hard efforts found, use best overall power
    if (!ftp_estimated && sustainedPowerRides.length >= 1) {
      const allPowersNP = sustainedPowerRides
        .filter(r => r.normalized_power && r.normalized_power > 50)
        .map(r => r.normalized_power)
        .sort((a, b) => b - a);
      
      if (allPowersNP.length >= 1) {
        const bestNP = allPowersNP[0];
        ftp_estimated = {
          value: Math.round(bestNP * 0.95),
          confidence: 'low',
          source: 'estimated (no hard efforts found - do a hard ride!)',
          sample_count: allPowersNP.length
        };
        console.log(`  ⚡ FTP fallback: ${Math.round(bestNP * 0.95)}W (no hard efforts found)`);
      }
    }
  }

  // ==========================================================================
  // STEP 5: THE FTP ESTIMATOR — the power-duration fit, guardrails, receipt
  // (docs/SPEC-ftp-estimator-2026-09-04.md; maths in src/lib/bike-ftp-estimator.ts)
  //
  // ⛔ WHY IT REPLACED STEP 4. "95% × the single best 20-minute effort in the window" can only report
  // what the athlete already produced: a season of easy riding has no qualifying effort and the number
  // sags, not because fitness fell but because nothing measured it. This fits the critical-power curve
  // to the best effort at each 2-20 min duration across the window — the read TrainerRoad's AI FTP
  // Detection and intervals.icu's eFTP make, from power alone. ⛔ POWER ONLY (2026-09-04, Michael:
  // "just do what intervals.icu and TrainerRoad do"): a heart-rate-at-threshold read was built beside
  // it and removed the same night.
  //
  // When this produces a value it IS `ftp_estimated`; STEP 4's value survives only when this abstains.
  // ==========================================================================
  let ftp_compound: CompoundFtp | null = null;
  {
    // The best at each duration across the 90-day window — different rides supply different durations,
    // the way TrainerRoad and intervals.icu assemble it.
    const b = fitCriticalPower(bestPerDuration(rides.map((r) => r.computed?.power_curve ?? null)));

    // 2026-09-04 (Michael: one absolute reference per metric): the best-20-minute hard ceiling and the ±5%-per-
    // learn rate limit were OURS on top of the intervals.icu / TrainerRoad read. Both deleted — the fit is the number.
    ftp_compound = compoundFtp(b);
    if (ftp_compound) {
      console.log(`  ⚡ FTP: ${ftp_compound.value}W (${ftp_compound.confidence}) — curve ${b.value ?? '—'}W/${b.confidence ?? 'abstain'} (${b.n} durations)`);
      ftp_estimated = {
        value: ftp_compound.value,
        confidence: ftp_compound.confidence,
        source: ftp_compound.source,
        sample_count: ftp_compound.sample_count,
      };
    } else {
      console.log(`  ⚡ FTP estimator abstained — ${b.reason}` + (ftp_estimated ? `; falling back to STEP 4: ${ftp_estimated.value}W (${ftp_estimated.confidence})` : ''));
    }
  }

  return {
    easy_hr,
    threshold_hr,
    max_hr_observed,
    ftp_estimated,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractHRMetric(workouts: WorkoutRecord[], source: string): LearnedMetric | null {
  const validHRs = workouts
    .filter(w => w.avg_heart_rate && w.avg_heart_rate > 60 && w.avg_heart_rate < 220)
    .map(w => w.avg_heart_rate);

  if (validHRs.length === 0) return null;

  // Use median for robustness against outliers
  const sorted = [...validHRs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return {
    value: Math.round(median),
    confidence: validHRs.length >= 5 ? 'high' : (validHRs.length >= 3 ? 'medium' : 'low'),
    source: source,
    sample_count: validHRs.length
  };
}

interface SwimAnalysisResult {
  swim_pace_per_100m: LearnedMetric | null;
}

/**
 * Median sec/100m from completed swims with useful distance+time (≥3 sessions to publish).
 */
function analyzeSwims(all: WorkoutRecord[], paceById: Map<string, number>): SwimAnalysisResult {
  const swims = all.filter((w) => normType(workoutTypeFromRow(w)) === 'swim');
  const paces: number[] = [];
  for (const w of swims) {
    // Q-051: use the per-session pace compute-facts already computed (workout_facts.swim_facts.
    // pace_per_100m), keyed by workout id. The prior raw recompute from workouts.distance (km) /
    // moving_time (min) — formula expecting m/s — filtered out every swim and published null.
    const p = paceById.get(String(w.id));
    if (!Number.isFinite(p) || (p as number) < 40 || (p as number) > 600) continue;
    paces.push(p as number);
  }
  console.log(`  🏊 Swim sessions (usable pace from workout_facts): ${paces.length} of ${swims.length} swim rows`);
  if (paces.length < 3) {
    return { swim_pace_per_100m: null };
  }
  const sorted = [...paces].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    swim_pace_per_100m: {
      value: Math.round(median),
      confidence: paces.length >= 5 ? 'high' : 'medium',
      source: `median sec/100m from ${paces.length} swim sessions`,
      sample_count: paces.length,
    },
  };
}

function extractPaceMetric(workouts: WorkoutRecord[], source: string): LearnedMetric | null {
  const validPaces = workouts
    .filter(w => w.avg_pace && w.avg_pace > 150 && w.avg_pace < 900) // 2:30/km to 15:00/km
    .map(w => w.avg_pace);

  if (validPaces.length === 0) return null;

  // Use median for robustness
  const sorted = [...validPaces].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return {
    value: Math.round(median),
    confidence: validPaces.length >= 5 ? 'high' : (validPaces.length >= 3 ? 'medium' : 'low'),
    source: source,
    sample_count: validPaces.length
  };
}

