-- Add RPC function to safely merge computed JSONB data
-- This prevents race conditions when multiple functions update the same computed object
-- Uses PostgreSQL's native JSONB merge operator (||) for atomic updates

-- Drop existing function first (to allow parameter name changes)
DROP FUNCTION IF EXISTS merge_computed(uuid, jsonb, integer, timestamp with time zone);

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
  
  -- Perform the merge
  UPDATE workouts
  SET 
    computed = COALESCE(workouts.computed, '{}'::jsonb) || p_partial_computed,
    computed_version = COALESCE(p_computed_version_int, workouts.computed_version),
    computed_at = COALESCE(p_computed_at, workouts.computed_at, NOW())
  WHERE workouts.id = p_workout_id;
  
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  -- Log for debugging (remove in production if too verbose)
  RAISE NOTICE 'merge_computed: workout_id=%, rows_affected=%, existing_computed_keys=%, partial_keys=%', 
    p_workout_id, 
    v_rows_affected,
    CASE WHEN v_existing_computed IS NULL THEN 'NULL' ELSE (SELECT array_agg(key) FROM jsonb_object_keys(v_existing_computed) key)::text END,
    (SELECT array_agg(key) FROM jsonb_object_keys(p_partial_computed) key)::text;
    
  IF v_rows_affected = 0 THEN
    RAISE WARNING 'merge_computed: No rows updated for workout_id=%', p_workout_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION merge_computed TO authenticated;
GRANT EXECUTE ON FUNCTION merge_computed TO service_role;
GRANT EXECUTE ON FUNCTION merge_computed TO anon;

COMMENT ON FUNCTION merge_computed IS 'Safely merges partial computed data into workouts.computed JSONB column without overwriting existing keys. Uses PostgreSQL native JSONB merge operator for atomic updates.';
