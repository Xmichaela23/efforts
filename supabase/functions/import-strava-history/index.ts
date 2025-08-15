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

// Polyline decoder function - Using correct Strava API specification
function decodePolyline(polyline: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  
  console.log(`🔍 Starting polyline decode for: ${polyline.substring(0, 100)}...`);
  console.log(`🔍 Polyline length: ${polyline.length}`);
  
  while (index < polyline.length) {
    let result = 0;
    let shift = 0;
    
    // Decode latitude delta
    do {
      const byte = polyline.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (result >= 0x20);
    
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    
    // Decode longitude delta
    result = 0;
    shift = 0;
    
    do {
      const byte = polyline.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (result >= 0x20);
    
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    
    // For the first coordinate, use the deltas as absolute values
    // For subsequent coordinates, add deltas to the previous coordinate
    let latDegrees: number;
    let lngDegrees: number;
    
    if (coordinates.length === 0) {
      // First coordinate: deltas are absolute values
      latDegrees = dlat / 1e5;
      lngDegrees = dlng / 1e5;
    } else {
      // Subsequent coordinates: add deltas to previous coordinate
      const prevLat = coordinates[coordinates.length - 1][0] * 1e5; // Convert back to 1e5 precision
      const prevLng = coordinates[coordinates.length - 1][1] * 1e5;
      latDegrees = (prevLat + dlat) / 1e5;
      lngDegrees = (prevLng + dlng) / 1e5;
    }
    
    console.log(`🔍 Point ${coordinates.length}: delta lat=${dlat}, delta lng=${dlng}, final lat=${latDegrees.toFixed(6)}°, final lng=${lngDegrees.toFixed(6)}°`);
    
    coordinates.push([latDegrees, lngDegrees]);
  }
  
  console.log(`🔍 Decoded ${coordinates.length} coordinates`);
  if (coordinates.length > 0) {
    console.log(`🔍 First coordinate: [${coordinates[0][0].toFixed(6)}°, ${coordinates[0][1].toFixed(6)}°]`);
    console.log(`🔍 Last coordinate: [${coordinates[coordinates.length-1][0].toFixed(6)}°, ${coordinates[coordinates.length-1][1].toFixed(6)}°]`);
  }
  
  return coordinates;
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

async function convertStravaToWorkout(a: StravaActivity, userId: string, accessToken: string) {
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
  if (a.map?.summary_polyline || a.map?.polyline) {
    const polyline = a.map.summary_polyline || a.map.polyline;
    console.log(`🗺️ Raw polyline for ${a.name}:`, polyline?.substring(0, 100) + '...');
    console.log(`🗺️ Polyline source: ${a.map.summary_polyline ? 'summary_polyline' : 'polyline'}`);
    console.log(`🗺️ Polyline length: ${polyline?.length || 0}`);
    console.log(`🗺️ Full map data:`, a.map);
    console.log(`🗺️ Activity start_latlng:`, a.start_latlng);
    console.log(`🗺️ Activity end_latlng:`, a.end_latlng);
    
    if (polyline) {
      try {
        // Strava's polyline contains absolute coordinates, not relative to start
        const coordinates = decodePolyline(polyline);
        console.log(`🗺️ Decoded coordinates:`, coordinates.slice(0, 3));
        
        // Validate coordinates before converting
        if (coordinates.length > 0) {
          const firstCoord = coordinates[0];
          const lastCoord = coordinates[coordinates.length - 1];
          
          // Check if coordinates are in reasonable ranges (not in the middle of oceans)
          if (firstCoord[0] >= -90 && firstCoord[0] <= 90 && 
              firstCoord[1] >= -180 && firstCoord[1] <= 180 &&
              lastCoord[0] >= -90 && lastCoord[0] <= 90 && 
              lastCoord[1] >= -180 && lastCoord[1] <= 180) {
            
            // Convert to GPSPoint format that ActivityMap expects
            gpsTrack = coordinates.map((coord, index) => {
              const point = {
                lat: coord[0], // coord[0] is latitude (decoder returns [lat, lng])
                lng: coord[1], // coord[1] is longitude (decoder returns [lat, lng])
                timestamp: Date.now() + (index * 1000), // Approximate timestamps
                elevation: null // Strava polyline doesn't include elevation
              };
              
              if (index < 3) {
                console.log(`🗺️ GPSPoint ${index}:`, point);
              }
              
              return point;
            });
            
            console.log(`🗺️ GPS data converted: ${gpsTrack.length} GPSPoints, first: {lat: ${gpsTrack[0].lat}, lng: ${gpsTrack[0].lng}}`);
          } else {
            console.log(`⚠️ Invalid coordinates detected: first=[${firstCoord[0]}, ${firstCoord[1]}], last=[${lastCoord[0]}, ${lastCoord[1]}]`);
            gpsTrack = null;
          }
        } else {
          console.log(`⚠️ No valid coordinates decoded from polyline`);
          gpsTrack = null;
        }
      } catch (err) {
        console.log(`⚠️ Failed to decode polyline: ${err}`);
        gpsTrack = null;
      }
      
      // If polyline failed, try latlng streams as fallback
      if (!gpsTrack && a.id) {
        console.log(`🗺️ Trying latlng streams fallback for activity ${a.id}...`);
        const fallbackCoordinates = await fetchStravaLatLngStreams(a.id, accessToken);
        
        if (fallbackCoordinates && fallbackCoordinates.length > 0) {
          gpsTrack = fallbackCoordinates.map((coord, index) => ({
            lat: coord[0],
            lng: coord[1],
            timestamp: Date.now() + (index * 1000),
            elevation: null
          }));
          
          console.log(`🗺️ Fallback GPS data: ${gpsTrack.length} GPSPoints, first: {lat: ${gpsTrack[0].lat}, lng: ${gpsTrack[0].lng}}`);
        }
      }
    } else {
      console.log(`🗺️ No GPS data found for ${a.name}`);
    }

  return {
    name: a.name || 'Strava Activity',
    type,
    user_id: userId,

    date: new Date(a.start_date_local || a.start_date).toISOString().split('T')[0],
    timestamp: new Date(a.start_date).toISOString(),

    duration,
    elapsed_time: elapsed,
    moving_time: duration,
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

// Fallback: Fetch GPS data from Strava's latlng streams
async function fetchStravaLatLngStreams(activityId: number, accessToken: string): Promise<[number, number][] | null> {
  try {
    console.log(`🗺️ Fetching latlng streams for activity ${activityId} as fallback...`);
    
    const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.log(`⚠️ Could not fetch latlng streams: ${response.status}`);
      return null;
    }
    
    const streams = await response.json();
    const latlngStream = streams.find((s: any) => s.type === 'latlng');
    
    if (latlngStream && latlngStream.data && latlngStream.data.length > 0) {
      // Strava returns [lat, lng] pairs in the data array
      const coordinates: [number, number][] = [];
      
      for (let i = 0; i < latlngStream.data.length; i += 2) {
        if (i + 1 < latlngStream.data.length) {
          const lat = latlngStream.data[i];
          const lng = latlngStream.data[i + 1];
          coordinates.push([lat, lng]);
        }
      }
      
      console.log(`🗺️ LatLng streams fallback: ${coordinates.length} coordinates`);
      return coordinates;
    }
    
    return null;
  } catch (err) {
    console.log(`⚠️ Error fetching latlng streams: ${err}`);
    return null;
  }
}

// Test function to verify polyline decoder
function testPolylineDecoder() {
  // Test with a known Strava polyline (this is a simple route in San Francisco)
  const testPolyline = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
  console.log("🧪 Testing polyline decoder with known data...");
  
  try {
    const coordinates = decodePolyline(testPolyline);
    console.log("🧪 Test result:", coordinates);
    
    // Expected: approximately [38.5, -122.5] (San Francisco area)
    if (coordinates.length > 0) {
      const first = coordinates[0];
      console.log(`🧪 First coordinate: [${first[0].toFixed(6)}, ${first[1].toFixed(6)}]`);
      
      // Check if coordinates are reasonable (not in the middle of oceans)
      if (first[0] >= -90 && first[0] <= 90 && first[1] >= -180 && first[1] <= 180) {
        console.log("✅ Polyline decoder test PASSED - coordinates are valid");
      } else {
        console.log("❌ Polyline decoder test FAILED - coordinates are invalid");
      }
    }
  } catch (err) {
    console.log("❌ Polyline decoder test FAILED with error:", err);
  }
}

// Run test when function loads
testPolylineDecoder();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const { userId, accessToken, refreshToken, maxActivities = 200, startDate, endDate }: ImportRequest = await req.json();
    if (!userId || !accessToken) {
      return new Response('Missing required fields', { status: 400, headers: cors });
    }

    let currentAccessToken = accessToken;

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
        const refreshed = await refreshStravaAccessToken(refreshToken);
        if (refreshed?.access_token) {
          currentAccessToken = refreshed.access_token;
          updatedTokens = refreshed;
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

        const row = await convertStravaToWorkout(detailedActivity, userId, currentAccessToken);
        if (!row.user_id || !row.name || !row.type) { skipped++; continue; }

        const { error } = await supabase.from('workouts').insert(row);
        if (error) { console.error('Insert error:', error); skipped++; continue; }

        existing.add(a.id);
        imported++;

        if (maxActivities && imported >= maxActivities) break;
        
        // Rate limiting - Strava allows 100 requests per 15 minutes
        await new Promise(r => setTimeout(r, 200));
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
