/**
 * Derive week-optimizer preference scalars from goals.training_prefs + preferred_days.
 * PLAN-CONTRACT §2.3 — wizard intent must not be overridden by array-length defaults.
 */

export type OptimizerFrequency = 0 | 1 | 2 | 3;

function clampFreq(n: number): OptimizerFrequency {
  if (!Number.isFinite(n)) return 2;
  const r = Math.round(n);
  return Math.max(0, Math.min(3, r)) as OptimizerFrequency;
}

/**
 * `strength_frequency` on prefs wins; then explicit strength_protocol none; then
 * preferred_days.strength length when present; legacy default 2 if utterly unspecified.
 */
export function readStrengthFrequencyForOptimizer(
  trainingPrefs: Record<string, unknown>,
  strengthDaysLength: number | undefined,
): OptimizerFrequency {
  const raw = trainingPrefs.strength_frequency ?? trainingPrefs.strengthFrequency;
  if (raw != null && String(raw).trim() !== '') {
    const num = Number(raw);
    if (Number.isFinite(num)) return clampFreq(num);
  }
  const proto = String(trainingPrefs.strength_protocol ?? trainingPrefs.strengthProtocol ?? '').toLowerCase();
  if (proto === 'none') return 0;

  if (typeof strengthDaysLength === 'number' && strengthDaysLength >= 0) {
    return clampFreq(strengthDaysLength);
  }

  return 2;
}

/**
 * Explicit `swims_per_week` wins; then `swim_intent` focus→3 race→2; then swim array length; default 2.
 */
export function readSwimsPerWeekForOptimizer(
  trainingPrefs: Record<string, unknown>,
  swimDaysLength: number | undefined,
): OptimizerFrequency {
  const raw = trainingPrefs.swims_per_week ?? trainingPrefs.swimsPerWeek;
  if (raw != null && String(raw).trim() !== '') {
    const num = Number(raw);
    if (Number.isFinite(num)) return clampFreq(num);
  }

  const swimIntent = String(trainingPrefs.swim_intent ?? trainingPrefs.swimIntent ?? '').toLowerCase();
  if (swimIntent === 'focus') return 3;
  if (swimIntent === 'race') return 2;

  if (typeof swimDaysLength === 'number' && swimDaysLength >= 0) {
    return clampFreq(swimDaysLength);
  }

  return 2;
}
