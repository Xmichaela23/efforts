/**
 * EDGE FUNCTION: weekly-workload
 * 
 * Calculates weekly workload summaries and totals
 * Returns hybrid totals (actual if completed, planned if not)
 * Updates weekly_workload table for caching
 * 
 * Input: { user_id, week_start_date }
 * Output: { total_planned, total_actual, hybrid_total, sessions[] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { 
        headers: { 
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        } 
      })
    }

    const { user_id, week_start_date } = await req.json()
    
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          } 
        }
      )
    }

    // Initialize Supabase client with service role key for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Calculate week start if not provided
    let weekStart: string;
    if (week_start_date) {
      weekStart = week_start_date;
    } else {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
      const monday = new Date(today.setDate(diff));
      weekStart = monday.toISOString().split('T')[0];
    }

    // Calculate week end
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    const weekEnd = weekEndDate.toISOString().split('T')[0];

    // Get workouts for the week from both tables
    const { data: completedWorkouts, error: completedError } = await supabaseClient
      .from('workouts')
      .select('id, type, name, date, workout_status, workload_planned, workload_actual, duration')
      .eq('user_id', user_id)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date', { ascending: true })

    if (completedError) {
      console.error('Fetch error for completed workouts:', completedError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch completed workouts' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { data: plannedWorkouts, error: plannedError } = await supabaseClient
      .from('planned_workouts')
      .select('id, type, name, date, workout_status, workload_planned, workload_actual, duration')
      .eq('user_id', user_id)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date', { ascending: true })

    if (plannedError) {
      console.error('Fetch error for planned workouts:', plannedError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch planned workouts' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Combine both datasets
    const workouts = [
      ...(completedWorkouts || []).map(w => ({ ...w, source: 'completed' })),
      ...(plannedWorkouts || []).map(w => ({ ...w, source: 'planned' }))
    ]

    // Calculate weekly totals
    const weeklyStats = {
      week_start: weekStart,
      week_end: weekEnd,
      total_planned: 0,
      total_actual: 0,
      sessions_planned: 0,
      sessions_completed: 0,
      sessions: [] as any[]
    };

    if (workouts) {
      workouts.forEach(workout => {
        const planned = workout.workload_planned || 0;
        const actual = workout.workload_actual || 0;
        
        // Add to planned total (original week target)
        weeklyStats.total_planned += planned;
        
        // Add to actual total ONLY for completed workouts
        if (workout.workout_status === 'completed') {
          weeklyStats.total_actual += actual;
        }
        
        if (workout.workout_status === 'planned') {
          weeklyStats.sessions_planned++;
        } else if (workout.workout_status === 'completed') {
          weeklyStats.sessions_completed++;
        }

        weeklyStats.sessions.push({
          id: workout.id,
          type: workout.type,
          name: workout.name,
          date: workout.date,
          status: workout.workout_status,
          workload_planned: planned,
          workload_actual: actual,
          duration: workout.duration
        });
      });
    }

    // Calculate hybrid total (actual if completed, planned if not)
    const hybridTotal = weeklyStats.sessions.reduce((total, session) => {
      if (session.status === 'completed') {
        return total + (session.workload_actual || 0);
      } else {
        return total + (session.workload_planned || 0);
      }
    }, 0);

    // Try to get or create weekly_workload record
    const { data: existingWeekly, error: weeklyError } = await supabaseClient
      .from('weekly_workload')
      .select('*')
      .eq('user_id', user_id)
      .eq('week_start_date', weekStart)
      .single()

    if (weeklyError && weeklyError.code !== 'PGRST116') {
      console.error('Weekly workload fetch error:', weeklyError)
    }

    // Update or insert weekly workload record
    const weeklyData = {
      user_id,
      week_start_date: weekStart,
      workload_planned: weeklyStats.total_planned,
      workload_actual: weeklyStats.total_actual,
      sessions_planned: weeklyStats.sessions_planned,
      sessions_completed: weeklyStats.sessions_completed
    };

    if (existingWeekly) {
      const { error: updateError } = await supabaseClient
        .from('weekly_workload')
        .update(weeklyData)
        .eq('id', existingWeekly.id)

      if (updateError) {
        console.error('Weekly workload update error:', updateError)
      }
    } else {
      const { error: insertError } = await supabaseClient
        .from('weekly_workload')
        .insert(weeklyData)

      if (insertError) {
        console.error('Weekly workload insert error:', insertError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        week_start: weekStart,
        week_end: weekEnd,
        total_planned: weeklyStats.total_planned,
        total_actual: weeklyStats.total_actual,
        hybrid_total: hybridTotal,
        sessions_planned: weeklyStats.sessions_planned,
        sessions_completed: weeklyStats.sessions_completed,
        sessions: weeklyStats.sessions
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        } 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        } 
      }
    )
  }
})
