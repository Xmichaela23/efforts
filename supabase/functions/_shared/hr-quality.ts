/**
 * HR quality gate (D-263, build-step 1) — MEASURED, not device-inferred.
 *
 * Replaces the abandoned device_name → hr_source mapping. That was structurally
 * unreliable for EVERYONE: `device_name` identifies the RECORDER (Garmin watch /
 * Edge / FORM goggles), not the SENSOR — a watch records chest-strap OR wrist-
 * optical HR indistinguishably, so device never tells you HR quality. Instead we
 * measure quality directly from the series we already store: dropout fraction +
 * physiological range. Universal, not tuned to any athlete's kit; a broken series
 * self-identifies regardless of device.
 *
 * `low`/`none` is a fail-safe: the binning consumer drops that session's HR and
 * falls back to sRPE/duration — HR is never trusted on evidence it's broken.
 *
 * PIN (D-263 rationale): this is dropout PERCENTAGE only, which is fine for v1.
 * Dropout DISTRIBUTION may matter later — a cluster of start-of-activity zero
 * samples (the exact artifact that briefly fooled the audit into calling FORM a
 * "trap": one leading 0-sample in an otherwise-clean 500-point swim) is benign,
 * whereas the same percentage scattered through the working portion is not. v1
 * treats them identically by design; this note prevents the nuance being
 * rediscovered as a bug.
 */

/** Above this share of zero/invalid HR points, the series is too gappy to trust.
 *  Calibration param (tunable, non-universal per the D-255 discipline): 15% keeps
 *  real data clean (observed worst on user 45d122e7 was FORM at 5.2%, Edge 4.3%)
 *  while rejecting genuinely broken series. */
export const HR_MAX_DROPOUT_PCT = 15;

/** Physiological bounds for a session-average HR (bpm). Outside this, the value is
 *  a sensor error, not a real effort. 40 is below any plausible working average
 *  (even elite); 210 is above any sustainable session average. */
export const HR_PLAUSIBLE_RANGE = { min: 40, max: 210 } as const;

export type HrQuality = 'ok' | 'low' | 'none';

export interface HrQualityResult {
  hr_quality: HrQuality;
  /** % of series points with heartRate <= 0 (null when there is no series). */
  dropout_pct: number | null;
  /** count of series points with a valid (>0) HR. */
  valid_points: number;
  reason: 'ok' | 'no_hr' | 'high_dropout' | 'implausible';
}

export interface HrSample {
  heartRate?: number | null;
}

/**
 * Assess a session's HR quality from its series samples + summary average.
 * Consumers gate on `hr_quality`: `ok` → HR usable; `low`/`none` → fall back to
 * sRPE/duration (never bin or flag on `low`/`none`).
 */
export function assessHrQuality(
  samples: HrSample[] | null | undefined,
  avgHr: number | null | undefined,
): HrQualityResult {
  const hasSeries = Array.isArray(samples) && samples.length > 0;

  // No series: can't measure dropout — trust the summary avg only if plausible.
  if (!hasSeries) {
    if (avgHr == null || !Number.isFinite(Number(avgHr))) {
      return { hr_quality: 'none', dropout_pct: null, valid_points: 0, reason: 'no_hr' };
    }
    const a = Number(avgHr);
    const inRange = a >= HR_PLAUSIBLE_RANGE.min && a <= HR_PLAUSIBLE_RANGE.max;
    return inRange
      ? { hr_quality: 'ok', dropout_pct: null, valid_points: 0, reason: 'ok' }
      : { hr_quality: 'low', dropout_pct: null, valid_points: 0, reason: 'implausible' };
  }

  const total = samples!.length;
  let valid = 0;
  for (const s of samples!) {
    const hr = Number(s?.heartRate);
    if (Number.isFinite(hr) && hr > 0) valid += 1;
  }
  const dropout_pct = Math.round(((total - valid) / total) * 1000) / 10;

  if (valid === 0) return { hr_quality: 'none', dropout_pct, valid_points: 0, reason: 'no_hr' };
  if (dropout_pct > HR_MAX_DROPOUT_PCT) return { hr_quality: 'low', dropout_pct, valid_points: valid, reason: 'high_dropout' };

  if (avgHr != null && Number.isFinite(Number(avgHr))) {
    const a = Number(avgHr);
    if (a < HR_PLAUSIBLE_RANGE.min || a > HR_PLAUSIBLE_RANGE.max) {
      return { hr_quality: 'low', dropout_pct, valid_points: valid, reason: 'implausible' };
    }
  }
  return { hr_quality: 'ok', dropout_pct, valid_points: valid, reason: 'ok' };
}
