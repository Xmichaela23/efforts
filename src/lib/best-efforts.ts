/**
 * BEST EFFORTS — the fastest stretch at each record distance inside ONE workout.
 *
 * ⛔ ONE FINDER, TWO QUESTIONS (docs/AUDIT-athletic-record-2026-09-19.md §10). A best effort is asked
 * two different questions by two different parts of the app:
 *
 *   THE RECORD — "how fast did you cover 5K?" Clock time, as run, on the ground. That is what Strava
 *   and Garmin print and it is what `elapsed_s` below holds.
 *   THE TREND — "how fast were you moving for 5K, allowing for the hills?" Grade-adjusted pace on
 *   moving seconds. That is `gap_s_per_mi`, and it is what docs/DESIGN-best-efforts.md, the run
 *   threshold learner and the done-session line read.
 *
 * They are the same window measured twice, so this finds the window ONCE and stores both numbers on
 * it. A second finder is how the app ends up with two answers for one 5K.
 *
 * ⛔ THE STORED TIME IS THE TIME FOR THE DISTANCE. The finder this replaces accepted any stretch
 * between 98% and 102% of the target and stored that stretch's raw clock time, so a "5K" could be
 * 5,100 m of running. The overshoot is trimmed off the start edge at the pace of the sample it falls
 * inside — linear interpolation between the two samples that straddle the exact distance.
 *
 * ⚠️ WINDOWS END ON A SAMPLE. Every sample is tried as an end point and the tightest window that
 * still spans the distance is measured, so the answer is exact to the recording rate (1 Hz on every
 * device that reaches us). Refining the end edge below one sample would be chasing noise.
 *
 * No I/O. Pure functions. Importable from the React client AND Deno edge functions.
 */

/** FIELD — NIST Handbook 44 Appendix C: the international mile is exactly 1609.344 m. */
const METERS_PER_MILE = 1609.344;

// =============================================================================
// THE RECORD DISTANCES
// =============================================================================

/**
 * FIELD — Strava, "Best Efforts for Runs"
 * (support.strava.com/en-us/articles/15401661-best-efforts-running): the fourteen distances Strava
 * keeps, on ELAPSED time, the fastest stretch anywhere in the run, laps ignored. Garmin's shorter
 * list (1 mi/1 K, 5 K, 10 K, half, marathon) is a subset of it.
 *
 * ⚠️ LABELS ARE THE STORED KEYS. Readers index `run_records` by these strings; do not rename one.
 */
export const RUN_RECORD_DISTANCES: ReadonlyArray<{ label: string; meters: number }> = [
  { label: '400m', meters: 400 },
  { label: 'half_mile', meters: METERS_PER_MILE / 2 },
  { label: '1km', meters: 1000 },
  { label: '1mi', meters: METERS_PER_MILE },
  { label: '2mi', meters: METERS_PER_MILE * 2 },
  { label: '5k', meters: 5000 },
  { label: '10k', meters: 10000 },
  { label: '15k', meters: 15000 },
  { label: '10mi', meters: METERS_PER_MILE * 10 },
  { label: '20k', meters: 20000 },
  { label: 'half_marathon', meters: 21097.5 },
  { label: '30k', meters: 30000 },
  { label: 'marathon', meters: 42195 },
  { label: '50k', meters: 50000 },
];

/**
 * FIELD — Strava, "Best Efforts for Rides"
 * (support.strava.com/en-us/articles/15401645-best-efforts-cycling): the fastest-distance list.
 * Garmin keeps only 40 K, which is on it (Michael, 2026-09-19: cycling uses Strava's full list).
 */
export const RIDE_RECORD_DISTANCES: ReadonlyArray<{ label: string; meters: number }> = [
  { label: '5mi', meters: METERS_PER_MILE * 5 },
  { label: '10k', meters: 10000 },
  { label: '10mi', meters: METERS_PER_MILE * 10 },
  { label: '20k', meters: 20000 },
  { label: '30k', meters: 30000 },
  { label: '40k', meters: 40000 },
  { label: '50k', meters: 50000 },
  { label: '80k', meters: 80000 },
  { label: '50mi', meters: METERS_PER_MILE * 50 },
  { label: '90k', meters: 90000 },
  { label: '100k', meters: 100000 },
  { label: '100mi', meters: METERS_PER_MILE * 100 },
  { label: '180k', meters: 180000 },
];

// =============================================================================
// THE GPS SANITY CUT
// =============================================================================

/**
 * ⛔ A GLITCH IS NOT A RECORD. Strava states that bad GPS makes a stretch ineligible; it does not
 * state how bad. Both ceilings below are therefore **OURS** — a speed no human sustains over the
 * shortest distance in the list, so nothing real is ever refused.
 *
 * OURS — run sanity cut, faster than 3:00/mi. Inherited unchanged from
 * `compute-workout-analysis calculateBestRunEfforts` (ledger row: docs/STATE-SOURCES.md).
 */
export const RUN_MAX_SPEED_MPS = METERS_PER_MILE / 180;

/**
 * OURS — ride sanity cut, faster than 100 km/h. The shortest ride distance on the list is 5 miles;
 * covering 8 km at 100 km/h is a motor-paced record, not a ride (ledger row: docs/STATE-SOURCES.md).
 */
export const RIDE_MAX_SPEED_MPS = 100_000 / 3600;

// =============================================================================
// THE SHAPE
// =============================================================================

export type DistanceEffort = {
  /** The record: clock seconds for EXACTLY this distance, interpolated at both ends of the window. */
  elapsed_s: number;
  /** The trend: grade-adjusted seconds per mile over the same window, on moving seconds. Runs only. */
  gap_s_per_mi?: number | null;
  /** Average heart rate inside the window; null where the trace dropped out. */
  avg_hr: number | null;
  /** Metres gained or lost across the window; null where the device reports no elevation. */
  net_elev_m: number | null;
};

/** `{ '5k': {...}, 'marathon': {...} }` — only the distances the workout was long enough to contain. */
export type DistanceEfforts = Record<string, DistanceEffort>;

/** Where the fastest window for one distance sat, and how long it took. */
export type Window = { startIdx: number; endIdx: number; elapsedS: number };

// =============================================================================
// THE FINDER
// =============================================================================

/**
 * The fastest stretch covering EXACTLY `targetM` metres, timed on the same clock the distances were
 * measured against.
 *
 * @param cumDistM  cumulative metres, one entry per sample
 * @param cumTimeS  cumulative seconds, same length, same clock
 */
export function fastestWindowForDistance(
  cumDistM: ReadonlyArray<number>,
  cumTimeS: ReadonlyArray<number>,
  targetM: number,
): Window | null {
  const n = Math.min(cumDistM?.length ?? 0, cumTimeS?.length ?? 0);
  /**
   * ⛔ A RESOLUTION FLOOR, NOT A LENGTH CHECK — the same floor `buildRunPaceCurve` draws, for the
   * same reason: a handful of samples spanning a long way produces an interpolation, not a
   * measurement.
   */
  if (n < 10) return null;
  if (!(targetM > 0)) return null;
  if (cumDistM[n - 1] - cumDistM[0] < targetM) return null;

  let best: Window | null = null;
  let start = 0;
  for (let end = 1; end < n; end++) {
    // Keep `start` at the last sample from which the window still covers the distance, so the window
    // is the tightest one that spans it.
    while (start < end - 1 && cumDistM[end] - cumDistM[start + 1] >= targetM) start++;
    const dist = cumDistM[end] - cumDistM[start];
    if (dist < targetM) continue;

    // ⛔ THE OVERSHOOT COMES OFF. Everything past `targetM` sits inside the single segment
    // [start, start+1] — the loop above guarantees the window from start+1 is already too short —
    // so it is trimmed at that segment's own pace.
    const over = dist - targetM;
    let trimS = 0;
    if (over > 0) {
      const segDist = cumDistM[start + 1] - cumDistM[start];
      const segTime = cumTimeS[start + 1] - cumTimeS[start];
      if (segDist > 0 && segTime > 0) trimS = segTime * Math.min(over / segDist, 1);
    }
    const elapsedS = (cumTimeS[end] - cumTimeS[start]) - trimS;
    if (!(elapsedS > 0)) continue;
    if (best && elapsedS >= best.elapsedS) continue;
    best = { startIdx: start, endIdx: end, elapsedS };
  }
  return best;
}

function averageOver(series: ReadonlyArray<number | null> | undefined, s: number, e: number): number | null {
  if (!series) return null;
  const vals = series.slice(s, e + 1).filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function netOver(series: ReadonlyArray<number | null> | undefined, s: number, e: number): number | null {
  if (!series) return null;
  const a = series[s];
  const b = series[e];
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) * 10) / 10;
}

export type BestEffortsInput = {
  /** Cumulative metres AS RECORDED — not grade-adjusted. A record is the ground it covered. */
  cumDistM: ReadonlyArray<number>;
  /** Cumulative ELAPSED seconds — not moving seconds. Strava and Garmin both time records on the clock. */
  cumElapsedS: ReadonlyArray<number>;
  hrBpm?: ReadonlyArray<number | null>;
  elevationM?: ReadonlyArray<number | null>;
  /** Cumulative GRADE-ADJUSTED metres, for `gap_s_per_mi`. Omit and the field is omitted. */
  cumFlatM?: ReadonlyArray<number> | null;
  /** Cumulative MOVING seconds, the clock `cumFlatM` is paired with. */
  cumMovingS?: ReadonlyArray<number> | null;
  /** The OURS sanity ceiling for this sport, in m/s. */
  maxSpeedMps: number;
};

/**
 * Every record distance the workout contains, each with the as-run elapsed time and — when the
 * grade-adjusted series are supplied — the grade-adjusted pace over the same window.
 */
export function bestDistanceEfforts(
  distances: ReadonlyArray<{ label: string; meters: number }>,
  input: BestEffortsInput,
): DistanceEfforts | null {
  const { cumDistM, cumElapsedS, hrBpm, elevationM, cumFlatM, cumMovingS, maxSpeedMps } = input;
  const out: DistanceEfforts = {};

  for (const { label, meters } of distances) {
    const w = fastestWindowForDistance(cumDistM, cumElapsedS, meters);
    if (!w) continue;
    if (meters / w.elapsedS > maxSpeedMps) continue;

    const effort: DistanceEffort = {
      elapsed_s: Math.round(w.elapsedS * 10) / 10,
      avg_hr: averageOver(hrBpm, w.startIdx, w.endIdx),
      net_elev_m: netOver(elevationM, w.startIdx, w.endIdx),
    };

    // ⚠️ THE TREND NUMBER IS READ OVER THE SAME SAMPLES, UNTRIMMED. The trim is a fraction of one
    // sample; carrying it into a grade-adjusted average would imply a precision the elevation trace
    // does not have.
    if (cumFlatM && cumMovingS && cumFlatM.length > w.endIdx && cumMovingS.length > w.endIdx) {
      const flatM = cumFlatM[w.endIdx] - cumFlatM[w.startIdx];
      const movingS = cumMovingS[w.endIdx] - cumMovingS[w.startIdx];
      effort.gap_s_per_mi = flatM > 0 && movingS > 0 ? Math.round((movingS / flatM) * METERS_PER_MILE) : null;
    }

    out[label] = effort;
  }

  return Object.keys(out).length > 0 ? out : null;
}
