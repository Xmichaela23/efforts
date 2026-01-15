-- Check why workouts on 12/29 and 12/30 have no route data
-- This will show what GPS/series data exists for those dates

SELECT 
  id,
  type,
  name,
  date,
  source,
  workout_status,
  -- Check GPS track
  CASE 
    WHEN gps_track IS NULL THEN 'NULL'
    WHEN gps_track = 'null'::jsonb THEN 'JSON null'
    WHEN jsonb_typeof(gps_track) = 'array' THEN 'Array: ' || jsonb_array_length(gps_track)::text || ' points'
    WHEN jsonb_typeof(gps_track) = 'string' THEN 'String (needs parse)'
    ELSE 'Other: ' || jsonb_typeof(gps_track)
  END as gps_track_status,
  -- Check if GPS track has valid points
  CASE 
    WHEN gps_track IS NULL THEN 0
    WHEN jsonb_typeof(gps_track) = 'array' THEN jsonb_array_length(gps_track)
    ELSE 0
  END as gps_track_length,
  -- Check sensor data
  CASE 
    WHEN sensor_data IS NULL THEN 'NULL'
    WHEN sensor_data = 'null'::jsonb THEN 'JSON null'
    WHEN jsonb_typeof(sensor_data) = 'object' THEN 'Object (has samples?)'
    WHEN jsonb_typeof(sensor_data) = 'array' THEN 'Array: ' || jsonb_array_length(sensor_data)::text || ' samples'
    ELSE 'Other: ' || jsonb_typeof(sensor_data)
  END as sensor_data_status,
  -- Check computed.analysis.series
  CASE 
    WHEN computed IS NULL THEN 'NULL'
    WHEN computed->'analysis' IS NULL THEN 'No analysis'
    WHEN computed->'analysis'->'series' IS NULL THEN 'No series'
    WHEN computed->'analysis'->'series'->'distance_m' IS NULL THEN 'No distance_m'
    WHEN jsonb_typeof(computed->'analysis'->'series'->'distance_m') = 'array' 
      THEN 'Has series: ' || jsonb_array_length(computed->'analysis'->'series'->'distance_m')::text || ' points'
    ELSE 'Series exists but distance_m not array'
  END as series_status,
  -- Check analysis status
  analysis_status,
  analyzed_at,
  -- Check if processing is needed
  CASE 
    WHEN computed->'analysis'->'series'->'distance_m' IS NULL 
      AND (gps_track IS NOT NULL OR sensor_data IS NOT NULL)
      THEN 'Needs processing'
    ELSE 'OK or no data'
  END as processing_needed
FROM workouts
WHERE date IN ('2024-12-29', '2024-12-30', '2025-12-29', '2025-12-30')  -- Check both 2024 and 2025
  AND workout_status = 'completed'
  AND type IN ('run', 'ride')
ORDER BY date DESC, created_at DESC;
