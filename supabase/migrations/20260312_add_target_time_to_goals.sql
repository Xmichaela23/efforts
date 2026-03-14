-- Add target_time to goals so event goals can specify a finish time target
-- independent of any generated plan.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_time integer;  -- seconds (e.g. 14400 = 4:00:00)
