import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!
);

interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  start_date: string;
  start_date_local: string;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  average_cadence?: number;
  max_cadence?: number;
  calories?: number;
  map?: {
    polyline: string;
    summary_polyline: string;
  };
  splits_metric?: Array<{
    distance: number;
    elapsed_time: number;
    elevation_difference: number;
    moving_time: number;
    split: number;
    average_speed: number;
    pace_zone: number;
  }>;
  best_efforts?: Array<{
    id: number;
    name: string;
    elapsed_time: number;
    moving_time: number;
    start_date: string;
    start_date_local: string;
    distance: number;
    start_index: number;
    end_index: number;
  }>;
  segment_efforts?: Array<{
    id: number;
    name: string;
    elapsed_time: number;
    moving_time: number;
    start_date: string;
    start_date_local: string;
    distance: number;
    start_index: number;
    end_index: number;
    average_cadence?: number;
    average_watts?: number;
    average_heartrate?: number;
    max_heartrate?: number;
    segment: {
      id: number;
      name: string;
      distance: number;
      average_grade: number;
      maximum_grade: number;
      elevation_high: number;
      elevation_low: number;
      total_elevation_gain: number;
      map: {
        polyline: string;
        summary_polyline: string;
      };
    };
  }>;
}

interface ImportRequest {
  userId: string;
  accessToken: string;
  importType: 'historical' | 'recent';
  maxActivities?: number;
  startDate?: string;
  endDate?: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { userId, accessToken, importType, maxActivities = 200, startDate, endDate }: ImportRequest = await req.json();

    if (!userId || !accessToken) {
      return new Response('Missing required fields', { status: 400 });
    }

    console.log(`🚀 Starting Strava import for user ${userId}, type: ${importType}${startDate && endDate ? `, date range: ${startDate} to ${endDate}` : ''}`);

    // Get user's existing workouts to avoid duplicates
    const { data: existingWorkouts } = await supabase
      .from('workouts')
      .select('strava_activity_id')
      .eq('user_id', userId)
      .not('strava_activity_id', 'is', null);

    const existingStravaIds = new Set(existingWorkouts?.map(w => w.strava_activity_id) || []);
    console.log(`📊 Found ${existingStravaIds.size} existing Strava activities`);

    let importedCount = 0;
    let skippedCount = 0;
    let page = 1;
    const perPage = 200; // Strava's max per request

    while (true) {
      console.log(`📄 Fetching page ${page} from Strava API...`);
      
      // Build Strava API URL with date filtering
      let stravaUrl = `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`;
      
      if (startDate) {
        const afterTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
        stravaUrl += `&after=${afterTimestamp}`;
        console.log(`📅 Filtering activities after: ${startDate} (${afterTimestamp})`);
      }
      
      if (endDate) {
        const beforeTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
        stravaUrl += `&before=${beforeTimestamp}`;
        console.log(`📅 Filtering activities before: ${endDate} (${beforeTimestamp})`);
      }
      
      // Fetch activities from Strava
      const stravaResponse = await fetch(stravaUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!stravaResponse.ok) {
        const errorText = await stravaResponse.text();
        console.error(`❌ Strava API error: ${stravaResponse.status} - ${errorText}`);
        throw new Error(`Strava API error: ${stravaResponse.status}`);
      }

      const activities: StravaActivity[] = await stravaResponse.json();
      
      if (activities.length === 0) {
        console.log(`✅ No more activities to import (page ${page})`);
        break;
      }

      console.log(`📥 Received ${activities.length} activities from Strava`);

      // Process each activity
      for (const activity of activities) {
        // Skip if already imported
        if (existingStravaIds.has(activity.id)) {
          skippedCount++;
          continue;
        }

        // Convert Strava activity to workout format
        const workout = convertStravaToWorkout(activity, userId);
        
        // Insert into workouts table
        const { error: insertError } = await supabase
          .from('workouts')
          .insert(workout);

        if (insertError) {
          console.error(`❌ Failed to insert workout ${activity.id}:`, insertError);
          continue;
        }

        importedCount++;
        console.log(`✅ Imported activity: ${activity.name} (${activity.id})`);

        // Check if we've reached the max limit
        if (maxActivities && importedCount >= maxActivities) {
          console.log(`🛑 Reached max activities limit: ${maxActivities}`);
          break;
        }
      }

      // Check if we've reached the max limit
      if (maxActivities && importedCount >= maxActivities) {
        break;
      }

      // If we got fewer activities than requested, we're done
      if (activities.length < perPage) {
        break;
      }

      page++;
      
      // Rate limiting: Strava allows 1000 requests per 15 minutes
      // We're being conservative with a small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update user connection with last sync time
    await supabase
      .from('device_connections')
      .update({ 
        last_sync: new Date().toISOString(),
        connection_data: { 
          last_import: new Date().toISOString(),
          total_imported: importedCount,
          total_skipped: skippedCount
        }
      })
      .eq('user_id', userId)
      .eq('provider', 'strava');

    console.log(`🎉 Import completed! Imported: ${importedCount}, Skipped: ${skippedCount}`);

    return new Response(JSON.stringify({
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      message: `Successfully imported ${importedCount} activities from Strava`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Import error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

function convertStravaToWorkout(activity: StravaActivity, userId: string) {
  // Convert Strava activity type to your workout types
  const workoutType = mapStravaTypeToWorkoutType(activity.type);
  
  // Calculate pace in minutes per mile/km
  const paceMinutes = activity.average_speed > 0 ? (1000 / activity.average_speed) / 60 : null;
  
  // Extract GPS data if available
  let gpsTrackpoints = null;
  let startLat = null;
  let startLong = null;
  
  if (activity.map?.polyline) {
    // You might want to decode the polyline here for more detailed GPS data
    gpsTrackpoints = activity.map.polyline;
  }

  // Extract splits data
  const splits = activity.splits_metric?.map(split => ({
    distance: split.distance,
    elapsed_time: split.elapsed_time,
    moving_time: split.moving_time,
    average_speed: split.average_speed,
    pace_zone: split.pace_zone
  })) || [];

  // Extract best efforts
  const bestEfforts = activity.best_efforts?.map(effort => ({
    name: effort.name,
    elapsed_time: effort.elapsed_time,
    moving_time: effort.moving_time,
    distance: effort.distance,
    start_index: effort.start_index,
    end_index: effort.end_index
  })) || [];

  // Extract segment efforts
  const segmentEfforts = activity.segment_efforts?.map(segment => ({
    name: segment.name,
    elapsed_time: segment.elapsed_time,
    moving_time: segment.moving_time,
    distance: segment.distance,
    average_cadence: segment.average_cadence,
    average_watts: segment.average_watts,
    average_heartrate: segment.average_heartrate,
    max_heartrate: segment.max_heartrate,
    segment: segment.segment
  })) || [];

  return {
    name: activity.name,
    type: workoutType,
    duration: activity.moving_time,
    date: new Date(activity.start_date_local).toISOString().split('T')[0],
    description: `Imported from Strava - ${activity.type}`,
    distance: activity.distance,
    elapsed_time: activity.elapsed_time,
    moving_time: activity.moving_time,
    avg_speed: activity.average_speed,
    max_speed: activity.max_speed,
    avg_pace: paceMinutes,
    avg_heart_rate: activity.average_heartrate,
    max_heart_rate: activity.max_heartrate,
    avg_power: activity.average_watts,
    max_power: activity.max_watts,
    avg_cadence: activity.average_cadence,
    max_cadence: activity.max_cadence,
    elevation_gain: activity.total_elevation_gain,
    calories: activity.calories,
    gps_trackpoints: gpsTrackpoints,
    start_position_lat: startLat,
    start_position_long: startLong,
    timestamp: new Date(activity.start_date).toISOString(),
    total_timer_time: activity.moving_time,
    total_elapsed_time: activity.elapsed_time,
    workout_status: 'completed',
    completedmanually: false,
    user_id: userId,
    strava_activity_id: activity.id,
    source: 'strava',
    is_strava_imported: true,
    strava_data: {
      original_activity: activity,
      splits,
      best_efforts: bestEfforts,
      segment_efforts: segmentEfforts,
      import_date: new Date().toISOString()
    },
    intervals: [], // You might want to populate this with splits data
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function mapStravaTypeToWorkoutType(stravaType: string): string {
  const typeMap: Record<string, string> = {
    'Run': 'run',
    'TrailRun': 'run',
    'VirtualRun': 'run',
    'Ride': 'bike',
    'VirtualRide': 'bike',
    'EBikeRide': 'bike',
    'Swim': 'swim',
    'Walk': 'walk',
    'Hike': 'hike',
    'AlpineSki': 'ski',
    'BackcountrySki': 'ski',
    'Canoeing': 'paddle',
    'Crossfit': 'strength',
    'Elliptical': 'cardio',
    'Golf': 'golf',
    'Handcycle': 'bike',
    'IceSkate': 'skate',
    'InlineSkate': 'skate',
    'Kayaking': 'paddle',
    'Kitesurf': 'water',
    'NordicSki': 'ski',
    'RockClimbing': 'climb',
    'RollerSki': 'ski',
    'Rowing': 'row',
    'Snowboard': 'snowboard',
    'Snowshoe': 'hike',
    'StairStepper': 'cardio',
    'StandUpPaddling': 'paddle',
    'Surfing': 'water',
    'Velomobile': 'bike',
    'WeightTraining': 'strength',
    'Wheelchair': 'wheelchair',
    'Windsurf': 'water',
    'Workout': 'workout',
    'Yoga': 'yoga'
  };

  return typeMap[stravaType] || 'workout';
}
