-- Add 'walk' as a valid workout type
ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_type_check;
ALTER TABLE workouts ADD CONSTRAINT workouts_type_check CHECK (type IN ('run', 'ride', 'swim', 'strength', 'walk', 'mobility'));

-- Verify the constraint was updated
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'workouts'::regclass AND conname = 'workouts_type_check';
