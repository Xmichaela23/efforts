/*
  # Create workout data table for detailed metrics and time series data

  1. New Tables
    - `workout_data`
      - `id` (uuid, primary key)
      - `workout_id` (uuid, foreign key to workouts)
      - `user_id` (uuid, foreign key to users)
      - `data_type` (text, type of data: metrics, time_series, heart_rate_zones)
      - `data_source` (text, source: manual, garmin, strava, etc.)
      - `data_payload` (jsonb, the actual data)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `workout_data` table
    - Add policies for users to manage their own workout data
*/

-- Create workout_data table
CREATE TABLE IF NOT EXISTS workout_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid REFERENCES workouts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('metrics', 'time_series', 'heart_rate_zones', 'power_zones', 'lap_data')),
  data_source text DEFAULT 'manual' CHECK (data_source IN ('manual', 'garmin', 'strava', 'polar', 'suunto', 'wahoo')),
  data_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE workout_data ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own workout data"
  ON workout_data
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout data"
  ON workout_data
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout data"
  ON workout_data
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout data"
  ON workout_data
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workout_data_workout_id ON workout_data(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_data_user_id ON workout_data(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_data_type ON workout_data(data_type);
CREATE INDEX IF NOT EXISTS idx_workout_data_source ON workout_data(data_source);