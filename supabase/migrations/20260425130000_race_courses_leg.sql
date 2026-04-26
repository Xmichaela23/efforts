-- Triathlon: one course record per (goal, leg). Run-only events use leg = 'full'.
BEGIN;

ALTER TABLE public.race_courses
  ADD COLUMN IF NOT EXISTS leg text NOT NULL DEFAULT 'full'
  CONSTRAINT race_courses_leg_check
  CHECK (leg = ANY (ARRAY['swim'::text, 'bike'::text, 'run'::text, 'full'::text]));

COMMENT ON COLUMN public.race_courses.leg IS
  'Which discipline this GPX covers: triathlon swim/bike/run legs, or full for single-discipline (e.g. marathon) course.';

-- Replace one-row-per-goal with one-row-per-(goal,leg)
DROP INDEX IF EXISTS public.idx_race_courses_goal_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_race_courses_goal_leg_unique
  ON public.race_courses (goal_id, leg)
  WHERE goal_id IS NOT NULL;

COMMIT;
