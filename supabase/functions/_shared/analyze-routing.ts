/**
 * WHICH ANALYZER OWNS A WORKOUT — one table, shared.
 *
 * `CLAUDE.md` names "three hand-maintained routing tables" as a standing hazard: any new cache or
 * downstream system has to be registered in all of them or it goes stale. This file is that hazard
 * being paid down by one. It was `recompute-workout/orchestrator-lib.ts`'s local copy, whose header
 * said it was kept local "so it bundles only here — no cross-function deploy trap".
 *
 * ⚠️ THAT TRADE HAS NOW COST MORE THAN IT SAVED, and the bug that proves it is worth recording:
 * `auto-attach-planned` needed to re-run the right analyzer after a late attach, could not reach this
 * function, and so had hardcoded `if (finalSport === 'run')` — meaning a RIDE or SWIM that attached
 * after its analysis had already run never got a plan comparison at all, permanently. The private copy
 * did not prevent a second table; it just meant the second table was a one-line `if` with a silent
 * hole in it.
 *
 * ⛔ SHARED = DEPLOY TRAP. Editing this file changes nothing in production until every function that
 * imports it is redeployed. Find them with:
 *     grep -rln "analyze-routing" supabase/functions
 */

/** Same routing as MobileSummary; the default matches mobility / unknown types. */
export function resolveAnalyzeEdgeFn(workoutType: string | null | undefined): string {
  const t = (workoutType ?? '').toLowerCase();
  if (t === 'run' || t === 'running') return 'analyze-running-workout';
  // Provider mappers normalize cycling activities to type='ride' upstream;
  // 'cycling' and 'bike' synonyms previously listed here never fired in production data.
  if (t === 'ride') return 'analyze-cycling-workout';
  if (t === 'strength' || t === 'strength_training') return 'analyze-strength-workout';
  if (t === 'swim' || t === 'swimming') return 'analyze-swim-workout';
  return 'analyze-running-workout';
}
