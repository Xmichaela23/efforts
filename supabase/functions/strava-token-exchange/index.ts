import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRAVA_CLIENT_ID = Deno.env.get('STRAVA_CLIENT_ID')!;
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type ExchangeBody = {
  code: string;
  userId: string;
  redirectUri?: string;
};

type StravaTokenResp = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  athlete?: { id: number };
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info, x-supabase-authorization',
  } as Record<string, string>;
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors() });

    const { code, userId, redirectUri }: ExchangeBody = await req.json();
    if (!code || !userId) {
      return new Response(JSON.stringify({ error: 'Missing code or userId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    }

    const body: Record<string, string> = {
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    };
    if (redirectUri) body.redirect_uri = redirectUri;

    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: `Strava token error: ${resp.status} ${errText}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    }

    const token: StravaTokenResp = await resp.json();
    const stravaUserId = token.athlete?.id?.toString() || '';

    const { error } = await supabase
      .from('device_connections')
      .upsert({
        user_id: userId,
        provider: 'strava',
        provider_user_id: stravaUserId,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: new Date(token.expires_at * 1000).toISOString(),
        connection_data: {
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: token.expires_at,
          last_sync: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' });

    if (error) {
      return new Response(JSON.stringify({ error: `DB error: ${error.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    }

    // Best-effort: fetch athlete's HR zones from Strava and store
    try {
      const zonesResp = await fetch('https://www.strava.com/api/v3/athlete/zones', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (zonesResp.ok) {
        const zonesData = await zonesResp.json();
        const hrZones = zonesData?.heart_rate;
        if (hrZones?.zones && Array.isArray(hrZones.zones) && hrZones.zones.length > 0) {
          const configuredZones = {
            source: 'strava',
            custom_zones: hrZones.custom_zones ?? false,
            zones: hrZones.zones.map((z: any) => ({
              min: Number(z.min) || 0,
              max: z.max === -1 ? null : (Number(z.max) || null),
            })),
            max_heart_rate: null as number | null,
            threshold_heart_rate: null as number | null,
            resting_heart_rate: null as number | null,
            updated_at: new Date().toISOString(),
          };
          // Infer max HR from the last zone boundary (the one before the open-ended zone)
          const lastBounded = hrZones.zones.filter((z: any) => z.max > 0);
          if (lastBounded.length > 0) {
            configuredZones.max_heart_rate = Math.max(...lastBounded.map((z: any) => Number(z.max)));
          }
          await supabase
            .from('user_baselines')
            .upsert(
              { user_id: userId, configured_hr_zones: configuredZones },
              { onConflict: 'user_id' }
            );
          console.log(`[STRAVA ZONES] Stored ${hrZones.zones.length} HR zones for user ${userId} (custom: ${hrZones.custom_zones})`);
        }
      }
    } catch (e) {
      console.warn('[STRAVA ZONES] Non-fatal error fetching zones:', e);
    }

    return new Response(JSON.stringify({ success: true, stravaUserId, expires_at: token.expires_at }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `${e}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }
});

