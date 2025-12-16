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
// --- Swim moving-time derivation helper (used when provider omits moving/timer) ---
function deriveSwimMovingSeconds(activityLike: any): number | null {
  try {
    const s = activityLike?.summary || {};
    // 1) Provider explicit moving/timer
    const ms = Number(s.movingDurationInSeconds ?? s.timerDurationInSeconds);
    if (Number.isFinite(ms) && ms > 0) return Math.round(ms);

    // 2) Distance ÷ avg speed (Garmin's avgSpeed is based on moving time, not timer time!)
    const distM = Number(s.totalDistanceInMeters ?? s.distanceInMeters ?? activityLike?.distance_meters);
    const avgMps = Number(s.averageSpeedInMetersPerSecond ?? activityLike?.avg_speed_mps);
    const durS_forClamp = Number(s.durationInSeconds ?? activityLike?.duration_seconds);
    if (Number.isFinite(distM) && distM > 0 && Number.isFinite(avgMps) && avgMps > 0) {
      let est = distM / avgMps;
      if (Number.isFinite(durS_forClamp) && durS_forClamp > 0) est = Math.min(est, durS_forClamp);
      return Math.round(est);
    }

    // 3) From lengths (only if non-uniform, indicating real Garmin lengths not reconstruction)
    try {
      const swim = activityLike?.swim_data ?? {};
      const lens = Array.isArray(swim?.lengths) ? swim.lengths : [];
      if (lens.length) {
        const durs:number[] = lens.map((l:any)=> Number(l?.duration_s ?? NaN)).filter((n)=> Number.isFinite(n) && n > 0);
        if (durs.length) {
          const min = durs.reduce((m,n)=> Math.min(m,n), Number.POSITIVE_INFINITY);
          const max = durs.reduce((m,n)=> Math.max(m,n), 0);
          // Only use if non-uniform (real Garmin data, not our equal-time reconstruction)
          const essentiallyUniform = durs.length >= 3 && (max - min) <= 1;
          if (!essentiallyUniform) {
            let sum = durs.reduce((a,b)=> a + b, 0);
            const durS = Number(s.durationInSeconds ?? activityLike?.duration_seconds);
            if (Number.isFinite(durS) && durS > 0 && sum > durS) sum = durS;
            if (sum > 0) return Math.round(sum);
          }
        }
      }
    } catch {}

    // 4) Distance × avg pace
    const avgMinPerKm = Number(s.averagePaceInMinutesPerKilometer);
    if (Number.isFinite(distM) && distM > 0 && Number.isFinite(avgMinPerKm) && avgMinPerKm > 0) {
      let est = (distM / 1000) * avgMinPerKm * 60;
      if (Number.isFinite(durS_forClamp) && durS_forClamp > 0) est = Math.min(est, durS_forClamp);
      return Math.round(est);
    }

    // 4) Pool-only heuristic (~15% rest)
    const hasPoolHints = Number.isFinite(Number(s.poolLengthInMeters))
      || Number.isFinite(Number(s.numberOfActiveLengths))
      || Number.isFinite(Number(activityLike?.pool_length));
    const durS = Number(s.durationInSeconds ?? activityLike?.duration_seconds);
    if (hasPoolHints && Number.isFinite(durS) && durS > 0) return Math.round(durS * 0.85);

    // 5) Last resort: overall duration
    if (Number.isFinite(durS) && durS > 0) return Math.round(durS);
    return null;
  } catch  {
    return null;
  }
}
// --- Reverse geocoding helper (using OpenStreetMap Nominatim) ---
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    // Rate limit: max 1 request per second (Nominatim requirement)
    // Use a simple delay to avoid hitting rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EffortsApp/1.0' // Required by Nominatim
      }
    });
    
    if (!response.ok) {
      console.log(`⚠️ Reverse geocoding failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    if (!data || !data.address) {
      return null;
    }
    
    // Extract city name (prefer city, then town, then village, then municipality)
    const address = data.address;
    const city = address.city || address.town || address.village || address.municipality || 
                 address.county || address.state || null;
    
    if (city) {
      return city;
    }
    
    return null;
  } catch (error) {
    console.log(`⚠️ Reverse geocoding error: ${error}`);
    return null;
  }
}

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
  const isRunWalk = sport.includes('run') || sport.includes('walk');

  // Process embedded streams from strava-webhook/import-strava-history
  const streams = activity.streams || {};
  let gps_track: any[] | null = null;
  let sensor_data: any[] | null = null;
  let cadAvgComputed: number | null = null;
  let cadMaxComputed: number | null = null;

  const startEpochSec = Math.floor(new Date(activity.start_date).getTime() / 1000);

  // Build gps_track from latlng/altitude/time streams
  if (streams.latlng && streams.latlng.length > 0) {
    const len = streams.latlng.length;
    const altLen = streams.altitude?.length || 0;
    const timeLen = streams.time?.length || 0;
    const useLen = Math.min(len, altLen || len, timeLen || len);
    gps_track = new Array(useLen).fill(0).map((_, i) => {
      const [lat, lng] = streams.latlng[i];
      const elev = streams.altitude && Number.isFinite(streams.altitude[i]) ? streams.altitude[i] : null;
      const tRel = streams.time && Number.isFinite(streams.time[i]) ? streams.time[i] : i;
      return { lat, lng, elevation: elev, startTimeInSeconds: startEpochSec + tRel, timestamp: (startEpochSec + tRel) * 1000 };
    });
    console.log(`📍 Built gps_track with ${useLen} points for Strava activity ${activity.id}`);
  }

  // Build sensor_data from heartrate/time streams
  if (streams.heartrate && streams.time) {
    const len = Math.min(streams.heartrate.length, streams.time.length);
    sensor_data = new Array(len).fill(0).map((_, i) => {
      const t = startEpochSec + streams.time[i];
      return { 
        heartRate: streams.heartrate[i], 
        startTimeInSeconds: t, 
        timestamp: t * 1000,
        timerDurationInSeconds: streams.time[i]  // Relative seconds from activity start (like Garmin)
      };
    });
    console.log(`💓 Built sensor_data with ${len} HR points for Strava activity ${activity.id}`);
  }

  // Add cadence to sensor_data
  if (streams.cadence && streams.cadence.length > 0) {
    const cadArray = (streams.cadence as number[]).filter((v) => Number.isFinite(v));
    if (cadArray.length > 0) {
      cadMaxComputed = Math.round(Math.max(...cadArray));
      cadAvgComputed = Math.round(cadArray.reduce((a, b) => a + b, 0) / cadArray.length);

      // Create sensor_data if it doesn't exist
      if (!sensor_data && streams.time && streams.time.length > 0) {
        const timeLen = streams.time.length;
        sensor_data = new Array(timeLen).fill(0).map((_, i) => {
          const t = startEpochSec + streams.time[i];
          return { startTimeInSeconds: t, timestamp: t * 1000, timerDurationInSeconds: streams.time[i] };
        });
      }

      // Attach cadence to sensor_data
      if (sensor_data && streams.time && streams.time.length > 0) {
        const useLen = Math.min(sensor_data.length, streams.cadence.length, streams.time.length);
        for (let i = 0; i < useLen; i++) {
          const cv = streams.cadence[i];
          if (Number.isFinite(cv)) {
            sensor_data[i].cadence = Math.round(cv as number);
          }
        }
        console.log(`🦵 Added cadence to sensor_data: ${useLen} points for Strava activity ${activity.id}`);
      }
    }
  }

  // Add power (watts) to sensor_data
  if (streams.watts && streams.watts.length > 0) {
    const wattsArray = (streams.watts as number[]).filter((v) => Number.isFinite(v) && v >= 0);
    if (wattsArray.length > 0) {
      // Create sensor_data if it doesn't exist
      if (!sensor_data && streams.time && streams.time.length > 0) {
        const timeLen = streams.time.length;
        sensor_data = new Array(timeLen).fill(0).map((_, i) => {
          const t = startEpochSec + streams.time[i];
          return { startTimeInSeconds: t, timestamp: t * 1000, timerDurationInSeconds: streams.time[i] };
        });
      }

      // Attach power to sensor_data
      if (sensor_data && streams.time && streams.time.length > 0) {
        const useLen = Math.min(sensor_data.length, streams.watts.length);
        for (let i = 0; i < useLen; i++) {
          const w = streams.watts[i];
          if (Number.isFinite(w) && w >= 0) {
            sensor_data[i].power = Math.round(w);
            sensor_data[i].watts = Math.round(w); // Alias for compatibility
          }
        }
        console.log(`⚡ Added power to sensor_data: ${useLen} points for Strava activity ${activity.id}`);
      }
    }
  }

  // Add speed (velocity_smooth) to sensor_data - maps to speedMetersPerSecond like Garmin
  if (streams.velocity_smooth && streams.velocity_smooth.length > 0) {
    // Create sensor_data if it doesn't exist
    if (!sensor_data && streams.time && streams.time.length > 0) {
      const timeLen = streams.time.length;
      sensor_data = new Array(timeLen).fill(0).map((_, i) => {
        const t = startEpochSec + streams.time[i];
        return { startTimeInSeconds: t, timestamp: t * 1000, timerDurationInSeconds: streams.time[i] };
      });
    }

    // Attach speed to sensor_data
    if (sensor_data && streams.time && streams.time.length > 0) {
      const useLen = Math.min(sensor_data.length, streams.velocity_smooth.length);
      for (let i = 0; i < useLen; i++) {
        const v = streams.velocity_smooth[i];
        if (Number.isFinite(v)) {
          sensor_data[i].speedMetersPerSecond = v;
        }
      }
      console.log(`🏃 Added speedMetersPerSecond to sensor_data: ${useLen} points for Strava activity ${activity.id}`);
    }
  }

  // Add distance to sensor_data - maps to totalDistanceInMeters like Garmin
  if (streams.distance && streams.distance.length > 0) {
    // Create sensor_data if it doesn't exist
    if (!sensor_data && streams.time && streams.time.length > 0) {
      const timeLen = streams.time.length;
      sensor_data = new Array(timeLen).fill(0).map((_, i) => {
        const t = startEpochSec + streams.time[i];
        return { startTimeInSeconds: t, timestamp: t * 1000, timerDurationInSeconds: streams.time[i] };
      });
    }

    // Attach distance to sensor_data
    if (sensor_data && streams.time && streams.time.length > 0) {
      const useLen = Math.min(sensor_data.length, streams.distance.length);
      for (let i = 0; i < useLen; i++) {
        const d = streams.distance[i];
        if (Number.isFinite(d)) {
          sensor_data[i].totalDistanceInMeters = d;
        }
      }
      console.log(`📏 Added totalDistanceInMeters to sensor_data: ${useLen} points for Strava activity ${activity.id}`);
    }
  }

  // Add elevation (altitude) to sensor_data - maps to elevationInMeters like Garmin
  if (streams.altitude && streams.altitude.length > 0) {
    // Create sensor_data if it doesn't exist
    if (!sensor_data && streams.time && streams.time.length > 0) {
      const timeLen = streams.time.length;
      sensor_data = new Array(timeLen).fill(0).map((_, i) => {
        const t = startEpochSec + streams.time[i];
        return { startTimeInSeconds: t, timestamp: t * 1000, timerDurationInSeconds: streams.time[i] };
      });
    }

    // Attach elevation to sensor_data
    if (sensor_data && streams.time && streams.time.length > 0) {
      const useLen = Math.min(sensor_data.length, streams.altitude.length);
      for (let i = 0; i < useLen; i++) {
        const elev = streams.altitude[i];
        if (Number.isFinite(elev)) {
          sensor_data[i].elevationInMeters = elev;
        }
      }
      console.log(`⛰️ Added elevationInMeters to sensor_data: ${useLen} points for Strava activity ${activity.id}`);
    }
  }

  // Normalize cadence for runs/walks (Strava reports half-cadence)
  let avgCadNorm = Number.isFinite(activity.average_cadence) ? Math.round(activity.average_cadence) : cadAvgComputed;
  let maxCadNorm = Number.isFinite(activity.max_cadence) ? Math.round(activity.max_cadence) : cadMaxComputed;
  if (isRunWalk) {
    if (avgCadNorm != null && avgCadNorm < 120) avgCadNorm = avgCadNorm * 2;
    if (maxCadNorm != null && maxCadNorm < 120) maxCadNorm = maxCadNorm * 2;
  }

  // Build activity object with sensor_data for computeComputedFromActivity
  const activityWithSensors = {
    ...activity,
    sensor_data: sensor_data ? { samples: sensor_data } : null
  };

  // Attempt to compute summary (GAP, cadence) if samples are present
  let computedSummary = null;
  try {
    computedSummary = computeComputedFromActivity(activityWithSensors);
  } catch {}
  const computedJsonObj = computedSummary || null;

  const derivedAvgCadence = (() => {
    try {
      const v = computedSummary?.overall?.avg_cadence_spm;
      return Number.isFinite(v) ? Math.round(v) : null;
    } catch {
      return null;
    }
  })();
  const derivedMaxCadence = (() => {
    try {
      const v = computedSummary?.overall?.max_cadence_spm;
      return Number.isFinite(v) ? Math.round(v) : null;
    } catch {
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
    steps: ((): number | null => {
      try {
        const v = activity.steps ?? activity.step_count ?? activity.total_steps ?? null;
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      } catch { return null; }
    })(),
    provider_sport: activity.sport_type || activity.type || null,
    // Location - prefer start_latlng, fallback to first GPS track point
    start_position_lat: Array.isArray(activity.start_latlng) && activity.start_latlng[0] != null 
      ? activity.start_latlng[0] 
      : (gps_track && gps_track[0]?.lat != null ? gps_track[0].lat : null),
    start_position_long: Array.isArray(activity.start_latlng) && activity.start_latlng[1] != null 
      ? activity.start_latlng[1] 
      : (gps_track && gps_track[0]?.lng != null ? gps_track[0].lng : null),
    // GPS track built from streams or pre-provided
    gps_track: gps_track ? JSON.stringify(gps_track) : (activity.gps_track ?? null),
    // Sensor data built from streams or pre-provided
    sensor_data: sensor_data ? JSON.stringify({ samples: sensor_data }) : (activity.sensor_data ?? null),
    swim_data: activity.swim_data ?? null,
    laps: activity.laps ?? null,
    // Polyline if available
    gps_trackpoints: activity.map?.polyline || activity.map?.summary_polyline || null,
    // Cadence rollups (prefer normalized, then Strava fields, then derived from compute)
    avg_cadence: avgCadNorm ?? derivedAvgCadence,
    max_cadence: maxCadNorm ?? derivedMaxCadence,
    // Power from Strava summary
    avg_power: Number.isFinite(activity.average_watts) ? Math.round(activity.average_watts) : null,
    max_power: Number.isFinite(activity.max_watts) ? Math.round(activity.max_watts) : null,
    normalized_power: Number.isFinite(activity.weighted_average_watts) ? Math.round(activity.weighted_average_watts) : null,
    // Temperature
    avg_temperature: Number.isFinite(activity.average_temp) ? Math.round(activity.average_temp) : null,
    max_temperature: Number.isFinite(activity.max_temp) ? Math.round(activity.max_temp) : null,
    // Server-computed summary for UI (includes GAP/cadence when available)
    computed: computedJsonObj ? JSON.stringify(computedJsonObj) : null,
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
      const pwr = typeof s.powerInWatts === 'number' ? s.powerInWatts : typeof s.power === 'number' ? s.power : undefined;
      normalized.push({
        ts,
        t: Number.isFinite(t) ? t : i,
        hr,
        v,
        d,
        elev,
        cad,
        pwr
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
    // Overall power (avg/max)
    const powerStats = (()=>{
      const pwrs = normalized.map((s)=>typeof s.pwr === 'number' ? s.pwr : NaN).filter(Number.isFinite);
      if (!pwrs.length) return {
        avg: null,
        max: null
      };
      const avg = Math.round(pwrs.reduce((a, b)=>a + b, 0) / pwrs.length);
      const max = Math.max(...pwrs);
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
        max_cadence_spm: cadStats.max,
        avg_power_w: powerStats.avg,
        max_power_w: powerStats.max
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
      const { data: gaData } = await supabase.from('garmin_activities').select('avg_power, max_power, avg_bike_cadence, max_bike_cadence, avg_run_cadence, max_run_cadence, sensor_data, raw_data, samples_data').eq('user_id', userId).eq('garmin_activity_id', garminActivityId).maybeSingle();
      if (gaData) {
        // Build sensor_data with fallback chain: prefer sensor_data, then samples_data, then raw_data.samples
        const sensorDataResolved = gaData.sensor_data 
          || (gaData.samples_data ? { samples: gaData.samples_data } : null)
          || (gaData.raw_data?.samples ? { samples: gaData.raw_data.samples } : null);
        
        enrichedData = {
          avg_power: gaData.avg_power,
          max_power: gaData.max_power,
          avg_bike_cadence: gaData.avg_bike_cadence,
          max_bike_cadence: gaData.max_bike_cadence,
          avg_run_cadence: gaData.avg_run_cadence,
          max_run_cadence: gaData.max_run_cadence,
          sensor_data: sensorDataResolved,
          raw_data: gaData.raw_data
        };
        const sampleCount = Array.isArray(sensorDataResolved?.samples) ? sensorDataResolved.samples.length : 0;
        console.log(`🔋 Enriched Garmin data for ${garminActivityId}: Power=${gaData.avg_power}W, Cadence=${gaData.avg_bike_cadence || gaData.avg_run_cadence}, Samples=${sampleCount}`);
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
      swim_data: activity.swim_data || null,
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
  // Generate a nice workout name (async to support reverse geocoding)
  const generateWorkoutName = async () => {
    // If activity has a custom name, use it (unless it's a raw activity_type)
    if (activity.activity_name && 
        !activity.activity_name.match(/^(ROAD_BIKING|RUNNING|LAP_SWIMMING|OPEN_WATER_SWIMMING|CYCLING|SWIMMING)$/i)) {
      return activity.activity_name;
    }
    
    // Get friendly sport type
    const rawType = (activity.activity_type || '').toLowerCase();
    const poolLength = computeInput?.pool_length || computeInput?.summary?.poolLengthInMeters;
    const numberOfLengths = activity.number_of_active_lengths || computeInput?.summary?.numberOfActiveLengths;
    const hasGps = Array.isArray(activity.gps_track) && activity.gps_track.length > 0;
    
    let friendlySport = '';
    if (type === 'swim') {
      if (/open\s*water|ocean|ow\b|open_water/.test(rawType)) {
        friendlySport = 'Open Water Swim';
      } else if (/lap|pool|indoor/.test(rawType) || poolLength || numberOfLengths) {
        friendlySport = 'Lap Swim';
      } else if (hasGps) {
        friendlySport = 'Open Water Swim';
      } else {
        friendlySport = 'Lap Swim';
      }
    } else if (type === 'run') {
      if (/trail/.test(rawType)) {
        friendlySport = 'Trail Run';
      } else {
        friendlySport = 'Run';
      }
    } else if (type === 'ride') {
      if (/gravel/.test(rawType)) {
        friendlySport = 'Gravel Ride';
      } else if (/mountain|mtb/.test(rawType)) {
        friendlySport = 'Mountain Bike';
      } else if (/road/.test(rawType)) {
        friendlySport = 'Road Ride';
      } else {
        friendlySport = 'Ride';
      }
    } else if (type === 'walk') {
      friendlySport = /hike|hiking/.test(rawType) ? 'Hike' : 'Walk';
    } else if (type === 'strength') {
      friendlySport = 'Strength';
    } else {
      friendlySport = type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    // Try to get location name from coordinates
    const lat = activity.starting_latitude || activity.startingLatitudeInDegree;
    const lng = activity.starting_longitude || activity.startingLongitudeInDegree;
    let locationName: string | null = null;
    
    if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      try {
        locationName = await reverseGeocode(Number(lat), Number(lng));
      } catch (error) {
        console.log(`⚠️ Reverse geocoding failed for ${lat},${lng}: ${error}`);
      }
    }
    
    // Return location + sport type if we have location, otherwise just sport type
    if (locationName) {
      return `${locationName} ${friendlySport}`;
    }
    
    return friendlySport;
  };
  
  const workoutName = await generateWorkoutName();
  
  return {
    user_id: userId,
    name: workoutName,
    type,
    refined_type: computeInput?.refined_type || null,
    date: date,
    timestamp: timestamp,
    // Use provider seconds precisely: elapsed vs moving
    duration: (()=>{ 
      // For ALL activities with samples, extract clock duration from last sample
      if (enrichedData?.raw_data?.samples) {
        const samples = Array.isArray(enrichedData.raw_data.samples) ? enrichedData.raw_data.samples : [];
        if (samples.length > 0) {
          const clockS = Number(samples[samples.length - 1]?.clockDurationInSeconds);
          if (Number.isFinite(clockS) && clockS > 0) return Math.floor(clockS / 60);
        }
      }
      const s = Number(computeInput?.summary?.durationInSeconds); 
      return Number.isFinite(s) && s>0 ? Math.floor(s/60) : null; 
    })(),
    moving_time: (()=>{ 
      // For non-swim activities, extract moving duration from last sample
      if (type !== 'swim' && enrichedData?.raw_data?.samples) {
        const samples = Array.isArray(enrichedData.raw_data.samples) ? enrichedData.raw_data.samples : [];
        if (samples.length > 0) {
          const movingS = Number(samples[samples.length - 1]?.movingDurationInSeconds);
          if (Number.isFinite(movingS) && movingS > 0) return Math.floor(movingS / 60);
        }
      }
      const ms = Number(computeInput?.summary?.movingDurationInSeconds ?? computeInput?.summary?.timerDurationInSeconds); 
      if (Number.isFinite(ms) && ms>0) return Math.floor(ms/60);
      // For swims, use the derive helper which sums swim lengths
      if (type === 'swim') {
        const derived = deriveSwimMovingSeconds(computeInput);
        if (Number.isFinite(derived as any) && (derived as number) > 0) return Math.floor((derived as number) / 60);
      }
      return null;
    })(),
    elapsed_time: (()=>{ 
      // For ALL activities with samples, extract clock duration from last sample
      if (enrichedData?.raw_data?.samples) {
        const samples = Array.isArray(enrichedData.raw_data.samples) ? enrichedData.raw_data.samples : [];
        if (samples.length > 0) {
          const clockS = Number(samples[samples.length - 1]?.clockDurationInSeconds);
          if (Number.isFinite(clockS) && clockS > 0) return Math.floor(clockS / 60);
        }
      }
      const s = Number(computeInput?.summary?.durationInSeconds); 
      return Number.isFinite(s) && s>0 ? Math.floor(s/60) : null; 
    })(),
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
      const actCad = activity.avg_swim_cadence ?? activity.avg_run_cadence ?? activity.avg_bike_cadence;
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
      const actMaxCad = activity.max_run_cadence ?? activity.max_bike_cadence;
      const v = enriched ?? actMaxCad;
      return roundInt(v);
    })(),
    strokes: (Number.isFinite(activity.strokes) ? activity.strokes : Number.isFinite(computeInput?.summary?.totalNumberOfStrokes) ? Number(computeInput.summary.totalNumberOfStrokes) : null) ?? null,
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
    computed: ((): string | null => {
      try {
        const c: any = computeComputedFromActivity(computeInput) || {};
        // Normalize paces to seconds (fix possible decisecond inputs)
        try {
          const fix = (n:any)=>{ const v=Number(n); if(!Number.isFinite(v)||v<=0) return null; return v>1200?Math.round(v/10):Math.round(v); };
          if (c?.overall) {
            if (c.overall.avg_pace_s_per_mi!=null) c.overall.avg_pace_s_per_mi = fix(c.overall.avg_pace_s_per_mi);
            if (c.overall.gap_pace_s_per_mi!=null) c.overall.gap_pace_s_per_mi = fix(c.overall.gap_pace_s_per_mi);
          }
          if (Array.isArray(c?.intervals)) {
            for (const it of c.intervals) {
              if (it?.executed) {
                if (it.executed.avg_pace_s_per_mi!=null) it.executed.avg_pace_s_per_mi = fix(it.executed.avg_pace_s_per_mi);
                if (it.executed.gap_pace_s_per_mi!=null) it.executed.gap_pace_s_per_mi = fix(it.executed.gap_pace_s_per_mi);
              }
            }
          }
        } catch {}
        // Guarantee overall for swims from ingest-time totals (distance_meters, duration_seconds)
        if (type === 'swim') {
          const distIn = Number(activity.distance_meters ?? computeInput?.summary?.totalDistanceInMeters ?? computeInput?.summary?.distanceInMeters);
          const nLen = Number(activity.number_of_active_lengths ?? computeInput?.summary?.numberOfActiveLengths);
          const poolM = Number(activity.pool_length ?? computeInput?.pool_length ?? computeInput?.pool_length_m);
          // Moving seconds preferred — use derived helper first
          const derived = deriveSwimMovingSeconds(computeInput);
          const durIn = Number.isFinite(derived as any) && (derived as number) > 0
                        ? (derived as number)
                        : Number(computeInput?.summary?.movingDurationInSeconds ?? computeInput?.summary?.timerDurationInSeconds ?? activity.duration_seconds ?? computeInput?.summary?.durationInSeconds);
          const distM = Number.isFinite(distIn) && distIn > 0 ? Math.round(distIn)
                        : (Number.isFinite(nLen) && nLen > 0 && Number.isFinite(poolM) && poolM > 0 ? Math.round(nLen * poolM) : null);
          const durS = Number.isFinite(durIn) && durIn > 0 ? Math.floor(durIn) : null;
          c.overall = {
            ...(c.overall || {}),
            distance_m: (c.overall?.distance_m ?? distM ?? 0),
            duration_s_moving: (c.overall?.duration_s_moving ?? durS ?? null)
          };
        }
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
        return JSON.stringify(c);
      } catch  {
        return null;
      }
    })(),
    // Embed training effect in computed.metrics-lite area for UI pickup
    metrics: (()=>{
      try {
        const out: any = {};
        // Second-precision time fields from provider summary
        const elapsedS = Number(computeInput?.summary?.durationInSeconds);
        const timerS = Number(computeInput?.summary?.timerDurationInSeconds);
        const movingS = Number(computeInput?.summary?.movingDurationInSeconds);
        if (Number.isFinite(elapsedS) && elapsedS > 0) {
          out.total_elapsed_time_seconds = Math.round(elapsedS);
          out.total_elapsed_time = Math.floor(elapsedS / 60);
        }
        // Prefer explicit moving-duration seconds when present (more accurate than minutes scalar)
        if (Number.isFinite(movingS) && movingS > 0) {
          out.moving_time_seconds = Math.round(movingS);
          out.moving_time = Math.floor(movingS / 60);
        }
        if (Number.isFinite(timerS) && timerS > 0) {
          out.total_timer_time_seconds = Math.round(timerS);
          out.total_timer_time = Math.floor(timerS / 60);
        }
        // Training effect fields
        const aerobic = activity.aerobic_training_effect ?? activity.total_training_effect ?? activity.aerobicTrainingEffect ?? null;
        const anaerobic = activity.anaerobic_training_effect ?? activity.total_anaerobic_effect ?? activity.anaerobicTrainingEffect ?? null;
        if (aerobic != null || anaerobic != null) {
          out.aerobic_training_effect = aerobic ?? null;
          out.anaerobic_training_effect = anaerobic ?? null;
          out.total_training_effect = aerobic ?? null;
          out.total_anaerobic_effect = anaerobic ?? null;
        }
        return Object.keys(out).length ? out : null;
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
    // Ensure scalar swim fields persisted even if provider details path is used
    try {
      const { data: justUpserted } = await supabase
        .from('workouts')
        .select('id,distance,moving_time,pool_length,number_of_active_lengths')
        .eq('user_id', row.user_id)
        .eq(onConflict.includes('garmin') ? 'garmin_activity_id' : 'strava_activity_id', onConflict.includes('garmin') ? row.garmin_activity_id : row.strava_activity_id)
        .maybeSingle();
      const wid = justUpserted?.id;
      if (wid) {
        const scalarUpdates: any = {};
        const distKm = typeof row.distance === 'number' && row.distance > 0 ? row.distance : (Number(activity.distance_meters) > 0 ? Number((Number(activity.distance_meters) / 1000).toFixed(3)) : null);
        const sum = (activity && activity.summary) ? activity.summary : {};
        let moveMin = typeof row.moving_time === 'number' && row.moving_time > 0
          ? row.moving_time
          : (Number(sum?.movingDurationInSeconds ?? sum?.timerDurationInSeconds) > 0
              ? Math.floor(Number(sum.movingDurationInSeconds ?? sum.timerDurationInSeconds) / 60)
              : null);
        // Swim-specific derivation when provider didn't include moving/timer
        try {
          const typeKey = String(activity?.activity_type || '').toLowerCase();
          const isSwim = typeKey.includes('swim');
          if ((moveMin == null || moveMin <= 0) && isSwim) {
            const derivedS = deriveSwimMovingSeconds({ ...activity, summary: sum });
            if (Number.isFinite(derivedS as any) && (derivedS as number) > 0) moveMin = Math.floor((derivedS as number) / 60);
          }
        } catch {}
        const durMin = typeof row.duration === 'number' && row.duration > 0 ? row.duration : (Number(sum?.durationInSeconds) > 0 ? Math.floor(Number(sum.durationInSeconds) / 60) : null);
        const poolLen = typeof row.pool_length === 'number' && row.pool_length > 0 ? row.pool_length : (Number(activity.pool_length) > 0 ? Number(activity.pool_length) : null);
        const nLen = typeof row.number_of_active_lengths === 'number' && row.number_of_active_lengths > 0 ? row.number_of_active_lengths : (Number(activity.number_of_active_lengths) > 0 ? Number(activity.number_of_active_lengths) : null);
        if (distKm != null) scalarUpdates.distance = distKm;
        if (moveMin != null) scalarUpdates.moving_time = moveMin;
        if (durMin != null) scalarUpdates.duration = durMin;
        if (poolLen != null) scalarUpdates.pool_length = poolLen;
        if (nLen != null) scalarUpdates.number_of_active_lengths = nLen;
        if (Object.keys(scalarUpdates).length) {
          await supabase.from('workouts').update(scalarUpdates).eq('id', wid);
        }
      }
    } catch {}

    // Fire-and-forget: auto-attach to planned and compute summaries/analysis for zero-touch UX
    try {
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/auto-attach-planned`;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
      const { data: justUpserted2 } = await supabase.from('workouts').select('id').eq('user_id', row.user_id).eq(onConflict.includes('garmin') ? 'garmin_activity_id' : 'strava_activity_id', onConflict.includes('garmin') ? row.garmin_activity_id : row.strava_activity_id).maybeSingle();
      const wid = justUpserted2?.id;
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
        } catch (summaryErr) {
          console.error('[ingest-activity] compute-workout-summary failed:', summaryErr);
        }
        // Ensure provider-agnostic analysis (series/splits) computes date correction too
        try {
          const anUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/compute-workout-analysis`;
          const analysisResp = await fetch(anUrl, {
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
          if (!analysisResp.ok) {
            const errText = await analysisResp.text();
            console.error('[ingest-activity] compute-workout-analysis returned non-OK status:', analysisResp.status, errText);
          } else {
            console.log('[ingest-activity] compute-workout-analysis succeeded for workout:', wid);
          }
        } catch (analysisErr) {
          console.error('[ingest-activity] compute-workout-analysis failed:', analysisErr);
        }
        // Calculate comprehensive metrics (max pace, adherence, etc.) for smart server architecture
        try {
          const metricsUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calculate-workout-metrics`;
          const metricsResp = await fetch(metricsUrl, {
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
          if (!metricsResp.ok) {
            const errText = await metricsResp.text();
            console.error('[ingest-activity] calculate-workout-metrics returned non-OK status:', metricsResp.status, errText);
          } else {
            console.log('[ingest-activity] calculate-workout-metrics succeeded for workout:', wid);
          }
        } catch (metricsErr) {
          console.error('[ingest-activity] calculate-workout-metrics failed:', metricsErr);
        }
        // Calculate workload for completed workouts (Garmin/Strava imports)
        try {
          const workloadUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calculate-workload`;
          const workloadResp = await fetch(workloadUrl, {
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
          if (!workloadResp.ok) {
            const errText = await workloadResp.text();
            console.error('[ingest-activity] calculate-workload returned non-OK status:', workloadResp.status, errText);
          } else {
            console.log('[ingest-activity] calculate-workload succeeded for workout:', wid);
          }
        } catch (workloadErr) {
          console.error('[ingest-activity] calculate-workload failed:', workloadErr);
        }
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

