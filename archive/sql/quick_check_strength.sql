-- Quick check: Just the essentials for strength workout
-- Copy and paste this into Supabase SQL editor
-- This query checks the actual database column type and data

SELECT 
  id,
  name,
  date,
  type,
  workout_status,
  duration,
  workload_actual,
  workload_planned,
  intensity_factor,
  -- Check column type (should be jsonb)
  pg_typeof(strength_exercises)::text as column_type,
  -- Check raw value
  strength_exercises as raw_value,
  -- Check exercises status
  CASE 
    WHEN strength_exercises IS NULL THEN '❌ NULL'
    WHEN pg_typeof(strength_exercises)::text = 'text' THEN '⚠️ TEXT (should be jsonb!)'
    WHEN pg_typeof(strength_exercises)::text = 'jsonb' AND jsonb_typeof(strength_exercises) != 'array' THEN '❌ NOT AN ARRAY (is ' || jsonb_typeof(strength_exercises) || ')'
    WHEN pg_typeof(strength_exercises)::text = 'jsonb' AND jsonb_typeof(strength_exercises) = 'array' AND jsonb_array_length(strength_exercises) = 0 THEN '❌ EMPTY ARRAY'
    WHEN pg_typeof(strength_exercises)::text = 'jsonb' AND jsonb_typeof(strength_exercises) = 'array' THEN '✅ HAS DATA (array)'
    WHEN strength_exercises::text = '[]' THEN '❌ EMPTY ARRAY (text)'
    WHEN strength_exercises::text = 'null' THEN '❌ JSON NULL'
    ELSE '⚠️ UNKNOWN FORMAT'
  END as exercises_status,
  -- Exercise count (handle both jsonb and text, check if it's an array)
  CASE 
    WHEN strength_exercises IS NULL THEN 0
    WHEN pg_typeof(strength_exercises)::text = 'jsonb' AND jsonb_typeof(strength_exercises) = 'array' THEN
      jsonb_array_length(strength_exercises)
    WHEN pg_typeof(strength_exercises)::text = 'jsonb' AND jsonb_typeof(strength_exercises) != 'array' THEN
      -1  -- Not an array!
    WHEN pg_typeof(strength_exercises)::text = 'text' THEN
      CASE 
        WHEN (strength_exercises::jsonb)::text = '[]' THEN 0
        WHEN jsonb_typeof(strength_exercises::jsonb) = 'array' THEN
          jsonb_array_length(strength_exercises::jsonb)
        ELSE -1  -- Not an array!
      END
    ELSE -1
  END as exercise_count,
  -- Show first exercise (handle both types, only if array)
  CASE 
    WHEN strength_exercises IS NULL THEN NULL
    WHEN pg_typeof(strength_exercises)::text = 'jsonb' AND jsonb_typeof(strength_exercises) = 'array' THEN
      strength_exercises->0
    WHEN pg_typeof(strength_exercises)::text = 'text' AND jsonb_typeof(strength_exercises::jsonb) = 'array' THEN
      strength_exercises::jsonb->0
    ELSE 'NOT AN ARRAY'::jsonb
  END as first_exercise,
  -- Show all exercises (formatted)
  CASE 
    WHEN strength_exercises IS NULL THEN 'NULL'
    WHEN pg_typeof(strength_exercises)::text = 'jsonb' AND jsonb_typeof(strength_exercises) = 'array' THEN
      jsonb_pretty(strength_exercises)
    WHEN pg_typeof(strength_exercises)::text = 'jsonb' AND jsonb_typeof(strength_exercises) != 'array' THEN
      'NOT AN ARRAY: ' || jsonb_typeof(strength_exercises) || ' - ' || strength_exercises::text
    WHEN pg_typeof(strength_exercises)::text = 'text' AND jsonb_typeof(strength_exercises::jsonb) = 'array' THEN
      jsonb_pretty(strength_exercises::jsonb)
    WHEN pg_typeof(strength_exercises)::text = 'text' THEN
      'TEXT VALUE: ' || strength_exercises
    ELSE 'UNKNOWN TYPE'
  END as all_exercises_formatted,
  -- Calculate what workload SHOULD be
  CASE 
    WHEN duration > 0 AND intensity_factor > 0 THEN
      ROUND((duration::numeric / 60) * POWER(intensity_factor, 2) * 100)
    WHEN duration > 0 THEN
      ROUND((duration::numeric / 60) * POWER(0.75, 2) * 100)  -- Default intensity
    ELSE 0
  END as calculated_workload_with_current_intensity,
  -- Calculate with default intensity
  CASE 
    WHEN duration > 0 THEN
      ROUND((duration::numeric / 60) * POWER(0.75, 2) * 100)
    ELSE 0
  END as calculated_workload_with_default_intensity,
  -- Difference
  workload_actual - CASE 
    WHEN duration > 0 AND intensity_factor > 0 THEN
      ROUND((duration::numeric / 60) * POWER(intensity_factor, 2) * 100)
    WHEN duration > 0 THEN
      ROUND((duration::numeric / 60) * POWER(0.75, 2) * 100)
    ELSE 0
  END as workload_difference
FROM workouts
WHERE id = 'e77dba2c-c902-46bb-990d-ebe42a28151d';

