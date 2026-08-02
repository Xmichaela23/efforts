/**
 * HOW LONG WAS THIS SESSION PLANNED TO BE — one answer, for every consumer.
 *
 * ⛔ WHY THIS EXISTS (2026-08-01). Two different surfaces asked that question and each looked in one
 * place, so an UNSTRUCTURED session — "~108 min easy, all conversational", no steps — was invisible to
 * both, in different ways:
 *   · `auto-attach-planned` summed the STEPS, found none, and refused to attach a ride to its own
 *     planned Long Ride. Every unstructured endurance session in the app was unattachable.
 *   · `analyze-cycling-workout` summed the STEPS, found none, and scored duration adherence 0 — so a
 *     64-of-108-minute ride reported 0% executed instead of 59%.
 * Meanwhile `analyze-running-workout` read `computed.total_duration_seconds` and worked. Three
 * readers, three answers, one fact.
 *
 * The order below is "most specific statement of the session's length" first: explicit steps beat a
 * total, because steps are what the athlete was actually told to do.
 *
 * ⛔ SHARED = DEPLOY TRAP. Every function importing this must be redeployed when it changes:
 *     grep -rln "planned-duration" supabase/functions
 */

/** Seconds a planned session's STEPS add up to, or null when it has none. */
export function plannedStepSeconds(planned: any): number | null {
  const steps = Array.isArray(planned?.computed?.steps)
    ? planned.computed.steps
    : (Array.isArray(planned?.intervals) ? planned.intervals : []);
  let sec = 0;
  for (const st of steps) {
    const s = Number(st?.seconds ?? st?.duration ?? st?.duration_sec ?? st?.durationSeconds ?? st?.timeSeconds);
    if (Number.isFinite(s) && s > 0) sec += s;
  }
  return sec > 0 ? sec : null;
}

/**
 * The planned session's total length in seconds, or null if it never stated one.
 * Steps → computed.total_duration_seconds → the total_duration_seconds column → the `duration` column.
 *
 * ⚠️ `duration` is MINUTES (verified against a real row: 108 on a "~108 min easy" ride). The >=1000
 * guard covers legacy rows that stored seconds there — the same heuristic `auto-attach-planned`
 * already applies to `workouts.moving_time`.
 */
export function resolvePlannedDurationSeconds(planned: any): number | null {
  const fromSteps = plannedStepSeconds(planned);
  if (fromSteps != null) return fromSteps;

  const computedTotal = Number(planned?.computed?.total_duration_seconds);
  if (Number.isFinite(computedTotal) && computedTotal > 0) return Math.round(computedTotal);

  const columnTotal = Number(planned?.total_duration_seconds);
  if (Number.isFinite(columnTotal) && columnTotal > 0) return Math.round(columnTotal);

  const dur = Number(planned?.duration);
  if (Number.isFinite(dur) && dur > 0) return Math.round(dur < 1000 ? dur * 60 : dur);

  return null;
}
