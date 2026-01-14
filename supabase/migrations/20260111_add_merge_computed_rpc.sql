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
BEGIN
  UPDATE workouts
  SET 
    computed = COALESCE(workouts.computed, '{}'::jsonb) || p_partial_computed,
    computed_version = COALESCE(p_computed_version_int, workouts.computed_version),
    computed_at = COALESCE(p_computed_at, workouts.computed_at, NOW())
  WHERE workouts.id = p_workout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION merge_computed TO authenticated;
GRANT EXECUTE ON FUNCTION merge_computed TO service_role;
GRANT EXECUTE ON FUNCTION merge_computed TO anon;

COMMENT ON FUNCTION merge_computed IS 'Safely merges partial computed data into workouts.computed JSONB column without overwriting existing keys. Uses PostgreSQL native JSONB merge operator for atomic updates.';
