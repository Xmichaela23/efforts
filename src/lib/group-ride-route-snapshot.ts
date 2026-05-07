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
