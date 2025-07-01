/*
  # Create training plans table for structured training programs

  1. New Tables
    - `training_plans`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `name` (text, plan name)
      - `description` (text, plan description)
      - `plan_type` (text, type: custom, template, coach_assigned)
      - `start_date` (date, plan start date)
      - `end_date` (date, plan end date)
      - `plan_data` (jsonb, structured plan data)
      - `is_active` (boolean, currently active plan)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `training_plans` table
    - Add policies for users to manage their own training plans
*/

-- Create training_plans table
CREATE TABLE IF NOT EXISTS training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  plan_type text DEFAULT 'custom' CHECK (plan_type IN ('custom', 'template', 'coach_assigned')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  plan_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- Enable RLS
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own training plans"
  ON training_plans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own training plans"
  ON training_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own training plans"
  ON training_plans
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own training plans"
  ON training_plans
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_training_plans_updated_at
  BEFORE UPDATE ON training_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_training_plans_user_id ON training_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_training_plans_active ON training_plans(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_training_plans_dates ON training_plans(start_date, end_date);