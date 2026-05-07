/**
 * Persisted Strava route metadata for recurring group-ride anchors (wizard → training_prefs → athlete_state).
 * v1: deterministic copy + optional bike TSS floor in session-factory (no LLM).
 */

export type GroupRideRouteSnapshotSource = 'strava';

export type GroupRideRouteSnapshot = {
  source: GroupRideRouteSnapshotSource;
  /**
   * Decimal digits only. Strava route IDs can exceed `Number.MAX_SAFE_INTEGER`; never coerce via `Number()`.
   */
  strava_route_id: string;
  /** Same normalization as `group_ride_route_url` (https URL, max 512). */
  route_url_normalized: string;
  route_name?: string;
  distance_m: number;
  elevation_gain_m: number;
  /** meters climbed per km route length — principal hilliness signal */
  climb_density_m_per_km: number;
  fetched_at: string;
  /** Google-encoded polyline from Strava `map.polyline` / `summary_polyline` — for planned workout map preview. */
  map_polyline?: string;
};

/** Align with ArcSetup / scheduling hints (see product discussion). */
export const CLIMB_NOTICE_MIN_MK = 12;
export const CLIMB_AGGRESSIVE_MIN_MK = 16;
export const CLIMB_AGGRESSIVE_MIN_GAIN_M = 500;

/** Extract route id digits from a Strava routes URL (preserves full precision). */
export function parseStravaRouteIdFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`);
    const h = u.hostname.toLowerCase();
    if (h !== 'strava.com' && !h.endsWith('.strava.com')) return null;
    const m = u.pathname.match(/\/routes\/(\d+)/i);
    if (!m?.[1]) return null;
    const digits = m[1];
    return /^\d+$/.test(digits) ? digits : null;
  } catch {
    return null;
  }
}

export function normalizeHttpsUrlMax512(raw: string): string | null {
  const t = raw.trim().slice(0, 512);
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href.slice(0, 512);
  } catch {
    return null;
  }
}

export function snapshotFromStravaRouteApi(
  routeJson: Record<string, unknown>,
  routeUrlNormalized: string,
  /** Parsed from the athlete's URL — authoritative id for the API request + storage. */
  routeIdFromUrl: string,
): GroupRideRouteSnapshot | null {
  if (!/^\d+$/.test(routeIdFromUrl)) return null;

  const distance_m = Number(routeJson.distance);
  const elevation_gain_m = Number(routeJson.elevation_gain);
  if (!Number.isFinite(distance_m) || distance_m <= 0) return null;
  if (!Number.isFinite(elevation_gain_m) || elevation_gain_m < 0) return null;

  const distanceKm = distance_m / 1000;
  const climb_density_m_per_km = distanceKm > 0 ? elevation_gain_m / distanceKm : 0;

  const nameRaw = routeJson.name ?? routeJson.title;
  const route_name =
    typeof nameRaw === 'string' && nameRaw.trim().length > 0 ? nameRaw.trim().slice(0, 200) : undefined;

  let map_polyline: string | undefined;
  const mapRaw = routeJson.map;
  if (mapRaw && typeof mapRaw === 'object' && !Array.isArray(mapRaw)) {
    const m = mapRaw as Record<string, unknown>;
    const pl = typeof m.polyline === 'string' ? m.polyline.trim() : '';
    const sm = typeof m.summary_polyline === 'string' ? m.summary_polyline.trim() : '';
    const chosen = pl.length > 0 ? pl : sm;
    if (chosen.length > 0 && chosen.length <= 120_000) map_polyline = chosen;
  }

  return {
    source: 'strava',
    strava_route_id: routeIdFromUrl,
    route_url_normalized: routeUrlNormalized,
    route_name,
    distance_m,
    elevation_gain_m,
    climb_density_m_per_km: Math.round(climb_density_m_per_km * 10) / 10,
    fetched_at: new Date().toISOString(),
    ...(map_polyline ? { map_polyline } : {}),
  };
}

export function climbNoticeTier(snapshot: GroupRideRouteSnapshot): 'none' | 'notice' | 'aggressive' {
  const mk = snapshot.climb_density_m_per_km;
  const eg = snapshot.elevation_gain_m;
  if (eg >= CLIMB_AGGRESSIVE_MIN_GAIN_M || mk >= CLIMB_AGGRESSIVE_MIN_MK) return 'aggressive';
  if (mk >= CLIMB_NOTICE_MIN_MK) return 'notice';
  return 'none';
}

/** Minimum bike TSS for the planned group-ride session when topography is demanding (v1). */
export function groupRideBikeTssFloor(snapshot: GroupRideRouteSnapshot | null | undefined): number | undefined {
  if (!snapshot) return undefined;
  const tier = climbNoticeTier(snapshot);
  if (tier === 'aggressive') return 85;
  if (tier === 'notice') return 65;
  return undefined;
}

/** Validate JSON-safe snapshot shape after DB / client merge. */
export function parseGroupRideRouteSnapshot(raw: unknown): GroupRideRouteSnapshot | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (o.source !== 'strava') return undefined;

  const idRaw = o.strava_route_id;
  let routeIdStr: string | null = null;
  if (typeof idRaw === 'string' && /^\d+$/.test(idRaw.trim())) {
    routeIdStr = idRaw.trim();
  } else if (
    typeof idRaw === 'number' &&
    Number.isFinite(idRaw) &&
    idRaw > 0 &&
    idRaw <= Number.MAX_SAFE_INTEGER
  ) {
    routeIdStr = String(Math.floor(idRaw));
  }
  if (!routeIdStr) return undefined;

  const url =
    typeof o.route_url_normalized === 'string' ? o.route_url_normalized.trim().slice(0, 512) : '';
  const dm = typeof o.distance_m === 'number' ? o.distance_m : Number(o.distance_m);
  const eg = typeof o.elevation_gain_m === 'number' ? o.elevation_gain_m : Number(o.elevation_gain_m);
  const dens =
    typeof o.climb_density_m_per_km === 'number'
      ? o.climb_density_m_per_km
      : Number(o.climb_density_m_per_km);
  const fetched =
    typeof o.fetched_at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(o.fetched_at) ? o.fetched_at : '';

  if (!url.startsWith('https://')) return undefined;
  if (!Number.isFinite(dm) || dm <= 0) return undefined;
  if (!Number.isFinite(eg) || eg < 0) return undefined;
  if (!Number.isFinite(dens) || dens < 0) return undefined;
  if (!fetched) return undefined;

  const rn = o.route_name;
  const route_name =
    typeof rn === 'string' && rn.trim().length > 0 ? rn.trim().slice(0, 200) : undefined;

  const mpRaw = o.map_polyline;
  let map_polyline: string | undefined;
  if (typeof mpRaw === 'string') {
    const t = mpRaw.trim();
    if (t.length > 0 && t.length <= 120_000) map_polyline = t;
  }

  return {
    source: 'strava',
    strava_route_id: routeIdStr,
    route_url_normalized: url,
    route_name,
    distance_m: dm,
    elevation_gain_m: eg,
    climb_density_m_per_km: dens,
    fetched_at: fetched,
    ...(map_polyline ? { map_polyline } : {}),
  };
}
