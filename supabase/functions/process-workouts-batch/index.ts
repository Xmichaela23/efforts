// Process a batch of workouts that need computed.analysis.series
// Accepts either an explicit list of workout IDs or auto-discovers
// completed workouts that haven't been analyzed yet.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload = await req.json().catch(() => ({}));

    // Accept an explicit list, or auto-discover workouts missing analysis
    // for the requesting user (requires user_id in payload).
    let workoutIds: string[] = [];

    if (Array.isArray(payload.workout_ids) && payload.workout_ids.length > 0) {
      workoutIds = payload.workout_ids.map(String);
    } else if (payload.user_id) {
      // Auto mode: find completed workouts that lack computed analysis
      const limit = Number(payload.limit) || 25;
      const { data, error } = await supabase
        .from('workouts')
        .select('id')
        .eq('user_id', payload.user_id)
        .eq('workout_status', 'completed')
        .is('computed', null)
        .order('date', { ascending: false })
        .limit(limit);

      if (error) throw error;
      workoutIds = (data ?? []).map((r: any) => r.id);
    } else {
      return new Response(
        JSON.stringify({ error: 'Provide workout_ids (array) or user_id to auto-discover unprocessed workouts.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (workoutIds.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, success: 0, errors: 0, results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚀 Processing ${workoutIds.length} workouts...`);

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const workoutId of workoutIds) {
      try {
        console.log(`Processing workout ${workoutId}...`);

        const { error } = await supabase.functions.invoke('compute-workout-analysis', {
          body: { workout_id: workoutId }
        });

        if (error) {
          results.push({ id: workoutId, status: 'error', error: error.message });
          console.error(`❌ Failed: ${workoutId} - ${error.message}`);
        } else {
          results.push({ id: workoutId, status: 'success' });
          console.log(`✅ Success: ${workoutId}`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err: any) {
        results.push({ id: workoutId, status: 'error', error: err.message });
        console.error(`❌ Error processing ${workoutId}:`, err);
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    return new Response(JSON.stringify({
      processed: results.length,
      success: successCount,
      errors: errorCount,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
