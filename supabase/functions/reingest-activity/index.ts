// @ts-nocheck
// Re-ingest a Strava workout: fetch fresh data + streams from Strava and push through ingest-activity.
// POST { workout_id: uuid }  — looks up strava_activity_id, fetches everything fresh, upserts via ingest-activity.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const { workout_id, date, type } = body;

    let workout: any = null;
    let wErr: any = null;

    if (workout_id) {
      const res = await supabase.from('workouts').select('id, user_id, strava_activity_id').eq('id', workout_id).single();
      workout = res.data; wErr = res.error;
    } else if (date) {
      let q = supabase.from('workouts').select('id, user_id, strava_activity_id, name, date, type, max_speed').eq('date', date).not('strava_activity_id', 'is', null).order('created_at', { ascending: false }).limit(5);
      if (type) q = q.eq('type', type);
      const res = await q;
      if (res.data?.length === 1) { workout = res.data[0]; }
      else if (res.data?.length) {
        return new Response(JSON.stringify({ error: 'Multiple workouts found, pass workout_id', workouts: res.data.map((w: any) => ({ id: w.id, name: w.name, date: w.date, type: w.type, max_speed: w.max_speed })) }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      wErr = res.error;
    } else {
      return new Response(JSON.stringify({ error: 'workout_id or date required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (wErr || !workout) return new Response(JSON.stringify({ error: 'Workout not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (!workout.strava_activity_id) return new Response(JSON.stringify({ error: 'Not a Strava workout' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const userId = workout.user_id;
    const activityId = workout.strava_activity_id;

    // Get Strava token
    const { data: conn } = await supabase
      .from('device_connections')
      .select('connection_data, access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .eq('provider', 'strava')
      .single();

    let accessToken = conn?.connection_data?.access_token || conn?.access_token;
    const refreshToken = conn?.connection_data?.refresh_token || conn?.refresh_token;

    // Refresh if expired or close to expiry
    const expiresAt = conn?.expires_at ? Math.floor(new Date(conn.expires_at).getTime() / 1000) : (conn?.connection_data?.expires_at as number | undefined);
    const now = Math.floor(Date.now() / 1000);
    if (!accessToken || (typeof expiresAt === 'number' && expiresAt - now < 300)) {
      if (!refreshToken) return new Response(JSON.stringify({ error: 'No Strava refresh token' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const cid = Deno.env.get('STRAVA_CLIENT_ID'), cs = Deno.env.get('STRAVA_CLIENT_SECRET');
      const tr = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: cid, client_secret: cs, grant_type: 'refresh_token', refresh_token: refreshToken }),
      });
      if (!tr.ok) return new Response(JSON.stringify({ error: 'Token refresh failed' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const tokenJson = await tr.json();
      accessToken = tokenJson.access_token;
      // Persist refreshed token
      await supabase.from('device_connections').update({
        access_token: accessToken,
        refresh_token: tokenJson.refresh_token || refreshToken,
        expires_at: new Date((tokenJson.expires_at || 0) * 1000).toISOString(),
        connection_data: { ...(conn?.connection_data || {}), access_token: accessToken, refresh_token: tokenJson.refresh_token || refreshToken, expires_at: tokenJson.expires_at },
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('provider', 'strava');
    }

    // Fetch fresh activity data from Strava
    const actResp = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!actResp.ok) return new Response(JSON.stringify({ error: `Strava activity fetch failed: ${actResp.status}` }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    const activityData = await actResp.json();

    // Fetch streams
    const streamsResp = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,altitude,time,heartrate,cadence,watts,distance,velocity_smooth`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    let streams: Record<string, any> | null = null;
    if (streamsResp.ok) {
      const arr = await streamsResp.json();
      if (Array.isArray(arr)) {
        streams = {};
        for (const s of arr) { if (s.type && s.data) streams[s.type] = s.data; }
      }
    }

    console.log(`🔄 reingest-activity: activity=${activityId} max_speed=${activityData.max_speed} polyline=${!!activityData.map?.polyline} streams_latlng=${streams?.latlng?.length || 0}`);

    // Push through ingest-activity (upserts by strava_activity_id)
    const ingestResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({
        userId,
        provider: 'strava',
        activity: { ...activityData, streams: streams || undefined },
      }),
    });

    if (!ingestResp.ok) {
      const errText = await ingestResp.text();
      return new Response(JSON.stringify({ error: `ingest-activity failed: ${errText}` }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const result = await ingestResp.json().catch(() => ({}));

    // Verify what's actually in the DB after upsert
    const { data: verify } = await supabase.from('workouts')
      .select('id, max_speed, gps_trackpoints')
      .eq('user_id', userId)
      .eq('strava_activity_id', activityId)
      .maybeSingle();

    const gpsTrackSize = await (async () => {
      const { data } = await supabase.from('workouts').select('gps_track').eq('id', verify?.id).maybeSingle();
      const gt = data?.gps_track;
      return Array.isArray(gt) ? gt.length : (gt ? 'non-array' : 'null');
    })();

    return new Response(JSON.stringify({
      ok: true,
      workout_id: verify?.id || workout.id,
      activity_id: activityId,
      max_speed_strava: activityData.max_speed,
      max_speed_db: verify?.max_speed,
      has_polyline: !!activityData.map?.polyline,
      has_trackpoints_db: !!verify?.gps_trackpoints,
      gps_track_db_size: gpsTrackSize,
      streams_latlng: streams?.latlng?.length || 0,
      ingest_result: result,
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('❌ reingest-activity error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
