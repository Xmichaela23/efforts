/**
 * EDGE FUNCTION: place-lost-day — "Can't train this day" (2026-09-21, docs/WORKORDER-lost-day-2026-09-21.md Stage 1).
 *
 * Input:  { date, moves?: { [session_id]: date } }
 * Output: LostDayPlan (`_shared/move-check/lost-day.ts`) — the week with the lost day's sessions placed, and the move
 *         check's notes for each session that moves.
 *
 * ⛔ IT WRITES NOTHING. The screen re-asks on every drag; Accept saves through the calendar's own move path
 * (`src/lib/session-move.ts`), so a lost-day move is recorded and stays moved exactly like a drag.
 * ⛔ THE PLACEMENT IS THE MOVE CHECK'S (`_shared/move-check`) — the same notes a calendar drag shows.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { placeLostDay } from '../_shared/move-check/lost-day.ts';
import type { MoveRow } from '../_shared/move-check/index.ts';
import { athleteToday } from '../_shared/plan-refresh.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const shift = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) return json({ error: 'Invalid authentication' }, 401);

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date ?? '').slice(0, 10);
    if (!ISO.test(date)) return json({ error: 'date required (YYYY-MM-DD)' }, 400);
    const moves: Record<string, string> = {};
    if (body?.moves && typeof body.moves === 'object') {
      for (const [id, to] of Object.entries(body.moves as Record<string, unknown>)) {
        const d = String(to ?? '').slice(0, 10);
        if (ISO.test(d)) moves[String(id)] = d;
      }
    }

    const today = await athleteToday(supabase, user.id);
    // Only today and later. The calendar offers the entry on those days only; no athlete copy here.
    if (date < today) return json({ error: 'past_day' }, 422);

    // Three weeks either side covers the p80 gap for a lift near the week's edges.
    const { data: rows } = await supabase.from('planned_workouts')
      .select('id, date, type, name, workout_status, training_plan_id, tags, duration')
      .eq('user_id', user.id).gte('date', shift(date, -28)).lte('date', shift(date, 28));
    const all = (rows ?? []) as MoveRow[];

    // The athlete's days off: the goal answers of the plan(s) behind the lost day's sessions.
    const planIds = [...new Set(all.filter((r) => String(r.date).slice(0, 10) === date && r.training_plan_id).map((r) => String(r.training_plan_id)))];
    const daysOff = new Set<string>();
    if (planIds.length > 0) {
      const { data: plans } = await supabase.from('plans').select('goal_id').in('id', planIds);
      const goalIds = (plans ?? []).map((p: { goal_id?: string | null }) => p.goal_id).filter(Boolean);
      if (goalIds.length > 0) {
        const { data: goals } = await supabase.from('goals').select('training_prefs').in('id', goalIds);
        for (const g of goals ?? []) {
          const raw = (g?.training_prefs as Record<string, unknown> | null)?.unavailable_days;
          if (Array.isArray(raw)) for (const d of raw) daysOff.add(String(d));
        }
      }
    }

    return json(placeLostDay({ lostDate: date, rows: all, daysOff: [...daysOff], today, moves }));
  } catch (e) {
    console.error('[place-lost-day]', e);
    return json({ error: (e as Error)?.message ?? 'failed' }, 500);
  }
});
