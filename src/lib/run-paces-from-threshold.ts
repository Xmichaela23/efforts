/**
 * THE RUN EASY-PACE REFERENCE BAND, OFF THE ONE ANCHOR: THRESHOLD PACE.
 *
 * ⛔ THE RULING (Michael, 2026-09-02, final, relayed from the plan-materialization audit):
 *   - THRESHOLD is the only pace anchor, and it is learned (measured) or entered. Nothing derives it —
 *     not the 5K, not the easy runs.
 *   - EASY is not a pace source. Easy days are prescribed as a HEART-RATE zone off threshold HR
 *     (`resolve-current-lthr.ts`); the easy PACE shown is a reference band only: threshold × 1.19.
 *   - MARATHON race pace is the plan's ENTERED goal time ÷ the race distance. Not derived.
 *   - 5K-pace work is the typed 5K time ÷ 3.107 (`resolve-current-5k-pace.ts`). Not derived.
 * Viada p275 for the Standard Focus programme: *"few changes are needed as the months progress beyond
 * adjustment of 1RM and threshold as you improve"* — threshold is the one endurance number that moves.
 *
 * So this file holds exactly one derivation. The five-pace vDOT table (`effort_paces`) that used to
 * fill every gap is not read by the resolvers or the materializer any more; a marathon ratio and a
 * 5K seed each lived here for one afternoon and were removed the same day by the rulings above.
 *
 * ⛔ THE RATIO IS MEASURED, NOT PICKED: `EASY_TO_THRESHOLD_PACE_RATIO` (`run-threshold-from-easy.ts`)
 * is base ÷ steady across all 21 rows of the app's own pace table, spread 0.69%. Imported, not
 * re-stated. Do not tune it.
 *
 * No I/O. Pure functions. Importable from the React client AND Deno edge functions.
 */

import { EASY_TO_THRESHOLD_PACE_RATIO } from './run-threshold-from-easy.ts';

export type RunPacesFromThreshold = {
  /** sec/mi — the reference band for a heart-rate-prescribed easy day. threshold × 1.19. */
  easy: number;
  /** sec/mi — the anchor, echoed. */
  threshold: number;
};

function positive(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Null in → null out; nothing is invented (Law 2). */
export function pacesFromThresholdSecPerMi(thresholdSecPerMi: number | null | undefined): RunPacesFromThreshold | null {
  const t = positive(thresholdSecPerMi);
  if (t == null) return null;
  return { easy: Math.round(t * EASY_TO_THRESHOLD_PACE_RATIO), threshold: Math.round(t) };
}
