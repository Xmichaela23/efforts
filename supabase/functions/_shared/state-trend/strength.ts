// Strength adapter — feeds per-lift e1RM series into the shared primitive and rolls the
// per-lift verdicts up to one discipline verdict.
//
// Architecture contract #2: "overall follows primary lifts" is the SIMPLE v1 roll-up, but
// the per-lift verdicts are returned as a LIST (not pre-collapsed), so a richer roll-up
// later is a change to `rollUp` alone — the trend layer below never moves.

import type { TrendPoint, TrendResult, TrendVerdict } from './types.ts';
import { classifyTrend } from './classify.ts';
import { resolveThresholds } from './thresholds.ts';
import { isDeloadWeek } from './deload.ts';

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

// ── Strength row as a DUAL read: VOLUME direction (activity/load fact) LEADS, e1RM direction is the
// secondary fitness read. Session count is the receipt. Industry-standard (Strong/Hevy/JEFIT). ──

/** Per-workout strength volume (total_volume_lbs) → {date,value}[] for the volume trend. */
export interface StrengthVolumeRow { date: string; total_volume_lbs: number | null }
export function strengthVolumeToSeries(rows: StrengthVolumeRow[] | null | undefined): TrendPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ date: r.date, value: Number(r.total_volume_lbs) }))
    .filter((p) => p.date && Number.isFinite(p.value) && p.value > 0);
}

/** Volume trend. HIGHER = more training (a load fact, NOT fitness) → lowerIsBetter false; wider
 *  bands (±8%) than e1RM because session-to-session volume swings (upper vs lower day). */
export function computeStrengthVolumeState(series: TrendPoint[], asOf: string, sessionsPerWeek: number): TrendResult {
  return classifyTrend(
    series,
    { ...resolveThresholds('strength', sessionsPerWeek), improvePct: 8, slidePct: -8, lowerIsBetter: false },
    asOf,
    { exclude: isDeloadWeek },
  );
}

// Per-lift e1RM DIRECTION, serialized onto the spine (D-270). computeStrengthState already produces
// this list; before, rollUp collapsed it to the aggregate and it was discarded. Persisting it makes the
// spine the SINGLE authority for "is <lift> improving" — the coach per-lift row READS this instead of
// re-deriving a parallel (dead-fielded) direction from a different table. One direction, one substrate.
export interface StrengthPerLift {
  canonical: string;
  displayName: string;
  isPrimary: boolean;
  direction: TrendVerdict;     // the lift's e1RM trend — the spine's owned fact
  pctChange: number | null;
  latestE1rm: number | null;   // most-recent estimated_1rm point (the number the direction is OF)
  sampleCount: number;
  newestAgeDays: number | null;
  provisional: boolean;
}

// The strength row's serializable dual read. e1rm is NULL when there's no e1RM trend to hold — the
// render DROPS the clause rather than assert "holding" (holding is a claim; same honesty gate as
// every other row). "unplanned" is a dim receipt, never the verdict. perLift is the per-lift breakdown
// the aggregate rolls up FROM — persisted so surfaces read one direction (D-270), not re-derive it.
export interface StrengthFitness {
  volume: { verdict: TrendVerdict; pctChange: number | null; sampleCount: number; newestAgeDays: number | null; provisional: boolean };
  e1rm: { verdict: TrendVerdict; pctChange: number | null } | null;
  perLift: StrengthPerLift[];
  sessionsThisWeek: number;
  unplanned: number;
}

export function computeStrengthState(series: LiftSeries[], asOf: string, sessionsPerWeek: number): StrengthState {
  const thresholds = resolveThresholds('strength', sessionsPerWeek); // per-lift cadence (Q-052)
  const lifts: LiftVerdict[] = series.map((s) => ({
    canonical: s.canonical,
    displayName: s.displayName,
    isPrimary: PRIMARY_LIFTS.has(s.canonical),
    trend: classifyTrend(s.points, thresholds, asOf, { exclude: isDeloadWeek }),
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
