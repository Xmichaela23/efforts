/**
 * Cycling analysis-mode detection — Build Order #2 of
 * docs/CYCLING-ANALYSIS-DESIGN.md ("Immediate, no new infrastructure").
 *
 * Classifies a ride so downstream analysis (TREND series selection, narrative
 * framing) can grade against the right intent:
 *
 *   plan_linked            — a prescribed session was linked (Mode 1)
 *   unplanned_with_segments — no prescription, but Strava segment efforts exist (Mode 3)
 *   unplanned_no_segments   — no prescription, no segments (Mode 2)
 *
 * Mode 4 (race-course segments) intentionally FOLDS INTO unplanned_with_segments
 * here: race-course geometry matching is Build Order #8 (skipped — depends on
 * segment ingestion #6, which is blocked by the doc's open table-vs-analysis
 * design question). Until #8 lands, a race-course ride is indistinguishable from
 * any other segment ride and is treated as Mode 3. Documented conservative choice.
 *
 * Pure + input-explicit so both analyze-cycling-workout (factPacket + achievements
 * column) and session-detail/build.ts (workout_analysis) can call it without
 * coupling to row shapes.
 */

export type CyclingAnalysisMode =
  | 'plan_linked'
  | 'unplanned_with_segments'
  | 'unplanned_no_segments';

/**
 * Parse the (JSON-stringified) `workouts.achievements` column and return the
 * Strava segment-effort count. Garmin rides have no segment_efforts → 0 (the
 * Strava↔Garmin gap, the doc's primary architectural constraint). Tolerant of
 * an already-parsed object, a JSON string, or null/garbage.
 */
export function segmentEffortCount(achievements: unknown): number {
  let a: any = achievements;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      return 0;
    }
  }
  const arr = a && Array.isArray(a.segment_efforts) ? a.segment_efforts : [];
  return arr.length;
}

export function classifyCyclingAnalysisMode(input: {
  /** CyclingFactPacketV1.facts.plan_intent — non-null/non-'unknown' = prescribed. */
  planIntent?: string | null;
  /** Count from segmentEffortCount(workouts.achievements). */
  segmentEffortCount?: number | null;
}): CyclingAnalysisMode {
  const pi = typeof input.planIntent === 'string' ? input.planIntent.trim().toLowerCase() : '';
  // A real prescribed intent = plan-linked. 'unknown' is the analyzer's
  // not-prescribed sentinel, so it does NOT count as plan-linked.
  if (pi && pi !== 'unknown') return 'plan_linked';
  const segs = Number(input.segmentEffortCount);
  if (Number.isFinite(segs) && segs >= 1) return 'unplanned_with_segments';
  return 'unplanned_no_segments';
}
