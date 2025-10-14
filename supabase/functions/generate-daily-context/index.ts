/**
 * GENERATE-DAILY-CONTEXT EDGE FUNCTION
 * 
 * Purpose: Generate AI context for daily calendar display
 * 
 * What it does:
 * - Receives user_id and date from analyze-workout or get-week
 * - Fetches completed workouts and their context summaries
 * - Fetches planned workouts for the date
 * - Determines context state: Morning, Partial, Complete, or Rest day
 * - Calls GPT-4 to generate appropriate daily context text
 * - Stores/updates context in daily_context table
 * 
 * Input: { user_id: string, date: string }
 * Output: { success: boolean, context: string }
 * 
 * GPT-4 Settings: model=gpt-4, temperature=0.3, max_tokens=150
 * Tone: Factual, no emojis, no enthusiasm, direct language
 * 
 * Context States:
 * - Morning: Shows planned workouts for today
 * - Partial: Shows completed + remaining workouts
 * - Complete: Shows completed + tomorrow's planned
 * - Rest day: Shows rest day + tomorrow's planned
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
    const { user_id, date } = await req.json();
    
    if (!user_id || !date) {
      return new Response(JSON.stringify({ error: 'user_id and date are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // Fetch completed workouts for this date
    const { data: completedWorkouts } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', date)
      .eq('workout_status', 'completed');

    // Fetch planned workouts for this date
    const { data: plannedWorkouts } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', date)
      .eq('workout_status', 'planned');

    // Fetch tomorrow's planned workouts
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: tomorrowWorkouts } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', tomorrowStr)
      .eq('workout_status', 'planned');

    // Debug logging
    console.log('=== DAILY CONTEXT DEBUG ===');
    console.log('User ID:', user_id);
    console.log('Date:', date);
    console.log('Completed workouts:', completedWorkouts?.length || 0);
    console.log('Planned workouts:', plannedWorkouts?.length || 0);
    console.log('Tomorrow workouts:', tomorrowWorkouts?.length || 0);
    console.log('Completed workout types:', completedWorkouts?.map(w => w.type) || []);
    console.log('Planned workout types:', plannedWorkouts?.map(w => w.type) || []);
    console.log('Tomorrow workout types:', tomorrowWorkouts?.map(w => w.type) || []);
    
    // Show actual workout data
    if (completedWorkouts?.length > 0) {
      console.log('COMPLETED WORKOUTS DATA:', JSON.stringify(completedWorkouts, null, 2));
    }
    if (plannedWorkouts?.length > 0) {
      console.log('PLANNED WORKOUTS DATA:', JSON.stringify(plannedWorkouts, null, 2));
    }
    console.log('=== END DEBUG ===');

    // Generate context based on state
    const contextText = await generateDailyContextText(
      completedWorkouts || [],
      plannedWorkouts || [],
      tomorrowWorkouts || []
    );

    // Upsert into daily_context table
    await supabase
      .from('daily_context')
      .upsert({
        user_id,
        date,
        context_text: contextText,
        last_updated: new Date().toISOString()
      });

    return new Response(JSON.stringify({ context: contextText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('generate-daily-context error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function generateDailyContextText(
  completedWorkouts: any[],
  plannedWorkouts: any[],
  tomorrowWorkouts: any[]
): Promise<string> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    return 'Context unavailable';
  }

  try {
    // Build workout summaries
    const completedSummaries = completedWorkouts.map(w => {
      const distance = w.distance ? (w.distance / 1000).toFixed(1) + 'km' : '';
      const duration = w.duration ? Math.round(w.duration / 60) + 'min' : '';
      const pace = w.avg_pace ? (w.avg_pace / 60).toFixed(1) + 'min/km' : '';
      return `${w.type.toUpperCase()}${distance ? ' ' + distance : ''}${duration ? ' ' + duration : ''}${pace ? ' at ' + pace : ''}`;
    });

    const remainingTypes = plannedWorkouts
      .filter(p => !completedWorkouts.some(c => c.planned_workout_id === p.id))
      .map(p => p.type.toUpperCase());

    const tomorrowTypes = tomorrowWorkouts.map(w => w.type.toUpperCase());

    // Determine context state
    let state = '';
    if (completedWorkouts.length === 0 && plannedWorkouts.length > 0) {
      state = 'morning';
    } else if (completedWorkouts.length > 0 && remainingTypes.length > 0) {
      state = 'partial';
    } else if (completedWorkouts.length > 0 && remainingTypes.length === 0) {
      state = 'complete';
    } else {
      state = 'rest';
    }

    // If no data found, throw error - no fallbacks!
    if (completedWorkouts.length === 0 && plannedWorkouts.length === 0) {
      throw new Error('No workout data found for today - check database queries');
    }

    // Don't generate context if no real data
    if (completedSummaries.length === 0 && remainingTypes.length === 0 && tomorrowTypes.length === 0) {
      throw new Error('No workout data found - cannot generate context');
    }

    const prompt = `Generate daily context for calendar.

Completed today: ${completedSummaries.join(', ')}
Remaining today: ${remainingTypes.join(', ')}
Tomorrow (only if today complete): ${state === 'complete' ? tomorrowTypes.join(', ') : 'N/A'}

Be brief. One key insight per completed workout.`;

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
            content: 'Generate daily context for calendar. Factual. No emojis. No enthusiasm. Be concise. Direct language only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
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
    throw error; // Don't hide errors with fallbacks
  }
}
