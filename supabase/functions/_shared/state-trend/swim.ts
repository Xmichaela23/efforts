// Swim adapter — pace per 100 (sec/100m, lower = faster = improving). Same source-agnostic
// shape as bike/run. ⚠️ Q-038: swim ingest has a wrong-analyzer + duration-unit bug, so the
// stored pace is unreliable for affected (FORM→Strava) swims. The source adapter drops
// implausible points defensively; in practice swim mostly returns needs_data → adherence.
//
// ⚠️ Thresholds are PROVISIONAL and Q-038-gated — see thresholds.ts. When Q-038 is fixed,
// the guard band can relax; the trend/threshold code does not change.

import type { TrendPoint, TrendResult } from './types.ts';
import { classifyTrend } from './classify.ts';
import { resolveThresholds } from './thresholds.ts';
import { isDeloadWeek } from './deload.ts';

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
  sessionsPerWeek: number,
  droppedImplausible = 0,
): SwimState {
  return {
    trend: classifyTrend(series, resolveThresholds('swim', sessionsPerWeek), asOf, { exclude: isDeloadWeek }),
    metricLabel: 'pace per 100',
    droppedImplausible,
  };
}

// ── D-194: rest-fraction trend (work:rest) ──────────────────────────────────────────────────
// The hybrid athlete's swim progress signal: "I'm resting less to cover the same distance" =
// moving time taking up more of the pool session over a block at similar yardage. lower = better.
//
// COMPARABLE-SESSION filter (don't compare a sprint set to a long aerobic swim): only swims within
// ±25% of the in-window MEDIAN distance feed the trend. Q-061 equipment/drill contamination is
// already excluded upstream (compute-snapshot / useStateTrends), so drill/kick high-rest sessions
// never reach here. Observe the trend; never diagnose why the rest was high.

export interface SwimRestState {
  trend: TrendResult;
  metricLabel: string; // "rest fraction"
  /** Rows dropped for being outside the comparable distance band (surfaced for honesty). */
  droppedOutOfBand: number;
}

const REST_MIN = 0.02; // < 2% rest ≈ a continuous open-water swim or a bad scalar — not a pool set
const REST_MAX = 0.80; // > 80% rest isn't a swim workout's work:rest — drop defensively

/** SOURCE ADAPTER: swim rest-fraction rows → {date,value}[], keeping only comparable-distance swims. */
export function swimRestToSeries(
  rows: Array<{ date?: string; rest_fraction?: number | null; distance_m?: number | null }> | null | undefined,
): { series: TrendPoint[]; dropped: number } {
  if (!Array.isArray(rows)) return { series: [], dropped: 0 };
  const valid = rows.filter((r) => {
    const rf = Number(r.rest_fraction);
    return r.date && Number(r.distance_m) > 0 && Number.isFinite(rf) && rf >= REST_MIN && rf <= REST_MAX;
  });
  if (!valid.length) return { series: [], dropped: 0 };
  const dists = valid.map((r) => Number(r.distance_m)).sort((a, b) => a - b);
  const median = dists[Math.floor(dists.length / 2)];
  const lo = median * 0.75, hi = median * 1.25;
  let dropped = 0;
  const series: TrendPoint[] = [];
  for (const r of valid) {
    const d = Number(r.distance_m);
    if (d < lo || d > hi) { dropped++; continue; } // outside the comparable distance band
    series.push({ date: r.date!, value: Number(r.rest_fraction) });
  }
  return { series, dropped };
}

export function computeSwimRestState(
  series: TrendPoint[],
  asOf: string,
  sessionsPerWeek: number,
  droppedOutOfBand = 0,
): SwimRestState {
  return {
    // Same gates as pace (min-session, staleness, dead-band). lowerIsBetter (rest shrinking = better)
    // is already true in the swim threshold config, so the swim thresholds apply unchanged.
    trend: classifyTrend(series, resolveThresholds('swim', sessionsPerWeek), asOf, { exclude: isDeloadWeek }),
    metricLabel: 'rest fraction',
    droppedOutOfBand,
  };
}
