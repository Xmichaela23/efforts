-- Step 3: nullable FK from exercise_log to exercises (backfill via scripts/backfill-exercise-ids.ts)
-- NOT NULL on exercise_id is deferred to Step 8.

ALTER TABLE exercise_log
  ADD COLUMN IF NOT EXISTS exercise_id UUID REFERENCES exercises (id);

CREATE INDEX IF NOT EXISTS idx_exercise_log_exercise_id ON exercise_log (exercise_id);
