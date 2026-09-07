// @ts-nocheck
// Tell the provider we are letting go of the user (docs/WORKORDER-garmin-partner-readiness-2026-09-07.md §2).
//
// Called by disconnect-connection (the user disconnects one provider) and delete-account (the user deletes
// the account) BEFORE our rows go. A failure here is logged and never blocks our delete: the user asked to
// disconnect, we honour it either way. Returns what happened so the caller can log / return it.
//
//   Garmin: DELETE https://apis.garmin.com/wellness-api/rest/user/registration   Authorization: Bearer <token>
//           (Garmin Health API "User Deregistration"; Garmin then stops sending notifications for the user.)
//   Strava: POST   https://www.strava.com/oauth/deauthorize?access_token=<token>
//
// Tokens live on user_connections (Garmin, written by bright-service) or device_connections (Strava),
// top-level access_token or connection_data.access_token. An expired Garmin token is refreshed first with
// the same refresh call send-workout-to-garmin uses; a refresh failure falls back to the stored token.
import { createClient } from 'jsr:@supabase/supabase-js@2';

export type DeregisterResult = {
  provider: 'garmin' | 'strava';
  attempted: boolean;          // false = no token on file, nothing to tell the provider
  ok: boolean;                 // provider answered 2xx (Garmin: 204)
  status: number | null;       // provider HTTP status, or null when the fetch itself failed
  error?: string;
};

type Tokens = { access_token: string | null; refresh_token: string | null; expires_at: string | null };

async function readTokens(supabase, userId: string, provider: string): Promise<Tokens> {
  const pick = (row): Tokens | null => {
    if (!row) return null;
    const access = row.access_token || row.connection_data?.access_token || null;
    if (!access) return null;
    return {
      access_token: access,
      refresh_token: row.refresh_token || row.connection_data?.refresh_token || null,
      expires_at: row.expires_at || row.connection_data?.expires_at || null,
    };
  };
  const uc = await supabase.from('user_connections').select('access_token, refresh_token, expires_at, connection_data')
    .eq('user_id', userId).eq('provider', provider).maybeSingle();
  const fromUser = pick(uc.data);
  if (fromUser) return fromUser;
  const dc = await supabase.from('device_connections').select('access_token, refresh_token, expires_at, connection_data')
    .eq('user_id', userId).eq('provider', provider).maybeSingle();
  return pick(dc.data) ?? { access_token: null, refresh_token: null, expires_at: null };
}

async function freshGarminToken(supabase, userId: string, t: Tokens): Promise<string> {
  const exp = t.expires_at ? Date.parse(t.expires_at) : 0;
  if (!t.refresh_token || (exp && exp - Date.now() > 5 * 60 * 1000)) return t.access_token!;
  try {
    const clientId = Deno.env.get('GARMIN_CLIENT_ID') || '';
    const clientSecret = Deno.env.get('GARMIN_CLIENT_SECRET') || '';
    if (!clientId || !clientSecret) return t.access_token!;
    const res = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: t.refresh_token }),
    });
    if (!res.ok) return t.access_token!;
    const json = await res.json();
    return json?.access_token || t.access_token!;
  } catch {
    return t.access_token!;
  }
}

/** Garmin "User Deregistration": Garmin drops our registration for the user and stops notifying us. */
export async function deregisterGarmin(supabase, userId: string): Promise<DeregisterResult> {
  const out: DeregisterResult = { provider: 'garmin', attempted: false, ok: false, status: null };
  try {
    const t = await readTokens(supabase, userId, 'garmin');
    if (!t.access_token) return out;
    out.attempted = true;
    const token = await freshGarminToken(supabase, userId, t);
    const res = await fetch('https://apis.garmin.com/wellness-api/rest/user/registration', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    out.status = res.status;
    out.ok = res.ok;
    if (!res.ok) out.error = (await res.text().catch(() => '')).slice(0, 300);
  } catch (e) {
    out.error = `${e}`;
  }
  console.log(JSON.stringify({ event: 'provider_deregister', user_id: userId, ...out }));
  return out;
}

/** Strava deauthorize: revokes our access token for the athlete. */
export async function deauthorizeStrava(supabase, userId: string): Promise<DeregisterResult> {
  const out: DeregisterResult = { provider: 'strava', attempted: false, ok: false, status: null };
  try {
    const t = await readTokens(supabase, userId, 'strava');
    if (!t.access_token) return out;
    out.attempted = true;
    const res = await fetch(`https://www.strava.com/oauth/deauthorize?access_token=${encodeURIComponent(t.access_token)}`, { method: 'POST' });
    out.status = res.status;
    out.ok = res.ok;
    if (!res.ok) out.error = (await res.text().catch(() => '')).slice(0, 300);
  } catch (e) {
    out.error = `${e}`;
  }
  console.log(JSON.stringify({ event: 'provider_deregister', user_id: userId, ...out }));
  return out;
}

/** Which providers this user has a connection row for (either table). */
export async function connectedProviders(supabase, userId: string): Promise<string[]> {
  const [uc, dc] = await Promise.all([
    supabase.from('user_connections').select('provider').eq('user_id', userId),
    supabase.from('device_connections').select('provider').eq('user_id', userId),
  ]);
  const set = new Set<string>();
  for (const r of [...(uc.data ?? []), ...(dc.data ?? [])]) if (r?.provider) set.add(String(r.provider).toLowerCase());
  return [...set];
}

/**
 * connection_events: one row per thing that happened to a connection (deregistration from Garmin's side,
 * permissions change, disconnect from ours, account delete) so support can answer "what happened".
 * Table: supabase/migrations/20260907020000_connection_events.sql. Tolerant: if the table is not there
 * yet the event goes to the function log only and the caller carries on.
 */
export async function logConnectionEvent(
  supabase,
  row: { user_id: string | null; provider: string; event: string; detail?: Record<string, unknown> },
): Promise<boolean> {
  const payload = { user_id: row.user_id, provider: row.provider, event: row.event, detail: row.detail ?? {}, at: new Date().toISOString() };
  console.log(JSON.stringify({ event: 'connection_event', ...payload }));
  try {
    const { error } = await supabase.from('connection_events').insert(payload);
    if (error) { console.warn('connection_events insert failed:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('connection_events insert threw:', `${e}`);
    return false;
  }
}

export function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}
