-- Non-destructive unified model additions
-- 1) Add columns to workouts: planned_data, executed_data, status
-- 2) Add unique key on (user_id, date, type)

alter table if exists public.workouts
  add column if not exists planned_data jsonb;

alter table if exists public.workouts
  add column if not exists executed_data jsonb;

alter table if exists public.workouts
  add column if not exists status text;

-- Add a check constraint for status; wrap to avoid duplicate creation
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workouts_status_check_simple'
  ) then
    alter table public.workouts
      add constraint workouts_status_check_simple
      check (status is null or status in ('planned','completed','skipped'));
  end if;
end $$;

-- Unique composite index to enforce one (user,date,type) workout row
create unique index if not exists ux_workouts_user_date_type
  on public.workouts (user_id, date, type);


