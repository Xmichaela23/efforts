-- Hot-path indexes to prevent timeouts and speed up dashboard queries

-- Workouts: user/date queries and inserts sorted by date
create index if not exists workouts_user_date_idx on public.workouts(user_id, date desc);

-- Planned workouts: user/date range queries
create index if not exists planned_workouts_user_date_idx on public.planned_workouts(user_id, date);

-- Strava activities: user/updated_at listing
create index if not exists strava_activities_user_updated_idx on public.strava_activities(user_id, updated_at desc);

-- Garmin activities: user and start_time listing
do $$ begin
  if not exists (
    select 1 from pg_indexes 
    where schemaname = 'public' and indexname = 'garmin_activities_user_start_idx'
  ) then
    create index garmin_activities_user_start_idx on public.garmin_activities(garmin_user_id, start_time desc);
  end if;
end $$;


