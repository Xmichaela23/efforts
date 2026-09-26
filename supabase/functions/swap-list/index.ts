/**
 * swap-list — the logger's Swap sheet, built on the server (2026-09-18, the Stage C follow-up).
 *
 * POST { rows: [{ name, now?, cell? }] } → { lists: SwapGroup[][] }, one list per row in the order sent.
 * `name` is the slot's own movement; `now` is what the row holds after a swap, when it differs; `cell` is the slot the
 * row fills ({ category, pattern }, the composer's `slot_category` / `slot_pattern`, 2026-09-25) — the sheet is that
 * cell first, so a braced hinge row holding a stand-in still lists the slot's own printed movements the kit reaches;
 * `admits` is the row's own `swap_options` names, the frame's admitted movements for the slot. With the slot's pick
 * key and frame on the cell (`slot_key` / `slot_frame`) the list is the slot's own picker union — muscle, admitted
 * movements and widening — the way the composer and the picking screen build it.
 * Each list is the slot's own level and pattern as the builder fills it (one heading), the ones the athlete's
 * kit reaches (`_shared/standing-plan/swap-groups.ts`). The phone prints it and decides nothing.
 * A row holding a plyo drill gets the other drills in its family, under no heading (`plyoSwapGroups`, p227; moved
 * from the logger 2026-09-18). Every option carries the row's name and how-to on this kit (`execution_name`, `how_to`).
 * The athlete's kit is read here (`user_baselines.equipment.strength`), never sent by the phone.
 */
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { plyoFamilyFor, plyoSwapGroups, slotCellOf, swapGroupsFor } from '../_shared/standing-plan/swap-groups.ts';

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
    const body = (await req.json().catch(() => ({}))) as {
      rows?: Array<{ name?: unknown; now?: unknown; cell?: { category?: unknown; pattern?: unknown; key?: unknown; frame?: unknown } | null; admits?: unknown }>;
    };
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 60) : [];
    const { data } = await supabase.from('user_baselines').select('equipment').eq('user_id', userId).maybeSingle();
    const strength = (data?.equipment as { strength?: unknown } | null)?.strength;
    const equipment = Array.isArray(strength) ? strength.map(String) : null;
    const lists = rows.map((r) => {
      const name = typeof r?.name === 'string' ? r.name : '';
      const now = typeof r?.now === 'string' && r.now ? r.now : null;
      const current = now ?? name;
      if (current && plyoFamilyFor(current)) return plyoSwapGroups(current, equipment);
      const cell = r?.cell && typeof r.cell === 'object'
        ? slotCellOf({ slot_category: r.cell.category, slot_pattern: r.cell.pattern, slot_key: r.cell.key, slot_frame: r.cell.frame })
        : null;
      // The frame's admitted movements for the slot, as the row's own `swap_options` name them (2026-09-25).
      const admits = Array.isArray(r?.admits) ? (r.admits as unknown[]).slice(0, 30).map(String).filter((x) => x.trim()) : null;
      return name ? swapGroupsFor(name, equipment, now, cell, admits) : [];
    });
    return json({ lists });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    console.error('[swap-list]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
