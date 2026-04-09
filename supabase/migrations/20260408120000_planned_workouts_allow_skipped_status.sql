-- Today's Efforts skip flow sets workout_status = 'skipped'; extend CHECK to allow it.
-- Production had planned_workouts_workout_status_check without 'skipped'.

ALTER TABLE public.planned_workouts
  DROP CONSTRAINT IF EXISTS planned_workouts_workout_status_check;

ALTER TABLE public.planned_workouts
  ADD CONSTRAINT planned_workouts_workout_status_check
  CHECK (
    workout_status IS NULL
    OR workout_status IN ('planned', 'completed', 'skipped', 'in_progress')
  );
