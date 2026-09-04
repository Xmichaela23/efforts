// Edge function: share-strength-to-strava
//
// ⛔ POSTS A COMPLETED STRENGTH SESSION TO THE ATHLETE'S STRAVA FEED (2026-09-03, Michael: "can we
// work both ways on strava, upload lifts").
//
// ⛔ WHAT STRAVA CAN AND CANNOT TAKE, CHECKED AGAINST THEIR DOCS — NOT ASSUMED.
//   · `POST /api/v3/activities` creates a MANUAL activity and needs the `activity:write` scope.
//     Fields: name, sport_type, start_date_local, elapsed_time, plus optional description/distance.
//   · There is NO structured lifting model on that endpoint. Sets and reps can only travel as text
//     in `description`, so that is what this builds.
//   · The MUSCLE MAP on a Strava strength activity is drawn by STRAVA from exercise data sent by one
//     of its 14 named strength partners (Hevy, Garmin, Whoop, Fitbod, JEFIT, Runna, COROS…). The
//     format is not in the public API docs, so an ordinary integration cannot produce one. Neither
//     can it attach a photo/logo — media upload is partner-only. Strava does show which app posted
//     an activity, so the app name appears without us sending anything.
//
// ⛔ NEVER AUTOMATIC. This publishes to a feed other people read, so it runs only when the athlete
// presses the button. Nothing in the ingest chain calls it.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { AuthError, requireUser } from '../_shared/require-user.ts';
import { ensureStravaAccessToken } from '../_shared/strava-access-token.ts';
import { parseExercises, shareBody } from '../_shared/strava/strength-description.ts';

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const { workoutId } = await req.json().catch(() => ({}));
    if (!workoutId) return json({ error: 'Missing workoutId' }, 400);

    // ⛔ THE CALLER'S OWN VERIFIED JWT DECIDES WHOSE WORKOUT THIS IS — never a userId from the body.
    // This function publishes to a feed other people read; a body-supplied id would let any caller
    // post as anyone. `requireUser` is the project's one auth boundary — the anon key and the
    // service key both fail it, because neither carries a `sub`.
    const { userId, supabase } = await requireUser(req);

    const { data: workout, error: wErr } = await supabase
      .from('workouts')
      .select('id, user_id, name, type, date, timestamp, duration, moving_time, elapsed_time, workout_status, strength_exercises, metrics')
      .eq('id', workoutId)
      .eq('user_id', userId)
      .maybeSingle();

    if (wErr || !workout) return json({ error: 'Workout not found' }, 404);
    if (String(workout.type ?? '').toLowerCase() !== 'strength') {
      return json({ error: 'Only strength sessions are shared this way — rides and runs already come FROM Strava.' }, 400);
    }
    if (String(workout.workout_status ?? '').toLowerCase() !== 'completed') {
      return json({ error: 'That session is not completed yet.' }, 400);
    }

    const exercises = parseExercises(workout.strength_exercises);
    const description = shareBody(exercises);
    if (!description) return json({ error: 'No completed sets on that session.' }, 400);

    // ⛔ ELAPSED TIME IS REQUIRED BY STRAVA and must be seconds. `duration` on a workout row is
    // MINUTES; the recorded seconds, when the logger kept them, are the better number. A session
    // with neither gets a floor rather than a zero, which Strava rejects.
    const row = workout as Record<string, unknown>;
    const metrics = (row.metrics ?? {}) as Record<string, unknown>;
    const secs = Number(row.elapsed_time)
      || Number(row.moving_time)
      || Number(metrics.total_duration_seconds)
      || (Number(workout.duration) > 0 ? Math.round(Number(workout.duration) * 60) : 0);
    const elapsed = secs > 0 ? secs : 1800;

    // Strava wants a local ISO time with no zone suffix. The row's timestamp is the session's own
    // start when the logger recorded one; a date-only row starts at noon so it cannot slide a day.
    const ts = String(row.timestamp ?? '').trim();
    const startLocal = ts
      ? new Date(ts).toISOString().replace(/\.\d{3}Z$/, '')
      : `${String(workout.date).slice(0, 10)}T12:00:00`;

    const token = await ensureStravaAccessToken(supabase, userId);
    if (!token.ok) return json({ error: token.error }, 400);

    const form = new URLSearchParams({
      name: String(workout.name || 'Strength').trim(),
      sport_type: 'WeightTraining',
      start_date_local: startLocal,
      elapsed_time: String(elapsed),
      description,
    });

    const res = await fetch('https://www.strava.com/api/v3/activities', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      // ⚠️ A MISSING SCOPE IS THE ONE FAILURE THE ATHLETE CAN FIX, so it is named rather than
      // reported as a number. Read permission alone was all this app asked for until 2026-09-03,
      // so every athlete connected before then must reconnect Strava once.
      const detail = typeof payload?.message === 'string' ? payload.message : `Strava returned ${res.status}`;
      const scoped = res.status === 401 || /scope|authoriz/i.test(String(detail))
        ? 'Strava has not been given permission to post. Reconnect Strava in Settings and approve uploading.'
        : detail;
      console.warn('[share-strength-to-strava] failed', res.status, JSON.stringify(payload).slice(0, 300));
      return json({ error: scoped }, 400);
    }

    const activityId = payload?.id != null ? String(payload.id) : null;

    // Best-effort receipt so the button can say it has already been shared. The column may not exist
    // yet (see the migration alongside this function); a failure here must never fail a post that
    // Strava already accepted.
    if (activityId) {
      await supabase
        .from('workouts')
        .update({ strava_shared_activity_id: activityId })
        .eq('id', workout.id)
        .eq('user_id', userId)
        .then(undefined, () => undefined);
    }

    return json({
      ok: true,
      activityId,
      url: activityId ? `https://www.strava.com/activities/${activityId}` : null,
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: 'Not signed in' }, 401);
    console.error('[share-strength-to-strava]', e);
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Client-Info, x-client-info, X-Supabase-Authorization',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
