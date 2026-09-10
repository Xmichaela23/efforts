/**
 * compute-session-boom — the good-news line on a done session, worked out once and stored
 * (2026-09-10, audit H-T14). See `_shared/session-boom/compute.ts` for what it reads and where it writes,
 * and `_shared/session-boom/line.ts` for the rule and the approved words.
 *
 * Called by `recompute-workout` right after the analyser, and by `bulk-reanalyze-workouts` after its
 * analyser. Body: `{ workout_id, user_id? }`.
 *
 * Auth — the shared guard (`_shared/require-user.ts`): A) a user JWT, scoped to that user's workout;
 * B) the service role with an explicit `user_id`, which is how the chain calls it.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUserOrService, AuthError } from '../_shared/require-user.ts';
import { withAlarm } from '../_shared/alarm.ts';
import { computeSessionBoom } from '../_shared/session-boom/compute.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(withAlarm('compute-session-boom', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const workoutId = String(body?.workout_id ?? '').trim();
  if (!workoutId) return json({ ok: false, error: 'workout_id required' }, 400);

  let userId: string;
  try {
    ({ userId } = await requireUserOrService(req, body?.user_id ? String(body.user_id) : null));
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: e.message }, 401);
    throw e;
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { boom, written } = await computeSessionBoom(supabase, workoutId, userId);
    return json({ ok: true, boom, written });
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e);
    console.warn('[compute-session-boom] failed:', msg);
    return json({ ok: false, error: msg.slice(0, 500) }, 500);
  }
}));
