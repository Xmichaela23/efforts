/*
  # calendar sync: what Efforts put on an athlete's Garmin / Intervals.icu calendar (2026-09-13)

  calendar_deliveries   one row per planned workout per provider that Efforts put on that provider's calendar.
              provider_workout_id   Garmin workoutId · Intervals.icu event id
              provider_schedule_id  Garmin workoutScheduleId (null for Intervals.icu)
              content_hash          sha256 of what was sent, date included; a changed hash means re-send
              date                  the date it was sent for; rows dated before today are history and never touched
              No foreign key to planned_workouts on purpose: activate-plan deletes and re-inserts every row on a
              rebuild, and this row is what lets the sync delete the old copy on the provider.
              RLS on; the owner may SELECT their own rows; every write is the service role.

  queue_calendar_sync   trigger on planned_workouts (insert, delete, and updates to what a provider shows).
              Queues one 'calendar-sync' job per athlete, only when the athlete has chosen a destination
              (users.preferences.workout_destinations) and no sync for them is already queued.
              The job runs 60 s later. OURS — plan builds and rematerializes write rows one at a time over tens of
              seconds; waiting lets one sync see the finished plan instead of a half-written one.
              The sync itself never writes planned_workouts, so it cannot re-queue itself.

  Applied the way every migration in this repo is applied: pasted into the Supabase SQL editor. Rerunnable.
*/

-- ── calendar_deliveries ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calendar_deliveries (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planned_workout_id    uuid        NOT NULL,
  provider              text        NOT NULL CHECK (provider IN ('garmin', 'intervals_icu')),
  provider_workout_id   text,
  provider_schedule_id  text,
  date                  date        NOT NULL,
  content_hash          text        NOT NULL,
  last_error            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (planned_workout_id, provider)
);

CREATE INDEX IF NOT EXISTS calendar_deliveries_user_provider_date_idx
  ON public.calendar_deliveries (user_id, provider, date);

ALTER TABLE public.calendar_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_deliveries owner select" ON public.calendar_deliveries;
CREATE POLICY "calendar_deliveries owner select" ON public.calendar_deliveries
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.calendar_deliveries FROM anon, authenticated;
GRANT SELECT ON TABLE public.calendar_deliveries TO authenticated;
GRANT ALL ON TABLE public.calendar_deliveries TO service_role;

COMMENT ON TABLE public.calendar_deliveries IS
  'Planned workouts Efforts put on a Garmin / Intervals.icu calendar. Written only by the calendar-sync function.';

-- ── queue_calendar_sync ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_calendar_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = uid AND jsonb_typeof(u.preferences -> 'workout_destinations') = 'object'
  ) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.jobs (kind, user_id, payload, next_run_at)
  SELECT 'calendar-sync', uid, '{}'::jsonb, now() + interval '60 seconds'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.kind = 'calendar-sync' AND j.user_id = uid AND j.status = 'queued'
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_calendar_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS planned_workouts_calendar_sync_ins_del ON public.planned_workouts;
CREATE TRIGGER planned_workouts_calendar_sync_ins_del
  AFTER INSERT OR DELETE ON public.planned_workouts
  FOR EACH ROW EXECUTE FUNCTION public.queue_calendar_sync();

-- Updates only when something a provider shows changed; workload-only and link-only writes do not queue a sync.
DROP TRIGGER IF EXISTS planned_workouts_calendar_sync_upd ON public.planned_workouts;
CREATE TRIGGER planned_workouts_calendar_sync_upd
  AFTER UPDATE ON public.planned_workouts
  FOR EACH ROW
  WHEN (
       OLD.date               IS DISTINCT FROM NEW.date
    OR OLD.type               IS DISTINCT FROM NEW.type
    OR OLD.name               IS DISTINCT FROM NEW.name
    OR OLD.description        IS DISTINCT FROM NEW.description
    OR OLD.computed           IS DISTINCT FROM NEW.computed
    OR OLD.strength_exercises IS DISTINCT FROM NEW.strength_exercises
    OR OLD.workout_status     IS DISTINCT FROM NEW.workout_status
  )
  EXECUTE FUNCTION public.queue_calendar_sync();

-- ── queue a sync when the athlete changes where workouts go ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_calendar_sync_on_destinations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.jobs (kind, user_id, payload, next_run_at)
  SELECT 'calendar-sync', NEW.id, '{}'::jsonb, now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.kind = 'calendar-sync' AND j.user_id = NEW.id AND j.status = 'queued'
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_calendar_sync_on_destinations() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_calendar_sync_destinations ON public.users;
CREATE TRIGGER users_calendar_sync_destinations
  AFTER UPDATE ON public.users
  FOR EACH ROW
  WHEN (OLD.preferences -> 'workout_destinations' IS DISTINCT FROM NEW.preferences -> 'workout_destinations')
  EXECUTE FUNCTION public.queue_calendar_sync_on_destinations();
