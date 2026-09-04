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
import {
  fitRunCriticalSpeed,
  paceCurveToEfforts,
  type RunPaceCurve,
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
// The compound bike FTP (docs/SPEC-ftp-estimator-2026-09-04.md): two open signals, guardrails, receipt.
import {
  bestPerDuration,
  compoundFtp,
  estimateFtpFromHrPower,
  fitCriticalPower,
  rateLimitFtp,
  type CompoundFtp,
  type RideForSignalA,
} from '../../../src/lib/bike-ftp-estimator.ts';

// Q-169: the ONE definition of "is this heartbeat easy" — threshold-anchored (Friel Z2), %max-bootstrapped.
// The RUN sites use it; the BIKE band (65-75% max + power filter) is deliberately NOT routed through it.
import { resolveRunEasyHrBand, isEasyHr } from '../_shared/easy-hr.ts';

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
    const { user_id } = payload;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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
    const runProfile = analyzeRuns(runs, allRunCurves, priorLearned);

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
        if (meta.swim_as_planned === false) return null;            // planned but deviated → exclude
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
    // Preserve a tested/prior CSS when the learner abstains this run (don't wipe a CSS-test result).
    if ((learnedProfile as any).swim_css_sec_per_100m == null && (existing as any)?.swim_css_sec_per_100m) {
      (mergedLearned as any).swim_css_sec_per_100m = (existing as any).swim_css_sec_per_100m;
    }

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
        mergedLearned.ride_ftp_accepted = {
          ...seedFrom,
          accepted_at: new Date().toISOString(),
          accepted_from: seedFrom.value,
          accepted_via: 'seed',
        };
        console.log(`  FTP accepted seeded from estimate: ${seedFrom.value}W (${seedFrom.confidence})`);
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
      // Update existing record
      const { error: updateError } = await supabase
        .from('user_baselines')
        .update({ 
          learned_fitness: mergedLearned,
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
    return {
      easy_hr: null,
      threshold_hr: null,
      race_hr: null,
      max_hr_observed: null,
      easy_pace: null,
      threshold_pace: null
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
      const sortedPaces = easyPaceRuns.map(r => r.avg_pace).sort((a, b) => a - b);
      const medianPace = sortedPaces[Math.floor(sortedPaces.length / 2)];
      
      easy_pace = {
        value: Math.round(medianPace),
        confidence: easyPaceRuns.length >= 5 ? 'high' : 'medium',
        source: `pace at easy HR (${easyPaceRuns.length} runs; ${runEasyBand.basis})`,
        sample_count: easyPaceRuns.length,
        as_of: newestDate(easyPaceRuns),  // Q-173: heat can silence this learner for a whole summer
      };
    }
  }

  // ==========================================================================
  // STEP 5b: Threshold PACE — the pace at which threshold HR occurs.
  //
  // ⛔⛔ IT PUBLISHED A THRESHOLD PACE SLOWER THAN THE ATHLETE'S EASY PACE (2026-08-19, seen on
  // Michael's baselines: easy 12:35/mi, threshold 14:44/mi, 5K 25:21 = 8:10/mi). A threshold pace
  // slower than easy is not a low-confidence reading, it is not a reading at all.
  //
  // ⛔ THE MECHANISM. The filter took any run ≥15 min whose AVERAGE HR sat within ±5 bpm of
  // threshold HR, then took the median of that run's AVERAGE PACE over the whole activity. A
  // hill-repeat session averages near threshold HR — and its average pace includes the walk-back
  // descents. So the walking was folded into "threshold pace". The same is true of any interval run
  // with recoveries, and of any run with stops. Two such sessions were enough: the minimum was 2.
  //
  // ⛔ THE GUARD IS AN INVARIANT, NOT A CONTAMINATION LIST. Detecting hills, then intervals, then
  // stops, then whatever comes next is a guard per source, forever. **A threshold effort is faster
  // than an easy effort** is true for every athlete in every sport, so it is applied twice: once to
  // drop the individual dirty candidates, and once to the median as a last check. A session whose
  // whole-activity average pace is slower than the athlete's own easy pace cannot be a threshold
  // read, whatever its average HR says.
  //
  // ⚠️ AND WHEN IT CANNOT BE MEASURED IT PUBLISHES NOTHING — the same call the swim CSS learner
  // above already makes, and LAW 2 in this file ("we do not know it yet; say so"). `null` is safe
  // here because `resolveCurrentRunThresholdPace` (`src/lib/resolve-current-run-pace.ts:274`) has a
  // tier chain beneath it: the athlete's typed value, then the wizard/VDOT pace off their 5K. An
  // abstention falls back to a sane derived number; a published lie does not.
  // ==========================================================================

  /**
   * ⛔ A PACE "AT THRESHOLD HR" REQUIRES A THRESHOLD HR THAT WAS DETECTED (2026-08-20).
   *
   * This filtered candidates to within ±5 bpm of `thresholdHRValue` without asking where that number
   * came from. When STEP 2 detects nothing it fills the hole — `95th percentile of sustained efforts
   * (no clear threshold data)`, or `88% of observed max` — and this read then measured a pace against
   * a guess and published the result as `Measured from your runs`. That is Law 2 one layer up: not an
   * invented number, but a real measurement of an invented reference, which is harder to spot and
   * carries the same lie to the athlete.
   *
   * ⚠️ IT ABSTAINS RATHER THAN WIDENING. There is no honest weaker version of "pace at threshold HR"
   * when threshold HR is unknown — and abstaining is not a hole, because
   * `resolveCurrentRunThresholdPace` derives from the measured easy pace beneath this, which is a
   * reference the athlete actually produced.
   */
  const thresholdHrDetected = threshold_hr != null && threshold_hr.is_estimate !== true;
  if (thresholdHRValue && observedMaxHR && thresholdHrDetected) {
    /**
     * ⚠️ THE CEILING IS THE LEARNED EASY PACE WHEN THERE IS ONE, AND OTHERWISE NOTHING.
     * With no easy pace learned there is no reference to measure against, and inventing one (a
     * fraction of threshold HR pace, say) would be the fabrication LAW 2 deleted from this file.
     * Candidates are then unfiltered and the abstention below is the only guard — which is the
     * honest position, not a gap.
     */
    const easyRaw = Number(easy_pace?.value);
    const easyPaceCeiling = Number.isFinite(easyRaw) && easyRaw > 0 ? easyRaw : null;

    const thresholdPaceRuns = runs.filter(r => {
      const duration = r.moving_time || r.duration || 0;
      const hr = r.avg_heart_rate || 0;
      const pace = r.avg_pace || 0;
      if (!(duration >= 15 && pace > 150 && pace < 900)) return false;   // Valid pace range
      if (Math.abs(hr - thresholdHRValue!) > 5) return false;
      // ⛔ SLOWER THAN EASY → NOT A THRESHOLD READ. `avg_pace` is sec/km, so LARGER is slower.
      if (easyPaceCeiling != null && pace >= easyPaceCeiling) return false;
      return true;
    });

    /**
     * ⛔ THREE, NOT TWO — AND THE TIER MOVED WITH IT. Two runs used to publish at `medium`, and
     * `resolveCurrentRunThresholdPace` treats medium as TRUSTED, so a two-session read drove real
     * prescriptions. Both of Michael's were contaminated. Two runs is now `low` — visible on the
     * baselines card, ignored by the resolver — and it takes three to steer a plan.
     */
    if (thresholdPaceRuns.length >= 2) {
      const sortedPaces = thresholdPaceRuns.map(r => r.avg_pace).sort((a, b) => a - b);
      const medianPace = sortedPaces[Math.floor(sortedPaces.length / 2)];

      /**
       * ⛔ THE INVARIANT IS ENFORCED ON THE CANDIDATES, AND ONLY THERE. A second check on the
       * MEDIAN stood here and was deleted the hour it was written: every candidate is already
       * faster than the ceiling, so their median is too — it could never fire, and unreachable
       * defence is how this codebase's guards multiply. Filtering also SALVAGES the clean runs
       * instead of throwing away the whole read because one session was dirty.
       *
       * ⚠️ WHAT PROTECTS IT NOW IS THE TEST, NOT A SECOND BRANCH. Deleting the filter above fails
       * `threshold-pace.test.ts` — verified by mutation, which is also how the dead branch was
       * caught: removing it broke nothing.
       */
      threshold_pace = {
        value: Math.round(medianPace),
        confidence: thresholdPaceRuns.length >= 5
          ? 'high'
          : (thresholdPaceRuns.length >= 3 ? 'medium' : 'low'),
        source: `pace at threshold HR (${thresholdPaceRuns.length} runs)`,
        sample_count: thresholdPaceRuns.length,
        as_of: newestDate(thresholdPaceRuns),
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * STEP 5c: THE MEASURED THRESHOLD — FITTED FROM BEST EFFORTS (2026-08-20)
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ THIS OUTRANKS STEP 5b, AND STEP 5b IS THE BUG. 5b averages a WHOLE ACTIVITY whose average
   * heart rate happened to land near threshold. A hill-repeat session averages near threshold heart
   * rate and its average pace includes every walk back down — which is how a threshold pace slower
   * than the athlete's own easy pace reached a real screen. Averaging an activity cannot measure a
   * sustained effort; looking inside it can.
   *
   * ⛔ THE BIKE AND THE SWIM ALREADY DO THIS. FTP is learned from the best 20-minute power window;
   * the swim fits a critical-speed curve across best efforts and abstains when the curve does not
   * hold. Running was the last discipline still averaging.
   *
   * ⚠️ IT ABSTAINS OFTEN, AND THAT IS CORRECT. It needs at least two genuinely hard efforts in
   * DIFFERENT duration bands. An athlete whose hard running is all hill repeats has one band and
   * gets nothing — at which point 5b's read, and below that the easy-pace derivation in
   * `resolveCurrentRunThresholdPace`, are what answer. The tiers stack; none of them was removed.
   *
   * ⚠️ NO BACKFILL (Michael's call). `pace_curve` is written by `compute-workout-analysis` at
   * analysis time, so it lands on runs from here forward and older runs carry none. Until two
   * qualifying efforts accumulate this returns null and nothing changes.
   */
  const csEfforts = runs.flatMap((r) =>
    paceCurveToEfforts((r.computed as { pace_curve?: RunPaceCurve } | null)?.pace_curve, String(r.date ?? ''))
  );
  if (csEfforts.length > 0) {
    const fit = fitRunCriticalSpeed(
      csEfforts,
      thresholdHRValue ?? null,
      // The invariant's reference — the easy pace THIS pass just learned, in the same sec/km unit.
      Number.isFinite(Number(easy_pace?.value)) ? Number(easy_pace!.value) : null,
      // ⛔ the hard-effort gate's anchor — the OBSERVED max, a measurement, never the LTHR estimate
      // (2026-09-02: four months of easy running had been written as a high-confidence threshold).
      observedMaxHR ?? null,
    );
    console.log(`  📊 Run critical speed: ${fit.csSecPerKm ?? 'abstained'} — ${fit.reason}`);
    if (fit.csSecPerKm != null) {
      threshold_pace = {
        value: fit.csSecPerKm,
        // The fit's own tiers map straight across; `low` still means "visible, not steerable".
        confidence: fit.confidence === 'high' ? 'high' : (fit.confidence === 'moderate' ? 'medium' : 'low'),
        source: `critical speed from ${fit.nPoints} best-effort windows (R² ${fit.r2})`,
        sample_count: fit.nPoints,
        // ⚠️ DATES THE RUNS THAT ACTUALLY SURVIVED THE GATES, not every run carrying a curve. The
        // looser version overstated freshness: a recent easy run has a pace curve and contributes
        // nothing, so it would have stamped the fit as newer than the efforts it rests on.
        as_of: newestDate(runs.filter((r) => {
          const c = (r.computed as { pace_curve?: RunPaceCurve } | null)?.pace_curve;
          if (!c) return false;
          return paceCurveToEfforts(c, String(r.date ?? '')).some((e) =>
            e.avgHr != null && thresholdHRValue != null && e.avgHr >= thresholdHRValue * 0.92
          );
        })),
      };
    }
  }

  // ⛔ BEST SUSTAINED 20 MINUTES — THE ONE RULE (2026-09-02). Overrides the critical-speed fit and the
  // whole-run-average threshold HR above. Threshold pace = that window's pace; threshold HR = that
  // window's average heart rate; same run, so they cannot disagree. ONLY UP: a prior best-20 value with a
  // faster pace is kept. NO WINDOW: the whole history on file. A window under 85% of the observed max is
  // still the best we have, but it is marked 'medium' (an effort that was not all-out under-reads).
  {
    let best: { date: string; paceSecPerKm: number; avgHr: number | null } | null = null;
    for (const r of allRunCurves) {
      const w = (r.computed as { pace_curve?: RunPaceCurve } | null)?.pace_curve?.['1200'];
      if (!w || !(Number(w.distanceM) > 0) || !(Number(w.timeS) > 0)) continue;
      const paceSecPerKm = (Number(w.timeS) / Number(w.distanceM)) * 1000;
      if (!Number.isFinite(paceSecPerKm) || paceSecPerKm < 120 || paceSecPerKm > 900) continue;
      const hr = Number(w.avgHr);
      if (!best || paceSecPerKm < best.paceSecPerKm) best = { date: String(r.date ?? '').slice(0, 10), paceSecPerKm, avgHr: Number.isFinite(hr) && hr > 60 ? Math.round(hr) : null };
    }
    const priorPace = priorLearned?.run_threshold_pace_sec_per_km;
    const priorHr = priorLearned?.run_threshold_hr;
    // a prior MEASURED threshold — a best-20 read or the 12-minute test — is kept when it is faster (only up)
    const priorIsBest20 = priorPace && /best 20-minute|time trial/.test(String(priorPace.source ?? '')) && Number(priorPace.value) > 0;
    // ⛔ A TEST BEATS AN INFERENCE (p210): a prior written by the time trial stands regardless of what the
    // best-20 read says; only a newer trial (or "my number") replaces it. A prior best-20 read stands
    // only while it is faster (only up).
    const priorIsTrial = priorPace && /time trial/.test(String(priorPace.source ?? '')) && Number(priorPace.value) > 0;
    if (best && priorIsTrial) {
      threshold_pace = priorPace as LearnedMetric;
      if (priorHr && /time trial/.test(String(priorHr.source ?? ''))) { threshold_hr = priorHr as LearnedMetric; thresholdHRValue = Number(priorHr.value) || thresholdHRValue; }
      console.log(`  📊 Threshold: the time trial stands (${priorPace.value}s/km, ${priorPace.as_of})`);
    } else if (best && priorIsBest20 && Number(priorPace.value) < best.paceSecPerKm) {
      threshold_pace = priorPace as LearnedMetric;            // only up: the earlier best still stands
      if (priorHr && /best 20-minute|time trial/.test(String(priorHr.source ?? ''))) { threshold_hr = priorHr as LearnedMetric; thresholdHRValue = Number(priorHr.value) || thresholdHRValue; }
      console.log(`  📊 Threshold: prior best 20-minute effort stands (${priorPace.value}s/km, ${priorPace.as_of})`);
    } else if (best) {
      const hard = observedMaxHR != null && best.avgHr != null && best.avgHr >= observedMaxHR * 0.85;
      const paceMi = Math.round(best.paceSecPerKm * 1.60934);
      const label = `best 20-minute effort on ${best.date} (${Math.floor(paceMi / 60)}:${String(paceMi % 60).padStart(2, '0')}/mi${best.avgHr != null ? ` at ${best.avgHr} bpm` : ''})`;
      threshold_pace = { value: Math.round(best.paceSecPerKm), confidence: hard ? 'high' : 'medium', source: label, sample_count: 1, as_of: best.date };
      if (best.avgHr != null) {
        threshold_hr = { value: best.avgHr, confidence: hard ? 'high' : 'medium', source: label, sample_count: 1, as_of: best.date };
        thresholdHRValue = best.avgHr;
      }
      console.log(`  📊 Threshold: ${label}${hard ? '' : ' — under 85% of observed max, medium'}`);
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
    (r.avg_power && r.avg_power > 50) || 
    (r.normalized_power && r.normalized_power > 50)
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
  // STEP 5: THE FTP ESTIMATOR — two open signals, guardrails, receipt
  // (docs/SPEC-ftp-estimator-2026-09-04.md; maths in src/lib/bike-ftp-estimator.ts)
  //
  // ⛔ WHY IT REPLACED STEP 4. "95% × the single best 20-minute effort in the window" can only report
  // what the athlete already produced: a season of easy riding has no qualifying effort and the number
  // sags, not because fitness fell but because nothing measured it. Signal A reads the
  // heart-rate-to-power line of EVERY ride, easy ones included, at the learned threshold heart rate;
  // Signal B fits the critical-power curve to the best effort at each 2-20 min duration — the read
  // TrainerRoad, Xert, intervals.icu and WKO all make, since an app never gets a test, only rides.
  //
  // Back-run over the reference athlete's 18 months (2026-09-04): STEP 4 abstained May-July and fell
  // to 157 in mid-August; this held 166-176 through the same easy block and reads 167 (high) today,
  // the two signals agreeing independently (B 167, A 169). Over the last month the two methods track
  // within 2 W; the difference is the long easy stretch, which is the case the estimator exists for.
  //
  // When this produces a value it IS `ftp_estimated`; STEP 4's value survives only when this abstains.
  // ==========================================================================
  let ftp_compound: CompoundFtp | null = null;
  {
    // The threshold heart rate the line is read at. The fresh learn first; the prior learned value
    // when this learn produced none. A fabricated one (`is_estimate`, 90% of max) is still a heart
    // rate the line can be read at, but the read cannot be worth more than the anchor: cap at low.
    const thrFresh = threshold_hr?.value && threshold_hr.value > 0 ? threshold_hr : null;
    const thrPrior = (priorLearned?.ride_threshold_hr?.value > 0) ? priorLearned?.ride_threshold_hr : null;
    const thr = thrFresh ?? thrPrior;
    const thrIsEstimate = !!thr?.is_estimate;

    // Every ride with blocks contributes. Aerobic decoupling travels for the RECEIPT only — it reports
    // and flags (compute-snapshot, analyze-cycling-workout); it does not decide which rides count or
    // how much.
    const ridesForA: RideForSignalA[] = rides.map((r) => ({
      date: String(r.date ?? ''),
      blocks: r.computed?.hr_power_blocks ?? null,
      decouplingPct: r.computed?.analysis?.efficiency?.aerobic_decoupling_pct ?? null,
    }));
    const a = estimateFtpFromHrPower(ridesForA, thr?.value ?? null);
    if (thrIsEstimate && a.confidence) {
      a.confidence = 'low';
      a.reason += '; threshold HR is itself an estimate (90% of max)';
    }

    // Signal B: the best at each duration across the 90-day window — different rides supply different
    // durations, the way TrainerRoad and Xert assemble it.
    const b = fitCriticalPower(bestPerDuration(rides.map((r) => r.computed?.power_curve ?? null)));

    /**
     * ⛔ THE HARD CEILING READS 18 MONTHS, NOT 90 DAYS. The ceiling is the best 20 minutes the athlete
     * actually pedalled — the one number in here that does not extrapolate. Read over the 90-day
     * window it would BE the sag this estimator exists to remove (an easy quarter has a low best-20
     * and the ceiling would drag the estimate down to tier 1's own answer). Read over the athlete's
     * history it is a ceiling and nothing else: it can only ever lower the estimate, never raise it,
     * and a detrained athlete is caught by the two signals, which are recent. 18 months is the window
     * the run threshold already reads its best 20-minute effort across.
     */
    const ceilingPool = allRideCurves.length ? allRideCurves : rides;
    let ceiling20: number | null = null;
    for (const r of ceilingPool) {
      const p20 = Number(r.computed?.power_curve?.['20min']);
      if (Number.isFinite(p20) && p20 > 50 && (ceiling20 == null || p20 > ceiling20)) ceiling20 = p20;
    }

    const raw = compoundFtp(a, b, ceiling20);
    if (raw) {
      // The rate limit walks from whatever FTP the athlete had last learn — including a STEP 4 value
      // from before this estimator existed — at ≤5% per learn, so no athlete's zones move in one step.
      const prev = Number(priorLearned?.ride_ftp_estimated?.value);
      ftp_compound = rateLimitFtp(Number.isFinite(prev) ? prev : null, raw);
      console.log(`  ⚡ FTP: ${ftp_compound.value}W (${ftp_compound.confidence}) — A ${a.value ?? '—'}W/${a.confidence ?? 'abstain'} (${a.n} rides), B ${b.value ?? '—'}W/${b.confidence ?? 'abstain'} (${b.n} durations), ceiling ${ceiling20 ?? '—'}W`);
      ftp_estimated = {
        value: ftp_compound.value,
        confidence: ftp_compound.confidence,
        source: ftp_compound.source,
        sample_count: ftp_compound.sample_count,
      };
    } else {
      console.log(`  ⚡ FTP estimator abstained — A: ${a.reason}; B: ${b.reason}` + (ftp_estimated ? `; falling back to STEP 4: ${ftp_estimated.value}W (${ftp_estimated.confidence})` : ''));
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

