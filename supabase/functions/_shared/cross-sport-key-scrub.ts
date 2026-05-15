/**
 * Cross-sport analysis-key scrub — Fix 1 for the "Cross-sport analysis-key bleed" bug
 * (see docs/MAINTENANCE-DEBT.md).
 *
 * Every `analyze-{sport}-workout` function merges into `workout_analysis` via
 * `{ ...existingAnalysis, ...analysisPayload }` (preserve cross-cutting fields by
 * design). The hole: when a workout was historically analyzed by the WRONG sport's
 * analyzer (mis-routed `type`, mis-classified `recompute-workout`/`bulk-reanalyze`),
 * that analyzer's sport-specific keys persist because the correct analyzer's payload
 * has no key to overwrite them. Display layers then render e.g. run pace-per-mile
 * copy on a ride.
 *
 * The fix is to make each analyzer explicitly null the foreign keys it can never
 * produce, so the spread-merge scrubs stale analysis instead of preserving it. This
 * module centralizes those key sets so (a) the scrub is unit-testable in isolation,
 * and (b) the follow-up generalization (swim/strength scrubs, run scrubbing
 * cycling-only keys) extends here rather than re-deriving the list per analyzer.
 *
 * Keys are nulled, not deleted, so the merged object shape stays stable for
 * consumers that destructure it.
 */

/**
 * Keys that ONLY `analyze-running-workout` produces. A cycling (or swim/strength)
 * analyzer spreads this to scrub stale run analysis. Sourced from the running
 * analyzer's `workout_analysis` update payload (analyze-running-workout/index.ts
 * ~2645-2672): the run-only subset that the cycling payload otherwise has no
 * corresponding key for.
 */
export function runOnlyKeyScrub(): {
  mile_by_mile_terrain: null;
  score_explanation: null;
  summary: null;
  classified_type: null;
  heart_rate_summary: null;
  recomputed_at: null;
} {
  return {
    mile_by_mile_terrain: null,
    score_explanation: null,
    summary: null,
    // cycling's classified_type lives at fact_packet_v1.facts.classified_type;
    // the top-level key is run-only.
    classified_type: null,
    heart_rate_summary: null,
    // running's freshness marker; cycling uses _meta.generated_at.
    recomputed_at: null,
  };
}

/** Stable list of the run-only keys, for assertions / iteration. */
export const RUN_ONLY_SCRUB_KEYS = [
  'mile_by_mile_terrain',
  'score_explanation',
  'summary',
  'classified_type',
  'heart_rate_summary',
  'recomputed_at',
] as const;
