-- Check ALL strength workouts to see if this is a systemic issue
-- This will show how many have the string vs array format

SELECT 
  COUNT(*) as total_strength_workouts,
  COUNT(*) FILTER (WHERE workload_actual IS NULL OR workload_actual = 0) as zero_workload,
  COUNT(*) FILTER (WHERE workload_actual > 0) as has_workload,
  COUNT(*) FILTER (WHERE jsonb_typeof(strength_exercises) = 'string') as exercises_as_string,
  COUNT(*) FILTER (WHERE jsonb_typeof(strength_exercises) = 'array') as exercises_as_array,
  COUNT(*) FILTER (WHERE strength_exercises IS NULL) as exercises_null
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed';

-- Detailed breakdown by format
SELECT 
  jsonb_typeof(strength_exercises) as exercises_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE workload_actual IS NULL OR workload_actual = 0) as zero_workload_count,
  COUNT(*) FILTER (WHERE workload_actual > 0) as has_workload_count
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed'
GROUP BY jsonb_typeof(strength_exercises)
ORDER BY count DESC;

-- List all strength workouts with zero workload
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as exercises_type,
  CASE 
    WHEN jsonb_typeof(strength_exercises) = 'array' 
    THEN jsonb_array_length(strength_exercises)
    WHEN jsonb_typeof(strength_exercises) = 'string'
    THEN jsonb_array_length(strength_exercises::jsonb)
    ELSE 0
  END as exercise_count
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed'
  AND (workload_actual IS NULL OR workload_actual = 0)
ORDER BY date DESC;
