-- Backfill starting_distance for gear that may have lost it
-- This script calculates starting_distance = total_distance - SUM(workout distances)
-- for gear where starting_distance is 0 or NULL but total_distance > sum of workouts

UPDATE gear g
SET starting_distance = (
  SELECT g2.total_distance - COALESCE(SUM(w.distance * 1000), 0)
  FROM gear g2
  LEFT JOIN workouts w ON w.gear_id = g2.id AND w.workout_status = 'completed'
  WHERE g2.id = g.id
  GROUP BY g2.id, g2.total_distance
  HAVING g2.total_distance > COALESCE(SUM(w.distance * 1000), 0)
)
WHERE (g.starting_distance IS NULL OR g.starting_distance = 0)
  AND g.total_distance > 0
  AND EXISTS (
    SELECT 1
    FROM gear g2
    LEFT JOIN workouts w ON w.gear_id = g2.id AND w.workout_status = 'completed'
    WHERE g2.id = g.id
    GROUP BY g2.id, g2.total_distance
    HAVING g2.total_distance > COALESCE(SUM(w.distance * 1000), 0)
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
