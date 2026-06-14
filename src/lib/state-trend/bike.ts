// Bike adapter — source-agnostic (architecture contract #4). The verdict/threshold code
// consumes an abstract {date,value}[]; the SOURCE is a swappable adapter. Today the source
// is pwr20_trend_v1 (best 20-min power, the physiological substrate of FTP). If an
// ftp_history table is built later, add a sibling source adapter and feed computeBikeState
// the same shape — nothing below changes.

import type { TrendPoint, TrendResult } from './types';
import { classifyTrend } from './classify';
import { BIKE_THRESHOLDS } from './thresholds';
import { isDeloadWeek } from './deload';

export interface BikeState {
  trend: TrendResult;
  metricLabel: string; // shown on STATE as "power at threshold"
  rideType: string | null; // pwr20 is filtered to one classified_type (e.g. "sweet spot")
}

/**
 * SOURCE ADAPTER: map pwr20_trend_v1.points → the source-agnostic {date,value}[].
 * `workout_analysis.pwr20_trend_v1 = { points: [{date, value, avg_hr, is_current}], classified_type }`.
 */
export function pwr20ToSeries(
  pwr20: { points?: Array<{ date: string; value: number }> } | null | undefined,
): TrendPoint[] {
  const pts = pwr20?.points;
  if (!Array.isArray(pts)) return [];
  return pts
    .filter((p) => p && typeof p.date === 'string' && Number.isFinite(p.value))
    .map((p) => ({ date: p.date, value: p.value }));
}

export function computeBikeState(
  series: TrendPoint[],
  asOf: string,
  rideType: string | null = null,
): BikeState {
  return {
    trend: classifyTrend(series, BIKE_THRESHOLDS, asOf, { exclude: isDeloadWeek }),
    metricLabel: 'power at threshold',
    rideType,
  };
}
