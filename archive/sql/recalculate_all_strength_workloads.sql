-- After running the migration to fix JSONB format, recalculate workload for all strength workouts
-- This will trigger calculate-workload for all strength workouts that need it

-- Step 1: Get all strength workout IDs that need recalculation
-- (After the migration, they should all have proper array format, but may still have workload=0)

SELECT 
  id,
  name,
  date,
  workload_actual,
  jsonb_typeof(strength_exercises) as format,
  CASE 
    WHEN jsonb_typeof(strength_exercises) = 'array' 
    THEN jsonb_array_length(strength_exercises)
    ELSE 0
  END as exercise_count
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed'
  AND (workload_actual IS NULL OR workload_actual = 0)
ORDER BY date DESC;

-- Step 2: After running the migration, you'll need to call calculate-workload for each workout
-- You can do this via Supabase Dashboard → Edge Functions → calculate-workload → Invoke
-- Or use the batch script I created

-- Step 3: Verify all workouts now have workload
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE workload_actual > 0) as has_workload,
  COUNT(*) FILTER (WHERE workload_actual IS NULL OR workload_actual = 0) as zero_workload
FROM workouts
WHERE user_id = '45d122e7-a950-4d50-858c-380b492061aa'
  AND type = 'strength'
  AND workout_status = 'completed';
