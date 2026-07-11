/**
 * Cycling cross-workout query system — Tier 3 item 10. Implements the four design
 * decisions from D-010 (see docs/DECISIONS-LOG.md):
 *   1. Power-curve PRs (1min/5min/20min) on 90d rolling + all-time windows.
 *   2. vs-similar matching on classified_type + duration ±20%.
 *   3. W/kg vs age-group norms for triathletes (limiter signal).
 *   4. NP-trend vs 90d mean as the fallback when W/kg can't be computed.
 *
 * Mirrors the structure of `_shared/fact-packet/queries.ts` (running's reference) at a
 * smaller footprint (~250 lines vs running's 805) — most of running's bulk is sport-
 * specific terrain / segment / pace concepts that don't translate to cycling. This
 * file keeps the shape (one async function per surface area; null on insufficient data;
 * try/catch wrappers so analyzer failures stay non-fatal).
 *
 * All three query functions are designed to be called from `analyze-cycling-workout`
 * with the supabase client, user_id, and current workout context already in scope.
 * Network failures inside the queries are swallowed (return null / 'insufficient_data');
 * an analyzer pipeline run never blocks on a cross-workout query that hit a snag.
 */

import type {
  CyclingLimiterV1,
  CyclingPoolIntensityFilter,
  CyclingPoolPowerContext,
  CyclingPRDuration,
  CyclingPRDurationEntry,
  CyclingPREntry,
  CyclingPRsV1,
  CyclingVsSimilarV1,
} from './cross-workout-types.ts';
import { getHrDriftBpmFromAnalysis, getOverallAvgHr } from '../fact-packet/queries.ts';

// ─── Constants ────────────────────────────────────────────────────────────

const PR_DURATIONS: CyclingPRDuration[] = ['1min', '5min', '20min'];
const RECENT_WINDOW_DAYS = 90;
/** Minimum ride count before PRs are surfaced (D-010 minimum-data guard). */
const MIN_RIDES_FOR_PRS = 5;
/** Minimum match count before vs-similar is surfaced (D-010 minimum-data guard). */
const MIN_MATCHES_FOR_VS_SIMILAR = 3;
/** ±20% duration tolerance per D-010 vs-similar matching rule. */
const DURATION_TOLERANCE_PCT = 0.2;
/**
 * D-073 (mirror of D-038 run-side `POOL_PACE_TOLERANCE_PCT = 15`): IF-proximity
 * filter tolerance. Pool keeps rides within ±15% of the current ride's IF;
 * 3-hit fallback to unfiltered when the filter would leave <3 matches. Locked.
 */
const POOL_IF_TOLERANCE_PCT = 15;
/**
 * D-073 (mirror of D-038 run-side `POOL_INTENSITY_MATCH_PCT = 10`): boundary
 * where `intensity_match` flips to `current_much_harder` / `current_much_easier`.
 * The 5-point gap between filter (15%) and match (10%) lets a pool be filtered
 * in but still flagged as a different intensity class to the LLM.
 */
const POOL_INTENSITY_MATCH_PCT = 10;

/**
 * Age-group W/kg norms by race distance. Coaching-consensus mid-pack values; not a
 * single peer-reviewed source but consistent across IM / Crawley / TrainerRoad
 * coaching corpora. Athletes below mid-pack are flagged as having bike as a likely
 * limiter; above mid-pack get no flag (cycling-only context can't claim "run is the
 * limiter" without run-side comparison).
 *
 * Full IM bike-leg norm is slightly lower than 70.3 because the longer effort
 * (5+ hours) demands more aerobic durability and athletes pace more conservatively.
 */
const WKG_MIDPACK_NORMS: Record<'70.3' | 'full', number> = {
  '70.3': 3.0,
  'full': 2.8,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function isoDateAddDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function safeNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * D-073 (mirror of run-side `isPaceWithinTolerance` in
 * `_shared/fact-packet/queries.ts:82-91`): pure predicate — true when the
 * candidate IF is within `tolerancePct` of the current IF. Null inputs or
 * non-positive current IF → false (no match).
 */
export function isIfWithinTolerance(
  candidateIf: number | null | undefined,
  currentIf: number | null | undefined,
  tolerancePct: number,
): boolean {
  if (candidateIf == null || currentIf == null) return false;
  if (typeof currentIf !== 'number' || currentIf <= 0) return false;
  if (typeof candidateIf !== 'number' || !Number.isFinite(candidateIf)) return false;
  return Math.abs(candidateIf - currentIf) / currentIf <= tolerancePct / 100;
}

/**
 * D-073 (mirror of run-side `classifyPoolIntensityMatch` in
 * `_shared/fact-packet/queries.ts:99-109`): pure classifier for
 * `pool_power_context.intensity_match`. Sport-domain verbs differ from run
 * (`current_much_harder` vs run's `current_much_faster`) because cycling
 * intensity scales with IF, not pace direction.
 *
 *   current IF higher than pool by ≥ thresholdPct → 'current_much_harder'
 *   current IF lower than pool by ≥ thresholdPct  → 'current_much_easier'
 *   within ±thresholdPct                          → 'matched'
 */
export function classifyCyclingPoolIntensityMatch(
  currentIf: number,
  poolAvgIf: number,
  thresholdPct: number,
): 'matched' | 'current_much_harder' | 'current_much_easier' {
  if (poolAvgIf <= 0) return 'matched';
  const deltaPct = ((currentIf - poolAvgIf) / poolAvgIf) * 100;
  if (deltaPct >= thresholdPct) return 'current_much_harder';
  if (deltaPct <= -thresholdPct) return 'current_much_easier';
  return 'matched';
}

// ─── §1 Power-curve PRs ──────────────────────────────────────────────────

/**
 * Best 20-min / 5-min / 1-min power across the athlete's ride history. Returns null
 * when fewer than `MIN_RIDES_FOR_PRS` total rides exist (D-010 minimum-data guard).
 *
 * Reads `computed.power_curve` directly from the workouts table (same data the
 * cycling pipeline already populates via `compute-workout-analysis`'s
 * `calculatePowerCurve()` — see the Tier 1 FTP work for the field semantics).
 */
export async function fetchCyclingPRs(
  supabase: any,
  params: {
    userId: string;
    currentWorkoutId: string;
    /**
     * The current ride's `computed.power_curve` (W per duration). Used only for
     * PR attribution — the query still EXCLUDES the current workout, so
     * recent/all-time bests stay prior-ride; this decides set_on_current_ride.
     */
    currentPowerCurve?: Record<string, number> | null;
  },
): Promise<CyclingPRsV1 | null> {
  try {
    const { data: rows } = await supabase
      .from('workouts')
      .select('id, date, computed')
      .eq('user_id', params.userId)
      .in('type', ['ride', 'cycling', 'bike'])
      .eq('workout_status', 'completed')
      .neq('id', params.currentWorkoutId)
      .order('date', { ascending: false })
      .limit(500);

    const all: Array<{ id: string; date: string; powerCurve: Record<string, number> }> = [];
    for (const r of (Array.isArray(rows) ? rows : [])) {
      const pc = (r as any)?.computed?.power_curve;
      if (!pc || typeof pc !== 'object') continue;
      const pcEntries: Record<string, number> = {};
      for (const dur of PR_DURATIONS) {
        const v = safeNum((pc as any)[dur]);
        if (v != null && v > 0) pcEntries[dur] = v;
      }
      if (Object.keys(pcEntries).length > 0) {
        all.push({ id: String(r.id), date: String(r.date).slice(0, 10), powerCurve: pcEntries });
      }
    }

    if (all.length < MIN_RIDES_FOR_PRS) return null;

    const today = new Date().toISOString().slice(0, 10);
    const recentCutoff = isoDateAddDays(today, -RECENT_WINDOW_DAYS);

    const findBestAt = (
      pool: typeof all,
      duration: CyclingPRDuration,
    ): CyclingPREntry | null => {
      let best: CyclingPREntry | null = null;
      for (const r of pool) {
        const v = r.powerCurve[duration];
        if (v == null) continue;
        if (best == null || v > best.value) {
          best = { value: v, date: r.date, workout_id: r.id };
        }
      }
      return best;
    };

    const recent = all.filter((r) => r.date >= recentCutoff);

    const curPc = (params.currentPowerCurve && typeof params.currentPowerCurve === 'object')
      ? params.currentPowerCurve
      : null;

    const entryFor = (duration: CyclingPRDuration): CyclingPRDurationEntry => {
      const all_time_pr = findBestAt(all, duration);
      const recent_pr = findBestAt(recent, duration);
      const cv = curPc ? safeNum((curPc as any)[duration]) : null;
      const current_value = (cv != null && cv > 0) ? cv : null;
      // `all`/`recent` exclude the current workout (query `.neq`), so
      // all_time_pr is the best PRIOR ride. This ride set/tied the recorded
      // best iff its value ≥ that prior best (or there is no prior best).
      const set_on_current_ride =
        current_value != null && (all_time_pr == null || current_value >= all_time_pr.value);
      return { recent_pr, all_time_pr, current_value, set_on_current_ride };
    };

    return {
      sample_size: all.length,
      durations: {
        '1min': entryFor('1min'),
        '5min': entryFor('5min'),
        '20min': entryFor('20min'),
      },
    };
  } catch (e) {
    console.warn('[cycling-cross-workout] fetchCyclingPRs failed:', e);
    return null;
  }
}

// ─── §2 vs-similar comparison ─────────────────────────────────────────────

/**
 * Match the current ride against past rides with the same `classified_type` and
 * duration within ±20%. Returns null when fewer than `MIN_MATCHES_FOR_VS_SIMILAR`
 * matches exist (D-010 minimum-data guard).
 *
 * Reads `workout_analysis.fact_packet_v1.facts.{classified_type, normalized_power,
 * intensity_factor, total_duration_min}` and `workout_analysis.performance.execution_score`.
 * All produced by `analyze-cycling-workout` (current pipeline + Tier 3 work shipped).
 */
export async function fetchCyclingVsSimilar(
  supabase: any,
  params: {
    userId: string;
    currentWorkoutId: string;
    currentClassifiedType: string;
    currentDurationMin: number;
    currentNp: number | null;
    currentIf: number | null;
    currentExecScore: number | null;
    /** D-073 — current ride's avg HR, used for `hr_delta_bpm` vs the matched pool. */
    currentAvgHr?: number | null;
    /** D-073 — current ride's HR drift bpm, used for `drift_delta_bpm` vs the matched pool. */
    currentHrDriftBpm?: number | null;
  },
): Promise<CyclingVsSimilarV1 | null> {
  if (!params.currentClassifiedType || params.currentClassifiedType === 'unknown') return null;
  if (!Number.isFinite(params.currentDurationMin) || params.currentDurationMin <= 0) return null;

  try {
    // D-073: also select `computed` + row-level `avg_heart_rate` so the shared
    // `getOverallAvgHr` (D-047 three-stage fallback) can resolve HR for each
    // candidate. The run-side `getSimilarWorkoutComparisons` does the same.
    const { data: rows } = await supabase
      .from('workouts')
      .select('id, date, computed, avg_heart_rate, workout_analysis')
      .eq('user_id', params.userId)
      .in('type', ['ride', 'cycling', 'bike'])
      .eq('workout_status', 'completed')
      .neq('id', params.currentWorkoutId)
      .order('date', { ascending: false })
      .limit(120);

    const lo = params.currentDurationMin * (1 - DURATION_TOLERANCE_PCT);
    const hi = params.currentDurationMin * (1 + DURATION_TOLERANCE_PCT);

    type Match = {
      np: number | null;
      if_: number | null;
      exec: number | null;
      avgHr: number | null;
      drift: number | null;
    };
    // D-073: pre-D-073 the loop short-circuited after 3 type+duration matches,
    // so the IF filter would have nothing to narrow on. Collect ALL matches so
    // the filter can drop the off-IF rows; the 3-hit fallback then decides
    // whether the filter takes effect.
    const allMatches: Match[] = [];
    for (const r of (Array.isArray(rows) ? rows : [])) {
      const wa = (r as any)?.workout_analysis;
      if (!wa || typeof wa !== 'object') continue;
      const facts = wa?.fact_packet_v1?.facts;
      if (!facts) continue;
      const ct = String(facts.classified_type ?? '').toLowerCase();
      if (ct !== params.currentClassifiedType.toLowerCase()) continue;
      const dur = safeNum(facts.total_duration_min);
      if (dur == null || dur < lo || dur > hi) continue;
      allMatches.push({
        np: safeNum(facts.normalized_power),
        if_: safeNum(facts.intensity_factor),
        exec: safeNum(wa?.performance?.execution_score),
        avgHr: getOverallAvgHr(r),
        drift: getHrDriftBpmFromAnalysis(r),
      });
    }

    // D-073 IF-proximity filter (mirror of D-038 run-side `filterByPaceProximity`
    // in `_shared/fact-packet/queries.ts:418-432`). Narrows the pool to rides
    // within ±15% of the current ride's IF; falls back to unfiltered when the
    // filtered pool has <3 matches. Never expands — only narrows or fails-back.
    const filterByIfProximity = (rowsIn: Match[], currentIf: number | null) => {
      if (currentIf == null || currentIf <= 0) {
        return { rows: rowsIn, applied: false, before: rowsIn.length, after: rowsIn.length };
      }
      const filtered = rowsIn.filter((m) => isIfWithinTolerance(m.if_, currentIf, POOL_IF_TOLERANCE_PCT));
      if (filtered.length >= MIN_MATCHES_FOR_VS_SIMILAR) {
        return { rows: filtered, applied: true, before: rowsIn.length, after: filtered.length };
      }
      return { rows: rowsIn, applied: false, before: rowsIn.length, after: rowsIn.length };
    };
    const ifFilter = filterByIfProximity(allMatches, params.currentIf);

    // Take the most recent 3 from the filtered (or fallback) pool. Rows came
    // ordered date-desc from the query and we appended in order, so slice(0,3)
    // is the last 3 chronologically. Same shape as D-010 last-3 contract.
    const lastThree = ifFilter.rows.slice(0, 3);

    if (lastThree.length < MIN_MATCHES_FOR_VS_SIMILAR) return null;

    const npAvg = avg(lastThree.map((m) => m.np).filter((v): v is number => v != null));
    const ifAvg = avg(lastThree.map((m) => m.if_).filter((v): v is number => v != null));
    const execAvg = avg(lastThree.map((m) => m.exec).filter((v): v is number => v != null));
    const hrAvg = avg(lastThree.map((m) => m.avgHr).filter((v): v is number => v != null));
    const driftAvg = avg(lastThree.map((m) => m.drift).filter((v): v is number => v != null));

    const npDelta = (params.currentNp != null && npAvg != null) ? params.currentNp - npAvg : null;
    const ifDelta = (params.currentIf != null && ifAvg != null) ? params.currentIf - ifAvg : null;
    const execDelta = (params.currentExecScore != null && execAvg != null) ? params.currentExecScore - execAvg : null;
    // D-073 — HR deltas use the shared three-stage `getOverallAvgHr` for both
    // current and pool (D-047 symmetric resolution; same pattern as run side
    // at `_shared/fact-packet/queries.ts:609-610`).
    const hrDeltaRaw = (params.currentAvgHr != null && hrAvg != null) ? params.currentAvgHr - hrAvg : null;
    const driftDeltaRaw = (params.currentHrDriftBpm != null && driftAvg != null) ? params.currentHrDriftBpm - driftAvg : null;

    // Summary assessment: weighted on execution + IF (NP varies with duration / route).
    let assessment: CyclingVsSimilarV1['assessment'] = 'typical';
    const signals: number[] = [];
    if (execDelta != null) signals.push(execDelta >= 5 ? 1 : execDelta <= -5 ? -1 : 0);
    if (ifDelta != null) signals.push(ifDelta >= 0.03 ? 1 : ifDelta <= -0.03 ? -1 : 0);
    if (signals.length > 0) {
      const sum = signals.reduce((a, b) => a + b, 0);
      if (sum > 0) assessment = 'above_typical';
      else if (sum < 0) assessment = 'below_typical';
      else if (signals.some((s) => s !== 0)) assessment = 'mixed';
    }

    // D-073 — diagnostic field (analog of run's `pool_intensity_filter`).
    const pool_intensity_filter: CyclingPoolIntensityFilter = {
      applied: ifFilter.applied,
      tolerance_pct: POOL_IF_TOLERANCE_PCT,
      basis: 'if',
      pool_size_before: ifFilter.before,
      pool_size_after: ifFilter.after,
    };

    // D-073 — LLM-facing intensity-match context (analog of run's
    // `pool_pace_context`). Populated only when both current IF and pool avg
    // IF are present; the prompt rule keys off `intensity_match`.
    let pool_power_context: CyclingPoolPowerContext | null = null;
    if (params.currentIf != null && ifAvg != null && ifAvg > 0) {
      const dIf = params.currentIf - ifAvg;
      const dPct = (dIf / ifAvg) * 100;
      pool_power_context = {
        current_if: Math.round(params.currentIf * 100) / 100,
        pool_avg_if: Math.round(ifAvg * 100) / 100,
        delta_if: Math.round(dIf * 100) / 100,
        delta_pct: Math.round(dPct * 10) / 10,
        basis: 'if',
        intensity_match: classifyCyclingPoolIntensityMatch(params.currentIf, ifAvg, POOL_INTENSITY_MATCH_PCT),
      };
    }

    console.warn(`[cycling-cross-workout] pool_intensity_filter: applied=${ifFilter.applied}, ${ifFilter.before} → ${ifFilter.after} (tolerance=${POOL_IF_TOLERANCE_PCT}%)`);

    return {
      sample_size: lastThree.length,
      matched_type: params.currentClassifiedType,
      duration_band_min: { lo: Math.round(lo), hi: Math.round(hi) },
      np_delta_w: npDelta != null ? Math.round(npDelta) : null,
      if_delta: ifDelta != null ? Math.round(ifDelta * 100) / 100 : null,
      exec_delta_pct: execDelta != null ? Math.round(execDelta) : null,
      hr_delta_bpm: hrDeltaRaw != null ? Math.round(hrDeltaRaw) : null,
      drift_delta_bpm: driftDeltaRaw != null ? Math.round(driftDeltaRaw) : null,
      assessment,
      pool_intensity_filter,
      pool_power_context,
    };
  } catch (e) {
    console.warn('[cycling-cross-workout] fetchCyclingVsSimilar failed:', e);
    return null;
  }
}

// ─── §3 Limiter signal (W/kg vs norms, or NP trend) ──────────────────────

export function classifyWkgForRaceDistance(
  wkg: number,
  raceDistance: '70.3' | 'full',
): 'low' | 'mid_pack' | 'strong' {
  const midpack = WKG_MIDPACK_NORMS[raceDistance];
  if (wkg < midpack) return 'low';
  if (wkg < midpack + 0.5) return 'mid_pack';
  return 'strong';
}

/**
 * Compute the limiter signal. Pure function — pass in everything; no DB calls. The
 * caller resolves which signal applies (W/kg path requires bodyweight + FTP + tri
 * goal; NP-trend path requires recent NP samples).
 */
export function assessCyclingLimiter(params: {
  /** Athlete weight in kilograms. Null when unavailable. */
  weightKg: number | null;
  /** Current FTP in watts. Null when unavailable. */
  ftpW: number | null;
  /** True if the athlete has an active triathlon goal. Drives W/kg-vs-norms path. */
  isTriAthlete: boolean;
  /** Race distance from the active goal, when available. */
  raceDistance: '70.3' | 'full' | null;
  /** Recent ride NP samples (last ~14 days) — used for NP-trend fallback. */
  recentNpSamples?: number[];
  /** Rolling 90-day NP samples — baseline for NP-trend computation. */
  ninetyDayNpSamples?: number[];
}): CyclingLimiterV1 {
  // §1 W/kg path — requires bodyweight, FTP, tri context, and known race distance.
  if (
    params.isTriAthlete &&
    params.weightKg != null && params.weightKg > 30 &&
    params.ftpW != null && params.ftpW > 50 &&
    params.raceDistance
  ) {
    const wkg = Math.round((params.ftpW / params.weightKg) * 100) / 100;
    const tier = classifyWkgForRaceDistance(wkg, params.raceDistance);
    if (tier === 'low') {
      return {
        flag: 'bike',
        source: 'wkg_vs_norms',
        detail: `W/kg (${wkg}) is below the mid-pack norm of ${WKG_MIDPACK_NORMS[params.raceDistance]} for ${params.raceDistance}. Bike fitness is a likely limiter — extra long-ride / FTP work would have outsized return.`,
        wkg,
      };
    }
    return {
      flag: 'none',
      source: 'wkg_vs_norms',
      detail: `W/kg (${wkg}) is at or above the mid-pack norm of ${WKG_MIDPACK_NORMS[params.raceDistance]} for ${params.raceDistance}. Bike fitness is not flagged as the limiter.`,
      wkg,
    };
  }

  // §2 REMOVED — bike-power TREND is the SPINE's job, not a "limiter". This used to average recent NP
  // vs a 90-day ALL-ride NP mean (±5%, no terrain match, no staleness gate) and emit "Power trending
  // up/down — fitness responding / review recovery". That was a baseline-blind duplicate of the spine
  // power trend (state_trends_v1.bike.power — terrain-binned, staleness-gated, easy-ride-safe): an easy
  // block dragged the mean and manufactured a false "trending down", contradicting State — for tri AND
  // non-tri athletes alike. The spine now owns bike-power direction for EVERY athlete; the real W/kg
  // limiter (§1) still runs for triathletes with baselines + a race. Neither applies → honest 'none'
  // (no fabricated limiter). `recentNpSamples`/`ninetyDayNpSamples` are now unused (kept on the signature
  // so callers don't change). Follow-up (filed): for a tri athlete missing bodyweight, prompt "add your
  // weight for a bike-limiter read" instead of silence.
  return {
    flag: 'none',
    source: 'insufficient_data',
    detail: params.isTriAthlete
      ? 'No W/kg limiter read — needs bodyweight + FTP + a target race distance. Bike power trend is on the State screen.'
      : 'No bike limiter for a non-race plan. Bike power trend is on the State screen.',
  };
}

/**
 * Convenience helper: convert weight from imperial (lb) to kg if the athlete uses
 * imperial units. user_baselines.weight is stored as a single integer; the units
 * column drives interpretation.
 */
export function resolveWeightKg(weight: number | null | undefined, units: string | null | undefined): number | null {
  const w = safeNum(weight);
  if (w == null || w <= 0) return null;
  const u = String(units ?? '').toLowerCase();
  return u === 'imperial' ? w * 0.45359237 : w;
}
