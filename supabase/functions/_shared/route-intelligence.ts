// The ONE implementation of "which route is this run/ride, and count it once". Used by compute-facts
// (live, per ingest/recompute) AND by backfill-routes (rebuild history) so they can never drift.
// Identity is the PATH (geohash overlap), not distance — see route-match.ts. Idempotent: sample_count
// is a true recount, never a running increment.

import { trackToGeohashSet } from "./geohash.ts";
import { bestRouteMatch, mergeGeohashes, ROUTE_MATCH_MIN_OVERLAP } from "./route-match.ts";

// --- small pure helpers (local copies of primitives; not domain logic that could fork) ---
function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseJsonSafe(v: any): any {
  try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; }
}
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const aa = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa)));
}

export interface RouteWorkout {
  id: string;
  user_id: string;
  type?: string | null;
  date?: string | null;
  distance?: number | null;
  elevation_gain?: number | null;
  start_position_lat?: number | null;
  start_position_long?: number | null;
  gps_track?: any;
  computed?: any;
}

export type RouteFeatures = {
  distance_m: number;
  elevation_gain_m: number;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  shape_hint: string;
};

function distanceMeters(w: RouteWorkout): number {
  if (typeof w.distance === "number" && w.distance > 0) {
    return w.distance < 1000 ? w.distance * 1000 : w.distance;
  }
  const compDist = w.computed?.overall?.distance_m;
  if (typeof compDist === "number" && compDist > 0) return compDist;
  return 0;
}

export function deriveRouteFeatures(w: RouteWorkout): RouteFeatures {
  const distance_m = Math.round(distanceMeters(w));
  const elevation_gain_m = Math.round(toNum(w.elevation_gain) ?? 0);
  let start_lat = toNum(w.start_position_lat);
  let start_lng = toNum(w.start_position_long);
  let end_lat: number | null = null;
  let end_lng: number | null = null;

  const trackRaw = parseJsonSafe(w.gps_track) ?? [];
  const track = Array.isArray(trackRaw) ? trackRaw : [];
  if (track.length > 0) {
    const first = track[0] || {};
    const last = track[track.length - 1] || {};
    const fLat = toNum(first.lat ?? first.latitude);
    const fLng = toNum(first.lng ?? first.lon ?? first.longitude);
    const lLat = toNum(last.lat ?? last.latitude);
    const lLng = toNum(last.lng ?? last.lon ?? last.longitude);
    if (start_lat == null && fLat != null) start_lat = fLat;
    if (start_lng == null && fLng != null) start_lng = fLng;
    end_lat = lLat;
    end_lng = lLng;
  }

  const shapeHint = (() => {
    if (!track.length) return "";
    const sampleIdx = [0, Math.floor(track.length / 4), Math.floor(track.length / 2), Math.floor((3 * track.length) / 4), track.length - 1];
    const pts: string[] = [];
    for (const i of sampleIdx) {
      const p = track[Math.max(0, Math.min(track.length - 1, i))] || {};
      const lat = toNum(p.lat ?? p.latitude);
      const lng = toNum(p.lng ?? p.lon ?? p.longitude);
      if (lat == null || lng == null) continue;
      pts.push(`${lat.toFixed(3)},${lng.toFixed(3)}`);
    }
    return pts.join("|");
  })();

  return { distance_m, elevation_gain_m, start_lat, start_lng, end_lat, end_lng, shape_hint: shapeHint };
}

export function buildRouteFingerprint(f: RouteFeatures): string {
  const distBucket = Math.round(f.distance_m / 200);
  const elevBucket = Math.round((f.elevation_gain_m || 0) / 10);
  const sLat = f.start_lat != null ? f.start_lat.toFixed(3) : "na";
  const sLng = f.start_lng != null ? f.start_lng.toFixed(3) : "na";
  const eLat = f.end_lat != null ? f.end_lat.toFixed(3) : "na";
  const eLng = f.end_lng != null ? f.end_lng.toFixed(3) : "na";
  const shape = f.shape_hint ? `|${f.shape_hint}` : "";
  return `d${distBucket}-e${elevBucket}-s${sLat},${sLng}-x${eLat},${eLng}${shape}`;
}

export interface RouteResolveResult {
  cluster: any;
  matchConfidence: number;
  fingerprint: string;
  features: RouteFeatures;
  runGeohashes: string[];
}

/**
 * Resolve (match or create) the route cluster for a workout, PATH-first, and set its sample_count to a
 * true recount (idempotent). Returns null when the workout has no usable route (too short). Does NOT
 * write route_progress_metrics — that run-only efficiency data stays in compute-facts.
 */
export async function resolveRouteCluster(supabase: any, w: RouteWorkout): Promise<RouteResolveResult | null> {
  const features = deriveRouteFeatures(w);
  if (!features.distance_m || features.distance_m < 1000) return null;

  const fingerprint = buildRouteFingerprint(features);
  const workoutDate = String(w.date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const runGeohashes = trackToGeohashSet(parseJsonSafe(w.gps_track), 7);
  const CLUSTER_COLS = "id,name,fingerprint,distance_m,elevation_gain_m,sample_count,metadata,first_seen_at";

  let cluster: any = null;
  let matchConfidence = 0;

  if (runGeohashes.length >= 8) {
    // PRIMARY: path-overlap match against this athlete's active routes (length-guarded).
    const { data: activeClusters } = await supabase
      .from("route_clusters").select(CLUSTER_COLS)
      .eq("user_id", w.user_id).eq("is_active", true).limit(300);
    const lite = (Array.isArray(activeClusters) ? activeClusters : []).map((c: any) => ({
      id: c.id, geohashes: (parseJsonSafe(c.metadata) || {}).geohashes || [], distance_m: toNum(c.distance_m), _row: c,
    }));
    const m = bestRouteMatch(runGeohashes, lite, ROUTE_MATCH_MIN_OVERLAP, features.distance_m);
    if (m) { cluster = (m.cluster as any)._row; matchConfidence = m.overlap; }
  } else {
    // FALLBACK (no usable GPS path): legacy exact-fingerprint + distance-fuzzy match.
    const { data: existingExact } = await supabase
      .from("route_clusters").select(CLUSTER_COLS)
      .eq("user_id", w.user_id).eq("fingerprint", fingerprint).maybeSingle();
    cluster = existingExact ?? null;
    if (cluster) {
      matchConfidence = 1;
    } else {
      const { data: candidates } = await supabase
        .from("route_clusters").select(CLUSTER_COLS)
        .eq("user_id", w.user_id).eq("is_active", true)
        .gte("distance_m", Math.max(1000, features.distance_m - Math.max(600, features.distance_m * 0.2)))
        .lte("distance_m", features.distance_m + Math.max(600, features.distance_m * 0.2))
        .limit(30);
      const scored = (Array.isArray(candidates) ? candidates : []).map((c: any) => {
        const cMeta = parseJsonSafe(c.metadata) || {};
        const cDist = toNum(c.distance_m) ?? 0;
        const distScore = Math.max(0, 1 - Math.abs(features.distance_m - cDist) / Math.max(800, cDist * 0.2));
        const cStartLat = toNum(cMeta.start_lat), cStartLng = toNum(cMeta.start_lng);
        const cEndLat = toNum(cMeta.end_lat), cEndLng = toNum(cMeta.end_lng);
        const startScore = (features.start_lat != null && features.start_lng != null && cStartLat != null && cStartLng != null)
          ? Math.max(0, 1 - (haversineKm(features.start_lat, features.start_lng, cStartLat, cStartLng) / 2.0)) : 0.4; // estimate-ok: geo course-match score (heuristic, not a rendered athlete metric)
        const endScore = (features.end_lat != null && features.end_lng != null && cEndLat != null && cEndLng != null)
          ? Math.max(0, 1 - (haversineKm(features.end_lat, features.end_lng, cEndLat, cEndLng) / 2.0)) : 0.4; // estimate-ok: geo course-match score (heuristic, not a rendered athlete metric)
        return { c, score: (0.5 * distScore) + (0.3 * startScore) + (0.2 * endScore) };
      }).sort((a, b) => b.score - a.score);
      if (scored.length && scored[0].score >= 0.62) { cluster = scored[0].c; matchConfidence = scored[0].score; }
    }
  }

  if (!cluster) {
    const { count: clusterCount } = await supabase
      .from("route_clusters").select("id", { count: "exact", head: true }).eq("user_id", w.user_id);
    const routeNumber = (clusterCount ?? 0) + 1;
    const { data: created, error: createErr } = await supabase
      .from("route_clusters")
      .insert({
        user_id: w.user_id, name: `Route ${routeNumber}`, fingerprint,
        distance_m: features.distance_m, elevation_gain_m: features.elevation_gain_m,
        sample_count: 1, is_active: true,
        first_seen_at: workoutDate, last_seen_at: new Date().toISOString(),
        metadata: {
          start_lat: features.start_lat, start_lng: features.start_lng,
          end_lat: features.end_lat, end_lng: features.end_lng,
          shape_hint: features.shape_hint || null, geohashes: runGeohashes,
        },
      })
      .select(CLUSTER_COLS).single();
    if (createErr) throw createErr;
    cluster = created;
  } else {
    const meta = parseJsonSafe(cluster.metadata) || {};
    const mergedGeohashes = runGeohashes.length ? mergeGeohashes(meta.geohashes, runGeohashes) : (meta.geohashes || []);
    const prevFirst = cluster.first_seen_at ? String(cluster.first_seen_at).slice(0, 10) : workoutDate;
    const firstSeen = workoutDate < prevFirst ? workoutDate : prevFirst;
    await supabase.from("route_clusters").update({
      is_active: true, last_seen_at: new Date().toISOString(), first_seen_at: firstSeen,
      metadata: {
        ...meta,
        start_lat: meta.start_lat ?? features.start_lat, start_lng: meta.start_lng ?? features.start_lng,
        end_lat: meta.end_lat ?? features.end_lat, end_lng: meta.end_lng ?? features.end_lng,
        shape_hint: meta.shape_hint ?? (features.shape_hint || null), geohashes: mergedGeohashes,
      },
    }).eq("id", cluster.id);
  }

  // Idempotent membership + count: record this workout's route (upsert by workout_id), then set
  // sample_count to the TRUE distinct-workout count. Recount the prior cluster too if it moved.
  const { data: priorMatch } = await supabase
    .from("workout_route_match").select("route_cluster_id").eq("workout_id", w.id).maybeSingle();
  const priorClusterId = (priorMatch as any)?.route_cluster_id ?? null;

  await supabase.from("workout_route_match").upsert({
    user_id: w.user_id, workout_id: w.id, route_cluster_id: cluster.id,
    match_confidence: Number(matchConfidence.toFixed(4)),
    match_method: runGeohashes.length >= 8 ? "path_overlap_v1" : "distance_start_shape_v1",
    condition_bucket: "unknown", weather: {},
  }, { onConflict: "workout_id" });

  const recountCluster = async (cid: string) => {
    const { count } = await supabase
      .from("workout_route_match").select("workout_id", { count: "exact", head: true }).eq("route_cluster_id", cid);
    await supabase.from("route_clusters").update({ sample_count: count ?? 0 }).eq("id", cid);
  };
  await recountCluster(cluster.id);
  if (priorClusterId && priorClusterId !== cluster.id) await recountCluster(priorClusterId);

  return { cluster, matchConfidence, fingerprint, features, runGeohashes };
}
