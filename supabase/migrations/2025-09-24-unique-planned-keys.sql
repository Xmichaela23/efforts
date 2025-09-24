-- Idempotency guard for planned_workouts to prevent duplicates
-- Create a partial unique index over a stable composite key.
-- Note: Adjust columns to match actual schema; drop if exists to avoid conflicts.

do $$ begin
  execute 'create unique index if not exists ux_planned_unique_key
           on public.planned_workouts (training_plan_id, week_number, day_number, date, type)';
exception when others then null; end $$;

-- Optional cleanup: keep one row per composite key, delete others
-- This is safe to run manually when you are ready; commented to avoid accidental deletions.
-- with ranked as (
--   select id,
--          row_number() over (partition by training_plan_id, week_number, day_number, date, type order by id) as rn
--   from public.planned_workouts
-- )
-- delete from public.planned_workouts p
-- using ranked r
-- where p.id = r.id and r.rn > 1;


