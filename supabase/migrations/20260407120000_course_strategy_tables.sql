-- Course strategy: persisted race geometry + per-segment strategy (smart server, dumb client)

BEGIN;

CREATE TABLE IF NOT EXISTS public.race_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'gpx',
  source_id text,
  distance_m numeric NOT NULL,
  elevation_gain_m numeric NOT NULL,
  elevation_loss_m numeric NOT NULL,
  polyline text,
  elevation_profile jsonb NOT NULL DEFAULT '[]'::jsonb,
  strategy_updated_at timestamptz,
  athlete_snapshot_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_race_courses_user_id ON public.race_courses (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_race_courses_goal_unique
  ON public.race_courses (goal_id)
  WHERE goal_id IS NOT NULL;

ALTER TABLE public.race_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own race_courses"
  ON public.race_courses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own race_courses"
  ON public.race_courses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own race_courses"
  ON public.race_courses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own race_courses"
  ON public.race_courses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_race_courses_updated_at ON public.race_courses;
CREATE TRIGGER update_race_courses_updated_at
  BEFORE UPDATE ON public.race_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.race_courses IS 'User-uploaded race course geometry; strategy columns live on course_segments.';

CREATE TABLE IF NOT EXISTS public.course_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.race_courses(id) ON DELETE CASCADE,
  segment_order int NOT NULL,
  start_distance_m numeric NOT NULL,
  end_distance_m numeric NOT NULL,
  start_elevation_m numeric NOT NULL,
  end_elevation_m numeric NOT NULL,
  elevation_change_m numeric NOT NULL,
  avg_grade_pct numeric NOT NULL,
  terrain_type text NOT NULL,
  display_group_id int,
  display_label text,
  effort_zone text,
  target_pace_slow_sec_per_mi numeric,
  target_pace_fast_sec_per_mi numeric,
  target_hr_low int,
  target_hr_high int,
  coaching_cue text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_segments_course_order ON public.course_segments (course_id, segment_order);

ALTER TABLE public.course_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read segments for own courses"
  ON public.course_segments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.race_courses rc
      WHERE rc.id = course_segments.course_id AND rc.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert segments for own courses"
  ON public.course_segments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.race_courses rc
      WHERE rc.id = course_segments.course_id AND rc.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update segments for own courses"
  ON public.course_segments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.race_courses rc
      WHERE rc.id = course_segments.course_id AND rc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.race_courses rc
      WHERE rc.id = course_segments.course_id AND rc.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete segments for own courses"
  ON public.course_segments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.race_courses rc
      WHERE rc.id = course_segments.course_id AND rc.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.course_strategy_debug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.race_courses(id) ON DELETE CASCADE,
  raw_llm_response text NOT NULL,
  prompt_hash text,
  success boolean NOT NULL,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_strategy_debug_course ON public.course_strategy_debug (course_id, created_at DESC);

ALTER TABLE public.course_strategy_debug ENABLE ROW LEVEL SECURITY;
-- No policies: deny all for anon/authenticated; service_role bypasses RLS.

COMMENT ON TABLE public.course_strategy_debug IS 'Internal LLM debug for course-strategy; service_role writes only.';

COMMIT;
