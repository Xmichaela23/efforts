-- Query to diagnose strength workload calculation issue
-- Run this to see what data the strength workout has

-- ============================================================================
-- Option 1: Query by workout ID
-- ============================================================================
SELECT 
  id,
  name,
  type,
  date,
  workout_status,
  duration,
  workload_actual,
  workload_planned,
  intensity_factor,
  strength_exercises,
  -- Parse strength_exercises to see structure
  jsonb_array_length(COALESCE(strength_exercises::jsonb, '[]'::jsonb)) as exercise_count,
  -- Show first exercise details
  strength_exercises::jsonb->0 as first_exercise,
  created_at,
  updated_at
FROM workouts
WHERE id = 'e77dba2c-c902-46bb-990d-ebe42a28151d';

-- ============================================================================
-- Option 2: Query all strength workouts from that week (more context)
-- ============================================================================
SELECT 
  id,
  name,
  type,
  date,
  workout_status,
  duration,
  workload_actual,
  workload_planned,
  intensity_factor,
  jsonb_array_length(COALESCE(strength_exercises::jsonb, '[]'::jsonb)) as exercise_count,
  created_at
FROM workouts
WHERE type = 'strength'
  AND date >= '2025-11-24'
  AND date <= '2025-11-30'
ORDER BY date, created_at DESC;

-- ============================================================================
-- Option 3: Detailed breakdown of strength_exercises array
-- ============================================================================
SELECT 
  id,
  name,
  date,
  duration,
  workload_actual,
  intensity_factor,
  -- Exercise count
  jsonb_array_length(COALESCE(strength_exercises::jsonb, '[]'::jsonb)) as exercise_count,
  -- Full exercises array (formatted)
  jsonb_pretty(strength_exercises::jsonb) as exercises_formatted,
  -- Check if exercises array is null or empty
  CASE 
    WHEN strength_exercises IS NULL THEN 'NULL'
    WHEN strength_exercises::text = '[]' THEN 'EMPTY ARRAY'
    WHEN strength_exercises::text = 'null' THEN 'JSON NULL'
    ELSE 'HAS DATA'
  END as exercises_status
FROM workouts
WHERE id = 'e77dba2c-c902-46bb-990d-ebe42a28151d';

-- ============================================================================
-- Option 4: Calculate expected workload based on current data
-- ============================================================================
WITH workout_data AS (
  SELECT 
    id,
    name,
    date,
    duration,
    workload_actual,
    intensity_factor,
    strength_exercises::jsonb as exercises_json,
    jsonb_array_length(COALESCE(strength_exercises::jsonb, '[]'::jsonb)) as exercise_count
  FROM workouts
  WHERE id = 'e77dba2c-c902-46bb-990d-ebe42a28151d'
)
SELECT 
  id,
  name,
  date,
  duration,
  exercise_count,
  workload_actual as current_workload,
  intensity_factor as current_intensity,
  -- Calculate expected workload with current intensity
  CASE 
    WHEN duration > 0 AND intensity_factor > 0 THEN
      ROUND((duration::numeric / 60) * POWER(intensity_factor, 2) * 100)
    ELSE 0
  END as calculated_workload_with_current_intensity,
  -- Calculate expected workload with default intensity (0.75)
  CASE 
    WHEN duration > 0 THEN
      ROUND((duration::numeric / 60) * POWER(0.75, 2) * 100)
    ELSE 0
  END as calculated_workload_with_default_intensity,
  -- Show if exercises exist
  CASE 
    WHEN exercise_count > 0 THEN 'YES'
    ELSE 'NO - This is likely the problem!'
  END as has_exercises,
  exercises_json
FROM workout_data;

-- ============================================================================
-- Option 5: Breakdown each exercise in the array
-- ============================================================================
SELECT 
  w.id as workout_id,
  w.name,
  w.date,
  w.duration,
  w.workload_actual,
  w.intensity_factor,
  -- Extract each exercise
  jsonb_array_elements(COALESCE(w.strength_exercises::jsonb, '[]'::jsonb)) as exercise,
  -- Exercise details
  jsonb_array_elements(COALESCE(w.strength_exercises::jsonb, '[]'::jsonb))::jsonb->>'name' as exercise_name,
  jsonb_array_elements(COALESCE(w.strength_exercises::jsonb, '[]'::jsonb))::jsonb->>'sets' as sets,
  jsonb_array_elements(COALESCE(w.strength_exercises::jsonb, '[]'::jsonb))::jsonb->>'reps' as reps,
  jsonb_array_elements(COALESCE(w.strength_exercises::jsonb, '[]'::jsonb))::jsonb->>'weight' as weight,
  jsonb_array_elements(COALESCE(w.strength_exercises::jsonb, '[]'::jsonb))::jsonb->>'duration_seconds' as duration_seconds
FROM workouts w
WHERE w.id = 'e77dba2c-c902-46bb-990d-ebe42a28151d';

-- ============================================================================
-- Option 6: Compare with planned workout (if exists)
-- ============================================================================
SELECT 
  'completed' as source,
  id,
  name,
  date,
  duration,
  workload_actual as workload,
  intensity_factor,
  jsonb_array_length(COALESCE(strength_exercises::jsonb, '[]'::jsonb)) as exercise_count
FROM workouts
WHERE type = 'strength'
  AND date = '2025-11-24'

UNION ALL

SELECT 
  'planned' as source,
  id,
  name,
  date,
  duration,
  workload_planned as workload,
  intensity_factor,
  jsonb_array_length(COALESCE(strength_exercises::jsonb, '[]'::jsonb)) as exercise_count
FROM planned_workouts
WHERE type = 'strength'
  AND date = '2025-11-24'

ORDER BY source, date;

