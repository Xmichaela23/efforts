import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type StravaTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string };

/**
 * Returns a usable Strava access token for `userId`, refreshing via OAuth when stale.
 * Mirrors `reingest-activity` / `strava-webhook` persistence shape on `device_connections`.
 */
export async function ensureStravaAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<StravaTokenResult> {
  const { data: conn, error: cErr } = await supabase
    .from('device_connections')
    .select('connection_data, access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'strava')
    .maybeSingle();

  if (cErr || !conn) {
    return { ok: false, error: 'No Strava connection — link Strava in Settings / Integrations.' };
  }

  let accessToken = conn.connection_data?.access_token ?? conn.access_token ?? '';
  const refreshToken = conn.connection_data?.refresh_token ?? conn.refresh_token ?? '';

  const expiresAtSec = conn.expires_at
    ? Math.floor(new Date(conn.expires_at).getTime() / 1000)
    : typeof conn.connection_data?.expires_at === 'number'
      ? conn.connection_data.expires_at
      : undefined;
  const now = Math.floor(Date.now() / 1000);
  const stale =
    !accessToken || (typeof expiresAtSec === 'number' && expiresAtSec - now < 300);

  if (!stale) return { ok: true, accessToken };

  if (!refreshToken) {
    return { ok: false, error: 'Strava token expired — reconnect Strava.' };
  }

  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Server missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET.' };
  }

  const tr = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!tr.ok) {
    const txt = await tr.text().catch(() => '');
    console.warn('[strava-access-token] refresh failed', tr.status, txt.slice(0, 200));
    return { ok: false, error: 'Could not refresh Strava token — reconnect Strava.' };
  }

  const tokenJson = (await tr.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
  accessToken = tokenJson.access_token ?? '';
  if (!accessToken) return { ok: false, error: 'Strava refresh returned no access_token.' };

  const newRefresh = tokenJson.refresh_token || refreshToken;
  const expiresAtIso = new Date((tokenJson.expires_at ?? 0) * 1000).toISOString();

  await supabase
    .from('device_connections')
    .update({
      access_token: accessToken,
      refresh_token: newRefresh,
      expires_at: expiresAtIso,
      connection_data: {
        ...(conn.connection_data ?? {}),
        access_token: accessToken,
        refresh_token: newRefresh,
        expires_at: tokenJson.expires_at,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'strava');

  return { ok: true, accessToken };
}
