/**
 * ═══ RIDE POWER — ONE SET OF RULES FOR EVERY WATT NUMBER ON A RIDE (2026-09-14, Michael) ═══════════════
 *
 * "Nothing should do its own math. Single source of truth, smart server, dumb client."
 *
 * Before this, one ride showed four "average powers" from four filters (99 / 129→131 / 130 / 131) and
 * called the same 130 W both red and "on target". Every server function that turns power samples into a
 * number reads these functions; nothing re-derives them.
 *
 * SOURCES
 * - Coasting and stops count as 0 W. TrainingPeaks keeps the zeros ("time spent coasting is resting") and
 *   uses every recorded second: help.trainingpeaks.com/hc/en-us/articles/204071804-Normalized-Power.
 * - Normalized power: Coggan — 30-second rolling mean, 4th power, mean, 4th root, first 30 s dropped:
 *   trainingpeaks.com/learn/articles/normalized-power-intensity-factor-training-stress/.
 * - Normalized power is not valid under about 20 minutes; shorter efforts are judged on average power:
 *   trainingpeaks.com/coach-blog/normalized-power-how-coaches-use/ and
 *   trainerroad.com/blog/normalized-power-what-it-is-and-how-to-use-it/.
 * - The 25 W pedalling floor is the Details tile's existing rule (compute-workout-analysis, "Avg Power
 *   (pedaling) >25 W only"); moved here unchanged.
 */

/** Seconds of effort below which normalized power is not used (TrainingPeaks / TrainerRoad, above). */
import { singleTargetBand } from './plan-tokens/quality-work.ts';
export const NORMALIZED_POWER_MIN_DURATION_S = 20 * 60;

/** Coggan's rolling window, in samples (1 Hz recording). */
export const NORMALIZED_POWER_WINDOW = 30;

/** A second above this counts as pedalling. The Details tile's rule, unchanged. */
// OURS — `PEDALING_POWER_THRESHOLD_W` 25 W: the Details tile's existing pedalling rule, moved unchanged, no outside source
export const PEDALING_POWER_THRESHOLD_W = 25;

/** Power readings above this are sensor spikes, not efforts. The interval builders' existing bound. */
// OURS — `MAX_PLAUSIBLE_W` 2000 W: the interval builders' existing spike bound, no outside source
const MAX_PLAUSIBLE_W = 2000;

/**
 * A sample's watts, KEEPING ZERO. The old readers wrote `(typeof s.power === 'number' && s.power)`, which
 * turns 0 into `false` and drops every coasting second without saying so.
 */
export function readPowerW(sample: Record<string, unknown> | null | undefined): number | undefined {
  if (!sample) return undefined;
  for (const k of ['powerInWatts', 'power_in_watts', 'power_watts', 'instantaneousPower', 'inst_power', 'power', 'power_w', 'watts']) {
    const v = (sample as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

/**
 * The stream as the rules read it: when the ride recorded power at all, a missing or implausible second is
 * 0 W (coasting, stopped). A ride with no power reading anywhere returns [] — never an all-zero stream.
 */
export function powerStreamW(values: ReadonlyArray<number | null | undefined>): number[] {
  const any = values.some((v) => typeof v === 'number' && Number.isFinite(v));
  if (!any) return [];
  return values.map((v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < MAX_PLAUSIBLE_W ? v : 0));
}

/** Mean of the stream, zeros included. */
export function averagePowerW(stream: ReadonlyArray<number>): number | null {
  if (!stream.length) return null;
  let sum = 0;
  for (const p of stream) sum += p;
  return sum / stream.length;
}

/** Coggan normalized power over the stream (zeros included). Null when shorter than one window. */
export function normalizedPowerW(stream: ReadonlyArray<number>): number | null {
  const n = stream.length;
  if (n < NORMALIZED_POWER_WINDOW) return null;
  let windowSum = 0;
  let fourthSum = 0;
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    windowSum += stream[i];
    if (i >= NORMALIZED_POWER_WINDOW) windowSum -= stream[i - NORMALIZED_POWER_WINDOW];
    if (i >= NORMALIZED_POWER_WINDOW - 1) {
      fourthSum += Math.pow(windowSum / NORMALIZED_POWER_WINDOW, 4);
      count += 1;
    }
  }
  return count > 0 ? Math.pow(fourthSum / count, 0.25) : null;
}

/**
 * Mean watts over the seconds spent pedalling (> 25 W), weighted by each sample's duration. A gap over
 * five minutes between samples is a recording break, not riding, and is skipped.
 */
export function pedalingAveragePowerW(
  timeS: ReadonlyArray<number>,
  stream: ReadonlyArray<number>,
): { avg_w: number | null; pedaling_s: number; clock_s: number } {
  let pedalingSec = 0;
  let weighted = 0;
  let clockSec = 0;
  for (let i = 1; i < stream.length && i < timeS.length; i += 1) {
    const dt = Math.max(0, (timeS[i] || 0) - (timeS[i - 1] || 0));
    // OURS — `pedalingAveragePowerW` a gap over 300 s is a recording break: no outside source
    if (dt <= 0 || dt > 300) continue;
    clockSec += dt;
    const p = stream[i];
    if (p > PEDALING_POWER_THRESHOLD_W) {
      pedalingSec += dt;
      weighted += p * dt;
    }
  }
  return { avg_w: pedalingSec > 0 ? weighted / pedalingSec : null, pedaling_s: pedalingSec, clock_s: clockSec };
}

/**
 * ⛔ THE RANGE A RIDE STEP IS JUDGED AGAINST (2026-09-18). A step whose floor and ceiling are the same number is one
 * power target ("151 W"), and a zero-width range fails every real second of riding. It is judged against
 * `SINGLE_PERCENT_BAND` either side (`singleTargetBand`) — the same ±10% (TrainingPeaks) the plan applies to a single percentage and the Garmin send
 * applies to a single target (`plan-tokens/quality-work.ts`). The row still prints the one number; only the test widens.
 * A floor with no ceiling (p237) and a real range pass through unchanged.
 */
export function judgedPowerRange(
  lowerW: number | null | undefined,
  upperW: number | null | undefined,
): { lower: number; upper: number | null } {
  const lo = Number(lowerW);
  const hi = upperW == null ? null : Number(upperW);
  if (lo > 0 && hi != null && hi === lo) {
    return singleTargetBand(lo);
  }
  return { lower: lo, upper: hi };
}

/** p239's easy step: a floor of exactly zero under a real ceiling ("easy ride below 75%"). */
export function isCeilingOnly(lowerW: number | null | undefined, upperW: number | null | undefined): boolean {
  const hi = Number(upperW);
  return lowerW != null && Number(lowerW) === 0 && upperW != null && Number.isFinite(hi) && hi > 0;
}

/**
 * ⛔⛔ THE WORDS FOR A ONE-SIDED RIDE STEP — ONE OWNER, EVERY SCREEN AND EVERY SEND (2026-09-18, round 3, audit items
 * 16 and 17). p237's anaerobic work is a floor ("best done by feel with a power floor rather than a specific power
 * target"): "253 W and up". p239's easy ride is a ceiling ("easy ride below 75%"): "under 173 W". The screen printed
 * these while Garmin and Intervals.icu/Zwift sent a 130%-of-FTP ceiling on the floor (a number p237 prints only as
 * the progressive option's top) and Zwift sent no target at all on the easy ride. Now the Planned tab, the session
 * detail, the Garmin step and the Intervals.icu step all print these words; a device target is sent only where the
 * device can hold the page's own shape (Garmin's 0-to-ceiling range). Null on a two-sided step.
 */
export function oneSidedPowerText(lowerW: number | null | undefined, upperW: number | null | undefined): string | null {
  if (isCeilingOnly(lowerW, upperW)) return `under ${Math.round(Number(upperW))} W`;
  const lo = Number(lowerW);
  if (upperW == null && Number.isFinite(lo) && lo > 0) return `${Math.round(lo)} W and up`;
  return null;
}

/**
 * Share of the stream's samples (zeros kept — coasting is 0 W) at or above the floor and, when there is a ceiling,
 * at or under it; the caller multiplies by the interval's seconds. A floor with no ceiling (p237) counts every
 * sample at or above the floor. The Execution score's numerator for one interval (Garmin, "Workout Execution
 * Score": time in the target range; `./execution-score.ts`).
 */
export function shareInPowerRange(
  stream: ReadonlyArray<number>,
  lowerW: number | null | undefined,
  upperW: number | null | undefined,
): number | null {
  const judged = judgedPowerRange(lowerW, upperW);
  const lo = judged.lower;
  // p239's easy ceiling: a floor of zero with a ceiling counts every second at or under the ceiling.
  if (!stream.length || !(Number.isFinite(lo) && (lo > 0 || isCeilingOnly(lo, judged.upper)))) return null;
  upperW = judged.upper;
  const hiRaw = Number(upperW);
  const hi = upperW != null && Number.isFinite(hiRaw) && hiRaw >= lo ? hiRaw : Infinity;
  let inRange = 0;
  for (const p of stream) if (p >= lo && p <= hi) inRange += 1;
  return inRange / stream.length;
}

/**
 * The ONE number a stretch of riding is judged by: normalized power when the stretch is 20 minutes or
 * longer, average power (zeros included) when shorter. The segment row, its colour, the adherence lines
 * and the Execution score all read this.
 *
 * ⛔ THE DEVICE'S NORMALIZED POWER FIRST (2026-09-15, WORKORDER §1 rule 7, Michael). For a whole ride the
 * caller passes the provider's normalized power (`workouts.normalized_power`: Garmin `normalized_power`,
 * Strava `weighted_average_watts`); when present it is the number, and ours from the samples is the
 * fallback. Segments pass nothing — no provider sends a per-segment normalized power — and are unchanged.
 * // OURS — the order (provider first, ours second). STATE-SOURCES row "Judged ride power".
 */
export function judgedPowerW(
  stream: ReadonlyArray<number>,
  durationS: number,
  providerNormalizedW?: number | null,
): { watts: number | null; basis: 'normalized' | 'average' | null } {
  const sent = Number(providerNormalizedW);
  if (durationS >= NORMALIZED_POWER_MIN_DURATION_S && Number.isFinite(sent) && sent > 0) {
    return { watts: sent, basis: 'normalized' };
  }
  if (!stream.length) return { watts: null, basis: null };
  if (durationS >= NORMALIZED_POWER_MIN_DURATION_S) {
    const np = normalizedPowerW(stream);
    if (np != null) return { watts: np, basis: 'normalized' };
  }
  const avg = averagePowerW(stream);
  return { watts: avg, basis: avg != null ? 'average' : null };
}

/**
 * Where a judged number sits against a planned range: the range itself, no allowance.
 *
 * ⛔ A FLOOR WITH NO CEILING READS GREEN AT OR ABOVE THE FLOOR (2026-09-15, p237). An ABSENT upper is
 * the app's existing way of saying "no ceiling" — `analyze-cycling-workout` has read a missing upper
 * as Infinity since it was written, and the zone rows print an absent bound as "176 bpm and up".
 * This function used to answer `null` on one, so p237's anaerobic work was either ungraded or, once
 * the floor and the ceiling were written as the same number, red on every single repeat.
 * ⛔ A CEILING WITH A FLOOR OF ZERO IS JUDGED TOO (2026-09-18, p239 "easy ride below 75%"): at or under the ceiling
 * is in, over it is above, and nothing reads below — nothing marks a rider down for going easier.
 * ⚠️ A MISSING FLOOR (no number at all) IS STILL NO VERDICT.
 */
export function powerRangeBand(
  watts: number | null | undefined,
  lowerW: number | null | undefined,
  upperW: number | null | undefined,
): 'below' | 'in' | 'above' | null {
  const judged = judgedPowerRange(lowerW, upperW);
  const lo = judged.lower;
  const hi = judged.upper == null ? Infinity : judged.upper;
  const w = Number(watts);
  if (watts == null || !Number.isFinite(w) || !(isCeilingOnly(lo, hi) || lo > 0) || !(hi > 0)) return null;
  if (w < lo) return 'below';
  if (w > hi) return 'above';
  return 'in';
}
