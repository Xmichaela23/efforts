/**
 * ANALYZE-WORKOUT EDGE FUNCTION
 * 
 * Purpose: Generate AI context for individual completed workouts
 * 
 * What it does:
 * - Receives workout_id from frontend after workout completion
 * - Fetches workout details and planned workout info
 * - Queries last 4 weeks of similar workouts for comparison
 * - Calls GPT-4 to generate factual workout analysis
 * - Stores context in workouts.context_summary field
 * - Triggers generate-daily-context to update calendar
 * 
 * Input: { workout_id: string }
 * Output: { success: boolean, context: string }
 * 
 * GPT-4 Settings: model=gpt-4, temperature=0.3, max_tokens=200
 * Tone: Factual, no emojis, no enthusiasm, direct language
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin'
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { workout_id } = await req.json();
    
    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get user from auth
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    
    const { data: userData, error: userErr } = await supabase.auth.getUser(token || undefined);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const userId = userData.user.id;

    // Fetch workout details
    const { data: workout, error: workoutErr } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workout_id)
      .eq('user_id', userId)
      .single();

    if (workoutErr || !workout) {
      return new Response(JSON.stringify({ error: 'workout not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate workout context using GPT-4
    const contextSummary = await generateWorkoutContext(workout, userId, supabase);

    // Store context in workout
    await supabase
      .from('workouts')
      .update({
        context_summary: contextSummary,
        context_generated_at: new Date().toISOString()
      })
      .eq('id', workout_id);

    // Trigger daily context regeneration
    await supabase.functions.invoke('generate-daily-context', {
      body: { user_id: userId, date: workout.date }
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('analyze-workout error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function generateWorkoutContext(workout: any, userId: string, supabase: any): Promise<string> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return 'Context unavailable';
  }

  try {
    // Get similar workouts from last 4 weeks
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0];

    const { data: similarWorkouts } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .eq('type', workout.type)
      .gte('date', fourWeeksAgoStr)
      .lt('date', workout.date)
      .order('date', { ascending: false })
      .limit(3);

    // Build workout data
    const executed = workout.executed?.overall || {};
    const duration = executed.duration_s_moving || executed.duration_s || 0;
    const distance = executed.distance_m ? executed.distance_m / 1000 : 0;
    const avgHR = executed.avg_hr;
    const maxHR = executed.max_hr;
    const avgPower = executed.avg_power_w;
    const avgPace = executed.pace_s_per_km ? executed.pace_s_per_km / 60 : null;
    const elevation = executed.elevation_gain_m || 0;
    const workload = executed.workload_actual || 0;

    // Build similar workouts summary
    const similarSummary = similarWorkouts?.map(w => {
      const e = w.executed?.overall || {};
      return `${w.date}: ${e.distance_m ? (e.distance_m/1000).toFixed(1) + 'km' : ''} ${e.duration_s ? Math.round(e.duration_s/60) + 'min' : ''}`;
    }).join(', ') || 'No recent similar workouts';

    const prompt = `Generate brief workout context. Factual only. No emojis.

Workout:
Type: ${workout.type}
Distance: ${distance}km
Duration: ${Math.round(duration)}min
Pace/Power: ${avgPace ? avgPace.toFixed(1) + 'min/km' : avgPower ? avgPower + 'W' : 'N/A'}

Recent similar workouts (last 4 weeks):
${similarSummary}

Generate one sentence summary.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a training analysis assistant. Provide factual, concise observations. No emojis. No enthusiasm. No motivational language. State what happened.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();

  } catch (error) {
    console.error('GPT-4 error:', error);
    return 'Context unavailable';
  }
}
