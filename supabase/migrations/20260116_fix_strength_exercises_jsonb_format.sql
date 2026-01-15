-- Fix systemic issue: strength_exercises stored as JSONB string instead of JSONB array
-- This migration converts all string-format strength_exercises to proper JSONB arrays

-- First, check how many need fixing
DO $$
DECLARE
  string_count INTEGER;
  array_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO string_count
  FROM workouts
  WHERE type = 'strength'
    AND workout_status = 'completed'
    AND jsonb_typeof(strength_exercises) = 'string';
  
  SELECT COUNT(*) INTO array_count
  FROM workouts
  WHERE type = 'strength'
    AND workout_status = 'completed'
    AND jsonb_typeof(strength_exercises) = 'array';
  
  RAISE NOTICE 'Found % strength workouts stored as string, % as array', string_count, array_count;
END $$;

-- Fix all strength workouts with string-format exercises
-- Convert JSONB string to JSONB array by parsing it
UPDATE workouts
SET strength_exercises = 
  CASE 
    WHEN jsonb_typeof(strength_exercises) = 'string' THEN
      -- Parse the string to get the actual JSONB value
      strength_exercises::jsonb
    ELSE
      -- Already correct format, keep as-is
      strength_exercises
  END
WHERE type = 'strength'
  AND workout_status = 'completed'
  AND jsonb_typeof(strength_exercises) = 'string';

-- Do the same for mobility_exercises
UPDATE workouts
SET mobility_exercises = 
  CASE 
    WHEN jsonb_typeof(mobility_exercises) = 'string' THEN
      mobility_exercises::jsonb
    ELSE
      mobility_exercises
  END
WHERE type IN ('mobility', 'strength')
  AND workout_status = 'completed'
  AND jsonb_typeof(mobility_exercises) = 'string';

-- Verify the fix
DO $$
DECLARE
  string_count_after INTEGER;
  array_count_after INTEGER;
BEGIN
  SELECT COUNT(*) INTO string_count_after
  FROM workouts
  WHERE type = 'strength'
    AND workout_status = 'completed'
    AND jsonb_typeof(strength_exercises) = 'string';
  
  SELECT COUNT(*) INTO array_count_after
  FROM workouts
  WHERE type = 'strength'
    AND workout_status = 'completed'
    AND jsonb_typeof(strength_exercises) = 'array';
  
  RAISE NOTICE 'After fix: % as string, % as array', string_count_after, array_count_after;
  
  IF string_count_after > 0 THEN
    RAISE WARNING 'Some workouts still stored as string - may need manual review';
  END IF;
END $$;
