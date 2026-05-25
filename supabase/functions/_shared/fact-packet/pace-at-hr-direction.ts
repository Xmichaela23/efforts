/**
 * D-050 / Q-025 — Pace-at-HR trend direction classifier.
 *
 * Spec: docs/PACE-AT-HR-TREND-SPEC.md §1.3 (percentile classifier).
 *
 * Approach (per-athlete, no global constants):
 *
 *   1. From the trend window's points with non-null pace_at_hr, count GAP-basis
 *      coverage. When ≥60% of points are GAP-basis, restrict slope computation
 *      to GAP-basis points only (cleaner distribution shape per the
 *      2026-05-25 calibration). Otherwise use all valid points.
 *
 *   2. Need ≥6 qualifying points after the basis filter. Below that, return
 *      `insufficient_data` (raised from 5 per the calibration findings).
 *
 *   3. Compute PER-PAIR slopes (slope between each adjacent pair of points).
 *      These N-1 values represent the athlete's own session-to-session
 *      volatility within the trend window.
 *
 *   4. Classify each adjacent-pair slope by percentile rank in the within-
 *      window distribution:
 *        bottom third (most negative) → improving
 *        top third    (most positive) → declining
 *        middle third                 → stable
 *
 *   5. The session's reported direction = MEAN of the most recent K pair-slopes
 *      (K = min(3, available)) classified against the same p33 / p67 cutoffs.
 *      "Recent K" smooths single-session noise while still being responsive to
 *      the current session's contribution. Spec §1.3 wording "bottom-third of
 *      slopes = improving" treats the per-pair distribution as the reference;
 *      we evaluate the RECENT trend (not the whole-window LR) so the signal
 *      tracks the athlete's current direction rather than the cumulative
 *      sum-since-window-start.
 *
 *      Auto-adapts to per-athlete volatility — no cross-athlete unit
 *      assumptions, no fixed ±N cutoff.
 *
 * Returns the chosen basis on the `basis` field so the client can show users
 * which pace was used (GAP when present, raw otherwise).
 */

export type PaceAtHrDirection =
  | 'improving'
  | 'stable'
  | 'declining'
  | 'insufficient_data';

export type PaceAtHrBasis = 'gap' | 'raw' | null;

export interface PaceAtHrTrendPoint {
  date: string;
  pace_at_hr: number | null;
  pace_basis?: 'gap' | 'raw';
}

export interface ClassifyPaceAtHrResult {
  direction: PaceAtHrDirection;
  basis: PaceAtHrBasis;
}

const MIN_POINTS = 6;
const GAP_COVERAGE_THRESHOLD = 0.6;
const RECENT_K = 3;

function dateToWeeks(date: string, anchorMs: number): number {
  const ms = new Date(`${date}T00:00:00Z`).getTime();
  return (ms - anchorMs) / (7 * 24 * 3600 * 1000);
}

/**
 * Classify the trend window's pace-at-HR direction using the percentile
 * classifier (spec §1.3). See file header for the algorithm.
 *
 * `points` is the full trend_points array (pool + current workout, in any
 * date order — sorted internally). Points with null pace_at_hr are ignored.
 */
export function classifyPaceAtHrDirection(
  points: PaceAtHrTrendPoint[],
): ClassifyPaceAtHrResult {
  const valid = points.filter(
    (p) => p.pace_at_hr != null && Number.isFinite(p.pace_at_hr),
  );
  if (valid.length === 0) return { direction: 'insufficient_data', basis: null };

  // GAP coverage: how many valid points are gap-basis?
  const gapCount = valid.filter((p) => p.pace_basis === 'gap').length;
  const gapCoverage = gapCount / valid.length;
  const useGapOnly = gapCoverage >= GAP_COVERAGE_THRESHOLD;
  const filtered = useGapOnly
    ? valid.filter((p) => p.pace_basis === 'gap')
    : valid;
  const basis: PaceAtHrBasis = useGapOnly
    ? 'gap'
    : (filtered.length > 0 ? 'raw' : null);

  if (filtered.length < MIN_POINTS) {
    return { direction: 'insufficient_data', basis };
  }

  // Sort by date ascending so adjacent-pair slopes are temporal.
  const sorted = [...filtered].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  const anchorMs = new Date(`${sorted[0].date}T00:00:00Z`).getTime();
  const xs = sorted.map((p) => dateToWeeks(p.date, anchorMs));
  const ys = sorted.map((p) => p.pace_at_hr as number);

  // Per-pair slopes (N-1 values; sec/mi-per-100bpm per week). Same-day
  // duplicates skipped to avoid divide-by-zero and keep ordering deterministic.
  const pairs: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    if (dx <= 0) continue;
    pairs.push((ys[i + 1] - ys[i]) / dx);
  }
  // Need at least 3 pair-slopes to compute meaningful percentile cutoffs.
  if (pairs.length < 3) {
    return { direction: 'stable', basis };
  }

  // p33 / p67 percentile boundaries (nearest-rank — ties stay deterministic).
  const sortedPairs = [...pairs].sort((a, b) => a - b);
  const pickPct = (p: number): number => {
    const idx = Math.max(
      0,
      Math.min(sortedPairs.length - 1, Math.floor(p * (sortedPairs.length - 1))),
    );
    return sortedPairs[idx];
  };
  const p33 = pickPct(1 / 3);
  const p67 = pickPct(2 / 3);

  // Degenerate distribution (all pairs effectively equal) → stable. No
  // session can be "unusually fast/slow vs typical" when typical has no
  // variance.
  if (p33 === p67) {
    return { direction: 'stable', basis };
  }

  // Session direction = mean of the most recent K pair-slopes (smooths
  // single-session noise while staying responsive to current trend). Classified
  // against the same p33 / p67 cutoffs derived from the full pair-slope
  // distribution within the window.
  const recentK = Math.min(RECENT_K, pairs.length);
  const recentMean =
    pairs.slice(-recentK).reduce((a, b) => a + b, 0) / recentK;

  if (recentMean < p33) return { direction: 'improving', basis };
  if (recentMean > p67) return { direction: 'declining', basis };
  return { direction: 'stable', basis };
}
