-- Complete gear distance fix script
-- This script: checks trigger, tests it, and backfills historical data
-- Run this in Supabase SQL Editor

-- ========================================
-- STEP 1: Check if trigger exists
-- ========================================
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Trigger exists'
    ELSE '❌ Trigger NOT found - migration may not have been applied'
  END as trigger_status,
  trigger_name,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'update_gear_distance_trigger'
GROUP BY trigger_name, event_object_table, action_timing;

-- ========================================
-- STEP 2: Check if function exists
-- ========================================
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Function exists'
    ELSE '❌ Function NOT found'
  END as function_status,
  routine_name
FROM information_schema.routines
WHERE routine_name = 'update_gear_distance'
GROUP BY routine_name;

-- ========================================
-- STEP 3: Show current state (BEFORE fix)
-- ========================================
SELECT 
  g.id,
  g.name,
  g.type,
  g.starting_distance,
  g.total_distance as current_total_distance,
  (g.total_distance / 1609.34) as current_miles,
  COALESCE(SUM(w.distance * 1000), 0) as calculated_from_workouts,
  (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0)) as expected_total_distance,
  CASE 
    WHEN ABS(g.total_distance - (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0))) < 1 
    THEN '✅ Match'
    ELSE '❌ Needs Fix'
  END as status,
  COUNT(w.id) as workout_count,
  MIN(w.date) as earliest_workout,
  MAX(w.date) as latest_workout
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
GROUP BY g.id, g.name, g.type, g.starting_distance, g.total_distance
ORDER BY g.name;

-- ========================================
-- STEP 4: Backfill all gear distances
-- ========================================
-- This includes ALL historical workouts from when gear_id was first set
-- No date filter - includes everything from the beginning
UPDATE gear
SET total_distance = starting_distance + (
  SELECT COALESCE(SUM(distance * 1000), 0)  -- Convert KM to meters
  FROM workouts 
  WHERE gear_id = gear.id AND workout_status = 'completed'
),
updated_at = now();

-- Show what was updated
SELECT 
  COUNT(*) as gear_items_updated,
  SUM(CASE WHEN total_distance > starting_distance THEN 1 ELSE 0 END) as gear_with_workouts
FROM gear;

-- ========================================
-- STEP 5: Test trigger (if workout exists)
-- ========================================
DO $$
DECLARE
  test_workout_id uuid;
  test_gear_id uuid;
  gear_before numeric;
  gear_after numeric;
  expected_total numeric;
BEGIN
  -- Find a completed workout with gear_id
  SELECT w.id, w.gear_id 
  INTO test_workout_id, test_gear_id
  FROM workouts w
  WHERE w.gear_id IS NOT NULL 
    AND w.workout_status = 'completed'
    AND w.distance IS NOT NULL
    AND w.distance > 0
  LIMIT 1;
  
  IF test_workout_id IS NOT NULL THEN
    -- Get current gear total
    SELECT total_distance INTO gear_before
    FROM gear
    WHERE id = test_gear_id;
    
    -- Calculate expected
    SELECT starting_distance + COALESCE(SUM(distance * 1000), 0) INTO expected_total
    FROM gear g
    LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
    WHERE g.id = test_gear_id
    GROUP BY g.starting_distance;
    
    -- Trigger update by changing workout_status
    UPDATE workouts 
    SET workout_status = 'completed'
    WHERE id = test_workout_id;
    
    -- Wait for trigger
    PERFORM pg_sleep(0.2);
    
    -- Check result
    SELECT total_distance INTO gear_after
    FROM gear
    WHERE id = test_gear_id;
    
    IF ABS(gear_after - expected_total) < 1 THEN
      RAISE NOTICE '✅ Trigger test PASSED - gear distance updated correctly';
    ELSE
      RAISE NOTICE '❌ Trigger test FAILED - expected %, got %', expected_total, gear_after;
    END IF;
  ELSE
    RAISE NOTICE '⚠️  No workouts with gear_id found - cannot test trigger';
  END IF;
END $$;

-- ========================================
-- STEP 6: Show final state (AFTER fix)
-- ========================================
SELECT 
  g.id,
  g.name,
  g.type,
  g.starting_distance,
  g.total_distance as total_distance_meters,
  (g.total_distance / 1609.34) as total_distance_miles,
  COUNT(w.id) as workout_count,
  COALESCE(SUM(w.distance), 0) as total_km_from_workouts,
  COALESCE(SUM(w.distance * 1000), 0) as total_meters_from_workouts,
  MIN(w.date) as first_workout_date,
  MAX(w.date) as last_workout_date,
  CASE 
    WHEN ABS(g.total_distance - (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0))) < 1 
    THEN '✅ Correct'
    ELSE '❌ Mismatch'
  END as verification_status
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
GROUP BY g.id, g.name, g.type, g.starting_distance, g.total_distance
ORDER BY g.total_distance DESC;

-- ========================================
-- SUMMARY
-- ========================================
SELECT 
  COUNT(*) as total_gear_items,
  SUM(CASE WHEN total_distance > starting_distance THEN 1 ELSE 0 END) as gear_with_workouts,
  SUM(total_distance) as total_distance_all_gear_meters,
  (SUM(total_distance) / 1609.34) as total_distance_all_gear_miles,
  (SELECT COUNT(*) FROM workouts WHERE gear_id IS NOT NULL AND workout_status = 'completed') as total_workouts_with_gear
FROM gear;
