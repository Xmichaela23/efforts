/**
 * WHICH DAYS THE WEEK'S ANCHORS ALREADY HOLD — the one answer every day picker asks.
 *
 * ⛔ IT LIVES IN `src/lib` RATHER THAN INSIDE THE BUILDER SO IT CAN BE TESTED. It decides whether a
 * control is tappable, which is exactly the kind of rule that rots silently inside a component: the
 * builder had THREE day pickers and each carried its own idea of what was free, which is how the
 * card ended up resolving collisions by blanking whichever answer was older.
 *
 * ── WHY LOCKING, NOT RESOLVING ───────────────────────────────────────────────────────────────────
 *
 * The long run, the long ride and the hard day are ANCHORS: `week-solver` treats them as fixed and
 * places the barbell around them. Two anchors on one day is therefore not a preference the engine
 * can arbitrate — it has a typed refusal for it whose own copy reads *"Both are fixed, so this is
 * yours to resolve — the engine will not pick one."*
 *
 * So the collision is prevented at INPUT. A collision never entered needs no dedupe in the composer,
 * no refusal screen, and no explanation after the fact.
 */

export type AnchorDayName =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

/** The three anchor questions, in the words the athlete sees. */
export type AnchorRole = 'long run' | 'long ride' | 'hard day';

export type AnchorDayState = {
  longRunDay?: string;
  longRideDay?: string;
  /** Keyed by sport — a run club and a ride club are different anchors and may hold different days. */
  qualityDays?: Record<string, string>;
};

/**
 * Day → the athlete-facing name of the anchor holding it.
 *
 * @param exclude the picker's OWN anchor. ⛔ Omitting it is what stops a picker locking itself, and
 *   it is also what leaves the current pick releasable — a control that reads its own answer as
 *   "taken" cannot be cleared and looks broken to the athlete who set it.
 *
 * ⚠️ RETURNS A NAME, NEVER A BOOLEAN. A greyed square with no reason is a puzzle; "Sat — long ride"
 * is the app showing it remembered what the athlete already told it.
 */
export function anchorDaysTaken(
  st: AnchorDayState | null | undefined,
  exclude: AnchorRole,
): Partial<Record<AnchorDayName, string>> {
  const out: Partial<Record<AnchorDayName, string>> = {};
  const put = (day: string | undefined, label: AnchorRole) => {
    if (!day || label === exclude) return;
    // ⚠️ FIRST WRITER WINS, and it cannot matter: two anchors can only occupy one day if a lock was
    // bypassed, and either label is then equally true of that day. Overwriting would just pick the
    // later one for no reason.
    if (!out[day as AnchorDayName]) out[day as AnchorDayName] = label;
  };
  put(st?.longRunDay, 'long run');
  put(st?.longRideDay, 'long ride');
  for (const d of Object.values(st?.qualityDays ?? {})) put(d, 'hard day');
  return out;
}
