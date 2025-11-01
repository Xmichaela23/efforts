-- Check the workout_analysis structure for the Oct 31 running workout
SELECT 
  id,
  type,
  date,
  analysis_status,
  analyzed_at,
  -- Check if narrative_insights exists
  workout_analysis->'narrative_insights' as narrative_insights,
  -- Check the full structure
  jsonb_object_keys(workout_analysis) as analysis_keys
FROM workouts 
WHERE type IN ('run', 'running')
  AND date = '2024-10-31'
ORDER BY created_at DESC
LIMIT 1;

