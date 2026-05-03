/**
 * recompute-workout — user-triggered pipeline: compute-workout-analysis → compute-facts → analyze-*.
 * Auth: user JWT + workouts.user_id match. Downstream invokes use service role.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

type RecomputeStep = 'compute-workout-analysis' | 'compute-facts' | 'analyze';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Same routing as MobileSummary; default matches mobility / unknown types. */
function resolveAnalyzeEdgeFn(workoutType: string | null | undefined): string {
  const t = (workoutType ?? '').toLowerCase();
  if (t === 'run' || t === 'running') return 'analyze-running-workout';
  if (t === 'ride' || t === 'cycling' || t === 'bike') return 'analyze-cycling-workout';
  if (t === 'strength' || t === 'strength_training') return 'analyze-strength-workout';
  if (t === 'swim' || t === 'swimming') return 'analyze-swim-workout';
  return 'analyze-running-workout';
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

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return json({ ok: false, code: 'unauthorized', error: 'Invalid token', steps: [] }, 401);
  }

  let workout_id: string;
  try {
    const body = await req.json();
    workout_id = String(body?.workout_id ?? '').trim();
  } catch {
    return json({ ok: false, code: 'bad_request', error: 'Invalid JSON body', steps: [] }, 400);
  }
  if (!workout_id) {
    return json({ ok: false, code: 'bad_request', error: 'workout_id required', steps: [] }, 400);
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: workout, error: rowErr } = await serviceClient
    .from('workouts')
    .select('id, type, user_id')
    .eq('id', workout_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (rowErr || !workout) {
    return json({ ok: false, code: 'not_found', error: 'Workout not found', steps: [] }, 404);
  }

  const analyzeFn = resolveAnalyzeEdgeFn(workout.type as string | null);
  const steps: RecomputeStep[] = [];

  const analysisRes = await serviceClient.functions.invoke('compute-workout-analysis', {
    body: { workout_id },
  });
  if (analysisRes.error) {
    // 200 so the client reads body from res.data (not only FunctionsHttpError).
    return json({
      ok: false,
      stale: false,
      steps: [],
      code: 'analysis_failed',
      error: analysisRes.error.message ?? 'compute-workout-analysis failed',
    });
  }
  steps.push('compute-workout-analysis');

  const factsRes = await serviceClient.functions.invoke('compute-facts', {
    body: { workout_id },
  });
  if (factsRes.error) {
    console.warn('[recompute-workout] compute-facts failed:', factsRes.error.message);
    return json({ ok: true, stale: true, steps });
  }
  steps.push('compute-facts');

  const analyzeRes = await serviceClient.functions.invoke(analyzeFn, {
    body: { workout_id },
  });
  if (analyzeRes.error) {
    console.warn(`[recompute-workout] ${analyzeFn} failed:`, analyzeRes.error.message);
    return json({ ok: true, stale: true, steps });
  }
  steps.push('analyze');

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
