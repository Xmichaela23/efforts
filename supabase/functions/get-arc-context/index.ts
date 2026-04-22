/**
 * Lightweight bundle: full `ArcContext` from `getArcContext` (baselines, goals, plan, five_k_nudge, …).
 * Used by the app for inline UI (e.g. 5K nudge) without running full generate-training-context.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getArcContext, type ArcContext } from '../_shared/arc-context.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin' as const,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { user_id?: string; focus_date?: string; date?: string };
    const userId = body.user_id;
    if (!userId || typeof userId !== 'string') {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const raw = body.focus_date ?? body.date;
    const focusDateISO =
      typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : new Date().toISOString().slice(0, 10);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const arc: ArcContext = await getArcContext(supabase, userId, focusDateISO);
    return new Response(JSON.stringify({ arc }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[get-arc-context]', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
