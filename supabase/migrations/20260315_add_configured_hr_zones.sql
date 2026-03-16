-- Add configured_hr_zones to user_baselines
-- Stores athlete-configured HR zone boundaries from Strava, FIT files, or manual entry.
-- Schema: {
--   source: 'strava' | 'fit_file' | 'manual',
--   custom_zones: boolean,
--   zones: [{ min: number, max: number }],  -- bpm boundaries, variable length
--   threshold_heart_rate: number | null,     -- LTHR from device/athlete
--   max_heart_rate: number | null,           -- from device profile
--   resting_heart_rate: number | null,       -- from device profile
--   updated_at: ISO timestamp
-- }
ALTER TABLE user_baselines
ADD COLUMN IF NOT EXISTS configured_hr_zones jsonb;

COMMENT ON COLUMN user_baselines.configured_hr_zones IS 'Athlete-configured HR zone boundaries from Strava, Garmin FIT files, or manual entry. Preferred over computed zones.';
