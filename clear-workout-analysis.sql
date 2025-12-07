-- Clear analysis data for specific workout
-- This will force fresh analysis to be generated when the workout is re-analyzed

UPDATE public.workouts 
SET 
  workout_analysis = NULL,
  analysis_status = NULL,
  analyzed_at = NULL,
  analysis_error = NULL
WHERE id = 'ed4fc98f-27d6-4c69-bc28-fa529f44124a';

-- Verify the clear worked
SELECT 
  id,
  type,
  date,
  workout_analysis IS NULL as analysis_cleared,
  analysis_status,
  analyzed_at
FROM public.workouts
WHERE id = 'ed4fc98f-27d6-4c69-bc28-fa529f44124a';





