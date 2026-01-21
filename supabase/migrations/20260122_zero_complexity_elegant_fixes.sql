-- Zero Complexity Elegant Solution: Status columns, advisory locks, row-level locking
-- This migration implements the fixes identified in the architecture review

-- ============================================================================
-- 1. Add Status Columns + Timestamps
-- ============================================================================

ALTER TABLE workouts
ADD COLUMN IF NOT EXISTS summary_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS metrics_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS summary_error TEXT,
ADD COLUMN IF NOT EXISTS metrics_error TEXT,
ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS metrics_updated_at TIMESTAMPTZ;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_workouts_summary_status ON workouts(summary_status);
CREATE INDEX IF NOT EXISTS idx_workouts_metrics_status ON workouts(metrics_status);

-- Add comments
COMMENT ON COLUMN workouts.summary_status IS 'Status of workout summary computation: pending, processing, complete, failed';
COMMENT ON COLUMN workouts.metrics_status IS 'Status of workout metrics computation: pending, processing, complete, failed';
COMMENT ON COLUMN workouts.summary_error IS 'Error message if summary computation failed';
COMMENT ON COLUMN workouts.metrics_error IS 'Error message if metrics computation failed';
COMMENT ON COLUMN workouts.summary_updated_at IS 'Timestamp when summary status last changed';
COMMENT ON COLUMN workouts.metrics_updated_at IS 'Timestamp when metrics status last changed';

-- ============================================================================
-- 2. Advisory Lock Helper Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.try_advisory_lock(lock_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_try_advisory_xact_lock(hashtext(lock_key));
$$;

COMMENT ON FUNCTION public.try_advisory_lock IS 'Acquires transaction-level advisory lock. Returns true if lock acquired, false if already locked. Lock is automatically released when transaction commits or rolls back.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.try_advisory_lock TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_advisory_lock TO service_role;
GRANT EXECUTE ON FUNCTION public.try_advisory_lock TO anon;

-- ============================================================================
-- 3. Update merge_computed with Row-Level Locking
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_computed(
  p_workout_id uuid,
  p_partial_computed jsonb,
  p_computed_version_int integer DEFAULT NULL,
  p_computed_at timestamp with time zone DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_rows_affected integer;
  v_existing_computed jsonb;
  v_normalized_partial jsonb;
BEGIN
  -- FIX: Lock row before reading to prevent lost updates
  -- This ensures that if two functions call merge_computed simultaneously,
  -- they serialize on the row lock rather than both reading the same state
  SELECT computed INTO v_existing_computed
  FROM workouts
  WHERE id = p_workout_id
  FOR UPDATE;  -- Lock row until transaction commits
  
  -- Check if workout exists
  IF v_existing_computed IS NULL AND NOT EXISTS (SELECT 1 FROM workouts WHERE id = p_workout_id) THEN
    RAISE EXCEPTION 'Workout % does not exist', p_workout_id;
  END IF;
  
  -- FIX: Normalize existing computed if it's corrupted (array with string or just a string)
  -- This handles the double-encoding bug that was fixed in ingest-activity
  IF jsonb_typeof(v_existing_computed) = 'array' AND jsonb_array_length(v_existing_computed) > 0 THEN
    BEGIN
      v_existing_computed := ((v_existing_computed->>0)::jsonb);
      RAISE NOTICE 'merge_computed: Fixed corrupted existing computed (was array)';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'merge_computed: Failed to fix corrupted computed: %', SQLERRM;
      v_existing_computed := '{}'::jsonb;
    END;
  ELSIF jsonb_typeof(v_existing_computed) = 'string' THEN
    BEGIN
      v_existing_computed := ((v_existing_computed #>> '{}')::jsonb);
      RAISE NOTICE 'merge_computed: Fixed corrupted existing computed (was string)';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'merge_computed: Failed to fix corrupted computed: %', SQLERRM;
      v_existing_computed := '{}'::jsonb;
    END;
  END IF;
  
  -- FIX: Normalize partial_computed if it's corrupted
  IF jsonb_typeof(p_partial_computed) = 'array' AND jsonb_array_length(p_partial_computed) > 0 THEN
    BEGIN
      v_normalized_partial := ((p_partial_computed->>0)::jsonb);
      RAISE NOTICE 'merge_computed: Fixed corrupted partial_computed (was array)';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'merge_computed: Failed to fix corrupted partial_computed: %', SQLERRM;
      v_normalized_partial := p_partial_computed;
    END;
  ELSIF jsonb_typeof(p_partial_computed) = 'string' THEN
    BEGIN
      v_normalized_partial := ((p_partial_computed #>> '{}')::jsonb);
      RAISE NOTICE 'merge_computed: Fixed corrupted partial_computed (was string)';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'merge_computed: Failed to fix corrupted partial_computed: %', SQLERRM;
      v_normalized_partial := p_partial_computed;
    END;
  ELSE
    v_normalized_partial := p_partial_computed;
  END IF;
  
  -- Perform the merge - SECURITY DEFINER should bypass RLS
  UPDATE workouts
  SET 
    computed = COALESCE(v_existing_computed, '{}'::jsonb) || v_normalized_partial,
    computed_version = COALESCE(p_computed_version_int, workouts.computed_version),
    computed_at = COALESCE(p_computed_at, workouts.computed_at, NOW())
  WHERE workouts.id = p_workout_id;
  
  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  -- Log for debugging
  RAISE NOTICE 'merge_computed: workout_id=%, rows_affected=%, existing_was_null=%, partial_has_analysis=%', 
    p_workout_id, 
    v_rows_affected,
    (v_existing_computed IS NULL),
    (v_normalized_partial ? 'analysis');
    
  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'merge_computed: No rows updated for workout_id=%', p_workout_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION merge_computed IS 'Safely merges partial computed data into workouts.computed JSONB column. Uses row-level locking (FOR UPDATE) to prevent lost updates when multiple functions update simultaneously. Automatically fixes corrupted JSONB data (arrays/strings containing JSON).';
