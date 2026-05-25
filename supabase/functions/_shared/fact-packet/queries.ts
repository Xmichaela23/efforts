import type {
  AchievementV1,
  TrendV1,
  TrendDirection,
  VsSimilarV1,
  SimilarAssessment,
  TrainingLoadV1,
} from './types.ts';
import { classifyTerrain, coerceNumber, isoDateAddDays, isoWeekStartMonday } from './utils.ts';
import {
  resolveMovingDurationMinutes,
  resolveOverallDistanceMi,
  resolveOverallPaceSecPerMi,
} from './pace-resolution.ts';
import { ACWR_RATIO_THRESHOLDS } from '../acwr-state.ts';
import type { AcwrWeekIntent } from '../acwr-state.ts';

type SupabaseLike = any;

type WorkoutRowLite = {
  id: string;
  user_id: string;
  type?: string | null;
  date?: string | null; // YYYY-MM-DD
  workout_status?: string | null;
  computed?: any;
  workout_analysis?: any;
  workload_actual?: number | null;
  workload_planned?: number | null;
  duration?: number | null; // minutes?
  moving_time?: number | null; // minutes
  distance?: number | null; // km
  elevation_gain?: number | null; // meters?
};

function safeLower(s: any): string {
  try { return String(s || '').toLowerCase(); } catch { return ''; }
}

/** Normalize to YYYY-MM-DD for date comparison (avoids UTC/PT mismatch with full ISO strings). */
function toDateOnly(val: any): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function getComputedOverall(row: any): any {
  const c = row?.computed;
  if (!c) return null;
  try { return typeof c === 'string' ? JSON.parse(c) : c; } catch { return c; }
}

function getOverallDistanceMi(row: any): number | null {
  const mi = resolveOverallDistanceMi(row);
  return mi > 0 ? mi : null;
}

function getOverallDurationMin(row: any): number | null {
  return resolveMovingDurationMinutes(row);
}

/**
 * D-038 §8 #1 — pace-proximity tolerance for the vs_similar pool filter.
 * 15% locked, tune after 2 weeks of pool_intensity_filter aggregates. Single
 * constant; do NOT per-bucket-type (the path to config explosion).
 */
export const POOL_PACE_TOLERANCE_PCT = 15;

/**
 * D-038 §8 #3 — boundary for pool_pace_context.intensity_match enum.
 * 10% locked, aligned with PACING's "uneven" band (CV thresholds in D-034).
 */
export const POOL_INTENSITY_MATCH_PCT = 10;

/**
 * D-038 Piece 2 — pure pace-proximity predicate. Returns true when the
 * candidate pace is within `tolerancePct` of the current pace (both expressed
 * in sec/mi). Null inputs or non-positive current pace → false (no match).
 */
export function isPaceWithinTolerance(
  candidatePaceSec: number | null | undefined,
  currentPaceSec: number | null | undefined,
  tolerancePct: number,
): boolean {
  if (candidatePaceSec == null || currentPaceSec == null) return false;
  if (typeof currentPaceSec !== 'number' || currentPaceSec <= 0) return false;
  if (typeof candidatePaceSec !== 'number' || !Number.isFinite(candidatePaceSec)) return false;
  return Math.abs(candidatePaceSec - currentPaceSec) / currentPaceSec <= tolerancePct / 100;
}

/**
 * D-038 Piece 3 — pure classifier for pool_pace_context.intensity_match.
 * Returns 'current_much_faster' when current is faster than pool by ≥
 * thresholdPct, 'current_much_slower' on the symmetric case, 'matched' when
 * within ±thresholdPct.
 */
export function classifyPoolIntensityMatch(
  currentPaceSec: number,
  poolAvgPaceSec: number,
  thresholdPct: number,
): 'matched' | 'current_much_faster' | 'current_much_slower' {
  if (poolAvgPaceSec <= 0) return 'matched';
  const deltaPct = ((currentPaceSec - poolAvgPaceSec) / poolAvgPaceSec) * 100;
  if (deltaPct <= -thresholdPct) return 'current_much_faster';
  if (deltaPct >= thresholdPct) return 'current_much_slower';
  return 'matched';
}

function getOverallPaceSecPerMi(row: any): number | null {
  return resolveOverallPaceSecPerMi(row);
}

/**
 * D-NNN: Read grade-adjusted overall pace (sec/mi) when usable elevation data
 * existed at analysis time. Null when GAP wasn't computed (no usable elevation
 * series) or fields were never persisted.
 */
export function getOverallGapSecPerMi(row: any): number | null {
  const overall = getComputedOverall(row)?.overall;
  const v = coerceNumber(overall?.avg_gap_s_per_mi);
  return v != null && v > 0 ? Math.round(v) : null;
}

/**
 * D-NNN: Pace resolver for cross-workout comparisons. Returns GAP when BOTH the
 * current workout and the candidate row carry it. Otherwise returns raw from
 * both rows (matched basis). Never mixes a GAP value from one row with a raw
 * value from another — that would be apples-to-pomegranates and worse than the
 * raw-only baseline.
 */
export function resolvePaceForComparison(currentRow: any, candidateRow: any): {
  current: number | null;
  candidate: number | null;
  basis: 'gap' | 'raw';
} {
  const curGap = getOverallGapSecPerMi(currentRow);
  const candGap = getOverallGapSecPerMi(candidateRow);
  if (curGap != null && candGap != null) {
    return { current: curGap, candidate: candGap, basis: 'gap' };
  }
  return {
    current: getOverallPaceSecPerMi(currentRow),
    candidate: getOverallPaceSecPerMi(candidateRow),
    basis: 'raw',
  };
}

/**
 * D-NNN: Variance gate flag from a historical row. True when the analyzer
 * stamped this row as mixed-effort (intervals, fartlek, or plan-intent
 * intervals). Steady comparison pools exclude these rows so a fartlek doesn't
 * pollute the easy-run baseline.
 */
export function isMixedEffortRow(row: any): boolean {
  const v = row?.workout_analysis?.session_state_v1?.glance?.is_mixed_effort;
  return v === true;
}

function getOverallAvgHr(row: any): number | null {
  const overall = getComputedOverall(row)?.overall;
  const v = coerceNumber(overall?.avg_hr ?? overall?.avg_heart_rate ?? row?.avg_heart_rate);
  return v != null && v > 0 ? Math.round(v) : null;
}

function getOverallMaxHr(row: any): number | null {
  const overall = getComputedOverall(row)?.overall;
  const v = coerceNumber(overall?.max_hr ?? overall?.max_heart_rate ?? row?.max_heart_rate);
  return v != null && v > 0 ? Math.round(v) : null;
}


function getHrDriftBpmFromAnalysis(row: any): number | null {
  const wa = row?.workout_analysis;
  const drift = coerceNumber(
    wa?.granular_analysis?.heart_rate_analysis?.hr_drift_bpm ??
    wa?.granular_analysis?.heart_rate_analysis?.hrDriftBpm ??
    wa?.heart_rate_summary?.hr_drift_bpm ??
    wa?.heart_rate_summary?.drift_bpm ??
    wa?.heart_rate_summary?.driftBpm
  );
  return drift != null ? Math.round(drift) : null;
}

function getElevationGainFt(row: any): number | null {
  const m = coerceNumber(row?.elevation_gain);
  return m != null ? m * 3.28084 : null;
}

function getTerrainClass(row: any): 'flat' | 'rolling' | 'hilly' {
  return classifyTerrain(getElevationGainFt(row), getOverallDistanceMi(row));
}

export function inferWorkoutTypeKey(row: any): string | null {
  // Prefer analyzer output if available
  const wa = row?.workout_analysis;
  const classified = String(wa?.classified_type || '').trim();
  if (classified) return safeLower(classified);
  const wt = String(wa?.granular_analysis?.heart_rate_analysis?.workout_type || wa?.granular_analysis?.heart_rate_analysis?.workoutType || '').trim();
  if (wt) return wt; // "steady_state" | "intervals" | "tempo_finish" etc.
  // Fallback: basic type
  const t = safeLower(row?.type);
  if (t.includes('run') || t.includes('walk')) return 'run';
  if (t.includes('ride') || t.includes('bike') || t.includes('cycle')) return 'ride';
  if (t.includes('swim')) return 'swim';
  if (t.includes('strength') || t.includes('mobility')) return 'strength';
  return t || null;
}

/** For comparison queries: group similar workout types so we have enough history (e.g. recovery + easy + run). */
function getDiscipline(key: string | null): string {
  if (!key) return 'workout';
  const k = safeLower(key);
  if (['run', 'recovery', 'easy', 'easy_run', 'steady_state', 'long', 'long_run', 'long_run_fast_finish', 'intervals', 'interval', 'interval_run', 'tempo', 'tempo_run', 'track', 'speed', 'fartlek', 'threshold'].includes(k)) return 'run';
  if (['ride', 'bike', 'cycle', 'cycling'].includes(k)) return 'ride';
  if (['swim', 'swimming'].includes(k)) return 'swim';
  if (['strength', 'mobility', 'weights'].includes(k)) return 'strength';
  if (k.includes('run') || k.includes('jog')) return 'run';
  if (k.includes('ride') || k.includes('bike') || k.includes('cycle')) return 'ride';
  return 'workout';
}

export function getComparableTypeKeys(key: string | null): string[] {
  if (!key) return [];
  const k = safeLower(key);
  const easyLike = ['recovery', 'easy', 'easy_run', 'steady_state', 'run'];
  if (easyLike.includes(k)) return easyLike;
  const longLike = ['long', 'long_run', 'long_run_fast_finish'];
  if (longLike.includes(k)) {
    const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
    return uniq(['long_run', 'long_run_fast_finish', ...easyLike]);
  }
  const intervalLike = ['intervals', 'interval', 'interval_run', 'tempo', 'tempo_run', 'track', 'speed', 'fartlek', 'threshold'];
  if (intervalLike.includes(k)) return intervalLike;
  return [k];
}

async function fetchRecentWorkouts(
  supabase: SupabaseLike,
  userId: string,
  startDateIso: string,
  endDateIso: string,
  limit: number
): Promise<WorkoutRowLite[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id,user_id,type,date,workout_status,computed,workout_analysis,workload_actual,workload_planned,duration,moving_time,distance,elevation_gain,avg_heart_rate')
    .eq('user_id', userId)
    .gte('date', startDateIso)
    .lte('date', endDateIso)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as WorkoutRowLite[];
}

export async function getSimilarWorkoutComparisons(
  supabase: SupabaseLike,
  params: {
    userId: string;
    currentWorkoutId: string;
    workoutTypeKey: string | null;
    durationMin: number;
    currentAvgPaceSecPerMi: number | null;
    /** D-NNN: current workout's GAP pace (sec/mi). Null when no usable
     *  elevation. Triggers GAP-basis comparisons when historical rows also
     *  have GAP; never mixes bases. */
    currentAvgGapSecPerMi?: number | null;
    currentAvgHr: number | null;
    currentHrDriftBpm: number | null;
    currentTerrainClass?: 'flat' | 'rolling' | 'hilly' | null;
  }
): Promise<VsSimilarV1 & { avg_pace_at_similar_hr: number | null; avg_hr_drift: number | null; pace_basis?: 'gap' | 'raw' }> {
  const { userId, currentWorkoutId, workoutTypeKey, durationMin, currentAvgPaceSecPerMi, currentAvgGapSecPerMi, currentAvgHr, currentHrDriftBpm, currentTerrainClass } = params;

  try {
    const end = new Date().toISOString().slice(0, 10);
    const start = isoDateAddDays(end, -120);

    // Fetch recent workouts and segment overlap in parallel
    const [rows, segmentRouteWorkoutIds] = await Promise.all([
      fetchRecentWorkouts(supabase, userId, start, end, 60),
      (async (): Promise<Set<string> | null> => {
        try {
          const { data: currentSegMatches } = await supabase
            .from('workout_segment_match')
            .select('segment_id')
            .eq('workout_id', currentWorkoutId)
            .limit(200);
          const currentSegIds = Array.from(new Set(
            (Array.isArray(currentSegMatches) ? currentSegMatches : [])
              .map((m: any) => String(m?.segment_id || '').trim())
              .filter(Boolean)
          ));
          if (currentSegIds.length === 0) return null;
          const { data: sharedMatches } = await supabase
            .from('workout_segment_match')
            .select('workout_id, segment_id')
            .in('segment_id', currentSegIds)
            .neq('workout_id', currentWorkoutId);
          if (!Array.isArray(sharedMatches) || sharedMatches.length === 0) return null;
          const overlapCount = new Map<string, number>();
          for (const m of sharedMatches) {
            const wid = String(m.workout_id);
            overlapCount.set(wid, (overlapCount.get(wid) || 0) + 1);
          }
          // Require at least 25% segment overlap to qualify as "same route"
          const minOverlap = Math.max(1, Math.floor(currentSegIds.length * 0.25));
          const matchedIds = new Set(
            [...overlapCount.entries()]
              .filter(([, count]) => count >= minOverlap)
              .map(([wid]) => wid)
          );
          console.warn(`[fact-packet] segment route: currentSegIds=${currentSegIds.length}, minOverlap=${minOverlap}, matchedWorkouts=${matchedIds.size}`);
          return matchedIds.size > 0 ? matchedIds : null;
        } catch (e) {
          console.warn('[fact-packet] segment match fetch failed (non-fatal):', e);
          return null;
        }
      })(),
    ]);

    const bandLo = Math.max(5, Math.round(durationMin * 0.7));
    const bandHi = Math.round(durationMin * 1.3);

    const comparableKeys = getComparableTypeKeys(workoutTypeKey);
    const notSelf = rows.filter((r) => String(r.id) !== String(currentWorkoutId));
    const completed = notSelf.filter((r) => String(r.workout_status || '').toLowerCase() === 'completed');
    // D-NNN: variance-aware pool. When the current session is easy-like, exclude
    // historical rows tagged is_mixed_effort (fartleks, plan-intent intervals on
    // an "easy" classified_type) from the steady comparison pool. When the
    // current session is interval-like, mixed-effort rows are eligible regardless
    // of classified_type — they're the right comparison set.
    const curKeyLow = String(workoutTypeKey || '').toLowerCase();
    const easyLikeKeys = new Set(['recovery', 'easy', 'easy_run', 'steady_state', 'run', 'long', 'long_run', 'long_run_fast_finish']);
    const currentIsEasyLike = easyLikeKeys.has(curKeyLow);
    const typeMatch = completed.filter((r) => {
      const inferred = inferWorkoutTypeKey(r);
      const typeOk = !workoutTypeKey
        ? true
        : (inferred != null && (comparableKeys.length > 0 ? comparableKeys.includes(inferred) : inferred === workoutTypeKey));
      if (!typeOk) return false;
      // Mixed-effort rows are excluded from the steady pool to stop type
      // contagion (a fartlek mis-pooled with easy runs pulls the baseline).
      if (currentIsEasyLike && isMixedEffortRow(r)) return false;
      return true;
    });
    const durationMatch = typeMatch.filter((r) => {
      const d = getOverallDurationMin(r);
      return d != null && d >= bandLo && d <= bandHi;
    });
    // Terrain-aware filtering: prefer same terrain class, fall back to full duration pool if < 3 hits.
    let terrainMatch = durationMatch;
    if (currentTerrainClass) {
      const terrainFiltered = durationMatch.filter((r) => getTerrainClass(r) === currentTerrainClass);
      if (terrainFiltered.length >= 3) {
        terrainMatch = terrainFiltered;
      }
      console.warn(`[fact-packet] terrain filter (${currentTerrainClass}): ${durationMatch.length} → ${terrainFiltered.length} (using ${terrainFiltered.length >= 3 ? 'terrain-filtered' : 'unfiltered'} pool)`);
    }

    // Route/segment matching: tightest filter — workouts sharing actual roads/segments.
    // Falls back to terrainMatch if fewer than 3 qualifying runs.
    let routeMatch = terrainMatch;
    if (segmentRouteWorkoutIds && segmentRouteWorkoutIds.size > 0) {
      const routeFiltered = terrainMatch.filter((r) => segmentRouteWorkoutIds!.has(String(r.id)));
      if (routeFiltered.length >= 3) {
        routeMatch = routeFiltered;
      }
      console.warn(`[fact-packet] route filter: terrainMatch=${terrainMatch.length} → routeFiltered=${routeFiltered.length} (using ${routeFiltered.length >= 3 ? 'route' : 'terrain'} pool)`);
    }

    // D-NNN: GAP-aware basis selection. When the current workout has GAP,
    // prefer historical candidates that also have GAP (pair both on GAP).
    // Otherwise fall back to raw across the whole pool. Never mix bases within
    // a single comparison set — averaging GAP values with raw values would be
    // apples + pomegranates.
    const curHasGap = currentAvgGapSecPerMi != null && Number.isFinite(Number(currentAvgGapSecPerMi)) && Number(currentAvgGapSecPerMi) > 0;
    type Metric = { r: any; pace: number | null; hr: number | null; drift: number | null };
    const rowsWithGap: Metric[] = [];
    const rowsRaw: Metric[] = [];
    for (const r of routeMatch) {
      const candGap = getOverallGapSecPerMi(r);
      const hr = getOverallAvgHr(r);
      const drift = getHrDriftBpmFromAnalysis(r);
      if (candGap != null) {
        rowsWithGap.push({ r, pace: candGap, hr, drift });
      }
      rowsRaw.push({ r, pace: getOverallPaceSecPerMi(r), hr, drift });
    }

    // D-038 Piece 2: pace-proximity filter (15%, locked). Excludes 11-13 min/mi
    // recovery jogs from pooling against 9:24 fartleks (the b70658b0 class).
    // Applied per-basis BEFORE basis selection so the basis decision keys on
    // the filtered counts. Falls back to unfiltered pool when filtered <3 hits
    // — mirrors the existing terrain/route fallback pattern. Never expands
    // the pool (only narrows or fails-back).
    const filterByPaceProximity = (rows: Metric[], currentPaceSec: number | null) => {
      const valid = rows.filter((x) => x.pace != null && x.hr != null);
      if (currentPaceSec == null || currentPaceSec <= 0) return { rows: valid, applied: false, before: valid.length, after: valid.length };
      const filtered = valid.filter((x) => isPaceWithinTolerance(x.pace, currentPaceSec, POOL_PACE_TOLERANCE_PCT));
      if (filtered.length >= 3) {
        return { rows: filtered, applied: true, before: valid.length, after: filtered.length };
      }
      return { rows: valid, applied: false, before: valid.length, after: valid.length };
    };
    const paceWithin = (candPaceSec: number | null, currentPaceSec: number | null): boolean =>
      isPaceWithinTolerance(candPaceSec, currentPaceSec, POOL_PACE_TOLERANCE_PCT);

    const rawFilter = filterByPaceProximity(rowsRaw, currentAvgPaceSecPerMi);
    const gapFilter = curHasGap ? filterByPaceProximity(rowsWithGap, Number(currentAvgGapSecPerMi)) : null;

    let paceBasis: 'gap' | 'raw' = 'raw';
    let basisAnchorPaceSec: number | null = currentAvgPaceSecPerMi;
    let withMetrics: Metric[] = rawFilter.rows;
    let activeFilter = rawFilter;
    if (curHasGap && gapFilter && gapFilter.rows.length >= 3) {
      paceBasis = 'gap';
      basisAnchorPaceSec = Number(currentAvgGapSecPerMi);
      withMetrics = gapFilter.rows;
      activeFilter = gapFilter;
    }
    const filtered = withMetrics.filter((x) => x.pace != null && x.hr != null);
    const poolIntensityFilter = {
      applied: activeFilter.applied,
      tolerance_pct: POOL_PACE_TOLERANCE_PCT,
      basis: paceBasis,
      pool_size_before: activeFilter.before,
      pool_size_after: activeFilter.after,
    };
    console.warn(`[fact-packet] pool_intensity_filter: applied=${activeFilter.applied}, basis=${paceBasis}, ${activeFilter.before} → ${activeFilter.after} (tolerance=${POOL_PACE_TOLERANCE_PCT}%)`);

    const sample_size = filtered.length;
    console.warn(`[fact-packet] similar workouts funnel: total=${rows.length} → notSelf=${notSelf.length} → completed=${completed.length} → typeMatch=${typeMatch.length} → durationMatch(${bandLo}-${bandHi}min)=${durationMatch.length} → terrainMatch=${terrainMatch.length} → routeMatch=${routeMatch.length} → pace+hr=${sample_size} | workoutTypeKey=${workoutTypeKey}, comparableKeys=[${comparableKeys.join(',')}]`);
    if (durationMatch.length > 0 && filtered.length < durationMatch.length) {
      const missing = withMetrics.filter(x => x.pace == null || x.hr == null);
      console.log(`[fact-packet] dropped ${missing.length} workouts missing pace/hr:`, missing.slice(0, 3).map(x => ({ id: x.r.id, date: x.r.date, pace: x.pace, hr: x.hr })));
    }
    // Trend sparkline: compute BEFORE the sample_size early return since
    // trend uses a wider pool (type-matched, not duration-matched).
    const wideBandLo = Math.max(5, Math.round(durationMin * 0.4));
    const wideBandHi = Math.round(durationMin * 1.6);
    const wideDurationMatch = typeMatch.filter((r) => {
      const d = getOverallDurationMin(r);
      return d != null && d >= wideBandLo && d <= wideBandHi;
    });
    // Apply terrain filter to trend pool as well, with same fallback logic
    const applyTerrainFilter = (pool: typeof durationMatch) => {
      if (!currentTerrainClass || pool.length < 3) return pool;
      const tf = pool.filter((r) => getTerrainClass(r) === currentTerrainClass);
      return tf.length >= 3 ? tf : pool;
    };
    const applyRouteFilter = (pool: typeof durationMatch) => {
      if (!segmentRouteWorkoutIds || segmentRouteWorkoutIds.size === 0 || pool.length < 3) return pool;
      const rf = pool.filter((r) => segmentRouteWorkoutIds!.has(String(r.id)));
      return rf.length >= 3 ? rf : pool;
    };
    // Trend pool priority: routeMatch > terrainMatch > wideDurationMatch > typeMatch
    const trendPoolSource = applyRouteFilter(terrainMatch).length >= 3
      ? 'routeMatch'
      : terrainMatch.length >= 3
        ? 'terrainMatch'
        : applyTerrainFilter(wideDurationMatch).length >= 3
          ? 'wideDurationMatch'
          : 'typeMatch';
    const trendPool = trendPoolSource === 'routeMatch'
      ? applyRouteFilter(terrainMatch)
      : trendPoolSource === 'terrainMatch'
        ? terrainMatch
        : trendPoolSource === 'wideDurationMatch'
          ? applyTerrainFilter(wideDurationMatch)
          : typeMatch;
    // Trend pool uses the same basis preference: GAP when current has it AND ≥3
    // historical points have it; otherwise raw across the trend pool.
    const trendGapEligible = curHasGap
      ? trendPool.filter((r) => r.date && getOverallGapSecPerMi(r) != null)
      : [];
    const useGapForTrend = trendGapEligible.length >= 3;
    const trendWithPaceBaseUnfiltered = useGapForTrend
      ? trendGapEligible
      : trendPool.filter((r) => r.date && getOverallPaceSecPerMi(r) != null);
    // D-038 Piece 2: apply the same 15% pace-proximity filter to the trend
    // pool. Excludes recovery-paced historicals from trending against today's
    // harder effort. Falls back to unfiltered when filtered <3 hits.
    const trendAnchorPace = useGapForTrend ? Number(currentAvgGapSecPerMi) : currentAvgPaceSecPerMi;
    const trendPaceFiltered = (trendAnchorPace != null && trendAnchorPace > 0)
      ? trendWithPaceBaseUnfiltered.filter((r) => {
          const candPace = useGapForTrend ? getOverallGapSecPerMi(r) : getOverallPaceSecPerMi(r);
          return paceWithin(candPace, trendAnchorPace);
        })
      : trendWithPaceBaseUnfiltered;
    const trendWithPaceBase = trendPaceFiltered.length >= 3 ? trendPaceFiltered : trendWithPaceBaseUnfiltered;
    console.warn(`[fact-packet] trend pool_intensity_filter: ${trendWithPaceBaseUnfiltered.length} → ${trendPaceFiltered.length} → ${trendWithPaceBase.length} (using ${trendPaceFiltered.length >= 3 ? 'filtered' : 'unfiltered'})`);
    console.warn(`[fact-packet] trend_points: pool=${trendPoolSource}(${trendPool.length}), withPace=${trendWithPaceBase.length}, basis=${useGapForTrend ? 'gap' : 'raw'}, wideBand=${wideBandLo}-${wideBandHi}min(${wideDurationMatch.length} hits)`);
    const trend_points = trendWithPaceBase
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-8)
      .map((r) => {
        const pace = useGapForTrend ? getOverallGapSecPerMi(r)! : getOverallPaceSecPerMi(r)!;
        const hr = getOverallAvgHr(r);
        return {
          date: String(r.date),
          pace_sec_per_mi: Math.round(pace),
          avg_hr: hr != null ? Math.round(hr) : null,
          pace_basis: useGapForTrend ? 'gap' as const : 'raw' as const,
        };
      })
      .filter((tp) =>
        typeof tp.pace_sec_per_mi === 'number' && Number.isFinite(tp.pace_sec_per_mi)
        && tp.pace_sec_per_mi >= 240 && tp.pace_sec_per_mi <= 3600
      );

    if (sample_size < 3) {
      return {
        sample_size,
        pace_delta_sec: null,
        hr_delta_bpm: null,
        drift_delta_bpm: null,
        assessment: 'insufficient_data',
        avg_pace_at_similar_hr: null,
        avg_hr_drift: null,
        trend_points,
        pace_basis: paceBasis,
        pool_intensity_filter: poolIntensityFilter,
        pool_pace_context: null,
      };
    }

    const avg = (arr: Array<number | null>): number | null => {
      const xs = arr.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      if (!xs.length) return null;
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };

    const avgPace = avg(filtered.map((x) => x.pace));
    const avgHr = avg(filtered.map((x) => x.hr));
    const avgDrift = avg(filtered.map((x) => x.drift));

    let avgPaceAtSimilarHr: number | null = null;
    if (currentAvgHr != null) {
      const near = filtered.filter((x) => x.hr != null && Math.abs((x.hr as number) - currentAvgHr) <= 5);
      avgPaceAtSimilarHr = near.length >= 2 ? avg(near.map((x) => x.pace)) : null;
    }

    // basisAnchorPaceSec carries the basis-matched current pace (GAP when basis === 'gap').
    const pace_delta_sec = (basisAnchorPaceSec != null && avgPace != null) ? (basisAnchorPaceSec - avgPace) : null;
    const hr_delta_bpm = (currentAvgHr != null && avgHr != null) ? (currentAvgHr - avgHr) : null;
    const drift_delta_bpm = (currentHrDriftBpm != null && avgDrift != null) ? (currentHrDriftBpm - avgDrift) : null;

    const assess = (() => {
      if (pace_delta_sec == null || hr_delta_bpm == null) return 'typical' as SimilarAssessment;
      const paceBetter = pace_delta_sec <= -10;
      const paceWorse = pace_delta_sec >= 10;
      const hrSameOrLower = hr_delta_bpm <= 5;
      const hrSameOrHigher = hr_delta_bpm >= -5;
      const driftOk = drift_delta_bpm == null ? true : drift_delta_bpm <= 3;
      const driftBad = drift_delta_bpm == null ? false : drift_delta_bpm >= 3;
      if (paceBetter && hrSameOrLower && driftOk) return 'better_than_usual' as SimilarAssessment;
      if (paceWorse && hrSameOrHigher && driftBad) return 'worse_than_usual' as SimilarAssessment;
      return 'typical' as SimilarAssessment;
    })();

    // D-038 Piece 3: pool_pace_context. Always populate when sample_size > 0.
    // Numeric fields are diagnostic; intensity_match is the LLM-facing enum
    // the POOL INTENSITY CONTEXT prompt rule keys off. 10% boundary locked
    // per spec §8 #3 — aligns with PACING's "uneven" band.
    let pool_pace_context: VsSimilarV1['pool_pace_context'] = null;
    if (basisAnchorPaceSec != null && avgPace != null && avgPace > 0) {
      const delta_sec = basisAnchorPaceSec - avgPace;
      const delta_pct = (delta_sec / avgPace) * 100;
      pool_pace_context = {
        current_avg_pace_sec: Math.round(basisAnchorPaceSec),
        pool_avg_pace_sec: Math.round(avgPace),
        delta_sec: Math.round(delta_sec),
        delta_pct: Math.round(delta_pct * 10) / 10,
        basis: paceBasis,
        intensity_match: classifyPoolIntensityMatch(basisAnchorPaceSec, avgPace, POOL_INTENSITY_MATCH_PCT),
      };
    }

    return {
      sample_size,
      pace_delta_sec: pace_delta_sec != null ? Math.round(pace_delta_sec) : null,
      hr_delta_bpm: hr_delta_bpm != null ? Math.round(hr_delta_bpm) : null,
      drift_delta_bpm: drift_delta_bpm != null ? Math.round(drift_delta_bpm) : null,
      assessment: assess,
      avg_pace_at_similar_hr: avgPaceAtSimilarHr != null ? Math.round(avgPaceAtSimilarHr) : null,
      avg_hr_drift: avgDrift != null ? Math.round(avgDrift) : null,
      trend_points,
      pace_basis: paceBasis,
      pool_intensity_filter: poolIntensityFilter,
      pool_pace_context,
    };
  } catch {
    return {
      sample_size: 0,
      pace_delta_sec: null,
      hr_delta_bpm: null,
      drift_delta_bpm: null,
      assessment: 'insufficient_data',
      avg_pace_at_similar_hr: null,
      avg_hr_drift: null,
      trend_points: [],
      pace_basis: 'raw' as const,
      pool_intensity_filter: null,
      pool_pace_context: null,
    };
  }
}

function linearRegressionSlope(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  if (!(den > 0)) return null;
  return num / den;
}

export async function getPaceTrend(
  supabase: SupabaseLike,
  params: { userId: string; workoutTypeKey: string | null; count?: number }
): Promise<TrendV1> {
  const { userId, workoutTypeKey, count = 8 } = params;
  try {
    const end = new Date().toISOString().slice(0, 10);
    const start = isoDateAddDays(end, -180);
    const rows = await fetchRecentWorkouts(supabase, userId, start, end, Math.max(12, count + 6));
    const comparableKeys = getComparableTypeKeys(workoutTypeKey);

    const filtered = rows
      .filter((r) => String(r.workout_status || '').toLowerCase() === 'completed')
      .filter((r) => {
        if (!workoutTypeKey) return true;
        const inferred = inferWorkoutTypeKey(r);
        return inferred != null && (comparableKeys.length > 0 ? comparableKeys.includes(inferred) : inferred === workoutTypeKey);
      })
      .map((r) => ({
        date: String(r.date || ''),
        pace: getOverallPaceSecPerMi(r),
        hr: getOverallAvgHr(r),
      }))
      .filter((x) => x.date && x.pace != null)
      .slice(0, count);

    if (filtered.length < 5) {
      return { data_points: filtered.length, direction: 'insufficient_data', magnitude: null };
    }

    const dates = filtered.map((x) => new Date(`${x.date}T00:00:00Z`).getTime());
    const minT = Math.min(...dates);
    const xsWeeks = dates.map((t) => (t - minT) / (7 * 24 * 3600 * 1000));
    const ysPace = filtered.map((x) => Number(x.pace));

    const slope = linearRegressionSlope(xsWeeks, ysPace); // sec/mi per week
    if (slope == null) return { data_points: filtered.length, direction: 'insufficient_data', magnitude: null };

    const direction: TrendDirection =
      slope < -3 ? 'improving' :
      slope > 3 ? 'declining' :
      'stable';

    const spanWeeksRaw = Math.max(...xsWeeks) - Math.min(...xsWeeks);
    // Guardrail: even with 5 data points, <~3 weeks is just comparing a couple close-together workouts.
    if (!(spanWeeksRaw >= 3)) {
      return { data_points: filtered.length, direction: 'insufficient_data', magnitude: null };
    }

    const weeksSpan = Math.max(1, Math.round(spanWeeksRaw));
    const totalDelta = slope * weeksSpan; // sec/mi across span
    const magnitude =
      direction === 'stable'
        ? null
        : `~${Math.round(Math.abs(totalDelta))} sec/mi ${direction === 'improving' ? 'faster' : 'slower'} over ~${weeksSpan} week${weeksSpan === 1 ? '' : 's'}`;

    return { data_points: filtered.length, direction, magnitude };
  } catch {
    return { data_points: 0, direction: 'insufficient_data', magnitude: null };
  }
}

export async function getNotableAchievements(
  supabase: SupabaseLike,
  params: { userId: string; currentWorkoutId: string; workoutTypeKey: string | null; lookbackDays?: number }
): Promise<AchievementV1[]> {
  const { userId, currentWorkoutId, workoutTypeKey, lookbackDays = 28 } = params;
  try {
    const end = new Date().toISOString().slice(0, 10);
    const start = isoDateAddDays(end, -lookbackDays);
    const rows = await fetchRecentWorkouts(supabase, userId, start, end, 120);
    // Use discipline-level (all runs) for achievements to avoid classification mismatch
    const discipline = getDiscipline(workoutTypeKey);
    const completed = rows
      .filter((r) => String(r.workout_status || '').toLowerCase() === 'completed')
      .filter((r) => String(r.id) !== String(currentWorkoutId))
      .filter((r) => getDiscipline(inferWorkoutTypeKey(r)) === discipline);

    const { data: cur } = await supabase
      .from('workouts')
      .select('id,user_id,type,date,workout_status,computed,workout_analysis,workload_actual,workload_planned,duration,moving_time,distance,elevation_gain')
      .eq('id', currentWorkoutId)
      .maybeSingle();
    const current = cur as any;
    const curDist = getOverallDistanceMi(current);
    const curDur = getOverallDurationMin(current);

    const achievements: AchievementV1[] = [];

    if (curDist != null) {
      const maxDist = Math.max(...completed.map((r) => getOverallDistanceMi(r) || 0), 0);
      if (curDist > maxDist + 0.05) {
        const margin = curDist - maxDist;
        achievements.push({
          type: 'longest_distance',
          description: `Longest ${discipline} distance in ${lookbackDays}d (${curDist.toFixed(1)} mi vs previous ${maxDist.toFixed(1)} mi).`,
          significance: margin >= 2 ? 'major' : margin >= 0.7 ? 'moderate' : 'minor',
        });
      }
    }

    if (curDur != null) {
      const maxDur = Math.max(...completed.map((r) => getOverallDurationMin(r) || 0), 0);
      if (curDur > maxDur + 2) {
        const margin = curDur - maxDur;
        achievements.push({
          type: 'longest_duration',
          description: `Longest ${discipline} duration in ${lookbackDays}d (${Math.round(curDur)} min vs previous ${Math.round(maxDur)} min).`,
          significance: margin >= 25 ? 'major' : margin >= 10 ? 'moderate' : 'minor',
        });
      }
    }

    // First in a while (>14d gap) — completed is already discipline-level
    const priorDate = completed
      .map((r) => String(r.date || ''))
      .filter(Boolean)
      .sort()
      .pop();
    if (priorDate) {
      const curDate = String(current?.date || '');
      if (curDate) {
        const gapDays = Math.round((new Date(`${curDate}T00:00:00Z`).getTime() - new Date(`${priorDate}T00:00:00Z`).getTime()) / (24 * 3600 * 1000));
        if (gapDays >= 14) {
          achievements.push({
            type: 'first_in_a_while',
            description: `First ${discipline} in ${gapDays} days.`,
            significance: gapDays >= 28 ? 'moderate' : 'minor',
          });
        }
      }
    }

    // Return top 1-2 by significance
    const rank = (s: AchievementV1['significance']) => (s === 'major' ? 3 : s === 'moderate' ? 2 : 1);
    achievements.sort((a, b) => rank(b.significance) - rank(a.significance));
    return achievements.slice(0, 2);
  } catch {
    return [];
  }
}

/**
 * Context-aware ACWR fatigue gate. The fact-packet `training_load` path used to
 * push "Training stress trending up" on a raw `acwr_ratio > 1.1` calendar sum with
 * no phase/transition/week-intent awareness — so it fired on a normal early-build
 * ride after a marathon taper+recovery (the taper/recovery weeks deflate the 28d
 * chronic denominator, mechanically inflating the ratio). The coach already
 * suppresses this via `isAcwrFatiguedSignal` in `_shared/acwr-state.ts`; this path
 * bypassed it. Equivalent logic, not a raw `isAcwrFatiguedSignal` call, because we
 * must (a) keep the moderate/high two-tier the fact packet emits and (b) preserve
 * the original 1.1/1.3 thresholds for normal/base weeks (isAcwrFatiguedSignal uses
 * 1.3 for the non-build path, which would silently drop the moderate tier).
 *
 *  - transition window  → no flag (load ratios contaminated by the prior cycle)
 *  - build/peak/baseline → only flag true overreaching (> build_elevated_max, 1.7),
 *                          since elevated ACWR is expected while building
 *  - otherwise (base/recovery/taper/unknown) → original 1.1 moderate / 1.3 high
 */
export function acwrFatigueSignal(
  ratio: number | null | undefined,
  isTransitionWindow: boolean = false,
  weekIntent: AcwrWeekIntent | string | null = 'build',
): { tier: 'high' | 'moderate'; message: string } | null {
  const v = Number(ratio);
  if (!Number.isFinite(v)) return null;
  if (isTransitionWindow) return null;
  const wi = weekIntent ?? 'build';
  if (wi === 'build' || wi === 'peak' || wi === 'baseline') {
    return v > ACWR_RATIO_THRESHOLDS.build_elevated_max
      ? { tier: 'high', message: 'Training stress elevated — recovery matters' }
      : null;
  }
  if (v > 1.3) return { tier: 'high', message: 'Training stress elevated — recovery matters' };
  if (v > 1.1) return { tier: 'moderate', message: 'Training stress trending up' };
  return null;
}

export async function getTrainingLoadContext(
  supabase: SupabaseLike,
  params: {
    userId: string;
    workoutDateIso: string;
    /** Plan week intent for ACWR gating; defaults to 'build' (lenient) when unknown. */
    weekIntent?: AcwrWeekIntent | string | null;
    /** First 1–2 plan weeks: ACWR ratios are contaminated by the prior cycle. */
    isTransitionWindow?: boolean;
  }
): Promise<TrainingLoadV1 | null> {
  const { userId, workoutDateIso } = params;
  const isTransitionWindow = params.isTransitionWindow ?? false;
  const weekIntent = params.weekIntent ?? 'build';
  try {
    const workoutDate = toDateOnly(workoutDateIso);
    if (!workoutDate) return null;

    const end = isoDateAddDays(workoutDate, -1);
    const start28 = isoDateAddDays(workoutDate, -28);
    const rows = await fetchRecentWorkouts(supabase, userId, start28, end, 220);

    const completed = rows
      .filter((r) => String(r.workout_status || '').toLowerCase() === 'completed')
      .filter((r) => toDateOnly(r.date) != null)
      .sort((a, b) => (toDateOnly(a.date) || '').localeCompare(toDateOnly(b.date) || '')); // ascending

    // Debug: log the raw dates/types we got back (date-only).
    try {
      const sample = completed
        .slice(-40)
        .map((r) => `${toDateOnly(r.date)}:${safeLower(r.type) || 'unknown'}`)
        .filter(Boolean);
      console.log(
        `[fact-packet] training_load query: workoutDateIso=${String(workoutDateIso)} normalized=${workoutDate} window=[${start28}..${end}] rows=${rows.length} completed=${completed.length} sample(last<=40)=[${sample.join(', ')}]`
      );
    } catch {}

    // Previous day (date-only comparison)
    const prevDate = isoDateAddDays(workoutDate, -1);
    const prev = completed.filter((r) => toDateOnly(r.date) === prevDate).sort((a, b) => (coerceNumber(b.workload_actual) || 0) - (coerceNumber(a.workload_actual) || 0))[0] || null;
    const previous_day_workload = Math.round(coerceNumber(prev?.workload_actual) || 0);
    const previous_day_type = prev ? (safeLower(prev.type) || null) : null;

    // Consecutive training days leading up to workout date (excluding workout day). Use date-only to avoid UTC/tz mismatch.
    // Define "training day" as a day with non-trivial load/duration (avoids counting trivial/misc entries).
    // This is intentionally conservative to prevent inflated streaks.
    const dayAgg = new Map<string, { workload: number; durationMin: number; types: Set<string> }>();
    for (const r of completed) {
      const d = toDateOnly(r.date);
      if (!d) continue;
      const wl = coerceNumber(r.workload_actual) || 0;
      const dur = getOverallDurationMin(r) || 0;
      const t = safeLower(r.type) || 'unknown';
      const cur = dayAgg.get(d) || { workload: 0, durationMin: 0, types: new Set<string>() };
      cur.workload += wl;
      cur.durationMin += dur;
      cur.types.add(t);
      dayAgg.set(d, cur);
    }

    const isTrainingDay = (d: string): boolean => {
      const a = dayAgg.get(d);
      if (!a) return false;
      const types = Array.from(a.types || []);
      const hasNonTrivialType = types.some((t) => !/(mobility|yoga|stretch)/i.test(t));
      // Thresholds tuned to avoid counting mobility/yoga/stretch as "training days".
      // A day can count via workload alone, or via meaningful duration only if it isn't just mobility-type work.
      return a.workload >= 10 || (a.durationMin >= 20 && hasNonTrivialType);
    };

    const trainingDates = new Set<string>(Array.from(dayAgg.keys()).filter(isTrainingDay));
    const streakDates: string[] = [];
    for (let i = 1; i <= 14; i += 1) {
      const d = isoDateAddDays(workoutDate, -i);
      if (trainingDates.has(d)) streakDates.push(d);
      else break;
    }
    const consecutive_training_days = streakDates.length;

    const streakDateSet = new Set(streakDates);

    const normalizeStreakModality = (t: string): string => {
      const s = safeLower(t);
      if (!s) return 'other';
      if (/(run|walk)/i.test(s)) return 'run';
      if (/(ride|bike|cycle)/i.test(s)) return 'ride';
      if (/strength/i.test(s)) return 'strength';
      if (/swim/i.test(s)) return 'swim';
      if (/(mobility|yoga|stretch)/i.test(s)) return 'mobility';
      return 'other';
    };

    /** Per-session counts inside the streak window (not per calendar day). */
    const streakModalityCounts: Record<string, number> = {};
    for (const r of completed) {
      const d = toDateOnly(r.date);
      if (!d || !streakDateSet.has(d)) continue;
      const k = normalizeStreakModality(safeLower(r.type) || '');
      streakModalityCounts[k] = (streakModalityCounts[k] || 0) + 1;
    }

    const streak_modality_summary = (() => {
      const entries = Object.entries(streakModalityCounts).filter(([, n]) => n > 0);
      if (!entries.length) return null;
      entries.sort((a, b) => b[1] - a[1]);
      return entries.map(([k, n]) => (n === 1 ? `1× ${k}` : `${n}× ${k}`)).join(', ');
    })();

    let streak_combined_workload = 0;
    for (const d of streakDates) {
      const a = dayAgg.get(d);
      if (a) streak_combined_workload += a.workload;
    }
    streak_combined_workload = Math.round(streak_combined_workload);

    const athleticFocusForDay = (d: string): TrainingLoadV1['previous_day_athletic_focus'] => {
      const a = dayAgg.get(d);
      if (!a) return null;
      let endurance = false;
      let strength = false;
      for (const t of Array.from(a.types || [])) {
        const s = safeLower(t);
        if (/(run|walk|ride|bike|cycle|swim)/i.test(s)) endurance = true;
        if (/strength/i.test(s)) strength = true;
      }
      if (endurance && strength) return 'mixed';
      if (endurance) return 'endurance';
      if (strength) return 'strength';
      return 'other';
    };

    const previous_day_athletic_focus = athleticFocusForDay(prevDate);
    // Debug: log the streak and the last N unique workout dates seen.
    try {
      const uniqSorted = Array.from(dayAgg.keys()).sort(); // ascending
      const last14 = Array.from({ length: 14 }, (_, i) => isoDateAddDays(workoutDate, -(i + 1)));
      const breakdown = last14
        .map((d) => {
          const a = dayAgg.get(d);
          if (!a) return `${d}:none`;
          const counted = isTrainingDay(d) ? 'Y' : 'n';
          return `${d}:${counted}(wl=${Math.round(a.workload)},dur=${Math.round(a.durationMin)}m,types=${Array.from(a.types).slice(0, 3).join('+')})`;
        })
        .join(' | ');
      console.log(
        `[fact-packet] consecutive_training_days=${consecutive_training_days} streak_wl=${streak_combined_workload} mix=${streak_modality_summary || '—'} prev_focus=${previous_day_athletic_focus || '—'} for workoutDate=${workoutDate}; streakDates=[${streakDates.join(', ')}]; dayAggDates(last<=25)=[${uniqSorted.slice(-25).join(', ')}]; last14_breakdown=${breakdown}`
      );
    } catch {}

    // Week load pct (Mon-Sun, week containing workoutDateIso)
    const weekStart = isoWeekStartMonday(workoutDate);
    const weekEnd = isoDateAddDays(weekStart, 6);
    const weekActualRows = await fetchRecentWorkouts(supabase, userId, weekStart, weekEnd, 80);
    const week_workload_actual = weekActualRows
      .filter((r) => String(r.workout_status || '').toLowerCase() === 'completed')
      .reduce((s, r) => s + (coerceNumber(r.workload_actual) || 0), 0);

    // Planned load for the week (if planned_workouts exists)
    let week_workload_planned: number | null = null;
    try {
      const { data: planned, error: pErr } = await supabase
        .from('planned_workouts')
        .select('workload_planned,workout_status,date')
        .eq('user_id', userId)
        .gte('date', weekStart)
        .lte('date', weekEnd);
      if (!pErr && Array.isArray(planned)) {
        week_workload_planned = planned.reduce((s: number, r: any) => s + (coerceNumber(r?.workload_planned) || 0), 0);
      }
    } catch {}

    const week_load_pct = (week_workload_planned && week_workload_planned > 0)
      ? Math.round((week_workload_actual / week_workload_planned) * 100)
      : null;

    // ACWR from 7d vs 28d workloads (completed workouts only); use date-only keys
    const dateToWorkload = new Map<string, number>();
    for (const r of completed) {
      const d = toDateOnly(r.date);
      const wl = coerceNumber(r.workload_actual);
      if (!d) continue;
      if (wl != null) dateToWorkload.set(d, (dateToWorkload.get(d) || 0) + wl);
    }
    const sumDays = (days: number): number => {
      let sum = 0;
      for (let i = 1; i <= days; i += 1) {
        const d = isoDateAddDays(workoutDate, -i);
        sum += dateToWorkload.get(d) || 0;
      }
      return sum;
    };
    const acute7 = sumDays(7);
    const chronic28 = sumDays(28);
    const acwr_ratio = (chronic28 > 0 && acute7 >= 0) ? (acute7 * 28) / (chronic28 * 7) : null;
    const acwr_status = acwr_ratio == null ? null
      : acwr_ratio < 0.9 ? 'undertrained'
      : acwr_ratio <= 1.15 ? 'optimal'
      : acwr_ratio <= 1.3 ? 'elevated'
      : 'high_risk';

    // Fatigue classification (deterministic)
    const fatigue_evidence: string[] = [];
    const flagsHigh: boolean[] = [];
    const flagsMod: boolean[] = [];

    // Streak flags: day count + minimum combined load so sparse days don't over-trigger.
    const streakAvgDaily = consecutive_training_days > 0
      ? streak_combined_workload / consecutive_training_days
      : 0;
    const streakMeaningful =
      consecutive_training_days >= 3 &&
      streak_combined_workload >= 28 &&
      streakAvgDaily >= 12;
    const streakLabel = consecutive_training_days > 0 && streak_modality_summary
      ? `${consecutive_training_days} training day${consecutive_training_days !== 1 ? 's' : ''} without rest (~${streak_combined_workload} combined load; ${streak_modality_summary})`
      : consecutive_training_days > 0
        ? `${consecutive_training_days} training day${consecutive_training_days !== 1 ? 's' : ''} without rest (~${streak_combined_workload} combined load)`
        : null;
    if (consecutive_training_days >= 5 && streakMeaningful) {
      flagsHigh.push(true);
      if (streakLabel) fatigue_evidence.push(streakLabel);
    } else if (consecutive_training_days >= 3 && streakMeaningful) {
      flagsMod.push(true);
      if (streakLabel) fatigue_evidence.push(streakLabel);
    }

    if (previous_day_workload > 80) { flagsHigh.push(true); fatigue_evidence.push(`Hard session yesterday`); }
    else if (previous_day_workload > 50) { flagsMod.push(true); fatigue_evidence.push(`Moderate session yesterday`); }

    if (week_load_pct != null && week_load_pct > 120) { flagsHigh.push(true); fatigue_evidence.push(`High training load this week (${week_load_pct}% of plan)`); }
    else if (week_load_pct != null && week_load_pct > 100) { flagsMod.push(true); fatigue_evidence.push(`Above-plan training load this week (${week_load_pct}%)`); }

    const acwrSig = acwrFatigueSignal(acwr_ratio, isTransitionWindow, weekIntent);
    if (acwrSig) {
      if (acwrSig.tier === 'high') flagsHigh.push(true);
      else flagsMod.push(true);
      fatigue_evidence.push(acwrSig.message);
    }

    const cumulative_fatigue: TrainingLoadV1['cumulative_fatigue'] =
      flagsHigh.length >= 2 ? 'high' :
      (flagsHigh.length >= 1 || flagsMod.length >= 1) ? 'moderate' :
      'low';

    return {
      previous_day_workload,
      previous_day_type,
      consecutive_training_days,
      streak_combined_workload,
      streak_modality_summary,
      previous_day_athletic_focus,
      week_load_pct,
      acwr_ratio: acwr_ratio != null ? Math.round(acwr_ratio * 100) / 100 : null,
      acwr_status,
      cumulative_fatigue,
      fatigue_evidence,
    };
  } catch {
    return null;
  }
}

