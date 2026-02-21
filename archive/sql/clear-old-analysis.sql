-- Clear old analysis data with fallback language
-- This will force fresh analysis to be generated

-- Clear workout_analysis for all workouts
UPDATE public.workouts 
SET workout_analysis = NULL 
WHERE workout_analysis IS NOT NULL;

-- Verify the clear worked
SELECT 
  COUNT(*) as total_workouts,
  COUNT(workout_analysis) as workouts_with_analysis
FROM public.workouts;
