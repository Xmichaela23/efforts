/**
 * Grade-Adjusted Pace (GAP) using the Minetti (2002) metabolic cost model.
 *
 * GAP converts actual pace on a grade to the equivalent pace on flat ground
 * that would require the same metabolic effort.
 *
 * Reference: Minetti et al., "Energy cost of walking and running at extreme
 * uphill and downhill slopes", J Appl Physiol 93:1039-1046, 2002.
 */

/**
 * Metabolic cost of locomotion in J/kg/m for a given grade (decimal).
 * Valid for grades roughly -0.45 to +0.45.
 */
function metabolicCostPerMeter(gradeDecimal: number): number {
  const g = Math.max(-0.45, Math.min(0.45, gradeDecimal));
  return (
    155.4 * g ** 5 -
    30.4 * g ** 4 -
    43.3 * g ** 3 +
    46.3 * g ** 2 +
    19.5 * g +
    3.6
  );
}

const FLAT_COST = metabolicCostPerMeter(0); // 3.6 J/kg/m

/**
 * Convert an actual pace to Grade-Adjusted Pace.
 *
 * @param paceSecPerUnit  Actual pace in seconds per distance unit (km or mi)
 * @param gradePercent    Grade in percent (e.g. 5 for 5% uphill, -3 for 3% downhill)
 * @returns GAP in the same unit as input, or the original pace if grade is negligible
 */
export function paceToGAP(paceSecPerUnit: number, gradePercent: number): number {
  if (!Number.isFinite(paceSecPerUnit) || paceSecPerUnit <= 0) return paceSecPerUnit;
  if (!Number.isFinite(gradePercent)) return paceSecPerUnit;

  // Don't adjust for negligible grade (<0.3%)
  if (Math.abs(gradePercent) < 0.3) return paceSecPerUnit;

  const cost = metabolicCostPerMeter(gradePercent / 100);
  if (cost <= 0.5) return paceSecPerUnit; // safety: extreme downhill

  return paceSecPerUnit * (FLAT_COST / cost);
}

/**
 * Compute per-sample grade from elevation data using a smoothing window.
 * Returns grade in percent for each sample.
 *
 * @param samples  Array with at minimum { elevation_m, pace_s_per_mi } per sample.
 *                 If `distance_m` (cumulative horizontal meters from workout start) is set on
 *                 any sample, it is used for grade — required when samples are not 1 Hz or
 *                 rows were filtered (e.g. only HR-bearing points).
 * @param windowSize  Number of samples for smoothing (default 30 = 30s moving average)
 */
export function computeSampleGrades(
  samples: Array<{
    elevation_m?: number | null;
    pace_s_per_mi?: number | null;
    distance_m?: number | null;
  }>,
  windowSize = 30,
): number[] {
  const n = samples.length;
  const grades: number[] = new Array(n).fill(0);

  if (n < 2) return grades;

  const cumDist: number[] = new Array(n).fill(0);
  const hasDist = samples.some(
    (s) => s.distance_m != null && Number.isFinite(s.distance_m as number),
  );
  if (hasDist) {
    for (let i = 0; i < n; i++) {
      const dm = samples[i].distance_m;
      if (dm != null && Number.isFinite(dm) && dm >= 0) {
        cumDist[i] = dm;
      } else {
        cumDist[i] = i > 0 ? cumDist[i - 1] : 0;
      }
    }
    for (let i = 1; i < n; i++) {
      if (cumDist[i] < cumDist[i - 1]) cumDist[i] = cumDist[i - 1];
    }
  } else {
    // ~1 Hz: integrate horizontal distance from pace (sec/mi → m/s per step)
    for (let i = 1; i < n; i++) {
      const pace = samples[i].pace_s_per_mi;
      if (pace && pace > 0 && pace < 2400) {
        const speedMps = 1609.34 / pace;
        cumDist[i] = cumDist[i - 1] + speedMps;
      } else {
        cumDist[i] = cumDist[i - 1];
      }
    }
  }

  // Raw grade from elevation delta / distance delta over a window
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    const elevLo = samples[lo].elevation_m;
    const elevHi = samples[hi].elevation_m;
    const distDelta = cumDist[hi] - cumDist[lo];
    if (
      elevLo != null && elevHi != null &&
      Number.isFinite(elevLo) && Number.isFinite(elevHi) &&
      distDelta > 5 // at least 5m horizontal to avoid noise
    ) {
      const raw = ((elevHi - elevLo) / distDelta) * 100;
      grades[i] = Math.max(-45, Math.min(45, raw));
    }
  }

  return grades;
}

/**
 * Check if elevation data is sufficient for GAP computation.
 * Requires >50% of samples to have elevation_m and meaningful variation.
 */
export function hasUsableElevation(
  samples: Array<{ elevation_m?: number | null }>,
): boolean {
  if (samples.length < 60) return false; // need at least 1 minute

  let count = 0;
  let minElev = Infinity;
  let maxElev = -Infinity;
  for (const s of samples) {
    if (s.elevation_m != null && Number.isFinite(s.elevation_m)) {
      count++;
      if (s.elevation_m < minElev) minElev = s.elevation_m;
      if (s.elevation_m > maxElev) maxElev = s.elevation_m;
    }
  }

  if (count < samples.length * 0.5) return false;
  // Need at least 5m elevation range to justify GAP
  if (maxElev - minElev < 5) return false;

  return true;
}
