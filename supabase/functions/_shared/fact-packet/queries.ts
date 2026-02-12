import type {
  AchievementV1,
  TrendV1,
  TrendDirection,
  VsSimilarV1,
  SimilarAssessment,
  TrainingLoadV1,
} from './types.ts';
import { coerceNumber, isoDateAddDays, isoWeekStartMonday } from './utils.ts';

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

function getOverallPaceSecPerMi(row: any): number | null {
  const overall = getComputedOverall(row)?.overall;
  const v = coerceNumber(overall?.avg_pace_s_per_mi ?? overall?.avg_pace_sec_per_mi);
  return v != null && v > 0 ? v : null;
}

function getOverallDurationMin(row: any): number | null {
  const overall = getComputedOverall(row)?.overall;
  const durS = coerceNumber(overall?.duration_s_moving ?? overall?.duration_s_elapsed);
  if (durS != null && durS > 0) return durS / 60;
  const mvMin = coerceNumber(row?.moving_time);
  if (mvMin != null && mvMin > 0) return mvMin;
  const durMin = coerceNumber(row?.duration);
  return durMin != null && durMin > 0 ? durMin : null;
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

function getOverallDistanceMi(row: any): number | null {
  const overall = getComputedOverall(row)?.overall;
  const m = coerceNumber(overall?.distance_m);
  if (m != null && m > 0) return m / 1609.34;
  const km = coerceNumber(row?.distance);
  if (km != null && km > 0) return km * 0.621371;
  return null;
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

function inferWorkoutTypeKey(row: any): string | null {
  // Prefer analyzer output if available
  const wa = row?.workout_analysis;
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
function getComparableTypeKeys(key: string | null): string[] {
  if (!key) return [];
  const k = safeLower(key);
  const easyLike = ['recovery', 'easy', 'easy_run', 'steady_state', 'run'];
  if (easyLike.includes(k)) return easyLike;
  if (['long_run', 'long_run_fast_finish'].includes(k)) return ['long_run', 'long_run_fast_finish'];
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
    .select('id,user_id,type,date,workout_status,computed,workout_analysis,workload_actual,workload_planned,duration,moving_time,distance,elevation_gain')
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
  }
): Promise<VsSimilarV1 & { avg_pace_at_similar_hr: number | null; avg_hr_drift: number | null }> {
  const { userId, currentWorkoutId, workoutTypeKey, durationMin, currentAvgPaceSecPerMi, currentAvgHr, currentHrDriftBpm } = params;

  try {
    const end = new Date().toISOString().slice(0, 10);
    const start = isoDateAddDays(end, -120);
    const rows = await fetchRecentWorkouts(supabase, userId, start, end, 60);

    const bandLo = Math.max(5, durationMin - 10);
    const bandHi = durationMin + 10;

    const comparableKeys = getComparableTypeKeys(workoutTypeKey);
    const filtered = rows
      .filter((r) => String(r.id) !== String(currentWorkoutId))
      .filter((r) => String(r.workout_status || '').toLowerCase() === 'completed')
      .filter((r) => {
        if (!workoutTypeKey) return true;
        const inferred = inferWorkoutTypeKey(r);
        return inferred != null && (comparableKeys.length > 0 ? comparableKeys.includes(inferred) : inferred === workoutTypeKey);
      })
      .filter((r) => {
        const d = getOverallDurationMin(r);
        return d != null && d >= bandLo && d <= bandHi;
      })
      .map((r) => {
        const pace = getOverallPaceSecPerMi(r);
        const hr = getOverallAvgHr(r);
        const drift = getHrDriftBpmFromAnalysis(r);
        return { r, pace, hr, drift };
      })
      .filter((x) => x.pace != null && x.hr != null);

    const sample_size = filtered.length;
    console.log(`[fact-packet] similar workouts: workoutTypeKey=${workoutTypeKey}, comparableKeys=[${comparableKeys.join(',')}], durationBand=[${bandLo}-${bandHi}]min, matched=${sample_size} of ${rows.length} recent`);
    if (sample_size < 3) {
      return {
        sample_size,
        pace_delta_sec: null,
        hr_delta_bpm: null,
        drift_delta_bpm: null,
        assessment: 'insufficient_data',
        avg_pace_at_similar_hr: null,
        avg_hr_drift: null,
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

    // Pace at similar HR (within ±5 bpm of current HR)
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

    const filtered = rows
      .filter((r) => String(r.workout_status || '').toLowerCase() === 'completed')
      .filter((r) => {
        if (!workoutTypeKey) return true;
        return inferWorkoutTypeKey(r) === workoutTypeKey;
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

    const weeksSpan = Math.max(1, Math.round(Math.max(...xsWeeks) - Math.min(...xsWeeks)));
    const totalDelta = slope * weeksSpan; // sec/mi across span
    const magnitude =
      direction === 'stable'
        ? null
        : `~${Math.round(Math.abs(totalDelta))} sec/mi ${direction === 'improving' ? 'faster' : 'slower'} over ~${weeksSpan} weeks`;

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
    const completed = rows
      .filter((r) => String(r.workout_status || '').toLowerCase() === 'completed')
      .filter((r) => String(r.id) !== String(currentWorkoutId))
      .filter((r) => {
        if (!workoutTypeKey) return true;
        return inferWorkoutTypeKey(r) === workoutTypeKey;
      });

    // Need current workout info too; fetch it quickly.
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
          description: `Longest distance in ${lookbackDays}d (${curDist.toFixed(1)} mi vs previous ${maxDist.toFixed(1)} mi).`,
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
          description: `Longest duration in ${lookbackDays}d (${Math.round(curDur)} min vs previous ${Math.round(maxDur)} min).`,
          significance: margin >= 25 ? 'major' : margin >= 10 ? 'moderate' : 'minor',
        });
      }
    }

    // First in a while (>14d gap)
    const prior = completed
      .map((r) => String(r.date || ''))
      .filter(Boolean)
      .sort()
      .pop();
    if (prior) {
      const curDate = String(current?.date || '');
      if (curDate) {
        const gapDays = Math.round((new Date(`${curDate}T00:00:00Z`).getTime() - new Date(`${prior}T00:00:00Z`).getTime()) / (24 * 3600 * 1000));
        if (gapDays >= 14) {
          achievements.push({
            type: 'first_in_a_while',
            description: `First ${workoutTypeKey || 'workout'} in ${gapDays} days.`,
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
      // Thresholds tuned to avoid counting mobility/short walks/etc.
      return a.workload >= 10 || a.durationMin >= 20;
    };

    const trainingDates = new Set<string>(Array.from(dayAgg.keys()).filter(isTrainingDay));
    const streakDates: string[] = [];
    for (let i = 1; i <= 14; i += 1) {
      const d = isoDateAddDays(workoutDate, -i);
      if (trainingDates.has(d)) streakDates.push(d);
      else break;
    }
    const consecutive_training_days = streakDates.length;
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
        `[fact-packet] consecutive_training_days=${consecutive_training_days} for workoutDate=${workoutDate}; streakDates=[${streakDates.join(', ')}]; dayAggDates(last<=25)=[${uniqSorted.slice(-25).join(', ')}]; last14_breakdown=${breakdown}`
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

    if (consecutive_training_days >= 5) { flagsHigh.push(true); fatigue_evidence.push(`${consecutive_training_days} consecutive training days`); }
    else if (consecutive_training_days >= 3) { flagsMod.push(true); fatigue_evidence.push(`${consecutive_training_days} consecutive training days`); }

    if (previous_day_workload > 80) { flagsHigh.push(true); fatigue_evidence.push(`Yesterday workload ${previous_day_workload}`); }
    else if (previous_day_workload > 50) { flagsMod.push(true); fatigue_evidence.push(`Yesterday workload ${previous_day_workload}`); }

    if (week_load_pct != null && week_load_pct > 120) { flagsHigh.push(true); fatigue_evidence.push(`Week at ${week_load_pct}% of planned load`); }
    else if (week_load_pct != null && week_load_pct > 100) { flagsMod.push(true); fatigue_evidence.push(`Week at ${week_load_pct}% of planned load`); }

    if (acwr_ratio != null && acwr_ratio > 1.3) { flagsHigh.push(true); fatigue_evidence.push(`ACWR ${acwr_ratio.toFixed(2)}`); }
    else if (acwr_ratio != null && acwr_ratio > 1.1) { flagsMod.push(true); fatigue_evidence.push(`ACWR ${acwr_ratio.toFixed(2)}`); }

    const cumulative_fatigue: TrainingLoadV1['cumulative_fatigue'] =
      flagsHigh.length >= 2 ? 'high' :
      (flagsHigh.length >= 1 || flagsMod.length >= 1) ? 'moderate' :
      'low';

    return {
      previous_day_workload,
      previous_day_type,
      consecutive_training_days,
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

