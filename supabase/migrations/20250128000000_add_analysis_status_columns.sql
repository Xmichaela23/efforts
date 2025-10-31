-- Add analysis status tracking columns to workouts table
-- This enables proper status tracking for workout analysis

ALTER TABLE workouts 
ADD COLUMN analysis_status TEXT DEFAULT 'pending',
ADD COLUMN analysis_error TEXT,
ADD COLUMN analyzed_at TIMESTAMPTZ;

-- Add comments for clarity
COMMENT ON COLUMN workouts.analysis_status IS 'Status of workout analysis: pending, analyzing, complete, failed';
COMMENT ON COLUMN workouts.analysis_error IS 'Error message if analysis failed';
COMMENT ON COLUMN workouts.analyzed_at IS 'Timestamp when analysis completed successfully';

-- Create index for efficient querying by status
CREATE INDEX idx_workouts_analysis_status ON workouts(analysis_status);

