import React from 'react';
import { getDisciplineColor } from '@/lib/context-utils';

/**
 * ⛔ THE ONE CHART LANGUAGE (Round 3 pass 2, 2026-09-01). Extracted verbatim from
 * StatePerformanceSection so run, ride, bike-power/load and strength e1RM all draw ONE sparkline with
 * ONE caption format and ONE expand rule — the strength card was the model, and this is it. The
 * endurance efficiency cards drew a different chart (DatedChart: no expand, dates-only caption); they
 * now use this, so the four caption phrasings the screen carried collapse to one.
 *
 * ⚠️ CAPTION, STANDARDISED: collapsed → "last N weeks · recent 6 weeks in color · tap to expand";
 * expanded → "each dot = one {dotNoun} · recent 6 weeks in color"; building → `buildingLabel`. The
 * `recentLabel` default is the full "recent 6 weeks in color" so no call site needs to override it.
 *
 * ── the rulings that travelled with it, unchanged ──────────────────────────────────────────────
 * ⛔ THE COVERAGE LABEL, OVERRIDABLE AT THE CALL SITE (2026-08-01). "building · 3 of 12 weeks" is
 * honest for run — it counts data coverage of a 12-week canvas. On a strength lift it lands two lines
 * under "week 3 of 12" and reads as the same claim about the block, which it is not: it is a per-LIFT
 * data span. So the caller may pass its own `buildingLabel`; the default keeps run/bike unchanged.
 * ⛔ CONDITIONS ARE SHOWN, NOT CORRECTED (D-346). `caption` overlays weather/context so a reader can
 * interpret a poor point; nobody in the field adjusts an efficiency chart for heat, so neither do we.
 * ⚠️ THE CAP IS FOR THE "BUILDING" GATE ONLY, NOT THE LABEL (2026-07-31). `spanWeeks` is clamped to 12
 * to drive `building` (coverage of the 12-week canvas); the LABEL states what was actually drawn
 * (`spanWeeksRaw`), so a ~13-week run pool no longer prints "last 12 weeks" under a row saying "13wk".
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
  const [expanded, setExpanded] = React.useState(false);
  const pts = Array.isArray(series) ? series : [];
  if (pts.length < 2) {
    return pts.length === 1
      ? <span className="basis-full text-[11px] text-white/45">building — 1 {dotNoun} so far; a few more draws the 12-week trend</span>
      : null;
  }
  const runColor = color ?? getDisciplineColor('run');
  const W = 300, H = expanded ? 72 : 42, PAD_Y = expanded ? 10 : 6, PAD_X = 2;
  const vals = pts.map((p) => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const rawRange = maxV - minV;
  const center = (minV + maxV) / 2 || 1;
  const dRange = Math.max(rawRange * 1.3, center * minSpanFraction, 1e-6);
  const dMin = center - dRange / 2, dMax = center + dRange / 2;
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
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtD = (iso: string) => { const [, m, d] = iso.split('-'); return `${MON[+m - 1]} ${+d}`; };
  const gridYs = expanded ? [maxV, (maxV + minV) / 2, minV] : []; // subtle reference lines only when expanded
  void dMax;
  return (
    <span className="basis-full flex flex-col gap-1 mt-1.5">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="text-left w-full" aria-label="toggle chart size">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block">
          {gridYs.map((gv, i) => <line key={`g${i}`} x1={0} x2={W} y1={y(gv)} y2={y(gv)} stroke="rgba(255,255,255,0.055)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          <polyline points={dimPoly} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          {recentPoly && <polyline points={recentPoly} fill="none" stroke={runColor} strokeOpacity={0.9} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />}
          {/* expanded → a dot per actual reading, so the jags read as "each dot is a reading", not chart noise */}
          {expanded && pts.map((p, i) => <circle key={`d${i}`} cx={x(i)} cy={y(p.value)} r={1.6} fill={p.recent ? runColor : 'rgba(255,255,255,0.32)'} />)}
          <circle cx={x(pts.length - 1)} cy={y(last.value)} r={2.5} fill={runColor} />
        </svg>
      </button>
      {expanded && (
        <span className="text-[10px] text-white/30 flex items-center justify-between tabular-nums -mt-0.5">
          <span>{fmtD(pts[0].date)}</span><span>{fmtD(last.date)}</span>
        </span>
      )}
      <span className="text-[10px] text-white/45 flex items-center justify-between">
        <span>{building ? buildingLabel(spanWeeks) : (expanded ? `each dot = one ${dotNoun} · ${recentLabel}` : `last ${spanWeeksRaw} weeks · ${recentLabel} · tap to expand`)}</span>
        {unit ? <span className="tabular-nums text-white/30">{fmtVal(minV)}–{fmtVal(maxV)}{unit}</span> : <span />}
      </span>
      {caption && <span className="text-[10px] text-white/40">{caption}</span>}
    </span>
  );
}
