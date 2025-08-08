/*
  # Create user_baselines table for storing user fitness assessment data
  
  This migration creates the user_baselines table that was referenced in other migrations
  but never actually created. This table stores all user baseline data including
  performance numbers, personal details, training background, and equipment access.
*/

-- Create user_baselines table
CREATE TABLE IF NOT EXISTS user_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Personal details
  age integer,
  birthday date,
  height integer,
  weight integer,
  gender text CHECK (gender IN ('male', 'female', 'prefer_not_to_say')),
  units text DEFAULT 'imperial' CHECK (units IN ('metric', 'imperial')),
  
  -- Training background
  current_volume jsonb DEFAULT '{}'::jsonb,
  training_frequency jsonb DEFAULT '{}'::jsonb,
  volume_increase_capacity jsonb DEFAULT '{}'::jsonb,
  training_status jsonb DEFAULT '{}'::jsonb,
  benchmark_recency jsonb DEFAULT '{}'::jsonb,
  training_background text,
  
  -- Disciplines and fitness
  disciplines text[] DEFAULT '{}',
  current_fitness text,
  discipline_fitness jsonb DEFAULT '{}'::jsonb,
  benchmarks jsonb DEFAULT '{}'::jsonb,
  
  -- Performance numbers (JSONB for flexibility)
  performance_numbers jsonb DEFAULT '{}'::jsonb,
  
  -- Injury history
  injury_history text,
  injury_regions text[] DEFAULT '{}',
  
  -- Equipment access
  equipment jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one baseline per user
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE user_baselines ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own baselines"
  ON user_baselines
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own baselines"
  ON user_baselines
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own baselines"
  ON user_baselines
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own baselines"
  ON user_baselines
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_user_baselines_updated_at
  BEFORE UPDATE ON user_baselines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_baselines_user_id ON user_baselines(user_id);
CREATE INDEX IF NOT EXISTS idx_user_baselines_disciplines ON user_baselines USING GIN(disciplines);

-- Add comment to document the table
COMMENT ON TABLE user_baselines IS 'Stores user fitness assessment data including performance numbers, personal details, training background, and equipment access';
COMMENT ON COLUMN user_baselines.performance_numbers IS 'JSONB object containing performance metrics. Running: fiveK, easyPace, tenK, halfMarathon, marathon. Cycling: ftp, avgSpeed. Swimming: swimPace100, swim200Time, swim400Time. Strength: squat, deadlift, bench, overheadPress1RM.';
