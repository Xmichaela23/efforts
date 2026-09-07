-- weekly_workload: row-level security (FOUNDATION-READINESS B10, closed 2026-09-07).
-- The table carries user_id and was the one user table without a row rule. Only the server reads it
-- today (service role, which bypasses RLS), so nothing changes for the app; this makes sure a future
-- client read can only ever see the caller's own rows, the same rule every other user table has.
ALTER TABLE public.weekly_workload ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_workload owner select" ON public.weekly_workload;
CREATE POLICY "weekly_workload owner select" ON public.weekly_workload
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "weekly_workload owner insert" ON public.weekly_workload;
CREATE POLICY "weekly_workload owner insert" ON public.weekly_workload
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "weekly_workload owner update" ON public.weekly_workload;
CREATE POLICY "weekly_workload owner update" ON public.weekly_workload
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "weekly_workload owner delete" ON public.weekly_workload;
CREATE POLICY "weekly_workload owner delete" ON public.weekly_workload
  FOR DELETE TO authenticated USING (user_id = auth.uid());
