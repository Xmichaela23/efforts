/**
 * Shared resolver for the athlete's current run LACTATE-THRESHOLD HEART RATE (LTHR) — the single
 * source of truth for the anchor that every HR interpretation hangs off (easy band, HR zones, the
 * zone bins → 80/20 read, the load/intensity ladder, the coach's HR bins).
 *
 * Replaces FOUR ad-hoc chains that chose differently per surface (audit 2026-07-17):
 *   - easy-hr.ts          learned-first, WITH the sample_count:0 gate
 *   - compute-analysis    configured/typed-first, learned last, NO gate   <- inverted vs easy-hr
 *   - calculate-workload  device-column-first, then learned, then manual
 *   - coach               learned-only
 * Same disease `resolveCurrentFtp` (bike) and `resolveCurrentRunEasyPace` (run pace, Q-174) already cured.
 *
 * Precedence (SPEC-lthr-one-anchor.md, decided 2026-07-13):
 *   0. the athlete's EXPLICIT choice   (`performance_numbers.lthr_source: 'manual' | 'learned'`) — Q-174,
 *      reused verbatim. 'manual' + a manual value wins over even high-confidence learned; 'learned' SKIPS
 *      the manual tier so a declined typed number can't resurface when the learner thins out.
 *   1. learned  run_threshold_hr   (confidence medium/high AND sample_count > 0)      <- MEASURED
 *   2. manual / configured (typed in Baselines)                                        <- an ASSERTION
 *   3. learned-low  (learned, any confidence, still sample_count > 0)
 *   4. device  (per-workout workouts.threshold_heart_rate, passed by workout-aware callers) <- lowest, provenance unknown
 *   5. null                                                                            <- SAY SO. Never 220-age. Never invent (Law 2).
 *
 * ⛔ THE SAMPLE-COUNT GATE (D-284), lifted here from easy-hr.ts and made universal: a learned
 * run_threshold_hr written as "88% of observed max (estimated)" with sample_count 0 is a FORMULA,
 * not a measurement — it can NEVER anchor. It falls through at BOTH tier 1 and tier 3.
 *
 * Pure, no I/O — client + edge (edge imports from this src/lib file, per the resolveCurrentFtp precedent;
 * the client never imports from supabase/functions/_shared). Caller passes already-loaded baselines.
 */

export type LthrSource = 'manual-chosen' | 'learned' | 'manual' | 'learned-low' | 'device';

export type ResolvedLthr = {
  bpm: number | null;
  source: LthrSource | null;
  confidence: 'low' | 'medium' | 'high' | null;
  sample_count: number | null;
  as_of: string | null;       // the newest session behind a learned value (Q-173); null for asserted/device
  is_estimate: boolean;       // Law 2. The resolver NEVER estimates (returns null over 220-age), so this
                              // is always false — kept for type-parity with the FTP/pace resolvers.
};

type LearnedThr = {
  value?: number | string | null;
  confidence?: 'low' | 'medium' | 'high' | string | null;
  sample_count?: number | string | null;
  as_of?: string | null;
} | number | string | null | undefined;

export type BaselinesLike = {
  learned_fitness?: { run_threshold_hr?: LearnedThr } | null;
  performance_numbers?: {
    threshold_heart_rate?: number | string | null;
    thresholdHeartRate?: number | string | null;
    lthr_source?: 'manual' | 'learned' | null;
  } | null;
  configured_hr_zones?: {
    threshold_heart_rate?: number | string | null;
    source?: string | null;
  } | null;
} | null | undefined;

/** Optional per-call context a workout-aware caller can supply for the lowest (device) tier. */
export type LthrResolveOpts = { deviceThresholdHr?: number | string | null };

const NULL_RESULT: ResolvedLthr = {
  bpm: null, source: null, confidence: null, sample_count: null, as_of: null, is_estimate: false,
};

function asPositiveFinite(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveCurrentLthr(baselines: BaselinesLike, opts?: LthrResolveOpts): ResolvedLthr {
  if (!baselines) return NULL_RESULT;

  // Learned value — normalise the {value, confidence, sample_count, as_of} shape (or a bare number).
  const learnedRaw = baselines.learned_fitness?.run_threshold_hr;
  const learnedObj = (learnedRaw != null && typeof learnedRaw === 'object') ? learnedRaw : null;
  const learnedValue = asPositiveFinite(learnedObj ? learnedObj.value : learnedRaw);
  const learnedConf = String(learnedObj?.confidence ?? '').toLowerCase();
  const rawSampleCount = learnedObj?.sample_count;
  const sampleCountStated = rawSampleCount != null && Number.isFinite(Number(rawSampleCount));
  const learnedSamples = sampleCountStated ? Number(rawSampleCount) : null; // null == "not stated"
  const learnedAsOf = typeof learnedObj?.as_of === 'string' && learnedObj.as_of.length >= 10 ? learnedObj.as_of : null;
  const confOut = (learnedConf === 'low' || learnedConf === 'medium' || learnedConf === 'high') ? learnedConf : null;

  // ⛔ THE GATE (D-284, mirrors easy-hr.ts exactly): an EXPLICIT sample_count of 0 is a formula, not a
  // measurement — "88% of observed max (estimated)" — and can NEVER anchor. An ABSENT sample_count is
  // "not stated" (the in-pass synthetic band the learner builds passes no count), NOT "measured nothing",
  // so it is accepted. The distinction the gate draws is measured-vs-invented, not strong-vs-weak.
  const learnedUsable = learnedValue != null && learnedSamples !== 0;
  const learnedTrusted = learnedUsable && (learnedConf === 'medium' || learnedConf === 'high');

  const pn = baselines.performance_numbers;
  const manualValue = asPositiveFinite(pn?.threshold_heart_rate)
    ?? asPositiveFinite(pn?.thresholdHeartRate)
    ?? asPositiveFinite(baselines.configured_hr_zones?.threshold_heart_rate);

  const deviceValue = asPositiveFinite(opts?.deviceThresholdHr);

  // ── Tier 0 (Q-174): the athlete's explicit choice outranks everything. ──
  const chosen = pn?.lthr_source;
  if (chosen === 'manual' && manualValue != null) {
    return { bpm: manualValue, source: 'manual-chosen', confidence: null, sample_count: null, as_of: null, is_estimate: false };
  }
  // chosen === 'learned' → fall through, but SKIP the manual tier (a declined typed number must not resurface).
  const manualEligible = chosen !== 'learned';

  // 1. learned, trusted + sampled.
  if (learnedTrusted) {
    return { bpm: learnedValue, source: 'learned', confidence: confOut, sample_count: learnedSamples, as_of: learnedAsOf, is_estimate: false };
  }
  // 2. manual / configured (an assertion).
  if (manualValue != null && manualEligible) {
    return { bpm: manualValue, source: 'manual', confidence: null, sample_count: null, as_of: null, is_estimate: false };
  }
  // 3. learned-low (any confidence, still sampled).
  if (learnedUsable) {
    return { bpm: learnedValue, source: 'learned-low', confidence: confOut, sample_count: learnedSamples, as_of: learnedAsOf, is_estimate: false };
  }
  // 4. device (per-workout, provenance unknown) — lowest.
  if (deviceValue != null) {
    return { bpm: deviceValue, source: 'device', confidence: null, sample_count: null, as_of: null, is_estimate: false };
  }
  // 5. null — never 220-age, never invent.
  return NULL_RESULT;
}
