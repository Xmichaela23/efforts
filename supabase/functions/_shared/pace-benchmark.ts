/**
 * Is there a run pace on file that a speed goal can be written against?
 *
 * ONE rule with two readers: the create-goal gate (`missing_pace_benchmark`) and the intake, which
 * gets the answer from get-arc-context as `builder.has_pace_benchmark`. It used to be two copies — the
 * server's inline check and the phone's `hasPaceBenchmark` — and they disagreed: the phone wanted a
 * plain number where learned paces are stored as `{ value, confidence }`, so an athlete whose only
 * pace was learned was asked to calibrate when the server would have built.
 *
 * Any one signal is enough: a race time (distance and time), an effort score, a race pace in
 * `effort_paces`, or a learned run threshold or easy pace at medium or high confidence.
 */

export type PaceBenchmarkBaseline = {
  effort_score?: unknown;
  effort_source_distance?: unknown;
  effort_source_time?: unknown;
  effort_paces?: { race?: unknown } | null;
  learned_fitness?: unknown;
} | null | undefined;

function parseLearnedFitness(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return typeof o === 'object' && o && !Array.isArray(o) ? o as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

/** A learned pace counts at `medium` or `high` confidence with a positive value (not `low` or missing). */
function learnedPaceUsable(m: unknown): boolean {
  if (!m || typeof m !== 'object') return false;
  const c = String((m as { confidence?: string }).confidence || '').toLowerCase();
  if (c !== 'medium' && c !== 'high') return false;
  const v = Number((m as { value?: number }).value);
  return Number.isFinite(v) && v > 0;
}

export function hasPaceBenchmark(baseline: PaceBenchmarkBaseline): boolean {
  const hasRaceTime = !!baseline?.effort_source_distance && !!baseline?.effort_source_time;
  const hasEffortScore = !!baseline?.effort_score;
  const hasThresholdPace = !!baseline?.effort_paces?.race;
  const learned = parseLearnedFitness(baseline?.learned_fitness);
  const hasLearnedRunPace = learnedPaceUsable(learned.run_threshold_pace_sec_per_km)
    || learnedPaceUsable(learned.run_easy_pace_sec_per_km);
  return hasRaceTime || hasEffortScore || hasThresholdPace || hasLearnedRunPace;
}
