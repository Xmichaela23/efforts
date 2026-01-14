-- Clear feedback dismissals for recent workouts (for testing)
-- This allows the popup to show again for workouts that were previously dismissed

UPDATE workouts
SET feedback_dismissed_at = NULL
WHERE workout_status = 'completed'
  AND type IN ('run', 'ride')
  AND rpe IS NULL
  AND feedback_dismissed_at IS NOT NULL
  AND date >= CURRENT_DATE - INTERVAL '7 days';

-- Show what was cleared
SELECT 
  id,
  type,
  name,
  date,
  rpe,
  feedback_dismissed_at as was_dismissed,
  'Cleared' as status
FROM workouts
WHERE workout_status = 'completed'
  AND type IN ('run', 'ride')
  AND rpe IS NULL
  AND date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC;
