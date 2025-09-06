-- Ensure provider-specific IDs exist and add unique indexes for idempotent upserts

DO $$ BEGIN
  ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS strava_activity_id bigint;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS garmin_activity_id text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Partial unique indexes (ignore nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_workouts_user_strava_unique
  ON public.workouts(user_id, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workouts_user_garmin_unique
  ON public.workouts(user_id, garmin_activity_id)
  WHERE garmin_activity_id IS NOT NULL;


