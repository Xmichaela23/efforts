// Run adapter — GAP pace at comparable effort. Mirrors bike.ts: a source adapter maps the
// stored metric into the source-agnostic {date,value}[], then the shared primitive classifies.
// Metric is sec/km (lower = faster = improving) → RUN_THRESHOLDS.lowerIsBetter.
//
// ⚠️ Thresholds are PROVISIONAL (not signed off) — see thresholds.ts.

import type { TrendPoint, TrendResult } from './types';
import { classifyTrend } from './classify';
import { RUN_THRESHOLDS } from './thresholds';
import { isDeloadWeek } from './deload';

export interface RunState {
  trend: TrendResult;
  metricLabel: string; // "GAP pace at comparable effort"
}

/**
 * SOURCE ADAPTER: `route_progress_metrics` rows → {date,value}[]. Value is
 * `effort_adjusted_pace_sec_per_km` (GAP pace). Caller must pre-filter to comparable-effort
 * (easy/aerobic intent) rows per D-106's strict-intent rule — this adapter just maps shape.
 */
export function routeMetricsToSeries(
  rows: Array<{ date?: string; metric_date?: string; effort_adjusted_pace_sec_per_km?: number | null }> | null | undefined,
): TrendPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ date: r.date ?? r.metric_date ?? '', value: Number(r.effort_adjusted_pace_sec_per_km) }))
    .filter((p) => p.date && Number.isFinite(p.value) && p.value > 0);
}

export function computeRunState(series: TrendPoint[], asOf: string): RunState {
  return {
    trend: classifyTrend(series, RUN_THRESHOLDS, asOf, { exclude: isDeloadWeek }),
    metricLabel: 'GAP pace at comparable effort',
  };
}
