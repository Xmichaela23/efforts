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
// ⛔ MOVE THIS ONLY AFTER THE SERVER IS VERIFIED SERVING THE NEW VERSION — NOT BEFORE. [D-373]
// Raising it while the server still serves the old one makes `versionOk` false for every cached
// payload (`useCoachWeekContext.ts:699`), which drops the WHOLE coach payload — run, ride, swim and
// strength sections all render empty. That was done on 2026-08-02 and blanked the State screen on
// the dev build within minutes. The floor and the server version move together or the screen goes dark.
//
// 162 (Q-254 slice 1, 2026-08-03): moved AFTER `coach` was deployed and prod was confirmed returning
// `coach_payload_version: 162` — checked by calling the deployed function with a throwaway all-zeros
// user id, so the verification itself could not disturb a real athlete's cached payload. That check
// is the whole procedure: the 2026-08-02 damage was not the bump, it was bumping on the assumption
// the deploy had landed.
//
// 163 (Q-254 slice 2, 2026-08-03): same procedure, same order — `coach` and
// `generate-overall-context` deployed first, prod confirmed serving 163 against the all-zeros id,
// and only then this line. ⛔ THIS BUMP IS LOAD-BEARING, unlike 162's: slice 2 is a COMPUTATION
// change (`per_lift[].verdict_label` and `.verdict_tone` move), so a cached row does not merely
// lack a field — it carries the OLD command. Without the floor, a main lift keeps showing
// "back off weight" computed from accessory RIR for another 24h.
export const COACH_CLIENT_MIN_PAYLOAD_VERSION = 163;
