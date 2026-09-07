-- Every public table with a user_id column: RLS on, and exactly four owner-only rules, replacing whatever
-- policies were there. Found 2026-09-07 with a throwaway login: plans, exercise_log, goals, workout_facts and
-- athlete_snapshot were readable across users through the app's own key. Rather than patch five, the rule is
-- applied to all of them, and again to any table added later (rerunnable).
DO $$
DECLARE t text; p record;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'user_id' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT polname FROM pg_policy WHERE polrelid = ('public.' || quote_ident(t))::regclass LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.polname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', t || ' owner select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', t || ' owner insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t || ' owner update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())', t || ' owner delete', t);
  END LOOP;
END $$;
