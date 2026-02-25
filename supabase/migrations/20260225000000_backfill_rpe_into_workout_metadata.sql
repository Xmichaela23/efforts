-- Phase 1: Backfill rpe into workout_metadata.session_rpe (smart server, dumb client)
-- 1) Copy legacy rpe column into workout_metadata where session_rpe is missing.
-- 2) Trigger ensures future rpe updates also sync to workout_metadata.
-- Run: supabase db push (or apply via your migration flow)

-- Backfill existing rows
UPDATE workouts
SET workout_metadata = COALESCE(workout_metadata, '{}'::jsonb) || jsonb_build_object('session_rpe', rpe)
WHERE rpe IS NOT NULL
  AND (workout_metadata IS NULL OR workout_metadata->'session_rpe' IS NULL);

-- Trigger: sync rpe -> workout_metadata.session_rpe on INSERT/UPDATE
CREATE OR REPLACE FUNCTION sync_rpe_to_workout_metadata()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rpe IS NOT NULL THEN
    NEW.workout_metadata := COALESCE(NEW.workout_metadata, '{}'::jsonb) || jsonb_build_object('session_rpe', NEW.rpe);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workouts_sync_rpe_to_metadata ON workouts;
CREATE TRIGGER workouts_sync_rpe_to_metadata
  BEFORE INSERT OR UPDATE OF rpe ON workouts
  FOR EACH ROW
  WHEN (NEW.rpe IS NOT NULL)
  EXECUTE FUNCTION sync_rpe_to_workout_metadata();
