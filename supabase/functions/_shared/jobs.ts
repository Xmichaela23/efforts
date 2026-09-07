// The job queue's arithmetic + the one enqueue call (docs/WORKORDER-plumbing-2026-09-07.md §1).
//
// Rows live in public.jobs (migration 20260907070000). run-jobs claims due rows through claim_jobs(n)
// and calls each job's target function with the service key. The pure pieces here are tested in
// jobs.test.ts; nothing in this file talks to the network.

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export type JobRow = {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  user_id: string | null;
  workout_id: string | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  last_error: string | null;
};

/** OURS — the wait after the 1st, 2nd, … failed attempt. Exponential-ish ×5, like most queue defaults. */
export const DEFAULT_BACKOFF_MINUTES = [1, 5, 25] as const;
/** OURS — three tries covers a gateway blip and a one-off compute death; a third miss is a real fault. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Parse the JOBS_BACKOFF_SECONDS override ("2,2,2" → [2, 2, 2]). Only for verification runs — the
 * production schedule is DEFAULT_BACKOFF_MINUTES. Returns null when unset or unparseable.
 */
export function parseBackoffOverride(raw: string | undefined | null): number[] | null {
  if (!raw) return null;
  const parts = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  return parts.length ? parts : null;
}

/**
 * Seconds to wait before the next run, given how many attempts have now been made (1-based: the
 * attempt that just failed). Past the end of the schedule the last value repeats.
 */
export function backoffSeconds(attemptsSoFar: number, override: number[] | null = null): number {
  const schedule = override ?? DEFAULT_BACKOFF_MINUTES.map((m) => m * 60);
  const idx = Math.max(0, Math.min(schedule.length - 1, attemptsSoFar - 1));
  return schedule[idx];
}

export function nextRunAt(now: Date, attemptsSoFar: number, override: number[] | null = null): Date {
  return new Date(now.getTime() + backoffSeconds(attemptsSoFar, override) * 1000);
}

/** After one run: done on 2xx; otherwise retry while attempts remain, else failed. */
export function decideAfterRun(ok: boolean, attemptsSoFar: number, maxAttempts: number): 'done' | 'retry' | 'failed' {
  if (ok) return 'done';
  return attemptsSoFar < maxAttempts ? 'retry' : 'failed';
}

/** The error text a job keeps: the target's `error` field when it sent JSON, else the status + body head. */
export function describeFailure(status: number, bodyText: string): string {
  try {
    const j = JSON.parse(bodyText);
    const e = j?.error ?? j?.message;
    if (typeof e === 'string' && e.trim()) return e.trim().slice(0, 500);
  } catch { /* not JSON */ }
  const head = String(bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return status ? `HTTP ${status}${head ? `: ${head}` : ''}` : (head || 'request failed');
}

export type EnqueueInput = {
  kind: string;
  payload: Record<string, unknown>;
  user_id?: string | null;
  workout_id?: string | null;
  max_attempts?: number;
};

export type EnqueueResult = { ok: true; id: number } | { ok: false; error: string };

/**
 * Insert one job. Never throws: a missing table (migration not yet pasted) or any other write failure
 * comes back as { ok: false } so the caller can fall back to the old direct call.
 */
// deno-lint-ignore no-explicit-any
export async function enqueueJob(supabase: any, input: EnqueueInput): Promise<EnqueueResult> {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .insert({
        kind: input.kind,
        payload: input.payload ?? {},
        user_id: input.user_id ?? null,
        workout_id: input.workout_id ?? null,
        max_attempts: input.max_attempts ?? DEFAULT_MAX_ATTEMPTS,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true, id: Number(data?.id) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}
