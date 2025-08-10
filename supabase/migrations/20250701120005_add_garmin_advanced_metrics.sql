-- Add advanced training metrics columns to garmin_activities table
-- These metrics are available from Garmin but were missing from our schema

DO $$
BEGIN
  -- Add training_stress_score column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'garmin_activities' AND column_name = 'training_stress_score'
  ) THEN
    ALTER TABLE garmin_activities ADD COLUMN training_stress_score numeric;
  END IF;

  -- Add intensity_factor column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'garmin_activities' AND column_name = 'intensity_factor'
  ) THEN
    ALTER TABLE garmin_activities ADD COLUMN intensity_factor numeric;
  END IF;

  -- Add normalized_power column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'garmin_activities' AND column_name = 'normalized_power'
  ) THEN
    ALTER TABLE garmin_activities ADD COLUMN normalized_power integer;
  END IF;

  -- Add avg_vam column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'garmin_activities' AND column_name = 'avg_vam'
  ) THEN
    ALTER TABLE garmin_activities ADD COLUMN avg_vam numeric;
  END IF;
END $$;

-- Add comments to document the new columns
COMMENT ON COLUMN garmin_activities.training_stress_score IS 'Training Stress Score (TSS) from Garmin - measures training load and stress';
COMMENT ON COLUMN garmin_activities.intensity_factor IS 'Intensity Factor (IF) from Garmin - measures workout intensity relative to threshold';
COMMENT ON COLUMN garmin_activities.normalized_power IS 'Normalized Power from Garmin - weighted average power that accounts for variability';
COMMENT ON COLUMN garmin_activities.avg_vam IS 'Average VAM (Vertical Ascent in Meters per Hour) from Garmin - climbing performance metric';
