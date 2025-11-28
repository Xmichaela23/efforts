import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS helper function
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400'
  };
}

// Minimal placeholder for cycling workout analysis
// TODO: Implement full cycling analysis similar to analyze-running-workout
Deno.serve(async (req) => {
  // Handle CORS preflight requests FIRST
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  let workout_id: string | undefined;
  let supabase: any = null;

  try {
    const body = await req.json();
    workout_id = body.workout_id;

    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    supabase = createClient(supabaseUrl, supabaseKey);

    // Validate user authentication
    const authH = req.headers.get('Authorization') || '';
    const token = authH.startsWith('Bearer ') ? authH.slice(7) : null;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing authentication token' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Set analysis status to 'analyzing'
    await supabase
      .from('workouts')
      .update({
        analysis_status: 'analyzing',
        analysis_error: null
      })
      .eq('id', workout_id);

    // Get workout
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message || 'No workout found'}`);
    }

    // Verify user has permission
    if (workout.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: You do not have access to this workout' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Check if it's a cycling workout
    if (workout.type !== 'ride' && workout.type !== 'cycling' && workout.type !== 'bike') {
      return new Response(JSON.stringify({
        error: 'This function only handles cycling workouts',
        workout_type: workout.type
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Placeholder analysis - just return basic structure
    // TODO: Implement full cycling analysis
    const placeholderAnalysis = {
      status: 'success',
      performance: {
        overall_adherence: 0,
        pace_adherence: 0,
        duration_adherence: 0,
        execution_adherence: 0
      },
      detailed_analysis: {
        workout_summary: {
          total_distance: workout.distance_m || 0,
          total_duration: workout.duration || 0,
          average_power: 0,
          average_hr: 0
        },
        note: 'Cycling analysis not yet implemented. Full analysis coming soon.'
      },
      insights: [
        'Cycling workout analysis is not yet implemented.',
        'This is a placeholder response to prevent UI issues.',
        'Full cycling analysis will be available in a future update.'
      ]
    };

    // Save placeholder analysis to database
    const updatePayload = {
      workout_analysis: {
        performance: placeholderAnalysis.performance,
        detailed_analysis: placeholderAnalysis.detailed_analysis,
        narrative_insights: placeholderAnalysis.insights,
        insights: placeholderAnalysis.insights // Keep for backward compatibility
      },
      analysis_status: 'complete',
      analyzed_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('workouts')
      .update(updatePayload)
      .eq('id', workout_id);

    if (updateError) {
      console.error('❌ Failed to save analysis to database:', updateError);
    } else {
      console.log('✅ Placeholder analysis saved successfully');
    }

    return new Response(JSON.stringify(placeholderAnalysis), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });

  } catch (error) {
    console.error('❌ Error in cycling workout analysis:', error);

    // Set analysis status to 'failed'
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    if (workout_id && supabase) {
      try {
        await supabase
          .from('workouts')
          .update({
            analysis_status: 'failed',
            analysis_error: errorMessage
          })
          .eq('id', workout_id);
      } catch (statusError) {
        console.error('❌ Failed to set error status:', statusError);
      }
    }

    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: errorMessage
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
});

