-- Add interference detection and fitness/readiness fields to athlete_snapshot
ALTER TABLE athlete_snapshot ADD COLUMN IF NOT EXISTS interference jsonb;
