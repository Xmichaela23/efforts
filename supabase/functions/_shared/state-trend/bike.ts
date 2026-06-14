// Bike adapter — source-agnostic (architecture contract #4). The verdict/threshold code
// consumes an abstract {date,value}[]; the SOURCE is a swappable adapter. Today the source
// is pwr20_trend_v1 (best 20-min power, the physiological substrate of FTP). If an
// ftp_history table is built later, add a sibling source adapter and feed computeBikeState
// the same shape — nothing below changes.

import type { TrendPoint, TrendResult } from './types.ts';
import { classifyTrend } from './classify.ts';
import { resolveThresholds, windowDaysFor } from './thresholds.ts';
import { isDeloadWeek } from './deload.ts';

export interface BikeState {
  trend: TrendResult;
  metricLabel: string; // shown on STATE as "power at threshold"
  rideType: string | null; // pwr20 is filtered to one classified_type (e.g. "sweet spot")
}

/** A ride's pwr20_trend_v1 series. Each ride carries its own rolling series by classified_type. */
export interface Pwr20Series {
  points?: Array<{ date: string; value: number }>;
  classified_type?: string;
}

const MS_DAY = 86_400_000;
const windowStart = (asOf: string, days: number) =>
  new Date(Date.parse(asOf + 'T12:00:00Z') - days * MS_DAY).toISOString().slice(0, 10);

/**
 * SOURCE ADAPTER: map pwr20_trend_v1.points → the source-agnostic {date,value}[].
 * `workout_analysis.pwr20_trend_v1 = { points: [{date, value, avg_hr, is_current}], classified_type }`.
 */
export function pwr20ToSeries(pwr20: Pwr20Series | null | undefined): TrendPoint[] {
  const pts = pwr20?.points;
  if (!Array.isArray(pts)) return [];
  return pts
    .filter((p) => p && typeof p.date === 'string' && Number.isFinite(p.value))
    .map((p) => ({ date: p.date, value: p.value }));
}

/**
 * Pick the DENSEST CURRENT pwr20 series among candidate rides — NOT merely the latest. With
 * rides fragmented across classified_types, the most-recent ride's series is often sparse-
 * in-window (e.g. a lone endurance ride: 1 in-window point) while a slightly-older type
 * (climbing/threshold) holds a 5-point series. The type-filter sparsity itself is correct
 * (leave it); this just stops the adapter from landing on the thinnest series. Score by
 * in-window point count (BIKE window), tie → total points, tie → newest point date.
 */
export function pickBestPwr20(
  candidates: Array<Pwr20Series | null | undefined>,
  asOf: string,
): Pwr20Series | null {
  const start = windowStart(asOf, windowDaysFor('bike'));
  let best: Pwr20Series | null = null;
  let bestKey: [number, number, string] | null = null;
  for (const c of candidates) {
    if (!c || !Array.isArray(c.points) || c.points.length === 0) continue; // narrows c → Pwr20Series
    const pts = c.points;
    const inWin = pts.filter((p) => String(p.date) > start).length;
    const newest = pts.map((p) => String(p.date)).sort().pop() || '';
    const key: [number, number, string] = [inWin, pts.length, newest];
    const better =
      !bestKey ||
      key[0] > bestKey[0] ||
      (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
      (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2]);
    if (better) { bestKey = key; best = c; }
  }
  return best;
}

export function computeBikeState(
  series: TrendPoint[],
  asOf: string,
  sessionsPerWeek: number,
  rideType: string | null = null,
): BikeState {
  return {
    trend: classifyTrend(series, resolveThresholds('bike', sessionsPerWeek), asOf, { exclude: isDeloadWeek }),
    metricLabel: 'power at threshold',
    rideType,
  };
}
