-- Check if trigger exists and is active
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'update_gear_distance_trigger';

-- Check if function exists
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_name = 'update_gear_distance';

-- Check gear table and total_distance values
SELECT 
  id,
  name,
  type,
  starting_distance,
  total_distance,
  (total_distance / 1609.34) as total_distance_miles,
  updated_at
FROM gear
ORDER BY updated_at DESC
LIMIT 10;

-- Check workouts with gear_id set
SELECT 
  id,
  type,
  date,
  workout_status,
  distance as distance_km,
  (distance * 1000) as distance_meters,
  gear_id,
  (SELECT name FROM gear WHERE gear.id = workouts.gear_id) as gear_name
FROM workouts
WHERE gear_id IS NOT NULL
ORDER BY date DESC
LIMIT 10;

-- Calculate expected total_distance for each gear item
SELECT 
  g.id,
  g.name,
  g.starting_distance,
  g.total_distance as current_total_distance,
  COALESCE(SUM(w.distance * 1000), 0) as calculated_distance_from_workouts,
  (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0)) as expected_total_distance,
  (g.total_distance - (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0))) as difference
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
GROUP BY g.id, g.name, g.starting_distance, g.total_distance
ORDER BY difference DESC;

-- Count workouts per gear
SELECT 
  g.id,
  g.name,
  COUNT(w.id) as workout_count,
  SUM(w.distance) as total_km,
  SUM(w.distance * 1000) as total_meters
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
GROUP BY g.id, g.name
ORDER BY workout_count DESC;
