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

/**
 * ⛔ THE CHART'S OWN FACTS TRAVEL WITH THE FIT (2026-09-15, Stage 4 session 2). The sparkline
 * re-derived the week span from the dots' dates, applied an 11-week "building" cut, and took the low
 * and the high of the series — three rules on the phone over points the server had already chosen.
 * `spanWeeks`, `building`, `low` and `high` ride on BOTH outcomes, because a chart that is too thin
 * to fit a line still prints "building · N of 12 weeks" and its range.
 * ⚠️ `low` / `high` are the RAW values. How many decimals and which unit they print in is the caller's
 * (watts, pounds, an index), and that is formatting, not a rule.
 */
export type TrendFitFacts = {
  /** Weeks from the first dot to the last, capped at the 12-week window. Null with no points. */
  spanWeeks: number | null;
  /** The chart has not filled its window yet — the caption says so instead of naming a span. */
  building: boolean;
  low: number | null;
  high: number | null;
};

export type TrendFit =
  | ({ tooFew: false; start: number; end: number; weeks: number; n: number } & TrendFitFacts)
  | ({ tooFew: true; n: number } & TrendFitFacts);

/** OURS — the fewest points a line is fitted through. Two points are the line itself, not a trend. */
export const TREND_FIT_MIN_POINTS = 3;
/** FIELD — the 12-week chart window (TrainingPeaks' 90-day default; STATE-SOURCES "12-week trend window"). */
export const TREND_FIT_MAX_WEEKS = 12;
/**
 * OURS — a chart whose readings span fewer than this many weeks reads as still filling its window, and
 * the caption says "building · N of 12 weeks" instead of "last N weeks". Eleven of the twelve, so a
 * chart is not called building for the sake of a few missing days at the far end.
 * ⚠️ Lived on the phone as `spanWeeks < 11` with no marker until 2026-09-15. docs/STATE-SOURCES.md.
 */
export const TREND_BUILDING_UNDER_WEEKS = 11;
/** ⛔ The minimum a chart draws at all. Below this the caller prints the count, not a line. */
export const TREND_CHART_MIN_POINTS = 2;

/** The span, the building state and the range of a chart's own points. */
function factsFor(pts: ReadonlyArray<{ date: string; value: number }>): TrendFitFacts {
  if (pts.length === 0) return { spanWeeks: null, building: true, low: null, high: null };
  const first = Date.parse(pts[0].date + 'T12:00:00Z');
  const last = Date.parse(pts[pts.length - 1].date + 'T12:00:00Z');
  const spanWeeks = Number.isFinite(first) && Number.isFinite(last)
    ? Math.min(TREND_FIT_MAX_WEEKS, Math.max(1, Math.ceil((last - first) / (7 * 86_400_000))))
    : null;
  const vals = pts.map((p) => p.value);
  return {
    spanWeeks,
    building: spanWeeks == null || spanWeeks < TREND_BUILDING_UNDER_WEEKS,
    low: Math.min(...vals),
    high: Math.max(...vals),
  };
}

export function fitTrend(points: ReadonlyArray<{ date: string; value: number }>): TrendFit {
  const pts = [...points].filter((p) => Number.isFinite(p.value) && !!p.date).sort((a, b) => a.date.localeCompare(b.date));
  const facts = factsFor(pts);
  if (pts.length < TREND_FIT_MIN_POINTS) return { tooFew: true, n: pts.length, ...facts };
  const t0 = Date.parse(pts[0].date + 'T12:00:00Z');
  const xs = pts.map((p) => (Date.parse(p.date + 'T12:00:00Z') - t0) / 86_400_000);
  const ys = pts.map((p) => p.value);
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  // Every point on one day: no slope to fit.
  if (sxx === 0) return { tooFew: true, n, ...facts };
  const slope = sxy / sxx, intercept = my - slope * mx;
  const weeks = Math.min(TREND_FIT_MAX_WEEKS, Math.max(1, Math.ceil(xs[n - 1] / 7)));
  return { tooFew: false, start: intercept, end: intercept + slope * xs[n - 1], weeks, n, ...facts };
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
  tempF?: number | null;
};

/**
 * FIELD — Garmin's own heat cut-off: it corrects its fitness estimate above 22 °C / 72 °F.
 * TrainingPeaks applies no correction and Friel's guidance is to compare like with like, so the card
 * SHOWS the note and corrects nothing (D-346). docs/STATE-SOURCES.md row 35.
 * ⚠️ The test ran on the phone until 2026-09-15.
 */
export const HEAT_NOTE_TEMP_F = 72;

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
export function spineTrends(points: ReadonlyArray<SpinePointLike>): {
  efficiencyTrend: ChartTrend;
  driftTrend: ChartTrend;
  /** Sessions the card keeps but the trend leaves out (a hard ride) — the card names the number. */
  leftOutOfTrend: number;
  /** Any session in the window at or above Garmin's heat cut-off → the card prints its fixed heat line. */
  heatInWindow: boolean;
} {
  const trendPts = points.filter((p) => p.countsTowardTrend !== false);
  const eff = trendPts
    .filter((p) => p.efficiency != null)
    .map((p) => ({ date: p.date, value: p.efficiency as number }));
  const drift = trendPts
    .filter((p) => p.driftPct != null && !p.fadeWithheld && !p.driftWholeSession
      && (p.driftBasis === 'gap' || p.driftBasis === 'raw' || p.driftBasis === 'power'))
    .map((p) => ({ date: p.date, value: p.driftPct as number }));
  return {
    efficiencyTrend: chartTrend(eff),
    driftTrend: chartTrend(drift),
    // ⛔ BOTH COUNTED HERE (2026-09-15, Stage 4 session 2). The card re-ran this same
    // `countsTowardTrend` filter on the phone to get the left-out count, and tested every point's
    // temperature itself to decide whether to print the heat line.
    leftOutOfTrend: points.length - trendPts.length,
    heatInWindow: points.some((p) => typeof p.tempF === 'number' && p.tempF >= HEAT_NOTE_TEMP_F),
  };
}
