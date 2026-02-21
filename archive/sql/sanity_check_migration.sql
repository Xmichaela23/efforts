-- Sanity check: Verify migration 20260122_zero_complexity_elegant_fixes.sql was applied correctly

-- 1. Check status columns exist
SELECT 
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'workouts'
  AND column_name IN ('summary_status', 'metrics_status', 'summary_error', 'metrics_error', 'summary_updated_at', 'metrics_updated_at')
ORDER BY column_name;

-- 2. Check indexes exist
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'workouts'
  AND indexname IN ('idx_workouts_summary_status', 'idx_workouts_metrics_status');

-- 3. Check try_advisory_lock function exists
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE proname = 'try_advisory_lock'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 4. Check merge_computed function has FOR UPDATE
SELECT 
  proname as function_name,
  prosrc as function_body
FROM pg_proc
WHERE proname = 'merge_computed'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 5. Verify FOR UPDATE is in merge_computed (should see "FOR UPDATE" in function body)
SELECT 
  CASE 
    WHEN prosrc LIKE '%FOR UPDATE%' THEN '✅ FOR UPDATE lock found'
    ELSE '❌ FOR UPDATE lock NOT found'
  END as lock_check
FROM pg_proc
WHERE proname = 'merge_computed'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 6. Test try_advisory_lock function (should return boolean)
SELECT 
  try_advisory_lock('test-lock-key') as lock_acquired,
  try_advisory_lock('test-lock-key') as second_call_should_fail;
