/**
 * compute-core-verdict — the segment VERDICT, born on the spine (Law 5; DESIGN-segments §5).
 *
 * Spine step (Option B): server-authoritative, persisted to core_verdicts, upstream of every surface.
 * Surfaces (session-detail/build.ts, client) only READ it. It is NOT minted at render time.
 *
 * INVARIANT (see the core_verdicts migration): must be invoked — after match-cores — from EVERY
 * recompute/fan-out path (ingest-activity, recompute-workout, bulk-reanalyze-workouts,
 * post-import-athlete-pipeline) or verdicts go stale. This standalone entrypoint is also the backfill.
 *
 * Modes: POST { dry_run: true } → compute + return the rows that WOULD persist, WRITE NOTHING.
 *        POST {}               → upsert core_verdicts (one row per active core; onConflict core_id).
 * Auth: user JWT; service-role bearer may target an explicit user_id (backfill).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { computeCoreVerdict, type CoreEffortRow } from '../_shared/core-verdict.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body?.dry_run === true;
  const numOpt = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const windowDays = numOpt(body?.window_days); // CALIBRATION (default 183 in core-verdict)
  const minEfforts = numOpt(body?.min_efforts); // CALIBRATION (default 8)
  const asOf = typeof body?.as_of === 'string' ? (body.as_of as string) : new Date().toISOString().slice(0, 10);

  const authHeader = req.headers.get('Authorization') ?? '';
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await authClient.auth.getUser();
  let userId: string | null = user?.id ?? null;
  if (!userId && typeof body?.user_id === 'string' && authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    userId = body.user_id;
  }
  if (!userId) return json({ ok: false, error: 'unauthorized' }, 401);

  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: cores, error: coreErr } = await svc
    .from('route_cores')
    .select('id, core_key, distance_m')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (coreErr) return json({ ok: false, error: `core load: ${coreErr.message}` }, 500);
  if (!cores || cores.length === 0) return json({ ok: true, message: 'no active cores', verdicts: [] });

  const rows: any[] = [];
  for (const c of cores) {
    const { data: efforts, error: effErr } = await svc
      .from('core_efforts')
      .select('effort_date, avg_pace_s_per_km, avg_hr_bpm, metric_source')
      .eq('core_id', (c as any).id);
    if (effErr) return json({ ok: false, error: `effort load: ${effErr.message}` }, 500);

    const v = computeCoreVerdict((efforts ?? []) as CoreEffortRow[], { asOf, windowDays, minEfforts });
    rows.push({
      core_id: (c as any).id,
      user_id: userId,
      metric: v.metric,
      direction: v.direction,
      pct: v.trend?.pct ?? null,
      ci_low: v.trend?.ci?.[0] ?? null,
      ci_high: v.trend?.ci?.[1] ?? null,
      n: v.n,
      n_hr_aligned: v.nHrAligned,
      window_days: v.windowDays,
      method: v.trend?.method ?? null,
      span_days: v.trend?.spanDays ?? null,
      metadata: { core_key: (c as any).core_key, distance_m: (c as any).distance_m, as_of: asOf },
    });
  }

  if (dryRun) return json({ ok: true, dry_run: true, as_of: asOf, would_persist: rows });

  let written = 0;
  for (const r of rows) {
    const { error } = await svc.from('core_verdicts').upsert(r, { onConflict: 'core_id' });
    if (!error) written++;
  }
  return json({ ok: true, as_of: asOf, written, verdicts: rows });
});
