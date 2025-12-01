-- Check what names are stored for strength planned workouts
SELECT 
  id,
  name,
  type,
  date,
  workout_status,
  training_plan_id,
  week_number,
  day_number,
  workout_structure->>'title' as workout_structure_title,
  description
FROM planned_workouts
WHERE type = 'strength'
  AND workout_status = 'planned'
  AND date >= '2025-12-01'
ORDER BY date, day_number
LIMIT 10;

