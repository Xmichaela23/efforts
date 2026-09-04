// The shared trend primitive — the single classifier every discipline calls.
// Pure: no Date.now / Math.random. The caller passes `asOf` (today) so the window is
// deterministic and testable. This file knows nothing about strength/bike specifics.
//
// ⛔ GARMIN'S RULE, AND NOTHING ELSE (2026-09-04, docs/SPEC-state-nothing-invented-2026-09-04.md).
// Split the qualifying points by DATE into the last 28 days and the 28 days before. Average each half.
// Higher → improving, lower → sliding, the same → holding. If either half has no session there is
// nothing to compare → needs_data. That is the whole test. The percent bands, the endpoint smoothing,
// the signal-vs-noise gate, the volume floor (`withheld`), the freshness decay and the "recently flat"
// read that used to live here were ours (Q-052) and are gone. Ledger: docs/STATE-SOURCES.md.
//
// "The same" is judged at the precision the METRIC is displayed at (`thresholds.precision`): two averages
// that print identical digits are the same → holding. FIELD — Garmin: VO2 max is shown as a whole
// number and Training Status reads → (maintaining) when the shown number has not moved. Nothing else
// is rounded.

import type { TrendPoint, TrendResult, TrendThresholds, TrendVerdict } from './types.ts';
import { TREND_HALF_DAYS } from './thresholds.ts';

const MS_PER_DAY = 86_400_000;

/** Window start = asOf − windowDays, computed from the ISO date alone (pure). */
function isoMinusDays(iso: string, days: number): string {
  const base = new Date(iso + 'T12:00:00Z').getTime();
  return new Date(base - days * MS_PER_DAY).toISOString().slice(0, 10);
}

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

/** Whole-day age of an ISO date relative to asOf (pure). */
function ageDays(dateISO: string, asOf: string): number {
  return Math.round((Date.parse(asOf + 'T12:00:00Z') - Date.parse(dateISO + 'T12:00:00Z')) / MS_PER_DAY);
}

export interface ClassifyOpts {
  /** Points matching this predicate are dropped before trending (e.g. deload weeks). */
  exclude?: (p: TrendPoint) => boolean;
}

/**
 * Classify a dated metric series as improving / holding / sliding / needs_data by Garmin's rule:
 * the average of the last 28 days against the average of the 28 days before.
 */
export function classifyTrend(
  rawPoints: TrendPoint[],
  thresholds: TrendThresholds,
  asOf: string,
  opts: ClassifyOpts = {},
): TrendResult {
  const { windowDays, lowerIsBetter, precision } = thresholds;
  const windowStart = isoMinusDays(asOf, windowDays);
  const recentStart = isoMinusDays(asOf, TREND_HALF_DAYS);

  const inWindow = rawPoints
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .filter((p) => p.date > windowStart && p.date <= asOf)
    .filter((p) => !opts.exclude?.(p))
    .sort((a, b) => a.date.localeCompare(b.date));

  const recent = inWindow.filter((p) => p.date > recentStart);
  const early = inWindow.filter((p) => p.date <= recentStart);
  const newestAgeDays = inWindow.length ? ageDays(inWindow[inWindow.length - 1].date, asOf) : null;

  const base = {
    window: { days: windowDays, start: windowStart, end: asOf, recentStart },
    sampleCount: inWindow.length,
    earlyCount: early.length,
    recentCount: recent.length,
    points: inWindow,
    newestAgeDays,
    stale: false,
    minSessions: 1,
  };

  if (recent.length === 0 || early.length === 0) {
    return { ...base, verdict: 'needs_data', pctChange: null, earlyAvg: null, recentAvg: null };
  }

  const earlyAvg = avg(early.map((p) => p.value));
  const recentAvg = avg(recent.map((p) => p.value));
  const pctChange = Math.round(((recentAvg - earlyAvg) / earlyAvg) * 1000) / 10;

  // The same digits at the displayed precision → holding (Garmin's →); otherwise the sign decides.
  const same = recentAvg.toFixed(precision) === earlyAvg.toFixed(precision);
  let verdict: TrendVerdict;
  if (same) verdict = 'holding';
  else if ((recentAvg > earlyAvg) !== !!lowerIsBetter) verdict = 'improving';
  else verdict = 'sliding';

  return { ...base, verdict, pctChange, earlyAvg, recentAvg };
}
