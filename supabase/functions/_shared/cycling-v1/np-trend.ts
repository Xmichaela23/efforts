/**
 * Resolve a ride's normalized power for the np_trend series, mirroring the
 * cycling analyzer's own canonical NP resolution chain
 * (analyze-cycling-workout/index.ts:1786) so the trend sees NP wherever it
 * actually lives:
 *
 *   computed.overall.normalized_power_w   (canonical; `_w` footgun — see cead4e9e)
 *   ?? computed.overall.normalized_power  (legacy alias)
 *   ?? row.normalized_power               (top-level, common on ingested rides)
 *   ?? row.metrics.normalized_power
 *   ?? row.weighted_average_watts         (Garmin/Strava standard NP field)
 *
 * History: this started as only `computed.overall.normalized_power` (no `_w`) —
 * fixed to add `_w` (commit 235aabab). But the np_trend historical query selects
 * only `id, date, computed`, and many ingested rides carry NP in
 * `weighted_average_watts` / top-level `normalized_power`, NOT in
 * `computed.overall`. So the trend still came up short of the 3-point minimum
 * and the sparkline never rendered. Both this resolver AND the query's column
 * list must cover the full chain.
 *
 * Returns rounded NP watts, or null when no source holds a usable positive number.
 */
export function rideComputedNp(row: unknown): number | null {
  const r = (row ?? null) as any;
  if (!r || typeof r !== 'object') return null;
  const overall = r?.computed?.overall;
  const candidates = [
    overall?.normalized_power_w,
    overall?.normalized_power,
    r?.normalized_power,
    r?.metrics?.normalized_power,
    r?.weighted_average_watts,
  ];
  for (const c of candidates) {
    const v = Number(c);
    if (Number.isFinite(v) && v > 0) return Math.round(v);
  }
  return null;
}
