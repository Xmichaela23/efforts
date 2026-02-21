-- Inspect the actual strength_exercises data for these workouts
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  jsonb_array_length(strength_exercises) as exercise_count,
  -- Show the full structure
  strength_exercises
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',  -- Jan 13
  '27924333-da3f-4c43-885c-bcfc8673fa53'   -- Jan 12
);

-- More detailed inspection - show exercise structure
SELECT 
  id,
  name,
  date,
  jsonb_array_length(strength_exercises) as num_exercises,
  -- Extract first exercise as example
  strength_exercises->0 as first_exercise,
  -- Count total sets across all exercises
  (
    SELECT SUM(jsonb_array_length(ex->'sets'))
    FROM jsonb_array_elements(strength_exercises) as ex
  ) as total_sets,
  -- Calculate total volume (weight * reps) manually
  (
    SELECT SUM((set->>'weight')::numeric * (set->>'reps')::numeric)
    FROM jsonb_array_elements(strength_exercises) as ex,
         jsonb_array_elements(ex->'sets') as set
    WHERE (set->>'completed')::boolean IS NOT FALSE
  ) as calculated_volume
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',
  '27924333-da3f-4c43-885c-bcfc8673fa53'
);
