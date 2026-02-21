-- Sanity check after migration: verify all strength workouts are now arrays

-- 1. Check format distribution
SELECT 
  COUNT(*) as total_strength_workouts,
  COUNT(*) FILTER (WHERE jsonb_typeof(strength_exercises) = 'string') as still_strings,
  COUNT(*) FILTER (WHERE jsonb_typeof(strength_exercises) = 'array') as now_arrays,
  COUNT(*) FILTER (WHERE strength_exercises IS NULL) as is_null
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed';

-- 2. Check the 13 specific workouts that were broken
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  CASE 
    WHEN strength_exercises IS NULL THEN 0
    WHEN jsonb_typeof(strength_exercises) = 'array' THEN jsonb_array_length(strength_exercises)
    ELSE 0
  END as exercise_count
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',  -- Jan 13
  '27924333-da3f-4c43-885c-bcfc8673fa53',  -- Jan 12
  'e9a498ec-13b8-4c2d-b3f9-334fc734b7ba',  -- Jan 7
  '482ddaec-1a59-4e16-ac38-6eed85fc7b93',  -- Dec 24
  'de43c5fc-5c42-4ae9-8e1d-b961b51a1110',  -- Dec 5
  '4085145f-cbb2-4610-8e0d-db1551c0f4af',  -- Dec 3
  'c051a007-d5fa-4c51-bb1d-b3a51c23c722',  -- Oct 27
  '105e45f2-5458-408d-827b-db637d5ded23',  -- Oct 10
  '73a11e02-b23f-42d9-9e16-85caf01ac900',  -- Oct 1
  '0895e984-847e-4a02-b4d6-e0812ebc5845',  -- Sep 19
  '9e0fd637-61b6-4117-b720-7dc4781dffc0',  -- Sep 17
  '1ddb990f-3124-4aab-8475-156e531213ee',  -- Sep 9
  'c8884b1d-1248-42b5-b683-b0730223cc85'   -- Sep 2
)
ORDER BY date DESC;

-- 3. Summary: workouts needing workload recalculation
SELECT 
  COUNT(*) as need_recalculation,
  COUNT(*) FILTER (WHERE jsonb_typeof(strength_exercises) = 'array' AND jsonb_array_length(strength_exercises) > 0) as has_exercises_ready,
  COUNT(*) FILTER (WHERE jsonb_typeof(strength_exercises) = 'array' AND jsonb_array_length(strength_exercises) = 0) as empty_arrays,
  COUNT(*) FILTER (WHERE jsonb_typeof(strength_exercises) = 'string') as still_broken
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed'
  AND (workload_actual IS NULL OR workload_actual = 0);
