-- Test script to verify the gear distance trigger is working
-- This script will test the trigger by simulating workout updates

-- Step 1: Find a workout with gear_id set to use for testing
DO $$
DECLARE
  test_workout_id uuid;
  test_gear_id uuid;
  gear_before numeric;
  gear_after numeric;
  workout_distance_km numeric;
BEGIN
  -- Find a completed workout with gear_id set
  SELECT id, gear_id, distance 
  INTO test_workout_id, test_gear_id, workout_distance_km
  FROM workouts 
  WHERE gear_id IS NOT NULL 
    AND workout_status = 'completed'
    AND distance IS NOT NULL
    AND distance > 0
  LIMIT 1;
  
  IF test_workout_id IS NULL THEN
    RAISE NOTICE 'No workout found with gear_id set. Creating a test scenario...';
    
    -- Try to find any gear item
    SELECT id INTO test_gear_id FROM gear LIMIT 1;
    
    IF test_gear_id IS NULL THEN
      RAISE NOTICE 'No gear items found. Cannot test trigger.';
      RETURN;
    END IF;
    
    -- Find any completed workout
    SELECT id, distance 
    INTO test_workout_id, workout_distance_km
    FROM workouts 
    WHERE workout_status = 'completed'
      AND distance IS NOT NULL
      AND distance > 0
    LIMIT 1;
    
    IF test_workout_id IS NULL THEN
      RAISE NOTICE 'No completed workouts found. Cannot test trigger.';
      RETURN;
    END IF;
    
    -- Set gear_id on this workout (this should trigger the update)
    UPDATE workouts 
    SET gear_id = test_gear_id 
    WHERE id = test_workout_id;
    
    RAISE NOTICE 'Set gear_id % on workout % for testing', test_gear_id, test_workout_id;
  END IF;
  
  -- Get gear total_distance before
  SELECT total_distance INTO gear_before
  FROM gear
  WHERE id = test_gear_id;
  
  RAISE NOTICE '=== BEFORE TEST ===';
  RAISE NOTICE 'Gear ID: %', test_gear_id;
  RAISE NOTICE 'Gear total_distance (meters): %', gear_before;
  RAISE NOTICE 'Gear total_distance (miles): %', (gear_before / 1609.34);
  RAISE NOTICE 'Workout ID: %', test_workout_id;
  RAISE NOTICE 'Workout distance (km): %', workout_distance_km;
  
  -- Calculate expected total_distance
  DECLARE
    expected_total numeric;
    current_sum numeric;
  BEGIN
    SELECT COALESCE(SUM(distance * 1000), 0) INTO current_sum
    FROM workouts 
    WHERE gear_id = test_gear_id AND workout_status = 'completed';
    
    SELECT starting_distance + current_sum INTO expected_total
    FROM gear
    WHERE id = test_gear_id;
    
    RAISE NOTICE 'Expected total_distance (meters): %', expected_total;
    RAISE NOTICE 'Expected total_distance (miles): %', (expected_total / 1609.34);
    
    -- Test 1: Update workout_status (should trigger recalculation)
    RAISE NOTICE '';
    RAISE NOTICE '=== TEST 1: Updating workout_status ===';
    UPDATE workouts 
    SET workout_status = 'completed'  -- Set to same value to trigger
    WHERE id = test_workout_id;
    
    -- Wait a moment for trigger to fire
    PERFORM pg_sleep(0.1);
    
    -- Get gear total_distance after
    SELECT total_distance INTO gear_after
    FROM gear
    WHERE id = test_gear_id;
    
    IF gear_after = expected_total THEN
      RAISE NOTICE '✅ SUCCESS: Gear total_distance updated correctly!';
      RAISE NOTICE 'After: % meters (% miles)', gear_after, (gear_after / 1609.34);
    ELSE
      RAISE NOTICE '❌ FAILED: Gear total_distance not updated correctly';
      RAISE NOTICE 'Expected: % meters, Got: % meters', expected_total, gear_after;
    END IF;
    
    -- Test 2: Update distance (should trigger recalculation)
    RAISE NOTICE '';
    RAISE NOTICE '=== TEST 2: Updating workout distance ===';
    DECLARE
      original_distance numeric;
      new_distance numeric;
      gear_before_test2 numeric;
      gear_after_test2 numeric;
      expected_after_test2 numeric;
    BEGIN
      SELECT distance INTO original_distance
      FROM workouts
      WHERE id = test_workout_id;
      
      -- Temporarily change distance
      new_distance := original_distance + 0.1;  -- Add 0.1 km
      UPDATE workouts 
      SET distance = new_distance
      WHERE id = test_workout_id;
      
      PERFORM pg_sleep(0.1);
      
      SELECT total_distance INTO gear_after_test2
      FROM gear
      WHERE id = test_gear_id;
      
      -- Calculate expected with new distance
      SELECT starting_distance + COALESCE(SUM(distance * 1000), 0) INTO expected_after_test2
      FROM gear g
      LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
      WHERE g.id = test_gear_id
      GROUP BY g.starting_distance;
      
      IF ABS(gear_after_test2 - expected_after_test2) < 1 THEN  -- Allow 1 meter tolerance
        RAISE NOTICE '✅ SUCCESS: Gear total_distance updated when distance changed!';
        RAISE NOTICE 'After: % meters (% miles)', gear_after_test2, (gear_after_test2 / 1609.34);
      ELSE
        RAISE NOTICE '❌ FAILED: Gear total_distance not updated when distance changed';
        RAISE NOTICE 'Expected: % meters, Got: % meters', expected_after_test2, gear_after_test2;
      END IF;
      
      -- Restore original distance
      UPDATE workouts 
      SET distance = original_distance
      WHERE id = test_workout_id;
      
      PERFORM pg_sleep(0.1);
    END;
  END;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL STATE ===';
  SELECT total_distance INTO gear_after
  FROM gear
  WHERE id = test_gear_id;
  
  RAISE NOTICE 'Gear total_distance (meters): %', gear_after;
  RAISE NOTICE 'Gear total_distance (miles): %', (gear_after / 1609.34);
  
END $$;

-- Show summary of all gear with their calculated totals
SELECT 
  g.id,
  g.name,
  g.type,
  g.starting_distance,
  g.total_distance as current_total_distance,
  (g.total_distance / 1609.34) as current_miles,
  COALESCE(SUM(w.distance * 1000), 0) as calculated_from_workouts,
  (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0)) as expected_total_distance,
  (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0)) / 1609.34 as expected_miles,
  CASE 
    WHEN ABS(g.total_distance - (g.starting_distance + COALESCE(SUM(w.distance * 1000), 0))) < 1 
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status,
  COUNT(w.id) as workout_count
FROM gear g
LEFT JOIN workouts w ON w.gear_id = g.id AND w.workout_status = 'completed'
GROUP BY g.id, g.name, g.type, g.starting_distance, g.total_distance
ORDER BY g.name;
