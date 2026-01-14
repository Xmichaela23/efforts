-- Create gear table for tracking running shoes and bikes
CREATE TABLE IF NOT EXISTS gear (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('shoe', 'bike')),
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  is_default BOOLEAN DEFAULT false,
  purchase_date DATE,
  starting_distance NUMERIC DEFAULT 0,  -- in meters
  total_distance NUMERIC DEFAULT 0,     -- in meters, includes starting + tracked
  retired BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS gear_user_id_idx ON gear(user_id);
CREATE INDEX IF NOT EXISTS gear_user_type_idx ON gear(user_id, type);

-- Enable RLS
ALTER TABLE gear ENABLE ROW LEVEL SECURITY;

-- RLS policies (drop first to make idempotent)
DROP POLICY IF EXISTS "Users can view their own gear" ON gear;
DROP POLICY IF EXISTS "Users can insert their own gear" ON gear;
DROP POLICY IF EXISTS "Users can update their own gear" ON gear;
DROP POLICY IF EXISTS "Users can delete their own gear" ON gear;

CREATE POLICY "Users can view their own gear"
  ON gear FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own gear"
  ON gear FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own gear"
  ON gear FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own gear"
  ON gear FOR DELETE
  USING (auth.uid() = user_id);

-- Add gear_id to workouts table for tracking which gear was used
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS gear_id UUID REFERENCES gear(id) ON DELETE SET NULL;

-- Function to update gear total_distance when workout is logged
-- Note: workouts.distance is in kilometers, gear.total_distance is in meters
CREATE OR REPLACE FUNCTION update_gear_distance()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT or UPDATE, if gear_id is set, update the gear's total_distance
  IF NEW.gear_id IS NOT NULL AND NEW.distance IS NOT NULL THEN
    UPDATE gear 
    SET total_distance = starting_distance + (
      SELECT COALESCE(SUM(distance * 1000), 0)  -- Convert KM to meters
      FROM workouts 
      WHERE gear_id = NEW.gear_id AND workout_status = 'completed'
    ),
    updated_at = now()
    WHERE id = NEW.gear_id;
  END IF;
  
  -- If OLD gear_id was different, recalculate the old gear's distance too
  IF TG_OP = 'UPDATE' AND OLD.gear_id IS NOT NULL AND OLD.gear_id != COALESCE(NEW.gear_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    UPDATE gear 
    SET total_distance = starting_distance + (
      SELECT COALESCE(SUM(distance * 1000), 0)  -- Convert KM to meters
      FROM workouts 
      WHERE gear_id = OLD.gear_id AND workout_status = 'completed'
    ),
    updated_at = now()
    WHERE id = OLD.gear_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update gear distance on workout changes
DROP TRIGGER IF EXISTS update_gear_distance_trigger ON workouts;
CREATE TRIGGER update_gear_distance_trigger
  AFTER INSERT OR UPDATE OF gear_id, distance, workout_status ON workouts
  FOR EACH ROW
  EXECUTE FUNCTION update_gear_distance();

