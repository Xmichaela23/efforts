/**
 * Resolve a ride's normalized power for the np_trend series.
 *
 * Ordered to MIRROR the codebase's canonical cycling-NP reader,
 * `compute-facts/index.ts:1124`:
 *
 *     normalized_power: w.normalized_power ?? analysis.power?.normalized_power ?? null
 *
 * i.e. the authoritative sources are the top-level `normalized_power` column and
 * `computed.analysis.power.normalized_power` (the latter is what
 * `compute-workout-analysis/index.ts:1391` actually writes for rides). The
 * remaining entries are defensive fallbacks for non-standard ingest shapes.
 *
 * History of this footgun (the resolver kept reading the wrong sub-object):
 *  - started as `computed.overall.normalized_power` (no `_w`) → fixed to add
 *    `_w` (235aabab)
 *  - broadened to top-level / metrics / weighted_average_watts (6afddd99)
 *  - STILL null on real data because `computed.overall.*` is never persisted
 *    back to `workouts.computed` (get-week:786 only sets it on its own response)
 *    and the resolver never looked at `computed.analysis.power.normalized_power`
 *    — the one place compute-workout-analysis actually writes it. Aligning to
 *    compute-facts:1124 (the established canonical reader) is the durable fix.
 *
 * Returns rounded NP watts, or null when no source holds a usable positive number.
 */
export function rideComputedNp(row: unknown): number | null {
  const r = (row ?? null) as any;
  if (!r || typeof r !== 'object') return null;
  const overall = r?.computed?.overall;
  const analysisPower = r?.computed?.analysis?.power;
  const candidates = [
    // Canonical pair — same order as compute-facts:1124.
    r?.normalized_power, // top-level column (w.normalized_power)
    analysisPower?.normalized_power, // computed.analysis.power.normalized_power
    // Defensive fallbacks for non-standard ingest / response shapes.
    overall?.normalized_power_w,
    overall?.normalized_power,
    r?.metrics?.normalized_power,
    r?.weighted_average_watts,
  ];
  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v) && v > 0) return Math.round(v);
  }
  return null;
}
