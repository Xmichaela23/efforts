/**
 * THE ASSISTANCE REP TOTAL — one parser, one countdown. [2026-08-11]
 *
 * Assistance work in 5/3/1 is a rep TOTAL, not a set count: pick a number (25/50/100) and hit it
 * across as many sets as you need, by feel, never to failure (Wendler, 5/3/1 2nd ed. p.24 / p.102).
 * The prescription arrives as a STRING on `LoggedExercise.target_reps` — `"50 total"` — because an
 * assistance slot states a movement and a total and never a weight. Some assistance is nonetheless
 * loaded (a Romanian Deadlift has a weight); the TOTAL is always about reps.
 *
 * ⛔ THIS IS THE ONE DETECTION. `StrengthLogger.isAssistanceRow` had the `/total/i` test inline and
 * now calls `hasRepTotal` instead, so the logger cannot grow a second, subtly different answer to
 * "is this a rep total" — which is exactly how the app ended up with seven private exercise
 * classifiers that disagreed.
 *
 * ⚠️ `hasRepTotal` and `parseRepTotal` are deliberately NOT the same question.
 *   - `hasRepTotal("total")` is true — it IS an assistance prescription, just a malformed one, and
 *     `isAssistanceRow` must keep classifying it as assistance (its old regex did).
 *   - `parseRepTotal("total")` is null — there is no number to count down from, so the countdown
 *     renders nothing rather than "NaN of NaN reps left".
 * Collapsing the two would either mis-route an assistance row or print a NaN at the athlete.
 */

const TOTAL_RE = /total/i;

/** Does this prescription state a rep TOTAL? The assistance signal, byte-for-byte the old inline test. */
export function hasRepTotal(targetReps: unknown): boolean {
  return TOTAL_RE.test(String(targetReps ?? ''));
}

/**
 * The number to count down from, or null when there isn't a usable one. Null on a non-total
 * prescription ("8", "4-6"), on a total with no digits, and on a zero/negative — each of which
 * means "do not render a countdown", never "count down from nothing".
 */
export function parseRepTotal(targetReps: unknown): number | null {
  if (!hasRepTotal(targetReps)) return null;
  const m = String(targetReps ?? '').match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Reps banked so far. ⛔ ONLY COMPLETED SETS COUNT. A typed-but-unticked set is a number the athlete
 * has not claimed yet — the same rule the volume and load paths already apply (`completed` is the
 * flag the save gates on), and the reason the missed-Done prompt exists. Counting typed reps here
 * would let the total tick down for work that will not be saved as done.
 */
export function completedReps(
  sets: ReadonlyArray<{ reps?: number | null; completed?: boolean }> | null | undefined,
): number {
  if (!Array.isArray(sets)) return 0;
  let n = 0;
  for (const s of sets) {
    if (s?.completed !== true) continue;
    const r = Number(s?.reps);
    if (Number.isFinite(r) && r > 0) n += r;
  }
  return n;
}

/** Reps still owed. Never negative — an athlete who overshoots is done, not owed −6. */
export function repsRemaining(
  total: number,
  sets: ReadonlyArray<{ reps?: number | null; completed?: boolean }> | null | undefined,
): number {
  return Math.max(0, total - completedReps(sets));
}

/**
 * The line under the exercise title. States the fact and nothing else — no imperative, no praise.
 * "32 of 50 reps left" while there is work owed; "50 reps done" once the total is met or passed.
 */
export function repTotalLine(total: number, remaining: number): string {
  return remaining > 0 ? `${remaining} of ${total} reps left` : `${total} reps done`;
}
