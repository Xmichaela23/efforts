/*
  # Create workouts table

  1. New Tables
    - `workouts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `name` (text, workout name)
      - `type` (text, workout type: run, ride, swim, strength, mobility)
      - `date` (date, scheduled date)
      - `duration` (integer, duration in seconds)
      - `description` (text, workout description)
      - `usercomments` (text, user notes)
      - `completedmanually` (boolean, manually marked complete)
      - `workout_status` (text, status: planned, completed, skipped, in_progress)
      - `intervals` (jsonb, interval data)
      - `strength_exercises` (jsonb, strength exercise data)
      - `garmin_data` (jsonb, imported Garmin data)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `workouts` table
    - Add policies for users to manage their own workouts
*/

-- Create workouts table
CREATE TABLE IF NOT EXISTS workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('run', 'ride', 'swim', 'strength', 'mobility')),
  date date NOT NULL,
  duration integer DEFAULT 0,
  description text DEFAULT '',
  usercomments text DEFAULT '',
  completedmanually boolean DEFAULT false,
  workout_status text DEFAULT 'planned' CHECK (workout_status IN ('planned', 'completed', 'skipped', 'in_progress')),
  intervals jsonb DEFAULT '[]'::jsonb,
  strength_exercises jsonb DEFAULT '[]'::jsonb,
  garmin_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;

-- Create policies
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

-- Add updated_at trigger
CREATE TRIGGER update_workouts_updated_at
  BEFORE UPDATE ON workouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
CREATE INDEX IF NOT EXISTS idx_workouts_type ON workouts(type);
CREATE INDEX IF NOT EXISTS idx_workouts_status ON workouts(workout_status);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, date);