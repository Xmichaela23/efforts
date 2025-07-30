/*
  # Add easyPace field to performance_numbers for running baselines
  
  This migration ensures that all existing user_baselines records have the easyPace field
  in their performance_numbers JSONB column, even if it's null.
*/

-- Add easyPace field to performance_numbers for users who don't have it
UPDATE user_baselines
SET performance_numbers = jsonb_set(
  performance_numbers,
  '{easyPace}',
  'null',
  true
)
WHERE NOT (performance_numbers ? 'easyPace');

-- Add comment to document the new field
COMMENT ON COLUMN user_baselines.performance_numbers IS 'JSONB object containing performance metrics. Running: fiveK, easyPace, tenK, halfMarathon, marathon. Cycling: ftp, avgSpeed. Swimming: swimPace100, swim200Time, swim400Time. Strength: squat, deadlift, bench.'; 