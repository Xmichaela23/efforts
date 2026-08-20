/**
 * ⛔ PER SPORT AS OF 2026-08-20 — pass `{ sport: 'ride' }` for the bike. The default is `run`, so
 * every existing caller is unchanged.
 *
 * The bike had NO owner for this fact and three files read `ride_threshold_hr` raw
 * (`compute-workout-analysis`, `calculate-workload`, `_shared/ride-easy-hr.ts`), each with its own
 * fallback order and none with the sample-count gate. Adding a `sport` option rather than a second
 * `resolveCurrentRideLthr` follows the precedent this codebase already set for the same shape:
 * `resolve-current-max-hr.ts` keeps run and ride peaks apart behind one `opts.sport`. Two functions
 * for one fact is how the anchors fractured the first time.
 *
 * ⚠️ THE SPORTS DO NOT SHARE A NUMBER, and that is the point of the switch rather than a nicety.
 * Running heart rate sits 5-10 bpm above cycling at the same effort — the same fact Q-169 fixed in
 * the easy band — so a bike anchor used for a run reads every run zone low, and the reverse reads
 * every ride zone high.
 *
 * Shared resolver for the athlete's current LACTATE-THRESHOLD HEART RATE (LTHR) — the single
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
  /**
   * ⛔ THE WRITER SAYING "I DID NOT DETECT THIS" (2026-08-20). `learn-fitness-profile` sets it on every
   * branch that fills a hole rather than measuring: `88% of observed max`, `90% of observed max`, and
   * `95th percentile of sustained efforts (no clear threshold data)`. Absent = written before the field
   * existed, so the `sample_count === 0` gate below remains the legacy path.
   */
  is_estimate?: boolean | null;
} | number | string | null | undefined;

export type BaselinesLike = {
  learned_fitness?: { run_threshold_hr?: LearnedThr; ride_threshold_hr?: LearnedThr } | null;
  performance_numbers?: {
    threshold_heart_rate?: number | string | null;
    thresholdHeartRate?: number | string | null;
    lthr_source?: 'manual' | 'learned' | null;
  } | null;
  configured_hr_zones?: {
    /**
     * ⛔ THE RUN-SPECIFIC MANUAL OVERRIDE, AND IT WAS NOT READ HERE UNTIL 2026-08-19.
     *
     * `TrainingBaselines.tsx:717` writes FOUR per-sport overrides (`manual_run_lthr`,
     * `manual_ride_lthr`, and the two max-HR twins) alongside a single sport-AGNOSTIC
     * `threshold_heart_rate`. This resolver read only the agnostic one — so an athlete who typed a
     * run LTHR had it ignored by every surface that asks this resolver, while
     * `generate-run-plan:202` (the MARATHON builder) read `manual_run_lthr` directly and got it.
     * Two answers, one athlete, and the one the plan used was the one nobody could see.
     *
     * ⚠️ AND THE AGNOSTIC KEY CAN HOLD A BIKE NUMBER. `TrainingBaselines.tsx:702` sets
     * `threshold_heart_rate = effectiveRunLTHR || effectiveRideLTHR` — so for an athlete with a bike
     * LTHR and no run one, this RUN resolver was returning a CYCLING threshold. Running HR sits
     * 5-10 bpm above cycling at the same effort (the same fact Q-169 fixed in the easy band), so it
     * anchors every run zone too low.
     *
     * ⚠️ THE RESIDUAL LEAK IS NOT CLOSED, DELIBERATELY. Preferring the run key fixes it whenever the
     * athlete typed one. When they did not, `threshold_heart_rate` may still be a bike number and
     * this resolver cannot tell — the field carries no sport. Closing that needs the WRITER to stop
     * collapsing two sports into one key, which is a change to `TrainingBaselines`, not a detector
     * bolted on here. Recorded rather than guessed at.
     */
    manual_run_lthr?: number | string | null;
    /** The bike's own typed override, written beside the run one by `TrainingBaselines.tsx:718`. */
    manual_ride_lthr?: number | string | null;
    threshold_heart_rate?: number | string | null;
    source?: string | null;
  } | null;
} | null | undefined;

/** Optional per-call context a workout-aware caller can supply for the lowest (device) tier. */
export type LthrResolveOpts = {
  deviceThresholdHr?: number | string | null;
  /**
   * Which sport's anchor. Default `run` — every pre-2026-08-20 caller passes nothing and keeps the
   * behaviour it had. Matched loosely (`ride`/`bike`/`cycling`) exactly as `resolveCurrentMaxHr` does,
   * because callers hand this a raw `workout.type` string.
   */
  sport?: 'run' | 'ride' | string | null;
};

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
  const isRide = String(opts?.sport ?? '').toLowerCase().match(/ride|bike|cycl/) != null;

  // Learned value — normalise the {value, confidence, sample_count, as_of} shape (or a bare number).
  const learnedRaw = isRide
    ? baselines.learned_fitness?.ride_threshold_hr
    : baselines.learned_fitness?.run_threshold_hr;
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
  /**
   * ⛔ D-284, NOW WITH THE WRITER'S OWN ANSWER FIRST. The sample-count gate was a PROXY for
   * measured-vs-invented, and it read the wrong thing on the branch that mattered: `95th percentile of
   * sustained efforts (no clear threshold data)` carries the count of the efforts it took a percentile
   * OF (18 on the account this was found on), so it sailed through, anchored the easy band at 130 bpm,
   * and starved the easy-pace learner whose runs sit at 133-141. `is_estimate` is the writer stating
   * it outright; the count stays for rows written before the field existed.
   *
   * ⚠️ Q-171 IS UNCHANGED. *Weak but MEASURED still anchors* — a low-confidence reading from four real
   * threshold efforts is `is_estimate: false` and still anchors. The gate was always
   * invented-vs-measured; it can now read that directly instead of inferring it.
   */
  const learnedIsEstimate = learnedObj?.is_estimate === true;
  const learnedUsable = learnedValue != null && learnedSamples !== 0 && !learnedIsEstimate;
  const learnedTrusted = learnedUsable && (learnedConf === 'medium' || learnedConf === 'high');

  const pn = baselines.performance_numbers;
  // ⛔ SPORT-SPECIFIC BEFORE SPORT-AGNOSTIC. `manual_run_lthr` is unambiguously a RUN number;
  // `threshold_heart_rate` is whichever sport the writer happened to call primary. See the type above.
  /**
   * ⛔ THE SPORT-AGNOSTIC FIELD IS READ FOR THE RUN AND REFUSED FOR THE BIKE, and the asymmetry is
   * deliberate. `TrainingBaselines.tsx:702` computes it as `runLTHR || rideLTHR` — run PREFERRED. So
   * for a run it is right far more often than not, and for a RIDE it is most likely the run's number,
   * which is 5-10 bpm too high for the same effort on a bike. The bike has its own typed field; when
   * that is empty the honest answer is to fall through to the learned ride value, not to borrow the
   * run's.
   *
   * ⚠️ The residual run-side leak (agnostic field holding a bike number when the athlete has no run
   * one) is unchanged and still open — it needs the WRITER to stop collapsing two sports into one key.
   */
  const manualValue = isRide
    ? asPositiveFinite(baselines.configured_hr_zones?.manual_ride_lthr)
    : (asPositiveFinite(baselines.configured_hr_zones?.manual_run_lthr)
        ?? asPositiveFinite(pn?.threshold_heart_rate)
        ?? asPositiveFinite(pn?.thresholdHeartRate)
        ?? asPositiveFinite(baselines.configured_hr_zones?.threshold_heart_rate));

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
