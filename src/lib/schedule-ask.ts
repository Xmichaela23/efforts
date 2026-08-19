/**
 * WHICH ROW OF THE SCHEDULE CARD IS OPEN.
 *
 * ⛔ WHY THIS IS A FILE AND NOT THREE LINES INSIDE `NonRaceBuilder`. It WAS three lines inside
 * `NonRaceBuilder`, and they carried a bug no test could reach: the render gate that decided which
 * row opens also carried the rule for which row opens BY DEFAULT, and the two rules disagreed.
 *
 * ⛔⛔ THE BUG, 2026-08-19, FOUND ON A DEVICE. The gate read:
 *
 *     scheduleQuestion && scheduleQuestion !== 'hard' && rows.some(...) ? scheduleQuestion : <first non-hard>
 *
 * `!== 'hard'` was there to stop the card auto-opening on the OPTIONAL question when the athlete
 * first arrives. It was written as *never* open on `hard`. So tapping "High intensity days" stored
 * `'hard'`, the condition rejected it, and the card fell through to the first non-hard row —
 * re-opening Long run. **Neither hard session's day picker was reachable from the Schedule step**,
 * and the row's summary line still read `Run · Tue · Ride · Fri`, so it looked answered.
 *
 * ⛔ THE SEPARATION IS THE FIX: a DEFAULT is what happens when nobody has chosen; a CHOICE is what
 * happens when they have. The `hard` exclusion belongs only to the first.
 */

/** The keys the schedule card's rows can carry. */
export type ScheduleRowKey = 'hard' | 'long' | 'ride' | 'runs' | 'rides';

/**
 * ⛔ THE OPTIONAL QUESTION NEVER OPENS BY DEFAULT, AND THE COUNTS ARE NOT DAY QUESTIONS.
 * §1i allows up to two hard aerobic days and never required either — an athlete with no appetite
 * for intervals is having a normal week, not an incomplete one, so the card must not greet them
 * with it. `runs`/`rides` are per-week COUNTS and are not rendered on this step at all.
 */
const NEVER_DEFAULT: ScheduleRowKey[] = ['hard', 'runs', 'rides'];

export function defaultScheduleAsk(rowKeys: ScheduleRowKey[]): ScheduleRowKey {
  return rowKeys.find((k) => !NEVER_DEFAULT.includes(k)) ?? 'long';
}

/**
 * The open row.
 *
 * @param currentStep  the wizard step — `hardday` has exactly one question and always shows it.
 * @param chosen       what the athlete last tapped, or `null` if they have not tapped anything.
 * @param rowKeys      the rows the card is actually rendering, in display order.
 *
 * ⚠️ THE EXISTENCE CHECK IS NOT THE BUG AND IT STAYS. A stored key can go stale: posture is
 * editable on an earlier step, so walking Back, dropping the bike and walking forward again would
 * leave `ride` selected on a card that no longer has a ride row — an open row rendering nothing,
 * with its day chips writing to a discipline that is not in the plan. When the choice is stale the
 * card falls back to the default, which is a question the athlete actually has.
 */
export function resolveScheduleAsk(
  currentStep: string,
  chosen: ScheduleRowKey | null,
  rowKeys: ScheduleRowKey[],
): ScheduleRowKey {
  /**
   * ⛔ THE HARD-DAY STEP OPENS ON ITS OWN QUESTION, ALWAYS (2026-08-18). Without this the "open the
   * first shown row" rule resolved to `long`, and the hard row rendered CLOSED on the page built
   * for it — a screen whose only question is collapsed behind a tap.
   */
  if (currentStep === 'hardday') return 'hard';
  // ⛔ A TAP WINS UNCONDITIONALLY, `hard` INCLUDED. This is the line the bug lived on.
  if (chosen && rowKeys.includes(chosen)) return chosen;
  return defaultScheduleAsk(rowKeys);
}
