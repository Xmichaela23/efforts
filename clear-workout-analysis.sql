-- Clear workout analysis for workout e30b247d-90ea-4020-8950-db14830354a6
UPDATE public.workouts
SET
  workout_analysis = NULL,
  analysis_status = 'pending',
  analyzed_at = NULL,
  analysis_error = NULL
WHERE id = 'e30b247d-90ea-4020-8950-db14830354a6';

-- Verify the update
SELECT
  id,
  workout_analysis,
  analysis_status,
  analyzed_at,
  analysis_error
FROM public.workouts
WHERE id = 'e30b247d-90ea-4020-8950-db14830354a6';

