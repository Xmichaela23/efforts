/**
 * Must match `COACH_PAYLOAD_VERSION` in `supabase/functions/coach/index.ts`.
 * Bump both when the coach JSON contract changes so coach_cache rows recompute.
 *
 * ⛔ IT DRIFTED TO 144 WHILE THE SERVER REACHED 157, AND THAT IS WHY "BUMP THE VERSION SO CACHED ROWS
 * RE-SOURCE" KEPT NOT WORKING (2026-08-01). The ritual assumes the EDGE FUNCTION is the reader of
 * `coach_cache`. On a tab mount it is not — `useCoachWeekContext.ts:~699` reads the cache row DIRECTLY
 * and gates on THIS constant, then returns without ever invoking `coach`. So a stale row only has to
 * clear this floor, not the server's gate: at 144, thirteen versions of server changes could sit
 * cached and unreachable, and the deploy would look like it had silently failed.
 *
 * ⚠️ SO THIS IS NOT "A FLOOR, THEREFORE HARMLESS". A floor below the server version is exactly a
 * window in which corrected rows cannot reach a device. If you bump the server, bump this. The
 * version-history notes in `coach/index.ts` warn about this trap four times, from the server side;
 * this is the client half they do not cover.
 */
export const COACH_CLIENT_MIN_PAYLOAD_VERSION = 160;
