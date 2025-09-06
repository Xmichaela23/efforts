-- Optional link columns (safe if run multiple times)
DO $$ BEGIN
  ALTER TABLE public.planned_workouts
  ADD COLUMN IF NOT EXISTS completed_workout_id uuid UNIQUE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS planned_id uuid UNIQUE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_pw_completed_workout_id ON public.planned_workouts(completed_workout_id);
CREATE INDEX IF NOT EXISTS idx_workouts_planned_id ON public.workouts(planned_id);


