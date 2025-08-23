import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Body = {
  userId: string;
  provider: string;
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info, x-supabase-authorization',
  } as Record<string, string>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors() });

  try {
    const { userId, provider }: Body = await req.json();
    if (!userId || !provider) {
      return new Response(JSON.stringify({ error: 'Missing userId or provider' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } });
    }

    const { error } = await supabase
      .from('device_connections')
      .delete()
      .eq('user_id', userId)
      .eq('provider', provider);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors() } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors() } });
  } catch (e) {
    return new Response(JSON.stringify({ error: `${e}` }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors() } });
  }
});


