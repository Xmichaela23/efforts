import { supabase, getStoredUserId } from '@/lib/supabase';
import type { ArcFiveKLearnedDivergence, ArcReadiness, CompletedEvent, LongitudinalSignalsPayload } from '@/lib/arc-types';

/** Server `ArcContext` — client only needs a subset for UI; `five_k_nudge` is stable. */
export type ArcContextPayload = {
  five_k_nudge: ArcFiveKLearnedDivergence | null;
  recent_completed_events?: CompletedEvent[];
  longitudinal_signals?: LongitudinalSignalsPayload | null;
  readiness?: ArcReadiness | null;
  /** ⛔ THE SWIM RE-TEST NUDGE, DECIDED AND WORDED ON THE SERVER (2026-09-15, Stage 4 session 2).
   *  Null when the rule says nothing. It ran in the browser off two table queries of its own. */
  swim_retest_nudge?: { sentence: string; honored_swims: number } | null;
  /** Today's block label and the season link, built by `get-arc-context` (2026-09-18). The phone prints them. */
  home_line?: { block_label: string | null; season_cta: string | null } | null;
  [k: string]: unknown;
};

export async function fetchArcContext(focusDate?: string): Promise<ArcContextPayload | null> {
  const userId = getStoredUserId();
  if (!userId) return null;
  /**
   * ⛔ THE ATHLETE'S OWN DATE, NOT UTC (2026-09-15, §8.0 #42). `toISOString()` is UTC, so after 5 pm in
   * Los Angeles this asked the server about tomorrow — and the READINESS row, which counts days from it,
   * called a check-in logged this evening "yesterday". `en-CA` prints YYYY-MM-DD in local time.
   */
  const today = new Date().toLocaleDateString('en-CA');
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
