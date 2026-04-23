/**
 * Fetches baselines, goals, course, prior finishes, and last swim; writes goals.projection.
 */
import {
  isTriEventGoal,
  normalizeGoalDistanceKey,
  projectRaceSplits,
  type RaceProjection,
} from './race-projections.ts';
import type { AthleteIdentity, LearnedFitness } from './arc-context.ts';

const THREE_Y_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;

function weeksUntil(fromISO: string, raceDateStr: string): number {
  const a = new Date(fromISO.slice(0, 10) + 'T12:00:00Z').getTime();
  const b = new Date(raceDateStr.slice(0, 10) + 'T12:00:00Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const w = (b - a) / (7 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(w));
}

/**
 * User-reported prior finish from baselines.athlete_identity (Arc setup), when no
 * completed goal row with target_time exists for that normalized distance.
 */
function priorFromLastImDistanceRace(
  ai: AthleteIdentity | null,
  goalKey: string,
): { total_seconds: number; race_date: string } | undefined {
  if (!ai || typeof ai !== 'object') return undefined;
  const raw = (ai as Record<string, unknown>)['last_im_distance_race'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (o.completed === false) return undefined;
  const distPart = o.distance != null ? String(o.distance) : o.distance_key != null ? String(o.distance_key) : '';
  if (normalizeGoalDistanceKey(distPart) !== goalKey) return undefined;
  const dateStr = o.date != null ? String(o.date).trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return undefined;
  const pMs = new Date(dateStr + 'T12:00:00Z').getTime();
  if (!Number.isFinite(pMs) || pMs > Date.now() || Date.now() - pMs > THREE_Y_MS) return undefined;
  const tt = Number(o.finish_time_seconds);
  if (!Number.isFinite(tt) || tt < 60) return undefined;
  return { total_seconds: Math.round(tt), race_date: dateStr };
}

export async function recomputeRaceProjectionsForUser(
  supabase: { from: (t: string) => any },
  userId: string,
  options?: { goalIds?: string[] },
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: baseline, error: bErr } = await supabase
    .from('user_baselines')
    .select('athlete_identity, learned_fitness, performance_numbers, birthday, gender')
    .eq('user_id', userId)
    .maybeSingle();
  if (bErr) {
    console.warn('[recompute-goal-race-projections] baselines', bErr.message);
    return;
  }
  const learned_fitness = (baseline?.learned_fitness as LearnedFitness) || null;
  const athlete_identity = (baseline?.athlete_identity as AthleteIdentity) || null;
  const performance_numbers =
    baseline?.performance_numbers != null && typeof baseline.performance_numbers === 'object' && !Array.isArray(baseline.performance_numbers)
      ? (baseline.performance_numbers as Record<string, unknown>)
      : null;
  const profile_birthday =
    baseline?.birthday != null ? String(baseline.birthday).slice(0, 10) : null;
  const profile_gender = baseline?.gender != null ? String(baseline.gender) : null;

  let gq = supabase
    .from('goals')
    .select('id, name, distance, target_date, sport, status, target_time')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('goal_type', 'event');
  if (options?.goalIds?.length) gq = gq.in('id', options.goalIds);
  const { data: goals, error: gErr } = await gq;
  if (gErr) {
    console.warn('[recompute-goal-race-projections] goals', gErr.message);
    return;
  }

  const { data: lastSwimRow } = await supabase
    .from('workouts')
    .select('date')
    .eq('user_id', userId)
    .eq('workout_status', 'completed')
    .in('type', ['swim', 'Swimming', 'swimming'])
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const last_swim_date =
    lastSwimRow && typeof (lastSwimRow as { date?: string }).date === 'string'
      ? (lastSwimRow as { date: string }).date.slice(0, 10)
      : null;

  const { data: priorGoals } = await supabase
    .from('goals')
    .select('id, target_date, distance, target_time, status, name')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .not('target_time', 'is', null)
    .order('target_date', { ascending: false });

  for (const g of goals || []) {
    const gr = g as Record<string, unknown>;
    const sport = gr.sport != null ? String(gr.sport) : '';
    const distance = gr.distance != null ? String(gr.distance) : '';
    if (!isTriEventGoal(sport, distance)) continue;

    const gid = String(gr.id);
    const targetDate = gr.target_date != null ? String(gr.target_date) : null;
    if (!targetDate) continue;

    const { data: rc } = await supabase
      .from('race_courses')
      .select('course_data, elevation_gain_m')
      .eq('user_id', userId)
      .eq('goal_id', gid)
      .maybeSingle();

    const courseRow = rc as { course_data?: unknown; elevation_gain_m?: number } | null;
    const course_data = courseRow
      ? {
          ...(typeof courseRow.course_data === 'object' && courseRow.course_data !== null && !Array.isArray(courseRow.course_data)
            ? (courseRow.course_data as object)
            : {}),
          elevation_gain_m: Number(courseRow.elevation_gain_m) || 0,
        }
      : undefined;

    const key = normalizeGoalDistanceKey(distance);
    let prior_result: {
      total_seconds: number;
      race_date: string;
      splits?: { swim_min: number; bike_min: number; run_min: number; t1_t2_min?: number };
    } | undefined;

    const priorList = (priorGoals || []) as { target_date: string; distance: string; target_time: number }[];
    for (const p of priorList) {
      if (normalizeGoalDistanceKey(p.distance) !== key) continue;
      const pMs = new Date(p.target_date.slice(0, 10) + 'T12:00:00Z').getTime();
      if (!Number.isFinite(pMs) || pMs > Date.now()) continue;
      if (Date.now() - pMs > THREE_Y_MS) continue;
      const tt = Number(p.target_time);
      if (!Number.isFinite(tt) || tt < 60) continue;
      prior_result = { total_seconds: Math.round(tt), race_date: p.target_date.slice(0, 10) };
      break;
    }
    if (!prior_result) {
      const fromIdentity = priorFromLastImDistanceRace(athlete_identity, key);
      if (fromIdentity) prior_result = fromIdentity;
    }

    const weeks_remaining = weeksUntil(today, targetDate);
    const projection: RaceProjection = projectRaceSplits({
      learned_fitness,
      athlete_identity,
      performance_numbers,
      profile_birthday,
      profile_gender,
      goal: { distance, target_date: targetDate, sport },
      course_data,
      prior_result,
      weeks_remaining,
      last_swim_date,
    });

    const { error: uErr } = await supabase
      .from('goals')
      .update({ projection: projection as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq('id', gid)
      .eq('user_id', userId);
    if (uErr) {
      console.warn(`[recompute-goal-race-projections] update ${gid}`, uErr.message);
    }
  }
}
