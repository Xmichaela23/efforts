-- Weather snapshot at course strategy generation time (Open-Meteo archive).
-- Stored on race_courses (course strategy lives here + course_segments).

BEGIN;

ALTER TABLE public.race_courses
  ADD COLUMN IF NOT EXISTS start_temp_f numeric,
  ADD COLUMN IF NOT EXISTS finish_temp_f numeric,
  ADD COLUMN IF NOT EXISTS humidity_pct numeric,
  ADD COLUMN IF NOT EXISTS conditions text;

COMMENT ON COLUMN public.race_courses.start_temp_f IS 'Approximate temp °F at race start hour (from archive API at strategy time).';
COMMENT ON COLUMN public.race_courses.finish_temp_f IS 'Approximate temp °F at modeled finish hour.';
COMMENT ON COLUMN public.race_courses.humidity_pct IS 'Average relative humidity % during race window.';
COMMENT ON COLUMN public.race_courses.conditions IS 'Short conditions label (e.g. sunny, partly cloudy).';

COMMIT;
