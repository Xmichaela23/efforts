// Run adapter — GAP pace at comparable effort. Mirrors bike.ts: a source adapter maps the
// stored metric into the source-agnostic {date,value}[], then the shared primitive classifies.
// Metric is sec/km (lower = faster = improving) → RUN_THRESHOLDS.lowerIsBetter.
//
// ⚠️ Thresholds are PROVISIONAL (not signed off) — see thresholds.ts.

import type { TrendPoint, TrendResult, TrendVerdict } from './types.ts';
import type { RangePosition } from './position-in-range.ts';
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

/** SOURCE ADAPTER: run efficiency on steady aerobic runs in a comparable-DURATION band (30–70 min).
 * GRADE-ADJUSTED (2026-07-21): reads `gap_efficiency_index` (GAP-pace ÷ HR — terrain-honest, the
 * "faster at the same heart rate" number) and falls back to the raw `efficiency_index` only where GAP
 * is absent (flat / treadmill runs, where raw pace IS the grade-adjusted pace). So a hilly run no
 * longer reads as false decline. This is the run row's LEAD now — decoupling becomes the secondary
 * durability read. The duration band blunts the whole-run distance confound. */
export function efficiencyIndexToSeries(
  rows: Array<{ date?: string; metric_date?: string; efficiency_index?: number | null; gap_efficiency_index?: number | null; workout_type?: string | null; duration_minutes?: number | null }> | null | undefined,
): TrendPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => isSteadyAerobic(r.workout_type))
    .filter((r) => typeof r.duration_minutes === 'number' && r.duration_minutes >= 30 && r.duration_minutes <= 70)
    .map((r) => ({ date: r.date ?? r.metric_date ?? '', value: Number(r.gap_efficiency_index ?? r.efficiency_index) }))
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
// Q-161 (2026-07-12): banded to the ONE science-defensible line. Friel/TrainingPeaks publish a single
// ~5% cutoff (≤5% = aerobic base is sound; >5% = needs base work, after ruling out heat/hills/short
// efforts) — there is NO published second threshold, and a separate "excellent" tier for negative drift
// is not defensible (a negative usually reflects a soft start, not superior durability). So the old
// 4-tier convention (<0 excellent / <5 strong / 5–10 base / >10 gap) collapses to two honest states.
// Sources: TrainingPeaks (Friel), Intervals.icu, Uphill Athlete AeT drift test, Muniz-Pumares durability
// literature — the 5% line is the only one with authorship + platform + literature backing. A read >10%
// is NOT a separate user grade (it reads 'needs_work'); it more often means a confound slipped the
// upstream gate — which is already filtered on the inputs (steady/aerobic, ≥20min, terrain-neutral).
// ⚠️ DIRECTION IS INVERTED vs efficiency: LOWER decoupling = better → a FALLING pct reads improving,
// a RISING pct reads sliding (durability declining). This is the opposite of efficiency_index.
export type DecouplingBand = 'sound' | 'needs_work';
export function frielBand(pct: number): DecouplingBand {
  return pct < 5 ? 'sound' : 'needs_work'; // ≤5% (incl. negatives) = base sound; >5% = build more base
}

// D-239 reconcile: the coaching label for a decoupling %, derived from the SAME frielBand the RUN row
// uses — so coach and the State screen can't disagree. label/tone are the band's plain-language coaching
// interpretation; band is the single threshold set.
export function decouplingLabel(pct: number | null): { band: DecouplingBand | null; label: string | null; tone: 'positive' | 'warning' | 'danger' | 'neutral' } {
  if (pct == null || !Number.isFinite(pct)) return { band: null, label: null, tone: 'neutral' };
  const band = frielBand(pct);
  // >5% is a "build more base" cue (or a residual confound), NOT an alarm → warning, never danger.
  return band === 'sound'
    ? { band, label: 'Aerobic base held', tone: 'positive' }
    : { band, label: 'HR drifted — build aerobic base', tone: 'warning' };
}

// Canonical band → State-row display (word + tone). ONE vocabulary for every surface that renders the
// durability band — the PERFORMANCE trend row AND the AERO session row read this, so they can't diverge
// in words. This is the display twin of `decouplingLabel` (the per-workout receipt phrasing); State rows
// use THIS so AERO ≡ PERFORMANCE.
export function decouplingBandDisplay(band: DecouplingBand | null): { word: string | null; tone: 'positive' | 'warning' | 'danger' | 'neutral' } {
  switch (band) {
    case 'sound': return { word: 'aerobic base is sound', tone: 'positive' };
    case 'needs_work': return { word: 'aerobic base needs work', tone: 'warning' };
    default: return { word: null, tone: 'neutral' };
  }
}

// Gate (the honest one, resolved from Michael's data): steady/aerobic only, ≥20 min, terrain-neutral.
// The persisted `decouplingBasis` label is unreliable (gap on 4/145), so we do NOT gate on 'gap' — we
// trust the GAP-based pct and only DROP a confirmed 'raw' (terrain-confounded). workoutType, not the
// plan-link classifier, decides steady-vs-interval.
//
// ⛔ 2026-07-14 — WHY THIS DROP EMPTIED THE TREND, and the rule that comes out of it.
// 'raw' meant ONE thing here: no usable elevation, so the pace was never grade-adjusted. On 2026-07-12
// the analyzer started ALSO forcing basis='raw' whenever the variance gate flagged a session as
// mixed-effort (D-037) — a "this number is low-confidence" stamp. This filter read that stamp as a
// DELETE order. The variance gate fires on ~10 of 11 real outdoor runs (pace CV 12-29% is just
// running: hills, lights, corners), so every run after the restore was binned and the durability
// trend stopped advancing — last counting run 2026-06-28, silently 16 days stale on a live screen.
// The analyzer now keeps the two facts apart: `basis` = terrain, `decouplingMixedEffort` = confidence.
// A mixed-effort STEADY run keeps its point here; the confidence caveat is carried in the prose.
// THE RULE: a confidence flag is not an exclusion order. If a metric should be dropped, drop it on the
// fact that makes it wrong — never on a label that happens to be spelled the same.
const DECOUPLING_NONSTEADY = ['interval', 'tempo', 'fartlek', 'threshold', 'vo2', 'speed', 'track', 'race', 'surge'];
export function isSteadyAerobic(workoutType?: string | null): boolean {
  const wt = String(workoutType || '').toLowerCase();
  return wt.length > 0 && !DECOUPLING_NONSTEADY.some((k) => wt.includes(k));
}

export interface DecouplingRow {
  date?: string; metric_date?: string;
  /** Source workout id — carried so the baseline derivation can name the SOURCE EVENT of a picked run. */
  workout_id?: string | null;
  decoupling_pct?: number | null;
  decoupling_basis?: string | null;   // 'gap' | 'raw' | null — TERRAIN only; used to drop confirmed 'raw'
  /** Variance gate: heterogeneous efforts → the ratio is low-confidence. A HEDGE, never a filter.
   *  Kept in the substrate so the row can say so; see the block above for what happened when
   *  this fact was smuggled through `decoupling_basis` instead. */
  decoupling_mixed_effort?: boolean | null;
  /** Analyzer-set heat flag. STILL STAMPED, and the WORKOUT screen still uses it to say "it was 80°F".
   *  It is deliberately NOT a substrate filter any more — see the block below (D-283). */
  decoupling_confounded?: boolean | null;
  workout_type?: string | null;       // heart_rate_summary.workoutType
  duration_minutes?: number | null;
}

// ── D-283 (supersedes D-275's heat gate) — HOT RUNS ARE KEPT. Measured, not assumed. ──────────────
//
// D-275 dropped every heat-confounded run from this substrate, justified as "field-standard". Both halves
// of that were wrong, and the second one was checked against real data (`scripts/verify-heat-decoupling-*.mjs`):
//
//  1. NOT FIELD-STANDARD. No shipped product discards a session from a decoupling/efficiency/fitness trend
//     because it was hot. Garmin ADJUSTS a RETAINED estimate (and only VO2max/Training Status — it ships no
//     decoupling trend at all, and its correction is ACCLIMATION-scaled, so an acclimated athlete's
//     correction tends to zero). TrainingPeaks INVENTED Pa:Hr and shows it raw. Runalyze keeps every hot run.
//     Deleting the session is the one option nobody ships.
//
//  2. NO HEAT EFFECT TO CORRECT FOR — on the only real data we have. Regressing decoupling on
//     heatTerm = max(0, tempF - 60) over 81 steady runs: slope -0.135 %/degF, t = -1.07, r^2 = 0.014, and the
//     95% CI straddles zero under EVERY specification (raw, trimmed, positive-only). Median decoupling by
//     temperature bucket does not rise with heat — it FALLS (<65F: 4.9% -> >80F: 1.45%). The textbook effect
//     (~+0.39 %/degF) sits OUTSIDE the CI. So the exclusion was not protecting the athlete from a hot-run lie;
//     it was DELETING HIS BEST DATA (his hot runs read strongest).
//
// The July-5 bug D-275 was written to fix is ALREADY fixed by other gates, and is pinned as such below: a
// lone run — hot or not — yields `needs_data` on the min-sessions floor, and BOTH surfaces gate on
// `verdict !== 'needs_data'` before rendering a band. The heat filter was redundant with the floor.
//
// ⚠ DO NOT re-add a heat FILTER, and do not add a heat ADJUSTMENT off a population curve. If a heat
// correction is ever built it must be a PER-ATHLETE fitted coefficient that applies nothing when the
// athlete's own data does not earn it (the machinery already exists: `_shared/heat-adjust.ts` fits the
// coefficient by regression and refuses when heat and fitness are not separable). This athlete exercises
// the "refuse" branch; correcting him would be multiplying by 1 with extra steps.
/** The SINGLE "does this run count for durability?" rule — steady aerobic, ≥20 min, not terrain-confirmed-
 *  raw, plausible band. Exported so the BASELINE DERIVATION (baseline-derive.ts) qualifies its candidate
 *  runs with the EXACT same predicate the trend uses — one rule, no second copy that could drift. */
export function isQualifyingDecouplingRow(r: DecouplingRow): boolean {
  if (!(typeof r.decoupling_pct === 'number' && Number.isFinite(Number(r.decoupling_pct)))) return false;
  if (r.decoupling_basis === 'raw') return false;               // drop confirmed terrain-confounded
  if (!isSteadyAerobic(r.workout_type)) return false;           // steady aerobic only
  if (!(r.duration_minutes == null || Number(r.duration_minutes) >= 20)) return false; // ≥20 min (null = keep)
  const v = Number(r.decoupling_pct);
  return v >= -30 && v <= 50;                                   // plausible decoupling band
}

export function decouplingToSeries(rows: DecouplingRow[] | null | undefined): TrendPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isQualifyingDecouplingRow)
    .map((r) => ({ date: r.date ?? r.metric_date ?? '', value: Number(r.decoupling_pct) }))
    .filter((p) => !!p.date);
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
export function computeRunDecouplingState(series: TrendPoint[], asOf: string, sessionsPerWeek: number, directionFloor?: number): DecouplingState {
  const offset = series.map((p) => ({ date: p.date, value: p.value + DECOUPLING_OFFSET }));
  const trend = classifyTrend(
    offset,
    // lowerIsBetter: a FALLING decoupling = improving durability. improve/slide tuned for the offset scale.
    { ...resolveThresholds('run', sessionsPerWeek), improvePct: 5, slidePct: -5, lowerIsBetter: true },
    asOf,
    // noiseGuardStdev: decoupling swings run-to-run on confounds we can't see (weather/sleep/fatigue), so
    // the early→recent shift must beat 1 SD of the series' own scatter — else it's noise and reads holding.
    // directionFloor: below N qualifying steady runs in the window, no direction is asserted → 'withheld'.
    { exclude: isDeloadWeek, noiseGuardStdev: 1.0, directionFloor },
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
    verdict: TrendVerdict;         // improving = durability building; sliding = declining (the ARROW)
    band: DecouplingBand | null;   // the plain-language state (strong/base/durability_gap/excellent)
    range: RangePosition | null;   // State v3 DOT: where the current value sits in the 12wk range (best=1)
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
    recentlyFlat?: boolean;         // sliding split: true = dropped then levelled ("settled lower")
  };
}
