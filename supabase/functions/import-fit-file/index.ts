/**
 * import-fit-file — the phone uploads a raw .fit file; the server parses it and saves the workout
 * (2026-09-10, audit H-D05). See `parse.ts` for what the phone used to do and what changed.
 *
 * Multipart body: `file` (the .fit). One file per call; the phone loops.
 * Returns `{ workout, imported }`: the saved row (`save-imported-workout`'s answer, which also runs
 * recompute-workout on it) and the summary that row was built from, for the import screen's card.
 */
import { requireUser, AuthError } from '../_shared/require-user.ts';
import { parseFitBuffer, workoutFromFit } from './parse.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** 25 MB — a day-long recording at one sample a second is about 2 MB. OURS. */
const MAX_BYTES = 25 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const { userId } = await requireUser(req);
    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) return json({ error: 'Send the .fit file as multipart form data' }, 400);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'file required' }, 400);
    if (file.size > MAX_BYTES) return json({ error: 'File too large' }, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    let workout;
    try {
      const data = await parseFitBuffer(bytes);
      workout = workoutFromFit(data, file.name || 'Imported Workout');
    } catch (e) {
      return json({ error: (e as Error)?.message || 'Failed to parse FIT file' }, 422);
    }

    // The same door every import takes: mapping, the device's zones, recompute-workout.
    const url = Deno.env.get('SUPABASE_URL')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const res = await fetch(`${url}/functions/v1/save-imported-workout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svc}`, apikey: svc },
      body: JSON.stringify({ user_id: userId, workout }),
    });
    const saved = await res.json().catch(() => null);
    if (!res.ok || !saved?.workout?.id) {
      return json({ error: saved?.error || `Save failed (${res.status})` }, 502);
    }
    const { sensor_data: _s, gps_track: _g, ...summary } = workout;
    // The import card prints "IF: N%"; the row stores the decimal the analysis uses. Both are decided here.
    const ifDecimal = summary?.metrics?.intensity_factor;
    const imported = {
      ...summary,
      metrics: { ...summary.metrics, intensity_factor: ifDecimal != null ? Math.round(Number(ifDecimal) * 100) : null },
    };
    return json({ workout: saved.workout, imported });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: (e as Error)?.message ?? String(e) }, 500);
  }
});
