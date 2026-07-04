// Readiness wellness scale (D-235): the Hooper-aligned set on ONE place so no consumer forks.
//   energy   — subjective 1–7 (1 = low, 7 = high)
//   soreness — subjective 1–7 (1 = none, 7 = extremely sore)   [D-234]
//   sleep    — OBJECTIVE HOURS (0–12), NOT a 1–7 rating — documented exception (hours beats a subjective
//              quality Likert; no principled hours→1–7 map, so it stays hours).
// Extracted from analyze-strength so the overall-readiness label is unit-tested — the missed-normalizer
// class (D-234 left calculateOverallReadiness on the 0–10 assumption) can't recur silently.

export const HOOPER_MIN = 1;
export const HOOPER_MAX = 7;

/** Linear rescale a legacy 1–10 subjective value to Hooper 1–7: round(1 + (v−1)·6/9). 7→5 exact. */
export function rescaleHooper10to7(v10: number): number {
  return Math.round(1 + (v10 - 1) * (6 / 9));
}

/** True only for an in-range 1–7 value — used to DROP un-migrated 1–10 leaks so they can't skew a score. */
function inHooperRange(v: number | null): v is number {
  return v != null && Number.isFinite(v) && v >= HOOPER_MIN && v <= HOOPER_MAX;
}

/** Energy band label (1–7). */
export function energyLevel(energy: number | null): 'High' | 'Moderate' | 'Low' | null {
  if (!inHooperRange(energy)) return null;
  return energy >= 6 ? 'High' : energy >= 4 ? 'Moderate' : 'Low';
}

/** Soreness band label (1–7). */
export function sorenessLevel(soreness: number | null): 'Low' | 'Moderate' | 'High' | null {
  if (!inHooperRange(soreness)) return null;
  return soreness <= 2 ? 'Low' : soreness <= 4 ? 'Moderate' : 'High';
}

/** Sleep quality band — HOURS, unchanged (objective member of the set). */
export function sleepQuality(sleepHours: number | null): 'Excellent' | 'Good' | 'Fair' | 'Poor' | null {
  if (sleepHours == null || !Number.isFinite(sleepHours)) return null;
  return sleepHours >= 8 ? 'Excellent' : sleepHours >= 7 ? 'Good' : sleepHours >= 6 ? 'Fair' : 'Poor';
}

/**
 * Overall readiness label from the wellness set. Each present, in-range component is normalized to 0–1 and
 * averaged; ≥0.8 Excellent · ≥0.6 Good · ≥0.4 Fair · else Poor. Returns null if nothing usable.
 * - energy  (1–7):  (e−1)/6
 * - soreness(1–7):  (7−s)/6   — inverted (higher soreness = worse)
 * - sleep   (hours): min(h/12, 1) — objective, NOT rescaled
 * SCALE GUARD: energy/soreness values outside 1–7 (un-migrated 1–10 leaks) are skipped, never blended.
 */
export function overallReadinessLabel(
  energy: number | null,
  soreness: number | null,
  sleepHours: number | null,
): 'Excellent' | 'Good' | 'Fair' | 'Poor' | null {
  const scores: number[] = [];
  if (inHooperRange(energy)) scores.push((energy - 1) / 6);
  if (inHooperRange(soreness)) scores.push((7 - soreness) / 6);
  if (sleepHours != null && Number.isFinite(sleepHours)) scores.push(Math.min(sleepHours / 12, 1));
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 0.8) return 'Excellent';
  if (avg >= 0.6) return 'Good';
  if (avg >= 0.4) return 'Fair';
  return 'Poor';
}
