// =============================================================================
// COMPUTE-ADAPTATION-METRICS - CHEAP METRICS LANE EDGE FUNCTION
// =============================================================================
//
// PURPOSE:
// - Fast, deterministic adaptation metrics written to workouts.computed.adaptation
// - No AI calls, no heavy processing, safe to run on every ingest
//
// INPUT:  { workout_id: string }
// OUTPUT: { success: boolean, workout_id: string, wrote: boolean, adaptation?: any }
//
// NOTES:
// - Uses merge_computed RPC for atomic JSONB merge (prevents races)
// - Designed to be <500ms under normal DB conditions
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

const COMPUTED_VERSION_INT = 1003;

type LearnedMetric = {
  value: number;
  confidence?: 'low' | 'medium' | 'high' | number;
  source?: string;
  sample_count?: number;
};

function parseJson<T = any>(val: any): T | null {
  if (val == null) return null;
  try {
    return typeof val === 'string' ? JSON.parse(val) : (val as T);
  } catch {
    return val as T;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function confidenceToNumber(conf: LearnedMetric['confidence']): number {
  if (conf == null) return 0;
  if (typeof conf === 'number') return clamp(conf, 0, 1);
  if (conf === 'high') return 0.9;
  if (conf === 'medium') return 0.65;
  if (conf === 'low') return 0.4;
  return 0;
}

function minutesFromWorkout(durationMin: any, movingMin: any): number | null {
  const d = Number(durationMin);
  const m = Number(movingMin);
  const v = Number.isFinite(m) && m > 0 ? m : Number.isFinite(d) && d > 0 ? d : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

function normalizeLiftName(nameRaw: any): 'Squat' | 'Bench Press' | 'Deadlift' | 'Overhead Press' | null {
  const n = String(nameRaw || '').toLowerCase();
  if (!n) return null;
  if (/\bdeadlift\b/.test(n)) return 'Deadlift';
  if (/\bbench\b/.test(n)) return 'Bench Press';
  if (/\boverhead\b|\bohp\b|\bmilitary\b|\bshoulder press\b/.test(n)) return 'Overhead Press';
  if (/\bsquat\b/.test(n)) return 'Squat';
  return null;
}

function parseRir(val: any): number | null {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
}

function pickBestSet(sets: any[]): { weight: number; reps: number; rir: number | null } | null {
  let best: { weight: number; reps: number; rir: number | null } | null = null;
  for (const s of sets || []) {
    const w = Number(s?.weight ?? s?.weight_lbs ?? s?.weight_kg ?? s?.load ?? s?.kg ?? s?.lbs);
    const reps = Number(s?.reps ?? s?.repCount ?? s?.rep_count);
    if (!Number.isFinite(w) || w <= 0) continue;
    if (!Number.isFinite(reps) || reps <= 0 || reps > 30) continue;
    const rir = parseRir(s?.rir ?? s?.RIR ?? s?.repsInReserve ?? s?.reps_in_reserve);
    const score = w * reps; // simple proxy for "hardest"
    const bestScore = best ? best.weight * best.reps : -1;
    if (score > bestScore) best = { weight: w, reps, rir };
  }
  return best;
}

function estimate1Rm(weight: number, reps: number, avgRir: number | null): number {
  const epley = weight * (1 + reps / 30);
  const rirFactor = avgRir != null ? (1 + avgRir / 10) : 1;
  return epley * rirFactor;
}

function getWorkoutTextHints(workout: any): string {
  const name = String(workout?.name || '');
  const meta = parseJson<any>(workout?.workout_metadata) || {};
  const tags = Array.isArray(meta?.tags) ? meta.tags.join(' ') : '';
  const desc = String(meta?.description || meta?.notes || '');
  const detected = String(
    workout?.computed?.analysis?.workout_type_detected ||
      workout?.computed?.workout_type_detected ||
      ''
  );
  return `${name} ${tags} ${desc} ${detected}`.toLowerCase();
}

function parseEasyPaceMmSsPerMiToSecPerKm(val: any): number | null {
  if (val == null) return null;
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mm = Number(m[1]);
  const ss = Number(m[2]);
  if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss < 0 || ss >= 60) return null;
  const secPerMi = mm * 60 + ss;
  return secPerMi / 1.60934;
}

function isComparableZ2Run(
  workout: any,
  learnedFitness: any,
  userAge: number | null,
  perfNumbers: any
): {
  ok: boolean;
  reason: string;
  z2: { lower: number; upper: number; source: string } | null;
  confidence: number;
  debug: Record<string, any>;
} {
  const hints = getWorkoutTextHints(workout);
  if (hints.includes('interval')) return { ok: false, reason: 'tagged_interval', z2: null, confidence: 0, debug: { hints } };
  if (hints.includes('tempo')) return { ok: false, reason: 'tagged_tempo', z2: null, confidence: 0, debug: { hints } };
  if (hints.includes('race')) return { ok: false, reason: 'tagged_race', z2: null, confidence: 0, debug: { hints } };

  const minutes = minutesFromWorkout(workout?.duration, workout?.moving_time);
  // Slightly looser by default, then we rely on pace/HR gates.
  if (minutes == null) return { ok: false, reason: 'missing_duration', z2: null, confidence: 0, debug: { hints } };
  if (minutes < 30) return { ok: false, reason: 'too_short', z2: null, confidence: 0, debug: { hints, minutes } };
  if (minutes > 90) return { ok: false, reason: 'too_long', z2: null, confidence: 0, debug: { hints, minutes } };

  const avgHr = Number(workout?.avg_heart_rate);
  if (!Number.isFinite(avgHr)) return { ok: false, reason: 'missing_hr', z2: null, confidence: 0, debug: { hints, minutes } };
  if (avgHr < 80 || avgHr > 220) return { ok: false, reason: 'hr_out_of_range', z2: null, confidence: 0, debug: { hints, minutes, avgHr } };

  // Intensity factor gate (if present in computed or calculated metrics)
  const computed = parseJson<any>(workout?.computed) || {};
  const if1 = Number(computed?.intensity_factor ?? computed?.overall?.intensity_factor ?? computed?.metrics?.intensity_factor);
  // Note: IF can be noisy for runs; we keep the gate but emit a debug reason.
  if (Number.isFinite(if1) && if1 > 0.85) return { ok: false, reason: 'high_intensity_factor', z2: null, confidence: 0, debug: { hints, minutes, avgHr, if1 } };

  // Z2 range determination (prefer learned baselines, fallback to derived)
  const lf = typeof learnedFitness === 'string' ? parseJson<any>(learnedFitness) : learnedFitness;
  const easyHrMetric: LearnedMetric | null = lf?.run_easy_hr ?? null;
  const easyHrConf = confidenceToNumber(easyHrMetric?.confidence);
  const thresholdHrMetric: LearnedMetric | null = lf?.run_threshold_hr ?? null;
  const thresholdHrConf = confidenceToNumber(thresholdHrMetric?.confidence);

  let z2Lower: number;
  let z2Upper: number;
  let conf: number;
  let source = 'age';

  if (easyHrMetric?.value) {
    // If learned confidence is low, widen the band instead of discarding (hot days / hills).
    const center = Number(easyHrMetric.value);
    const band = easyHrConf >= 0.5 ? 0.06 : 0.10;
    z2Lower = center * (1 - band);
    z2Upper = center * (1 + band);
    conf = Math.max(0.35, easyHrConf);
    source = 'learned_easy_hr';
  } else if (thresholdHrMetric?.value) {
    // Derive easy/Z2 center from threshold HR (~82–85% of threshold for many runners).
    const thr = Number(thresholdHrMetric.value);
    const center = thr * 0.83;
    z2Lower = center * 0.92;
    z2Upper = center * 1.10;
    conf = Math.max(0.35, thresholdHrConf);
    source = 'derived_from_threshold_hr';
  } else {
    const age = userAge != null ? clamp(userAge, 10, 95) : 35;
    const maxHr = 220 - age;
    z2Lower = maxHr * 0.65;
    z2Upper = maxHr * 0.75;
    conf = 0.35;
    source = 'age';
  }

  // Optional pace gate using manual easy pace baseline (reduces false negatives when HR is noisy)
  const avgPace = Number(workout?.avg_pace); // sec/km
  const baselineEasySecPerKm = parseEasyPaceMmSsPerMiToSecPerKm(perfNumbers?.easyPace);
  if (!Number.isFinite(avgPace) || !(avgPace > 0)) {
    // If HR matches our easy range, we can still accept and store pace as missing (but aerobic efficiency can't be computed).
    // For comparability gating, treat missing pace as non-comparable to keep the metric clean.
    return { ok: false, reason: 'missing_pace', z2: { lower: z2Lower, upper: z2Upper, source }, confidence: conf, debug: { hints, minutes, avgHr, if1, z2Lower, z2Upper, source } };
  }

  const paceLooksEasy =
    Number.isFinite(avgPace) &&
    avgPace > 120 &&
    avgPace < 900 &&
    baselineEasySecPerKm != null &&
    // within +25% slower to -10% faster than baseline easy pace
    avgPace >= baselineEasySecPerKm * 0.90 &&
    avgPace <= baselineEasySecPerKm * 1.25;

  const hrLooksEasy = avgHr >= z2Lower && avgHr <= z2Upper;

  // Accept if HR fits OR pace fits and HR isn't clearly hard (cap at ~92% threshold if known)
  let hrHardCap: number | null = null;
  if (thresholdHrMetric?.value) hrHardCap = Number(thresholdHrMetric.value) * 0.92;

  const notClearlyHard = hrHardCap == null ? avgHr <= z2Upper * 1.08 : avgHr <= hrHardCap;

  const ok = hrLooksEasy || (paceLooksEasy && notClearlyHard);
  if (!ok) {
    const reason =
      !notClearlyHard ? 'too_hard' :
      !hrLooksEasy && paceLooksEasy ? 'hr_outside_easy_band' :
      'pace_or_hr_not_easy';
    return {
      ok: false,
      reason,
      z2: { lower: z2Lower, upper: z2Upper, source },
      confidence: conf,
      debug: {
        hints,
        minutes,
        avgHr,
        avgPace,
        if1: Number.isFinite(if1) ? if1 : null,
        z2Lower,
        z2Upper,
        source,
        baselineEasySecPerKm,
        paceLooksEasy,
        hrLooksEasy,
        hrHardCap,
        notClearlyHard,
      },
    };
  }
  return {
    ok: true,
    reason: 'ok',
    z2: { lower: z2Lower, upper: z2Upper, source },
    confidence: conf,
    debug: {
      hints,
      minutes,
      avgHr,
      avgPace,
      if1: Number.isFinite(if1) ? if1 : null,
      z2Lower,
      z2Upper,
      source,
      baselineEasySecPerKm,
      paceLooksEasy,
      hrLooksEasy,
      hrHardCap,
      notClearlyHard,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const startedAt = Date.now();

  try {
    const { workout_id } = await req.json();
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Prevent duplicate execution
    const { data: gotLock } = await supabase.rpc('try_advisory_lock', {
      lock_key: `compute-adaptation:${workout_id}`,
    });
    if (!gotLock) {
      return new Response(JSON.stringify({ success: true, workout_id, wrote: false, skipped: true, reason: 'already_running' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch workout + user_baselines
    const { data: w, error: wErr } = await supabase
      .from('workouts')
      .select('id,user_id,type,workout_status,date,duration,moving_time,avg_pace,avg_heart_rate,computed,workout_metadata,name,strength_exercises')
      .eq('id', workout_id)
      .maybeSingle();
    if (wErr) throw wErr;
    if (!w) return new Response(JSON.stringify({ error: 'workout not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const sport = String((w as any)?.type || '').toLowerCase();
    const status = String((w as any)?.workout_status || '').toLowerCase();
    if (status && status !== 'completed') {
      return new Response(JSON.stringify({ success: true, workout_id, wrote: false, skipped: true, reason: 'not_completed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: baseline } = await supabase
      .from('user_baselines')
      .select('age,learned_fitness,performance_numbers')
      .eq('user_id', (w as any)?.user_id)
      .maybeSingle();

    const userAge = baseline?.age != null ? Number(baseline.age) : null;
    const learnedFitness = baseline?.learned_fitness ? parseJson<any>(baseline.learned_fitness) : null;
    const perfNumbers = baseline?.performance_numbers ? parseJson<any>(baseline.performance_numbers) : null;

    const adaptation: any = {
      data_quality: 'poor',
      confidence: 0,
      computed_at: new Date().toISOString(),
    };

    // -------------------------------------------------------------------------
    // RUN: Aerobic efficiency (comparable Z2 runs)
    // -------------------------------------------------------------------------
    if (sport === 'run' || sport === 'running' || sport === 'walk' || sport === 'hike') {
      const avgPace = Number((w as any)?.avg_pace); // stored as sec/km in ingest
      const avgHr = Number((w as any)?.avg_heart_rate);
      const gate = isComparableZ2Run(w, learnedFitness, userAge, perfNumbers);

      if (gate.ok && Number.isFinite(avgPace) && avgPace > 120 && avgPace < 900 && Number.isFinite(avgHr) && avgHr > 80 && avgHr < 220) {
        const aerobicEfficiency = avgPace / avgHr;

        adaptation.workout_type = 'easy_z2';
        adaptation.aerobic_efficiency = Number(aerobicEfficiency.toFixed(6));
        adaptation.avg_pace_at_z2 = Math.round(avgPace);
        adaptation.avg_hr_in_z2 = Math.round(avgHr);
        adaptation.z2_hr_range = gate.z2;
        adaptation.debug = gate.debug;
        adaptation.confidence = clamp(gate.confidence, 0, 1);
        adaptation.data_quality = adaptation.confidence >= 0.75 ? 'excellent' : adaptation.confidence >= 0.5 ? 'good' : 'fair';
      } else {
        adaptation.workout_type = 'non_comparable';
        adaptation.excluded_reason = gate?.reason || 'non_comparable';
        adaptation.z2_hr_range = gate?.z2 || null;
        adaptation.debug = gate?.debug || null;
        adaptation.data_quality = 'fair';
        adaptation.confidence = 0;
      }
    }

    // -------------------------------------------------------------------------
    // STRENGTH: Progression snapshot for major lifts
    // -------------------------------------------------------------------------
    if (sport === 'strength' || sport === 'strength_training') {
      // Always label strength snapshots so downstream aggregations don't see workout_type:null
      adaptation.workout_type = 'strength';
      const raw = parseJson<any>(w?.strength_exercises);
      const exercises = Array.isArray(raw) ? raw : [];

      const out: any[] = [];
      let rirCount = 0;
      let liftCount = 0;

      for (const ex of exercises) {
        const lift = normalizeLiftName(ex?.name ?? ex?.exercise ?? ex?.exercise_name ?? ex?.title);
        if (!lift) continue;

        const sets = Array.isArray(ex?.sets)
          ? ex.sets
          : Array.isArray(ex?.working_sets)
            ? ex.working_sets
            : Array.isArray(ex?.performance?.sets)
              ? ex.performance.sets
              : [];

        const best = pickBestSet(sets);
        if (!best) continue;

        liftCount += 1;
        if (best.rir != null) rirCount += 1;

        const est1rm = estimate1Rm(best.weight, best.reps, best.rir);
        out.push({
          exercise: lift,
          weight: Number(best.weight.toFixed(2)),
          avg_rir: best.rir,
          estimated_1rm: Math.round(est1rm),
        });
      }

      if (out.length) {
        adaptation.strength_exercises = out;
        const rirCoverage = liftCount > 0 ? rirCount / liftCount : 0;
        adaptation.confidence = clamp(0.5 + 0.5 * rirCoverage, 0, 1);
        adaptation.data_quality = rirCoverage >= 0.8 ? 'excellent' : rirCoverage >= 0.5 ? 'good' : 'fair';
      } else {
        adaptation.excluded_reason = 'no_major_lifts_detected';
        adaptation.data_quality = 'fair';
        adaptation.confidence = 0.2;
      }
    }

    // -------------------------------------------------------------------------
    // Write to workouts.computed.adaptation using atomic merge
    // -------------------------------------------------------------------------
    const computedPatch = { adaptation };
    const stamp = new Date().toISOString();
    const { error: rpcError } = await supabase.rpc('merge_computed', {
      p_workout_id: workout_id,
      p_partial_computed: computedPatch,
      p_computed_version_int: COMPUTED_VERSION_INT,
      p_computed_at: stamp,
    });
    if (rpcError) {
      console.error('[compute-adaptation-metrics] RPC merge_computed failed:', rpcError);
      throw new Error(`Failed to merge computed adaptation: ${rpcError.message}`);
    }

    const ms = Date.now() - startedAt;
    return new Response(JSON.stringify({ success: true, workout_id, wrote: true, adaptation, ms }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[compute-adaptation-metrics] Error:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

