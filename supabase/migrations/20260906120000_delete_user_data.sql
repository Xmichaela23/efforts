/*
  # delete_user_data(uid) — the sweep behind the delete-account edge function (2026-09-06)

  Deletes every row that belongs to one user from every public table that has a `user_id` column, then
  the user's row in public.users (keyed by id). The table list is read from information_schema at run
  time, so a table added next month is covered without editing this function. Only a few tables cascade
  from auth.users in production, which is why an explicit sweep is required before auth.admin.deleteUser.

  Tables can reference each other (workouts ← workout_facts, plans ← planned_workouts…) without ON DELETE
  CASCADE, and their order in information_schema is arbitrary, so the sweep runs in passes: a delete that
  trips a foreign-key violation is skipped and retried on the next pass once its children are gone. Up to
  ten passes; anything still failing after that raises, so a half-deleted account never reads as done.

  SECURITY DEFINER, service role only: the edge function calls it with the service key after verifying
  the caller's JWT. Nothing on the client can reach it.

  Returns jsonb: { "<table>": <rows deleted>, ... } for the function log.

  Applied the way every migration in this repo is applied: pasted into the Supabase SQL editor, then
  confirmed live by deleting a throwaway account and checking every user_id table reads zero rows.
*/

CREATE OR REPLACE FUNCTION public.delete_user_data(uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending  text[];
  remaining text[];
  t        text;
  n        bigint;
  counts   jsonb := '{}'::jsonb;
  pass     int := 0;
  failed   text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'delete_user_data: uid is null';
  END IF;

  SELECT COALESCE(array_agg(c.table_name::text ORDER BY c.table_name), ARRAY[]::text[])
    INTO pending
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
   WHERE c.table_schema = 'public'
     AND c.column_name  = 'user_id'
     AND tb.table_type  = 'BASE TABLE';

  WHILE array_length(pending, 1) IS NOT NULL AND pass < 10 LOOP
    pass := pass + 1;
    remaining := ARRAY[]::text[];
    FOREACH t IN ARRAY pending LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE user_id::text = $1', t) USING uid::text;
        GET DIAGNOSTICS n = ROW_COUNT;
        counts := counts || jsonb_build_object(t, n);
      EXCEPTION
        WHEN foreign_key_violation THEN
          remaining := remaining || t;
      END;
    END LOOP;
    pending := remaining;
  END LOOP;

  IF array_length(pending, 1) IS NOT NULL THEN
    failed := array_to_string(pending, ', ');
    RAISE EXCEPTION 'delete_user_data: foreign keys still block % after % passes', failed, pass;
  END IF;

  -- public.users is keyed by id (the approval row); cascades from auth.users where the FK exists,
  -- deleted here so the count is explicit either way.
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    DELETE FROM public.users WHERE id = uid;
    GET DIAGNOSTICS n = ROW_COUNT;
    counts := counts || jsonb_build_object('users', n);
  END IF;

  RETURN counts;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_data(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(uuid) TO service_role;

COMMENT ON FUNCTION public.delete_user_data(uuid) IS
  'Account deletion sweep: deletes every row with this user_id in every public table, then the users row. Service role only; called by the delete-account edge function.';
