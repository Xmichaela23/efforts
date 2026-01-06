-- Add RPE and feeling columns to workouts table for post-workout feedback
-- gear_id already exists from gear table migration

-- RPE (Rate of Perceived Exertion) - 1 to 10 scale
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS rpe INTEGER CHECK (rpe >= 1 AND rpe <= 10);

-- Feeling - subjective post-workout state
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS feeling TEXT CHECK (feeling IN ('great', 'good', 'ok', 'tired', 'exhausted'));

-- Index for querying workouts by RPE (useful for training load analysis)
CREATE INDEX IF NOT EXISTS workouts_rpe_idx ON workouts(rpe) WHERE rpe IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN workouts.rpe IS 'Rate of Perceived Exertion (1-10 scale). Optional, captured post-workout.';
COMMENT ON COLUMN workouts.feeling IS 'Subjective post-workout feeling: great, good, ok, tired, exhausted. Optional.';

