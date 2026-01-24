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

function isComparableZ2Run(workout: any, learnedFitness: any, userAge: number | null): { ok: boolean; z2: { lower: number; upper: number } | null; confidence: number } {
  const hints = getWorkoutTextHints(workout);
  if (hints.includes('interval')) return { ok: false, z2: null, confidence: 0 };
  if (hints.includes('tempo')) return { ok: false, z2: null, confidence: 0 };
  if (hints.includes('race')) return { ok: false, z2: null, confidence: 0 };

  const minutes = minutesFromWorkout(workout?.duration, workout?.moving_time);
  if (minutes == null || minutes < 35 || minutes > 75) return { ok: false, z2: null, confidence: 0 };

  const avgHr = Number(workout?.avg_heart_rate);
  if (!Number.isFinite(avgHr) || avgHr < 80 || avgHr > 220) return { ok: false, z2: null, confidence: 0 };

  // Intensity factor gate (if present in computed or calculated metrics)
  const computed = parseJson<any>(workout?.computed) || {};
  const if1 = Number(computed?.intensity_factor ?? computed?.overall?.intensity_factor ?? computed?.metrics?.intensity_factor);
  if (Number.isFinite(if1) && if1 > 0.8) return { ok: false, z2: null, confidence: 0 };

  // Z2 range determination
  const lf = typeof learnedFitness === 'string' ? parseJson<any>(learnedFitness) : learnedFitness;
  const easyHrMetric: LearnedMetric | null = lf?.run_easy_hr ?? null;
  const easyHrConf = confidenceToNumber(easyHrMetric?.confidence);

  let z2Lower: number;
  let z2Upper: number;
  let conf: number;

  if (easyHrMetric?.value && easyHrConf >= 0.5) {
    const center = Number(easyHrMetric.value);
    z2Lower = center * 0.95;
    z2Upper = center * 1.05;
    conf = easyHrConf;
  } else {
    const age = userAge != null ? clamp(userAge, 10, 95) : 35;
    const maxHr = 220 - age;
    z2Lower = maxHr * 0.65;
    z2Upper = maxHr * 0.75;
    conf = 0.35;
  }

  if (avgHr < z2Lower || avgHr > z2Upper) return { ok: false, z2: { lower: z2Lower, upper: z2Upper }, confidence: conf };
  return { ok: true, z2: { lower: z2Lower, upper: z2Upper }, confidence: conf };
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
      .select('age,learned_fitness')
      .eq('user_id', (w as any)?.user_id)
      .maybeSingle();

    const userAge = baseline?.age != null ? Number(baseline.age) : null;
    const learnedFitness = baseline?.learned_fitness ? parseJson<any>(baseline.learned_fitness) : null;

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
      const gate = isComparableZ2Run(w, learnedFitness, userAge);

      if (gate.ok && Number.isFinite(avgPace) && avgPace > 120 && avgPace < 900 && Number.isFinite(avgHr) && avgHr > 80 && avgHr < 220) {
        const aerobicEfficiency = avgPace / avgHr;

        adaptation.workout_type = 'easy_z2';
        adaptation.aerobic_efficiency = Number(aerobicEfficiency.toFixed(6));
        adaptation.avg_pace_at_z2 = Math.round(avgPace);
        adaptation.avg_hr_in_z2 = Math.round(avgHr);
        adaptation.z2_hr_range = gate.z2;
        adaptation.confidence = clamp(gate.confidence, 0, 1);
        adaptation.data_quality = adaptation.confidence >= 0.75 ? 'excellent' : adaptation.confidence >= 0.5 ? 'good' : 'fair';
      } else {
        adaptation.workout_type = 'non_comparable';
        adaptation.data_quality = 'fair';
        adaptation.confidence = 0;
      }
    }

    // -------------------------------------------------------------------------
    // STRENGTH: Progression snapshot for major lifts
    // -------------------------------------------------------------------------
    if (sport === 'strength' || sport === 'strength_training') {
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

