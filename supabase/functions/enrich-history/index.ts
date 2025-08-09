/* global Deno */
// Supabase Edge Function: enrich-history
// Purpose: Fetch Garmin Activity Details in 24h slices and upsert full data into garmin_activities
// Method: POST
// Body: { token: string, days?: number }

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const GARMIN_APIS_BASE = 'https://apis.garmin.com';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  } as Record<string, string>;
}

async function fetchGarminUserId(token: string): Promise<string | null> {
  const resp = await fetch(`${GARMIN_APIS_BASE}/wellness-api/rest/user/id`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const body = await resp.json();
  return body?.userId || null;
}

function startOfUtcDaySeconds(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...cors() } });
    }

    const { token, days = 30 } = await req.json().catch(() => ({}));
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors() } });
    }

    // Resolve garmin user id → app user_id via REST query
    const garminUserId = await fetchGarminUserId(token);
    if (!garminUserId) {
      return new Response(JSON.stringify({ error: 'Unable to resolve Garmin user id' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } });
    }

    const userResp = await fetch(`${supabaseUrl}/rest/v1/user_connections?select=user_id&provider=eq.garmin&connection_data->>user_id=eq.${garminUserId}&limit=1`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Failed to resolve app user' }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors() } });
    }
    const userRows = await userResp.json();
    const appUserId = userRows?.[0]?.user_id || null;
    if (!appUserId) {
      return new Response(JSON.stringify({ error: 'No app user mapped to this Garmin user id' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } });
    }

    const now = new Date();
    let total = 0;
    let windows = 0;

    for (let i = 0; i < Math.max(1, Math.min(days, 180)); i++) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      day.setUTCDate(day.getUTCDate() - i);
      const start = startOfUtcDaySeconds(day);
      const end = start + 24 * 60 * 60 - 1;

      const url = `${GARMIN_APIS_BASE}/wellness-api/rest/activityDetails?uploadStartTimeInSeconds=${start}&uploadEndTimeInSeconds=${end}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      windows++;
      if (!resp.ok) { await new Promise((r) => setTimeout(r, 120)); continue; }
      const details = await resp.json();
      if (!Array.isArray(details) || details.length === 0) { await new Promise((r) => setTimeout(r, 120)); continue; }

      for (const activityDetail of details) {
        const summary = activityDetail.summary || {};
        const summaryId = activityDetail.summaryId || summary.summaryId;
        if (!summaryId) continue;

        // Prepare record
        const avgSpeed = summary.averageSpeedInMetersPerSecond ?? null;
        const maxSpeed = summary.maxSpeedInMetersPerSecond ?? null;
        const avgHR = summary.averageHeartRateInBeatsPerMinute ?? null;
        const maxHR = summary.maxHeartRateInBeatsPerMinute ?? null;
        const elevGain = summary.totalElevationGainInMeters ?? null;
        const elevLoss = summary.totalElevationLossInMeters ?? null;

        const record: any = {
          user_id: appUserId,
          garmin_user_id: garminUserId,
          garmin_activity_id: String(summaryId),
          activity_id: summary.activityId || null,
          activity_type: summary.activityType || null,
          start_time: summary.startTimeInSeconds ? new Date(summary.startTimeInSeconds * 1000).toISOString() : null,
          start_time_offset_seconds: summary.startTimeOffsetInSeconds || 0,
          duration_seconds: summary.durationInSeconds || null,
          distance_meters: summary.distanceInMeters || null,
          calories: summary.activeKilocalories || null,
          avg_speed_mps: avgSpeed,
          max_speed_mps: maxSpeed,
          avg_pace_min_per_km: avgSpeed ? (1000 / avgSpeed) / 60 : null,
          max_pace_min_per_km: maxSpeed ? (1000 / maxSpeed) / 60 : null,
          avg_heart_rate: avgHR,
          max_heart_rate: maxHR,
          avg_bike_cadence: summary.averageBikeCadenceInRoundsPerMinute || null,
          max_bike_cadence: summary.maxBikeCadenceInRoundsPerMinute || null,
          avg_run_cadence: summary.averageRunCadenceInStepsPerMinute || null,
          max_run_cadence: summary.maxRunCadenceInStepsPerMinute || null,
          elevation_gain_meters: elevGain,
          elevation_loss_meters: elevLoss,
          device_name: summary.deviceName || null,
          is_parent: summary.isParent || false,
          parent_summary_id: summary.parentSummaryId || null,
          manual: summary.manual || false,
          is_web_upload: summary.isWebUpload || false,
          raw_data: activityDetail,
          samples_data: activityDetail.samples || null,
          created_at: new Date().toISOString(),
        };

        // Upsert via PostgREST
        const upsert = await fetch(`${supabaseUrl}/rest/v1/garmin_activities?on_conflict=garmin_activity_id`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(record),
        });
        if (upsert.ok) total++;
      }

      await new Promise((r) => setTimeout(r, 150));
    }

    return new Response(JSON.stringify({ ok: true, windows, total }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors() } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors() } });
  }
}); 