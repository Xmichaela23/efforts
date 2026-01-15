-- Check if these workouts have strava_activity_id
SELECT 
  id,
  type,
  name,
  date,
  source,
  strava_activity_id,
  garmin_activity_id,
  gps_track IS NULL as gps_track_null,
  gps_trackpoints IS NULL as gps_trackpoints_null
FROM workouts
WHERE id IN ('6393d2c2-5be6-4b29-8de3-8be86a86c8d3', 'f75edc59-4492-40cb-88ec-3f42ec30ec7c')
ORDER BY date DESC;
