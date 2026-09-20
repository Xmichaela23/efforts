/**
 * athletic-record — My Record's personal-records card and its "Logged suggests" lines, worked out here;
 * the page prints them (2026-09-10, audit H-B11 / H-B12). Read only. The Update button saves through
 * `save-baselines` (`accept: { kind: 'lift' | 'swim_pace', lift?, value }`).
 *
 * POST { date?: 'YYYY-MM-DD' } — the freshness date for logged lifts; today (UTC) when absent.
 * → { success, record, standings, totals }
 *
 * ⛔ `standings` AND `totals` ADDED 2026-09-20 (stage 2, docs/WORKORDER-record-store-2026-09-20.md).
 * They sit BESIDE `record`, which is untouched: the phone screen is stage 3, so nothing it already
 * prints changes shape today. Both are worked out from fields the analysis step already wrote on each
 * workout — this function ranks and sums, it never measures.
 *
 * ⚠️ NO STORED TABLE, DELIBERATELY. A records table has to be rewritten every time a workout arrives,
 * is edited, is deleted or is recomputed, and that is the one way these numbers can start disagreeing
 * with the workouts under them. Reading the rows each time cannot go stale. Revisit only if this read
 * gets slow — it is one narrow query per athlete.
 *
 * ⚠️ EVERY QUERY IS SCOPED TO THE CALLER'S OWN `userId`, taken from the verified JWT and never from
 * the body. An unscoped read is what produced the withdrawn "every ride is stored twice" finding on
 * 2026-09-19: a second test account holds a copy of the same Garmin history.
 */
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { buildAthleticRecord } from './record.ts';
import { rankAthleticRecords, type RankableWorkout } from '../_shared/athletic-record/rank.ts';
import { athleticTotals, type TotallableWorkout } from '../_shared/athletic-record/totals.ts';
// The screen prints strings, never metres and seconds — the phone does not convert a unit the server
// can (`record.ts` has sent a `display` beside every `seconds` since 2026-09-10 for the same reason).
import { displayStandings, displayTotals, unitsOf } from '../_shared/athletic-record/display.ts';

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

    const [goals, ftp, rides, bl, history] = await Promise.all([
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
        .select('performance_numbers, learned_fitness, locked_baselines, updated_at, units')
        .eq('user_id', userId)
        .maybeSingle(),
      /**
       * ⛔ NAMED JSON KEYS, NEVER `computed` WHOLE. `computed.analysis.series` holds every recorded
       * sample of every session; selecting the column would pull megabytes per athlete and time the
       * query out — the same trap `_shared/workout-list-select.ts` was written for.
       *
       * ⚠️ `workout_status` IS NOT FILTERED TO 'completed' HERE. Older rows carry no status at all,
       * and `.eq('workout_status','completed')` would silently drop them from the totals. Planned
       * rows are excluded by name instead, and `athleticTotals` checks again.
       */
      supabase
        .from('workouts')
        .select('id, date, name, type, workout_status, distance, elevation_gain, moving_time, elapsed_time, duration, run_records:computed->run_records, ride_records:computed->ride_records, power_curve:computed->power_curve, overall:computed->overall')
        .eq('user_id', userId)
        .or('workout_status.is.null,workout_status.neq.planned')
        .order('date', { ascending: true }),
    ]);
    for (const r of [goals, ftp, rides, bl, history]) if (r.error) throw r.error;

    // One row shape, two readers: the ranker wants the per-workout record objects, the totals want
    // the durations. Both are pure and neither knows where the rows came from.
    const rows = (history.data ?? []) as Array<Record<string, unknown>>;
    const rankable: RankableWorkout[] = rows.map((w) => ({
      id: String(w.id),
      date: String(w.date),
      name: (w.name as string | null) ?? null,
      type: (w.type as string | null) ?? null,
      distance: (w.distance as number | null) ?? null,
      elevation_gain: (w.elevation_gain as number | null) ?? null,
      computed: {
        run_records: (w.run_records ?? null) as never,
        ride_records: (w.ride_records ?? null) as never,
        power_curve: (w.power_curve ?? null) as never,
      },
    }));
    const totallable: TotallableWorkout[] = rows.map((w) => ({
      date: String(w.date),
      type: (w.type as string | null) ?? null,
      workout_status: (w.workout_status as string | null) ?? null,
      distance: (w.distance as number | null) ?? null,
      moving_time: (w.moving_time as number | null) ?? null,
      elapsed_time: (w.elapsed_time as number | null) ?? null,
      duration: (w.duration as number | null) ?? null,
      elevation_gain: (w.elevation_gain as number | null) ?? null,
      computed: { overall: (w.overall ?? null) as never },
    }));

    // The athlete's own units, not the sport's and not the distance label's.
    const units = unitsOf((bl.data as { units?: unknown } | null)?.units);

    const record = buildAthleticRecord({
      goals: goals.data ?? [],
      ftpRows: ftp.data ?? [],
      rides: (rides.data ?? []).map((w: Record<string, unknown>) => ({ ...w, computed: { overall: w.overall ?? undefined } })),
      baselines: bl.data ?? null,
      asOf,
    });
    return json({
      success: true,
      record,
      standings: displayStandings(rankAthleticRecords(rankable), units),
      totals: displayTotals(athleticTotals(totallable, asOf), units),
      units,
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    console.error('[athletic-record]', e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
