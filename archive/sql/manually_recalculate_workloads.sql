-- Manually trigger workload recalculation for Jan 12-13 workouts
-- This will call the calculate-workload edge function via SQL

-- First, let's see what we're working with
SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  jsonb_array_length(strength_exercises) as exercise_count,
  strength_exercises::text as exercises_preview
FROM workouts
WHERE id IN (
  '0643bc8b-b234-4bbb-8d25-2ebeb9c84bc5',  -- Jan 13
  '27924333-da3f-4c43-885c-bcfc8673fa53'   -- Jan 12
);

-- To actually recalculate, you need to call the calculate-workload edge function
-- This can be done via:
-- 1. Supabase Dashboard → Edge Functions → calculate-workload → Invoke
-- 2. Or use the recalculate script we created earlier
