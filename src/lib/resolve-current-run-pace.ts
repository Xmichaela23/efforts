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

const SEC_PER_KM_TO_SEC_PER_MI = 1.609344;

/** Where the number came from. Travels to the surface with it (Law 3). */
export type RunPaceSource =
  | 'manual-chosen'  // Q-174 — the athlete EXPLICITLY chose their own number. Outranks everything.
  | 'learned'        // measured from the athlete's own easy runs, confidence medium|high
  | 'manual'         // the athlete typed it, but has not chosen it over the learned value
  | 'effort_paces'   // wizard/VDOT-derived. An INFERENCE — is_estimate: true.
  | 'learned-low';   // measured, but the learner is not confident yet

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
} | null | undefined;

type EffortPacesLike = {
  /** sec per MILE */
  base?: number | string | null;
} | null | undefined;

export type RunBaselinesLike = {
  learned_fitness?: LearnedFitnessLike;
  performance_numbers?: PerformanceNumbersLike;
  effort_paces?: EffortPacesLike;
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
  if (!baselines) return NULL_RESULT;

  const learnedRaw = baselines.learned_fitness?.run_easy_pace_sec_per_km;
  const learnedSecPerKm = asPositiveFinite(learnedRaw?.value);
  const learnedSecPerMi = learnedSecPerKm != null
    ? Math.round(learnedSecPerKm * SEC_PER_KM_TO_SEC_PER_MI)   // <- THE unit conversion. Once, here.
    : null;
  const learnedConf = confOf(learnedRaw);
  const learnedSamples = asPositiveFinite(learnedRaw?.sample_count) ?? null;
  const learnedAsOf = typeof learnedRaw?.as_of === 'string' && learnedRaw.as_of.length >= 10
    ? learnedRaw.as_of
    : null;
  const learnedTrusted = learnedConf === 'medium' || learnedConf === 'high';

  const pn = baselines.performance_numbers;
  const manual = parsePaceToSecPerMi(pn?.easyPace ?? pn?.easy_pace);
  const wizard = parsePaceToSecPerMi(baselines.effort_paces?.base);

  // ── Tier 0 (Q-174): the athlete's explicit choice outranks everything. ──
  const chosen = pn?.easy_pace_source;
  if (chosen === 'manual' && manual != null) {
    return {
      sec_per_mi: manual, source: 'manual-chosen', confidence: null,
      sample_count: null, as_of: null, is_estimate: false,   // an ASSERTION, not an estimate
    };
  }
  // chosen === 'learned' -> fall through, but SKIP the manual tier: they told us to track their runs, so a
  // stale typed number must not resurface just because the learner momentarily thins out.
  const manualEligible = chosen !== 'learned';

  if (learnedSecPerMi != null && learnedTrusted) {
    return {
      sec_per_mi: learnedSecPerMi, source: 'learned', confidence: learnedConf,
      sample_count: learnedSamples, as_of: learnedAsOf, is_estimate: false,
    };
  }
  if (manual != null && manualEligible) {
    // The athlete asserted this. It is not an estimate — but it carries no date, so it can go stale
    // silently. That is a known gap (the manual field has no `as_of`); do not paper over it here.
    return {
      sec_per_mi: manual, source: 'manual', confidence: null,
      sample_count: null, as_of: null, is_estimate: false,
    };
  }
  if (wizard != null) {
    return {
      sec_per_mi: wizard, source: 'effort_paces', confidence: null,
      sample_count: null, as_of: null, is_estimate: true,   // Law 2 — derived, and says so
    };
  }
  if (learnedSecPerMi != null) {
    return {
      sec_per_mi: learnedSecPerMi, source: 'learned-low', confidence: learnedConf,
      sample_count: learnedSamples, as_of: learnedAsOf, is_estimate: false,
    };
  }
  return NULL_RESULT;
}
