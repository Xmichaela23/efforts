/**
 * ⛔ THE ATHLETE'S NUMBERS, RE-READ AFTER A SESSION — AS A QUEUED JOB (2026-09-17, WORKORDER Stage D).
 *
 * `_shared/post-import-athlete-pipeline.ts` has always been the chain: learn-fitness-profile →
 * autoCompleteGoalsFromWorkouts → recompute-athlete-memory → compute-snapshot. `ingest-activity` AWAITED it
 * inline while `recompute-workout` — which writes the session's own best efforts — was QUEUED and ran later, so
 * the learner re-read the athlete from a database that did not yet hold the session that had just finished.
 *
 * This is the same chain behind a door the job queue can knock on, so it can be ORDERED behind that recompute.
 * It adds no rule and no throttle of its own: the caller decides when to fire, exactly as before.
 *
 * Service-role only — it is a queue target, never called from a phone.
 */
import { runPostImportAthletePipeline } from '../_shared/post-import-athlete-pipeline.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  if (!service || auth !== `Bearer ${service}`) return json({ success: false, error: 'service role required' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const userId = String((body as { user_id?: unknown })?.user_id ?? '');
    if (!userId) return json({ success: false, error: 'user_id required' }, 400);
    const source = String((body as { source?: unknown })?.source ?? 'post-import-athlete-pipeline');
    await runPostImportAthletePipeline(userId, source);
    return json({ success: true });
  } catch (err) {
    console.error('[post-import-athlete-pipeline]', err);
    return json({ success: false, error: `${err}` }, 500);
  }
});
