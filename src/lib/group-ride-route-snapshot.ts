/**
 * Client mirror of `supabase/functions/_shared/group-ride-route-snapshot.ts`
 * for Arc wizard UX (Strava route enrichment). Keep shapes in sync manually.
 */

export type GroupRideRouteSnapshotSource = 'strava';

export type GroupRideRouteSnapshot = {
  source: GroupRideRouteSnapshotSource;
  /** Decimal digits — can exceed JS safe integer range */
  strava_route_id: string;
  route_url_normalized: string;
  route_name?: string;
  distance_m: number;
  elevation_gain_m: number;
  climb_density_m_per_km: number;
  fetched_at: string;
  map_polyline?: string;
};

export const CLIMB_NOTICE_MIN_MK = 12;
export const CLIMB_AGGRESSIVE_MIN_MK = 16;
export const CLIMB_AGGRESSIVE_MIN_GAIN_M = 500;

export function climbNoticeTier(
  snapshot: GroupRideRouteSnapshot,
): 'none' | 'notice' | 'aggressive' {
  const mk = snapshot.climb_density_m_per_km;
  const eg = snapshot.elevation_gain_m;
  if (eg >= CLIMB_AGGRESSIVE_MIN_GAIN_M || mk >= CLIMB_AGGRESSIVE_MIN_MK) return 'aggressive';
  if (mk >= CLIMB_NOTICE_MIN_MK) return 'notice';
  return 'none';
}

export function stravaRouteUrlLooksFetchable(url: string): boolean {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const h = u.hostname.toLowerCase();
    if (h !== 'strava.com' && !h.endsWith('.strava.com')) return false;
    return /\/routes\/\d+/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Validate JSON-safe snapshot (wizard / planned row). */
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
