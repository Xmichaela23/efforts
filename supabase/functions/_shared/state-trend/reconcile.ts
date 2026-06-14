// Hybrid suggest-with-confirm (Step 1, Part 2 — "reconcile the senses"). When the COMPUTED
// fitness aggregate diverges from the athlete's typed baseline, surface a SUGGESTION to update
// — never auto-apply. The gate (Michael-approved 2026-06-14) sources ONLY from the trusted
// learned aggregate, so a single stale session can never drive a suggestion: the
// deadlift-175-from-one-Feb-session is structurally gated out (its learned aggregate is null or
// thin, never a ≥3-sample medium-confidence value). Display/synthesis + a user-confirmed write;
// NOT prescription. Refs: docs/AUDIT-truth-reconciliation-2026-06-14.md.

/** Shape of a learned-fitness aggregate (strength_1rms[lift], swim_pace_per_100m, …). */
export interface LearnedAggregate {
  value: number;
  confidence: 'low' | 'medium' | 'high';
  sample_count: number;
  last_logged?: string | null; // present for strength; absent for swim (90d-windowed → implicitly recent)
}

export interface BaselineSuggestion {
  key: string; // e.g. 'bench' / 'swimPace100'
  label: string; // display label
  baseline: number; // the typed value (caller-normalized units)
  computed: number; // the learned aggregate value (same units as baseline)
  divergencePct: number; // signed % vs baseline
  confidence: 'medium' | 'high';
  sampleCount: number;
}

// Gate constants (Michael-approved). Suggest only from a TRUSTED, RECENT aggregate that
// MEANINGFULLY diverges.
export const SUGGEST_MIN_SAMPLES = 3; // ≥3 sessions in the aggregate
export const SUGGEST_MIN_DIVERGENCE_PCT = 5; // ≥5% gap from the typed baseline
export const SUGGEST_FRESHNESS_DAYS = 42; // aggregate's newest session within ~6 weeks

function ageDays(dateISO: string, asOf: string): number | null {
  const a = Date.parse(asOf + 'T12:00:00Z');
  const b = Date.parse(dateISO + 'T12:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

/**
 * Returns a baseline-update suggestion ONLY when the learned aggregate is trustworthy AND
 * diverges meaningfully. `baseline` and `learned.value` must be in the SAME units (the caller
 * converts, e.g. swim s/100m → s/100yd). Never reads raw per-session e1RM — that is what keeps
 * a single stale session (deadlift 175 from one Feb session) from ever producing a suggestion.
 */
export function suggestBaselineUpdate(args: {
  key: string;
  label: string;
  baseline: number | null | undefined;
  learned: LearnedAggregate | null | undefined;
  asOf: string;
}): BaselineSuggestion | null {
  const baseline = Number(args.baseline);
  const learned = args.learned;
  if (!learned || !Number.isFinite(baseline) || baseline <= 0) return null;

  const computed = Number(learned.value);
  if (!Number.isFinite(computed) || computed <= 0) return null;

  // GATE 1 — trusted aggregate: ≥3 samples AND ≥medium confidence.
  if (Number(learned.sample_count) < SUGGEST_MIN_SAMPLES) return null;
  if (learned.confidence !== 'medium' && learned.confidence !== 'high') return null;

  // GATE 2 — freshness: if the aggregate carries a last-logged date, it must be recent. (Swim's
  // aggregate has no date but is computed over a 90d window, so absence ≠ stale — don't block.)
  if (learned.last_logged) {
    const age = ageDays(String(learned.last_logged), args.asOf);
    if (age != null && age > SUGGEST_FRESHNESS_DAYS) return null;
  }

  // GATE 3 — meaningful divergence (≥5%).
  const divergencePct = Math.round(((computed - baseline) / baseline) * 1000) / 10;
  if (Math.abs(divergencePct) < SUGGEST_MIN_DIVERGENCE_PCT) return null;

  return {
    key: args.key,
    label: args.label,
    baseline: Math.round(baseline),
    computed: Math.round(computed),
    divergencePct,
    confidence: learned.confidence,
    sampleCount: Number(learned.sample_count),
  };
}
