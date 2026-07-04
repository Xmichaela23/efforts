// Bike fitness — the cycling instance of the sport-agnostic per-session engine (Step 3).
// TWO signals to the STATE bike row, both via the shared classifyTrend primitive:
//   A — Terrain-binned 20-min power (the "power ↑" read): binned like-for-like so a climb vs a
//       flat effort isn't mixed (the cross-terrain artifact the bike audit rejected).
//   B — HR-at-power efficiency (the "efficiency ↓" read): per-ride mean HR in the rider's
//       reference band (from resolveZoneBand), trended lower-is-better.
// Power LEADS the bike verdict (direct fitness output); efficiency is the secondary read, shown
// alongside — when they disagree ("Power ↑ · Efficiency ↓") both are surfaced, never collapsed.
//
// Sport-agnostic: the grade/HR/elevation half is shared; only the EFFORT metric is sport-specific
// (bike = power, run = pace). The run instance reuses this shape — binned GAP pace + HR-at-pace.

import { classifyTrend } from './classify.ts';
import { resolveThresholds } from './thresholds.ts';
import type { TrendPoint, TrendResult, TrendVerdict } from './types.ts';

// Terrain bins — group by whether 20-min power is comparable. CLIMBING distinct (gravity-loaded);
// flat near/sub-FTP efforts comparable. vo2/anaerobic = no real 20-min max; endurance = aerobic-only
// (its 20-min "best" isn't a fitness max) → both excluded from the power trend (endurance → EF).
export const POWER_BINS: Record<string, Set<string>> = {
  climbing: new Set(['climbing']),
  flat_sustained: new Set(['threshold', 'sweet_spot', 'tempo']),
};

// Decoupling (Pw:HR drift) is an AEROBIC-DURABILITY read — valid only on STEADY, sub-threshold
// efforts (the same comparable-effort discipline the run trend uses for easy pace). Intervals/
// threshold/climbing/recovery are excluded: variable power or at-limit drift isn't durability.
// This is the INTENT gate on top of the ≥20-min duration gate already applied at computation.
export const COMPARABLE_DECOUPLING_EFFORT = new Set(['endurance', 'tempo', 'sweet_spot']);

const PROVISIONAL_MAX_N = 4; // n ∈ {minSessions..4} → provisional (near the floor)
const PROVISIONAL_MIN_SPAN_DAYS = 21; // qualifying points clustered in <3wk → provisional

function daysBetween(a: string, b: string): number | null {
  const ta = Date.parse(a + 'T12:00:00Z'), tb = Date.parse(b + 'T12:00:00Z');
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.abs(Math.round((tb - ta) / 86_400_000));
}

/** Efficiency uses the bike cadence-scaled window/min/freshness, but HR%-noise bands (±3%) and
 *  lower-is-better (lower HR at the reference power = improving aerobic efficiency). */
function efficiencyThresholds(spw: number) {
  return { ...resolveThresholds('bike', spw), improvePct: 3, slidePct: -3, lowerIsBetter: true };
}

/** Provisional when the trend rests on near-floor n (3–4) or a clustered <21d span. */
export function isProvisionalTrend(t: TrendResult): boolean {
  if (t.verdict === 'needs_data') return false;
  if (t.sampleCount >= 3 && t.sampleCount <= PROVISIONAL_MAX_N) return true;
  if (t.points.length >= 2) {
    const dates = t.points.map((p) => p.date).sort();
    const span = daysBetween(dates[0], dates[dates.length - 1]);
    if (span != null && span < PROVISIONAL_MIN_SPAN_DAYS) return true;
  }
  return false;
}

export interface BikeEffortRide {
  date: string;
  classified_type: string | null;
  w20: number | null;
  /** EF = normalized power / avg HR (higher = better). */
  efficiency_factor?: number | null;
  /** Friel aerobic decoupling % (lower = better). Present only for steady ≥20-min efforts. */
  aerobic_decoupling_pct?: number | null;
  /** HR rejected as corrupt (flaky strap / cadence-lock) → excluded from HR-derived reads (EF, decoupling). */
  hr_corrupt?: boolean;
}

export interface BikeSignal {
  verdict: TrendVerdict;
  pctChange: number | null;
  provisional: boolean;
  basis: string | null; // e.g. the bin name (power) or null
  /** The current level for the GLANCE display (recent-avg): EF ~1.85, decoupling ~4.1%. Null when needs_data. */
  value?: number | null;
  /** D-232 glass-box receipt evidence — rides in the trend, newest ride age (days), window length (days). */
  sampleCount?: number;
  newestAgeDays?: number | null;
  windowDays?: number;
}

export interface BikeFitness {
  power: BikeSignal;      // LEADS the bike verdict (direct output — w20)
  efficiency: BikeSignal; // EF (NP/HR), higher = better
  decoupling: BikeSignal; // Pw:HR aerobic decoupling, lower = better (steady efforts only)
}

/** A — terrain-binned 20-min power. Trend each bin like-for-like; surface the FRESHEST bin that
 *  has a real verdict (most-recent newest point), else needs_data. */
export function computeTerrainBinnedPower(rides: BikeEffortRide[], asOf: string, spw: number): BikeSignal {
  const thresholds = resolveThresholds('bike', spw);
  let best: { verdict: TrendVerdict; t: TrendResult; bin: string } | null = null;
  for (const [bin, types] of Object.entries(POWER_BINS)) {
    const points: TrendPoint[] = rides
      .filter((r) => r.classified_type && types.has(String(r.classified_type)) && Number(r.w20) > 0)
      .map((r) => ({ date: r.date, value: Number(r.w20) }));
    const t = classifyTrend(points, thresholds, asOf);
    if (t.verdict === 'needs_data') continue;
    const newest = t.points.length ? t.points.map((p) => p.date).sort().pop()! : '';
    if (!best || newest > (best.t.points.map((p) => p.date).sort().pop() || '')) best = { verdict: t.verdict, t, bin };
  }
  if (!best) return { verdict: 'needs_data', pctChange: null, provisional: false, basis: null, value: null, sampleCount: 0, newestAgeDays: null, windowDays: thresholds.windowDays };
  return { verdict: best.verdict, pctChange: best.t.pctChange, provisional: isProvisionalTrend(best.t), basis: best.bin, value: best.t.recentAvg != null ? Math.round(best.t.recentAvg) : null, sampleCount: best.t.sampleCount, newestAgeDays: best.t.newestAgeDays, windowDays: best.t.window?.days };
}

/** B — Efficiency Factor (NP/HR) trend, HIGHER = better. Excludes rides whose HR was rejected
 *  as corrupt (D-237 — EF uses HR, so a flaky-strap ride would poison it). value = current EF level. */
export function computeEfficiencyFactorTrend(rides: BikeEffortRide[], asOf: string, spw: number): BikeSignal {
  const pts: TrendPoint[] = rides
    .filter((r) => !r.hr_corrupt && Number(r.efficiency_factor) > 0)
    .map((r) => ({ date: r.date, value: Number(r.efficiency_factor) }));
  const t = classifyTrend(pts, resolveThresholds('bike', spw), asOf); // bike default = higher-better
  return { verdict: t.verdict, pctChange: t.pctChange, provisional: isProvisionalTrend(t), basis: null, value: t.recentAvg != null ? Math.round(t.recentAvg * 100) / 100 : null, sampleCount: t.sampleCount, newestAgeDays: t.newestAgeDays, windowDays: t.window?.days };
}

/** C — Pw:HR aerobic decoupling trend, LOWER = better (tightening). Gated to STEADY aerobic efforts
 *  (COMPARABLE_DECOUPLING_EFFORT) on top of the ≥20-min computation gate, and excludes corrupt HR.
 *  needs_data when too few qualifying rides — never a placeholder. value = current decoupling %. */
export function computeDecouplingTrend(rides: BikeEffortRide[], asOf: string, spw: number): BikeSignal {
  const pts: TrendPoint[] = rides
    .filter((r) => !r.hr_corrupt
      && r.classified_type != null && COMPARABLE_DECOUPLING_EFFORT.has(String(r.classified_type))
      && r.aerobic_decoupling_pct != null && Number.isFinite(Number(r.aerobic_decoupling_pct)))
    .map((r) => ({ date: r.date, value: Number(r.aerobic_decoupling_pct) }));
  const thresholds = { ...resolveThresholds('bike', spw), lowerIsBetter: true, improvePct: 5, slidePct: -5 };
  const t = classifyTrend(pts, thresholds, asOf);
  return { verdict: t.verdict, pctChange: t.pctChange, provisional: isProvisionalTrend(t), basis: null, value: t.recentAvg != null ? Math.round(t.recentAvg * 10) / 10 : null, sampleCount: t.sampleCount, newestAgeDays: t.newestAgeDays, windowDays: t.window?.days };
}

/** Combine into the bike fitness read. Power leads; EF + decoupling are secondary, alongside. */
export function computeBikeFitness(rides: BikeEffortRide[], asOf: string, spw: number): BikeFitness {
  return {
    power: computeTerrainBinnedPower(rides, asOf, spw),
    efficiency: computeEfficiencyFactorTrend(rides, asOf, spw),
    decoupling: computeDecouplingTrend(rides, asOf, spw),
  };
}
