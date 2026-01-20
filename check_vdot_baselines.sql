-- Check what VDOT/Effort Score and paces are stored in user_baselines
SELECT 
  user_id,
  effort_score,
  effort_score_status,
  effort_paces,
  effort_paces_source,
  effort_updated_at,
  performance_numbers->>'easyPace' as legacy_easy_pace,
  performance_numbers->>'fiveK_pace' as legacy_5k_pace
FROM user_baselines
WHERE user_id = (SELECT user_id FROM plans WHERE id = 'ef25e4bf-c7e2-48a5-9412-5cbe2b148e70' LIMIT 1)
  OR user_id IN (SELECT DISTINCT user_id FROM plans WHERE name LIKE '%LA Marathon%' LIMIT 1);

-- Check what paces are being used in materialized workouts
SELECT 
  pw.id,
  pw.name,
  pw.date,
  pw.steps_preset,
  (pw.computed->'steps'->0->>'paceTarget') as first_step_pace,
  (pw.computed->'steps'->0->>'pace_range') as first_step_pace_range
FROM planned_workouts pw
WHERE pw.training_plan_id = 'ef25e4bf-c7e2-48a5-9412-5cbe2b148e70'
  AND pw.type = 'run'
  AND pw.name = 'Easy Run'
ORDER BY pw.date
LIMIT 5;
