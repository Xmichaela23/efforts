/**
 * Shared resolver for the athlete's current cycling FTP. Single source of truth across
 * every consumer that needs "what's the athlete's current FTP" — replaces 8 different
 * ad-hoc `||` / `??` fallback chains that previously chose differently per consumer
 * (manual-then-learned in some, learned-then-manual in others, manual-only with hardcoded
 * 300W default in send-workout-to-garmin, learned-only-with-confidence-gate in others).
 *
 * Precedence (3-tier per user decision 2026-05-13):
 *   1. learned_fitness.ride_ftp_estimated.value if confidence ∈ {medium, high}  → 'learned'
 *   2. performance_numbers.ftp if present (>0)                                    → 'manual'
 *   3. learned_fitness.ride_ftp_estimated.value (any confidence, fallback)        → 'learned-low'
 *   4. otherwise                                                                  → null
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

type PerformanceNumbersLike = {
  ftp?: number | string | null;
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
