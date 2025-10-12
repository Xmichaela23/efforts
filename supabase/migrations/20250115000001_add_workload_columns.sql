-- Add workload columns to workouts table
-- These columns will store planned and actual workload scores for training load tracking

-- Add workload_planned column (planned workload score)
ALTER TABLE workouts 
ADD COLUMN IF NOT EXISTS workload_planned INTEGER;

-- Add workload_actual column (actual workload score after completion)
ALTER TABLE workouts 
ADD COLUMN IF NOT EXISTS workload_actual INTEGER;

-- Add intensity_factor column if it doesn't exist (decimal for intensity factor used in calculation)
ALTER TABLE workouts 
ADD COLUMN IF NOT EXISTS intensity_factor DECIMAL(3,2);

-- Add comments for documentation
COMMENT ON COLUMN workouts.workload_planned IS 'Planned workload score calculated from duration and intensity';
COMMENT ON COLUMN workouts.workload_actual IS 'Actual workload score after workout completion';
COMMENT ON COLUMN workouts.intensity_factor IS 'Intensity factor used in workload calculation (0.00-1.20)';

-- Add indexes for workload queries
CREATE INDEX IF NOT EXISTS idx_workouts_workload_planned ON workouts(workload_planned);
CREATE INDEX IF NOT EXISTS idx_workouts_workload_actual ON workouts(workload_actual);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date_workload ON workouts(user_id, date, workload_planned, workload_actual);
