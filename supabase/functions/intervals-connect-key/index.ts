// Edge function: intervals-connect-key (2026-09-13)
// Connects the signed-in athlete's Intervals.icu account with their personal API key, until the OAuth app is
// approved and the Connect button replaces it. Checks the key against Intervals.icu (GET /athlete/0), stores it
// encrypted (_shared/token-crypto.ts) as the athlete's intervals_icu connection, and sets where each sport's
// workouts go when the athlete has not chosen yet: rides to Intervals.icu, runs to Garmin when Garmin is connected.
// Body { api_key } connects; { disconnect: true } removes the connection (the next sync leaves Intervals alone).
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { getAthlete, IntervalsApiError } from '../_shared/intervals/client.ts';
import { encryptToken } from '../_shared/token-crypto.ts';
import { healthyOnConnect } from '../_shared/connection-health.ts';
import { setDefaultDestinationsIfAbsent } from '../_shared/intervals/connection.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);
  try {
    const { userId, supabase } = await requireUser(req);
    const body = await req.json().catch(() => ({}));

    if (body?.disconnect === true) {
      const { error } = await supabase.from('user_connections').delete().eq('user_id', userId).eq('provider', 'intervals_icu');
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, connected: false });
    }

    const apiKey = typeof body?.api_key === 'string' ? body.api_key.trim() : '';
    if (!apiKey) return json({ ok: false, error: 'api_key required' }, 400);

    let athlete;
    try {
      athlete = await getAthlete({ kind: 'api_key', key: apiKey });
    } catch (e) {
      const status = e instanceof IntervalsApiError ? e.status : 0;
      return json({ ok: false, error: status === 401 || status === 403 ? 'Intervals.icu did not accept this API key' : (e as Error).message }, 400);
    }

    const row = {
      user_id: userId,
      provider: 'intervals_icu',
      access_token: await encryptToken(apiKey),
      refresh_token: null,
      expires_at: null,
      connection_data: { auth: 'api_key', athlete_id: athlete.id, name: athlete.name, timezone: athlete.timezone },
      ...healthyOnConnect(),
    };
    const { error: upErr } = await supabase.from('user_connections').upsert(row, { onConflict: 'user_id,provider' });
    if (upErr) return json({ ok: false, error: `saving the connection failed: ${upErr.message}` }, 500);

    try {
      await setDefaultDestinationsIfAbsent(supabase, userId);
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 500);
    }
    return json({ ok: true, connected: true, athlete: { id: athlete.id, name: athlete.name } });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: 'unauthorized' }, 401);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
