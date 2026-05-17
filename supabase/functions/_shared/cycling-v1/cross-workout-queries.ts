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
  CyclingPRDuration,
  CyclingPRDurationEntry,
  CyclingPREntry,
  CyclingPRsV1,
  CyclingVsSimilarV1,
} from './cross-workout-types.ts';

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
  },
): Promise<CyclingVsSimilarV1 | null> {
  if (!params.currentClassifiedType || params.currentClassifiedType === 'unknown') return null;
  if (!Number.isFinite(params.currentDurationMin) || params.currentDurationMin <= 0) return null;

  try {
    const { data: rows } = await supabase
      .from('workouts')
      .select('id, date, workout_analysis')
      .eq('user_id', params.userId)
      .in('type', ['ride', 'cycling', 'bike'])
      .eq('workout_status', 'completed')
      .neq('id', params.currentWorkoutId)
      .order('date', { ascending: false })
      .limit(120);

    const lo = params.currentDurationMin * (1 - DURATION_TOLERANCE_PCT);
    const hi = params.currentDurationMin * (1 + DURATION_TOLERANCE_PCT);

    type Match = { np: number | null; if_: number | null; exec: number | null };
    const matches: Match[] = [];
    for (const r of (Array.isArray(rows) ? rows : [])) {
      const wa = (r as any)?.workout_analysis;
      if (!wa || typeof wa !== 'object') continue;
      const facts = wa?.fact_packet_v1?.facts;
      if (!facts) continue;
      const ct = String(facts.classified_type ?? '').toLowerCase();
      if (ct !== params.currentClassifiedType.toLowerCase()) continue;
      const dur = safeNum(facts.total_duration_min);
      if (dur == null || dur < lo || dur > hi) continue;
      matches.push({
        np: safeNum(facts.normalized_power),
        if_: safeNum(facts.intensity_factor),
        exec: safeNum(wa?.performance?.execution_score),
      });
      if (matches.length >= 3 && matches.length >= MIN_MATCHES_FOR_VS_SIMILAR) {
        // Take exactly the last 3 matches per D-010; we have them since rows are
        // ordered date descending and we're walking newest-first.
        if (matches.length >= 3) break;
      }
    }
    // Re-trim to the most recent 3 explicitly (the break above is loose; some matches
    // may have been added past 3 if the early-break path didn't catch them).
    const lastThree = matches.slice(0, 3);

    if (lastThree.length < MIN_MATCHES_FOR_VS_SIMILAR) return null;

    const npAvg = avg(lastThree.map((m) => m.np).filter((v): v is number => v != null));
    const ifAvg = avg(lastThree.map((m) => m.if_).filter((v): v is number => v != null));
    const execAvg = avg(lastThree.map((m) => m.exec).filter((v): v is number => v != null));

    const npDelta = (params.currentNp != null && npAvg != null) ? params.currentNp - npAvg : null;
    const ifDelta = (params.currentIf != null && ifAvg != null) ? params.currentIf - ifAvg : null;
    const execDelta = (params.currentExecScore != null && execAvg != null) ? params.currentExecScore - execAvg : null;

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

    return {
      sample_size: lastThree.length,
      matched_type: params.currentClassifiedType,
      duration_band_min: { lo: Math.round(lo), hi: Math.round(hi) },
      np_delta_w: npDelta != null ? Math.round(npDelta) : null,
      if_delta: ifDelta != null ? Math.round(ifDelta * 100) / 100 : null,
      exec_delta_pct: execDelta != null ? Math.round(execDelta) : null,
      assessment,
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

  // §2 NP-trend fallback — works for non-tri or when bodyweight is missing.
  const recent = params.recentNpSamples ?? [];
  const ninety = params.ninetyDayNpSamples ?? [];
  if (recent.length >= 3 && ninety.length >= 5) {
    const recentMean = avg(recent)!;
    const ninetyMean = avg(ninety)!;
    if (ninetyMean > 0) {
      const deltaPct = Math.round(((recentMean - ninetyMean) / ninetyMean) * 1000) / 10;
      const flag: CyclingLimiterV1['flag'] =
        deltaPct <= -5 ? 'trending_down' :
        deltaPct >= 5 ? 'trending_up' :
        'stable';
      const detail =
        flag === 'trending_down'
          ? `Recent NP averaging ${Math.round(recentMean)}W vs 90-day mean ${Math.round(ninetyMean)}W (${deltaPct}%). Power trending down — review recovery and fueling before adding intensity.`
          : flag === 'trending_up'
          ? `Recent NP averaging ${Math.round(recentMean)}W vs 90-day mean ${Math.round(ninetyMean)}W (+${deltaPct}%). Power trending up — fitness is responding to recent training.`
          : `Recent NP holding steady against 90-day mean (${Math.round(recentMean)}W vs ${Math.round(ninetyMean)}W).`;
      return { flag, source: 'np_trend', detail, np_trend_pct: deltaPct };
    }
  }

  return {
    flag: 'none',
    source: 'insufficient_data',
    detail: params.isTriAthlete
      ? 'Insufficient data for limiter assessment (need bodyweight + FTP for W/kg, or 5+ rides in last 90d for NP trend).'
      : 'Insufficient ride history for power-trend assessment (need 5+ rides in last 90d).',
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
