/**
 * ⛔ THE GEAR LIST, WITH EACH DISTANCE ALREADY IN THE ATHLETE'S UNIT (2026-09-16, Stage 7 session 1).
 *
 * No existing reply carried the gear list: the Gear screen and the Details gear picker each read the
 * `gear` table on the phone and turned metres into miles there. This reply is that read, plus the
 * printed distance. The screens' writes (add / set default / retire / pick) stay where they are.
 *
 * POST { type?: 'shoe' | 'bike' }  (JWT required)
 *   → { gear: [{ ...gear row, distance_display, distance_whole_display }] }  — not retired, default first, then name.
 */
import { requireUser } from '../_shared/require-user.ts';
import { displayFormat } from '../_shared/display-format.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin' as const,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { userId, supabase } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as { type?: unknown };
    const type = body.type === 'shoe' || body.type === 'bike' ? body.type : null;

    let q = supabase
      .from('gear')
      .select('*')
      .eq('user_id', userId)
      .eq('retired', false)
      .order('is_default', { ascending: false })
      .order('name');
    if (type) q = q.eq('type', type);

    const [gearRes, ubRes] = await Promise.all([
      q,
      // Same column and default as `workout-detail`'s display_metrics.
      supabase.from('user_baselines').select('units').eq('user_id', userId).maybeSingle(),
    ]);
    if (gearRes.error) throw new Error(gearRes.error.message);
    const metric = String((ubRes.data as { units?: unknown } | null)?.units ?? 'imperial').toLowerCase() === 'metric';
    const fmt = displayFormat(metric);

    const gear = ((gearRes.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const metres = Number(row.total_distance) || 0;
      return {
        ...row,
        distance_display: fmt.distanceMetresUnderMile(metres),
        // The Gear screen's shape: whole mi / km; no distance prints "0 mi".
        distance_whole_display: fmt.distanceWhole(metres > 0 ? metres : 0),
      };
    });
    return json({ gear });
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500;
    const msg = e instanceof Error ? e.message : String(e);
    if (status !== 401) console.error('[gear-list]', msg);
    return json({ error: msg }, status);
  }
});
