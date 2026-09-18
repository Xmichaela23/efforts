import React from 'react';
import type { TrendFit } from '@shared/state-trend';
import { getDisciplineColor } from '@/lib/context-utils';

/**
 * ⛔ THE ONE CHART LANGUAGE (Round 3 pass 2, 2026-09-01). Extracted verbatim from
 * StatePerformanceSection so run, ride, bike-power/load and strength e1RM all draw ONE sparkline with
 * ONE caption format — the strength card was the model, and this is it. The endurance efficiency cards
 * drew a different chart (DatedChart: no expand, dates-only caption); they now use this, so the four
 * caption phrasings the screen carried collapse to one.
 *
 * ⛔ NO TAP ON THE CHART (2026-09-03, WORKORDER-bike-state-audit §5.2). The chart had an expand toggle
 * ("tap to expand" → taller chart, a dot per reading, a date range). Michael ruled second-level taps
 * off this screen on 2026-09-03 — one tap opens the row and everything the card has is printed on it.
 * The ruling was applied to the sport rows and this toggle, inside them, survived. It is gone: the chart
 * is static, and what it shows is what there is.
 *
 * ⚠️ CAPTION, STANDARDISED: "last N weeks" (one colour, 2026-09-04); building → `buildingLabel`.
 * ⚠️ N IS THE 12-WEEK MODEL'S, CAPPED (2026-09-03, §5.3). The label printed the uncapped data span
 * (13, off a 90-day fetch window ≈ 12.8 weeks) while its own "building" test used the span capped at
 * 12 — "last 13 weeks" under a 12-week model. The label, the gate and the model now agree at 12.
 * (Superseded: the 2026-07-31 rule that the label states the raw span so a 13-week pool would not read
 * "last 12 weeks" under a row saying "13wk" — that row no longer prints a week count.)
 * ⛔ AND THE SPAN, THE CUT AND THE RANGE ARE THE SERVER'S SINCE 2026-09-15 (Stage 4 session 2). They
 * ride on `fit` (`_shared/state-trend/trend-fit.ts`), on both of its outcomes. Nothing here works out a
 * number that reaches the screen; the SVG maths below is the plotting domain in pixels.
 *
 * ── the rulings that travelled with it, unchanged ──────────────────────────────────────────────
 * ⛔ THE COVERAGE LABEL, OVERRIDABLE AT THE CALL SITE (2026-08-01). "building · 3 of 12 weeks" is
 * honest for run — it counts data coverage of a 12-week canvas. On a strength lift it lands two lines
 * under "week 3 of 12" and reads as the same claim about the block, which it is not: it is a per-LIFT
 * data span. So the caller may pass its own `buildingLabel`; the default keeps run/bike unchanged.
 * ⛔ CONDITIONS ARE SHOWN, NOT CORRECTED (D-346). `caption` overlays weather/context so a reader can
 * interpret a poor point; nobody in the field adjusts an efficiency chart for heat, so neither do we.
 * ⚠️ NOISE FLOOR / HEADROOM (2026-07-22/23). The domain pads 15% each side and spans at least
 * `minSpanFraction` of the center, so a small move on a slow lift stays visually small — a 10lb bounce
 * on a 100lb lift must not fill the height and read as a crash. `minSpanFraction=0` leaves run/ride
 * unchanged; strength passes a fraction.
 * ⚠️ RANGE SUPPRESSED WHEN THERE IS NO UNIT. The efficiency charts plot an index, so a bare
 * "1.24–1.90" means nothing to a reader — the shape is the message. Strength passes a lb unit and
 * keeps its range, where the numbers are self-explanatory.
 */
export default function TrendSparkline({ series, color, dotNoun = 'steady run', fmtVal = (v: number) => v.toFixed(2), unit = '', minSpanFraction = 0, caption, title, label, headline, qualifier, keyLine, provenance, divider = false, buildingLabel = (w: number) => `building · ${w} of 12 weeks`, fit = null, trendWord, changeLine = null }: {
  series?: Array<{ date: string; value: number; recent: boolean; tempF?: number | null }>;
  color?: string; dotNoun?: string; fmtVal?: (v: number) => string; unit?: string; minSpanFraction?: number;
  buildingLabel?: (spanWeeks: number) => string;
  caption?: string | null;
  /** ONE TEMPLATE for every chart on State (2026-09-04): title row (title left, low–high right) · chart ·
   *  "over N weeks: start → end" · coverage only while building · provenance · key line. */
  title?: string;
  /** Lead hierarchy (2026-09-04): small label · one BIG number · small qualifier. `headline` defaults to the
   *  fitted end (with a trendline) or the last point. */
  label?: string;
  headline?: string;
  qualifier?: string;
  keyLine?: string;
  provenance?: string | null;
  divider?: boolean;
  /** The server's fitted line through these dots (WKO5's chart trendline, `_shared/state-trend/trend-fit.ts`).
   *  Drawn, with "start → end" under the chart, when it is present and not too few. Nothing is fitted here. */
  fit?: TrendFit | null;
  /** The noun for the caption, e.g. 'efficiency' / 'drift'. */
  trendWord?: string;
  /** The server's change line ("8% lower than 10 weeks ago"), printed in place of "start → end" when present. */
  changeLine?: string | null;
}) {
  const pts = Array.isArray(series) ? series : [];
  if (pts.length < 2) {
    return pts.length === 1
      ? <span className="basis-full text-caption text-label-secondary">building — 1 {dotNoun} so far; a few more draws the 12-week trend</span>
      : null;
  }
  const runColor = color ?? getDisciplineColor('run');
  const W = 300, H = 44, PAD_Y = 6, PAD_X = 2;
  // ⚠️ CHART GEOMETRY ONLY — the plotting domain, in pixels. The printed low and high come off the fit
  // below; these two never reach the screen as numbers.
  const vals = pts.map((p) => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const rawRange = maxV - minV;
  const center = (minV + maxV) / 2 || 1;
  const dRange = Math.max(rawRange * 1.3, center * minSpanFraction, 1e-6);
  const dMin = center - dRange / 2;
  const x = (i: number) => PAD_X + (i / (pts.length - 1)) * (W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + (1 - (v - dMin) / dRange) * (H - 2 * PAD_Y); // higher = higher on chart
  // ⛔ ONE COLOUR (2026-09-04, docs/SPEC-state-nothing-invented-2026-09-04.md): the "recent 6 weeks in
  // colour" split was ours. TrainingPeaks and intervals.icu draw one line, a dot per session.
  const poly = pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const last = pts[pts.length - 1];
  // ⛔ THE SPAN, THE BUILDING STATE AND THE RANGE ARE THE SERVER'S (2026-09-15, Stage 4 session 2).
  // This re-derived the week span from the dots' dates, applied an 11-week cut with no source, and took
  // the low and the high of the series itself — three rules on the phone over points the server chose.
  // They ride on the fit (`trend-fit.ts`), on both its outcomes, so a chart too thin for a line still
  // has them. ⚠️ A payload written before this carries none: the caption is dropped rather than rebuilt.
  const spanWeeks = fit?.spanWeeks ?? null;
  const building = fit?.building === true;
  // ⛔ THE TRENDLINE IS A FIT, NOT A VERDICT (2026-09-04, Michael: "this line means nothing; it needs something
  // that says what it is"). TrainingPeaks' dashboard chart of Pa:Hr / EF is bare dots; WKO5, its analysis tool,
  // adds a fitted trendline. The caption prints the line's start and end values — "8.1% → 5.2%" — nothing about
  // the last session, no improving/sliding word. ⚠️ The fit is the server's (audit 2026-09-10, H-B07).
  const line = fit && fit.tooFew === false ? fit : null;
  // The low and the high are the server's two numbers; how many decimals and which unit they print in
  // is this caller's, and that is formatting.
  const rangeLabel = unit && fit?.low != null && fit?.high != null
    ? `${fmtVal(fit.low)}–${fmtVal(fit.high)}${unit}`
    : null;
  return (
    <span className={`basis-full flex flex-col gap-0.5 ${divider ? 'mt-2 pt-2 border-t border-white/10' : 'mt-1'}`}>
      {label ? (
        <span className="flex items-end justify-between gap-2">
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="text-caption uppercase tracking-wider text-label-secondary">{label}</span>
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="readout-num text-title1 leading-none text-label tabular-nums">{headline ?? `${fmtVal(line ? line.end : last.value)}${unit}`}</span>
              {qualifier && <span className="text-caption text-label-secondary truncate">{qualifier}</span>}
            </span>
          </span>
          {rangeLabel && <span className="text-caption tabular-nums text-label-secondary whitespace-nowrap shrink-0">{rangeLabel}</span>}
        </span>
      ) : title && (
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-subhead text-label">{title}</span>
          {rangeLabel && <span className="text-caption tabular-nums text-label-secondary whitespace-nowrap shrink-0">{rangeLabel}</span>}
        </span>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block" aria-hidden="true">
        <polyline points={poly} fill="none" stroke={runColor} strokeOpacity={0.9} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
        {/* one dot per session (2026-09-04, Michael): TrainingPeaks and intervals.icu plot each workout as a point
            and draw the line through them — a line through three readings must look like three readings */}
        {pts.map((p, i) => i < pts.length - 1 && (
          <circle key={p.date + i} cx={x(i)} cy={y(p.value)} r={1.6} fill={runColor} fillOpacity={0.8} />
        ))}
        <circle cx={x(pts.length - 1)} cy={y(last.value)} r={2.5} fill={runColor} />
        {line && <line x1={x(0)} y1={y(line.start)} x2={x(pts.length - 1)} y2={y(line.end)} stroke="rgba(255,255,255,0.55)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      {line && changeLine && <span className="text-footnote text-label">{changeLine}</span>}
      {line && !changeLine && (
        <span className="text-footnote text-label">
          {trendWord && !title && !label ? `${trendWord} ` : ''}over {line.weeks} {line.weeks === 1 ? 'week' : 'weeks'}: <span className="tabular-nums">{fmtVal(line.start)}{unit}</span> → <span className="tabular-nums">{fmtVal(line.end)}{unit}</span>
        </span>
      )}
      {(title || label) ? (
        ((building && spanWeeks != null) || provenance) && (
          <span className="text-caption text-label-secondary">{[building && spanWeeks != null ? buildingLabel(spanWeeks) : null, provenance].filter(Boolean).join(' · ')}</span>
        )
      ) : (
        <span className="text-caption text-label-secondary flex items-center justify-between">
          <span>{spanWeeks == null ? '' : building ? buildingLabel(spanWeeks) : `last ${spanWeeks} weeks`}</span>
          {rangeLabel ? <span className="tabular-nums text-label-secondary">{rangeLabel}</span> : <span />}
        </span>
      )}
      {provenance && !(title || label) && <span className="text-caption text-label-secondary">{provenance}</span>}
      {keyLine && <span className="text-caption text-label-secondary leading-snug">{keyLine}</span>}
      {caption && <span className="text-caption text-label-secondary">{caption}</span>}
    </span>
  );
}
