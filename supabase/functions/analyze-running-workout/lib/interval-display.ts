/**
 * Whether a run's rows came from the watch rather than from the plan (2026-09-15).
 *
 * `compute-workout-summary` writes `laps-unmatched` when a structured run's laps could not be paired with its planned
 * steps, `laps-paired` when only some laps were paired with work steps (2026-09-16), `laps-in-order` when no lap fitted
 * the tolerance but the laps that are long enough to be a step number exactly the steps, so lap i is step i (2026-09-17),
 * and `no-laps-whole-run` when a structured run had no laps at all. Those rows are the table: they carry no
 * planned step id, so a check that looks for a recorded row per planned work step finds none and must not read that as
 * "the interval rows are missing" — that check put a red "Session interval contract missing" box over every such run.
 */
export const WATCH_ROW_MODES = ['laps-unmatched', 'laps-paired', 'laps-in-order', 'no-laps-whole-run'] as const;

export function rowsComeFromTheWatch(alignmentMode: unknown): boolean {
  return (WATCH_ROW_MODES as readonly string[]).includes(String(alignmentMode ?? ''));
}
