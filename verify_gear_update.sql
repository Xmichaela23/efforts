-- Verify if the UPDATE worked by checking gear total_distance values

-- Show gear items with calculated totals
SELECT 
  g.id,
  g.name,
  g.type,
  g.starting_distance,
  g.total_distance as current_total_distance,
  (g.total_distance / 1609.34) as current_miles,
  COALESCE(SUM(w.distance * 1000), 0) as calculated_from_workouts,
  (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0)) as expected_total_distance,
  (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0)) / 1609.34 as expected_miles,
  CASE 
    WHEN ABS(g.total_distance - (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0))) < 1 
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status,
  COUNT(w.id) as workout_count
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
GROUP BY g.id, g.name, g.type, g.starting_distance, g.total_distance
ORDER BY g.name;

-- Show breakdown for "Trainers" specifically
SELECT 
  'Trainers' as gear_name,
  g.starting_distance,
  g.total_distance,
  COUNT(w.id) as workout_count,
  SUM(w.distance) as total_km,
  SUM(w.distance * 1000) as total_meters,
  (g.starting_distance + SUM(w.distance * 1000)) as expected_total
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
WHERE g.name = 'Trainers'
GROUP BY g.id, g.starting_distance, g.total_distance;
