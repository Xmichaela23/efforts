-- Why a planned session was skipped: sick, travel, rest, life, swapped
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS skip_reason text;
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS skip_note text;
