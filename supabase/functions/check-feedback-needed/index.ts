import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query for most recent completed run/ride without RPE
    // Server-side logic: determines which workout needs feedback
    // Single source of truth: server checks database for dismissals
    const { data: workouts, error } = await supabase
      .from('workouts')
      .select('id, type, name, gear_id, rpe, date, feedback_dismissed_at')
      .eq('user_id', user.id)
      .eq('workout_status', 'completed')
      .in('type', ['run', 'ride'])
      .is('rpe', null)
      .is('feedback_dismissed_at', null) // Server checks dismissals from database
      .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) // Last 7 days
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[check-feedback-needed] Query error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return workout if found, null if none
    if (workouts && workouts.length > 0) {
      const workout = workouts[0];
      return new Response(
        JSON.stringify({
          needs_feedback: true,
          workout: {
            id: workout.id,
            type: workout.type,
            name: workout.name || `${workout.type} workout`,
            existing_gear_id: workout.gear_id || null,
            existing_rpe: workout.rpe || null,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No workout needs feedback
    return new Response(
      JSON.stringify({ needs_feedback: false, workout: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[check-feedback-needed] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
