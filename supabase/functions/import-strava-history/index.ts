import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STRAVA_CLIENT_ID = Deno.env.get('STRAVA_CLIENT_ID');
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET');

type FourTypes = 'run' | 'ride' | 'swim' | 'strength';

interface StravaActivity {
  id: number;
  name: string;
  type?: string;
  sport_type?: string;
  trainer?: boolean | number;

  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;

  start_date: string;
  start_date_local: string;

  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  average_cadence?: number;
  max_cadence?: number;
  calories?: number;

  map?: { polyline?: string; summary_polyline?: string };
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

function mapStravaTypeToWorkoutType(a: StravaActivity): FourTypes {
  const s = (a.sport_type || a.type || '').toLowerCase();

  if (['run', 'trailrun', 'virtualrun', 'treadmillrun'].some(x => s.includes(x))) return 'run';

  if (
    ['ride', 'virtualride', 'ebikeride', 'indoorcycling', 'mountainbikeride', 'gravelride'].some(x => s.includes(x)) ||
    !!a.trainer
  ) return 'ride';

  if (s.includes('swim')) return 'swim';

  return 'strength';
}

function convertStravaToWorkout(a: StravaActivity, userId: string) {
  const type = mapStravaTypeToWorkoutType(a);

  const duration = Math.max(0, Math.round((a.moving_time ?? 0) / 60));
  const elapsed = Math.max(0, Math.round((a.elapsed_time ?? 0) / 60));
  // Convert meters to kilometers with 2 decimals
  const distance = Math.max(0, Math.round(((a.distance ?? 0) / 1000) * 100) / 100);
  // Convert m/s to km/h
  const avgSpeed = a.average_speed != null ? Math.round(a.average_speed * 3.6 * 100) / 100 : null;
  const maxSpeed = a.max_speed != null ? Math.round(a.max_speed * 3.6 * 100) / 100 : null;
  // pace in min/km derived from m/s
  const paceMin = a.average_speed && a.average_speed > 0 ? Math.round((1000 / a.average_speed / 60) * 100) / 100 : null;

  const avgHr = a.average_heartrate != null ? Math.round(a.average_heartrate) : null;
  const maxHr = a.max_heartrate != null ? Math.round(a.max_heartrate) : null;
  const avgPwr = a.average_watts != null ? Math.round(a.average_watts) : null;
  const maxPwr = a.max_watts != null ? Math.round(a.max_watts) : null;
  const avgCad = a.average_cadence != null ? Math.round(a.average_cadence) : null;
  const maxCad = a.max_cadence != null ? Math.round(a.max_cadence) : null;
  const elev = a.total_elevation_gain != null ? Math.round(a.total_elevation_gain) : null;
  const cals = a.calories != null ? Math.round(a.calories) : null;

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
    avg_pace: paceMin,
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

    // Provide both fields for existing UI expectations
    gps_track: a.map?.summary_polyline ?? a.map?.polyline ?? null,
    gps_trackpoints: a.map?.polyline ?? null,
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
      if (!activities.length) break;

      for (const a of activities) {
        if (existing.has(a.id)) { skipped++; continue; }

        const row = convertStravaToWorkout(a, userId);
        if (!row.user_id || !row.name || !row.type) { skipped++; continue; }

        const { error } = await supabase.from('workouts').insert(row);
        if (error) { console.error('Insert error:', error); skipped++; continue; }

        existing.add(a.id);
        imported++;

        if (maxActivities && imported >= maxActivities) break;
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
