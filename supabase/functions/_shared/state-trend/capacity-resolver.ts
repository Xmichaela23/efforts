// Canonical Capacity Resolver (D-231). THE single answer to "how strong is this athlete for lift X."
//
// Precedence (ratified in D-231, consistent with D-213 "user is SSOT / retire the forks"):
//   1. Typed `performance_numbers` is the ANCHOR — it wins whenever present. It is what the plan
//      already PRESCRIBES off (materialize-plan mergeAnchor1RmLb) and it MUST be what judgement
//      (the coach) uses too. This collapses the flagship 150-vs-125 inversion.
//   2. Learned `learned_fitness.strength_1rms` FILLS GAPS (only when no typed value exists) and
//      SURFACES DRIFT as a *suggestion* (never silently overrides typed). Gap-fill AND suggestion
//      both go through the trusted-aggregate gate (≥3 samples, ≥medium confidence, fresh) — the
//      same gate reconcile.ts uses, so a single stale session can never become "truth."
//   3. Raw `exercise_log.estimated_1rm` is NEVER truth — this resolver does not accept it.
//
// Both the prescribe path (materialize) and the judge path (coach strength per-lift verdict) call
// THIS function. Direct substrate reads for a capacity answer are forbidden going forward (D-231).
//
// This also OWNS strength-key canonicalization (D-224): callers pass any alias; the resolver maps
// to the one canonical key. Kills the per-consumer "OHP-into-the-void" alias fan the audit flagged.
//
// Scope note: this first cut resolves STRENGTH 1RM capacity (the athlete-visible bench-verdict
// target + the D-231 fixtures). Pace/FTP capacity is a documented extension seam (see resolvePace
// stub intent at the bottom) — same precedence, plus unit carriage (sec/km vs sec/mi).
//
// Refs: D-231, D-213, D-224, D-229, Q-106; reconcile.ts (the suggestion gate).

import {
  suggestBaselineUpdate,
  SUGGEST_FRESHNESS_DAYS,
  SUGGEST_MIN_SAMPLES,
  type LearnedAggregate,
  type BaselineSuggestion,
} from './reconcile.ts';

/** The five canonical strength keys (D-224 write canon + D-229 pull-ups). */
export type CanonicalLiftKey = 'squat' | 'bench' | 'deadlift' | 'overheadPress1RM' | 'pullupMaxReps';

const CANONICAL_KEYS: readonly CanonicalLiftKey[] = ['squat', 'bench', 'deadlift', 'overheadPress1RM', 'pullupMaxReps'];

/**
 * Map ANY alias a reader might carry → the one canonical typed key, or null if it isn't a lift.
 * This is the single canonicalizer D-231 calls for; do not re-alias at call sites.
 */
export function canonicalizeLiftKey(k: string): CanonicalLiftKey | null {
  if (!k) return null;
  const s = String(k).trim();
  const lower = s.toLowerCase();
  if (lower === 'overhead' || lower === 'ohp' || lower === 'overhead_press' || lower === 'overheadpress' || lower === 'overheadpress1rm') return 'overheadPress1RM';
  if (lower === 'pullup' || lower === 'pull_up' || lower === 'pullups' || lower === 'pull_ups' || lower === 'pullupmaxreps' || lower === 'pull-up') return 'pullupMaxReps';
  if (lower === 'bench' || lower === 'bench_press' || lower === 'benchpress' || lower === 'bench1rm') return 'bench';
  if (lower === 'squat' || lower === 'squat1rm' || lower === 'back_squat' || lower === 'backsquat') return 'squat';
  if (lower === 'deadlift' || lower === 'deadlift1rm' || lower === 'dead_lift') return 'deadlift';
  return (CANONICAL_KEYS as readonly string[]).includes(s) ? (s as CanonicalLiftKey) : null;
}

/** Canonical typed key → the `learned_fitness.strength_1rms` key. Pull-ups have no learned e1RM (D-229, rep-based). */
const TYPED_TO_LEARNED: Record<CanonicalLiftKey, string | null> = {
  squat: 'squat',
  bench: 'bench_press',
  deadlift: 'deadlift',
  overheadPress1RM: 'overhead_press',
  pullupMaxReps: null,
};

const LABELS: Record<CanonicalLiftKey, string> = {
  squat: 'Squat',
  bench: 'Bench Press',
  deadlift: 'Deadlift',
  overheadPress1RM: 'Overhead Press',
  pullupMaxReps: 'Pull-ups',
};

export type CapacitySource = 'typed' | 'learned_gapfill' | 'none';

export interface CapacityResolution {
  /** the canonical lift this answer is for */
  key: CanonicalLiftKey;
  /** THE canonical capacity value (lb for 1RM lifts; clean reps for pull-ups). null = genuinely no trustworthy answer. */
  value: number | null;
  /** where `value` came from. Never 'raw' — raw is not truth. */
  source: CapacitySource;
  /** true when `value` is a learned gap-fill (no typed anchor) — callers should render it as provisional. */
  provisional: boolean;
  /** true when a typed anchor exists but trusted+fresh logged evidence has moved past it (drives the suggestion nudge). */
  typedStale: boolean;
  /** learned-drift suggestion (typed present + gated divergence). NEVER auto-applied — display/confirm only. */
  suggestion: BaselineSuggestion | null;
}

/** Coerce a `learned_fitness.strength_1rms[key]` entry into the reconcile LearnedAggregate shape. */
function toLearnedAggregate(entry: any): LearnedAggregate | null {
  if (!entry || !Number.isFinite(Number(entry.value)) || Number(entry.value) <= 0) return null;
  return {
    value: Number(entry.value),
    confidence: entry.confidence,
    sample_count: Number(entry.sample_count),
    last_logged: entry.last_logged ?? null,
  };
}

function daysBetween(newerISO: string, olderISO: string): number | null {
  const a = Date.parse(String(newerISO).length <= 10 ? newerISO + 'T12:00:00Z' : newerISO);
  const b = Date.parse(String(olderISO).length <= 10 ? olderISO + 'T12:00:00Z' : olderISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

/** A learned aggregate is TRUSTWORTHY enough to gap-fill: ≥3 samples, ≥medium confidence, fresh. Mirrors reconcile GATE 1+2. */
function isTrustedAggregate(agg: LearnedAggregate | null, asOf: string): boolean {
  if (!agg) return false;
  if (Number(agg.sample_count) < SUGGEST_MIN_SAMPLES) return false;
  if (agg.confidence !== 'medium' && agg.confidence !== 'high') return false;
  if (agg.last_logged) {
    const age = daysBetween(asOf, String(agg.last_logged));
    if (age != null && age > SUGGEST_FRESHNESS_DAYS) return false;
  }
  return true;
}

/**
 * Resolve the canonical strength capacity for one lift. Pure — pass `asOf` (today ISO); no clock read.
 * `typed` = performance_numbers; `learnedStrength1rms` = learned_fitness.strength_1rms.
 * `typedAsOf` = when the typed baseline row was last written (user_baselines.updated_at). Per-lift typed
 * timestamps do not exist in the schema, so this is row-level/coarse — it can only tell us the typed
 * anchor is OLDER than fresh logged evidence, never which specific lift was retested when. (See Q-109-adjacent note.)
 */
export function resolveStrengthCapacity(args: {
  key: string;
  typed: Record<string, any> | null | undefined;
  learnedStrength1rms: Record<string, any> | null | undefined;
  asOf: string;
  typedAsOf?: string | null;
  label?: string;
}): CapacityResolution {
  const canon = canonicalizeLiftKey(args.key);
  if (!canon) {
    // Not a recognized lift — cannot answer. (key echoed as-is is impossible here; use a stable placeholder.)
    return { key: 'bench', value: null, source: 'none', provisional: false, typedStale: false, suggestion: null };
  }

  const label = args.label ?? LABELS[canon];
  const rawTyped = args.typed?.[canon];
  // Pull-ups: 0 is a VALID typed value ("goal: your first pull-up", D-229). Weight lifts require > 0.
  const typedNum = Number(rawTyped);
  const hasTyped =
    Number.isFinite(typedNum) && (canon === 'pullupMaxReps' ? typedNum >= 0 : typedNum > 0);

  const learnedKey = TYPED_TO_LEARNED[canon];
  const learnedAgg = learnedKey ? toLearnedAggregate(args.learnedStrength1rms?.[learnedKey]) : null;

  if (hasTyped) {
    // Typed is the anchor — it IS the value. Learned only surfaces drift as a suggestion.
    const suggestion = suggestBaselineUpdate({
      key: canon,
      label,
      baseline: typedNum,
      learned: learnedAgg,
      asOf: args.asOf,
    });
    // typedStale: trusted+fresh logged evidence exists AND the typed row predates it.
    let typedStale = false;
    if (suggestion && learnedAgg?.last_logged && args.typedAsOf) {
      const lag = daysBetween(String(learnedAgg.last_logged), String(args.typedAsOf));
      typedStale = lag != null && lag > 0;
    }
    return { key: canon, value: typedNum, source: 'typed', provisional: false, typedStale, suggestion };
  }

  // No typed anchor — gap-fill from a TRUSTED learned aggregate only. Untrusted → no answer (never trust raw-ish noise).
  if (learnedAgg && isTrustedAggregate(learnedAgg, args.asOf)) {
    return {
      key: canon,
      value: Math.round(learnedAgg.value),
      source: 'learned_gapfill',
      provisional: true,
      typedStale: false,
      suggestion: null,
    };
  }

  return { key: canon, value: null, source: 'none', provisional: false, typedStale: false, suggestion: null };
}

// EXTENSION SEAM (D-231 item 5): resolvePaceCapacity(discipline) — same precedence (typed
// performance_numbers anchor, learned_fitness paces fill/suggest), PLUS unit carriage so the
// sec/km-vs-sec/mi footgun (CLAUDE.md) is resolved in ONE place instead of per-consumer. Not built
// in this cut — the strength verdict is the athlete-visible target. Kept as a named boundary so the
// next reader knows where pace resolution belongs.
