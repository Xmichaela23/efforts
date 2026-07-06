// Minimal geohash encoder — turns a GPS track into the set of ~150m cells it passes through, so a
// route can be identified by the ROADS it covers (path), not by its total distance. Precision 7 ≈
// 153m × 153m: fine enough to separate different roads, coarse enough to absorb GPS jitter.

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function encodeGeohash(lat: number, lng: number, precision = 7): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { geohash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return geohash;
}

type TrackPoint = { lat?: number; lng?: number; lon?: number; latitude?: number; longitude?: number };

/** Deduped set of geohash cells a GPS track passes through (the route's "path signature"). */
export function trackToGeohashSet(track: TrackPoint[] | null | undefined, precision = 7): string[] {
  const set = new Set<string>();
  for (const p of (Array.isArray(track) ? track : [])) {
    const lat = Number(p?.lat ?? p?.latitude);
    const lng = Number(p?.lng ?? p?.lon ?? p?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      set.add(encodeGeohash(lat, lng, precision));
    }
  }
  return [...set];
}
