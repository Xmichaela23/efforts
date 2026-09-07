/*
  # run-jobs every minute (2026-09-07, docs/WORKORDER-plumbing-2026-09-07.md §1 scheduler)

  pg_cron + pg_net call the run-jobs edge function once a minute. The function has verify_jwt off and is
  protected by a secret in the URL path (the same pattern as the Garmin webhooks); the secret lives in
  Vault as `jobs_secret` and must equal the JOBS_SECRET function secret (set with
  `supabase secrets set JOBS_SECRET=…`).

  BEFORE PASTING: replace <JOBS_SECRET> below with the value that was set on the function. The repo copy
  keeps the placeholder on purpose.

  Dashboard alternative for the two extensions if CREATE EXTENSION is refused here:
    Database → Extensions → enable "pg_cron" and "pg_net", then paste the rest.

  Rerunnable: the vault secret is created once; the schedule is replaced each run.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'jobs_secret') THEN
    PERFORM vault.create_secret('<JOBS_SECRET>', 'jobs_secret', 'run-jobs callback-URL secret (equals the JOBS_SECRET function secret)');
  END IF;
END $$;

SELECT cron.unschedule('run-jobs-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-jobs-every-minute');

SELECT cron.schedule(
  'run-jobs-every-minute',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/run-jobs/'
             || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'jobs_secret' LIMIT 1),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"source": "pg_cron"}'::jsonb,
      timeout_milliseconds := 55000
    ) AS request_id;
  $cron$
);

-- Check it is there:  SELECT jobid, jobname, schedule, active FROM cron.job;
-- Last runs:          SELECT status, return_message, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
