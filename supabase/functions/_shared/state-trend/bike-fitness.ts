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
import { resolveThresholds, TREND_HALF_DAYS } from './thresholds.ts';
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
// ⛔ WHICH RIDES FEED THE EFFICIENCY TREND — GARMIN'S RULE, AND ONLY GARMIN'S (2026-09-04, Michael: "not a
// single thing on this page should be invented"; "here we go again" when the last gate surfaced).
// Garmin updates its fitness estimate from any ride with at least 10 minutes at aerobic intensity
// (≥70% max HR). That is the inclusion rule here: ≥10 min in the aerobic band, and the ride counts.
//
// Two gates that used to sit beside it are gone, both borrowed thresholds used as filters:
//  - a TYPE gate (endurance / endurance_long / recovery only) — on the reference athlete it dropped 7 of
//    13 rides because the classifier calls stop-and-go city rides tempo / threshold / climbing;
//  - an INTENSITY gate (best-20-min ≥ 90% FTP = "hard", out) — Coggan's 90% is where zone 4 STARTS,
//    a zone boundary, not a rule any product uses to throw rides out of an efficiency trend. It dropped
//    the athlete's best ride (0.98) and left the arrow resting on one ride.
// Net: 3 of 13 rides counted; now 11 of 13. Ledger: docs/STATE-SOURCES.md.
export const MIN_EFFICIENCY_IN_BAND_S = 600; // FIELD — Garmin: ≥10 min at aerobic intensity before a ride informs the estimate

export function bikeEfficiencyRideEligible(
  _classifiedType: string | null | undefined,
  inBandS: number | null | undefined,
  _w20?: number | null,
  _bandHi?: number | null,
): boolean {
  return Number(inBandS) >= MIN_EFFICIENCY_IN_BAND_S;
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
export function efficiencyThresholds(discipline: 'bike' | 'run', _spw: number) {
  // heart rate at the reference power/pace, shown whole (bpm) → precision 0
  return { ...resolveThresholds(discipline, 0), lowerIsBetter: true };
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
  /** The recent representative value in the metric's OWN unit — for efficiency, mean HR at the reference
   *  band across the recent end of the window (bpm). The run row has carried its equivalent ("pace at
   *  134 bpm") since D-356; without it the aerobic read is a direction with nothing to point at, which
   *  is unreadable for the rider who never does hard efforts and therefore only ever sees this row. */
  recentValue?: number | null;
}

/** WHY THE ROW IS NOT SHOWING A THRESHOLD READ — a REASON, never a bare absence (2026-08-01, Michael:
 *  "a user focusing on strength may never hit that 20 minutes — so a user may joy ride").
 *  · `no_hard_efforts` — nothing in a power bin at all. This is a fact about HOW THEY RIDE, not a
 *    failure: FTP needs a sustained hard effort and they have not done one. The endurance-app world
 *    reads this athlete on aerobic decoupling / efficiency factor instead (Friel; TrainingPeaks) —
 *    which is exactly what our efficiency signal is, so the row leads with it and says why.
 *  · `too_few_rides` — they DO ride hard, there are just not enough yet to clear the floor.
 *  These are different sentences on screen and must not collapse into "too few to read", which reads
 *  as the app failing rather than as a true statement about the athlete's riding. */
export type BikePowerSilentReason = 'no_hard_efforts' | 'too_few_rides';

export interface BikeFitness {
  power: BikeSignal; // LEADS the bike verdict
  efficiency: BikeSignal; // secondary read (HR-at-power)
  range?: import('./position-in-range.ts').RangePosition | null; // State v3 DOT: lead metric in 12wk range
  /** ⛔ THE SERVER DECIDES THE LEAD, THE CLIENT RENDERS IT. Both screens used to re-derive this from
   *  `power.verdict !== 'needs_data'`, which silently became wrong the moment `withheld` existed — two
   *  copies of one rule is the divergence the spine exists to prevent. 'none' = neither can assert. */
  lead?: 'power' | 'efficiency' | 'none';
  /** Set whenever `lead` is not 'power'. Null when power is leading. */
  powerSilent?: BikePowerSilentReason | null;
  /** Rides in the window that COULD carry a threshold read (in a power bin, with a 20-min figure).
   *  Zero is the joy-rider signature and is what separates the two silent reasons. */
  hardRideCount?: number;
  /** Q-255: the always-on load read (CTL/TSB verdict words) under the measurement signals. Null when
   *  the athlete has no computed ride load. Optional so cached payloads predating it render unchanged. */
  loadFloor?: import('./load-floor.ts').LoadFloor | null;
}

/** A — terrain-binned 20-min power. Trend each bin like-for-like; surface the FRESHEST bin that
 *  has a real verdict (most-recent newest point), else needs_data. */
export function computeTerrainBinnedPower(rides: BikeEffortRide[], asOf: string, _spw: number): BikeSignal {
  const thresholds = resolveThresholds('bike', 0); // 20-min watts, shown whole
  let best: { verdict: TrendVerdict; t: TrendResult; bin: string } | null = null;
  const newestOf = (t: TrendResult) => (t.points.length ? t.points.map((p) => p.date).sort().pop()! : '');
  for (const [bin, types] of Object.entries(POWER_BINS)) {
    const points: TrendPoint[] = rides
      .filter((r) => r.classified_type && types.has(String(r.classified_type)) && Number(r.w20) > 0)
      .map((r) => ({ date: r.date, value: Number(r.w20) }));
    // Each bin is a like-for-like series; Garmin's 28/28 rule runs per bin and the freshest bin with a read wins.
    const t = classifyTrend(points, thresholds, asOf);
    if (t.verdict === 'needs_data') continue;
    if (!best || newestOf(t) > newestOf(best.t)) best = { verdict: t.verdict, t, bin };
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
  /** points inside Garmin's recent 28-day half flag `recent` */
  verdictDays = TREND_HALF_DAYS,
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
  // recentValue: the recent end of the SAME series the verdict reads (never a fresh pass over the rides),
  // so the number on the row and the direction beside it cannot come from different pools. Falls back to
  // the newest in-window point when there is no verdict, so a blank row can still show what it has.
  const recentValue = t.recentAvg != null
    ? Math.round(t.recentAvg)
    : (t.points.length ? Math.round(t.points[t.points.length - 1].value) : null);
  return { verdict: t.verdict, pctChange: t.pctChange, provisional: isProvisionalTrend(t), basis: null, sampleCount: t.sampleCount, newestAgeDays: t.newestAgeDays, windowDays: t.window?.days, recentValue };
}

/**
 * The efficiency-factor trend — the SAME series the row prints (normalized power ÷ average heart rate,
 * TrainingPeaks EF, shown to 3 decimals), so the number and its arrow come from one pool. 2026-09-04
 * (Michael): the bike efficiency row printed the EF average but its arrow came from the heart-rate-at-
 * power read; same shape as the run row's D-346 override, same fix. Garmin's 28/28 rule via classifyTrend.
 */
export function computeEfficiencyFactorTrend(efPts: TrendPoint[], asOf: string): BikeSignal {
  const t = classifyTrend(efPts, { ...resolveThresholds('bike', 3), lowerIsBetter: false }, asOf);
  const recentValue = t.recentAvg != null
    ? Math.round(t.recentAvg * 1000) / 1000
    : (t.points.length ? Math.round(t.points[t.points.length - 1].value * 1000) / 1000 : null);
  return { verdict: t.verdict, pctChange: t.pctChange, provisional: isProvisionalTrend(t), basis: null, sampleCount: t.sampleCount, newestAgeDays: t.newestAgeDays, windowDays: t.window?.days, recentValue } as BikeSignal;
}

/** Combine into the bike fitness read. Power leads; efficiency is the secondary, alongside. */
export function computeBikeFitness(
  rides: BikeEffortRide[],
  hrAtBand: TrendPoint[],
  asOf: string,
  spw: number,
  /** the ride efficiency-factor series (what the row prints); when present it owns the efficiency verdict */
  efficiencyFactor?: TrendPoint[],
): BikeFitness {
  const power = computeTerrainBinnedPower(rides, asOf, spw);
  const efficiency = efficiencyFactor && efficiencyFactor.length
    ? computeEfficiencyFactorTrend(efficiencyFactor, asOf)
    : computeEfficiencyTrend(hrAtBand, asOf, spw, 'bike');
  // A ride can carry a threshold read only if it landed in a power bin with a 20-min figure. Counted
  // here, once, so the two silent reasons are decided in the same place the signals are.
  const binTypes = new Set(Object.values(POWER_BINS).flatMap((set) => [...set]));
  const hardRideCount = rides.filter((r) => r.classified_type && binTypes.has(String(r.classified_type)) && Number(r.w20) > 0).length;
  const asserts = (v: TrendVerdict) => v !== 'needs_data';
  const lead: 'power' | 'efficiency' | 'none' = asserts(power.verdict) ? 'power' : asserts(efficiency.verdict) ? 'efficiency' : 'none';
  return {
    power,
    efficiency,
    lead,
    powerSilent: lead === 'power' ? null : (hardRideCount === 0 ? 'no_hard_efforts' : 'too_few_rides'),
    hardRideCount,
  };
}
