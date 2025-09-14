// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!);
    const auth = req.headers.get('Authorization') || '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    const { data: userInfo } = await supabase.auth.getUser(jwt);
    const user = userInfo?.user;
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    const body = await req.json();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const accuracy_m = body?.accuracy_m != null ? Math.round(Number(body.accuracy_m)) : null;
    const source = typeof body?.source === 'string' ? String(body.source) : 'browser';
    const consent_version = typeof body?.consent_version === 'string' ? String(body.consent_version) : null;
    const date = (typeof body?.date === 'string' && /\d{4}-\d{2}-\d{2}/.test(body.date)) ? body.date : (new Date().toISOString().slice(0,10));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(JSON.stringify({ error: 'invalid lat/lng' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const payload: any = { user_id: user.id, date, lat, lng, source, consent_version, captured_at: new Date().toISOString() };
    if (Number.isFinite(accuracy_m)) payload.accuracy_m = accuracy_m;

    const { error } = await supabase
      .from('user_locations')
      .upsert(payload, { onConflict: 'user_id,date' });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
});


