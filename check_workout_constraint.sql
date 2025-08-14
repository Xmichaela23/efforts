-- Check current workout type constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'workouts'::regclass AND conname = 'workouts_type_check';

-- If no constraint exists, check what types are currently in the table
SELECT DISTINCT type FROM workouts ORDER BY type;
