-- Fix gear distance trigger to preserve starting_distance
-- This ensures that when gear is created with initial mileage, it's preserved when workouts are assigned

CREATE OR REPLACE FUNCTION update_gear_distance()
RETURNS TRIGGER AS $$
DECLARE
  v_starting_distance NUMERIC;
  v_workout_sum NUMERIC;
  v_current_total NUMERIC;
BEGIN
  -- On INSERT or UPDATE, if gear_id is set, update the gear's total_distance
  IF NEW.gear_id IS NOT NULL AND NEW.distance IS NOT NULL THEN
    -- Get current values
    SELECT 
      COALESCE(g.starting_distance, 0),
      COALESCE(g.total_distance, 0),
      COALESCE((
        SELECT SUM(distance * 1000)
        FROM workouts 
        WHERE gear_id = NEW.gear_id AND workout_status = 'completed'
      ), 0)
    INTO v_starting_distance, v_current_total, v_workout_sum
    FROM gear g
    WHERE g.id = NEW.gear_id;
    
    -- If starting_distance is 0 but current_total > workout_sum, preserve the difference
    -- This handles gear that was created with total_distance but starting_distance wasn't set
    IF v_starting_distance = 0 AND v_current_total > v_workout_sum THEN
      v_starting_distance := v_current_total - v_workout_sum;
      -- Update starting_distance for future calculations
      UPDATE gear 
      SET starting_distance = v_starting_distance 
      WHERE id = NEW.gear_id;
    END IF;
    
    -- Recalculate total_distance = starting_distance + sum of workouts
    UPDATE gear 
    SET total_distance = v_starting_distance + (
      SELECT COALESCE(SUM(distance * 1000), 0)  -- Convert KM to meters
      FROM workouts 
      WHERE gear_id = NEW.gear_id AND workout_status = 'completed'
    ),
    updated_at = now()
    WHERE id = NEW.gear_id;
  END IF;
  
  -- If OLD gear_id was different, recalculate the old gear's distance too
  IF TG_OP = 'UPDATE' AND OLD.gear_id IS NOT NULL AND OLD.gear_id != COALESCE(NEW.gear_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    -- Get starting_distance for old gear
    SELECT COALESCE(g.starting_distance, 0) INTO v_starting_distance
    FROM gear g
    WHERE g.id = OLD.gear_id;
    
    UPDATE gear 
    SET total_distance = v_starting_distance + (
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
