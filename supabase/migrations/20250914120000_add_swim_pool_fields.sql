-- Add swim/pool context columns to planned_workouts and workouts

-- Planned workouts: pool metadata defined at plan level
ALTER TABLE planned_workouts
  ADD COLUMN IF NOT EXISTS pool_length_m NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS pool_unit TEXT CHECK (pool_unit IN ('yd','m')),
  ADD COLUMN IF NOT EXISTS pool_label TEXT,
  ADD COLUMN IF NOT EXISTS environment TEXT CHECK (environment IN ('pool','open_water')) DEFAULT 'pool';

-- Completed workouts: copied (snapshot) context from plan at link time + runtime environment
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS pool_length_m NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS pool_unit TEXT CHECK (pool_unit IN ('yd','m')),
  ADD COLUMN IF NOT EXISTS pool_length_source TEXT
    CHECK (pool_length_source IN ('user_plan','inferred','venue_default','device_default','user_override')),
  ADD COLUMN IF NOT EXISTS pool_confidence TEXT CHECK (pool_confidence IN ('high','medium','low')),
  ADD COLUMN IF NOT EXISTS pool_conflict BOOLEAN DEFAULT FALSE,
  -- Snapshot of plan values at link time
  ADD COLUMN IF NOT EXISTS plan_pool_length_m NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS plan_pool_unit TEXT CHECK (plan_pool_unit IN ('yd','m')),
  ADD COLUMN IF NOT EXISTS plan_pool_label TEXT,
  -- Workout environment classification
  ADD COLUMN IF NOT EXISTS environment TEXT CHECK (environment IN ('pool','open_water'));


