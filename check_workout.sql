-- Get the most recent running workout from Oct 31
SELECT 
  id,
  type,
  date,
  analysis_status,
  analyzed_at,
  jsonb_pretty(workout_analysis) as analysis_structure
FROM workouts 
WHERE type IN ('run', 'running')
  AND date = '2024-10-31'
ORDER BY created_at DESC
LIMIT 1;
