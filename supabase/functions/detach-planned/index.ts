// @ts-nocheck
// Function: detach-planned
// Behavior: deterministically detach a completed workout from a planned workout (both sides).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string, string>;

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  try {
    const payload = await req.json();
    const workout_id = payload?.workout_id;
    const planned_id = payload?.planned_id || payload?.plannedId || null;
    if (!workout_id) {
      return new Response(JSON.stringify({ success: false, detached: false, reason: 'workout_id_required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
      global: { headers: { Authorization: `Bearer ${serviceRoleKey!}` } },
    });

    // Load workout to get user_id and current planned_id (source of truth).
    const { data: w, error: wErr } = await supabase
      .from('workouts')
      .select('id,user_id,planned_id')
      .eq('id', String(workout_id))
      .maybeSingle();

    if (!w) {
      return new Response(JSON.stringify({ success: false, detached: false, reason: 'workout_not_found', details: wErr }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const pid = String(planned_id || w.planned_id || '');
    if (!pid) {
      // Nothing to detach
      return new Response(JSON.stringify({ success: true, detached: false, reason: 'no_link' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Verify planned row belongs to same user.
    const { data: p, error: pErr } = await supabase
      .from('planned_workouts')
      .select('id,user_id,completed_workout_id,workout_status')
      .eq('id', pid)
      .maybeSingle();

    if (!p || String(p.user_id) !== String(w.user_id)) {
      return new Response(JSON.stringify({ success: false, detached: false, reason: 'planned_not_found_or_wrong_user', details: pErr }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // 1) Clear workout side.
    await supabase.from('workouts').update({ planned_id: null }).eq('id', w.id).eq('user_id', w.user_id);

    // 2) Clear planned side ONLY if it points to this workout.
    if (String(p.completed_workout_id || '') === String(w.id)) {
      await supabase
        .from('planned_workouts')
        .update({ workout_status: 'planned', completed_workout_id: null })
        .eq('id', pid)
        .eq('user_id', w.user_id);
    } else {
      // Ensure status isn't stuck on completed without a valid link.
      if (String(p.workout_status || '').toLowerCase() === 'completed' && !p.completed_workout_id) {
        await supabase
          .from('planned_workouts')
          .update({ workout_status: 'planned' })
          .eq('id', pid)
          .eq('user_id', w.user_id);
      }
    }

    return new Response(JSON.stringify({ success: true, detached: true, workout_id: String(w.id), planned_id: pid }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, detached: false, reason: 'internal_error', error: String(e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

