// @ts-nocheck
// Supabase Edge Function: ingest-activity
// Purpose: Idempotently upsert a provider activity (Strava or Garmin) into workouts
// Method: POST
// Body: { userId: string, provider: 'strava'|'garmin', activity: any }
import { createClient } from 'jsr:@supabase/supabase-js@2';
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY'));
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
function toIsoDate(dateLike) {
  try {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch  {
    return null;
  }
}
function toIso(dateLike) {
  try {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch  {
    return null;
  }
}
// Global helper: safely round numeric strings/floats to integers
const roundInt = (v)=>{
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};
// --- Garmin local date + UTC timestamp resolver ---
function garminLocalDateAndTimestamp(a) {
  const sIn = Number(a?.summary?.startTimeInSeconds ?? a?.start_time_in_seconds);
  const sOff = Number(a?.summary?.startTimeOffsetInSeconds ?? a?.start_time_offset_seconds);
  const sLoc = Number(a?.summary?.localStartTimeInSeconds ?? a?.local_start_time_in_seconds);
  const localStr = a?.summary?.startTimeLocal ?? a?.start_time_local;
  const utcStr = a?.summary?.startTimeGmt ?? a?.summary?.startTimeGMT ?? a?.start_time;
  const localMs = Number.isFinite(sLoc) ? sLoc * 1000 : Number.isFinite(sIn) && Number.isFinite(sOff) ? (sIn + sOff) * 1000 : typeof localStr === 'string' ? Date.parse(String(localStr).replace(' ', 'T')) : NaN;
  // Build YYYY-MM-DD from the localized epoch value without reapplying timezone
  const ymdFromMs = (t)=>{
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  const date = Number.isFinite(localMs) ? ymdFromMs(localMs) : typeof localStr === 'string' && localStr.includes('T') ? String(localStr).split('T')[0] : typeof utcStr === 'string' && utcStr.includes('T') ? String(utcStr).split('T')[0] : null;
  const timestamp = Number.isFinite(sIn) ? new Date(sIn * 1000).toISOString() : typeof utcStr === 'string' ? new Date(utcStr).toISOString() : new Date().toISOString();
  return {
    date,
    timestamp
  };
}
function mapStravaToWorkout(activity, userId) {
  const start = activity.start_date || activity.start_date_local;
  const durationMin = activity.moving_time != null ? Math.max(0, Math.round(activity.moving_time / 60)) : null;
  const distanceKm = activity.distance != null ? Number((activity.distance / 1000).toFixed(3)) : null;
  const sport = (activity.sport_type || activity.type || '').toLowerCase();
  const type = sport.includes('run') ? 'run' : sport.includes('ride') || sport.includes('bike') ? 'ride' : sport.includes('swim') ? 'swim' : sport.includes('walk') || sport.includes('hike') ? 'walk' : 'strength';
  // Attempt to compute summary (GAP, cadence) if samples are present
  let computedSummary = null;
  try {
    computedSummary = computeComputedFromActivity(activity);
  } catch  {}
  const computedJson = computedSummary ? JSON.stringify(computedSummary) : null;
  const derivedAvgCadence = (()=>{
    try {
      const v = computedSummary?.overall?.avg_cadence_spm;
      return Number.isFinite(v) ? Math.round(v) : null;
    } catch  {
      return null;
    }
  })();
  const derivedMaxCadence = (()=>{
    try {
      const v = computedSummary?.overall?.max_cadence_spm;
      return Number.isFinite(v) ? Math.round(v) : null;
    } catch  {
      return null;
    }
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
    start_position_lat: Array.isArray(activity.start_latlng) ? activity.start_latlng[0] ?? null : null,
    start_position_long: Array.isArray(activity.start_latlng) ? activity.start_latlng[1] ?? null : null,
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
    created_at: new Date().toISOString()
  };
}
// ---- GAP helper (smoothed elev, moving-only, Minetti) ----
function computeGAPSecPerMi(normalized) {
  if (!normalized?.length) return null;
  // EMA smoothing for elevation (~10–15s at 1Hz)
  let ema = null;
  const alpha = 0.1;
  const elevSm = new Array(normalized.length);
  for(let i = 0; i < normalized.length; i++){
    const e = typeof normalized[i].elev === 'number' && Number.isFinite(normalized[i].elev) ? normalized[i].elev : ema;
    ema = e == null ? ema : ema == null ? e : alpha * e + (1 - alpha) * ema;
    elevSm[i] = ema ?? 0;
  }
  // Minetti energy cost (J/kg/m), clamp grade to ±30%
  const minetti = (g)=>{
    const x = Math.max(-0.30, Math.min(0.30, g));
    return (((155.4 * x - 30.4) * x - 43.3) * x + 46.3) * x * x + 19.5 * x + 3.6;
  };
  let eqMeters = 0, moveSec = 0;
  for(let i = 1; i < normalized.length; i++){
    const a = normalized[i - 1], b = normalized[i];
    const dt = Math.min(60, Math.max(0, Number(b.ts ?? b.t) - Number(a.ts ?? a.t)));
    if (!dt) continue;
    // speed: prefer direct v; else fallback to distance delta
    let v = Number.isFinite(b.v) ? b.v : NaN;
    if (!Number.isFinite(v) && Number.isFinite(a.d) && Number.isFinite(b.d)) {
      const dd = b.d - a.d;
      v = dd > 0 ? dd / dt : NaN;
    }
    if (!Number.isFinite(v) || v < 0.5) continue; // moving-only
    moveSec += dt;
    const de = elevSm[i] - elevSm[i - 1] || 0;
    const dd = v * dt;
    const g = dd > 0 ? de / dd : 0;
    // Equivalent flat speed using Minetti cost ratio
    const v_eq = v * (minetti(g) / 3.6); // 3.6 = flat cost C(0)
    eqMeters += v_eq * dt;
  }
  if (!(eqMeters > 0) || !(moveSec > 0)) return null;
  const miles = eqMeters / 1609.344;
  return miles > 0 ? Math.round(moveSec / miles) : null; // sec/mi
}
// Compute executed intervals and overall metrics suitable for UI consumption
function computeComputedFromActivity(activity) {
  try {
    const samples = Array.isArray(activity?.sensor_data?.samples) ? activity.sensor_data.samples : Array.isArray(activity?.sensor_data) ? activity.sensor_data : [];
    if (!Array.isArray(samples) || samples.length < 2) {
      return null;
    }
    // Normalize samples → { ts: epoch sec, t: seconds (relative), hr, v (m/s), d (m), elev (m), cad }
    const normalized = [];
    for(let i = 0; i < samples.length; i += 1){
      const s = samples[i];
      const ts = Number(s.timestamp ?? s.startTimeInSeconds ?? s.clockDurationInSeconds ?? s.timerDurationInSeconds ?? s.offsetInSeconds ?? i);
      const t = Number(s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.movingDurationInSeconds ?? s.elapsed_s ?? s.offsetInSeconds ?? s.startTimeInSeconds ?? i);
      const hr = typeof s.heartRate === 'number' ? s.heartRate : undefined;
      const v = typeof s.speedMetersPerSecond === 'number' ? s.speedMetersPerSecond : undefined;
      const d = typeof s.totalDistanceInMeters === 'number' ? s.totalDistanceInMeters : typeof s.distanceInMeters === 'number' ? s.distanceInMeters : typeof s.cumulativeDistanceInMeters === 'number' ? s.cumulativeDistanceInMeters : typeof s.totalDistance === 'number' ? s.totalDistance : typeof s.distance === 'number' ? s.distance : undefined;
      const elev = typeof s.elevationInMeters === 'number' ? s.elevationInMeters : typeof s.elevation === 'number' ? s.elevation : typeof s.altitude === 'number' ? s.altitude : typeof s.enhancedElevation === 'number' ? s.enhancedElevation : undefined;
      const cad = typeof s.stepsPerMinute === 'number' ? s.stepsPerMinute : typeof s.runCadence === 'number' ? s.runCadence : typeof s.bikeCadenceInRPM === 'number' ? s.bikeCadenceInRPM : typeof s.swimCadenceInStrokesPerMinute === 'number' ? s.swimCadenceInStrokesPerMinute : typeof s.cadence === 'number' ? s.cadence : undefined;
      normalized.push({
        ts,
        t: Number.isFinite(t) ? t : i,
        hr,
        v,
        d,
        elev,
        cad
      });
    }
    // Ensure ordered by ts
    normalized.sort((a, b)=>(a.ts || 0) - (b.ts || 0));
    // Accumulate distance when provider cumulative is missing, exclude stationary (<0.3 m/s)
    let last = normalized[0];
    let cum = Number.isFinite(last.d) ? last.d : 0;
    normalized[0].d = cum;
    for(let i = 1; i < normalized.length; i += 1){
      const cur = normalized[i];
      if (typeof cur.d === 'number' && Number.isFinite(cur.d)) {
        // provider distance available → trust it
        cum = cur.d;
      } else {
        const dt = Math.min(60, Math.max(0, (cur.ts || cur.t) - (last.ts || last.t)));
        const v0 = typeof last.v === 'number' && last.v >= 0.3 ? last.v : null;
        const v1 = typeof cur.v === 'number' && cur.v >= 0.3 ? cur.v : null;
        if (dt && (v0 != null || v1 != null)) {
          const vAvg = v0 != null && v1 != null ? (v0 + v1) / 2 : v1 != null ? v1 : v0;
          cum += vAvg * dt;
        }
        cur.d = cum;
      }
      last = cur;
    }
    // Overall metrics (moving-only pace)
    let movingSec = 0;
    for(let i = 1; i < normalized.length; i += 1){
      const a = normalized[i - 1];
      const b = normalized[i];
      const dt = Math.min(60, Math.max(0, (b.ts || b.t) - (a.ts || a.t)));
      const v0 = typeof a.v === 'number' && a.v >= 0.3 ? a.v : null;
      const v1 = typeof b.v === 'number' && b.v >= 0.3 ? b.v : null;
      if (dt && (v0 != null || v1 != null)) movingSec += dt;
    }
    let totalMeters = Math.max(0, (normalized[normalized.length - 1].d || 0) - (normalized[0].d || 0));
    // Fallbacks when swim samples are present but values are null (common for pool swims)
    if (!(movingSec > 0)) {
      // 1) Explicit moving fields from Garmin summary
      const moveFields = Number(activity?.summary?.timerDurationInSeconds ?? activity?.summary?.movingDurationInSeconds);
      if (Number.isFinite(moveFields) && moveFields > 0) movingSec = Math.round(moveFields);
    }
    if (!(totalMeters > 0)) {
      const dFallback = Number(activity?.summary?.totalDistanceInMeters ?? activity?.summary?.distanceInMeters ?? activity?.distance_meters);
      if (Number.isFinite(dFallback) && dFallback > 0) totalMeters = Math.round(dFallback);
    }
    // Derive moving seconds from Garmin average pace/speed when moving fields are missing
    if (!(movingSec > 0)) {
      const avgPaceMinPerKm = Number(activity?.summary?.averagePaceInMinutesPerKilometer);
      if (Number.isFinite(avgPaceMinPerKm) && avgPaceMinPerKm > 0 && totalMeters > 0) {
        movingSec = Math.round(totalMeters / 1000 * avgPaceMinPerKm * 60);
      }
    }
    if (!(movingSec > 0)) {
      const avgSpeedMps = Number(activity?.summary?.averageSpeedInMetersPerSecond);
      if (Number.isFinite(avgSpeedMps) && avgSpeedMps > 0 && totalMeters > 0) {
        movingSec = Math.round(totalMeters / avgSpeedMps);
      }
    }
    // Last resort: durationInSeconds or provider duration
    if (!(movingSec > 0)) {
      const durationFallback = Number(activity?.summary?.durationInSeconds ?? activity?.duration_seconds);
      if (Number.isFinite(durationFallback) && durationFallback > 0) movingSec = Math.round(durationFallback);
    }
    const overallPaceSecPerMi = movingSec > 0 && totalMeters > 0 ? movingSec / (totalMeters / 1000 * 0.621371) : null;
    const avgHr = (()=>{
      const hrs = normalized.map((s)=>typeof s.hr === 'number' ? s.hr : NaN).filter(Number.isFinite);
      if (!hrs.length) return null;
      return Math.round(hrs.reduce((a, b)=>a + b, 0) / hrs.length);
    })();
    // Overall cadence (avg/max)
    const cadStats = (()=>{
      const cads = normalized.map((s)=>typeof s.cad === 'number' ? s.cad : NaN).filter(Number.isFinite);
      if (!cads.length) return {
        avg: null,
        max: null
      };
      const avg = Math.round(cads.reduce((a, b)=>a + b, 0) / cads.length);
      const max = Math.max(...cads);
      return {
        avg,
        max
      };
    })();
    // GAP overall (grade-adjusted pace) — Minetti, moving-only, smoothed elevation
    const gapPaceSecPerMi = computeGAPSecPerMi(normalized);
    // Segment by laps if provided
    const laps = Array.isArray(activity?.laps) ? activity.laps : [];
    const intervals = [];
    if (laps.length > 0) {
      for(let i = 0; i < laps.length; i += 1){
        const startTs = Number(laps[i]?.startTimeInSeconds ?? laps[i]?.start_time ?? NaN);
        const endTs = Number(i + 1 < laps.length ? laps[i + 1]?.startTimeInSeconds : NaN);
        const within = normalized.filter((s)=>Number.isFinite(startTs) && s.ts >= startTs && (Number.isFinite(endTs) ? s.ts < endTs : true));
        if (within.length < 2) continue;
        const segMeters = Math.max(0, (within[within.length - 1].d || 0) - (within[0].d || 0));
        let segMoving = 0;
        const segHr = [];
        for(let j = 1; j < within.length; j += 1){
          const a = within[j - 1];
          const b = within[j];
          const dt = Math.min(60, Math.max(0, (b.ts || b.t) - (a.ts || a.t)));
          const v0 = typeof a.v === 'number' && a.v >= 0.3 ? a.v : null;
          const v1 = typeof b.v === 'number' && b.v >= 0.3 ? b.v : null;
          if (dt && (v0 != null || v1 != null)) segMoving += dt;
          if (typeof b.hr === 'number') segHr.push(b.hr);
        }
        const segPaceSecPerMi = segMoving > 0 && segMeters > 0 ? segMoving / (segMeters / 1000 * 0.621371) : null;
        const segAvgHr = segHr.length ? Math.round(segHr.reduce((a, b)=>a + b, 0) / segHr.length) : null;
        intervals.push({
          planned_step_id: null,
          kind: 'lap',
          executed: {
            duration_s: Math.round(segMoving),
            distance_m: Math.round(segMeters),
            avg_pace_s_per_mi: segPaceSecPerMi != null ? Math.round(segPaceSecPerMi) : null,
            avg_hr: segAvgHr
          }
        });
      }
    }
    // Build 100m splits from cumulative distance (meters)
    const splits100 = (()=>{
      try {
        const rows = [];
        let nextThreshold = 100; // meters
        let lastT = normalized[0]?.t || 0;
        let n = 1;
        for(let i = 1; i < normalized.length; i += 1){
          const dNow = Number(normalized[i].d || 0);
          const tNow = Number(normalized[i].t || i);
          if (dNow >= nextThreshold) {
            const dur = Math.max(1, Math.round(tNow - lastT));
            rows.push({
              n,
              duration_s: dur
            });
            n += 1;
            lastT = tNow;
            nextThreshold += 100;
          }
        }
        return rows.length ? {
          unit: 'm',
          rows
        } : null;
      } catch  {
        return null;
      }
    })();
    const computed = {
      intervals,
      overall: {
        duration_s_moving: Math.round(movingSec),
        distance_m: Math.round(totalMeters),
        avg_pace_s_per_mi: overallPaceSecPerMi != null ? Math.round(overallPaceSecPerMi) : null,
        gap_pace_s_per_mi: gapPaceSecPerMi != null ? Math.round(gapPaceSecPerMi) : null,
        avg_hr: avgHr,
        avg_cadence_spm: cadStats.avg,
        max_cadence_spm: cadStats.max
      },
      analysis: {
        events: {
          splits_100: splits100
        }
      }
    };
    return computed;
  } catch  {
    return null;
  }
}
async function mapGarminToWorkout(activity, userId) {
  const { date, timestamp } = garminLocalDateAndTimestamp(activity);
  const typeKey = (activity.activity_type || activity.summary?.activityType?.typeKey || '').toLowerCase();
  const type = typeKey.includes('run') ? 'run' : typeKey.includes('bike') || typeKey.includes('bik') || typeKey.includes('cycl') || typeKey.includes('ride') ? 'ride' : typeKey.includes('swim') ? 'swim' : typeKey.includes('walk') ? 'walk' : 'strength';
  // Load rich power/cadence data from garmin_activities table
  let enrichedData = {};
  try {
    const garminActivityId = activity.garmin_activity_id || activity.summaryId || activity.activityId;
    if (garminActivityId) {
      const { data: gaData } = await supabase.from('garmin_activities').select('avg_power, max_power, avg_bike_cadence, max_bike_cadence, avg_run_cadence, max_run_cadence, sensor_data, raw_data').eq('user_id', userId).eq('garmin_activity_id', garminActivityId).maybeSingle();
      if (gaData) {
        enrichedData = {
          avg_power: gaData.avg_power,
          max_power: gaData.max_power,
          avg_bike_cadence: gaData.avg_bike_cadence,
          max_bike_cadence: gaData.max_bike_cadence,
          avg_run_cadence: gaData.avg_run_cadence,
          max_run_cadence: gaData.max_run_cadence,
          sensor_data: gaData.sensor_data,
          raw_data: gaData.raw_data
        };
        console.log(`🔋 Enriched Garmin data for ${garminActivityId}: Power=${gaData.avg_power}W, Cadence=${gaData.avg_bike_cadence || gaData.avg_run_cadence}`);
      }
    }
  } catch (error) {
    console.log('⚠️ Could not load enriched Garmin data:', error);
  }
  // Build a compute input that merges webhook activity + enriched sensor_data + raw summary
  const computeInput = (()=>{
    const summary = enrichedData?.raw_data?.summary || activity?.summary || {};
    const merged = {
      ...activity,
      sensor_data: enrichedData?.sensor_data || activity.sensor_data || null,
      summary,
      // Normalize common top-level fields for compute fallbacks
      distance_meters: activity.distance_meters ?? summary?.distanceInMeters ?? summary?.totalDistanceInMeters ?? null,
      duration_seconds: activity.duration_seconds ?? summary?.durationInSeconds ?? summary?.timerDurationInSeconds ?? summary?.movingDurationInSeconds ?? null
    };
    // Derive refined swim type
    try {
      const typeKey = String(summary?.activityType || activity?.activity_type || '').toUpperCase();
      if (typeKey.includes('LAP')) merged.refined_type = 'pool_swim';
      else if (typeKey.includes('OPEN')) merged.refined_type = 'open_water_swim';
    } catch  {}
    // Expose pool length to downstream
    if (summary?.poolLengthInMeters != null) merged.pool_length = Number(summary.poolLengthInMeters);
    return merged;
  })();
  return {
    user_id: userId,
    name: activity.activity_name || activity.activity_type || `Garmin ${type}`,
    type,
    refined_type: computeInput?.refined_type || null,
    date: date,
    timestamp: timestamp,
    duration: activity.duration_seconds != null ? Math.max(0, Math.round(activity.duration_seconds / 60)) : null,
    moving_time: activity.duration_seconds != null ? Math.max(0, Math.round(activity.duration_seconds / 60)) : null,
    elapsed_time: activity.duration_seconds != null ? Math.max(0, Math.round(activity.duration_seconds / 60)) : null,
    distance: activity.distance_meters != null ? Number((activity.distance_meters / 1000).toFixed(3)) : null,
    workout_status: 'completed',
    source: 'garmin',
    garmin_activity_id: String(activity.garmin_activity_id || activity.summaryId || activity.activityId || ''),
    avg_heart_rate: Number.isFinite(activity.avg_heart_rate) ? Math.round(activity.avg_heart_rate) : Number.isFinite(computeInput?.summary?.averageHeartRateInBeatsPerMinute) ? Math.round(computeInput.summary.averageHeartRateInBeatsPerMinute) : null,
    max_heart_rate: Number.isFinite(activity.max_heart_rate) ? Math.round(activity.max_heart_rate) : null,
    avg_speed: activity.avg_speed_mps != null ? Number((activity.avg_speed_mps * 3.6).toFixed(2)) : null,
    max_speed: activity.max_speed_mps != null ? Number((activity.max_speed_mps * 3.6).toFixed(2)) : null,
    elevation_gain: Number.isFinite(activity.elevation_gain_meters) ? Math.round(activity.elevation_gain_meters) : null,
    calories: Number.isFinite(activity.calories) ? Math.round(activity.calories) : null,
    provider_sport: activity.activity_type || null,
    // Additional common metrics if provided - prioritize enriched data from garmin_activities
    avg_power: Number.isFinite(enrichedData.avg_power) ? Math.round(enrichedData.avg_power) : Number.isFinite(activity.average_watts) ? Math.round(activity.average_watts) : Number.isFinite(activity.avg_power) ? Math.round(activity.avg_power) : null,
    max_power: Number.isFinite(enrichedData.max_power) ? Math.round(enrichedData.max_power) : Number.isFinite(activity.max_watts) ? Math.round(activity.max_watts) : Number.isFinite(activity.max_power) ? Math.round(activity.max_power) : null,
    avg_cadence: (()=>{
      // Prioritize enriched data, then fall back to activity data
      const enriched = enrichedData.avg_bike_cadence ?? enrichedData.avg_run_cadence;
      const actCad = activity.avg_swim_cadence ?? activity.avg_running_cadence ?? activity.avg_run_cadence ?? activity.avg_bike_cadence;
      const v = enriched ?? actCad;
      return roundInt(v);
    })(),
    // Swim-specific average stroke rate (spm)
    avg_swim_cadence: (()=>{
      const direct = activity.avg_swim_cadence;
      if (Number.isFinite(direct)) return Math.round(Number(direct));
      const fromSummary = computeInput?.summary?.averageSwimCadenceInStrokesPerMinute;
      if (Number.isFinite(fromSummary)) return Math.round(Number(fromSummary));
      return null;
    })(),
    max_cadence: (()=>{
      // Prioritize enriched data, then fall back to activity data
      const enriched = enrichedData.max_bike_cadence ?? enrichedData.max_run_cadence;
      const actMaxCad = activity.max_running_cadence ?? activity.max_run_cadence ?? activity.max_bike_cadence;
      const v = enriched ?? actMaxCad;
      return roundInt(v);
    })(),
    strokes: Number.isFinite(activity.strokes) ? activity.strokes : Number.isFinite(computeInput?.summary?.totalNumberOfStrokes) ? Number(computeInput.summary.totalNumberOfStrokes) : null,
    pool_length: (()=>{
      const explicit = Number(activity.pool_length);
      if (Number.isFinite(explicit) && explicit > 0) return explicit;
      const fromSummary = Number(computeInput?.summary?.poolLengthInMeters);
      if (Number.isFinite(fromSummary) && fromSummary > 0) return fromSummary;
      // Infer from distance and lengths if both exist (e.g., 750m / 15 = 50m)
      const dist = Number(computeInput?.distance_meters ?? computeInput?.summary?.distanceInMeters ?? null);
      const n = Number(computeInput?.summary?.numberOfActiveLengths ?? activity?.number_of_active_lengths ?? null);
      if (Number.isFinite(dist) && dist > 0 && Number.isFinite(n) && n > 0) return Math.round(dist / n * 100) / 100;
      return null;
    })(),
    number_of_active_lengths: Number.isFinite(activity.number_of_active_lengths) ? activity.number_of_active_lengths : Number.isFinite(computeInput?.summary?.numberOfActiveLengths) ? Number(computeInput.summary.numberOfActiveLengths) : null,
    tss: activity.training_stress_score ?? null,
    intensity_factor: activity.intensity_factor ?? null,
    normalized_power: Number.isFinite(activity.normalized_power) ? Math.round(activity.normalized_power) : null,
    avg_temperature: Number.isFinite(activity.avg_temperature) ? activity.avg_temperature : null,
    max_temperature: Number.isFinite(activity.max_temperature) ? activity.max_temperature : null,
    steps: roundInt(activity.steps),
    hrv: Number.isFinite(activity.hrv) ? Math.round(activity.hrv) : Number.isFinite(activity.heart_rate_variability) ? Math.round(activity.heart_rate_variability) : null,
    // Multisport linkage (omit columns not present in workouts schema)
    // Location (prefer explicit, fallback to first gps_track point)
    start_position_lat: activity.starting_latitude ?? (Array.isArray(activity.gps_track) ? activity.gps_track[0]?.lat ?? activity.gps_track[0]?.latitude ?? activity.gps_track[0]?.latitudeInDegree ?? null : null) ?? null,
    start_position_long: activity.starting_longitude ?? (Array.isArray(activity.gps_track) ? activity.gps_track[0]?.lng ?? activity.gps_track[0]?.longitude ?? activity.gps_track[0]?.longitudeInDegree ?? null : null) ?? null,
    // Heavy JSON fields stored directly on workouts - prioritize enriched sensor data
    gps_track: activity.gps_track ? JSON.stringify(activity.gps_track) : null,
    sensor_data: enrichedData.sensor_data ? JSON.stringify(enrichedData.sensor_data) : activity.sensor_data ? JSON.stringify(activity.sensor_data) : null,
    // If details provided normalized lengths/laps, persist them
    swim_data: (()=>{
      try {
        return computeInput?.swim_data?.lengths ? JSON.stringify({
          lengths: computeInput.swim_data.lengths
        }) : activity.swim_data ? JSON.stringify(activity.swim_data) : null;
      } catch  {
        return activity.swim_data ? JSON.stringify(activity.swim_data) : null;
      }
    })(),
    laps: (()=>{
      try {
        return computeInput?.laps ? JSON.stringify(computeInput.laps) : activity.laps ? JSON.stringify(activity.laps) : null;
      } catch  {
        return activity.laps ? JSON.stringify(activity.laps) : null;
      }
    })(),
    // Server-computed summary for UI (intervals + overall)
    computed: (()=>{
      try {
        const c = computeComputedFromActivity(computeInput);
        // If lengths exist, add splits_100 from lengths
        try {
          const lengths = computeInput?.swim_data?.lengths || [];
          if (Array.isArray(lengths) && lengths.length > 0) {
            const L = Number(activity.pool_length || computeInput?.pool_length || computeInput?.pool_length_m || 25);
            const isYd = Math.abs(L - 22.86) <= 0.6;
            let acc = 0, next = isYd ? 91.44 : 100; // 100yd or 100m
            const rows = [];
            let n = 1;
            for (const len of lengths){
              acc += Number(len?.distance_m ?? 0);
              if (acc >= next && Number(len?.duration_s) > 0) {
                rows.push({
                  n,
                  duration_s: Math.round(Number(len.duration_s))
                });
                n += 1;
                next += isYd ? 91.44 : 100;
              }
            }
            if (rows.length) {
              c.analysis = c.analysis || {
                events: {}
              };
              c.analysis.events = c.analysis.events || {};
              c.analysis.events.splits_100 = {
                unit: isYd ? 'yd' : 'm',
                rows
              };
            }
          }
        } catch  {}
        return c ? JSON.stringify(c) : null;
      } catch  {
        return null;
      }
    })(),
    // Embed training effect in computed.metrics-lite area for UI pickup
    metrics: (()=>{
      try {
        // Prefer normalized keys first; fall back to legacy and provider-style names
        const aerobic = activity.aerobic_training_effect ?? activity.total_training_effect ?? activity.aerobicTrainingEffect ?? null;
        const anaerobic = activity.anaerobic_training_effect ?? activity.total_anaerobic_effect ?? activity.anaerobicTrainingEffect ?? null;
        if (aerobic == null && anaerobic == null) return null;
        // Write both normalized and legacy keys for backward compatibility
        return JSON.stringify({
          aerobic_training_effect: aerobic ?? null,
          anaerobic_training_effect: anaerobic ?? null,
          total_training_effect: aerobic ?? null,
          total_anaerobic_effect: anaerobic ?? null
        });
      } catch  {
        return null;
      }
    })(),
    source_primary: 'garmin',
    field_sources: JSON.stringify({
      distance_m: 'garmin.summary',
      duration_s_moving: 'garmin.summary'
    }),
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: cors
  });
  if (req.method !== 'POST') return new Response('Method not allowed', {
    status: 405,
    headers: cors
  });
  try {
    const { userId, provider, activity } = await req.json();
    if (!userId || !provider || !activity) {
      return new Response(JSON.stringify({
        error: 'Missing required fields'
      }), {
        status: 400,
        headers: {
          ...cors,
          'Content-Type': 'application/json'
        }
      });
    }
    let row;
    let onConflict;
    if (provider === 'strava') {
      row = mapStravaToWorkout(activity, userId);
      onConflict = 'user_id,strava_activity_id';
    } else if (provider === 'garmin') {
      row = await mapGarminToWorkout(activity, userId);
      onConflict = 'user_id,garmin_activity_id';
    } else {
      return new Response(JSON.stringify({
        error: 'Unsupported provider'
      }), {
        status: 400,
        headers: {
          ...cors,
          'Content-Type': 'application/json'
        }
      });
    }
    // Idempotent upsert by provider-specific unique index
    const { error } = await supabase.from('workouts').upsert(row, {
      onConflict
    });
    if (error) {
      return new Response(JSON.stringify({
        success: false,
        error
      }), {
        status: 500,
        headers: {
          ...cors,
          'Content-Type': 'application/json'
        }
      });
    }
    // Fire-and-forget: auto-attach to planned and compute summaries/analysis for zero-touch UX
    try {
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/auto-attach-planned`;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
      const { data: justUpserted } = await supabase.from('workouts').select('id').eq('user_id', row.user_id).eq(onConflict.includes('garmin') ? 'garmin_activity_id' : 'strava_activity_id', onConflict.includes('garmin') ? row.garmin_activity_id : row.strava_activity_id).maybeSingle();
      const wid = justUpserted?.id;
      if (wid) {
        await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
            'apikey': key
          },
          body: JSON.stringify({
            workout_id: wid
          })
        });
        // Ensure computed summary (GAP, cadence, intervals) is generated with latest server logic
        try {
          const sumUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-summary`;
          await fetch(sumUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${key}`,
              'apikey': key
            },
            body: JSON.stringify({
              workout_id: wid
            })
          });
        } catch  {}
        // Ensure provider-agnostic analysis (series/splits) computes date correction too
        try {
          const anUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-analysis`;
          await fetch(anUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${key}`,
              'apikey': key
            },
            body: JSON.stringify({
              workout_id: wid
            })
          });
        } catch  {}
      }
    } catch  {}
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: `${err}`
    }), {
      status: 500,
      headers: {
        ...cors,
        'Content-Type': 'application/json'
      }
    });
  }
});

