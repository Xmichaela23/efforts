/**
 * Cycling segment ingestion helpers — design Build Order #6
 * (docs/CYCLING-ANALYSIS-DESIGN.md). Pure; unit-tested without DB.
 *
 * Two sources feed the cycling_segment_history table:
 *  - Strava: workouts.achievements.segment_efforts (already ingested). The
 *    stable Strava segment.id was NOT retained by the original ingest mapping
 *    (only name/distance/times/power/hr), so cross-ride matching fingerprints
 *    on normalized name + distance bucket. segment_id is captured additively
 *    for FUTURE rides (ingest-activity change) and used when present.
 *  - Garmin: no segments in the API (the doc's primary Strava↔Garmin gap), so
 *    synthetic "climb" segments are detected from the computed grade/elevation
 *    series. Climb identity across rides is a COARSE fingerprint (gain/length
 *    bucket) — precise same-climb GPS matching needs lat/lng (not in the
 *    series passed here); documented limitation, deferred.
 */

export type SegmentEffortRecord = {
  source: 'strava' | 'garmin_climb';
  segment_key: string;
  segment_id: string | null;
  segment_name: string | null;
  elapsed_time_s: number | null;
  moving_time_s: number | null;
  distance_m: number | null;
  avg_power_w: number | null;
  avg_hr_bpm: number | null;
  climb_gain_m: number | null;
  climb_vam_m_per_h: number | null;
};

/** Stable cross-ride fingerprint: normalized name + 50 m distance bucket. */
export function segmentKey(name: unknown, distanceM: unknown): string {
  const n = String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  const d = Number(distanceM);
  const bucket = Number.isFinite(d) && d > 0 ? Math.round(d / 50) * 50 : 0;
  return `${n || 'segment'}|${bucket}`;
}

function num(v: unknown): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * Normalize the (JSON-stringified) workouts.achievements column's
 * segment_efforts into effort records. Tolerant of string / object / null.
 */
export function parseStravaSegmentEfforts(achievements: unknown): SegmentEffortRecord[] {
  let a: any = achievements;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {
      return [];
    }
  }
  const arr = a && Array.isArray(a.segment_efforts) ? a.segment_efforts : [];
  const out: SegmentEffortRecord[] = [];
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const name = e.name != null ? String(e.name) : null;
    const dist = num(e.distance);
    // segment.id only present on rides ingested after the additive capture;
    // older rows have none → fingerprint match only.
    const sid = e.segment_id != null
      ? String(e.segment_id)
      : (e.segment && e.segment.id != null ? String(e.segment.id) : null);
    out.push({
      source: 'strava',
      segment_key: segmentKey(name, dist),
      segment_id: sid,
      segment_name: name,
      elapsed_time_s: num(e.elapsed_time),
      moving_time_s: num(e.moving_time),
      distance_m: dist,
      avg_power_w: num(e.average_watts) != null ? Math.round(num(e.average_watts)!) : null,
      avg_hr_bpm: num(e.average_heartrate) != null ? Math.round(num(e.average_heartrate)!) : null,
      climb_gain_m: null,
      climb_vam_m_per_h: null,
    });
  }
  return out;
}

/**
 * Detect discrete climbs from the index-aligned grade/elevation/time series
 * and emit each as a synthetic Garmin segment effort. A climb = a maximal
 * contiguous run of samples at grade >= 3% with net positive elevation.
 * Conservative thresholds match ride-physiology.computeRideVam (>= 30 m gain,
 * >= 120 s) so a ride's Garmin climbs and its aggregate VAM agree. No
 * dip-bridging (a long climb with a flat shelf may split — documented,
 * acceptable; precise climb identity needs GPS, deferred).
 */
export function detectClimbSegments(
  timeS: ReadonlyArray<number>,
  elevationM: ReadonlyArray<number | null>,
  gradePct: ReadonlyArray<number | null>,
): SegmentEffortRecord[] {
  const n = Math.min(timeS.length, elevationM.length, gradePct.length);
  const out: SegmentEffortRecord[] = [];
  let i = 0;
  let climbIdx = 0;
  while (i < n) {
    const g = gradePct[i];
    if (typeof g !== 'number' || g < 3) {
      i++;
      continue;
    }
    // Start a climb run.
    const startI = i;
    let gain = 0;
    while (i < n) {
      const gi = gradePct[i];
      if (typeof gi !== 'number' || gi < 3) break;
      if (i > startI) {
        const e0 = elevationM[i - 1];
        const e1 = elevationM[i];
        if (typeof e0 === 'number' && typeof e1 === 'number' && e1 > e0) gain += e1 - e0;
      }
      i++;
    }
    const endI = i - 1;
    const dur = Math.max(0, (timeS[endI] || 0) - (timeS[startI] || 0));
    if (gain >= 30 && dur >= 120) {
      climbIdx++;
      const grades: number[] = [];
      for (let k = startI; k <= endI; k++) {
        const gk = gradePct[k];
        if (typeof gk === 'number') grades.push(gk);
      }
      const avgGrade = grades.length ? grades.reduce((s, x) => s + x, 0) / grades.length : 0;
      // Approximate run length from gain / avg grade (no distance series here).
      const distM = avgGrade > 0 ? Math.round((gain / (avgGrade / 100))) : null;
      const gainR = Math.round(gain);
      const lenBucket = distM != null ? Math.round(distM / 100) * 100 : 0;
      out.push({
        source: 'garmin_climb',
        segment_key: `climb|${Math.round(gainR / 25) * 25}|${lenBucket}`,
        segment_id: null,
        segment_name: `Climb +${gainR} m`,
        elapsed_time_s: Math.round(dur),
        moving_time_s: Math.round(dur),
        distance_m: distM,
        avg_power_w: null,
        avg_hr_bpm: null,
        climb_gain_m: gainR,
        climb_vam_m_per_h: Math.round((gain / dur) * 3600),
      });
    }
  }
  return out;
}
