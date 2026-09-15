/**
 * THE RUN EASY PACE RANGE, OFF THE ONE ANCHOR: THRESHOLD PACE.
 *
 * ⛔ THE RULINGS:
 *   - THRESHOLD is the only pace anchor, and it is learned (measured) or entered (Michael, 2026-09-02).
 *   - EASY is not a pace source. Easy days are prescribed as a HEART-RATE zone off threshold HR
 *     (`resolve-current-lthr.ts`); the easy PACE shown is ONE RANGE: threshold × 1.14 to × 1.29, Friel run
 *     Zone 2 (2026-09-15, TRUTH-MAP §9 Q2, D-478). The × 1.19 point it replaced is gone — the book gives easy
 *     by feel (p235: the percentage of threshold moves with fatigue, hydration, environment), and Daniels
 *     allows ±20 s/mi on a given day, so a range and not a point.
 *   - MARATHON race pace is the plan's ENTERED goal time ÷ the race distance. Not derived.
 *   - 5K-pace work is the typed 5K time ÷ 3.107 (`resolve-current-5k-pace.ts`). Not derived.
 *
 * The two multipliers live beside Friel's heart-rate seams in `friel-zones.ts`, imported, not re-stated.
 *
 * No I/O. Pure functions. Importable from the React client AND Deno edge functions.
 */

import { EASY_PACE_FAST_X_THRESHOLD, EASY_PACE_SLOW_X_THRESHOLD } from './friel-zones.ts';

export type RunPacesFromThreshold = {
  /**
   * sec/mi — the easy pace range for a heart-rate-prescribed easy day. `lo` is the fast edge (threshold × 1.14),
   * `hi` the slow edge (× 1.29). `mid` is the range midpoint, for the few readers that need ONE number
   * (step minutes ↔ miles) — a midpoint of a range, not a measurement.
   */
  easy: { lo: number; hi: number; mid: number };
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
  const lo = Math.round(t * EASY_PACE_FAST_X_THRESHOLD);
  const hi = Math.round(t * EASY_PACE_SLOW_X_THRESHOLD);
  return { easy: { lo, hi, mid: Math.round((lo + hi) / 2) }, threshold: Math.round(t) };
}
