-- Recalculate workload for strength workouts with workload_actual = 0 or null
-- This query identifies the workouts that need recalculation

-- First, see which workouts need fixing:
SELECT 
  id,
  name,
  date,
  type,
  workout_status,
  workload_actual,
  CASE 
    WHEN strength_exercises IS NULL THEN 'NULL'
    WHEN jsonb_typeof(strength_exercises) = 'string' THEN 'STRING (needs parsing)'
    WHEN jsonb_typeof(strength_exercises) = 'array' THEN 'ARRAY (good)'
    ELSE jsonb_typeof(strength_exercises)::text
  END as exercises_type,
  jsonb_array_length(COALESCE(
    CASE 
      WHEN jsonb_typeof(strength_exercises) = 'string' THEN strength_exercises::jsonb
      ELSE strength_exercises
    END,
    '[]'::jsonb
  )) as exercise_count
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed'
  AND (workload_actual IS NULL OR workload_actual = 0)
ORDER BY date DESC;

-- Specific workout IDs from the logs:
-- Jan 12: 27924333-da3f-4c43-885c-bcfc8673fa53
-- Jan 13: 0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5

-- To fix these, you need to call the calculate-workload edge function.
-- You can do this via:
-- 1. Supabase Dashboard → Edge Functions → calculate-workload → Invoke
-- 2. Or use the HTTP request tool in Supabase SQL editor (if available)
-- 3. Or use curl/Postman with your service role key

-- Example payload for Supabase Dashboard:
-- {"workout_id": "27924333-da3f-4c43-885c-bcfc8673fa53"}
-- {"workout_id": "0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5"}

-- Option: Call calculate-workload function via SQL (requires http extension)
-- Replace YOUR_SUPABASE_URL and YOUR_SERVICE_ROLE_KEY with actual values
/*
SELECT 
  id,
  name,
  date,
  http_post(
    'YOUR_SUPABASE_URL/functions/v1/calculate-workload',
    jsonb_build_object('workout_id', id)::text,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'apikey', 'YOUR_SERVICE_ROLE_KEY'
    )::text
  ) as result
FROM workouts
WHERE id IN (
  '27924333-da3f-4c43-885c-bcfc8673fa53',
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5'
);
*/

-- Simpler: Just check the workouts and their exercise data
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as exercises_jsonb_type,
  CASE 
    WHEN strength_exercises IS NULL THEN 0
    WHEN jsonb_typeof(strength_exercises) = 'array' THEN jsonb_array_length(strength_exercises)
    ELSE 0
  END as exercise_count
FROM workouts
WHERE id IN (
  '27924333-da3f-4c43-885c-bcfc8673fa53',  -- Jan 12
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5'   -- Jan 13
);
