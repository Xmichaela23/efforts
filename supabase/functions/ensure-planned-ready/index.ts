// @ts-nocheck
/**
 * ensure-planned-ready — idempotent: materialized steps → interval mapping (recompute) → planned_steps_light (compute-workout-summary).
 * Auth: JWT + planned_workouts.user_id (same pattern as recompute-workout).
 *
 * Note: `planned_steps_light` is written by compute-workout-summary (not compute-workout-analysis).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

type ActionTaken = 'materialized' | 'recomputed' | 'snapshot';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function parseComputed(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function json(body: { ready: boolean; actions_taken: ActionTaken[]; error?: string }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ready: false, actions_taken: [], error: 'POST only' });
  }

  const authH = req.headers.get('Authorization') || '';
  const token = authH.startsWith('Bearer ') ? authH.slice(7).trim() : '';
  if (!token) {
    return json({ ready: false, actions_taken: [], error: 'Missing token' }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return json({ ready: false, actions_taken: [], error: 'Invalid token' }, 401);
  }

  let planned_workout_id: string;
  try {
    const body = await req.json();
    planned_workout_id = String(body?.planned_workout_id ?? '').trim();
  } catch {
    return json({ ready: false, actions_taken: [], error: 'Invalid JSON body' });
  }
  if (!planned_workout_id) {
    return json({ ready: false, actions_taken: [], error: 'planned_workout_id required' });
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const actions_taken: ActionTaken[] = [];

  const { data: plannedRow, error: planErr } = await service
    .from('planned_workouts')
    .select('id, user_id, computed, steps_preset, type, completed_workout_id')
    .eq('id', planned_workout_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (planErr || !plannedRow) {
    return json({ ready: false, actions_taken: [], error: 'Planned workout not found' }, 404);
  }

  let planned = plannedRow;

  // ── 1) Steps + step IDs ─────────────────────────────────────────────────
  const needsMaterialize = (): boolean => {
    const comp = parseComputed(planned.computed);
    const steps = comp.steps;
    if (!Array.isArray(steps) || steps.length === 0) return true;
    return steps.some((st: unknown) => {
      const s = st as { id?: string } | null;
      return !s?.id;
    });
  };

  if (needsMaterialize()) {
    const mat = await service.functions.invoke('materialize-plan', {
      body: { planned_workout_id },
    });
    if (mat.error) {
      console.warn('[ensure-planned-ready] materialize-plan failed:', mat.error.message);
      return json({
        ready: false,
        actions_taken,
        error: mat.error.message ?? 'materialize-plan failed',
      });
    }
    actions_taken.push('materialized');

    const { data: fresh, error: refErr } = await service
      .from('planned_workouts')
      .select('id, user_id, computed, steps_preset, type, completed_workout_id')
      .eq('id', planned_workout_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (refErr || !fresh) {
      return json({ ready: false, actions_taken, error: 'Failed to reload planned row after materialize' });
    }
    planned = fresh;
    if (needsMaterialize()) {
      return json({ ready: false, actions_taken, error: 'Steps still incomplete after materialize' });
    }
  }

  // ── Linked completed workout ────────────────────────────────────────────
  let workoutId: string | null = planned.completed_workout_id != null
    ? String(planned.completed_workout_id)
    : null;
  if (!workoutId) {
    const { data: w } = await service
      .from('workouts')
      .select('id')
      .eq('planned_id', planned_workout_id)
      .eq('user_id', user.id)
      .eq('workout_status', 'completed')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    workoutId = w?.id != null ? String(w.id) : null;
  }

  const loadWorkoutComputed = async (): Promise<Record<string, unknown>> => {
    if (!workoutId) return {};
    const { data: w } = await service
      .from('workouts')
      .select('computed')
      .eq('id', workoutId)
      .eq('user_id', user.id)
      .maybeSingle();
    return parseComputed(w?.computed);
  };

  // ── 2) planned_step_id on intervals ──────────────────────────────────────
  if (workoutId) {
    let comp = await loadWorkoutComputed();
    let intervals = Array.isArray(comp.intervals) ? (comp.intervals as unknown[]) : [];

    const needsRecompute =
      intervals.length > 0 &&
      intervals.every((it: unknown) => !(it as { planned_step_id?: string })?.planned_step_id);

    if (needsRecompute) {
      const rec = await service.functions.invoke('recompute-workout', {
        body: { workout_id: workoutId },
      });
      if (rec.error) {
        console.warn('[ensure-planned-ready] recompute-workout failed:', rec.error.message);
        return json({
          ready: false,
          actions_taken,
          error: rec.error.message ?? 'recompute-workout failed',
        });
      }
      const payload = rec.data as { ok?: boolean } | null;
      if (payload && payload.ok === false) {
        return json({
          ready: false,
          actions_taken,
          error: 'recompute-workout reported failure',
        });
      }
      actions_taken.push('recomputed');
      comp = await loadWorkoutComputed();
    }
  }

  // ── 3) planned_steps_light (compute-workout-summary, not compute-workout-analysis) ──
  if (workoutId) {
    const comp = await loadWorkoutComputed();
    const plannedLight = comp.planned_steps_light;
    const hasLight = Array.isArray(plannedLight) && plannedLight.length > 0;

    if (!hasLight) {
      const sum = await service.functions.invoke('compute-workout-summary', {
        body: { workout_id: workoutId },
      });
      if (sum.error) {
        console.warn('[ensure-planned-ready] compute-workout-summary failed:', sum.error.message);
        return json({
          ready: false,
          actions_taken,
          error: sum.error.message ?? 'compute-workout-summary failed',
        });
      }
      actions_taken.push('snapshot');

      const compAfter = await loadWorkoutComputed();
      const lightAfter = compAfter.planned_steps_light;
      const okLight = Array.isArray(lightAfter) && lightAfter.length > 0;
      if (!okLight) {
        return json({
          ready: false,
          actions_taken,
          error: 'planned_steps_light still empty after compute-workout-summary',
        });
      }
    }
  }

  return json({ ready: true, actions_taken });
});
