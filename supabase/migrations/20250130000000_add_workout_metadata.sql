-- Add unified workout_metadata JSONB column
-- Single source of truth for session RPE, notes, and readiness data

DO $$ BEGIN
  BEGIN
    ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS workout_metadata jsonb DEFAULT '{}'::jsonb;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMENT ON COLUMN public.workouts.workout_metadata IS 'Unified metadata: { session_rpe?: number, notes?: string, readiness?: { energy, soreness, sleep } }';

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_workouts_metadata_rpe ON public.workouts USING gin ((workout_metadata->'session_rpe'));
CREATE INDEX IF NOT EXISTS idx_workouts_metadata_readiness ON public.workouts USING gin ((workout_metadata->'readiness'));

