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

    // Check user's source preference
    const { data: userData } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single();
    
    const sourcePreference = userData?.preferences?.source_preference || 'both';
    if (sourcePreference === 'garmin') {
      console.log(`⏭️ Skipping Strava activity ${activityId} - user prefers Garmin only`);
      return;
    }
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

    // Check user's source preference
    const { data: userData } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .single();
    
    const sourcePreference = userData?.preferences?.source_preference || 'both';
    if (sourcePreference === 'garmin') {
      console.log(`⏭️ Skipping Strava activity update ${activityId} - user prefers Garmin only`);
      return;
    }
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

// Fetch streams (latlng, altitude, time, heartrate, cadence, watts)
async function fetchStravaStreamsData(
  activityId: number,
  accessToken: string
): Promise<{ latlng?: [number, number][], altitude?: number[], time?: number[], heartrate?: number[], cadence?: number[], watts?: number[], distance?: number[], velocity_smooth?: number[] } | null> {
  try {
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,altitude,time,heartrate,cadence,watts,distance,velocity_smooth`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    if (!response.ok) return null;

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
    if (Array.isArray(latlng) && latlng.length > 0) result.latlng = latlng as [number, number][];
    if (Array.isArray(altitude) && altitude.length > 0) result.altitude = altitude as number[];
    if (Array.isArray(time) && time.length > 0) result.time = time as number[];
    if (Array.isArray(heartrate) && heartrate.length > 0) result.heartrate = heartrate as number[];
    if (Array.isArray(cadence) && cadence.length > 0) result.cadence = cadence as number[];
    if (Array.isArray(watts) && watts.length > 0) result.watts = watts as number[];
    if (Array.isArray(distance) && distance.length > 0) result.distance = distance as number[];
    if (Array.isArray(velocity_smooth) && velocity_smooth.length > 0) result.velocity_smooth = velocity_smooth as number[];
    if (!result.latlng && !result.altitude && !result.time && !result.heartrate && !result.cadence && !result.watts && !result.distance && !result.velocity_smooth) return null;
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

    // Fetch streams to enrich the activity
    let streams: { latlng?: [number, number][], altitude?: number[], time?: number[], heartrate?: number[], cadence?: number[], watts?: number[] } | null = null;
    try {
      const token = (await supabase.from('device_connections').select('connection_data').eq('user_id', userId).eq('provider', 'strava').single()).data?.connection_data?.access_token;
      if (token) {
        streams = await fetchStravaStreamsData(activityData.id, token);
        if (streams) {
          console.log(`📊 Fetched streams for activity ${activityData.id}: hr=${streams.heartrate?.length || 0}, cad=${streams.cadence?.length || 0}, watts=${streams.watts?.length || 0}, latlng=${streams.latlng?.length || 0}, dist=${streams.distance?.length || 0}, speed=${streams.velocity_smooth?.length || 0}`);
        }
      }
    } catch (e) {
      console.warn(`⚠️ Could not fetch streams for activity ${activityData.id}:`, e);
    }

    // Package activity with streams and call ingest-activity
    const enrichedActivity = {
      ...activityData,
      streams: streams || undefined
    };

    const ingestUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-activity`;
    const ingestPayload = {
      userId,
      provider: 'strava',
      activity: enrichedActivity
    };

    console.log(`🔄 Calling ingest-activity for Strava activity ${activityData.id}...`);
    
    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify(ingestPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ ingest-activity failed for Strava activity ${activityData.id}: ${response.status} - ${errText}`);
    } else {
      console.log(`✅ ingest-activity succeeded for Strava activity ${activityData.id}`);
    }
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
      // Extract local date directly from start_date_local without timezone conversion
      date: (activityData.start_date_local || activityData.start_date || '').split('T')[0] || undefined,
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
