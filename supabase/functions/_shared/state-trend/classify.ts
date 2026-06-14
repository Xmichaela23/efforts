// The shared trend primitive — the single classifier every discipline calls.
// Pure: no Date.now / Math.random. The caller passes `asOf` (today) so the window is
// deterministic and testable. This file knows nothing about strength/bike specifics.

import type { TrendPoint, TrendResult, TrendThresholds, TrendVerdict } from './types.ts';

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
  /** Points averaged at each end for the noise guard (default 2 — see below). */
  endpointWindow?: number;
}

/**
 * Classify a dated metric series as improving / holding / sliding / needs_data.
 *
 * Noise guard (three layers, so no single session flips a verdict):
 *  1. min-session gate → below `minSessions` → needs_data (never a guess);
 *  2. endpoint smoothing → compare the AVERAGE of the 2 earliest vs the 2 most-recent
 *     in-window points, not raw first-vs-last, so one PR or one bad day can't anchor an end;
 *  3. dead-band → the gap between `slidePct` and `improvePct` reads as holding.
 */
export function classifyTrend(
  rawPoints: TrendPoint[],
  thresholds: TrendThresholds,
  asOf: string,
  opts: ClassifyOpts = {},
): TrendResult {
  const { windowDays, improvePct, slidePct, minSessions, lowerIsBetter, freshnessDays } = thresholds;
  const endpointN = opts.endpointWindow ?? 2;
  const windowStart = isoMinusDays(asOf, windowDays);

  const inWindow = rawPoints
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .filter((p) => p.date > windowStart && p.date <= asOf)
    .filter((p) => !opts.exclude?.(p))
    .sort((a, b) => a.date.localeCompare(b.date));

  const newestAgeDays = inWindow.length ? ageDays(inWindow[inWindow.length - 1].date, asOf) : null;

  const base = {
    window: { days: windowDays, start: windowStart, end: asOf },
    sampleCount: inWindow.length,
    points: inWindow,
    newestAgeDays,
  };

  if (inWindow.length < minSessions) {
    return { ...base, verdict: 'needs_data', pctChange: null, earlyAvg: null, recentAvg: null, stale: false };
  }

  const k = Math.min(endpointN, inWindow.length);
  const earlyAvg = avg(inWindow.slice(0, k).map((p) => p.value));
  const recentAvg = avg(inWindow.slice(-k).map((p) => p.value));
  const pctChange =
    earlyAvg > 0 ? Math.round(((recentAvg - earlyAvg) / earlyAvg) * 1000) / 10 : null;

  // For "lower is better" metrics (pace), a drop is improvement → flip the sign for the
  // verdict. pctChange itself stays raw so the UI can show the real direction of change.
  const effective = pctChange == null ? null : lowerIsBetter ? -pctChange : pctChange;

  let verdict: TrendVerdict;
  if (effective == null) verdict = 'needs_data';
  else if (effective >= improvePct) verdict = 'improving';
  else if (effective <= slidePct) verdict = 'sliding';
  else verdict = 'holding';

  // STALENESS GATE: a real verdict whose newest qualifying point is older than freshnessDays
  // is not a CURRENT trend — decay to needs_data (honest) rather than assert a stale direction.
  // A stale "improving" is worse than an honest needs_data. The result still carries
  // newestAgeDays + stale=true so a consumer can say "last data Nd ago" if desired.
  if (
    verdict !== 'needs_data' &&
    freshnessDays != null &&
    newestAgeDays != null &&
    newestAgeDays > freshnessDays
  ) {
    return { ...base, verdict: 'needs_data', pctChange: null, earlyAvg: null, recentAvg: null, stale: true };
  }

  return { ...base, verdict, pctChange, earlyAvg, recentAvg, stale: false };
}
