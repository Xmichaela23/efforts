import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRAVA_CLIENT_ID = Deno.env.get('STRAVA_CLIENT_ID')!;
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type RefreshBody = { userId: string };

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const { userId }: RefreshBody = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: conn, error: cErr } = await supabase
      .from('device_connections')
      .select('provider_user_id, connection_data')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .single();

    if (cErr || !conn) {
      return new Response(JSON.stringify({ error: 'No Strava connection found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const refreshToken = conn.connection_data?.refresh_token;
    if (!refreshToken) {
      return new Response(JSON.stringify({ error: 'No refresh token stored' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: `Refresh failed: ${resp.status} ${errText}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = await resp.json();

    const { error: uErr } = await supabase
      .from('device_connections')
      .update({
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: new Date(token.expires_at * 1000).toISOString(),
        connection_data: {
          ...(conn.connection_data || {}),
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: token.expires_at,
          last_sync: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'strava');

    if (uErr) {
      return new Response(JSON.stringify({ error: `DB update failed: ${uErr.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      access_token: token.access_token,
      expires_at: token.expires_at,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: `${e}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});


