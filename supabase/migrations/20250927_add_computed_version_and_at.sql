-- Add computed metadata columns to workouts (idempotent)
-- Purpose: versioning and timestamping of server-side summary writes

alter table if exists public.workouts
  add column if not exists computed_version integer;

alter table if exists public.workouts
  add column if not exists computed_at timestamptz;

comment on column public.workouts.computed_version is 'Integer tag of compute-workout-summary version (e.g., 1003 for v1.0.4)';
comment on column public.workouts.computed_at is 'UTC timestamp when computed payload was last written';

-- Optional helper index for recent computations per user
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='workouts_user_computed_at_idx'
  ) then
    execute 'create index workouts_user_computed_at_idx on public.workouts (user_id, computed_at desc)';
  end if;
end $$;



