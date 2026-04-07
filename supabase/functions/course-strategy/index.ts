/**
 * course-strategy — rebuild geometry, call LLM, persist strategy on course_segments.
 * POST JSON: { course_id: string }
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
  parsePaceToSecPerMi,
  fmtPaceClock,
  fmtFinishClock,
  impliedAvgPaceSecPerMi,
  goalDistanceMi,
  type SnapshotForHash,
  type LlmDisplayGroup,
} from '../_shared/course-strategy-helpers.ts';
import { parseClientPredictedFinishSeconds, resolveGoalTargetTimeSeconds } from '../_shared/resolve-goal-target-time.ts';

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

function buildPrompt(params: {
  segments: Record<string, unknown>[];
  easy: string;
  threshold: string;
  zones: string;
  maxHr: string;
  longRun: string;
  goalTime: string;
  impliedAvg: string;
}): string {
  return `You are a running coach building a race-day pacing strategy.

Course segments (geometry):
${JSON.stringify(params.segments)}

Athlete profile:
- Easy pace: ${params.easy}/mi
- Threshold pace: ${params.threshold}/mi
- HR zones: ${params.zones}
- Max HR: ${params.maxHr}
- Recent long run: ${params.longRun}
- Goal finish time: ${params.goalTime} (${params.impliedAvg}/mi average)

Instructions:
1. Group adjacent segments of similar terrain into display groups (target 5-8 groups for a marathon, proportionally fewer for shorter races).
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

Rules: target_pace_slow_sec_per_mi >= target_pace_fast_sec_per_mi. HR realistic vs max. Weighted pace vs goal is guidance only.

Return ONLY valid JSON, no markdown:
{"display_groups":[{"display_group_id":1,"segment_orders":[1,2],"display_label":"Mi 0–2 · start","effort_zone":"conservative","target_pace_slow_sec_per_mi":680,"target_pace_fast_sec_per_mi":640,"target_hr_low":130,"target_hr_high":145,"coaching_cue":"Start easy on early climbs"}]}`;
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

  let courseId = '';
  let predictedFinishSec: number | null = null;
  try {
    const body = await req.json() as Record<string, unknown>;
    courseId = String(body.course_id || '');
    predictedFinishSec = parseClientPredictedFinishSeconds(body.predicted_finish_time_seconds);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (!courseId) {
    return new Response(JSON.stringify({ error: 'course_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { data: course, error: cErr } = await supabase
    .from('race_courses')
    .select('id, user_id, goal_id, elevation_profile, distance_m, name')
    .eq('id', courseId)
    .maybeSingle();

  if (cErr || !course || course.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Course not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (!course.goal_id) {
    return new Response(JSON.stringify({ error: 'Link this course to a goal before generating strategy' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { data: goal } = await supabase
    .from('goals')
    .select('id, distance, name')
    .eq('id', course.goal_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!goal) {
    return new Response(JSON.stringify({ error: 'Goal not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const planGoalSec = await resolveGoalTargetTimeSeconds(supabase, user.id, String(course.goal_id));
  const goalTimeSec = predictedFinishSec ?? planGoalSec;
  if (goalTimeSec == null) {
    return new Response(
      JSON.stringify({
        error:
          'No race target time found. Set a target on the goal, or ensure your linked plan has target_time / marathon_target_seconds from plan build.',
      }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
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

  const { data: baseline } = await supabase
    .from('user_baselines')
    .select('performance_numbers, configured_hr_zones')
    .eq('user_id', user.id)
    .maybeSingle();

  const pn = (baseline?.performance_numbers || {}) as Record<string, unknown>;
  const easySec = parsePaceToSecPerMi(pn.easy_pace ?? pn.easyPace ?? pn.easy_pace_sec_per_mi);
  const threshSec = parsePaceToSecPerMi(
    pn.threshold_pace ?? pn.thresholdPace ?? pn.threshold_pace_sec_per_mi ?? pn.fiveK_pace ?? pn.fiveK_pace_sec_per_mi,
  );
  const maxHr = Number(pn.max_heart_rate ?? pn.maxHeartRate ?? 0) || null;
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

  const distMi = goalDistanceMi(goal.distance as string);
  const implied = impliedAvgPaceSecPerMi(goalTimeSec, distMi);

  const prompt = buildPrompt({
    segments: geometryToPromptSegments(geometry),
    easy: easySec != null ? fmtPaceClock(easySec) : 'unknown',
    threshold: threshSec != null ? fmtPaceClock(threshSec) : 'unknown',
    zones: zStr,
    maxHr: maxHr != null ? String(maxHr) : 'unknown',
    longRun: longMi > 0
      ? `${Math.round(longMi * 10) / 10}mi at ${longHr ?? '?'} bpm, ${drift != null ? `${drift} bpm drift` : 'drift n/a'}`
      : 'no recent long run in data',
    goalTime: fmtFinishClock(goalTimeSec),
    impliedAvg: fmtPaceClock(implied),
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
});
