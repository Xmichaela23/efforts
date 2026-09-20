/**
 * BUILDING AND CACHING THE RECORD TAB'S HISTORY HALF — one implementation, three callers.
 *
 * ⛔ THE TAB MUST NEVER BUILD THIS ON A TAP (2026-09-20, measured on his phone). A cold cache made
 * the first open of every day draw nothing but the Race results card — that card reads `goals`
 * directly, so it does not wait, and everything else was still being computed. 463 workouts cost
 * 3.1 s and 383 KB; the cached read costs 0.19 s and 23 KB.
 *
 * So the build lives here, away from the request, and three things call it:
 *   1. `warm-athletic-record` — the job, fired when a workout arrives or changes, and for the date
 *      roll. This is how the row is normally written.
 *   2. `athletic-record` — only when there is no row at all, which is a brand-new athlete with
 *      almost no history, so the slow path is fast.
 *   3. A stale row is SERVED, not rebuilt: see `cacheIsStale`.
 *
 * ⚠️ IT IS A CACHE, NOT A SECOND COPY OF THE TRUTH. Same rows, same ranker, same formatter. A miss
 * is slower, never different. `docs/WORKORDER-record-store-2026-09-20.md` has the ruling.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { rankAthleticRecords, type RankableWorkout } from './rank.ts';
import { athleticTotals, type TotallableWorkout } from './totals.ts';
import { displayStandings, displayTotals, unitsOf, type Units } from './display.ts';

export type HistoryPayload = { standings: unknown; totals: unknown };

/** `YYYY-MM-DD` in UTC — the same clock `athletic-record` stamps a request with. */
export const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * ⛔ A STALE ROW IS SERVED AND REFRESHED BEHIND THE ATHLETE, NEVER WAITED ON.
 *
 * `as_of` matters because the payload holds "last 4 weeks" and a current year, so yesterday's row is
 * a day out even when no workout changed. That is a reason to REFRESH it, not a reason to make the
 * athlete watch it rebuild — the numbers move by one day's training at most, and an empty screen is
 * worse than a four-week average that is a day behind. This is the same stale-while-revalidate shape
 * `coach_cache` already uses.
 */
export const cacheIsStale = (rowAsOf: unknown, asOf: string): boolean =>
  String(rowAsOf ?? '').slice(0, 10) !== asOf;

/**
 * Read the athlete's history through the projection RPC and build the two halves.
 *
 * ⚠️ `athletic_record_rows` IS PROJECTION ONLY (see its migration): it drops the effort fields the
 * ranker does not read. Ranking and summing still happen here, in one place, with fixtures.
 */
export async function buildHistoryPayload(
  supabase: SupabaseClient,
  userId: string,
  asOf: string,
  units: Units,
): Promise<HistoryPayload> {
  const { data, error } = await supabase.rpc('athletic_record_rows', { p_user_id: userId });
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;

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

  return {
    standings: displayStandings(rankAthleticRecords(rankable), units),
    totals: displayTotals(athleticTotals(totallable, asOf), units),
  };
}

/** The athlete's own units, from `user_baselines`. Imperial when they have not said. */
export async function unitsFor(supabase: SupabaseClient, userId: string): Promise<Units> {
  const { data } = await supabase.from('user_baselines').select('units').eq('user_id', userId).maybeSingle();
  return unitsOf((data as { units?: unknown } | null)?.units);
}

/**
 * Build and store. ⚠️ A WRITE THAT FAILS IS LOGGED AND SWALLOWED — a cache that can make a request
 * or a workout ingest fail is worse than no cache.
 */
export async function refreshAthleticRecordCache(
  supabase: SupabaseClient,
  userId: string,
  logPrefix = 'athletic-record-cache',
): Promise<HistoryPayload | null> {
  try {
    const asOf = today();
    const payload = await buildHistoryPayload(supabase, userId, asOf, await unitsFor(supabase, userId));
    await supabase
      .from('athletic_record_cache')
      .upsert({ user_id: userId, as_of: asOf, payload, generated_at: new Date().toISOString() });
    return payload;
  } catch (e) {
    console.error(`[${logPrefix}] refresh failed:`, e);
    return null;
  }
}
