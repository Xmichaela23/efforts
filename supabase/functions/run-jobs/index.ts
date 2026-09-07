// run-jobs — the queue worker (docs/WORKORDER-plumbing-2026-09-07.md §1).
//
// pg_cron calls this once a minute (migration 20260907090000) at
//   /functions/v1/run-jobs/<JOBS_SECRET>          (verify_jwt off in supabase/config.toml; the path secret
//                                                   is the door, same pattern as the Garmin webhooks)
// Each tick: claim up to 5 due jobs (claim_jobs, FOR UPDATE SKIP LOCKED), run them one after another by
// POSTing the payload to the target function with the service key, and wait for the reply.
//   2xx                → done
//   anything / throw   → attempts < max_attempts: back to queued, next_run_at = now + 1 / 5 / 25 min, last_error
//                        else: failed + alarm; a recompute-workout job also writes
//                        workouts.analysis_status = 'failed', analysis_error = '<step>: <reason>'
// Stops claiming after ~40 s so the reply stays inside the gateway limit; the next tick takes the rest.
// Jobs still claimed when the budget runs out are released (queued again, attempt not counted).
//
// JOBS_BACKOFF_SECONDS="2,2,2" overrides the backoff — verification runs only.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  decideAfterRun,
  describeFailure,
  nextRunAt,
  parseBackoffOverride,
  type JobRow,
} from '../_shared/jobs.ts';
import { raise } from '../_shared/alarm.ts';
import { invalidateUserTrainingCache } from '../_shared/invalidate-user-training-cache.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Only these functions can be reached through the queue; a row with any other kind fails at once. */
const ALLOWED_KINDS = new Set(['recompute-workout', 'adapt-plan', 'auto-attach-planned']);
/** OURS — stop claiming after 40 s; a tick then ends well inside the edge wall-clock cap. */
const CLAIM_BUDGET_MS = 40_000;
/** OURS — one job may take at most 90 s; recompute-workout's whole chain runs in well under that. */
const JOB_TIMEOUT_MS = 90_000;
const CLAIM_BATCH = 5;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `?k=<secret>` or `/run-jobs/<secret>` against JOBS_SECRET. Fails closed when the secret is unset. */
function checkSecret(req: Request): { ok: boolean; mode: 'secret' | 'none' | 'unset' } {
  const expected = Deno.env.get('JOBS_SECRET') || '';
  if (!expected) return { ok: false, mode: 'unset' };
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('k') || '';
  const segs = url.pathname.split('/').filter(Boolean);
  // `/<name>/<secret>` from the edge runtime (2 segments); the public URL's /functions/v1 is stripped.
  const fromPath = segs.length > 1 ? segs[segs.length - 1] : '';
  for (const given of [fromQuery, fromPath]) {
    if (given && timingSafeEqual(given, expected)) return { ok: true, mode: 'secret' };
  }
  return { ok: false, mode: 'none' };
}

type RunOutcome = { ok: boolean; status: number; text: string };

async function runTarget(job: JobRow): Promise<RunOutcome> {
  if (!ALLOWED_KINDS.has(job.kind)) return { ok: false, status: 0, text: JSON.stringify({ error: `unknown job kind: ${job.kind}` }) };
  // The job's own user_id wins over anything in the payload: the target's service door trusts body.user_id.
  const payload: Record<string, unknown> = { ...(job.payload ?? {}) };
  if (job.user_id) payload.user_id = job.user_id;
  if (job.workout_id && payload.workout_id == null) payload.workout_id = job.workout_id;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), JOB_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${job.kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => '');
    // The target may answer 200 with ok:false (older callers read that shape); treat it as a failure too.
    let okBody = true;
    try { const j = JSON.parse(text); if (j && typeof j === 'object' && j.ok === false) okBody = false; } catch { /* not JSON */ }
    return { ok: res.ok && okBody, status: res.status, text };
  } catch (e) {
    const msg = ctrl.signal.aborted ? `timed out after ${JOB_TIMEOUT_MS / 1000}s` : ((e as Error)?.message ?? String(e));
    return { ok: false, status: 0, text: JSON.stringify({ error: msg }) };
  } finally {
    clearTimeout(timer);
  }
}

// deno-lint-ignore no-explicit-any
async function finishJob(supabase: any, job: JobRow, outcome: RunOutcome, backoff: number[] | null): Promise<'done' | 'retry' | 'failed'> {
  const now = new Date();
  const decision = decideAfterRun(outcome.ok, job.attempts, job.max_attempts);
  if (decision === 'done') {
    await supabase.from('jobs').update({ status: 'done', finished_at: now.toISOString(), last_error: null }).eq('id', job.id);
    return decision;
  }
  const lastError = describeFailure(outcome.status, outcome.text);
  if (decision === 'retry') {
    await supabase.from('jobs').update({
      status: 'queued',
      next_run_at: nextRunAt(now, job.attempts, backoff).toISOString(),
      last_error: lastError,
    }).eq('id', job.id);
    return decision;
  }
  // failed — final
  await supabase.from('jobs').update({ status: 'failed', finished_at: now.toISOString(), last_error: lastError }).eq('id', job.id);
  const step = lastError.includes(':') ? lastError.split(':')[0].trim() : null;
  if (job.kind === 'recompute-workout' && job.workout_id) {
    try {
      await supabase.from('workouts').update({ analysis_status: 'failed', analysis_error: lastError.slice(0, 300) }).eq('id', job.workout_id);
    } catch (e) {
      console.warn('[run-jobs] analysis_status=failed write failed:', (e as Error)?.message ?? e);
    }
    if (job.user_id) await invalidateUserTrainingCache(supabase, job.user_id, 'run-jobs');
  }
  await raise('job-failed', `${job.kind} after ${job.attempts} attempts`, {
    user_id: job.user_id,
    workout_id: job.workout_id,
    step,
    error: lastError,
    function: job.kind,
    job_id: job.id,
    attempts: job.attempts,
  });
  return decision;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const auth = checkSecret(req);
  if (!auth.ok) {
    console.warn(JSON.stringify({ event: 'run_jobs_refused', mode: auth.mode }));
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const backoff = parseBackoffOverride(Deno.env.get('JOBS_BACKOFF_SECONDS'));
  const started = Date.now();
  const counts = { claimed: 0, done: 0, retried: 0, failed: 0, released: 0 };
  const errors: string[] = [];

  while (Date.now() - started < CLAIM_BUDGET_MS) {
    const { data: jobs, error } = await supabase.rpc('claim_jobs', { n: CLAIM_BATCH });
    if (error) {
      console.error('[run-jobs] claim_jobs failed:', error.message);
      return new Response(JSON.stringify({ ok: false, error: `claim_jobs: ${error.message}`, ...counts }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const batch = (jobs ?? []) as JobRow[];
    if (!batch.length) break;
    counts.claimed += batch.length;

    for (const job of batch) {
      if (Date.now() - started >= CLAIM_BUDGET_MS) {
        // Out of time: give it back untouched (the claim's attempt does not count).
        await supabase.from('jobs').update({ status: 'queued', attempts: Math.max(0, job.attempts - 1), started_at: null }).eq('id', job.id);
        counts.released++;
        continue;
      }
      const t0 = Date.now();
      const outcome = await runTarget(job);
      const decision = await finishJob(supabase, job, outcome, backoff);
      if (decision === 'done') counts.done++;
      else if (decision === 'retry') counts.retried++;
      else counts.failed++;
      if (!outcome.ok) errors.push(`#${job.id} ${job.kind}: ${describeFailure(outcome.status, outcome.text).slice(0, 160)}`);
      console.log(JSON.stringify({ event: 'job_run', id: job.id, kind: job.kind, attempt: job.attempts, ok: outcome.ok, status: outcome.status, decision, ms: Date.now() - t0 }));
    }
    if (batch.length < CLAIM_BATCH) break; // the queue is drained
  }

  const body = { ok: true, ...counts, ms: Date.now() - started, backoff_override: backoff, errors };
  console.log(JSON.stringify({ event: 'run_jobs_tick', ...body }));
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
