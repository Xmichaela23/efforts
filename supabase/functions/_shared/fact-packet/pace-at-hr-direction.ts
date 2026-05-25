/**
 * D-050 / Q-025 — Pace-at-HR trend direction classifier.
 *
 * Spec: docs/PACE-AT-HR-TREND-SPEC.md §1.3 (percentile classifier).
 *
 * Approach (per-athlete, no global constants):
 *
 *   1. From the trend window's points with non-null pace_at_hr, count GAP-basis
 *      coverage. When ≥60% of points are GAP-basis, restrict the slope
 *      computation to GAP-basis points only (cleaner distribution shape per
 *      the 2026-05-25 calibration). Otherwise use all valid points.
 *
 *   2. Need ≥6 qualifying points after the basis filter. Below that, return
 *      `insufficient_data` (raised from 5 per the calibration findings — slope
 *      estimates are noisy at the 5-point floor).
 *
 *   3. Compute the OVERALL window slope (linear regression of pace_at_hr over
 *      weeks from the earliest point).
 *
 *   4. Compute PER-PAIR slopes (slope between each adjacent pair of points).
 *      These represent the athlete's own short-window volatility within the
 *      trend window.
 *
 *   5. Use the 33rd/67th percentile boundaries of the per-pair distribution as
 *      cutoffs for the overall slope:
 *        overall < p33 → improving (a faster-than-typical drop in pace-at-HR)
 *        overall > p67 → declining (a slower-than-typical rise)
 *        middle → stable
 *
 *      The classifier auto-adapts to the athlete's own volatility — no
 *      cross-athlete unit assumptions, no fixed ±N cutoff.
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

function linearSlope(xs: number[], ys: number[]): number | null {
  if (xs.length < 2) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  if (den === 0) return null;
  return num / den;
}

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

  // Overall window slope (linear regression).
  const overall = linearSlope(xs, ys);
  if (overall == null || !Number.isFinite(overall)) {
    return { direction: 'insufficient_data', basis };
  }

  // Per-pair slopes (N-1 values; same time / value units).
  const pairs: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    if (dx <= 0) continue; // same-day duplicates skipped — keep deterministic
    pairs.push((ys[i + 1] - ys[i]) / dx);
  }
  // Need at least 3 pair-slopes to compute a meaningful percentile reference.
  // Below that the cutoffs collapse; default to stable.
  if (pairs.length < 3) {
    return { direction: 'stable', basis };
  }

  // p33 / p67 percentile boundaries via nearest-rank (no interpolation —
  // ties stay deterministic).
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

  // Tie handling: when p33 === p67 (e.g. distribution collapsed to a single
  // value), the middle band has zero width and every slope would land in
  // 'declining' or 'improving'. Force 'stable' in that degenerate case.
  if (p33 === p67) {
    return { direction: 'stable', basis };
  }

  if (overall < p33) return { direction: 'improving', basis };
  if (overall > p67) return { direction: 'declining', basis };
  return { direction: 'stable', basis };
}
