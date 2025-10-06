-- Clear computed steps for strength workouts to force re-materialization with correct grouped structure
-- This will trigger get-week to call materialize-plan and regenerate the steps correctly

UPDATE planned_workouts
SET computed = NULL
WHERE type = 'strength'
  AND computed IS NOT NULL;

-- Verify the update
SELECT 
  id,
  date,
  type,
  jsonb_array_length(COALESCE(computed->'steps', '[]'::jsonb)) as steps_count,
  CASE 
    WHEN computed IS NULL THEN 'CLEARED - will re-materialize'
    ELSE 'HAS DATA'
  END as status
FROM planned_workouts
WHERE type = 'strength'
ORDER BY date DESC
LIMIT 10;
