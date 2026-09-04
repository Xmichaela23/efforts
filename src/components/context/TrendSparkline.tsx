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
 * ⚠️ CAPTION, STANDARDISED: "last N weeks · recent 6 weeks in color"; building → `buildingLabel`. The
 * `recentLabel` default is the full "recent 6 weeks in color" so no call site needs to override it.
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
export default function TrendSparkline({ series, color, dotNoun = 'steady run', fmtVal = (v: number) => v.toFixed(2), unit = '', minSpanFraction = 0, recentLabel = 'recent 6 weeks in color', caption, buildingLabel = (w: number) => `building · ${w} of 12 weeks` }: {
  series?: Array<{ date: string; value: number; recent: boolean; tempF?: number | null }>;
  color?: string; dotNoun?: string; fmtVal?: (v: number) => string; unit?: string; minSpanFraction?: number; recentLabel?: string;
  buildingLabel?: (spanWeeks: number) => string;
  caption?: string | null;
}) {
  const pts = Array.isArray(series) ? series : [];
  if (pts.length < 2) {
    return pts.length === 1
      ? <span className="basis-full text-[11px] text-white/45">building — 1 {dotNoun} so far; a few more draws the 12-week trend</span>
      : null;
  }
  const runColor = color ?? getDisciplineColor('run');
  const W = 300, H = 42, PAD_Y = 6, PAD_X = 2;
  const vals = pts.map((p) => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const rawRange = maxV - minV;
  const center = (minV + maxV) / 2 || 1;
  const dRange = Math.max(rawRange * 1.3, center * minSpanFraction, 1e-6);
  const dMin = center - dRange / 2;
  const x = (i: number) => PAD_X + (i / (pts.length - 1)) * (W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + (1 - (v - dMin) / dRange) * (H - 2 * PAD_Y); // higher = higher on chart
  const firstRecent = pts.findIndex((p) => p.recent);
  const recentStart = firstRecent <= 0 ? 0 : firstRecent - 1; // include the join point so the segments connect
  const dimPoly = pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const recentPoly = firstRecent >= 0 ? pts.slice(recentStart).map((p, i) => `${x(recentStart + i)},${y(p.value)}`).join(' ') : '';
  const last = pts[pts.length - 1];
  const spanWeeksRaw = Math.max(1, Math.ceil((Date.parse(last.date + 'T12:00:00Z') - Date.parse(pts[0].date + 'T12:00:00Z')) / (7 * 86_400_000)));
  const spanWeeks = Math.min(12, spanWeeksRaw);
  const building = spanWeeks < 11;
  return (
    <span className="basis-full flex flex-col gap-1 mt-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block" aria-hidden="true">
        <polyline points={dimPoly} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        {recentPoly && <polyline points={recentPoly} fill="none" stroke={runColor} strokeOpacity={0.9} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />}
        <circle cx={x(pts.length - 1)} cy={y(last.value)} r={2.5} fill={runColor} />
      </svg>
      <span className="text-[10px] text-white/45 flex items-center justify-between">
        <span>{building ? buildingLabel(spanWeeks) : `last ${spanWeeks} weeks · ${recentLabel}`}</span>
        {unit ? <span className="tabular-nums text-white/30">{fmtVal(minV)}–{fmtVal(maxV)}{unit}</span> : <span />}
      </span>
      {caption && <span className="text-[10px] text-white/40">{caption}</span>}
    </span>
  );
}
