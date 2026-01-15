-- Comprehensive diagnostic: Why is workload_actual = 0?

-- 1. Check format and structure
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  jsonb_array_length(strength_exercises) as exercise_count
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',
  '27924333-da3f-4c43-885c-bcfc8673fa53'
);

-- 2. Inspect exercise structure in detail
SELECT 
  id,
  name,
  -- First exercise details
  strength_exercises->0->>'name' as first_exercise_name,
  jsonb_array_length(strength_exercises->0->'sets') as first_exercise_sets,
  -- Show first set details
  strength_exercises->0->'sets'->0 as first_set,
  -- Count total sets across all exercises
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(strength_exercises) as ex,
         jsonb_array_elements(ex->'sets') as set
  ) as total_sets_count,
  -- Count completed sets
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(strength_exercises) as ex,
         jsonb_array_elements(ex->'sets') as set
    WHERE (set->>'completed')::boolean IS NOT FALSE
  ) as completed_sets_count,
  -- Calculate total volume
  (
    SELECT COALESCE(SUM((set->>'weight')::numeric * (set->>'reps')::numeric), 0)
    FROM jsonb_array_elements(strength_exercises) as ex,
         jsonb_array_elements(ex->'sets') as set
    WHERE (set->>'completed')::boolean IS NOT FALSE
  ) as calculated_total_volume
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',
  '27924333-da3f-4c43-885c-bcfc8673fa53'
);

-- 3. Show full exercise data (truncated for readability)
SELECT 
  id,
  name,
  -- Show all exercises with their sets
  jsonb_pretty(strength_exercises) as exercises_full_structure
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',
  '27924333-da3f-4c43-885c-bcfc8673fa53'
);
