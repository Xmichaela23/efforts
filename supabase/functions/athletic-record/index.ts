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
 *
 * ⛔ THE HISTORY HALF IS CACHED; THE BASELINE HALF IS NOT (2026-09-20). Reading 463 workouts and
 * ranking them is the slow part and the athlete felt it — the tab sat on a spinner every open. That
 * result is cached per athlete per day in `athletic_record_cache` and dropped by
 * `_shared/invalidate-user-training-cache.ts` whenever a workout arrives, is edited, is deleted or is
 * recomputed.
 *
 * ⚠️ `record` — the lifts, the swim pace, the FTP best, the races — is DELIBERATELY NOT CACHED. It
 * comes from `user_baselines` and `goals` in two small queries, and it is what the "Logged suggests …
 * Update" button writes. Caching it would mean a tap that saves a lift shows the old number until
 * something unrelated invalidates the row, and nothing in `save-baselines` invalidates anything.
 * Cache the expensive thing, not everything.
 *
 * ⛔ AND IT IS A CACHE, NOT THE RECORDS TABLE HE RULED OUT. A table is a second copy of the truth
 * that every writer has to keep in step; this is the same read, from the same rows, by the same code,
 * thrown away when those rows change. A miss is slower, never different.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { buildAthleticRecord } from './record.ts';
// The screen prints strings, never metres and seconds — the phone does not convert a unit the server
// can (`record.ts` has sent a `display` beside every `seconds` since 2026-09-10 for the same reason).
import { monthDisplay, unitsOf } from '../_shared/athletic-record/display.ts';
import { buildHistoryPayload, cacheIsStale, type HistoryPayload } from '../_shared/athletic-record/build.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as Record<string, string>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/**
 * Service-role client, for the cache row only. The request's own client is RLS-scoped and may read
 * its row but not write one — deliberately, so nothing on the phone can put a value into a cache the
 * server serves back.
 */
const cacheClient = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const { userId, supabase } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date ?? '')) ? String(body.date) : new Date().toISOString().slice(0, 10);

    /**
     * ⚠️ THE DATE IS PART OF THE KEY. The payload holds "last 4 weeks" and a current year, so a row
     * computed yesterday is the wrong answer today even when no workout changed. A different `as_of`
     * is a miss, not a hit.
     * ⚠️ A CACHE READ THAT FAILS IS A MISS, never an error the athlete sees — the whole point is that
     * the slow path still gives the right answer.
     */
    const cacheDb = cacheClient();
    let cached: HistoryPayload | null = null;
    let staleRefreshNeeded = false;
    try {
      const { data } = await cacheDb
        .from('athletic_record_cache')
        .select('payload, as_of')
        .eq('user_id', userId)
        .maybeSingle();
      if (data) {
        cached = data.payload as HistoryPayload;
        staleRefreshNeeded = cacheIsStale(data.as_of, asOf);
      }
    } catch (e) {
      console.warn('[athletic-record] cache read failed, computing:', e);
    }

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
        .select('performance_numbers, learned_fitness, locked_baselines, updated_at, units')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    for (const r of [goals, ftp, rides, bl]) if (r.error) throw r.error;


    // The athlete's own units, not the sport's and not the distance label's.
    const units = unitsOf((bl.data as { units?: unknown } | null)?.units);

    const record = buildAthleticRecord({
      goals: goals.data ?? [],
      ftpRows: ftp.data ?? [],
      rides: (rides.data ?? []).map((w: Record<string, unknown>) => ({ ...w, computed: { overall: w.overall ?? undefined } })),
      baselines: bl.data ?? null,
      asOf,
    });
    // The FTP best's date prints as a month like every other date on this screen. Formatted here,
    // not on the phone, for the same reason the distances are (`display.ts`).
    const recordOut = record.ftp_best
      ? { ...record, ftp_best: { ...record.ftp_best, date_display: monthDisplay(record.ftp_best.date) } }
      : record;

    /**
     * ⛔ THE CACHE IS WRITTEN AFTER THE ANSWER IS BUILT, AND ITS FAILURE CHANGES NOTHING. A cache that
     * can make a request fail is worse than no cache.
     */
    const history_payload: HistoryPayload = cached ?? await buildHistoryPayload(cacheDb, userId, asOf, units);
    if (!cached) {
      // Only a brand-new athlete reaches this, and they have almost no history to read.
      try {
        await cacheDb
          .from('athletic_record_cache')
          .upsert({ user_id: userId, as_of: asOf, payload: history_payload, generated_at: new Date().toISOString() });
      } catch (e) {
        console.warn('[athletic-record] cache write failed, answer unaffected:', e);
      }
    } else if (staleRefreshNeeded) {
      /**
       * ⛔ A DAY-OLD ROW IS SERVED NOW AND REBUILT BEHIND THE ATHLETE. `as_of` expires the row every
       * midnight with no workout involved, and making the first open of the day pay 3.1 s for that is
       * what he saw as a broken screen. The numbers move by at most one day of training; a blank tab
       * does not. Queued, not awaited — `run-jobs` owns the rebuild.
       */
      try {
        await cacheDb.from('jobs').insert({ kind: 'warm-athletic-record', user_id: userId, payload: {} });
      } catch (e) {
        console.warn('[athletic-record] could not queue the date-roll refresh:', e);
      }
    }

    return json({
      success: true,
      record: recordOut,
      standings: history_payload.standings,
      totals: history_payload.totals,
      units,
      cached: cached != null,
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    console.error('[athletic-record]', e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
