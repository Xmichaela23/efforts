-- Create unique constraint for planned_workouts to prevent duplicates
-- This constraint is required for upsert operations

CREATE UNIQUE INDEX IF NOT EXISTS ux_planned_unique_key
  ON public.planned_workouts (training_plan_id, week_number, day_number, date, type);

