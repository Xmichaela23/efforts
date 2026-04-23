/**
 * Recomputes `goals.projection` (splits / estimates) for the signed-in user.
 * Lighter than `learn-fitness-profile` — use after arc save or when projections are stale.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { recomputeRaceProjectionsForUser } from '../_shared/recompute-goal-race-projections.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function getUser(
  supabase: ReturnType<typeof createClient>,
  authHeader: string | null,
): Promise<{ user: { id: string } | null; err: string | null }> {
  if (!authHeader?.startsWith('Bearer ')) return { user: null, err: 'Missing authorization' };
  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return { user: null, err: 'Invalid authentication' };
  return { user, err: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, key);
  const { user, err: authErr } = await getUser(supabase, req.headers.get('Authorization'));
  if (!user) {
    return new Response(JSON.stringify({ error: authErr }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body: { goal_ids?: string[] } = {};
  try {
    body = (await req.json()) as { goal_ids?: string[] };
  } catch {
    body = {};
  }
  const goalIds = Array.isArray(body.goal_ids)
    ? body.goal_ids.map((x) => String(x)).filter((s) => s.length > 0)
    : undefined;

  try {
    await recomputeRaceProjectionsForUser(
      supabase,
      user.id,
      goalIds?.length ? { goalIds } : undefined,
    );
  } catch (e) {
    console.error('[refresh-goal-race-projections]', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'recompute failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
