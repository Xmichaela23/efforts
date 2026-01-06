/*
  # Add learned_fitness column to user_baselines
  
  Stores auto-learned fitness metrics derived from workout analysis:
  - Heart rate zones (easy, threshold, race, max) for run and ride
  - Pace metrics (easy, threshold) for running
  - FTP estimation for cycling
  - Learning status and confidence levels
*/

-- Add learned_fitness column
ALTER TABLE user_baselines 
ADD COLUMN IF NOT EXISTS learned_fitness jsonb DEFAULT '{}'::jsonb;

-- Add comment to document the column
COMMENT ON COLUMN user_baselines.learned_fitness IS 'Auto-learned fitness metrics from workout analysis. Contains run/ride HR zones, pace metrics, FTP estimates, with confidence levels and sample counts.';

