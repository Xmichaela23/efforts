import { supabase, getStoredUserId } from '@/lib/supabase';
import type { ArcFiveKLearnedDivergence, CompletedEvent, LongitudinalSignalsPayload } from '@/lib/arc-types';

/** Server `ArcContext` — client only needs a subset for UI; `five_k_nudge` is stable. */
export type ArcContextPayload = {
  five_k_nudge: ArcFiveKLearnedDivergence | null;
  recent_completed_events?: CompletedEvent[];
  longitudinal_signals?: LongitudinalSignalsPayload | null;
  [k: string]: unknown;
};

export async function fetchArcContext(focusDate?: string): Promise<ArcContextPayload | null> {
  const userId = getStoredUserId();
  if (!userId) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.functions.invoke('get-arc-context', {
    body: { user_id: userId, focus_date: focusDate ?? today },
  });
  if (error) {
    console.warn('[fetch-arc-context]', error);
    return null;
  }
  const arc = (data as { arc?: ArcContextPayload } | null)?.arc;
  return arc && typeof arc === 'object' ? arc : null;
}
