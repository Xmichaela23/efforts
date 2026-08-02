/**
 * Shared resolver for the athlete's current cycling FTP. Single source of truth across
 * every consumer that needs "what's the athlete's current FTP" — replaces 8 different
 * ad-hoc `||` / `??` fallback chains that previously chose differently per consumer
 * (manual-then-learned in some, learned-then-manual in others, manual-only with hardcoded
 * 300W default in send-workout-to-garmin, learned-only-with-confidence-gate in others).
 *
 * Precedence:
 *   0. performance_numbers.ftp_source — THE ATHLETE'S CHOICE, and it outranks everything below.
 *   1. learned_fitness.ride_ftp_estimated.value if confidence ∈ {medium, high}  → 'learned'
 *   2. performance_numbers.ftp if present (>0)                                    → 'manual'
 *   3. learned_fitness.ride_ftp_estimated.value (any confidence, fallback)        → 'learned-low'
 *   4. otherwise                                                                  → null
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

type LearnedFitnessLike = {
  ride_ftp_estimated?: {
    value?: number | string | null;
    confidence?: 'low' | 'medium' | 'high' | string | null;
  } | null;
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

export function resolveCurrentFtp(baselines: BaselinesLike): ResolvedFtp {
  if (!baselines) return NULL_RESULT;

  const learnedRaw = baselines.learned_fitness?.ride_ftp_estimated;
  const learnedValue = asPositiveFinite(learnedRaw?.value);
  const learnedConfidence = String(learnedRaw?.confidence ?? '').toLowerCase();
  const learnedHighEnough = learnedConfidence === 'medium' || learnedConfidence === 'high';

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
