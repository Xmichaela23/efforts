// Strength adapter — feeds per-lift e1RM series into the shared primitive and rolls the
// per-lift verdicts up to one discipline verdict.
//
// Architecture contract #2: "overall follows primary lifts" is the SIMPLE v1 roll-up, but
// the per-lift verdicts are returned as a LIST (not pre-collapsed), so a richer roll-up
// later is a change to `rollUp` alone — the trend layer below never moves.

import type { TrendPoint, TrendResult, TrendVerdict } from './types';
import { classifyTrend } from './classify';
import { STRENGTH_THRESHOLDS } from './thresholds';
import { isDeloadWeek } from './deload';

/** Per-lift dated e1RM series. value = estimated_1rm; meta.name carries the workout name (deload detect). */
export interface LiftSeries {
  canonical: string;
  displayName: string;
  points: TrendPoint[];
}

export interface LiftVerdict {
  canonical: string;
  displayName: string;
  isPrimary: boolean;
  trend: TrendResult;
}

export interface StrengthState {
  lifts: LiftVerdict[]; // structured per-lift, for display + a richer roll-up later
  overall: TrendVerdict;
  overallPctChange: number | null;
}

/**
 * Primary lifts that drive the overall verdict. Accessory anchors (hip_thrust,
 * barbell_row) are still tracked + shown per-lift but don't move the discipline verdict.
 * Swap this set — or replace `rollUp` — for a richer roll-up without touching `classifyTrend`.
 */
export const PRIMARY_LIFTS = new Set([
  'squat',
  'bench_press',
  'deadlift',
  'trap_bar_deadlift',
  'overhead_press',
]);

export function computeStrengthState(series: LiftSeries[], asOf: string): StrengthState {
  const lifts: LiftVerdict[] = series.map((s) => ({
    canonical: s.canonical,
    displayName: s.displayName,
    isPrimary: PRIMARY_LIFTS.has(s.canonical),
    trend: classifyTrend(s.points, STRENGTH_THRESHOLDS, asOf, { exclude: isDeloadWeek }),
  }));

  const { overall, overallPctChange } = rollUp(lifts);
  return { lifts, overall, overallPctChange };
}

/** Simple v1: the overall verdict follows the PRIMARY lifts that have data. */
function rollUp(lifts: LiftVerdict[]): { overall: TrendVerdict; overallPctChange: number | null } {
  const primaries = lifts.filter((l) => l.isPrimary && l.trend.verdict !== 'needs_data');
  if (primaries.length === 0) return { overall: 'needs_data', overallPctChange: null };

  const anyImproving = primaries.some((l) => l.trend.verdict === 'improving');
  const anySliding = primaries.some((l) => l.trend.verdict === 'sliding');

  let overall: TrendVerdict;
  if (anySliding && !anyImproving) overall = 'sliding';
  else if (anyImproving && !anySliding) overall = 'improving';
  else overall = 'holding'; // all-holding, or a conflicting mix → conservative

  const pcts = primaries
    .map((l) => l.trend.pctChange)
    .filter((n): n is number => n != null);
  const overallPctChange = pcts.length
    ? Math.round((pcts.reduce((s, n) => s + n, 0) / pcts.length) * 10) / 10
    : null;

  return { overall, overallPctChange };
}
