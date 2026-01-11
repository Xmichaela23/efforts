-- Add weight_offset column for maintaining plan progression with adjustments
ALTER TABLE plan_adjustments 
ADD COLUMN IF NOT EXISTS weight_offset INTEGER;

-- Add absolute_reps column for bodyweight exercise adjustments
ALTER TABLE plan_adjustments 
ADD COLUMN IF NOT EXISTS absolute_reps INTEGER;

COMMENT ON COLUMN plan_adjustments.weight_offset IS 'Fixed offset in lbs added to planned weight (e.g., -10 means always 10 lbs less than plan)';
COMMENT ON COLUMN plan_adjustments.absolute_reps IS 'Fixed rep count override for bodyweight exercises';
