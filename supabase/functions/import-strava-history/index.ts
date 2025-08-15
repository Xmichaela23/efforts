import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STRAVA_CLIENT_ID = Deno.env.get('STRAVA_CLIENT_ID');
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET');

type FourTypes = 'run' | 'ride' | 'swim' | 'strength' | 'walk';

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  trainer: boolean;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  max_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  kilojoules?: number;
  calories?: number;
  map?: { polyline?: string; summary_polyline?: string };
  start_latlng?: [number, number];
  end_latlng?: [number, number];
}

interface ImportRequest {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  importType: 'historical' | 'recent';
  maxActivities?: number;
  startDate?: string;
  endDate?: string;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Simple helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch with automatic 429 backoff. Keeps streams ON but pauses instead of failing.
async function fetchWithRateLimit(url: string, init?: RequestInit): Promise<Response> {
  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    const resetHeader = res.headers.get('X-RateLimit-Reset');
    // If Strava provided a reset epoch (seconds), wait until then; otherwise wait 60s
    const waitMs = resetHeader ? Math.max(0, Number(resetHeader) * 1000 - Date.now()) : 60_000;
    console.log(`⏳ Strava 429 Rate Limit – waiting ${Math.ceil(waitMs/1000)}s before retry...`);
    await sleep(waitMs || 60_000);
  }
}

// Small utilities for GPS validation
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

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

// GPS data fetching function - uses Strava's latlng streams API
async function fetchStravaLatLngStreams(activityId: number, accessToken: string): Promise<[number, number][] | null> {
  try {
    console.log(`🗺️ Fetching latlng streams for activity ${activityId}...`);

    const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.log(`⚠️ Could not fetch latlng streams: ${response.status}`);
      return null;
    }

    const streams = await response.json();
    const latlngStream = streams.find((s: any) => s.type === 'latlng');

    if (latlngStream && Array.isArray(latlngStream.data) && latlngStream.data.length > 0) {
      // Strava returns [[lat, lng], ...]
      const coordinates: [number, number][] = latlngStream.data
        .filter((p: any) => Array.isArray(p) && p.length === 2)
        .map((p: [number, number]) => [p[0], p[1]]);

      console.log(`🗺️ LatLng streams: ${coordinates.length} coordinates`);
      return coordinates;
    }

    return null;
  } catch (err) {
    console.log(`⚠️ Error fetching latlng streams: ${err}`);
    return null;
  }
}

// Fetch multiple Strava streams (latlng, altitude, time) using key_by_type for easy parsing
async function fetchStravaStreams(
  activityId: number,
  accessToken: string
): Promise<{
  latlng?: [number, number][],
  altitude?: number[],
  time?: number[],
  heartrate?: number[],
  velocity_smooth?: number[],
  cadence?: number[],
  watts?: number[],
  distance?: number[]
} | null> {
  try {
    const url = `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,altitude,time,heartrate,velocity_smooth,cadence,watts,distance&key_by_type=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.log(`⚠️ Streams (key_by_type) fetch failed: ${res.status}`);
      return null;
    }
    const obj = await res.json();
    const pick = (k: string) => (Array.isArray(obj?.[k]?.data) ? obj[k].data : undefined);
    return {
      latlng: pick('latlng'),
      altitude: pick('altitude'),
      time: pick('time'),
      heartrate: pick('heartrate'),
      velocity_smooth: pick('velocity_smooth'),
      cadence: pick('cadence'),
      watts: pick('watts'),
      distance: pick('distance'),
    } as any;
  } catch (e) {
    console.log('⚠️ Error fetching streams (key_by_type):', e);
    return null;
  }
}

function mapStravaTypeToWorkoutType(a: StravaActivity): FourTypes {
  const s = (a.sport_type || a.type || '').toLowerCase();

  if (['run', 'trailrun', 'virtualrun', 'treadmillrun'].some(x => s.includes(x))) return 'run';

  if (s.includes('walk')) return 'walk';

  if (
    ['ride', 'virtualride', 'ebikeride', 'indoorcycling', 'mountainbikeride', 'gravelride'].some(x => s.includes(x)) ||
    !!a.trainer
  ) return 'ride';

  if (s.includes('swim')) return 'swim';

  return 'strength';
}

async function convertStravaToWorkout(a: StravaActivity, userId: string, accessToken: string, importMode: 'historical' | 'recent') {
  const type = mapStravaTypeToWorkoutType(a);
  
  // Debug logging for ride detection
  console.log(`🏃‍♂️ Activity: ${a.name}, Type: ${a.type}, Sport: ${a.sport_type}, Trainer: ${a.trainer}, Mapped to: ${type}`);

  const duration = Math.max(0, Math.round((a.moving_time ?? 0) / 60));
  const elapsed = Math.max(0, Math.round((a.elapsed_time ?? 0) / 60));
  // Convert meters to kilometers with 2 decimals
  const distance = Math.max(0, Math.round(((a.distance ?? 0) / 1000) * 100) / 100);
  
  // Speed calculations (m/s to km/h)
  const avgSpeed = a.average_speed != null ? Math.round(a.average_speed * 3.6 * 100) / 100 : null;
  const maxSpeed = a.max_speed != null ? Math.round(a.max_speed * 3.6 * 100) / 100 : null;
  
  // Debug speed calculations
  console.log(`🚴 Speed debug for ${a.name}:`, {
    rawAvgSpeed: a.average_speed,
    rawMaxSpeed: a.max_speed,
    convertedAvgSpeed: avgSpeed,
    convertedMaxSpeed: maxSpeed,
    distance: a.distance,
    duration: a.moving_time,
    // Add unit conversion details
    avgSpeedMs: a.average_speed,
    avgSpeedKmh: a.average_speed ? (a.average_speed * 3.6) : null,
    maxSpeedMs: a.max_speed,
    maxSpeedKmh: a.max_speed ? (a.max_speed * 3.6) : null
  });

  // Pace calculations (min/km from m/s) - only calculate if speed > 0
  const avgPace = a.average_speed && a.average_speed > 0 ? Math.round((1000 / a.average_speed / 60) * 100) / 100 : null;
  const maxPace = a.max_speed && a.max_speed > 0 ? Math.round((1000 / a.max_speed / 60) * 100) / 100 : null;

  // Heart rate (BPM)
  const avgHr = a.average_heartrate != null ? Math.round(a.average_heartrate) : null;
  const maxHr = a.max_heartrate != null ? Math.round(a.max_heartrate) : null;
  
  // Power (Watts)
  const avgPwr = a.average_watts != null ? Math.round(a.average_watts) : null;
  const maxPwr = a.max_watts != null ? Math.round(a.max_watts) : null;
  
  // Cadence (RPM for bikes, steps/min for runs)
  const avgCad = a.average_cadence != null ? Math.round(a.average_cadence) : null;
  const maxCad = a.max_cadence != null ? Math.round(a.max_cadence) : null;
  
  // Elevation and calories
  const elev = a.total_elevation_gain != null ? Math.round(a.total_elevation_gain) : null;
  const cals = a.calories != null ? Math.round(a.calories) : null;

  // Debug basic metrics
  console.log(`📊 Basic metrics for ${a.name}:`, {
    hr: a.average_heartrate,
    maxHr: a.max_heartrate,
    calories: a.calories,
    cadence: a.average_cadence,
    maxCadence: a.max_cadence,
    power: a.average_watts,
    maxPower: a.max_watts,
    // Add cadence debugging
    rawCadence: a.average_cadence,
    rawMaxCadence: a.max_cadence,
    processedCadence: avgCad,
    processedMaxCadence: maxCad
  });

  // Process GPS data for Mapbox rendering
  let gpsTrack: any[] | null = null;

  const useTrack = (coords: [number, number][]) => {
    const filtered = coords.filter(([lat, lng]) => isValidCoord(lat, lng));
    if (filtered.length === 0) return null;
    const startMs = a.start_date ? new Date(a.start_date).getTime() : Date.now();
    return filtered.map(([lat, lng], i) => ({ lat, lng, timestamp: startMs + i * 1000, elevation: null }));
  };

  // Prefer detailed polyline; fallback to summary; then to streams
  const encoded = a.map?.polyline || a.map?.summary_polyline || null;
  if (encoded) {
    try {
      const decoded = decodePolyline(encoded); // [[lat,lng],...]
      let candidate = useTrack(decoded);
      // Sanity: if start_latlng exists, ensure first point isn't wildly far away
      if (candidate && a.start_latlng && isValidCoord(a.start_latlng[0], a.start_latlng[1])) {
        const first = candidate[0];
        const distKm = haversineKm(a.start_latlng[0], a.start_latlng[1], first.lat, first.lng);
        if (distKm > 100) {
          console.warn(`Rejecting polyline track: first point ${distKm.toFixed(1)} km from start_latlng`);
          candidate = null;
        }
      }
      gpsTrack = candidate;
      if (gpsTrack) console.log(`🗺️ Polyline decoded: ${gpsTrack.length} points. First:`, gpsTrack[0]);
    } catch (e) {
      console.log('⚠️ Polyline decode failed, will try streams:', e);
    }
  }

  // Fallback to streams or enrich with altitude/time (enabled for all imports)
  if (!gpsTrack && a.id) {
    const streams = await fetchStravaStreams(a.id, accessToken);
    if (streams?.latlng && streams.latlng.length > 0) {
      const n = streams.latlng.length;
      const startMs = a.start_date ? new Date(a.start_date).getTime() : Date.now();
      const hasAlt = Array.isArray(streams.altitude) && streams.altitude.length === n;
      const hasTime = Array.isArray(streams.time) && streams.time.length === n;
      const hasHr = Array.isArray(streams.heartrate) && streams.heartrate.length === n;
      const hasSpeed = Array.isArray(streams.velocity_smooth) && streams.velocity_smooth.length === n;
      const hasCad = Array.isArray(streams.cadence) && streams.cadence.length === n;
      const hasPwr = Array.isArray(streams.watts) && streams.watts.length === n;
      const hasDist = Array.isArray(streams.distance) && streams.distance.length === n;

      const built: any[] = [];
      for (let i = 0; i < n; i++) {
        const pair = streams.latlng[i];
        if (!pair || pair.length !== 2) continue;
        const lat = pair[0];
        const lng = pair[1];
        if (!isValidCoord(lat, lng)) continue;
        built.push({
          lat,
          lng,
          timestamp: hasTime ? startMs + streams.time![i] * 1000 : startMs + i * 1000,
          elevation: hasAlt ? streams.altitude![i] : null,
          hr: hasHr ? streams.heartrate![i] : null,
          speed_mps: hasSpeed ? streams.velocity_smooth![i] : null,
          cadence: hasCad ? streams.cadence![i] : null,
          power: hasPwr ? streams.watts![i] : null,
          distance_m: hasDist ? streams.distance![i] : null,
        });
      }
      gpsTrack = built.length ? built : null;
      if (gpsTrack) console.log(`🗺️ Streams used (enriched): ${gpsTrack.length} points. First:`, gpsTrack[0]);
    }
  } else if (gpsTrack && a.id) {
    // We have polyline positions; try to enrich with streams (alt/time + metrics) if available
    const streams = await fetchStravaStreams(a.id, accessToken);
    if (streams) {
      const n = gpsTrack.length;
      const startMs = a.start_date ? new Date(a.start_date).getTime() : null;
      const len = (arr?: any[]) => (Array.isArray(arr) ? arr.length : 0);
      const idx = (i: number, arrLen: number) => {
        if (arrLen <= 1 || n <= 1) return 0;
        const j = Math.round((i * (arrLen - 1)) / (n - 1));
        return Math.min(Math.max(j, 0), arrLen - 1);
      };

      gpsTrack = gpsTrack.map((p, i) => {
        const iTime = idx(i, len(streams.time));
        const iAlt = idx(i, len(streams.altitude));
        const iHr = idx(i, len(streams.heartrate));
        const iSpd = idx(i, len(streams.velocity_smooth));
        const iCad = idx(i, len(streams.cadence));
        const iPwr = idx(i, len(streams.watts));
        const iDst = idx(i, len(streams.distance));

        return {
          ...p,
          timestamp:
            startMs && len(streams.time)
              ? startMs + (streams.time as number[])[iTime] * 1000
              : p.timestamp,
          elevation:
            len(streams.altitude)
              ? (streams.altitude as number[])[iAlt]
              : p.elevation,
          hr:
            len(streams.heartrate)
              ? (streams.heartrate as number[])[iHr]
              : (p as any).hr,
          speed_mps:
            len(streams.velocity_smooth)
              ? (streams.velocity_smooth as number[])[iSpd]
              : (p as any).speed_mps,
          cadence:
            len(streams.cadence)
              ? (streams.cadence as number[])[iCad]
              : (p as any).cadence,
          power:
            len(streams.watts)
              ? (streams.watts as number[])[iPwr]
              : (p as any).power,
          distance_m:
            len(streams.distance)
              ? (streams.distance as number[])[iDst]
              : (p as any).distance_m,
        };
      });
      console.log('🗺️ Polyline enriched with streams (alt/time/metrics) using index scaling');
    }
  }

  // Post-process: derive distance and speed if missing
  if (gpsTrack && gpsTrack.length > 1) {
    // Ensure first distance is initialized
    if ((gpsTrack[0] as any).distance_m == null) (gpsTrack[0] as any).distance_m = 0;
    for (let i = 1; i < gpsTrack.length; i++) {
      const prev = gpsTrack[i - 1];
      const curr = gpsTrack[i];
      // Fix non-monotonic timestamps by enforcing +1s minimum step
      let dtSec = (curr.timestamp - prev.timestamp) / 1000;
      if (!Number.isFinite(dtSec) || dtSec <= 0) dtSec = 1;
      const dMeters = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng) * 1000;
      if ((curr as any).distance_m == null) {
        (curr as any).distance_m = ((prev as any).distance_m ?? 0) + (Number.isFinite(dMeters) ? dMeters : 0);
      }
      if ((curr as any).speed_mps == null && Number.isFinite(dMeters)) {
        (curr as any).speed_mps = dMeters / dtSec;
      }
    }
  }

  return {
    name: a.name || 'Strava Activity',
    type,
    user_id: userId,

    date: new Date(a.start_date_local || a.start_date).toISOString().split('T')[0],
    timestamp: new Date(a.start_date).toISOString(),

    duration,
    elapsed_time: elapsed,
    moving_time: a.moving_time ?? null,
    distance,
    avg_speed: avgSpeed,
    max_speed: maxSpeed,
    avg_pace: avgPace,
    max_pace: maxPace, // Add missing max_pace field
    avg_heart_rate: avgHr,
    max_heart_rate: maxHr,
    avg_power: avgPwr,
    max_power: maxPwr,
    avg_cadence: avgCad,
    max_cadence: maxCad,
    elevation_gain: elev,
    // Store avg_vam in km/h to match existing UI expectation
    avg_vam: (elev && a.moving_time && a.moving_time > 0) ? ((elev / 1000) / (a.moving_time / 3600)) : null,
    calories: cals,

    workout_status: 'completed',
    completedmanually: false,
    source: 'strava',
    is_strava_imported: true,
    strava_activity_id: a.id,

    // GPS data for Mapbox rendering
    gps_track: gpsTrack, // This is what the UI expects for maps
    gps_trackpoints: a.map?.polyline ?? null, // Keep polyline string as backup
    start_position_lat: null,
    start_position_long: null,

    strava_data: {
      original_activity: a,
      import_date: new Date().toISOString(),
    },
    intervals: [],

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function refreshStravaAccessToken(refreshToken: string | undefined) {
  if (!refreshToken || !STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) return null;
  const resp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!resp.ok) return null;
  return await resp.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const { userId, accessToken, refreshToken, importType = 'historical', maxActivities = 200, startDate, endDate }: ImportRequest = await req.json();
    if (!userId) {
      return new Response('Missing required userId', { status: 400, headers: cors });
    }

    // Fetch stored connection tokens so the client doesn't need to pass them
    const { data: conn } = await supabase
      .from('device_connections')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .single();

    let currentAccessToken = accessToken || conn?.access_token || '';
    let currentRefreshToken = refreshToken || conn?.refresh_token || '';
    
    if (!currentAccessToken && !currentRefreshToken) {
      return new Response('Missing tokens', { status: 400, headers: cors });
    }

    // Use current tokens as-is. We refresh only on 401 below.

    const mode = importType || 'historical';

    const existingRes = await supabase
      .from('workouts')
      .select('strava_activity_id')
      .eq('user_id', userId)
      .not('strava_activity_id', 'is', null);

    const existing = new Set<number>((existingRes.data || []).map((w: any) => w.strava_activity_id));

    let imported = 0;
    let skipped = 0;
    let page = 1;
    const perPage = 200;
    let updatedTokens: any = null;

    while (true) {
      let url = `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`;
      if (startDate) url += `&after=${Math.floor(new Date(startDate).getTime() / 1000)}`;
      if (endDate) url += `&before=${Math.floor(new Date(endDate).getTime() / 1000)}`;
      
      console.log(`🔍 Requesting Strava API: ${url}`);
      
      let res = await fetch(url, {
        headers: { Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json' },
      });

      if (res.status === 401) {
        const refreshed = await refreshStravaAccessToken(currentRefreshToken);
        if (refreshed?.access_token) {
          currentAccessToken = refreshed.access_token;
          currentRefreshToken = refreshed.refresh_token ?? currentRefreshToken;
          updatedTokens = refreshed;
          // Persist rotated tokens immediately
          try {
            await supabase
              .from('device_connections')
              .update({
                access_token: refreshed.access_token,
                refresh_token: currentRefreshToken ?? null,
                expires_at: refreshed.expires_at ? new Date(refreshed.expires_at * 1000).toISOString() : null,
                last_sync: new Date().toISOString(),
              })
              .eq('user_id', userId)
              .eq('provider', 'strava');
          } catch (_) {
            // best-effort; continue
          }
          res = await fetch(url, {
            headers: { Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json' },
          });
        }
      }

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Strava API error ${res.status}: ${txt}`);
      }

      const activities: StravaActivity[] = await res.json();
      console.log(`🔍 Strava API response: ${activities.length} activities`);
      
      if (activities.length > 0) {
        console.log(`🔍 First activity: ${activities[0].name}, ID: ${activities[0].id}`);
        console.log(`🔍 First activity map data:`, activities[0].map);
        console.log(`🔍 First activity polyline: ${activities[0].map?.summary_polyline?.substring(0, 100)}...`);
        console.log(`🔍 First activity polyline length: ${activities[0].map?.summary_polyline?.length || 0}`);
      }
      
      if (!activities.length) break;

      for (const a of activities) {
        if (existing.has(a.id)) { skipped++; continue; }

        // Fetch detailed activity data to get HR, calories, etc.
        let detailedActivity = a;
        try {
          const detailRes = await fetch(`https://www.strava.com/api/v3/activities/${a.id}`, {
            headers: { Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json' },
          });
          
          if (detailRes.ok) {
            detailedActivity = await detailRes.json();
            console.log(`📊 Detailed data for ${a.name}: HR=${detailedActivity.average_heartrate}, Calories=${detailedActivity.calories}, Cadence=${detailedActivity.average_cadence}`);
          }
        } catch (err) {
          console.log(`⚠️ Could not fetch detailed data for activity ${a.id}: ${err}`);
        }

        const row = await convertStravaToWorkout(detailedActivity, userId, currentAccessToken, mode);
        if (!row.user_id || !row.name || !row.type) { skipped++; continue; }

        const { error } = await supabase.from('workouts').insert(row);
        if (error) { console.error('Insert error:', error); skipped++; continue; }

        existing.add(a.id);
        imported++;

        if (maxActivities && imported >= maxActivities) break;
        
        // Rate limiting - gentle delay to reduce 429s
        await new Promise(r => setTimeout(r, 450));
      }

      if (activities.length < perPage || (maxActivities && imported >= maxActivities)) break;
      page += 1;
      await new Promise(r => setTimeout(r, 100));
    }

    await supabase
      .from('device_connections')
      .update({
        last_sync: new Date().toISOString(),
        connection_data: {
          last_import: new Date().toISOString(),
          total_imported: imported,
          total_skipped: skipped,
        },
      })
      .eq('user_id', userId)
      .eq('provider', 'strava');

    return new Response(JSON.stringify({ success: true, imported, skipped, tokens: updatedTokens }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ Import error:', err);
    return new Response(JSON.stringify({ success: false, error: `${err}` }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
