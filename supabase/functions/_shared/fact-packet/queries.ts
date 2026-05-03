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

function getOverallPaceSecPerMi(row: any): number | null {
  return resolveOverallPaceSecPerMi(row);
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
    currentAvgHr: number | null;
    currentHrDriftBpm: number | null;
    currentTerrainClass?: 'flat' | 'rolling' | 'hilly' | null;
  }
): Promise<VsSimilarV1 & { avg_pace_at_similar_hr: number | null; avg_hr_drift: number | null }> {
  const { userId, currentWorkoutId, workoutTypeKey, durationMin, currentAvgPaceSecPerMi, currentAvgHr, currentHrDriftBpm, currentTerrainClass } = params;

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
    const typeMatch = completed.filter((r) => {
      if (!workoutTypeKey) return true;
      const inferred = inferWorkoutTypeKey(r);
      return inferred != null && (comparableKeys.length > 0 ? comparableKeys.includes(inferred) : inferred === workoutTypeKey);
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

    const withMetrics = routeMatch.map((r) => {
      const pace = getOverallPaceSecPerMi(r);
      const hr = getOverallAvgHr(r);
      const drift = getHrDriftBpmFromAnalysis(r);
      return { r, pace, hr, drift };
    });
    const filtered = withMetrics.filter((x) => x.pace != null && x.hr != null);

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
    const trendWithPace = trendPool.filter((r) => r.date && getOverallPaceSecPerMi(r) != null);
    console.warn(`[fact-packet] trend_points: pool=${trendPoolSource}(${trendPool.length}), withPace=${trendWithPace.length}, wideBand=${wideBandLo}-${wideBandHi}min(${wideDurationMatch.length} hits)`);
    const trend_points = trendWithPace
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-8)
      .map((r) => {
        const pace = getOverallPaceSecPerMi(r)!;
        const hr = getOverallAvgHr(r);
        return {
          date: String(r.date),
          pace_sec_per_mi: Math.round(pace),
          avg_hr: hr != null ? Math.round(hr) : null,
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

    const pace_delta_sec = (currentAvgPaceSecPerMi != null && avgPace != null) ? (currentAvgPaceSecPerMi - avgPace) : null;
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

    return {
      sample_size,
      pace_delta_sec: pace_delta_sec != null ? Math.round(pace_delta_sec) : null,
      hr_delta_bpm: hr_delta_bpm != null ? Math.round(hr_delta_bpm) : null,
      drift_delta_bpm: drift_delta_bpm != null ? Math.round(drift_delta_bpm) : null,
      assessment: assess,
      avg_pace_at_similar_hr: avgPaceAtSimilarHr != null ? Math.round(avgPaceAtSimilarHr) : null,
      avg_hr_drift: avgDrift != null ? Math.round(avgDrift) : null,
      trend_points,
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

export async function getTrainingLoadContext(
  supabase: SupabaseLike,
  params: { userId: string; workoutDateIso: string }
): Promise<TrainingLoadV1 | null> {
  const { userId, workoutDateIso } = params;
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

    if (acwr_ratio != null && acwr_ratio > 1.3) { flagsHigh.push(true); fatigue_evidence.push(`Training stress elevated — recovery matters`); }
    else if (acwr_ratio != null && acwr_ratio > 1.1) { flagsMod.push(true); fatigue_evidence.push(`Training stress trending up`); }

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

