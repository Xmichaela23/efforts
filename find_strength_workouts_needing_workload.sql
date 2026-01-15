-- Find the 13 strength workouts that still need workload recalculation
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  CASE 
    WHEN strength_exercises IS NULL THEN 0
    WHEN jsonb_typeof(strength_exercises) = 'array' THEN jsonb_array_length(strength_exercises)
    WHEN jsonb_typeof(strength_exercises) = 'string' THEN jsonb_array_length(strength_exercises::jsonb)
    ELSE 0
  END as exercise_count,
  -- Show if exercises exist
  CASE 
    WHEN strength_exercises IS NULL THEN 'NO EXERCISES'
    WHEN jsonb_typeof(strength_exercises) = 'array' AND jsonb_array_length(strength_exercises) = 0 THEN 'EMPTY ARRAY'
    WHEN jsonb_typeof(strength_exercises) = 'string' THEN 'STILL STRING (needs migration)'
    ELSE 'HAS EXERCISES'
  END as status
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed'
  AND (workload_actual IS NULL OR workload_actual = 0)
ORDER BY date DESC;
