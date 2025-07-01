/*
  # Fix workouts table structure

  1. Schema Changes
    - Add missing columns to workouts table to match the expected structure
    - Add user_id column with proper foreign key relationship
    - Update RLS policies to work with user_id

  2. Data Migration
    - For development: assign existing workouts to authenticated users
    - Enable proper RLS security
*/

-- First, let's add the missing user_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE workouts ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add other missing columns that might be needed
DO $$
BEGIN
  -- Add distance column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'distance'
  ) THEN
    ALTER TABLE workouts ADD COLUMN distance numeric;
  END IF;

  -- Add elapsed_time column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'elapsed_time'
  ) THEN
    ALTER TABLE workouts ADD COLUMN elapsed_time integer;
  END IF;

  -- Add moving_time column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'moving_time'
  ) THEN
    ALTER TABLE workouts ADD COLUMN moving_time integer;
  END IF;

  -- Add avg_speed column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'avg_speed'
  ) THEN
    ALTER TABLE workouts ADD COLUMN avg_speed numeric;
  END IF;

  -- Add max_speed column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'max_speed'
  ) THEN
    ALTER TABLE workouts ADD COLUMN max_speed numeric;
  END IF;

  -- Add avg_pace column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'avg_pace'
  ) THEN
    ALTER TABLE workouts ADD COLUMN avg_pace numeric;
  END IF;

  -- Add avg_heart_rate column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'avg_heart_rate'
  ) THEN
    ALTER TABLE workouts ADD COLUMN avg_heart_rate integer;
  END IF;

  -- Add max_heart_rate column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'max_heart_rate'
  ) THEN
    ALTER TABLE workouts ADD COLUMN max_heart_rate integer;
  END IF;

  -- Add hrv column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'hrv'
  ) THEN
    ALTER TABLE workouts ADD COLUMN hrv numeric;
  END IF;

  -- Add avg_power column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'avg_power'
  ) THEN
    ALTER TABLE workouts ADD COLUMN avg_power integer;
  END IF;

  -- Add max_power column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'max_power'
  ) THEN
    ALTER TABLE workouts ADD COLUMN max_power integer;
  END IF;

  -- Add normalized_power column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'normalized_power'
  ) THEN
    ALTER TABLE workouts ADD COLUMN normalized_power integer;
  END IF;

  -- Add avg_cadence column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'avg_cadence'
  ) THEN
    ALTER TABLE workouts ADD COLUMN avg_cadence integer;
  END IF;

  -- Add max_cadence column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'max_cadence'
  ) THEN
    ALTER TABLE workouts ADD COLUMN max_cadence integer;
  END IF;

  -- Add elevation_gain column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'elevation_gain'
  ) THEN
    ALTER TABLE workouts ADD COLUMN elevation_gain integer;
  END IF;

  -- Add elevation_loss column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'elevation_loss'
  ) THEN
    ALTER TABLE workouts ADD COLUMN elevation_loss integer;
  END IF;

  -- Add calories column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'calories'
  ) THEN
    ALTER TABLE workouts ADD COLUMN calories integer;
  END IF;

  -- Add tss column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'tss'
  ) THEN
    ALTER TABLE workouts ADD COLUMN tss numeric;
  END IF;

  -- Add intensity_factor column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'intensity_factor'
  ) THEN
    ALTER TABLE workouts ADD COLUMN intensity_factor numeric;
  END IF;

  -- Add heart_rate_zones column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'heart_rate_zones'
  ) THEN
    ALTER TABLE workouts ADD COLUMN heart_rate_zones jsonb;
  END IF;

  -- Add time_series_data column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'time_series_data'
  ) THEN
    ALTER TABLE workouts ADD COLUMN time_series_data jsonb;
  END IF;

  -- Add swim_data column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'swim_data'
  ) THEN
    ALTER TABLE workouts ADD COLUMN swim_data jsonb;
  END IF;

  -- Add coach_explanation column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'coach_explanation'
  ) THEN
    ALTER TABLE workouts ADD COLUMN coach_explanation text;
  END IF;

  -- Add completedmanually column if missing (note: this matches the schema)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'completedmanually'
  ) THEN
    ALTER TABLE workouts ADD COLUMN completedmanually boolean DEFAULT false;
  END IF;
END $$;

-- For development: assign existing workouts to the first user if any exist
-- This is safe for development but would need careful handling in production
UPDATE workouts 
SET user_id = (SELECT id FROM users LIMIT 1)
WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM users LIMIT 1);

-- Make user_id NOT NULL after migration (only if we have users)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users LIMIT 1) THEN
    ALTER TABLE workouts ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- Ensure RLS is enabled
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can read own workouts" ON workouts;
DROP POLICY IF EXISTS "Users can insert own workouts" ON workouts;
DROP POLICY IF EXISTS "Users can update own workouts" ON workouts;
DROP POLICY IF EXISTS "Users can delete own workouts" ON workouts;

-- Create proper RLS policies
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
CREATE INDEX IF NOT EXISTS idx_workouts_type ON workouts(type);
CREATE INDEX IF NOT EXISTS idx_workouts_status ON workouts(workout_status);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, date);