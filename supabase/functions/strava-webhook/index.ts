// @ts-nocheck
/// <reference lib="deno.ns" />
// @ts-ignore Deno Edge Functions resolve jsr imports at runtime
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Strava webhook verification and processing
// Use service role to bypass RLS from server-side webhook processing
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  // Handle webhook verification (Strava sends GET request first)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    
    // Verify the webhook subscription
    if (mode === 'subscribe') {
      const expected = Deno.env.get('STRAVA_WEBHOOK_VERIFY_TOKEN') || '';
      if (expected && token !== expected) {
        console.log('❌ Strava webhook verify token mismatch');
        return new Response('Verification failed', { status: 403 });
      }
      console.log('✅ Strava webhook verified successfully');
      return new Response(JSON.stringify({ 'hub.challenge': challenge }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Handle webhook events (POST requests)
  if (req.method === 'POST') {
    try {
      const payload = await req.json();
      console.log('📥 Received Strava webhook:', JSON.stringify(payload, null, 2));
      
      // Respond immediately with 200 OK (as required by Strava)
      const response = new Response('OK', { status: 200 });
      
      // Process the webhook asynchronously
      processStravaWebhook(payload).catch(console.error);
      
      return response;
    } catch (error) {
      console.error('❌ Error processing Strava webhook:', error);
      return new Response('Internal server error', { status: 500 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});

async function processStravaWebhook(payload: any) {
  try {
    const { object_type, object_id, aspect_type, updates, owner_id } = payload;
    
    // Only process activity-related events
    if (object_type !== 'activity') {
      console.log('⏭️ Skipping non-activity webhook:', object_type);
      return;
    }

    console.log(`🔄 Processing ${aspect_type} for activity ${object_id} (owner: ${owner_id}) at ${new Date().toISOString()}`);

    switch (aspect_type) {
      case 'create':
        await handleActivityCreated(object_id, owner_id);
        break;
      case 'update':
        await handleActivityUpdated(object_id, owner_id, updates);
        break;
      case 'delete':
        await handleActivityDeleted(object_id, owner_id);
        break;
      default:
        console.log(`⚠️ Unknown aspect type: ${aspect_type}`);
    }
  } catch (error) {
    console.error('❌ Error in processStravaWebhook:', error);
  }
}

async function handleActivityCreated(activityId: number, ownerId: number) {
  try {
    console.log(`🆕 New activity created: ${activityId} by user ${ownerId}`);
    
    // Find the user in our system by Strava ID
    const { data: userConnection, error: connectionError } = await supabase
      .from('device_connections')
      .select('user_id, connection_data, access_token, refresh_token, expires_at')
      .eq('provider', 'strava')
      .eq('provider_user_id', ownerId.toString())
      .single();

    if (connectionError || !userConnection) {
      console.log(`⚠️ No user connection found for Strava user ${ownerId}`);
      return;
    }

    const userId = userConnection.user_id;
    const connectionData = userConnection.connection_data || {};
    let accessToken = connectionData.access_token || (userConnection as any).access_token;
    const expiresAtIso = (userConnection as any).expires_at as string | null;
    const expiresAt = expiresAtIso ? Math.floor(new Date(expiresAtIso).getTime() / 1000) : (connectionData.expires_at as number | undefined);

    // Proactive pre-expiry refresh (skew 10 minutes)
    const nowSec = Math.floor(Date.now() / 1000);
    if ((typeof expiresAt === 'number' && expiresAt - nowSec < 600) || !accessToken) {
      // Try to refresh using stored refresh_token
      const refreshed = await refreshStravaAccessToken(userId);
      if (refreshed) accessToken = refreshed;
    }
    if (!accessToken) { console.log(`⚠️ No access token for user ${userId}`); return; }

    // Fetch detailed activity data from Strava
    let { data: activityData, status } = await fetchStravaActivityWithStatus(activityId, accessToken);
    if (status === 401) {
      // Access token expired/invalid → refresh and retry once
      const refreshed = await refreshStravaAccessToken(userId);
      if (refreshed) {
        const retry = await fetchStravaActivityWithStatus(activityId, refreshed);
        activityData = retry.data;
        status = retry.status;
      }
    }
    if (!activityData) {
      console.log(`⚠️ Could not fetch activity ${activityId} from Strava (status ${status})`);
      return;
    }

    // Store the activity in our system
    await storeStravaActivity(activityId, userId, activityData);
    
    // Create workout entry if it's a supported sport
    await createWorkoutFromStravaActivity(userId, activityData);
    
    console.log(`✅ Activity ${activityId} processed successfully for user ${userId}`);
  } catch (error) {
    console.error(`❌ Error handling activity creation for ${activityId}:`, error);
  }
}

async function handleActivityUpdated(activityId: number, ownerId: number, updates: any) {
  try {
    console.log(`🔄 Activity updated: ${activityId} by user ${ownerId}`, updates);
    
    // Find the user connection
    const { data: userConnection, error: connectionError } = await supabase
      .from('device_connections')
      .select('user_id, connection_data, access_token')
      .eq('provider', 'strava')
      .eq('provider_user_id', ownerId.toString())
      .single();

    if (connectionError || !userConnection) {
      console.log(`⚠️ No user connection found for Strava user ${ownerId}`);
      return;
    }

    const userId = userConnection.user_id;
    const connectionData = userConnection.connection_data || {};
    let accessToken = connectionData.access_token || (userConnection as any).access_token;
    if (!accessToken) {
      const refreshed = await refreshStravaAccessToken(userId);
      if (refreshed) accessToken = refreshed;
    }
    if (!accessToken) { console.log(`⚠️ No access token for user ${userId}`); return; }

    // Fetch updated activity data
    let { data: activityData, status } = await fetchStravaActivityWithStatus(activityId, accessToken);
    if (status === 401) {
      const refreshed = await refreshStravaAccessToken(userId);
      if (refreshed) {
        const retry = await fetchStravaActivityWithStatus(activityId, refreshed);
        activityData = retry.data;
        status = retry.status;
      }
    }
    if (!activityData) {
      console.log(`⚠️ Could not fetch updated activity ${activityId} from Strava (status ${status})`);
      return;
    }

    // Compute stream-based max cadence for runs/walks to match Strava UI
    try {
      const streams = await fetchStravaStreamsData(activityId, accessToken);
      if (streams && streams.cadence && streams.cadence.length > 0) {
        const cad = (streams.cadence as number[]).filter((v) => Number.isFinite(v));
        if (cad.length > 0) {
          let peak = Math.round(Math.max(...cad));
          const sport = (activityData.sport_type || activityData.type || '').toLowerCase();
          const isRunWalkUpd = sport.includes('run') || sport.includes('walk');
          if (isRunWalkUpd && peak < 120) peak = peak * 2; // normalize to steps/min
          (activityData as any).max_cadence = peak;
        }
      }
    } catch { /* ignore stream failures */ }

    // Update the stored activity
    await updateStravaActivity(activityId, userId, activityData);
    
    // Update workout entry if it exists
    await updateWorkoutFromStravaActivity(userId, activityData);
    
    console.log(`✅ Activity ${activityId} updated successfully for user ${userId}`);
  } catch (error) {
    console.error(`❌ Error handling activity update for ${activityId}:`, error);
  }
}

async function handleActivityDeleted(activityId: number, ownerId: number) {
  try {
    console.log(`🗑️ Activity deleted: ${activityId} by user ${ownerId}`);
    
    // Find the user connection
    const { data: userConnection, error: connectionError } = await supabase
      .from('device_connections')
      .select('user_id')
      .eq('provider', 'strava')
      .eq('provider_user_id', ownerId.toString())
      .single();

    if (connectionError || !userConnection) {
      console.log(`⚠️ No user connection found for Strava user ${ownerId}`);
      return;
    }

    const userId = userConnection.user_id;

    // Mark activity as deleted in our system
    await markStravaActivityDeleted(activityId, userId);
    
    // Remove associated workout if it exists
    await removeWorkoutFromStravaActivity(userId, activityId);
    
    console.log(`✅ Activity ${activityId} marked as deleted for user ${userId}`);
  } catch (error) {
    console.error(`❌ Error handling activity deletion for ${activityId}:`, error);
  }
}

async function fetchStravaActivityWithStatus(activityId: number, accessToken: string): Promise<{ data: any | null; status: number; }> {
  try {
    const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      console.warn(`⚠️ Strava API error for activity ${activityId}: ${response.status}`);
      return { data: null, status: response.status };
    }
    const json = await response.json();
    return { data: json, status: 200 };
  } catch (error) {
    console.error(`❌ Error fetching Strava activity ${activityId}:`, error);
    return { data: null, status: 0 };
  }
}

async function refreshStravaAccessToken(userId: string): Promise<string | null> {
  try {
    const { data: conn } = await supabase
      .from('device_connections')
      .select('connection_data, refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .single();
    const refreshToken = conn?.connection_data?.refresh_token || (conn as any)?.refresh_token;
    if (!refreshToken) {
      console.warn('⚠️ Missing Strava refresh_token for user', userId);
      return null;
    }
    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      console.warn('⚠️ Missing STRAVA_CLIENT_ID/SECRET env vars');
      return null;
    }
    const tokenResp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    if (!tokenResp.ok) {
      console.warn('⚠️ Strava token refresh failed:', tokenResp.status);
      return null;
    }
    const tokenJson = await tokenResp.json();
    const newAccess = tokenJson.access_token;
    const newRefresh = tokenJson.refresh_token || refreshToken;
    const expiresAtIso = new Date((tokenJson.expires_at || 0) * 1000).toISOString();
    // Persist atomically (update top-level columns and JSON mirror)
    const { error: upErr } = await supabase
      .from('device_connections')
      .update({
        access_token: newAccess,
        refresh_token: newRefresh,
        expires_at: expiresAtIso,
        connection_data: { ...(conn?.connection_data || {}), access_token: newAccess, refresh_token: newRefresh, expires_at: tokenJson.expires_at },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'strava');
    if (upErr) {
      console.warn('⚠️ Failed to persist refreshed Strava token:', upErr);
    }
    return newAccess || null;
  } catch (e) {
    console.error('❌ Error refreshing Strava access token:', e);
    return null;
  }
}

// Fetch streams (latlng, altitude, time, heartrate, cadence)
async function fetchStravaStreamsData(
  activityId: number,
  accessToken: string
): Promise<{ latlng?: [number, number][], altitude?: number[], time?: number[], heartrate?: number[], cadence?: number[] } | null> {
  try {
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,altitude,time,heartrate,cadence`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    if (!response.ok) return null;

    const streams = await response.json();
    const latlng = streams.find((s: any) => s.type === 'latlng')?.data || undefined;
    const altitude = streams.find((s: any) => s.type === 'altitude')?.data || undefined;
    const time = streams.find((s: any) => s.type === 'time')?.data || undefined;
    const heartrate = streams.find((s: any) => s.type === 'heartrate')?.data || undefined;
    const cadence = streams.find((s: any) => s.type === 'cadence')?.data || undefined;

    const result: { latlng?: [number, number][], altitude?: number[], time?: number[], heartrate?: number[], cadence?: number[] } = {};
    if (Array.isArray(latlng) && latlng.length > 0) result.latlng = latlng as [number, number][];
    if (Array.isArray(altitude) && altitude.length > 0) result.altitude = altitude as number[];
    if (Array.isArray(time) && time.length > 0) result.time = time as number[];
    if (Array.isArray(heartrate) && heartrate.length > 0) result.heartrate = heartrate as number[];
    if (Array.isArray(cadence) && cadence.length > 0) result.cadence = cadence as number[];
    if (!result.latlng && !result.altitude && !result.time && !result.heartrate && !result.cadence) return null;
    return result;
  } catch (_e) {
    return null;
  }
}

async function storeStravaActivity(activityId: number, userId: string, activityData: any) {
  try {
    const { error } = await supabase
      .from('strava_activities')
      .upsert({
        strava_id: activityId,
        user_id: userId,
        activity_data: activityData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null
      }, { onConflict: 'user_id,strava_id' });

    if (error) {
      console.error(`❌ Error storing Strava activity ${activityId}:`, error);
    }
  } catch (error) {
    console.error(`❌ Error in storeStravaActivity for ${activityId}:`, error);
  }
}

async function updateStravaActivity(activityId: number, userId: string, activityData: any) {
  try {
    const { error } = await supabase
      .from('strava_activities')
      .update({
        activity_data: activityData,
        updated_at: new Date().toISOString()
      })
      .eq('strava_id', activityId)
      .eq('user_id', userId);

    if (error) {
      console.error(`❌ Error updating Strava activity ${activityId}:`, error);
    }
  } catch (error) {
    console.error(`❌ Error in updateStravaActivity for ${activityId}:`, error);
  }
}

async function markStravaActivityDeleted(activityId: number, userId: string) {
  try {
    const { error } = await supabase
      .from('strava_activities')
      .update({
        deleted_at: new Date().toISOString()
      })
      .eq('strava_id', activityId)
      .eq('user_id', userId);

    if (error) {
      console.error(`❌ Error marking Strava activity ${activityId} as deleted:`, error);
    }
  } catch (error) {
    console.error(`❌ Error in markStravaActivityDeleted for ${activityId}:`, error);
  }
}

async function createWorkoutFromStravaActivity(userId: string, activityData: any) {
  try {
    // Map Strava sport to our type values used in UI
    const s = (activityData.sport_type?.toLowerCase() || activityData.type?.toLowerCase() || '');
    const type = s.includes('run') ? 'run'
      : (s.includes('ride') || s.includes('bike')) ? 'ride'
      : s.includes('swim') ? 'swim'
      : (s.includes('walk') || s.includes('hike')) ? 'walk'
      : (s.includes('weight') || s.includes('strength')) ? 'strength'
      : 'run';

    // Only persist supported types
    if (!['run','ride','swim','strength','walk'].includes(type)) return;

    // Dedupe by strava_activity_id
    const { data: existingWorkout } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .eq('strava_activity_id', activityData.id)
      .single();
    if (existingWorkout) return;

    const date = new Date(activityData.start_date_local || activityData.start_date).toISOString().split('T')[0];
    const timestamp = new Date(activityData.start_date || activityData.start_date_local || Date.now()).toISOString();
    const duration = Math.max(0, Math.round((activityData.moving_time || 0) / 60));
    // Strava returns distance in meters. Persist both raw meters and normalized km.
    const distance_meters = Number.isFinite(activityData.distance) ? Number(activityData.distance) : null;
    const distance_km = distance_meters != null ? Number((distance_meters / 1000).toFixed(3)) : null;

    // Try to enrich with streams
    let gps_track: any[] | null = null;
    let sensor_data: any[] | null = null;
    let cadAvgComputed: number | null = null;
    let cadMaxComputed: number | null = null;
    try {
      const token = (await supabase.from('device_connections').select('connection_data').eq('user_id', userId).eq('provider', 'strava').single()).data?.connection_data?.access_token;
      if (token) {
        const streams = await fetchStravaStreamsData(activityData.id, token);
        if (streams) {
          const startEpochSec = Math.floor(new Date(activityData.start_date).getTime() / 1000);
          if (streams.latlng && streams.latlng.length > 0) {
            const len = streams.latlng.length;
            const altLen = streams.altitude?.length || 0;
            const timeLen = streams.time?.length || 0;
            const useLen = Math.min(len, altLen || len, timeLen || len);
            gps_track = new Array(useLen).fill(0).map((_, i) => {
              const [lat, lng] = streams.latlng![i];
              const elev = streams.altitude && Number.isFinite(streams.altitude[i]) ? streams.altitude[i] : null;
              const tRel = streams.time && Number.isFinite(streams.time[i]) ? streams.time[i] : i;
              return { lat, lng, elevation: elev, startTimeInSeconds: startEpochSec + (tRel as number), timestamp: (startEpochSec + (tRel as number)) * 1000 };
            });
          }
          if (streams.heartrate && streams.time) {
            const len = Math.min(streams.heartrate.length, streams.time.length);
            sensor_data = new Array(len).fill(0).map((_, i) => {
              const t = Math.floor(new Date(activityData.start_date).getTime() / 1000) + streams.time![i];
              return { heartRate: streams.heartrate![i], startTimeInSeconds: t, timestamp: t * 1000 };
            });
          }

          // Cadence stream → compute avg/max and best-5s window for runs
          if (streams.cadence && streams.cadence.length > 0) {
            const cadArray = (streams.cadence as number[]).filter((v) => Number.isFinite(v));
            if (cadArray.length > 0) {
              const cMax = Math.round(Math.max(...cadArray));
              const cAvg = Math.round(cadArray.reduce((a, b) => a + b, 0) / cadArray.length);
              cadMaxComputed = cMax; cadAvgComputed = cAvg;

              // For run/walk, compute a best-5s average cadence window using stream time
              const sport = (activityData.sport_type || activityData.type || '').toLowerCase();
              const isRunWalkStream = sport.includes('run') || sport.includes('walk');
              if (isRunWalkStream && streams.time && streams.time.length === (streams.cadence as number[]).length) {
                const times = streams.time as number[]; // seconds
                const windowSec = 5;
                let start = 0;
                let sum = 0;
                let bestAvg = 0;
                for (let i = 0; i < cadArray.length; i++) {
                  sum += cadArray[i];
                  while (times[i] - times[start] > windowSec && start < i) {
                    sum -= cadArray[start];
                    start++;
                  }
                  const len = i - start + 1;
                  if (len > 0) {
                    const avgWin = sum / len;
                    if (avgWin > bestAvg) bestAvg = avgWin;
                  }
                }
                // We keep cadMaxComputed as the true peak sample to match Strava UI; best-5s is available if we ever need smoothing
              }
              // annotate sensor_data when present
              if (sensor_data && streams.time && streams.time.length > 0) {
                const useLen = Math.min(sensor_data.length, streams.cadence.length, streams.time.length);
                for (let i = 0; i < useLen; i++) {
                  const cv = streams.cadence[i];
                  if (Number.isFinite(cv)) {
                    sensor_data[i].cadence = Math.round(cv as number);
                  }
                }
              }
            }
          }
        }
      }
    } catch {}

    // Normalize cadence to steps/min for runs/walks
    const sportLower = (activityData.sport_type || activityData.type || '').toLowerCase();
    const isRunWalk = sportLower.includes('run') || sportLower.includes('walk');
    let avgCadNorm = Number.isFinite(activityData.average_cadence) ? Math.round(activityData.average_cadence) : (cadAvgComputed != null ? cadAvgComputed : null);
    let maxCadNorm = Number.isFinite(activityData.max_cadence) ? Math.round(activityData.max_cadence) : (cadMaxComputed != null ? cadMaxComputed : null);
    if (isRunWalk) {
      if (avgCadNorm != null && avgCadNorm < 120) avgCadNorm = avgCadNorm * 2;
      if (maxCadNorm != null && maxCadNorm < 120) maxCadNorm = maxCadNorm * 2;
    }

    const row: any = {
      user_id: userId,
      name: activityData.name || 'Strava Activity',
      type,
      date,
      timestamp,
      duration,
      distance: distance_km, // store km to match imports/UI
      description: `Imported from Strava: ${activityData.name || ''}`.trim(),
      workout_status: 'completed',
      completedmanually: false,
      strava_activity_id: activityData.id,
      source: 'strava',
      is_strava_imported: true,
      start_position_lat: activityData.start_latlng?.[0] ?? null,
      start_position_long: activityData.start_latlng?.[1] ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      gps_track: gps_track ? JSON.stringify(gps_track) : null,
      gps_trackpoints: activityData.map?.polyline || activityData.map?.summary_polyline || null,
      sensor_data: sensor_data ? JSON.stringify(sensor_data) : null,
      // Parity fields using existing columns
      moving_time: activityData.moving_time != null ? Math.round(activityData.moving_time / 60) : null,
      elapsed_time: activityData.elapsed_time != null ? Math.round(activityData.elapsed_time / 60) : null,
      elevation_gain: Number.isFinite(activityData.total_elevation_gain) ? Math.round(activityData.total_elevation_gain) : null,
      avg_heart_rate: Number.isFinite(activityData.average_heartrate) ? Math.round(activityData.average_heartrate) : null,
      max_heart_rate: Number.isFinite(activityData.max_heartrate) ? Math.round(activityData.max_heartrate) : null,
      avg_cadence: avgCadNorm,
      max_cadence: maxCadNorm,
      avg_temperature: Number.isFinite((activityData as any).average_temp) ? Math.round((activityData as any).average_temp) : null,
      max_temperature: Number.isFinite((activityData as any).max_temp) ? Math.round((activityData as any).max_temp) : null,
      calories: Number.isFinite(activityData.calories) ? Math.round(activityData.calories) : null,
      avg_speed: activityData.average_speed != null ? Number((activityData.average_speed * 3.6).toFixed(2)) : null,
      max_speed: activityData.max_speed != null ? Number((activityData.max_speed * 3.6).toFixed(2)) : null,
      // pace (sec/km)
      avg_pace: activityData.average_speed && activityData.average_speed > 0 ? Math.round(1000 / activityData.average_speed) : null,
      max_pace: activityData.max_speed && activityData.max_speed > 0 ? Math.round(1000 / activityData.max_speed) : null,
      // power
      avg_power: Number.isFinite((activityData as any).average_watts) ? Math.round((activityData as any).average_watts) : null,
      max_power: Number.isFinite((activityData as any).max_watts) ? Math.round((activityData as any).max_watts) : null,
      normalized_power: Number.isFinite((activityData as any).weighted_average_watts) ? Math.round((activityData as any).weighted_average_watts) : null,
      provider_sport: activityData.sport_type || activityData.type || null,
    };

    // Idempotent write on (user_id, strava_activity_id)
    const { error } = await supabase
      .from('workouts')
      .upsert(row, { onConflict: 'user_id,strava_activity_id' });
    if (error) console.error(`❌ Upsert workout for Strava activity ${activityData.id} failed:`, error);
    else console.log(`✅ Upserted workout for Strava activity ${activityData.id}`);
  } catch (error) {
    console.error(`❌ Error in createWorkoutFromStravaActivity:`, error);
  }
}

async function updateWorkoutFromStravaActivity(userId: string, activityData: any) {
  try {
    // Find existing workout
    const { data: existingWorkout } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', userId)
      .eq('strava_activity_id', activityData.id)
      .single();

    if (!existingWorkout) {
      console.log(`⏭️ No workout found for Strava activity ${activityData.id}, skipping update`);
      return;
    }

    // Update with our schema fields
    const distance_meters = Number.isFinite(activityData.distance) ? Number(activityData.distance) : null;
    const distance_km = distance_meters != null ? Number((distance_meters / 1000).toFixed(3)) : null;

    const sportLower2 = (activityData.sport_type || activityData.type || '').toLowerCase();
    const isRunWalk2 = sportLower2.includes('run') || sportLower2.includes('walk');
    const workoutData = {
      name: activityData.name || 'Strava Activity',
      duration: Math.max(0, Math.round((activityData.moving_time || 0) / 60)),
      distance: distance_km,
      description: `Updated from Strava: ${activityData.name || ''}`.trim(),
      workout_status: 'completed',
      updated_at: new Date().toISOString(),
      timestamp: new Date(activityData.start_date || activityData.start_date_local || Date.now()).toISOString(),
      is_strava_imported: true,
      gps_trackpoints: activityData.map?.polyline || activityData.map?.summary_polyline || null,
      // Parity fields using existing columns
      moving_time: activityData.moving_time != null ? Math.round(activityData.moving_time / 60) : null,
      elapsed_time: activityData.elapsed_time != null ? Math.round(activityData.elapsed_time / 60) : null,
      elevation_gain: Number.isFinite(activityData.total_elevation_gain) ? Math.round(activityData.total_elevation_gain) : null,
      avg_heart_rate: Number.isFinite(activityData.average_heartrate) ? Math.round(activityData.average_heartrate) : null,
      max_heart_rate: Number.isFinite(activityData.max_heartrate) ? Math.round(activityData.max_heartrate) : null,
      avg_cadence: (() => { let v = Number.isFinite(activityData.average_cadence) ? Math.round(activityData.average_cadence) : null; if (isRunWalk2 && v != null && v < 120) v = v * 2; return v; })(),
      max_cadence: (() => { let v = Number.isFinite(activityData.max_cadence) ? Math.round(activityData.max_cadence) : null; if (isRunWalk2 && v != null && v < 120) v = v * 2; return v; })(),
      avg_temperature: Number.isFinite((activityData as any).average_temp) ? Math.round((activityData as any).average_temp) : null,
      max_temperature: Number.isFinite((activityData as any).max_temp) ? Math.round((activityData as any).max_temp) : null,
      calories: Number.isFinite(activityData.calories) ? Math.round(activityData.calories) : null,
      avg_speed: activityData.average_speed != null ? Number((activityData.average_speed * 3.6).toFixed(2)) : null,
      max_speed: activityData.max_speed != null ? Number((activityData.max_speed * 3.6).toFixed(2)) : null,
      avg_pace: activityData.average_speed && activityData.average_speed > 0 ? Math.round(1000 / activityData.average_speed) : null,
      max_pace: activityData.max_speed && activityData.max_speed > 0 ? Math.round(1000 / activityData.max_speed) : null,
      avg_power: Number.isFinite((activityData as any).average_watts) ? Math.round((activityData as any).average_watts) : null,
      max_power: Number.isFinite((activityData as any).max_watts) ? Math.round((activityData as any).max_watts) : null,
      normalized_power: Number.isFinite((activityData as any).weighted_average_watts) ? Math.round((activityData as any).weighted_average_watts) : null,
      provider_sport: activityData.sport_type || activityData.type || null,
    } as any;

    const { error } = await supabase
      .from('workouts')
      .update(workoutData)
      .eq('id', existingWorkout.id);

    if (error) {
      console.error(`❌ Error updating workout for Strava activity ${activityData.id}:`, error);
    } else {
      console.log(`✅ Updated workout for Strava activity ${activityData.id}`);
    }
  } catch (error) {
    console.error(`❌ Error in updateWorkoutFromStravaActivity:`, error);
  }
}

async function removeWorkoutFromStravaActivity(userId: string, activityId: number) {
  try {
    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('user_id', userId)
      .eq('strava_activity_id', activityId);

    if (error) {
      console.error(`❌ Error removing workout for Strava activity ${activityId}:`, error);
    } else {
      console.log(`✅ Removed workout for Strava activity ${activityId}`);
    }
  } catch (error) {
    console.error(`❌ Error in removeWorkoutFromStravaActivity:`, error);
  }
}
