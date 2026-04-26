/**
 * course-strategy — rebuild geometry, call LLM, persist strategy on course_segments.
 * POST JSON: { course_id: string }
 * Paces to current-fitness projection when available (client or server-computed race_readiness);
 * plan/goal time is context only. Falls back to plan goal if no projection can be computed.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callLLM } from '../_shared/llm.ts';
import {
  normalizeElevationProfile,
  smoothElevation,
  segmentCourseFromProfile,
  type GeometrySegment,
} from '../_shared/course-segmentation.ts';
import {
  hashAthleteSnapshot,
  stripJsonFences,
  validateLlmResponse,
  materializeSegmentRows,
  geometryToPromptSegments,
  alignCoachingCuesWithGeometry,
  applyClimbPaceFloorToDisplayGroups,
  parsePaceToSecPerMi,
  fmtPaceClock,
  fmtFinishClock,
  impliedAvgPaceSecPerMi,
  goalDistanceMi,
  type SnapshotForHash,
  type LlmDisplayGroup,
} from '../_shared/course-strategy-helpers.ts';
import { resolveGoalTargetTimeSeconds } from '../_shared/resolve-goal-target-time.ts';
import {
  resolvePaceAnchorForCourse,
  pickRaceFinishProjectionV1ForCourseGoal,
} from '../_shared/resolve-server-predicted-finish.ts';
import { fetchRaceWeatherArchive } from '../_shared/fetch-race-weather-archive.ts';
import { getArcContext } from '../_shared/arc-context.ts';
import { findGoalForCourse } from '../_shared/match-goal-for-course.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function getUser(supabase: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return { user: null as { id: string } | null, err: 'Missing authorization' };
  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return { user: null, err: 'Invalid authentication' };
  return { user, err: null };
}

async function promptHash(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** First lat,lng from Google-encoded polyline (precision 5). */
function decodePolylineFirstPoint(encoded: string): [number, number] | null {
  const s = String(encoded || '').trim();
  if (!s) return null;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = 1e5;
  for (let k = 0; k < 2; k++) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= s.length) return null;
      byte = s.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const delta = (result & 1) ? ~(result >> 1) : result >> 1;
    if (k === 0) lat += delta;
    else lng += delta;
  }
  return [lat / factor, lng / factor];
}

function extractDrift(wa: Record<string, unknown> | null): number | null {
  if (!wa) return null;
  const ga = wa.granular_analysis as Record<string, unknown> | undefined;
  const hra = ga?.heart_rate_analysis as Record<string, unknown> | undefined;
  const d1 = hra?.hr_drift_bpm;
  const hs = wa.heart_rate_summary as Record<string, unknown> | undefined;
  const d2 = hs?.drift_bpm;
  const v = Number(d1 ?? d2);
  return Number.isFinite(v) ? v : null;
}

type StrategyLeg = 'swim' | 'bike' | 'run' | 'full';

function buildPrompt(params: {
  roleIntro: string;
  segments: Record<string, unknown>[];
  easy: string;
  threshold: string;
  zones: string;
  maxHr: string;
  longRun: string;
  goalTime: string;
  impliedAvg: string;
  pacingContextLines: string;
  legExtraInstructions: string;
}): string {
  return `${params.roleIntro}

Course segments (geometry):
${JSON.stringify(params.segments)}

Athlete profile:
- Easy pace: ${params.easy}/mi
- Threshold pace: ${params.threshold}/mi
- HR zones: ${params.zones}
- Max HR: ${params.maxHr}
- Recent long run: ${params.longRun}
- Race pacing target (anchor all pace bands to this finish time and implied average pace): ${params.goalTime} (${params.impliedAvg}/mi average)
${params.pacingContextLines}
${params.legExtraInstructions}

Instructions:
1. Group adjacent segments of similar terrain into display groups. For a full marathon, target about 7 groups (roughly 6–9); scale down for shorter races. Do not merge distinct terrain episodes—if geometry separates a steep descent from different rolling flats, keep separate display groups rather than one mega-segment.
2. For each display group, assign:
   - display_group_id (1-indexed)
   - segment_orders: array of segment_order values in this group
   - display_label: max 40 chars
   - effort_zone: "conservative" | "cruise" | "caution" | "push"
   - target_pace_slow_sec_per_mi: slower bound (higher number)
   - target_pace_fast_sec_per_mi: faster bound (lower number)
   - target_hr_low, target_hr_high
   - coaching_cue: max 80 chars, imperative, reference terrain

3. Ground every coaching_cue in the segment list: if ANY segment in that display group has terrain_type "climb" or clearly positive elevation_change_ft, you must not describe the whole group as only "flat" or "flat terrain"—mention the rise (even briefly, e.g. "short climb to the line").
4. Net downhill groups can still have a small finishing bump; check the last segments in the group before calling the finish "flat".
5. Pacing vs terrain: if a display group includes any climb terrain or meaningful net elevation gain in the segment list, set pace bounds at least as conservative as an equivalent flat section (usually a few sec/mi slower on the slow bound, not faster splits "because push")—runners slow on uphills; HR may sit at the upper end of the band. Descent-heavy groups may allow slightly quicker bounds where appropriate.
6. Effort zones: long gentle net-downhill sections are often "cruise" (easy rhythm). Use "caution" for steep descents, technical drops, and for late-race segments (mile ~18+) that are flat or rolling after many miles of sustained descent—leg fatigue dominates even when grade looks easy, so prefer "caution" over "cruise" for those late flats/rollers unless segments clearly show easy fresh terrain.

Rules: target_pace_slow_sec_per_mi >= target_pace_fast_sec_per_mi. HR realistic vs max. Across all display groups, distance-weighted pace must imply a finish time within ~3 minutes of the race pacing target (same as ${params.goalTime}); do not pace implicitly to a faster aspirational plan time if a slower fitness-based target was given in context.

Return ONLY valid JSON, no markdown:
{"display_groups":[{"display_group_id":1,"segment_orders":[1,2],"display_label":"Mi 0–2 · start","effort_zone":"conservative","target_pace_slow_sec_per_mi":680,"target_pace_fast_sec_per_mi":640,"target_hr_low":130,"target_hr_high":145,"coaching_cue":"Start easy on early climbs"}]}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, key);
  const { user, err: authErr } = await getUser(supabase, req.headers.get('Authorization'));
  if (!user) {
    return new Response(JSON.stringify({ error: authErr }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  let courseId = '';
  try {
    const body = await req.json() as Record<string, unknown>;
    courseId = String(body.course_id || '');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (!courseId) {
    return new Response(JSON.stringify({ error: 'course_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  let { data: course, error: cErr } = await supabase
    .from('race_courses')
    .select('id, user_id, goal_id, leg, elevation_profile, distance_m, name, polyline, race_date')
    .eq('id', courseId)
    .maybeSingle();

  if (cErr || !course || course.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Course not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (!course.goal_id) {
    const matched = await findGoalForCourse(supabase, user.id, {
      courseName: String(course.name || 'Race course'),
      courseDate: (course as { name: string; race_date?: string | null }).race_date ?? null,
    });
    if (matched) {
      const leg = String((course as { leg?: string }).leg || 'full');
      const { data: other } = await supabase
        .from('race_courses')
        .select('id')
        .eq('user_id', user.id)
        .eq('goal_id', matched.id)
        .eq('leg', leg)
        .neq('id', courseId)
        .maybeSingle();
      if (other?.id) {
        await supabase.from('race_courses').update({ goal_id: null }).eq('id', other.id);
        console.warn(
          '[course-strategy] cleared goal_id on race_courses',
          other.id,
          'so course',
          courseId,
          'can link to',
          matched.id,
          'leg',
          leg,
        );
      }
      const { error: linkErr } = await supabase
        .from('race_courses')
        .update({ goal_id: matched.id })
        .eq('id', courseId);
      if (linkErr) {
        console.error('[course-strategy] auto-link goal', linkErr);
        return new Response(JSON.stringify({ error: 'Could not link course to goal' }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      course = { ...course, goal_id: matched.id };
      console.warn('[course-strategy] auto-linked course', courseId, 'to goal', matched.id, matched.name);
    } else {
      console.warn(
        '[course-strategy] no goal_id on course and no match by name/date:',
        courseId,
        String(course.name),
        (course as { race_date?: string | null }).race_date,
      );
      return new Response(
        JSON.stringify({
          error:
            'This course is not linked to a goal. Add goal_id, set race_date on the course, or use a name that matches an event goal.',
        }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }
  }

  // Use select('*') so we still load the goal if race_readiness_projection column is not migrated yet.
  const { data: goal, error: gErr } = await supabase
    .from('goals')
    .select('*')
    .eq('id', course.goal_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (gErr) {
    console.error('[course-strategy] goals select', gErr);
    return new Response(JSON.stringify({ error: gErr.message || 'Goal lookup failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (!goal) {
    return new Response(JSON.stringify({ error: 'Goal not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const planGoalSec = await resolveGoalTargetTimeSeconds(supabase, user.id, String(course.goal_id));

  // Arc: learned paces + active-goal projections. Called here so anchor logic can use it.
  const arc = await getArcContext(supabase, user.id, new Date().toISOString());

  // Anchor resolution priority:
  // 1. Completed goals: actual race result (honest retrospective zones)
  // 2. Arc goals.projection.total_sec (single authoritative projection, written by recompute-goal-race-projections)
  // 3. coach_cache race_finish_projection_v1 (backward compat)
  // 4. resolvePaceAnchorForCourse fallback
  const isCompletedGoal = String(goal.status) === 'completed';
  const tp = (goal.training_prefs as Record<string, unknown> | null) ?? {};
  const rr = (tp as { race_result?: { actual_seconds?: number } }).race_result;
  // For completed goals: prefer race_result.actual_seconds, fall back to current_value
  // (current_value is set by complete-race when race_result.actual_seconds may not have been persisted)
  const completedActualSec = isCompletedGoal
    ? (() => {
        const fromRR = rr?.actual_seconds != null && Number.isFinite(Number(rr.actual_seconds)) && Number(rr.actual_seconds) > 0
          ? Math.round(Number(rr.actual_seconds)) : null;
        const fromCV = (goal as Record<string, unknown>).current_value != null
          && Number.isFinite(Number((goal as Record<string, unknown>).current_value))
          && Number((goal as Record<string, unknown>).current_value) > 0
          ? Math.round(Number((goal as Record<string, unknown>).current_value)) : null;
        return fromRR ?? fromCV;
      })()
    : null;

  // Arc canonical projection — recompute-goal-race-projections is the single writer.
  // For active goals, read from arc.active_goals. For completed goals, read directly from goals.projection.
  const arcGoal = arc.active_goals.find((g) => g.id === String(course.goal_id));
  const rawProjection = arcGoal?.projection ?? (goal as Record<string, unknown>).projection ?? null;
  const arcProjSec = rawProjection != null
    ? (() => {
        const p = rawProjection as Record<string, unknown>;
        const s = Number(p.total_sec);
        return Number.isFinite(s) && s > 0 ? Math.round(s) : null;
      })()
    : null;

  let anchor: { seconds: number; kind: string } | null = null;

  if (completedActualSec != null) {
    anchor = { seconds: completedActualSec, kind: 'completed_actual' };
  } else if (arcProjSec != null) {
    // Arc projection is authoritative for active goals.
    anchor = { seconds: arcProjSec, kind: 'arc_projection' };
  } else {
    const { data: coachCacheRow } = await supabase.from('coach_cache').select('payload').eq('user_id', user.id).maybeSingle();
    const coachPl = coachCacheRow?.payload as Record<string, unknown> | undefined;
    const unified = coachPl ? pickRaceFinishProjectionV1ForCourseGoal(coachPl, String(course.goal_id)) : null;
    anchor = unified != null
      ? { seconds: unified.anchor_seconds, kind: unified.source_kind }
      : await resolvePaceAnchorForCourse(
          supabase,
          user.id,
          {
            name: String(goal.name || ''),
            distance: goal.distance != null ? String(goal.distance) : null,
            target_date: goal.target_date != null ? String(goal.target_date) : null,
            target_time: goal.target_time != null ? Number(goal.target_time) : null,
            sport: goal.sport != null ? String(goal.sport) : null,
            race_readiness_projection: (goal as Record<string, unknown>).race_readiness_projection,
          },
          String(course.goal_id),
          planGoalSec,
        );
  }

  if (anchor == null) {
    return new Response(
      JSON.stringify({
        error:
          'No pacing target: set a goal/plan race target, or ensure baselines support a fitness-based finish projection.',
      }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  const goalTimeSec = anchor.seconds;

  let pacingContextLines = '';
  if (anchor.kind === 'completed_actual') {
    pacingContextLines =
      `- Pace anchor: official race result ${fmtFinishClock(anchor.seconds)} — this is a post-race retrospective strategy. Zones reflect actual race-day fitness.\n` +
      (planGoalSec != null ? `- Athlete's stated goal was ${fmtFinishClock(planGoalSec)} (for context only).\n` : '');
  } else if (
    (anchor.kind === 'coach_readiness' && planGoalSec != null && planGoalSec !== anchor.seconds) ||
    (anchor.kind === 'fitness_floors_stated_goal' && planGoalSec != null)
  ) {
    pacingContextLines =
      `- Pace anchor (current-fitness finish projection): ${fmtFinishClock(anchor.seconds)} — segment bands must aggregate to this finish time, not the plan time.\n` +
      `- Stated plan / goal target (aspirational): ${fmtFinishClock(planGoalSec)}.\n`;
  } else if (anchor.kind === 'arc_projection') {
    pacingContextLines =
      `- Pace anchor: Arc fitness projection ${fmtFinishClock(anchor.seconds)} (VDOT from learned threshold pace — authoritative).\n` +
      (planGoalSec != null && planGoalSec !== anchor.seconds ? `- Athlete goal target: ${fmtFinishClock(planGoalSec)} (aspirational, for context only).\n` : '');
  } else if (anchor.kind === 'coach_readiness') {
    pacingContextLines = `- Pace anchor: current-fitness finish projection ${fmtFinishClock(anchor.seconds)}.\n`;
  } else if (anchor.kind === 'plan_target') {
    pacingContextLines =
      `- Pace anchor: stated plan / goal race target ${fmtFinishClock(anchor.seconds)} (no coach fitness projection for this goal in cache).\n`;
  } else {
    pacingContextLines =
      `- Pace anchor: baseline fitness projection ${fmtFinishClock(anchor.seconds)} (no coach cache match and no plan target in goal/plan config).\n`;
  }

  const courseLeg: StrategyLeg = (() => {
    const l = String((course as { leg?: string }).leg || 'full').toLowerCase();
    if (l === 'swim' || l === 'bike' || l === 'run' || l === 'full') return l;
    return 'full';
  })();
  const proj = (goal as Record<string, unknown>).projection as Record<string, unknown> | null;
  let legTargetSec = goalTimeSec;
  if (courseLeg === 'swim' && proj && typeof proj.swim_min === 'number') {
    legTargetSec = Math.round(Number(proj.swim_min) * 60);
  } else if (courseLeg === 'bike' && proj && typeof proj.bike_min === 'number') {
    legTargetSec = Math.round(Number(proj.bike_min) * 60);
  } else if (courseLeg === 'run' && proj && typeof proj.run_min === 'number') {
    legTargetSec = Math.round(Number(proj.run_min) * 60);
  } else if (courseLeg === 'swim') {
    legTargetSec = Math.max(600, Math.round(goalTimeSec * 0.19));
  } else if (courseLeg === 'bike') {
    legTargetSec = Math.max(1200, Math.round(goalTimeSec * 0.5));
  } else if (courseLeg === 'run') {
    legTargetSec = Math.max(900, Math.round(goalTimeSec * 0.29));
  }
  if (courseLeg !== 'full') {
    pacingContextLines +=
      `- Leg strategy: **${courseLeg}** — split time ~${fmtFinishClock(legTargetSec)} from projection (full-race clock ${fmtFinishClock(goalTimeSec)}).\n`;
  }
  if (course.goal_id) {
    const { data: legSiblings } = await supabase
      .from('race_courses')
      .select('id, name, leg, strategy_updated_at')
      .eq('user_id', user.id)
      .eq('goal_id', String(course.goal_id));
    const sibSummary = (legSiblings || [])
      .map((r) => {
        const o = r as { leg?: string; name?: string };
        return `${String(o.leg || '?')}:${String(o.name || '')}`;
      })
      .join(' | ');
    if (sibSummary) {
      pacingContextLines += `- Other course legs for this goal: ${sibSummary}.\n`;
    }
  }

  const rawProfile = normalizeElevationProfile(course.elevation_profile);
  if (rawProfile.length < 2) {
    return new Response(JSON.stringify({ error: 'Invalid elevation profile' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const smoothed = smoothElevation(rawProfile, 2);
  const geometry: GeometrySegment[] = segmentCourseFromProfile(smoothed);
  if (geometry.length === 0) {
    return new Response(JSON.stringify({ error: 'Segmentation produced no segments' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Arc paces already loaded above — use learned values, fall back to performance_numbers.
  const pfc = arc.run_pace_for_coach;
  const pn = (arc.performance_numbers || {}) as Record<string, unknown>;

  // Learned paces are stored as sec/km; course-strategy helpers use sec/mi.
  const KM_TO_MI = 1.609344;
  const easySec: number | null =
    pfc?.easy?.sec_per_km != null
      ? Math.round(pfc.easy.sec_per_km * KM_TO_MI)
      : parsePaceToSecPerMi(pn.easy_pace ?? pn.easyPace ?? pn.easy_pace_sec_per_mi);
  const threshSec: number | null =
    pfc?.threshold?.sec_per_km != null
      ? Math.round(pfc.threshold.sec_per_km * KM_TO_MI)
      : parsePaceToSecPerMi(
          pn.threshold_pace ?? pn.thresholdPace ?? pn.threshold_pace_sec_per_mi ?? pn.fiveK_pace ?? pn.fiveK_pace_sec_per_mi,
        );
  const maxHr = Number(pn.max_heart_rate ?? pn.maxHeartRate ?? 0) || null;

  // HR zones not yet in ArcContext — read separately.
  const { data: baseline } = await supabase
    .from('user_baselines')
    .select('configured_hr_zones')
    .eq('user_id', user.id)
    .maybeSingle();
  const cz = baseline?.configured_hr_zones as Record<string, unknown> | null;
  const zonesArr = (cz?.zones as Array<{ min?: number; max?: number | null }>) || [];
  const zStr = zonesArr.length
    ? zonesArr.map((z, i) => `Z${i + 1} ${z.min ?? '?'}-${z.max ?? 'open'}`).join(', ')
    : 'not configured';

  const hrZonesForHash: Record<string, string> = {};
  zonesArr.forEach((z, i) => {
    hrZonesForHash[`z${i + 1}`] = `${z.min ?? ''}-${z.max ?? ''}`;
  });

  const { data: recentRuns } = await supabase
    .from('workouts')
    .select('distance, avg_heart_rate, workout_analysis, date')
    .eq('user_id', user.id)
    .eq('type', 'run')
    .eq('workout_status', 'completed')
    .order('date', { ascending: false })
    .limit(20);

  let longMi = 0;
  let longHr: number | null = null;
  let drift: number | null = null;
  for (const w of recentRuns || []) {
    const km = Number(w.distance) || 0;
    const mi = km * 0.621371;
    if (mi >= 10 && mi > longMi) {
      longMi = mi;
      longHr = w.avg_heart_rate != null ? Number(w.avg_heart_rate) : null;
      let wa: Record<string, unknown> | null = null;
      try {
        wa = typeof w.workout_analysis === 'string' ? JSON.parse(w.workout_analysis) : (w.workout_analysis as Record<string, unknown>) || null;
      } catch { /* ignore */ }
      drift = extractDrift(wa);
    }
  }

  const decoup: number | null = null;
  const snapshot: SnapshotForHash = {
    easy_pace: easySec,
    threshold_pace: threshSec,
    hr_zones: hrZonesForHash,
    max_hr: maxHr,
    recent_long_run_avg_hr: longHr,
    recent_long_run_decoupling: decoup,
  };
  const snapHash = await hashAthleteSnapshot(snapshot);

  const mFromRow = Number((course as { distance_m?: number }).distance_m) || 0;
  const distMi = mFromRow > 0
    ? mFromRow / 1609.344
    : (goalDistanceMi(String(goal.distance || '')) || 26.2);

  const timeBaseForTerrain = courseLeg === 'full' ? goalTimeSec : legTargetSec;

  // Adjust goal time for course terrain (bike/run; skip swim OWS grade heuristics here).
  let terrainGoalTimeSec = courseLeg === 'swim' ? legTargetSec : timeBaseForTerrain;
  if (courseLeg !== 'swim' && distMi > 0 && smoothed.length >= 2) {
    const flatPace = timeBaseForTerrain / distMi;
    let accSec = 0;
    for (let i = 1; i < smoothed.length; i++) {
      const p1 = smoothed[i - 1];
      const p2 = smoothed[i];
      const segDistM = p2.distance_m - p1.distance_m;
      if (segDistM <= 0) continue;
      const grade = (p2.elevation_m - p1.elevation_m) / segDistM * 100;
      const gradeAdj = grade > 0 ? Math.min(grade * 10, 60) : Math.max(grade * 6, -20);
      accSec += (flatPace + gradeAdj) * (segDistM / 1609.344);
    }
    const rounded = Math.round(accSec);
    if (Math.abs(rounded - timeBaseForTerrain) > 15) {
      terrainGoalTimeSec = rounded;
      pacingContextLines += `- Terrain-adjusted **leg** target: ${fmtFinishClock(terrainGoalTimeSec)} (from flat leg split ${fmtFinishClock(timeBaseForTerrain)} using course profile).\n`;
    }
  }

  const implied = impliedAvgPaceSecPerMi(terrainGoalTimeSec, distMi);

  const ftpW = Number(pn.ftp ?? pn.ftp_watts ?? pn.ftpWatts) || null;
  let roleIntro = 'You are a running coach building a race-day pacing strategy.';
  let legExtraInstructions = '';
  if (courseLeg === 'bike') {
    roleIntro =
      'You are a triathlon / time-trial bike pacing coach. Use the same JSON output schema; pace sec/mi fields represent **sustainable road effort** along the course (pair with %FTP in cues when the athlete has FTP).';
    legExtraInstructions =
      (ftpW ? `- Estimated FTP: ~${Math.round(ftpW)}W.\n` : '') +
      '- Use elevation in segments; note fueling on long or late climbs.\n';
  } else if (courseLeg === 'swim') {
    roleIntro =
      'You are an open-water swim coach. Use the same JSON output schema; map pace bands to **steady OWS effort** and sighting — segments may be short; reference buoys, turns, and conditions in cues.';
    legExtraInstructions = '- Emphasize sighting, navigation, and even pacing; avoid run-specific mile markers in cues.\n';
  } else if (courseLeg === 'run' && ['triathlon', 'tri'].includes(String(goal.sport || '').toLowerCase())) {
    legExtraInstructions =
      '- **Triathlon run leg** off the bike: expect elevated HR for a given pace; start conservative.\n';
  }

  const prompt = buildPrompt({
    roleIntro,
    segments: geometryToPromptSegments(geometry),
    easy: easySec != null ? fmtPaceClock(easySec) : 'unknown',
    threshold: threshSec != null ? fmtPaceClock(threshSec) : 'unknown',
    zones: zStr,
    maxHr: maxHr != null ? String(maxHr) : 'unknown',
    longRun: longMi > 0
      ? `${Math.round(longMi * 10) / 10}mi at ${longHr ?? '?'} bpm, ${drift != null ? `${drift} bpm drift` : 'drift n/a'}`
      : 'no recent long run in data',
    goalTime: fmtFinishClock(terrainGoalTimeSec),
    impliedAvg: fmtPaceClock(implied),
    pacingContextLines: pacingContextLines.trimEnd(),
    legExtraInstructions: legExtraInstructions.trimEnd(),
  });

  const ph = await promptHash(prompt);

  async function runLlm(extraErr?: string): Promise<{ text: string | null }> {
    const userBlock = extraErr ? `${prompt}\n\nFix your previous JSON. Error: ${extraErr}` : prompt;
    const text = await callLLM({
      system: 'You output only valid JSON for race pacing. No markdown.',
      user: userBlock,
      maxTokens: 8192,
      temperature: 0.2,
      model: 'sonnet',
    });
    return { text };
  }

  let llmText = (await runLlm()).text;
  let parsed: unknown = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!llmText) {
      lastErr = 'empty LLM response';
      if (attempt === 0) {
        const r = await runLlm('empty response');
        llmText = r.text;
        continue;
      }
      break;
    }
    try {
      parsed = JSON.parse(stripJsonFences(llmText));
    } catch (e) {
      lastErr = 'JSON parse failed';
      if (attempt === 0) {
        const r = await runLlm(lastErr);
        llmText = r.text;
        continue;
      }
      break;
    }
    const v = validateLlmResponse(parsed, geometry.length, maxHr);
    if (!v.ok) {
      lastErr = v.error;
      if (attempt === 0) {
        const r = await runLlm(v.error);
        llmText = r.text;
        continue;
      }
      await supabase.from('course_strategy_debug').insert({
        course_id: courseId,
        raw_llm_response: llmText.slice(0, 120_000),
        prompt_hash: ph,
        success: false,
        error_message: v.error,
      });
      return new Response(JSON.stringify({ error: 'Strategy validation failed', detail: v.error }), {
        status: 422,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    parsed = v.data;
    break;
  }

  if (!parsed || typeof parsed !== 'object' || !('display_groups' in (parsed as object))) {
    await supabase.from('course_strategy_debug').insert({
      course_id: courseId,
      raw_llm_response: String(llmText || '').slice(0, 120_000),
      prompt_hash: ph,
      success: false,
      error_message: lastErr,
    });
    return new Response(JSON.stringify({ error: 'Strategy generation failed', detail: lastErr }), {
      status: 422,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const groups = (parsed as { display_groups: LlmDisplayGroup[] }).display_groups;
  alignCoachingCuesWithGeometry(groups, geometry);
  applyClimbPaceFloorToDisplayGroups(groups, geometry, implied);
  let rows: Record<string, unknown>[];
  try {
    rows = materializeSegmentRows(geometry, groups);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from('course_strategy_debug').insert({
      course_id: courseId,
      raw_llm_response: String(llmText || '').slice(0, 120_000),
      prompt_hash: ph,
      success: false,
      error_message: msg,
    });
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const dbRows = rows.map((r) => ({
    course_id: courseId,
    ...r,
  }));

  await supabase.from('course_segments').delete().eq('course_id', courseId);
  const { error: insErr } = await supabase.from('course_segments').insert(dbRows);
  if (insErr) {
    console.error('[course-strategy] insert', insErr);
    return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  await supabase
    .from('race_courses')
    .update({
      strategy_updated_at: new Date().toISOString(),
      athlete_snapshot_hash: snapHash,
    })
    .eq('id', courseId);

  // Historical weather for race date + course start (additive; failures are non-fatal).
  try {
    const raceDateISO = goal.target_date != null ? String(goal.target_date).slice(0, 10) : null;
    let startLat: number | null = null;
    let startLng: number | null = null;
    for (const p of smoothed) {
      if (p.lat != null && p.lon != null && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
        startLat = p.lat;
        startLng = p.lon;
        break;
      }
    }
    if ((startLat == null || startLng == null) && course.polyline && String(course.polyline).length > 0) {
      const first = decodePolylineFirstPoint(String(course.polyline));
      if (first) {
        startLat = first[0];
        startLng = first[1];
      }
    }
    const tz = Deno.env.get('RACE_WEATHER_TIMEZONE')?.trim() || 'America/Los_Angeles';
    if (raceDateISO && startLat != null && startLng != null) {
      const weather = await fetchRaceWeatherArchive(startLat, startLng, raceDateISO, tz);
      if (weather) {
        await supabase
          .from('race_courses')
          .update({
            start_temp_f: weather.startTempF,
            finish_temp_f: weather.finishTempF,
            humidity_pct: weather.humidity,
            conditions: weather.conditions,
          })
          .eq('id', courseId);
      }
    }
  } catch (wErr) {
    console.warn('[course-strategy] weather attach failed (non-fatal):', wErr instanceof Error ? wErr.message : wErr);
  }

  await supabase.from('course_strategy_debug').insert({
    course_id: courseId,
    raw_llm_response: String(llmText || '').slice(0, 120_000),
    prompt_hash: ph,
    success: true,
    error_message: null,
  });

  return new Response(JSON.stringify({ ok: true, course_id: courseId, display_groups: groups.length }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
  } catch (e) {
    console.error('[course-strategy] unhandled error', e)
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
});
