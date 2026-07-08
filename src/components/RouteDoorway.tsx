import { useState } from 'react';

/**
 * Segment doorway — "am I getting faster on this stretch." The session card shows a familiarity line
 * ("Same stretch · ran N×"); tapping opens the server-authored verdict CARD (rendered verbatim) + a
 * quiet supporting chart. The CARD carries the claim; the chart is quiet evidence.
 *
 * FLAG-DRIVEN (Law 4 — render, don't re-decide). The server sends render_flags {show_arrow, show_slope,
 * show_pct}. Honesty is the DEFAULT: flags switch features ON (a trend line, an arrow, a %); their
 * absence (still_learning / still_building) means a quiet scatter with NO slope. The client draws ONLY
 * the server-windowed chart_points — no windowing, no same-effort recompute, no core_efforts query. The
 * verdict is born on the spine (core_verdicts / Law 5); this component only presents it.
 */

type ChartPoint = {
  date: string;
  pace_s_per_km: number;
  same_effort_pace_s_per_km: number;
  hr: number;
  provenance: 'hr_aligned' | 'raw_pace_only';
  is_best_same: boolean;
  is_best_pace: boolean;
};
export type SegmentVerdict = {
  copy: string;
  render_flags: { show_arrow: boolean; show_slope: boolean; show_pct: boolean };
  provenance: 'hr_aligned' | 'raw_pace_only';
  verdict: {
    direction: 'improving' | 'holding' | 'declining' | 'still_learning' | 'still_building';
    metric: 'same_effort_pace' | 'raw_pace' | null;
    n: number;
    n_hr_aligned: number;
    window_days: number;
    method: string | null;
    span_days: number | null;
    pct?: number;
    ci?: [number, number];
  };
  chart_points: ChartPoint[];
  runs_all_time: number;
};

const paceLabel = (sPerKm: number) => {
  const perMi = sPerKm * 1.60934;
  const m = Math.floor(perMi / 60);
  const sec = Math.round(perMi - m * 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
const dayNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
const monthLabel = (x: number) => new Date(x * 864e5).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
const dateLabel = (x: number) => new Date(x * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function ols(xs: number[], ys: number[]) {
  const n = xs.length;
  if (!n) return { a: 0, b: 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let Sxx = 0, Sxy = 0;
  for (let i = 0; i < n; i++) { Sxx += (xs[i] - mx) ** 2; Sxy += (xs[i] - mx) * (ys[i] - my); }
  const b = Sxx ? Sxy / Sxx : 0;
  return { a: my - b * mx, b };
}

// State pill: NEUTRAL for the abstain / flat states (the restraint is the honesty); toned only when the
// server reports a confident direction. Never invents a claim the flags don't carry.
const PILL: Record<string, { label: string; tone: string }> = {
  still_learning: { label: 'Still learning', tone: 'text-gray-300 bg-gray-500/15' },
  still_building: { label: 'Building', tone: 'text-gray-300 bg-gray-500/15' },
  holding: { label: 'Holding', tone: 'text-sky-300 bg-sky-500/15' },
  improving: { label: 'Getting faster', tone: 'text-emerald-300 bg-emerald-500/15' },
  declining: { label: 'Slower at effort', tone: 'text-amber-300 bg-amber-500/15' },
};

function SegmentChart({ pts, metric, showSlope }: { pts: ChartPoint[]; metric: 'same' | 'pace'; showSlope: boolean }) {
  const [tap, setTap] = useState<number | null>(null);
  const W = 340, H = 176, mL = 44, mR = 12, mT = 12, mB = 22;
  const valOf = (p: ChartPoint) => (metric === 'same' ? p.same_effort_pace_s_per_km : p.pace_s_per_km);
  const isBestOf = (p: ChartPoint) => (metric === 'same' ? p.is_best_same : p.is_best_pace);
  const xs = pts.map((p) => dayNum(p.date));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  // LOCKED y-range across BOTH lenses — flipping Same-effort/Pace must not rescale the axis.
  const allY = pts.flatMap((p) => [p.same_effort_pace_s_per_km, p.pace_s_per_km]);
  let lo = Math.min(...allY), hi = Math.max(...allY);
  const pad = (hi - lo) * 0.14 || 1; lo -= pad; hi += pad;
  const px = (x: number) => mL + (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) * (W - mL - mR);
  const py = (v: number) => mT + (v - lo) / (hi - lo) * (H - mT - mB); // faster (lower s/km) sits higher

  const gridY = [0, 1, 2, 3].map((i) => lo + (hi - lo) * i / 3);
  const monthsOrder = [...new Set(pts.map((p) => p.date.slice(0, 7)))];
  const step = Math.max(1, Math.ceil(monthsOrder.length / 4));
  const monthTicks = monthsOrder.filter((_, i) => i % step === 0).map((mo) => {
    const p = pts.find((pp) => pp.date.slice(0, 7) === mo)!;
    return { x: Math.min(Math.max(px(dayNum(p.date)), mL + 6), W - mR - 6), label: monthLabel(dayNum(p.date)) };
  });
  // Trend line geometry ONLY when the server says show_slope. It fits over the server-sent points — it
  // never windows or re-decides the verdict.
  const fit = showSlope ? ols(xs, pts.map(valOf)) : null;
  const tp = tap != null ? pts[tap] : null;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" role="img" aria-label="Your efforts on this stretch">
        {gridY.map((v, i) => (
          <g key={i}>
            <line x1={mL} y1={py(v)} x2={W - mR} y2={py(v)} stroke="currentColor" className="text-gray-700/50" strokeWidth={1} />
            <text x={mL - 6} y={py(v) + 3} textAnchor="end" className="fill-gray-500 tabular-nums" fontSize={9.5}>{paceLabel(v)}</text>
          </g>
        ))}
        {monthTicks.map((t, i) => (
          <text key={i} x={t.x} y={H - 6} textAnchor="middle" className="fill-gray-500" fontSize={9}>{t.label}</text>
        ))}
        {fit && (
          <line
            x1={px(x0)} y1={py(fit.a + fit.b * x0)} x2={px(x1)} y2={py(fit.a + fit.b * x1)}
            className="text-emerald-400" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.85}
          />
        )}
        {pts.map((p, i) => {
          const isBest = isBestOf(p), isTap = tap === i;
          const cx = px(dayNum(p.date)), cy = py(valOf(p));
          const fill = isBest ? 'fill-amber-300' : isTap ? 'fill-gray-100' : 'fill-gray-300';
          return (
            <g key={i}>
              {isBest && <circle cx={cx} cy={cy} r={9} className="fill-amber-300/20" />}
              {isTap && !isBest && <circle cx={cx} cy={cy} r={9} className="fill-gray-100/15" />}
              <circle
                cx={cx} cy={cy} r={isBest || isTap ? 5.5 : 4}
                className={fill} fillOpacity={isBest || isTap ? 1 : 0.7}
                stroke="currentColor" strokeWidth={1.4} style={{ color: 'rgb(17 24 39)', cursor: 'pointer' }}
                onClick={() => setTap(i)}
              />
              {/* larger invisible touch target */}
              <circle cx={cx} cy={cy} r={12} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => setTap(i)} />
            </g>
          );
        })}
      </svg>
      <p className="text-[11.5px] mt-1.5 px-0.5 flex items-center gap-1.5 tabular-nums">
        {tp ? (
          <>
            <span className={`inline-block w-2 h-2 rounded-full ${isBestOf(tp) ? 'bg-amber-300' : 'bg-gray-200'}`} />
            <span className="text-gray-300">
              <b className="text-gray-100 font-semibold">{paceLabel(valOf(tp))}/mi</b> · {dateLabel(dayNum(tp.date))}
              {tp.hr > 0 ? ` · HR ${tp.hr}` : ''}{isBestOf(tp) ? ' · your best' : ''}
            </span>
          </>
        ) : (
          <>
            <span className="inline-block w-2 h-2 rounded-full bg-amber-300" />
            <span className="text-gray-500">your best · tap a dot for its detail</span>
          </>
        )}
      </p>
    </div>
  );
}

export function RouteDoorway({ verdict }: { verdict: SegmentVerdict | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<'same' | 'pace'>('same');
  if (!verdict || !Array.isArray(verdict.chart_points) || verdict.chart_points.length < 2) return null;

  const v = verdict.verdict;
  const flags = verdict.render_flags;
  const pts = verdict.chart_points;
  const allTime = verdict.runs_all_time;
  const months = Math.max(1, Math.round(v.window_days / 30));
  const pill = PILL[v.direction] ?? PILL.still_learning;

  return (
    <div>
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full -mx-2 px-2 py-2 rounded-lg flex items-center justify-between gap-2 text-left hover:bg-gray-800/40 transition-colors"
      >
        <span className="text-xs text-gray-300">
          Same stretch · ran {allTime}×
          <span className="text-emerald-400 ml-2 font-medium">{open ? 'Hide' : 'View trend'}</span>
        </span>
        <svg
          viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
          className={`shrink-0 text-emerald-400 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* CARD carries the claim — the server-authored verdict copy is the headline. */}
          <div className="rounded-2xl border border-gray-700/60 bg-gray-800/40 p-4">
            <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${pill.tone}`}>{pill.label}</span>
            <p className="text-[19px] font-semibold text-gray-100 mt-2.5 leading-snug">{verdict.copy}</p>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-3 text-[12.5px] text-gray-400 tabular-nums">
              <span><b className="text-gray-200 font-semibold">{v.n}</b> of {allTime} runs</span>
              <span className="text-gray-600">·</span>
              <span>last <b className="text-gray-200 font-semibold">{months} months</b></span>
              {flags.show_pct && v.pct != null && (
                <>
                  <span className="text-gray-600">·</span>
                  <span className={v.pct < 0 ? 'text-amber-300' : 'text-emerald-300'}>
                    {flags.show_arrow ? (v.pct < 0 ? '↓ ' : '↑ ') : ''}{v.pct > 0 ? '+' : ''}{v.pct}%
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Chart — demoted, quiet, flag-driven. No slope unless the server says so. */}
          <div className="rounded-2xl border border-gray-700/60 bg-gray-800/40 p-3">
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Your efforts here</span>
              <div className="inline-flex bg-gray-900/60 rounded-lg p-0.5 gap-0.5">
                {(['same', 'pace'] as const).map((m) => (
                  <button
                    key={m} type="button" onClick={() => setMetric(m)} aria-pressed={metric === m}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${metric === m ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    {m === 'same' ? 'Same-effort' : 'Pace'}
                  </button>
                ))}
              </div>
            </div>
            <SegmentChart pts={pts} metric={metric} showSlope={flags.show_slope} />
          </div>

          {/* Honesty line — kept verbatim. */}
          <p className="text-[12px] text-gray-500 leading-relaxed px-1">
            Not a verdict — a read on whether you’re getting faster on this exact stretch, with hills and
            effort taken out. It stays quiet until the trend is real.
          </p>
        </div>
      )}
    </div>
  );
}
