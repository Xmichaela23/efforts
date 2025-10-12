-- Add workload columns to workouts and planned_workouts tables
-- This migration adds the necessary columns for the workload scoring system

-- Add workload columns to workouts table
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS workload_planned INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS workload_actual INTEGER;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS intensity_factor DECIMAL(3,2);

-- Add workload columns to planned_workouts table
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS workload_planned INTEGER;
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS workload_actual INTEGER;
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS intensity_factor DECIMAL(3,2);

-- Add comments
COMMENT ON COLUMN workouts.workload_planned IS 'Planned workload score calculated from duration and intensity';
COMMENT ON COLUMN workouts.workload_actual IS 'Actual workload score for completed workouts';
COMMENT ON COLUMN workouts.intensity_factor IS 'Intensity factor used in workload calculation (0.0-2.0)';

COMMENT ON COLUMN planned_workouts.workload_planned IS 'Planned workload score calculated from duration and intensity';
COMMENT ON COLUMN planned_workouts.workload_actual IS 'Actual workload score for completed planned workouts';
COMMENT ON COLUMN planned_workouts.intensity_factor IS 'Intensity factor used in workload calculation (0.0-2.0)';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_workouts_workload_planned ON workouts(workload_planned);
CREATE INDEX IF NOT EXISTS idx_workouts_workload_actual ON workouts(workload_actual);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_workload_planned ON planned_workouts(workload_planned);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_workload_actual ON planned_workouts(workload_actual);
