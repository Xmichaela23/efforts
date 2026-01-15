-- Check if workload was calculated for Jan 12-13 workouts
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  jsonb_array_length(strength_exercises) as exercise_count,
  -- Check if they're in the last 7 days (should show in graph)
  CASE 
    WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN 'IN_LAST_7_DAYS'
    ELSE 'OLDER'
  END as date_status
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',  -- Jan 13
  '27924333-da3f-4c43-885c-bcfc8673fa53'   -- Jan 12
);

-- Check all strength workouts in last 7 days
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  jsonb_array_length(strength_exercises) as exercise_count
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed'
  AND date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC;
