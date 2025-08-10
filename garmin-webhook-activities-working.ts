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
    
    // Calculate time range (last 24 hours)
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 24 * 60 * 60;
    
    // Call Garmin Activity Details API
    const response = await fetch(
      `https://apis.garmin.com/wellness-api/rest/activityDetails?uploadStartTimeInSeconds=${oneDayAgo}&uploadEndTimeInSeconds=${now}`,
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
        start_time: (() => {
          const utcDate = new Date(activity.startTimeInSeconds * 1000);
          // Convert UTC to PST (UTC-8) or PDT (UTC-7) automatically
          const pstDate = new Date(utcDate.toLocaleString("en-US", {
            timeZone: "America/Los_Angeles"
          }));
          return pstDate.toISOString();
        })(),
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
            movingDuration: sample.movingDurationInSeconds || null
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
        
        // 🔍 DEBUG: Check what Garmin is sending for elevation
        console.log(`🔍 ELEVATION DEBUG: summaryDTO = ${JSON.stringify(activityDetail?.summaryDTO)}`);
        console.log(`🔍 ELEVATION DEBUG: totalElevationGain = ${activityDetail?.summaryDTO?.totalElevationGain}`);
        console.log(`🔍 ELEVATION DEBUG: Final value = ${Number(activityDetail?.summaryDTO?.totalElevationGain) || null}`);
      }
      
      // Convert Garmin activity to our format with ALL available fields
      const activityRecord = {
        user_id: connection.user_id,
        garmin_activity_id: activity.summaryId,
        garmin_user_id: activity.userId,
        activity_id: activity.activityId || null,
        activity_type: activity.activityType,
        // 🔧 FIX: Convert UTC time to PST automatically
        start_time: (() => {
          const utcDate = new Date(activity.startTimeInSeconds * 1000);
          // Convert UTC to PST (UTC-8) or PDT (UTC-7) automatically
          const pstDate = new Date(utcDate.toLocaleString("en-US", {
            timeZone: "America/Los_Angeles"
          }));
          return pstDate.toISOString();
        })(),
        start_time_offset_seconds: activity.startTimeOffsetInSeconds || 0,
        duration_seconds: activity.durationInSeconds,
        distance_meters: activity.distanceInMeters || null,
        calories: activity.activeKilocalories || null,
        avg_speed_mps: activity.averageSpeedInMetersPerSecond || null,
        max_speed_mps: activity.maxSpeedInMetersPerSecond || null,
        avg_pace_min_per_km: activity.averagePaceInMinutesPerKilometer || null,
        max_pace_min_per_km: activity.maxPaceInMinutesPerKilometer || null,
        avg_heart_rate: avgHeartRate || activity.averageHeartRateInBeatsPerMinute || null,
        max_heart_rate: maxHeartRate || activity.maxHeartRateInBeatsPerMinute || null,
        avg_bike_cadence: avgCadence || activity.averageBikeCadenceInRoundsPerMinute || null,
        max_bike_cadence: maxCadence || activity.maxBikeCadenceInRoundsPerMinute || null,
        avg_run_cadence: activity.averageRunCadenceInStepsPerMinute || null,
        max_run_cadence: activity.maxRunCadenceInStepsPerMinute || null,
        avg_swim_cadence: activity.averageSwimCadenceInStrokesPerMinute || null,
        avg_push_cadence: activity.averagePushCadenceInPushesPerMinute || null,
        max_push_cadence: activity.maxPushCadenceInPushesPerMinute || null,
        avg_power: avgPower || null,
        max_power: maxPower || null,
        // 🔧 FIX: Use official Garmin total ascent from summaryDTO
        elevation_gain_meters: Number(activityDetail?.summaryDTO?.totalElevationGain) || null,
        avg_temperature: avgTemperature || null,
        max_temperature: maxTemperature || null,
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
        samples_data: samples.length > 0 ? samples : null,
        sensor_data: allSensorData.length > 0 ? allSensorData : null,
        gps_track: gpsTrack.length > 0 ? gpsTrack : null,
        raw_data: activityDetail,
        created_at: new Date().toISOString()
      };
      
      // Insert or update the activity
      const { error } = await supabase
        .from('garmin_activities')
        .upsert(activityRecord, {
          onConflict: 'garmin_activity_id'
        });
      
      if (error) {
        console.error('Error saving activity:', error);
      } else {
        console.log(`✅ SAVED COMPLETE ACTIVITY: ${activity.activityType} - ${activity.summaryId} ${avgPower ? `Power: ${avgPower}W avg` : 'No power'} ${avgHeartRate ? `HR: ${avgHeartRate} avg` : 'No HR'} ${gpsTrack.length > 0 ? `GPS: ${gpsTrack.length} points` : 'No GPS'} ${allSensorData.length > 0 ? `Sensors: ${allSensorData.length} samples` : 'No sensors'}`);
      }
    } catch (error) {
      console.error('Error processing individual activity detail:', error);
    }
  }
} 