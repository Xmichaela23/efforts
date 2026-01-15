-- ============================================================================
-- RPE System Verification Queries
-- Run this in Supabase SQL Editor to verify RPE storage and consistency
-- ============================================================================

-- ============================================================================
-- QUERY 1: Check RPE column exists and has constraint
-- ============================================================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  (SELECT check_clause 
   FROM information_schema.check_constraints 
   WHERE constraint_name = (
     SELECT constraint_name 
     FROM information_schema.constraint_column_usage 
     WHERE table_name = 'workouts' AND column_name = 'rpe'
   )) as check_constraint
FROM information_schema.columns
WHERE table_name = 'workouts' AND column_name = 'rpe';

-- ============================================================================
-- QUERY 2: Count RPE sources (rpe column vs workout_metadata.session_rpe)
-- ============================================================================
SELECT 
  COUNT(*) as total_completed_workouts,
  COUNT(CASE WHEN rpe IS NOT NULL THEN 1 END) as has_rpe_column,
  COUNT(CASE WHEN workout_metadata->>'session_rpe' IS NOT NULL THEN 1 END) as has_session_rpe,
  COUNT(CASE WHEN rpe IS NOT NULL AND workout_metadata->>'session_rpe' IS NOT NULL THEN 1 END) as has_both,
  COUNT(CASE WHEN rpe IS NOT NULL AND workout_metadata->>'session_rpe' IS NULL THEN 1 END) as only_rpe_column,
  COUNT(CASE WHEN rpe IS NULL AND workout_metadata->>'session_rpe' IS NOT NULL THEN 1 END) as only_session_rpe,
  COUNT(CASE WHEN rpe IS NULL AND workout_metadata->>'session_rpe' IS NULL THEN 1 END) as no_rpe
FROM workouts
WHERE workout_status = 'completed';

-- ============================================================================
-- QUERY 3: Check for inconsistencies (rpe vs session_rpe mismatch)
-- ============================================================================
SELECT 
  id,
  type,
  name,
  date,
  rpe,
  workout_metadata->>'session_rpe' as session_rpe,
  CAST(workout_metadata->>'session_rpe' AS INTEGER) as session_rpe_int,
  CASE 
    WHEN rpe IS NULL AND workout_metadata->>'session_rpe' IS NULL THEN '✅ Both NULL'
    WHEN rpe IS NULL AND workout_metadata->>'session_rpe' IS NOT NULL THEN '⚠️ Only session_rpe'
    WHEN rpe IS NOT NULL AND workout_metadata->>'session_rpe' IS NULL THEN '⚠️ Only rpe'
    WHEN CAST(rpe AS TEXT) = workout_metadata->>'session_rpe' THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status,
  CASE 
    WHEN rpe IS NOT NULL AND workout_metadata->>'session_rpe' IS NOT NULL 
      AND CAST(rpe AS TEXT) != workout_metadata->>'session_rpe' 
    THEN CAST(rpe AS INTEGER) - CAST(workout_metadata->>'session_rpe' AS INTEGER)
    ELSE NULL
  END as difference
FROM workouts
WHERE workout_status = 'completed'
  AND (rpe IS NOT NULL OR workout_metadata->>'session_rpe' IS NOT NULL)
ORDER BY 
  CASE 
    WHEN rpe IS NOT NULL AND workout_metadata->>'session_rpe' IS NOT NULL 
      AND CAST(rpe AS TEXT) != workout_metadata->>'session_rpe' 
    THEN 0  -- Mismatches first
    WHEN rpe IS NULL AND workout_metadata->>'session_rpe' IS NOT NULL THEN 1
    WHEN rpe IS NOT NULL AND workout_metadata->>'session_rpe' IS NULL THEN 2
    ELSE 3
  END,
  date DESC
LIMIT 20;

-- ============================================================================
-- QUERY 4: RPE by workout type
-- ============================================================================
SELECT 
  type,
  COUNT(*) as total_completed,
  COUNT(CASE WHEN rpe IS NOT NULL THEN 1 END) as with_rpe_column,
  COUNT(CASE WHEN workout_metadata->>'session_rpe' IS NOT NULL THEN 1 END) as with_session_rpe,
  ROUND(AVG(CASE WHEN rpe IS NOT NULL THEN rpe END), 2) as avg_rpe_column,
  ROUND(AVG(CASE WHEN workout_metadata->>'session_rpe' IS NOT NULL 
    THEN CAST(workout_metadata->>'session_rpe' AS INTEGER) END), 2) as avg_session_rpe
FROM workouts
WHERE workout_status = 'completed'
GROUP BY type
ORDER BY total_completed DESC;

-- ============================================================================
-- QUERY 5: Recent RPE changes (last 30 days)
-- ============================================================================
SELECT 
  id,
  type,
  name,
  date,
  rpe,
  workout_metadata->>'session_rpe' as session_rpe,
  updated_at,
  DATE(updated_at) as update_date
FROM workouts
WHERE workout_status = 'completed'
  AND (rpe IS NOT NULL OR workout_metadata->>'session_rpe' IS NOT NULL)
  AND updated_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY updated_at DESC
LIMIT 20;

-- ============================================================================
-- QUERY 6: RPE distribution (histogram)
-- ============================================================================
SELECT 
  COALESCE(rpe, CAST(workout_metadata->>'session_rpe' AS INTEGER)) as rpe_value,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as percentage
FROM workouts
WHERE workout_status = 'completed'
  AND (rpe IS NOT NULL OR workout_metadata->>'session_rpe' IS NOT NULL)
GROUP BY COALESCE(rpe, CAST(workout_metadata->>'session_rpe' AS INTEGER))
ORDER BY rpe_value;

-- ============================================================================
-- QUERY 7: Check for invalid RPE values (should be 1-10)
-- ============================================================================
SELECT 
  id,
  type,
  name,
  date,
  rpe,
  workout_metadata->>'session_rpe' as session_rpe,
  CASE 
    WHEN rpe < 1 OR rpe > 10 THEN '❌ Invalid rpe column'
    WHEN workout_metadata->>'session_rpe' IS NOT NULL 
      AND (CAST(workout_metadata->>'session_rpe' AS INTEGER) < 1 
        OR CAST(workout_metadata->>'session_rpe' AS INTEGER) > 10) 
    THEN '❌ Invalid session_rpe'
    ELSE '✅ Valid'
  END as status
FROM workouts
WHERE workout_status = 'completed'
  AND (
    (rpe IS NOT NULL AND (rpe < 1 OR rpe > 10))
    OR (workout_metadata->>'session_rpe' IS NOT NULL 
      AND (CAST(workout_metadata->>'session_rpe' AS INTEGER) < 1 
        OR CAST(workout_metadata->>'session_rpe' AS INTEGER) > 10))
  );

-- ============================================================================
-- QUERY 8: Summary statistics
-- ============================================================================
SELECT 
  'Total Completed Workouts' as metric,
  COUNT(*)::text as value
FROM workouts
WHERE workout_status = 'completed'

UNION ALL

SELECT 
  'Workouts with RPE (any source)' as metric,
  COUNT(*)::text as value
FROM workouts
WHERE workout_status = 'completed'
  AND (rpe IS NOT NULL OR workout_metadata->>'session_rpe' IS NOT NULL)

UNION ALL

SELECT 
  'Workouts with rpe column' as metric,
  COUNT(*)::text as value
FROM workouts
WHERE workout_status = 'completed' AND rpe IS NOT NULL

UNION ALL

SELECT 
  'Workouts with session_rpe only' as metric,
  COUNT(*)::text as value
FROM workouts
WHERE workout_status = 'completed' 
  AND rpe IS NULL 
  AND workout_metadata->>'session_rpe' IS NOT NULL

UNION ALL

SELECT 
  'Workouts with both rpe and session_rpe' as metric,
  COUNT(*)::text as value
FROM workouts
WHERE workout_status = 'completed' 
  AND rpe IS NOT NULL 
  AND workout_metadata->>'session_rpe' IS NOT NULL

UNION ALL

SELECT 
  'Workouts with mismatched values' as metric,
  COUNT(*)::text as value
FROM workouts
WHERE workout_status = 'completed' 
  AND rpe IS NOT NULL 
  AND workout_metadata->>'session_rpe' IS NOT NULL
  AND CAST(rpe AS TEXT) != workout_metadata->>'session_rpe'

UNION ALL

SELECT 
  'Average RPE (rpe column)' as metric,
  ROUND(AVG(rpe), 2)::text as value
FROM workouts
WHERE workout_status = 'completed' AND rpe IS NOT NULL

UNION ALL

SELECT 
  'Average RPE (session_rpe)' as metric,
  ROUND(AVG(CAST(workout_metadata->>'session_rpe' AS INTEGER)), 2)::text as value
FROM workouts
WHERE workout_status = 'completed' 
  AND workout_metadata->>'session_rpe' IS NOT NULL;
