/**
 * EASY-RUNNING READ FROM THE WARM-UP OF A HARD RUN — OURS (Michael, 2026-09-03: "people doing All
 * Rounder may not have easy runs, like myself. Can we use their warm-up or cool-downs for easy tracking?").
 *
 * A block with two hard runs a week has no easy run to read, so the "easy X/mi at Y bpm" line goes
 * stale. Every plan run sent to Garmin comes back with its warm-up as a step of known length; this
 * reads the samples inside that window.
 *
 *   - The first `skipSeconds` (180) are dropped: heart rate lags effort by 2–3 minutes, so the opening
 *     minutes read too fast for the heart rate (cardiac lag, field-standard).
 *   - Cool-downs are NOT used: after hard work heart rate stays elevated for the same pace (EPOC), so a
 *     cool-down reads slower than real easy running.
 *   - At least `minSeconds` (180) of moving, heart-rate-bearing samples inside the window, or null.
 *
 * Not a Viada rule and not a Garmin/TrainingPeaks feature — labelled OURS. The value carries
 * `source: 'warmup'` so every reader can say where it came from.
 */
export interface WarmupEasyRead {
  pace_s_per_km: number;
  hr_avg: number;
  seconds: number;
  source: 'warmup';
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Sample time in seconds from the start of the recording, tolerant of the provider shapes on file. */
export function sampleOffsetSeconds(s: any, i: number, first: any, fallbackIntervalS: number): number {
  const rel = num(s?.timerDurationInSeconds) ?? num(s?.elapsed_s) ?? num(s?.offsetInSeconds) ?? num(s?.clockDurationInSeconds);
  if (rel != null) return rel;
  const abs = num(s?.startTimeInSeconds) ?? num(s?.timestampInSeconds) ?? num(s?.timestamp);
  const abs0 = num(first?.startTimeInSeconds) ?? num(first?.timestampInSeconds) ?? num(first?.timestamp);
  if (abs != null && abs0 != null) return abs - abs0;
  return i * fallbackIntervalS;
}

export function extractWarmupEasy(
  samples: any[],
  warmupSeconds: number,
  totalSeconds: number,
  opts: { skipSeconds?: number; minSeconds?: number } = {},
): WarmupEasyRead | null {
  const skip = opts.skipSeconds ?? 180;
  const minS = opts.minSeconds ?? 180;
  if (!Array.isArray(samples) || samples.length < 10) return null;
  if (!Number.isFinite(warmupSeconds) || warmupSeconds - skip < minS) return null;
  const interval = totalSeconds > 0 ? totalSeconds / samples.length : 1;
  const first = samples[0];
  let speedSum = 0, hrSum = 0, n = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i] || {};
    const t = sampleOffsetSeconds(s, i, first, interval);
    if (t < skip) continue;
    if (t >= warmupSeconds) break;
    const hr = num(s.heartRate ?? s.heart_rate);
    const v = num(s.speedMetersPerSecond ?? s.speed_mps ?? s.speed);
    if (hr == null || hr <= 0 || v == null || v <= 0.5) continue;
    speedSum += v; hrSum += hr; n += 1;
  }
  const seconds = Math.round(n * interval);
  if (n === 0 || seconds < minS) return null;
  const avgSpeed = speedSum / n;
  if (!(avgSpeed > 0)) return null;
  return { pace_s_per_km: Math.round(1000 / avgSpeed), hr_avg: Math.round(hrSum / n), seconds, source: 'warmup' };
}
