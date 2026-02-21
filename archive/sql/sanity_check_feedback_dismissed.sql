-- Sanity check for feedback_dismissed_at migration
-- Run this in Supabase SQL Editor

-- 1. Check if column exists
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'workouts' 
  AND column_name = 'feedback_dismissed_at';

-- 2. Check if index exists
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'workouts' 
  AND indexname = 'idx_workouts_feedback_dismissed_at';

-- 3. Check column comment
SELECT 
  col_description('workouts'::regclass, 
    (SELECT ordinal_position 
     FROM information_schema.columns 
     WHERE table_name = 'workouts' 
       AND column_name = 'feedback_dismissed_at'));

-- 4. Count workouts that could use this (completed runs/rides without RPE)
SELECT 
  COUNT(*) as workouts_needing_feedback,
  COUNT(CASE WHEN feedback_dismissed_at IS NOT NULL THEN 1 END) as dismissed_count,
  COUNT(CASE WHEN feedback_dismissed_at IS NULL AND rpe IS NULL THEN 1 END) as pending_feedback
FROM workouts
WHERE workout_status = 'completed'
  AND type IN ('run', 'ride')
  AND rpe IS NULL;
