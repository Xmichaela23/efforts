-- Optimized indexes for week-range queries
-- Safe to run multiple times; use IF NOT EXISTS where supported

-- planned_workouts: common filter is (user_id, date) range
create index if not exists idx_planned_workouts_user_date
  on public.planned_workouts (user_id, date);

-- workouts: common filter is (user_id, date) plus small projected columns
create index if not exists idx_workouts_user_date
  on public.workouts (user_id, date);

-- Optional: if many queries filter by status too, consider tri-key index
-- create index if not exists idx_workouts_user_date_status on public.workouts (user_id, date, workout_status);


