/**
 * ═══ DRIFT, ONE RULE FOR RUNS AND RIDES (2026-09-27, Michael: "fix A"; the steady middle, "yes") ═══
 *
 * Drift is TrainingPeaks' aerobic decoupling: power to heart rate on a ride (Pw:Hr), pace to heart rate on a run
 * (Pa:Hr). This file works it out, once, and nothing keeps a copy:
 *   - a ride: `cycling-v1/ride-physiology.ts computeRideEfficiency`, over the recording's rows;
 *   - a run: `run-pace.ts runDecouplingPct`, over the recording's rows, called by the run analyser
 *     (`analyze-running-workout/lib/heart-rate/efficiency.ts`) and by the summary step's execution score
 *     (`compute-workout-summary aerobicDecouplingScore`).
 *
 * THE STEADY MIDDLE. Drift is read over the middle of the recording only: the first 20 minutes and the last 10 are
 * left out, and at least 20 minutes must be left, so a session needs about 50 minutes to have a drift read. Only a
 * steady session is read at all; that gate is `session-detail/session-steadiness.ts` and
 * `session-detail/drift-pct.ts driftReadApplies`, not this file.
 * FIELD — intervals.icu, "Added warmup and cool down to decoupling charts" (forum.intervals.icu/t/72, read
 * 2026-09-27): "The default warmup is 20 minutes and cool down 10 minutes."
 * FIELD — TrainingPeaks Help Center, "Aerobic Decoupling (Pw:Hr and Pa:HR) and Efficiency Factor (EF)"
 * (help.trainingpeaks.com/hc/en-us/articles/204071724, read 2026-09-27): "Aerobic Decoupling values for efforts
 * under 20 minutes in duration aren't as valid".
 * WHY THE MIDDLE AND NOT THE WHOLE SESSION (2026-09-27, Michael, reversing the whole-session rule of the same day). On a
 * short session the whole-session number mostly measures the warm-up, while heart rate is still climbing to meet the
 * effort: the Sep 24 Zwift ride, 30 minutes, read 9.6% over the whole session and 2.7% over its steady middle (the
 * owner's figures; not re-measured here). Under this rule that ride has no drift read at all: it is under 50 minutes. And
 * Viada's 5% line (p107) is about drift late in a longer easy session — the page uses drift to judge "the maximum
 * recommended dose of easy/VT1 work in a given session" — not about the first minutes of a short one.
 *
 * THE HALVES. The steady middle is split at its middle second, so a gap in the recording does not move the split.
 * FIELD — intervals.icu's decoupling code splits its per-second stream at the middle (forum.intervals.icu/t/1823).
 * TrainingPeaks compares "the two halves of the workout" and does not say how it splits.
 *
 * THE RATIO. Each half's efficiency factor is its output divided by its average heart rate. Drift is how far the
 * second half's factor fell below the first half's, as a percentage of the first, to one decimal. A positive number
 * means heart rate rose against the output.
 * FIELD — TrainingPeaks Help Center, "Advanced Analysis Metrics" (help.trainingpeaks.com/hc/en-us/articles/204072154):
 * the cycling efficiency factor is normalized power over average heart rate. Friel, "Efficiency Factor and
 * Decoupling" (trainingpeaks.com/blog/efficiency-factor-and-decoupling/): decoupling compares the first half's
 * efficiency factor with the second half's.
 *   - A RIDE: each half's output is Coggan's normalized power (`ride-power.ts normalizedPowerW`) of its per-second
 *     watts, coasting at 0 W as TrainingPeaks counts it.
 *   - A RUN: each half's output is its plain AVERAGE grade-adjusted speed over every recorded second, a stopped second
 *     at 0 speed (`run-pace.ts runDecouplingPct`) — the owner's ruling (2026-09-27). TrainingPeaks names normalized
 *     graded speed for the run and publishes no weighting for it, so no weighting is applied.
 * Every second of the recording is in the stream, so a stop counts on both sports.
 * The average heart rate is every heart-rate reading in the half, not only the seconds with output.
 */
import { normalizedPowerW } from './ride-power.ts';

// FIELD — intervals.icu, forum.intervals.icu/t/72: "The default warmup is 20 minutes and cool down 10 minutes."
const WARMUP_OUT_S = 1200;
// FIELD — intervals.icu, forum.intervals.icu/t/72 (the cool down, the line above).
const COOLDOWN_OUT_S = 600;
/** The shortest steady middle drift is read over. */
// FIELD — TrainingPeaks Help Center 204071724: "Aerobic Decoupling values for efforts under 20 minutes in duration aren't as valid".
const MIN_STEADY_S = 1200;

/**
 * Drift for one session: the steady middle (20 minutes after the first sample to 10 minutes before the last), halves by
 * time, each half's output over its average heart rate. The
 * three series share a sample index. `output` is already the stream the rule reads: watts with coasting at 0 on a
 * ride, grade-adjusted speed with stops at 0 on a run. `halfOutput` says how a half's output is taken: 'normalized'
 * (a ride, normalized power) or 'average' (a run). Null when the steady middle is under 20 minutes, when a half has no
 * output (under 30 samples on 'normalized', normalized power's own window) or no heart rate, or when the first half's
 * output is zero.
 */
export function steadyDecouplingPct(
  timeS: ReadonlyArray<number>,
  hrBpm: ReadonlyArray<number | null | undefined>,
  output: ReadonlyArray<number>,
  halfOutput: 'normalized' | 'average',
): number | null {
  const n = Math.min(timeS.length, hrBpm.length, output.length);
  if (n < 2) return null;
  const from = Number(timeS[0]) + WARMUP_OUT_S;
  const to = Number(timeS[n - 1]) - COOLDOWN_OUT_S;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < MIN_STEADY_S) return null;
  const mid = (from + to) / 2;
  const halves = [
    { out: [] as number[], hrSum: 0, hrN: 0 },
    { out: [] as number[], hrSum: 0, hrN: 0 },
  ];
  for (let i = 0; i < n; i += 1) {
    const t = Number(timeS[i]);
    if (!(t >= from && t <= to)) continue;
    const h = halves[t < mid ? 0 : 1];
    h.out.push(output[i]);
    const hr = hrBpm[i];
    // A missing reading (null, or 0 from a strap that dropped) is no heart rate; every reading is used as recorded.
    if (typeof hr === 'number' && hr > 0) {
      h.hrSum += hr;
      h.hrN += 1;
    }
  }
  const [ef1, ef2] = halves.map((h) => {
    const out = halfOutput === 'normalized'
      ? normalizedPowerW(h.out)
      : (h.out.length > 0 ? h.out.reduce((sum, v) => sum + v, 0) / h.out.length : null);
    return out != null && h.hrN > 0 ? out / (h.hrSum / h.hrN) : null;
  });
  return ef1 == null || ef2 == null ? null : driftPctOf(ef1, ef2);
}

/**
 * Friel's drift from the two halves' efficiency factors: how far the second fell below the first, as a percentage of
 * the first, to one decimal. Positive means heart rate rose against the output. Null when the first is not positive.
 */
function driftPctOf(firstHalfEf: number, secondHalfEf: number): number | null {
  if (!(firstHalfEf > 0) || !Number.isFinite(secondHalfEf)) return null;
  return Math.round(((firstHalfEf - secondHalfEf) / firstHalfEf) * 1000) / 10;
}
