-- Simple query to see all columns for the workout
-- This shows exactly how the data is stored in the database

SELECT *
FROM workouts
WHERE id = 'e77dba2c-c902-46bb-990d-ebe42a28151d';

-- If you want to see just the key columns for workload calculation:
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
  pg_typeof(strength_exercises)::text as strength_exercises_type,
  CASE 
    WHEN strength_exercises IS NULL THEN 'NULL'
    WHEN pg_typeof(strength_exercises)::text = 'jsonb' THEN jsonb_typeof(strength_exercises)::text
    ELSE pg_typeof(strength_exercises)::text
  END as strength_exercises_jsonb_type,
  strength_exercises::text as strength_exercises_as_text
FROM workouts
WHERE id = 'e77dba2c-c902-46bb-990d-ebe42a28151d';

