-- Check which workouts already have gear_id set

-- Count workouts with gear_id
SELECT 
  COUNT(*) as total_workouts_with_gear,
  COUNT(DISTINCT gear_id) as unique_gear_items_used,
  MIN(date) as earliest_workout_date,
  MAX(date) as latest_workout_date
FROM workouts
WHERE gear_id IS NOT NULL;

-- Breakdown by workout type
SELECT 
  type,
  workout_status,
  COUNT(*) as count,
  SUM(distance) as total_km,
  SUM(distance * 1000) as total_meters,
  MIN(date) as earliest_date,
  MAX(date) as latest_date
FROM workouts
WHERE gear_id IS NOT NULL
GROUP BY type, workout_status
ORDER BY type, workout_status;

-- Show recent workouts with gear_id
SELECT 
  id,
  type,
  date,
  workout_status,
  distance as distance_km,
  (distance * 1000) as distance_meters,
  gear_id,
  (SELECT name FROM gear WHERE gear.id = workouts.gear_id) as gear_name,
  (SELECT type FROM gear WHERE gear.id = workouts.gear_id) as gear_type
FROM workouts
WHERE gear_id IS NOT NULL
ORDER BY date DESC
LIMIT 20;

-- Show workouts by gear item
SELECT 
  g.name as gear_name,
  g.type as gear_type,
  COUNT(w.id) as workout_count,
  SUM(w.distance) as total_km,
  SUM(w.distance * 1000) as total_meters,
  (SUM(w.distance * 1000) / 1609.34) as total_miles,
  MIN(w.date) as first_workout,
  MAX(w.date) as last_workout
FROM gear g
INNER JOIN workouts w ON w.gear_id = g.id
WHERE w.workout_status = 'completed'
GROUP BY g.id, g.name, g.type
ORDER BY workout_count DESC;

-- Count workouts without gear_id (that could have it)
SELECT 
  type,
  workout_status,
  COUNT(*) as count_without_gear
FROM workouts
WHERE gear_id IS NULL
  AND workout_status = 'completed'
  AND type IN ('run', 'ride')
  AND distance IS NOT NULL
  AND distance > 0
GROUP BY type, workout_status
ORDER BY type;
