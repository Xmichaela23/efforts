-- Add intensity_distribution JSONB column to athlete_snapshot
-- Stores weekly HR zone aggregation: zone1_2_minutes, zone3_plus_minutes, zone1_2_pct, zone_seconds
ALTER TABLE athlete_snapshot
ADD COLUMN IF NOT EXISTS intensity_distribution jsonb;
