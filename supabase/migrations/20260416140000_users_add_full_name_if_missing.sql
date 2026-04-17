-- Production drift: handle_new_user() inserts full_name + approved; ensure columns exist.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true;
