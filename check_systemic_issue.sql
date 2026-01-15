-- Check if this is a systemic issue affecting all strength workouts
-- This will show the distribution of string vs array formats

-- Summary stats
SELECT 
  COUNT(*) as total_strength_workouts,
  COUNT(*) FILTER (WHERE workload_actual > 0) as has_workload,
  COUNT(*) FILTER (WHERE workload_actual IS NULL OR workload_actual = 0) as zero_workload,
  COUNT(*) FILTER (WHERE jsonb_typeof(strength_exercises) = 'string') as stored_as_string,
  COUNT(*) FILTER (WHERE jsonb_typeof(strength_exercises) = 'array') as stored_as_array,
  COUNT(*) FILTER (WHERE strength_exercises IS NULL) as is_null
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed';

-- Breakdown: workouts with string format
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  -- Try to see if it's parseable
  CASE 
    WHEN jsonb_typeof(strength_exercises) = 'string' 
    THEN jsonb_typeof(strength_exercises::jsonb)
    ELSE 'N/A'
  END as parsed_type
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed'
  AND jsonb_typeof(strength_exercises) = 'string'
ORDER BY date DESC;
