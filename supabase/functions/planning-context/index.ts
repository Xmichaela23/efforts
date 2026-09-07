/**
 * Returns training history signals for plan generation (wizard, tools).
 * Same logic as create-goal-and-materialize-plan → generate-run-plan body.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUserOrService, AuthError } from '../_shared/require-user.ts';
import { buildRunPlanningContext } from '../_shared/planning-context.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // B1: identity comes from the verified JWT; the service key (internal fan-out / scripts) may name a user in the body. Body user_id is otherwise ignored.
    let userId: string;
    try {
      ({ userId } = await requireUserOrService(req, body.user_id));
    } catch (e) {
      if (e instanceof AuthError) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw e;
    }

    const weeksOutRaw = body.weeks_out;
    const weeksOut = weeksOutRaw != null && Number.isFinite(Number(weeksOutRaw))
      ? Number(weeksOutRaw)
      : null;

    const newDiscipline = String(body.new_discipline || 'run').toLowerCase();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const ctx = await buildRunPlanningContext(supabase, userId, {
      newDiscipline,
      weeksOut,
    });

    return new Response(
      JSON.stringify({
        transition_mode: ctx.transition.mode,
        transition_reasoning: ctx.transition.reasoning,
        current_weekly_miles: ctx.current_weekly_miles ?? null,
        recent_long_run_miles: ctx.recent_long_run_miles ?? null,
        weeks_since_peak_long_run: ctx.weeks_since_peak_long_run ?? null,
        current_acwr: ctx.current_acwr ?? null,
        volume_trend: ctx.volume_trend ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
