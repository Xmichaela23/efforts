-- Add effort_paces columns to user_baselines
-- Stores the 5 training paces (in seconds per mile) and their source

-- JSONB column for pace data: {base: 690, race: 630, steady: 585, power: 525, speed: 480}
ALTER TABLE user_baselines ADD COLUMN IF NOT EXISTS effort_paces jsonb;

-- Track whether paces were calculated from score or manually set
ALTER TABLE user_baselines ADD COLUMN IF NOT EXISTS effort_paces_source text
  CHECK (effort_paces_source IN ('calculated', 'manual'));

-- Comments
COMMENT ON COLUMN user_baselines.effort_paces IS 'Training paces in seconds per mile: {base, race, steady, power, speed}';
COMMENT ON COLUMN user_baselines.effort_paces_source IS 'calculated = derived from effort_score, manual = user override';
