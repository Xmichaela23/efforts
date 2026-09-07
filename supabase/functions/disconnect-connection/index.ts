// disconnect-connection — the user disconnects one provider (garmin / strava).
//
// B1: identity from the VERIFIED JWT, never the body — you can only disconnect YOUR OWN connection.
//
// Order (docs/WORKORDER-garmin-partner-readiness-2026-09-07.md §2):
//   1. tell the provider first, with the stored token — Garmin: DELETE wellness-api/rest/user/registration;
//      Strava: POST oauth/deauthorize. A failure there is logged and returned (`provider_notified: false`)
//      and does NOT block our delete: the user asked to disconnect, we honour it either way.
//   2. delete our rows for that provider in BOTH connection tables (user_connections is where Garmin's
//      tokens live, device_connections is Strava's; either may hold a stale row for the other).
//   3. a connection_events row { event: 'disconnect' } so support can answer "what happened".
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser } from '../_shared/require-user.ts';
import { deregisterGarmin, deauthorizeStrava, logConnectionEvent } from '../_shared/provider-deregister.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Body = {
  userId?: string;   // ignored — identity comes from the JWT
  provider: string;
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info, x-supabase-authorization',
  } as Record<string, string>;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors() } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId } = await requireUser(req);
    const { provider: rawProvider }: Pick<Body, 'provider'> = await req.json();
    const provider = String(rawProvider || '').toLowerCase().trim();
    if (!provider) return json({ error: 'Missing provider' }, 400);

    // 1. tell the provider (never blocks)
    let notify: { attempted: boolean; ok: boolean; status: number | null; error?: string } | null = null;
    if (provider === 'garmin') notify = await deregisterGarmin(supabase, userId);
    else if (provider === 'strava') notify = await deauthorizeStrava(supabase, userId);

    // 2. our rows, both tables
    const dc = await supabase.from('device_connections').delete().eq('user_id', userId).eq('provider', provider).select('id');
    if (dc.error) return json({ error: dc.error.message }, 500);
    const uc = await supabase.from('user_connections').delete().eq('user_id', userId).eq('provider', provider).select('id');
    if (uc.error) return json({ error: uc.error.message }, 500);

    // 3. the event row
    await logConnectionEvent(supabase, {
      user_id: userId,
      provider,
      event: 'disconnect',
      detail: {
        rows_deleted: { device_connections: dc.data?.length ?? 0, user_connections: uc.data?.length ?? 0 },
        provider_notified: notify?.ok ?? null,
        provider_status: notify?.status ?? null,
      },
    });

    return json({
      success: true,
      rows_deleted: { device_connections: dc.data?.length ?? 0, user_connections: uc.data?.length ?? 0 },
      provider_notified: notify?.ok ?? null,      // null = provider has no deregistration call wired
      provider_attempted: notify?.attempted ?? null,
      provider_status: notify?.status ?? null,
    });
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    return json({ error: `${e}` }, status);
  }
});
