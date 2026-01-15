import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decode Google/Strava encoded polylines (precision 1e5)
function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    // latitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    // longitude
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { workout_id } = await req.json();
    if (!workout_id) {
      return new Response(
        JSON.stringify({ error: 'workout_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch workout with gps_trackpoints
    const { data: workout, error: fetchError } = await supabase
      .from('workouts')
      .select('id, gps_track, gps_trackpoints, strava_activity_id, date, timestamp')
      .eq('id', workout_id)
      .single();

    if (fetchError || !workout) {
      return new Response(
        JSON.stringify({ error: 'Workout not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if gps_track already exists
    let existingTrack = null;
    if (workout.gps_track) {
      try {
        const parsed = typeof workout.gps_track === 'string' 
          ? JSON.parse(workout.gps_track) 
          : workout.gps_track;
        if (Array.isArray(parsed) && parsed.length > 0) {
          existingTrack = parsed;
        }
      } catch (e) {
        console.log('Failed to parse existing gps_track:', e);
      }
    }

    if (existingTrack && existingTrack.length > 0) {
      return new Response(
        JSON.stringify({ 
          message: 'GPS track already exists',
          points: existingTrack.length 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we have a polyline to decode
    if (!workout.gps_trackpoints || workout.gps_trackpoints.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'No gps_trackpoints (polyline) available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode polyline
    let coordinates: [number, number][] = [];
    try {
      coordinates = decodePolyline(workout.gps_trackpoints);
      console.log(`✅ Decoded polyline: ${coordinates.length} coordinates`);
    } catch (decodeError) {
      return new Response(
        JSON.stringify({ error: `Failed to decode polyline: ${decodeError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (coordinates.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Decoded polyline has no coordinates' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert coordinates to gps_track format
    // Use workout timestamp if available, otherwise use sequential timestamps
    const workoutTimestamp = workout.timestamp 
      ? new Date(workout.timestamp).getTime() / 1000 
      : Math.floor(Date.now() / 1000);
    
    const gpsTrack = coordinates.map(([lat, lng], index) => ({
      lat,
      lng,
      timestamp: (workoutTimestamp + index) * 1000, // Approximate timestamp
      startTimeInSeconds: workoutTimestamp + index
    }));

    // Update workout with restored GPS track
    const { error: updateError } = await supabase
      .from('workouts')
      .update({ 
        gps_track: gpsTrack,
        updated_at: new Date().toISOString()
      })
      .eq('id', workout_id);

    if (updateError) {
      console.error('Failed to update workout:', updateError);
      return new Response(
        JSON.stringify({ error: `Failed to update workout: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'GPS track restored from polyline',
        points: gpsTrack.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Restore GPS track error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
