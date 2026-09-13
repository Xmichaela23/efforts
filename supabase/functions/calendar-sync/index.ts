// Edge function: calendar-sync (2026-09-13)
// Puts an athlete's next 15 days of planned workouts on the calendars they chose (Garmin, Intervals.icu) and keeps
// them in step with the plan: removes, updates, creates. Queued by the planned_workouts trigger through run-jobs.
// Service role only (run-jobs passes the service key); body { user_id }. Logic lives in _shared/calendar-sync/run.ts.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { runCalendarSync } from '../_shared/calendar-sync/run.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!serviceKey || !timingSafeEqual(bearer, serviceKey)) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const userId = typeof body?.user_id === 'string' ? body.user_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ ok: false, error: 'user_id required' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const started = Date.now();
  try {
    const report = await runCalendarSync(supabase, userId);
    console.log(JSON.stringify({ event: 'calendar_sync', ...report, errors: report.errors.length, ms: Date.now() - started }));
    for (const e of report.errors) console.warn(JSON.stringify({ event: 'calendar_sync_error', user_id: userId, ...e }));
    // ok:false makes run-jobs retry; only provider or network failures are worth a retry.
    return json({ ok: !report.retry, ...report });
  } catch (e) {
    console.error(JSON.stringify({ event: 'calendar_sync_failed', user_id: userId, error: (e as Error).message }));
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
