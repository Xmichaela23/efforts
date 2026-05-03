/**
 * Trustworthy pace / moving duration from workout rows — shields similarity + sparklines
 * from corrupt computed.overall.duration_s_moving or inconsistent avg_pace_s_per_mi.
 */
import { coerceNumber } from './utils.ts';

function parseComputed(workout: any): any {
  const c = workout?.computed;
  if (c == null) return null;
  try {
    return typeof c === 'string' ? JSON.parse(c) : c;
  } catch {
    return c;
  }
}

function overallBlock(workout: any): Record<string, unknown> | null {
  const comp = parseComputed(workout);
  const o = comp?.overall;
  return o != null && typeof o === 'object' && !Array.isArray(o)
    ? (o as Record<string, unknown>)
    : null;
}

/** Distance in miles; 0 when unknown. */
export function resolveOverallDistanceMi(workout: any): number {
  const overall = overallBlock(workout);
  const m =
    coerceNumber(overall?.distance_m) ??
    coerceNumber(overall?.distance_meters as number | undefined) ??
    coerceNumber(overall?.distanceMeters as number | undefined);
  if (m != null && m > 0) return m / 1609.34;
  const kmOverall = coerceNumber(overall?.distance_km ?? overall?.distanceKm);
  if (kmOverall != null && kmOverall > 0) return kmOverall * 0.621371;
  const km = coerceNumber(workout?.distance);
  return km != null && km > 0 ? km * 0.621371 : 0;
}

/**
 * Minutes of moving time for pace. When computed seconds imply an absurd pace vs distance,
 * falls back to workout.moving_time / duration columns (authoritative for many Garmin rows).
 */
export function resolveMovingDurationMinutes(workout: any): number | null {
  const distMi = resolveOverallDistanceMi(workout);
  const overall = overallBlock(workout);

  const fromSeconds = (sec: number): number => {
    let min = sec / 60;
    if (min > 600 && distMi > 0 && distMi < 50) {
      const corrected = min / 60;
      if (corrected > 0 && corrected < 600) min = corrected;
    }
    return min;
  };

  let fromComputed: number | null = null;
  const durS = coerceNumber(overall?.duration_s_moving ?? overall?.duration_s_elapsed);
  if (durS != null && durS > 0) {
    fromComputed = fromSeconds(durS);
  }

  const columnMinutes = (): number | null => {
    const toMin = (v: number) => (v < 1000 ? v : v / 60);
    const mv = coerceNumber(workout?.moving_time);
    if (mv != null && mv > 0) return toMin(mv);
    const d = coerceNumber(workout?.duration);
    return d != null && d > 0 ? toMin(d) : null;
  };

  const impliedPaceSecPerMi = (min: number): number | null =>
    distMi > 0 && min > 0 ? (min * 60) / distMi : null;

  /** ~4:00/mi … ~45:00/mi — outside is almost always unit/corruption for training runs. */
  const pacePlausible = (p: number | null): boolean =>
    p != null && p >= 240 && p <= 2700;

  const col = columnMinutes();
  const pComp = fromComputed != null ? impliedPaceSecPerMi(fromComputed) : null;
  const pCol = col != null ? impliedPaceSecPerMi(col) : null;

  if (fromComputed != null && pacePlausible(pComp)) {
    return fromComputed;
  }
  if (col != null && col > 0 && col < 720 && pacePlausible(pCol)) {
    return col;
  }
  if (fromComputed != null && fromComputed > 0 && fromComputed < 720) {
    return fromComputed;
  }
  if (col != null && col > 0 && col < 720) {
    return col;
  }
  return null;
}

/**
 * Sec/mi — reconciles stored avg_pace_s_per_mi with distance + trustworthy duration.
 */
export function resolveOverallPaceSecPerMi(workout: any): number | null {
  const distMi = resolveOverallDistanceMi(workout);
  const durMin = resolveMovingDurationMinutes(workout);
  const overall = overallBlock(workout);
  const stored = coerceNumber(overall?.avg_pace_s_per_mi ?? overall?.avg_pace_sec_per_mi);

  let derived: number | null = null;
  if (distMi > 0 && durMin != null && durMin > 0 && durMin < 600) {
    const d = (durMin * 60) / distMi;
    if (d > 0 && d < 7200) derived = d;
  }

  if (derived != null) {
    if (stored == null || !(stored > 0)) return Math.round(derived);
    const ratio = stored / derived;
    if (ratio >= 2.5 || ratio <= 0.4) return Math.round(derived);
    return Math.round(stored);
  }

  return stored != null && stored > 0 ? Math.round(stored) : null;
}
