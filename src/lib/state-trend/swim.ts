// Swim adapter — pace per 100 (sec/100m, lower = faster = improving). Same source-agnostic
// shape as bike/run. ⚠️ Q-038: swim ingest has a wrong-analyzer + duration-unit bug, so the
// stored pace is unreliable for affected (FORM→Strava) swims. The source adapter drops
// implausible points defensively; in practice swim mostly returns needs_data → adherence.
//
// ⚠️ Thresholds are PROVISIONAL and Q-038-gated — see thresholds.ts. When Q-038 is fixed,
// the guard band can relax; the trend/threshold code does not change.

import type { TrendPoint, TrendResult } from './types';
import { classifyTrend } from './classify';
import { SWIM_THRESHOLDS } from './thresholds';
import { isDeloadWeek } from './deload';

export interface SwimState {
  trend: TrendResult;
  metricLabel: string; // "pace per 100"
  /** How many raw points were dropped as Q-038-implausible (surfaced for honesty/debugging). */
  droppedImplausible: number;
}

// Plausible lap-swim pace band: 0:40–4:00 per 100m. Outside this is Q-038 corruption
// (e.g. a duration-unit bug inflating pace into the thousands), not a real swim.
const MIN_PACE_S = 40;
const MAX_PACE_S = 240;

/** SOURCE ADAPTER: swim pace rows → {date,value}[], dropping Q-038-implausible points. */
export function swimPaceToSeries(
  rows: Array<{ date?: string; pace_per_100m?: number | null }> | null | undefined,
): { series: TrendPoint[]; dropped: number } {
  if (!Array.isArray(rows)) return { series: [], dropped: 0 };
  let dropped = 0;
  const series: TrendPoint[] = [];
  for (const r of rows) {
    const value = Number(r.pace_per_100m);
    if (!r.date || !Number.isFinite(value) || value <= 0) continue;
    if (value < MIN_PACE_S || value > MAX_PACE_S) { dropped++; continue; }
    series.push({ date: r.date, value });
  }
  return { series, dropped };
}

export function computeSwimState(
  series: TrendPoint[],
  asOf: string,
  droppedImplausible = 0,
): SwimState {
  return {
    trend: classifyTrend(series, SWIM_THRESHOLDS, asOf, { exclude: isDeloadWeek }),
    metricLabel: 'pace per 100',
    droppedImplausible,
  };
}
