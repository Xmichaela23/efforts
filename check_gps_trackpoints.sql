-- Check if workouts have gps_trackpoints (polyline) that can be decoded
SELECT 
  id,
  type,
  name,
  date,
  source,
  strava_activity_id,
  -- Check GPS track
  CASE 
    WHEN gps_track IS NULL THEN 'NULL'
    WHEN jsonb_typeof(gps_track) = 'array' THEN 'Array: ' || jsonb_array_length(gps_track)::text || ' points'
    ELSE 'Other'
  END as gps_track_status,
  -- Check GPS trackpoints (polyline)
  CASE 
    WHEN gps_trackpoints IS NULL THEN 'NULL'
    WHEN gps_trackpoints = '' THEN 'Empty string'
    ELSE 'Has polyline: ' || LENGTH(gps_trackpoints)::text || ' chars'
  END as gps_trackpoints_status,
  LEFT(gps_trackpoints, 50) as polyline_preview
FROM workouts
WHERE id IN ('6393d2c2-5be6-4b29-8de3-8be86a86c8d3', 'f75edc59-4492-40cb-88ec-3f42ec30ec7c')
ORDER BY date DESC;
