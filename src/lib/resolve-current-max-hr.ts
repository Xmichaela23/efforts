/**
 * Shared resolver for the athlete's current MAX HEART RATE — the single source of truth for the
 * "% of max HR" yardstick that every HR-zone FALLBACK hangs off when there is no LTHR.
 *
 * Max HR is a last-resort anchor: when the app knows LTHR it draws Friel zones off that
 * (`resolve-current-lthr.ts`), and this resolver never fires. It only matters for data-less athletes
 * and for the %HRmax fallback tables — which today disagree with each other (audit 2026-07-17, #5):
 *   - compute-workout-analysis  configured.max → learned → FIT column → observed/0.95 → literal 180
 *   - analyze-running .../zones  observed/0.90 → literal 180            <- different divisor than above
 *   - compute-adaptation-metrics 220 − age (age defaults to 35)
 *   - generate-run-plan          manual → learned → 220 − age
 *   - TrainingBaselines (client)  220 − age
 *   - HRZoneChart (client)        Tanaka 208 − 0.7·age / Gulati (female) <- disagrees with Baselines
 * Same disease `resolveCurrentFtp`, `resolveCurrentRunEasyPace`, and `resolveCurrentLthr` already cured.
 *
 * Precedence (per sport — run and ride keep separate learned peaks):
 *   1. manual / configured max HR  (typed in Baselines, or a device zone-set's stated max) <- ASSERTION
 *   2. learned  {run,ride}_max_hr_observed  (measured peak across history, sample_count > 0) <- MEASURED
 *   3. device   per-workout FIT max HR  (workout-aware callers pass it)                       <- provenance thin
 *   4. session peak ÷ PEAK_TO_MAX  (this workout's own HR peak; workout-aware callers)         <- inference
 *   5. age estimate  (ONE formula — Tanaka, or Gulati for female)  is_estimate:true            <- last resort
 *   6. null                                                                                    <- SAY SO.
 *
 * Manual is kept ABOVE learned to preserve today's shipped order (generate-run-plan / TrainingBaselines
 * are both manual→learned→age); this resolver's job is congruence + ONE formula + ONE divisor, not a
 * re-ordering. Unlike the LTHR resolver, max HR HAS a legitimate formula tier — so tier 5 is allowed to
 * estimate, but ONLY when the caller opts in (`allowAgeEstimate`, default true) and it is flagged
 * `is_estimate: true` so a surface that refuses to invent (Law 2) can check and fall to null instead.
 *
 * ⛔ resolveMaxHrCeiling (`_shared/hr-plausibility.ts`) is a DIFFERENT thing — a corruption ceiling that
 * rejects garbage HR spikes, not a value. It is deliberately separate and this resolver does not touch it.
 *
 * Pure, no I/O — client + edge (edge imports from this src/lib file, per the resolveCurrentFtp precedent).
 */

export type MaxHrSource = 'manual' | 'learned' | 'device' | 'session-peak' | 'age-estimate';

export type ResolvedMaxHr = {
  bpm: number | null;
  source: MaxHrSource | null;
  confidence: 'low' | 'medium' | 'high' | null;
  sample_count: number | null;
  is_estimate: boolean; // true ONLY for the age-estimate tier
};

/**
 * A hard workout's HR peak is a fraction of true max; divide to estimate. ONE divisor, so the run
 * debrief (was /0.95) and the run analyzer (was /0.90) stop producing two different maxes from one peak.
 * 0.95 chosen (the more conservative of the two shipped values — yields the lower, safer max).
 */
export const PEAK_TO_MAX = 0.95;

type LearnedMetric = {
  value?: number | string | null;
  confidence?: 'low' | 'medium' | 'high' | string | null;
  sample_count?: number | string | null;
} | number | string | null | undefined;

export type MaxHrBaselinesLike = {
  learned_fitness?: {
    run_max_hr_observed?: LearnedMetric;
    ride_max_hr_observed?: LearnedMetric;
  } | null;
  /** Athlete config — where the typed manual max HR lives (TrainingBaselines writes these). */
  athlete_config?: {
    manual_run_max_hr?: number | string | null;
    manual_ride_max_hr?: number | string | null;
  } | null;
  configured_hr_zones?: {
    max_heart_rate?: number | string | null;
    source?: string | null;
  } | null;
} | null | undefined;

export type MaxHrResolveOpts = {
  sport?: 'run' | 'ride' | string | null;
  age?: number | null;
  sex?: 'male' | 'female' | string | null;
  /** per-workout device-supplied max HR (FIT `default_max_heart_rate`). */
  deviceMaxHr?: number | string | null;
  /** this workout's own observed HR peak; divided by PEAK_TO_MAX. */
  observedSessionPeak?: number | string | null;
  /** allow the age-formula tier. Default true. Pass false on a surface that must not invent. */
  allowAgeEstimate?: boolean;
};

const NULL_RESULT: ResolvedMaxHr = {
  bpm: null, source: null, confidence: null, sample_count: null, is_estimate: false,
};

function asPositiveFinite(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** ONE age formula: Tanaka (208 − 0.7·age); Gulati (206 − 0.88·age) for female. Matches HRZoneChart "auto". */
export function ageEstimateMaxHr(age: number, sex?: string | null): number {
  const s = String(sex ?? '').toLowerCase();
  return s === 'female' ? Math.round(206 - 0.88 * age) : Math.round(208 - 0.7 * age);
}

export function resolveCurrentMaxHr(baselines: MaxHrBaselinesLike, opts?: MaxHrResolveOpts): ResolvedMaxHr {
  const isRide = String(opts?.sport ?? '').toLowerCase().match(/ride|bike|cycl/) != null;

  // 1. manual / configured (an assertion the athlete stands behind).
  const cfg = baselines?.athlete_config;
  const manualValue = asPositiveFinite(isRide ? cfg?.manual_ride_max_hr : cfg?.manual_run_max_hr)
    ?? asPositiveFinite(baselines?.configured_hr_zones?.max_heart_rate);
  if (manualValue != null) {
    return { bpm: manualValue, source: 'manual', confidence: null, sample_count: null, is_estimate: false };
  }

  // 2. learned observed peak (measured across history).
  const learnedRaw = isRide
    ? baselines?.learned_fitness?.ride_max_hr_observed
    : baselines?.learned_fitness?.run_max_hr_observed;
  const learnedObj = (learnedRaw != null && typeof learnedRaw === 'object') ? learnedRaw : null;
  const learnedValue = asPositiveFinite(learnedObj ? learnedObj.value : learnedRaw);
  const learnedConf = String(learnedObj?.confidence ?? '').toLowerCase();
  const rawSampleCount = learnedObj?.sample_count;
  const sampleCountStated = rawSampleCount != null && Number.isFinite(Number(rawSampleCount));
  const learnedSamples = sampleCountStated ? Number(rawSampleCount) : null;
  const confOut = (learnedConf === 'low' || learnedConf === 'medium' || learnedConf === 'high') ? learnedConf : null;
  // A stated sample_count of 0 is not a measurement (mirrors the LTHR gate); absent count is accepted.
  if (learnedValue != null && learnedSamples !== 0) {
    return { bpm: learnedValue, source: 'learned', confidence: confOut, sample_count: learnedSamples, is_estimate: false };
  }

  // 3. device per-workout FIT max.
  const deviceValue = asPositiveFinite(opts?.deviceMaxHr);
  if (deviceValue != null) {
    return { bpm: deviceValue, source: 'device', confidence: null, sample_count: null, is_estimate: false };
  }

  // 4. this session's own HR peak, inflated by the ONE divisor.
  const peak = asPositiveFinite(opts?.observedSessionPeak);
  if (peak != null) {
    return { bpm: Math.round(peak / PEAK_TO_MAX), source: 'session-peak', confidence: null, sample_count: null, is_estimate: false };
  }

  // 5. age estimate — the ONE formula, and only if the caller allows inventing.
  const age = asPositiveFinite(opts?.age);
  if (age != null && opts?.allowAgeEstimate !== false) {
    return { bpm: ageEstimateMaxHr(age, opts?.sex), source: 'age-estimate', confidence: null, sample_count: null, is_estimate: true };
  }

  // 6. null — no value and no licence to invent.
  return NULL_RESULT;
}
