/**
 * Shared resolver for the athlete's current cycling FTP. Single source of truth across
 * every consumer that needs "what's the athlete's current FTP" — replaces 8 different
 * ad-hoc `||` / `??` fallback chains that previously chose differently per consumer
 * (manual-then-learned in some, learned-then-manual in others, manual-only with hardcoded
 * 300W default in send-workout-to-garmin, learned-only-with-confidence-gate in others).
 *
 * Precedence:
 *   0. performance_numbers.ftp_source — THE ATHLETE'S CHOICE, and it outranks everything below.
 *   1. learned_fitness.ride_ftp_accepted.value if present                         → 'learned'
 *      else learned_fitness.ride_ftp_estimated.value if confidence ∈ {medium, high} → 'learned'
 *   2. performance_numbers.ftp if present (>0)                                    → 'manual'
 *   3. learned_fitness.ride_ftp_estimated.value (any confidence, fallback)        → 'learned-low'
 *   4. otherwise                                                                  → null
 *
 * ⛔ THE LEARNER PROPOSES, THE ATHLETE ACCEPTS (2026-09-04, `docs/SPEC-ftp-accept-2026-09-04.md`,
 * TrainerRoad's lead). `ride_ftp_estimated` is the live measurement — it keeps moving, rate-limited,
 * every learn. `ride_ftp_accepted` is the number the athlete said yes to, and it is what the app runs
 * on. Tier 1 reads the ACCEPTED value first; only when there is none does it fall back to the estimate
 * exactly as before, so an athlete who has never accepted gets byte-identical numbers to before this
 * seam existed. Nothing downstream reads the proposal: every zone, target, coach line and Garmin push
 * goes through this function, and this function returns the accepted number.
 *
 * `pendingFtpProposal` is the other half: the measured value when it differs from the accepted one,
 * null otherwise. Never on 'my number' (the estimate is not theirs to accept — they chose), never
 * from a low-confidence estimate (`learned-low` never proposes), never with no accepted value on file
 * (then the estimate already applies and there is nothing to accept).
 *
 * ⛔ TIER 0 — Q-240 (2026-08-01, Michael: "yes choose auto or your entry"). Until this, cycling was
 * the only baseline where the app decided and the athlete could not answer back. Running has had
 * `easy_pace_source` since Q-174, with the principle written into its own control: an assertion beats
 * an inference (Law 2), and Garmin and TrainingPeaks both honour a value you set. Bike had no
 * preference at all — read tiers 1 and 2 in order: a confident learned estimate outranked the
 * athlete's own typed number, and their ONLY lever was deleting their entry, which does not get them
 * the number they wanted either. Typing 181 and being shown 176 was the reportable symptom.
 *
 * ⚠️ ABSENT A CHOICE, BEHAVIOUR IS BYTE-IDENTICAL TO BEFORE. That is deliberate and load-bearing:
 * this resolver feeds the coach, the analyzers, the plan generators and every power-zone
 * calculation — including the 56–75% aerobic band the bike's heart-rate read is taken in. A default
 * that silently moved would move all of them for every athlete at once.
 *
 * ⚠️ A CHOICE WITH NO VALUE BEHIND IT IS NOT HONOURED — it falls through to the normal chain rather
 * than returning null. Choosing "my number" and then clearing the field must not blank the FTP for
 * the whole app; it must mean "and now there is nothing to prefer".
 *
 * The 'learned-low' source lets quality-gated consumers (race projections, fitness inference,
 * plan materialization) opt out of low-confidence values while permissive consumers
 * (display, workload computation, device sync) accept the best-available value.
 *
 * Same shape as `src/lib/use-strength-ordering-preference.ts` — pure shared logic in
 * `src/lib/`, importable from both the React client and Deno edge functions per the
 * `src/lib/session-frequency-defaults.ts` precedent.
 *
 * No I/O. Pure function. Caller passes already-loaded baselines.
 */

export type FtpSource = 'learned' | 'learned-low' | 'manual';

export type ResolvedFtp = {
  value: number | null;
  source: FtpSource | null;
};

type LearnedMetricLike = {
  value?: number | string | null;
  confidence?: 'low' | 'medium' | 'high' | string | null;
} | null;

/** The accepted FTP as stored: the estimate it was accepted from, plus when and from what. */
export type AcceptedFtp = {
  value: number;
  confidence: 'low' | 'medium' | 'high' | string;
  source?: string;
  sample_count?: number;
  /** ISO timestamp of the tap (or the seed). */
  accepted_at: string;
  /** `ride_ftp_estimated.value` at the moment of acceptance. */
  accepted_from: number;
  /** 'checkpoint' | 'baselines' | 'seed' — where the yes came from. */
  accepted_via?: string;
};

type LearnedFitnessLike = {
  ride_ftp_estimated?: LearnedMetricLike;
  ride_ftp_accepted?: (Partial<AcceptedFtp> & { value?: number | string | null }) | null;
} | null | undefined;

export type FtpPreference = 'learned' | 'manual';

type PerformanceNumbersLike = {
  ftp?: number | string | null;
  /** Q-240: which number the athlete asked for. Absent = no choice made = historical precedence. */
  ftp_source?: FtpPreference | string | null;
} | null | undefined;

/**
 * Permissive input shape — consumers across the codebase carry baselines in slightly
 * different forms (full `user_baselines` row, just the JSONB columns, AthleteState slices).
 * Accept anything with the two relevant shapes; consumers that only have a partial pass
 * `{ learned_fitness }` or `{ performance_numbers }` and the missing half is treated as null.
 */
export type BaselinesLike = {
  learned_fitness?: LearnedFitnessLike;
  performance_numbers?: PerformanceNumbersLike;
} | null | undefined;

const NULL_RESULT: ResolvedFtp = { value: null, source: null };

function asPositiveFinite(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isConfident(confidence: unknown): boolean {
  const c = String(confidence ?? '').toLowerCase();
  return c === 'medium' || c === 'high';
}

export function resolveCurrentFtp(baselines: BaselinesLike): ResolvedFtp {
  if (!baselines) return NULL_RESULT;

  const estimatedRaw = baselines.learned_fitness?.ride_ftp_estimated;
  const estimatedValue = asPositiveFinite(estimatedRaw?.value);
  const estimatedHighEnough = isConfident(estimatedRaw?.confidence);

  // THE ACCEPTED NUMBER. Only ever written from a medium/high estimate (checkpoint accept, Baselines
  // accept, or the one-time seed), so it is 'learned' by construction; its stored confidence is the
  // estimate's at the time and is not re-checked here — the athlete said yes to it.
  const acceptedValue = asPositiveFinite(baselines.learned_fitness?.ride_ftp_accepted?.value);

  // What "auto" means: the accepted number if there is one, else the live estimate as before.
  const learnedValue = acceptedValue ?? estimatedValue;
  const learnedHighEnough = acceptedValue != null ? true : estimatedHighEnough;

  const manualValue = asPositiveFinite(baselines.performance_numbers?.ftp);

  // TIER 0 — the athlete's stored choice wins, including over a high-confidence learned estimate.
  const preference = String(baselines.performance_numbers?.ftp_source ?? '').toLowerCase();
  if (preference === 'manual' && manualValue) {
    return { value: manualValue, source: 'manual' };
  }
  if (preference === 'learned' && learnedValue) {
    // The source label still reports the CONFIDENCE, not the preference — quality-gated consumers
    // (race projections, plan materialization) must still be able to opt out of a low-confidence
    // number. Choosing "auto" asks for the learned value; it does not upgrade what it is worth.
    return { value: learnedValue, source: learnedHighEnough ? 'learned' : 'learned-low' };
  }

  if (learnedValue && learnedHighEnough) {
    return { value: learnedValue, source: 'learned' };
  }
  if (manualValue) {
    return { value: manualValue, source: 'manual' };
  }
  if (learnedValue) {
    return { value: learnedValue, source: 'learned-low' };
  }
  return NULL_RESULT;
}

export type FtpProposal = {
  /** The live estimate the athlete has not accepted yet. */
  measured: number;
  /** The number the app is running on right now (the accepted value). */
  applied: number;
  confidence: string;
};

/**
 * The measured FTP the athlete has not said yes to — or null when there is nothing to accept.
 *
 * Null when: no estimate; estimate below medium confidence (learned-low never proposes); no accepted
 * value on file (the estimate already applies — see tier 1); the athlete is on "my number" with a
 * number behind it (the estimate is not theirs to accept); or the estimate equals the accepted value.
 * Both values are compared after rounding to the watt — the screen prints whole watts and must not
 * show `167 · measured 167 · use it`.
 */
export function pendingFtpProposal(baselines: BaselinesLike): FtpProposal | null {
  if (!baselines) return null;
  const estimatedRaw = baselines.learned_fitness?.ride_ftp_estimated;
  const measured = asPositiveFinite(estimatedRaw?.value);
  if (measured == null || !isConfident(estimatedRaw?.confidence)) return null;
  const applied = asPositiveFinite(baselines.learned_fitness?.ride_ftp_accepted?.value);
  if (applied == null) return null;
  const preference = String(baselines.performance_numbers?.ftp_source ?? '').toLowerCase();
  if (preference === 'manual' && asPositiveFinite(baselines.performance_numbers?.ftp)) return null;
  if (Math.round(measured) === Math.round(applied)) return null;
  return { measured, applied, confidence: String(estimatedRaw?.confidence ?? '').toLowerCase() };
}

/**
 * The learned metric the app is running on — accepted if present, else the estimate. For the few
 * readers that need the metric object (confidence, as-of) rather than the resolved watt number:
 * State's bike anchor and the tri generator's seed. Same precedence as tier 1, one place.
 */
export function appliedLearnedFtp(learned: LearnedFitnessLike): LearnedMetricLike | null {
  const accepted = learned?.ride_ftp_accepted;
  if (asPositiveFinite(accepted?.value) != null) return accepted as LearnedMetricLike;
  const estimated = learned?.ride_ftp_estimated ?? null;
  return asPositiveFinite(estimated?.value) != null ? estimated : null;
}

/**
 * THE ONE WRITE. Returns a new `learned_fitness` object with `ride_ftp_accepted` set from the live
 * estimate, or null when there is nothing to accept (no estimate, or below medium confidence —
 * learned-low never proposes, so it can never be accepted either). Both accept surfaces (the week-6
 * checkpoint and the Baselines bike row) call this and write the result back; neither reads the raw
 * column itself. Callers re-read `learned_fitness` immediately before calling so a learner run in
 * between is not clobbered.
 */
export function acceptEstimatedFtp(
  learned: Record<string, unknown> | null | undefined,
  via: 'checkpoint' | 'baselines',
  now: Date = new Date(),
): Record<string, unknown> | null {
  if (!learned || typeof learned !== 'object') return null;
  const est = (learned as { ride_ftp_estimated?: LearnedMetricLike }).ride_ftp_estimated;
  const value = asPositiveFinite(est?.value);
  if (value == null || !isConfident(est?.confidence)) return null;
  return {
    ...learned,
    ride_ftp_accepted: { ...est, value, accepted_at: now.toISOString(), accepted_from: value, accepted_via: via },
  };
}
