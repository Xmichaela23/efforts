// Run adapter — GAP pace at comparable effort. Mirrors bike.ts: a source adapter maps the
// stored metric into the source-agnostic {date,value}[], then the shared primitive classifies.
// Metric is sec/km (lower = faster = improving) → RUN_THRESHOLDS.lowerIsBetter.
//
// ⚠️ Thresholds are PROVISIONAL (not signed off) — see thresholds.ts.

import type { TrendPoint, TrendResult } from './types.ts';
import { classifyTrend } from './classify.ts';
import { resolveThresholds } from './thresholds.ts';
import { isDeloadWeek } from './deload.ts';

export interface RunState {
  trend: TrendResult;
  metricLabel: string; // "GAP pace at comparable effort"
}

/**
 * Comparable-effort classes for a GAP-pace trend (D-106 strict-intent): only aerobic `easy`
 * runs are comparable. steady_state / tempo / interval are different efforts and excluded.
 *
 * ⚠️ The intent gate reads `workout_analysis.classified_type`, NOT `route_progress_metrics.
 * workout_intent`. The audit found RPM.workout_intent is null at source (compute-facts:930
 * reads `computed.analysis.heart_rate.workout_type`, which is unpopulated), while the real
 * classification lives in `workout_analysis.classified_type` — where 5 of 11 runs read `easy`.
 * So the caller joins classified_type onto each row and this adapter filters on it.
 */
export const COMPARABLE_RUN_EFFORT = new Set(['easy']);
export const isComparableRunEffort = (classifiedType: unknown): boolean =>
  COMPARABLE_RUN_EFFORT.has(String(classifiedType || '').toLowerCase());

// Plausibility band for run GAP pace (sec/km): 2:30–12:30 min/km. Drops corrupt values — the
// audit found one easy run at 2280 s/km (38 min/km), which alone flipped the trend to a bogus
// "improving −66.7%". The root cause of such corrupt GAP values is upstream (compute-facts GAP
// computation), tracked separately; this guard keeps one bad row from poisoning the trend.
const MIN_RUN_PACE_S = 150;
const MAX_RUN_PACE_S = 750;

/**
 * SOURCE ADAPTER: `route_progress_metrics` rows (joined with `classified_type`) → {date,value}[].
 * Value is `effort_adjusted_pace_sec_per_km` (GAP pace); rows are filtered to comparable effort
 * AND to a plausible pace band (corrupt outliers dropped).
 */
export function routeMetricsToSeries(
  rows: Array<{ date?: string; metric_date?: string; effort_adjusted_pace_sec_per_km?: number | null; classified_type?: string | null }> | null | undefined,
): TrendPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => isComparableRunEffort(r.classified_type))
    .map((r) => ({ date: r.date ?? r.metric_date ?? '', value: Number(r.effort_adjusted_pace_sec_per_km) }))
    .filter((p) => p.date && Number.isFinite(p.value) && p.value >= MIN_RUN_PACE_S && p.value <= MAX_RUN_PACE_S);
}

export function computeRunState(series: TrendPoint[], asOf: string, sessionsPerWeek: number): RunState {
  return {
    trend: classifyTrend(series, resolveThresholds('run', sessionsPerWeek), asOf, { exclude: isDeloadWeek }),
    metricLabel: 'GAP pace at comparable effort',
  };
}
