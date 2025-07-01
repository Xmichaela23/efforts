/*
  # Create routines table for workout templates

  1. New Tables
    - `routines`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `name` (text, routine name)
      - `type` (text, routine type: run, ride, swim, strength, mobility)
      - `description` (text, routine description)
      - `template_data` (jsonb, template structure)
      - `is_public` (boolean, shareable routine)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `routines` table
    - Add policies for users to manage their own routines
    - Add policy for reading public routines
*/

-- Create routines table
CREATE TABLE IF NOT EXISTS routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('run', 'ride', 'swim', 'strength', 'mobility')),
  description text DEFAULT '',
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own routines"
  ON routines
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read public routines"
  ON routines
  FOR SELECT
  TO authenticated
  USING (is_public = true);

CREATE POLICY "Users can insert own routines"
  ON routines
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routines"
  ON routines
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own routines"
  ON routines
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_routines_user_id ON routines(user_id);
CREATE INDEX IF NOT EXISTS idx_routines_type ON routines(type);
CREATE INDEX IF NOT EXISTS idx_routines_public ON routines(is_public) WHERE is_public = true;