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

// HR-at-power efficiency is a STEADY-AEROBIC read (TrainingPeaks/Friel: EF & HR-at-power are computed on
// aerobic endurance efforts only, never mixed ride types). The reference band [~56–75% FTP] captures
// INCIDENTAL in-band time on hard rides too (a climb's warmup/descents), where HR is dragged up by the
// overall effort — so feeding climbing/threshold/sweet-spot/tempo rides into the "aerobic efficiency"
// trend fabricates a false direction (verified on Michael's data 2026-07-11: the mid-series HR spike was
// a May CLIMBING block, not declining fitness; aerobic-only, HR-at-band is flat/slightly-up, NOT -5.5%
// improving). Gate the efficiency substrate to steady-aerobic types + a minimum in-band dwell so a
// few-second in-band sample can't count. Q-117 status #2 closed. Mirrors run's isSteadyAerobic.
export const BIKE_EFFICIENCY_AEROBIC_TYPES = new Set(['endurance', 'endurance_long', 'recovery']);
export const MIN_EFFICIENCY_IN_BAND_S = 600; // ≥10 min of aerobic-band dwell for a trustworthy per-ride HR-at-power
// A ride labeled "endurance" but RIDDEN hard still contaminates the HR-at-power read: a threshold-level
// segment jacks in-band HR via cardiac lag (verified on Michael's data — a 165W/94%-FTP "endurance" ride
// read 145bpm and single-handedly faked a -4.7% "improving"). So also require NO threshold-or-harder
// effort: best-20-min power below the Coggan Z4 floor (~90% FTP). FTP is derived from the aerobic band
// ceiling (band_hi = 75% FTP → FTP = band_hi / 0.75), so the gate is per-ride and FTP-change-safe.
const THRESHOLD_FTP_FRACTION = 0.90; // Coggan Z4 (threshold) floor — at/above = a hard effort, not steady aerobic
/** Was the ride ridden as a steady aerobic effort (no threshold-level work)? SHARED by both bike engines
 *  — the spine HR-at-power efficiency AND the coach's within-ride HR-drift row — so "how hard is too hard
 *  to count as an aerobic read" has ONE definition. Best-20-min < 90% FTP (FTP = band_hi / 0.75). Absent
 *  w20/band_hi → true (can't assess intensity; don't over-drop). */
export function bikeRideIntensityAerobic(w20?: number | null, bandHi?: number | null): boolean {
  if (!(Number(w20) > 0) || !(Number(bandHi) > 0)) return true;
  const ftp = Number(bandHi) / 0.75;
  return Number(w20) < ftp * THRESHOLD_FTP_FRACTION;
}
export function bikeEfficiencyRideEligible(
  classifiedType: string | null | undefined,
  inBandS: number | null | undefined,
  w20?: number | null,
  bandHi?: number | null,
): boolean {
  if (!classifiedType || !BIKE_EFFICIENCY_AEROBIC_TYPES.has(String(classifiedType))) return false;
  if (!(Number(inBandS) >= MIN_EFFICIENCY_IN_BAND_S)) return false;
  return bikeRideIntensityAerobic(w20, bandHi);
}

const PROVISIONAL_MAX_N = 4; // n ∈ {minSessions..4} → provisional (near the floor)
const PROVISIONAL_MIN_SPAN_DAYS = 21; // qualifying points clustered in <3wk → provisional

function daysBetween(a: string, b: string): number | null {
  const ta = Date.parse(a + 'T12:00:00Z'), tb = Date.parse(b + 'T12:00:00Z');
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.abs(Math.round((tb - ta) / 86_400_000));
}

/** Efficiency uses the bike cadence-scaled window/min/freshness, but HR%-noise bands (±3%) and
 *  lower-is-better (lower HR at the reference power = improving aerobic efficiency). */
// Q-110: discipline-aware so RUN reuses this engine — HR-at-pace efficiency (lower pace at the same
// HR = improving) is the run analog of bike's HR-at-power. Exported so assemble.ts builds the run
// efficiency trend from the same primitive.
export function efficiencyThresholds(discipline: 'bike' | 'run', spw: number) {
  return { ...resolveThresholds(discipline, spw), improvePct: 3, slidePct: -3, lowerIsBetter: true };
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

export interface BikeEffortRide { date: string; classified_type: string | null; w20: number | null }

// Canonical bike-EFFICIENCY verdict → State-row display (word + tone). ONE vocabulary so the coach's
// BIKE "sessions went" row renders the SAME verdict as the PERFORMANCE bike Efficiency row (which reads
// this spine signal directly) — they can't diverge. The BIKE row previously computed its own within-ride
// HR-drift bands (≤3/5/8%), a different metric that could contradict the spine HR-at-power trend (the one
// remaining run↔bike continuity gap; D-275-bike follow-on). `needs_data`/stale → no verdict. Mirrors run's
// `decouplingBandDisplay`. tone matches the PERFORMANCE VERDICT coloring (improving=positive, holding=warning,
// sliding=danger). The raw per-type HR-drift stays an LLM/detail receipt, not the rendered verdict.
export function bikeEfficiencyDisplay(verdict: string | null | undefined): { word: string | null; tone: 'positive' | 'warning' | 'danger' | 'neutral' } {
  switch (verdict) {
    case 'improving': return { word: 'improving', tone: 'positive' };
    case 'holding':   return { word: 'holding', tone: 'warning' };
    case 'sliding':   return { word: 'sliding', tone: 'danger' };
    default:          return { word: null, tone: 'neutral' }; // needs_data / unknown → no verdict
  }
}

export interface BikeSignal {
  verdict: TrendVerdict;
  pctChange: number | null;
  provisional: boolean;
  basis: string | null; // e.g. the bin name (power) or null (efficiency)
  /** D-232 glass-box receipt evidence — rides in the trend, newest ride age (days), window length (days). */
  sampleCount?: number;
  newestAgeDays?: number | null;
  windowDays?: number;
  /** 12-week dated power series for the sparkline (the "long view" behind the verdict) — the w20 points of
   *  the SAME terrain bin the verdict reads, over a wider 84d window; `recent` flags points inside the
   *  verdict window (rendered in color). Populated only for the POWER signal. Mirrors run efficiency.series. */
  series?: Array<{ date: string; value: number; recent: boolean }>;
}

export interface BikeFitness {
  power: BikeSignal; // LEADS the bike verdict
  efficiency: BikeSignal; // secondary read (HR-at-power)
  range?: import('./position-in-range.ts').RangePosition | null; // State v3 DOT: lead metric in 12wk range
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
  if (!best) return { verdict: 'needs_data', pctChange: null, provisional: false, basis: null, sampleCount: 0, newestAgeDays: null, windowDays: thresholds.windowDays };
  return { verdict: best.verdict, pctChange: best.t.pctChange, provisional: isProvisionalTrend(best.t), basis: best.bin, sampleCount: best.t.sampleCount, newestAgeDays: best.t.newestAgeDays, windowDays: best.t.window?.days };
}

/** 12-week power CHART series for a terrain bin — the w20 points that bin's verdict reads, over a wider
 *  window, recent-flagged. The bin is the WINNING bin (`BikeSignal.basis`) so chart and verdict agree.
 *  Watts rounded to int. Empty when the bin is absent/unknown. Mirrors run efficiency / strength e1RM series.
 *  chartDays default 84 (12wk); verdictDays default 56 (bike window) — points inside it flag `recent`. */
export function bikePowerChartSeries(
  rides: BikeEffortRide[],
  asOf: string,
  bin: string | null,
  chartDays = 84,
  verdictDays = 56,
): Array<{ date: string; value: number; recent: boolean }> {
  if (!bin || !POWER_BINS[bin]) return [];
  const types = POWER_BINS[bin];
  const dayMs = 86_400_000;
  const chartStart = new Date(new Date(asOf + 'T12:00:00Z').getTime() - chartDays * dayMs).toISOString().slice(0, 10);
  const verdictStart = new Date(new Date(asOf + 'T12:00:00Z').getTime() - verdictDays * dayMs).toISOString().slice(0, 10);
  return rides
    .filter((r) => r.classified_type && types.has(String(r.classified_type)) && Number(r.w20) > 0 && r.date > chartStart && r.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, value: Math.round(Number(r.w20)), recent: r.date > verdictStart }));
}

/** B — HR-at-power efficiency. `hrAtBand` = per-ride mean HR in the reference band ({date,value}). */
export function computeEfficiencyTrend(hrAtBand: TrendPoint[], asOf: string, spw: number, discipline: 'bike' | 'run' = 'bike'): BikeSignal {
  const t = classifyTrend(hrAtBand, efficiencyThresholds(discipline, spw), asOf);
  return { verdict: t.verdict, pctChange: t.pctChange, provisional: isProvisionalTrend(t), basis: null, sampleCount: t.sampleCount, newestAgeDays: t.newestAgeDays, windowDays: t.window?.days };
}

/** Combine into the bike fitness read. Power leads; efficiency is the secondary, alongside. */
export function computeBikeFitness(
  rides: BikeEffortRide[],
  hrAtBand: TrendPoint[],
  asOf: string,
  spw: number,
): BikeFitness {
  return {
    power: computeTerrainBinnedPower(rides, asOf, spw),
    efficiency: computeEfficiencyTrend(hrAtBand, asOf, spw),
  };
}
