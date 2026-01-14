-- Add feedback_dismissed_at column to workouts table
-- This tracks when user dismissed the feedback popup for a workout
-- Server uses this as single source of truth (smart server, dumb client)

ALTER TABLE workouts 
ADD COLUMN IF NOT EXISTS feedback_dismissed_at timestamp with time zone;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_workouts_feedback_dismissed_at 
ON workouts(feedback_dismissed_at) 
WHERE feedback_dismissed_at IS NOT NULL;

COMMENT ON COLUMN workouts.feedback_dismissed_at IS 'Timestamp when user dismissed feedback popup for this workout. Server uses this to determine if feedback is needed.';
