-- ============================================================================
-- Gear System Verification Queries
-- Run this in Supabase SQL Editor to verify gear distance accumulation
-- ============================================================================

-- ============================================================================
-- QUERY 1: Check if trigger is active
-- ============================================================================
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'update_gear_distance_trigger';

-- ============================================================================
-- QUERY 2: Check if function exists
-- ============================================================================
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_name = 'update_gear_distance';

-- ============================================================================
-- QUERY 3: Verify distance accuracy for all gear
-- This shows if total_distance matches expected calculation
-- ============================================================================
SELECT 
  g.id,
  g.name,
  g.type,
  g.starting_distance,
  g.total_distance as current_total_distance,
  (SELECT COALESCE(SUM(w.distance * 1000), 0) 
   FROM workouts w 
   WHERE w.gear_id = g.id AND w.workout_status = 'completed') as calculated_workout_sum_meters,
  (g.starting_distance + 
   (SELECT COALESCE(SUM(w.distance * 1000), 0) 
    FROM workouts w 
    WHERE w.gear_id = g.id AND w.workout_status = 'completed')) as expected_total_distance,
  (g.total_distance - 
   (g.starting_distance + 
    (SELECT COALESCE(SUM(w.distance * 1000), 0) 
     FROM workouts w 
     WHERE w.gear_id = g.id AND w.workout_status = 'completed'))) as difference_meters,
  -- Convert to miles for readability
  (g.total_distance / 1609.34) as current_total_miles,
  ((g.starting_distance + 
    (SELECT COALESCE(SUM(w.distance * 1000), 0) 
     FROM workouts w 
     WHERE w.gear_id = g.id AND w.workout_status = 'completed')) / 1609.34) as expected_total_miles,
  CASE 
    WHEN ABS(g.total_distance - 
      (g.starting_distance + 
       (SELECT COALESCE(SUM(w.distance * 1000), 0) 
        FROM workouts w 
        WHERE w.gear_id = g.id AND w.workout_status = 'completed'))) < 1 
    THEN '✅ CORRECT'
    ELSE '❌ MISMATCH'
  END as status
FROM gear g
WHERE g.total_distance > 0 OR g.starting_distance > 0
ORDER BY ABS(COALESCE(g.total_distance, 0) - 
  (COALESCE(g.starting_distance, 0) + 
   (SELECT COALESCE(SUM(w.distance * 1000), 0) 
    FROM workouts w 
    WHERE w.gear_id = g.id AND w.workout_status = 'completed'))) DESC;

-- ============================================================================
-- QUERY 4: Workout coverage - how many workouts have gear assigned
-- ============================================================================
SELECT 
  COUNT(*) as total_workouts,
  COUNT(CASE WHEN gear_id IS NOT NULL THEN 1 END) as workouts_with_gear,
  COUNT(CASE WHEN gear_id IS NOT NULL AND workout_status = 'completed' THEN 1 END) as completed_with_gear,
  COUNT(CASE WHEN gear_id IS NOT NULL AND workout_status = 'completed' AND distance IS NOT NULL THEN 1 END) as completed_with_gear_and_distance,
  ROUND(100.0 * COUNT(CASE WHEN gear_id IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1) as pct_with_gear,
  ROUND(100.0 * COUNT(CASE WHEN gear_id IS NOT NULL AND workout_status = 'completed' THEN 1 END) / NULLIF(COUNT(CASE WHEN workout_status = 'completed' THEN 1 END), 0), 1) as pct_completed_with_gear
FROM workouts;

-- ============================================================================
-- QUERY 5: Gear usage statistics
-- ============================================================================
SELECT 
  g.id,
  g.name,
  g.type,
  COUNT(w.id) as total_workouts,
  COUNT(CASE WHEN w.workout_status = 'completed' THEN 1 END) as completed_workouts,
  SUM(CASE WHEN w.workout_status = 'completed' THEN w.distance ELSE 0 END) as total_km,
  SUM(CASE WHEN w.workout_status = 'completed' THEN w.distance * 1000 ELSE 0 END) as total_meters,
  (SUM(CASE WHEN w.workout_status = 'completed' THEN w.distance * 1000 ELSE 0 END) / 1609.34) as total_miles,
  MIN(w.date) as first_workout_date,
  MAX(w.date) as last_workout_date,
  g.starting_distance / 1609.34 as starting_miles,
  g.total_distance / 1609.34 as current_total_miles
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id
GROUP BY g.id, g.name, g.type, g.starting_distance, g.total_distance
ORDER BY completed_workouts DESC, g.name;

-- ============================================================================
-- QUERY 6: Recent workouts with gear (last 30 days)
-- ============================================================================
SELECT 
  w.id,
  w.type,
  w.name,
  w.date,
  w.workout_status,
  w.distance as distance_km,
  (w.distance * 1000) as distance_meters,
  w.gear_id,
  g.name as gear_name,
  g.type as gear_type,
  w.created_at,
  w.updated_at
FROM workouts w
LEFT JOIN gear g ON g.id = w.gear_id
WHERE w.gear_id IS NOT NULL
  AND w.date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY w.date DESC
LIMIT 20;

-- ============================================================================
-- QUERY 7: Check for gear with workouts but zero total_distance
-- (Potential issue: trigger didn't fire or gear was added before trigger)
-- ============================================================================
SELECT 
  g.id,
  g.name,
  g.type,
  g.starting_distance,
  g.total_distance,
  COUNT(w.id) as workout_count,
  SUM(CASE WHEN w.workout_status = 'completed' THEN w.distance * 1000 ELSE 0 END) as expected_distance_meters,
  CASE 
    WHEN COUNT(w.id) > 0 AND g.total_distance = 0 THEN '⚠️ HAS WORKOUTS BUT ZERO DISTANCE'
    WHEN COUNT(w.id) = 0 AND g.total_distance > 0 THEN '⚠️ NO WORKOUTS BUT HAS DISTANCE'
    ELSE '✅ OK'
  END as status
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id
GROUP BY g.id, g.name, g.type, g.starting_distance, g.total_distance
HAVING (COUNT(w.id) > 0 AND g.total_distance = 0) 
    OR (COUNT(w.id) = 0 AND g.total_distance > 0)
ORDER BY workout_count DESC;

-- ============================================================================
-- QUERY 8: Summary statistics
-- ============================================================================
SELECT 
  'Gear Items' as metric,
  COUNT(*)::text as value
FROM gear
WHERE retired = false

UNION ALL

SELECT 
  'Gear with Workouts' as metric,
  COUNT(DISTINCT gear_id)::text as value
FROM workouts
WHERE gear_id IS NOT NULL

UNION ALL

SELECT 
  'Total Distance Tracked (miles)' as metric,
  ROUND(SUM(total_distance) / 1609.34, 1)::text as value
FROM gear
WHERE retired = false

UNION ALL

SELECT 
  'Workouts with Gear' as metric,
  COUNT(*)::text as value
FROM workouts
WHERE gear_id IS NOT NULL

UNION ALL

SELECT 
  'Completed Workouts with Gear' as metric,
  COUNT(*)::text as value
FROM workouts
WHERE gear_id IS NOT NULL AND workout_status = 'completed';
