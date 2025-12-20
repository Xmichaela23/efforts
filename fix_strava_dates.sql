-- Fix Strava workout dates by extracting the correct local date from strava_data
-- The issue: we were using UTC date instead of start_date_local

-- First, let's see what we're dealing with
SELECT 
  id,
  name,
  date as current_date_stored,
  strava_data->'original_activity'->>'start_date' as strava_utc,
  strava_data->'original_activity'->>'start_date_local' as strava_local,
  SPLIT_PART(strava_data->'original_activity'->>'start_date_local', 'T', 1) as correct_date
FROM workouts 
WHERE source = 'strava' 
  AND strava_data IS NOT NULL
  AND strava_data->'original_activity'->>'start_date_local' IS NOT NULL
ORDER BY created_at DESC 
LIMIT 10;

-- Update all Strava workouts to use the correct local date
UPDATE workouts
SET date = SPLIT_PART(strava_data->'original_activity'->>'start_date_local', 'T', 1)::date
WHERE source = 'strava'
  AND strava_data IS NOT NULL
  AND strava_data->'original_activity'->>'start_date_local' IS NOT NULL
  AND date != SPLIT_PART(strava_data->'original_activity'->>'start_date_local', 'T', 1)::date;
