/**
 * ⛔ THE ATHLETE'S "USUAL" — THEIR OWN MIDDLE HALF (moved here 2026-09-18 from `workout-detail`, where the
 * Performance screen's Workload chip first used it, 2026-08-02). One rule, two readers: the session's workload
 * against the same sport's last 90 days, and State's fatigue against the last 12 weeks of daily fatigue.
 *
 * FIELD — the 25th–75th percentile is a standard descriptive summary (the interquartile range), not a tuned
 * threshold; the "where it sits among yours" framing is Strava's Relative Effort range and Garmin's Training Load
 * band. The middle half and not min–max: one outlier would stretch a min–max band until everything looked small.
 * Values at or under zero are not readings and are left out.
 */

// OURS — `MIDDLE_HALF_MIN_VALUES` 5: a band drawn from fewer values is a line through noise; no outside source
export const MIDDLE_HALF_MIN_VALUES = 5;

/** The 25th and 75th percentile, rounded, or null below the minimum. Nearest-rank on the sorted values. */
export function middleHalf(values: ReadonlyArray<unknown>, minValues = MIDDLE_HALF_MIN_VALUES): { low: number; high: number } | null {
  const vals = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (vals.length < minValues) return null;
  const pct = (q: number) => vals[Math.min(vals.length - 1, Math.floor(q * (vals.length - 1)))];
  return { low: Math.round(pct(0.25)), high: Math.round(pct(0.75)) };
}
