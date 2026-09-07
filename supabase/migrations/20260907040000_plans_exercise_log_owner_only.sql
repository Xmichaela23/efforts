-- plans + exercise_log: owner-only row rules (found 2026-09-07: a signed-in throwaway could read another
-- athlete's plans and logged sets through the app's own key). Whatever policies exist on these two tables
-- are dropped and replaced with the same four owner rules every other user table carries.
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['plans','exercise_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT polname FROM pg_policy WHERE polrelid = ('public.' || t)::regclass LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.polname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', t || ' owner select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', t || ' owner insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t || ' owner update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())', t || ' owner delete', t);
  END LOOP;
END $$;
