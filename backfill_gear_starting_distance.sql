-- Backfill starting_distance for gear that may have lost it
-- This script calculates starting_distance = total_distance - SUM(workout distances)
-- and updates it for all gear where starting_distance doesn't match the calculated value

UPDATE gear g
SET starting_distance = (
  SELECT g2.total_distance - COALESCE(SUM(w.distance * 1000), 0)
  FROM gear g2
  LEFT JOIN workouts w ON w.gear_id = g2.id AND w.workout_status = 'completed'
  WHERE g2.id = g.id
  GROUP BY g2.id, g2.total_distance
)
WHERE g.total_distance > 0
  AND EXISTS (
    SELECT 1
    FROM gear g2
    LEFT JOIN workouts w ON w.gear_id = g2.id AND w.workout_status = 'completed'
    WHERE g2.id = g.id
    GROUP BY g2.id, g2.total_distance
    HAVING g2.total_distance >= COALESCE(SUM(w.distance * 1000), 0)
      -- Only update if starting_distance doesn't match calculated value
      AND ABS(COALESCE(g.starting_distance, 0) - (g2.total_distance - COALESCE(SUM(w.distance * 1000), 0))) > 0.01
  );

-- Verify the results
SELECT 
  id,
  name,
  starting_distance,
  total_distance,
  (SELECT COALESCE(SUM(distance * 1000), 0) FROM workouts WHERE gear_id = gear.id AND workout_status = 'completed') as workout_sum,
  total_distance - (SELECT COALESCE(SUM(distance * 1000), 0) FROM workouts WHERE gear_id = gear.id AND workout_status = 'completed') as calculated_starting
FROM gear
WHERE total_distance > 0
ORDER BY name;
