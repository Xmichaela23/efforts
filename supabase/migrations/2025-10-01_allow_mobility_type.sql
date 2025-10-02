-- Allow 'mobility' as a valid workout type in planned_workouts and workouts

-- planned_workouts.type check
alter table if exists planned_workouts
  drop constraint if exists planned_workouts_type_check;
alter table if exists planned_workouts
  add constraint planned_workouts_type_check
  check (type in ('run','ride','swim','strength','walk','mobility'));

-- workouts.type check (if present)
alter table if exists workouts
  drop constraint if exists workouts_type_check;
alter table if exists workouts
  add constraint workouts_type_check
  check (type in ('run','ride','swim','strength','walk','mobility'));

