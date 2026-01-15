-- Quick analysis: Which gear is used vs unused
-- This helps understand the summary statistics

-- Gear items with their usage status
SELECT 
  g.id,
  g.name,
  g.type,
  g.is_default,
  g.retired,
  COUNT(w.id) as workout_count,
  COUNT(CASE WHEN w.workout_status = 'completed' THEN 1 END) as completed_workouts,
  COALESCE(SUM(CASE WHEN w.workout_status = 'completed' THEN w.distance ELSE 0 END), 0) as total_km,
  (g.total_distance / 1609.34) as total_miles,
  CASE 
    WHEN COUNT(w.id) = 0 THEN '❌ UNUSED'
    WHEN COUNT(w.id) > 0 AND g.total_distance = 0 THEN '⚠️ HAS WORKOUTS BUT ZERO DISTANCE'
    WHEN ABS(g.total_distance - (g.starting_distance + COALESCE(SUM(CASE WHEN w.workout_status = 'completed' THEN w.distance * 1000 ELSE 0 END), 0))) < 1 THEN '✅ CORRECT'
    ELSE '❌ MISMATCH'
  END as status
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id
WHERE g.retired = false
GROUP BY g.id, g.name, g.type, g.is_default, g.retired, g.starting_distance, g.total_distance
ORDER BY workout_count DESC, g.name;

-- Show the 2 gear items that have workouts
SELECT 
  g.name as gear_name,
  g.type as gear_type,
  COUNT(w.id) as workout_count,
  MIN(w.date) as first_workout,
  MAX(w.date) as last_workout,
  SUM(w.distance) as total_km,
  (g.total_distance / 1609.34) as total_miles,
  (g.starting_distance / 1609.34) as starting_miles
FROM gear g
INNER JOIN workouts w ON w.gear_id = g.id
WHERE w.workout_status = 'completed'
GROUP BY g.id, g.name, g.type, g.total_distance, g.starting_distance
ORDER BY workout_count DESC;
