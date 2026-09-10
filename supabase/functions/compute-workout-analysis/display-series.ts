/**
 * ⛔ THE LINES THE DETAILS MAP PLOTS, AND THE NUMBERS ITS SCRUB READOUTS PRINT (2026-09-10, audit
 * H-D02 and H-D03). The phone used to rebuild every one of these from the raw samples: a grade window
 * clamped to ±30% and trimmed at the 2nd/98th percentile, VAM per point with GPS speed and grade
 * cut-offs, pace from two 30-point averages, heart rate trimmed at 5-95%, cadence gaps filled with 80,
 * power trimmed at 2/98, and a running elevation total. Its windows were counted in POINTS of a series
 * the server had already thinned to about 800, so the same ride smoothed differently at 1 hour and at
 * 4 hours. These are counted in SECONDS or METRES of the full recording, before the thinning.
 *
 * Every window below is OURS. No field source gives a display smoothing for a session chart;
 * Garmin Connect, Strava and TrainingPeaks each smooth their graphs and none publishes the window.
 *
 * Pure functions over index-aligned arrays, so they are tested without a database
 * (display-series.test.ts).
 */

/** OURS — pace is distance over the minute centred on the sample, so a GPS jump of a few metres does not plot as a sprint. */
export const PACE_WINDOW_S = 60;
/** OURS — moved from the phone (its "need at least 10 m"): less than this inside the window is standing, and has no pace. */
export const PACE_MIN_SPAN_M = 10;
/** OURS — heart rate averaged over the 15 seconds centred on the sample. Nothing is trimmed: a real peak stays. */
export const HR_WINDOW_S = 15;
/** OURS — cadence averaged over the 30 seconds centred on the sample. Gaps stay gaps; nothing is filled. */
export const CADENCE_WINDOW_S = 30;
/** OURS — power averaged over the 30 seconds centred on the sample. Coasting zeros count (the ride fill writes them). */
export const POWER_WINDOW_S = 30;
/** OURS — VAM is the climb over the minute centred on the sample, per hour. */
export const VAM_WINDOW_S = 60;
/** OURS — grade is the rise over the 100 m centred on the sample. */
export const GRADE_WINDOW_M = 100;
/** OURS — moved from the phone (its "require ≥20 m span"): a shorter stretch has no grade. */
export const GRADE_MIN_SPAN_M = 20;
/** OURS — moved from the phone: a climb or descent counts once the elevation line has moved this far… */
export const CLIMB_STEP_M = 1.5;
/** OURS — …over at least this distance. */
export const CLIMB_MIN_DIST_M = 20;

type Num = number | null;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const round = (v: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/** An array with no reading at all is written empty, so a recording without a sensor stores nothing for it. */
function orEmpty(a: Num[]): Num[] {
  return a.some(fin) ? a : [];
}

/**
 * For each sample, the first and last index whose axis value lies within ±half of it. The axis (time or
 * distance) never decreases; repeated values (a stop) are allowed.
 */
function windowBounds(axis: number[], half: number): { lo: Int32Array; hi: Int32Array } {
  const n = axis.length;
  const lo = new Int32Array(n);
  const hi = new Int32Array(n);
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    const x = axis[i];
    while (a < i && axis[a] < x - half) a++;
    if (b < i) b = i;
    while (b + 1 < n && axis[b + 1] <= x + half) b++;
    lo[i] = a;
    hi[i] = b;
  }
  return { lo, hi };
}

/** Mean of the finite readings within ±windowS/2 of each sample's time; null where the window holds none. */
export function centredTimeMean(values: Num[], time_s: number[], windowS: number, decimals = 0): Num[] {
  const n = Math.min(values.length, time_s.length);
  const { lo, hi } = windowBounds(time_s.slice(0, n), windowS / 2);
  const out: Num[] = new Array(n).fill(null);
  // Prefix sums of the finite readings and of how many there are.
  const sum = new Float64Array(n + 1);
  const cnt = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    sum[i + 1] = sum[i] + (fin(v) ? v : 0);
    cnt[i + 1] = cnt[i] + (fin(v) ? 1 : 0);
  }
  for (let i = 0; i < n; i++) {
    const c = cnt[hi[i] + 1] - cnt[lo[i]];
    if (c > 0) out[i] = round((sum[hi[i] + 1] - sum[lo[i]]) / c, decimals);
  }
  return out;
}

/** Seconds per km over the PACE_WINDOW_S centred on each sample. */
export function paceSeries(time_s: number[], distance_m: number[], windowS = PACE_WINDOW_S): Num[] {
  const n = Math.min(time_s.length, distance_m.length);
  const { lo, hi } = windowBounds(time_s.slice(0, n), windowS / 2);
  const out: Num[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const dd = distance_m[hi[i]] - distance_m[lo[i]];
    const dt = time_s[hi[i]] - time_s[lo[i]];
    if (dd > PACE_MIN_SPAN_M && dt > 0) out[i] = Math.round(dt / (dd / 1000));
  }
  return out;
}

/** Metres climbed per hour over the VAM_WINDOW_S centred on each sample (negative on a descent). */
export function vamSeries(time_s: number[], elevation_m: Num[], windowS = VAM_WINDOW_S): Num[] {
  const n = Math.min(time_s.length, elevation_m.length);
  const { lo, hi } = windowBounds(time_s.slice(0, n), windowS / 2);
  const out: Num[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const e0 = elevation_m[lo[i]];
    const e1 = elevation_m[hi[i]];
    const dt = time_s[hi[i]] - time_s[lo[i]];
    // Half a window is the least a sample at the start or end of the recording can have.
    if (fin(e0) && fin(e1) && dt >= windowS / 2) out[i] = Math.round(((e1 - e0) / dt) * 3600);
  }
  return out;
}

/** Percent grade over the GRADE_WINDOW_M centred on each sample. */
export function gradeSeries(distance_m: number[], elevation_m: Num[], windowM = GRADE_WINDOW_M): Num[] {
  const n = Math.min(distance_m.length, elevation_m.length);
  const { lo, hi } = windowBounds(distance_m.slice(0, n), windowM / 2);
  const out: Num[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const e0 = elevation_m[lo[i]];
    const e1 = elevation_m[hi[i]];
    const dd = distance_m[hi[i]] - distance_m[lo[i]];
    if (fin(e0) && fin(e1) && dd >= GRADE_MIN_SPAN_M) out[i] = round(((e1 - e0) / dd) * 100, 1);
  }
  return out;
}

/**
 * Elevation gained and lost so far, at every sample (H-D03).
 *
 * ⛔ THE LAST POINT IS THE SESSION'S RECORDED TOTAL WHEN THE ROW HAS ONE. The device's gain (the
 * number the Details tab prints) and a sum over the smoothed elevation line are never equal, and the
 * phone used to jump from one to the other 25 m from the finish. Here the running sum is scaled so it
 * ends on the recorded total: the readout climbs where the line climbs and finishes on the same number
 * the session shows everywhere else. ⚠️ OURS — the scaling is our choice; no source describes it.
 * With no recorded total the running sum stands as it is.
 */
export function cumulativeClimb(
  distance_m: number[],
  elevation_m: Num[],
  totals: { gain_m?: number | null; loss_m?: number | null } = {},
): { gain: Num[]; loss: Num[] } {
  const n = Math.min(distance_m.length, elevation_m.length);
  const first = elevation_m.findIndex(fin);
  if (n === 0 || first < 0) return { gain: [], loss: [] };
  const gain: number[] = new Array(n).fill(0);
  const loss: number[] = new Array(n).fill(0);
  let anchorE = elevation_m[first] as number;
  let anchorD = distance_m[first];
  let g = 0;
  let l = 0;
  for (let i = first; i < n; i++) {
    const e = elevation_m[i];
    if (fin(e)) {
      const dh = e - anchorE;
      if (distance_m[i] - anchorD >= CLIMB_MIN_DIST_M && Math.abs(dh) >= CLIMB_STEP_M) {
        if (dh > 0) g += dh; else l -= dh;
        anchorE = e;
        anchorD = distance_m[i];
      }
    }
    gain[i] = g;
    loss[i] = l;
  }
  const scaled = (arr: number[], last: number, total: number | null | undefined): Num[] => {
    const k = fin(total) && total >= 0 && last > 0 ? total / last : 1;
    return arr.map((v) => round(v * k, 1));
  };
  return { gain: scaled(gain, g, totals.gain_m), loss: scaled(loss, l, totals.loss_m) };
}

export type DisplaySeriesInput = {
  time_s: number[];
  distance_m: number[];
  /** The server's smoothed elevation (the `elevation_m` series). */
  elevation_m: Num[];
  hr_bpm: Num[];
  /** rpm on a ride, steps per minute otherwise. */
  cadence: Num[];
  power_w: Num[];
  isRide: boolean;
  /** `isIndoorSession` — no grade and no VAM indoors (no real altitude on a trainer, a treadmill or Zwift). */
  indoor: boolean;
  total_gain_m?: number | null;
  total_loss_m?: number | null;
};

/** The keys added to `computed.analysis.series`. Each is index-aligned with `time_s`, or empty. */
export function buildDisplaySeries(inp: DisplaySeriesInput): Record<string, Num[]> {
  const { time_s, distance_m, elevation_m, isRide, indoor } = inp;
  const climb = cumulativeClimb(distance_m, elevation_m, { gain_m: inp.total_gain_m, loss_m: inp.total_loss_m });
  return {
    // Rides plot speed (`speed_mps`); pace is for everything else.
    pace_display_s_per_km: isRide ? [] : orEmpty(paceSeries(time_s, distance_m)),
    hr_display_bpm: orEmpty(centredTimeMean(inp.hr_bpm, time_s, HR_WINDOW_S)),
    cadence_display: orEmpty(centredTimeMean(inp.cadence, time_s, CADENCE_WINDOW_S)),
    power_display_w: orEmpty(centredTimeMean(inp.power_w, time_s, POWER_WINDOW_S)),
    grade_display_pct: indoor ? [] : orEmpty(gradeSeries(distance_m, elevation_m)),
    vam_m_per_h: indoor ? [] : orEmpty(vamSeries(time_s, elevation_m)),
    elevation_gain_cum_m: climb.gain,
    elevation_loss_cum_m: climb.loss,
  };
}
