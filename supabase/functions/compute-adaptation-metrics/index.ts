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
// The comparable-easy-run gate and the helpers it shares with this handler (moved beside it, 2026-09-26).
import { clamp, isComparableZ2Run, minutesFromWorkout, parseJson } from './z2-gate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

const COMPUTED_VERSION_INT = 1003;


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

function estimate1Rm(weight: number, reps: number, avgRir: number | null): number | null {
  // Q-039 step 2: RIR >= 5 means "far from failure" — an autoregulation signal,
  // not a valid e1RM data point. Exclude it from e1RM entirely (null) rather than
  // inflate the Epley estimate by 1.5x. RIR 0-4 (and null = no RIR data) stay usable.
  if (avgRir != null && avgRir >= 5) return null;
  const epley = weight * (1 + reps / 30);
  const rirFactor = avgRir != null ? (1 + avgRir / 10) : 1;
  return epley * rirFactor;
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

    console.log(`[compute-adaptation-metrics] start workout_id=${workout_id}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Prevent duplicate execution
    const { data: gotLock } = await supabase.rpc('try_advisory_lock', {
      lock_key: `compute-adaptation:${workout_id}`,
    });
    if (!gotLock) {
      console.log(`[compute-adaptation-metrics] skip already_running workout_id=${workout_id}`);
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
      console.log(`[compute-adaptation-metrics] skip not_completed workout_id=${workout_id} status=${status}`);
      return new Response(JSON.stringify({ success: true, workout_id, wrote: false, skipped: true, reason: 'not_completed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ⛔ THE WHOLE ROW (2026-09-26): `configured_hr_zones` is where a typed run threshold or max lives. The birthday
    // is no longer read — it fed only the age-formula tier of the old easy band, which the one easy rule does not have.
    const { data: baseline } = await supabase
      .from('user_baselines')
      .select('learned_fitness,performance_numbers,configured_hr_zones')
      .eq('user_id', (w as any)?.user_id)
      .maybeSingle();

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
      const minutes = minutesFromWorkout((w as any)?.duration, (w as any)?.moving_time);

      // Long run lane (do not throw away as "too_long")
      if (minutes != null && minutes > 90) {
        adaptation.workout_type = 'long_run';
        adaptation.duration_min = minutes;
        adaptation.avg_hr = Number.isFinite(avgHr) ? Math.round(avgHr) : null;
        adaptation.avg_pace = Number.isFinite(avgPace) ? Math.round(avgPace) : null;
        if (Number.isFinite(avgPace) && avgPace > 0 && Number.isFinite(avgHr) && avgHr > 0) {
          adaptation.long_run_efficiency = Number((avgPace / avgHr).toFixed(6));
          adaptation.data_quality = 'good';
          adaptation.confidence = 0.6;
        } else {
          adaptation.excluded_reason = !Number.isFinite(avgPace) ? 'missing_pace' : !Number.isFinite(avgHr) ? 'missing_hr' : 'insufficient_data';
          adaptation.data_quality = 'fair';
          adaptation.confidence = 0.2;
        }
      } else {
        const gate = isComparableZ2Run(w, baseline ?? null);

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
          // null when the best set was RIR >= 5 (excluded from e1RM, Q-039 step 2);
          // downstream (useExerciseLog) already skips estimated_1rm <= 0 / null.
          estimated_1rm: est1rm != null ? Math.round(est1rm) : null,
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
    console.log(
      `[compute-adaptation-metrics] wrote workout_id=${workout_id} type=${String(adaptation?.workout_type || 'unknown')} reason=${String(adaptation?.excluded_reason || 'ok')} ms=${ms}`
    );
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

