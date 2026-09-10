/**
 * ⛔ THE TRENDLINE — WKO5's fitted line through the dashboard dots, computed ONCE, HERE (audit
 * 2026-09-10, H-B07).
 *
 * WHAT THIS REPLACED: `fitTrend` in `src/lib/sport-summary.ts`. The phone ran the fit itself for the
 * efficiency, drift and FTP charts and for the collapsed run and bike rows ("aerobic efficiency 1.498
 * · 12-week trend · from 1.650", "too few for a trend"). The arithmetic is moved byte for byte; only
 * its address changed. The screen prints `start`, `end` and `weeks` and draws the line between them.
 *
 * FIELD — WKO5 chart trendline (least squares of value on date); TrainingPeaks' dashboard is the bare
 * dots. docs/STATE-SOURCES.md rows "Fitted trendline through the dots" and "12-week trend window".
 * Nothing about the last session and no verdict word: the caption prints "1.650 → 1.498".
 *
 * ⚠️ `tooFew` IS A STATE, NOT AN ABSENCE. A chart with a point or two carries `{ tooFew: true, n }`,
 * so the row can say "too few for a trend". A payload with NO fit at all (a snapshot written before
 * this field) prints nothing — the screen does not fall back to its own arithmetic.
 */

export type TrendFit =
  | { tooFew: false; start: number; end: number; weeks: number; n: number }
  | { tooFew: true; n: number };

/** OURS — the fewest points a line is fitted through. Two points are the line itself, not a trend. */
export const TREND_FIT_MIN_POINTS = 3;
/** FIELD — the 12-week chart window (TrainingPeaks' 90-day default; STATE-SOURCES "12-week trend window"). */
export const TREND_FIT_MAX_WEEKS = 12;

export function fitTrend(points: ReadonlyArray<{ date: string; value: number }>): TrendFit {
  const pts = [...points].filter((p) => Number.isFinite(p.value) && !!p.date).sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < TREND_FIT_MIN_POINTS) return { tooFew: true, n: pts.length };
  const t0 = Date.parse(pts[0].date + 'T12:00:00Z');
  const xs = pts.map((p) => (Date.parse(p.date + 'T12:00:00Z') - t0) / 86_400_000);
  const ys = pts.map((p) => p.value);
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  // Every point on one day: no slope to fit.
  if (sxx === 0) return { tooFew: true, n };
  const slope = sxy / sxx, intercept = my - slope * mx;
  const weeks = Math.min(TREND_FIT_MAX_WEEKS, Math.max(1, Math.ceil(xs[n - 1] / 7)));
  return { tooFew: false, start: intercept, end: intercept + slope * xs[n - 1], weeks, n };
}

/** A chart's own points and the fit through exactly those points — one selection, so dots and line agree. */
export type ChartTrend = { points: Array<{ date: string; value: number }>; fit: TrendFit };

export function chartTrend(points: Array<{ date: string; value: number }>): ChartTrend {
  return { points, fit: fitTrend(points) };
}

type SpinePointLike = {
  date: string;
  efficiency: number | null;
  driftPct: number | null;
  driftBasis?: 'gap' | 'raw' | 'power' | 'hr' | null;
  driftWholeSession?: boolean;
  fadeWithheld: boolean;
  countsTowardTrend?: boolean;
};

/**
 * ⛔ THE SPINE CARD'S TWO CHARTS — efficiency and drift — with their points chosen HERE.
 *
 * The selections are the ones the rides/runs card used to make on the phone (`StrengthReadCards.tsx`
 * SpineCard), moved with the fit so the dots and the line are one list:
 *   · efficiency — the sessions that count toward the trend (`countsTowardTrend !== false`; every run,
 *     steady rides only — `bikeEfficiencyRideEligible`) that carry an efficiency number.
 *   · drift — those same sessions carrying a RATIO drift read (pace or power to heart rate), not
 *     withheld and not an interval day. p107's line governs the ratio only, so heart-rate-alone drift
 *     is not in this trend.
 */
export function spineTrends(points: ReadonlyArray<SpinePointLike>): { efficiencyTrend: ChartTrend; driftTrend: ChartTrend } {
  const trendPts = points.filter((p) => p.countsTowardTrend !== false);
  const eff = trendPts
    .filter((p) => p.efficiency != null)
    .map((p) => ({ date: p.date, value: p.efficiency as number }));
  const drift = trendPts
    .filter((p) => p.driftPct != null && !p.fadeWithheld && !p.driftWholeSession
      && (p.driftBasis === 'gap' || p.driftBasis === 'raw' || p.driftBasis === 'power'))
    .map((p) => ({ date: p.date, value: p.driftPct as number }));
  return { efficiencyTrend: chartTrend(eff), driftTrend: chartTrend(drift) };
}
