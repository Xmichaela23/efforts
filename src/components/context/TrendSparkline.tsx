import { fitTrend } from '@/lib/sport-summary';
import React from 'react';
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
export default function TrendSparkline({ series, color, dotNoun = 'steady run', fmtVal = (v: number) => v.toFixed(2), unit = '', minSpanFraction = 0, caption, title, label, headline, qualifier, keyLine, provenance, divider = false, buildingLabel = (w: number) => `building · ${w} of 12 weeks`, trendline = false, trendWord }: {
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
  /** Draw a least-squares line through the dots and say where it starts and ends (WKO5's chart trendline). */
  trendline?: boolean;
  /** The noun for the caption, e.g. 'efficiency' / 'drift'. */
  trendWord?: string;
}) {
  const pts = Array.isArray(series) ? series : [];
  if (pts.length < 2) {
    return pts.length === 1
      ? <span className="basis-full text-[11px] text-white/45">building — 1 {dotNoun} so far; a few more draws the 12-week trend</span>
      : null;
  }
  const runColor = color ?? getDisciplineColor('run');
  const W = 300, H = 48, PAD_Y = 6, PAD_X = 2;
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
  const spanWeeksRaw = Math.max(1, Math.ceil((Date.parse(last.date + 'T12:00:00Z') - Date.parse(pts[0].date + 'T12:00:00Z')) / (7 * 86_400_000)));
  const spanWeeks = Math.min(12, spanWeeksRaw);
  const building = spanWeeks < 11;
  // ⛔ THE TRENDLINE IS A FIT, NOT A VERDICT (2026-09-04, Michael: "this line means nothing; it needs something
  // that says what it is"). TrainingPeaks' dashboard chart of Pa:Hr / EF is bare dots; WKO5, its analysis tool,
  // adds a fitted trendline. Least squares on (date, value); the caption prints the line's start and end
  // values — "8.1% → 5.2%" — nothing about the last session, no improving/sliding word.
  const fit = trendline ? fitTrend(pts) : null;
  const rangeLabel = unit ? `${fmtVal(minV)}–${fmtVal(maxV)}${unit}` : null;
  return (
    <span className={`basis-full flex flex-col gap-1 ${divider ? 'mt-3 pt-3 border-t border-white/10' : 'mt-1.5'}`}>
      {label ? (
        <span className="flex items-end justify-between gap-2">
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[11px] uppercase tracking-wider text-white/55">{label}</span>
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="readout-num text-[24px] leading-none text-white/95 tabular-nums">{headline ?? `${fmtVal(fit ? fit.end : last.value)}${unit}`}</span>
              {qualifier && <span className="text-[12px] text-white/60 truncate">{qualifier}</span>}
            </span>
          </span>
          {rangeLabel && <span className="text-[12px] tabular-nums text-white/50 whitespace-nowrap shrink-0">{rangeLabel}</span>}
        </span>
      ) : title && (
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] text-white/90">{title}</span>
          {rangeLabel && <span className="text-[12px] tabular-nums text-white/50 whitespace-nowrap shrink-0">{rangeLabel}</span>}
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
        {fit && <line x1={x(0)} y1={y(fit.start)} x2={x(pts.length - 1)} y2={y(fit.end)} stroke="rgba(255,255,255,0.55)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      {fit && (
        <span className="text-[13px] text-white/85">
          {trendWord && !title && !label ? `${trendWord} ` : ''}over {spanWeeks} {spanWeeks === 1 ? 'week' : 'weeks'}: <span className="tabular-nums">{fmtVal(fit.start)}{unit}</span> → <span className="tabular-nums">{fmtVal(fit.end)}{unit}</span>
        </span>
      )}
      {(title || label) ? (
        building && <span className="text-[12px] text-white/55">{buildingLabel(spanWeeks)}</span>
      ) : (
        <span className="text-[10px] text-white/45 flex items-center justify-between">
          <span>{building ? buildingLabel(spanWeeks) : `last ${spanWeeks} weeks`}</span>
          {rangeLabel ? <span className="tabular-nums text-white/30">{rangeLabel}</span> : <span />}
        </span>
      )}
      {provenance && <span className="text-[12px] text-white/65">{provenance}</span>}
      {keyLine && <span className="text-[12px] text-white/60 leading-snug">{keyLine}</span>}
      {caption && <span className="text-[10px] text-white/40">{caption}</span>}
    </span>
  );
}
