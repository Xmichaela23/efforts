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
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

function mapGarminToWorkout(activity: any, userId: string) {
  const startIso = activity.start_time || (activity.summary?.startTimeInSeconds ? new Date(activity.summary.startTimeInSeconds * 1000).toISOString() : null);
  const dateIso = startIso ? startIso.split('T')[0] : null;
  const typeKey = (activity.activity_type || activity.summary?.activityType?.typeKey || '').toLowerCase();
  const type = typeKey.includes('run') ? 'run'
    : (typeKey.includes('bike') || typeKey.includes('cycl') || typeKey.includes('ride')) ? 'ride'
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
    avg_cadence: activity.avg_swim_cadence ?? activity.avg_running_cadence ?? activity.avg_bike_cadence ?? null,
    max_cadence: activity.max_running_cadence ?? activity.max_bike_cadence ?? null,
    strokes: Number.isFinite(activity.strokes) ? activity.strokes : null,
    pool_length: Number.isFinite(activity.pool_length) ? activity.pool_length : null,
    tss: activity.training_stress_score ?? null,
    intensity_factor: activity.intensity_factor ?? null,
    normalized_power: Number.isFinite(activity.normalized_power) ? Math.round(activity.normalized_power) : null,
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

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: `${err}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});


