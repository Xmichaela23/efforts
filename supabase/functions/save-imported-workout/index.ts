// @ts-nocheck
// save-imported-workout - Server-side mapping for FIT/import payload (smart server, dumb client)
// Accepts raw import shape from FitFileImporter, maps to DB schema, inserts, returns saved workout.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function mapImportToDb(workout: any, userId: string) {
  const m = workout?.metrics || {};
  const elevGain = m.elevation_gain != null ? Math.round(Number(m.elevation_gain)) : (workout.elevation_gain != null ? Math.round(Number(workout.elevation_gain)) : null);
  return {
    user_id: userId,
    name: workout.name ?? 'Imported Workout',
    type: workout.type ?? 'run',
    date: workout.date,
    duration: Math.round(workout.duration ?? 0),
    description: workout.description ?? '',
    usercomments: workout.userComments ?? '',
    completedmanually: false,
    workout_status: 'completed',
    distance: workout.distance ?? null,
    intervals: workout.intervals ?? [],
    strength_exercises: workout.strength_exercises ?? [],
    mobility_exercises: workout.mobility_exercises ?? [],
    avg_heart_rate: m.avg_heart_rate ?? null,
    max_heart_rate: m.max_heart_rate ?? null,
    avg_power: m.avg_power ?? null,
    max_power: m.max_power ?? null,
    normalized_power: m.normalized_power ?? null,
    avg_speed: workout.avg_speed ?? m.avg_speed ?? null,
    max_speed: workout.max_speed ?? m.max_speed ?? null,
    avg_cadence: m.avg_cadence ?? null,
    max_cadence: m.max_cadence ?? null,
    elevation_gain: elevGain,
    elevation_loss: m.elevation_loss ?? workout.elevation_loss ?? null,
    calories: m.calories ?? null,
    intensity_factor: m.intensity_factor ?? null,
    timestamp: workout.timestamp ?? null,
    start_position_lat: workout.start_position_lat ?? null,
    start_position_long: workout.start_position_long ?? null,
    friendly_name: workout.friendly_name ?? null,
    moving_time: workout.moving_time != null ? Math.round(workout.moving_time) : null,
    elapsed_time: workout.elapsed_time != null ? Math.round(workout.elapsed_time) : null,
    avg_temperature: m.avg_temperature ?? null,
    max_temperature: m.max_temperature ?? null,
    total_timer_time: m.total_timer_time != null ? Math.round(m.total_timer_time) : null,
    total_elapsed_time: m.total_elapsed_time != null ? Math.round(m.total_elapsed_time) : null,
    total_work: m.total_work != null ? Math.round(m.total_work) : null,
    total_descent: m.total_descent ?? null,
    avg_vam: m.avg_vam ?? null,
    total_training_effect: m.total_training_effect ?? null,
    total_anaerobic_effect: m.total_anaerobic_effect ?? null,
    functional_threshold_power: m.functional_threshold_power ?? null,
    threshold_heart_rate: m.threshold_heart_rate ?? null,
    hr_calc_type: m.hr_calc_type ?? null,
    pwr_calc_type: m.pwr_calc_type ?? null,
    age: m.age ?? null,
    weight: m.weight ?? null,
    height: m.height ?? null,
    gender: m.gender ?? null,
    default_max_heart_rate: m.default_max_heart_rate ?? null,
    resting_heart_rate: m.resting_heart_rate ?? null,
    dist_setting: m.dist_setting ?? null,
    weight_setting: m.weight_setting ?? null,
    avg_fractional_cadence: m.avg_fractional_cadence ?? null,
    avg_left_pedal_smoothness: m.avg_left_pedal_smoothness ?? null,
    avg_left_torque_effectiveness: m.avg_left_torque_effectiveness ?? null,
    max_fractional_cadence: m.max_fractional_cadence ?? null,
    left_right_balance: m.left_right_balance ?? null,
    threshold_power: m.threshold_power ?? null,
    total_cycles: m.total_cycles ?? null,
    device_info: workout.deviceInfo ?? null,
    gps_track: workout.gps_track ?? null,
    sensor_data: workout.sensor_data ?? null,
    swim_data: workout.swim_data ?? null,
    steps_preset: workout.steps_preset ?? null,
    planned_id: workout.planned_id ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const workout = body?.workout;
    if (!workout || !workout.date) {
      return new Response(JSON.stringify({ error: 'workout required with date' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const toSave = mapImportToDb(workout, user.id);

    const { data, error } = await supabase
      .from('workouts')
      .insert([toSave])
      .select('id,user_id,name,type,date,workout_status,duration,distance,avg_heart_rate,max_heart_rate,avg_power,max_power,normalized_power,avg_speed,max_speed,avg_cadence,max_cadence,elevation_gain,elevation_loss,calories,moving_time,elapsed_time,timestamp,start_position_lat,start_position_long,computed,metrics,strength_exercises,mobility_exercises,workout_metadata,planned_id,created_at,updated_at')
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ workout: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
