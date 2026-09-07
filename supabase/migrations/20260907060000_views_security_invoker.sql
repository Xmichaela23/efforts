-- Views run with their creator's rights by default, which steps around the row rules on the tables under
-- them: planned_workouts_resolved showed every athlete's planned sessions to any signed-in user (found
-- 2026-09-07 with a throwaway login). Every public view that exposes a user_id column now runs as the caller.
DO $$
DECLARE v text;
BEGIN
  FOR v IN
    SELECT DISTINCT c.table_name FROM information_schema.columns c
    JOIN information_schema.views vw ON vw.table_schema = c.table_schema AND vw.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'user_id'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
  END LOOP;
END $$;
