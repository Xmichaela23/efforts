// Edge function: intervals-oauth (2026-09-13)
// Intervals.icu sign-in for the signed-in athlete (user JWT). Endpoints and rules: _shared/intervals/oauth.ts and
// docs/WORKORDER-intervals-oauth-2026-09-13.md, Step 0.
//   { action: 'start' }                    → { ok, url }  the Intervals.icu authorize address, state signed for this user
//   { action: 'exchange', code, state }    → { ok, athlete }  called by /auth/intervals/callback at once (2-minute code)
//   { action: 'disconnect' }               → { ok }  revokes the sign-in with Intervals.icu (disconnect-app), removes the row
// Every answer to a signed-in caller is HTTP 200 with { ok }; a refusal is { ok: false, reason, error }. supabase-js
// functions.invoke throws away the body of any non-2xx answer (data is null), so a 400 would hide the reason from
// the callback page and the card's toasts. Only a missing or bad session answers 401.
// intervals-connect-key keeps the API-key path.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { encryptToken, decryptToken } from '../_shared/token-crypto.ts';
import { healthyOnConnect } from '../_shared/connection-health.ts';
import { logConnectionEvent } from '../_shared/provider-deregister.ts';
import { makeState, checkState, authorizeUrl, exchangeCode, grantsCalendarWrite, disconnectApp, IntervalsTokenError } from '../_shared/intervals/oauth.ts';
import { setDefaultDestinationsIfAbsent, removeKeySentEvents, queueCalendarSync } from '../_shared/intervals/connection.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (reason: string, detail: string) => {
  console.warn(JSON.stringify({ event: 'intervals_oauth_failed', reason, detail: detail.slice(0, 400) }));
  return json({ ok: false, reason, error: detail });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);
  try {
    // Identity from the verified JWT. Writes go through a service-role client: the client requireUser returns carries
    // the athlete's JWT, so the database treats it as the athlete, and calendar_deliveries, jobs and connection_events
    // are service-role only.
    const { userId } = await requireUser(req);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const clientId = Deno.env.get('INTERVALS_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('INTERVALS_CLIENT_SECRET') ?? '';

    if (body?.action === 'start') {
      if (!clientId) return fail('server_config', 'INTERVALS_CLIENT_ID is not set');
      return json({ ok: true, url: authorizeUrl(clientId, await makeState(userId)) });
    }

    if (body?.action === 'disconnect') {
      const { data: row, error } = await supabase.from('user_connections').select('access_token, connection_data')
        .eq('user_id', userId).eq('provider', 'intervals_icu').maybeSingle();
      if (error) return fail('db', error.message);
      let notified: { ok: boolean; status: number; error?: string } | null = null;
      let cleanup: Awaited<ReturnType<typeof removeKeySentEvents>> | null = null;
      if (row?.connection_data?.auth === 'oauth' && row.access_token) {
        // Never blocks the delete: the athlete asked to disconnect.
        try { notified = await disconnectApp(await decryptToken(row.access_token)); }
        catch (e) { notified = { ok: false, status: 0, error: (e as Error).message }; }
      } else if (row?.connection_data?.auth === 'api_key') {
        // With the key gone, nothing could remove the rides it sent, and a later connection would record them as
        // sent: edits would double and deletes would not reach them. Remove them first (today and later); on a failure
        // the connection stays so the athlete can try again.
        try { cleanup = await removeKeySentEvents(supabase, userId, row); }
        catch (e) { return fail('disconnect_cleanup_failed', (e as Error).message); }
      }
      const { error: delErr } = await supabase.from('user_connections').delete().eq('user_id', userId).eq('provider', 'intervals_icu');
      if (delErr) return fail('db', delErr.message);
      await logConnectionEvent(supabase, { user_id: userId, provider: 'intervals_icu', event: 'disconnect',
        detail: { auth: row?.connection_data?.auth ?? null, provider_notified: notified?.ok ?? null, provider_status: notified?.status ?? null, cleanup } });
      return json({ ok: true, connected: false, provider_notified: notified?.ok ?? null, cleanup });
    }

    if (body?.action !== 'exchange') return fail('bad_action', 'action must be start, exchange or disconnect');

    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code) return fail('no_code', 'code required');
    const stateCheck = await checkState(String(body?.state ?? ''), userId);
    if (stateCheck !== 'ok') return fail(`state_${stateCheck}`, `state ${stateCheck}`);
    if (!clientId || !clientSecret) return fail('server_config', 'INTERVALS_CLIENT_ID or INTERVALS_CLIENT_SECRET is not set');

    let token;
    try {
      token = await exchangeCode(clientId, clientSecret, code);
    } catch (e) {
      return fail('exchange_failed', e instanceof IntervalsTokenError ? e.message : `token call failed: ${(e as Error).message}`);
    }

    if (!grantsCalendarWrite(token.scopes)) {
      await disconnectApp(token.accessToken);
      return fail('calendar_not_granted', `granted scopes: ${token.scopes.join(',') || '(none)'}`);
    }

    const { data: existing, error: exErr } = await supabase.from('user_connections').select('access_token, connection_data')
      .eq('user_id', userId).eq('provider', 'intervals_icu').maybeSingle();
    if (exErr) return fail('db', exErr.message);

    let cleanup;
    try {
      cleanup = await removeKeySentEvents(supabase, userId, existing);
    } catch (e) {
      // The key connection stays as it was; revoke the new sign-in so nothing is left half-switched.
      await disconnectApp(token.accessToken);
      return fail('switch_cleanup_failed', (e as Error).message);
    }

    const row = {
      user_id: userId,
      provider: 'intervals_icu',
      access_token: await encryptToken(token.accessToken),
      refresh_token: null,
      expires_at: null,
      connection_data: { auth: 'oauth', athlete_id: token.athleteId, name: token.athleteName, scope: token.scopes.join(',') },
      ...healthyOnConnect(),
    };
    const { error: upErr } = await supabase.from('user_connections').upsert(row, { onConflict: 'user_id,provider' });
    if (upErr) return fail('db', `saving the connection failed: ${upErr.message}`);

    const { set } = await setDefaultDestinationsIfAbsent(supabase, userId);
    if (!set) await queueCalendarSync(supabase, userId); // setting destinations queues one by trigger

    await logConnectionEvent(supabase, { user_id: userId, provider: 'intervals_icu', event: 'connect',
      detail: { auth: 'oauth', previous_auth: existing?.connection_data?.auth ?? null, athlete_id: token.athleteId, cleanup } });
    return json({ ok: true, connected: true, athlete: { id: token.athleteId, name: token.athleteName }, cleanup });
  } catch (e) {
    if (e instanceof AuthError) return json({ ok: false, error: 'unauthorized' }, 401);
    return fail('server_error', (e as Error).message);
  }
});
