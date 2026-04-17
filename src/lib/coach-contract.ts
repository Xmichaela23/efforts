/**
 * Must match `COACH_PAYLOAD_VERSION` in `supabase/functions/coach/index.ts`.
 * Bump both when the coach JSON contract changes so coach_cache rows recompute.
 */
export const COACH_CLIENT_MIN_PAYLOAD_VERSION = 15;
