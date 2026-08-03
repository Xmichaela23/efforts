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
// ⛔ MOVE THIS TO 161 ONLY IN THE SAME BREATH AS DEPLOYING `coach` — NOT BEFORE. [D-373]
// Raising it while the server still serves 160 makes `versionOk` false for every cached payload
// (`useCoachWeekContext.ts:699`), which drops the WHOLE coach payload — run, ride, swim and strength
// sections all render empty. That was done on 2026-08-02 and blanked the State screen on the dev
// build within minutes. The floor and the server version move together or the screen goes dark.
export const COACH_CLIENT_MIN_PAYLOAD_VERSION = 161;
