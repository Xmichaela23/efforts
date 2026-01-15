-- Check where RPE values are coming from
-- Run this in Supabase SQL Editor

-- 1. Count workouts with RPE set
SELECT 
  type,
  workout_status,
  COUNT(*) as total,
  COUNT(CASE WHEN rpe IS NOT NULL THEN 1 END) as with_rpe,
  COUNT(CASE WHEN workout_metadata->>'session_rpe' IS NOT NULL THEN 1 END) as with_metadata_rpe
FROM workouts
WHERE workout_status = 'completed'
  AND type IN ('run', 'ride')
  AND date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY type, workout_status
ORDER BY type, workout_status;

-- 2. Show sample workouts with RPE and their source
SELECT 
  id,
  type,
  name,
  date,
  rpe,
  workout_metadata->>'session_rpe' as metadata_session_rpe,
  source,
  garmin_activity_id,
  strava_activity_id,
  created_at,
  updated_at
FROM workouts
WHERE workout_status = 'completed'
  AND type IN ('run', 'ride')
  AND date >= CURRENT_DATE - INTERVAL '30 days'
  AND (rpe IS NOT NULL OR workout_metadata->>'session_rpe' IS NOT NULL)
ORDER BY date DESC
LIMIT 20;

-- 3. Check if RPE was set recently (might indicate auto-setting)
SELECT 
  DATE(updated_at) as update_date,
  COUNT(*) as workouts_updated,
  COUNT(CASE WHEN rpe IS NOT NULL THEN 1 END) as with_rpe
FROM workouts
WHERE workout_status = 'completed'
  AND type IN ('run', 'ride')
  AND date >= CURRENT_DATE - INTERVAL '30 days'
  AND updated_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(updated_at)
ORDER BY update_date DESC;
