import { useState } from 'react';

/**
 * Familiar Routes — the session-card DOORWAY + the honest route detail behind it.
 *
 * Progressive disclosure (WHOOP/Strava research): the session shows one plain, tappable familiarity
 * line ("Same route · run 34×"); tapping opens the detail — a glanceable headline (server-authored,
 * rendered verbatim — "arm of State"), then one chart with a Pace/Efficiency toggle and the personal
 * best marked. Heat is parked; the honest read is effort-aware efficiency (speed ÷ HR, State's metric).
 */

type RouteHistoryPoint = {
  date: string;
  pace_s_per_km: number | null;
  hr: number | null;
  is_current?: boolean;
};
type RouteReadout = {
  badge: string;
  headline: string;
  why: string;
  direction: 'improving' | 'holding' | 'declining' | 'still_learning';
  points: number;
} | null;
export type RouteDoorwayData = {
  times_run?: number;
  first_seen?: string | null;
  comparable_runs?: number;
  history?: RouteHistoryPoint[];
  readout?: RouteReadout;
};

const dayNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
const paceLabel = (sPerKm: number) => {
  const perMi = sPerKm * 1.60934;
  const m = Math.floor(perMi / 60);
  const sec = Math.round(perMi - m * 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};
const monthLabel = (x: number) =>
  new Date(x * 864e5).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

type Run = { x: number; pace: number; hr: number; eff: number; date: string };

function ols(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let Sxx = 0, Sxy = 0;
  for (let i = 0; i < n; i++) { Sxx += (xs[i] - mx) ** 2; Sxy += (xs[i] - mx) * (ys[i] - my); }
  const b = Sxx ? Sxy / Sxx : 0;
  return { a: my - b * mx, b };
}

const BADGE_TONE: Record<string, string> = {
  improving: 'text-emerald-300 bg-emerald-500/15',
  holding: 'text-sky-300 bg-sky-500/15',
  declining: 'text-amber-300 bg-amber-500/15',
  still_learning: 'text-gray-300 bg-gray-500/15',
};

function RouteChart({ runs, metric }: { runs: Run[]; metric: 'eff' | 'pace' }) {
  const W = 340, H = 176, mL = 40, mR = 10, mT = 10, mB = 22;
  const invert = metric === 'pace'; // faster (lower time) plotted higher
  const key = metric;
  const x0 = Math.min(...runs.map((r) => r.x));
  const x1 = Math.max(...runs.map((r) => r.x));
  const ys = runs.map((r) => r[key]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = (hi - lo) * 0.14 || 1; lo -= pad; hi += pad;
  const px = (x: number) => mL + (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) * (W - mL - mR);
  const val = (v: number) => invert ? mT + (v - lo) / (hi - lo) * (H - mT - mB) : mT + (hi - v) / (hi - lo) * (H - mT - mB);
  const fmt = (v: number) => (metric === 'pace' ? paceLabel(v) : v.toFixed(1));
  const f = ols(runs.map((r) => r.x), ys);
  const best = runs.reduce((a, b) => (metric === 'pace' ? b.pace < a.pace : b.eff > a.eff) ? b : a);

  const gridY = [0, 1, 2, 3].map((i) => lo + (hi - lo) * i / 3);
  const monthTicks: { x: number; label: string }[] = [];
  const seen = new Set<string>();
  runs.forEach((r) => { const mo = r.date.slice(0, 7); if (!seen.has(mo) && seen.size % 3 === 0) monthTicks.push({ x: r.x, label: monthLabel(r.x) }); seen.add(mo); });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" role="img" aria-label="Route trend over time">
      {gridY.map((v, i) => (
        <g key={i}>
          <line x1={mL} y1={val(v)} x2={W - mR} y2={val(v)} stroke="currentColor" className="text-gray-700/50" strokeWidth={1} />
          <text x={mL - 6} y={val(v) + 3} textAnchor="end" className="fill-gray-500" fontSize={9.5}>{fmt(v)}</text>
        </g>
      ))}
      {monthTicks.map((t, i) => (
        <text key={i} x={px(t.x)} y={H - 6} textAnchor="middle" className="fill-gray-500" fontSize={9}>{t.label}</text>
      ))}
      <line x1={px(x0)} y1={val(f.a + f.b * x0)} x2={px(x1)} y2={val(f.a + f.b * x1)} className="text-emerald-400" stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.85} />
      {runs.map((r, i) => {
        const isBest = r === best;
        return (
          <circle key={i} cx={px(r.x)} cy={val(r[key])} r={isBest ? 5.5 : 4}
            className={isBest ? 'fill-amber-300' : 'fill-emerald-400'}
            stroke="currentColor" strokeWidth={1.4}
            style={{ color: 'rgb(17 24 39)' }}>
            <title>{new Date(r.x * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} · {paceLabel(r.pace)}/mi · HR {r.hr} · eff {r.eff.toFixed(2)}{isBest ? ' · best' : ''}</title>
          </circle>
        );
      })}
    </svg>
  );
}

export function RouteDoorway({ route }: { route: RouteDoorwayData }) {
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<'eff' | 'pace'>('eff');

  const times = Math.max(Number(route?.times_run) || 0, route?.comparable_runs ?? 0, route?.history?.length ?? 0);
  if (times < 2) return null;
  const yr = typeof route?.first_seen === 'string' && route.first_seen.length >= 4 ? route.first_seen.slice(0, 4) : null;

  const runs: Run[] = (route?.history ?? [])
    .filter((p) => p.pace_s_per_km != null && p.pace_s_per_km! > 0 && p.hr != null && p.hr! > 0)
    .map((p) => ({ x: dayNum(p.date), date: p.date, pace: p.pace_s_per_km as number, hr: p.hr as number, eff: (1000 / (p.pace_s_per_km as number)) / (p.hr as number) * 100 }))
    .sort((a, b) => a.x - b.x);

  const readout = route?.readout ?? null;
  const bestPace = runs.length ? paceLabel(runs.reduce((a, b) => (b.pace < a.pace ? b : a)).pace) : '—';
  const thisYear = runs.filter((r) => r.date >= '2026-01-01').length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
      >
        <span>Same route · run {times}×{yr ? ` since ${yr}` : ''}</span>
        <span className="text-gray-500">{open ? '›' : '›'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Tier 1 — glanceable headline (server-authored, verbatim) */}
          {readout && (
            <div className="rounded-2xl border border-gray-700/60 bg-gray-800/40 p-4">
              <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full ${BADGE_TONE[readout.direction] ?? BADGE_TONE.still_learning}`}>
                {readout.badge}
              </span>
              <p className="text-[17px] font-semibold text-gray-100 mt-2 leading-snug">{readout.headline}</p>
              <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">{readout.why}</p>
              <div className="flex gap-2 mt-3">
                <div className="flex-1 rounded-xl bg-gray-900/50 px-3 py-2">
                  <div className="text-[17px] font-bold text-gray-100 tabular-nums">{times}</div>
                  <div className="text-[10.5px] text-gray-500">runs</div>
                </div>
                <div className="flex-1 rounded-xl bg-gray-900/50 px-3 py-2">
                  <div className="text-[17px] font-bold text-gray-100 tabular-nums">{bestPace}</div>
                  <div className="text-[10.5px] text-gray-500">best pace</div>
                </div>
                <div className="flex-1 rounded-xl bg-gray-900/50 px-3 py-2">
                  <div className="text-[17px] font-bold text-gray-100 tabular-nums">{thisYear}</div>
                  <div className="text-[10.5px] text-gray-500">in 2026</div>
                </div>
              </div>
            </div>
          )}

          {/* Tier 2 — one chart, one metric, toggle */}
          {runs.length >= 2 && (
            <div className="rounded-2xl border border-gray-700/60 bg-gray-800/40 p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="inline-flex bg-gray-900/60 rounded-lg p-0.5 gap-0.5">
                  {(['eff', 'pace'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMetric(m)} aria-pressed={metric === m}
                      className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${metric === m ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}>
                      {m === 'eff' ? 'Efficiency' : 'Pace'}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-gray-500">{metric === 'eff' ? 'speed ÷ HR · up = fitter' : 'min/mi · up = faster'}</span>
              </div>
              <RouteChart runs={runs} metric={metric} />
              <p className="text-[11.5px] text-gray-500 mt-1.5 px-0.5 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full border-2 border-amber-300" /> your best on this loop · tap a dot for its detail
              </p>
              <p className="text-[12px] text-gray-500 mt-1.5 leading-relaxed px-0.5">
                {metric === 'eff'
                  ? 'The honest one — speed for the heart rate it cost you. Rising means faster at the same effort.'
                  : 'Every easy run on this loop. The spread is real — some days you push, some you cruise.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
