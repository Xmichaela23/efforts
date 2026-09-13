/*
  # calendar sync, once a day (2026-09-13)

  calendar-sync keeps the next 15 days on Garmin / Intervals.icu, but the trigger in 20260913120000 only queues it
  when a planned workout changes. A plan that sits unchanged would never send the day that newly enters the window.
  This schedules one calendar-sync job per athlete who has chosen a destination, every day at 10:00 UTC.
  OURS — 10:00 UTC is 03:00 in Los Angeles and 06:00 in New York: before a morning session in the US.
  The sync compares with what was already sent, so a day with no change makes no calls to Garmin or Intervals.icu.

  Applied the way every migration in this repo is applied: pasted into the Supabase SQL editor. Rerunnable.
*/

SELECT cron.unschedule('calendar-sync-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-sync-daily');

SELECT cron.schedule(
  'calendar-sync-daily',
  '0 10 * * *',
  $cron$
    INSERT INTO public.jobs (kind, user_id, payload, next_run_at)
    SELECT 'calendar-sync', u.id, '{}'::jsonb, now()
    FROM public.users u
    WHERE jsonb_typeof(u.preferences -> 'workout_destinations') = 'object'
      AND NOT EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.kind = 'calendar-sync' AND j.user_id = u.id AND j.status = 'queued'
      );
  $cron$
);

-- Check it is there:  SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'calendar-sync-daily';
