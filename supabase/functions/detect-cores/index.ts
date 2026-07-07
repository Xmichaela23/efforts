/**
 * detect-cores — batch/gated pass that detects fixed run "cores" and FREEZES them (DESIGN-segments §4.2).
 *
 * This is NOT wired into per-ingest fan-out: geometry is born occasionally (backfill + gated re-runs),
 * matched continuously (core-match, step 3). That separation is the anti-flip-flop architecture.
 *
 * Governance by construction (D-253, criteria 2 & 5):
 *   • Only INSERTs new cores. There is NO code path here that UPDATEs route_cores geometry.
 *   • Skips any (start-proximity, direction) that already has an ACTIVE core — geometry is born once.
 *     The guard is GEOMETRIC (a ~150m box + direction bucket), not the trailhead_cell string, because a
 *     centroid-derived key can drift as runs join and a drifting key would defeat "born once."
 *   • Amendment (re-freeze) is a separate, deliberate action — never an automatic recompute here.
 *
 * Auth: user JWT; operates on the authenticated user's own data. DB writes via service role.
 * Modes: POST { dry_run: true } → detect + return proposed cores WITHOUT writing (inspect first).
 *        POST {}               → detect + freeze new cores.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { detectCores, groupStats, type DetectRun } from '../_shared/core-detect.ts';
import { parseGpsPoints } from '../_shared/gps-points.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Tuned to real data (2026-07-06): watch-on jitter spans ~140m; this user's distinct trailheads are
// ~8 km apart, so 150m absorbs the jitter with no risk of merging distinct trailheads.
const TRAILHEAD_RADIUS_M = 150;
const GUARD_DEG = 0.002; // ~150m lat/lng box for the geometric freeze guard

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Even-sample a point list down to at most `cap` points, always keeping first and last. */
function decimate<T>(pts: T[], cap: number): T[] {
  if (pts.length <= cap) return pts;
  const out: T[] = [];
  const step = (pts.length - 1) / (cap - 1);
  for (let i = 0; i < cap; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body?.dry_run === true;

  // Tunable detection params (dry-run sweeps override via body).
  //
  // ⚠ CALIBRATED, NOT UNIVERSAL (Law 2 — don't launder a fitted value as a measured constant):
  // coverageFrac=0.4 and minCoreDistanceM=600 were fit to user 45d122e7 on 2026-07-06 via a
  // coverage sweep against THIS user's trailhead + GPS jitter. They encode a real principle —
  // "freeze the LONGEST stretch that still clears the N≥8 verdict floor with margin" (0.4 → his
  // 1.83mi core at 15 efforts; 600m drops the sub-floor 487m stub as too-short-to-trend) — but the
  // numbers themselves are per-profile. A future user with a different GPS/run profile MUST get
  // their own sweep; these must not silently become everyone's defaults. TODO(multi-user): move
  // to a per-user calibration record rather than a function constant.
  const numOpt = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const tune = {
    minRuns: numOpt(body?.min_runs),
    trailheadRadiusM: numOpt(body?.trailhead_radius_m) ?? TRAILHEAD_RADIUS_M,
    corridorM: numOpt(body?.corridor_m),
    coverageFrac: numOpt(body?.coverage_frac) ?? 0.4,
    minCoreDistanceM: numOpt(body?.min_core_distance_m) ?? 600,
  };

  // Auth: resolve the caller from their JWT and operate on their own data. Plus an admin/backfill
  // path — a service-role bearer may target an explicit user_id (pre-launch, solo; the service key
  // is a secret only the owner holds).
  const authHeader = req.headers.get('Authorization') ?? '';
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  let userId: string | null = user?.id ?? null;
  if (!userId && typeof body?.user_id === 'string' && authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    userId = body.user_id;
  }
  if (!userId) return json({ ok: false, error: 'unauthorized' }, 401);

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Cheap pass: which runs are eligible? (ids + type/status only — no gps_track payload yet)
  const { data: idRows, error: idErr } = await svc
    .from('workouts')
    .select('id, date, type, workout_status')
    .eq('user_id', userId)
    .not('gps_track', 'is', null)
    .order('date', { ascending: true })
    .limit(5000);
  if (idErr) return json({ ok: false, error: `id load failed: ${idErr.message}` }, 500);

  const eligible = (idRows ?? []).filter((w) => {
    const t = String((w as any).type ?? '').toLowerCase();
    return (t === 'run' || t === 'running') &&
      String((w as any).workout_status ?? '').toLowerCase() === 'completed';
  });

  // Heavy pass, BATCHED: load gps_track in small chunks and decimate each to a coarse polyline
  // immediately, discarding the raw per-second track. Peak memory stays at one batch, not 142 tracks.
  const CAP = 400; // points/run; consensus resamples to 20m anyway (400×20m = 8km of resolution)
  const BATCH = 20;
  const runs: DetectRun[] = [];
  for (let i = 0; i < eligible.length; i += BATCH) {
    const ids = eligible.slice(i, i + BATCH).map((w) => (w as any).id);
    const { data: trackRows, error: tErr } = await svc
      .from('workouts')
      .select('id, date, gps_track')
      .in('id', ids);
    if (tErr) return json({ ok: false, error: `track load failed: ${tErr.message}` }, 500);
    for (const w of trackRows ?? []) {
      const pts = parseGpsPoints((w as any).gps_track);
      if (pts.length < 8) continue;
      runs.push({
        id: (w as any).id,
        date: String((w as any).date ?? '').slice(0, 10),
        points: decimate(pts, CAP).map((p) => ({ lat: p.lat, lng: p.lng })),
      });
    }
  }

  const cores = detectCores(runs, tune);

  const summarize = (c: (typeof cores)[number]) => ({
    core_key: c.coreKey,
    trailhead: c.trailheadCell,
    direction_bucket: c.directionBucket,
    distance_m: c.distanceM,
    detected_from_n: c.detectedFromN,
    start: [Number(c.startLat.toFixed(5)), Number(c.startLng.toFixed(5))],
    end: [Number(c.endLat.toFixed(5)), Number(c.endLng.toFixed(5))],
  });

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      runs_considered: runs.length,
      cores_detected: cores.length,
      cores: cores.map(summarize),
      groups: groupStats(runs, tune),
    });
  }

  let frozen = 0;
  let skipped = 0;
  const results: unknown[] = [];
  for (const c of cores) {
    // Geometric freeze guard: is there already an ACTIVE core starting near here, same direction?
    const { data: existing, error: guardErr } = await svc
      .from('route_cores')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('direction_bucket', c.directionBucket)
      .gte('start_lat', c.startLat - GUARD_DEG)
      .lte('start_lat', c.startLat + GUARD_DEG)
      .gte('start_lng', c.startLng - GUARD_DEG)
      .lte('start_lng', c.startLng + GUARD_DEG)
      .limit(1);
    if (guardErr) {
      results.push({ core_key: c.coreKey, error: `guard: ${guardErr.message}` });
      continue;
    }
    if (existing && existing.length > 0) {
      skipped++;
      continue; // already frozen — geometry is born once
    }

    const geohashSeq = c.pointPolyline
      .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
      .join(';'); // ordered reference sequence; the real identity is point_polyline

    const { error: insErr } = await svc.from('route_cores').insert({
      user_id: userId,
      core_key: c.coreKey,
      trailhead_cell: c.trailheadCell,
      point_polyline: c.pointPolyline.map((p) => [p.lat, p.lng]),
      geohash_seq: geohashSeq,
      start_lat: c.startLat,
      start_lng: c.startLng,
      end_lat: c.endLat,
      end_lng: c.endLng,
      direction_bearing: c.directionBearing,
      direction_bucket: c.directionBucket,
      distance_m: c.distanceM,
      version: 1,
      is_active: true,
      detected_from_n: c.detectedFromN,
      metadata: { member_run_ids: c.memberRunIds, detector: 'consensus-v1' },
    });
    if (insErr) {
      results.push({ core_key: c.coreKey, error: `insert: ${insErr.message}` });
      continue;
    }
    frozen++;
    results.push(summarize(c));
  }

  return json({
    ok: true,
    runs_considered: runs.length,
    cores_detected: cores.length,
    frozen,
    skipped,
    results,
  });
});
