-- Quick check to see what data exists

-- Check if gear table has any rows
SELECT COUNT(*) as total_gear_items FROM gear;

-- Check if any workouts have gear_id set
SELECT COUNT(*) as workouts_with_gear_id 
FROM workouts 
WHERE gear_id IS NOT NULL;

-- Show gear items and their current total_distance
SELECT 
  id,
  name,
  type,
  starting_distance,
  total_distance,
  (total_distance / 1609.34) as total_miles
FROM gear
ORDER BY name;

-- Show workouts with gear_id
SELECT 
  id,
  type,
  date,
  workout_status,
  distance,
  gear_id,
  (SELECT name FROM gear WHERE gear.id = workouts.gear_id) as gear_name
FROM workouts
WHERE gear_id IS NOT NULL
ORDER BY date DESC
LIMIT 10;
