/**
 * Resolve a ride's normalized power from its `computed.overall`, honoring the
 * codebase's NP field-name convention. The canonical key is `normalized_power_w`
 * — the cycling analyzer's own resolution chain tries it FIRST
 * (analyze-cycling-workout/index.ts:1786), and the same `_w` vs non-`_w` footgun
 * was fixed for the fact packet in commit cead4e9e. `normalized_power` (no `_w`)
 * is only a legacy/fallback alias.
 *
 * The np_trend historical loop originally read ONLY `normalized_power` (no `_w`),
 * so every ride written with the canonical `_w` key resolved to undefined → no
 * historical points → the series never reached the 3-point minimum → the cycling
 * TREND sparkline never rendered regardless of how many rides existed.
 *
 * Returns rounded NP watts, or null when neither key holds a usable positive number.
 */
export function rideComputedNp(row: unknown): number | null {
  const overall = (row as any)?.computed?.overall;
  if (!overall || typeof overall !== 'object') return null;
  const v = Number(overall.normalized_power_w ?? overall.normalized_power);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}
