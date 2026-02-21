-- Find workouts that actually need computed.analysis.series processing
-- Only includes run/ride/swim workouts that have sensor data but missing series

SELECT 
  id,
  type,
  date,
  workout_status,
  CASE 
    WHEN sensor_data IS NOT NULL THEN 'has sensor data'
    WHEN gps_track IS NOT NULL THEN 'has GPS track'
    ELSE 'no sensor data'
  END as data_status,
  CASE 
    WHEN computed IS NULL THEN 'no computed'
    WHEN computed->'analysis' IS NULL THEN 'no analysis'
    WHEN computed->'analysis'->'series' IS NULL THEN 'no series'
    WHEN (computed->'analysis'->'series'->>'distance_m')::jsonb IS NULL THEN 'empty series'
    WHEN jsonb_array_length((computed->'analysis'->'series'->>'distance_m')::jsonb) < 2 THEN 'insufficient series'
    ELSE 'has series'
  END as series_status
FROM workouts
WHERE workout_status = 'completed'
  AND type IN ('run', 'running', 'ride', 'cycling', 'bike', 'swim')
  AND (
    sensor_data IS NOT NULL 
    OR gps_track IS NOT NULL
  )
  AND (
    computed IS NULL 
    OR computed->'analysis' IS NULL 
    OR computed->'analysis'->'series' IS NULL
    OR (computed->'analysis'->'series'->>'distance_m')::jsonb IS NULL
    OR jsonb_array_length((computed->'analysis'->'series'->>'distance_m')::jsonb) < 2
  )
ORDER BY date DESC
LIMIT 100;
