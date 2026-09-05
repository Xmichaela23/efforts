/**
 * Shared resolver for the athlete's current EASY RUN PACE. The run twin of `resolve-current-ftp.ts`.
 *
 * Spec: `docs/SPEC-run-pace-glass-box.md`. Laws 1/2/3.
 *
 * WHY THIS EXISTS. The bike got `resolveCurrentFtp` expressly to kill "8 different ad-hoc `||`/`??`
 * fallback chains that previously chose differently per consumer". **The run never got one**, so the
 * disease is still live — and worse than the bike's ever was, because the run chains do not merely
 * disagree, they INVENT:
 *
 *   _shared/token-parser.ts:88,101,186,194        baselines.easyPace || 540      <- 9:00/mi, invented
 *   lib/analysis/running/token-parser.ts:142,...  same
 *   analyze-running-workout/index.ts:453          easyPace: 540                  <- GRADES THE WORKOUT CARD
 *   _shared/end-plan-core.ts:72                   effort_paces.base ?? 600
 *   _shared/planning-context.ts:380               ?? 600
 *   shared/strength-system/strength-primary-plan.ts:413   FALLBACK_EASY_MIN_PER_MILE (10:00/mi)
 *   generate-strength-plan/index.ts:44-60         a local ad-hoc copy (Q-105)
 *
 * A bare `540` is not a pace. It is a number with no provenance that reached a verdict the athlete
 * READS ("short finish relative to the planned ~90 min"). That is the score that lies, and Law 2 exists
 * to forbid exactly it. **When we do not know the pace, we say so. We do not invent one.**
 *
 * ⚠ THE UNIT FOOTGUN (this repo has been bitten by it three times — see CLAUDE.md):
 *     learned_fitness.run_easy_pace_sec_per_km   is  sec/KM
 *     performance_numbers.easyPace               is  sec/MILE (and is sometimes a "9:30" STRING)
 *     effort_paces.base                          is  sec/MILE
 *   This resolver normalizes EVERYTHING to sec/MILE. It says so in its name, its return type, and here.
 *
 * No I/O. Pure function. Caller passes already-loaded baselines. Importable from the React client AND
 * Deno edge functions (the `src/lib/session-frequency-defaults.ts` precedent).
 */

import { pacesFromThresholdSecPerMi } from './run-paces-from-threshold.ts';

const SEC_PER_KM_TO_SEC_PER_MI = 1.609344;

/** Where the number came from. Travels to the surface with it (Law 3). */
export type RunPaceSource =
  | 'manual-chosen'  // Q-174 — the athlete EXPLICITLY chose their own number. Outranks everything.
  | 'learned'        // measured from the athlete's own easy runs, confidence medium|high
  | 'manual'         // the athlete typed it, but has not chosen it over the learned value
  /**
   * EASY ONLY (2026-09-02). Nothing measured or typed for easy, so it comes off the resolved
   * threshold × 1.19 — the same ratio the threshold derivation uses in the other direction. An
   * INFERENCE — is_estimate: true. Never returned when threshold was itself derived from easy.
   */
  | 'derived-from-threshold'
  | 'learned-low'    // measured, but the learner is not confident yet;

export type ResolvedRunPace = {
  /** sec per MILE. null = we do not know. Consumers MUST disclose, never invent. */
  sec_per_mi: number | null;
  source: RunPaceSource | null;
  confidence: 'low' | 'medium' | 'high' | null;
  sample_count: number | null;
  /** Q-173 — the newest SESSION behind the number. NOT "when was the profile rebuilt". */
  as_of: string | null;
  /** Law 2 — an inference must declare itself. True for derived values, false for measured/asserted. */
  is_estimate: boolean;
};

type LearnedMetricLike = {
  value?: number | string | null;
  confidence?: 'low' | 'medium' | 'high' | string | null;
  sample_count?: number | null;
  as_of?: string | null;
} | null | undefined;

type LearnedFitnessLike = {
  /** sec per KM */
  run_easy_pace_sec_per_km?: LearnedMetricLike;
  /** sec per KM — the MEASURED lactate-threshold pace (~1hr race pace). */
  run_threshold_pace_sec_per_km?: LearnedMetricLike;
  /** The threshold pace the athlete ACCEPTED (proposed-then-accepted, the FTP pattern; 2026-09-05). Holds until the next accept. */
  run_threshold_pace_accepted?: LearnedMetricLike;
} | null | undefined;

type PerformanceNumbersLike = {
  /** sec per MILE, or a "9:30" string */
  easyPace?: number | string | null;
  easy_pace?: number | string | null;
  /**
   * Q-174 — THE ATHLETE'S EXPLICIT CHOICE, and it outranks everything.
   *
   * 'manual'  -> "use MY number." The athlete looked at both and picked their own. An ASSERTION beats an
   *              inference (Law 2 draws exactly that line), and Garmin/TrainingPeaks both respect a value
   *              you set. Honored even against a high-confidence learned pace.
   * 'learned' -> "use what my runs say." Tracks the learner live, and keeps updating.
   * absent    -> unchosen. Falls through to the default precedence below (learned-first) — so this field
   *              is purely additive and changes NOTHING for an athlete who has never expressed a
   *              preference. No migration, no regression.
   */
  easy_pace_source?: 'manual' | 'learned' | null;

  // ── THRESHOLD PACE (the sibling fact). Three unit spellings coexist in the wild (the footgun): ──
  /** sec per MILE */
  threshold_pace_sec_per_mi?: number | string | null;
  /** sec per MILE (camelCase variant that also appears) */
  thresholdPaceSecPerMi?: number | string | null;
  /** a "7:30" / "7:30/mi" STRING in min/MILE */
  threshold_pace_min_per_mi?: number | string | null;
  /** sec per KM — the odd one; converted to sec/MILE here, once */
  threshold_pace_sec_per_km?: number | string | null;
  /** the athlete's explicit choice for threshold, mirrors easy_pace_source (Q-174). Additive. */
  threshold_pace_source?: 'manual' | 'learned' | null;
} | null | undefined;


export type RunBaselinesLike = {
  learned_fitness?: LearnedFitnessLike;
  performance_numbers?: PerformanceNumbersLike;
} | null | undefined;

const NULL_RESULT: ResolvedRunPace = {
  sec_per_mi: null, source: null, confidence: null, sample_count: null, as_of: null, is_estimate: false,
};

/** Guard BEFORE Number() — `Number(null) === 0` is a documented repeat bug in this codebase. */
function asPositiveFinite(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * `performance_numbers.easyPace` is user-typed and arrives as either seconds or a "9:30" / "9:30/mi"
 * string. Parse both; anything else is "we don't know", never a silent 0.
 */
export function parsePaceToSecPerMi(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):([0-5]\d)/);
  if (m) {
    const secs = Number(m[1]) * 60 + Number(m[2]);
    return secs > 0 ? secs : null;
  }
  return asPositiveFinite(s);
}

function confOf(raw: LearnedMetricLike): 'low' | 'medium' | 'high' | null {
  const c = String(raw?.confidence ?? '').toLowerCase();
  return c === 'low' || c === 'medium' || c === 'high' ? c : null;
}

/**
 * The athlete's current easy run pace, in sec/MILE, with its provenance attached.
 *
 * Precedence:
 *   0. THE ATHLETE'S EXPLICIT CHOICE (`performance_numbers.easy_pace_source`) — Q-174. If they picked
 *      'manual' and a manual value exists, it WINS, even over a high-confidence learned pace. They looked
 *      at both and chose. An assertion outranks an inference; Garmin and TrainingPeaks both honour a value
 *      you set. If they picked 'learned', we skip the manual tier entirely and track the learner live.
 *   1. learned (confidence medium|high)  — MEASURED from their own runs
 *   2. manual                            — typed, but not explicitly chosen over the learner
 *   3. effort_paces.base                 — an INFERENCE (wizard/VDOT). is_estimate: true.
 *   4. learned (any confidence)          — measured but thin
 *   5. null                              — we do not know. SAY SO. (Never 540. Never 600.)
 *
 * An ABSENT choice behaves exactly as before, so this is purely additive: no migration, no regression for
 * an athlete who has never expressed a preference.
 */
export function resolveCurrentRunEasyPace(baselines: RunBaselinesLike): ResolvedRunPace {
  /**
   * ⛔ EASY IS NOT A PACE SOURCE (Michael, 2026-09-02, final): *"we are still fighting where easy and
   * threshold come from."* Easy days are a HEART-RATE zone off threshold HR (`resolve-current-lthr.ts`).
   * The easy PACE is only a reference band: threshold × 1.19, nothing else. No learned tier, no typed
   * tier, no `easy_pace_source` choice — every one of those was a second anchor arguing with the first.
   *
   * ⚠️ THE LEARNED EASY PACE IS NOT DELETED. It stays an INPUT: the six-week checkpoint's evidence
   * reads it (`resolveMeasuredEasyPaceSecPerMi`). It never prescribes anything by itself.
   *
   * Every consumer gets `is_estimate: true` — a reference band is an inference, not a measurement.
   * ⛔ Q-174 (the easy-pace choice) is SUPERSEDED by this ruling; the field is ignored here.
   */
  if (!baselines) return NULL_RESULT;
  const thr = resolveCurrentRunThresholdPace(baselines);
  const derived = pacesFromThresholdSecPerMi(thr.sec_per_mi);
  if (!derived) return NULL_RESULT;
  return {
    sec_per_mi: derived.easy, source: 'derived-from-threshold', confidence: thr.confidence,
    sample_count: thr.sample_count, as_of: thr.as_of, is_estimate: true,
  };
}

/** sec/KM → sec/MILE, guarded. The unit conversion lives ONCE per direction (see the footgun note). */
function secPerKmToMi(secPerKm: number | null): number | null {
  return secPerKm == null ? null : Math.round(secPerKm * SEC_PER_KM_TO_SEC_PER_MI);
}
/** sec/MILE → sec/KM, guarded. */
function secPerMiToKm(secPerMi: number | null): number | null {
  return secPerMi == null ? null : Math.round(secPerMi / SEC_PER_KM_TO_SEC_PER_MI);
}

/**
 * Threshold pace carries BOTH units — race-projections needs sec/KM (runDistKm × pace), the coach prints
 * min/MILE or min/KM. Both are derived from the winning tier, converted once; the km-native learned tier
 * keeps its exact km value (no lossy round-trip). Easy pace never needed this, so its type is untouched.
 */
export type ResolvedThresholdPace = {
  sec_per_mi: number | null;
  sec_per_km: number | null;
  source: RunPaceSource | null;
  confidence: 'low' | 'medium' | 'high' | null;
  sample_count: number | null;
  as_of: string | null;
  is_estimate: boolean;
};

const NULL_TP: ResolvedThresholdPace = {
  sec_per_mi: null, sec_per_km: null, source: null, confidence: null, sample_count: null, as_of: null, is_estimate: false,
};

/**
 * The athlete's MEASURED easy pace, sec/MILE — learned from their own runs, at medium/high
 * confidence, and NOTHING ELSE. The one input the threshold bound is allowed to stand on.
 *
 * ⛔ THIS IS NOT `resolveCurrentRunEasyPace`, AND THE DIFFERENCE IS THE WHOLE POINT. That resolver
 * can answer from `effort_paces.base` — the same VDOT lookup off the same typed 5K that produces the
 * threshold candidate being bounded. Founding the bound on it would have the 5K bound itself: a
 * limit that can never be crossed and a guard that always passes. It can also answer from a typed
 * easy pace, which is an assertion rather than a measurement.
 *
 * ⚠️ `low` IS EXCLUDED. The learner saying "not confident yet" is not a base to bound a prescription
 * with. No easy pace at this bar returns `null`, the bound does not exist, and nothing is
 * fabricated to replace it (LAW 2).
 *
 * Exported because `materialize-plan` needs the identical rule for its own last-ditch threshold
 * branch, and two copies of "which easy pace counts" is exactly how this fact fractured the first time.
 */
export function resolveMeasuredEasyPaceSecPerMi(baselines: RunBaselinesLike): number | null {
  /**
   * The athlete's MEASURED easy pace — learned from their own easy runs at medium/high confidence —
   * and nothing else. It is EVIDENCE for the six-week checkpoint; it derives no threshold (2026-09-02).
   *
   * ⛔ A TYPED easy pace and the `easy_pace_source` choice used to count here (2026-08-20). They do
   * not any more: easy is not a pace source (Michael, 2026-09-02), so nothing typed about easy can
   * found a threshold. Measured means measured.
   */
  const raw = baselines?.learned_fitness?.run_easy_pace_sec_per_km;
  const conf = confOf(raw);
  return (conf === 'medium' || conf === 'high') ? secPerKmToMi(asPositiveFinite(raw?.value)) : null;
}

/**
 * Shared resolver for the athlete's current THRESHOLD RUN PACE (lactate-threshold / ~1hr race pace) —
 * the sibling of `resolveCurrentRunEasyPace`, and the fix for audit 2026-07-17 #6.
 *
 * WHY THIS EXISTS. Threshold pace is read raw across ~35 files in THREE units, and the two authorities
 * that matter never read the same field:
 *   - coach/index.ts:4445         effort_paces.threshold || effort_paces.z4 || perf.threshold_pace_min_per_mi
 *   - race-projections.ts:370     learned_fitness.run_threshold_pace_sec_per_km   (and ONLY it)
 * So a threshold pace typed in the Plan Wizard drives the coach while race-projections predicts off the
 * learned one — two threshold paces, one athlete, same week. This is the LTHR disease in the pace layer.
 *
 * ⚠ THE UNIT FOOTGUN, threshold edition — normalized to sec/MILE here, once:
 *     learned_fitness.run_threshold_pace_sec_per_km   is  sec/KM
 *     performance_numbers.threshold_pace_sec_per_mi   is  sec/MILE
 *     performance_numbers.threshold_pace_sec_per_km   is  sec/KM (the odd one)
 *     performance_numbers.threshold_pace_min_per_mi   is  a "7:30" STRING in min/MILE
 *     effort_paces.threshold / .z4                    is  sec/MILE
 *
 * Precedence mirrors the easy resolver exactly (Q-174 choice → learned → manual → wizard → learned-low →
 * null). effort_paces is an INFERENCE (wizard/VDOT), so it is is_estimate:true and sits BELOW a typed
 * value — the inversion the coach has today (it reaches for the wizard pace first) is the bug being fixed.
 */
export function resolveCurrentRunThresholdPace(baselines: RunBaselinesLike): ResolvedThresholdPace {
  if (!baselines) return NULL_TP;

  const learnedRaw = baselines.learned_fitness?.run_threshold_pace_sec_per_km;
  const learnedSecPerKm = asPositiveFinite(learnedRaw?.value);         // km-NATIVE — keep it exact
  const learnedSecPerMi = secPerKmToMi(learnedSecPerKm);
  const learnedConf = confOf(learnedRaw);
  const learnedSamples = asPositiveFinite(learnedRaw?.sample_count) ?? null;
  const learnedAsOf = typeof learnedRaw?.as_of === 'string' && learnedRaw.as_of.length >= 10
    ? learnedRaw.as_of
    : null;
  const learnedTrusted = learnedConf === 'medium' || learnedConf === 'high';
  // ⛔ PROPOSED, THEN ACCEPTED (2026-09-05, Michael: "let's propose"). The learned threshold no longer moves the
  // plan on its own: the value in use is the one accepted (seeded by the learner from the first trusted learned
  // value, then held), and a newer trusted learned value is a PROPOSAL the athlete takes on Adjust, the post-run
  // popup or the six-week checkpoint. Same door as FTP (resolve-current-ftp.ts); TrainerRoad's pattern.
  const acceptedRaw = baselines.learned_fitness?.run_threshold_pace_accepted;
  const acceptedSecPerKm = asPositiveFinite(acceptedRaw?.value);
  const useSecPerKm = acceptedSecPerKm ?? learnedSecPerKm;
  const useSecPerMi = secPerKmToMi(useSecPerKm);
  const useTrusted = acceptedSecPerKm != null ? true : learnedTrusted;
  const useConf = acceptedSecPerKm != null ? (confOf(acceptedRaw) ?? learnedConf) : learnedConf;
  const useSamples = acceptedSecPerKm != null ? (asPositiveFinite(acceptedRaw?.sample_count) ?? learnedSamples) : learnedSamples;
  const useAsOf = acceptedSecPerKm != null && typeof acceptedRaw?.as_of === 'string' && acceptedRaw.as_of.length >= 10 ? acceptedRaw.as_of : learnedAsOf;

  const pn = baselines.performance_numbers;
  // A typed/asserted value — try each unit spelling, convert to sec/MILE once. min_per_mi only if a STRING
  // (a bare number there is ambiguous "minutes", not seconds — do not silently mis-read it).
  const manual =
    parsePaceToSecPerMi(pn?.threshold_pace_sec_per_mi ?? pn?.thresholdPaceSecPerMi)
    ?? secPerKmToMi(asPositiveFinite(pn?.threshold_pace_sec_per_km))
    ?? (typeof pn?.threshold_pace_min_per_mi === 'string' ? parsePaceToSecPerMi(pn.threshold_pace_min_per_mi) : null);

  // The wizard/VDOT inference — `steady` FIRST, because it is the only one of the three that anything
  // writes (see the type above). `threshold`/`z4` stay as read-fallbacks so nothing that ever wrote
  // them in the past goes silently unread.
  // ⛔ NO 5K TIER (Michael, 2026-09-02, final): *"we don't have to do any easy or threshold math from
  // 5K, it's either learned or entered."* The vDOT-table tier AND the 5K + 20 seed that briefly
  // replaced it are both gone. The 5K time's only pace job is 5K race pace for 5K-pace work
  // (`resolve-current-5k-pace.ts`). No measured threshold and nothing typed → NULL, and a hard run
  // ships with an effort target only, until a test, a race or an entry. Accepted consequence.

  // Result builder — carries both units. `kmNative` is the exact km value when the tier is km-native
  // (learned); for mi-native tiers (typed/wizard) km is derived once from mi.
  const mk = (
    secPerMi: number, source: RunPaceSource, is_estimate: boolean,
    extra?: { confidence?: 'low' | 'medium' | 'high' | null; sample_count?: number | null; as_of?: string | null; kmNative?: number | null },
  ): ResolvedThresholdPace => ({
    sec_per_mi: secPerMi,
    sec_per_km: extra?.kmNative ?? secPerMiToKm(secPerMi),
    source,
    confidence: extra?.confidence ?? null,
    sample_count: extra?.sample_count ?? null,
    as_of: extra?.as_of ?? null,
    is_estimate,
  });

  /**
   * ⛔ THE BOUND, AND WHAT IT IS FOUNDED ON (2026-08-19). A threshold pace may not be faster than
   * the athlete's own MEASURED easy pace ÷ 1.19 (`run-threshold-from-easy.ts`). It exists because
   * the tier below — the wizard/VDOT pace — is computed from a 5K the athlete TYPED ONCE, that
   * nothing measures and nothing dates. A 5K goes stale as fitness changes, and a stale 5K
   * prescribes a threshold that is too FAST.
   *
   * ⛔ MEASURED ONLY, AND THAT IS NOT FUSSINESS — IT IS THE WHOLE POINT. `resolveCurrentRunEasyPace`
   * can itself answer from `effort_paces.base`, which is the SAME VDOT lookup off the SAME typed 5K.
   * Founding the bound on that would derive the 5K's answer from the 5K and bound it with itself:
   * a floor that can never be crossed, and a guard that always passes. So the bound reads the
   * learned metric directly, at medium/high confidence — the athlete's own runs, measured
   * independently of anything they typed.
   *
   * ⚠️ `low` IS EXCLUDED HERE ON PURPOSE. The learner saying "not confident yet" is not a base to
   * bound a prescription with, and a thin easy read that is itself too slow would drag threshold
   * with it. No easy pace at this bar → `null` → the bound does not exist → nothing is clamped and
   * nothing is fabricated. LAW 2.
   */
  // ── Tier 0 (Q-174): the athlete's explicit choice outranks everything. ──
  const chosen = pn?.threshold_pace_source;
  if (chosen === 'manual' && manual != null) return mk(manual, 'manual-chosen', false);
  const manualEligible = chosen !== 'learned';

  // 1. learned, trusted — MEASURED from their own runs.
  if (useSecPerMi != null && useTrusted) {
    return mk(useSecPerMi, 'learned', false, { confidence: useConf, sample_count: useSamples, as_of: useAsOf, kmNative: useSecPerKm });
  }
  // 2. manual / typed (an assertion).
  //
  // ⛔ NOT BOUNDED, DELIBERATELY. This is a number a person typed about themselves. Silently
  // replacing it would show them one value while the engine used another — the exact lie D-285
  // exists to kill — and an assertion outranks an inference everywhere else in this file. When a
  // typed value disagrees with the training data the app SAYS SO (the 5K retest flag,
  // `_shared/arc-context.ts`); it does not edit the athlete behind their back.
  if (manual != null && manualEligible) return mk(manual, 'manual', false);

  // 3. effort_paces (wizard/VDOT off the typed 5K) — an INFERENCE, and therefore BOUNDED.
  //
  // ⚠️ WHEN THE BOUND DOES NOT BITE, THE 5K STILL WINS — and that is correct, not a concession. A
  // race time is a PERFORMANCE; easy pace is partly a CHOICE (heat, hills, discipline, coming back
  // from illness all make it slower without making the athlete slower). So a 5K that is coherent
  // with the measured easy runs is the sharper anchor and passes through untouched. The bound only
  // fires on a 5K the athlete's own recent running says they can no longer run — and then the
  // source changes with the number, because a value the 5K did not produce must not keep the 5K's
  // name on screen.

  // 4. derived from the measured easy pace — no candidate at all, but their own runs imply one.
  //
  // ⛔ ABOVE `learned-low`, AND THAT ORDER IS THE RULING. `low` is the learner's own statement that
  // it cannot yet steer a plan — it is the tier the contaminated 14:44/mi read now lands in. Ten
  // clean easy runs are better evidence about an athlete than two marginal threshold candidates,
  // so the derivation goes first and the thin measurement is the last thing tried before `null`.
  // ⛔ NO derived-from-easy TIER EITHER (Michael, 2026-09-02, final): threshold is learned (measured)
  // or entered, full stop. The measured easy pace stays an INPUT for the six-week checkpoint's
  // evidence read, never a threshold by itself.

  // 5. learned-low (any confidence, still measured).
  if (useSecPerMi != null) {
    return mk(useSecPerMi, 'learned-low', false, { confidence: useConf, sample_count: useSamples, as_of: useAsOf, kmNative: useSecPerKm });
  }
  // 6. null — we do not know. SAY SO.
  return NULL_TP;
}

/**
 * ⛔ WHICH OF THE STATES THE ATHLETE IS IN, AND THE SENTENCE THAT SAYS SO. One owner for the words
 * (2026-08-19), because the bug that started this was not a bad number — it was a number shown
 * with NO ACCOUNT OF WHERE IT CAME FROM. The app picked a source silently and the athlete only
 * found the disagreement by looking.
 *
 * The three states Michael named:
 *   `measured`            — enough clean runs of their own; here is your threshold
 *   `derived-from-easy`   — worked out from your easy pace, and SAID so, never dressed as measured
 *   `unknown`             — not enough data. **Show no number.** Not a placeholder, not a guess.
 *
 * Two more exist because they already occur on screen today and collapsing them would be a
 * downgrade, not a simplification — neither is a new invention:
 *   `stated`              — the athlete typed it (the easy-pace card already says "you entered this")
 *   `derived-from-5k`     — the wizard/VDOT pace, uncontested by the bound (the strength session
 *                           copy already says "derived from your 5K — threshold sits about 20 s/mi
 *                           slower")
 *
 * ⚠️ `note` IS THE HONEST CAVEAT, NOT DECORATION. It is null for the states that need none. On the
 * derived state it carries the ratio's one weakness — easy pace is partly a choice — because an
 * athlete running deliberately extra-easy gets a threshold read back that is too slow, and they
 * are the only person who can know that.
 *
 * ⛔ Voice check: fact-first, no imperative, no encouragement, no second person telling them what
 * to do. Consequences are stated conditionally.
 */
export type ThresholdBasis = {
  state: 'measured' | 'derived-from-easy' | 'stated' | 'derived-from-5k' | 'unknown';
  /** One line, athlete-facing. Never null — `unknown` says that it has no number, which is the point. */
  label: string;
  /** A second line where the state carries a real caveat. Null where it does not. */
  note: string | null;
  /** False only for `unknown` — the one state where a surface must render no pace at all. */
  showNumber: boolean;
};

export function describeThresholdBasis(resolved: ResolvedThresholdPace | null | undefined): ThresholdBasis {
  const source = resolved?.sec_per_mi != null ? resolved.source : null;
  switch (source) {
    case 'learned':
    case 'learned-low':
      return {
        state: 'measured',
        label: 'Measured from your runs.',
        // The learner publishes two runs at `low` and treats three as steerable; a reader is
        // entitled to know which side of that line the number they are looking at sits on.
        note: resolved?.confidence === 'low'
          ? 'Based on few enough sessions that it moves as more land.'
          : null,
        showNumber: true,
      };
    case 'manual':
    case 'manual-chosen':
      return { state: 'stated', label: 'You entered this.', note: null, showNumber: true };
    default:
      return {
        state: 'unknown',
        label: 'No hard runs on file.',
        note: 'Easy running alone cannot measure this. Enter your threshold pace, or run the 12-minute test.',
        showNumber: false,
      };
  }
}

/** The threshold pace the runs measured, waiting on acceptance. null when nothing is pending. sec/KM native. */
export type RunThresholdProposal = { measuredSecPerKm: number; appliedSecPerKm: number; confidence: string };
export function pendingRunThresholdProposal(baselines: RunBaselinesLike): RunThresholdProposal | null {
  if (!baselines) return null;
  const learnedRaw = baselines.learned_fitness?.run_threshold_pace_sec_per_km;
  const measured = asPositiveFinite(learnedRaw?.value);
  const conf = confOf(learnedRaw);
  if (measured == null || !(conf === 'medium' || conf === 'high')) return null;
  const applied = asPositiveFinite(baselines.learned_fitness?.run_threshold_pace_accepted?.value);
  if (applied == null) return null;
  const pn = baselines.performance_numbers;
  if (pn?.threshold_pace_source === 'manual') return null;
  if (Math.round(measured) === Math.round(applied)) return null;
  return { measuredSecPerKm: measured, appliedSecPerKm: applied, confidence: String(conf) };
}

/** Accept the learned threshold pace: the same shape as `acceptEstimatedFtp`. Returns the next learned_fitness, or null. */
export function acceptLearnedRunThreshold(
  learned: Record<string, unknown> | null | undefined,
  via: 'checkpoint' | 'baselines' | 'seed',
  now: Date = new Date(),
): Record<string, unknown> | null {
  if (!learned || typeof learned !== 'object') return null;
  const est = (learned as { run_threshold_pace_sec_per_km?: LearnedMetricLike }).run_threshold_pace_sec_per_km;
  const value = asPositiveFinite(est?.value);
  const conf = confOf(est);
  if (value == null || !(conf === 'medium' || conf === 'high')) return null;
  return {
    ...learned,
    run_threshold_pace_accepted: { ...(est as object), value, accepted_at: now.toISOString(), accepted_from: value, accepted_via: via },
  };
}
