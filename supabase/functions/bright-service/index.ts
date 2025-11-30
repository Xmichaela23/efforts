import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GARMIN_CLIENT_ID = Deno.env.get('GARMIN_CLIENT_ID')!;
const GARMIN_CLIENT_SECRET = Deno.env.get('GARMIN_CLIENT_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type ExchangeBody = {
  code: string;
  codeVerifier: string;
  redirectUri?: string;
};

type GarminTokenResp = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
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

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    }

    // Extract user_id from JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    }

    const userId = user.id;

    const { code, codeVerifier, redirectUri }: ExchangeBody = await req.json();
    if (!code || !codeVerifier) {
      return new Response(JSON.stringify({ error: 'Missing code or codeVerifier' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    }

    // Exchange code for tokens with Garmin
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: GARMIN_CLIENT_ID,
      client_secret: GARMIN_CLIENT_SECRET,
      code: code,
      code_verifier: codeVerifier,
    });
    if (redirectUri) body.append('redirect_uri', redirectUri);

    console.log('🔍 BRIGHT-SERVICE: Exchanging code for tokens for user_id:', userId);
    console.log('🔍 BRIGHT-SERVICE: Code starts with:', code.substring(0, 20) + '...');
    console.log('🔍 BRIGHT-SERVICE: CodeVerifier starts with:', codeVerifier.substring(0, 20) + '...');

    const resp = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('❌ BRIGHT-SERVICE: Token exchange failed:', resp.status, errText);
      return new Response(JSON.stringify({ error: `Garmin token error: ${resp.status} ${errText}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    }

    const token: GarminTokenResp = await resp.json();
    
    // Log what Garmin returned
    console.log('🔍 BRIGHT-SERVICE: Garmin returned tokens for user_id:', userId);
    console.log('🔍 BRIGHT-SERVICE: Access token starts with:', token.access_token?.substring(0, 30));
    console.log('🔍 BRIGHT-SERVICE: Refresh token starts with:', token.refresh_token?.substring(0, 30));

    // Fetch Garmin user ID
    console.log('🔍 BRIGHT-SERVICE: Fetching Garmin user ID...');
    const userInfoResp = await fetch('https://apis.garmin.com/wellness-api/rest/user/id', {
      headers: { 'Authorization': `Bearer ${token.access_token}` },
    });

    let garminUserId: string | null = null;
    if (userInfoResp.ok) {
      const userInfo = await userInfoResp.json();
      garminUserId = userInfo?.userId || null;
      console.log('🔍 BRIGHT-SERVICE: Raw userInfo response:', JSON.stringify(userInfo));
      console.log('🔍 BRIGHT-SERVICE: Extracted Garmin user ID:', garminUserId);
    } else {
      console.warn('⚠️ BRIGHT-SERVICE: Failed to fetch Garmin user ID:', userInfoResp.status);
    }

    // CRITICAL: Save tokens to database with CORRECT user_id
    const expiresAt = new Date(Date.now() + (token.expires_in * 1000)).toISOString();
    
    const connectionData = {
      user_id: userId, // CRITICAL: Use the authenticated user's ID
      provider: 'garmin',
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: expiresAt,
      connection_data: {
        user_id: garminUserId,
        display_name: 'Garmin User',
        token_type: token.token_type || 'bearer',
        scope: token.scope,
      },
    };

    console.log('🔍 BRIGHT-SERVICE: About to save connection_data:', JSON.stringify(connectionData.connection_data));
    console.log('🔍 BRIGHT-SERVICE: Saving for app user_id:', userId);
    console.log('🔍 BRIGHT-SERVICE: Access token being saved starts with:', token.access_token?.substring(0, 30));

    // Check if connection exists
    const { data: existing } = await supabase
      .from('user_connections')
      .select('id, user_id, access_token')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .maybeSingle();

    let saveError;
    if (existing) {
      console.log('🔍 BRIGHT-SERVICE: Updating existing connection id=', existing.id, 'for user_id=', userId);
      console.log('🔍 BRIGHT-SERVICE: Existing token starts with:', existing.access_token?.substring(0, 30));
      const { error } = await supabase
        .from('user_connections')
        .update(connectionData)
        .eq('id', existing.id)
        .eq('user_id', userId); // CRITICAL: Double-check user_id in WHERE clause
      saveError = error;
    } else {
      console.log('🔍 BRIGHT-SERVICE: Inserting new connection for user_id=', userId);
      const { error } = await supabase
        .from('user_connections')
        .insert(connectionData);
      saveError = error;
    }

    if (saveError) {
      console.error('❌ BRIGHT-SERVICE: Database save error:', saveError);
      return new Response(JSON.stringify({ error: `DB error: ${saveError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors() },
      });
    }

    // Verify what was saved
    const { data: verify } = await supabase
      .from('user_connections')
      .select('id, user_id, access_token, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'garmin')
      .maybeSingle();
    
    console.log('✅ Saved Garmin connection for user', userId, 'with Garmin ID:', garminUserId);
    console.log('🔍 BRIGHT-SERVICE: VERIFICATION - Saved access_token starts with:', verify?.access_token?.substring(0, 30), 'for user_id:', verify?.user_id);

    // Return tokens to frontend (frontend will also save, but that's OK - it will update with same data)
    return new Response(JSON.stringify({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.expires_in,
      expires_at: expiresAt,
      token_type: token.token_type || 'bearer',
      scope: token.scope,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...cors() },
    });
  } catch (e) {
    console.error('❌ BRIGHT-SERVICE: Unexpected error:', e);
    return new Response(JSON.stringify({ error: `${e}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors() },
    });
  }
});

