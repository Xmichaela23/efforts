-- Clear analysis data for workout 757fb441-0fdb-4c68-a3d6-dd4b66cf42a5
-- This will force fresh analysis to be generated with the refactored AI narrative module

UPDATE public.workouts 
SET 
  workout_analysis = NULL,
  analysis_status = 'pending',
  analyzed_at = NULL,
  analysis_error = NULL
WHERE id = '757fb441-0fdb-4c68-a3d6-dd4b66cf42a5';

-- Verify the clear worked
SELECT 
  id,
  type,
  date,
  workout_analysis IS NULL as analysis_cleared,
  analysis_status,
  analyzed_at,
  analysis_error
FROM public.workouts
WHERE id = '757fb441-0fdb-4c68-a3d6-dd4b66cf42a5';

