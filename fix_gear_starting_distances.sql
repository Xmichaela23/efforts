-- Fix starting_distance for gear items
-- Based on user input:
-- - Racer should start with 100 miles
-- - Trainers should start with 40 miles

-- First, let's see the current state
SELECT 
  name,
  type,
  (starting_distance / 1609.34) as current_starting_miles,
  (total_distance / 1609.34) as current_total_miles,
  (SELECT COALESCE(SUM(distance * 1000), 0) 
   FROM workouts 
   WHERE gear_id = gear.id AND workout_status = 'completed') as workout_distance_meters,
  ((SELECT COALESCE(SUM(distance * 1000), 0) 
    FROM workouts 
    WHERE gear_id = gear.id AND workout_status = 'completed') / 1609.34) as workout_distance_miles
FROM gear
WHERE name IN ('Racer', 'Trainers')
ORDER BY name;

-- Update Racer: starting_distance should be 100 miles = 160,934 meters
-- Also recalculate total_distance = starting_distance + workout_sum
UPDATE gear
SET 
  starting_distance = 160934,  -- 100 miles in meters
  total_distance = 160934 + (
    SELECT COALESCE(SUM(distance * 1000), 0)
    FROM workouts
    WHERE gear_id = gear.id AND workout_status = 'completed'
  ),
  updated_at = now()
WHERE name = 'Racer';

-- Update Trainers: starting_distance should be 40 miles = 64,373.6 meters
-- Also recalculate total_distance = starting_distance + workout_sum
UPDATE gear
SET 
  starting_distance = 64373.6,  -- 40 miles in meters
  total_distance = 64373.6 + (
    SELECT COALESCE(SUM(distance * 1000), 0)
    FROM workouts
    WHERE gear_id = gear.id AND workout_status = 'completed'
  ),
  updated_at = now()
WHERE name = 'Trainers';

-- Verify the updates
SELECT 
  name,
  type,
  (starting_distance / 1609.34) as starting_miles,
  (total_distance / 1609.34) as total_miles,
  ((total_distance - starting_distance) / 1609.34) as accumulated_miles_from_workouts,
  (SELECT COALESCE(SUM(distance * 0.621371), 0) 
   FROM workouts 
   WHERE gear_id = gear.id AND workout_status = 'completed') as workout_distance_miles
FROM gear
WHERE name IN ('Racer', 'Trainers')
ORDER BY name;

-- Note: The trigger will automatically recalculate total_distance when we update starting_distance
-- But we need to verify total_distance is still correct
-- If total_distance was correct before, it should remain correct after updating starting_distance
-- because total_distance = starting_distance + workout_sum
