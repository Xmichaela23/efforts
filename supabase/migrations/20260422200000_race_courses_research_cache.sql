-- Research-backed rows (AL web search) can exist without full GPX geometry; cache structured notes for reuse.
BEGIN;

ALTER TABLE public.race_courses
  ADD COLUMN IF NOT EXISTS race_date date,
  ADD COLUMN IF NOT EXISTS course_data jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.race_courses.race_date IS 'Target event date when known (e.g. from goal / athlete).';
COMMENT ON COLUMN public.race_courses.course_data IS 'Non-GPX context: web search results, elev notes, weather notes, etc. source key often web_search.';

CREATE INDEX IF NOT EXISTS idx_race_courses_user_source ON public.race_courses (user_id, source)
  WHERE source = 'web_search';

COMMIT;
