// =============================================================================
// lift-swap — which movement a lift slot renders as, on this session
// =============================================================================
//
// Moved out of `materialize-plan/index.ts` (2026-09-21) so it can be tested; the logic is unchanged
// except for the date it is asked about.
//
// ⛔ A LIFT SWAP IS READ ON THE PLAN'S DAY, THE SAME AS A RUN OR RIDE SWAP (`_shared/moved-from.ts`).
// A swap row is a movement name plus a date window. Read on the calendar day, a session moved onto a
// day whose own session has the same movement would pick up that session's "just today" swap, and
// the moved one would lose its own. `swap-session` writes the window in plan dates; this reads it the
// same way. ⚠️ WEIGHT ADJUSTMENTS ARE NOT THIS: "from today on" is calendar time and stays on the
// session's own date (`applyAdjustment` in materialize-plan).
// =============================================================================

import { planDateOf } from '../moved-from.ts';
import { canonicalize } from '../canonicalize.ts';

export type LiftSwapAdjustment = {
  exercise_name: string;
  substitute_exercise_name?: string | null;
  applies_from: string;
  applies_until?: string | null;
  status: string;
  created_at?: string | null;
};

/**
 * ⛔ THE SWAP NAMES ONE MOVEMENT (2026-09-25): the adjustment's name and the row's name are the same movement by
 * `canonicalize`, never by substring. The substring rule this replaced (`applyAdjustment`'s, since the first swap) made a
 * rest-of-plan swap on "db bench press" rename that day's "Bench Press" too. `canonicalize` is the app's one owner of
 * "the same movement" (plurals, synonyms, a trailing parenthetical).
 */
export function sameLift(a: string, b: string): boolean {
  return canonicalize(String(a ?? '')) === canonicalize(String(b ?? ''));
}

/** The substitute for `exerciseName` on the session `row`, or null. Window rules as `applyAdjustment`; the name by `sameLift`. */
export function resolveLiftSwap(
  exerciseName: string,
  adjustments: LiftSwapAdjustment[],
  row: { date?: unknown; tags?: unknown },
): string | null {
  if (!adjustments.length) return null;
  const date = planDateOf(row) || new Date().toISOString().split('T')[0];
  // ⛔ THE LATEST SWAP COVERING THE DATE WINS (2026-09-19): a "Just today" swap is a one-date row inside a "Rest of plan"
  // one's window, and it has to beat it on that date. Latest start, then latest made.
  const swap = adjustments.filter(adj => {
    if (adj.status !== 'active') return false;
    if (!adj.substitute_exercise_name) return false;
    if (!sameLift(adj.exercise_name, exerciseName)) return false;
    if (adj.applies_from > date) return false;
    if (adj.applies_until && adj.applies_until < date) return false;
    return true;
  }).sort((a, b) => String(b.applies_from).localeCompare(String(a.applies_from)) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
  return swap?.substitute_exercise_name ?? null;
}
