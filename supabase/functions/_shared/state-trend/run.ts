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
    // ── D-275's heat EXCLUSION is REMOVED (Q-170). Hot runs are KEPT. ───────────────────────────────
    // The old line here was `.filter((r) => r.decoupling_confounded !== true)`, and the comment
    // justifying it cited Garmin — while doing the OPPOSITE of what Garmin does. Research (2026-07-13,
    // adversarially verified) found NO shipped product discards a session from a decoupling/efficiency/
    // fitness trend because it was hot:
    //   · Garmin ADJUSTS: above 22C/72F it applies heat corrections to a RETAINED VO2max/Training Status
    //     estimate (patent US 11,998,802 — a multiplicative correction, e.g. 50 x 1.082 = 54.1). Firstbeat's
    //     stated rationale is the anti-exclusion argument itself: without correction the number falls in heat
    //     and gives the athlete "false discouraging feedback".
    //   · TrainingPeaks COMPUTES AND SHOWS Pa:Hr regardless of conditions (fixed 5% band) and names heat as
    //     an EXPLANATION the athlete weighs — not a reason to bin the session.
    //   · Runalyze INCLUDES every hot run in its rolling 30d shape, acknowledges the ~2-point summer sag, and
    //     frames it as something to CANCEL OUT. It HAS a per-activity exclusion switch; heat never triggers it.
    // The science agrees it is a modelable confound, not corrupt data: HR drift ~11% at 35C vs ~2% at 22C in
    // the same subjects at the same workload, dose-dependent with temperature.
    //
    // THE FAILURE MODE THE EXCLUSION CAUSED (real, observed): it is July, every run is hot, so every run was
    // dropped — the durability read fell to 4 samples with the newest 15 DAYS OLD, and State kept printing
    // "aerobic base needs work" as flat fact off a stale, self-flagged-provisional trend. Excluding data does
    // not make a verdict honest; it makes it BLIND. D-275 diagnosed a real bug (one 80F run flashing a red
    // "durability gap") and picked the wrong remedy: the field's remedy is to KEEP the number and NAME the heat.
    //
    // So the confound is no longer a filter — it is CARRIED (see `confoundedCount` on DecouplingState) so the
    // surface can say "needs work — 2 of 6 runs were hot" instead of silently going stale.
    .filter((r) => isSteadyAerobic(r.workout_type))                              // steady aerobic only
    .filter((r) => r.duration_minutes == null || Number(r.duration_minutes) >= 20) // ≥20 min (null = don't drop)
    .map((r) => ({ date: r.date ?? r.metric_date ?? '', value: Number(r.decoupling_pct) }))
    .filter((p) => p.date && p.value >= -30 && p.value <= 50);                    // plausible decoupling band
}

/**
 * Q-170: how many runs IN the durability substrate were flagged heat/condition-confounded by the analyzer.
 * They are no longer dropped (see above) — so the surface must be able to SAY they are in there. This is the
 * TrainingPeaks posture: show the number, name the conditions. A verdict that hides its own confounds is the
 * same lie as a verdict that hides its own staleness.
 */
export function countConfoundedInSeries(rows: DecouplingRow[] | null | undefined): number {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((r) =>
    typeof r.decoupling_pct === 'number' && Number.isFinite(Number(r.decoupling_pct))
    && r.decoupling_basis !== 'raw'
    && isSteadyAerobic(r.workout_type)
    && (r.duration_minutes == null || Number(r.duration_minutes) >= 20)
    && r.decoupling_confounded === true,
  ).length;
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
  /** Q-170: how many runs in this substrate were heat/condition-confounded. The surface NAMES them
   *  (TrainingPeaks posture) instead of the trend silently going stale (the D-275 exclusion). */
  confoundedCount: number;
}
export function computeRunDecouplingState(series: TrendPoint[], asOf: string, sessionsPerWeek: number, confoundedCount = 0): DecouplingState {
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
  return { confoundedCount,
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
