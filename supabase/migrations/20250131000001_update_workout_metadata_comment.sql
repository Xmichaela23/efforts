-- Update workout_metadata comment to include new pilates/yoga fields
-- studio_name and teacher_rating

COMMENT ON COLUMN public.workouts.workout_metadata IS 
'Unified metadata: { 
  session_rpe?: number, 
  notes?: string, 
  readiness?: { energy, soreness, sleep },
  session_type?: PilatesYogaSessionType,
  session_feeling?: SessionFeeling,
  environment?: Environment,
  is_heated?: boolean,
  instructor?: string,
  focus_area?: FocusArea[],
  studio_name?: string,
  teacher_rating?: number (1-10)
}';

