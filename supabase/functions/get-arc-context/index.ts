/**
 * Lightweight bundle: full `ArcContext` from `getArcContext` (baselines, goals, plan, five_k_nudge, …).
 * Used by the app for inline UI (e.g. 5K nudge) without running full generate-training-context.
 *
 * `arc.builder` is the intake readout (`intake-readout.ts`): the plan builder and season wizard print
 * it instead of working the same facts out on the phone. Send `session_frequency` to get the hours
 * cards' session counts.
 */
import { getArcContext, type ArcContext } from '../_shared/arc-context.ts';
import { requireUser } from '../_shared/require-user.ts';
import { buildIntakeReadout, type SessionFrequencyAsk } from './intake-readout.ts';
import { buildHistoryReadout, HISTORY_WINDOW_DAYS, type HistoryAsk } from './history-readout.ts';

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
    // B1: identity from the VERIFIED JWT, never the request body (was `body.user_id` under service-role).
    const { userId, supabase } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      focus_date?: string;
      date?: string;
      session_frequency?: SessionFrequencyAsk;
      /** The season wizard's history readout (audit H-W10); absent sends none. */
      history?: HistoryAsk;
    };
    const raw = body.focus_date ?? body.date;
    const focusDateISO =
      typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const [arc, effortRes] = await Promise.all([
      getArcContext(supabase, userId, `${focusDateISO.slice(0, 10)}T12:00:00.000Z`) as Promise<ArcContext>,
      // The pace gate's other signals; ArcContext does not carry these columns.
      supabase
        .from('user_baselines')
        .select('effort_score, effort_source_distance, effort_source_time')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    const builder = buildIntakeReadout({
      arc,
      effort: effortRes.data ?? null,
      asOf: focusDateISO,
      sessionFrequency: body.session_frequency ?? null,
    });
    const history = body.history && typeof body.history === 'object'
      ? await (async () => {
        const from = new Date(Date.parse(`${focusDateISO}T00:00:00Z`) - HISTORY_WINDOW_DAYS.swim * 86_400_000)
          .toISOString().slice(0, 10);
        const { data } = await supabase
          .from('workouts')
          .select('date, type, distance, name')
          .eq('user_id', userId)
          .eq('workout_status', 'completed')
          .in('type', ['swim', 'swimming', 'run', 'ride'])
          .gte('date', from)
          .lte('date', focusDateISO);
        return buildHistoryReadout({
          rows: data ?? [],
          today: focusDateISO,
          performanceNumbers: (arc as { performance_numbers?: Record<string, unknown> }).performance_numbers ?? null,
          ask: body.history!,
        });
      })()
      : null;
    return new Response(JSON.stringify({ arc: { ...arc, builder: history ? { ...builder, history } : builder } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    const msg = e instanceof Error ? e.message : String(e);
    if (status !== 401) console.error('[get-arc-context]', msg);
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
