// Reassociate logged workouts to a new plan's planned_workouts
// Use case: User deletes and recreates a plan (to get new features like target_rir)
// but wants to keep their logged workouts linked to the new plan

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReassociateRequest {
  plan_id: string;      // The NEW plan to link workouts to
  dry_run?: boolean;    // Preview mode - don't actually update
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: ReassociateRequest = await req.json();
    const { plan_id, dry_run = true } = body;

    if (!plan_id) {
      return new Response(JSON.stringify({ error: 'plan_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. Get the plan to find its date range
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, name, config')
      .eq('id', plan_id)
      .eq('user_id', user.id)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract date range from plan config
    const startDate = plan.config?.user_selected_start_date || plan.config?.start_date;
    const raceDate = plan.config?.race_date;
    
    if (!startDate) {
      return new Response(JSON.stringify({ error: 'Plan has no start date' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate end date (race date or start + 24 weeks)
    const endDate = raceDate || (() => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + 24 * 7);
      return d.toISOString().split('T')[0];
    })();

    console.log(`📅 Plan date range: ${startDate} to ${endDate}`);

    // 2. Get all planned_workouts for this plan
    const { data: plannedWorkouts, error: plannedError } = await supabase
      .from('planned_workouts')
      .select('id, date, type, name')
      .eq('plan_id', plan_id)
      .eq('user_id', user.id)
      .order('date', { ascending: true });

    if (plannedError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch planned workouts', details: plannedError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📋 Found ${plannedWorkouts?.length || 0} planned workouts in plan`);

    // 3. Get all logged workouts in the date range for this user
    const { data: loggedWorkouts, error: loggedError } = await supabase
      .from('workouts')
      .select('id, date, type, name, source_planned_id')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (loggedError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch logged workouts', details: loggedError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`📝 Found ${loggedWorkouts?.length || 0} logged workouts in date range`);

    // 4. Build a lookup map: date + type -> planned_workout
    const plannedByDateType: Record<string, any[]> = {};
    for (const pw of (plannedWorkouts || [])) {
      const key = `${pw.date}|${pw.type}`;
      if (!plannedByDateType[key]) {
        plannedByDateType[key] = [];
      }
      plannedByDateType[key].push(pw);
    }

    // 5. Match logged workouts to planned workouts
    const matches: Array<{
      logged_id: string;
      logged_name: string;
      logged_date: string;
      logged_type: string;
      planned_id: string;
      planned_name: string;
      already_linked: boolean;
    }> = [];
    
    const unmatched: Array<{
      logged_id: string;
      logged_name: string;
      logged_date: string;
      logged_type: string;
      reason: string;
    }> = [];

    for (const lw of (loggedWorkouts || [])) {
      const key = `${lw.date}|${lw.type}`;
      const candidates = plannedByDateType[key] || [];
      
      if (candidates.length === 0) {
        unmatched.push({
          logged_id: lw.id,
          logged_name: lw.name,
          logged_date: lw.date,
          logged_type: lw.type,
          reason: 'No planned workout for this date + type'
        });
        continue;
      }

      // If multiple candidates, try to match by name similarity
      let bestMatch = candidates[0];
      if (candidates.length > 1) {
        const lwNameLower = (lw.name || '').toLowerCase();
        for (const c of candidates) {
          const cNameLower = (c.name || '').toLowerCase();
          // Prefer exact or partial name match
          if (cNameLower.includes(lwNameLower) || lwNameLower.includes(cNameLower)) {
            bestMatch = c;
            break;
          }
        }
      }

      const alreadyLinked = lw.source_planned_id === bestMatch.id;
      
      matches.push({
        logged_id: lw.id,
        logged_name: lw.name,
        logged_date: lw.date,
        logged_type: lw.type,
        planned_id: bestMatch.id,
        planned_name: bestMatch.name,
        already_linked: alreadyLinked
      });

      // Remove matched planned workout from candidates to avoid double-matching
      const idx = plannedByDateType[key].findIndex(p => p.id === bestMatch.id);
      if (idx !== -1) {
        plannedByDateType[key].splice(idx, 1);
      }
    }

    // 6. Execute updates (if not dry run)
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    if (!dry_run) {
      for (const match of matches) {
        if (match.already_linked) {
          skipped++;
          continue;
        }

        const { error: updateError } = await supabase
          .from('workouts')
          .update({ source_planned_id: match.planned_id })
          .eq('id', match.logged_id);

        if (updateError) {
          errors.push(`Failed to update ${match.logged_id}: ${updateError.message}`);
        } else {
          updated++;
        }
      }
    }

    const toUpdate = matches.filter(m => !m.already_linked).length;

    return new Response(JSON.stringify({
      success: true,
      dry_run,
      plan_name: plan.name,
      date_range: { start: startDate, end: endDate },
      summary: {
        logged_workouts_found: loggedWorkouts?.length || 0,
        planned_workouts_in_plan: plannedWorkouts?.length || 0,
        matches_found: matches.length,
        already_linked: matches.filter(m => m.already_linked).length,
        to_update: toUpdate,
        updated: dry_run ? 0 : updated,
        skipped: dry_run ? 0 : skipped,
        unmatched: unmatched.length
      },
      matches: matches.slice(0, 50), // Limit to first 50 for display
      unmatched: unmatched.slice(0, 20), // Limit to first 20
      errors: errors.length > 0 ? errors : undefined,
      message: dry_run 
        ? `Preview: ${toUpdate} workouts would be linked to plan "${plan.name}"`
        : `Done: ${updated} workouts linked to plan "${plan.name}"`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Reassociate error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
