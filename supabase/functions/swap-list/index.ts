/**
 * swap-list — the logger's Swap sheet, built on the server (2026-09-18, the Stage C follow-up).
 *
 * POST { rows: [{ name, now? }] } → { lists: SwapGroup[][] }, one list per row in the order sent.
 * `name` is the slot's own movement; `now` is what the row holds after a swap, when it differs.
 * Each list is the slot's own level and pattern as the builder fills it (one heading), the ones the athlete's
 * kit reaches (`_shared/standing-plan/swap-groups.ts`). The phone prints it and decides nothing.
 * The athlete's kit is read here (`user_baselines.equipment.strength`), never sent by the phone.
 */
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { swapGroupsFor } from '../_shared/standing-plan/swap-groups.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const { userId, supabase } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as { rows?: Array<{ name?: unknown; now?: unknown }> };
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 60) : [];
    const { data } = await supabase.from('user_baselines').select('equipment').eq('user_id', userId).maybeSingle();
    const strength = (data?.equipment as { strength?: unknown } | null)?.strength;
    const equipment = Array.isArray(strength) ? strength.map(String) : null;
    const lists = rows.map((r) => {
      const name = typeof r?.name === 'string' ? r.name : '';
      const now = typeof r?.now === 'string' && r.now ? r.now : null;
      return name ? swapGroupsFor(name, equipment, now) : [];
    });
    return json({ lists });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    console.error('[swap-list]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
