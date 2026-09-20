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
   * The Record tab's standings and totals (2026-09-20). Deleted rather than marked stale: there is
   * no stale-while-revalidate here, so a row that might be wrong must not exist. A miss recomputes.
   */
  try {
    await supabase.from('athletic_record_cache').delete().eq('user_id', userId);
  } catch (e) {
    console.error(`[${logPrefix}] Failed to invalidate athletic_record_cache:`, e);
  }
}
