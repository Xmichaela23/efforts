-- Check which workouts are dismissed and why
SELECT 
  id,
  type,
  name,
  date,
  rpe,
  feedback_dismissed_at,
  workout_status,
  created_at,
  updated_at,
  CASE 
    WHEN feedback_dismissed_at IS NOT NULL THEN '✅ Dismissed'
    WHEN rpe IS NOT NULL THEN '✅ Has RPE'
    WHEN date < CURRENT_DATE - INTERVAL '7 days' THEN '⏭️ Too old'
    ELSE '✅ Should show popup'
  END as status
FROM workouts
WHERE workout_status = 'completed'
  AND type IN ('run', 'ride')
  AND date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC, created_at DESC
LIMIT 20;
