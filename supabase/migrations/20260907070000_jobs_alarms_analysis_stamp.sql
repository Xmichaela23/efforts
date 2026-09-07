/*
  # jobs + alarms + analysis_updated_at (2026-09-07, docs/WORKORDER-plumbing-2026-09-07.md §1–§3)

  jobs        the queue behind ingest. ingest-activity inserts one row per follow-up (recompute-workout,
              adapt-plan); run-jobs (pg_cron, every minute) claims due rows and calls the target function
              with the service key. 2xx → done; otherwise back to queued with a longer wait, then failed
              after max_attempts with last_error set and an alarm raised.
              RLS on; the owner may SELECT their own rows (a screen may show them); every write is the
              service role (grants below — the owner-only sweep adds policies, not grants, so it cannot
              open writes here).
  claim_jobs  SECURITY DEFINER: takes up to n due queued rows FOR UPDATE SKIP LOCKED, marks them running,
              attempts + 1, started_at, returns them. Only the service role may execute it.
  alarms      one row per raised alarm (kind, summary, detail, at, emailed, email_id). Service role only.
              _shared/alarm.ts emails at most one per kind per 15 minutes and lands the rest here.
  workouts.analysis_updated_at   stamped by trigger whenever analysis_status changes, so the client can
              call an 'analyzing' older than 10 minutes stalled (src/lib/analysis-state.ts).

  Applied the way every migration in this repo is applied: pasted into the Supabase SQL editor. Rerunnable.
*/

-- ── jobs ─────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id            bigserial PRIMARY KEY,
  kind          text        NOT NULL,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  user_id       uuid,
  workout_id    uuid,
  status        text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts      int         NOT NULL DEFAULT 0,
  max_attempts  int         NOT NULL DEFAULT 3,
  next_run_at   timestamptz NOT NULL DEFAULT now(),
  last_error    text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_status_next_run_idx ON public.jobs (status, next_run_at);
CREATE INDEX IF NOT EXISTS jobs_user_created_idx   ON public.jobs (user_id, created_at DESC);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs owner select" ON public.jobs;
CREATE POLICY "jobs owner select" ON public.jobs FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.jobs FROM anon, authenticated;
GRANT SELECT ON TABLE public.jobs TO authenticated;
GRANT ALL ON TABLE public.jobs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.jobs_id_seq TO service_role;

COMMENT ON TABLE public.jobs IS
  'Background job queue (recompute-workout, adapt-plan, …). Written by the service role; claimed by claim_jobs() from run-jobs every minute.';

-- ── claim_jobs(n) ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_jobs(n int DEFAULT 5)
RETURNS SETOF public.jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT id
    FROM public.jobs
    WHERE status = 'queued' AND next_run_at <= now()
    ORDER BY next_run_at, id
    LIMIT GREATEST(1, LEAST(n, 50))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.jobs j
  SET status = 'running', attempts = j.attempts + 1, started_at = now()
  FROM due
  WHERE j.id = due.id
  RETURNING j.*;
$$;

REVOKE ALL ON FUNCTION public.claim_jobs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(int) TO service_role;

-- ── alarms ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alarms (
  id        bigserial PRIMARY KEY,
  kind      text        NOT NULL,
  summary   text        NOT NULL,
  detail    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  at        timestamptz NOT NULL DEFAULT now(),
  emailed   boolean     NOT NULL DEFAULT false,
  email_id  text
);

CREATE INDEX IF NOT EXISTS alarms_kind_at_idx ON public.alarms (kind, at DESC);

ALTER TABLE public.alarms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.alarms FROM anon, authenticated;
GRANT ALL ON TABLE public.alarms TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.alarms_id_seq TO service_role;

COMMENT ON TABLE public.alarms IS
  'Every raised alarm (_shared/alarm.ts). emailed=true on the one that went out; at most one email per kind per 15 minutes.';

-- ── workouts.analysis_updated_at ────────────────────────────────────────────────────────────
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS analysis_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_analysis_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.analysis_status IS DISTINCT FROM OLD.analysis_status THEN
    NEW.analysis_updated_at := now();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_stamp_analysis_updated_at ON public.workouts;
CREATE TRIGGER trg_stamp_analysis_updated_at
  BEFORE UPDATE OF analysis_status ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_analysis_updated_at();

COMMENT ON COLUMN public.workouts.analysis_updated_at IS
  'When analysis_status last changed (trigger). analyzing/pending older than 10 minutes reads as stalled on the client.';
