/**
 * athletic-record — My Record's personal-records card and its "Logged suggests" lines, worked out here;
 * the page prints them (2026-09-10, audit H-B11 / H-B12). Read only. The Update button saves through
 * `save-baselines` (`accept: { kind: 'lift' | 'swim_pace', lift?, value }`).
 *
 * POST { date?: 'YYYY-MM-DD' } — the freshness date for logged lifts; today (UTC) when absent.
 * → { success, record }   (shape: `AthleticRecord` in record.ts)
 */
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { buildAthleticRecord } from './record.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as Record<string, string>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const { userId, supabase } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date ?? '')) ? String(body.date) : new Date().toISOString().slice(0, 10);

    const [goals, ftp, rides, bl] = await Promise.all([
      supabase
        .from('goals')
        .select('id, name, target_date, distance, sport, current_value')
        .eq('user_id', userId)
        .eq('goal_type', 'event')
        .eq('status', 'completed')
        .not('current_value', 'is', null),
      supabase
        .from('fitness_baselines')
        .select('value, source_date, created_at')
        .eq('user_id', userId)
        .eq('discipline', 'bike')
        .eq('metric', 'ftp'),
      supabase
        .from('workouts')
        .select('date, moving_time, elapsed_time, duration, overall:computed->overall')
        .eq('user_id', userId)
        .eq('workout_status', 'completed')
        .eq('type', 'ride')
        .order('date', { ascending: true }),
      supabase
        .from('user_baselines')
        .select('performance_numbers, learned_fitness, locked_baselines, updated_at')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    for (const r of [goals, ftp, rides, bl]) if (r.error) throw r.error;

    const record = buildAthleticRecord({
      goals: goals.data ?? [],
      ftpRows: ftp.data ?? [],
      rides: (rides.data ?? []).map((w: Record<string, unknown>) => ({ ...w, computed: { overall: w.overall ?? undefined } })),
      baselines: bl.data ?? null,
      asOf,
    });
    return json({ success: true, record });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    console.error('[athletic-record]', e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
