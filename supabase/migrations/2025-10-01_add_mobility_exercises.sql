-- Add first-class mobility support to planned and completed workouts
alter table if exists planned_workouts add column if not exists mobility_exercises jsonb;
alter table if exists workouts add column if not exists mobility_exercises jsonb;

-- Basic check constraints are not added to keep compatibility with existing rows.
-- Clients will write [] for empty lists.

