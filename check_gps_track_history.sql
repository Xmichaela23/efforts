-- Check if these workouts ever had gps_track or if it was always missing
-- Also check when they were created/updated

SELECT 
  id,
  type,
  name,
  date,
  source,
  strava_activity_id,
  created_at,
  updated_at,
  -- Check current state
  CASE 
    WHEN gps_track IS NULL THEN 'NULL'
    WHEN jsonb_typeof(gps_track) = 'array' THEN 'Array: ' || jsonb_array_length(gps_track)::text || ' points'
    ELSE 'Other'
  END as gps_track_status,
  CASE 
    WHEN gps_trackpoints IS NULL THEN 'NULL'
    WHEN gps_trackpoints = '' THEN 'Empty'
    ELSE 'Has polyline: ' || LENGTH(gps_trackpoints)::text || ' chars'
  END as gps_trackpoints_status
FROM workouts
WHERE id IN ('6393d2c2-5be6-4b29-8de3-8be86a86c8d3', 'f75edc59-4492-40cb-88ec-3f42ec30ec7c')
ORDER BY date DESC;
