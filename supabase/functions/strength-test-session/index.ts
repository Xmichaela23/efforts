// @ts-nocheck
/**
 * strength-test-session — the rows the strength logger opens a baseline test or a retest with.
 *
 * ⛔ 2026-09-10, audit H-S01 / H-S02 (Stage 3 item 21). The logger built these sessions on the phone; it
 * now asks here and prints what comes back. See `_shared/strength/test-session.ts`.
 *
 * POST { planned_workout_id } — a planned `1rm_test` session (test week, retest).
 * POST { test_type: 'lower' | 'upper' | 'full' } — the Baselines launcher, which has no planned row.
 * → { success, exercises: TestSessionRow[] }
 * POST { anchor_weight, round_to } — the weight the athlete logged on an anchor set (set 1 of a test with no max
 * on file) and the row's `anchor_round_to`. → { success, steps } — `pretestStepWeights`: the rounded A, then
 * 1.10A and 1.15A rounded (a step equal to a later one is null). The logger fills sets 2 and 3 from `steps[1]`
 * and `steps[2]` and works nothing out itself (2026-09-18).
 */
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { launcherTestSession, plannedTestSession } from '../_shared/strength/test-session.ts';
import { pretestStepWeights } from '../_shared/standing-plan/working-number.ts';

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

    if (body?.anchor_weight != null) {
      const a = Number(body.anchor_weight);
      const roundTo = Number(body?.round_to);
      return json({ success: true, steps: roundTo > 0 ? pretestStepWeights(a, roundTo) : null });
    }

    const { data: baselines } = await supabase
      .from('user_baselines').select('performance_numbers, units').eq('user_id', userId).maybeSingle();
    const perfRaw = baselines?.performance_numbers;
    const perf = typeof perfRaw === 'string' ? JSON.parse(perfRaw || '{}') : (perfRaw ?? {});
    // The athlete's unit, the column every other strength surface reads (materialize-plan, workout-detail).
    const metric = String(baselines?.units ?? 'imperial') === 'metric';

    const plannedId = typeof body?.planned_workout_id === 'string' && body.planned_workout_id.trim()
      ? body.planned_workout_id.trim() : null;
    if (plannedId) {
      const { data: row, error } = await supabase
        .from('planned_workouts').select('id, name, tags, strength_exercises')
        .eq('id', plannedId).eq('user_id', userId).maybeSingle();
      if (error) return json({ success: false, error: error.message }, 500);
      if (!row) return json({ success: false, error: 'Planned workout not found' }, 404);
      const rows = Array.isArray(row.strength_exercises) ? row.strength_exercises : [];
      return json({ success: true, exercises: plannedTestSession(rows, row.tags, perf, undefined, metric) });
    }

    const type = String(body?.test_type ?? '');
    if (type === 'lower' || type === 'upper' || type === 'full') {
      return json({ success: true, exercises: launcherTestSession(type, perf, undefined, metric) });
    }
    return json({ success: false, error: 'planned_workout_id or test_type required' }, 400);
  } catch (e) {
    if (e instanceof AuthError) return json({ success: false, error: e.message }, e.status);
    return json({ success: false, error: e?.message ?? String(e) }, 500);
  }
});
