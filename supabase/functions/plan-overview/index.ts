// @ts-nocheck
/**
 * plan-overview — the athlete's plans with their current week, phase and totals (2026-09-10, audit
 * item 15: H-B09, H-P03, H-P02).
 *
 * ⛔ THE PHONE PRINTS THESE; IT NO LONGER WORKS THEM OUT. AppContext read `plans` straight from the
 * table and counted the current week itself; the plans screen counted it again another way, guessed
 * each week's phase from its text, and summed its totals over the weeks opened. The rules now live in
 * `_shared/plan-overview.ts`, on `get-week`'s week rule and the plan's own phase words.
 *
 * Two calls:
 *   · {}                     → { plans: [plan row + current_week_index, current_phase, total_weeks, progress_pct] }
 *   · { plan_id }            → { plan: (same), overview: { current_week_index, total_weeks, progress_pct, weeks, phases, totals } }
 * `as_of` (YYYY-MM-DD, the athlete's calendar date) is optional; without it the server's date is used.
 */
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { buildPlanOverview, planListFields } from '../_shared/plan-overview.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  try {
    const { userId, supabase } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.as_of ?? '')) ? String(body.as_of) : new Date().toISOString().slice(0, 10);
    const planId = typeof body?.plan_id === 'string' && body.plan_id.trim() ? body.plan_id.trim() : null;

    if (!planId) {
      const { data: plans, error } = await supabase
        .from('plans').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true, plans: (plans ?? []).map((p) => ({ ...p, ...planListFields(p, asOf) })) });
    }

    const { data: plan, error: planErr } = await supabase
      .from('plans').select('*').eq('id', planId).eq('user_id', userId).maybeSingle();
    if (planErr) return json({ success: false, error: planErr.message }, 500);
    if (!plan) return json({ success: false, error: 'Plan not found' }, 404);
    const { data: rows, error: rowsErr } = await supabase
      .from('planned_workouts')
      .select('week_number,type,name,tags,duration,total_duration_seconds,computed,intervals')
      .eq('training_plan_id', planId)
      .eq('user_id', userId);
    if (rowsErr) return json({ success: false, error: rowsErr.message }, 500);
    return json({
      success: true,
      plan: { ...plan, ...planListFields(plan, asOf) },
      overview: buildPlanOverview({ plan, rows: rows ?? [], asOfIso: asOf }),
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ success: false, error: e.message }, e.status);
    return json({ success: false, error: e?.message ?? String(e) }, 500);
  }
});
