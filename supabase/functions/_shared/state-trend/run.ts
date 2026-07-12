// Run adapter — GAP pace at comparable effort. Mirrors bike.ts: a source adapter maps the
// stored metric into the source-agnostic {date,value}[], then the shared primitive classifies.
// Metric is sec/km (lower = faster = improving) → RUN_THRESHOLDS.lowerIsBetter.
//
// ⚠️ Thresholds are PROVISIONAL (not signed off) — see thresholds.ts.

import type { TrendPoint, TrendResult, TrendVerdict } from './types.ts';
import { classifyTrend } from './classify.ts';
import { resolveThresholds } from './thresholds.ts';
import { isDeloadWeek } from './deload.ts';

export interface RunState {
  trend: TrendResult;
  metricLabel: string; // "GAP pace at comparable effort"
}

/**
 * Comparable-effort classes for a GAP-pace trend (D-106 strict-intent): only aerobic `easy`
 * runs are comparable. steady_state / tempo / interval are different efforts and excluded.
 *
 * ⚠️ The intent gate reads `workout_analysis.classified_type`, NOT `route_progress_metrics.
 * workout_intent`. The audit found RPM.workout_intent is null at source (compute-facts:930
 * reads `computed.analysis.heart_rate.workout_type`, which is unpopulated), while the real
 * classification lives in `workout_analysis.classified_type` — where 5 of 11 runs read `easy`.
 * So the caller joins classified_type onto each row and this adapter filters on it.
 */
export const COMPARABLE_RUN_EFFORT = new Set(['easy']);
export const isComparableRunEffort = (classifiedType: unknown): boolean =>
  COMPARABLE_RUN_EFFORT.has(String(classifiedType || '').toLowerCase());

// Plausibility band for run GAP pace (sec/km): 2:30–12:30 min/km. Drops corrupt values — the
// audit found one easy run at 2280 s/km (38 min/km), which alone flipped the trend to a bogus
// "improving −66.7%". The root cause of such corrupt GAP values is upstream (compute-facts GAP
// computation), tracked separately; this guard keeps one bad row from poisoning the trend.
const MIN_RUN_PACE_S = 150;
const MAX_RUN_PACE_S = 750;

/**
 * SOURCE ADAPTER: `route_progress_metrics` rows (joined with `classified_type`) → {date,value}[].
 * Value is `effort_adjusted_pace_sec_per_km` (GAP pace); rows are filtered to comparable effort
 * AND to a plausible pace band (corrupt outliers dropped).
 */
export function routeMetricsToSeries(
  rows: Array<{ date?: string; metric_date?: string; effort_adjusted_pace_sec_per_km?: number | null; classified_type?: string | null }> | null | undefined,
): TrendPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => isComparableRunEffort(r.classified_type))
    .map((r) => ({ date: r.date ?? r.metric_date ?? '', value: Number(r.effort_adjusted_pace_sec_per_km) }))
    .filter((p) => p.date && Number.isFinite(p.value) && p.value >= MIN_RUN_PACE_S && p.value <= MAX_RUN_PACE_S);
}

export function computeRunState(series: TrendPoint[], asOf: string, sessionsPerWeek: number): RunState {
  return {
    trend: classifyTrend(series, resolveThresholds('run', sessionsPerWeek), asOf, { exclude: isDeloadWeek }),
    metricLabel: 'GAP pace at comparable effort',
  };
}

// Q-110 — RUN EFFICIENCY: the honest fitness signal (HR-controlled), the run analog of bike's
// HR-at-power. Value is `run_facts.efficiency_index` = (pace-speed / hr_avg), a pace-per-HR ratio
// where HIGHER = fitter (more speed per heartbeat). ⚠️ Opposite direction to pace_at_easy_hr:
// lowerIsBetter is FALSE here. This is the run card's fitness verdict now; raw GAP pace is dropped.
// (pace_at_easy_hr — the stricter easy-HR-band version — is Path B, blocked only on a threshold_hr
// baseline; the sensor samples exist. When that baseline lands, we can upgrade to it.)

// efficiency_index sits ~1.5–1.9 for real runs; this band drops corrupt/zero-HR rows without
// clipping legitimate variation.
const MIN_EFF_INDEX = 0.5;
const MAX_EFF_INDEX = 5;

/** SOURCE ADAPTER (SECONDARY signal): efficiency_index on steady aerobic runs in a comparable-DURATION
 * band (30–70 min). The duration band blunts efficiency_index's whole-run distance confound (longer
 * runs drift lower) — decoupling is the confound-free LEAD, so it's acceptable to thin this secondary. */
export function efficiencyIndexToSeries(
  rows: Array<{ date?: string; metric_date?: string; efficiency_index?: number | null; workout_type?: string | null; duration_minutes?: number | null }> | null | undefined,
): TrendPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => isSteadyAerobic(r.workout_type))
    .filter((r) => typeof r.duration_minutes === 'number' && r.duration_minutes >= 30 && r.duration_minutes <= 70)
    .map((r) => ({ date: r.date ?? r.metric_date ?? '', value: Number(r.efficiency_index) }))
    .filter((p) => p.date && Number.isFinite(p.value) && p.value >= MIN_EFF_INDEX && p.value <= MAX_EFF_INDEX);
}

export function computeRunEfficiencyState(series: TrendPoint[], asOf: string, sessionsPerWeek: number): RunState {
  return {
    // efficiency_index is HIGHER-is-better → lowerIsBetter: false (a RISING index = improving fitness).
    trend: classifyTrend(
      series,
      { ...resolveThresholds('run', sessionsPerWeek), improvePct: 3, slidePct: -3, lowerIsBetter: false },
      asOf,
      { exclude: isDeloadWeek },
    ),
    metricLabel: 'efficiency (pace per HR)',
  };
}

// ── Tier 1: RUN AEROBIC DURABILITY (decoupling) — the RUN row's LEAD signal ──────────────────────
// Within-session pace:HR drift (D-036, GAP-corrected in the analyzer). Zone-free, no baseline, no
// distance confound (it measures within-run drift, not a whole-run average). Source:
// workout_analysis.heart_rate_summary.decouplingPct.
//
// BANDS are a COACHING STANDARD (Joe Friel / TrainingPeaks), NOT a lab-validated physiological
// cutoff — cite them as such, never as peer-reviewed thresholds:
//   negative = excellent · <5% strong aerobic coupling · 5–10% base-building · >10% durability gap.
// ⚠️ DIRECTION IS INVERTED vs efficiency: LOWER decoupling = better → a FALLING pct reads improving,
// a RISING pct reads sliding (durability declining). This is the opposite of efficiency_index.
export type DecouplingBand = 'excellent' | 'strong' | 'base' | 'durability_gap';
export function frielBand(pct: number): DecouplingBand {
  if (pct < 0) return 'excellent';       // HR fell relative to pace across the run = excellent
  if (pct < 5) return 'strong';          // <5% strong aerobic coupling
  if (pct <= 10) return 'base';          // 5–10% base-building
  return 'durability_gap';               // >10% durability gap
}

// D-239 reconcile: the coaching label for a decoupling %, derived from the SAME frielBand the RUN
// row uses — so coach and the State screen can't disagree (coach previously had its own ≤3 cutoff).
// label/tone are the band's plain-language coaching interpretation; band is the single threshold set.
export function decouplingLabel(pct: number | null): { band: DecouplingBand | null; label: string | null; tone: 'positive' | 'warning' | 'danger' | 'neutral' } {
  if (pct == null || !Number.isFinite(pct)) return { band: null, label: null, tone: 'neutral' };
  const band = frielBand(pct);
  switch (band) {
    case 'excellent': return { band, label: 'Excellent aerobic control', tone: 'positive' };
    case 'strong': return { band, label: 'Ran efficiently', tone: 'positive' };
    case 'base': return { band, label: 'HR climbed more than usual', tone: 'warning' };
    case 'durability_gap': return { band, label: 'HR elevated — durability gap', tone: 'danger' };
  }
}

// Gate (the honest one, resolved from Michael's data): steady/aerobic only, ≥20 min, terrain-neutral.
// The persisted `decouplingBasis` label is unreliable (gap on 4/145), so we do NOT gate on 'gap' — we
// trust the GAP-based pct and only DROP a confirmed 'raw' (terrain-confounded). workoutType, not the
// plan-link classifier, decides steady-vs-interval.
const DECOUPLING_NONSTEADY = ['interval', 'tempo', 'fartlek', 'threshold', 'vo2', 'speed', 'track', 'race', 'surge'];
export function isSteadyAerobic(workoutType?: string | null): boolean {
  const wt = String(workoutType || '').toLowerCase();
  return wt.length > 0 && !DECOUPLING_NONSTEADY.some((k) => wt.includes(k));
}

export interface DecouplingRow {
  date?: string; metric_date?: string;
  decoupling_pct?: number | null;
  decoupling_basis?: string | null;   // 'gap' | 'raw' | null — only used to drop confirmed 'raw'
  decoupling_confounded?: boolean | null; // heat/RPE-confounded → not a clean durability read (analyzer-set)
  workout_type?: string | null;       // heart_rate_summary.workoutType
  duration_minutes?: number | null;
}
export function decouplingToSeries(rows: DecouplingRow[] | null | undefined): TrendPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => typeof r.decoupling_pct === 'number' && Number.isFinite(Number(r.decoupling_pct)))
    .filter((r) => r.decoupling_basis !== 'raw')                                  // drop confirmed terrain-confounded
    // Decoupling is only a valid DURABILITY read in controlled conditions (Friel/TrainingPeaks: don't test
    // in heat; Garmin normalizes heat rather than reading a false fitness decline). A run the analyzer flagged
    // heat- or RPE-confounded isn't a clean measurement, so it can't stand up the "durability gap" band — same
    // exclusion the terrain-confounded ('raw') runs already get. The workout screen already explained these as
    // conditions, not fitness; State must not re-derive a contradicting verdict from the raw %.
    .filter((r) => r.decoupling_confounded !== true)
    .filter((r) => isSteadyAerobic(r.workout_type))                              // steady aerobic only
    .filter((r) => r.duration_minutes == null || Number(r.duration_minutes) >= 20) // ≥20 min (null = don't drop)
    .map((r) => ({ date: r.date ?? r.metric_date ?? '', value: Number(r.decoupling_pct) }))
    .filter((p) => p.date && p.value >= -30 && p.value <= 50);                    // plausible decoupling band
}

// classifyTrend drops values ≤ 0 (its noise filter) and divides by earlyAvg for %-change — both break
// on decoupling, which crosses zero. Offsetting the series positive lets us REUSE classifyTrend's
// tested window / min-session floor / endpoint-smoothing / STALENESS gate (the "never extrapolate from
// stale" honesty requirement) unchanged; the band is read from the RAW (un-offset) values.
const DECOUPLING_OFFSET = 30;

export interface DecouplingState {
  trend: TrendResult;          // DIRECTION (lowerIsBetter) + sampleCount + newestAgeDays + stale
  band: DecouplingBand | null; // Friel band of the recent representative pct (the plain-language state)
  recentPct: number | null;    // raw recent decoupling — shown with its date for carry-forward when stale
  metricLabel: string;
}
export function computeRunDecouplingState(series: TrendPoint[], asOf: string, sessionsPerWeek: number): DecouplingState {
  const offset = series.map((p) => ({ date: p.date, value: p.value + DECOUPLING_OFFSET }));
  const trend = classifyTrend(
    offset,
    // lowerIsBetter: a FALLING decoupling = improving durability. improve/slide tuned for the offset scale.
    { ...resolveThresholds('run', sessionsPerWeek), improvePct: 5, slidePct: -5, lowerIsBetter: true },
    asOf,
    { exclude: isDeloadWeek },
  );
  // Recent representative pct (un-offset): the smoothed recent end when there's a verdict, else the
  // newest in-window point so a stale/thin row can still carry-forward "last steady run Nd ago: X%".
  const rawPts = trend.points.map((p) => p.value - DECOUPLING_OFFSET);
  const recentPct = trend.recentAvg != null
    ? Math.round((trend.recentAvg - DECOUPLING_OFFSET) * 10) / 10
    : rawPts.length ? rawPts[rawPts.length - 1] : null;
  return {
    trend,
    band: recentPct != null ? frielBand(recentPct) : null,
    recentPct,
    metricLabel: 'aerobic durability',
  };
}

// The RUN row's dual read (mirrors BikeFitness power+efficiency): decoupling LEADS (aerobic
// durability, band-as-verdict), efficiency_index is the SECONDARY output-per-heartbeat read.
// Serializable snapshot for the client — no methods, safe to cache in state_trends_v1.
export interface RunFitness {
  decoupling: {
    verdict: TrendVerdict;         // improving = durability building; sliding = declining
    band: DecouplingBand | null;   // the plain-language state (strong/base/durability_gap/excellent)
    recentPct: number | null;      // shown with its date for carry-forward when stale
    sampleCount: number;
    newestAgeDays: number | null;
    stale: boolean;                // true → carry-forward "last steady run Nd ago", never a current verdict
    provisional: boolean;
  };
  efficiency: {
    verdict: TrendVerdict;
    pctChange: number | null;
    sampleCount: number;
    newestAgeDays: number | null;
  };
}
