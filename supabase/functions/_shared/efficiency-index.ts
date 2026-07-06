// Single definition of run "efficiency" (pace-per-HR) — the source of truth both State and the
// per-session same-route line read from, so they cannot fork on the metric.

/**
 * Canonical run efficiency index. Mirrors `compute-facts/index.ts` (`run_facts.efficiency_index`)
 * EXACTLY: `round( (1000 / pace_avg_s_per_km) / hr_avg * 10000 ) / 100`
 * — `1000/pace_s_per_km` = speed in m/s; divided by average HR; scaled for readability. HIGHER = more
 * efficient (faster for the same heart rate). State reads the STORED `run_facts.efficiency_index`; the
 * same-route line recomputes with THIS function from the route pool's pace+HR. One formula, two call
 * sites → guaranteed identical numbers (asserted in efficiency-index.test.ts).
 */
export function computeEfficiencyIndex(
  paceSecPerKm: number | null | undefined,
  hrAvg: number | null | undefined,
): number | null {
  const p = Number(paceSecPerKm);
  const h = Number(hrAvg);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(h) || h <= 0) return null;
  return Math.round((1000 / p) / h * 10000) / 100;
}

export interface RouteEffRow {
  date?: string;
  pace_s_per_km?: number | null;
  hr?: number | null;
}

export interface RouteEfficiency {
  direction: 'improving' | 'holding' | 'declining';
  pct: number;    // signed % change in efficiency index, first half → second half (1 dp)
  points: number; // # of same-route runs with usable pace + HR
}

// Need at least this many same-route runs (within the caller's 90-day window) WITH usable pace+HR
// before claiming a direction. 4 is the floor where a half-vs-half split (2 vs 2) means anything;
// below it the caller shows NOTHING (route familiarity only) — per Michael, no trend beats a thin one.
export const ROUTE_EFF_MIN_POINTS = 4;
// Efficiency-index change inside this band reads as "holding", not a real move.
const ROUTE_EFF_HOLDING_PCT = 2;

/**
 * Same-route efficiency DIRECTION from the route pool (pace + HR per run), via the canonical index.
 * Sorted oldest→newest, first-half avg index vs second-half avg index; a RISING index = improving
 * (higher is better). Returns null when there aren't enough usable points to honestly claim a
 * direction — the caller shows a cold-start "building history" line instead of faking a trend.
 * Uses RAW pace (`pace_s_per_km`) to match `run_facts.efficiency_index`; same-route already controls
 * grade, so no GAP adjustment is needed here.
 */
export function routeEfficiencyDirection(
  history: RouteEffRow[] | null | undefined,
): RouteEfficiency | null {
  const idx = (Array.isArray(history) ? history : [])
    .map((r) => ({ date: String(r?.date ?? ''), v: computeEfficiencyIndex(r?.pace_s_per_km, r?.hr) }))
    .filter((r): r is { date: string; v: number } => r.v != null);
  if (idx.length < ROUTE_EFF_MIN_POINTS) return null;
  idx.sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.ceil(idx.length / 2);
  const avg = (arr: Array<{ v: number }>) => arr.reduce((s, r) => s + r.v, 0) / arr.length;
  const first = avg(idx.slice(0, mid));
  const second = avg(idx.slice(mid));
  if (!(first > 0)) return null;
  const pct = Math.round(((second - first) / first) * 1000) / 10;
  const direction = pct >= ROUTE_EFF_HOLDING_PCT ? 'improving' : pct <= -ROUTE_EFF_HOLDING_PCT ? 'declining' : 'holding';
  return { direction, pct, points: idx.length };
}
