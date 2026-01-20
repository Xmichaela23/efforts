-- Check what tokens are actually stored for easy runs showing 50 miles
SELECT 
  id,
  name,
  type,
  date,
  steps_preset,
  computed->>'steps' as computed_steps_json,
  jsonb_array_length(computed->'steps') as step_count
FROM planned_workouts
WHERE name = 'Easy Run'
  AND type = 'run'
  AND steps_preset IS NOT NULL
ORDER BY date
LIMIT 10;

-- Check a specific easy run that shows 50 miles
SELECT 
  id,
  name,
  date,
  steps_preset,
  jsonb_pretty(computed->'steps') as computed_steps
FROM planned_workouts
WHERE name = 'Easy Run'
  AND type = 'run'
  AND steps_preset::text LIKE '%50%'
ORDER BY date
LIMIT 5;
