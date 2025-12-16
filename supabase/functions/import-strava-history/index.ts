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

    // Log rate headers for the streams endpoint as well
    try {
      const limit = response.headers.get('X-RateLimit-Limit');
      const usage = response.headers.get('X-RateLimit-Usage');
      const reset = response.headers.get('X-RateLimit-Reset');
      if (limit || usage || reset) {
        console.log(`📈 Strava rate headers (streams ${activityId}): usage=${usage} limit=${limit} reset=${reset} status=${response.status}`);
      }
    } catch (_) {}

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

// Fetch multiple streams (latlng, altitude, time, heartrate, cadence, watts) to enrich gps_track and metrics
async function fetchStravaStreamsData(
  activityId: number,
  accessToken: string
): Promise<{ latlng?: [number, number][], altitude?: number[], time?: number[], heartrate?: number[], cadence?: number[], watts?: number[] } | null> {
  try {
    console.log(`🗺️ Fetching combined streams (latlng, altitude, time, heartrate, cadence, watts) for activity ${activityId}...`);

    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,altitude,time,heartrate,cadence,watts`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    try {
      const limit = response.headers.get('X-RateLimit-Limit');
      const usage = response.headers.get('X-RateLimit-Usage');
      const reset = response.headers.get('X-RateLimit-Reset');
      if (limit || usage || reset) {
        console.log(`📈 Strava rate headers (combined streams ${activityId}): usage=${usage} limit=${limit} reset=${reset} status=${response.status}`);
      }
    } catch (_) {}

    if (!response.ok) {
      console.log(`⚠️ Could not fetch combined streams: ${response.status}`);
      return null;
    }

    const streams = await response.json();
    const latlng = streams.find((s: any) => s.type === 'latlng')?.data || undefined;
    const altitude = streams.find((s: any) => s.type === 'altitude')?.data || undefined;
    const time = streams.find((s: any) => s.type === 'time')?.data || undefined;
    const heartrate = streams.find((s: any) => s.type === 'heartrate')?.data || undefined;
    const cadence = streams.find((s: any) => s.type === 'cadence')?.data || undefined;
    const watts = streams.find((s: any) => s.type === 'watts')?.data || undefined;

    const result: { latlng?: [number, number][], altitude?: number[], time?: number[], heartrate?: number[], cadence?: number[], watts?: number[] } = {};
    if (Array.isArray(latlng) && latlng.length > 0) {
      result.latlng = latlng
        .filter((p: any) => Array.isArray(p) && p.length === 2)
        .map((p: [number, number]) => [p[0], p[1]]);
    }
    if (Array.isArray(altitude) && altitude.length > 0) result.altitude = altitude as number[];
    if (Array.isArray(time) && time.length > 0) result.time = time as number[];
    if (Array.isArray(heartrate) && heartrate.length > 0) result.heartrate = heartrate as number[];
    if (Array.isArray(cadence) && cadence.length > 0) result.cadence = cadence as number[];
    if (Array.isArray(watts) && watts.length > 0) result.watts = watts as number[];

    if (!result.latlng && !result.altitude && !result.time && !result.heartrate && !result.cadence && !result.watts) return null;
    console.log(`🗺️ Combined streams fetched: latlng=${result.latlng?.length || 0}, altitude=${result.altitude?.length || 0}, time=${result.time?.length || 0}, hr=${result.heartrate?.length || 0}, cad=${result.cadence?.length || 0}, watts=${result.watts?.length || 0}`);
    return result;
  } catch (err) {
    console.log(`⚠️ Error fetching combined streams: ${err}`);
    return null;
  }
}

function mapStravaTypeToWorkoutType(a: StravaActivity): FourTypes {
  const s = (a.sport_type || a.type || '').toLowerCase();

  if (['run', 'trailrun', 'virtualrun', 'treadmillrun'].some(x => s.includes(x))) return 'run';

  // Treat hikes as walking for category, preserve raw label elsewhere
  if (s.includes('walk') || s.includes('hike')) return 'walk';

  if (
    ['ride', 'virtualride', 'ebikeride', 'indoorcycling', 'mountainbikeride', 'gravelride'].some(x => s.includes(x)) ||
    !!a.trainer
  ) return 'ride';

  if (s.includes('swim')) return 'swim';

  return 'strength';
}

// --- Reverse geocoding helper (using OpenStreetMap Nominatim) ---
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    // Rate limit: max 1 request per second (Nominatim requirement)
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

  // Pace calculations stored as seconds per km (to match Garmin/UI expectations)
  const avgPace = a.average_speed && a.average_speed > 0 ? Math.round(1000 / a.average_speed) : null;
  const maxPace = a.max_speed && a.max_speed > 0 ? Math.round(1000 / a.max_speed) : null;

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
    return filtered.map(([lat, lng], i) => ({ lat, lng, timestamp: Date.now() + i * 1000, elevation: null }));
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

  if (!gpsTrack && a.id) {
    const coordinates = await fetchStravaLatLngStreams(a.id, accessToken);
    const candidate = coordinates ? useTrack(coordinates) : null;
    if (candidate) {
      gpsTrack = candidate;
      console.log(`🗺️ Streams used: ${gpsTrack.length} points. First:`, gpsTrack[0]);
    }
  }

  // Enrich gpsTrack with altitude and proper timestamps if available
  let sensorData: any[] | null = null;
  try {
    if (a.id) {
      const streams = await fetchStravaStreamsData(a.id, accessToken);
      if (streams) {
        const startEpochSec = Math.floor(new Date(a.start_date).getTime() / 1000);
        // If we have latlng in streams and either gpsTrack is empty or lengths match poorly, rebuild from streams
        if (streams.latlng && streams.latlng.length > 0) {
          const len = streams.latlng.length;
          const altLen = streams.altitude?.length || 0;
          const timeLen = streams.time?.length || 0;
          const useLen = Math.min(len, altLen || len, timeLen || len);
          gpsTrack = new Array(useLen).fill(0).map((_, i) => {
            const [lat, lng] = streams.latlng![i];
            const elev = streams.altitude && Number.isFinite(streams.altitude[i]) ? streams.altitude[i] : null;
            const tRel = streams.time && Number.isFinite(streams.time[i]) ? streams.time[i] : i;
            return {
              lat,
              lng,
              elevation: elev,
              // Provide both to maximize compatibility
              startTimeInSeconds: startEpochSec + (tRel as number),
              timestamp: (startEpochSec + (tRel as number)) * 1000,
            };
          });
          console.log(`🗺️ gpsTrack rebuilt from combined streams: ${gpsTrack.length} points`);
        } else if (gpsTrack && gpsTrack.length > 0 && (streams.altitude || streams.time)) {
          // Merge altitude/time into existing gpsTrack by index
          const len = gpsTrack.length;
          const useLen = Math.min(
            len,
            streams.altitude?.length || len,
            streams.time?.length || len
          );
          for (let i = 0; i < useLen; i++) {
            if (streams.altitude && Number.isFinite(streams.altitude[i])) {
              gpsTrack[i].elevation = streams.altitude[i];
            }
            if (streams.time && Number.isFinite(streams.time[i])) {
              const t = startEpochSec + streams.time[i];
              gpsTrack[i].startTimeInSeconds = t;
              gpsTrack[i].timestamp = t * 1000;
            }
          }
          console.log(`🗺️ gpsTrack enriched with altitude/time. Updated points: ${useLen}/${len}`);
        }

        // Build sensor_data with heart rate stream if present
        if (streams.heartrate && streams.heartrate.length > 0) {
          const hrLen = streams.heartrate.length;
          const timeLen = streams.time?.length || 0;
          const useLen = Math.min(hrLen, timeLen || hrLen);
          sensorData = new Array(useLen).fill(0).map((_, i) => {
            const hr = streams.heartrate![i];
            const relSec = streams.time ? streams.time[i] : i;
            const t = startEpochSec + relSec;
            return {
              heartRate: hr,
              hr: hr,
              startTimeInSeconds: t,
              timestamp: t * 1000,
            };
          });
          console.log(`❤️ sensor_data built from heartrate stream: ${sensorData.length} points`);
        }

        // Compute cadence summary if cadence stream exists
        if (streams.cadence && streams.cadence.length > 0) {
          const cadArray = (streams.cadence as number[]).filter((v) => Number.isFinite(v));
          if (cadArray.length > 0) {
            let cadMax = Math.round(Math.max(...cadArray));
            let cadAvg = Math.round(cadArray.reduce((a, b) => a + b, 0) / cadArray.length);
            // Heuristic: Strava run cadence sometimes reported as strides/min; if very low, scale to steps/min
            const isRun = (a.sport_type || a.type || '').toLowerCase().includes('run') || (a.sport_type || a.type || '').toLowerCase().includes('walk');
            if (isRun && cadMax < 120) {
              cadMax *= 2;
              cadAvg *= 2;
            }
            // Attach to sensorData points where possible
            if (sensorData && sensorData.length > 0 && streams.time && streams.time.length > 0) {
              const useLen = Math.min(sensorData.length, streams.cadence.length, streams.time.length);
              for (let i = 0; i < useLen; i++) {
                const c = streams.cadence[i];
                if (Number.isFinite(c)) {
                  sensorData[i].cadence = isRun && c < 120 ? Math.round(c * 2) : Math.round(c);
                }
              }
            }
            // Stash on a temp object on gpsTrack[0] so we can return later; or just override below when building row
            (globalThis as any).__computedCadence = { avg: cadAvg, max: cadMax };
            console.log(`🌀 cadence computed from stream: avg=${cadAvg}, max=${cadMax}`);
          }
        }

        // Add power (watts) stream to sensor_data if available
        if (streams.watts && streams.watts.length > 0) {
          const wattsArray = (streams.watts as number[]).filter((v) => Number.isFinite(v) && v >= 0);
          if (wattsArray.length > 0) {
            // Create sensor_data if it doesn't exist yet
            if (!sensorData && streams.time && streams.time.length > 0) {
              const timeLen = streams.time.length;
              sensorData = new Array(timeLen).fill(0).map((_, i) => {
                const relSec = streams.time![i];
                const t = startEpochSec + relSec;
                return {
                  startTimeInSeconds: t,
                  timestamp: t * 1000,
                };
              });
            }
            
            // Attach power to sensor_data points
            if (sensorData && sensorData.length > 0) {
              const useLen = Math.min(sensorData.length, streams.watts.length);
              for (let i = 0; i < useLen; i++) {
                const w = streams.watts[i];
                if (Number.isFinite(w) && w >= 0) {
                  sensorData[i].power = Math.round(w);
                  sensorData[i].watts = Math.round(w); // Alias for compatibility
                }
              }
              console.log(`⚡ power added to sensor_data: ${useLen} points`);
            }
          }
        }
      }
    }
  } catch (e) {
    console.log('⚠️ Failed to enrich gpsTrack with altitude/time:', e);
  }

  // Generate a nice workout name (async to support reverse geocoding)
  const generateWorkoutName = async () => {
    // If Strava activity has a custom name, use it (unless it's generic)
    if (a.name && a.name !== 'Strava Activity' && !a.name.match(/^(Run|Ride|Swim|Workout)$/i)) {
      return a.name;
    }
    
    // Get friendly sport type
    const rawType = (a.sport_type || a.type || '').toLowerCase();
    const hasGps = !!gpsTrack && gpsTrack.length > 0;
    
    let friendlySport = '';
    if (type === 'swim') {
      if (/open\s*water|ocean|ow\b/.test(rawType)) {
        friendlySport = 'Open Water Swim';
      } else if (/pool|indoor/.test(rawType)) {
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
      friendlySport = /hike/.test(rawType) ? 'Hike' : 'Walk';
    } else if (type === 'strength') {
      friendlySport = 'Strength';
    } else {
      friendlySport = type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    // Try to get location name from coordinates
    const startLatLng = Array.isArray(a.start_latlng) ? a.start_latlng : null;
    let locationName: string | null = null;
    
    if (startLatLng && startLatLng[0] && startLatLng[1] && 
        Number.isFinite(Number(startLatLng[0])) && Number.isFinite(Number(startLatLng[1]))) {
      try {
        locationName = await reverseGeocode(Number(startLatLng[0]), Number(startLatLng[1]));
      } catch (error) {
        console.log(`⚠️ Reverse geocoding failed for ${startLatLng[0]},${startLatLng[1]}: ${error}`);
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
    name: workoutName,
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
    avg_cadence: (avgCad ?? (globalThis as any).__computedCadence?.avg) ?? null,
    max_cadence: (maxCad ?? (globalThis as any).__computedCadence?.max) ?? null,
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

    // Time-series sensor data for charts (HR, etc.)
    sensor_data: sensorData,

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

    // Normalize date boundaries to UTC day start/end to avoid TZ drift
    const toUnix = (d: string, endOfDay = false) => {
      try {
        const iso = `${d}T${endOfDay ? '23:59:59' : '00:00:00'}Z`;
        return Math.floor(new Date(iso).getTime() / 1000);
      } catch (_) {
        return undefined as unknown as number;
      }
    };

    const afterEpoch = startDate ? toUnix(startDate, false) : undefined;
    const beforeEpoch = endDate ? toUnix(endDate, true) : undefined;

    while (true) {
      let url = `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`;
      if (afterEpoch) url += `&after=${afterEpoch}`;
      if (beforeEpoch) url += `&before=${beforeEpoch}`;
      
      console.log(`🔍 Requesting Strava API: ${url}`);
      
      let res = await fetch(url, {
        headers: { Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json' },
      });

      // Log Strava rate limit headers so we can see current window usage
      try {
        const limit = res.headers.get('X-RateLimit-Limit');
        const usage = res.headers.get('X-RateLimit-Usage');
        const reset = res.headers.get('X-RateLimit-Reset');
        if (limit || usage || reset) {
          console.log(`📈 Strava rate headers (list p${page}): usage=${usage} limit=${limit} reset=${reset}`);
        }
      } catch (_) {}

      if (res.status === 401) {
        const refreshed = await refreshStravaAccessToken(refreshToken);
        if (refreshed?.access_token) {
          currentAccessToken = refreshed.access_token;
          updatedTokens = refreshed;
          res = await fetch(url, {
            headers: { Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json' },
          });
          try {
            const limit2 = res.headers.get('X-RateLimit-Limit');
            const usage2 = res.headers.get('X-RateLimit-Usage');
            const reset2 = res.headers.get('X-RateLimit-Reset');
            if (limit2 || usage2 || reset2) {
              console.log(`📈 Strava rate headers (after refresh p${page}): usage=${usage2} limit=${limit2} reset=${reset2}`);
            }
          } catch (_) {}
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
        // Defensive filter in case API returns out-of-range items
        try {
          const startTs = Math.floor(new Date(a.start_date).getTime() / 1000);
          if (afterEpoch && startTs < afterEpoch) { skipped++; continue; }
          if (beforeEpoch && startTs > beforeEpoch) { skipped++; continue; }
        } catch (_) {}

        if (existing.has(a.id)) { skipped++; continue; }

        // Fetch detailed activity data to get HR, calories, etc.
        let detailedActivity = a;
        try {
          const detailRes = await fetch(`https://www.strava.com/api/v3/activities/${a.id}`, {
            headers: { Authorization: `Bearer ${currentAccessToken}`, 'Content-Type': 'application/json' },
          });

          // Log rate headers for detail endpoint
          try {
            const dLimit = detailRes.headers.get('X-RateLimit-Limit');
            const dUsage = detailRes.headers.get('X-RateLimit-Usage');
            const dReset = detailRes.headers.get('X-RateLimit-Reset');
            if (dLimit || dUsage || dReset) {
              console.log(`📈 Strava rate headers (detail ${a.id}): usage=${dUsage} limit=${dLimit} reset=${dReset} status=${detailRes.status}`);
            }
          } catch (_) {}
          
          if (detailRes.ok) {
            detailedActivity = await detailRes.json();
            console.log(`📊 Detailed data for ${a.name}: HR=${detailedActivity.average_heartrate}, Calories=${detailedActivity.calories}, Cadence=${detailedActivity.average_cadence}`);
          }
        } catch (err) {
          console.log(`⚠️ Could not fetch detailed data for activity ${a.id}: ${err}`);
        }

        // Fetch streams to enrich the activity
        let streams: { latlng?: [number, number][], altitude?: number[], time?: number[], heartrate?: number[], cadence?: number[], watts?: number[] } | null = null;
        try {
          streams = await fetchStravaStreamsData(a.id, currentAccessToken);
          if (streams) {
            console.log(`📊 Fetched streams for activity ${a.id}: hr=${streams.heartrate?.length || 0}, cad=${streams.cadence?.length || 0}, watts=${streams.watts?.length || 0}, latlng=${streams.latlng?.length || 0}`);
          }
        } catch (e) {
          console.warn(`⚠️ Could not fetch streams for activity ${a.id}:`, e);
        }

        // Package activity with streams and call ingest-activity
        const enrichedActivity = {
          ...detailedActivity,
          streams: streams || undefined
        };

        const ingestUrl = `${SUPABASE_URL}/functions/v1/ingest-activity`;
        const ingestPayload = {
          userId,
          provider: 'strava',
          activity: enrichedActivity
        };

        console.log(`🔄 Calling ingest-activity for Strava activity ${a.id}...`);
        
        try {
          const ingestResponse = await fetch(ingestUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_KEY}`
            },
            body: JSON.stringify(ingestPayload)
          });

          if (!ingestResponse.ok) {
            const errText = await ingestResponse.text();
            console.error(`❌ ingest-activity failed for Strava activity ${a.id}: ${ingestResponse.status} - ${errText}`);
            skipped++;
            continue;
          } else {
            console.log(`✅ ingest-activity succeeded for Strava activity ${a.id}`);
          }
        } catch (ingestErr) {
          console.error(`❌ ingest-activity error for activity ${a.id}:`, ingestErr);
          skipped++;
          continue;
        }

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
