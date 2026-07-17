/**
 * recompute-workout — THE canonical post-process orchestrator (fan-out ordering fix, 2026-07-17).
 *
 * Ordered, awaited chain — "await what you read":
 *   auto-attach → [summary] → analysis → workload ∥ adaptation → facts(skip_snapshot) → analyze → snapshot(watermark)
 *
 * Every entry path fires this fire-and-forget so the webhook ack stays fast while correctness comes
 * from ordering INSIDE the chain (not from the webhook awaiting it). See docs/AUDIT-fanout-ordering-2026-07-17.md.
 *
 * Auth — two doors, one hardened:
 *   A) user JWT + workouts.user_id match (byte-identical to the prior gate; external callers).
 *   B) trusted service-role: bearer == SERVICE_ROLE_KEY (constant-time) AND explicit body.user_id.
 *   Anything else → 401. Downstream invokes use the service role.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { invalidateUserTrainingCache } from '../_shared/invalidate-user-training-cache.ts';
import {
  mondayOf,
  resolveAnalyzeEdgeFn,
  decideAuthDoor,
  invokeWithRetry,
} from './orchestrator-lib.ts';

type RecomputeStep =
  | 'auto-attach' | 'summary' | 'analysis' | 'workload' | 'adaptation' | 'facts' | 'analyze' | 'snapshot';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function markStatus(client: any, workout_id: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await client.from('workouts').update(patch).eq('id', workout_id);
  } catch (e) {
    console.warn('[recompute-workout] status flip failed (non-fatal):', (e as Error)?.message ?? e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'method_not_allowed', error: 'POST only', steps: [] as RecomputeStep[] }, 405);
  }

  const authH = req.headers.get('Authorization') || '';
  const token = authH.startsWith('Bearer ') ? authH.slice(7).trim() : '';
  if (!token) {
    return json({ ok: false, code: 'unauthorized', error: 'Missing token', steps: [] }, 401);
  }

  // Parse the body BEFORE auth — the trusted-service door needs the explicit user_id from it.
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'bad_request', error: 'Invalid JSON body', steps: [] }, 400);
  }
  const workout_id = String(body?.workout_id ?? '').trim();
  if (!workout_id) {
    return json({ ok: false, code: 'bad_request', error: 'workout_id required', steps: [] }, 400);
  }
  const includeSummary = body?.include_summary !== false; // default true (idempotent re-normalize)
  const bodyUserId = body?.user_id ? String(body.user_id) : null;

  // ── AUTH: two doors (decision is pure + fixtured in orchestrator-lib.test.ts) ─────────────
  const decision = decideAuthDoor({ token, serviceKey: SUPABASE_SERVICE_ROLE_KEY, bodyUserId });
  let ownerUserId: string;
  const isService = decision.kind === 'service';
  if (decision.kind === 'reject') {
    return json({ ok: false, code: decision.code, error: decision.error, steps: [] }, 401);
  } else if (decision.kind === 'service') {
    // Door B — trusted service caller named the user explicitly (verified IS the service role).
    ownerUserId = decision.ownerUserId;
  } else {
    // Door A — user JWT gate. BYTE-IDENTICAL to the prior external gate.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return json({ ok: false, code: 'unauthorized', error: 'Invalid token', steps: [] }, 401);
    }
    ownerUserId = user.id;
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: workout, error: rowErr } = await serviceClient
    .from('workouts')
    .select('id, type, user_id, date')
    .eq('id', workout_id)
    .eq('user_id', ownerUserId) // scopes both doors: a service caller can only recompute the user it named
    .maybeSingle();

  if (rowErr || !workout) {
    return json({ ok: false, code: 'not_found', error: 'Workout not found', steps: [] }, 404);
  }

  const analyzeFn = resolveAnalyzeEdgeFn(workout.type as string | null);
  const workoutDate = String((workout as any).date || '').slice(0, 10);
  const steps: RecomputeStep[] = [];

  // D-078: user-triggered recompute forces fresh ai_summary; the automatic (service/ingest) path
  // PRESERVES existing narrative on a transient LLM null — the original ingest-activity behaviour.
  const forceRegenerate = !isService;

  // ── 0. auto-attach-planned — planned_id before adherence/analysis. Idempotent; continue on fail.
  {
    const r = await invokeWithRetry(serviceClient, 'auto-attach-planned', { workout_id });
    if (r?.error) console.warn('[recompute-workout] auto-attach-planned failed (non-fatal):', r.error.message);
    else steps.push('auto-attach');
  }

  // ── 1. compute-workout-summary — writes computed.overall/intervals. Everything reads computed → STOP on fail.
  if (includeSummary) {
    const r = await invokeWithRetry(serviceClient, 'compute-workout-summary', { workout_id });
    if (r?.error) {
      await markStatus(serviceClient, workout_id, { summary_status: 'failed' });
      console.warn('[recompute-workout] compute-workout-summary failed — halting chain:', r.error.message);
      return json({ ok: false, stale: true, steps, code: 'summary_failed', error: r.error.message });
    }
    steps.push('summary');
  }

  // ── 2. compute-workout-analysis — writes computed.analysis. Degradable → CONTINUE on fail.
  {
    const r = await invokeWithRetry(serviceClient, 'compute-workout-analysis', { workout_id });
    if (r?.error) console.warn('[recompute-workout] compute-workout-analysis failed (continuing degraded):', r.error.message);
    else steps.push('analysis');
  }

  // ── 3a. calculate-workload — ACWR substrate; must precede snapshot. Continue on fail.
  {
    const r = await invokeWithRetry(serviceClient, 'calculate-workload', { workout_id });
    if (r?.error) console.warn('[recompute-workout] calculate-workload failed (non-fatal):', r.error.message);
    else steps.push('workload');
  }
  // ── 3b. compute-adaptation-metrics — reads computed (must follow analysis; F5). No retry, continue.
  {
    const r = await serviceClient.functions.invoke('compute-adaptation-metrics', { body: { workout_id } });
    if (r?.error) console.warn('[recompute-workout] compute-adaptation-metrics failed (non-fatal):', r.error.message);
    else steps.push('adaptation');
  }

  // ── 4. compute-facts — reads computed; writes facts/route_progress_metrics/session_load. STOP on fail.
  //    skip_snapshot: the orchestrator owns the snapshot (fired after analyze, with a fresh watermark).
  {
    const r = await invokeWithRetry(serviceClient, 'compute-facts', { workout_id, skip_snapshot: true });
    if (r?.error) {
      await markStatus(serviceClient, workout_id, { metrics_status: 'failed' });
      console.warn('[recompute-workout] compute-facts failed — halting downstream:', r.error.message);
      return json({ ok: true, stale: true, steps, code: 'facts_failed' });
    }
    steps.push('facts');
  }

  // ── 5. analyze-{sport} — writes workout_analysis (the field the snapshot reads). Continue on fail.
  {
    const r = await invokeWithRetry(serviceClient, analyzeFn, {
      workout_id,
      force_regenerate_ai_summary: forceRegenerate,
    });
    if (r?.error) console.warn(`[recompute-workout] ${analyzeFn} failed (continuing):`, r.error.message);
    else steps.push('analyze');
  }

  // ── 6. compute-snapshot — OWNED here, AFTER analyze, with a fresh input watermark (F3 guard).
  //    source_watermark = inputs-assembled-now (post-analyze). A one-behind trigger would carry an
  //    older watermark and be REFUSED by trg_guard_snapshot_watermark. Non-fatal; self-heals next run.
  try {
    const source_watermark = new Date().toISOString();
    await invokeWithRetry(serviceClient, 'compute-snapshot', {
      user_id: workout.user_id,
      ...(workoutDate ? { week_start: mondayOf(workoutDate) } : {}),
      source_watermark,
    });
    await invalidateUserTrainingCache(serviceClient, workout.user_id, 'recompute-workout');
    steps.push('snapshot');
  } catch (e) {
    console.warn('[recompute-workout] snapshot/cache refresh failed (non-fatal):', (e as Error)?.message ?? e);
  }

  console.log('[recompute-workout] steps completed:', steps);
  return json({ ok: true, stale: false, steps });
});

function json(
  body: {
    ok: boolean;
    steps: RecomputeStep[];
    stale?: boolean;
    error?: string;
    code?: string;
  },
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
