export type LngLat = [number, number];

export function sanitizeLngLat(coords: any[]): LngLat[] {
  if (!Array.isArray(coords)) return [];
  return coords
    .map((p: any) => Array.isArray(p) ? p : [p?.[0] ?? p?.lng ?? p?.longitudeInDegree ?? p?.longitude ?? p?.lon, p?.[1] ?? p?.lat ?? p?.latitudeInDegree ?? p?.latitude])
    .filter((p: any) => Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]) && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90) as LngLat[];
}

const R = 6371000; // meters
export function haversineMeters(a: LngLat, b: LngLat): number {
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const dφ = ((lat2 - lat1) * Math.PI) / 180, dλ = ((lon2 - lon1) * Math.PI) / 180;
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function cumulativeMeters(track: LngLat[]): number[] {
  if (!Array.isArray(track) || track.length === 0) return [0];
  const out: number[] = new Array(track.length);
  out[0] = 0;
  for (let i = 1; i < track.length; i++) out[i] = out[i - 1] + haversineMeters(track[i - 1], track[i]);
  return out;
}

export function pointAtDistance(track: LngLat[], cum: number[], targetMeters: number): LngLat {
  if (!track.length) return [0, 0];
  const total = cum[cum.length - 1] || 1;
  const t = Math.max(0, Math.min(targetMeters, total));
  let i = cum.findIndex((x) => x >= t);
  if (i < 0) i = cum.length - 1;
  if (i <= 0) return track[0];
  const d0 = cum[i - 1], d1 = cum[i];
  const seg = Math.max(1e-6, d1 - d0);
  const r = (t - d0) / seg;
  const [lon0, lat0] = track[i - 1], [lon1, lat1] = track[i];
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  return [lerp(lon0, lon1, r), lerp(lat0, lat1, r)];
}


