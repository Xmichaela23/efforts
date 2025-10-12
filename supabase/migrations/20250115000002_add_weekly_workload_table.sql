-- Create weekly_workload table for efficient weekly workload queries
-- This table stores aggregated weekly workload data for better performance

CREATE TABLE IF NOT EXISTS weekly_workload (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  workload_planned INTEGER NOT NULL DEFAULT 0,
  workload_actual INTEGER NOT NULL DEFAULT 0,
  sessions_planned INTEGER NOT NULL DEFAULT 0,
  sessions_completed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, week_start_date)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_weekly_workload_user_week ON weekly_workload(user_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_workload_week_start ON weekly_workload(week_start_date);

-- Add comments
COMMENT ON TABLE weekly_workload IS 'Aggregated weekly workload data for efficient querying';
COMMENT ON COLUMN weekly_workload.workload_planned IS 'Total planned workload for the week';
COMMENT ON COLUMN weekly_workload.workload_actual IS 'Total actual workload for completed sessions';
COMMENT ON COLUMN weekly_workload.sessions_planned IS 'Number of planned sessions in the week';
COMMENT ON COLUMN weekly_workload.sessions_completed IS 'Number of completed sessions in the week';
