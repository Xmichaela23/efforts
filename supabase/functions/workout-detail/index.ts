// @ts-nocheck
// Function: workout-detail
// Behavior: Return canonical completed workout details by id with optional heavy fields

import { createClient } from 'jsr:@supabase/supabase-js@2';

type DetailOptions = {
  include_gps?: boolean;
  include_sensors?: boolean;
  include_swim?: boolean;
  resolution?: 'low' | 'high';
  normalize?: boolean;
  version?: string; // response schema version; default v1
};

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function isUuid(v?: string | null): boolean { return !!v && /[0-9a-fA-F-]{36}/.test(v); }

// Decode Google/Strava encoded polylines (precision 1e5)
function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    // latitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    // longitude
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates;
}

function normalizeBasic(w: any) {
  const type = String(w?.type || '').toLowerCase();
  return {
    normalization_version: String(w?.normalization_version || ''),
    id: String(w?.id || ''),
    user_id: String(w?.user_id || ''),
    date: String(w?.date || '').slice(0,10),
    type,
    workout_status: String(w?.workout_status || 'completed'),
    planned_id: w?.planned_id || null,
    name: w?.name || null,
    // Basic metrics (pass-through; units as stored)
    distance: w?.distance ?? w?.distance_km ?? null,
    distance_meters: w?.distance_meters ?? (typeof w?.distance === 'number' ? w.distance * 1000 : null),
    moving_time: w?.moving_time ?? w?.metrics?.moving_time ?? null,
    elapsed_time: w?.elapsed_time ?? w?.metrics?.elapsed_time ?? null,
    avg_heart_rate: w?.avg_heart_rate ?? w?.metrics?.avg_heart_rate ?? null,
    max_heart_rate: w?.max_heart_rate ?? w?.metrics?.max_heart_rate ?? null,
    avg_power: w?.avg_power ?? w?.metrics?.avg_power ?? null,
    max_power: w?.max_power ?? w?.metrics?.max_power ?? null,
    avg_cadence: w?.avg_cadence ?? w?.metrics?.avg_cadence ?? null,
    max_cadence: w?.max_cadence ?? w?.metrics?.max_cadence ?? null,
    avg_speed_mps: w?.avg_speed_mps ?? null,
    avg_speed: w?.avg_speed ?? w?.metrics?.avg_speed ?? null,
    duration: w?.duration ?? null,
    calories: w?.calories ?? null,
    steps: w?.steps ?? null,
    elevation_gain: w?.elevation_gain ?? w?.metrics?.elevation_gain ?? null,
    elevation_loss: w?.elevation_loss ?? w?.metrics?.elevation_loss ?? null,
    // Location
    start_position_lat: w?.start_position_lat ?? null,
    start_position_long: w?.start_position_long ?? null,
    timestamp: w?.timestamp ?? null,
    // Source tracking
    source: w?.source ?? null,
    is_strava_imported: w?.is_strava_imported ?? null,
    strava_activity_id: w?.strava_activity_id ?? null,
    garmin_activity_id: w?.garmin_activity_id ?? null,
    device_info: w?.device_info ?? null,
    // Achievements (PRs, segments)
    achievements: w?.achievements ?? null,
    // Computed snapshot passthrough
    computed: w?.computed || null,
    // Workload data
    workload_actual: w?.workload_actual ?? null,
    workload_planned: w?.workload_planned ?? null,
    intensity_factor: w?.intensity_factor ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(()=>({}));
    const id = String(body?.id || '').trim();
    const opts: DetailOptions = {
      include_gps: body?.include_gps !== false,
      include_sensors: body?.include_sensors !== false,
      include_swim: body?.include_swim !== false,
      resolution: (body?.resolution === 'low' ? 'low' : 'high'),
      normalize: body?.normalize !== false,
      version: String(body?.version || 'v1'),
    };
    if (!isUuid(id)) {
      return new Response(JSON.stringify({ error: 'id must be a UUID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authH = req.headers.get('Authorization') || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : null;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let userId: string | null = null;
    try {
      if (token) {
        const { data: userData } = await supabase.auth.getUser(token as any);
        userId = userData?.user?.id || null;
      }
    } catch {}

    // Select minimal set plus optional blobs
    const baseSel = [
      'id','user_id','date','type','workout_status','planned_id','name','metrics','computed','workout_analysis',
      'avg_heart_rate','max_heart_rate','avg_power','max_power','avg_cadence','max_cadence',
      'avg_speed','distance','duration','elapsed_time','moving_time','calories','steps','elevation_gain','elevation_loss',
      'start_position_lat','start_position_long','timestamp',
      'strength_exercises','mobility_exercises',
      // Source tracking for display
      'source','is_strava_imported','strava_activity_id','garmin_activity_id','device_info',
      // Achievements (PRs, segments)
      'achievements',
      // Workload data (single source of truth from calculate-workload)
      'workload_actual','workload_planned','intensity_factor',
      // GPS trackpoints (polyline) for fallback when gps_track is missing
      'gps_trackpoints',
      // Timestamp for processing trigger deduplication
      'updated_at'
    ].join(',');
    const gpsSel = opts.include_gps ? ',gps_track' : '';
    const sensSel = opts.include_sensors ? ',sensor_data' : '';
    // workouts table stores pool_length (meters or yards depending on source), not pool_length_m/pool_unit
    const swimSel = opts.include_swim ? ',swim_data,number_of_active_lengths,pool_length' : '';
    const select = baseSel + gpsSel + sensSel + swimSel;

    let query = supabase.from('workouts').select(select).eq('id', id) as any;
    if (userId) query = query.eq('user_id', userId);
    const { data: row, error } = await query.maybeSingle();
    if (error) throw error;
    if (!row) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Normalize light fields only (Phase 1: no heavy processing/downsampling)
    const detail = normalizeBasic(row);

    // No derived fallbacks here; detail is a thin wrapper around stored data.

    // Parse/attach structured fields
    try { (detail as any).computed = (()=>{ try { return typeof row.computed === 'string' ? JSON.parse(row.computed) : (row.computed || null); } catch { return row.computed || null; } })(); } catch {}
    try { (detail as any).metrics  = (()=>{ try { return typeof row.metrics  === 'string' ? JSON.parse(row.metrics)  : (row.metrics  || null); } catch { return row.metrics  || null; } })(); } catch {}
    try { (detail as any).workout_analysis = (()=>{ try { return typeof row.workout_analysis === 'string' ? JSON.parse(row.workout_analysis) : (row.workout_analysis || null); } catch { return row.workout_analysis || null; } })(); } catch {}
    try { (detail as any).strength_exercises = (()=>{ try { return typeof row.strength_exercises === 'string' ? JSON.parse(row.strength_exercises) : (row.strength_exercises || null); } catch { return row.strength_exercises || null; } })(); } catch {}
    try { (detail as any).mobility_exercises = (()=>{ try { return typeof row.mobility_exercises === 'string' ? JSON.parse(row.mobility_exercises) : (row.mobility_exercises || null); } catch { return row.mobility_exercises || null; } })(); } catch {}
    try { (detail as any).achievements = (()=>{ try { return typeof row.achievements === 'string' ? JSON.parse(row.achievements) : (row.achievements || null); } catch { return row.achievements || null; } })(); } catch {}
    try { (detail as any).device_info = (()=>{ try { return typeof row.device_info === 'string' ? JSON.parse(row.device_info) : (row.device_info || null); } catch { return row.device_info || null; } })(); } catch {}
    if (opts.include_gps) {
      let gpsTrack = null;
      try { 
        gpsTrack = typeof row.gps_track === 'string' ? JSON.parse(row.gps_track) : (row.gps_track || null);
      } catch { 
        gpsTrack = row.gps_track || null;
      }
      
      // If gps_track is missing but gps_trackpoints (polyline) exists, decode it server-side
      if ((!gpsTrack || (Array.isArray(gpsTrack) && gpsTrack.length === 0)) && row.gps_trackpoints) {
        console.log(`[workout-detail] Decoding polyline for workout ${id}, polyline length: ${row.gps_trackpoints.length}`);
        try {
          const decoded = decodePolyline(row.gps_trackpoints);
          console.log(`[workout-detail] Decoded ${decoded.length} coordinates from polyline`);
          if (decoded.length > 0) {
            // Convert [lat, lng] to gps_track format: [{lat, lng, timestamp, startTimeInSeconds}]
            const workoutTimestamp = row.timestamp 
              ? Math.floor(new Date(row.timestamp).getTime() / 1000)
              : Math.floor(Date.now() / 1000);
            
            gpsTrack = decoded.map(([lat, lng], index) => ({
              lat,
              lng,
              timestamp: (workoutTimestamp + index) * 1000,
              startTimeInSeconds: workoutTimestamp + index
            }));
            console.log(`[workout-detail] Created gps_track with ${gpsTrack.length} points`);
          }
        } catch (decodeErr) {
          console.error('[workout-detail] Failed to decode polyline:', decodeErr);
        }
      } else if (!gpsTrack && !row.gps_trackpoints) {
        console.log(`[workout-detail] No gps_track and no gps_trackpoints for workout ${id}`);
        // If we have strava_activity_id, try to fetch GPS from Strava
        if (row.strava_activity_id && userId) {
          try {
            console.log(`[workout-detail] Attempting to fetch GPS from Strava for activity ${row.strava_activity_id}, userId: ${userId}`);
            // Get Strava access token
            const { data: conn, error: connError } = await supabase
              .from('device_connections')
              .select('connection_data, access_token, refresh_token')
              .eq('user_id', userId)
              .eq('provider', 'strava')
              .maybeSingle();
            
            if (connError) {
              console.error(`[workout-detail] Error fetching Strava connection:`, connError);
            }
            
            if (!conn) {
              console.log(`[workout-detail] No Strava connection found for user ${userId}`);
            }
            
            let accessToken = conn?.connection_data?.access_token || conn?.access_token;
            
            // Refresh token if needed
            if (!accessToken && conn?.refresh_token) {
              const clientId = Deno.env.get('STRAVA_CLIENT_ID');
              const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
              if (clientId && clientSecret) {
                const tokenResp = await fetch('https://www.strava.com/oauth/token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: conn.refresh_token,
                  }),
                });
                if (tokenResp.ok) {
                  const tokenJson = await tokenResp.json();
                  accessToken = tokenJson.access_token;
                }
              }
            }
            
            if (accessToken) {
              console.log(`[workout-detail] Got Strava access token, fetching streams for activity ${row.strava_activity_id}`);
              // Fetch latlng streams from Strava
              const streamsResp = await fetch(`https://www.strava.com/api/v3/activities/${row.strava_activity_id}/streams?keys=latlng`, {
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              });
              
              console.log(`[workout-detail] Strava streams response status: ${streamsResp.status}`);
              
              if (streamsResp.ok) {
                const streams = await streamsResp.json();
                const latlngStream = streams.find((s: any) => s.type === 'latlng');
                
                console.log(`[workout-detail] Found latlng stream: ${!!latlngStream}, data length: ${latlngStream?.data?.length || 0}`);
                
                if (latlngStream && Array.isArray(latlngStream.data) && latlngStream.data.length > 0) {
                  const workoutTimestamp = row.timestamp 
                    ? Math.floor(new Date(row.timestamp).getTime() / 1000)
                    : Math.floor(Date.now() / 1000);
                  
                  gpsTrack = latlngStream.data
                    .filter((p: any) => Array.isArray(p) && p.length === 2)
                    .map(([lat, lng]: [number, number], index: number) => ({
                      lat,
                      lng,
                      timestamp: (workoutTimestamp + index) * 1000,
                      startTimeInSeconds: workoutTimestamp + index
                    }));
                  
                  console.log(`[workout-detail] Fetched ${gpsTrack.length} GPS points from Strava streams`);
                  
                  // Optionally save to database (fire-and-forget)
                  supabase.from('workouts')
                    .update({ gps_track: gpsTrack })
                    .eq('id', id)
                    .then(() => console.log(`[workout-detail] Saved GPS track to database`))
                    .catch((err) => console.warn(`[workout-detail] Failed to save GPS track:`, err));
                } else {
                  console.log(`[workout-detail] No valid latlng stream data found`);
                }
              } else {
                const errorText = await streamsResp.text();
                console.error(`[workout-detail] Strava streams fetch failed: ${streamsResp.status} ${errorText}`);
              }
            } else {
              console.log(`[workout-detail] No Strava access token available`);
            }
          } catch (fetchErr) {
            console.warn(`[workout-detail] Failed to fetch GPS from Strava:`, fetchErr);
          }
        }
      }
      
      (detail as any).gps_track = gpsTrack;
    }
    if (opts.include_sensors) {
      try { (detail as any).sensor_data = typeof row.sensor_data === 'string' ? JSON.parse(row.sensor_data) : (row.sensor_data || null); } catch { (detail as any).sensor_data = row.sensor_data || null; }
    }
    if (opts.include_swim) {
      try { (detail as any).swim_data = typeof row.swim_data === 'string' ? JSON.parse(row.swim_data) : (row.swim_data || null); } catch { (detail as any).swim_data = row.swim_data || null; }
      (detail as any).number_of_active_lengths = row.number_of_active_lengths ?? null;
      (detail as any).pool_length = row.pool_length ?? null;
    }

    // Check if processing is complete (for UI to show loading state if needed)
    const hasSeries = (computed: any) => {
      try {
        const s = computed?.analysis?.series || null;
        const n = Array.isArray(s?.distance_m) ? s.distance_m.length : 0;
        const nt = Array.isArray(s?.time_s) ? s.time_s.length : (Array.isArray(s?.time) ? s.time.length : 0);
        return n > 1 && nt > 1;
      } catch { return false; }
    };
    const processingComplete = hasSeries((detail as any).computed);

    // Don't trigger processing here - let frontend handle it once
    // This prevents duplicate triggers from polling

    // Return workout data immediately (processing happens in background for old workouts)
    return new Response(JSON.stringify({ 
      workout: detail,
      processing_complete: processingComplete
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = (e && (e.message || e.msg)) ? (e.message || e.msg) : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


