/**
 * ═══ RUN PACE — ONE SET OF RULES FOR EVERY PACE NUMBER ON A RUN (2026-09-14, Michael) ═══════════════════
 *
 * "Nothing should do its own math. Single source of truth, smart server, dumb client."
 *
 * Before this, a run's rep pace counted the seconds stopped at a light while the whole-run pace did not,
 * grade-adjusted pace was worked out six ways, a Strava run's Details pace divided by whole minutes, and
 * a 5.0% drift read three ways. Every server function that turns run samples into a pace reads these.
 *
 * SOURCES
 * - Pace is on moving time; stops do not count. Strava: "moving time is the best measure of how long you
 *   are active … Strava will generally prioritize moving time and pace based on moving time"; a run
 *   tagged as a race uses elapsed time (that rule is unchanged, `_shared/moving-seconds.ts`):
 *   support.strava.com/hc/en-us/articles/115001188684-Moving-Time-Speed-and-Pace-Calculations
 * - Grade-adjusted pace: Minetti et al. 2002, the cost curve and per-sample grade in `./gap.ts`.
 * - Drift: Viada p107 — a session "is terminated when cardiac drift reaches 10 percent", 5 percent for
 *   hybrid athletes. "Reaches" — 5.0% is at the line.
 * - "Inside the range" has no allowance; the book prints none (docs/SOURCE-viada-hybrid-athlete.md,
 *   p233), and the ride rule is the same (`./ride-power.ts`).
 *
 * OURS (docs/STATE-SOURCES.md)
 * - The stopped line, slower than 40:00/mi. Strava says stops come out but publishes no speed. 40:00/mi
 *   is the line `./gap.ts` already used to drop stopped samples; it is now the only one.
 * - A jump of more than 60 s between two samples is a recording break and counts as stopped. The summary
 *   step's existing cap, moved here unchanged.
 */
import { computeSampleGrades, hasUsableElevation, paceToGAP } from './gap.ts';

const METERS_PER_MILE = 1609.34;

/** OURS — slower than this a second counts as stopped (see header). */
export const STOPPED_SLOWER_THAN_S_PER_MI = 2400;
export const STOPPED_BELOW_MPS = METERS_PER_MILE / STOPPED_SLOWER_THAN_S_PER_MI;

/** OURS — a gap between samples longer than this is a recording break (see header). */
export const SAMPLE_BREAK_S = 60;

/** Viada p107, for hybrid athletes. A drift at or above this has reached the line. */
export const DRIFT_LINE_PCT = 5;

/** One recorded second as the rules read it. `t` seconds, `d` cumulative metres, `v` m/s, `elev` metres. */
export type RunSample = { t?: number | null; d?: number | null; v?: number | null; elev?: number | null };

const num = (x: unknown): number | null => {
  const n = Number(x);
  return x != null && Number.isFinite(n) ? n : null;
};

/** Speed at sample i: the recorded speed, or the distance covered since the previous sample. */
function speedAt(samples: ReadonlyArray<RunSample>, i: number, dt: number): number {
  const v = num(samples[i]?.v);
  if (v != null && v >= 0) return v;
  const d1 = num(samples[i]?.d);
  const d0 = num(samples[i - 1]?.d);
  return d1 != null && d0 != null && dt > 0 ? Math.max(0, d1 - d0) / dt : 0;
}

/** Seconds between samples s and e (inclusive) spent moving. */
export function movingSecondsBetween(samples: ReadonlyArray<RunSample>, s: number, e: number): number {
  let moving = 0;
  const end = Math.min(e, samples.length - 1);
  for (let i = Math.max(1, s + 1); i <= end; i += 1) {
    const t1 = num(samples[i]?.t);
    const t0 = num(samples[i - 1]?.t);
    if (t1 == null || t0 == null) continue;
    const dt = t1 - t0;
    if (!(dt > 0) || dt > SAMPLE_BREAK_S) continue;
    if (speedAt(samples, i, dt) >= STOPPED_BELOW_MPS) moving += dt;
  }
  return moving;
}

/** Metres covered between samples s and e. */
export function metersBetween(samples: ReadonlyArray<RunSample>, s: number, e: number): number {
  const end = Math.min(e, samples.length - 1);
  const d0 = num(samples[s]?.d);
  const d1 = num(samples[end]?.d);
  return d0 != null && d1 != null ? Math.max(0, d1 - d0) : 0;
}

/** Seconds per mile. Null when either side is missing. */
export function paceSecPerMi(meters: number | null | undefined, movingSeconds: number | null | undefined): number | null {
  const m = num(meters);
  const s = num(movingSeconds);
  if (m == null || s == null || !(m > 0) || !(s > 0)) return null;
  return s / (m / METERS_PER_MILE);
}

/**
 * A whole run's moving seconds, in order: the watch or Strava's own moving seconds when the import kept
 * them; the provider's own average moving speed over the distance (Strava's average speed is distance ÷
 * its moving time, so this recovers its seconds on rows imported before the seconds were kept); the
 * moving seconds counted from the samples. Never a whole-minute column.
 */
export function runMovingSeconds(
  provider: { movingSeconds?: number | null; avgSpeedMps?: number | null; distanceM?: number | null },
  samples: ReadonlyArray<RunSample>,
): number | null {
  const p = num(provider?.movingSeconds);
  if (p != null && p > 0) return Math.round(p);
  const v = num(provider?.avgSpeedMps);
  const dm = num(provider?.distanceM);
  if (v != null && v > 0 && dm != null && dm > 0) return Math.round(dm / v);
  if (!samples.length) return null;
  const counted = movingSecondsBetween(samples, 0, samples.length - 1);
  return counted > 0 ? Math.round(counted) : null;
}

/** Per-sample grades for the whole run, or null when the run has no usable elevation. Compute once per run. */
export function runGrades(samples: ReadonlyArray<RunSample>): number[] | null {
  const view = samples.map((x) => ({ elevation_m: num(x?.elev), distance_m: num(x?.d) }));
  if (!hasUsableElevation(view)) return null;
  return computeSampleGrades(view);
}

/**
 * Grade-adjusted pace between samples s and e: the pace shown for that stretch, scaled by the metres run
 * over their flat-equivalent metres (each moving metre weighted by the Minetti cost of its grade). On flat
 * ground it equals the pace exactly.
 */
export function gapSecPerMiBetween(
  samples: ReadonlyArray<RunSample>,
  grades: ReadonlyArray<number> | null,
  s: number,
  e: number,
  paceSecPerMiValue: number | null | undefined,
): number | null {
  const pace = num(paceSecPerMiValue);
  if (!grades || pace == null || !(pace > 0)) return null;
  let meters = 0;
  let flatMeters = 0;
  const end = Math.min(e, samples.length - 1);
  for (let i = Math.max(1, s + 1); i <= end; i += 1) {
    const t1 = num(samples[i]?.t);
    const t0 = num(samples[i - 1]?.t);
    if (t1 == null || t0 == null) continue;
    const dt = t1 - t0;
    if (!(dt > 0) || dt > SAMPLE_BREAK_S) continue;
    if (speedAt(samples, i, dt) < STOPPED_BELOW_MPS) continue;
    const d1 = num(samples[i]?.d);
    const d0 = num(samples[i - 1]?.d);
    const dm = d1 != null && d0 != null ? Math.max(0, d1 - d0) : speedAt(samples, i, dt) * dt;
    meters += dm;
    // paceToGAP returns pace × flat cost ÷ cost at this grade (unchanged under 0.3%), so this ratio is the
    // flat-equivalent metres per metre run.
    const g = Number.isFinite(grades[i]) ? grades[i] : 0;
    flatMeters += dm * (1000 / paceToGAP(1000, g));
  }
  if (!(meters > 0) || !(flatMeters > 0)) return null;
  return pace * (meters / flatMeters);
}

/** Where a pace sits against its planned range: the range itself, no allowance. Slower reads `below`. */
export function paceRangeBand(
  paceSecPerMiValue: number | null | undefined,
  lowerSecPerMi: number | null | undefined,
  upperSecPerMi: number | null | undefined,
): 'below' | 'in' | 'above' | null {
  const p = num(paceSecPerMiValue);
  const lo = num(lowerSecPerMi);
  const hi = num(upperSecPerMi);
  if (p == null || !(p > 0) || lo == null || hi == null || !(lo > 0) || !(hi > 0)) return null;
  if (p > hi) return 'below';
  if (p < lo) return 'above';
  return 'in';
}

/** Viada p107: drift has reached the line at 5.0%. */
export function driftReachesLine(pct: number | null | undefined): boolean {
  const n = num(pct);
  return n != null && n >= DRIFT_LINE_PCT;
}

/** Cumulative moving seconds at each sample (the same moving rule as every run pace above). */
export function cumulativeMovingSeconds(samples: ReadonlyArray<RunSample>): number[] {
  const out = new Array<number>(samples.length).fill(0);
  for (let i = 1; i < samples.length; i += 1) {
    const t1 = num(samples[i]?.t);
    const t0 = num(samples[i - 1]?.t);
    let add = 0;
    if (t1 != null && t0 != null) {
      const dt = t1 - t0;
      if (dt > 0 && dt <= SAMPLE_BREAK_S && speedAt(samples, i, dt) >= STOPPED_BELOW_MPS) add = dt;
    }
    out[i] = out[i - 1] + add;
  }
  return out;
}
