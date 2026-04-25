/**
 * course-detail — presentation payload for dumb client (chart + display groups).
 * POST JSON: { course_id?: string, goal_id?: string }
 * Finish time for header: coach projection / coach_cache (State parity), else plan target, else baseline VDOT — not from the client.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  normalizeElevationProfile,
  smoothElevation,
} from '../_shared/course-segmentation.ts';
import {
  hashAthleteSnapshot,
  fmtPaceClock,
  parsePaceToSecPerMi,
  fmtFinishClock,
  type SnapshotForHash,
} from '../_shared/course-strategy-helpers.ts';
import { resolveGoalTargetTimeSeconds } from '../_shared/resolve-goal-target-time.ts';
import {
  buildRaceFinishProjectionV1,
  pickRaceFinishProjectionV1ForCourseGoal,
} from '../_shared/resolve-server-predicted-finish.ts';
import { getArcContext } from '../_shared/arc-context.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MI_M = 1609.344;
const FT_PER_M = 3.28084;
const CHART_POINTS = 200;

async function getUser(supabase: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return { user: null as { id: string } | null, err: 'Missing authorization' };
  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return { user: null, err: 'Invalid authentication' };
  return { user, err: null };
}

function downsampleChart(profile: { distance_m: number; elevation_m: number }[], maxPts: number): [number, number][] {
  if (profile.length === 0) return [];
  if (profile.length <= maxPts) {
    return profile.map((p) => [p.distance_m / MI_M, p.elevation_m * FT_PER_M] as [number, number]);
  }
  const total = profile[profile.length - 1].distance_m;
  const out: [number, number][] = [];
  for (let i = 0; i < maxPts; i++) {
    const d = (total * i) / (maxPts - 1);
    let lo = 0;
    let hi = profile.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (profile[mid].distance_m <= d) lo = mid;
      else hi = mid;
    }
    const a = profile[lo];
    const b = profile[hi];
    const t = (d - a.distance_m) / Math.max(1e-6, b.distance_m - a.distance_m);
    const el = a.elevation_m + t * (b.elevation_m - a.elevation_m);
    out.push([d / MI_M, el * FT_PER_M]);
  }
  return out;
}

function dominantTerrain(
  rows: { terrain_type: string; start_distance_m: number; end_distance_m: number }[],
  gid: number,
): string {
  const by: Record<string, number> = {};
  for (const r of rows) {
    if (Number(r.display_group_id) !== gid) continue;
    const len = Number(r.end_distance_m) - Number(r.start_distance_m);
    by[r.terrain_type] = (by[r.terrain_type] || 0) + len;
  }
  let best = 'flat';
  let mx = 0;
  for (const [k, v] of Object.entries(by)) {
    if (v > mx) {
      mx = v;
      best = k;
    }
  }
  return best;
}

function assignTiers(startMi: number[], endMi: number[]): number[] {
  const tiers = startMi.map((_, i) => i % 2);
  for (let i = 1; i < tiers.length; i++) {
    const width = endMi[i] - startMi[i];
    if (width < 2 && tiers[i] === tiers[i - 1]) tiers[i] = 1 - tiers[i];
  }
  return tiers;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, key);
  const { user, err: authErr } = await getUser(supabase, req.headers.get('Authorization'));
  if (!user) {
    return new Response(JSON.stringify({ error: authErr }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  let courseId: string | null = null;
  let goalId: string | null = null;
  try {
    const body = await req.json() as Record<string, unknown>;
    courseId = body.course_id ? String(body.course_id) : null;
    goalId = body.goal_id ? String(body.goal_id) : null;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (!courseId && !goalId) {
    return new Response(JSON.stringify({ error: 'course_id or goal_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (!courseId && goalId) {
    const { data: rc } = await supabase.from('race_courses').select('id').eq('goal_id', goalId).eq('user_id', user.id).maybeSingle();
    courseId = rc?.id ?? null;
  }

  if (!courseId) {
    return new Response(JSON.stringify({ error: 'Course not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { data: course, error: cErr } = await supabase
    .from('race_courses')
    .select('id, user_id, goal_id, name, distance_m, elevation_gain_m, elevation_loss_m, elevation_profile, strategy_updated_at, athlete_snapshot_hash')
    .eq('id', courseId)
    .maybeSingle();

  if (cErr || !course || course.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Course not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { data: segs } = await supabase
    .from('course_segments')
    .select('*')
    .eq('course_id', courseId)
    .order('segment_order', { ascending: true });

  const rows = Array.isArray(segs) ? segs : [];
  const hasStrategy = rows.some((r) => r.effort_zone != null && r.target_pace_slow_sec_per_mi != null);

  let planGoalSec: number | null = null;
  if (course.goal_id) {
    planGoalSec = await resolveGoalTargetTimeSeconds(supabase, user.id, String(course.goal_id));
  }

  let primarySec: number | null = null;
  let goalTimeSource: 'predicted' | 'plan' | null = null;
  let planTargetTimeStr: string | null = null;
  let goalTimeMismatchBlurb: string | null = null;

  if (course.goal_id) {
    // Prefer unified projection from coach_cache (parity with State); else same resolver as coach.
    const { data: cacheRow } = await supabase.from('coach_cache').select('payload').eq('user_id', user.id).maybeSingle();
    const pl = cacheRow?.payload as Record<string, unknown> | undefined;
    const cachedRfp = pl ? pickRaceFinishProjectionV1ForCourseGoal(pl, String(course.goal_id)) : null;

    if (cachedRfp) {
      primarySec = cachedRfp.anchor_seconds;
      goalTimeSource = cachedRfp.source_kind === 'plan_target' ? 'plan' : 'predicted';
      const hasPlan = cachedRfp.plan_goal_seconds != null && cachedRfp.plan_goal_seconds > 0;
      const dupPlanHeadline =
        cachedRfp.source_kind === 'plan_target' && cachedRfp.anchor_seconds === cachedRfp.plan_goal_seconds;
      planTargetTimeStr = hasPlan && !dupPlanHeadline ? cachedRfp.plan_goal_display : null;
      goalTimeMismatchBlurb = cachedRfp.mismatch_blurb;
    } else {
      const { data: gPred, error: gPredErr } = await supabase
        .from('goals')
        .select('*')
        .eq('id', course.goal_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (gPredErr) {
        console.warn('[course-detail] goals select for projection', gPredErr.message);
      } else if (gPred) {
        const gr = gPred as Record<string, unknown>;
        const built = await buildRaceFinishProjectionV1(
          supabase,
          user.id,
          {
            name: String(gr.name || ''),
            distance: gr.distance != null ? String(gr.distance) : null,
            target_date: gr.target_date != null ? String(gr.target_date) : null,
            target_time: gr.target_time != null ? Number(gr.target_time) : null,
            sport: gr.sport != null ? String(gr.sport) : null,
            race_readiness_projection: gr.race_readiness_projection,
          },
          String(course.goal_id),
          planGoalSec,
        );
        if (built) {
          primarySec = built.anchor_seconds;
          goalTimeSource = built.source_kind === 'plan_target' ? 'plan' : 'predicted';
          const hasPlan = built.plan_goal_seconds != null && built.plan_goal_seconds > 0;
          const dupPlanHeadline =
            built.source_kind === 'plan_target' && built.anchor_seconds === built.plan_goal_seconds;
          planTargetTimeStr = hasPlan && !dupPlanHeadline ? built.plan_goal_display : null;
          goalTimeMismatchBlurb = built.mismatch_blurb;
        }
      }
    }
  }

  if (primarySec == null && planGoalSec != null) {
    primarySec = planGoalSec;
    goalTimeSource = 'plan';
    planTargetTimeStr = null;
  }

  const goalTimeStr = primarySec != null ? fmtFinishClock(primarySec) : null;

  const rawProfile = normalizeElevationProfile(course.elevation_profile);
  const smoothed = smoothElevation(rawProfile, 2);
  const chart = downsampleChart(smoothed, CHART_POINTS);

  // Arc-aware fitness: use learned paces from actual training history, fall back to
  // performance_numbers for new users without sufficient learned data.
  const arc = await getArcContext(supabase, user.id, new Date().toISOString());
  const pfc = arc.run_pace_for_coach;
  const pn = (arc.performance_numbers || {}) as Record<string, unknown>;

  const KM_TO_MI = 1.609344;
  const easySec: number | null =
    pfc?.easy?.sec_per_km != null
      ? Math.round(pfc.easy.sec_per_km * KM_TO_MI)
      : parsePaceToSecPerMi(pn.easy_pace ?? pn.easyPace ?? pn.easy_pace_sec_per_mi);
  const threshSec: number | null =
    pfc?.threshold?.sec_per_km != null
      ? Math.round(pfc.threshold.sec_per_km * KM_TO_MI)
      : parsePaceToSecPerMi(pn.threshold_pace ?? pn.thresholdPace ?? pn.threshold_pace_sec_per_mi ?? pn.fiveK_pace);
  const maxHr = Number(pn.max_heart_rate ?? pn.maxHeartRate ?? 0) || null;

  // HR zones not yet in ArcContext — read separately.
  const { data: baseline } = await supabase
    .from('user_baselines')
    .select('configured_hr_zones')
    .eq('user_id', user.id)
    .maybeSingle();
  const cz = baseline?.configured_hr_zones as Record<string, unknown> | null;
  const zonesArr = (cz?.zones as Array<{ min?: number; max?: number | null }>) || [];
  const hrZonesForHash: Record<string, string> = {};
  zonesArr.forEach((z, i) => {
    hrZonesForHash[`z${i + 1}`] = `${z.min ?? ''}-${z.max ?? ''}`;
  });

  const { data: recentRuns } = await supabase
    .from('workouts')
    .select('distance, avg_heart_rate')
    .eq('user_id', user.id)
    .eq('type', 'run')
    .eq('workout_status', 'completed')
    .order('date', { ascending: false })
    .limit(20);

  let longMi = 0;
  let longHr: number | null = null;
  for (const w of recentRuns || []) {
    const km = Number(w.distance) || 0;
    const mi = km * 0.621371;
    if (mi >= 10 && mi > longMi) {
      longMi = mi;
      longHr = w.avg_heart_rate != null ? Number(w.avg_heart_rate) : null;
    }
  }

  const snap: SnapshotForHash = {
    easy_pace: easySec,
    threshold_pace: threshSec,
    hr_zones: hrZonesForHash,
    max_hr: maxHr,
    recent_long_run_avg_hr: longHr,
    recent_long_run_decoupling: null,
  };
  const currentHash = await hashAthleteSnapshot(snap);
  const storedHash = course.athlete_snapshot_hash as string | null;
  const strategyStale = Boolean(hasStrategy && storedHash && currentHash !== storedHash);

  const groupIds = [...new Set(rows.map((r) => r.display_group_id).filter((x) => x != null))].sort(
    (a, b) => Number(a) - Number(b),
  ) as number[];

  // Terrain-adjusted finish time: walk elevation profile applying grade-adjusted pace.
  // Starting from the implied flat pace (fitness projection / distance), each micro-segment
  // gets +10 s/mi per 1% uphill grade (capped at +60) and -6 s/mi per 1% downhill (capped at -20).
  let terrainAdjustedFinishSec: number | null = null;
  if (primarySec != null && primarySec > 0 && smoothed.length >= 2) {
    const distMiTotal = Number(course.distance_m) / MI_M;
    const flatPace = primarySec / distMiTotal;
    let accSec = 0;
    for (let i = 1; i < smoothed.length; i++) {
      const p1 = smoothed[i - 1];
      const p2 = smoothed[i];
      const segDistM = p2.distance_m - p1.distance_m;
      if (segDistM <= 0) continue;
      const segDistMi = segDistM / MI_M;
      const grade = (p2.elevation_m - p1.elevation_m) / segDistM * 100; // %
      const gradeAdj = grade > 0
        ? Math.min(grade * 10, 60)
        : Math.max(grade * 6, -20);
      accSec += (flatPace + gradeAdj) * segDistMi;
    }
    const rounded = Math.round(accSec);
    terrainAdjustedFinishSec = rounded;
  }

  const displayGroups: Record<string, unknown>[] = [];
  const startMiList: number[] = [];
  const endMiList: number[] = [];

  for (const gid of groupIds) {
    const inG = rows.filter((r) => Number(r.display_group_id) === gid);
    if (inG.length === 0) continue;
    const first = inG[0];
    const sm = Math.min(...inG.map((r) => Number(r.start_distance_m))) / MI_M;
    const em = Math.max(...inG.map((r) => Number(r.end_distance_m))) / MI_M;
    startMiList.push(sm);
    endMiList.push(em);
    const slow = Number(first.target_pace_slow_sec_per_mi);
    const fast = Number(first.target_pace_fast_sec_per_mi);
    const hrl = first.target_hr_low;
    const hrh = first.target_hr_high;
    const paceRange = Number.isFinite(slow) && Number.isFinite(fast)
      ? `${fmtPaceClock(slow)}–${fmtPaceClock(fast)}/mi`
      : '—';
    const hrRange = hrl != null && hrh != null ? `${hrl}–${hrh} bpm` : '—';
    const cueRow = inG.find((r) => r.coaching_cue != null && String(r.coaching_cue).trim());
    displayGroups.push({
      id: gid,
      start_mi: Math.round(sm * 100) / 100,
      end_mi: Math.round(em * 100) / 100,
      label: String(first.display_label || '').slice(0, 40),
      terrain_type: dominantTerrain(rows as any, gid),
      effort_zone: first.effort_zone,
      pace_range: paceRange,
      hr_range: hrRange,
      cue: cueRow?.coaching_cue ?? '',
      tier: 0,
    });
  }

  const tiers = assignTiers(startMiList, endMiList);
  displayGroups.forEach((g, i) => {
    g.tier = tiers[i] ?? 0;
  });

  const payload = {
    course: {
      id: course.id,
      name: course.name,
      distance_mi: Math.round((Number(course.distance_m) / MI_M) * 100) / 100,
      elevation_gain_ft: Math.round(Number(course.elevation_gain_m) * FT_PER_M),
      elevation_loss_ft: Math.round(Number(course.elevation_loss_m) * FT_PER_M),
      goal_time: goalTimeStr,
      goal_time_source: goalTimeSource,
      plan_target_time: planTargetTimeStr,
      goal_time_mismatch_blurb: goalTimeMismatchBlurb,
      terrain_adjusted_time: terrainAdjustedFinishSec != null ? fmtFinishClock(terrainAdjustedFinishSec) : null,
      _debug_terrain: { primarySec, smoothedLen: smoothed.length, terrainSec: terrainAdjustedFinishSec, distM: Number(course.distance_m) },
      strategy_updated_at: course.strategy_updated_at,
      strategy_stale: strategyStale,
      has_strategy: hasStrategy,
      elevation_profile: chart,
    },
    display_groups: displayGroups,
  };

  return new Response(JSON.stringify(payload), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
