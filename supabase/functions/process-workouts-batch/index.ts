// Process a batch of workouts that need computed.analysis.series
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
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

    // Last 10 workout IDs that need processing
    const workoutIds = [
      '3698ec60-84fa-4d32-8bb4-81f67a1e56bf', // ride, 2026-01-05
      'b85e797b-135c-488a-8e15-71edc0236ad9', // run, 2026-01-04
      '0c2b43df-7806-44d9-b5a3-af652342b348', // ride, 2026-01-03
      '32179ccd-9008-4d4a-81d5-df5912688996', // ride, 2026-01-02
      '361d3165-d52a-4271-b4b1-f091ca0cef61', // run, 2026-01-01
      '830508fc-e780-453b-9de2-de515cda3c7d', // run, 2025-12-31
      'f75edc59-4492-40cb-88ec-3f42ec30ec7c', // run, 2025-12-29
      '2f51666b-315e-42b0-b0b6-916f45178a72', // run, 2025-12-22
      '697a5c25-9363-4c55-b463-c94c658a9b0a', // ride, 2025-12-14
      'c6132234-c169-49d2-add2-803adc8b3875', // ride, 2025-12-13
    ];

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

        // Small delay between requests
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
