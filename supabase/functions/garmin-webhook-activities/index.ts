// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';
Deno.serve(async (req)=>{
  // Only handle POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405
    });
  }
  try {
    // Parse the incoming webhook payload
    const payload = await req.json();
    // Log the full payload for debugging
    console.log('Received webhook payload:', JSON.stringify(payload, null, 2));
    // Respond immediately with 200 OK (as required by Garmin)
    const response = new Response('OK', {
      status: 200
    });
    // Process activities asynchronously after responding
    if (payload.activities) {
      processActivities(payload.activities).catch(console.error);
    } else if (payload.activityDetails) {
      // If we get activityDetails directly, process them
      processActivityDetails(payload.activityDetails).catch(console.error);
    } else {
      console.log('No activities or activityDetails found in payload');
    }
    return response;
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response('Internal server error', {
      status: 500
    });
  }
});
// Function to fetch activity details from Garmin API
async function fetchActivityDetails(summaryId, userId) {
  try {
    // Get user's Garmin access token
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: connections } = await supabase.from('user_connections').select('user_id, access_token, connection_data').eq('provider', 'garmin').eq('connection_data->>user_id', userId).limit(1);
    const connection = connections?.[0];
    // Primary token source: user_connections.access_token (top-level), fallback to connection_data.access_token
    let accessToken = connection?.access_token;
    if (!accessToken) {
      accessToken = connection?.connection_data?.access_token;
    }
    // Fallback: device_connections (either top-level or in connection_data)
    if (!accessToken && connection?.user_id) {
      try {
        const { data: devConn } = await supabase.from('device_connections').select('access_token, connection_data').eq('provider', 'garmin').eq('user_id', connection.user_id).single();
        accessToken = devConn?.access_token || devConn?.connection_data?.access_token;
      } catch  {}
    }
    if (!accessToken) {
      console.log(`No Garmin access token available for userId=${userId}`);
      return null;
    }
    // Calculate time range (last 7 days) to capture older resends
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 7 * 24 * 60 * 60;
    // Call Garmin Activity Details API
    const response = await fetch(`https://apis.garmin.com/wellness-api/rest/activityDetails?uploadStartTimeInSeconds=${oneDayAgo}&uploadEndTimeInSeconds=${now}&includeAll=true&maxPageSize=200`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      console.error(`Garmin API error: ${response.status} ${response.statusText}`);
      return null;
    }
    const activityDetails = await response.json();
    console.log(`Fetched ${activityDetails.length} activity details from Garmin API`);
    
    // 🔍 DIAGNOSTIC: Log raw Garmin API response for FR 965 debugging
    if (activityDetails.length > 0) {
      const firstActivity = activityDetails[0];
      console.log('🔍 RAW GARMIN API RESPONSE DIAGNOSTICS:', {
        activity_count: activityDetails.length,
        summary_fields: Object.keys(firstActivity.summary || {}),
        sample_count: firstActivity.samples?.length || 0,
        device_name: firstActivity.summary?.deviceName,
        activity_type: firstActivity.summary?.activityType,
        manual: firstActivity.summary?.manual,
        is_web_upload: firstActivity.summary?.isWebUpload,
        first_sample_fields: firstActivity.samples?.[0] ? Object.keys(firstActivity.samples[0]) : 'No samples',
        first_sample_data: firstActivity.samples?.[0] || 'No samples',
        sample_field_availability: {
          speedMetersPerSecond: firstActivity.samples?.filter(s => s.speedMetersPerSecond != null).length || 0,
          totalDistanceInMeters: firstActivity.samples?.filter(s => s.totalDistanceInMeters != null).length || 0,
          heartRate: firstActivity.samples?.filter(s => s.heartRate != null).length || 0,
          stepsPerMinute: firstActivity.samples?.filter(s => s.stepsPerMinute != null).length || 0,
          latitude: firstActivity.samples?.filter(s => s.latitudeInDegree != null).length || 0,
          longitude: firstActivity.samples?.filter(s => s.longitudeInDegree != null).length || 0
        }
      });
    }
    
    // Find the specific activity we're looking for
    const targetActivity = activityDetails.find((detail)=>detail.summaryId === summaryId || detail.summary?.summaryId === summaryId);
    return targetActivity || null;
  } catch (error) {
    console.error('Error fetching activity details:', error);
    return null;
  }
}
// Normalize Garmin summaryId: range details often append "-detail"; summary endpoints expect the base id
function normalizeSummaryId(rawId) {
  if (!rawId) return rawId;
  return String(rawId).replace(/-detail$/i, '');
}
// Try single-activity summary endpoints to get TE/RD rollups when activityDetails range lacks them
async function fetchActivitySummary(idLike, accessToken) {
  const tryFetch = async (url)=>{
    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      const status = res.status;
      if (!res.ok) {
        console.log('single-activity summary fetch not ok', status, url);
        return {
          data: null,
          status,
          url
        };
      }
      try {
        const data = await res.json();
        return {
          data,
          status,
          url
        };
      } catch  {
        return {
          data: null,
          status,
          url
        };
      }
    } catch (e) {
      console.log('single-activity summary fetch exception', String(e));
      return {
        data: null,
        status: 0,
        url
      };
    }
  };
  // Common variants observed in Garmin Wellness/Connect
  const id = normalizeSummaryId(idLike);
  const candidates = [
    // wellness single-activity
    `https://apis.garmin.com/wellness-api/rest/activity/${encodeURIComponent(id)}`,
    `https://apis.garmin.com/wellness-api/rest/activities/${encodeURIComponent(id)}`,
    // some tenants expose explicit summary endpoints
    `https://apis.garmin.com/wellness-api/rest/activity/${encodeURIComponent(id)}/summary`,
    `https://apis.garmin.com/wellness-api/rest/activities/${encodeURIComponent(id)}/summary`,
    // connect modern activity summary by numeric activityId
    `https://connectapi.garmin.com/modern/proxy/activity-service/activity/${encodeURIComponent(id)}`,
    `https://connectapi.garmin.com/modern/proxy/activity-service/activity/${encodeURIComponent(id)}/details`
  ];
  let lastResp = null;
  for (const url of candidates){
    try {
      const resp = await tryFetch(url);
      if (resp) {
        // Return immediately if we got data; otherwise remember status and keep trying other endpoints
        if (resp.data) return resp;
        lastResp = resp;
      }
    } catch  {}
  }
  return lastResp;
}
// Enhanced function for activities with API call for details
async function processActivities(activities) {
  if (!activities || activities.length === 0) {
    console.log('No activities to process');
    return;
  }
  console.log(`Processing ${activities.length} activities with API call for details`);
  // Initialize Supabase client
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  for (const activity of activities){
    try {
      const { data: connections } = await supabase.from('user_connections').select('user_id').eq('provider', 'garmin').eq('connection_data->>user_id', activity.userId).limit(1);
      const connection = connections?.[0];
      if (!connection) {
        console.log(`No user found for Garmin userId: ${activity.userId}`);
        continue;
      }
      if (!connection.user_id) {
        console.log(`Found connection but user_id is null for Garmin userId: ${activity.userId}`);
        continue;
      }
      // Convert Garmin activity to our format
      const activityRecord = {
        user_id: connection.user_id,
        garmin_activity_id: activity.summaryId,
        garmin_user_id: activity.userId,
        activity_id: activity.activityId || null,
        activity_type: activity.activityType,
        start_time: new Date(activity.startTimeInSeconds * 1000).toISOString(),
        start_time_offset_seconds: activity.startTimeOffsetInSeconds || 0,
        duration_seconds: activity.durationInSeconds,
        distance_meters: activity.distanceInMeters || null,
        calories: activity.activeKilocalories || null,
        avg_speed_mps: activity.averageSpeedInMetersPerSecond || null,
        max_speed_mps: activity.maxSpeedInMetersPerSecond || null,
        avg_pace_min_per_km: activity.averagePaceInMinutesPerKilometer || null,
        max_pace_min_per_km: activity.maxPaceInMinutesPerKilometer || null,
        avg_heart_rate: activity.averageHeartRateInBeatsPerMinute || null,
        max_heart_rate: activity.maxHeartRateInBeatsPerMinute || null,
        avg_bike_cadence: activity.averageBikeCadenceInRoundsPerMinute || null,
        max_bike_cadence: activity.maxBikeCadenceInRoundsPerMinute || null,
        avg_run_cadence: activity.averageRunCadenceInStepsPerMinute || null,
        max_run_cadence: activity.maxRunCadenceInStepsPerMinute || null,
        avg_swim_cadence: activity.averageSwimCadenceInStrokesPerMinute || null,
        avg_push_cadence: activity.averagePushCadenceInPushesPerMinute || null,
        max_push_cadence: activity.maxPushCadenceInPushesPerMinute || null,
        avg_power: activity.averagePowerInWatts || null,
        max_power: activity.maxPowerInWatts || null,
        elevation_gain_meters: activity.totalElevationGainInMeters || null,
        elevation_loss_meters: activity.totalElevationLossInMeters || null,
        starting_latitude: activity.startingLatitudeInDegree || null,
        starting_longitude: activity.startingLongitudeInDegree || null,
        steps: activity.steps || null,
        pushes: activity.pushes || null,
        number_of_active_lengths: activity.numberOfActiveLengths || null,
        device_name: activity.deviceName || null,
        is_parent: activity.isParent || false,
        parent_summary_id: activity.parentSummaryId || null,
        manual: activity.manual || false,
        is_web_upload: activity.isWebUpload || false,
        raw_data: activity,
        created_at: new Date().toISOString()
      };
      // Insert or update the basic activity
      const { error } = await supabase.from('garmin_activities').upsert(activityRecord, {
        onConflict: 'garmin_activity_id'
      });
      if (error) {
        console.error('Error saving activity:', error);
      } else {
        console.log(`Saved basic activity: ${activity.activityType} - ${activity.summaryId} (HR: ${activity.averageHeartRateInBeatsPerMinute || 'N/A'}, Cadence: ${activity.averageBikeCadenceInRoundsPerMinute || 'N/A'})`);
      }
      // Fetch and save rich activity details with samples
      console.log(`Fetching rich details for activity: ${activity.summaryId}`);
      const activityDetail = await fetchActivityDetails(activity.summaryId, activity.userId);
      if (activityDetail) {
        await processActivityDetails([
          activityDetail
        ]);
        console.log(`✅ Successfully fetched and processed rich details for: ${activity.summaryId}`);
      } else {
        console.log(`❌ No rich details found for: ${activity.summaryId}`);
      }
    } catch (error) {
      console.error('Error processing individual activity:', error);
    }
  }
}
// FIXED: Enhanced function for activity details with correct payload structure
async function processActivityDetails(activityDetails) {
  if (!activityDetails || activityDetails.length === 0) {
    console.log('No activity details to process');
    return;
  }
  console.log(`Processing ${activityDetails.length} activity details`);
  // Initialize Supabase client
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  for (const activityDetail of activityDetails){
    try {
      // FIXED: Correctly merge root-level fields with summary fields
      // Activity Details webhook sends summaryId/userId at root, other data in summary
      const activity = {
        ...activityDetail.summary,
        summaryId: activityDetail.summaryId,
        userId: activityDetail.userId,
        activityId: activityDetail.activityId
      };
      const samples = activityDetail.samples || [];
      console.log(`Processing activity detail: ${activity.summaryId} with ${samples.length} samples`);
      
      // 🔍 DIAGNOSTIC: Log sample processing for FR 965 debugging
      if (samples.length > 0) {
        const firstSample = samples[0];
        console.log('🔍 SAMPLE PROCESSING DIAGNOSTICS:', {
          sample_count: samples.length,
          first_sample_fields: Object.keys(firstSample),
          first_sample_values: firstSample,
          field_availability: {
            speedMetersPerSecond: samples.filter(s => s.speedMetersPerSecond != null).length,
            totalDistanceInMeters: samples.filter(s => s.totalDistanceInMeters != null).length,
            heartRate: samples.filter(s => s.heartRate != null).length,
            stepsPerMinute: samples.filter(s => s.stepsPerMinute != null).length,
            latitudeInDegree: samples.filter(s => s.latitudeInDegree != null).length,
            longitudeInDegree: samples.filter(s => s.longitudeInDegree != null).length
          }
        });
      }
      // Get user connection
      const { data: connections } = await supabase.from('user_connections').select('user_id, connection_data').eq('provider', 'garmin').eq('connection_data->>user_id', activity.userId).limit(1);
      const connection = connections?.[0];
      if (!connection) {
        console.log(`No user found for Garmin userId: ${activity.userId}`);
        continue;
      }
      if (!connection.user_id) {
        console.log(`Found connection but user_id is null for Garmin userId: ${activity.userId}`);
        continue;
      }
      // Process ALL sensor data from samples
      let avgPower = null, maxPower = null;
      let avgHeartRate = null, maxHeartRate = null;
      let avgCadence = null, maxCadence = null;
      let avgTemperature = null, maxTemperature = null;
      let gpsTrack = [];
      let allSensorData = [];
      if (samples.length > 0) {
        const powerValues = [], heartRateValues = [], cadenceValues = [], tempValues = [];
        for (const sample of samples){
          const sensorReading = {
            timestamp: sample.startTimeInSeconds,
            power: sample.powerInWatts || null,
            heartRate: sample.heartRate || null,
            latitude: sample.latitudeInDegree || null,
            longitude: sample.longitudeInDegree || null,
            elevation: sample.elevationInMeters || null,
            bikeCadence: sample.bikeCadenceInRPM || null,
            runCadence: sample.stepsPerMinute || null,
            swimCadence: sample.swimCadenceInStrokesPerMinute || null,
            wheelchairCadence: sample.directWheelchairCadence || null,
            temperature: sample.airTemperatureCelcius || null,
            timerDuration: sample.timerDurationInSeconds || null,
            clockDuration: sample.clockDurationInSeconds || null,
            movingDuration: sample.movingDurationInSeconds || null,
            // Added for per-step slicing and distance-accurate splits
            speedMetersPerSecond: sample.speedMetersPerSecond || null,
            totalDistanceInMeters: sample.totalDistanceInMeters || null
          };
          allSensorData.push(sensorReading);
          // Collect values for averaging
          if (sample.powerInWatts !== undefined && sample.powerInWatts !== null) powerValues.push(sample.powerInWatts);
          if (sample.heartRate !== undefined && sample.heartRate !== null) heartRateValues.push(sample.heartRate);
          if (sample.airTemperatureCelcius !== undefined && sample.airTemperatureCelcius !== null) tempValues.push(sample.airTemperatureCelcius);
          const cadence = sample.bikeCadenceInRPM || sample.stepsPerMinute || sample.swimCadenceInStrokesPerMinute || sample.directWheelchairCadence;
          if (cadence !== undefined && cadence !== null) cadenceValues.push(cadence);
          // GPS tracking
          if (sample.latitudeInDegree && sample.longitudeInDegree) {
            gpsTrack.push({
              timestamp: sample.startTimeInSeconds,
              lat: sample.latitudeInDegree,
              lng: sample.longitudeInDegree,
              elevation: sample.elevationInMeters || null
            });
          }
        }
        // Calculate averages and maximums
        if (powerValues.length > 0) {
          avgPower = Math.round(powerValues.reduce((a, b)=>a + b) / powerValues.length);
          maxPower = Math.max(...powerValues);
        }
        if (heartRateValues.length > 0) {
          avgHeartRate = Math.round(heartRateValues.reduce((a, b)=>a + b) / heartRateValues.length);
          maxHeartRate = Math.max(...heartRateValues);
        }
        if (cadenceValues.length > 0) {
          avgCadence = Math.round(cadenceValues.reduce((a, b)=>a + b) / cadenceValues.length);
          maxCadence = Math.max(...cadenceValues);
        }
        if (tempValues.length > 0) {
          avgTemperature = tempValues.reduce((a, b)=>a + b) / tempValues.length;
          maxTemperature = Math.max(...tempValues);
        }
        console.log(`Extracted ALL sensor data: ${samples.length} samples Power: ${avgPower ? `${avgPower}W avg, ${maxPower}W max` : 'N/A'} HR: ${avgHeartRate ? `${avgHeartRate} avg, ${maxHeartRate} max` : 'N/A'} Cadence: ${avgCadence ? `${avgCadence} avg, ${maxCadence} max` : 'N/A'} GPS: ${gpsTrack.length} points`);
      }
      // Enrich summary with TE/RD only when explicitly enabled by env flag
      try {
        const enableSingleSummary = String(Deno.env.get('GARMIN_ENABLE_SINGLE_SUMMARY') || 'false').toLowerCase() === 'true';
        if (enableSingleSummary) {
          const supa = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
          // Prefer selecting by our internal user_id linkage
          let token;
          try {
            const byUid = await supa.from('user_connections').select('access_token, connection_data').eq('provider', 'garmin').eq('user_id', connection.user_id).maybeSingle();
            token = byUid.data?.access_token || byUid.data?.connection_data?.access_token;
          } catch  {}
          // Fallback: match by Garmin userId in connection_data
          if (!token) {
            try {
              const byGid = await supa.from('user_connections').select('access_token, connection_data').eq('provider', 'garmin').eq('connection_data->>user_id', activity.userId).maybeSingle();
              token = byGid.data?.access_token || byGid.data?.connection_data?.access_token;
            } catch  {}
          }
          // Fallback: device_connections
          if (!token && connection?.user_id) {
            try {
              const { data: devConn } = await supa.from('device_connections').select('access_token, connection_data').eq('provider', 'garmin').eq('user_id', connection.user_id).single();
              token = devConn?.access_token || devConn?.connection_data?.access_token;
            } catch  {}
          }
          if (token) {
            // Prefer activityId when available; fallback to summaryId
            const single = await fetchActivitySummary(String(activity.activityId ?? activity.summaryId), token);
            // Always store status even if body is empty
            activityDetail.single_summary_status = single?.status ?? null;
            const singleSummary = single?.data?.summary || single?.data;
            if (singleSummary && typeof singleSummary === 'object') {
              // Keep a copy for diagnostics
              activityDetail.single_summary = singleSummary;
              // Prefer values from single activity summary if present
              activityDetail.summary = {
                ...activityDetail.summary,
                ...singleSummary
              };
            }
          }
        } else {
          activityDetail.single_summary_status = 'disabled';
        }
      } catch  {}
      // Ensure a row exists in garmin_activities even if it was deleted (use minimal upsert)
      try {
        const baseRecord = {
          user_id: connection.user_id,
          garmin_activity_id: activity.summaryId,
          garmin_user_id: activity.userId,
          activity_type: activity.activityType,
          start_time: new Date(activity.startTimeInSeconds * 1000).toISOString(),
          raw_data: activityDetail,
          created_at: new Date().toISOString()
        };
        if (gpsTrack.length > 0) baseRecord.gps_track = gpsTrack;
        if (allSensorData.length > 0) baseRecord.sensor_data = allSensorData;
        if (samples.length > 0) baseRecord.samples_data = samples;
        const gain = Number(activityDetail?.summary?.totalElevationGainInMeters);
        if (Number.isFinite(gain)) baseRecord.elevation_gain_meters = gain;
        if (avgTemperature !== null) baseRecord.avg_temperature = avgTemperature;
        if (maxTemperature !== null) baseRecord.max_temperature = maxTemperature;
        const { error: upsertErr } = await supabase.from('garmin_activities').upsert(baseRecord, {
          onConflict: 'garmin_activity_id'
        });
        if (upsertErr) console.warn('Non-fatal: upsert garmin_activities failed', upsertErr);
      } catch (uErr) {
        console.warn('Non-fatal: exception upserting garmin_activities', uErr);
      }
      // Always delegate swims to swim-activity-details (it reconstructs lengths and calls ingest-activity itself)
      // Dev toggle: STRICT_SWIM_DELEGATION=true will disable any local fallbacks and skip direct ingest on failure
      let reconstructedLengths: Array<{ distance_m: number; duration_s: number }> | null = null;
      try {
        const typeKey = String(
          (activityDetail as any)?.summary?.activityType?.typeKey ??
          (activityDetail as any)?.summary?.activityTypeDTO?.typeKey ??
          (activity as any)?.activityType ??
          ''
        ).toLowerCase();
        const isSwim = typeKey.includes('swim');
        const numLengths = Number((activityDetail as any)?.summary?.numberOfActiveLengths);
        const poolLen = Number((activityDetail as any)?.summary?.poolLengthInMeters);
        const swimHints = (Number.isFinite(numLengths) && numLengths > 0) || (Number.isFinite(poolLen) && poolLen > 0);
        const routeAsSwim = isSwim || swimHints;
        console.log('🚦 Swim routing decision', { summaryId: String(activity.summaryId ?? activity.activityId ?? ''), typeKey, isSwim, swimHints, numLengths, poolLen });
        if (routeAsSwim) {
          const strictSwim = String(Deno.env.get('STRICT_SWIM_DELEGATION') || 'false').toLowerCase() === 'true';
          const functionsBase = String(Deno.env.get('SUPABASE_FUNCTIONS_URL') || '');
          const projectRef = (()=>{ try { return new URL(String(Deno.env.get('SUPABASE_URL'))).hostname.split('.')[0]; } catch { return ''; }})();
          const delegateUrl = functionsBase
            ? `${functionsBase.replace(/\/$/, '')}/swim-activity-details`
            : (projectRef ? `https://${projectRef}.functions.supabase.co/swim-activity-details` : `${String(Deno.env.get('SUPABASE_URL'))}/functions/v1/swim-activity-details`);
          const delegateKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
          const resp = await fetch(delegateUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${delegateKey}`,
              'apikey': delegateKey
            },
            body: JSON.stringify({ provider: 'garmin', userId: connection.user_id, activityId: String(activity.summaryId ?? activity.activityId ?? '') })
          });
          if (resp.ok) {
            console.log('🧮 Delegated swim processing to swim-activity-details');
            continue; // swim function will call ingest-activity
          } else {
            const txt = await resp.text().catch(()=> '');
            console.warn('⚠️ swim-activity-details responded non-OK:', resp.status, txt);
            if (strictSwim) {
              console.warn('⛔ STRICT_SWIM_DELEGATION enabled — skipping direct ingest for swims.');
              continue; // do not ingest without swim function in strict mode
            }
            // Inline reconstruction fallback (uses samples + numberOfActiveLengths) — disabled by STRICT_SWIM_DELEGATION
            try {
              const summary = (activityDetail as any)?.summary || {};
              const num = Number(summary?.numberOfActiveLengths);
              const totalDist = Number(summary?.distanceInMeters ?? summary?.totalDistanceInMeters);
              if (Number.isFinite(num) && num > 0 && Number.isFinite(totalDist) && totalDist > 0 && Array.isArray(samples) && samples.length > 1) {
                const L = totalDist / num;
                // Build time and distance series; if cumulative distance missing, integrate speed
                const ptsRaw = samples.map((s:any, i:number)=>({
                  d: Number(s.totalDistanceInMeters ?? s.distanceInMeters ?? s.cumulativeDistanceInMeters ?? NaN),
                  v: Number(s.speedMetersPerSecond ?? NaN),
                  t: Number(s.timerDurationInSeconds ?? s.clockDurationInSeconds ?? s.movingDurationInSeconds ?? i)
                })).filter((p:any)=>Number.isFinite(p.t)).sort((a:any,b:any)=>a.t-b.t);
                if (ptsRaw.length > 1) {
                  // Ensure distance monotonic; integrate when missing or non-finite
                  let cum = Number.isFinite(ptsRaw[0].d) ? ptsRaw[0].d : 0;
                  const points:any[] = [{ t: ptsRaw[0].t, d: cum }];
                  for (let i=1;i<ptsRaw.length;i++){
                    const prev = ptsRaw[i-1]; const cur = ptsRaw[i];
                    let dNow = Number(cur.d);
                    if (!Number.isFinite(dNow)) {
                      const dt = Math.max(0, Math.min(60, cur.t - prev.t));
                      const v0 = Number.isFinite(prev.v) ? prev.v : NaN;
                      const v1 = Number.isFinite(cur.v) ? cur.v : NaN;
                      const vAvg = Number.isFinite(v0) && Number.isFinite(v1) ? (v0+v1)/2 : Number.isFinite(v1) ? v1 : Number.isFinite(v0) ? v0 : NaN;
                      if (Number.isFinite(vAvg) && dt > 0) cum += vAvg * dt;
                      dNow = cum;
                    } else {
                      cum = dNow;
                    }
                    points.push({ t: cur.t, d: dNow });
                  }
                  // Compute crossing times at multiples of L
                  const thresholds:number[] = []; for(let i=1;i<=num;i++) thresholds.push(i*L);
                  const crossTimes:number[] = []; let j=1;
                  for (const thr of thresholds){
                    while (j < points.length && points[j].d < thr) j++;
                    if (j >= points.length) break;
                    const prev = points[j-1], curr = points[j];
                    const dd = curr.d - prev.d; const dt = curr.t - prev.t;
                    let tCross = curr.t;
                    if (dd > 0 && dt >= 0) { const frac = Math.max(0, Math.min(1, (thr - prev.d)/dd)); tCross = prev.t + frac*dt; }
                    crossTimes.push(tCross);
                  }
                  if (crossTimes.length) {
                    const out:any[] = []; let lastT = Number.isFinite(points[0].t) ? points[0].t : 0;
                    for (const t of crossTimes){ const dur = Math.max(1, Math.round(t - lastT)); out.push({ distance_m: L, duration_s: dur }); lastT = t; }
                    reconstructedLengths = out;
                    console.log(`🛟 Inline swim reconstruction produced ${out.length} lengths (L=${L.toFixed(2)}m)`);
                  } else {
                    // Last-resort: equal-time partition
                    const t0 = points[0].t; const tN = points[points.length-1].t; const span = Math.max(1, tN - t0);
                    const out:any[] = []; let lastT = t0;
                    for (let k=1;k<=num;k++){ const tk = t0 + (span * k / num); const dur = Math.max(1, Math.round(tk - lastT)); out.push({ distance_m: L, duration_s: dur }); lastT = tk; }
                    reconstructedLengths = out;
                    console.log(`🛟 Inline swim fallback (equal-time) produced ${out.length} lengths (L=${L.toFixed(2)}m)`);
                  }
                }
              }
            } catch {}
          }
        }
      } catch (e) {
        console.warn('⚠️ Delegation to swim-activity-details failed:', String(e));
      }

      // Mirror into workouts via ingest-activity (idempotent upsert by user_id,garmin_activity_id)
      try {
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-activity`;
        const swim_data = activityDetail?.lengths ? { lengths: activityDetail.lengths } : (reconstructedLengths && reconstructedLengths.length ? { lengths: reconstructedLengths } : null);
        // Laps may appear at root or under summary depending on source
        const laps = activityDetail?.laps ?? activityDetail?.summary?.laps ?? null;
        // Compute robust local/UTC timing values for correct local date derivation downstream
        const sIn = Number(activity.startTimeInSeconds ?? NaN);
        const sOffRaw = Number(activity.startTimeOffsetInSeconds ?? NaN);
        const sLoc = Number(activity?.localStartTimeInSeconds ?? (Number.isFinite(sIn) && Number.isFinite(sOffRaw) ? sIn + sOffRaw : NaN));
        const sOff = Number.isFinite(sOffRaw) ? sOffRaw : Number.isFinite(sIn) && Number.isFinite(sLoc) ? sLoc - sIn : 0;
        const payload = {
          userId: connection.user_id,
          provider: 'garmin',
          activity: {
            garmin_activity_id: String(activity.summaryId ?? activity.activityId ?? ''),
            activity_type: activity.activityType,
            start_time: new Date(activity.startTimeInSeconds * 1000).toISOString(),
            start_time_in_seconds: Number.isFinite(sIn) ? sIn : null,
            start_time_offset_seconds: sOff,
            local_start_time_in_seconds: Number.isFinite(sLoc) ? sLoc : null,
            start_time_local: activity?.startTimeLocal ?? null,
            duration_seconds: activity.durationInSeconds,
            distance_meters: activity.distanceInMeters ?? null,
            avg_heart_rate: avgHeartRate ?? activity.averageHeartRateInBeatsPerMinute ?? null,
            max_heart_rate: maxHeartRate ?? activity.maxHeartRateInBeatsPerMinute ?? null,
            avg_speed_mps: activity.averageSpeedInMetersPerSecond ?? null,
            max_speed_mps: activity.maxSpeedInMetersPerSecond ?? null,
            calories: activity.activeKilocalories ?? null,
            elevation_gain_meters: activityDetail?.summary?.totalElevationGainInMeters ?? null,
            starting_latitude: activity.startingLatitudeInDegree ?? null,
            starting_longitude: activity.startingLongitudeInDegree ?? null,
            // Swim specifics if present
            pool_length: activity.poolLengthInMeters ?? activity.pool_length ?? null,
            strokes: activity.totalNumberOfStrokes ?? activity.strokes ?? null,
            number_of_active_lengths: activity.numberOfActiveLengths ?? null,
            avg_swim_cadence: activity.averageSwimCadenceInStrokesPerMinute ?? null,
            // Run/Bike cadence
            avg_bike_cadence: activity.averageBikeCadenceInRoundsPerMinute ?? null,
            max_bike_cadence: activity.maxBikeCadenceInRoundsPerMinute ?? null,
            avg_run_cadence: activity.averageRunCadenceInStepsPerMinute ?? null,
            max_run_cadence: activity.maxRunCadenceInStepsPerMinute ?? null,
            // Power (if any sensors)
            avg_power: avgPower ?? activityDetail?.summary?.averagePowerInWatts ?? null,
            max_power: maxPower ?? activityDetail?.summary?.maxPowerInWatts ?? null,
            // Temps & steps
            avg_temperature: avgTemperature ?? activityDetail?.summary?.avgTemperatureCelcius ?? null,
            max_temperature: maxTemperature ?? null,
            steps: activityDetail?.summary?.steps ?? activity.steps ?? null,
            // Training effect (aerobic/anaerobic) – normalized keys preferred; include legacy for compatibility
            aerobic_training_effect: activityDetail?.summary?.aerobicTrainingEffect ?? activityDetail?.summary?.aerobic_training_effect ?? null,
            anaerobic_training_effect: activityDetail?.summary?.anaerobicTrainingEffect ?? activityDetail?.summary?.anaerobic_training_effect ?? null,
            total_training_effect: activityDetail?.summary?.aerobicTrainingEffect ?? activityDetail?.summary?.aerobic_training_effect ?? null,
            total_anaerobic_effect: activityDetail?.summary?.anaerobicTrainingEffect ?? activityDetail?.summary?.anaerobic_training_effect ?? null,
            // Multisport linkage
            is_parent: activity.isParent ?? null,
            parentSummaryId: activity.parentSummaryId ?? null,
            // Rich JSON
            gps_track: gpsTrack.length ? gpsTrack : null,
            sensor_data: allSensorData.length ? {
              samples: allSensorData
            } : null,
            swim_data,
            laps
          }
        };
        const authKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authKey}`,
            'apikey': authKey
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const txt = await res.text().catch(()=> '');
          console.warn('⚠️ ingest-activity responded non-OK:', res.status, txt);
        } else {
          console.log('🧩 Mirrored into workouts via ingest-activity');
        }
      } catch (ingErr) {
        console.error('❌ Failed to mirror into workouts via ingest-activity:', ingErr);
      }
    } catch (error) {
      console.error('Error processing individual activity detail:', error);
    }
  }
}


