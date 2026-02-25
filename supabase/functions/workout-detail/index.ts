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
      // User feedback (RPE, gear, unified metadata)
      'rpe','gear_id','workout_metadata',
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
    try {
      let se = (()=>{ try { return typeof row.strength_exercises === 'string' ? JSON.parse(row.strength_exercises) : (row.strength_exercises || null); } catch { return row.strength_exercises || null; } })();
      // Normalize strength_exercises sets shape for client (smart server, dumb client)
      if (Array.isArray(se) && se.length > 0) {
        se = se.map((exercise: any, index: number) => ({
          id: exercise.id || `temp-${index}`,
          name: exercise.name || '',
          sets: Array.isArray(exercise.sets)
            ? exercise.sets.map((set: any) => ({
                reps: Number((set?.reps as any) ?? 0) || 0,
                weight: Number((set?.weight as any) ?? 0) || 0,
                rir: typeof set?.rir === 'number' ? set.rir : undefined,
                completed: Boolean(set?.completed)
              }))
            : Array.from({ length: Math.max(1, Number(exercise.sets||0)) }, () => ({ reps: Number(exercise.reps||0)||0, weight: Number(exercise.weight||0)||0, completed: false })),
          reps: Number(exercise.reps || 0) || 0,
          weight: Number(exercise.weight || 0) || 0,
          notes: exercise.notes || '',
          weightMode: exercise.weightMode || 'same'
        }));
      }
      (detail as any).strength_exercises = se;
    } catch {}
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
      console.log(`[workout-detail] Final gps_track for workout ${id}: ${gpsTrack ? (Array.isArray(gpsTrack) ? `${gpsTrack.length} points` : 'non-array') : 'null'}`);
    }
    if (opts.include_sensors) {
      try { (detail as any).sensor_data = typeof row.sensor_data === 'string' ? JSON.parse(row.sensor_data) : (row.sensor_data || null); } catch { (detail as any).sensor_data = row.sensor_data || null; }
    }
    if (opts.include_swim) {
      try { (detail as any).swim_data = typeof row.swim_data === 'string' ? JSON.parse(row.swim_data) : (row.swim_data || null); } catch { (detail as any).swim_data = row.swim_data || null; }
      (detail as any).number_of_active_lengths = row.number_of_active_lengths ?? null;
      (detail as any).pool_length = row.pool_length ?? null;
    }

    // User feedback: RPE and gear (always include - sourced from DB)
    (detail as any).rpe = row.rpe ?? null;
    (detail as any).gear_id = row.gear_id ?? null;
    // Canonical workout_metadata: merge rpe into session_rpe when missing (smart server, dumb client)
    let meta: Record<string, unknown> = {};
    try {
      meta = row.workout_metadata != null
        ? (typeof row.workout_metadata === 'string' ? JSON.parse(row.workout_metadata) : row.workout_metadata)
        : {};
    } catch { meta = {}; }
    if (meta.session_rpe == null && row.rpe != null) meta = { ...meta, session_rpe: row.rpe };
    (detail as any).workout_metadata = meta;

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

    // Normalize interval_breakdown: add executed + planned_label + steps (smart server, dumb client)
    const ib = (detail as any).workout_analysis?.detailed_analysis?.interval_breakdown;
    if (ib?.available && Array.isArray(ib.intervals)) {
      for (const iv of ib.intervals) {
        if (!iv.executed && (iv.actual_duration_s != null || iv.actual_distance_m != null || iv.avg_heart_rate_bpm != null)) {
          iv.executed = {
            distance_m: iv.actual_distance_m ?? null,
            duration_s: iv.actual_duration_s ?? null,
            avg_hr: iv.avg_heart_rate_bpm ?? iv.avg_hr ?? null,
          };
        }
        if (!iv.planned_label && iv.interval_type === 'work') {
          iv.planned_label = `Work · ${iv.actual_duration_s ? `${Math.round(iv.actual_duration_s / 60)} min` : ''}`;
        } else if (!iv.planned_label) {
          iv.planned_label = String(iv.interval_type || '');
        }
      }
      // Add steps array for MobileSummary (stepsFromUnplanned)
      ib.steps = ib.intervals.map((iv: any, idx: number) => ({
        id: iv.interval_id || 'unplanned_interval',
        kind: iv.interval_type || 'work',
        type: iv.interval_type || 'work',
        planned_index: idx,
        seconds: iv.planned_duration_s || iv.actual_duration_s,
        duration_s: iv.actual_duration_s,
        distanceMeters: iv.actual_distance_m,
        pace_range: (iv.planned_pace_range_lower != null && iv.planned_pace_range_upper != null)
          ? { lower: iv.planned_pace_range_lower, upper: iv.planned_pace_range_upper }
          : undefined,
      }));
    }

    // computed_detail_steps: from computed.intervals for MobileSummary (smart server, dumb client)
    const compIntervals = Array.isArray((detail as any).computed?.intervals) ? (detail as any).computed.intervals : [];
    (detail as any).computed_detail_steps = compIntervals
      .filter((it: any) => it && (it.executed || it.duration_s || it.distance_m))
      .map((it: any, idx: number) => {
        const exec = it.executed || it;
        const distM = Number(exec?.distance_m ?? exec?.distanceMeters ?? exec?.distance_meters);
        const durS = Number(exec?.duration_s ?? exec?.durationS ?? it?.duration_s);
        return {
          id: String(it?.planned_step_id || it?.id || `exec_${idx}`),
          kind: String(it?.role || it?.kind || it?.interval_type || it?.type || 'segment'),
          label: String(it?.label || it?.name || it?.role || it?.kind || `Segment ${idx + 1}`),
          planned_index: Number.isFinite(Number(it?.planned_index)) ? Number(it.planned_index) : idx,
          seconds: Number.isFinite(durS) ? durS : undefined,
          duration_s: Number.isFinite(durS) ? durS : undefined,
          distanceMeters: Number.isFinite(distM) ? distM : undefined,
          pace_range: it?.pace_range || it?.planned?.pace_range || it?.paceRange || null,
        };
      });

    // track: canonical [lng,lat][] for CompletedTab (smart server, dumb client)
    const gpsTrack = (detail as any).gps_track;
    if (Array.isArray(gpsTrack) && gpsTrack.length > 0) {
      const track: [number, number][] = gpsTrack
        .map((p: any) => {
          const lng = p?.lng ?? p?.longitude ?? p?.longitudeInDegree ?? (Array.isArray(p) ? p[0] : undefined);
          const lat = p?.lat ?? p?.latitude ?? p?.latitudeInDegree ?? (Array.isArray(p) ? p[1] : undefined);
          if (Number.isFinite(lng) && Number.isFinite(lat)) return [Number(lng), Number(lat)] as [number, number];
          return null;
        })
        .filter(Boolean) as [number, number][];
      (detail as any).track = track;
    } else {
      (detail as any).track = [];
    }

    // samples: canonical sensor_data for MobileSummary.buildSamples (smart server, dumb client)
    const sd = Array.isArray((detail as any).sensor_data?.samples)
      ? (detail as any).sensor_data.samples
      : (Array.isArray((detail as any).sensor_data) ? (detail as any).sensor_data : []);
    const samples: Array<{ t: number; lat?: number; lng?: number; hr?: number; speedMps?: number; cumMeters?: number }> = [];
    for (const s of sd) {
      const t = Number((s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.elapsedDurationInSeconds ?? s.sumDurationInSeconds ?? s.offsetInSeconds ?? s.startTimeInSeconds ?? s.elapsed_s ?? s.t ?? s.time ?? s.seconds ?? samples.length));
      const hr = (s.heartRate ?? s.heart_rate ?? s.hr ?? s.bpm ?? s.heartRateInBeatsPerMinute);
      const speedMps = (s.speedMetersPerSecond ?? s.speedInMetersPerSecond ?? s.enhancedSpeedInMetersPerSecond ?? s.currentSpeedInMetersPerSecond ?? s.instantaneousSpeedInMetersPerSecond ?? s.speed_mps ?? s.enhancedSpeed ?? (typeof s.pace_min_per_km === 'number' ? (1000 / (s.pace_min_per_km * 60)) : undefined) ?? (typeof s.paceInSecondsPerKilometer === 'number' ? (1000 / s.paceInSecondsPerKilometer) : undefined));
      const cumMeters = (typeof s.totalDistanceInMeters === 'number' ? s.totalDistanceInMeters : (typeof s.distanceInMeters === 'number' ? s.distanceInMeters : (typeof s.cumulativeDistanceInMeters === 'number' ? s.cumulativeDistanceInMeters : (typeof s.totalDistance === 'number' ? s.totalDistance : (typeof s.distance === 'number' ? s.distance : undefined)))));
      samples.push({ t: Number.isFinite(t) ? t : samples.length, hr: typeof hr === 'number' ? hr : undefined, speedMps: typeof speedMps === 'number' ? speedMps : undefined, cumMeters });
    }
    // Merge GPS into samples
    if (Array.isArray(gpsTrack) && gpsTrack.length > 0) {
      for (let i = 0; i < gpsTrack.length; i++) {
        const g: any = gpsTrack[i];
        const lat = (g?.lat ?? g?.latitude ?? g?.latitudeInDegree ?? (Array.isArray(g) ? g[1] : undefined)) as number | undefined;
        const lng = (g?.lng ?? g?.longitude ?? g?.longitudeInDegree ?? (Array.isArray(g) ? g[0] : undefined)) as number | undefined;
        const t = Number((g?.startTimeInSeconds ?? g?.elapsed_s ?? g?.t ?? g?.seconds) || i);
        if (samples[i]) { samples[i].lat = lat; samples[i].lng = lng; samples[i].t = Number.isFinite(t) ? t : samples[i].t; }
        else { samples.push({ t: Number.isFinite(t) ? t : i, lat, lng }); }
      }
      samples.sort((a, b) => (a.t || 0) - (b.t || 0));
    }
    (detail as any).samples = samples;

    // display_metrics: WorkoutDataNormalized for useWorkoutData (smart server, dumb client)
    const d = detail as any;
    const getDistM = () => { const distKm = Number.isFinite(d?.distance) ? Number(d.distance) * 1000 : null; const distM = d?.computed?.overall?.distance_m ?? null; return Number.isFinite(distM) && distM > 0 ? Number(distM) : (Number.isFinite(distKm) ? Number(distKm) : null); };
    const distM = getDistM();
    const distKm = Number.isFinite(distM) && distM > 0 ? distM / 1000 : null;
    const durS = Number.isFinite(d?.computed?.overall?.duration_s_moving) ? Number(d.computed.overall.duration_s_moving) : (Number.isFinite(d?.moving_time ?? d?.metrics?.moving_time) ? Number(d.moving_time ?? d.metrics.moving_time) * 60 : null);
    const elapsedS = Number.isFinite(d?.computed?.overall?.duration_s_elapsed) ? Number(d.computed.overall.duration_s_elapsed) : (Number.isFinite(d?.elapsed_time ?? d?.metrics?.elapsed_time) ? Number(d.elapsed_time ?? d.metrics.elapsed_time) * 60 : null) ?? durS;
    const elevation_gain_m = Number.isFinite(d?.elevation_gain ?? d?.metrics?.elevation_gain) ? Number(d.elevation_gain ?? d.metrics.elevation_gain) : null;
    const avg_power = Number.isFinite(d?.avg_power ?? d?.metrics?.avg_power) ? Number(d.avg_power ?? d.metrics.avg_power) : null;
    const avg_hr = Number.isFinite(d?.avg_heart_rate ?? d?.metrics?.avg_heart_rate) ? Number(d.avg_heart_rate ?? d.metrics.avg_heart_rate) : null;
    const max_hr = Number.isFinite(d?.max_heart_rate ?? d?.metrics?.max_heart_rate) ? Number(d.max_heart_rate ?? d.metrics.max_heart_rate) : null;
    const max_power = Number.isFinite(d?.max_power ?? d?.metrics?.max_power) ? Number(d.max_power ?? d.metrics.max_power) : null;
    const avg_speed_kmh = Number.isFinite(d?.metrics?.avg_speed) ? Number(d.metrics.avg_speed) : (Number.isFinite(d?.avg_speed) ? Number(d.avg_speed) : (distKm && durS && durS > 0 ? (distKm / (durS / 3600)) : null));
    const avg_speed_mps = Number.isFinite(avg_speed_kmh) ? avg_speed_kmh / 3.6 : null;
    const avg_pace_s_per_km = Number.isFinite(d?.computed?.overall?.avg_pace_s_per_mi) ? Number(d.computed.overall.avg_pace_s_per_mi) / 1.60934 : (Number.isFinite(d?.avg_pace ?? d?.metrics?.avg_pace) ? Number(d.avg_pace ?? d.metrics.avg_pace) : (avg_speed_kmh && avg_speed_kmh > 0 ? (3600 / avg_speed_kmh) : null));
    const max_speed_mps = Number.isFinite(d?.computed?.overall?.max_speed_mps) ? Number(d.computed.overall.max_speed_mps) : (Number.isFinite(d?.max_speed ?? d?.metrics?.max_speed) ? Number(d.max_speed ?? d.metrics.max_speed) / 3.6 : null);
    const max_pace_s_per_km = Number.isFinite(d?.computed?.analysis?.bests?.max_pace_s_per_km) ? Number(d.computed.analysis.bests.max_pace_s_per_km) : (Number.isFinite(d?.metrics?.max_pace ?? d?.max_pace) ? Number(d.metrics?.max_pace ?? d.max_pace) : (max_speed_mps && max_speed_mps > 0 ? (1000 / max_speed_mps) : null));
    const max_cadence_rpm = Number.isFinite(d?.max_cadence ?? d?.max_cycling_cadence ?? d?.max_running_cadence) ? Number(d.max_cadence ?? d.max_cycling_cadence ?? d.max_running_cadence) : null;
    const avg_running_cadence_spm = Number.isFinite(d?.avg_cadence ?? d?.avg_running_cadence ?? d?.avg_run_cadence) ? Number(d.avg_cadence ?? d.avg_running_cadence ?? d.avg_run_cadence) : null;
    const avg_cycling_cadence_rpm = Number.isFinite(d?.avg_cadence ?? d?.avg_bike_cadence ?? d?.metrics?.avg_bike_cadence) ? Number(d.avg_cadence ?? d.avg_bike_cadence ?? d.metrics?.avg_bike_cadence) : null;
    const calories = Number.isFinite(d?.calories ?? d?.metrics?.calories) ? Number(d.calories ?? d.metrics.calories) : null;
    const powerMetrics = d?.computed?.analysis?.power;
    const normalized_power = Number.isFinite(powerMetrics?.normalized_power) ? Number(powerMetrics.normalized_power) : null;
    const intensity_factor = Number.isFinite(powerMetrics?.intensity_factor) ? Number(powerMetrics.intensity_factor) : null;
    const variability_index = Number.isFinite(powerMetrics?.variability_index) ? Number(powerMetrics.variability_index) : null;
    const swimMetrics = d?.computed?.analysis?.swim;
    const avg_swim_pace_per_100m = Number.isFinite(swimMetrics?.avg_pace_per_100m) ? Number(swimMetrics.avg_pace_per_100m) : null;
    const avg_swim_pace_per_100yd = Number.isFinite(swimMetrics?.avg_pace_per_100yd) ? Number(swimMetrics.avg_pace_per_100yd) : null;
    const work_kj = Number.isFinite(d?.total_work) ? Number(d.total_work) : null;
    (detail as any).display_metrics = { distance_m: distM, distance_km: distKm, duration_s: durS, elapsed_s: elapsedS, elevation_gain_m: elevation_gain_m, avg_power, avg_hr, max_hr, max_power, max_speed_mps, max_pace_s_per_km, max_cadence_rpm, avg_speed_kmh, avg_speed_mps, avg_pace_s_per_km, avg_running_cadence_spm, avg_cycling_cadence_rpm, avg_swim_pace_per_100m, avg_swim_pace_per_100yd, calories, work_kj, normalized_power, intensity_factor, variability_index, sport: (d?.type || null), series: d?.computed?.analysis?.series || null };

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


