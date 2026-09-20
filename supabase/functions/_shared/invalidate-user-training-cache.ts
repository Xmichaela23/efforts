/**
 * Aligns with ingest-activity: when training / plan truth changes, drop block-level
 * adaptation aggregates and mark coach_cache stale so State + adaptation recompute.
 *
 * ⛔ ONE PLACE, SO A NEW CACHE CANNOT BE FORGOTTEN. Six functions call this
 * (`ingest-activity`, `recompute-workout`, `create-goal-and-materialize-plan`, `delete-plan`,
 * `generate-combined-plan`, `run-jobs`). A cache added here is invalidated by all of them at once;
 * a cache invalidated at its own call sites is a cache that goes stale the first time somebody adds
 * a seventh caller.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { refreshAthleticRecordCache } from './athletic-record/build.ts';

export async function invalidateUserTrainingCache(
  supabase: SupabaseClient,
  userId: string,
  logPrefix = 'invalidate-user-training-cache',
): Promise<void> {
  try {
    await supabase.from('block_adaptation_cache').delete().eq('user_id', userId);
  } catch (e) {
    console.error(`[${logPrefix}] Failed to invalidate block_adaptation_cache:`, e);
  }
  try {
    await supabase
      .from('coach_cache')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('user_id', userId);
  } catch (e) {
    console.error(`[${logPrefix}] Failed to invalidate coach_cache:`, e);
  }
  /**
   * ⛔ THE RECORD TAB'S CACHE IS REBUILT HERE, NOT DROPPED (2026-09-20, after it was measured on his
   * phone). Dropping the row just moves the 3.1 s and 383 KB onto whoever opens the tab next, and
   * because `as_of` expires it daily that was the first open of every day — he got a screen holding
   * nothing but a five-month-old race and read it as broken.
   *
   * ⚠️ Every caller of this helper is a BACKGROUND path (`ingest-activity` via `recompute-workout`,
   * `run-jobs`, the plan generators, `delete-plan`), so the second it costs here is a second nobody
   * is waiting on. Never call this from something an athlete is watching.
   *
   * ⚠️ The row is REPLACED, not deleted first: a delete followed by a slow rebuild leaves a window
   * where the tab has nothing to serve, which is the exact hole this closes. If the rebuild throws,
   * `refreshAthleticRecordCache` swallows it and the old row stands — a day-old average beats a
   * blank screen, and the next workout or the date roll will try again.
   */
  try {
    await refreshAthleticRecordCache(supabase, userId, logPrefix);
  } catch (e) {
    console.error(`[${logPrefix}] Failed to refresh athletic_record_cache:`, e);
  }
}
