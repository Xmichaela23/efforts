// @ts-nocheck
// Supabase Edge Function: ingest-activity
// Purpose: Idempotently upsert a provider activity (Strava or Garmin) into workouts
// Method: POST
// Body: { userId: string, provider: 'strava'|'garmin', activity: any }

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function toIsoDate(dateLike: string | number | Date | null | undefined): string | null {
  try {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch { return null; }
}

function toIso(dateLike: string | number | Date | null | undefined): string | null {
  try {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch { return null; }
}

// Global helper: safely round numeric strings/floats to integers
const roundInt = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

function mapStravaToWorkout(activity: any, userId: string) {
  const start = activity.start_date || activity.start_date_local;
  const durationMin = activity.moving_time != null ? Math.max(0, Math.round(activity.moving_time / 60)) : null;
  const distanceKm = activity.distance != null ? Number(((activity.distance as number) / 1000).toFixed(3)) : null;
  const sport = (activity.sport_type || activity.type || '').toLowerCase();
  const type = sport.includes('run') ? 'run'
    : (sport.includes('ride') || sport.includes('bike')) ? 'ride'
    : sport.includes('swim') ? 'swim'
    : (sport.includes('walk') || sport.includes('hike')) ? 'walk'
    : 'strength';

  // Attempt to compute summary (GAP, cadence) if samples are present
  let computedSummary: any | null = null;
  try { computedSummary = computeComputedFromActivity(activity); } catch {}
  const computedJson = computedSummary ? JSON.stringify(computedSummary) : null;
  const derivedAvgCadence = (() => {
    try { const v = computedSummary?.overall?.avg_cadence_spm; return Number.isFinite(v) ? Math.round(v) : null; } catch { return null; }
  })();
  const derivedMaxCadence = (() => {
    try { const v = computedSummary?.overall?.max_cadence_spm; return Number.isFinite(v) ? Math.round(v) : null; } catch { return null; }
  })();

  return {
    user_id: userId,
    name: activity.name || 'Strava Activity',
    type,
    date: toIsoDate(start),
    timestamp: toIso(activity.start_date || activity.start_date_local || new Date()),
    duration: durationMin,
    moving_time: durationMin,
    elapsed_time: activity.elapsed_time != null ? Math.max(0, Math.round(activity.elapsed_time / 60)) : null,
    distance: distanceKm,
    workout_status: 'completed',
    source: 'strava',
    is_strava_imported: true,
    strava_activity_id: activity.id,
    avg_heart_rate: Number.isFinite(activity.average_heartrate) ? Math.round(activity.average_heartrate) : null,
    max_heart_rate: Number.isFinite(activity.max_heartrate) ? Math.round(activity.max_heartrate) : null,
    avg_speed: activity.average_speed != null ? Number((activity.average_speed * 3.6).toFixed(2)) : null,
    max_speed: activity.max_speed != null ? Number((activity.max_speed * 3.6).toFixed(2)) : null,
    avg_pace: activity.average_speed && activity.average_speed > 0 ? Math.round(1000 / activity.average_speed) : null,
    max_pace: activity.max_speed && activity.max_speed > 0 ? Math.round(1000 / activity.max_speed) : null,
    elevation_gain: Number.isFinite(activity.total_elevation_gain) ? Math.round(activity.total_elevation_gain) : null,
    calories: Number.isFinite(activity.calories) ? Math.round(activity.calories) : null,
    provider_sport: activity.sport_type || activity.type || null,
    // Location
    start_position_lat: Array.isArray(activity.start_latlng) ? (activity.start_latlng[0] ?? null) : null,
    start_position_long: Array.isArray(activity.start_latlng) ? (activity.start_latlng[1] ?? null) : null,
    // Optional JSON fields if provided by caller (e.g., enriched client or webhook)
    gps_track: activity.gps_track ? JSON.stringify(activity.gps_track) : null,
    sensor_data: activity.sensor_data ? JSON.stringify(activity.sensor_data) : null,
    swim_data: activity.swim_data ? JSON.stringify(activity.swim_data) : null,
    laps: activity.laps ? JSON.stringify(activity.laps) : null,
    // Polyline if available
    gps_trackpoints: activity.map?.polyline || activity.map?.summary_polyline || null,
    // Cadence rollups (prefer Strava fields, else derived)
    avg_cadence: Number.isFinite(activity.average_cadence) ? Math.round(activity.average_cadence) : derivedAvgCadence,
    max_cadence: Number.isFinite(activity.max_cadence) ? Math.round(activity.max_cadence) : derivedMaxCadence,
    // Server-computed summary for UI (includes GAP/cadence when available)
    computed: computedJson,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

// Compute executed intervals and overall metrics suitable for UI consumption
function computeComputedFromActivity(activity: any): any | null {
  try {
    const samples: any[] = Array.isArray(activity?.sensor_data?.samples)
      ? activity.sensor_data.samples
      : (Array.isArray(activity?.sensor_data) ? activity.sensor_data : []);

    if (!Array.isArray(samples) || samples.length < 2) {
      return null;
    }

    // Normalize samples → { ts: epoch sec, t: seconds (relative), hr, v (m/s), d (m), elev (m), cad }
    const normalized: Array<{ ts: number; t: number; hr?: number; v?: number; d?: number; elev?: number; cad?: number }> = [];
    for (let i = 0; i < samples.length; i += 1) {
      const s: any = samples[i];
      const ts = Number(
        s.timestamp
        ?? s.startTimeInSeconds
        ?? s.clockDurationInSeconds
        ?? s.timerDurationInSeconds
        ?? s.offsetInSeconds
        ?? i
      );
      const t = Number(
        s.timerDurationInSeconds
        ?? s.clockDurationInSeconds
        ?? s.movingDurationInSeconds
        ?? s.elapsed_s
        ?? s.offsetInSeconds
        ?? s.startTimeInSeconds
        ?? i
      );
      const hr = typeof s.heartRate === 'number' ? s.heartRate : undefined;
      const v = (typeof s.speedMetersPerSecond === 'number' ? s.speedMetersPerSecond : undefined);
      const d = (typeof s.totalDistanceInMeters === 'number' ? s.totalDistanceInMeters
        : (typeof s.distanceInMeters === 'number' ? s.distanceInMeters
        : (typeof s.cumulativeDistanceInMeters === 'number' ? s.cumulativeDistanceInMeters
        : (typeof s.totalDistance === 'number' ? s.totalDistance
        : (typeof s.distance === 'number' ? s.distance : undefined)))));
      const elev = (typeof s.elevationInMeters === 'number')
        ? s.elevationInMeters
        : (typeof s.elevation === 'number'
          ? s.elevation
          : (typeof s.altitude === 'number' ? s.altitude : (typeof s.enhancedElevation === 'number' ? s.enhancedElevation : undefined)));
      const cad = (typeof s.stepsPerMinute === 'number')
        ? s.stepsPerMinute
        : (typeof s.runCadence === 'number'
          ? s.runCadence
          : (typeof s.bikeCadenceInRPM === 'number'
            ? s.bikeCadenceInRPM
            : (typeof s.swimCadenceInStrokesPerMinute === 'number' ? s.swimCadenceInStrokesPerMinute : (typeof s.cadence === 'number' ? s.cadence : undefined))));
      normalized.push({ ts, t: Number.isFinite(t) ? t : i, hr, v, d, elev, cad });
    }

    // Ensure ordered by ts
    normalized.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    // Accumulate distance when provider cumulative is missing, exclude stationary (<0.3 m/s)
    let last = normalized[0];
    let cum = Number.isFinite(last.d as number) ? (last.d as number) : 0;
    normalized[0].d = cum;
    for (let i = 1; i < normalized.length; i += 1) {
      const cur = normalized[i];
      if (typeof cur.d === 'number' && Number.isFinite(cur.d)) {
        // provider distance available → trust it
        cum = cur.d;
      } else {
        const dt = Math.min(60, Math.max(0, (cur.ts || cur.t) - (last.ts || last.t)));
        const v0 = (typeof last.v === 'number' && last.v >= 0.3) ? last.v : null;
        const v1 = (typeof cur.v === 'number' && cur.v >= 0.3) ? cur.v : null;
        if (dt && (v0 != null || v1 != null)) {
          const vAvg = (v0 != null && v1 != null) ? (v0 + v1) / 2 : (v1 != null ? v1 : (v0 as number));
          cum += vAvg * dt;
        }
        cur.d = cum;
      }
      last = cur;
    }

    // Overall metrics (moving-only pace)
    let movingSec = 0;
    for (let i = 1; i < normalized.length; i += 1) {
      const a = normalized[i - 1];
      const b = normalized[i];
      const dt = Math.min(60, Math.max(0, (b.ts || b.t) - (a.ts || a.t)));
      const v0 = (typeof a.v === 'number' && a.v >= 0.3) ? a.v : null;
      const v1 = (typeof b.v === 'number' && b.v >= 0.3) ? b.v : null;
      if (dt && (v0 != null || v1 != null)) movingSec += dt;
    }
    const totalMeters = Math.max(0, (normalized[normalized.length - 1].d || 0) - (normalized[0].d || 0));
    const overallPaceSecPerMi = (movingSec > 0 && totalMeters > 0)
      ? (movingSec) / ((totalMeters / 1000) * 0.621371)
      : null;
    const avgHr = (() => {
      const hrs = normalized.map(s => (typeof s.hr === 'number' ? s.hr : NaN)).filter(Number.isFinite) as number[];
      if (!hrs.length) return null;
      return Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length);
    })();

    // Overall cadence (avg/max)
    const cadStats = (() => {
      const cads = normalized.map(s => (typeof s.cad === 'number' ? s.cad : NaN)).filter(Number.isFinite) as number[];
      if (!cads.length) return { avg: null as number | null, max: null as number | null };
      const avg = Math.round(cads.reduce((a, b) => a + b, 0) / cads.length);
      const max = Math.max(...cads);
      return { avg, max };
    })();

    // GAP overall (grade-adjusted pace)
    const gapPaceSecPerMi = (() => {
      const paceSecPerMiFromMetersSeconds = (meters: number, sec: number): number | null => {
        if (!(meters > 0) || !(sec > 0)) return null;
        const miles = (meters / 1000) * 0.621371;
        return miles > 0 ? sec / miles : null;
      };
      let adjMeters = 0; let timeSec = 0;
      for (let i = 1; i < normalized.length; i += 1) {
        const a = normalized[i - 1];
        const b = normalized[i];
        const dt = Math.min(60, Math.max(0, (b.ts || b.t) - (a.ts || a.t)));
        if (!dt) continue;
        timeSec += dt;
        const v = (typeof b.v === 'number' && b.v > 0.5) ? b.v : (typeof a.v === 'number' && a.v > 0.5 ? a.v : 0);
        if (!v) continue;
        const elevA = typeof a.elev === 'number' ? a.elev : null;
        const elevB = typeof b.elev === 'number' ? b.elev : elevA;
        const dElev = (elevA != null && elevB != null) ? (elevB - elevA) : 0;
        const dMeters = v * dt;
        const grade = dMeters > 0 ? Math.max(-0.10, Math.min(0.10, dElev / dMeters)) : 0;
        const factor = 1 + 9 * grade;
        const adj = dMeters / factor;
        adjMeters += adj;
      }
      return paceSecPerMiFromMetersSeconds(adjMeters, timeSec);
    })();

    // Segment by laps if provided
    const laps: any[] = Array.isArray(activity?.laps) ? activity.laps : [];
    const intervals: any[] = [];
    if (laps.length > 0) {
      for (let i = 0; i < laps.length; i += 1) {
        const startTs = Number(laps[i]?.startTimeInSeconds ?? laps[i]?.start_time ?? NaN);
        const endTs = Number((i + 1 < laps.length ? laps[i + 1]?.startTimeInSeconds : NaN));
        const within = normalized.filter(s => Number.isFinite(startTs) && (s.ts >= startTs) && (Number.isFinite(endTs) ? (s.ts < endTs) : true));
        if (within.length < 2) continue;
        const segMeters = Math.max(0, (within[within.length - 1].d || 0) - (within[0].d || 0));
        let segMoving = 0;
        const segHr: number[] = [];
        for (let j = 1; j < within.length; j += 1) {
          const a = within[j - 1];
          const b = within[j];
          const dt = Math.min(60, Math.max(0, (b.ts || b.t) - (a.ts || a.t)));
          const v0 = (typeof a.v === 'number' && a.v >= 0.3) ? a.v : null;
          const v1 = (typeof b.v === 'number' && b.v >= 0.3) ? b.v : null;
          if (dt && (v0 != null || v1 != null)) segMoving += dt;
          if (typeof b.hr === 'number') segHr.push(b.hr);
        }
        const segPaceSecPerMi = (segMoving > 0 && segMeters > 0)
          ? (segMoving) / ((segMeters / 1000) * 0.621371)
          : null;
        const segAvgHr = segHr.length ? Math.round(segHr.reduce((a, b) => a + b, 0) / segHr.length) : null;
        intervals.push({
          planned_step_id: null,
          kind: 'lap',
          executed: {
            duration_s: Math.round(segMoving),
            distance_m: Math.round(segMeters),
            avg_pace_s_per_mi: segPaceSecPerMi != null ? Math.round(segPaceSecPerMi) : null,
            avg_hr: segAvgHr,
          },
        });
      }
    }

    const computed = {
      intervals,
      overall: {
        duration_s_moving: Math.round(movingSec),
        distance_m: Math.round(totalMeters),
        avg_pace_s_per_mi: overallPaceSecPerMi != null ? Math.round(overallPaceSecPerMi) : null,
        gap_pace_s_per_mi: gapPaceSecPerMi != null ? Math.round(gapPaceSecPerMi) : null,
        avg_hr: avgHr,
        avg_cadence_spm: cadStats.avg,
        max_cadence_spm: cadStats.max,
      },
    };
    return computed;
  } catch {
    return null;
  }
}

function mapGarminToWorkout(activity: any, userId: string) {
  const startIso = activity.start_time || (activity.summary?.startTimeInSeconds ? new Date(activity.summary.startTimeInSeconds * 1000).toISOString() : null);
  const dateIso = startIso ? startIso.split('T')[0] : null;
  const typeKey = (activity.activity_type || activity.summary?.activityType?.typeKey || '').toLowerCase();
  const type = typeKey.includes('run') ? 'run'
    : (typeKey.includes('bike') || typeKey.includes('bik') || typeKey.includes('cycl') || typeKey.includes('ride')) ? 'ride'
    : typeKey.includes('swim') ? 'swim'
    : typeKey.includes('walk') ? 'walk'
    : 'strength';

  return {
    user_id: userId,
    name: activity.activity_name || activity.activity_type || `Garmin ${type}`,
    type,
    date: dateIso,
    timestamp: startIso,
    duration: activity.duration_seconds != null ? Math.max(0, Math.round(activity.duration_seconds / 60)) : null,
    moving_time: activity.duration_seconds != null ? Math.max(0, Math.round(activity.duration_seconds / 60)) : null,
    elapsed_time: activity.duration_seconds != null ? Math.max(0, Math.round(activity.duration_seconds / 60)) : null,
    distance: activity.distance_meters != null ? Number((activity.distance_meters / 1000).toFixed(3)) : null,
    workout_status: 'completed',
    source: 'garmin',
    garmin_activity_id: String(activity.garmin_activity_id || activity.summaryId || activity.activityId || ''),
    avg_heart_rate: Number.isFinite(activity.avg_heart_rate) ? Math.round(activity.avg_heart_rate) : null,
    max_heart_rate: Number.isFinite(activity.max_heart_rate) ? Math.round(activity.max_heart_rate) : null,
    avg_speed: activity.avg_speed_mps != null ? Number((activity.avg_speed_mps * 3.6).toFixed(2)) : null,
    max_speed: activity.max_speed_mps != null ? Number((activity.max_speed_mps * 3.6).toFixed(2)) : null,
    elevation_gain: Number.isFinite(activity.elevation_gain_meters) ? Math.round(activity.elevation_gain_meters) : null,
    calories: Number.isFinite(activity.calories) ? Math.round(activity.calories) : null,
    provider_sport: activity.activity_type || null,
    // Additional common metrics if provided
    avg_power: Number.isFinite(activity.average_watts) ? Math.round(activity.average_watts) : (Number.isFinite(activity.avg_power) ? Math.round(activity.avg_power) : null),
    max_power: Number.isFinite(activity.max_watts) ? Math.round(activity.max_watts) : (Number.isFinite(activity.max_power) ? Math.round(activity.max_power) : null),
    avg_cadence: (() => {
      const v = activity.avg_swim_cadence ?? activity.avg_running_cadence ?? activity.avg_run_cadence ?? activity.avg_bike_cadence;
      return roundInt(v);
    })(),
    max_cadence: (() => {
      const v = activity.max_running_cadence ?? activity.max_run_cadence ?? activity.max_bike_cadence;
      return roundInt(v);
    })(),
    strokes: Number.isFinite(activity.strokes) ? activity.strokes : null,
    pool_length: Number.isFinite(activity.pool_length) ? activity.pool_length : null,
    number_of_active_lengths: Number.isFinite(activity.number_of_active_lengths) ? activity.number_of_active_lengths : null,
    tss: activity.training_stress_score ?? null,
    intensity_factor: activity.intensity_factor ?? null,
    normalized_power: Number.isFinite(activity.normalized_power) ? Math.round(activity.normalized_power) : null,
    avg_temperature: Number.isFinite(activity.avg_temperature) ? activity.avg_temperature : null,
    max_temperature: Number.isFinite(activity.max_temperature) ? activity.max_temperature : null,
    steps: roundInt(activity.steps),
    hrv: Number.isFinite(activity.hrv) ? Math.round(activity.hrv) : (Number.isFinite(activity.heart_rate_variability) ? Math.round(activity.heart_rate_variability) : null),
    // Multisport linkage (omit columns not present in workouts schema)
    // Location (prefer explicit, fallback to first gps_track point)
    start_position_lat: (activity.starting_latitude ?? (Array.isArray(activity.gps_track) ? (activity.gps_track[0]?.lat ?? activity.gps_track[0]?.latitude ?? activity.gps_track[0]?.latitudeInDegree ?? null) : null)) ?? null,
    start_position_long: (activity.starting_longitude ?? (Array.isArray(activity.gps_track) ? (activity.gps_track[0]?.lng ?? activity.gps_track[0]?.longitude ?? activity.gps_track[0]?.longitudeInDegree ?? null) : null)) ?? null,
    // Heavy JSON fields stored directly on workouts
    gps_track: activity.gps_track ? JSON.stringify(activity.gps_track) : null,
    sensor_data: activity.sensor_data ? JSON.stringify(activity.sensor_data) : null,
    swim_data: activity.swim_data ? JSON.stringify(activity.swim_data) : null,
    laps: activity.laps ? JSON.stringify(activity.laps) : null,
    // Server-computed summary for UI (intervals + overall)
    computed: (() => {
      try {
        const c = computeComputedFromActivity(activity);
        return c ? JSON.stringify(c) : null;
      } catch { return null; }
    })(),
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const { userId, provider, activity } = await req.json();
    if (!userId || !provider || !activity) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    let row: any;
    let onConflict: string | undefined;
    if (provider === 'strava') {
      row = mapStravaToWorkout(activity, userId);
      onConflict = 'user_id,strava_activity_id';
    } else if (provider === 'garmin') {
      row = mapGarminToWorkout(activity, userId);
      onConflict = 'user_id,garmin_activity_id';
    } else {
      return new Response(JSON.stringify({ error: 'Unsupported provider' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Idempotent upsert by provider-specific unique index
    const { error } = await supabase
      .from('workouts')
      .upsert(row, { onConflict });
    if (error) {
      return new Response(JSON.stringify({ success: false, error }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Fire-and-forget: auto-attach to planned and compute summary for zero-touch UX
    try {
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/auto-attach-planned`;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
      const { data: justUpserted } = await supabase
        .from('workouts')
        .select('id')
        .eq('user_id', row.user_id)
        .eq(onConflict!.includes('garmin') ? 'garmin_activity_id' : 'strava_activity_id', onConflict!.includes('garmin') ? row.garmin_activity_id : row.strava_activity_id)
        .maybeSingle();
      const wid = justUpserted?.id;
      if (wid) {
        await fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key }, body: JSON.stringify({ workout_id: wid }) });
      }
    } catch {}

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: `${err}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});


