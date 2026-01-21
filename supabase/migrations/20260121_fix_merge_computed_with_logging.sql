-- Fix merge_computed RPC - ensure it bypasses RLS and actually updates
-- SECURITY DEFINER should bypass RLS, but we'll be explicit

CREATE OR REPLACE FUNCTION merge_computed(
  p_workout_id uuid,
  p_partial_computed jsonb,
  p_computed_version_int integer DEFAULT NULL,
  p_computed_at timestamp with time zone DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_rows_affected integer;
  v_existing_computed jsonb;
BEGIN
  -- Get existing computed value
  SELECT computed INTO v_existing_computed
  FROM workouts
  WHERE id = p_workout_id;
  
  -- Check if workout exists
  IF v_existing_computed IS NULL AND NOT EXISTS (SELECT 1 FROM workouts WHERE id = p_workout_id) THEN
    RAISE EXCEPTION 'Workout % does not exist', p_workout_id;
  END IF;
  
  -- Perform the merge - SECURITY DEFINER should bypass RLS
  UPDATE workouts
  SET 
    computed = COALESCE(workouts.computed, '{}'::jsonb) || p_partial_computed,
    computed_version = COALESCE(p_computed_version_int, workouts.computed_version),
    computed_at = COALESCE(p_computed_at, workouts.computed_at, NOW())
  WHERE workouts.id = p_workout_id;
  
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  -- Log for debugging
  RAISE NOTICE 'merge_computed: workout_id=%, rows_affected=%, existing_was_null=%, partial_has_analysis=%', 
    p_workout_id, 
    v_rows_affected,
    (v_existing_computed IS NULL),
    (p_partial_computed ? 'analysis');
    
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'merge_computed: No rows updated for workout_id=%', p_workout_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
