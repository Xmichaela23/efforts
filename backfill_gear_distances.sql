-- Backfill gear total_distance for ALL gear items (including those with no workouts)
-- This recalculates total_distance for all gear items based on completed workouts
-- This is needed because the trigger may not have been running since the feature was added

-- First, show what we're about to update
SELECT 
  g.id,
  g.name,
  g.starting_distance,
  g.total_distance as current_total_distance,
  COALESCE(SUM(w.distance * 1000), 0) as calculated_distance_from_workouts,
  (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0)) as expected_total_distance
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
GROUP BY g.id, g.name, g.starting_distance, g.total_distance
ORDER BY g.name;

-- Now update ALL gear items (even if they have no workouts, to reset to starting_distance)
UPDATE gear
SET total_distance = starting_distance + (
  SELECT COALESCE(SUM(distance * 1000), 0)  -- Convert KM to meters
  FROM workouts 
  WHERE gear_id = gear.id AND workout_status = 'completed'
),
updated_at = now();

-- Verify the update - show all gear with their new totals
SELECT 
  id,
  name,
  type,
  starting_distance,
  total_distance,
  (total_distance / 1609.34) as total_distance_miles,
  (SELECT COUNT(*) FROM workouts WHERE gear_id = gear.id AND workout_status = 'completed') as workout_count,
  updated_at
FROM gear
ORDER BY total_distance DESC;

-- Show breakdown by gear item
SELECT 
  g.name as gear_name,
  g.type,
  COUNT(w.id) as workout_count,
  SUM(w.distance) as total_km,
  SUM(w.distance * 1000) as total_meters,
  (SUM(w.distance * 1000) / 1609.34) as total_miles,
  MIN(w.date) as first_workout,
  MAX(w.date) as last_workout
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
GROUP BY g.id, g.name, g.type
HAVING COUNT(w.id) > 0
ORDER BY total_meters DESC;
