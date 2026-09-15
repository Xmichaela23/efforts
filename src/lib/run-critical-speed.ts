/**
 * RUN THRESHOLD FROM BEST EFFORTS — critical speed, fitted from the athlete's own training runs, offered as a
 * suggestion to accept (the FTP pattern: the learner measures, the athlete accepts, nothing re-prices until then).
 *
 * SOURCE — Smyth B, Muniz-Pumares D. "Calculation of critical speed from raw training data in recreational
 * marathon runners." Med Sci Sports Exerc 2020;52(12):2637–2645. doi:10.1249/MSS.0000000000002412. Read directly:
 *   · "the fastest time recorded at any time within the 16-week period … for a range of target distances:
 *     400 m, 800 m, 1,000 m, 1,500 m, 3,000 m, and 5,000 m"
 *   · CS is "the slope of the line" of distance against time, D′ the intercept, from "at least three of the
 *     target distances"
 *   · runners with "at least 24 activities logged during this period"
 *   · no heart-rate check: the paper had none, and the straightness of the distance-time line is its support.
 *
 * GRADE-ADJUSTED PACE ON EVERY EFFORT, NO MINIMUM LENGTH (Michael, 2026-09-14, final). The paper used grade-adjusted
 * pace; so do the field's tools on any stretch of any length — TrainingPeaks' Normalized Graded Pace ("what your speed
 * would have been if you ran on flat terrain", trainingpeaks.com/learn/articles/what-is-normalized-graded-pace) and
 * Garmin's Grade Adjusted Pace ("your equivalent running pace at the same effort on flat ground … depending on the
 * current gradient", support.garmin.com FAQ BAoTNwybG874OFTrWhzlq8). The metres are the ones `_shared/run-pace.ts`
 * weights by grade; a run with no usable elevation keeps its metres as run. Timing is moving seconds.
 *
 * WHERE THIS DIFFERS FROM THE PAPER, EACH MARKED OURS (docs/STATE-SOURCES.md):
 *   · Net descent steeper than 1% of the effort's distance is refused (course-measurement practice: 1 m/km of net
 *     drop ends record eligibility).
 *   · THE BEST 45 MINUTES IS A SEVENTH POINT, and only when that window was hard: average heart rate at or above
 *     95% of threshold heart rate, the floor of Friel's run Zone 4 "threshold" (`friel-zones.ts`). The window is
 *     TrainingPeaks' threshold read ("Peak 45 Min Average Pace", trainingpeaks.com/blog/are-you-using-
 *     threshold-improvement-notifications); here it is one point on the line, never an override.
 *   · The checks on the fit: efforts from at least two different runs, R² ≥ 0.95, D′ 30–600 m, and at least 4%
 *     faster than the measured easy pace. There is no heart-rate check on the distance efforts and no check that
 *     longer efforts are slower — the paper has neither; the straight line is the check.
 *
 * ⚠️ CRITICAL SPEED IS TAKEN AS THE THRESHOLD PACE, UNSCALED. It sits a few percent above maximal lactate steady
 * state; the swim already shows its critical speed as threshold. The ride's 0.97 × critical power has no run
 * source that was found.
 *
 * No I/O. Pure functions. Importable from the React client AND Deno edge functions.
 */
import { Z4_FLOOR_PCT_LTHR } from './friel-zones.ts';

const SEC_PER_KM_TO_SEC_PER_MI = 1.609344;

/** Smyth & Muniz-Pumares 2020 target distances, metres. */
export const RUN_BEST_EFFORT_DISTANCES_M = [400, 800, 1000, 1500, 3000, 5000] as const;
/** The paper's window: the 16 weeks before. */
export const RUN_CS_WINDOW_DAYS = 16 * 7;
/** The paper's inclusion rule: at least 24 runs logged in the window. */
export const RUN_CS_MIN_RUNS = 24;
/** The paper's minimum: at least three target distances. */
export const RUN_CS_MIN_DISTANCES = 3;
/** OURS — the best-45-minute window counts only at or above the floor of Friel run Zone 4 (95% of threshold HR). */
export const HARD_45_MIN_PCT_LTHR = Z4_FLOOR_PCT_LTHR;
/** OURS — net descent steeper than 1% of the distance is gravity, not fitness. */
const MAX_NET_DESCENT_FRACTION = -0.01;
/** Sanity band for a fitted threshold pace, sec/MILE. Same band the pace resolvers use. */
const CS_SANE_SEC_PER_MI = { min: 180, max: 1200 };
/** OURS — the app's ±4% pace-divergence band (`RUN_PACE_DIVERGENCE_THRESHOLD`); a threshold must beat easy by it. */
const CS_MIN_MARGIN_ON_EASY = 0.04;
/** OURS — the line must be straight; the paper's lines averaged R² 0.9999. */
const CS_MIN_R2 = 0.95;
/** Plausible anaerobic distance capacity, metres (literature ~100–300 m for trained runners; wider on purpose). */
const D_PRIME_SANE_M = { min: 30, max: 600 };

export type RunCsConfidence = 'insufficient' | 'moderate' | 'high';

export type RunCsPoint = { label: string; distanceM: number; timeS: number; date: string; avgHr: number | null };

export type RunCsResult = {
  /** Suggested threshold pace, sec per KM — the unit `learned_fitness` stores. null = abstained. */
  csSecPerKm: number | null;
  /** The same value in sec per MILE. */
  csSecPerMi: number | null;
  /** Anaerobic distance capacity, metres. The line's intercept; a plausibility check, not a product. */
  dPrimeM: number | null;
  r2: number | null;
  confidence: RunCsConfidence;
  nPoints: number;
  /** The efforts the line was drawn through — the receipt. */
  points: RunCsPoint[];
  /** The newest date among those efforts. */
  asOf: string | null;
  /** Plain-language account of what happened — the receipt, and the abstention reason. */
  reason: string;
};

/** One run's fastest stretch at each target distance, timed on moving seconds. Keys are the distance in metres. */
export type RunDistanceBests = Record<string, PaceCurvePoint>;

/** One run as the fit reads it. */
export type RunCsRun = { date: string; distanceBests?: RunDistanceBests | null; paceCurve?: RunPaceCurve | null };

function abstain(reason: string, points: RunCsPoint[] = []): RunCsResult {
  return { csSecPerKm: null, csSecPerMi: null, dPrimeM: null, r2: null, confidence: 'insufficient', nPoints: points.length, points, asOf: null, reason };
}

const isLevel = (p: { distanceM: number; netAscentM?: number | null }) =>
  p.netAscentM == null || !Number.isFinite(p.netAscentM) || (p.netAscentM / p.distanceM) >= MAX_NET_DESCENT_FRACTION;

const dayNumber = (iso: string) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 86_400_000);

/**
 * The suggested threshold pace from the runs in the 16 weeks up to `asOf`.
 *
 * @param runs             every run on file (any window); the fit keeps those inside the 16 weeks
 * @param asOf             the day the window ends, YYYY-MM-DD
 * @param thresholdHrBpm   the athlete's threshold heart rate — only for the best-45-minute point; null leaves it out
 * @param easyPaceSecPerKm the measured easy pace, for the faster-than-easy check; null skips that check
 */
export function fitRunThresholdFromBestEfforts(
  runs: RunCsRun[],
  asOf: string,
  thresholdHrBpm: number | null,
  easyPaceSecPerKm: number | null,
): RunCsResult {
  const end = dayNumber(asOf);
  if (!Number.isFinite(end)) return abstain('no date to count the 16 weeks back from');
  const inWindow = (runs || []).filter((r) => {
    const d = dayNumber(r?.date);
    return Number.isFinite(d) && d <= end && d > end - RUN_CS_WINDOW_DAYS;
  });
  if (inWindow.length < RUN_CS_MIN_RUNS) {
    return abstain(`${inWindow.length} runs in the last 16 weeks; the method needs ${RUN_CS_MIN_RUNS}`);
  }

  // ── The fastest level effort at each target distance, across the window. ──
  const points: RunCsPoint[] = [];
  for (const D of RUN_BEST_EFFORT_DISTANCES_M) {
    let best: RunCsPoint | null = null;
    for (const r of inWindow) {
      const p = r.distanceBests?.[String(D)];
      if (!p || !(p.timeS > 0) || !(p.distanceM > 0) || !isLevel(p)) continue;
      const timeS = p.timeS * (D / p.distanceM);
      if (!best || timeS < best.timeS) best = { label: `${D} m`, distanceM: D, timeS, date: String(r.date).slice(0, 10), avgHr: p.avgHr ?? null };
    }
    if (best) points.push(best);
  }
  if (points.length < RUN_CS_MIN_DISTANCES) {
    return abstain(`fastest efforts at ${points.length} of the six distances; the method needs ${RUN_CS_MIN_DISTANCES}`, points);
  }

  // ── The best 45 minutes, when it was hard. ──
  const hardFloor = thresholdHrBpm != null && Number.isFinite(thresholdHrBpm) && thresholdHrBpm > 0 ? thresholdHrBpm * HARD_45_MIN_PCT_LTHR : null;
  if (hardFloor != null) {
    let best45: RunCsPoint | null = null;
    for (const r of inWindow) {
      const w = r.paceCurve?.['2700'];
      if (!w || !(w.distanceM > 0) || !(w.timeS > 0) || !isLevel(w)) continue;
      if (!(w.avgHr != null && w.avgHr >= hardFloor)) continue;
      if (!best45 || w.distanceM > best45.distanceM) best45 = { label: 'best 45 min', distanceM: w.distanceM, timeS: w.timeS, date: String(r.date).slice(0, 10), avgHr: w.avgHr };
    }
    if (best45) points.push(best45);
  }

  const pts = [...points].sort((a, b) => a.timeS - b.timeS);
  const days = new Set(pts.map((p) => p.date));
  if (days.size < 2) return abstain('every effort came from one run — a line needs efforts on different days', pts);

  // ── distance = CS · time + D′ ──
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.timeS, 0) / n;
  const my = pts.reduce((a, p) => a + p.distanceM, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) { sxy += (p.timeS - mx) * (p.distanceM - my); sxx += (p.timeS - mx) ** 2; syy += (p.distanceM - my) ** 2; }
  if (sxx <= 0) return abstain('no spread in effort duration', pts);
  const cs = sxy / sxx;
  const dPrime = my - cs * mx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  if (!(cs > 0)) return abstain('the line produced no speed', pts);
  const csSecPerKm = 1000 / cs;
  const csSecPerMi = csSecPerKm * SEC_PER_KM_TO_SEC_PER_MI;

  if (csSecPerMi < CS_SANE_SEC_PER_MI.min || csSecPerMi > CS_SANE_SEC_PER_MI.max) {
    return abstain(`fitted pace ${Math.round(csSecPerMi)} s/mi is outside the plausible band`, pts);
  }
  if (easyPaceSecPerKm != null && Number.isFinite(easyPaceSecPerKm) && easyPaceSecPerKm > 0
      && csSecPerKm >= easyPaceSecPerKm * (1 - CS_MIN_MARGIN_ON_EASY)) {
    return abstain(`fitted threshold ${Math.round(csSecPerKm)} s/km is not at least 4% faster than the measured easy pace ${Math.round(easyPaceSecPerKm)} s/km`, pts);
  }
  if (r2 < CS_MIN_R2) return abstain(`R² ${r2.toFixed(3)} is below ${CS_MIN_R2} — the efforts do not lie on one line`, pts);
  if (dPrime < D_PRIME_SANE_M.min || dPrime > D_PRIME_SANE_M.max) {
    return abstain(`implausible anaerobic capacity D′ ${Math.round(dPrime)} m`, pts);
  }

  // OURS — confidence: five or more points on a near-perfect line is high; anything that passed is moderate.
  const confidence: RunCsConfidence = n >= 5 && r2 >= 0.99 ? 'high' : 'moderate';
  const asOfDate = pts.map((p) => p.date).sort().at(-1) ?? null;
  return {
    csSecPerKm: Math.round(csSecPerKm),
    csSecPerMi: Math.round(csSecPerMi),
    dPrimeM: Math.round(dPrime),
    r2: Number(r2.toFixed(4)),
    confidence,
    nPoints: n,
    points: pts,
    asOf: asOfDate,
    reason: `critical speed from ${n} best efforts (${pts.map((p) => p.label).join(', ')}), R² ${r2.toFixed(3)}`,
  };
}

/**
 * The fastest stretch at each target distance inside one run, timed on MOVING seconds (`_shared/run-pace.ts`),
 * so a stop at a light does not slow the effort. Heart rate and net elevation ride along for the fit's checks.
 *
 * @param distanceM      cumulative GRADE-ADJUSTED metres, one entry per sample (`cumulativeFlatMeters`)
 * @param movingTimeS    cumulative moving seconds, same length
 * @param hrBpm          heart rate per sample; null where the trace dropped out
 * @param elevationM     elevation per sample; null where the device reports none
 */
export function buildRunDistanceBests(
  distanceM: number[],
  movingTimeS: number[],
  hrBpm: (number | null)[],
  elevationM?: (number | null)[],
): RunDistanceBests | null {
  const n = Math.min(distanceM?.length ?? 0, movingTimeS?.length ?? 0);
  if (n < 10) return null;
  const out: RunDistanceBests = {};
  for (const D of RUN_BEST_EFFORT_DISTANCES_M) {
    if (distanceM[n - 1] - distanceM[0] < D) continue;
    let best: PaceCurvePoint | null = null;
    let start = 0;
    for (let e = 1; e < n; e++) {
      // Keep the shortest window that still covers D metres.
      while (start < e - 1 && distanceM[e] - distanceM[start + 1] >= D) start++;
      const dist = distanceM[e] - distanceM[start];
      if (dist < D) continue;
      const moving = movingTimeS[e] - movingTimeS[start];
      if (!(moving > 0)) continue;
      const timeS = moving * (D / dist);          // exactly D metres
      if (best && timeS >= best.timeS) continue;
      const hr = hrBpm?.slice(start, e + 1).filter((h): h is number => h != null && Number.isFinite(h)) ?? [];
      let netAscentM: number | null = null;
      if (elevationM) {
        const a = elevationM[start], b = elevationM[e];
        if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b)) netAscentM = b - a;
      }
      best = { distanceM: D, timeS: Math.round(timeS * 10) / 10, avgHr: hr.length ? Math.round(hr.reduce((x, y) => x + y, 0) / hr.length) : null, netAscentM };
    }
    if (best) out[String(D)] = best;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * ⛔ THE DURATION CURVE — the fastest stretch of each TARGET DURATION inside one run.
 *
 * The run twin of `calculatePowerCurve` (`compute-workout-analysis:92`), which does exactly this for
 * the bike over watts. Same shape, same reason, one sport later.
 *
 * ⚠️ IT DOES NOT JUDGE. Every gate — was it hard, was it downhill, does it lie on a curve — belongs
 * to `fitRunThresholdFromBestEfforts`, which sees efforts from MANY runs and can compare them. This function's
 * whole job is to report what happened inside one activity, including the heart rate and the
 * elevation change the checks will need. The threshold fit reads only its 45-minute window.
 */

/**
 * The durations sampled. 2700 (45 minutes, added 2026-09-13) is the one the threshold fit reads, as one point when
 * the window was hard — TrainingPeaks: "We suggest a threshold if your Peak 45 Min Average Pace is faster than the
 * currently set threshold" (trainingpeaks.com/blog/are-you-using-threshold-improvement-notifications).
 */
export const PACE_CURVE_TARGETS_S = [180, 360, 720, 1200, 2100, 2700] as const;

export type PaceCurvePoint = {
  distanceM: number;
  timeS: number;
  avgHr: number | null;
  netAscentM: number | null;
};

/** `{ '180': {...}, '720': {...} }` — only the durations the run was long enough to contain. */
export type RunPaceCurve = Record<string, PaceCurvePoint>;

/**
 * @param distanceM  cumulative metres, one entry per sample
 * @param timeS      cumulative seconds, same length and same clock
 * @param hrBpm      heart rate per sample; null where the trace dropped out
 * @param elevationM elevation per sample in metres; null where the device reports none
 *
 * ⚠️ CUMULATIVE, NOT PER-SAMPLE. Both series are running totals — that is the shape
 * `compute-workout-analysis` already builds them in, and the shape `calculateBestRunEfforts` beside
 * this one already consumes. A window's distance is the difference between its ends, which is also
 * why a stop inside a window shows up as a slow window rather than a gap.
 */
export function buildRunPaceCurve(
  distanceM: number[],
  timeS: number[],
  hrBpm: (number | null)[],
  elevationM?: (number | null)[],
): RunPaceCurve | null {
  const n = Math.min(distanceM?.length ?? 0, timeS?.length ?? 0);
  /**
   * ⛔ A RESOLUTION FLOOR, NOT A LENGTH CHECK. Three samples spanning ten minutes would happily
   * produce a "best 3-minute window", and it would be an interpolation between two points rather
   * than a measurement of anything. A window is only as trustworthy as the sampling underneath it.
   * (Verified by mutation: removing this changes the answer for a sparse trace.)
   */
  if (n < 10) return null;

  const totalTime = timeS[n - 1] - timeS[0];
  const curve: RunPaceCurve = {};

  for (const target of PACE_CURVE_TARGETS_S) {
    // ⚠️ AN OPTIMISATION, NOT A GUARD — say so, because mutation showed removing it changes nothing:
    // the `span < target` test inside the scan already refuses a window the run cannot contain. This
    // just skips scanning the whole trace for durations that were never going to fit.
    if (totalTime < target) continue;

    let best: PaceCurvePoint | null = null;
    let start = 0;
    for (let end = 1; end < n; end++) {
      // Advance `start` while the window is LONGER than the target, so it stays the shortest window
      // that still spans it — the tightest read of "distance covered in `target` seconds".
      while (start < end - 1 && (timeS[end] - timeS[start + 1]) >= target) start++;
      const span = timeS[end] - timeS[start];
      if (span < target) continue;

      const dist = distanceM[end] - distanceM[start];
      if (!(dist > 0)) continue;
      // Normalise to exactly `target` seconds so windows are comparable when samples are irregular.
      const scaled = dist * (target / span);
      if (best && scaled <= best.distanceM) continue;

      const hrSlice = hrBpm?.slice(start, end + 1).filter((h): h is number => h != null && Number.isFinite(h)) ?? [];
      const avgHr = hrSlice.length > 0 ? Math.round(hrSlice.reduce((a, b) => a + b, 0) / hrSlice.length) : null;

      let netAscentM: number | null = null;
      if (elevationM) {
        const a = elevationM[start];
        const b = elevationM[end];
        if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b)) netAscentM = b - a;
      }

      best = { distanceM: Math.round(scaled), timeS: target, avgHr, netAscentM };
    }

    if (best) curve[String(target)] = best;
  }

  return Object.keys(curve).length > 0 ? curve : null;
}

/**
 * ⛔ THE HEART-RATE CURVE — the HIGHEST average heart rate a run held for 20 and 60 minutes (2026-09-13).
 *
 * The pace curve above answers "fastest 20 minutes"; its `avgHr` is the heart rate during THAT window, which on an
 * easy-but-fast stretch is nowhere near threshold (Michael, 2026-04-02: fastest 20 min at 152 bpm, Garmin-measured
 * threshold 172). TrainingPeaks reads threshold heart rate off the highest-HEART-RATE windows instead: "your best
 * 60-minute average heart rate, or 95% of your best 20-minute average heart rate, whichever is higher"
 * (trainingpeaks.com/blog/are-you-using-threshold-improvement-notifications). Intervals.icu does the same off 20/60 min
 * (forum.intervals.icu/t/threshold-heart-rate-achievements/1459). This records those two windows; the learner picks.
 *
 * Time-weighted: each sample's heart rate counts for the seconds until the next sample, so an uneven trace does not
 * over-weight the dense stretch. A window with heart rate on less than 80% of its time is skipped.
 * OURS — 80%: a strap that drops out for a fifth of a window is not a 20-minute reading.
 */
export const HR_CURVE_TARGETS_S = [1200, 3600] as const;
export type RunHrCurve = Record<string, { avgHr: number; timeS: number }>;

export function buildRunHrCurve(timeS: number[], hrBpm: (number | null)[]): RunHrCurve | null {
  const n = Math.min(timeS?.length ?? 0, hrBpm?.length ?? 0);
  if (n < 10) return null;
  // Per-sample duration: seconds until the next sample. The last sample carries none.
  const dur: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    const d = timeS[i + 1] - timeS[i];
    dur[i] = Number.isFinite(d) && d > 0 ? d : 0;
  }
  const curve: RunHrCurve = {};
  for (const target of HR_CURVE_TARGETS_S) {
    if (timeS[n - 1] - timeS[0] < target) continue;
    let best: number | null = null;
    let start = 0;
    let secs = 0, hrSecs = 0, hrSum = 0;
    for (let end = 0; end < n; end++) {
      const h = hrBpm[end];
      secs += dur[end];
      if (h != null && Number.isFinite(h) && h > 0) { hrSecs += dur[end]; hrSum += h * dur[end]; }
      // Shrink from the left while the window without its first sample still covers the target.
      while (start < end && secs - dur[start] >= target) {
        const hs = hrBpm[start];
        secs -= dur[start];
        if (hs != null && Number.isFinite(hs) && hs > 0) { hrSecs -= dur[start]; hrSum -= hs * dur[start]; }
        start++;
      }
      if (secs < target || hrSecs < 0.8 * secs) continue;
      const avg = hrSum / hrSecs;
      if (best == null || avg > best) best = avg;
    }
    if (best != null) curve[String(target)] = { avgHr: Math.round(best), timeS: target };
  }
  return Object.keys(curve).length > 0 ? curve : null;
}

/**
 * Threshold heart rate from stored heart-rate curves across many runs, by TrainingPeaks' rule: the higher of the best
 * 60-minute average and 95% of the best 20-minute average. Returns the run the winning window came from.
 */
export function thresholdHrFromHrCurves(
  runs: Array<{ date: string; hrCurve: RunHrCurve | null | undefined }>,
): { value: number; date: string; basis: '20' | '60'; windowAvgHr: number } | null {
  let best: { value: number; date: string; basis: '20' | '60'; windowAvgHr: number } | null = null;
  for (const r of runs) {
    const c = r.hrCurve;
    if (!c || typeof c !== 'object') continue;
    const w20 = Number(c['1200']?.avgHr);
    const w60 = Number(c['3600']?.avgHr);
    const candidates: Array<{ value: number; basis: '20' | '60'; windowAvgHr: number }> = [];
    if (Number.isFinite(w20) && w20 > 60 && w20 < 230) candidates.push({ value: Math.round(w20 * 0.95), basis: '20', windowAvgHr: w20 });
    if (Number.isFinite(w60) && w60 > 60 && w60 < 230) candidates.push({ value: Math.round(w60), basis: '60', windowAvgHr: w60 });
    for (const cnd of candidates) {
      if (!best || cnd.value > best.value) best = { ...cnd, date: String(r.date ?? '').slice(0, 10) };
    }
  }
  return best;
}
