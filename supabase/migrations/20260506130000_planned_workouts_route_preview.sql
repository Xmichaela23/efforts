-- Persist anchor route URL + Strava snapshot (incl. map polyline) on planned rows for UI maps.

begin;

alter table public.planned_workouts
  add column if not exists route_url text;

alter table public.planned_workouts
  add column if not exists route_snapshot jsonb;

comment on column public.planned_workouts.route_url is 'Optional HTTPS anchor route link (e.g. Strava routes URL) copied at activate-plan.';
comment on column public.planned_workouts.route_snapshot is 'Strava route snapshot JSON including optional map_polyline for planned-session map preview.';

commit;
