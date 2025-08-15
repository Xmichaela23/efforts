-- Add duration column to planned_workouts table
ALTER TABLE planned_workouts 
ADD COLUMN duration INTEGER;

-- Add comment explaining the field
COMMENT ON COLUMN planned_workouts.duration IS 'Expected workout duration in minutes';

-- Update existing records to have a default duration (if any exist)
UPDATE planned_workouts 
SET duration = 0 
WHERE duration IS NULL;

-- Make duration NOT NULL with default value going forward
ALTER TABLE planned_workouts 
ALTER COLUMN duration SET NOT NULL,
ALTER COLUMN duration SET DEFAULT 0;
