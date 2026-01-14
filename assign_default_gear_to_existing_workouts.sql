-- Assign default gear to existing workouts that don't have gear_id
-- This will set the default gear for each user's run/ride workouts

-- First, show what will be updated
SELECT 
  w.type,
  w.workout_status,
  COUNT(*) as workouts_to_update,
  COUNT(DISTINCT w.user_id) as users_affected
FROM workouts w
WHERE w.gear_id IS NULL
  AND w.workout_status = 'completed'
  AND w.type IN ('run', 'ride')
  AND w.distance IS NOT NULL
  AND w.distance > 0
  AND EXISTS (
    SELECT 1 FROM gear g 
    WHERE g.user_id = w.user_id 
      AND g.type = CASE WHEN w.type = 'run' THEN 'shoe' ELSE 'bike' END
      AND g.is_default = true
      AND g.retired = false
  )
GROUP BY w.type, w.workout_status;

-- Update workouts to assign default gear
UPDATE workouts w
SET gear_id = (
  SELECT g.id
  FROM gear g
  WHERE g.user_id = w.user_id
    AND g.type = CASE WHEN w.type = 'run' THEN 'shoe' ELSE 'bike' END
    AND g.is_default = true
    AND g.retired = false
  LIMIT 1
),
updated_at = now()
WHERE w.gear_id IS NULL
  AND w.workout_status = 'completed'
  AND w.type IN ('run', 'ride')
  AND w.distance IS NOT NULL
  AND w.distance > 0
  AND EXISTS (
    SELECT 1 FROM gear g 
    WHERE g.user_id = w.user_id 
      AND g.type = CASE WHEN w.type = 'run' THEN 'shoe' ELSE 'bike' END
      AND g.is_default = true
      AND g.retired = false
  );

-- Show results
SELECT 
  w.type,
  COUNT(*) as workouts_updated,
  COUNT(DISTINCT w.user_id) as users_affected,
  (SELECT name FROM gear WHERE gear.id = w.gear_id LIMIT 1) as default_gear_name
FROM workouts w
WHERE w.gear_id IS NOT NULL
  AND w.workout_status = 'completed'
  AND w.type IN ('run', 'ride')
  AND w.updated_at > now() - interval '1 minute'  -- Recently updated
GROUP BY w.type, w.gear_id
ORDER BY w.type;

-- Show summary
SELECT 
  COUNT(*) as total_workouts_with_gear_after,
  COUNT(DISTINCT gear_id) as unique_gear_items_used,
  SUM(CASE WHEN type = 'run' THEN 1 ELSE 0 END) as runs_with_gear,
  SUM(CASE WHEN type = 'ride' THEN 1 ELSE 0 END) as rides_with_gear
FROM workouts
WHERE gear_id IS NOT NULL
  AND workout_status = 'completed'
  AND type IN ('run', 'ride');
