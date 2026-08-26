/**
 * ⛔ WHAT A LOGGED REP COUNT MEANS — the three states, in one place (2026-08-26).
 *
 * These two rules were inline in `StrengthLogger.tsx` and they are the entire input contract for the
 * standing plan's progression: two sessions finishing the rep range move the bar up, and a set logged
 * at ZERO puts it back to the weight the athlete was holding. If either rule drifts, the engine keeps
 * computing correctly off a signal that no longer means what it thinks — the quietest failure there is.
 *
 * ⛔ THE THREE STATES, AND THERE IS NO NEW UI CONCEPT IN THEM:
 *   · logged with 1+ reps  — completed
 *   · logged with 0        — attempted and FAILED
 *   · not logged           — silence, and silence is already treated as no evidence
 *
 * ⚠️ THE HARD PART IS THAT `reps: 0` ALREADY MEANT SOMETHING ELSE. App-wide it means "cleared or never
 * entered", and the 2026-08-13 blank-set guard is built on it — an athlete ticked a Pull Up set with no
 * reps in it and the session logged wrong. So the failed attempt cannot be told from an empty cell by
 * the VALUE. `reps_entered` carries the provenance beside it, the same idiom as `from_previous` and
 * `prefilled`, and it is what separates the two.
 */

/** The fields these rules read. Deliberately loose — the logger's set type is much wider. */
export type RepEntrySetish = {
  reps?: number | null;
  repMaxTest?: boolean | null;
  reps_entered?: boolean | null;
};

/**
 * The lowest rep count a typed entry may commit to.
 *
 * ⛔ ZERO ON THE HEAVY SLOT, AND NOWHERE ELSE IT WAS NOT ALREADY ALLOWED. A floor of 1 made a missed
 * lift unloggable, so the progression's up half could fire and its undo could not — a one-way ratchet.
 *
 * ⚠️ SCOPED TO ME RATHER THAN WIDENED APP-WIDE, deliberately. `reps: 0` is the cleared value
 * everywhere; dropping the floor on every set would let any emptied cell be ticked as done. The heavy
 * slot is the one place a zero MEANS something, so it is the only place the meaning changes.
 *
 * ⚠️ A pull-up rep-MAX test already allowed zero — "goal: your first pull-up" (Q-102) — and keeps it.
 */
export function repFloorFor(args: { repMaxTest?: boolean | null; slotIntent?: string | null }): 0 | 1 {
  if (args.repMaxTest === true) return 0;
  return String(args.slotIntent ?? '') === 'ME' ? 0 : 1;
}

/**
 * Is this set's rep count missing — the state that may NOT be marked done?
 *
 * ⛔ A TYPED ZERO IS NOT MISSING. It is the failed attempt, and it completes like any other count.
 * An untouched or cleared cell still cannot be ticked, which is what the 2026-08-13 fix was for.
 */
export function repsAreBlank(set: RepEntrySetish | null | undefined): boolean {
  const reps = set?.reps;
  if (reps === undefined || reps === null) return true;
  if (reps !== 0) return false;
  return set?.repMaxTest !== true && set?.reps_entered !== true;
}

/**
 * ⛔ IS THIS A SET THE PROGRESSION READS AS A FAILED ATTEMPT?
 *
 * The engine's own test is `completed === true && reps === 0` (`barSessionSignal`). This is the
 * client-side statement of the same fact, so a surface can render it without re-deriving the rule.
 */
export function isFailedAttempt(set: (RepEntrySetish & { completed?: boolean | null }) | null | undefined): boolean {
  return set?.completed === true && set?.reps === 0 && !repsAreBlank(set);
}
