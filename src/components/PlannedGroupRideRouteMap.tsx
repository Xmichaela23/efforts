import React, { useMemo } from 'react';
import MapEffort from '@/components/MapEffort';
import { decodeEncodedPolylineToLngLat } from '@/lib/geo';
import { parseGroupRideRouteSnapshot } from '@/lib/group-ride-route-snapshot';

type PlannedGroupRideRouteMapProps = {
  routeSnapshot: unknown;
  units?: string | null;
};

/**
 * Static route preview for anchored group rides — uses Strava polyline from `route_snapshot`
 * (persisted at activate-plan). Reuses MapEffort / MapLibre like completed workout detail.
 */
export default function PlannedGroupRideRouteMap({ routeSnapshot, units }: PlannedGroupRideRouteMapProps) {
  const { trackLngLat, totalDist_m } = useMemo(() => {
    const snap = parseGroupRideRouteSnapshot(routeSnapshot);
    const enc = snap?.map_polyline;
    if (!enc) return { trackLngLat: null as [number, number][] | null, totalDist_m: undefined as number | undefined };
    try {
      const t = decodeEncodedPolylineToLngLat(enc);
      if (t.length < 2) return { trackLngLat: null, totalDist_m: undefined };
      return {
        trackLngLat: t,
        totalDist_m: typeof snap.distance_m === 'number' ? snap.distance_m : undefined,
      };
    } catch {
      return { trackLngLat: null, totalDist_m: undefined };
    }
  }, [routeSnapshot]);

  if (!trackLngLat || trackLngLat.length < 2) return null;

  const imperial = String(units || '').toLowerCase() !== 'metric';

  return (
    <div className="mt-5 -mx-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/45 mb-2">Route preview</p>
      <div className="rounded-2xl overflow-hidden border border-white/12 bg-black/30">
        <MapEffort
          trackLngLat={trackLngLat}
          cursorDist_m={0}
          totalDist_m={totalDist_m}
          height={220}
          theme="outdoor"
          useMiles={imperial}
        />
      </div>
    </div>
  );
}
