-- Recalculate total_distance for all gear based on starting_distance + sum of workouts
-- This fixes the issue where total_distance wasn't being updated by the trigger

UPDATE gear g
SET total_distance = (
  SELECT COALESCE(g2.starting_distance, 0) + COALESCE(SUM(w.distance * 1000), 0)
  FROM gear g2
  LEFT JOIN workouts w ON w.gear_id = g2.id AND w.workout_status = 'completed'
  WHERE g2.id = g.id
  GROUP BY g2.id, g2.starting_distance
)
WHERE g.total_distance > 0;

-- Verify the results
SELECT 
  id,
  name,
  starting_distance,
  total_distance,
  (SELECT COALESCE(SUM(distance * 1000), 0) FROM workouts WHERE gear_id = gear.id AND workout_status = 'completed') as workout_sum,
  starting_distance + (SELECT COALESCE(SUM(distance * 1000), 0) FROM workouts WHERE gear_id = gear.id AND workout_status = 'completed') as calculated_total
FROM gear
WHERE total_distance > 0
ORDER BY name;
