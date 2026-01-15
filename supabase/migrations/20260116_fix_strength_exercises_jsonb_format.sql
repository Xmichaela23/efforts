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
-- These are DOUBLE-ENCODED: stored as JSONB string containing a JSON string
-- Example: JSONB string value is "[{\"id\":...}]" which needs to be parsed to get [{"id":...}]
-- 
-- Use a function to safely extract and parse
CREATE OR REPLACE FUNCTION fix_jsonb_string_to_array(input_jsonb jsonb)
RETURNS jsonb AS $$
DECLARE
  text_value text;
  parsed_jsonb jsonb;
BEGIN
  -- If it's already an array, return as-is
  IF jsonb_typeof(input_jsonb) = 'array' THEN
    RETURN input_jsonb;
  END IF;
  
  -- If it's not a string, return empty array
  IF jsonb_typeof(input_jsonb) != 'string' THEN
    RETURN '[]'::jsonb;
  END IF;
  
  -- Handle empty/null cases
  IF input_jsonb::text IN ('null', '', '""', '"null"', '"[]"', '[]') THEN
    RETURN '[]'::jsonb;
  END IF;
  
  -- Extract the text value from JSONB string
  -- jsonb_extract_path_text with empty path gets the string value
  text_value := jsonb_extract_path_text(input_jsonb, '');
  
  -- If extraction failed or empty, try direct text conversion
  IF text_value IS NULL OR text_value = '' THEN
    -- Remove outer quotes from text representation
    text_value := TRIM(BOTH '"' FROM input_jsonb::text);
  END IF;
  
  -- Try to parse the text as JSONB
  BEGIN
    parsed_jsonb := text_value::jsonb;
    
    -- If result is still a string, parse again (double-encoded)
    IF jsonb_typeof(parsed_jsonb) = 'string' THEN
      parsed_jsonb := jsonb_extract_path_text(parsed_jsonb, '')::jsonb;
    END IF;
    
    -- Verify we got an array
    IF jsonb_typeof(parsed_jsonb) = 'array' THEN
      RETURN parsed_jsonb;
    ELSE
      RETURN '[]'::jsonb;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Parsing failed, return empty array
    RETURN '[]'::jsonb;
  END;
END;
$$ LANGUAGE plpgsql;

-- Apply the fix
UPDATE workouts
SET strength_exercises = fix_jsonb_string_to_array(strength_exercises)
WHERE type = 'strength'
  AND workout_status = 'completed'
  AND jsonb_typeof(strength_exercises) = 'string';

-- Clean up the function
DROP FUNCTION IF EXISTS fix_jsonb_string_to_array(jsonb);

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
