/*
  # Add user_id to existing workouts and update schema

  1. Schema Changes
    - Add user_id column to workouts table if it doesn't exist
    - Update existing workouts to use a default user (for development)
    - Make user_id NOT NULL after data migration

  2. Data Migration
    - For development: assign all existing workouts to the first user
    - In production: this would need careful handling of existing data
*/

-- Check if user_id column exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'user_id'
  ) THEN
    -- Add user_id column as nullable first
    ALTER TABLE workouts ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
    
    -- For development: assign existing workouts to first user if any exist
    -- In production, you'd want a more sophisticated migration strategy
    UPDATE workouts 
    SET user_id = (SELECT id FROM users LIMIT 1)
    WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users LIMIT 1);
    
    -- Make user_id NOT NULL after migration
    ALTER TABLE workouts ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- Recreate the RLS policies with proper user_id checks if they don't exist
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can read own workouts" ON workouts;
  DROP POLICY IF EXISTS "Users can insert own workouts" ON workouts;
  DROP POLICY IF EXISTS "Users can update own workouts" ON workouts;
  DROP POLICY IF EXISTS "Users can delete own workouts" ON workouts;
  
  -- Recreate policies
  CREATE POLICY "Users can read own workouts"
    ON workouts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

  CREATE POLICY "Users can insert own workouts"
    ON workouts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update own workouts"
    ON workouts
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can delete own workouts"
    ON workouts
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
END $$;