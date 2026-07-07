/**
 * match-cores — match runs against frozen cores and extract per-effort FACTS (DESIGN-segments §4.3).
 *
 * Backfill/gated pass (later also wired per-ingest). Facts only (Law 2); no verdict here.
 * Modes: POST { dry_run: true } → match + report counts/samples, WRITE NOTHING (the real-data check).
 *        POST {}               → upsert core_efforts, delete-then-write per (workout_id, core_id)
 *                                (requires the metric_source column — ALTER owed before first write).
 *
 * Auth: user JWT; service-role bearer may target an explicit user_id (pre-launch backfill).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { computeCoreEffort, type EffortPoint } from '../_shared/core-effort.ts';
import { parseGpsPoints, parseHrByTime } from '../_shared/gps-points.ts';
import { type LatLng } from '../_shared/core-match.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CAP = 800; // points/run kept for effort accuracy (finer than detection's 400)
const BATCH = 10; // runs per load chunk (gps_track + sensor_data is heavier than gps alone)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function decimate<T>(pts: T[], cap: number): T[] {
  if (pts.length <= cap) return pts;
  const out: T[] = [];
  const step = (pts.length - 1) / (cap - 1);
  for (let i = 0; i < cap; i++) out.push(pts[Math.round(i * step)]);
  return out;
}
function fmtPaceMinPerMi(sPerKm: number | null): string | null {
  if (sPerKm == null || !isFinite(sPerKm) || sPerKm <= 0) return null;
  const secPerMi = sPerKm * 1.60934;
  const mm = Math.floor(secPerMi / 60);
  const ss = Math.round(secPerMi % 60);
  return `${mm}:${String(ss).padStart(2, '0')}/mi`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body?.dry_run === true;

  // CALIBRATION params (tunable, not hardcoded universals — flagged like coverage_frac / min_core_distance):
  // moving_speed_min_mps = below this an interval is "stopped" and excluded from pace/decoupling (default 0.5).
  const numOpt = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const effortOpts = {
    movingSpeedMinMps: numOpt(body?.moving_speed_min_mps),
    hrCoverageThreshold: numOpt(body?.hr_coverage_threshold),
  };

  const authHeader = req.headers.get('Authorization') ?? '';
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await authClient.auth.getUser();
  let userId: string | null = user?.id ?? null;
  if (!userId && typeof body?.user_id === 'string' && authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    userId = body.user_id;
  }
  if (!userId) return json({ ok: false, error: 'unauthorized' }, 401);

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Active frozen cores for this user.
  const { data: coreRows, error: coreErr } = await svc
    .from('route_cores')
    .select('id, core_key, distance_m, direction_bucket, point_polyline')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (coreErr) return json({ ok: false, error: `core load: ${coreErr.message}` }, 500);
  const cores = (coreRows ?? []).map((c) => ({
    id: (c as any).id,
    coreKey: (c as any).core_key,
    distanceM: Number((c as any).distance_m),
    directionBucket: (c as any).direction_bucket,
    polyline: (Array.isArray((c as any).point_polyline) ? (c as any).point_polyline : [])
      .map((p: any) => (Array.isArray(p) ? { lat: p[0], lng: p[1] } : { lat: p.lat, lng: p.lng })) as LatLng[],
  })).filter((c) => c.polyline.length >= 2);
  if (cores.length === 0) return json({ ok: true, message: 'no active cores', cores: 0 });

  // Eligible run ids (cheap).
  const { data: idRows, error: idErr } = await svc
    .from('workouts').select('id, date, type, workout_status')
    .eq('user_id', userId).not('gps_track', 'is', null)
    .order('date', { ascending: true }).limit(5000);
  if (idErr) return json({ ok: false, error: `id load: ${idErr.message}` }, 500);
  const eligibleAll = (idRows ?? []).filter((w) => {
    const t = String((w as any).type ?? '').toLowerCase();
    return (t === 'run' || t === 'running') && String((w as any).workout_status ?? '').toLowerCase() === 'completed';
  });
  // Per-ingest scoping: when a workout_id is given (compute-facts chokepoint), match ONLY that run;
  // otherwise match all (backfill). Efforts are upserted per (workout,core), so a single-run pass
  // refreshes just that run's effort.
  const scopeWorkoutId = typeof body?.workout_id === 'string' ? body.workout_id : null;
  const eligible = scopeWorkoutId ? eligibleAll.filter((w) => (w as any).id === scopeWorkoutId) : eligibleAll;

  // Per-core accumulators.
  const acc = new Map<string, {
    coreKey: string; distance_m: number; matched: number; hr_aligned: number; raw_pace_only: number;
    samples: any[]; efforts: { workout_id: string; date: string; eff: any }[];
  }>();
  for (const c of cores) acc.set(c.id, { coreKey: c.coreKey, distance_m: c.distanceM, matched: 0, hr_aligned: 0, raw_pace_only: 0, samples: [], efforts: [] });

  let runsConsidered = 0;
  for (let i = 0; i < eligible.length; i += BATCH) {
    const ids = eligible.slice(i, i + BATCH).map((w) => (w as any).id);
    const { data: rows, error: tErr } = await svc.from('workouts').select('id, date, gps_track, sensor_data').in('id', ids);
    if (tErr) return json({ ok: false, error: `track load: ${tErr.message}` }, 500);
    for (const w of rows ?? []) {
      const rawPts = parseGpsPoints((w as any).gps_track);
      if (rawPts.length < 8) continue;
      runsConsidered++;
      const gps = decimate(rawPts, CAP).map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })) as EffortPoint[];
      const hrByT = parseHrByTime((w as any).sensor_data);
      for (const c of cores) {
        const eff = computeCoreEffort({ gps, hrByT, corePolyline: c.polyline, tempF: null }, effortOpts);
        if (!eff) continue;
        const a = acc.get(c.id)!;
        a.matched++;
        if (eff.metricSource === 'hr_aligned') a.hr_aligned++;
        else a.raw_pace_only++;
        a.efforts.push({ workout_id: (w as any).id, date: String((w as any).date ?? '').slice(0, 10), eff });
        if (a.samples.length < 12) {
          a.samples.push({
            date: String((w as any).date ?? '').slice(0, 10),
            pace: fmtPaceMinPerMi(eff.avgPaceSPerKm),
            hr: eff.avgHrBpm,
            source: eff.metricSource,
            hr_cov: eff.hrCoverage,
            decoupling_pct: eff.decouplingPct,
          });
        }
      }
    }
  }

  const summary = cores.map((c) => {
    const a = acc.get(c.id)!;
    return {
      core_key: a.coreKey,
      distance_mi: Math.round((a.distance_m / 1609.34) * 100) / 100,
      matched: a.matched,
      hr_aligned: a.hr_aligned,
      raw_pace_only: a.raw_pace_only,
      clears_floor_raw: a.matched >= 8,
      clears_floor_hr: a.hr_aligned >= 8,
      sample_efforts: a.samples.sort((x, y) => (x.date < y.date ? -1 : 1)),
    };
  });

  if (dryRun) {
    return json({ ok: true, dry_run: true, runs_considered: runsConsidered, cores: summary });
  }

  // WRITE PATH (held until the metric_source ALTER + explicit go). Delete-then-write per (workout, core).
  let written = 0;
  for (const [coreId, a] of acc) {
    for (const { workout_id, date, eff } of a.efforts) {
      await svc.from('core_efforts').delete().eq('workout_id', workout_id).eq('core_id', coreId);
      const { error: insErr } = await svc.from('core_efforts').insert({
        core_id: coreId, workout_id, user_id: userId, effort_date: date,
        entry_idx: eff.entryIdx, exit_idx: eff.exitIdx, overlap_ratio: eff.overlapRatio,
        matched_distance_m: eff.matchedDistanceM, matcher_version: 'v1',
        duration_s: Math.round(eff.durationS), distance_m: eff.distanceM,
        avg_pace_s_per_km: eff.avgPaceSPerKm, avg_hr_bpm: eff.avgHrBpm,
        decoupling_pct: eff.decouplingPct, temp_f: eff.tempF, metric_source: eff.metricSource,
        metadata: { hr_coverage: eff.hrCoverage },
      });
      if (!insErr) written++;
    }
  }
  return json({ ok: true, runs_considered: runsConsidered, written, cores: summary });
});
