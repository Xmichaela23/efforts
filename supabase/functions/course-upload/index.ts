/**
 * course-upload — GPX → race_courses + course_segments (geometry only).
 * POST: multipart field "file" (.gpx) OR JSON { gpx_text, name?, goal_id? }
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  parseGpxToProfile,
  smoothElevation,
  elevationGainLossM,
  segmentCourseFromProfile,
  profileToJson,
} from '../_shared/course-segmentation.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FT_PER_M = 3.28084;

async function getUser(supabase: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return { user: null as { id: string } | null, err: 'Missing authorization' };
  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) return { user: null, err: 'Invalid authentication' };
  return { user, err: null };
}

function pgErr(e: { message?: string; details?: string; hint?: string; code?: string } | null): string {
  if (!e) return 'Insert failed';
  const parts = [e.message, e.details, e.hint].filter((x) => x && String(x).trim());
  const s = parts.join(' — ');
  if (!s) return 'Insert failed';
  if (e.code === '42P01' || /does not exist/i.test(s)) {
    return `${s} (Apply the course migration: race_courses / course_segments on your Supabase project.)`;
  }
  return s;
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

  let gpxText = '';
  let name = 'Race course';
  let goalId: string | null = null;

  const ct = req.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    name = String(form.get('name') || name).slice(0, 200);
    const gid = form.get('goal_id');
    if (gid) goalId = String(gid);
    if (file instanceof File) {
      gpxText = await file.text();
    }
  } else {
    try {
      const body = await req.json();
      gpxText = String(body.gpx_text || body.gpx || '');
      if (body.name) name = String(body.name).slice(0, 200);
      if (body.goal_id) goalId = String(body.goal_id);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  if (!gpxText.trim()) {
    return new Response(JSON.stringify({ error: 'No GPX content' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (goalId) {
    const { data: g, error: ge } = await supabase.from('goals').select('id, user_id').eq('id', goalId).maybeSingle();
    if (ge || !g || g.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Invalid goal_id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    // Clear any existing row for this goal (unique partial index on goal_id) — check delete errors.
    const { error: delErr } = await supabase.from('race_courses').delete().eq('goal_id', goalId);
    if (delErr) {
      console.error('[course-upload] delete existing by goal_id', delErr);
      return new Response(JSON.stringify({ error: pgErr(delErr) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  let raw = parseGpxToProfile(gpxText);
  if (raw.length < 2) {
    return new Response(JSON.stringify({ error: 'Could not parse trackpoints from GPX' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const smoothed = smoothElevation(raw, 2);
  const { gain_m, loss_m } = elevationGainLossM(smoothed);
  const totalM = smoothed[smoothed.length - 1].distance_m;
  if (!Number.isFinite(totalM) || totalM <= 0 || !Number.isFinite(gain_m) || !Number.isFinite(loss_m)) {
    return new Response(JSON.stringify({ error: 'Invalid course geometry (distance/elevation)' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const segments = segmentCourseFromProfile(smoothed);
  const elevationJson = profileToJson(smoothed);

  const { data: course, error: insErr } = await supabase
    .from('race_courses')
    .insert({
      user_id: user.id,
      goal_id: goalId,
      name,
      source: 'gpx',
      distance_m: totalM,
      elevation_gain_m: gain_m,
      elevation_loss_m: loss_m,
      elevation_profile: elevationJson,
    })
    .select('id')
    .single();

  if (insErr || !course) {
    console.error('[course-upload] insert', JSON.stringify(insErr ?? {}));
    return new Response(JSON.stringify({ error: pgErr(insErr) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const courseId = course.id as string;
  const rows = segments.map((s) => ({
    course_id: courseId,
    segment_order: s.segment_order,
    start_distance_m: s.start_distance_m,
    end_distance_m: s.end_distance_m,
    start_elevation_m: s.start_elevation_m,
    end_elevation_m: s.end_elevation_m,
    elevation_change_m: s.elevation_change_m,
    avg_grade_pct: s.avg_grade_pct,
    terrain_type: s.terrain_type,
  }));

  if (rows.length > 0) {
    const { error: segErr } = await supabase.from('course_segments').insert(rows);
    if (segErr) {
      console.error('[course-upload] segments', JSON.stringify(segErr));
      await supabase.from('race_courses').delete().eq('id', courseId);
      return new Response(JSON.stringify({ error: pgErr(segErr) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  if (goalId) {
    try {
      const { recomputeRaceProjectionsForUser } = await import('../_shared/recompute-goal-race-projections.ts');
      await recomputeRaceProjectionsForUser(supabase, user.id, { goalIds: [goalId] });
    } catch (e) {
      console.warn('[course-upload] recompute goal projection', e);
    }
  }

  return new Response(
    JSON.stringify({
      course_id: courseId,
      distance_mi: Math.round((totalM / 1609.344) * 100) / 100,
      elevation_gain_ft: Math.round(gain_m * FT_PER_M),
      elevation_loss_ft: Math.round(loss_m * FT_PER_M),
      segment_count: rows.length,
    }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
