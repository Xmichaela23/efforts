-- Check the actual format of strength_exercises for these workouts
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as exercises_type,
  -- Show first 200 chars of the string to see the format
  CASE 
    WHEN jsonb_typeof(strength_exercises) = 'string' 
    THEN LEFT(strength_exercises::text, 200)
    ELSE 'Not a string'
  END as exercises_preview,
  -- Try to parse it
  CASE 
    WHEN jsonb_typeof(strength_exercises) = 'string' 
    THEN jsonb_array_length(strength_exercises::jsonb)
    WHEN jsonb_typeof(strength_exercises) = 'array'
    THEN jsonb_array_length(strength_exercises)
    ELSE 0
  END as parsed_exercise_count
FROM workouts
WHERE id IN (
  '27924333-da3f-4c43-885c-bcfc8673fa53',  -- Jan 12
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5'   -- Jan 13
);
