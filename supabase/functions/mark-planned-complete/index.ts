// @ts-nocheck
/**
 * mark-planned-complete — "Mark as Complete" on a planned session (2026-09-10, audit H-T09).
 *
 * ⛔ THE PHONE SENDS THE TAP; THIS WRITES. Today's "Mark as Complete" used to insert the finished
 * `workouts` row itself, with a length from the phone's duration reader or 30 minutes when it found
 * none, a number with no source. The length now comes from `_shared/planned-duration.ts`, the reader
 * auto-attach and the ride analyser already use.
 *
 * ⛔ AND THE PHONE'S INSERT NEVER WORKED FOR THOSE TYPES. It sent `provider: 'manual'`, and `workouts`
 * has no `provider` column (checked against the live table 2026-09-10: selecting it returns 400), so
 * every run, walk or ride tap failed with "Failed to create workout". The column is not written here;
 * `completedmanually: true` is what marks the row as manual.
 *
 * ⚠️ OTHERWISE THE SAME ROWS THE PHONE MEANT TO WRITE, NOTHING MORE:
 *   · run, walk or ride: a completed `workouts` row linked by `planned_id`,
 *     `completedmanually: true`, analysis pending, and duration / moving_time / elapsed_time in MINUTES
 *     from the planned session.
 *   · every type: the planned row set to completed, its skip reason and note cleared.
 * ⛔ A PLANNED SESSION WITH NO STATED LENGTH GETS NO FINISHED ROW. `workouts.duration` cannot be empty
 * (not-null on the live table), and the phone's 30 minutes had no source. The planned row is still
 * marked completed — the tap is never refused — and the response says no row was created.
 *
 * Input:  { planned_id }
 * Output: { success, planned_id, workout_id | null, duration_minutes | null }
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { resolvePlannedDurationSeconds } from '../_shared/planned-duration.ts';

/** The types that get a finished row (they are the ones the effort prompt follows). */
const FINISHED_ROW_TYPES = ['run', 'running', 'walk', 'ride', 'bike', 'cycling'];

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string, string>;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const { userId } = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const plannedId = typeof body?.planned_id === 'string' && body.planned_id.trim() ? body.planned_id.trim() : null;
    if (!plannedId) return json({ success: false, error: 'planned_id required' }, 400);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: planned, error: readErr } = await supabase
      .from('planned_workouts')
      .select('*')
      .eq('id', plannedId)
      .eq('user_id', userId)
      .maybeSingle();
    if (readErr) return json({ success: false, error: readErr.message }, 500);
    if (!planned) return json({ success: false, error: 'Planned session not found' }, 404);

    const type = String(planned.type || '').toLowerCase();
    let workoutId: string | null = null;
    let minutes: number | null = null;

    const seconds = FINISHED_ROW_TYPES.includes(type) ? resolvePlannedDurationSeconds(planned) : null;
    if (seconds != null) {
      minutes = Math.max(1, Math.round(seconds / 60));
      const { data: created, error: insertErr } = await supabase
        .from('workouts')
        .insert({
          user_id: userId,
          type,
          date: planned.date,
          workout_status: 'completed',
          name: planned.name || planned.rendered_description || planned.description || `${type} workout`,
          duration: minutes,
          moving_time: minutes,
          elapsed_time: minutes,
          planned_id: plannedId,
          completedmanually: true,
          analysis_status: 'pending',
        })
        .select('id')
        .single();
      if (insertErr || !created) {
        return json({ success: false, error: `Failed to create workout: ${insertErr?.message ?? 'no row'}` }, 500);
      }
      workoutId = created.id;
    }

    const { error: updateErr } = await supabase
      .from('planned_workouts')
      .update({ workout_status: 'completed', skip_reason: null, skip_note: null })
      .eq('id', plannedId)
      .eq('user_id', userId);
    if (updateErr) {
      // With a finished row created the tap has landed (the phone logged this and carried on); without
      // one, this update IS the write.
      if (!workoutId) return json({ success: false, error: updateErr.message }, 500);
      console.warn('[mark-planned-complete] planned status update failed:', updateErr.message);
    }

    return json({ success: true, planned_id: plannedId, workout_id: workoutId, duration_minutes: minutes });
  } catch (e) {
    if (e instanceof AuthError) return json({ success: false, error: e.message }, e.status);
    return json({ success: false, error: e?.message ?? String(e) }, 500);
  }
});
