-- Clear analysis data for workout f1b3e4e8-8e30-4332-9ef5-0a22fc0abf52
-- This will force fresh analysis to be generated with the new pace adherence formula

UPDATE public.workouts 
SET 
  workout_analysis = NULL,
  analysis_status = 'pending',
  analyzed_at = NULL,
  analysis_error = NULL
WHERE id = 'f1b3e4e8-8e30-4332-9ef5-0a22fc0abf52';

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
WHERE id = 'f1b3e4e8-8e30-4332-9ef5-0a22fc0abf52';






