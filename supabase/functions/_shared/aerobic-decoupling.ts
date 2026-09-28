/**
 * ═══ DRIFT, ONE RULE FOR RUNS AND RIDES (2026-09-27, Michael: "fix A"; "match TrainingPeaks, not intervals.icu") ═══
 *
 * Drift is TrainingPeaks' aerobic decoupling: power to heart rate on a ride (Pw:Hr), pace to heart rate on a run
 * (Pa:Hr). This file works it out, once, and nothing keeps a copy:
 *   - a ride: `cycling-v1/ride-physiology.ts computeRideEfficiency`, over the recording's rows;
 *   - a run: `run-pace.ts runDecouplingPct`, over the recording's rows, called by the run analyser
 *     (`analyze-running-workout/lib/heart-rate/efficiency.ts`) and by the summary step's execution score
 *     (`compute-workout-summary aerobicDecouplingScore`).
 *
 * THE WHOLE SESSION, 20 MINUTES OR MORE. Drift is read over the whole recording, first second to last, and a session
 * under 20 minutes has none. Only a steady session is read at all; that gate is `session-detail/session-steadiness.ts`
 * and `session-detail/drift-pct.ts driftReadApplies`, not this file.
 * FIELD — TrainingPeaks Help Center, "Aerobic Decoupling (Pw:Hr and Pa:HR) and Efficiency Factor (EF)"
 * (help.trainingpeaks.com/hc/en-us/articles/204071724, read 2026-09-27): "Aerobic Decoupling values for efforts
 * under 20 minutes in duration aren't as valid". TrainingPeaks' summary number counts the whole file.
 *
 * THE HALVES. The session is split at its middle second, so a gap in the recording does not move the split.
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

/** The shortest session drift is read over. */
// FIELD — TrainingPeaks Help Center 204071724: "Aerobic Decoupling values for efforts under 20 minutes in duration aren't as valid".
export const DRIFT_MIN_STEADY_S = 1200;

/**
 * Drift for one session: the whole recording, halves by time, each half's output over its average heart rate. The
 * three series share a sample index. `output` is already the stream the rule reads: watts with coasting at 0 on a
 * ride, grade-adjusted speed with stops at 0 on a run. `halfOutput` says how a half's output is taken: 'normalized'
 * (a ride, normalized power) or 'average' (a run). Null when the session is under 20 minutes, when a half has no
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
  const start = Number(timeS[0]);
  const end = Number(timeS[n - 1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < DRIFT_MIN_STEADY_S) return null;
  const mid = (start + end) / 2;
  const halves = [
    { out: [] as number[], hrSum: 0, hrN: 0 },
    { out: [] as number[], hrSum: 0, hrN: 0 },
  ];
  for (let i = 0; i < n; i += 1) {
    const t = Number(timeS[i]);
    if (!Number.isFinite(t)) continue;
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
