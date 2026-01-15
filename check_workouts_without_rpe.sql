-- Find completed runs/rides from past 7 days without RPE
SELECT 
  id,
  type,
  name,
  date,
  rpe,
  feedback_dismissed_at,
  workout_status,
  CASE 
    WHEN rpe IS NULL AND feedback_dismissed_at IS NULL THEN '✅ Should show popup'
    WHEN rpe IS NOT NULL THEN '⏭️ Has RPE - no popup'
    WHEN feedback_dismissed_at IS NOT NULL THEN '⏭️ Dismissed - no popup'
    ELSE '❓ Unknown'
  END as status
FROM workouts
WHERE workout_status = 'completed'
  AND type IN ('run', 'ride')
  AND date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC, created_at DESC
LIMIT 20;
