-- Add missing gps_track column for GPS route data
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS gps_track jsonb;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'workouts' AND column_name = 'gps_track';
