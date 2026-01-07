/**
 * ingest-phone-workout - Save Phone-Recorded Workout to Database
 * 
 * Receives workout data from the phone execution engine and:
 * 1. Creates a workout record
 * 2. Stores sensor_data and gps_track
 * 3. Links to planned workout
 * 4. Triggers analysis pipeline
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Types
// ============================================================================

interface GPSSample {
  timestamp: number;
  lat: number;
  lng: number;
  altitude?: number;
  accuracy?: number;
}

interface ExecutionSample {
  timestamp: number;
  elapsed_s: number;
  step_index: number;
  gps?: GPSSample;
  distance_m?: number;
  pace_s_per_mi?: number;
  hr_bpm?: number;
  estimated_distance_m?: number;
}

interface ExecutionContext {
  environment: 'indoor' | 'outdoor';
  equipment: 'treadmill' | 'track' | 'trainer' | null;
  recorded_via: 'phone';
  gps_enabled: boolean;
  sensors_connected: string[];
  distance_source: 'gps' | 'estimated' | 'treadmill' | 'trainer';
  app_version?: string;
}

interface RequestBody {
  session_id: string;
  planned_workout_id: string | null;
  workout_type: 'run' | 'ride';
  environment: 'indoor' | 'outdoor';
  equipment: 'treadmill' | 'track' | 'trainer' | null;
  samples: ExecutionSample[];
  gps_track: GPSSample[];
  total_distance_m: number;
  total_duration_s: number;
  execution_context: ExecutionContext;
}

// ============================================================================
// CORS Headers
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert execution samples to sensor_data format
 */
function convertToSensorData(samples: ExecutionSample[]): any[] {
  return samples.map(sample => ({
    timestamp: Math.floor(sample.timestamp / 1000), // Convert to Unix seconds
    timerDurationInSeconds: sample.elapsed_s,
    totalDistanceInMeters: sample.distance_m || sample.estimated_distance_m || 0,
    heartRate: sample.hr_bpm,
    speedMetersPerSecond: sample.pace_s_per_mi 
      ? 1609.34 / sample.pace_s_per_mi 
      : undefined,
    // Preserve step index for interval analysis
    step_index: sample.step_index,
  }));
}

/**
 * Calculate overall metrics from samples
 */
function calculateOverallMetrics(samples: ExecutionSample[]): {
  avg_hr?: number;
  max_hr?: number;
  avg_pace_s_per_mi?: number;
} {
  const hrSamples = samples.filter(s => s.hr_bpm);
  const paceSamples = samples.filter(s => s.pace_s_per_mi);
  
  return {
    avg_hr: hrSamples.length > 0
      ? Math.round(hrSamples.reduce((sum, s) => sum + s.hr_bpm!, 0) / hrSamples.length)
      : undefined,
    max_hr: hrSamples.length > 0
      ? Math.max(...hrSamples.map(s => s.hr_bpm!))
      : undefined,
    avg_pace_s_per_mi: paceSamples.length > 0
      ? paceSamples.reduce((sum, s) => sum + s.pace_s_per_mi!, 0) / paceSamples.length
      : undefined,
  };
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    
    if (userError || !user) {
      throw new Error("Invalid authentication");
    }

    // Parse request body
    const body: RequestBody = await req.json();
    
    const {
      session_id,
      planned_workout_id,
      workout_type,
      environment,
      equipment,
      samples,
      gps_track,
      total_distance_m,
      total_duration_s,
      execution_context,
    } = body;

    console.log(`[ingest-phone-workout] Processing session ${session_id} for user ${user.id}`);
    console.log(`[ingest-phone-workout] ${samples.length} samples, ${gps_track.length} GPS points`);

    // Convert samples to sensor_data format
    const sensor_data = convertToSensorData(samples);
    
    // Calculate overall metrics
    const metrics = calculateOverallMetrics(samples);

    // Determine workout date (from first sample or now)
    const workout_timestamp = samples.length > 0 ? samples[0].timestamp : Date.now();
    const workout_date = new Date(workout_timestamp).toISOString().split('T')[0];

    // Calculate average speed for rides
    let avg_speed: number | undefined;
    if (workout_type === 'ride' && total_distance_m > 0 && total_duration_s > 0) {
      avg_speed = total_distance_m / total_duration_s; // m/s
    }

    // Create workout record
    const workoutData = {
      user_id: user.id,
      type: workout_type,
      date: workout_date,
      workout_status: 'completed',
      
      // Metrics
      distance: total_distance_m,
      duration: Math.round(total_duration_s),
      moving_time: Math.round(total_duration_s), // For phone workouts, assume all moving
      elapsed_time: Math.round(total_duration_s),
      avg_heart_rate: metrics.avg_hr,
      max_heart_rate: metrics.max_hr,
      avg_speed,
      
      // Raw data
      sensor_data,
      gps_track: gps_track.length > 0 ? gps_track : null,
      
      // Link to planned workout
      planned_id: planned_workout_id,
      
      // Execution context
      execution_context,
      
      // Provider info
      provider: 'phone',
      provider_activity_id: session_id, // Use session_id as unique identifier
      
      // Analysis status
      analysis_status: 'pending',
    };

    // Insert workout
    const { data: workout, error: insertError } = await supabase
      .from('workouts')
      .insert(workoutData)
      .select('id')
      .single();

    if (insertError) {
      console.error('[ingest-phone-workout] Insert error:', insertError);
      throw new Error(`Failed to save workout: ${insertError.message}`);
    }

    console.log(`[ingest-phone-workout] Created workout ${workout.id}`);

    // Update planned workout if linked
    if (planned_workout_id) {
      const { error: updateError } = await supabase
        .from('planned_workouts')
        .update({
          workout_status: 'completed',
          completed_workout_id: workout.id,
        })
        .eq('id', planned_workout_id);

      if (updateError) {
        console.warn('[ingest-phone-workout] Failed to update planned workout:', updateError);
      } else {
        console.log(`[ingest-phone-workout] Linked to planned workout ${planned_workout_id}`);
      }
    }

    // Trigger compute-workout-summary (async, don't wait)
    try {
      await supabase.functions.invoke('compute-workout-summary', {
        body: { workout_id: workout.id },
      });
      console.log(`[ingest-phone-workout] Triggered compute-workout-summary`);
    } catch (e) {
      console.warn('[ingest-phone-workout] Failed to trigger compute-workout-summary:', e);
    }

    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        workout_id: workout.id,
        message: 'Workout saved successfully',
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[ingest-phone-workout] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

