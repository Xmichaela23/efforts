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
 * ⛔ PROPOSED, THEN ACCEPTED (2026-09-26, Michael: "go") — the FTP pattern (`resolve-current-ftp.ts`,
 * `docs/SPEC-ftp-accept-2026-09-04.md`) and the run threshold pace's (`resolve-current-run-pace.ts`), TrainerRoad's
 * lead. The learner's number (`learned_fitness.run_threshold_hr` / `ride_threshold_hr`) is a PROPOSAL and nothing
 * reads it as the anchor. The anchor is the athlete's typed number, else the number they ACCEPTED
 * (`run_threshold_hr_accepted` / `ride_threshold_hr_accepted` — the FTP's `{ ...estimate, accepted_at,
 * accepted_from, accepted_via }` shape). Accepting happens on the after-workout pop-up, State → Adjust and Training
 * Baselines, all through `save-baselines`; the learner seeds the first trusted measurement (see
 * `learn-fitness-profile`, THE SEED).
 *
 * Precedence (2026-09-26; supersedes the 2026-07-13 order of SPEC-lthr-one-anchor.md, below as history):
 *   0. typed — the sport's OWN typed field (`manual_run_lthr` / `manual_ride_lthr`; the run also reads the legacy
 *      `performance_numbers.threshold_heart_rate`), never the sport-agnostic `configured_hr_zones.threshold_heart_rate`
 *      (2026-09-15, §8.0 #23) <- an ASSERTION. Skipped on the RUN when the athlete chose auto
 *      (`lthr_source: 'learned'`, Q-174: a declined typed number cannot resurface). `lthr_source` is the RUN's switch:
 *      only the run rows write it, and the bike's own auto clears its typed number instead.
 *   1. accepted — the athlete's yes (or the learner's one-time seed)                     <- MEASURED, AND AGREED
 *   2. device  (per-workout workouts.threshold_heart_rate, passed by workout-aware callers) <- lowest, provenance unknown
 *   3. null                                                                              <- SAY SO. Never 220-age. Never invent (Law 2).
 *
 * Was (2026-07-13): choice → learned medium/high → typed → learned-low → device → null. The learned value read
 * directly is gone from the chain; `measuredLthr` below keeps it for the two readers that want the MEASUREMENT
 * (the proposal, and the learner's own easy band).
 *
 * ⛔ THE SAMPLE-COUNT GATE (D-284), lifted here from easy-hr.ts and made universal: a learned
 * run_threshold_hr written as "88% of observed max (estimated)" with sample_count 0 is a FORMULA,
 * not a measurement — it can NEVER anchor. Since 2026-09-26 it can never be proposed or accepted either.
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

/**
 * The threshold heart rate the athlete ACCEPTED, as stored: the measurement it was accepted from, plus when and
 * from what — `AcceptedFtp`'s shape (`resolve-current-ftp.ts`), key for key.
 */
export type AcceptedLthr = {
  value: number;
  confidence: 'low' | 'medium' | 'high' | string;
  source?: string;
  sample_count?: number;
  as_of?: string;
  /** ISO timestamp of the tap (or the seed). */
  accepted_at: string;
  /** The learned value at the moment of acceptance. */
  accepted_from: number;
  /** 'checkpoint' | 'baselines' | 'seed' — where the yes came from. */
  accepted_via?: string;
};

type AcceptedLthrLike = (Partial<AcceptedLthr> & { value?: number | string | null }) | null | undefined;

export type BaselinesLike = {
  learned_fitness?: {
    run_threshold_hr?: LearnedThr;
    ride_threshold_hr?: LearnedThr;
    /** The run threshold heart rate the athlete said yes to (2026-09-26). Holds until the next accept. */
    run_threshold_hr_accepted?: AcceptedLthrLike;
    /** The ride's, same shape. */
    ride_threshold_hr_accepted?: AcceptedLthrLike;
  } | null;
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
     * ⛔ CLOSED 2026-09-15 (TRUTH-MAP §8.0 #23): NEITHER SPORT READS THE AGNOSTIC KEY NOW. The field
     * carries no sport, so a run read could not tell a run number from a borrowed bike one — and the
     * two screens disagreed because they fed this resolver different objects. Each sport reads its own
     * typed field. `threshold_heart_rate` is still written (`save-baselines/derive.ts`, and only when
     * one sport has a value) and still read by the analysers that ask for "whatever threshold there is";
     * it is no longer a tier in this chain.
     */
    manual_run_lthr?: number | string | null;
    /** The bike's own typed override, written beside the run one by `TrainingBaselines.tsx:718`. */
    manual_ride_lthr?: number | string | null;
    /** Sport-agnostic, written as run ‖ ride. Kept on the type for callers that pass the stored row; not a tier. */
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

export type LthrSport = 'run' | 'ride';

/** `ride` / `bike` / `cycling` (any case, any raw `workout.type`) → 'ride'; everything else → 'run'. */
export function lthrSport(sport: unknown): LthrSport {
  return String(sport ?? '').toLowerCase().match(/ride|bike|cycl/) != null ? 'ride' : 'run';
}

/** The stored keys, per sport — named here once so no other file spells them. */
const LEARNED_KEY = { run: 'run_threshold_hr', ride: 'ride_threshold_hr' } as const;
const ACCEPTED_KEY = { run: 'run_threshold_hr_accepted', ride: 'ride_threshold_hr_accepted' } as const;

function confWord(v: unknown): 'low' | 'medium' | 'high' | null {
  const c = String(v ?? '').toLowerCase();
  return c === 'low' || c === 'medium' || c === 'high' ? c : null;
}

/**
 * THE MEASUREMENT — the learned threshold heart rate, behind the D-284 gate, and nothing else. NOT the anchor the app
 * runs on (that is `resolveCurrentLthr`). Two readers want exactly this: the proposal (`pendingLthrProposal`) and the
 * learner's own easy band, which is built from what the pass just measured (`_shared/easy-hr.ts`, `anchor: 'measured'`).
 * Source 'learned' at medium/high confidence, 'learned-low' below; null when there is no measurement.
 */
export function measuredLthr(baselines: BaselinesLike, opts?: LthrResolveOpts): ResolvedLthr {
  if (!baselines) return NULL_RESULT;
  const isRide = lthrSport(opts?.sport) === 'ride';

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
  const confOut = confWord(learnedConf);

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
   * ⚠️ Q-171: *weak but MEASURED* is still a measurement here (`learned-low`) — the gate is invented-vs-measured.
   * ⛔ BUT SINCE 2026-09-26 NO MEASUREMENT ANCHORS ON ITS OWN: it is proposed, and only at medium/high confidence
   * (FTP's "learned-low never proposes"), so a low-confidence reading is neither used nor offered until the learner
   * firms it up. The learner's own easy band still reads it (`measured` anchor, `_shared/easy-hr.ts`).
   */
  const learnedIsEstimate = learnedObj?.is_estimate === true;
  const learnedUsable = learnedValue != null && learnedSamples !== 0 && !learnedIsEstimate;
  const learnedTrusted = learnedUsable && (learnedConf === 'medium' || learnedConf === 'high');

  if (!learnedUsable) return NULL_RESULT;
  return {
    bpm: learnedValue, source: learnedTrusted ? 'learned' : 'learned-low', confidence: confOut,
    sample_count: learnedSamples, as_of: learnedAsOf, is_estimate: false,
  };
}

/**
 * The sport's TYPED threshold heart rate — what the athlete entered, whether or not it is the one in use (the run's
 * auto switch can set it aside). One definition for the resolver below and for the accept, which has to know whether
 * there is a typed number to set aside.
 */
export function typedLthr(baselines: BaselinesLike, opts?: LthrResolveOpts): number | null {
  if (!baselines) return null;
  const isRide = lthrSport(opts?.sport) === 'ride';
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
   * ⛔ THE RUN-SIDE LEAK IS CLOSED (2026-09-15, TRUTH-MAP §8.0 #23). The run chain used to end on
   * `configured_hr_zones.threshold_heart_rate` — the field `save-baselines/derive.ts` writes as
   * `runLthr || rideLthr`. An athlete with only a BIKE threshold typed therefore saw that bike number as
   * their RUN threshold on Adjust (which passes the stored row) and not on Baselines (which passed a
   * two-key object built from screen state): two screens, two numbers, for one fact. It also let an
   * `is_estimate` learned value that this resolver had just refused come back in one tier lower wearing
   * the word "manual". The run now reads its own typed field, exactly as the bike reads its own.
   *
   * ⚠️ `performance_numbers.threshold_heart_rate` STAYS. That one is a legacy RUN field — no current
   * writer, but what is stored there is a run number, not a borrowed bike one.
   */
  return isRide
    ? asPositiveFinite(baselines.configured_hr_zones?.manual_ride_lthr)
    : (asPositiveFinite(baselines.configured_hr_zones?.manual_run_lthr)
        ?? asPositiveFinite(pn?.threshold_heart_rate)
        ?? asPositiveFinite(pn?.thresholdHeartRate));
}

/** The accepted threshold heart rate's value for the sport, or null when the athlete has not accepted one. */
export function acceptedLthrValue(learned: Record<string, unknown> | null | undefined, sport: unknown): number | null {
  const slot = (learned as Record<string, { value?: unknown } | null | undefined> | null | undefined)?.[ACCEPTED_KEY[lthrSport(sport)]];
  return asPositiveFinite(slot?.value);
}

export function resolveCurrentLthr(baselines: BaselinesLike, opts?: LthrResolveOpts): ResolvedLthr {
  if (!baselines) return NULL_RESULT;
  const sport = lthrSport(opts?.sport);

  const manualValue = typedLthr(baselines, { sport });
  const deviceValue = asPositiveFinite(opts?.deviceThresholdHr);

  // ── Tier 0: the typed number (an assertion). ──
  // ⛔ THE RUN'S SWITCH ONLY. `lthr_source` is written by the run rows (Baselines, Adjust) and by the run accept; read
  // for the bike it let a run "auto" hide the bike's typed number while the bike row still said "your number".
  const chosen = sport === 'run' ? baselines.performance_numbers?.lthr_source : null;
  // chosen === 'learned' (auto) → SKIP the typed tier (Q-174: a declined typed number must not resurface).
  if (manualValue != null && chosen !== 'learned') {
    return { bpm: manualValue, source: chosen === 'manual' ? 'manual-chosen' : 'manual', confidence: null, sample_count: null, as_of: null, is_estimate: false };
  }

  // ── Tier 1: the accepted number (the athlete's yes, or the learner's one-time seed). ──
  // Only ever written from a measured, medium/high learned value (`acceptLearnedLthr`), so it is 'learned' by
  // construction; its stored confidence is the measurement's at the time and is not re-checked — the athlete said yes.
  const acceptedRaw = baselines.learned_fitness?.[ACCEPTED_KEY[sport]];
  const acceptedValue = asPositiveFinite(acceptedRaw?.value);
  if (acceptedValue != null) {
    const samples = asPositiveFinite(acceptedRaw?.sample_count);
    const asOf = typeof acceptedRaw?.as_of === 'string' && acceptedRaw.as_of.length >= 10 ? acceptedRaw.as_of : null;
    return { bpm: acceptedValue, source: 'learned', confidence: confWord(acceptedRaw?.confidence), sample_count: samples, as_of: asOf, is_estimate: false };
  }

  // ── Tier 2: device (per-workout, provenance unknown) — lowest. ──
  if (deviceValue != null) {
    return { bpm: deviceValue, source: 'device', confidence: null, sample_count: null, as_of: null, is_estimate: false };
  }
  // ── null — never 220-age, never invent, and never the learner's number unaccepted. ──
  return NULL_RESULT;
}

/** The threshold heart rate the athlete's sessions measured, waiting on acceptance. */
export type LthrProposal = {
  /** The measured value (bpm). */
  measured: number;
  /** The value in use now — typed or accepted — or null when there is none. */
  applied: number | null;
  confidence: string;
};

/**
 * The measured threshold heart rate the athlete has not said yes to — or null when there is nothing to accept.
 *
 * Against the number IN USE, typed or accepted, exactly as `pendingFtpProposal` / `pendingRunThresholdProposal`
 * (2026-09-05, Michael: the proposal shows even on "your number"; taking it is what switches back to auto). Null when:
 * no measurement; below medium confidence (learned-low never proposes — FTP's rule); a formula (D-284 gate); or the
 * measurement is NOT HIGHER than the number in use, compared to the whole beat the screen prints.
 * ⛔ ONLY A HIGHER NUMBER IS OFFERED (2026-09-26, Michael). TrainingPeaks' threshold notifications — the article the
 * learner's rule cites (trainingpeaks.com/blog/are-you-using-threshold-improvement-notifications) — are IMPROVEMENT
 * notifications: a new best raises the threshold; nothing offers to lower it. A lower number is never offered; the
 * athlete can still type any number on Baselines. (FTP and the run pace keep their own rules — both directions.)
 * ⚠️ ONE DIFFERENCE FROM FTP, AND IT FOLLOWS FROM THE RESOLVER: with nothing in use (no typed, no accepted) the
 * measurement is still offered, `applied: null`. FTP returns null there because its estimate already applies; a
 * threshold heart rate never applies unaccepted.
 */
export function pendingLthrProposal(baselines: BaselinesLike, opts?: LthrResolveOpts): LthrProposal | null {
  if (!baselines) return null;
  const sport = lthrSport(opts?.sport);
  const measured = measuredLthr(baselines, { sport });
  if (measured.bpm == null || measured.source !== 'learned') return null;
  const applied = resolveCurrentLthr(baselines, { sport }).bpm;
  if (applied != null && Math.round(measured.bpm) <= Math.round(applied)) return null;
  return { measured: measured.bpm, applied, confidence: String(measured.confidence ?? '') };
}

/**
 * THE ONE WRITE — `acceptEstimatedFtp` / `acceptLearnedRunThreshold`, the heart-rate twin. Returns a new
 * `learned_fitness` with the sport's accepted key set from the live measurement, or null when there is nothing to
 * accept (no measurement, a formula, or below medium confidence). `save-baselines` is its only caller (the three
 * screens, and the learner's seed, all go through it).
 */
export function acceptLearnedLthr(
  learned: Record<string, unknown> | null | undefined,
  sport: unknown,
  via: 'checkpoint' | 'baselines' | 'seed',
  now: Date = new Date(),
): Record<string, unknown> | null {
  if (!learned || typeof learned !== 'object') return null;
  const s = lthrSport(sport);
  const measured = measuredLthr({ learned_fitness: learned as never }, { sport: s });
  if (measured.bpm == null || measured.source !== 'learned') return null;
  const est = (learned as Record<string, unknown>)[LEARNED_KEY[s]];
  const value = measured.bpm;
  return {
    ...learned,
    [ACCEPTED_KEY[s]]: { ...(est && typeof est === 'object' ? est as object : {}), value, accepted_at: now.toISOString(), accepted_from: value, accepted_via: via },
  };
}
