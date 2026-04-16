-- App admins: flag on public.users, enforced in RLS. Set via SQL/dashboard only (users cannot self-escalate).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_admin IS 'When true, user may publish library plan templates (library_plans). Set only via service role / SQL.';

-- Replace UPDATE policy so authenticated users cannot change their own is_admin.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_admin IS NOT DISTINCT FROM (
      SELECT u.is_admin FROM public.users u WHERE u.id = auth.uid()
    )
  );

-- Stable helper for RLS policies (SECURITY DEFINER reads users row; avoids RLS recursion issues).
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT u.is_admin FROM public.users u WHERE u.id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- Library templates: only app admins may insert.
DROP POLICY IF EXISTS "Library plans can be created by authenticated" ON public.library_plans;

CREATE POLICY "Library plans insert app admins only"
  ON public.library_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_app_admin());
