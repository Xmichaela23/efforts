import { createClient } from 'jsr:@supabase/supabase-js@2';
import { talkTestAppliesToTags } from '../_shared/effort-words.ts';
import { displayFormat } from '../_shared/display-format.ts';

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

    /**
     * ⛔ ONE RULE FOR EVERY WAY THE POPUP CAN OPEN (2026-09-10, audit H-T11). Opening a finished
     * session used to ask the phone's own 7-day rule, and a live insert or update asked no date at
     * all — so an old ride pulled in by a history import could still open the popup. The phone now
     * sends `workout_id` on those paths and this answers for that one workout with the same filters
     * as the general check below.
     */
    let body: { workout_id?: unknown } = {};
    try { body = await req.json(); } catch { body = {}; }
    const workoutId = typeof body?.workout_id === 'string' && body.workout_id.trim() ? body.workout_id.trim() : null;

    // Query for most recent completed run/ride/swim without RPE
    // Server-side logic: determines which workout needs feedback
    // Single source of truth: server checks database for dismissals
    // D-162: swims now get the popup too (feel/RPE + pool length + equipment confirmation).
    let q = supabase
      .from('workouts')
      .select('id, type, name, gear_id, rpe, date, planned_id, feedback_dismissed_at, distance')
      .eq('user_id', user.id);
    if (workoutId) q = q.eq('id', workoutId);
    const { data: workouts, error } = await q
      .eq('workout_status', 'completed')
      .in('type', ['run', 'ride', 'swim'])
      .is('rpe', null)
      .is('feedback_dismissed_at', null) // Server checks dismissals from database
      // OURS — only a session from today or yesterday gets the question (was 7 days). A history pull
      // creates rows for old dates and the 7-day window asked about each of them (Michael, 2026-09-07,
      // a ride from two days earlier surfaced after a Strava reconnect). docs/STATE-SOURCES.md.
      .gte('date', new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString().split('T')[0])
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
      /**
       * ⛔ DOES THE POPUP ASK THE TALK TEST (2026-09-14, `_shared/effort-words.ts`). Only a run whose planned
       * session is an easy or long run. Answered NOW, not after processing: the linked planned row when the
       * link is in, otherwise that day's planned run when there is exactly one. Two planned runs that day and
       * no link yet, or none: no talk test. Rides never.
       */
      let talkTest = false;
      if (workout.type === 'run') {
        try {
          let tags: unknown = null;
          if (workout.planned_id) {
            const { data: pr } = await supabase.from('planned_workouts').select('tags').eq('id', workout.planned_id).eq('user_id', user.id).maybeSingle();
            tags = pr?.tags ?? null;
          } else if (workout.date) {
            const { data: prs } = await supabase.from('planned_workouts').select('tags').eq('user_id', user.id).eq('date', workout.date).eq('type', 'run').limit(3);
            if (Array.isArray(prs) && prs.length === 1) tags = prs[0]?.tags ?? null;
          }
          talkTest = talkTestAppliesToTags(tags);
        } catch (e) {
          console.warn('[check-feedback-needed] talk-test lookup failed:', e);
        }
      }
      let metric = false;
      try {
        const { data: ub } = await supabase.from('user_baselines').select('units').eq('user_id', user.id).maybeSingle();
        metric = ub?.units === 'metric';
      } catch (e) {
        console.warn('[check-feedback-needed] units lookup failed:', e);
      }
      return new Response(
        JSON.stringify({
          needs_feedback: true,
          workout: {
            id: workout.id,
            type: workout.type,
            name: workout.name || `${workout.type} workout`,
            existing_gear_id: workout.gear_id || null,
            existing_rpe: workout.rpe || null,
            // ⛔ The distance under the popup's title, in the athlete's unit (Stage 7 session 1); `distance` is stored in km.
            distance_display: displayFormat(metric).distanceOrMetres(Number(workout.distance) * 1000),
          },
          talk_test: talkTest,
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
