-- Detailed verification of the two gear items with workouts
-- This confirms the distances are accumulating correctly

SELECT 
  g.name as gear_name,
  g.type as gear_type,
  -- Starting distance
  (g.starting_distance / 1609.34) as starting_miles,
  g.starting_distance as starting_meters,
  -- Workout distances
  COUNT(w.id) as workout_count,
  SUM(w.distance) as total_km_from_workouts,
  (SUM(w.distance) * 0.621371) as total_miles_from_workouts,
  (SUM(w.distance * 1000)) as total_meters_from_workouts,
  -- Current total
  (g.total_distance / 1609.34) as current_total_miles,
  g.total_distance as current_total_meters,
  -- Expected total
  ((g.starting_distance + SUM(w.distance * 1000)) / 1609.34) as expected_total_miles,
  (g.starting_distance + SUM(w.distance * 1000)) as expected_total_meters,
  -- Difference
  (g.total_distance - (g.starting_distance + SUM(w.distance * 1000))) as difference_meters,
  ((g.total_distance - (g.starting_distance + SUM(w.distance * 1000))) / 1609.34) as difference_miles,
  -- Status
  CASE 
    WHEN ABS(g.total_distance - (g.starting_distance + SUM(w.distance * 1000))) < 1 THEN '✅ CORRECT'
    WHEN ABS(g.total_distance - (g.starting_distance + SUM(w.distance * 1000))) < 10 THEN '⚠️ MINOR DIFFERENCE (rounding)'
    ELSE '❌ MISMATCH'
  END as status
FROM gear g
INNER JOIN workouts w ON w.gear_id = g.id
WHERE w.workout_status = 'completed'
GROUP BY g.id, g.name, g.type, g.starting_distance, g.total_distance
ORDER BY g.name;

-- Show individual workouts for each gear item
SELECT 
  g.name as gear_name,
  w.date,
  w.name as workout_name,
  w.distance as distance_km,
  (w.distance * 0.621371) as distance_miles,
  w.workout_status
FROM gear g
INNER JOIN workouts w ON w.gear_id = g.id
WHERE w.workout_status = 'completed'
ORDER BY g.name, w.date;
