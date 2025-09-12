// @ts-nocheck
import { createClient } from 'jsr:@supabase/supabase-js@2';



Deno.serve(async (req) => {
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
    
    const { data: connections } = await supabase
      .from('user_connections')
      .select('user_id, connection_data')
      .eq('provider', 'garmin')
      .eq('connection_data->>user_id', userId)
      .limit(1);
    
    const connection = connections?.[0];
    if (!connection?.connection_data?.access_token) {
      console.log(`No access token found for user: ${userId}`);
      return null;
    }
    
    const accessToken = connection.connection_data.access_token;
    
    // Calculate time range (last 7 days) to capture older resends
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 7 * 24 * 60 * 60;
    
    // Call Garmin Activity Details API
    const response = await fetch(
      `https://apis.garmin.com/wellness-api/rest/activityDetails?uploadStartTimeInSeconds=${oneDayAgo}&uploadEndTimeInSeconds=${now}&includeAll=true&maxPageSize=200`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      console.error(`Garmin API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const activityDetails = await response.json();
    console.log(`Fetched ${activityDetails.length} activity details from Garmin API`);
    
    // Find the specific activity we're looking for
    const targetActivity = activityDetails.find(
      (detail) => detail.summaryId === summaryId || detail.summary?.summaryId === summaryId
    );
    
    return targetActivity || null;
  } catch (error) {
    console.error('Error fetching activity details:', error);
    return null;
  }
}

// Try single-activity summary endpoints to get TE/RD rollups when activityDetails range lacks them
async function fetchActivitySummary(summaryId: string, accessToken: string) {
  const tryFetch = async (url: string) => {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    try { return await res.json(); } catch { return null; }
  };
  // Common variants observed in Garmin Wellness/Connect
  const bases = [
    'https://apis.garmin.com/wellness-api/rest/activity/',
    'https://apis.garmin.com/wellness-api/rest/activities/'
  ];
  for (const base of bases) {
    try {
      const data = await tryFetch(base + encodeURIComponent(summaryId));
      if (data) return data;
    } catch { /* continue */ }
  }
  return null;
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
  
  for (const activity of activities) {
    try {
      const { data: connections } = await supabase
        .from('user_connections')
        .select('user_id')
        .eq('provider', 'garmin')
        .eq('connection_data->>user_id', activity.userId)
        .limit(1);
      
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
      const { error } = await supabase
        .from('garmin_activities')
        .upsert(activityRecord, {
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
        await processActivityDetails([activityDetail]);
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
  
  for (const activityDetail of activityDetails) {
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
      
      // Get user connection
      const { data: connections } = await supabase
        .from('user_connections')
        .select('user_id, connection_data')
        .eq('provider', 'garmin')
        .eq('connection_data->>user_id', activity.userId)
        .limit(1);
      
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
        
        for (const sample of samples) {
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
          avgPower = Math.round(powerValues.reduce((a, b) => a + b) / powerValues.length);
          maxPower = Math.max(...powerValues);
        }
        
        if (heartRateValues.length > 0) {
          avgHeartRate = Math.round(heartRateValues.reduce((a, b) => a + b) / heartRateValues.length);
          maxHeartRate = Math.max(...heartRateValues);
        }
        
        if (cadenceValues.length > 0) {
          avgCadence = Math.round(cadenceValues.reduce((a, b) => a + b) / cadenceValues.length);
          maxCadence = Math.max(...cadenceValues);
        }
        
        if (tempValues.length > 0) {
          avgTemperature = tempValues.reduce((a, b) => a + b) / tempValues.length;
          maxTemperature = Math.max(...tempValues);
        }
        
        console.log(`Extracted ALL sensor data: ${samples.length} samples Power: ${avgPower ? `${avgPower}W avg, ${maxPower}W max` : 'N/A'} HR: ${avgHeartRate ? `${avgHeartRate} avg, ${maxHeartRate} max` : 'N/A'} Cadence: ${avgCadence ? `${avgCadence} avg, ${maxCadence} max` : 'N/A'} GPS: ${gpsTrack.length} points`);
        

      }
      
      // Enrich summary with TE/RD if available from single-activity endpoint
      try {
        const supa = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
        const { data: connRow } = await supa
          .from('user_connections')
          .select('connection_data')
          .eq('provider', 'garmin')
          .eq('connection_data->>user_id', activity.userId)
          .single();
        const token = connRow?.connection_data?.access_token as string | undefined;
        if (token) {
          const single = await fetchActivitySummary(String(activity.summaryId), token);
          const singleSummary = (single as any)?.summary || single;
          if (singleSummary && typeof singleSummary === 'object') {
            // Prefer values from single activity summary if present
            (activityDetail as any).summary = { ...(activityDetail as any).summary, ...singleSummary };
          }
        }
      } catch { /* non-fatal */ }

      // Update existing activity minimally to avoid schema mismatches (only rely on guaranteed columns)
      try {
        const updateFields: any = { raw_data: activityDetail };
        if (gpsTrack.length > 0) updateFields.gps_track = gpsTrack;
        if (allSensorData.length > 0) updateFields.sensor_data = allSensorData;
        if (samples.length > 0) updateFields.samples_data = samples;
        const gain = Number((activityDetail as any)?.summary?.totalElevationGainInMeters);
        if (Number.isFinite(gain)) updateFields.elevation_gain_meters = gain;
        if (avgTemperature !== null) updateFields.avg_temperature = avgTemperature;
        if (maxTemperature !== null) updateFields.max_temperature = maxTemperature;
        const { error: updateErr } = await supabase
          .from('garmin_activities')
          .update(updateFields)
          .eq('garmin_activity_id', activity.summaryId);
        if (updateErr) console.warn('Non-fatal: update garmin_activities failed', updateErr);
      } catch (uErr) {
        console.warn('Non-fatal: exception updating garmin_activities', uErr);
      }

      // Mirror into workouts via ingest-activity (idempotent upsert by user_id,garmin_activity_id)
      try {
        const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-activity`;
        const swim_data = (activityDetail as any)?.lengths ? { lengths: (activityDetail as any).lengths } : null;
        // Laps may appear at root or under summary depending on source
        const laps = (activityDetail as any)?.laps ?? (activityDetail as any)?.summary?.laps ?? null;

        const payload = {
          userId: connection.user_id,
          provider: 'garmin',
          activity: {
            garmin_activity_id: String(activity.summaryId ?? activity.activityId ?? ''),
            activity_type: activity.activityType,
            start_time: new Date(activity.startTimeInSeconds * 1000).toISOString(),
            start_time_in_seconds: activity.startTimeInSeconds ?? null,
            start_time_offset_seconds: activity.startTimeOffsetInSeconds ?? 0,
            start_time_local: (activity as any)?.startTimeLocal ?? null,
            duration_seconds: activity.durationInSeconds,
            distance_meters: activity.distanceInMeters ?? null,
            avg_heart_rate: avgHeartRate ?? activity.averageHeartRateInBeatsPerMinute ?? null,
            max_heart_rate: maxHeartRate ?? activity.maxHeartRateInBeatsPerMinute ?? null,
            avg_speed_mps: activity.averageSpeedInMetersPerSecond ?? null,
            max_speed_mps: activity.maxSpeedInMetersPerSecond ?? null,
            calories: activity.activeKilocalories ?? null,
            elevation_gain_meters: (activityDetail as any)?.summary?.totalElevationGainInMeters ?? null,
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
            avg_power: avgPower ?? (activityDetail as any)?.summary?.averagePowerInWatts ?? null,
            max_power: maxPower ?? (activityDetail as any)?.summary?.maxPowerInWatts ?? null,
            // Temps & steps
            avg_temperature: avgTemperature ?? (activityDetail as any)?.summary?.avgTemperatureCelcius ?? null,
            max_temperature: maxTemperature ?? null,
            steps: (activityDetail as any)?.summary?.steps ?? activity.steps ?? null,
            // Training effect (aerobic/anaerobic) – passed through for workouts mapping
            total_training_effect: (activityDetail as any)?.summary?.aerobicTrainingEffect ?? (activityDetail as any)?.summary?.aerobic_training_effect ?? null,
            total_anaerobic_effect: (activityDetail as any)?.summary?.anaerobicTrainingEffect ?? (activityDetail as any)?.summary?.anaerobic_training_effect ?? null,
            // Multisport linkage
            is_parent: activity.isParent ?? null,
            parentSummaryId: activity.parentSummaryId ?? null,
            // Rich JSON
            gps_track: gpsTrack.length ? gpsTrack : null,
            sensor_data: allSensorData.length ? { samples: allSensorData } : null,
            swim_data,
            laps,
          },
        };

        const authKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authKey}`,
            'apikey': authKey,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
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