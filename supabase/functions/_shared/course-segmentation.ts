/**
 * Deterministic race course segmentation from elevation profile.
 * Single source of truth for geometry — used by course-upload and course-strategy.
 */

export type ProfilePoint = {
  distance_m: number;
  elevation_m: number;
  lat?: number | null;
  lon?: number | null;
};

export type GeometrySegment = {
  segment_order: number;
  start_distance_m: number;
  end_distance_m: number;
  start_elevation_m: number;
  end_elevation_m: number;
  elevation_change_m: number;
  avg_grade_pct: number;
  terrain_type: 'climb' | 'descent' | 'flat' | 'rolling';
};

const MI_M = 1609.344;
const WINDOW_M = 0.25 * MI_M;
const MIN_SEG_M = 0.5 * MI_M;
const MAX_SEG_M = 5 * MI_M;
const ROLLING_SAMPLE_M = 1 * MI_M;
const GRADE_CLIMB = 2;
const GRADE_DESCENT = -2;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Great-circle distance between two WGS84 points (meters). */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Parse GPX string → ordered trackpoints with cumulative distance_m. */
export function parseGpxToProfile(gpx: string): ProfilePoint[] {
  const text = String(gpx || '');
  const pts: { lat: number; lon: number; ele: number | null }[] = [];
  const re = /<trkpt\s+([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tag = m[1];
    const latM = /lat="([-0-9.eE+]+)"/.exec(tag);
    const lonM = /lon="([-0-9.eE+]+)"/.exec(tag);
    if (!latM || !lonM) continue;
    const lat = parseFloat(latM[1]);
    const lon = parseFloat(lonM[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const end = text.indexOf('</trkpt>', m.index);
    let ele: number | null = null;
    if (end > m.index) {
      const inner = text.slice(m.index, end);
      const em = /<ele>([-0-9.eE+]+)<\/ele>/i.exec(inner);
      if (em) {
        const v = parseFloat(em[1]);
        if (Number.isFinite(v)) ele = v;
      }
    }
    pts.push({ lat, lon, ele });
  }
  if (pts.length < 2) return [];

  let cum = 0;
  const out: ProfilePoint[] = [{ distance_m: 0, elevation_m: pts[0].ele ?? 0, lat: pts[0].lat, lon: pts[0].lon }];
  for (let i = 1; i < pts.length; i++) {
    const d = haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    cum += d;
    let elev = pts[i].ele;
    if (elev == null) {
      elev = out[out.length - 1].elevation_m;
    }
    if (cum <= out[out.length - 1].distance_m + 0.05) continue;
    out.push({
      distance_m: cum,
      elevation_m: elev,
      lat: pts[i].lat,
      lon: pts[i].lon,
    });
  }
  return out;
}

export function smoothElevation(points: ProfilePoint[], halfWindow = 2): ProfilePoint[] {
  if (points.length === 0) return [];
  const n = points.length;
  return points.map((p, i) => {
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(n - 1, i + halfWindow);
    let s = 0;
    let c = 0;
    for (let j = lo; j <= hi; j++) {
      s += points[j].elevation_m;
      c++;
    }
    return {
      ...p,
      elevation_m: s / c,
    };
  });
}

function interpolateElevAt(points: ProfilePoint[], dist: number): number {
  if (points.length === 0) return 0;
  if (dist <= points[0].distance_m) return points[0].elevation_m;
  const last = points[points.length - 1];
  if (dist >= last.distance_m) return last.elevation_m;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distance_m <= dist) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const t = (dist - a.distance_m) / Math.max(1e-6, b.distance_m - a.distance_m);
  return a.elevation_m + t * (b.elevation_m - a.elevation_m);
}

function classifyGrade(grade: number): 'climb' | 'descent' | 'flat' {
  if (grade > GRADE_CLIMB) return 'climb';
  if (grade < GRADE_DESCENT) return 'descent';
  return 'flat';
}

function windowGrades(points: ProfilePoint[]): { start_m: number; end_m: number; grade: number; type: 'climb' | 'descent' | 'flat' }[] {
  const total = points[points.length - 1]?.distance_m ?? 0;
  if (total <= 0) return [];
  const out: { start_m: number; end_m: number; grade: number; type: 'climb' | 'descent' | 'flat' }[] = [];
  for (let s = 0; s < total - 1; s += WINDOW_M) {
    const e = Math.min(s + WINDOW_M, total);
    if (e - s < WINDOW_M * 0.35) break;
    const e0 = interpolateElevAt(points, s);
    const e1 = interpolateElevAt(points, e);
    const grade = ((e1 - e0) / (e - s)) * 100;
    out.push({ start_m: s, end_m: e, grade, type: classifyGrade(grade) });
  }
  return out;
}

function hysteresisTypes(windows: { type: 'climb' | 'descent' | 'flat' }[]): ('climb' | 'descent' | 'flat')[] {
  if (windows.length === 0) return [];
  const out: ('climb' | 'descent' | 'flat')[] = [];
  let committed = windows[0].type;
  for (let i = 0; i < windows.length; i++) {
    const t = windows[i].type;
    if (t === committed) {
      out.push(committed);
      continue;
    }
    const next = windows[i + 1]?.type;
    if (next != null && t === next) {
      committed = t;
      out.push(committed);
    } else {
      out.push(committed);
    }
  }
  return out;
}

function mergeWindowsToSegments(
  windows: { start_m: number; end_m: number; grade: number }[],
  types: ('climb' | 'descent' | 'flat')[],
): { start_m: number; end_m: number; avg_grade: number; type: 'climb' | 'descent' | 'flat' }[] {
  if (windows.length === 0 || types.length !== windows.length) return [];
  const segs: { start_m: number; end_m: number; sumGradeLen: number; len: number; type: 'climb' | 'descent' | 'flat' }[] = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const ty = types[i];
    const len = w.end_m - w.start_m;
    const last = segs[segs.length - 1];
    if (last && last.type === ty) {
      last.end_m = w.end_m;
      last.sumGradeLen += w.grade * len;
      last.len += len;
    } else {
      segs.push({
        start_m: w.start_m,
        end_m: w.end_m,
        sumGradeLen: w.grade * len,
        len,
        type: ty,
      });
    }
  }
  return segs.map((s) => ({
    start_m: s.start_m,
    end_m: s.end_m,
    avg_grade: s.len > 0 ? s.sumGradeLen / s.len : 0,
    type: s.type,
  }));
}

function mergeShortSegments(
  segs: { start_m: number; end_m: number; avg_grade: number; type: 'climb' | 'descent' | 'flat' }[],
): { start_m: number; end_m: number; avg_grade: number; type: 'climb' | 'descent' | 'flat' }[] {
  const out = [...segs];
  let guard = 0;
  while (guard++ < 500) {
    let idx = out.findIndex((s) => s.end_m - s.start_m < MIN_SEG_M);
    if (idx < 0) break;
    if (out.length === 1) break;
    const s = out[idx];
    const left = idx > 0 ? out[idx - 1] : null;
    const right = idx < out.length - 1 ? out[idx + 1] : null;
    let mergeLeft = false;
    if (!left) mergeLeft = false;
    else if (!right) mergeLeft = true;
    else {
      const g = s.avg_grade;
      const dl = Math.abs(g - left.avg_grade);
      const dr = Math.abs(g - right.avg_grade);
      mergeLeft = dl <= dr;
    }
    if (mergeLeft && left) {
      const len = s.end_m - left.start_m;
      const avg = len > 0
        ? (left.avg_grade * (left.end_m - left.start_m) + s.avg_grade * (s.end_m - s.start_m)) / len
        : s.avg_grade;
      left.end_m = s.end_m;
      left.avg_grade = avg;
      left.type = dominantType(left.type, s.type);
      out.splice(idx, 1);
    } else if (right) {
      const len = right.end_m - s.start_m;
      const avg = len > 0
        ? (s.avg_grade * (s.end_m - s.start_m) + right.avg_grade * (right.end_m - right.start_m)) / len
        : right.avg_grade;
      right.start_m = s.start_m;
      right.avg_grade = avg;
      right.type = dominantType(s.type, right.type);
      out.splice(idx, 1);
    } else break;
  }
  return out;
}

function dominantType(a: 'climb' | 'descent' | 'flat', b: 'climb' | 'descent' | 'flat'): 'climb' | 'descent' | 'flat' {
  if (a === b) return a;
  if (a === 'flat') return b;
  if (b === 'flat') return a;
  return 'flat';
}

function splitLongSegments(
  segs: { start_m: number; end_m: number; avg_grade: number; type: 'climb' | 'descent' | 'flat' }[],
): { start_m: number; end_m: number; avg_grade: number; type: 'climb' | 'descent' | 'flat' }[] {
  const out: { start_m: number; end_m: number; avg_grade: number; type: 'climb' | 'descent' | 'flat' }[] = [];
  for (const s of segs) {
    let cur = s.start_m;
    while (s.end_m - cur > MAX_SEG_M + 1) {
      const end = cur + MAX_SEG_M;
      out.push({ start_m: cur, end_m: end, avg_grade: s.avg_grade, type: s.type });
      cur = end;
    }
    if (s.end_m - cur > 0.5) {
      out.push({ start_m: cur, end_m: s.end_m, avg_grade: s.avg_grade, type: s.type });
    }
  }
  return out;
}

function sampleRolling(
  points: ProfilePoint[],
  start_m: number,
  end_m: number,
): 'climb' | 'descent' | 'flat' | 'rolling' {
  const types = new Set<'climb' | 'descent' | 'flat'>();
  for (let s = start_m; s < end_m - 10; s += ROLLING_SAMPLE_M) {
    const e = Math.min(s + ROLLING_SAMPLE_M, end_m);
    const e0 = interpolateElevAt(points, s);
    const e1 = interpolateElevAt(points, e);
    const g = ((e1 - e0) / (e - s)) * 100;
    types.add(classifyGrade(g));
  }
  const hasC = types.has('climb');
  const hasD = types.has('descent');
  if (hasC && hasD) return 'rolling';
  const base: 'climb' | 'descent' | 'flat' =
    hasC ? 'climb' : hasD ? 'descent' : 'flat';
  return base;
}

function finalizeTerrain(
  points: ProfilePoint[],
  segs: { start_m: number; end_m: number; avg_grade: number; type: 'climb' | 'descent' | 'flat' }[],
): GeometrySegment[] {
  return segs.map((s, i) => {
    const e0 = interpolateElevAt(points, s.start_m);
    const e1 = interpolateElevAt(points, s.end_m);
    const ch = e1 - e0;
    const len = s.end_m - s.start_m;
    const avgGrade = len > 0 ? (ch / len) * 100 : 0;
    let terrain: 'climb' | 'descent' | 'flat' | 'rolling' = s.type;
    if (len >= ROLLING_SAMPLE_M * 1.5) {
      const r = sampleRolling(points, s.start_m, s.end_m);
      if (r === 'rolling') terrain = 'rolling';
    }
    return {
      segment_order: i + 1,
      start_distance_m: s.start_m,
      end_distance_m: s.end_m,
      start_elevation_m: e0,
      end_elevation_m: e1,
      elevation_change_m: ch,
      avg_grade_pct: avgGrade,
      terrain_type: terrain,
    };
  });
}

/** Totals from smoothed profile (for persistence). */
export function elevationGainLossM(points: ProfilePoint[]): { gain_m: number; loss_m: number } {
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].elevation_m - points[i - 1].elevation_m;
    if (d > 0) gain += d;
    else loss += -d;
  }
  return { gain_m: gain, loss_m: loss };
}

/**
 * Segment smoothed elevation profile into geometry rows (no strategy fields).
 */
export function segmentCourseFromProfile(points: ProfilePoint[]): GeometrySegment[] {
  if (points.length < 2) return [];
  const windows = windowGrades(points);
  if (windows.length === 0) return [];
  const hTypes = hysteresisTypes(windows);
  let merged = mergeWindowsToSegments(windows, hTypes);
  merged = mergeShortSegments(merged);
  merged = splitLongSegments(merged);
  return finalizeTerrain(points, merged);
}

/** Normalize arbitrary JSON profile to ProfilePoint[]. */
export function normalizeElevationProfile(raw: unknown): ProfilePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfilePoint[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const dm = Number(o.distance_m);
    const em = Number(o.elevation_m);
    if (!Number.isFinite(dm) || !Number.isFinite(em)) continue;
    const lat = o.lat != null ? Number(o.lat) : null;
    const lon = o.lon != null ? Number(o.lon) : null;
    out.push({
      distance_m: dm,
      elevation_m: em,
      lat: Number.isFinite(lat!) ? lat : null,
      lon: Number.isFinite(lon!) ? lon : null,
    });
  }
  out.sort((a, b) => a.distance_m - b.distance_m);
  return out;
}

export function profileToJson(points: ProfilePoint[]): Record<string, unknown>[] {
  return points.map((p) => {
    const o: Record<string, unknown> = {
      distance_m: p.distance_m,
      elevation_m: p.elevation_m,
    };
    if (p.lat != null && Number.isFinite(p.lat)) o.lat = p.lat;
    if (p.lon != null && Number.isFinite(p.lon)) o.lon = p.lon;
    return o;
  });
}
