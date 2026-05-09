/**
 * Aligns with ingest-activity: when training / plan truth changes, drop block-level
 * adaptation aggregates and mark coach_cache stale so State + adaptation recompute.
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
}
