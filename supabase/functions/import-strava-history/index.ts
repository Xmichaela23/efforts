import { createClient } from 'jsr:@supabase/supabase-js@2';
import { recordProviderResult } from '../_shared/connection-health.ts';
import { runPostImportAthletePipeline } from '../_shared/post-import-athlete-pipeline.ts';
import { localDayOf, localDayInRange, paddedEpochBounds } from './date-window.ts';
import { requireUserOrService, AuthError } from '../_shared/require-user.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STRAVA_CLIENT_ID = Deno.env.get('STRAVA_CLIENT_ID');
const STRAVA_CLIENT_SECRET = Deno.env.get('STRAVA_CLIENT_SECRET');


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
  user_id?: string;
  userId?: string;
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

// Fetch multiple streams (latlng, altitude, time, heartrate, cadence, watts, distance, velocity_smooth) to enrich gps_track and metrics
async function fetchStravaStreamsData(
  activityId: number,
  accessToken: string
): Promise<{ latlng?: [number, number][], altitude?: number[], time?: number[], heartrate?: number[], cadence?: number[], watts?: number[], distance?: number[], velocity_smooth?: number[] } | null> {
  try {
    console.log(`🗺️ Fetching combined streams (latlng, altitude, time, heartrate, cadence, watts, distance, velocity_smooth) for activity ${activityId}...`);

    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,altitude,time,heartrate,cadence,watts,distance,velocity_smooth`,
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
    const distance = streams.find((s: any) => s.type === 'distance')?.data || undefined;
    const velocity_smooth = streams.find((s: any) => s.type === 'velocity_smooth')?.data || undefined;

    const result: { latlng?: [number, number][], altitude?: number[], time?: number[], heartrate?: number[], cadence?: number[], watts?: number[], distance?: number[], velocity_smooth?: number[] } = {};
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
    if (Array.isArray(distance) && distance.length > 0) result.distance = distance as number[];
    if (Array.isArray(velocity_smooth) && velocity_smooth.length > 0) result.velocity_smooth = velocity_smooth as number[];

    if (!result.latlng && !result.altitude && !result.time && !result.heartrate && !result.cadence && !result.watts && !result.distance && !result.velocity_smooth) return null;
    console.log(`🗺️ Combined streams fetched: latlng=${result.latlng?.length || 0}, altitude=${result.altitude?.length || 0}, time=${result.time?.length || 0}, hr=${result.heartrate?.length || 0}, cad=${result.cadence?.length || 0}, watts=${result.watts?.length || 0}, dist=${result.distance?.length || 0}, speed=${result.velocity_smooth?.length || 0}`);
    return result;
  } catch (err) {
    console.log(`⚠️ Error fetching combined streams: ${err}`);
    return null;
  }
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
    const body: ImportRequest = await req.json();
    const { accessToken, refreshToken, maxActivities = 200, startDate, endDate } = body;
    // B1: identity comes from the verified JWT; the service key may name a user in the body. Body user_id is otherwise ignored.
    const bodyUserId = typeof body?.user_id === 'string' ? body.user_id : typeof body?.userId === 'string' ? body.userId : null;
    let userId: string;
    try {
      ({ userId } = await requireUserOrService(req, bodyUserId));
    } catch (e) {
      if (e instanceof AuthError) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      throw e;
    }
    if (!accessToken) {
      return new Response('Missing required fields', { status: 400, headers: cors });
    }

    let currentAccessToken = accessToken;

    const existingRes = await supabase
      .from('workouts')
      .select('strava_activity_id')
      .eq('user_id', userId)
      .not('strava_activity_id', 'is', null);

    const existing = new Set<number>((existingRes.data || []).map((w: any) => w.strava_activity_id));
    // Activities Efforts itself posted to Strava (share-strength-to-strava) are not imports.
    const { data: sharedRows } = await supabase
      .from('workouts')
      .select('strava_shared_activity_id')
      .eq('user_id', userId)
      .not('strava_shared_activity_id', 'is', null);
    const ourShares = new Set<number>((sharedRows || []).map((w: any) => Number(w.strava_shared_activity_id)).filter((n: number) => Number.isFinite(n)));

    // Q-066: port the LIVE webhook's source-preference gate (strava-webhook/index.ts:175-204) so historical
    // import respects the SAME Garmin/Strava preference the live path does. Without it, a dual-connect user
    // importing their back-catalog double-inserts runs/rides (no preference skip here AND no cross-source
    // merge for non-swims — swims were already covered by ingest-activity's merge gate + D-184). Fetch once.
    const { data: userPrefRow } = await supabase
      .from('users').select('preferences').eq('id', userId).single();
    const sourcePreference = (userPrefRow?.preferences as any)?.source_preference || 'both';
    const swimSourceOverride = (userPrefRow?.preferences as any)?.swim_source_override || null;
    let skippedByPreference = 0;

    let imported = 0;
    let skipped = 0;
    let page = 1;
    const perPage = 200;
    let updatedTokens: any = null;

    // The user picks days in THEIR local calendar; Strava's `after`/`before` are UTC epoch bounds.
    // Widen the fetch window by a day each side so an evening (local) activity near the UTC
    // boundary is never dropped, then narrow precisely by local day in the loop below (Q-154).
    const { afterEpoch, beforeEpoch } = paddedEpochBounds(startDate, endDate);

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

      // Connection health (§4): the list call's answer, after the one refresh attempt above.
      await recordProviderResult(supabase, { provider: 'strava', userId, status: res.status, error: res.ok ? null : `athlete/activities → ${res.status}` });
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
        if (ourShares.has(Number(a.id))) { skipped++; continue; } // posted from Efforts; not an import
        // Narrow to the user's LOCAL calendar day(s) — the padded UTC window above over-fetches
        // by a day each side on purpose; this is the precise selection (Q-154). Same
        // `start_date_local`-first derivation the stored row uses at the mapping below.
        try {
          const localDay = localDayOf(a);
          if (!localDayInRange(localDay, startDate, endDate)) { skipped++; continue; }
        } catch (_) {}

        if (existing.has(a.id)) { skipped++; continue; }

        // Q-066: same fallback-aware skip the live webhook applies (strava-webhook:175-204). When Garmin is
        // preferred — globally, OR per the D-173 swim override for swims — drop the Strava copy ONLY if
        // Garmin already has a record for this date+type (never lose a Strava-only activity). Runs BEFORE
        // ingest-activity, exactly like the live path; anything that PASSES still goes through the swim
        // merge gate (D-157/D-184) inside ingest-activity — layered, not conflicting. Same mapping/date
        // derivation as the workout row (`start_date_local || start_date`) so the lookup matches stored rows.
        {
          const sp = String(a.sport_type || a.type || '').toLowerCase();
          const isSwim = sp.includes('swim');
          if (sourcePreference === 'garmin' || (swimSourceOverride === 'garmin' && isSwim)) {
            const activityDate = String(a.start_date_local || a.start_date || '').split('T')[0];
            const mappedType = sp.includes('run') ? 'run'
              : (sp.includes('ride') || sp.includes('bike')) ? 'ride'
              : sp.includes('swim') ? 'swim'
              : (sp.includes('walk') || sp.includes('hike')) ? 'walk'
              : (sp.includes('weight') || sp.includes('strength')) ? 'strength'
              : 'run';
            // `.maybeSingle()` errors when there are TWO Garmin rows that day (two rides on 2026-09-05),
            // which read as "no Garmin record" and let both Strava copies in. Any match is enough.
            const { data: garminRows } = await supabase
              .from('workouts').select('id')
              .eq('user_id', userId).eq('date', activityDate).eq('type', mappedType)
              .not('garmin_activity_id', 'is', null).limit(1);
            const garminWorkout = garminRows && garminRows.length > 0 ? garminRows[0] : null;
            if (garminWorkout) {
              console.log(`⏭️ Q-066: skipping Strava activity ${a.id} — Garmin record exists for ${activityDate} ${mappedType}`);
              skipped++; skippedByPreference++; continue;
            }
          }
        }

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
          activity: enrichedActivity,
          // A row created by a history pull never asks for post-workout feedback (Michael, 2026-09-07: "no pop ups
          // when importing"). The dismissal is written by `ingest-activity` when it saves the row (2026-09-16, Stage 7
          // session 3): it sat in a converter here that nothing called, so 37 of 37 imported sessions raised the popup.
          history: true,
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

    if (imported > 0) {
      await runPostImportAthletePipeline(userId, 'import-strava-history');
    }

    return new Response(JSON.stringify({ success: true, imported, skipped, skipped_by_preference: skippedByPreference, tokens: updatedTokens }), {
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
