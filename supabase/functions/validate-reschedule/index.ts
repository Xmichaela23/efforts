/**
 * EDGE FUNCTION: validate-reschedule — what the book says about moving one session.
 *
 * Input:  { workout_id, new_date }
 * Output: { refused, notes: string[], days_that_fit: string[] }
 *
 * ⛔ REBUILT ON THE BOOK (2026-09-21, docs/WORKORDER-lost-day-2026-09-21.md "Move check rebuilt on the book").
 * The Jan 2026 "Coach Brain" check — ranked options, workload caps, recovery-hour messages, suggestions — had
 * no page behind it and is gone. The checks and the day-picking live in `_shared/move-check`, which the lost-day
 * step reuses; this function only reads what they need.
 *
 * ⚠️ IT WRITES NOTHING. The move itself is written by the app on the athlete's tap (`src/lib/session-move.ts`).
 * `new_date` equal to the session's own date asks only for the days that fit.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkMove, daysBetween, daysThatFit, type MoveRow } from '../_shared/move-check/index.ts';
import { athleteToday } from '../_shared/plan-refresh.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** How far either side of the move the lift gap looks. p80's floor is 8–9 days; three weeks covers any neighbour. */
const WINDOW_DAYS = 21;
const shift = (d: string, n: number) => {
  const t = new Date(`${d.slice(0, 10)}T12:00:00Z`);
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

    const { workout_id, new_date } = await req.json();
    if (!workout_id || !new_date) return json({ error: 'Missing workout_id or new_date' }, 400);

    const { data: session } = await supabase.from('planned_workouts')
      .select('id, date, type, name, workout_status, training_plan_id')
      .eq('id', workout_id).eq('user_id', user.id).maybeSingle();
    if (!session) return json({ error: 'Workout not found' }, 404);
    // A done session is not moved; the calendar only lets a planned one be dragged. No athlete copy here.
    if (String(session.workout_status ?? 'planned').toLowerCase() !== 'planned') return json({ error: 'not_planned' }, 409);

    const fromDate = String(session.date).slice(0, 10);
    const toDate = String(new_date).slice(0, 10);
    const lo = shift(fromDate < toDate ? fromDate : toDate, -WINDOW_DAYS);
    const hi = shift(fromDate > toDate ? fromDate : toDate, WINDOW_DAYS);
    const { data: rows } = await supabase.from('planned_workouts')
      .select('id, date, type, name, workout_status, training_plan_id')
      .eq('user_id', user.id).gte('date', lo).lte('date', hi);

    // The athlete's days off: the plan's goal answers (`training_prefs.unavailable_days`).
    let daysOff: string[] = [];
    if (session.training_plan_id) {
      const { data: plan } = await supabase.from('plans').select('goal_id').eq('id', session.training_plan_id).maybeSingle();
      if (plan?.goal_id) {
        const { data: goal } = await supabase.from('goals').select('training_prefs').eq('id', plan.goal_id).maybeSingle();
        const raw = (goal?.training_prefs as Record<string, unknown> | null)?.unavailable_days;
        daysOff = Array.isArray(raw) ? raw.map((d) => String(d)) : [];
      }
    }

    const today = await athleteToday(supabase, user.id);
    const all = (rows ?? []) as MoveRow[];
    const s = session as MoveRow;
    const check = daysBetween(fromDate, toDate) === 0
      ? { refused: false, notes: [] }
      : checkMove({ session: s, toDate, rows: all, daysOff });
    return json({
      refused: check.refused,
      notes: check.notes.map((n) => n.text),
      days_that_fit: daysThatFit({ session: s, fromDate, toDate, rows: all, daysOff, today }),
    });
  } catch (e) {
    console.error('[validate-reschedule]', e);
    return json({ error: (e as Error)?.message ?? 'failed' }, 500);
  }
});
