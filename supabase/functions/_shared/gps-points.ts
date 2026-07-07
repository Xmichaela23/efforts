/**
 * gps-points.ts — parse a workout's stored GPS track into ordered points.
 *
 * Confirmed shape on real data (2026-07-06): `workouts.gps_track` is jsonb,
 *   [{ lat, lng, elevation, timestamp(ms), startTimeInSeconds }, ...]
 * but this reader keeps the same shape-tolerance as compute-facts' buildGpsPoints so it survives
 * provider variants (position arrays, coords.*, lat/latitude, etc.). Carries per-point time (ms)
 * for effort slicing (duration/pace over a core span, step 3) and elevation.
 *
 * NOTE: compute-facts has its own private buildGpsPoints; consolidating both onto this module is a
 * worthwhile follow-up (behind a Law-6 fixture), but NOT done here to avoid touching the ingest path.
 */

export interface GpsPt {
  lat: number;
  lng: number;
  t?: number; // epoch ms
  ele?: number; // metres
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a timestamp(ms) → HR map from `sensor_data.samples`. Same clock as `gps_track` (confirmed on
 * real data: both arrays share per-point `timestamp`), so the map joins HR onto gps points by time —
 * robust even if the two arrays differ in length. Only samples with a real HR reading are included,
 * so a run whose HR drops out leaves those timestamps ABSENT (→ that stretch reads as no-HR, which is
 * exactly what drives per-slice metric_source in core-effort.ts).
 */
export function parseHrByTime(raw: unknown): Map<number, number> {
  let data: any = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return new Map();
    }
  }
  const samples: any[] = Array.isArray(data?.samples) ? data.samples : Array.isArray(data) ? data : [];
  const m = new Map<number, number>();
  for (const s of samples) {
    const tms = num(s?.timestamp);
    const tsec = num(s?.startTimeInSeconds ?? s?.t ?? s?.time);
    const t = tms != null ? tms : tsec != null ? tsec * 1000 : null;
    const hr = num(s?.heartRate ?? s?.heart_rate);
    if (t != null && hr != null && hr > 0) m.set(t, hr);
  }
  return m;
}

export function parseGpsPoints(raw: unknown): GpsPt[] {
  let data: any = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const arr: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.points)
    ? data.points
    : Array.isArray(data?.track)
    ? data.track
    : Array.isArray(data?.samples)
    ? data.samples
    : [];

  const out: GpsPt[] = [];
  for (const p of arr) {
    const lat = num(
      p?.lat ?? p?.latitude ?? p?.position?.lat ?? p?.coords?.latitude ??
        (Array.isArray(p?.position) ? p.position[0] : null) ?? (Array.isArray(p) ? p[0] : null),
    );
    const lng = num(
      p?.lng ?? p?.lon ?? p?.longitude ?? p?.position?.lng ?? p?.position?.lon ??
        p?.coords?.longitude ?? (Array.isArray(p?.position) ? p.position[1] : null) ??
        (Array.isArray(p) ? p[1] : null),
    );
    if (lat == null || lng == null) continue;
    const ele = num(p?.elevation ?? p?.ele ?? p?.altitude ?? p?.coords?.altitude);
    const tms = num(p?.timestamp); // per-point ms
    const tsec = num(p?.t ?? p?.time ?? p?.seconds); // per-point seconds variants
    const t = tms != null ? tms : tsec != null ? tsec * 1000 : undefined;
    out.push({ lat, lng, ele: ele ?? undefined, t });
  }
  return out;
}
