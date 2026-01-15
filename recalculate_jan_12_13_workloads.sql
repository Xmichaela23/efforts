-- Recalculate workload for Jan 12-13 workouts (now that format is fixed)
-- These workouts now have proper array format and exercise data

-- Verify they're ready
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  jsonb_array_length(strength_exercises) as exercise_count
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',  -- Jan 13: 2 exercises
  '27924333-da3f-4c43-885c-bcfc8673fa53'   -- Jan 12: 4 exercises
);

-- To recalculate, call calculate-workload edge function via Supabase Dashboard:
-- {"workout_id": "0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5"}
-- {"workout_id": "27924333-da3f-4c43-885c-bcfc8673fa53"}
