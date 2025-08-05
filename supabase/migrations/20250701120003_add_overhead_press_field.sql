/*
  # Add overheadPress1RM field to performance_numbers for strength baselines
  
  This migration ensures that all existing user_baselines records have the overheadPress1RM field
  in their performance_numbers JSONB column, even if it's null.
*/

-- Add overheadPress1RM field to performance_numbers for users who don't have it
UPDATE user_baselines
SET performance_numbers = jsonb_set(
  performance_numbers,
  '{overheadPress1RM}',
  'null',
  true
)
WHERE NOT (performance_numbers ? 'overheadPress1RM');

-- Update comment to document the new field
COMMENT ON COLUMN user_baselines.performance_numbers IS 'JSONB object containing performance metrics. Running: fiveK, easyPace, tenK, halfMarathon, marathon. Cycling: ftp, avgSpeed. Swimming: swimPace100, swim200Time, swim400Time. Strength: squat, deadlift, bench, overheadPress1RM.'; 